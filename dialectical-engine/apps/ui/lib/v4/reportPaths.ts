import type { TrustWord } from "@debateai/contract";
import { pathTrustWord } from "../report/pathTrust.js";
import type { FinishedReportVersion } from "./load.js";

/*
 * V4 start step, Task 55c (report-f4, the owner's "All in this build"; r2-20 A, r2-1 A): what the report page reads from a
 * version's stored paths, by code alone (no AI, nothing guessed).
 *  - The paths come in the stored tree order (apps/runner/src/investigation-close.ts: "nested to level 10 in tree order"; the
 *    dossier's reportPathsOf lists a first-debate path, then the paths of the digs under it). So each first-level path groups
 *    with the deeper paths after it, the paths dug later, which the page folds under it ("Updated by your dig"). A deeper path
 *    before any first-level path has no row to sit under: it is its own group.
 *  - "Your point of view": the person's own words on a path and the verdict on them. On a path debate's first-level path they
 *    are its `own` (Task 55b: the newest dig's verdict on that path, else its answer so far's; null before any). On a dig's
 *    first path they are the dig's own words beside the dig's verdict (R22's, which has no scope: it is about the path). With
 *    no verdict stored the page shows the words and that they were weighed as theirs, and no verdict line.
 *  - A row's one trust word (r2-20): a path debate's first-level path keeps its answer so far's word (Task 55b), the word its
 *    map shows, which an earlier version keeps too; any other path's word is the peer's evidence rule (lib/report/pathTrust.ts).
 */

/** One path as a finished version keeps it (an earlier version keeps only its line, summary, fate, level, and Task 55b's members). */
export type VersionPath = NonNullable<FinishedReportVersion["paths"]>[number];
/** A first-level path and the paths dug later under it, in the stored order. */
export type ReportPathGroup = Readonly<{ first: VersionPath; dug: readonly VersionPath[] }>;
/** The person's own words on a path, and the verdict on them (outcome null: none stored yet; then `reason` is null too). */
export type OwnView = Readonly<{
  words: readonly string[];
  outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED" | null;
  scope: "PATH" | "MAIN_QUESTION";
  reason: string | null;
}>;

/** Each first-level path with the deeper paths after it; a deeper path before any first-level path is its own group. */
export function versionPathGroups(paths: readonly VersionPath[]): readonly ReportPathGroup[] {
  const groups: Array<{ first: VersionPath; dug: VersionPath[] }> = [];
  for (const path of paths) {
    const open = groups.at(-1);
    if (path.level > 0 && open !== undefined && open.first.level === 0) open.dug.push(path);
    else groups.push({ first: path, dug: [] });
  }
  return Object.freeze(groups.map((group) => Object.freeze({ first: group.first, dug: Object.freeze(group.dug) })));
}

/** The person's own words on this path with the verdict on them, or null when the path holds none of theirs. */
export function ownViewOf(path: VersionPath): OwnView | null {
  if (path.own !== undefined) {
    const view = path.own.view;
    return Object.freeze({ words: path.own.own_words, outcome: view?.outcome ?? null, scope: view?.scope ?? "PATH", reason: view?.reason ?? null });
  }
  if (path.dig !== undefined && path.dig.own_words.length > 0) {
    const view = path.dig.view;
    return Object.freeze({ words: path.dig.own_words, outcome: view?.outcome ?? null, scope: "PATH", reason: view?.reason ?? null });
  }
  return null;
}

/** The approved verdict line's key (draft 5.3): by outcome and scope, one line for NOT_SETTLED; null with no verdict stored. */
export function ownViewLineKey(view: OwnView): string | null {
  if (view.outcome === null) return null;
  return view.outcome === "NOT_SETTLED" ? "v4.view.NOT_SETTLED" : `v4.view.${view.outcome}.${view.scope}`;
}

/** A row's one trust word: the stored word of a path debate's first-level path when it has one, else the evidence rule. */
export function versionPathWord(path: VersionPath): TrustWord | null {
  return path.trust ?? pathTrustWord(path.fate, (path.points ?? []).map((point) => point.trust));
}
