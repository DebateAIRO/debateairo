import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const smokeWidths = [320, 375, 1440] as const;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/.artifacts/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure"
  },
  projects: smokeWidths.map((width) => ({
    name: `chromium-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: 900 }
    }
  })),
  webServer: {
    command: `pnpm exec next dev -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
