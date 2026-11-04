// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { V4DigChoice } from "../../apps/ui/components/v4/V4DigSuggest.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import { EMPTY_DRAFT } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigState, DigView, TrustCounts, V4Map, V4OpenQuestion, V4Path, V4Point, V4Selection } from "../../apps/ui/lib/v4/types.js";
import type { DigSuggestion, PathRewrite } from "../../packages/contract/src/index.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * The owner's screen review (3 Nov, OWNER-PICKS-2026-11-03.md), the panel's own fixes: the first findings group that has
 * findings opens (map-f1); the phone keeps one dig button, the pinned one (map-f18); a dig's way back to its path names
 * the path and waits for the dig (dig-f13); a long suggestion list gets "Skip to the dig button" (dig-f24); a waiting dig
 * says so only after 10 seconds (dig-f28); "Nothing is open here" goes when suggestions follow (dig-f33). Also the shared
 * motion base the six moves build on (journey-d1, chat answer "Six moves").
 */

const catalog = v4English as Readonly<Record<string, string>>;
const noop = () => {};

const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });
const none = counts(0, 0, 0, 0);

const point = (id: string, trust: V4Point["trust"]): V4Point =>
  ({ id, text: `Claim ${id}`, trust, basis: null, reasons: [], answeredBy: null, asOf: null });

const open = (id: string, pathId: string | null): V4OpenQuestion => ({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star: false, pathId });

const suggestion = (id: string): DigSuggestion =>
  ({ suggestion_id: id, kind: "UNDOCUMENTED", side: null, text: `Suggestion ${id}`, places: ["path:a"] });

const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: `Mostly renewables, path ${id}`, points: [], counts: none, unchecked: 0, open: [], ...extra });

function mapWith(points: readonly V4Point[], paths: readonly V4Path[] = [path("a")]): V4Map {
  return {
    runId: "run-1", answerId: "answer-1", answerVersion: 1, question: "Should we do the thing?", headline: "Probably yes",
    summary: "It depends.", confidence: null, why: [], sections: [], paths: [...paths], points: [...points], open: [],
    counts: none, unchecked: 0, wouldChange: null, objections: [], storyState: "READY", fallbackText: null,
    wouldChangeAlt: null, reservation: false
  };
}

const dig = (childRunId: string, state: DigState, places: readonly string[], startedAt: string | null = "2026-10-28T00:00:00Z"): DigView => ({
  link: { parentRunId: "run-1", childRunId, openQuestionIds: places, questions: [`Dig question ${childRunId}`], mode: "quick", startedAt },
  state,
  headline: state === "DONE" ? `Headline ${childRunId}` : null,
  counts: state === "DONE" ? counts(1, 0, 0, 0) : null
});

function choiceOf(extra: Partial<V4DigChoice> = {}): V4DigChoice {
  return {
    draft: EMPTY_DRAFT, planTier: "premium", canDig: true, digHereToo: () => false, refusalFor: () => null,
    onToggleSuggestion: noop, onEditPick: () => null, onAddOwnView: () => null, onRemovePick: noop, onClear: noop, ...extra
  };
}

type Extra = Partial<{ digs: readonly DigView[]; choice: V4DigChoice | null; digBusy: boolean; onSelect: (selection: V4Selection) => void }>;

function element(map: V4Map, selected: V4Selection, extra: Extra = {}) {
  const choice = extra.choice === undefined ? choiceOf() : extra.choice;
  return (
    <V4Panel
      map={map}
      digs={extra.digs ?? []}
      selected={selected}
      readingLevel="plain"
      picked={new Set()}
      onTogglePick={noop}
      onSelect={(selection) => extra.onSelect?.(selection)}
      digMode="quick"
      onDigMode={noop}
      onDig={noop}
      digBusy={extra.digBusy ?? false}
      {...(choice === null ? {} : { choice })}
      headingRef={createRef<HTMLHeadingElement>()}
      catalog={catalog}
      locale="en"
    />
  );
}

function render(map: V4Map, selected: V4Selection, extra: Extra = {}): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element(map, selected, extra));
  return container;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(map: V4Map, selected: V4Selection, extra: Extra = {}): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element(map, selected, extra)));
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const groupsOf = (node: ParentNode) => [...node.querySelectorAll<HTMLDetailsElement>("details.v4PanelGroup")]
  .map((group) => ({ word: group.className.split(" ")[1]!.replace("v4PanelGroup", ""), open: group.hasAttribute("open") }));
const buttonsNamed = (node: ParentNode, name: string) =>
  [...node.querySelectorAll("button")].filter((button) => button.textContent?.replace(/\s+/g, " ").trim() === name);

