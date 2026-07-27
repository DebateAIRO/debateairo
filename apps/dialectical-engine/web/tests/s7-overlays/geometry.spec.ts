import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const webRoot = resolve(__dirname, "../..");
const globalsPath = resolve(webRoot, "app/globals.css");
const globals = readFileSync(globalsPath, "utf8");
const productionCss = [...globals.matchAll(/^\s*@import\s+["']([^"']+)["']\s*;\s*$/gm)]
  .map(([, importPath]) => readFileSync(resolve(dirname(globalsPath), importPath), "utf8"))
  .join("\n");

const fixtureCss = `
  html, body {
    margin: 0;
    min-height: 100%;
  }
  .testChrome {
    position: fixed;
    inset: 0 0 auto;
    height: 104px;
  }
  .testZoomCluster {
    position: fixed;
    right: 18px;
    bottom: var(--zoom-cluster-offset-b);
    width: var(--zoom-cluster-w);
    height: 200px;
  }
  .testOverflow {
    width: 250px;
    height: 160px;
  }
`;

function intersects(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number }
) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

test("ChallengePopover remains fully inside phone viewports at both horizontal edges", async ({ page }) => {
  await page.setContent(`
    <style>${productionCss}\n${fixtureCss}</style>
    <div class="popScrim"></div>
    <div class="popAnchor" style="--popover-x: 1px; --popover-y: 220px">
      <div class="popCard">
        <div class="popQuote">A deliberately long selected passage that keeps the fixture representative.</div>
        <div class="popLabel">Challenge this</div>
        ${Array.from(
          { length: 4 },
          (_, index) => `
            <button class="popAction">
              <span class="popActionIcon">${index + 1}</span>
              <span class="popActionText">
                <span class="popActionLabel">Challenge action ${index + 1}</span>
                <span class="popActionSub">Focused scrutiny option</span>
              </span>
            </button>
          `
        ).join("")}
      </div>
    </div>
  `);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  for (const x of [1, viewport!.width - 1]) {
    await page.locator(".popAnchor").evaluate((element, nextX) => {
      (element as HTMLElement).style.setProperty("--popover-x", `${nextX}px`);
    }, x);

    const rect = await page.locator(".popCard").boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport!.width);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport!.height);
  }
});

test("phone toast leaves both expanded dock and zoom rectangles", async ({ page }) => {
  await page.setContent(`
    <style>${productionCss}\n${fixtureCss}</style>
    <div class="testChrome"></div>
    <div class="toast" role="status"><span class="toastDot"></span>Saved</div>
    <div class="tokenDock">
      <form class="tokenForm">
        <div class="testOverflow">Expanded unlock controls</div>
      </form>
    </div>
    <div class="testZoomCluster"></div>
  `);

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const value = document.querySelector(selector)!.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };

    const root = getComputedStyle(document.documentElement);
    const form = document.querySelector(".tokenForm") as HTMLElement;
    const toast = document.querySelector(".toast") as HTMLElement;

    return {
      toast: rect(".toast"),
      dock: rect(".tokenDock"),
      zoom: rect(".testZoomCluster"),
      dockMaxHeight: Number.parseFloat(root.getPropertyValue("--dock-max-h")),
      formClientHeight: form.clientHeight,
      formScrollHeight: form.scrollHeight,
      toastTop: getComputedStyle(toast).top
    };
  });

  expect(geometry.toast.top).toBe(104);
  expect(geometry.toastTop).toBe("104px");
  expect(geometry.dock.height).toBeLessThanOrEqual(geometry.dockMaxHeight);
  expect(geometry.formClientHeight).toBeLessThanOrEqual(geometry.dockMaxHeight);
  expect(geometry.formScrollHeight).toBeGreaterThan(geometry.formClientHeight);
  expect(intersects(geometry.toast, geometry.dock)).toBe(false);
  expect(intersects(geometry.toast, geometry.zoom)).toBe(false);
});

test("collapsed token-dock button is capped and ellipsizes", async ({ page }) => {
  await page.setContent(`
    <style>${productionCss}\n${fixtureCss}</style>
    <div class="tokenDock">
      <button class="btn">Unlock actions with a deliberately overflowing label</button>
    </div>
  `);

  const geometry = await page.locator(".tokenDock > .btn").evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    const rect = element.getBoundingClientRect();

    return {
      width: rect.width,
      cap: Number.parseFloat(root.getPropertyValue("--dock-collapsed-w")),
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace
    };
  });

  expect(geometry.width).toBeLessThanOrEqual(geometry.cap);
  expect(geometry.overflow).toBe("hidden");
  expect(geometry.textOverflow).toBe("ellipsis");
  expect(geometry.whiteSpace).toBe("nowrap");
});
