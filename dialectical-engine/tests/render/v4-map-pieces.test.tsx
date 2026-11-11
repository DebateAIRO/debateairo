// @vitest-environment jsdom

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { openCount, V4MapTree } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { V4TrustBar } from "../../apps/ui/components/v4/V4TrustBar.js";
import { formatDate, t } from "../../apps/ui/lib/i18n/translate.js";
import type {
  DigState,
  DigView,
  ReadingLevel,
  TrustCounts,
  V4Map,
  V4OpenQuestion,
  V4Path,
  V4Point,
  V4Selection
} from "../../apps/ui/lib/v4/types.js";
import type { PathRewrite } from "../../packages/contract/src/index.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * V4 initial (2026-10-28), map pieces (B4b): the tree, the outline, the panel and the bar render the map's data in
 * the shapes row D asks for, and hold up on the edges the spec names: no paths, a stand-in path with no fate, a path
 * with no points, nothing checked, no open questions, 8 paths, digs in every state, and a selection that is gone.
 * Text is read through the catalogue, so these checks hold before and after the coordinator merges the keys.
 */

const catalog = v4English as Readonly<Record<string, string>>;

const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });
const none = counts(0, 0, 0, 0);

const point = (id: string, trust: V4Point["trust"], extra: Partial<V4Point> = {}): V4Point => ({
  id,
  text: `Claim ${id}`,
  trust,
  basis: trust === null ? null : trust === "SURE" ? "LOOKED_UP_AND_AGREED" : trust === "SURE_FOR_CASE" ? "AGREED_BUT_DATED" : trust === "STILL_ARGUED" ? "DISPUTED" : "ANSWERED",
  reasons: trust === null ? [] : [`Reason for ${id}`],
  answeredBy: trust === "DIDNT_HOLD" ? `Answer to ${id}` : null,
  asOf: trust === "SURE_FOR_CASE" ? "2026-01-15T00:00:00Z" : null,
  ...extra
});

const open = (id: string, pathId: string | null, kind: V4OpenQuestion["kind"] = "STILL_ARGUED", star = false): V4OpenQuestion =>
  ({ id, kind, text: `Open question ${id}`, star, pathId });

const path = (id: string, extra: Partial<V4Path> = {}): V4Path => ({
  id,
  fate: "HELD_UP",
  line: `Line for ${id}`,
  points: [],
  counts: none,
  unchecked: 0,
  open: [],
  ...extra
});

const points = [
  point("n1", "SURE"),
  point("n2", "SURE_FOR_CASE"),
  point("n3", "STILL_ARGUED"),
  point("n4", "DIDNT_HOLD"),
  point("n5", null)
];
const longLine = "This is a very long story line about one answer the AIs weighed, and it keeps going well past seventy characters";

function buildMap(): V4Map {
  const paths: V4Path[] = [
    path("a", {
      line: longLine,
      points,
      counts: counts(1, 1, 1, 1),
      unchecked: 1,
      open: [open("p:n3", "a", "STILL_ARGUED", true), open("p:x1", "a"), open("p:x2", "a"), open("p:x3", "a")]
    }),
    path("b", { fate: null, line: "Stand-in line" }),
    path("c", { fate: "FELL", points: [point("n5", null)], unchecked: 1 }),
    path("d", { fate: "PARTLY_HELD" }),
    path("e", { fate: "SET_ASIDE" }),
    path("f"),
    path("g"),
    path("h")
  ];
  return {
    runId: "run-1",
    answerId: "answer-1",
    answerVersion: 1,
    question: "Should we do the thing?",
    headline: "Probably yes",
    summary: "It depends on the case.",
    confidence: "Fairly sure about the first part.",
    why: ["First reason", "Second reason"],
    sections: [],
    paths,
    points,
    open: [open("o:0", null, "OBJECTION"), open("w", null, "WOULD_CHANGE")],
    counts: counts(1, 1, 1, 1),
    unchecked: 1,
    wouldChange: "Open question w",
    objections: ["Open question o:0"],
    storyState: "READY",
    fallbackText: null,
    wouldChangeAlt: null,
    reservation: false
  };
}

const dig = (childRunId: string, state: DigState, openQuestionIds: readonly string[]): DigView => ({
  link: { parentRunId: "run-1", childRunId, openQuestionIds, questions: [`Dig question ${childRunId}`], mode: "quick", startedAt: "2026-10-28T00:00:00Z" },
  state,
  headline: state === "DONE" ? `Headline ${childRunId}` : null,
  counts: state === "DONE" ? counts(2, 0, 1, 0) : null
});

