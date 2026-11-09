import { describe, expect, it } from "vitest";
import { InvestigationReportPathSchema } from "../../packages/contract/src/index.js";
import { apartFromQuestion, ownViewLineKey, ownViewOf, versionPathGroups, versionPathWord, type VersionPath } from "../../apps/ui/lib/v4/reportPaths.js";

/*
 * V4 start step, Task 55c (report-f4, the owner's "All in this build"; r2-20 A, r2-1 A): what the report page reads from a version's
 * stored paths. The paths come in the stored tree order (apps/runner/src/investigation-dossier.ts reportPathsOf: a first-debate path,
 * then the paths of the digs under it), so each first-level path groups with the deeper paths after it; the person's own words on a
 * path are a path debate's `own` (Task 55b) or an R22 dig's `dig.own_words` beside its verdict. Made-up texts only.
 */

/** A stored path, checked against the contract, so no fixture holds what a version cannot. */
const path = (line: string, level: number, extra: Record<string, unknown> = {}): VersionPath =>
  InvestigationReportPathSchema.parse({ line, summary: null, fate: null, level, ...extra });
/** Each group as [its first-level line, the lines dug later]; the main question's own group (Task 55f) has no line of its own. */
const lines = (groups: ReturnType<typeof versionPathGroups>) => groups.map((group) => [group.first?.line ?? null, group.dug.map((dug) => dug.line)]);

describe("versionPathGroups", () => {
  it("puts each first-level path with the deeper paths after it, in the stored tree order", () => {
    const groups = versionPathGroups([path("a", 0), path("b", 1), path("c", 2), path("d", 0), path("e", 1)]);
    expect(lines(groups)).toEqual([["a", ["b", "c"]], ["d", ["e"]]]);
  });

  it("makes a deeper path before any first-level path its own group", () => {
    expect(lines(versionPathGroups([path("x", 1), path("a", 0)]))).toEqual([["x", []], ["a", []]]);
    expect(lines(versionPathGroups([path("x", 1), path("y", 2), path("a", 0), path("b", 1)]))).toEqual([["x", []], ["y", []], ["a", ["b"]]]);
  });

  it("gives no group for no paths, and keeps the stored objects", () => {
    expect(versionPathGroups([])).toEqual([]);
    const first = path("a", 0);
    const dug = path("b", 1);
    const [group] = versionPathGroups([first, dug]);
    expect(group!.first).toBe(first);
    expect(group!.dug[0]).toBe(dug);
  });
});

/*
 * V4 start step, Task 55f: a dig on the MAIN QUESTION comes after the last path's own digs in the stored order. Each row such a dig adds
 * carries `under: "QUESTION"` (the contract's last, optional member), and so does each row dug from it (review of Task 55f), so the
 * page lists those rows after every path in a group of their own. A version written before Task 55f has no mark and reads as it always did.
 */
describe("Task 55f: a dig on the main question", () => {
  const onQuestion = (line: string, level = 1) => path(line, level, { under: "QUESTION" });

  it("the contract keeps the mark, last and optional, on a dig's path only", () => {
    const marked = InvestigationReportPathSchema.parse({ line: "q", summary: null, fate: null, level: 1,
      dig: { picks: ["Is it worth it at all?"], own_words: [], view: null, changed: [] }, under: "QUESTION" });
    expect(Object.keys(marked).at(-1)).toBe("under");
    expect(Object.keys(InvestigationReportPathSchema.shape).at(-1)).toBe("under");
    expect(InvestigationReportPathSchema.safeParse({ line: "q", summary: null, fate: null, level: 1 }).success).toBe(true);
    expect(InvestigationReportPathSchema.safeParse({ line: "q", summary: null, fate: null, level: 1, under: "PATH" }).success).toBe(false);
    // A first-level path is the first debate's own, never dug from the question.
    expect(InvestigationReportPathSchema.safeParse({ line: "q", summary: null, fate: null, level: 0, under: "QUESTION" }).success).toBe(false);
  });

  it("lists the digs on the question, with the paths dug from them, after every path in a group of their own", () => {
    const groups = versionPathGroups([path("a", 0), path("b", 1), path("d", 0), path("e", 1), onQuestion("q1"), onQuestion("q1x", 2), onQuestion("q2"),
      onQuestion("r1")]);
    expect(lines(groups)).toEqual([["a", ["b"]], ["d", ["e"]], [null, ["q1", "q1x", "q2", "r1"]]]);
  });

  it("a dig the walk did not reach, after them and unmarked, keeps today's place under the last path, at any level", () => {
    const groups = versionPathGroups([path("a", 0), path("e", 1), onQuestion("q1"), onQuestion("q1x", 2), path("lost", 2), path("lost too", 1)]);
    expect(lines(groups)).toEqual([["a", ["e", "lost", "lost too"]], [null, ["q1", "q1x"]]]);
    // Review of Task 55f: deeper than the dig on the question and right after it, a lost dig is still not dug from it (the paths dug
    // from it carry the mark too); only the mark decides.
    expect(apartFromQuestion([path("a", 0), onQuestion("q1"), path("lost", 2)]))
      .toEqual({ tree: [path("a", 0), path("lost", 2)], question: [onQuestion("q1")] });
    expect(apartFromQuestion([path("a", 0), onQuestion("q1"), onQuestion("q1x", 2), path("lost", 3)]))
      .toEqual({ tree: [path("a", 0), path("lost", 3)], question: [onQuestion("q1"), onQuestion("q1x", 2)] });
  });

  it("a version written before Task 55f has no mark: the dig on the question folds under the last path, as before", () => {
    expect(lines(versionPathGroups([path("a", 0), path("d", 0), path("e", 1), path("q1", 1), path("q1x", 2)])))
      .toEqual([["a", []], ["d", ["e", "q1", "q1x"]]]);
    expect(apartFromQuestion([path("a", 0), path("e", 1)])).toEqual({ tree: [path("a", 0), path("e", 1)], question: [] });
  });

  it("with no first-level path at all, the digs on the question still make their own group", () => {
    expect(lines(versionPathGroups([onQuestion("q1"), onQuestion("q1x", 2)]))).toEqual([[null, ["q1", "q1x"]]]);
  });
});

