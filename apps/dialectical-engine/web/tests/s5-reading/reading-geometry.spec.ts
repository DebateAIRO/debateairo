import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const readWebFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const productionCss = [
  "styles/base.css",
  "styles/debate-chrome.css",
  "styles/synth.css",
  "styles/forms-single-shot.css",
  "styles/responsive.css",
  "styles/thread.css",
  "styles/split.css",
  "styles/map.css"
]
  .map(readWebFile)
  .join("\n");

function intersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

test("deep thread content retains at least 60% of the phone viewport", async ({ page }) => {
  const lanes = Array.from({ length: 10 }, () => '<span class="threadLane"><span class="threadLaneLine"></span></span>').join("");
  await page.setContent(`
    <style>${productionCss}</style>
    <main class="thread">
      <div class="threadInner">
        <div class="threadRow">
          ${lanes}
          <span class="threadElbow"><span class="threadElbowShape"></span></span>
          <div class="threadCardWrap">
            <article class="threadCard">
              <div class="threadClaim">Ordinary English stays readable at deep visual indentation.</div>
            </article>
          </div>
        </div>
      </div>
    </main>
  `);

  const viewport = page.viewportSize();
  const claim = await page.locator(".threadClaim").boundingBox();

  expect(viewport).not.toBeNull();
  expect(claim).not.toBeNull();
  expect(claim!.width).toBeGreaterThanOrEqual(viewport!.width * 0.6);
});

test("split meter remains fluid and non-collapsed at phone widths", async ({ page }) => {
  await page.setContent(`
    <style>${productionCss}</style>
    <main class="split">
      <div class="splitInner">
        <div class="splitMeter">
          <div class="splitMeterSide right">
            <div class="splitMeterLabel pro">The case for</div>
            <div class="splitMeterCount">3 arguments</div>
          </div>
          <div class="splitMeterBar"></div>
          <div class="splitMeterSide left">
            <div class="splitMeterLabel con">The case against</div>
            <div class="splitMeterCount">2 arguments</div>
          </div>
        </div>
      </div>
    </main>
  `);

  const geometry = await page.locator(".splitMeter").evaluate((meter) => {
    const bar = meter.querySelector<HTMLElement>(".splitMeterBar");
    return {
      clientWidth: meter.clientWidth,
      scrollWidth: meter.scrollWidth,
      barWidth: bar?.getBoundingClientRect().width ?? 0
    };
  });

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.barWidth).toBeGreaterThanOrEqual(geometry.clientWidth * 0.2);
});

test("collapsed synthesis tab avoids dock and zoom and hides for the unlock form", async ({ page }) => {
  await page.setContent(`
    <style>
      ${productionCss}
      .testZoomCluster {
        position: fixed;
        right: 18px;
        bottom: var(--zoom-cluster-offset-b);
        width: var(--zoom-cluster-w);
        height: 52px;
      }
      .testTokenDock {
        position: fixed;
        right: 18px;
        bottom: var(--dock-offset-b);
        width: var(--dock-collapsed-w);
        height: 44px;
      }
    </style>
    <main class="debateView">
      <button type="button" class="synthTab" data-synth-tab>Synthesis and verdict</button>
      <div class="testZoomCluster"></div>
      <div class="testTokenDock"></div>
    </main>
  `);

  const tab = page.locator("[data-synth-tab]");
  const tabBox = await tab.boundingBox();
  const dockBox = await page.locator(".testTokenDock").boundingBox();
  const zoomBox = await page.locator(".testZoomCluster").boundingBox();
  const viewport = page.viewportSize();

  expect(tabBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(zoomBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(tabBox!.x).toBe(14);
  expect(tabBox!.y + tabBox!.height).toBe(viewport!.height - 18);
  expect(intersects(tabBox!, dockBox!)).toBe(false);
  expect(intersects(tabBox!, zoomBox!)).toBe(false);

  await page.locator(".debateView").evaluate((view) => {
    const form = document.createElement("form");
    form.className = "tokenForm";
    view.append(form);
  });

  await expect(tab).toBeHidden();
});

test("expanded synthesis is a scrimmed sheet no taller than 70dvh", async ({ page }) => {
  await page.setContent(`
    <style>${productionCss}</style>
    <main class="debateView">
      <button type="button" class="synthScrim" aria-label="Close synthesis"></button>
      <aside class="synthPanel synthPanelOpen" data-sheet-state="expanded">
        <div class="synthInner">
          <div class="synthTitle">Synthesis</div>
          <section class="synthCard synthVerdict">
            <div class="synthCardLabel verdict">Verdict</div>
            <div class="synthVerdictBody">Prioritize transit while preserving accessible exceptions.</div>
          </section>
        </div>
      </aside>
    </main>
  `);

  const viewport = page.viewportSize();
  const panel = page.locator(".synthPanel");
  const panelBox = await panel.boundingBox();
  const scrim = page.locator(".synthScrim");

  expect(viewport).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7);
  expect(await scrim.evaluate((element) => getComputedStyle(element).zIndex)).toBe("50");
  await expect(panel.getByText("Prioritize transit while preserving accessible exceptions.")).toBeVisible();
});
