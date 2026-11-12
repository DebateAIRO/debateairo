// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { V4DigChoice } from "../../apps/ui/components/v4/V4DigSuggest.js";
import { V4MapTree, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { EMPTY_DRAFT } from "../../apps/ui/lib/v4/suggestions.js";
import type { TrustCounts, V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * Keyboard audit round 2, wave 3 (2026-11-12), V4B-M1: the drawn map and the outline are one Tab stop each, moved with the
 * arrow keys (lib/v4/useMapKeys.ts). A short line says which keys do what: a screen reader hears it once, on the row focus
 * enters on (aria-describedby), and a sighted keyboard user sees it while a row shows the keyboard's ring (its CSS rule).
 * On a row that has a pick box Space only ever ticks it: a closed box makes it do nothing (it used to fall through to the
 * button and open the question). A row with no pick box keeps the button's own Space press (wave-3 fix round, A2).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = v4English as Readonly<Record<string, string>>;
const none: TrustCounts = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
const open = (id: string, pathId: string | null): V4OpenQuestion => ({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star: false, pathId });
const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: `Line ${id}: held up.`, points: [], counts: none, unchecked: 0, open: [], trust: "SURE", ...extra });
const MAP: V4Map = {
  runId: "run-1", answerId: "a-1", answerVersion: 1, question: "Should we?", headline: "Probably.", summary: "It depends.", confidence: null,
  why: [], sections: [], paths: [path("a", { open: [open("p:a1", "a")] })], points: [], open: [open("r1", null)], counts: none, unchecked: 0,
  wouldChange: null, wouldChangeAlt: null, objections: [], storyState: "READY", fallbackText: null, reservation: false
};
const noop = (): void => undefined;
const choiceOf = (canDig: boolean): V4DigChoice => ({
  draft: EMPTY_DRAFT, planTier: "premium", canDig, digHereToo: () => false, refusalFor: () => null,
  onToggleSuggestion: noop, onEditPick: () => null, onAddOwnView: () => null, onRemovePick: noop, onClear: noop
});
const piecesOf = (extra: Partial<MapPiecesProps> = {}): MapPiecesProps =>
  ({ map: MAP, digs: [], selected: "root", changed: new Set(), picked: new Set(), onSelect: noop, onTogglePick: noop, catalog, ...extra });

const read = (file: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4", file), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

let mounted: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  host?.remove();
  mounted = null;
  host = null;
});
async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => mounted!.render(node));
  return host;
}
const row = (id: string): HTMLElement => host!.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
/** Presses a key on a row; whether the page kept the browser's own action from happening. */
const press = async (target: Element, name: string): Promise<boolean> => {
  let prevented = false;
  await act(async () => {
    prevented = !target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
  return prevented;
};
const describedBy = (element: Element): string[] => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

const KINDS = [
  { kind: "tree", draw: (extra: Partial<MapPiecesProps> = {}) => <V4MapTree {...piecesOf(extra)} /> },
  { kind: "outline", draw: (extra: Partial<MapPiecesProps> = {}) => <V4Outline {...piecesOf(extra)} /> }
] as const;

describe("V4B-M1: the map and the outline say how their keys work", () => {
  it("the line is in the English catalogue and says what the keys really do", () => {
    const line = catalog["v4.map.keysHint"];
    expect(line).toBeDefined();
    for (const word of ["Arrow keys", "Enter", "Space", "Home", "End"]) expect(line).toContain(word);
  });

  for (const { kind, draw } of KINDS) {
    it(`${kind}: the row focus enters on is described by the line; a row reached with the arrows is not`, async () => {
      const outside = document.createElement("button");
      document.body.append(outside);
      await mount(draw());
      const hint = host!.querySelector<HTMLElement>(".v4MapKeysHint")!;
      expect(hint).not.toBeNull();
      expect(hint.id).not.toBe("");
      expect(hint.textContent).toBe(catalog["v4.map.keysHint"]);
      await act(async () => outside.focus());
      await act(async () => row("root").focus());
      expect(describedBy(row("root"))).toContain(hint.id);
      // Moving inside: the next row does not say it again, and the first stops saying it.
      await press(row("root"), "ArrowDown");
      const next = document.activeElement as HTMLElement;
      expect(next).not.toBe(row("root"));
      expect(describedBy(next)).not.toContain(hint.id);
      expect(describedBy(row("root"))).not.toContain(hint.id);
      // Leaving and coming back: the row focus comes back to says it again.
      await act(async () => outside.focus());
      await act(async () => next.focus());
      expect(describedBy(next)).toContain(hint.id);
      outside.remove();
    });

    it(`${kind}: Space on a row whose pick box is closed does nothing (it never opens the question)`, async () => {
      await mount(draw({ choice: choiceOf(false) }));
      const box = row("open:r1@root").parentElement!.querySelector<HTMLInputElement>("input[type=checkbox]")!;
      expect(box.disabled).toBe(true);
      expect(await press(row("open:r1@root"), " ")).toBe(true);
      expect(box.checked).toBe(false);
    });

    // Wave-3 fix round (A2): only a row that has a pick box (open or closed) takes Space over. A plain button row (the
    // question, a path, "Show more", "+ N more to explore") keeps the browser's own Space press.
    it(`${kind}: Space on a row with no pick box is left to the browser (the button's own press)`, async () => {
      await mount(draw());
      expect(await press(row("root"), " ")).toBe(false);
      expect(await press(row("path:a"), " ")).toBe(false);
    });

    it(`${kind}: Space on a row whose pick box is open ticks it and is not also a press of the row`, async () => {
      const ticked: string[] = [];
      await mount(draw({ choice: choiceOf(true), onTogglePick: (id: string) => ticked.push(id) }));
      expect(await press(row("open:r1@root"), " ")).toBe(true);
      expect(ticked).toEqual(["r1"]);
    });
  }

  it("the line shows only while a row of the map or the outline shows the keyboard's ring", () => {
    const css = `${read("v4-map.css")}\n${read("v4-map-looks.css")}`;
    expect(css).toMatch(/\.v4MapKeysHint\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.v4Map:has\(\.v4MapCanvas \[data-rove\]:focus-visible\) \.v4MapKeysHint/);
    expect(css).toMatch(/\.v4Out:has\(\.v4OutTree \[data-rove\]:focus-visible\) \.v4MapKeysHint/);
  });
});
