import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const webPort = Number(process.env.S4_WEB_PORT ?? 3104);
const mockPort = Number(process.env.S4_MOCK_PORT ?? 8104);
const baseURL = `http://127.0.0.1:${webPort}`;
const mockURL = `http://127.0.0.1:${mockPort}`;
const webRoot = resolve(__dirname, "../..");
const requestedBrowser = process.env.S4_BROWSER;
const browserName =
  requestedBrowser === "firefox" || requestedBrowser === "webkit"
    ? requestedBrowser
    : "chromium";
const desktopDevice =
  browserName === "firefox"
    ? devices["Desktop Firefox"]
    : browserName === "webkit"
      ? devices["Desktop Safari"]
      : devices["Desktop Chrome"];

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
    ...desktopDevice,
    baseURL,
    browserName,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 }
  },
  webServer: [
    {
      command: `"${process.execPath}" tests/s4-canvas/mockCoordinator.mjs`,
      cwd: webRoot,
      env: {
        S4_MOCK_PORT: String(mockPort)
      },
      url: `${mockURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: `"${process.execPath}" node_modules/next/dist/bin/next dev -H 127.0.0.1 -p ${webPort}`,
      cwd: webRoot,
      env: {
        DIALECTICAL_COORDINATOR_URL: mockURL,
        NEXT_PUBLIC_API_BASE: mockURL
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
