// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";
import { CATALOG, resetHarness, settle } from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>
}));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await import("./v4-debate-harness.js")).loadMock(await original()),
  loadInvestigation: (runId: string) => reports.load(runId)
}));
vi.mock("@/lib/v4/reportWriting", async (original) => ({ ...(await original()), loadRunPublished: async () => false }));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 start step, Task 55c (report-f4, the owner's "All in this build"; r2-20 A, r2-1 A) on the report page (V4ReportClient's
 * VersionPaths): each version shows one row per first-level path as before (its one trust word, line, summary and bar, no
 * counts); under a row whose path holds the person's own words, "Your point of view" with the approved lines, the same care
 * whether it helped or not; the paths dug later folded under their first-level row in one closed "Updated by your dig"; under a
 * dig's first path what it changed and its own point of view. A version written before R22 keeps only its answer. Made-up texts.
 */

const B2_REASON = "A made-up reason the local jobs did not move the cost case.";
const B2_LINE = "A made-up path with my own words.";
const DUG_LINE = "A made-up dig of path 2, found later.";
const CHANGED = "The made-up dig found 2 jobs counted twice.";
const point = (trust: string | null, text = "A made-up point.") => ({ text, trust, side: null, sources: [] });

/** A path debate's version as the current one keeps it (Task 55b: path_id, trust and own on its first-level paths). */
function v2Paths(view: unknown): unknown[] {
  return [
    { line: "A made-up first path.", summary: "Its made-up summary.", fate: "HELD_UP", level: 0, path_id: "b1", trust: "SURE", points: [point("SURE")] },
    { line: B2_LINE, summary: null, fate: "PARTLY_HELD", level: 0, path_id: "b2", trust: "STILL_ARGUED", points: [point("STILL_ARGUED")],
      own: { own_words: ["Cernavodă jobs matter"], view } },
    { line: DUG_LINE, summary: "Its made-up summary of 3 findings.", fate: "HELD_UP", level: 1, points: [point("SURE_FOR_CASE"), point(null)],
      dig: { picks: ["A made-up suggestion."], own_words: [], view: null, changed: [CHANGED] } },
    { line: "A made-up deeper path.", summary: null, fate: null, level: 2 },
    { line: "A made-up third path.", summary: null, fate: "FELL", level: 0, path_id: "b3", trust: "DIDNT_HOLD", points: [point("DIDNT_HOLD")] }
  ];
}
/**
 * An earlier version as the API serves it (Task 55b's review fix): line, summary, fate, level, and path_id, trust and own; Task 55f: and
 * the mark of a dig on the main question.
 */
const earlier = (paths: unknown[]) => paths.map((path) => {
  const { line, summary, fate, level, path_id, trust, own, under } = path as Record<string, unknown>;
  return { line, summary, fate, level, ...(path_id === undefined ? {} : { path_id }), ...(trust === undefined ? {} : { trust }), ...(own === undefined ? {} : { own }),
    ...(under === undefined ? {} : { under }) };
});
const R22_REASON = "A made-up reason the angle helped.";
const R22_PATHS = [
  { line: "A made-up first R22 path.", summary: null, fate: "PARTLY_HELD", level: 0, points: [point("STILL_ARGUED")] },
  { line: "A made-up R22 dig.", summary: null, fate: "HELD_UP", level: 1, points: [point("SURE")],
    dig: { picks: [], own_words: ["Nuclear keeps the lights on"], view: { outcome: "HELPED", reason: R22_REASON }, changed: ["A made-up change."] } },
  { line: "A made-up second R22 path.", summary: null, fate: null, level: 0 }
];

