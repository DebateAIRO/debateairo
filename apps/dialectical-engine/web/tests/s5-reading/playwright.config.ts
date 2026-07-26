import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "reading-geometry.spec.ts",
  outputDir: "./.artifacts/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    trace: "retain-on-failure"
  },
  projects: [
    ...[320, 375].map((width) => ({
      name: `chromium-${width}`,
      grepInvert: /@webkit-short/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height: 900 }
      }
    })),
    {
      name: "webkit-short-568x320",
      grep: /@webkit-short/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 568, height: 320 }
      }
    }
  ]
});
