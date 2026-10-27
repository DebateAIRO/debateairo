// @vitest-environment jsdom

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V4MapTree } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { V4TrustBar } from "../../apps/ui/components/v4/V4TrustBar.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
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
    storyState: "READY"
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

function panel(map: V4Map, selected: V4Selection, level: ReadingLevel, extra: Partial<{ digBusy: boolean; digs: readonly DigView[] }> = {}) {
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
      onDig={noop}
      digBusy={extra.digBusy ?? false}
      headingRef={createRef<HTMLHeadingElement>()}
      catalog={catalog}
      locale="en"
    />
  ));
}

describe("V4 trust bar", () => {
  it("draws one segment per word that has points and names the counts in words", () => {
    // The label wraps the count words; "{counts}" alone lets the check read them whatever the merged wording is.
    const labelled = { ...catalog, "v4.bar.label": "{counts}" };
    const root = dom(renderToStaticMarkup(<V4TrustBar counts={counts(2, 4, 2, 0)} catalog={labelled} showCounts />));
    expect(root.querySelectorAll(".v4BarSeg")).toHaveLength(3);
    const label = root.querySelector('[role="img"]')?.getAttribute("aria-label") ?? "";
    expect(label).toContain(t(catalog, "v4.trustCount.SURE", { count: 2 }));
    expect(label).not.toContain(t(catalog, "v4.trustCount.DIDNT_HOLD", { count: 0 }));
    expect(root.querySelector(".v4BarCounts")?.textContent).toContain(t(catalog, "v4.trustCount.SURE_FOR_CASE", { count: 4 }));
  });

  it("shows an empty track and the nothing-checked words when every count is zero", () => {
    const root = dom(renderToStaticMarkup(<V4TrustBar counts={none} unchecked={3} catalog={catalog} showCounts />));
    expect(root.querySelectorAll(".v4BarSeg")).toHaveLength(0);
    expect(root.querySelector(".v4BarEmpty")).not.toBeNull();
    expect(root.querySelector(".v4BarCounts")?.textContent).toContain(t(catalog, "v4.trustCount.none"));
  });
});

describe("V4 map tree", () => {
  it("draws the question, all 8 paths, at most two open questions per path and every dig state", () => {
    const root = tree(buildMap(), "root");
    expect(root.querySelectorAll(".v4MapRoot")).toHaveLength(1);
    expect(root.querySelectorAll(".v4MapPath")).toHaveLength(8);
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

  it("cuts long titles at a word boundary and keeps AI text marked", () => {
    const root = tree(buildMap(), "root");
    const title = root.querySelector(".v4MapPathTitle")!;
    expect(title.getAttribute("data-ai-generated")).toBe("true");
    expect(title.textContent!.endsWith("…")).toBe(true);
    expect(title.textContent!.length).toBeLessThanOrEqual(71);
    expect(longLine.startsWith(title.textContent!.slice(0, -1))).toBe(true);
  });

  it("shows +N open when a path has more than two open questions and no fate word for the stand-in path", () => {
    const map = buildMap();
    const root = tree(map, "root", { digs: [] });
    const branchA = root.querySelectorAll(".v4MapBranch")[0]!;
    expect(branchA.querySelectorAll(".v4MapOpen")).toHaveLength(2);
    expect(branchA.querySelector(".v4MapMore")?.textContent).toBe(t(catalog, "v4.map.moreOpen", { count: 2 }));
    const branchB = root.querySelectorAll(".v4MapBranch")[1]!;
    expect(branchB.querySelector(".v4MapFate")).toBeNull();
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

  it("adds the second AI's reasons, who answered it, why and how sure at the expert level; text only in plain words", () => {
    const expert = panel(buildMap(), "root", "expert");
    expect(expert.textContent).toContain("Reason for n1");
    expect(expert.textContent).toContain("Answer to n4");
    expect(expert.textContent).toContain("First reason");
    expect(expert.textContent).toContain("Fairly sure about the first part.");
    const plain = panel(buildMap(), "root", "plain");
    expect(plain.querySelectorAll(".v4PanelBasis")).toHaveLength(0);
    expect(plain.textContent).toContain("Claim n1");
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
    expect(done.querySelector('a[href="/v4/debate/c-done"]')).not.toBeNull();
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
