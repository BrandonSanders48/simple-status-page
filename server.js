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

createHttpServer((req, res) => handle(req, res)).listen(httpPort, () => {
  console.log(`> HTTP listening on port ${httpPort}`);
});

const certPath = path.join(dataDir, "ssl", "cert.pem");
const keyPath = path.join(dataDir, "ssl", "key.pem");

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = createHttpsServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    (req, res) => handle(req, res)
  );
  // Exposed so the SSL upload route can hot-swap the TLS context without a restart
  // once both a new cert and key have been uploaded and validated.
  globalThis.__httpsServer = httpsServer;
  httpsServer.listen(httpsPort, () => {
    console.log(`> HTTPS listening on port ${httpsPort}`);
  });
} else {
  console.log("> No SSL certificate found, HTTPS listener not started");
}