function finished(version: number, written: string, paths?: unknown[]): InvestigationReportVersion {
  return { report_version: version, closed_at: "2026-11-05T09:00:00.000Z", state: "READY", written_at: written,
    answer: { segments: [`The made-up answer of version ${version}.`] }, story: null, sources: [], shortened: false,
    ...(paths === undefined ? {} : { paths }) } as InvestigationReportVersion;
}
function investigation(runId: string, versions: InvestigationReportVersion[]): InvestigationReports {
  const current = versions.at(-1)!.report_version;
  return InvestigationReportsSchema.parse({ investigation_id: "55555555-5555-4555-8555-5555555555cc", root_run_id: runId, state: "CLOSED", digs: 1,
    versions, current });
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function mountReport(versions: InvestigationReportVersion[]): Promise<HTMLElement> {
  const runId = crypto.randomUUID();
  const read = investigation(runId, versions);
  reports.load = async () => read;
  const { V4ReportClient } = await import("../../apps/ui/components/v4/V4ReportClient.js");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<V4ReportClient id={runId} locale="en" initialLevel="background" catalog={CATALOG} newDebateCatalog={{}} />));
  await settle();
  return host.querySelector<HTMLElement>(".v4RepInvestigation")!;
}
async function press(button: HTMLElement): Promise<void> {
  await act(async () => button.click());
  await settle();
}
async function openFold(fold: HTMLDetailsElement): Promise<void> {
  await act(async () => { fold.open = true; });
}
const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
const word = (key: string, values: Record<string, string> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, value), CATALOG[key]!);
/** The first-level rows of the shown version: each group's own row (the paths dug later sit in the group's fold). */
const groups = (node: ParentNode) => [...node.querySelectorAll<HTMLElement>(".v4RepVersionBody .v4RepPathGroup")];
const groupOf = (node: ParentNode, line: string) =>
  groups(node).find((group) => flat(group.querySelector(":scope > .v4RepPath > .v4RepPathLine")) === line)!;
