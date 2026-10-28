import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { API_CONTENT_SECURITY_POLICY } from "./content-security-policy.mjs";
import { readGitHead, resolveBuildReleaseCode } from "./release-edge.mjs";

// Side-by-side spec §7 (plan C12): the release code this build is, the same one `release-edge.mjs --stamp` writes
// beside it, inlined for the browser's comparison with x-debateai-release. Git is read only when neither RELEASE_KEY nor
// DEBATEAI_SOURCE_REVISION names the release (C12 review).
const gitHead = () => readGitHead(dirname(fileURLToPath(import.meta.url)));

/**
 * Security headers that do not vary per request. The document CSP is NOT
 * here: apps/ui/middleware.ts sets a per-request nonce policy and server.mjs
 * pre-sets the fail-closed fallback (F-08, L3-F3). Proxied /api responses get
 * the static API policy because the proxy's response allowlist drops the
 * upstream's own header. COOP same-origin (NV-05): a cross-origin opener keeps
 * no handle on any app document, whatever edge is in front.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@debateai/contract", "@debateai/kernel", "@debateai/legal-manifest"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_DEBATEAI_RELEASE_CODE: resolveBuildReleaseCode(process.env, gitHead) },
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
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
