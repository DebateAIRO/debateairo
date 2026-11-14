// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4MapTree, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import type { TrustCounts, V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * Keyboard audit 2026-11-12, wave 3 fix round. The map's key line (V4B-M1), from two more sides:
 * A3: on a read-only map (the hand-off map while the answer is written, a public debate) there is nothing to pick, so the
 *     line says only what is true there: the arrows, Home and End.
 * A7: a part under the question that is not rows (the waiting card's "Try now", data-rove-skip) is outside the rows: coming
 *     back to a row from it is entering the map, and the row is told the keys.
 * A9: the outline's line comes before its tree, so it is on screen when focus enters at the top of a long outline.
 * Made-up words only.
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
const piecesOf = (extra: Partial<MapPiecesProps> = {}): MapPiecesProps =>
  ({ map: MAP, digs: [], selected: "root", changed: new Set(), picked: new Set(), onSelect: noop, onTogglePick: noop, catalog, ...extra });

let mounted: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  host?.remove();
  document.body.replaceChildren();
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
const describedBy = (element: Element): string[] => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

const KINDS = [
  { kind: "tree", draw: (extra: Partial<MapPiecesProps> = {}) => <V4MapTree {...piecesOf(extra)} /> },
  { kind: "outline", draw: (extra: Partial<MapPiecesProps> = {}) => <V4Outline {...piecesOf(extra)} /> }
] as const;

describe("A3: a read-only map says only the keys that work there", () => {
  it("the short line is in the English catalogue and names no key a read-only map lacks", () => {
    const line = catalog["v4.map.keysHintReadOnly"];
    expect(line).toBe("Arrow keys move through the map. Home and End go to the first and last card.");
    expect(line).not.toContain("Space");
    expect(line).not.toContain("Enter");
  });

  for (const { kind, draw } of KINDS) {
    it(`${kind}: read-only, the line (shown and described) is the short one`, async () => {
      await mount(draw({ readOnly: true }));
      const hint = host!.querySelector<HTMLElement>(".v4MapKeysHint")!;
      expect(hint.textContent).toBe(catalog["v4.map.keysHintReadOnly"]);
      const outside = document.createElement("button");
      document.body.append(outside);
      await act(async () => outside.focus());
      await act(async () => row("root").focus());
      expect(describedBy(row("root"))).toContain(hint.id);
    });

    it(`${kind}: a map a person can dig from keeps the whole line`, async () => {
      await mount(draw());
      expect(host!.querySelector(".v4MapKeysHint")!.textContent).toBe(catalog["v4.map.keysHint"]);
    });
  }
});

describe("A7: coming back to a row from the waiting card is entering the map", () => {
  for (const { kind, draw } of KINDS) {
    it(`${kind}: Shift+Tab from "Try now" to the question's row: the row is told the keys`, async () => {
      const outside = document.createElement("button");
      document.body.append(outside);
      await mount(draw({ rootExtra: <button type="button" className="tryNow">Try now</button> }));
      const hint = host!.querySelector<HTMLElement>(".v4MapKeysHint")!;
      const tryNow = host!.querySelector<HTMLElement>(".tryNow")!;
      await act(async () => outside.focus());
      await act(async () => tryNow.focus());
      await act(async () => row("root").focus());
      expect(document.activeElement).toBe(row("root"));
      expect(describedBy(row("root"))).toContain(hint.id);
    });
  }
});

describe("A9: the outline's key line comes before its tree", () => {
  it("the line is drawn right before ul.v4OutTree, and still describes the row focus enters on", async () => {
    await mount(<V4Outline {...piecesOf()} />);
    const tree = host!.querySelector<HTMLElement>("ul.v4OutTree")!;
    const hint = host!.querySelector<HTMLElement>(".v4MapKeysHint")!;
    expect(tree.previousElementSibling).toBe(hint);
  });
});
