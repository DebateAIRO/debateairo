import { expect, test } from "@playwright/test";

test("boots the application", async ({ page }, testInfo) => {
  const expectedWidth = Number(testInfo.project.name.replace("chromium-", ""));

  expect(page.context().browser()?.browserType().name()).toBe("chromium");
  expect(page.viewportSize()).toEqual({ width: expectedWidth, height: 900 });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
  expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(0);

  if (testInfo.project.name === "chromium-1440") {
    const goldenResponse = await page.goto("/settings", { waitUntil: "domcontentloaded" });

    expect(goldenResponse?.ok()).toBe(true);
    await expect(page).toHaveScreenshot("app-shell-1440.png", {
      animations: "disabled",
      fullPage: true
    });
  }
});