describe("ownViewOf", () => {
  it("reads a path debate's own words and their verdict (Task 55b)", () => {
    const stored = path("b2", 0, { path_id: "b2", trust: "STILL_ARGUED",
      own: { own_words: ["Cernavodă jobs matter", "Grid costs fall"], view: { outcome: "HELPED", scope: "MAIN_QUESTION", reason: "A made-up reason." } } });
    expect(ownViewOf(stored)).toEqual({ words: ["Cernavodă jobs matter", "Grid costs fall"], outcome: "HELPED", scope: "MAIN_QUESTION", reason: "A made-up reason." });
  });

  it("keeps a path debate's own words with no verdict yet as words only", () => {
    const stored = path("b2", 0, { own: { own_words: ["Cernavodă jobs matter"], view: null } });
    expect(ownViewOf(stored)).toEqual({ words: ["Cernavodă jobs matter"], outcome: null, scope: "PATH", reason: null });
  });

  it("reads an R22 dig's own words beside the dig's verdict, on the path", () => {
    const dug = path("A made-up dug path.", 1, { dig: { picks: ["A suggestion."], own_words: ["My own angle"],
      view: { outcome: "DID_NOT_HELP", reason: "A made-up reason." }, changed: ["A made-up change."] } });
    expect(ownViewOf(dug)).toEqual({ words: ["My own angle"], outcome: "DID_NOT_HELP", scope: "PATH", reason: "A made-up reason." });
    const unsettled = path("A made-up dug path.", 1, { dig: { picks: [], own_words: ["My own angle"], view: null, changed: [] } });
    expect(ownViewOf(unsettled)).toEqual({ words: ["My own angle"], outcome: null, scope: "PATH", reason: null });
  });

  it("is null on a path with no words of the person's", () => {
    expect(ownViewOf(path("a", 0))).toBeNull();
    expect(ownViewOf(path("a", 0, { path_id: "b1", trust: "SURE" }))).toBeNull();
    expect(ownViewOf(path("A made-up dug path.", 1, { dig: { picks: ["A suggestion."], own_words: [], view: null, changed: ["A made-up change."] } })))
      .toBeNull();
  });
});

describe("ownViewLineKey", () => {
  it("picks the approved verdict line by outcome and scope, one line for NOT_SETTLED, none with no verdict", () => {
    const view = (outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED" | null, scope: "PATH" | "MAIN_QUESTION") =>
      ({ words: ["w"], outcome, scope, reason: outcome === null ? null : "r" });
    expect(ownViewLineKey(view("HELPED", "PATH"))).toBe("v4.view.HELPED.PATH");
    expect(ownViewLineKey(view("HELPED", "MAIN_QUESTION"))).toBe("v4.view.HELPED.MAIN_QUESTION");
    expect(ownViewLineKey(view("DID_NOT_HELP", "PATH"))).toBe("v4.view.DID_NOT_HELP.PATH");
    expect(ownViewLineKey(view("DID_NOT_HELP", "MAIN_QUESTION"))).toBe("v4.view.DID_NOT_HELP.MAIN_QUESTION");
    expect(ownViewLineKey(view("NOT_SETTLED", "PATH"))).toBe("v4.view.NOT_SETTLED");
    expect(ownViewLineKey(view("NOT_SETTLED", "MAIN_QUESTION"))).toBe("v4.view.NOT_SETTLED");
    expect(ownViewLineKey(view(null, "PATH"))).toBeNull();
  });
});

describe("versionPathWord", () => {
  it("is a path debate's stored word when the version keeps one, else the peer's evidence rule (r2-20)", () => {
    // An earlier version keeps no points, but a path debate's first-level path keeps its word (Task 55b's review fix).
    expect(versionPathWord(path("b1", 0, { path_id: "b1", trust: "SURE_FOR_CASE" }))).toBe("SURE_FOR_CASE");
    // The evidence rule: the weakest word that held; a fallen path "Didn't hold"; no checked point, no word.
    const points = [{ text: "p", trust: "SURE", side: "for", sources: [] }, { text: "q", trust: "STILL_ARGUED", side: null, sources: [] }];
    expect(versionPathWord(path("a", 0, { points }))).toBe("STILL_ARGUED");
    expect(versionPathWord(path("a", 0, { fate: "FELL" }))).toBe("DIDNT_HOLD");
    expect(versionPathWord(path("a", 1))).toBeNull();
    // A stored "no word yet" leaves the word to the evidence.
    expect(versionPathWord(path("b1", 0, { trust: null, points }))).toBe("STILL_ARGUED");
  });
});