const rowOf = (group: HTMLElement) => group.querySelector<HTMLElement>(":scope > .v4RepPath")!;
const viewLines = (view: Element) => [...view.children].map((child) => flat(child));

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("report-f4: your point of view on your own path", () => {
  it("shows it under the path that holds your words, in the approved lines, your words unmarked and the reason marked", async () => {
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z",
      v2Paths({ outcome: "DID_NOT_HELP", scope: "PATH", reason: B2_REASON }))]);
    // One row per first-level path, each with its one trust word (r2-20).
    expect(groups(node).map((group) => flat(rowOf(group).querySelector(".v4RepPathLine")))).toEqual([
      "A made-up first path.", B2_LINE, "A made-up third path."
    ]);
    expect(groups(node).map((group) => flat(rowOf(group).querySelector(".v4RepPathWord")))).toEqual(["Sure", "Still argued", "Didn't hold"]);
    const b2 = groupOf(node, B2_LINE);
    const view = b2.querySelector<HTMLElement>(".v4RepView")!;
    expect(view).not.toBeNull();
    expect(viewLines(view)).toEqual([
      "Your point of view",
      "Cernavodă jobs matter",
      "Your point of view did not help this path.",
      `Why: ${B2_REASON}`,
      "The AIs weighed your point of view as yours. They did not take it as a finding."
    ]);
    // The person's words are theirs, never marked as AI text; the reason is the AI's.
    const words = [...view.querySelectorAll<HTMLElement>(".v4RepViewWords li")];
    expect(words.map((item) => flat(item))).toEqual(["Cernavodă jobs matter"]);
    for (const item of words) {
      expect(item.closest("[data-ai-generated]")).toBeNull();
      expect(item.querySelector("[data-ai-generated]")).toBeNull();
    }
    expect([...view.querySelectorAll("[data-ai-generated]")].map((marked) => marked.textContent)).toEqual([B2_REASON]);
    // Under b2's row, before its fold; no other path shows a point of view.
    expect(rowOf(b2).querySelector(".v4RepPathLine")!.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.compareDocumentPosition(b2.querySelector("details")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(node.querySelectorAll(".v4RepView")).toHaveLength(1);
  });

  it("an earlier version shows it too, with the same look whether it helped or not", async () => {
    const node = await mountReport([
      finished(1, "2026-11-04T10:00:00.000Z", earlier(v2Paths({ outcome: "HELPED", scope: "MAIN_QUESTION", reason: "A made-up reason it helped." }))),
      finished(2, "2026-11-05T10:00:00.000Z", v2Paths({ outcome: "DID_NOT_HELP", scope: "PATH", reason: B2_REASON }))
    ]);
    const notHelped = groupOf(node, B2_LINE).querySelector<HTMLElement>(".v4RepView")!;
    const notHelpedClass = notHelped.className;
    const notHelpedTags = [...notHelped.querySelectorAll("*")].map((element) => `${element.tagName}.${element.className}`);
    await press([...node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")][1]!);
    expect(flat(node.querySelector(".v4RepVersionLine"))).toContain("Version 1");
    const helped = groupOf(node, B2_LINE).querySelector<HTMLElement>(".v4RepView")!;
    expect(viewLines(helped)).toEqual([
      "Your point of view",
      "Cernavodă jobs matter",
      "Your point of view helped this path and the main question.",
      "Why: A made-up reason it helped.",
      "The AIs weighed your point of view as yours. They did not take it as a finding."
    ]);
    // "The same care": one look, whatever the verdict.
    expect(helped.className).toBe(notHelpedClass);
    expect([...helped.querySelectorAll("*")].map((element) => `${element.tagName}.${element.className}`)).toEqual(notHelpedTags);
    // An earlier path debate's version keeps its first-level paths' words (no points, so the word is the stored one).
    expect(groups(node).map((group) => flat(rowOf(group).querySelector(".v4RepPathWord")))).toEqual(["Sure", "Still argued", "Didn't hold"]);
  });

  it("with no verdict stored yet, shows your words and that they were weighed as yours, nothing guessed", async () => {
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z", v2Paths(null))]);
    const view = groupOf(node, B2_LINE).querySelector<HTMLElement>(".v4RepView")!;
    expect(viewLines(view)).toEqual([
      "Your point of view",
      "Cernavodă jobs matter",
      "The AIs weighed your point of view as yours. They did not take it as a finding."
    ]);
    expect(view.querySelector("[data-ai-generated]")).toBeNull();
  });
});

describe("report-f4: the paths dug later, folded under theirs, and what each dig changed", () => {
  it("folds b2's dig under b2 in one closed \"Updated by your dig\"; opened, it shows the dig's word, line and what it changed", async () => {
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z",
      v2Paths({ outcome: "DID_NOT_HELP", scope: "PATH", reason: B2_REASON }))]);
    const b2 = groupOf(node, B2_LINE);
    const folds = [...node.querySelectorAll<HTMLDetailsElement>(".v4RepVersionBody details")];
    expect(folds).toHaveLength(1);
    const fold = b2.querySelector<HTMLDetailsElement>(":scope > details")!;
    expect(folds[0]).toBe(fold);
    expect(fold.open).toBe(false);
    expect(flat(fold.querySelector("summary"))).toBe("Updated by your dig");
    // The other first-level rows have nothing folded under them.
    expect(groupOf(node, "A made-up first path.").querySelector("details")).toBeNull();
    await openFold(fold);
    const dug = [...fold.querySelectorAll<HTMLElement>(".v4RepPath")];
    expect(dug.map((row) => flat(row.querySelector(".v4RepPathLine")))).toEqual([DUG_LINE, "A made-up deeper path."]);
    // Today's level indent.
    expect(dug.map((row) => row.dataset.level)).toEqual(["1", "2"]);
    const dig = dug[0]!;
    expect(flat(dig.querySelector(".v4RepPathWord"))).toBe("Sure, for the case named");
    expect(flat(dig.querySelector(".v4RepPathSummary"))).toBe("Its made-up summary of 3 findings.");
    expect(dig.querySelectorAll(".v4Bar")).toHaveLength(1);
    const changed = dig.querySelector<HTMLElement>(".v4RepChanged")!;
    expect(flat(changed.querySelector("h4"))).toBe(word("v4.paths.whatChanged"));
    const items = [...changed.querySelectorAll<HTMLElement>("li")];
    expect(items.map((item) => flat(item))).toEqual([CHANGED]);
    for (const item of items) expect(item.getAttribute("data-ai-generated")).toBe("true");
    // The deeper path keeps no dig of its own: no word (nothing checked), no bar, no change list.
    expect(dug[1]!.querySelector(".v4RepPathWord, .v4Bar, .v4RepChanged, .v4RepView")).toBeNull();
    // A dig with no words of the person's shows no point of view.
    expect(dig.querySelector(".v4RepView")).toBeNull();
  });

  it("an R22 version shows a dig's own words under its first path, from the dig's verdict, after what it changed", async () => {
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z", R22_PATHS)]);
    expect(groups(node).map((group) => flat(rowOf(group).querySelector(".v4RepPathLine")))).toEqual(["A made-up first R22 path.", "A made-up second R22 path."]);
    const fold = groupOf(node, "A made-up first R22 path.").querySelector<HTMLDetailsElement>(":scope > details")!;
    expect(fold.open).toBe(false);
    await openFold(fold);
    const dig = fold.querySelector<HTMLElement>(".v4RepPath")!;
    expect(flat(dig.querySelector(".v4RepPathLine"))).toBe("A made-up R22 dig.");
    const view = dig.querySelector<HTMLElement>(".v4RepView")!;
    expect(viewLines(view)).toEqual([
      "Your point of view",
      "Nuclear keeps the lights on",
      "Your point of view helped this path.",
      `Why: ${R22_REASON}`,
      "The AIs weighed your point of view as yours. They did not take it as a finding."
    ]);
    expect(dig.querySelector(".v4RepChanged")!.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No first-level R22 path holds the person's words.
    expect(node.querySelectorAll(".v4RepView")).toHaveLength(1);
  });

  it("a fold opened on one version is closed again on the next version pressed (the review's key reset)", async () => {
    const node = await mountReport([finished(1, "2026-11-04T10:00:00.000Z", R22_PATHS), finished(2, "2026-11-05T10:00:00.000Z", R22_PATHS)]);
    const foldNow = () => groupOf(node, "A made-up first R22 path.").querySelector<HTMLDetailsElement>(":scope > details")!;
    await openFold(foldNow());
    expect(foldNow().open).toBe(true);
    await press([...node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")][1]!);
    expect(flat(node.querySelector(".v4RepVersionLine"))).toContain("Version 1");
    expect(foldNow().open).toBe(false);
  });

  it("a version written before R22 keeps only its written answer", async () => {
    const node = await mountReport([finished(1, "2026-10-28T10:00:00.000Z"), finished(2, "2026-11-05T10:00:00.000Z", R22_PATHS)]);
    await press([...node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")][1]!);
    expect(groups(node)).toEqual([]);
    expect(flat(node)).toContain(word("v4.investigation.onlyAnswer"));
  });

  it("counts nothing: no digit outside the paths' own text, on screen or in a label", async () => {
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z",
      v2Paths({ outcome: "HELPED", scope: "PATH", reason: "A made-up reason with 4 jobs." }))]);
    for (const fold of node.querySelectorAll<HTMLDetailsElement>(".v4RepVersionBody details")) await openFold(fold);
    const paths = node.querySelector<HTMLElement>(".v4RepVersionBody .v4RepPaths")!;
    // The fixture's own texts hold digits, so the check below is not empty.
    expect(flat(paths)).toMatch(/\d/u);
    const bare = paths.cloneNode(true) as HTMLElement;
    for (const own of bare.querySelectorAll("[data-ai-generated], .v4RepViewWords")) own.remove();
    expect(flat(bare)).not.toMatch(/\d/u);
    const labels = [...paths.querySelectorAll("[aria-label]")].map((labelled) => labelled.getAttribute("aria-label") ?? "");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => /\d/u.test(label))).toEqual([]);
  });
});

