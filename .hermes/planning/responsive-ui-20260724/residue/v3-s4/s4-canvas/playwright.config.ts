import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3104);
const baseURL = `http://127.0.0.1:${port}`;
const webRoot = resolve(__dirname, "../..");

export default defineConfig({
  testDir: ".",
  testMatch: "canvas-viewport.spec.ts",
  outputDir: "./.artifacts/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure"
  },
  projects: [320, 375].map((width) => ({
    name: `chromium-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: 900 }
    }
  })),
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next dev -H 127.0.0.1 -p ${port}`,
    cwd: webRoot,
    env: {
      ...process.env,
      DIALECTICAL_SERVER_FETCH_TIMEOUT_MS: "100"
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
