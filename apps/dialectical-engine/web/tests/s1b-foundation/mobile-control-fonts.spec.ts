import { expect, test } from "@playwright/test";

const routes = ["/", "/new", "/settings"] as const;

for (const route of routes) {
  test(`${route} keeps every focusable form control at 16px or larger`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect(response?.ok()).toBe(true);

    const undersizedControls = await page.locator("button, input, textarea, select").evaluateAll((controls) =>
      controls.flatMap((control) => {
        const element = control as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const isFocusable =
          !element.disabled &&
          element.tabIndex >= 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0;
        const fontSize = Number.parseFloat(style.fontSize);

        return isFocusable && fontSize < 16
          ? [
              {
                element: element.tagName.toLowerCase(),
                className: element.className,
                fontSize,
                text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80)
              }
            ]
          : [];
      })
    );

    expect(undersizedControls).toEqual([]);
  });
}
