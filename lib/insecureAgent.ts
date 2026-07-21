import { Agent } from "undici";

// Internal/self-signed endpoints are common for status-page targets (service checks,
// PowerStore, Proxmox), so TLS verification is disabled per-request via this dedicated
// dispatcher - never via the global NODE_TLS_REJECT_UNAUTHORIZED env var, which would
// weaken verification for every outbound call in the process (RSS fetches, SMTP, the
// public-IP lookup), not just these.
export const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
