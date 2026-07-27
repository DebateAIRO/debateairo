import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const readWebFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");

const debateCanvas = readWebFile("components/DebateCanvas.tsx");
const viewport = readWebFile("components/CanvasViewport.tsx");
const css = readWebFile("styles/canvas.css");

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "s"));
  expect(match?.groups?.body, `missing CSS block ${selector}`).toBeTruthy();
  return match?.groups?.body ?? "";
}

describe("S4 source and layout-stability contract", () => {
  test("keeps the DebateCanvas measure loop on offsetHeight", () => {
    const measureLoop = debateCanvas.match(
      /useLayoutEffect\(\(\) => \{[\s\S]*?if \(changed\) setHeights\(next\);/
    )?.[0];
    expect(measureLoop).toBeTruthy();
    expect(measureLoop).toContain("el.offsetHeight");
    expect(measureLoop).not.toContain("getBoundingClientRect");
  });

  test("uses native listeners instead of React props for zoom-critical streams", () => {
    for (const eventProp of [
      "onWheel",
      "onTouchStart",
      "onTouchMove",
      "onGestureStart",
      "onGestureChange",
      "onPointerMove"
    ]) {
      expect(viewport).not.toContain(`${eventProp}=`);
    }
    expect(viewport).toContain("addEventListener");
    expect(viewport).toContain("passive: false");
  });

  test("scales only canvasInner while the sizer owns scaled layout geometry", () => {
    expect(cssBlock(".canvas")).toMatch(/touch-action:\s*none;/);
    expect(cssBlock(".canvasSizer")).toMatch(/position:\s*relative;/);
    expect(cssBlock(".canvasInner")).toMatch(/transform-origin:\s*0 0;/);
    expect(debateCanvas).toContain("<CanvasViewport");
    expect(debateCanvas).toContain("layoutWidth={layout.width}");
    expect(debateCanvas).toContain("layoutHeight={layout.height}");
  });

  test("uses layout-stable overview hiding and never display:none for card simplification", () => {
    const overviewRules = css
      .split("}")
      .filter((block) => block.includes('[data-zoom-band="overview"]'))
      .join("}");
    expect(overviewRules).toContain("visibility: hidden");
    expect(overviewRules).not.toContain("display: none");
  });

  test("consumes collision variables, guarantees 44px controls, and disables motion when requested", () => {
    const cluster = cssBlock(".canvasZoomCluster");
    const controls = cssBlock(".canvasZoomControl");
    expect(cluster).toContain("var(--zoom-cluster-w)");
    expect(cluster).toContain("var(--zoom-cluster-offset-b)");
    expect(cluster).toContain("var(--z-zoom-cluster)");
    expect(controls).toMatch(/min-width:\s*44px;/);
    expect(controls).toMatch(/min-height:\s*44px;/);
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.canvasInner[\s\S]*transition:\s*none/
    );
    expect(css).toMatch(
      /@media\s*\(max-height:\s*520px\)[\s\S]*\.canvasZoomCluster\s*\{[^}]*flex-direction:\s*row/
    );
  });
});
