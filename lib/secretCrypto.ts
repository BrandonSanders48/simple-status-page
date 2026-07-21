import crypto from "node:crypto";

const ENC_PREFIX = "enc:v1:";

/** Derived from AUTH_SECRET (already required for admin sessions, see lib/auth.ts) via
 * a fixed-context SHA-256 hash rather than using AUTH_SECRET directly, so this key is
 * cryptographically distinct from the one signing session JWTs even though both trace
 * back to the same root secret. No separate env var to configure: every existing
 * install already has AUTH_SECRET set, so encryption works immediately with no new
 * required setup step. */
function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return crypto.createHash("sha256").update(`${secret}:db-secret-encryption`).digest();
}

/**
 * Encrypts a string for storage (AES-256-GCM, random IV per call). Empty strings pass
 * through unencrypted -- there's nothing to protect, and it keeps `""` recognizable as
 * "not set" without needing to decrypt first. The `enc:v1:` prefix is what lets
 * decryptSecret tell an already-encrypted value apart from plaintext.
 */
export function encryptSecret(plaintext: string): string {
  if (plaintext === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a value previously produced by encryptSecret. Anything not carrying the
 * `enc:v1:` prefix is returned unchanged -- this is what lets existing installs keep
 * working with zero migration: every row written before this feature existed is plain
 * text (or plain JSON, for integration_targets.config) and just passes through as-is,
 * while anything saved from now on is written encrypted (see encryptSecret) and reads
 * back correctly here. Corrupt data or a changed AUTH_SECRET decrypts to "" rather
 * than throwing, so one bad field can't break loading the rest of the config.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
