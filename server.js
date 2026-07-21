import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import fs from "node:fs";
import path from "node:path";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const httpPort = Number(process.env.PORT || 3000);
const httpsPort = Number(process.env.HTTPS_PORT || 3443);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

// The real, un-spoofable peer address for this connection, from the raw socket
// (not the client-supplied X-Forwarded-For header, which anyone can set to anything).
// Overwrites any x-real-ip the client itself sent, so it's always trustworthy by the
// time lib/rateLimit.ts reads it -- that's what lets it decide whether to also trust
// X-Forwarded-For (only when this direct peer looks like a local reverse proxy).
function withRealIp(req) {
  req.headers["x-real-ip"] = req.socket.remoteAddress || "";
  return req;
}

createHttpServer((req, res) => handle(withRealIp(req), res)).listen(httpPort, () => {
  console.log(`> HTTP listening on port ${httpPort}`);
});

const certPath = path.join(dataDir, "ssl", "cert.pem");
const keyPath = path.join(dataDir, "ssl", "key.pem");

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  // createServer() validates the cert/key pair synchronously and throws if they don't
  // match, so a corrupted pair on disk must not be allowed to crash the whole process
  // (including the already-running HTTP listener) -- just skip HTTPS instead.
  try {
    const httpsServer = createHttpsServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      (req, res) => handle(withRealIp(req), res)
    );
    // Exposed so the SSL upload route can hot-swap the TLS context without a restart
    // once both a new cert and key have been uploaded and validated.
    globalThis.__httpsServer = httpsServer;
    httpsServer.listen(httpsPort, () => {
      console.log(`> HTTPS listening on port ${httpsPort}`);
    });
  } catch (err) {
    console.error("> Invalid SSL certificate/key on disk, HTTPS listener not started:", err.message);
  }
} else {
  console.log("> No SSL certificate found, HTTPS listener not started");
}
