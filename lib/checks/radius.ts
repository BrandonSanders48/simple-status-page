import dgram from "node:dgram";
import crypto from "node:crypto";

const ACCESS_REQUEST = 1;

function attribute(type: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([type, value.length + 2]), value]);
}

/** Builds a minimal RADIUS Access-Request (RFC 2865): a random Request Authenticator,
 * plus User-Name/User-Password/NAS-Identifier so it looks like a real login attempt
 * rather than a malformed packet a strict server might just drop. The password can't
 * be properly RADIUS-encrypted without the shared secret this probe doesn't have -
 * garbage ciphertext there is fine, since the goal is just "does anything answer",
 * not a real login (this box almost certainly isn't a configured RADIUS client
 * anyway, so any real credential would be rejected regardless). */
function buildAccessRequest(identifier: number, authenticator: Buffer): Buffer {
  const attrs = Buffer.concat([
    attribute(1, Buffer.from("networktest", "ascii")), // User-Name
    attribute(2, crypto.randomBytes(16)), // User-Password (unencrypted garbage - no secret to encrypt with)
    attribute(32, Buffer.from("simple-status-page", "ascii")), // NAS-Identifier
  ]);
  const length = 20 + attrs.length;
  const header = Buffer.alloc(4);
  header[0] = ACCESS_REQUEST;
  header[1] = identifier;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, authenticator, attrs]);
}

/**
 * Real RADIUS Access-Request/response exchange (not just a port-open test): sends a
 * request with a random identifier and confirms a reply with that same identifier
 * comes back. Any response code (Access-Accept, -Reject, or -Challenge) counts as
 * "reachable" - we're not trying to actually authenticate.
 *
 * Unlike NTP, this can't give a definitive "down": NPS (and RADIUS generally) only
 * responds to requests from IPs configured as known RADIUS clients - from anywhere
 * else, it silently drops the packet with no reply at all, which looks identical to
 * "nothing's listening". So a reply is a confirmed "yes"; no reply within the
 * timeout is reported as inconclusive (`null`), not a confirmed failure.
 */
export function checkRadius(host: string, port = 1812, timeoutMs = 2000): Promise<boolean | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const identifier = crypto.randomInt(0, 256);
    const authenticator = crypto.randomBytes(16);
    const packet = buildAccessRequest(identifier, authenticator);
    let settled = false;

    const finish = (result: boolean | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.once("error", () => finish(null));
    socket.once("message", (msg) => {
      if (msg.length < 20) return;
      if (msg[1] !== identifier) return; // not a reply to our own request
      finish(true);
    });

    socket.send(packet, port, host, (err) => {
      if (err) finish(null);
    });
  });
}
