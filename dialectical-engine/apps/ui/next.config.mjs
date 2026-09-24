import { API_CONTENT_SECURITY_POLICY } from "./content-security-policy.mjs";

/**
 * Security headers that do not vary per request. The document CSP is NOT
 * here: apps/ui/middleware.ts sets a per-request nonce policy and server.mjs
 * pre-sets the fail-closed fallback (F-08, L3-F3). Proxied /api responses get
 * the static API policy because the proxy's response allowlist drops the
 * upstream's own header.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@debateai/contract", "@debateai/kernel"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // L3-F9: no framework fingerprint on responses.
  poweredByHeader: false,
  // L3-F4: the UI never uses next/image. With the optimizer off, /_next/image
  // is a 404 and sharp leaves the runtime path.
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json"
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cache-Control", value: "no-store" }
        ]
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }]
      }
    ];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };
    return config;
  }
};

export default nextConfig;