const digs: readonly DigView[] = [
  dig("c-wait", "WAITING", ["p:x1"]),
  dig("c-run", "RUNNING", ["w"]),
  dig("c-done", "DONE", ["p:x2"]),
  dig("c-fail", "FAILED", ["p:x3"])
];

function dom(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

const noop = () => {};

function tree(map: V4Map, selected: V4Selection, extra: Partial<{ digs: readonly DigView[]; picked: ReadonlySet<string>; changed: ReadonlySet<string> }> = {}) {
  return dom(renderToStaticMarkup(
    <V4MapTree
      map={map}
      digs={extra.digs ?? digs}
      selected={selected}
      changed={extra.changed ?? new Set()}
      picked={extra.picked ?? new Set()}
      onSelect={noop}
      onTogglePick={noop}
      catalog={catalog}
    />
  ));
}

function panel(map: V4Map, selected: V4Selection, level: ReadingLevel, extra: Partial<{ digBusy: boolean; digs: readonly DigView[]; showDigModes: boolean }> = {}) {
  return dom(renderToStaticMarkup(
    <V4Panel
      map={map}
      digs={extra.digs ?? digs}
      selected={selected}
      readingLevel={level}
      picked={new Set()}
      onTogglePick={noop}
      onSelect={noop}
      digMode="quick"
      onDigMode={noop}
      {...(extra.showDigModes === undefined ? {} : { showDigModes: extra.showDigModes })}
      onDig={noop}
      digBusy={extra.digBusy ?? false}
      headingRef={createRef<HTMLHeadingElement>()}
      catalog={catalog}
      locale="en"
    />
  ));
}

describe("V4 trust bar", () => {
  // V4 screen review (3 Nov): map-f28 drops the number captions; map-f8's "How sure" sentence, built from the trust words
  // only, is the bar's words. Every word keeps a slot (an empty one has no width), so the bar can slide (dig-d4 B).
  it("draws one segment per word that has points and says how sure in words, never a number", () => {
    // The label wraps the sentence; "{counts}" alone lets the check read it whatever the merged wording is.
    const labelled = { ...catalog, "v4.bar.label": "{counts}" };
    const root = dom(renderToStaticMarkup(<V4TrustBar counts={counts(2, 4, 2, 0)} catalog={labelled} showCounts />));
    expect(root.querySelectorAll(".v4BarSeg")).toHaveLength(3);
    expect(root.querySelectorAll(".v4BarSlot")).toHaveLength(1);
    const sentence = `${t(catalog, "v4.sure.SURE_FOR_CASE.most")} ${t(catalog, "v4.sure.argued.some")}`;
    const label = root.querySelector('[role="img"]')?.getAttribute("aria-label") ?? "";
    expect(label).toBe(sentence);
    expect(root.querySelector(".v4BarCounts")?.textContent).toBe(`${t(catalog, "v4.panel.confidence")} ${sentence}`);
    expect(`${label} ${root.textContent}`).not.toMatch(/\d/u);
  });

  it("shows an empty track and says nothing was checked when every count is zero", () => {
    const root = dom(renderToStaticMarkup(<V4TrustBar counts={none} unchecked={3} catalog={catalog} showCounts />));
    expect(root.querySelectorAll(".v4BarSeg")).toHaveLength(0);
    expect(root.querySelector(".v4BarEmpty")).not.toBeNull();
    expect(root.querySelector(".v4BarCounts")?.textContent).toBe(`${t(catalog, "v4.panel.confidence")} ${t(catalog, "v4.sure.none")}`);
    expect(root.textContent).not.toMatch(/\d/u);
  });
});

describe("V4 map tree", () => {
  it("draws the question, its paths, at most two open questions per path and every dig state", () => {
    // Two paths, so the 12-card limit (map-f22) leaves room for every leaf; the 8-path map is checked below.
    const base = buildMap();
    const root = tree({ ...base, paths: base.paths.slice(0, 2) }, "root");
    expect(root.querySelectorAll(".v4MapRoot")).toHaveLength(1);
    expect(root.querySelectorAll(".v4MapPath")).toHaveLength(2);
    // Path a: p:n3 (star) and p:x3 (its dig did not finish) are open; p:x1 and p:x2 are covered by their digs.
    const branchA = root.querySelectorAll(".v4MapBranch")[0]!;
    expect(branchA.querySelectorAll(".v4MapOpen")).toHaveLength(2);
    expect(branchA.querySelectorAll(".v4MapDig")).toHaveLength(3);
    expect(branchA.querySelector(".v4MapDigWAITING .v4MapPulse")).not.toBeNull();
    expect(branchA.querySelector(".v4MapDigDONE .v4MapDigHeadline")?.textContent).toBe("Headline c-done");
    expect(branchA.querySelector(".v4MapDigFAILED .v4MapPulse")).toBeNull();
    // The running dig came from "w", which hangs under the question itself.
    expect(root.querySelector(".v4MapRootLeaves .v4MapDigRUNNING")).not.toBeNull();
    expect(root.querySelectorAll(".v4MapStar[aria-hidden]").length).toBeGreaterThan(0);
  });

  it("shows at most about 12 cards: the star and the digs at work first, the rest behind \"+N more\" (map-f22)", () => {
    const root = tree(buildMap(), "root");
    expect(root.querySelectorAll(".v4MapPath")).toHaveLength(8);
    const leaves = root.querySelectorAll(".v4MapOpen, .v4MapDig").length;
    expect(1 + 8 + leaves).toBeLessThanOrEqual(12);
    // Always shown: the star, and the digs still at work (waiting, running).
    expect(root.querySelector(".v4MapOpen .v4MapStar")).not.toBeNull();
    expect(root.querySelector(".v4MapDigWAITING")).not.toBeNull();
    expect(root.querySelector(".v4MapDigRUNNING")).not.toBeNull();
    // Nothing is hidden without a visible sign.
    const more = [...root.querySelectorAll(".v4MapMore")];
    expect(more.length).toBeGreaterThan(0);
    for (const button of more) {
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.textContent).toMatch(/^\+\d+/u);
    }
  });

  it("cuts long titles at a word boundary and keeps AI text marked", () => {
    const root = tree(buildMap(), "root");
    const title = root.querySelector(".v4MapPathTitle [data-ai-generated]")!;
    expect(title.getAttribute("data-ai-generated")).toBe("true");
    expect(title.textContent!.endsWith("…")).toBe(true);
    expect(title.textContent!.length).toBeLessThanOrEqual(71);
    expect(longLine.startsWith(title.textContent!.slice(0, -1))).toBe(true);
  });

  it("shows +N more when a path has more than two open questions, and no outcome tags at all (r2-20 A)", () => {
    const map = buildMap();
    const root = tree(map, "root", { digs: [] });
    const branchA = root.querySelectorAll(".v4MapBranch")[0]!;
    expect(branchA.querySelectorAll(".v4MapOpen")).toHaveLength(2);
    expect(branchA.querySelector(".v4MapMore")?.textContent).toBe(t(catalog, "v4.map.moreOpen", { count: 2 }));
    // map-f25 / journey-f11: "Held up", "Partly held" and "Set aside" are gone from the cards (the panel says it in a sentence).
    expect(root.querySelector(".v4MapFate")).toBeNull();
    // (The v4.fate.* keys went with the unused keys, 12 Nov: their words.)
    for (const word of ["Held up", "Partly held", "Set aside"]) expect(root.textContent).not.toContain(word);
    // Path c has one unchecked point and nothing checked: an empty track.
    expect(root.querySelectorAll(".v4MapBranch")[2]!.querySelector(".v4BarEmpty")).not.toBeNull();
  });

  it("always shows a picked open question and marks the selected card and news", () => {
    const root = tree(buildMap(), "open:p:x3", { digs: [], picked: new Set(["p:x2"]), changed: new Set(["path:b"]) });
    const branchA = root.querySelectorAll(".v4MapBranch")[0]!;
    expect(branchA.querySelectorAll(".v4MapOpen")).toHaveLength(4);
    expect(branchA.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(1);
    expect(root.querySelector(".v4MapOpen.v4MapSelected .v4MapOpenTitle")?.textContent).toBe("Open question p:x3");
    expect(root.querySelectorAll(".v4MapBranch")[1]!.querySelector(".v4MapNew")).not.toBeNull();
  });

  it("falls back to the question when the selection no longer exists, and copes with no paths", () => {
    expect(tree(buildMap(), "path:gone").querySelector(".v4MapRoot.v4MapSelected")).not.toBeNull();
    expect(tree(buildMap(), "dig:gone").querySelector(".v4MapRoot.v4MapSelected")).not.toBeNull();
    const empty: V4Map = { ...buildMap(), paths: [], open: [], points: [], counts: none, unchecked: 0 };
    const root = tree(empty, "root", { digs: [] });
    expect(root.querySelectorAll(".v4MapPath")).toHaveLength(0);
    expect(root.querySelector(".v4MapEmpty")?.textContent).toBe(t(catalog, "v4.map.noPaths"));
    expect(root.querySelector(".v4MapRootChip")).toBeNull();
  });

  it("counts nothing on the cards: no open-questions chip and no number captions (map-f28)", () => {
    const root = tree(buildMap(), "root", { digs: [] });
    expect(root.querySelector(".v4MapRootChip")).toBeNull();
    expect(root.querySelector(".v4BarCounts")).toBeNull();
    // The old chip's words (v4.map.openCount went with the unused keys, 12 Nov).
    expect(root.textContent).not.toContain("Open questions: ");
  });
});

describe("V4 outline", () => {
  it("lists the same items with a pick box for every open question", () => {
    const root = dom(renderToStaticMarkup(
      <V4Outline map={buildMap()} digs={digs} selected="path:a" changed={new Set()} picked={new Set(["p:n3"])} onSelect={noop} onTogglePick={noop} catalog={catalog} />
    ));
    expect(root.querySelectorAll(".v4OutPath")).toHaveLength(8);
    // Open and not dug: o:0 under the question; p:n3 and p:x3 under path a.
    expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(root.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(1);
    expect(root.querySelectorAll(".v4OutDig")).toHaveLength(4);
    expect(root.querySelector(".v4OutPath.v4OutSelected")).not.toBeNull();
  });
});

describe("V4 panel", () => {
  it("shows the question's answer, only the non-empty groups in trust-word order, and the unchecked line", () => {
    const root = panel(buildMap(), "root", "background");
    expect(root.querySelector("h2")?.textContent).toBe("Should we do the thing?");
    const groups = [...root.querySelectorAll("details")];
    expect(groups.map((group) => group.className.split(" ")[1])).toEqual([
      "v4PanelGroupSURE", "v4PanelGroupSURE_FOR_CASE", "v4PanelGroupSTILL_ARGUED", "v4PanelGroupDIDNT_HOLD"
    ]);
    expect(groups[0]!.hasAttribute("open")).toBe(true);
    expect(groups[1]!.hasAttribute("open")).toBe(false);
    expect(root.textContent).not.toContain("Claim n5");
    expect(root.querySelector(".v4PanelUnchecked")).not.toBeNull();
    expect(root.querySelectorAll(".v4PanelBasis").length).toBeGreaterThan(0);
    expect(root.textContent).not.toContain("Reason for n1");
    // The question has no dig button; "why" and the confidence sentence are for experts only.
    expect(root.querySelector(".v4PanelDigBtn")).toBeNull();
    expect(root.textContent).not.toContain("First reason");
  });

  it("adds the second AI's reasons, who answered it and why at the expert level; text only in plain words", () => {
    const expert = panel(buildMap(), "root", "expert");
    expect(expert.textContent).toContain("Reason for n1");
    expect(expert.textContent).toContain("Answer to n4");
    expect(expert.textContent).toContain("First reason");
    const plain = panel(buildMap(), "root", "plain");
    // Question 27 A (5 Nov; Task 76k): at Plain words a checked point with no sources keeps its check line inside the closed
    // "From the AIs' own knowledge" fold; none shows unfolded.
    expect([...plain.querySelectorAll(".v4PanelBasis")].filter((line) => line.closest("details.v4SourcesFold") === null)).toHaveLength(0);
    for (const fold of plain.querySelectorAll("details.v4SourcesFold")) expect(fold.hasAttribute("open")).toBe(false);
    expect(plain.textContent).toContain("Claim n1");
  });

  it("says how sure in one plain sentence at every reading level, from the trust words only (map-f8)", () => {
    // The map's counts are one of each word: no word carries more than half, so the findings are mixed. The points no second
    // AI checked are said once, in the panel's own line under the groups, not again in the sentence.
    const sentence = [t(catalog, "v4.sure.mixed"), t(catalog, "v4.sure.argued.one"), t(catalog, "v4.sure.fell.one")].join(" ");
    for (const level of ["plain", "background", "expert"] as const) {
      const root = panel(buildMap(), "root", level);
      expect(root.querySelector(".v4PanelBar .v4BarCounts")?.textContent, level).toBe(`${t(catalog, "v4.panel.confidence")} ${sentence}`);
      expect(root.querySelectorAll(".v4PanelUnchecked"), level).toHaveLength(1);
      // The AI writer's own "How sure" sentence is no longer shown, at any level.
      expect(root.textContent, level).not.toContain("Fairly sure about the first part.");
    }
  });

  it("gives a path its breadcrumb, full line, open questions and a dig button that waits while a dig is busy", () => {
    const root = panel(buildMap(), "path:a", "plain", { digBusy: true });
    expect(root.querySelectorAll(".v4PanelCrumbs li")).toHaveLength(2);
    expect(root.textContent).toContain(longLine);
    expect(root.querySelector(".v4PanelDigBtn")?.hasAttribute("disabled")).toBe(true);
    expect(root.querySelectorAll('.v4PanelModes [aria-pressed="true"]')).toHaveLength(1);
    expect(root.querySelectorAll(".v4PanelOpenRow")).toHaveLength(2);
  });

  it("shows an open question as not looked into yet, and a dug one with a way to its dig", () => {
    const fresh = panel(buildMap(), "open:o:0", "plain");
    expect(fresh.textContent).toContain(t(catalog, "v4.panel.notYet"));
    expect(fresh.querySelector(".v4PanelDigBtn")).not.toBeNull();
    const dug = panel(buildMap(), "open:w", "plain");
    expect(dug.textContent).toContain(t(catalog, "v4.panel.dugAlready"));
    expect(dug.querySelector(".v4PanelDigBtn")).toBeNull();
  });

  it("shows a finished dig with its headline and a link to its own map, and falls back when the dig is gone", () => {
    const done = panel(buildMap(), "dig:c-done", "plain");
    expect(done.querySelector("h2")?.textContent).toBe("Dig question c-done");
    expect(done.textContent).toContain("Headline c-done");
    expect(done.querySelector('a[href="/v4/debate/c-done?level=plain"]')).not.toBeNull();
    expect(done.querySelector(".v4PanelDigBtn")).toBeNull();
    const gone = panel(buildMap(), "dig:missing", "plain");
    expect(gone.querySelector("h2")?.textContent).toBe("Should we do the thing?");
  });

  it("copes with a map where nothing is checked and nothing is open", () => {
    const bare: V4Map = { ...buildMap(), headline: null, summary: null, storyState: "WRITING", paths: [path("all", { fate: null })], open: [], points: [point("u", null)], counts: none, unchecked: 1 };
    const root = panel(bare, "root", "background", { digs: [] });
    expect(root.querySelectorAll("details")).toHaveLength(0);
    expect(root.textContent).toContain(t(catalog, "v4.panel.storyWriting"));
    expect(root.textContent).toContain(t(catalog, "v4.panel.noOpenRoot"));
  });
});

describe("V4 map pieces, fix wave 1", () => {
  // A point still argued under two paths (FIT-2 / FIT-9).
  function sharedMap(): V4Map {
    const base = buildMap();
    const shared = open("p:s1", "a");
    const paths = base.paths.map((candidate) =>
      candidate.id === "a" ? { ...candidate, open: [shared] } : candidate.id === "d" ? { ...candidate, open: [{ ...shared, pathId: "d" }] } : candidate
    );
    return { ...base, paths, open: [open("w", null, "WOULD_CHANGE", true)] };
  }

  it("counts a point argued under two paths once, and shows its dig under both paths", () => {
    const map = sharedMap();
    expect(openCount(map, [])).toBe(2);
    const shownDigs = [dig("c-s1", "RUNNING", ["p:s1"])];
    // map-f26: a dig that only started does not lower the count; one that came back Confirmed (or Corrected) does.
    expect(openCount(map, shownDigs)).toBe(2);
    const confirmed: DigView = { ...dig("c-s1", "DONE", ["p:s1"]), rewrite: null, points: [point("d1", "SURE")] };
    expect(openCount(map, [confirmed])).toBe(1);
    const nothing: DigView = { ...confirmed, points: [point("d2", "STILL_ARGUED")] };
    expect(openCount(map, [nothing])).toBe(2);
    const root = tree(map, "root", { digs: shownDigs });
    const branches = root.querySelectorAll(".v4MapBranch");
    expect(branches[0]!.querySelectorAll(".v4MapDig")).toHaveLength(1);
    expect(branches[3]!.querySelectorAll(".v4MapDig")).toHaveLength(1);
    expect(root.querySelectorAll(".v4MapOpenTitle")).toHaveLength(1);
  });

  it("marks only AI text as AI-written: untitled fallbacks and the 'and N more' tail are the site's words", () => {
    const base = buildMap();
    const map: V4Map = { ...base, paths: [path("x", { line: "  " }), ...base.paths.slice(1)] };
    const together: DigView = { ...dig("c-two", "RUNNING", ["w"]), link: { ...dig("c-two", "RUNNING", ["w"]).link, questions: ["First asked", "Second asked"] } };
    const untitled: DigView = { ...dig("c-none", "RUNNING", ["w"]), link: { ...dig("c-none", "RUNNING", ["w"]).link, questions: [] } };
    const root = tree(map, "root", { digs: [together, untitled] });
    const pathTitle = root.querySelector(".v4MapPathTitle")!;
    expect(pathTitle.textContent).toBe(t(catalog, "v4.map.pathUntitled"));
    expect(pathTitle.querySelector("[data-ai-generated]")).toBeNull();
    const digTitles = [...root.querySelectorAll(".v4MapDigTitle")];
    expect(digTitles[0]!.querySelector('[data-ai-generated="true"]')?.textContent).toBe("First asked");
    expect(digTitles[0]!.textContent).toContain(t(catalog, "v4.map.digMoreTail", { count: 1 }));
    expect(digTitles[1]!.querySelector("[data-ai-generated]")).toBeNull();
    const heading = panel(map, "dig:c-none", "plain", { digs: [untitled] }).querySelector("h2")!;
    expect(heading.textContent).toBe(t(catalog, "v4.map.digUntitled"));
    expect(heading.hasAttribute("data-ai-generated")).toBe(false);
  });

  it("keeps the whole answer under \"Read the full answer\" while the short one is written (map-f21), and shows it when the short one is missing", () => {
    const map: V4Map = { ...buildMap(), headline: null, summary: null, storyState: "WRITING", fallbackText: "First part.\n\nSecond part." };
    const root = panel(map, "root", "plain");
    const fold = root.querySelector<HTMLDetailsElement>("details.v4PanelFullAnswer")!;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")!.textContent).toBe(t(catalog, "v4.panel.readFullAnswer"));
    const fallback = fold.querySelector('.v4PanelFallback[data-ai-generated="true"]')!;
    expect([...fallback.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["First part.", "Second part."]);
    expect(root.textContent).toContain(t(catalog, "v4.panel.fallbackWriting"));
    expect(root.textContent).not.toContain(t(catalog, "v4.panel.storyWriting"));
    const gone = panel({ ...map, storyState: "UNAVAILABLE" }, "root", "plain");
    expect(gone.textContent).toContain(t(catalog, "v4.panel.fallbackMissing"));
  });

  it("adds the reservation line, outside the AI text, when the story carries one", () => {
    const root = panel({ ...buildMap(), reservation: true }, "root", "plain");
    const note = [...root.querySelectorAll(".v4PanelHint")].find((element) => element.textContent === t(catalog, "v4.story.reservation"));
    expect(note).toBeDefined();
    expect(note!.closest("[data-ai-generated]")).toBeNull();
    expect(panel(buildMap(), "root", "plain").textContent).not.toContain(t(catalog, "v4.story.reservation"));
  });

  it("explains a point that did not hold because its answer fell", () => {
    const fell = point("f1", "DIDNT_HOLD", { basis: "FELL", answeredBy: null });
    const map: V4Map = { ...buildMap(), points: [fell], counts: counts(0, 0, 0, 1), unchecked: 0 };
    const root = panel(map, "root", "expert");
    expect(root.textContent).toContain(t(catalog, "v4.basis.FELL"));
    expect(root.textContent).not.toContain(t(catalog, "v4.panel.answeredBy"));
  });

  it("titles the question with the person's own words and keeps the full text sent in a closed fold", () => {
    const question = "Should we do the thing?\n\nThis is for Romania.\nThe time frame is the next 5 years.";
    const map: V4Map = { ...buildMap(), question };
    const root = panel(map, "root", "plain");
    expect(root.querySelector("h2")?.textContent).toBe("Should we do the thing?");
    const sent = root.querySelector("details.v4PanelSent")!;
    expect(sent.hasAttribute("open")).toBe(false);
    expect(sent.querySelector("summary")?.textContent).toBe(t(catalog, "v4.panel.sentHeading"));
    expect(sent.querySelector('[data-ai-generated="true"]')?.textContent).toBe(question);
    expect(tree(map, "root").querySelector(".v4MapRootTitle")?.textContent).toBe("Should we do the thing?");
    expect(panel(buildMap(), "root", "plain").querySelector("details.v4PanelSent")).toBeNull();
  });

  it("offers Quick look / Thorough on a paid plan and hides the choice on Free, keeping the dig button (owner N13)", () => {
    const paid = panel(buildMap(), "open:o:0", "plain");
    expect(paid.querySelectorAll(".v4PanelModes button")).toHaveLength(2);
    const free = panel(buildMap(), "open:o:0", "plain", { showDigModes: false });
    expect(free.querySelector(".v4PanelModes")).toBeNull();
    expect(free.querySelector(".v4PanelDig button")).not.toBeNull();
  });

  it("names a dig's mode only when it is known", () => {
    const found: DigView = { ...dig("c-found", "RUNNING", ["w"]), link: { ...dig("c-found", "RUNNING", ["w"]).link, mode: null, startedAt: null } };
    expect(panel(buildMap(), "dig:c-found", "plain", { digs: [found] }).querySelector(".v4PanelModeTag")).toBeNull();
    expect(panel(buildMap(), "dig:c-run", "plain").querySelector(".v4PanelModeTag")?.textContent).toBe(t(catalog, "v4.digMode.quick"));
  });
});

/*
 * Dig model revision W4-6 (draft 5.5): a dig's card says what became of it ("Dig · changed this path", …, paused at the
 * month wall), a rewritten path's card and row carry one line about its rewrite, and the panel shows the whole rewrite.
 */
describe("W4-6: dig cards and rewritten paths", () => {
  const FINISHED = "2026-10-30T09:15:00.000Z";
  const writing: PathRewrite = { rewrite_id: "rw-1", dig_run_id: "c-done", dig_level: 1, dig_finished_at: FINISHED, state: "WRITING" };
  const rewritten = (changed: boolean): PathRewrite => ({
    ...writing, state: "READY", rewritten_at: "2026-10-30T09:18:00.000Z", changed,
    text: { line: changed ? "The new line for a" : longLine, summary: "The new summary.", fate: "HELD_UP" },
    what_changed: ["What the dig changed, in one sentence."], fate_before: "HELD_UP", view: null, dig_paths: []
  });
  const withRewrite = (rewrite: PathRewrite | null, changedBelow = false): V4Map => {
    const map = buildMap();
    const first = map.paths[0]!;
    const line = rewrite !== null && rewrite.state === "READY" ? rewrite.text.line : first.line;
    return {
      ...map,
      paths: [{ ...first, line, rewrites: { original: { line: first.line, fate: first.fate }, history: rewrite === null ? [] : [rewrite], changedBelow } }, ...map.paths.slice(1)]
    };
  };
  const noteOf = (root: HTMLElement, selector: string) => root.querySelectorAll(selector)[0]!.querySelector(".v4RewriteNote")?.textContent ?? null;

  it("a dig's card says what became of it, in every state", () => {
    const cases: ReadonlyArray<[DigView, string]> = [
      [dig("c-wait", "WAITING", ["p:x1"]), "v4.rewrite.digCard.WAITING"],
      [dig("c-run", "RUNNING", ["p:x1"]), "v4.rewrite.digCard.RUNNING"],
      [{ ...dig("c-run", "RUNNING", ["p:x1"]), pausedUntil: "2026-11-01T00:00:00.000Z" }, "v4.rewrite.digCard.PAUSED"],
      [dig("c-fail", "FAILED", ["p:x1"]), "v4.rewrite.digCard.FAILED"],
      [dig("c-done", "DONE", ["p:x1"]), "v4.rewrite.digCard.DONE"],
      [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: writing }, "v4.rewrite.digCard.REWRITING"],
      // journey-f11: a finished dig says what it found, in the three result words (or that nothing new was found).
      [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: rewritten(true) }, "v4.result.card.ADDED_TO"],
      [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: { ...rewritten(true), fate_before: "PARTLY_HELD" } as PathRewrite }, "v4.result.card.CORRECTED"],
      [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: rewritten(false) }, "v4.result.card.CONFIRMED"],
      [{ ...dig("c-done", "DONE", ["p:x1"]), counts: counts(0, 0, 1, 0), rewrite: rewritten(false) }, "v4.result.card.NOTHING_NEW"],
      [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: { ...writing, state: "FAILED", failed_at: "2026-10-30T09:20:00.000Z" } }, "v4.rewrite.digCard.REWRITE_FAILED"]
    ];
    for (const [view, key] of cases) {
      const root = tree(buildMap(), "root", { digs: [view] });
      expect(root.querySelector(".v4MapDig .v4MapNote")?.textContent, key).toBe(t(catalog, key));
    }
    // A paused dig does not pulse; a dig rewriting its path does.
    expect(tree(buildMap(), "root", { digs: [{ ...dig("c-run", "RUNNING", ["p:x1"]), pausedUntil: "2026-11-01T00:00:00.000Z" }] })
      .querySelector(".v4MapDig .v4MapPulse")).toBeNull();
    expect(tree(buildMap(), "root", { digs: [{ ...dig("c-done", "DONE", ["p:x1"]), rewrite: writing }] })
      .querySelector(".v4MapDig .v4MapPulse")).not.toBeNull();
  });

  it("a paused dig's panel says until when; a new-model dig never waits for a short answer", () => {
    const paused: DigView = { ...dig("c-run", "RUNNING", ["w"]), pausedUntil: "2026-11-01T12:00:00.000Z" };
    expect(panel(buildMap(), "dig:c-run", "plain", { digs: [paused] }).textContent)
      .toContain(t(catalog, "v4.money.paused", { date: "1 November" })); // day first on English pages (question 5)
    const done: DigView = { ...dig("c-new", "DONE", ["w"]), headline: null, rewrite: rewritten(true) };
    const root = panel(buildMap(), "dig:c-new", "plain", { digs: [done] });
    expect(root.textContent).not.toContain(t(catalog, "v4.panel.digNoHeadline"));
    expect(root.textContent).toContain(t(catalog, "v4.result.card.ADDED_TO"));
    expect(root.querySelector(".v4RewriteChanged")?.textContent).toContain("What the dig changed, in one sentence.");
  });

  it("a rewritten path's card and outline row carry one line about it; a path with none carries nothing", () => {
    const outline = (map: V4Map) => dom(renderToStaticMarkup(
      <V4Outline map={map} digs={[]} selected="root" changed={new Set()} picked={new Set()} onSelect={noop} onTogglePick={noop} catalog={catalog} locale="en" />
    ));
    expect(noteOf(tree(buildMap(), "root", { digs: [] }), ".v4MapBranch")).toBeNull();
    for (const [rewrite, expected] of [
      [writing, t(catalog, "v4.rewrite.state.WRITING")],
      // The owner's answers of 5 Nov (question 4 A): the long form with the year, through the shared date helper; day
      // first on English pages (question 5 B), so "30 October 2026".
      [rewritten(true), t(catalog, "v4.rewrite.rewrittenOnce", { date: formatDate("en", "2026-10-30T09:18:00.000Z", { dateStyle: "long" }) })],
      [rewritten(false), t(catalog, "v4.rewrite.state.NO_CHANGE")],
      [{ ...writing, state: "FAILED", failed_at: "2026-10-30T09:20:00.000Z" } as PathRewrite, t(catalog, "v4.rewrite.card.FAILED")]
    ] as const) {
      expect(noteOf(tree(withRewrite(rewrite), "root", { digs: [] }), ".v4MapBranch"), rewrite.state).toBe(expected);
      expect(noteOf(outline(withRewrite(rewrite)), ".v4OutPath"), rewrite.state).toBe(expected);
    }
    expect(noteOf(tree(withRewrite(null, true), "root", { digs: [] }), ".v4MapBranch")).toBe(t(catalog, "v4.rewrite.changedBelow"));
    // The card is a button: nothing inside it is a control of its own.
    expect(tree(withRewrite(rewritten(true), true), "root", { digs: [] }).querySelector(".v4MapPath .v4RewriteNote button, .v4MapPath .v4RewriteNote a")).toBeNull();
  });

  it("the panel shows the whole rewrite under the path's new text; a path no dig touched shows none", () => {
    const root = panel(withRewrite(rewritten(true)), "path:a", "plain", { digs: [] });
    expect(root.querySelector("h2")?.textContent).toBe("The new line for a");
    expect(root.querySelector(".v4Rewrite .v4RewriteChanged li")?.textContent).toBe("What the dig changed, in one sentence.");
    expect(root.querySelector(".v4Rewrite a")?.getAttribute("href")).toBe("/v4/debate/c-done?level=plain");
    expect(panel(buildMap(), "path:a", "plain", { digs: [] }).querySelector(".v4Rewrite")).toBeNull();
  });
});
