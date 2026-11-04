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
import type { DigProgress } from "../../apps/ui/lib/v4/digProgress.js";
import { EMPTY_DRAFT } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigState, DigView, TrustCounts, V4Map, V4Path, V4Selection } from "../../apps/ui/lib/v4/types.js";
import type { PathRewrite } from "../../packages/contract/src/index.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * The owner's screen review (3 Nov, OWNER-PICKS-2026-11-03.md): a dig's own panel while it runs and once it is done.
 * dig-d1 B ("Findings arrive one by one", which includes A): the one waiting card with the steps the server reports, each
 * checked finding with its trust word as it passes, "you can leave", and the path's text now; with no progress read
 * (today's API) the one calm line, never a guessed step (journey-f3). dig-f32: no "Dig here too" while it runs; once done,
 * the path's result box first, the bar in words only, "Open this dig's map" below it.
 */

const catalog = v4English as Readonly<Record<string, string>>;
const noop = () => {};
const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });
const none = counts(0, 0, 0, 0);
const LINE = "Mostly renewables, path a";

const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: LINE, points: [], counts: none, unchecked: 0, open: [], ...extra });

function mapWith(paths: readonly V4Path[] = [path("a")]): V4Map {
  return {
    runId: "run-1", answerId: "answer-1", answerVersion: 1, question: "Should we do the thing?", headline: "Probably yes",
    summary: "It depends.", confidence: null, why: [], sections: [], paths: [...paths], points: [], open: [],
    counts: none, unchecked: 0, wouldChange: null, objections: [], storyState: "READY", fallbackText: null,
    wouldChangeAlt: null, reservation: false
  };
}

const dig = (childRunId: string, state: DigState, places: readonly string[] = ["path:a"], extra: Partial<DigView> = {}): DigView => ({
  link: { parentRunId: "run-1", childRunId, openQuestionIds: places, questions: [`Dig question ${childRunId}`], mode: "quick",
    startedAt: new Date().toISOString() },
  state, headline: null, counts: state === "DONE" ? counts(1, 0, 0, 0) : null, ...extra
});

const FINISHED = "2026-11-04T09:15:00.000Z";
const writing: PathRewrite = { rewrite_id: "rw-1", dig_run_id: "d1", dig_level: 1, dig_finished_at: FINISHED, state: "WRITING" };
const rewritten = (changed: boolean, fateBefore: "HELD_UP" | "PARTLY_HELD" = "HELD_UP"): PathRewrite => ({
  ...writing, state: "READY", rewritten_at: "2026-11-04T09:18:00.000Z", changed,
  text: { line: changed ? "The new line for a" : LINE, summary: "The new summary.", fate: "HELD_UP" },
  what_changed: ["What the dig changed, in one sentence."], fate_before: fateBefore, view: null, dig_paths: []
});

const progressOf = (now: DigProgress["now"], findings: DigProgress["findings"] = [], steps: DigProgress["steps"] = ["FINDING_SOURCES", "READING", "CHECKING", "WRITING"]): DigProgress =>
  ({ steps, now, findings });
const FINDINGS: DigProgress["findings"] = [
  { id: "f1", text: "Pumped-storage plants in Europe cover days, not weeks, of low wind.", trust: "SURE" },
  { id: "f2", text: "Whether week-long storage is affordable is still argued.", trust: "STILL_ARGUED" }
];

type Extra = Partial<{ digs: readonly DigView[]; progress: DigProgress | null; showDigModes: boolean; choice: V4DigChoice }>;

function choiceOf(): V4DigChoice {
  return {
    draft: EMPTY_DRAFT, planTier: "premium", canDig: true, digHereToo: () => true, refusalFor: () => null,
    onToggleSuggestion: noop, onEditPick: () => null, onAddOwnView: () => null, onRemovePick: noop, onClear: noop
  };
}

