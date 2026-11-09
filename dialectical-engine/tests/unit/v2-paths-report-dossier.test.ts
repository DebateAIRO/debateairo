// tests/unit/v2-paths-report-dossier.test.ts
// V4 start step, Task 55b (spec 2026-11-03 §4.4, §4.6; the owner's request for report-f4): the pure parts of a report and an answer update
// on a path debate. The first debate's paths are the paths the person chose (Task 50's dossier path rule): each by its path id, its
// answer so far as its text unless a later climb or rewrite wrote a newer one, a FAILED path named as not finished, the person's own
// words in `views` beside the outcome's verdict. Each stored version keeps, on every first-level path of a path debate, its path id and
// trust word, and on a path with the person's own words those words and the verdict (the newest dig's when one wrote one): storage
// only, so the dossier's material and fingerprint never read it. An R22 dossier keeps its bytes. Every word here is made up.
import { describe, expect, it } from "vitest";
import { InvestigationReportPathSchema, type PathOutcome } from "@debateai/contract";
import type { PathRootInForce, StoredStartPathSet } from "@debateai/db";
import { closeInvestigation, type InvestigationReportContent } from "../../apps/runner/src/investigation-close.js";
import { v2FirstPathsOf } from "../../apps/runner/src/investigation-close-sources.js";
import { buildInvestigationDossier, dossierFieldsOf, type Dossier, type DossierInput, type DossierPath } from "../../apps/runner/src/investigation-dossier.js";
import type { PathRewritePoint } from "../../apps/runner/src/path-rewrite-material.js";
import {
  ROOT, closingOf, investigationInput, memoryReports, readyDig, settingsOver, team
} from "../support/investigation-close-world.js";

const OWN = Object.freeze(["Cernavodă jobs matter more than the price.", "Keep the river cool in summer."]);
const VIEW = Object.freeze({ outcome: "DID_NOT_HELP" as const, scope: "PATH" as const, reason: "The points argued here weigh the price first.",
  own_words: [...OWN] });

/** The set Start sealed: b1 a menu path, b2 the person's own (two own sentences), b3 a menu path whose arguing failed. */
function set(): StoredStartPathSet {
  const path = (no: number, author: "AI_SUGGESTION" | "PERSON_OWN_VIEW", ownWords: readonly string[]) => Object.freeze({
    pathId: `b${String(no)}` as "b1", pathNo: no, author, title: `T${String(no)}`, question: `Q${String(no)}?`,
    viewpoints: Object.freeze([Object.freeze({ viewpointId: null, pickNo: null, title: `T${String(no)}`, question: `Q${String(no)}?`, own: author === "PERSON_OWN_VIEW" })]),
    ownWords: Object.freeze([...ownWords]) });
  return Object.freeze({ runId: ROOT, source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, menu: null,
    paths: Object.freeze([path(1, "AI_SUGGESTION", []), path(2, "PERSON_OWN_VIEW", OWN), path(3, "AI_SUGGESTION", [])]) });
}
const ROOTS: readonly PathRootInForce[] = Object.freeze([
  { pathId: "b1", rootIndex: 0, rootNodeId: "aaaaaaaa-0000-4000-8000-0000000000b1", maker: "m1", stale: false },
  { pathId: "b2", rootIndex: 1, rootNodeId: "aaaaaaaa-0000-4000-8000-0000000000b2", maker: "m2", stale: false },
  // b3's root was set aside by a reclaim: it is not in force.
  { pathId: "b3", rootIndex: 2, rootNodeId: "aaaaaaaa-0000-4000-8000-0000000000b3", maker: "m3", stale: true }
]);
const ready = (line: string, trust: PathOutcome["trust"], view: PathOutcome["view"] = null): PathOutcome => Object.freeze({
  state: "READY" as const, text: { line, summary: `Summary of: ${line}`, fate: "HELD_UP" as const }, what_changed: [], view, trust, rests_on: [] });
const OUTCOMES: ReadonlyMap<"b1" | "b2" | "b3", PathOutcome> = new Map([
  ["b1", ready("Nuclear keeps the lights on in winter.", "SURE")],
  ["b2", ready("Local jobs weigh less than the bills.", "STILL_ARGUED", VIEW)],
  ["b3", Object.freeze({ state: "FAILED" as const, text: null, what_changed: [], view: null, trust: null, rests_on: [] })]
]);
const point = (id: string, text: string): PathRewritePoint => Object.freeze({ id, text, onId: null, side: "for" as const, trust: null, disputed: false });
const pointsOf = async (rootNodeId: string): Promise<readonly PathRewritePoint[]> =>
  [point(`${rootNodeId.slice(0, -2)}c${rootNodeId.slice(-1)}`, `A point under ${rootNodeId.slice(-2)}.`)];

