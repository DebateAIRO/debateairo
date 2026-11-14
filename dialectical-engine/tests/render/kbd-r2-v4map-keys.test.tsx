// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4AnswerCard } from "../../apps/ui/components/v4/V4AnswerCard.js";
import type { V4DigChoice } from "../../apps/ui/components/v4/V4DigSuggest.js";
import { V4MapTree, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { addPick, EMPTY_DRAFT, suggestionPick, togglePick, type V4DigDraft } from "../../apps/ui/lib/v4/suggestions.js";
import { focusInPlace, useFocusHandOff } from "../../apps/ui/lib/v4/useFocusHandOff.js";
import type { DigView, TrustCounts, V4Map, V4OpenQuestion, V4Path, V4Selection } from "../../apps/ui/lib/v4/types.js";
import type { DigSuggestion } from "../../packages/contract/src/index.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * Keyboard audit round 2 (2026-11-12), the map's own keyboard model (lib/v4/useMapKeys.ts) and its card budget:
 *   V4C-1 / V4B-F8: the row that holds focus leaving the map (a suggestion unticked, a poll re-planning the 12-card limit,
 *     an open question turning into a dig) never drops focus to the page; a row React only moved keeps it.
 *   V4B-M2: a suggestion row and "Choose what to dig ›" pressed from the keyboard open the path the way every row does.
 *   V4B-M3: what the page draws under the question's card (the waiting card, the pause) is made of ordinary Tab stops.
 *   V4B-F9: the answer card folding from outside with focus in its body puts focus on its folded line.
 */

const catalog = v4English as Readonly<Record<string, string>>;
const none: TrustCounts = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
const open = (id: string, pathId: string | null): V4OpenQuestion => ({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star: false, pathId });
const suggestion = (id: string): DigSuggestion =>
  ({ suggestion_id: id, kind: "UNDOCUMENTED", side: null, text: `Suggestion ${id}`, places: ["path:a"] });
const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: `Line ${id}: held up.`, points: [], counts: none, unchecked: 0, open: [], trust: "SURE", ...extra });

function mapOf(paths: readonly V4Path[], extra: Partial<V4Map> = {}): V4Map {
  return {
    runId: "run-1", answerId: "a-1", answerVersion: 1, question: "Should we?", headline: "Probably.", summary: "It depends.", confidence: null,
    why: [], sections: [], paths: [...paths], points: [], open: [], counts: none, unchecked: 0, wouldChange: null, wouldChangeAlt: null,
    objections: [], storyState: "READY", fallbackText: null, reservation: false, ...extra
  };
}

const noop = (): void => undefined;
function choiceOf(extra: Partial<V4DigChoice> = {}): V4DigChoice {
  return {
    draft: EMPTY_DRAFT, planTier: "premium", canDig: true, digHereToo: () => false, refusalFor: () => null,
    onToggleSuggestion: noop, onEditPick: () => null, onAddOwnView: () => null, onRemovePick: noop, onClear: noop, ...extra
  };
}
function piecesOf(map: V4Map, extra: Partial<MapPiecesProps> = {}): MapPiecesProps {
  return { map, digs: [], selected: "root", changed: new Set(), picked: new Set(), onSelect: noop, onTogglePick: noop, catalog, ...extra };
}

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
async function rerender(node: ReactNode): Promise<void> {
  await act(async () => mounted!.render(node));
}
const key = async (target: Element, name: string): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
};
const row = (id: string): HTMLElement | null => host!.querySelector<HTMLElement>(`[data-row="${id}"]`);
const activeRow = (): string | null => (document.activeElement as HTMLElement | null)?.dataset?.row ?? null;

const SUGGESTIONS = [suggestion("s1"), suggestion("s2"), suggestion("s3")];
const withSuggestions = mapOf([path("a", { suggestions: SUGGESTIONS })]);

/** The page's own pick boxes: the draft lives above the map, as V4DebateClient keeps it. */
function Picking(props: Readonly<{ initial: readonly string[]; kind: "tree" | "outline" }>) {
  const [draft, setDraft] = useState<V4DigDraft>(() => props.initial.reduce(
    (before, id) => addPick(before, suggestionPick("a", SUGGESTIONS.find((item) => item.suggestion_id === id)!), "premium").draft,
    EMPTY_DRAFT
  ));
  const choice = choiceOf({
    draft,
    onToggleSuggestion: (pathId, item) => setDraft((before) => togglePick(before, suggestionPick(pathId, item), "premium").draft)
  });
  const pieces = piecesOf(withSuggestions, { choice });
  return props.kind === "tree" ? <V4MapTree {...pieces} /> : <V4Outline {...pieces} />;
}

