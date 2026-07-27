import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const readWebFile = (relativePath: string) => {
  const path = resolve(__dirname, "../..", relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

const viewport = readWebFile("components/CanvasViewport.tsx");
const canvas = readWebFile("components/DebateCanvas.tsx");
const canvasCss = readWebFile("styles/canvas.css");

describe("S4 source-level measurement and DOM contract", () => {
  test("keeps DebateCanvas measurement on offsetHeight and delegates viewport structure", () => {
    expect(canvas).toContain("el.offsetHeight");
    expect(canvas).not.toContain("getBoundingClientRect");
    expect(canvas).toMatch(/import\s+\{\s*CanvasViewport\s*\}\s+from\s+"@\/components\/CanvasViewport";/);
    expect(canvas).toMatch(/<CanvasViewport[\s\S]*stickyControl=/);
  });

  test("places transforms on canvasInner only and exposes a layout-sized sizer", () => {
    expect(viewport).toContain('className="canvasSizer"');
    expect(viewport).toContain('className="canvasInner"');
    expect(viewport).toMatch(/width:\s*layoutWidth\s*\*\s*zoom/);
    expect(viewport).toMatch(/height:\s*layoutHeight\s*\*\s*zoom/);
    expect(viewport).toMatch(/transform:\s*`scale\(\$\{zoom\}\)`/);
    expect(canvasCss).toMatch(/\.canvasInner\s*\{[^}]*transform-origin:\s*0 0;/s);
    expect(canvasCss).not.toMatch(/\.canvasSizer\s*\{[^}]*transform\s*:/s);
  });
});

describe("S4 native input and canvas-only ownership contract", () => {
  test("does not use React synthetic props for zoom-critical streams", () => {
    for (const prop of [
      "onWheel",
      "onTouchStart",
      "onTouchMove",
      "onGestureStart",
      "onGestureChange",
      "onGestureEnd"
    ]) {
      expect(viewport).not.toContain(prop);
    }
  });

  test("registers critical streams with passive false and removes them", () => {
    for (const stream of [
      "gesturestart",
      "gesturechange",
      "gestureend",
      "touchstart",
      "touchmove",
      "wheel"
    ]) {
      expect(viewport).toMatch(
        new RegExp(`addEventListener\\("${stream}"[\\s\\S]*PASSIVE_FALSE`)
      );
      expect(viewport).toContain(`removeEventListener("${stream}"`);
    }
    expect(viewport).toContain("const PASSIVE_FALSE = { passive: false } as const");
  });

  test("owns touch-action only on the canvas interaction surface", () => {
    expect(canvasCss).toMatch(/\.canvas\s*\{[^}]*touch-action:\s*none;/s);
    expect(canvasCss).not.toMatch(/(?:html|body|\.debateView)\s*\{[^}]*touch-action:\s*none;/s);
  });
});

describe("S4 layout-stable overview and collision CSS", () => {
  test("hides overview detail without display:none or card reflow", () => {
    const overviewBlocks = Array.from(
      canvasCss.matchAll(/\.canvasInner\[data-zoom-band="overview"\][^{]*\{([^}]*)\}/g),
      (match) => match[1]
    ).join("\n");

    expect(overviewBlocks).toMatch(/visibility:\s*hidden/);
    expect(overviewBlocks).not.toMatch(/display:\s*none/);
    expect(overviewBlocks).not.toMatch(/\bheight\s*:/);
    expect(overviewBlocks).not.toMatch(/\bpadding\s*:/);
    expect(overviewBlocks).not.toMatch(/\bmargin\s*:/);
  });

  test("consumes, but never redefines, the foundation zoom collision variables", () => {
    expect(canvasCss).toContain("var(--zoom-cluster-w)");
    expect(canvasCss).toContain("var(--zoom-cluster-offset-b)");
    expect(canvasCss).toContain("var(--z-zoom-cluster)");
    expect(canvasCss).not.toMatch(/--zoom-cluster-(?:w|offset-b)\s*:/);
  });

  test("disables canvas position and zoom transitions for reduced motion", () => {
    expect(canvasCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.canvasInner[\s\S]*\.nodeWrap[\s\S]*transition:\s*none/s
    );
  });

  test("pins zoom buttons to the 44px minimum", () => {
    expect(canvasCss).toMatch(
      /\.canvasZoomButton\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s
    );
  });
});