function element(map: V4Map, selected: V4Selection, extra: Extra = {}) {
  return (
    <V4Panel
      map={map} digs={extra.digs ?? []} selected={selected} readingLevel="plain" picked={new Set()} onTogglePick={noop} onSelect={noop}
      digMode="quick" onDigMode={noop} onDig={noop} digBusy={false} choice={extra.choice ?? choiceOf()}
      {...(extra.showDigModes === undefined ? {} : { showDigModes: extra.showDigModes })}
      {...(extra.progress === undefined ? {} : { openDigProgress: extra.progress })}
      headingRef={createRef<HTMLHeadingElement>()} catalog={catalog} locale="en"
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
async function rerender(map: V4Map, selected: V4Selection, extra: Extra = {}): Promise<void> {
  await act(async () => root?.render(element(map, selected, extra)));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const words = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
const buttonsNamed = (node: ParentNode, name: string) => [...node.querySelectorAll("button")].filter((button) => words(button) === name);
const goWords = t(catalog, "v4.nest.goDigAgain", { path: LINE });

describe("dig-d1 / dig-f32: a running dig's own panel, with no progress read (today's API)", () => {
  it("shows the one calm line, when it started, the mode, 'you can leave' and the path's text folded; no step is guessed", () => {
    const page = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")] });
    const live = page.querySelector(".v4DigLive")!;
    expect(live).not.toBeNull();
    expect(live.querySelector("[data-wait-state]")?.getAttribute("data-wait-state")).toBe("LOOKING");
    expect(words(live.querySelector("[data-wait-word]"))).toBe(t(catalog, "v4.state.LOOKING"));
    expect(live.querySelector("[data-wait-started]")).not.toBeNull();
    expect(words(live.querySelector("[data-wait-leave]"))).toBe(t(catalog, "v4.wait.leave"));
    expect(words(live.querySelector(".v4PanelModeTag"))).toBe(t(catalog, "v4.digMode.quick"));
    expect(live.querySelector("[data-dig-steps]")).toBeNull();
    expect(live.querySelector("[data-dig-found]")).toBeNull();
    const fold = live.querySelector<HTMLDetailsElement>("details.v4DigPathNow")!;
    expect(fold.hasAttribute("open")).toBe(false);
    expect(words(fold.querySelector("summary"))).toBe(t(catalog, "v4.digLive.pathNow"));
    expect(words(fold.querySelector("[data-ai-generated]"))).toBe(LINE);
    // Today's two lines go: the running dig's own words and the "answer here so far" heading.
    expect(page.textContent).not.toContain(t(catalog, "v4.panel.digState.RUNNING"));
    expect(page.textContent).not.toContain(t(catalog, "v4.panel.answerHere"));
  });

  it("offers no 'Dig here too' and no way back to dig again while it runs (dig-f32, dig-f13)", () => {
    const page = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")] });
    expect(buttonsNamed(page, t(catalog, "v4.nest.digHereToo"))).toHaveLength(0);
    expect(buttonsNamed(page, goWords)).toHaveLength(0);
    expect(page.querySelector(".v4PanelDigBtn")).toBeNull();
  });

  it("leaves the mode word out on Free, and the path's fold out for a dig under the question itself", () => {
    expect(render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")], showDigModes: false }).querySelector(".v4PanelModeTag")).toBeNull();
    expect(render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING", ["w"])] }).querySelector("details.v4DigPathNow")).toBeNull();
  });

  it("while it rewrites the path it came from, says so in today's words", () => {
    const page = render(mapWith(), "dig:d1", { digs: [dig("d1", "DONE", ["path:a"], { rewrite: writing })] });
    expect(page.querySelector(".v4DigLive")).not.toBeNull();
    expect(words(page.querySelector(".v4DigLiveRewriting"))).toBe(t(catalog, "v4.rewrite.digCard.REWRITING"));
  });

  it("a dig still waiting keeps its own line (dig-f28), and one held at the month wall its pause block", () => {
    const waiting = render(mapWith(), "dig:d3", { digs: [dig("d3", "WAITING", ["path:a"], { link: { ...dig("d3", "WAITING").link, startedAt: null } })] });
    expect(waiting.querySelector(".v4DigLive")).toBeNull();
    expect(waiting.textContent).toContain(t(catalog, "v4.panel.digState.WAITING"));
    const paused = render(mapWith(), "dig:d4", { digs: [dig("d4", "RUNNING", ["path:a"], { pausedUntil: "2026-12-01T00:00:00.000Z" })] });
    expect(paused.querySelector(".v4DigLive")).toBeNull();
    expect(paused.querySelector(".v4PanelPause")).not.toBeNull();
  });
});

describe("dig-d1 B: with the server's progress read", () => {
  it("ticks the steps done, puts the current one in bold for screen readers too, and leaves the rest to come", () => {
    const page = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")], progress: progressOf("CHECKING", FINDINGS) });
    const steps = [...page.querySelectorAll<HTMLLIElement>("[data-dig-steps] li")];
    expect(page.querySelector("[data-dig-steps]")?.getAttribute("aria-label")).toBe(t(catalog, "v4.digLive.stepsLabel"));
    expect(steps.map((step) => [step.getAttribute("data-step-state"), step.querySelector(":scope > span:not(.v4DigStepTick):not(.v4SrOnly)")?.textContent]))
      .toEqual([
        ["DONE", "Finding sources"], ["DONE", "Reading"], ["NOW", "Checking"], ["NEXT", "Writing what changed"]
      ]);
    expect(steps.map((step) => step.getAttribute("aria-current"))).toEqual([null, null, "step", null]);
    expect(steps[0]!.querySelector(".v4DigStepTick")?.getAttribute("aria-hidden")).toBe("true");
    expect(words(steps[0]!.querySelector(".v4SrOnly"))).toBe(t(catalog, "v4.digLive.stepDone"));
    expect(steps[2]!.querySelector(".v4DigStepTick, .v4SrOnly")).toBeNull();
    // The steps sit in the waiting card, before "You can leave this page"; the findings come after it.
    const leave = page.querySelector("[data-wait-leave]")!;
    expect(page.querySelector("[data-dig-steps]")!.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(leave.compareDocumentPosition(page.querySelector("[data-dig-found]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with no web search the steps start with arguing for and against", () => {
    const page = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")], progress: progressOf("ARGUING", [], ["ARGUING", "CHECKING", "WRITING"]) });
    expect([...page.querySelectorAll("[data-dig-steps] li")].map((step) => step.getAttribute("data-step"))).toEqual(["ARGUING", "CHECKING", "WRITING"]);
    expect(words(page.querySelector("[data-step=ARGUING]"))).toBe("Arguing for and against");
  });

  it("lists each checked finding with its trust word, the AIs' words marked as theirs; before the first, says they will show there", () => {
    const page = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")], progress: progressOf("CHECKING", FINDINGS) });
    const found = page.querySelector("[data-dig-found]")!;
    expect(words(found.querySelector("h3"))).toBe(t(catalog, "v4.digLive.found"));
    const items = [...found.querySelectorAll("li")];
    expect(items.map((item) => [words(item.querySelector("[data-ai-generated]")), words(item.querySelector(".v4MapTrust"))])).toEqual([
      [FINDINGS[0]!.text, t(catalog, "v4.trust.SURE")],
      [FINDINGS[1]!.text, t(catalog, "v4.trust.STILL_ARGUED")]
    ]);
    expect(found.querySelector(".v4DigFindings")?.getAttribute("aria-live")).toBe("polite");
    expect(found.textContent).not.toContain(t(catalog, "v4.digLive.foundNone"));

    const first = render(mapWith(), "dig:d2", { digs: [dig("d2", "RUNNING")], progress: progressOf("FINDING_SOURCES") });
    expect(words(first.querySelector(".v4DigFoundNone"))).toBe(t(catalog, "v4.digLive.foundNone"));
    // The live list is there before the first finding, so a screen reader hears it arrive.
    expect(first.querySelector(".v4DigFindings[aria-live=polite]")).not.toBeNull();
  });

  it("while it rewrites with a progress read, the writing step is the current one and today's line is not repeated", () => {
    const page = render(mapWith(), "dig:d1", { digs: [dig("d1", "DONE", ["path:a"], { rewrite: writing })], progress: progressOf("WRITING", FINDINGS) });
    expect(page.querySelector("[data-step=WRITING]")?.getAttribute("data-step-state")).toBe("NOW");
    expect(page.querySelector(".v4DigLiveRewriting")).toBeNull();
  });

  it("a finding that arrives while the panel is open flies in with the highlight; one already there does not move", async () => {
    const digs = [dig("d2", "RUNNING")];
    const page = await mount(mapWith(), "dig:d2", { digs, progress: progressOf("READING", [FINDINGS[0]!]) });
    expect(page.querySelector("[data-finding=f1]")?.classList.contains("v4DigFindingNew")).toBe(false);
    await rerender(mapWith(), "dig:d2", { digs, progress: progressOf("CHECKING", FINDINGS) });
    expect(page.querySelector("[data-finding=f1]")?.classList.contains("v4DigFindingNew")).toBe(false);
    expect(page.querySelector("[data-finding=f2]")?.classList.contains("v4DigFindingNew")).toBe(true);
  });

  it("a step that moves on changes at once with the 1-second highlight, which then goes; the first show has none", async () => {
    vi.useFakeTimers();
    const digs = [dig("d2", "RUNNING")];
    const page = await mount(mapWith(), "dig:d2", { digs, progress: progressOf("READING") });
    expect(page.querySelector("[data-step=READING]")?.classList.contains("v4Highlight")).toBe(false);
    await rerender(mapWith(), "dig:d2", { digs, progress: progressOf("CHECKING") });
    expect(page.querySelector("[data-step=CHECKING]")?.classList.contains("v4Highlight")).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(page.querySelector("[data-step=CHECKING]")?.classList.contains("v4Highlight")).toBe(false);
  });
});

describe("dig-f32: a finished dig's own panel", () => {
  it("opens with the same result box as the path it rewrote, then its mode word, the bar in words only and its map below", () => {
    const done = dig("d1", "DONE", ["path:a"], { rewrite: rewritten(true, "PARTLY_HELD") });
    const page = render(mapWith(), "dig:d1", { digs: [done] });
    const box = page.querySelector(".v4RewriteResult")!;
    expect(box.classList.contains("v4RewriteResultCORRECTED")).toBe(true);
    expect(words(box)).toContain(t(catalog, "v4.result.tag.CORRECTED"));
    // First in the panel's body, before what the dig changed, the bar and the link to its map.
    const heading = page.querySelector("h2")!;
    expect(heading.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const later of [page.querySelector(".v4RewriteChanged"), page.querySelector(".v4PanelBar"), page.querySelector("a.v4Btn")]) {
      expect(later).not.toBeNull();
      expect(box.compareDocumentPosition(later!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(words(page.querySelector("a.v4Btn"))).toBe(t(catalog, "v4.panel.openDig"));
    expect(words(page.querySelector(".v4PanelModeTag"))).toBe(t(catalog, "v4.digMode.quick"));
    // The box says the result once: no second "Corrected" line under "The answer here so far".
    expect(page.textContent).not.toContain(t(catalog, "v4.panel.answerHere"));
    // Words only on the four-shade bar: no number anywhere in its caption or its spoken name.
    const bar = page.querySelector(".v4PanelBar")!;
    expect(words(bar.querySelector(".v4BarCounts"))).toMatch(new RegExp(`^${t(catalog, "v4.panel.confidence")}`, "u"));
    expect(words(bar)).not.toMatch(/\d/u);
    expect(bar.querySelector("[role=img]")?.getAttribute("aria-label")).not.toMatch(/\d/u);
    expect(page.querySelector(".v4DigLive")).toBeNull();
  });

  it("a confirmed path that holds says so in the box, as on the path", () => {
    const done = dig("d1", "DONE", ["path:a"], { rewrite: rewritten(false) });
    expect(words(render(mapWith(), "dig:d1", { digs: [done] }).querySelector(".v4RewriteResult"))).toBe(`✓${t(catalog, "v4.result.box.CONFIRMED_HOLDS")}`);
  });

  it("a dig that rewrote no path here keeps today's state line, with no box", () => {
    const done = dig("d1", "DONE", ["w"], { rewrite: rewritten(true) });
    const page = render(mapWith(), "dig:d1", { digs: [done] });
    expect(page.querySelector(".v4RewriteResult")).toBeNull();
    expect(page.textContent).toContain(t(catalog, "v4.panel.answerHere"));
    // A dig from before the new model, read by its headline, is as before too.
    const old = render(mapWith(), "dig:d5", { digs: [{ ...dig("d5", "DONE"), headline: "The dig's short answer." }] });
    expect(old.querySelector(".v4RewriteResult")).toBeNull();
    expect(old.textContent).toContain("The dig's short answer.");
  });
});

describe("the running dig's styles (journey-d1: the six moves only)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-wait.css"), "utf8");
  const block = css.slice(css.indexOf(".v4DigLive {"));

  it("flies a new finding in on the shared token with the shared highlight, and moves nothing else", () => {
    expect(block).toMatch(/\.v4DigFindingNew \{\s*animation: v4FlyIn var\(--v4-move-fly\) var\(--v4-ease-move\) 1, v4Highlight var\(--v4-highlight-time\) ease-out 1;/u);
    expect([...block.matchAll(/animation:/gu)]).toHaveLength(1);
    expect(block).not.toMatch(/transition:|@keyframes/u);
  });

  it("lays the steps out with start and end only, so they run right to left in Arabic and wrap on a phone", () => {
    expect(block).not.toMatch(/\b(?:margin|padding)-(?:left|right)\b|\b(?:left|right):/u);
    expect(block).toMatch(/\.v4DigSteps \{[^}]*flex-wrap: wrap;/u);
    // ACCESS-8 (the wave-2 review): "›" is mirrored by the browser on a right-to-left page, so no rule turns it a second time.
    expect(block).toMatch(/\.v4DigStep \+ \.v4DigStep::before \{[^}]*content: "›"/u);
    expect(block).not.toMatch(/:dir\(rtl\)/u);
  });
});
