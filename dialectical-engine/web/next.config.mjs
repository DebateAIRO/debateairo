/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@debateai/contract", "@debateai/kernel"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: process.env.NEXT_OUTPUT_EXPORT === "1" ? "export" : undefined,
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json"
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
