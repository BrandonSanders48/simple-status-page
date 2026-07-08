/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: "standalone"` here: the app uses a custom server.js (server.js at the
  // repo root) for dual HTTP/HTTPS listeners, which runs against the regular `.next`
  // build output with full node_modules rather than the standalone-traced subset.
  eslint: {
    ignoreDuringBuilds: false,
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
