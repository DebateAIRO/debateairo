const PRODUCTION_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const DEVELOPMENT_SERVER_PHASE = "phase-development-server";

/** @param {string} phase */
export default function nextConfig(phase) {
  const contentSecurityPolicy = phase === DEVELOPMENT_SERVER_PHASE
    ? PRODUCTION_CONTENT_SECURITY_POLICY.replace(
      "script-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    )
    : PRODUCTION_CONTENT_SECURITY_POLICY;

  /** @type {import('next').NextConfig} */
  const config = {
    transpilePackages: ["@debateai/contract", "@debateai/kernel"],
    distDir: process.env.NEXT_DIST_DIR || ".next",
    output: process.env.NEXT_OUTPUT_EXPORT === "1" ? "export" : undefined,
    typescript: {
      ignoreBuildErrors: false,
      tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json"
    },
    async headers() {
      return [{
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cache-Control", value: "no-store" }
        ]
      }];
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
  return config;
}
