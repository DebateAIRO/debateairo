// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 (2026-11-12), DEB1-12: the Map and Split hints told only a mouse user what to do.
 * Fix round (B7): naming keys in the visible hints put keyboard wording in front of everyone, so the three hints are
 * back to their original text. Split needs nothing more (its levels and claims are real buttons: Enter is native). The
 * Map is ONE Tab stop moved with the arrow keys (Home/End jump; Enter or Space makes the wedge the focus), so it gets a
 * second hint that names the keys: hidden until a wedge of this map has the keyboard's ring (its CSS rule, which also
 * hides the pointer hint then, so the footer keeps one line), and the description of the wedge focus enters the Map on
 * (not every wedge the arrows pass).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { DebateMap } from "../../apps/ui/components/DebateMap.js";
import debateViewsEnglish from "../../apps/ui/messages/en/debateViews.json" with { type: "json" };

const EN = debateViewsEnglish as Readonly<Record<string, string>>;

function node(id: string, claim: string, nodeType: DebateNode["node_type"], children: DebateNode[] = []): DebateNode {
  return {
    id, debate_id: "debate:k1b", parent_id: nodeType === "ROOT_CLAIM" ? null : "root", node_type: nodeType, label: null, lens: null,
    depth: nodeType === "ROOT_CLAIM" ? 0 : 1, position: 0, claim, status: "complete", materialized_path: "0",
    active_generation_id: null, active_generation: null, maker: null, children
  };
}
const tree = (): DebateNode => node("root", "The root claim.", "ROOT_CLAIM", [
  node("node:pro", "A supporting claim.", "PRO"),
  node("node:con", "An opposing claim.", "CON")
]);

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML = '<button id="before">before</button>';
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
async function render(element: ReactElement): Promise<void> {
  await act(async () => root!.render(element));
}
const describedBy = (element: Element): string[] => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

describe("DEB1-12: the view hints say what the keyboard does, without clutter for pointer users", () => {
  it("the three visible hints are their original pointer text; the Map's keys hint names the keys its handler answers", () => {
    expect(EN["debateViews.mapInteractionHint"]).toBe("Hover a wedge to inspect · click to focus");
    expect(EN["debateViews.clickLevelToStepBack"]).toBe("click a level to step back up");
    expect(EN["debateViews.leanAndFocusHint"]).toBe("Leans {lean} · click any argument to make it the focus");
    expect(EN["debateViews.mapKeysHint"]).toBe("Arrow keys move between wedges · Enter makes one the focus");
  });

  it("the Map's footer carries both hints, the pointer one first (the touch-device rule hides span:first-child)", async () => {
    await render(<DebateMap root={tree()} onOpenSplit={() => undefined} />);
    const spans = [...host.querySelectorAll<HTMLElement>(".mapReadoutFooter > span")];
    expect(spans[0]!.textContent).toBe(EN["debateViews.mapInteractionHint"]);
    expect(spans[0]!.classList.contains("mapPointerHint")).toBe(true);
    expect(spans[1]!.textContent).toBe(EN["debateViews.mapKeysHint"]);
    expect(spans[1]!.classList.contains("mapKeysHint")).toBe(true);
  });

  it("the Map's Tab stop is described by the KEYS hint as focus enters, and only until the arrows move on", async () => {
    await render(<DebateMap root={tree()} onOpenSplit={() => undefined} />);
    const hint = host.querySelector<HTMLElement>(".mapReadoutFooter .mapKeysHint")!;
    expect(hint).not.toBeNull();
    expect(hint.id).not.toBe("");
    const hub = host.querySelector<SVGElement>('circle[role="button"]')!;
    // Before focus arrives, the Tab stop already carries the hint, so the first focus reads it.
    expect(describedBy(hub)).toEqual([hint.id]);
    await act(async () => document.getElementById("before")!.focus());
    await act(async () => hub.focus());
    expect(describedBy(hub)).toEqual([hint.id]);
    await act(async () => {
      hub.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    const wedge = document.activeElement as SVGElement;
    expect(wedge.getAttribute("aria-label")).toBe("Pro: A supporting claim.");
    expect(describedBy(wedge)).toEqual([]);
    for (const segment of host.querySelectorAll('[role="button"]')) expect(describedBy(segment)).toEqual([]);
    // Leaving and coming back: the wedge focus returns to says it again.
    await act(async () => document.getElementById("before")!.focus());
    expect(describedBy(wedge)).toEqual([hint.id]);
  });
});

describe("DEB1-12: the CSS that keeps the keys hint for keyboard users", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
    expect(match, selector).not.toBeNull();
    return match![1]!;
  };
  it("hidden by default, shown while a wedge of this map has the keyboard ring, and then the pointer hint is hidden", () => {
    expect(body(".mapReadoutFooter > .mapKeysHint")).toMatch(/display:\s*none/);
    expect(body(".mapInner:has(.mapStage :focus-visible) .mapReadoutFooter > .mapKeysHint")).toMatch(/display:\s*inline/);
    expect(body(".mapInner:has(.mapStage :focus-visible) .mapReadoutFooter > .mapPointerHint")).toMatch(/display:\s*none/);
  });
});
