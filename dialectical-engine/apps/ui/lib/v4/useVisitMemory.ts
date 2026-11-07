"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readLastVisit, recordLastVisit, storableItems } from "./accountMemory.js";
import { unseenIdsOf, visitItemsToKeep } from "./readyMoment.js";
import type { SeenSnapshot, V4Change, V4Map } from "./types.js";

/*
 * N7 (owner, 2026-10-29) and journey-f17 (V4 screen review, 3 Nov): the account keeps each debate's last visit, so "what
 * changed" starts "since your last visit" from any device, and whether a place with news was seen is kept in that same
 * last visit: an item whose news the person has not opened yet keeps the word the account had, so the next visit still
 * tells it and still marks its place, until it is opened (lib/v4/readyMoment.ts visitItemsToKeep). Nothing is kept in
 * the browser. Moved out of V4DebateClient so the page only wires it: the page keeps its baseline and news, and saves
 * through these.
 */

/** N7: after the first save of a visit, later changes of the map are saved at most this often while the page is open. */
export const VISIT_SAVE_MS = 10_000;

/** N7: the debate's last visit as the account kept it — still being read, read (null: no visit yet), or unreadable. */
export type LastVisitRead =
  | Readonly<{ status: "PENDING" }>
  | Readonly<{ status: "READ"; snapshot: SeenSnapshot | null }>
  | Readonly<{ status: "FAILED" }>;

export type VisitMemory = Readonly<{
  lastVisit: LastVisitRead;
  /**
   * Saves `items` as this debate's last visit unless they are what was saved last, the items with unseen news kept as
   * the account had them (journey-f17). Best-effort; never throws.
   */
  saveVisit: (runId: string, items: Readonly<Record<string, string>>, unseen?: ReadonlySet<string>) => void;
  /** A later save, gathered for VISIT_SAVE_MS (the newest map wins). */
  scheduleVisitSave: (runId: string, items: Readonly<Record<string, string>>) => void;
}>;

export function useVisitMemory(servedRunId: string | null): VisitMemory & Readonly<{ unseenIds: { current: ReadonlySet<string> } }> {
  const [lastVisit, setLastVisit] = useState<LastVisitRead>({ status: "PENDING" });
  /** journey-f17: what the account holds as this debate's last visit (what was read, then what this page saved). */
  const accountVisit = useRef<Readonly<Record<string, string>>>({});
  /** journey-f17: the items whose news the person has not opened yet (their places still carry the "New" dot). */
  const unseenIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    readLastVisit(servedRunId).then(
      (snapshot) => {
        if (!active) return;
        accountVisit.current = snapshot?.items ?? {};
        setLastVisit({ status: "READ", snapshot });
      },
      () => { if (active) setLastVisit({ status: "FAILED" }); }
    );
    return () => {
      active = false;
    };
  }, [servedRunId]);

  const visitSave = useRef<{ timer: number | undefined; items: Readonly<Record<string, string>> | null; sent: string | null }>(
    { timer: undefined, items: null, sent: null });
  const saveVisit = useCallback((runIdToSave: string, items: Readonly<Record<string, string>>,
    unseen: ReadonlySet<string> = unseenIds.current): void => {
    const kept = storableItems(visitItemsToKeep(items, accountVisit.current, unseen));
    const key = JSON.stringify(kept);
    if (key === visitSave.current.sent) return;
    visitSave.current.sent = key;
    accountVisit.current = kept;
    void recordLastVisit(runIdToSave, kept);
  }, []);
  const scheduleVisitSave = useCallback((runIdToSave: string, items: Readonly<Record<string, string>>): void => {
    visitSave.current.items = items;
    if (visitSave.current.timer !== undefined) return;
    visitSave.current.timer = window.setTimeout(() => {
      visitSave.current.timer = undefined;
      if (visitSave.current.items !== null) saveVisit(runIdToSave, visitSave.current.items);
    }, VISIT_SAVE_MS);
  }, [saveVisit]);
  useEffect(() => {
    // Leaving the debate (or the page) saves a change still waiting for its timer.
    if (servedRunId === null) return;
    const pendingSave = visitSave.current;
    return () => {
      if (pendingSave.timer === undefined || pendingSave.items === null) return;
      window.clearTimeout(pendingSave.timer);
      pendingSave.timer = undefined;
      saveVisit(servedRunId, pendingSave.items);
    };
  }, [servedRunId, saveVisit]);
  return { lastVisit, saveVisit, scheduleVisitSave, unseenIds };
}

/**
 * journey-f17: the places with news not opened yet are kept as unseen in the account; a place opened (or new news)
 * is saved like any change of the map. Returns the unseen item ids.
 */
export function useUnseenSaving(input: Readonly<{
  map: V4Map | null;
  news: readonly V4Change[];
  opened: ReadonlySet<string>;
  servedRunId: string | null;
  /** The map as last taken for "what changed" (null before the first complete load). */
  baseline: Readonly<{ current: Readonly<Record<string, string>> | null }>;
  visit: VisitMemory & Readonly<{ unseenIds: { current: ReadonlySet<string> } }>;
}>): ReadonlySet<string> {
  const { map, news, opened, servedRunId, baseline, visit } = input;
  const unseen = useMemo(() => (map === null ? new Set<string>() : unseenIdsOf(map, news, opened)), [map, news, opened]);
  const unseenKey = [...unseen].sort().join("|");
  const { unseenIds, scheduleVisitSave } = visit;
  const status = visit.lastVisit.status;
  useEffect(() => {
    unseenIds.current = unseen;
  });
  useEffect(() => {
    if (status !== "READ" || servedRunId === null || baseline.current === null) return;
    scheduleVisitSave(servedRunId, baseline.current);
  }, [unseenKey, status, servedRunId, scheduleVisitSave, baseline]);
  return unseen;
}
