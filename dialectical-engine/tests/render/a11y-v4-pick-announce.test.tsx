// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCER_ID } from "../../apps/ui/components/Toast.js";
import { V4MapTree, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import type { TrustCounts, V4Map, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * a11y repair (2026-11-19): on a map row that has a pick box, Space ticks the box while focus stays on the row, so the
 * only change a screen reader could notice was a word inside the focused row's name, which is not reliably spoken. The
 * row's own note ("Picked to dig together", or what kind of open question it is) is now said through the page's one
 * polite announcer after a Space pick. Ticking the box itself says nothing extra: the box speaks its own state.
 */

const catalog = v4English as Readonly<Record<string, string>>;
const none: TrustCounts = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
const open = (id: string, pathId: string): V4OpenQuestion => ({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star: false, pathId });
const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: `Line ${id}: held up.`, points: [], counts: none, unchecked: 0, open: [], trust: "SURE", ...extra });
const map: V4Map = {
  runId: "run-1", answerId: "a-1", answerVersion: 1, question: "Should we?", headline: "Probably.", summary: "It depends.", confidence: null,
  why: [], sections: [], paths: [path("a", { open: [open("p:a1", "a")] })], points: [], open: [], counts: none, unchecked: 0,
  wouldChange: null, wouldChangeAlt: null, objections: [], storyState: "READY", fallbackText: null, reservation: false
};

function Picking({ kind }: Readonly<{ kind: "tree" | "outline" }>) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const pieces: MapPiecesProps = {
    map, digs: [], selected: "root", changed: new Set(), picked, catalog, onSelect: () => undefined,
    onTogglePick: (id) => setPicked((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    })
  };
  return kind === "tree" ? <V4MapTree {...pieces} /> : <V4Outline {...pieces} />;
}

let mounted: Root | null = null;
let host: HTMLDivElement | null = null;
let announcer: HTMLElement | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  announcer = document.createElement("div");
  announcer.id = ANNOUNCER_ID;
  document.body.append(announcer);
});
afterEach(async () => {
  await act(async () => mounted?.unmount());
  host?.remove();
  announcer?.remove();
  mounted = null;
  host = null;
  vi.useRealTimers();
});
async function mount(node: ReactNode): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => mounted!.render(node));
}
const openRow = (): HTMLElement => {
  const found = [...host!.querySelectorAll<HTMLElement>("[data-rove]")].find((row) => row.dataset.row?.startsWith("open:p:a1") || row.dataset.row?.startsWith("p:a1"));
  if (found === undefined) throw new Error(`no open-question row: ${[...host!.querySelectorAll<HTMLElement>("[data-rove]")].map((row) => row.dataset.row).join(", ")}`);
  return found;
};
async function space(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  });
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
}

describe("a Space pick on a map row is said out loud", () => {
  for (const kind of ["tree", "outline"] as const) {
    it(`${kind}: Space on an open question says it is picked, and again says it is not`, async () => {
      await mount(<Picking kind={kind} />);
      const row = openRow();
      await act(async () => row.focus());
      await space(row);
      expect(announcer!.textContent).toBe(catalog["v4.map.picked"]);
      await space(openRow());
      expect(announcer!.textContent).toBe(catalog["v4.map.openKind.STILL_ARGUED"]);
    });

    it(`${kind}: ticking the box itself announces nothing extra`, async () => {
      await mount(<Picking kind={kind} />);
      const box = openRow().parentElement!.querySelector<HTMLInputElement>(":scope > label > input[type=checkbox]")!;
      await act(async () => box.click());
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(box.checked).toBe(true);
      expect(announcer!.textContent).toBe("");
    });
  }
});