describe("map-f1: the first findings group that has findings opens", () => {
  it("opens Sure when there is one, and only it", () => {
    const all = [point("s", "SURE"), point("c", "SURE_FOR_CASE"), point("a", "STILL_ARGUED"), point("f", "DIDNT_HOLD")];
    expect(groupsOf(render(mapWith(all), "root"))).toEqual([
      { word: "SURE", open: true }, { word: "SURE_FOR_CASE", open: false }, { word: "STILL_ARGUED", open: false }, { word: "DIDNT_HOLD", open: false }
    ]);
  });

  it("with no Sure (every Free debate, older ones) opens Sure for the case named", () => {
    const points = [point("c", "SURE_FOR_CASE"), point("a", "STILL_ARGUED"), point("f", "DIDNT_HOLD")];
    expect(groupsOf(render(mapWith(points), "root"))).toEqual([
      { word: "SURE_FOR_CASE", open: true }, { word: "STILL_ARGUED", open: false }, { word: "DIDNT_HOLD", open: false }
    ]);
  });

  it("then Still argued; Didn't hold stays folded, even when it is the only group", () => {
    expect(groupsOf(render(mapWith([point("a", "STILL_ARGUED"), point("f", "DIDNT_HOLD")]), "root")))
      .toEqual([{ word: "STILL_ARGUED", open: true }, { word: "DIDNT_HOLD", open: false }]);
    expect(groupsOf(render(mapWith([point("f", "DIDNT_HOLD")]), "root"))).toEqual([{ word: "DIDNT_HOLD", open: false }]);
  });

  it("does the same on a path's panel", () => {
    const points = [point("a", "STILL_ARGUED"), point("f", "DIDNT_HOLD")];
    const map = mapWith([], [path("a", { points, counts: counts(0, 0, 1, 1) })]);
    expect(groupsOf(render(map, "path:a"))).toEqual([{ word: "STILL_ARGUED", open: true }, { word: "DIDNT_HOLD", open: false }]);
  });
});

