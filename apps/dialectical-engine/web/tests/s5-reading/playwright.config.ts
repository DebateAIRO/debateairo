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
      grepInvert: /@short-round2/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height: 900 }
      }
    })),
    ...[
      { browserName: "chromium", device: devices["Desktop Chrome"] },
      { browserName: "firefox", device: devices["Desktop Firefox"] },
      { browserName: "webkit", device: devices["Desktop Safari"] }
    ].map(({ browserName, device }) => ({
      name: `${browserName}-short-568x320`,
      grep: /@short-round2/,
      use: {
        ...device,
        viewport: { width: 568, height: 320 }
      }
    }))
  ]
});