describe("V4C-1: unticking a suggestion never drops focus to the page", () => {
  for (const kind of ["tree", "outline"] as const) {
    it(`${kind}: the unticked row leaves (behind "1 more"): focus goes to that "more" row`, async () => {
      await mount(<Picking initial={["s1", "s2", "s3"]} kind={kind} />);
      const third = row("suggestion:s3@path:a")!;
      await act(async () => third.focus());
      await key(third, " ");
      expect(row("suggestion:s3@path:a")).toBeNull();
      expect(activeRow()).toBe("suggestions-more@path:a");
      expect(row("suggestions-more@path:a")!.tabIndex).toBe(0);
    });

    it(`${kind}: the unticked row only moves (React re-orders its list item): it keeps focus`, async () => {
      await mount(<Picking initial={["s1", "s2"]} kind={kind} />);
      const first = row("suggestion:s1@path:a")!;
      await act(async () => first.focus());
      await key(first, " ");
      // The picked one first, then the unticked one: s1's item was moved after s2's.
      const order = [...host!.querySelectorAll<HTMLElement>(".v4SugMain")].map((button) => button.dataset.row);
      expect(order).toEqual(["suggestion:s2@path:a", "suggestion:s1@path:a"]);
      expect(activeRow()).toBe("suggestion:s1@path:a");
    });
  }

  it("never takes focus that sits somewhere else, nor focus that was never in the map", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const pieces = (map: V4Map): MapPiecesProps => piecesOf(map);
    const before = mapOf([path("a", { open: [open("p:a1", "a"), open("p:a2", "a")] })]);
    const after = mapOf([path("a", { open: [open("p:a1", "a")] })]);
    await mount(<V4MapTree {...pieces(before)} />);
    await act(async () => outside.focus());
    await rerender(<V4MapTree {...pieces(after)} />);
    expect(document.activeElement).toBe(outside);
    await act(async () => outside.blur());
    await rerender(<V4MapTree {...pieces(before)} />);
    await rerender(<V4MapTree {...pieces(after)} />);
    expect(document.activeElement).toBe(document.body);
    outside.remove();
  });

  it("an open question that turns into a dig under focus hands focus to the nearest row of its path", async () => {
    const map = mapOf([path("a", { open: [open("p:a1", "a"), open("p:a2", "a")] })]);
    const dig: DigView = {
      link: { parentRunId: "run-1", childRunId: "c-1", openQuestionIds: ["p:a2"], questions: ["Open question p:a2"], mode: "quick", startedAt: null },
      state: "RUNNING", headline: null, counts: null
    };
    await mount(<V4MapTree {...piecesOf(map)} />);
    const leaf = row("open:p:a2@path:a")!;
    await act(async () => leaf.focus());
    await rerender(<V4MapTree {...piecesOf(map, { digs: [dig] })} />);
    expect(row("open:p:a2@path:a")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(host!.querySelector(".v4MapCanvas")!.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
  });
});

describe("V4B-F8: a poll re-planning the 12-card limit keeps the focused card on the map", () => {
  it("the focused open question counts as \"must show\", so new picks elsewhere do not push it behind \"+N more\"", async () => {
    // Five paths (6 fixed cards) leave 6 for the leaves: the first round shows a1..e1, the second a2 only.
    const ids = ["a", "b", "c", "d", "e"];
    const map = mapOf(ids.map((id) => path(id, { open: [open(`p:${id}1`, id), open(`p:${id}2`, id)] })));
    await mount(<V4MapTree {...piecesOf(map)} />);
    const leaf = row("open:p:a2@path:a")!;
    expect(leaf).not.toBeNull();
    await act(async () => leaf.focus());
    // Two picks land elsewhere (another tab): they always show, and claim the budget first.
    await rerender(<V4MapTree {...piecesOf(map, { picked: new Set(["p:b2", "p:c2"]) })} />);
    expect(row("open:p:b2@path:b")).not.toBeNull();
    expect(row("open:p:a2@path:a")).toBe(leaf);
    expect(document.activeElement).toBe(leaf);
  });
});

describe("V4B-M2: suggestion rows and \"Choose what to dig ›\" open the path from the keyboard", () => {
  it("a keyboard press (no pointer detail) asks for focus in the panel, a pointer press does not", async () => {
    const calls: Array<[V4Selection, boolean]> = [];
    const pieces = piecesOf(withSuggestions, {
      choice: choiceOf({ digHereToo: () => true }),
      onSelect: (selection, keyboard) => calls.push([selection, keyboard])
    });
    await mount(<V4MapTree {...pieces} />);
    await act(async () => row("suggestion:s1@path:a")!.click());
    await act(async () => row("suggestions-more@path:a")!.click());
    await act(async () => row("dig-here-too@path:a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(calls).toEqual([["path:a", true], ["path:a", true], ["path:a", false]]);
  });

  it("\"Choose what to dig ›\" also asks the page to bring the path's choices into view", async () => {
    const shown: Array<[string, boolean]> = [];
    const pieces = piecesOf(withSuggestions, {
      choice: choiceOf({ digHereToo: () => true }),
      onChooseWhat: (pathId, keyboard) => shown.push([pathId, keyboard])
    });
    await mount(<V4Outline {...pieces} />);
    await act(async () => row("dig-here-too@path:a")!.click());
    expect(shown).toEqual([["a", true]]);
  });
});

describe("V4B-M3: what hangs under the question's card is made of ordinary Tab stops", () => {
  const extra = (
    <div>
      <button type="button" className="tryNow">Try now</button>
      <a href="/v4/ask">Back</a>
    </div>
  );
  for (const kind of ["tree", "outline"] as const) {
    it(`${kind}: its controls keep their Tab stop and are not rows; the arrows still move between the real rows`, async () => {
      const map = mapOf([path("a", { open: [open("p:a1", "a")] })]);
      const pieces = piecesOf(map, { rootExtra: extra });
      await mount(kind === "tree" ? <V4MapTree {...pieces} /> : <V4Outline {...pieces} />);
      const inExtra = [...host!.querySelectorAll<HTMLElement>(".v4MapRootExtra button, .v4MapRootExtra a[href]")];
      expect(inExtra).toHaveLength(2);
      for (const control of inExtra) {
        expect(control.tabIndex).toBe(0);
        expect(control.hasAttribute("data-rove")).toBe(false);
      }
      const rootRow = row("root")!;
      await act(async () => rootRow.focus());
      await key(rootRow, "ArrowDown");
      expect(host!.querySelector(".v4MapRootExtra")!.contains(document.activeElement)).toBe(false);
      expect(activeRow()).toBe("path:a");
      // A key pressed on the waiting card's own button is its own.
      const tryNow = host!.querySelector<HTMLElement>(".tryNow")!;
      await act(async () => tryNow.focus());
      await key(tryNow, "ArrowDown");
      expect(document.activeElement).toBe(tryNow);
    });
  }
});

describe("V4B-F9: the answer card folding from outside with focus in its body", () => {
  it("moves focus to the card's folded line (its body turns inert)", async () => {
    const map = mapOf([path("a")], { sections: [{ title: "More", paragraphs: ["The whole answer."] }] });
    const card = (folded: boolean): ReactNode => (
      <V4AnswerCard map={map} mainAnswer={null} answeredAt={null} folded={folded} onUnfold={noop} catalog={catalog} locale="en" />
    );
    await mount(card(false));
    const summary = host!.querySelector<HTMLElement>(".v4AnswerMore summary")!;
    await act(async () => summary.focus());
    await rerender(card(true));
    expect(host!.querySelector(".v4AnswerFold")!.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(host!.querySelector(".v4AnswerFoldLine"));
    // A fold with focus elsewhere leaves focus alone.
    const outside = document.createElement("button");
    document.body.append(outside);
    await rerender(card(false));
    await act(async () => outside.focus());
    await rerender(card(true));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("the controls under the question's card hand their own focus on (review, 12 Nov)", () => {
  /** The pause block as the page wires it: when it goes with focus in it, focus goes to the question's card. */
  function Pause() {
    const hand = useFocusHandOff(true, () => focusInPlace(document.querySelector<HTMLElement>(".v4MapRoot")));
    return <div onFocus={hand.onFocus} onBlur={hand.onBlur}><button type="button" className="cont">Continue</button></div>;
  }

  it("Continue pressed after arrowing to another path: focus goes to the question's card, not back to that path's row", async () => {
    const map = mapOf([path("a", { open: [open("p:a1", "a")] }), path("b")]);
    await mount(<V4MapTree {...piecesOf(map, { rootExtra: <Pause /> })} />);
    await act(async () => row("root")!.focus());
    for (let step = 0; step < 3 && activeRow() !== "path:b"; step += 1) await key(document.activeElement!, "ArrowDown");
    expect(activeRow()).toBe("path:b");
    await act(async () => host!.querySelector<HTMLElement>(".cont")!.focus());
    await rerender(<V4MapTree {...piecesOf(map)} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(document.activeElement).toBe(host!.querySelector(".v4MapRoot"));
  });
});
