import { describe, expect, it } from "vitest";
import { InvestigationReportPathSchema } from "../../packages/contract/src/index.js";
import { ownViewLineKey, ownViewOf, versionPathGroups, versionPathWord, type VersionPath } from "../../apps/ui/lib/v4/reportPaths.js";

/*
 * V4 start step, Task 55c (report-f4, the owner's "All in this build"; r2-20 A, r2-1 A): what the report page reads from a version's
 * stored paths. The paths come in the stored tree order (apps/runner/src/investigation-dossier.ts reportPathsOf: a first-debate path,
 * then the paths of the digs under it), so each first-level path groups with the deeper paths after it; the person's own words on a
 * path are a path debate's `own` (Task 55b) or an R22 dig's `dig.own_words` beside its verdict. Made-up texts only.
 */

/** A stored path, checked against the contract, so no fixture holds what a version cannot. */
const path = (line: string, level: number, extra: Record<string, unknown> = {}): VersionPath =>
  InvestigationReportPathSchema.parse({ line, summary: null, fate: null, level, ...extra });
const lines = (groups: ReturnType<typeof versionPathGroups>) => groups.map((group) => [group.first.line, group.dug.map((dug) => dug.line)]);

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
