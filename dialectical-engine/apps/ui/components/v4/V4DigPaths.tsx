"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StartCombineMember, StartCombineResponse, StartPaths } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { digNewPickRefusal, digOverlaps, digPairKey, digPathPlanOf, digPathPlanWithPicks, digStartPaths } from "@/lib/v4/digPathPlan";
import {
  combineMembersKey, pathPlanCombineMembers, pathPlanOwnWords, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanRefusal,
  type PlanPath
} from "@/lib/v4/pathPlan";
import { EMPTY_DRAFT, pickPointsOf, pickRefusal, type V4PlanTier } from "@/lib/v4/suggestions";
import type { DigTarget, ReadingLevel, V4DigDraft, V4DigPick } from "@/lib/v4/types";
import { START_PAGE_WAITS } from "@/lib/v4/useStartPaths";
import { startRefusalLine } from "./V4StartCard";
import { V4StartCombineBar } from "./V4StartCombineBar";
import { V4StartList, type StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 79 (spec 2026-11-03 §4.4; dig-f35 "Do not build it twice", r2-1, r2-22, choose-d3; owner answers Q18 A
 * and Q19 A): a path debate's dig picks as path rows, under the picks. With two picks or more that are not open questions, the
 * dig's choosing part lists them as the very rows of the choosing step (V4StartList and its words: clean rows; ⋯ with "Combine
 * with…", Split apart, Rewrite, Move up / Move down and Remove; no drag grip on a phone, where ⋯ holds Move up and Move down).
 *  - Combining asks the start step's combine for one question that covers the picks, for this dig ({kind: "DIG", parent_run_id});
 *    the path shows "Writing one question that covers them…" until it lands ("Combined. …"), or keeps the joined words when no
 *    words come. Words already written for the same picks are kept in the page's memory, so combining them again asks nothing.
 *  - Each change can be undone (Undo, Ctrl/Cmd+Z outside a text box) until the dig is sent; then the shared Undo note,
 *    unchanged (lib/v4/digUndo.ts). Remove takes the pick out of the dig (its box is unticked), and Undo brings it back.
 *  - "Combine · Keep apart" (answer Q18): when two picks on different rows rest on one point of the map, one suggestion at a
 *    time, "“Seasonal lulls?” and “2030s gap?” overlap. Dig them as one?". Combine is the same as ⋯'s; Keep apart hides that pair
 *    for this draft. Code finds it: no AI call, nothing counted.
 *  - A dig looks into at most 7 paths (Free 3): a change that would leave a pick off the list, and one more pick, are refused
 *    with "A dig looks into up to 7 paths. Combine two of your picks, or remove one." (draft wording).
 * useDigPaths holds the plan beside the page's draft (it follows every pick added or taken away), makes the combine calls, and
 * gives what a dig sends (`startPathsFor`). Nothing is kept in the browser.
 */

const NARROW_QUERY = "(max-width: 600px)";
/** A placeholder's stand-in while a line is cut into its words (never in a catalogue line). */
const MARK = "\u0000";
const NO_PAIRS: ReadonlySet<string> = new Set();

/** A phone's width (the choosing card's 600 px rule): no drag grip, the controls under the title, Rewrite in ⋯. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(NARROW_QUERY);
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return narrow;
}

/** The person is typing: Ctrl/Cmd+Z there is the text's own undo. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select") !== null) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Why a change to the dig's rows was refused, in one line: the choosing step's words, and the dig's own for PATHS_FULL. */
export function digPathsRefusalLine(refusal: PathPlanRefusal, plan: PathPlan, catalog: MessageCatalog, action?: PathPlanAction): string {
  return refusal === "PATHS_FULL" ? t(catalog, "v4.digPaths.full") : startRefusalLine(refusal, plan, null, catalog, action === undefined ? {} : { action });
}

export type V4DigPathsProps = Readonly<{
  plan: PathPlan;
  /** The two picks (their keys) the overlap suggestion is about; null: none to show. */
  overlap: Readonly<{ a: string; b: string }> | null;
  /** The paths whose one question is being written (their keys). */
  writing: ReadonlySet<string>;
  /** One change to the plan; its refusal, or null. */
  onAction(action: PathPlanAction): PathPlanRefusal | null;
  onKeepApart(a: string, b: string): void;
  catalog: MessageCatalog;
  locale: string;
}>;

/** The row holding a pick. */
const rowOf = (plan: PathPlan, pickKey: string): PlanPath | undefined =>
  plan.paths.find((path) => path.viewpoints.some((viewpoint) => viewpoint.key === pickKey));

/** "“{a}” and “{b}” overlap. Dig them as one?" with each row's title its own span (the AIs' words marked, the person's never). */
function overlapLine(catalog: MessageCatalog, first: PlanPath, second: PlanPath): ReactNode[] {
  const parts = [first, second];
  return t(catalog, "v4.digPaths.overlap", { a: `${MARK}0${MARK}`, b: `${MARK}1${MARK}` }).split(MARK).map((piece, at) => {
    if (at % 2 === 0) return piece;
    const path = parts[Number(piece)]!;
    return <span key={at} dir="auto" data-ai-generated={path.wording !== "PERSON" ? "true" : undefined}>{path.title}</span>;
  });
}

/** The dig's path rows: the overlap suggestion, the combine line, the rows, what a change says, and Undo. */
export function V4DigPaths(props: V4DigPathsProps) {
  const { plan, overlap, writing, onAction, onKeepApart, catalog, locale } = props;
  const narrow = useNarrow();
  const [notice, setNotice] = useState<string | null>(null);
  const planNow = useRef(plan);
  planNow.current = plan;

  const dispatch = (action: PathPlanAction): PathPlanRefusal | null => {
    const refusal = onAction(action);
    // A change of the person's: the older notice no longer says what just happened (picking to combine is no change).
    if (refusal === null && action.type !== "SELECT" && action.type !== "UNSELECT") setNotice(null);
    return refusal;
  };
  const onRefusal = (refusal: PathPlanRefusal, action: PathPlanAction): void => {
    setNotice(digPathsRefusalLine(refusal, planNow.current, catalog, action));
  };

  // What a combine's answer says: its words landed, or the joined words stay.
  const before = useRef(plan);
  useEffect(() => {
    const was = new Map(before.current.paths.map((path) => [path.key, path] as const));
    before.current = plan;
    if (plan.paths.some((path) => path.wording === "COMBINED" && was.get(path.key)?.wording === "WRITING")) {
      setNotice(t(catalog, "v4.start.notice.combined"));
    } else if (plan.paths.some((path) => path.wording === "FALLBACK" && was.get(path.key)?.wording === "WRITING")) {
      setNotice(t(catalog, "v4.start.notice.combineFailed"));
    }
  }, [plan, catalog]);

  // Ctrl/Cmd+Z undoes the last change while the rows show; in a text box it is the text's own undo.
  const undoKey = useRef<() => boolean>(() => false);
  undoKey.current = (): boolean => {
    if (planNow.current.undo.length === 0) return false;
    dispatch({ type: "UNDO" });
    return true;
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "z" || typing(event.target)) return;
      if (undoKey.current()) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const parts: StartPlanProps = { plan, catalog, locale, dispatch, onRefusal, share: null, narrow };
  const first = overlap === null ? undefined : rowOf(plan, overlap.a);
  const second = overlap === null ? undefined : rowOf(plan, overlap.b);
  /** [Combine]: the same as ⋯'s "Combine with…" on the two rows. */
  const combineOverlap = (one: PlanPath, other: PlanPath): void => {
    if (plan.selected.length > 0) dispatch({ type: "CLEAR_SELECTION" });
    dispatch({ type: "SELECT", key: one.key });
    dispatch({ type: "SELECT", key: other.key });
    const action: PathPlanAction = { type: "COMBINE_SELECTED" };
    const refusal = dispatch(action);
    if (refusal === null) return;
    dispatch({ type: "CLEAR_SELECTION" });
    onRefusal(refusal, action);
  };
  return (
    <div className="v4StartRows v4DigPaths" aria-busy={writing.size > 0 ? "true" : undefined}>
      {overlap === null || first === undefined || second === undefined || first === second ? null : (
        <ul className="v4StartSuggest v4DigOverlap" aria-label={t(catalog, "v4.start.suggest.label")}>
          <li className="v4StartSuggestion">
            <p className="v4StartSuggestionLine">{overlapLine(catalog, first, second)}</p>
            <div className="v4StartSuggestionActions">
              <button type="button" className="v4Btn" onClick={() => combineOverlap(first, second)}>{t(catalog, "v4.digPaths.overlapCombine")}</button>
              <button type="button" className="v4Btn" onClick={() => onKeepApart(overlap.a, overlap.b)}>{t(catalog, "v4.digPaths.keepApart")}</button>
            </div>
          </li>
        </ul>
      )}
      <V4StartCombineBar {...parts} />
      <V4StartList {...parts} />
      {notice === null ? null : <div className="v4StartNotice" role="status"><p>{notice}</p></div>}
      {plan.undo.length > 0 ? (
        <div className="v4StartTools">
          <button type="button" className="v4Btn v4StartUndo" onClick={() => { dispatch({ type: "UNDO" }); }}>{t(catalog, "v4.start.undo")}</button>
        </div>
      ) : null}
    </div>
  );
}

export type DigPathsInput = Readonly<{
  /** The parent is a path debate (digPathPlan.ts isPathsParent); false: today's dig, with no plan. */
  pathsParent: boolean;
  /** The debate dug (the combine's context); null: none served yet. */
  parentRunId: string | null;
  freePlan: boolean;
  planTier: V4PlanTier;
  readingLevel: ReadingLevel;
  draft: V4DigDraft;
  draftRef: Readonly<{ current: V4DigDraft }>;
  commitDraft(draft: V4DigDraft): void;
  /** "Picks cleared · Undo" is offered: the picks may come back, so their rows are kept until the offer ends. */
  holding: boolean;
}>;

export type DigPaths = Readonly<{
  /** The plan of the draft's picks on a path debate; null: today's dig, or no pick that makes a path. */
  plan: PathPlan | null;
  /** How many paths the dig looks into, for its share (answer Q19: digShareLine(room, paths)); undefined: today's single share. */
  pathCount: number | undefined;
  /** PATHS_FULL when one more pick would give the dig more paths than it may send; else null. */
  newPickRefusal: "PATHS_FULL" | null;
  /** What the rows draw (two picks or more that make paths); null: no rows. */
  rows: Omit<V4DigPathsProps, "catalog" | "locale"> | null;
  /** The paths a dig of `target` sends: the plan's, when it digs exactly the draft's picks; else undefined (today's dig). */
  startPathsFor(target: DigTarget): StartPaths | undefined;
  /**
   * At the send, once the Undo window after the press is over, the paths `startPathsFor` gave, with the AI's words
   * for a row that was still being written at the press when they have come meanwhile (with its reference); else as given.
   */
  settledPaths(paths: StartPaths): StartPaths;
  /** The person's own words on the rows (paths they wrote), for the crisis check at the press. */
  ownWords(): readonly string[];
}>;

type Written = Readonly<{ title: string; question: string; combineRef: string }>;

/** The draft's path plan on a path debate: follows the picks, takes the rows' changes, and asks the combines. */
export function useDigPaths(input: DigPathsInput): DigPaths {
  const { pathsParent, freePlan, planTier, draft, draftRef, commitDraft, holding } = input;
  /** The plan as the person last shaped it (null: as the picks give it). */
  const [shaped, setShaped] = useState<PathPlan | null>(null);
  const [keptApart, setKeptApart] = useState<ReadonlySet<string>>(NO_PAIRS);
  const pathPicks = useMemo(() => draft.picks.filter((pick) => pick.kind !== "OPEN"), [draft.picks]);
  const empty = pathPicks.length === 0;
  const plan = useMemo((): PathPlan | null => {
    if (!pathsParent || empty) return null;
    return shaped === null || shaped.freePlan !== freePlan ? digPathPlanOf(draft.picks, freePlan) : digPathPlanWithPicks(shaped, draft.picks);
  }, [pathsParent, empty, shaped, draft.picks, freePlan]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const live = useRef({ parentRunId: input.parentRunId, readingLevel: input.readingLevel });
  live.current = { parentRunId: input.parentRunId, readingLevel: input.readingLevel };
  /** Picks the rows took out of the dig (Remove), with their place in the draft, so Undo can bring them back. */
  const removed = useRef(new Map<string, Readonly<{ pick: V4DigPick; at: number }>>());
  /** The AI's words for picks put together, by their members (kept for this page). */
  const written = useRef(new Map<string, Written>());
  /** Paths given at a press while a row was still being written: each path's members key (null: not being written). */
  const pressedWriting = useRef(new WeakMap<StartPaths, readonly (string | null)[]>());
  /** The combines being asked, by path key: the members they were asked for. */
  const asking = useRef(new Map<string, Readonly<{ members: string; call: AbortController }>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const one of asking.current.values()) one.call.abort();
      asking.current.clear();
    };
  }, []);

  // A new draft (no pick left that makes a path, once "Picks cleared" can no longer bring them back; a dig sent): its own rows and pairs.
  useEffect(() => {
    if (!empty || holding) return;
    setShaped(null);
    setKeptApart(NO_PAIRS);
    removed.current.clear();
  }, [empty, holding]);

  /** The plan as it is now, from a change or a combine's answer. */
  const settle = useCallback((next: PathPlan): void => {
    planRef.current = next;
    setShaped(next);
  }, []);

  /** A combine's answer, for the path still being written with the members its call was asked for (else nothing). */
  const land = useCallback((key: string, members: string, action: PathPlanAction): void => {
    const now = planRef.current;
    if (!mounted.current || now === null) return;
    const path = now.paths.find((one) => one.key === key && one.wording === "WRITING");
    if (path === undefined || combineMembersKey(pathPlanCombineMembers(path)) !== members) return;
    const next = pathPlanReduce(now, action).plan;
    if (next !== now) settle(next);
  }, [settle]);

  /** One combine call for one path being written; no words, a failure or the wait keep the joined words (FALLBACK). */
  const ask = useCallback((key: string, members: readonly StartCombineMember[], membersKey: string, parentRunId: string): void => {
    const call = new AbortController();
    asking.current.set(key, { members: membersKey, call });
    let done = false;
    const answered = (answer: StartCombineResponse | null): void => {
      if (done) return;
      done = true;
      clearTimeout(wait);
      if (asking.current.get(key)?.call === call) asking.current.delete(key);
      if (answer !== null && answer.source === "AI") {
        const words: Written = { title: answer.title, question: answer.question, combineRef: answer.combine_ref };
        written.current.set(membersKey, words);
        land(key, membersKey, { type: "COMBINE_WRITTEN", key, ...words });
        return;
      }
      land(key, membersKey, { type: "COMBINE_FAILED", key });
    };
    const wait = setTimeout(() => {
      call.abort();
      answered(null);
    }, START_PAGE_WAITS.combineMs);
    contractClient.startPathCombine({
      context: { kind: "DIG", parent_run_id: parentRunId }, reading_level: live.current.readingLevel, members: [...members]
    }, call.signal).then(answered, () => answered(null));
  }, [land]);

  // Each path being written gets one combine call for its picks; words already written for the same picks land at once, with no call.
  useEffect(() => {
    const parentRunId = live.current.parentRunId;
    if (plan === null || parentRunId === null) return;
    for (const path of plan.paths) {
      if (path.wording !== "WRITING") continue;
      const members = pathPlanCombineMembers(path);
      const membersKey = combineMembersKey(members);
      const words = written.current.get(membersKey);
      if (words !== undefined) land(path.key, membersKey, { type: "COMBINE_WRITTEN", key: path.key, ...words });
      else if (asking.current.get(path.key)?.members !== membersKey) ask(path.key, members, membersKey, parentRunId);
    }
  }, [plan, land, ask]);

  const onAction = useCallback((action: PathPlanAction): PathPlanRefusal | null => {
    const now = planRef.current;
    if (now === null) return null;
    const result = pathPlanReduce(now, action);
    if (result.refusal !== null) return result.refusal;
    // A dig keeps every pick it holds on its list: a change that would fold one into "+ N more" is refused.
    if (result.folded.length > 0) return "PATHS_FULL";
    if (result.plan === now) return null;
    let next = result.plan;
    const draftNow = draftRef.current;
    let picks = draftNow.picks;
    // Remove: the pick leaves the dig (its box unticked), kept with its place so Undo brings it back.
    const leaving = new Set(next.more.flatMap((path) => path.viewpoints.map((viewpoint) => viewpoint.key)));
    if (next.more.length > 0) next = { ...next, more: [] };
    if (leaving.size > 0) {
      picks.forEach((pick, at) => { if (leaving.has(pick.key)) removed.current.set(pick.key, { pick, at }); });
      picks = picks.filter((pick) => !leaving.has(pick.key));
    }
    // Undo: a pick the rows took out comes back, in its place, when the plan brought back holds it (and the draft still takes it).
    if (action.type === "UNDO") {
      const holds = new Set(next.paths.flatMap((path) => path.viewpoints.map((viewpoint) => viewpoint.key)));
      const back = [...removed.current.entries()].filter(([key]) => holds.has(key) && !picks.some((pick) => pick.key === key))
        .sort((one, other) => one[1].at - other[1].at);
      for (const [key, { pick, at }] of back) {
        if (pickRefusal({ group: draftNow.group, picks }, pick.group, planTier) !== null) continue;
        picks = [...picks.slice(0, at), pick, ...picks.slice(at)];
        removed.current.delete(key);
      }
    }
    if (picks !== draftNow.picks) commitDraft(picks.length === 0 ? EMPTY_DRAFT : { group: draftNow.group, picks });
    settle(digPathPlanWithPicks(next, picks));
    return null;
  }, [draftRef, commitDraft, planTier, settle]);

  const onKeepApart = useCallback((a: string, b: string): void => {
    setKeptApart((was) => new Set([...was, digPairKey(a, b)]));
  }, []);

  // Answer Q18: the first pair of picks on different rows that rest on one point, one at a time.
  const overlap = useMemo(() => {
    if (plan === null) return null;
    return digOverlaps(pathPicks, pickPointsOf, keptApart).find((pair) => {
      const first = rowOf(plan, pair.a);
      const second = rowOf(plan, pair.b);
      return first !== undefined && second !== undefined && first !== second;
    }) ?? null;
  }, [plan, pathPicks, keptApart]);
  const writing = useMemo((): ReadonlySet<string> =>
    new Set((plan?.paths ?? []).filter((path) => path.wording === "WRITING").map((path) => path.key)), [plan]);
  const rows = useMemo(() => (plan === null || pathPicks.length < 2 ? null : { plan, overlap, writing, onAction, onKeepApart }),
    [plan, pathPicks.length, overlap, writing, onAction, onKeepApart]);

  const startPathsFor = useCallback((target: DigTarget): StartPaths | undefined => {
    const now = planRef.current;
    if (now === null || target.kind !== "picks") return undefined;
    const drafted = new Set(draftRef.current.picks.map((pick) => pick.key));
    if (target.picks.length !== drafted.size || !target.picks.every((pick) => drafted.has(pick.key))) return undefined;
    const sent = digPathPlanWithPicks(now, target.picks);
    if (sent.paths.length === 0) return undefined;
    const paths = digStartPaths(sent);
    // Independent review (wave 16): a row still being written goes as its joined words unless the AI's words come before the
    // send (settledPaths); its members key is kept with these paths for that.
    const writingKeys = paths.paths.map((_path, at) => {
      const row = sent.paths[at]!;
      return row.wording === "WRITING" ? combineMembersKey(pathPlanCombineMembers(row)) : null;
    });
    if (writingKeys.some((key) => key !== null)) pressedWriting.current.set(paths, writingKeys);
    return paths;
  }, [draftRef]);
  const settledPaths = useCallback((paths: StartPaths): StartPaths => {
    const keys = pressedWriting.current.get(paths);
    if (keys === undefined) return paths;
    let landed = false;
    const settled = paths.paths.map((path, at) => {
      const key = keys[at] ?? null;
      const words = key === null ? undefined : written.current.get(key);
      if (words === undefined) return path;
      landed = true;
      return { ...path, title: words.title, question: words.question, combine_ref: words.combineRef };
    });
    return landed ? { ...paths, paths: settled } : paths;
  }, []);
  const ownWords = useCallback((): readonly string[] => (planRef.current === null ? [] : pathPlanOwnWords(planRef.current)), []);

  return {
    plan,
    pathCount: plan === null || plan.paths.length === 0 ? undefined : plan.paths.length,
    newPickRefusal: digNewPickRefusal(plan),
    rows,
    startPathsFor,
    settledPaths,
    ownWords
  };
}