/*
 * V4 start step, Task 55f (the coordinator's ruling on Task 55c's open point 3): a dig on the MAIN QUESTION comes after the last path's
 * own digs in the stored order. Its rows carry the mark `under: "QUESTION"`, so the page folds them, with the paths dug from them, after
 * the paths in a closed fold of their own, "Dug from your question", never under the last path. A version written before the mark folds
 * them as it always did. Made-up texts only.
 */
const ON_QUESTION_LINE = "A made-up dig on the question itself.";
const R22_ON_QUESTION: Array<Record<string, unknown>> = [
  ...R22_PATHS,
  { line: ON_QUESTION_LINE, summary: null, fate: "HELD_UP", level: 1, points: [point("SURE")],
    dig: { picks: ["Is it worth it at all?"], own_words: [], view: null, changed: ["A made-up change to the main answer."] }, under: "QUESTION" },
  // Review of Task 55f: a path dug from that dig carries the mark too.
  { line: "A made-up path dug from it.", summary: null, fate: null, level: 2, under: "QUESTION" },
  { line: "A made-up second path of that dig.", summary: null, fate: null, level: 1, under: "QUESTION" }
];
const lineOf = (row: Element) => flat(row.querySelector(".v4RepPathLine"));

describe("Task 55f: a dig on the main question folds under its own place, not under the last path", () => {
  it("folds after the paths in its own closed \"Dug from your question\"; the last path keeps only its own dig", async () => {
    const node = await mountReport([finished(1, "2026-11-07T10:00:00.000Z", R22_ON_QUESTION)]);
    const all = groups(node);
    expect(all).toHaveLength(3);
    expect(all.slice(0, 2).map((group) => lineOf(rowOf(group)))).toEqual(["A made-up first R22 path.", "A made-up second R22 path."]);
    expect(groupOf(node, "A made-up second R22 path.").querySelector("details")).toBeNull();
    const own = all[2]!;
    // No row of its own: the question is the page's title.
    expect(own.querySelector(":scope > .v4RepPath")).toBeNull();
    const fold = own.querySelector<HTMLDetailsElement>(":scope > details")!;
    expect(fold.open).toBe(false);
    expect(flat(fold.querySelector("summary"))).toBe("Dug from your question");
    expect(flat(fold.querySelector("summary"))).toBe(word("v4.investigation.updatedByQuestionDig"));
    await openFold(fold);
    const dug = [...fold.querySelectorAll<HTMLElement>(".v4RepPath")];
    expect(dug.map(lineOf)).toEqual([ON_QUESTION_LINE, "A made-up path dug from it.", "A made-up second path of that dig."]);
    expect(dug.map((row) => row.dataset.level)).toEqual(["1", "2", "1"]);
    expect(flat(dug[0]!.querySelector(".v4RepChanged li"))).toBe("A made-up change to the main answer.");
    // Two folds in all: the first path's dig, and the question's.
    const folds = [...node.querySelectorAll<HTMLDetailsElement>(".v4RepVersionBody details")];
    expect(folds.map((each) => flat(each.querySelector("summary")))).toEqual(["Updated by your dig", "Dug from your question"]);
  });

  it("an earlier version keeps the mark, so it folds the same way", async () => {
    const node = await mountReport([finished(1, "2026-11-06T10:00:00.000Z", earlier(R22_ON_QUESTION)),
      finished(2, "2026-11-07T10:00:00.000Z", R22_PATHS)]);
    await press([...node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")][1]!);
    expect(flat(node.querySelector(".v4RepVersionLine"))).toContain("Version 1");
    const own = groups(node).at(-1)!;
    expect(own.querySelector(":scope > .v4RepPath")).toBeNull();
    expect(flat(own.querySelector(":scope > details > summary"))).toBe("Dug from your question");
    expect([...own.querySelectorAll(".v4RepPath")].map(lineOf)).toEqual([ON_QUESTION_LINE, "A made-up path dug from it.", "A made-up second path of that dig."]);
  });

  it("a version written before the mark reads as it always did: the dig on the question folds under the last path", async () => {
    const unmarked = R22_ON_QUESTION.map(({ under: _under, ...rest }) => rest);
    const node = await mountReport([finished(1, "2026-11-05T10:00:00.000Z", unmarked)]);
    expect(groups(node)).toHaveLength(2);
    const fold = groupOf(node, "A made-up second R22 path.").querySelector<HTMLDetailsElement>(":scope > details")!;
    expect(flat(fold.querySelector("summary"))).toBe("Updated by your dig");
    expect([...fold.querySelectorAll(".v4RepPath")].map(lineOf)).toEqual([ON_QUESTION_LINE, "A made-up path dug from it.", "A made-up second path of that dig."]);
    expect(flat(node)).not.toContain("Dug from your question");
  });
});