describe("map-f18: on the phone only the pinned dig button", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-debate.css"), "utf8");

  it("hides the panel's own dig button of a path and of an open question at phone width, and nothing else", () => {
    const at = css.indexOf("map-f18");
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = css.slice(css.indexOf(".v4DebLayout-phone", at), css.indexOf("}", at) + 1);
    expect(rule).toMatch(/\.v4DebLayout-phone \.v4Panel-path \.v4PanelDigBtn,\s*\.v4DebLayout-phone \.v4Panel-open \.v4PanelDigBtn \{ display: none; \}/u);
    // A dig's panel keeps its buttons (the pinned bar has none there), and so do wider screens.
    expect(css).not.toMatch(/\.v4Panel-dig \.v4PanelDigBtn/u);
    expect(css).not.toMatch(/\.v4DebLayout-(?:desktop|mid)[^{]*\.v4PanelDigBtn[^{]*\{ display: none/u);
  });

  it("keeps the panel's dig block (Quick look / Thorough and the button) in the page for the phone rule to act on", () => {
    const map = mapWith([], [path("a", { open: [open("p:x", "a")] })]);
    expect(render(map, "path:a").querySelector(".v4Panel-path .v4PanelDig .v4PanelDigBtn")).not.toBeNull();
    expect(render(map, "open:p:x").querySelector(".v4Panel-open .v4PanelDig .v4PanelDigBtn")).not.toBeNull();
    expect(render(map, "path:a").querySelector(".v4PanelModes")).not.toBeNull();
  });
});

describe("dig-f13: a dig's way back to its path", () => {
  const goWords = (title: string) => t(catalog, "v4.nest.goDigAgain", { path: title });

  it("names the path once the dig is done, marks only the path's words as AI text, and opens the path", async () => {
    const map = mapWith([]);
    const selected: V4Selection[] = [];
    const page = await mount(map, "dig:d1", { digs: [dig("d1", "DONE", ["path:a"])], onSelect: (selection) => selected.push(selection) });
    const [button, ...others] = buttonsNamed(page, goWords("Mostly renewables, path a"));
    expect(button).toBeDefined();
    expect(others).toHaveLength(0);
    expect(button!.querySelector("[data-ai-generated]")?.textContent).toBe("Mostly renewables, path a");
    expect(buttonsNamed(page, t(catalog, "v4.nest.digHereToo"))).toHaveLength(0);
    await act(async () => button!.click());
    expect(selected).toEqual(["path:a"]);
  });

  it("offers nothing while the dig waits, runs or rewrites the path", () => {
    const map = mapWith([]);
    const writing: PathRewrite = { rewrite_id: "rw-1", dig_run_id: "d4", dig_level: 1, dig_finished_at: "2026-10-30T09:15:00.000Z", state: "WRITING" };
    const rewriting: DigView = { ...dig("d4", "DONE", ["path:a"]), rewrite: writing };
    for (const working of [dig("d1", "WAITING", ["path:a"]), dig("d2", "RUNNING", ["path:a"]), rewriting]) {
      const page = render(map, `dig:${working.link.childRunId}`, { digs: [working] });
      expect(page.textContent, working.link.childRunId).not.toContain(goWords("Mostly renewables, path a"));
      expect(buttonsNamed(page, t(catalog, "v4.nest.digHereToo")), working.link.childRunId).toHaveLength(0);
    }
  });

  it("a dig of open questions keeps \"Dig here too\" (it starts a dig, as everywhere) once it is done, not while it runs", () => {
    const map = mapWith([], [path("a", { open: [open("p:x", "a")] })]);
    expect(buttonsNamed(render(map, "dig:d1", { digs: [dig("d1", "DONE", ["p:x"])] }), t(catalog, "v4.nest.digHereToo"))).toHaveLength(1);
    expect(buttonsNamed(render(map, "dig:d2", { digs: [dig("d2", "RUNNING", ["p:x"])] }), t(catalog, "v4.nest.digHereToo"))).toHaveLength(0);
  });
});

describe("dig-f24: Skip to the dig button", () => {
  const skipWords = t(catalog, "v4.panel.skipToDig");
  const withSuggestions = (count: number) =>
    mapWith([], [path("a", { suggestions: Array.from({ length: count }, (_, at) => suggestion(`s${String(at)}`)) })]);

  // Wave 2, map-d4 A: the link sits near the top of every path that can be dug (above the findings and any suggestion
  // list), so the pinned button is about two presses away; there is one link, never a second above the list.
  it("sits above a long suggestion list, and above a short one too (map-d4 A), once; not at the deepest level", () => {
    const page = render(withSuggestions(3), "path:a");
    const [skip, ...others] = buttonsNamed(page, skipWords);
    expect(skip).toBeDefined();
    expect(others).toHaveLength(0);
    const list = page.querySelector(".v4Sugs")!;
    expect(skip!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(buttonsNamed(render(withSuggestions(2), "path:a"), skipWords)).toHaveLength(1);
    expect(buttonsNamed(render(withSuggestions(5), "path:a", { choice: choiceOf({ canDig: false }) }), skipWords)).toHaveLength(0);
  });

  it("moves the keyboard's focus to the dig button, and to its block while the button cannot take it", async () => {
    let page = await mount(withSuggestions(4), "path:a");
    await act(async () => buttonsNamed(page, skipWords)[0]!.click());
    expect(document.activeElement).toBe(page.querySelector(".v4PanelDigBtn"));
    await act(async () => root?.unmount());
    host?.remove();

    page = await mount(withSuggestions(4), "path:a", { digBusy: true });
    await act(async () => buttonsNamed(page, skipWords)[0]!.click());
    expect(document.activeElement).toBe(page.querySelector("section.v4PanelDig"));
    expect(page.querySelector("section.v4PanelDig")?.getAttribute("tabindex")).toBe("-1");
  });

  it("stays out of sight until it has focus, and keeps a 44px target when it shows", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
    const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
    expect(rule(".v4PanelSkip:not(:focus)")).toMatch(/clip: rect\(0 0 0 0\)/u);
    expect(rule(".v4PanelSkip")).toMatch(/min-height: 44px/u);
  });
});

describe("dig-f28: a dig waiting for a free spot", () => {
  const waitingWords = t(catalog, "v4.panel.digState.WAITING");

  // dig-f8 (the undo-bottom track): "Starting your dig…" is the shared note's sending line, used here for a sent dig's first
  // 10 seconds; the panel's own v4.panel.digStarting is dig-f8's countdown line ("Your dig starts in a few seconds…").
  it("says it is starting for its first 10 seconds, then that it waits, starts on its own and the page may close", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T10:00:03.000Z"));
    expect(waitingWords).toBe("Waiting for a free spot. It starts on its own. You can close this page.");
    const page = await mount(mapWith([]), "dig:d1", { digs: [dig("d1", "WAITING", ["path:a"], "2026-11-04T10:00:00.000Z")] });
    expect(page.textContent).toContain(t(catalog, "v4.undo.sendingDig"));
    expect(page.textContent).not.toContain(waitingWords);
    await act(async () => {
      vi.advanceTimersByTime(6_900);
    });
    expect(page.textContent).not.toContain(waitingWords);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(page.textContent).toContain(waitingWords);
    expect(page.textContent).not.toContain(t(catalog, "v4.undo.sendingDig"));
  });

  it("says it waits at once when it was sent long ago, or when its start is not known", () => {
    for (const startedAt of ["2026-10-28T00:00:00Z", null]) {
      const page = render(mapWith([]), "dig:d1", { digs: [dig("d1", "WAITING", ["path:a"], startedAt)] });
      expect(page.textContent, String(startedAt)).toContain(waitingWords);
    }
  });

  it("never waits longer than 10 seconds from now when this device's clock is behind", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
    const page = await mount(mapWith([]), "dig:d1", { digs: [dig("d1", "WAITING", ["path:a"], "2026-11-04T10:05:00.000Z")] });
    expect(page.textContent).toContain(t(catalog, "v4.undo.sendingDig"));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(page.textContent).toContain(waitingWords);
  });
});

