// Every asset the app itself loads (fonts via next/font, FontAwesome, logos, uploaded
// SSL/business-logo files) is self-hosted -- nothing here needs to reach an external
// CDN -- so a real CSP restricting everything to 'self' doesn't break anything.
// 'unsafe-inline' is kept for script/style rather than a nonce-based CSP: Next.js's
// own hydration bootstrap emits inline <script> tags regardless of what app code
// writes, and wiring a nonce through the custom server.js/middleware setup is a
// bigger, riskier change than this pass is worth. HSTS is deliberately NOT set here:
// this app supports plain HTTP and a self-signed HTTPS fallback out of the box (see
// server.js), and HSTS is a browser-remembered directive that can lock out a visitor
// from the HTTP listener or a self-signed cert they've manually accepted.
//
// 'unsafe-eval' is only added in development: `next dev`'s Fast Refresh/webpack HMR
// runtime uses eval() internally to apply hot updates, so without it every dev-mode
// page load throws "Evaluating a string as JavaScript violates the CSP" and the app
// never renders. Production (`next build`/`next start`, i.e. `node server.js`) never
// needs eval, so that build stays on the stricter policy.
const isDev = process.env.NODE_ENV !== "production";
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: "standalone"` here: the app uses a custom server.js (server.js at the
  // repo root) for dual HTTP/HTTPS listeners, which runs against the regular `.next`
  // build output with full node_modules rather than the standalone-traced subset.
  eslint: {
    ignoreDuringBuilds: false,
  },
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
