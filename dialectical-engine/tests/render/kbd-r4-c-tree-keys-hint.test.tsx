// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasViewport } from "../../apps/ui/components/CanvasViewport.js";

/**
 * Keyboard audit round 4 (2026-11-12), C4: the Tree's keys (+ - 0 1) were told only to screen readers. Like the Map's
 * keys line (round 3), the existing description is shown while the canvas itself has the keyboard's ring, at a fixed
 * place over the canvas so nothing moves; a mouse user never sees it. No new text: it is the same element the canvas
 * names with aria-describedby. The zoom buttons stay hidden (the owner's ruling).
 */
const css = readFileSync(`${process.cwd()}/apps/ui/app/globals.css`, "utf8");
let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("C4: the Tree shows its keys while the canvas has the keyboard", () => {
  it("the canvas's description is the hint, right after the canvas, with its text unchanged", async () => {
    await act(async () => root!.render(<CanvasViewport layoutWidth={2000} layoutHeight={800} stickyControl={null}><div /></CanvasViewport>));
    const canvas = host.querySelector<HTMLElement>(".canvas")!;
    const hint = document.getElementById(canvas.getAttribute("aria-describedby")!)!;
    expect(hint.classList.contains("canvasKeysHint")).toBe(true);
    expect(hint.classList.contains("srOnly")).toBe(true);
    expect(canvas.nextElementSibling).toBe(hint);
    expect(hint.textContent).toBe("Zoom in +, Zoom out −, Fit whole tree (overview) 0, Reset zoom to 1:1 1");
  });

  it("is shown only while the canvas itself has the keyboard's ring, at a fixed place over the canvas", () => {
    const selector = ".canvasViewport > .canvas:focus-visible + .canvasKeysHint";
    const at = css.indexOf(`${selector} {`);
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/position: absolute;/);
    expect(rule).toMatch(/clip: auto;/);
    expect(rule).toMatch(/width: auto;/);
    expect(rule).toMatch(/height: auto;/);
    expect(rule).toMatch(/pointer-events: none;/);
    // The only rule that reveals it: no hover, no :focus-within, no plain :focus.
    expect(css.match(/\.canvasKeysHint/g)?.length).toBe(1);
    expect(css.indexOf(selector)).toBeGreaterThan(css.indexOf(".srOnly {"));
  });
});