async function v2Paths(newest: ReadonlyMap<string, Readonly<{ line: string; summary: string; fate: "PARTLY_HELD" }>> = new Map()): Promise<readonly DossierPath[]> {
  return v2FirstPathsOf({ set: set(), roots: ROOTS, outcomes: OUTCOMES, newest, pointsOf });
}
const v2Input = (paths: readonly DossierPath[], over: Partial<DossierInput> = {}): DossierInput =>
  investigationInput({ first: { runId: ROOT, answer: null, paths }, digs: [], ...over });
const built = (input: DossierInput): Dossier => {
  const dossier = buildInvestigationDossier(input);
  if (dossier.kind !== "BUILT") throw new Error("test: the dossier did not fit");
  return dossier;
};
const fieldOf = (dossier: Dossier, name: string): unknown => JSON.parse(dossierFieldsOf(dossier).find((entry) => entry.name === name)!.content);
const withoutStored = (paths: readonly DossierPath[]): readonly DossierPath[] => paths.map(({ stored: _stored, ...rest }) => rest);

describe("Task 55b: a path debate's first-level paths, from the paths the person chose", () => {
  it("each path by its id, its answer so far as its text, its own words and the outcome's verdict; a FAILED path named as not finished", async () => {
    const paths = await v2Paths();
    expect(paths.map((path) => [path.ref, path.storyLine, path.storyFate, path.current?.line ?? null])).toEqual([
      ["b1", "Nuclear keeps the lights on in winter.", "HELD_UP", "Nuclear keeps the lights on in winter."],
      ["b2", "Local jobs weigh less than the bills.", "HELD_UP", "Local jobs weigh less than the bills."],
      ["b3", "Q3?", "SET_ASIDE", null]]);
    expect(paths[0]!.current).toEqual({ line: "Nuclear keeps the lights on in winter.", summary: "Summary of: Nuclear keeps the lights on in winter.", fate: "HELD_UP" });
    // The points are those under each path's root in force (its root left out); b3's root is not in force: none.
    expect(paths.map((path) => path.points.map((entry) => entry.text))).toEqual([["A point under b1."], ["A point under b2."], []]);
    expect(paths.map((path) => path.ownWords ?? [])).toEqual([[], [...OWN], []]);
    expect(paths[1]!.view).toEqual({ outcome: "DID_NOT_HELP", scope: "PATH", reason: "The points argued here weigh the price first." });
    expect(paths[0]!.view ?? null).toBeNull();
    // Storage only: the path id, the outcome's trust word, the own words and the verdict.
    expect(paths.map((path) => path.stored)).toEqual([
      { pathId: "b1", trust: "SURE", ownWords: [], view: null },
      { pathId: "b2", trust: "STILL_ARGUED", ownWords: [...OWN], view: { outcome: "DID_NOT_HELP", scope: "PATH", reason: "The points argued here weigh the price first." } },
      { pathId: "b3", trust: null, ownWords: [], view: null }]);
  });

  it("a newer climb's or rewrite's text stands over the answer so far, the answer so far kept beside it", async () => {
    const paths = await v2Paths(new Map([["b2", { line: "Jobs matter, but bills decide.", summary: "A dig found the bills rise.", fate: "PARTLY_HELD" as const }]]));
    expect(paths[1]!.current).toEqual({ line: "Jobs matter, but bills decide.", summary: "A dig found the bills rise.", fate: "PARTLY_HELD" });
    expect(paths[1]!.storyLine).toBe("Local jobs weigh less than the bills.");
    const first = fieldOf(built(v2Input(paths)), "first_debate") as { paths: { ref: string; line: string; story_line?: string }[] };
    expect(first.paths.map((path) => [path.ref, path.line, path.story_line ?? null])).toEqual([
      ["A1", "Nuclear keeps the lights on in winter.", null], ["A2", "Jobs matter, but bills decide.", "Local jobs weigh less than the bills."],
      ["A3", "Q3?", null]]);
  });

  it("the own words join the point-of-view lines beside the outcome's verdict, as a dig's view does", async () => {
    const views = fieldOf(built(v2Input(await v2Paths())), "views");
    expect(views).toEqual([{ path: "A2", words: [...OWN], marked: "PERSON",
      verdict: { outcome: "DID_NOT_HELP", scope: "PATH", reason: "The points argued here weigh the price first." } }]);
  });

  it("the dossier's fingerprint and material are the same with and without what is stored", async () => {
    const paths = await v2Paths();
    const withIt = built(v2Input(paths));
    const without = built(v2Input(withoutStored(paths)));
    expect(withIt.fingerprint).toBe(without.fingerprint);
    expect(dossierFieldsOf(withIt)).toEqual(dossierFieldsOf(without));
    expect(JSON.stringify(dossierFieldsOf(withIt))).not.toContain("\"b2\"");
  });

  it("each stored version's first-level paths keep the path id and trust word, and the own words with the verdict on an own path", async () => {
    const stored = built(v2Input(await v2Paths())).paths;
    expect(stored.map((path) => [path.level, path.path_id, path.trust, path.own ?? null])).toEqual([
      [0, "b1", "SURE", null],
      [0, "b2", "STILL_ARGUED", { own_words: [...OWN], view: { outcome: "DID_NOT_HELP", scope: "PATH", reason: "The points argued here weigh the price first." } }],
      [0, "b3", null, null]]);
    for (const path of stored) expect(InvestigationReportPathSchema.safeParse(path).success).toBe(true);
    // The three members come last.
    expect(Object.keys(stored[1]!).slice(-3)).toEqual(["path_id", "trust", "own"]);
  });

  it("after a dig under b2 that wrote a view, the version's b2 view is the dig's", async () => {
    const dig = readyDig({ positionRef: "b2", rewrite: Object.freeze({ ...readyDig().rewrite!,
      view: Object.freeze({ outcome: "HELPED" as const, scope: "MAIN_QUESTION" as const, reason: "The jobs figure moved the main answer." }) }) });
    const stored = built(v2Input(await v2Paths(), { digs: [dig] })).paths;
    expect(stored.find((path) => path.path_id === "b2")?.own?.view).toEqual({ outcome: "HELPED", scope: "MAIN_QUESTION", reason: "The jobs figure moved the main answer." });
    // A dig that wrote no view leaves the outcome's.
    const quiet = readyDig({ positionRef: "b2", rewrite: Object.freeze({ ...readyDig().rewrite!, view: null }) });
    expect(built(v2Input(await v2Paths(), { digs: [quiet] })).paths.find((path) => path.path_id === "b2")?.own?.view)
      .toEqual({ outcome: "DID_NOT_HELP", scope: "PATH", reason: "The points argued here weigh the price first." });
  });

  it("an R22 dossier has none of it: the same fields, and no path id, trust word or own words in its version", () => {
    const r22 = built(investigationInput());
    expect(dossierFieldsOf(r22).map((entry) => entry.name)).toEqual(["question", "first_debate", "follow_ups", "views", "sources"]);
    for (const path of r22.paths) expect(Object.keys(path).filter((key) => ["path_id", "trust", "own"].includes(key))).toEqual([]);
  });

  it("the report's contract: the three members only on a first-level path, own words one to four", () => {
    const base = { line: "A line.", summary: null, fate: "HELD_UP", level: 0 };
    expect(InvestigationReportPathSchema.safeParse({ ...base, path_id: "b2", trust: null, own: { own_words: ["Mine."], view: null } }).success).toBe(true);
    expect(InvestigationReportPathSchema.safeParse({ ...base, level: 1, path_id: "b2" }).success).toBe(false);
    expect(InvestigationReportPathSchema.safeParse({ ...base, path_id: "x9" }).success).toBe(false);
    expect(InvestigationReportPathSchema.safeParse({ ...base, own: { own_words: [], view: null } }).success).toBe(false);
    expect(InvestigationReportPathSchema.safeParse({ ...base, own: { own_words: ["1", "2", "3", "4", "5"], view: null } }).success).toBe(false);
  });

  it("the closing's fallback keeps the path id, trust word and own words when a runaway detail costs the rest", async () => {
    const paths = await v2Paths();
    const runaway = paths.map((path) => (path.ref === "b2" ? { ...path, points: [point("aaaaaaaa-0000-4000-8000-0000000000f2", "x".repeat(9_000))] } : path));
    const store = memoryReports();
    expect(await closeInvestigation(settingsOver({ store, vendors: team(), dossier: v2Input(runaway) }), closingOf())).toBe("RECORDED");
    const content = store.contents.get(store.records[0]!.reportId) as InvestigationReportContent;
    const b2 = content.paths.find((path) => path.path_id === "b2")!;
    expect(b2.points).toBeUndefined();
    expect(b2).toMatchObject({ level: 0, path_id: "b2", trust: "STILL_ARGUED", own: { own_words: [...OWN] } });
  });
});