describe("dig-f33: no \"Nothing is open here\" above the path's suggestions", () => {
  const nothingOpen = t(catalog, "v4.panel.noOpenPath");
  const where = t(catalog, "v4.panel.whereToDig");

  it("leaves the line (and a bare 'Where to dig' heading) out when suggestions follow", () => {
    const page = render(mapWith([], [path("a", { suggestions: [suggestion("s1")] })]), "path:a");
    expect(page.textContent).not.toContain(nothingOpen);
    expect(page.textContent).not.toContain(where);
    expect(page.textContent).toContain(t(catalog, "v4.suggest.heading"));
  });

  it("keeps the section for the path's digs, without the line", () => {
    const map = mapWith([], [path("a", { suggestions: [suggestion("s1")] })]);
    const page = render(map, "path:a", { digs: [dig("d1", "DONE", ["path:a"])] });
    expect(page.textContent).toContain(where);
    expect(page.textContent).toContain(t(catalog, "v4.panel.digsHere"));
    expect(page.textContent).not.toContain(nothingOpen);
  });

  it("keeps the line when the path has no suggestions; at the deepest level says only that nothing is left", () => {
    expect(render(mapWith([]), "path:a").textContent).toContain(nothingOpen);
    const deepest = render(mapWith([], [path("a", { suggestions: [suggestion("s1")] })]), "path:a", { choice: choiceOf({ canDig: false }) });
    expect(deepest.textContent).not.toContain(nothingOpen);
    expect(deepest.textContent).toContain(t(catalog, "v4.panel.noOpenRoot"));
  });
});

describe("journey-d1: the shared motion base (chat answer \"Six moves\")", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-base.css"), "utf8");
  const MOVES = ["fold", "clear", "snap", "fly", "roll", "turn"] as const;
  const reducedAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const normal = css.slice(0, reducedAt);
  const reduced = css.slice(reducedAt, css.indexOf("}\n}", reducedAt) + 3);

  it("gives each of the six moves a token under half a second", () => {
    for (const move of MOVES) {
      const value = new RegExp(`--v4-move-${move}: (\\d+)ms;`, "u").exec(normal)?.[1];
      expect(value, move).toBeDefined();
      expect(Number(value), move).toBeLessThan(500);
      expect(Number(value), move).toBeGreaterThan(0);
    }
  });

  it("makes every move instant under reduced motion, and leaves the highlight alone there", () => {
    expect(reducedAt).toBeGreaterThanOrEqual(0);
    for (const move of MOVES) expect(reduced, move).toMatch(new RegExp(`--v4-move-${move}: 0\\.01ms;`, "u"));
    expect(reduced).not.toMatch(/highlight/u);
  });

  it("offers a 1-second soft terracotta highlight that leaves nothing behind", () => {
    expect(normal).toMatch(/--v4-highlight: var\(--con-bg\);/u);
    expect(normal).toMatch(/--v4-highlight-time: 1s;/u);
    const rule = css.slice(css.indexOf(".v4Highlight {"), css.indexOf("}", css.indexOf(".v4Highlight {")));
    expect(rule).toMatch(/animation: v4Highlight var\(--v4-highlight-time\) ease-out 1;/u);
    // No fill mode: after 1 s the element's own background and shadow are back.
    expect(rule).not.toMatch(/forwards|both/u);
    const frames = css.slice(css.indexOf("@keyframes v4Highlight"), css.indexOf("} }", css.indexOf("@keyframes v4Highlight")) + 3);
    expect(frames).toMatch(/from \{/u);
    expect(frames).not.toMatch(/to \{|100%/u);
  });
});
