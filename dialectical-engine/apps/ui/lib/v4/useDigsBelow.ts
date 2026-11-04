"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Answer, DigLinks } from "@debateai/contract";
import type { MessageCatalog } from "../i18n/translate.js";
import type { IndexEntry } from "./digIndex.js";
import {
  belowBusy, belowSettled, belowStateOf, climbAnswersNeeded, digsBelowOf, recordsToRead, type BelowDig, type BelowState
} from "./digsBelow.js";
import type { DigLink, DigView } from "./types.js";
import { useWaitPolling } from "./useWaitPolling.js";

/*
 * Owner's screen review, 3 Nov 2026 (dig-f2): the reads behind lib/v4/digsBelow.ts. It finds the digs below this map's own
 * digs (their records, read once per change of what the page knows: a new dig of its own, a new row in the account's
 * question list, a dig started in this visit), then, every 15 s while any of them is working or climbing, reads each one
 * still moving (its state and its own rewrite) and, for a climb above its parent, the answers of the debates in between.
 * `busy` tells the page to read its own answer again every 15 s; once nothing below is moving it is false and every read
 * here stops. The checks are the shared waiting checks (rarely while the tab is hidden). Nothing is kept in the browser.
 */

/** The digs below are checked this often while one of them works or climbs (the fix's 15 seconds). */
export const BELOW_EVERY_MS = 15_000;
/** A dig below whose reads keep failing stops counting as working after this many failures in a row. */
const BELOW_READ_FAILURES = 3;

export type DigsBelowReads = Readonly<{
  readDigRecords: (runId: string) => Promise<DigLinks>;
  loadDigView: (link: DigLink) => Promise<DigView>;
  loadAnswer: (runId: string) => Promise<Answer | null>;
}>;

export type DigsBelowInput = Readonly<{
  /** The map's own debate (null: no map yet; nothing is read). */
  rootRunId: string | null;
  /** The map's own answer as the page holds it (re-read by the page while `busy`). */
  rootAnswer: Answer | null;
  /** The map's own digs (depth 1). */
  direct: readonly DigLink[];
  index: readonly IndexEntry[];
  visit: readonly DigLink[];
  catalog: MessageCatalog;
  reads: DigsBelowReads;
}>;

type Seen = Readonly<{ view: DigView | null; failures: number; state: BelowState }>;

/** Done, and its own rewrite of the path above is finished or failed: its own read cannot change any more. */
function ownRewriteSettled(view: DigView | null): boolean {
  const rewrite = view?.state === "DONE" ? view.rewrite ?? null : null;
  return rewrite !== null && rewrite.state !== "WRITING";
}

/** What makes the page look for digs below again: the map, its own digs, the question list's newest row, this visit's digs. */
function lookKey(input: DigsBelowInput): string {
  const newest = input.index[0];
  return [
    input.rootRunId ?? "",
    input.direct.map((link) => link.childRunId).join(","),
    `${String(input.index.length)}:${newest?.runId ?? ""}:${String(newest?.createdAtSequence ?? "")}`,
    input.visit.map((link) => link.childRunId).join(",")
  ].join("|");
}

export function useDigsBelow(input: DigsBelowInput): Readonly<{ busy: boolean; below: readonly BelowDig[] }> {
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });
  const key = lookKey(input);

  // ── Finding the digs below: each debate's records, level by level, read once per look ─────────────────────────────
  const [records, setRecords] = useState<ReadonlyMap<string, DigLinks | null>>(() => new Map());
  useEffect(() => {
    if (input.rootRunId === null || input.direct.length === 0) return;
    let active = true;
    const byRun = new Map<string, DigLinks | null>();
    const look = async (): Promise<void> => {
      for (;;) {
        const now = inputRef.current;
        const tree = { ...now, rootRunId: now.rootRunId ?? "", records: byRun };
        const due = recordsToRead(tree, digsBelowOf(tree));
        if (due.length === 0 || !active) break;
        await Promise.all(due.map(async (runId) => {
          try {
            byRun.set(runId, await now.reads.readDigRecords(runId));
          } catch {
            // Unreadable: the digs found by text (and this visit's) still count; the next look tries again.
            byRun.set(runId, null);
          }
        }));
      }
      if (active) setRecords(new Map(byRun));
    };
    void look();
    return () => {
      active = false;
    };
    // `key` covers every input the look depends on; the rest is read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const below = useMemo(() => (input.rootRunId === null ? [] : digsBelowOf({
    rootRunId: input.rootRunId, direct: input.direct, records, index: input.index, visit: input.visit, catalog: input.catalog
  })), [input.rootRunId, input.direct, records, input.index, input.visit, input.catalog]);
  const belowKey = below.map((dig) => dig.link.childRunId).join(",");
  const belowRef = useRef(below);
  useEffect(() => {
    belowRef.current = below;
  });

  // ── Checking them: every 15 s while one may still change this map ───────────────────────────────────────────────
  const seen = useRef<Map<string, Seen>>(new Map());
  const [busy, setBusy] = useState(false);
  useWaitPolling(async (stillWanted) => {
    const now = inputRef.current;
    const digs = belowRef.current;
    const known = seen.current;
    const due = digs.filter((dig) => {
      const last = known.get(dig.link.childRunId);
      return last === undefined || !belowSettled(last.view, last.state);
    });
    const views = await Promise.all(due.map(async (dig) => {
      // A dig whose own rewrite is settled cannot change any more: only the levels above it are read again.
      const last = known.get(dig.link.childRunId)?.view ?? null;
      if (ownRewriteSettled(last)) return { dig, view: last, failed: false };
      try {
        return { dig, view: await now.reads.loadDigView(dig.link) as DigView | null, failed: false };
      } catch {
        return { dig, view: null, failed: true };
      }
    }));
    // A climb above the dig's parent is followed through the answers of the debates in between (the map's own is the page's).
    const between = new Set<string>();
    for (const { dig, view } of views) {
      const own = view?.state === "DONE" ? view.rewrite ?? null : null;
      if (own === null || own.state === "WRITING" || own.state === "FAILED" || !own.changed) continue;
      for (const runId of climbAnswersNeeded(dig)) if (runId !== now.rootRunId) between.add(runId);
    }
    const answers = new Map<string, Answer | null>();
    await Promise.all([...between].map(async (runId) => {
      answers.set(runId, await now.reads.loadAnswer(runId));
    }));
    if (!stillWanted()) return "DONE";
    const answerOf = (runId: string): Answer | null | undefined =>
      runId === now.rootRunId ? inputRef.current.rootAnswer : answers.has(runId) ? answers.get(runId) ?? undefined : undefined;
    const at = Date.now();
    for (const { dig, view, failed } of views) {
      const last = known.get(dig.link.childRunId);
      const failures = failed ? (last?.failures ?? 0) + 1 : 0;
      const shown = failed ? last?.view ?? null : view;
      // TIME-1: a failed read keeps what was known; a dig never read stops counting once its reads keep failing.
      const state = shown === null && failures >= BELOW_READ_FAILURES ? "QUIET" : belowStateOf(dig, shown, answerOf, at);
      known.set(dig.link.childRunId, { view: shown, failures, state });
    }
    const states = digs.map((dig) => known.get(dig.link.childRunId)?.state ?? "WORKING");
    const moving = belowBusy(states);
    setBusy(moving);
    return moving ? "AGAIN" : "DONE";
  }, { everyMs: BELOW_EVERY_MS, enabled: input.rootRunId !== null && below.length > 0, restartKey: `${input.rootRunId ?? ""}|${belowKey}` });

  return { busy: busy && below.length > 0, below };
}
