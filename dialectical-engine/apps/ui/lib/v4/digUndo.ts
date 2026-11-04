import { useEffect, useSyncExternalStore } from "react";
import type { DigTarget, PendingDig } from "./types.js";

/*
 * V4 UX fixes (owner picks 3 Nov, dig-d3 B and journey-f21): the digs waiting out their 10-second Undo belong to the
 * whole V4 site, not to one page. This module keeps them in the page's memory only (no browser storage of any kind):
 * a dig pressed on the map keeps its 10 seconds and its Undo when the person opens the report, the ask page or another
 * map, and several digs can each wait with their own Undo. Nothing is sent before a dig's `sendsAt` (row D decision 1,
 * ruling N4); the sends then go one at a time, so a second dig never meets the first one's send in flight. While any dig
 * still waits, closing the tab brings up the browser's own "Leave site?" question.
 *
 * The page that pressed the dig hands in how to send it (`send`); that page may be gone by then, so the send keeps
 * working from the page's last state (useV4Ask reads everything through refs). What happened stays on the entry for the
 * note: started (with the new dig's run), refused (the plain reason), or cancelled ("Cancelled. Nothing was used.").
 */

/** Row D decision 1: the Undo window. */
export const DIG_UNDO_MS = 10_000;
/** journey-f21 / dig-f8: how long "Cancelled. Nothing was used." stays. */
export const DIG_CANCELLED_SHOWN_MS = 4_000;
/** How long the "started" note stays (as the old note did). A refused dig's reason stays until it is closed. */
export const DIG_STARTED_SHOWN_MS = 6_000;
/**
 * After this long without an answer a send's note says it is still starting. While the page that pressed it is still on
 * screen the send keeps the digs behind it waiting (its pop-ups can still be answered there, and a second send of the same
 * page would only meet the first one in flight). Once that page is gone a send that has not answered stops holding up the
 * digs behind it, and its note says the start could not be confirmed: it can hang only when its send waits for a screen
 * the gone page would have shown (the one-time data consent), and without this every later dig of the visit would wait.
 */
export const DIG_SEND_GIVE_UP_MS = 60_000;

export type DigUndoResult =
  | Readonly<{ kind: "STARTED"; childRunId: string; startedAt: string }>
  | Readonly<{ kind: "REFUSED"; message: string }>
  /** A pop-up took over, or nothing was sent: the note goes quietly. */
  | Readonly<{ kind: "STOPPED" }>;

export type DigUndoPhase = "COUNTING" | "SENDING" | "STARTED" | "REFUSED" | "CANCELLED";

/** The quota window a dig's share is of (lib/v4/money.ts SharePeriod). */
export type DigSharePeriod = "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH";

export type DigUndoEntry = Readonly<{
  id: number;
  /** The debate the dig digs into. */
  parentRunId: string;
  /** That debate and the debates above it (top first, when known): a report page of any of them waits for this dig. */
  runIds: readonly string[];
  dig: PendingDig;
  /** One waiting dig per place: the same place's dig buttons say it is starting instead of starting a second one. */
  targetKey: string;
  /** The share of today the room read said for this dig when it was pressed (null: none said). Never worked out here. */
  sharePercent: number | null;
  /**
   * public-f14 / map-f33 (owner's screen review, 3 Nov): the window that share is of, when it is not today ("of this
   * month" on Free). Absent: today, as before.
   */
  sharePeriod?: DigSharePeriod;
  /** Owner N13: false on Free, which has no Quick look / Thorough choice, so no mode word is shown. */
  showMode: boolean;
  phase: DigUndoPhase;
  /** journey-f8: the period its share is of ("today", or "this month" on Free). */
  period: "today" | "month";
  /** Being sent for longer than DIG_SEND_GIVE_UP_MS: the note says it is still starting. */
  slow: boolean;
  /** dig-f7: focus moved to its Undo once (a page it travels to does not take focus again). */
  focused: boolean;
  result: DigUndoResult | null;
}>;

export type AddDigInput = Readonly<{
  parentRunId: string;
  runIds: readonly string[];
  dig: PendingDig;
  sharePercent: number | null;
  sharePeriod?: DigSharePeriod;
  showMode: boolean;
  send: (dig: PendingDig) => Promise<DigUndoResult>;
  /** The plain line for a send that never answered ("We couldn't start this dig. Please try again."). */
  failedLine: string;
  /**
   * The line for a send given up on after its page had gone ("We couldn't confirm this dig started. …"); absent: failedLine.
   * A late answer that did start the dig still turns the note into "Started".
   */
  unconfirmedLine?: string;
  /** Whether the page that pressed the dig is still on screen (absent: treated as gone once the send hangs). */
  alive?: () => boolean;
  /** journey-f8: the period the share is of (absent: today). */
  period?: "today" | "month";
}>;

type Slot = {
  entry: DigUndoEntry;
  send: AddDigInput["send"];
  failedLine: string;
  unconfirmedLine: string;
  alive: () => boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const EMPTY: readonly DigUndoEntry[] = Object.freeze([]);
let slots: Slot[] = [];
let snapshot: readonly DigUndoEntry[] = EMPTY;
let serial = 0;
let claims = 0;
let chain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
let leaveGuard: ((event: BeforeUnloadEvent) => void) | null = null;

function waiting(entry: DigUndoEntry): boolean {
  return entry.phase === "COUNTING" || entry.phase === "SENDING";
}

/** The browser's own "Leave site?" while a dig still waits (closing the tab cancels it, so the person is asked first). */
function guardLeaving(): void {
  if (typeof window === "undefined") return;
  const any = slots.some((slot) => waiting(slot.entry));
  if (any && leaveGuard === null) {
    leaveGuard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the question only when a value is set; the words are the browser's own.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leaveGuard);
  } else if (!any && leaveGuard !== null) {
    window.removeEventListener("beforeunload", leaveGuard);
    leaveGuard = null;
  }
}

function emit(): void {
  snapshot = slots.length === 0 ? EMPTY : Object.freeze(slots.map((slot) => slot.entry));
  guardLeaving();
  for (const listener of [...listeners]) listener();
}

function slotOf(id: number): Slot | undefined {
  return slots.find((slot) => slot.entry.id === id);
}

function update(id: number, patch: Partial<DigUndoEntry>): void {
  const slot = slotOf(id);
  if (slot === undefined) return;
  slot.entry = Object.freeze({ ...slot.entry, ...patch });
  emit();
}

function drop(id: number): void {
  const slot = slotOf(id);
  if (slot === undefined) return;
  if (slot.timer !== undefined) clearTimeout(slot.timer);
  slots = slots.filter((candidate) => candidate !== slot);
  emit();
}

function dropLater(id: number, ms: number): void {
  const slot = slotOf(id);
  if (slot === undefined) return;
  if (slot.timer !== undefined) clearTimeout(slot.timer);
  slot.timer = setTimeout(() => drop(id), ms);
}

/** The 10 seconds are over: the dig is sent, after any send still in flight. */
function fire(id: number): void {
  const slot = slotOf(id);
  if (slot === undefined || slot.entry.phase !== "COUNTING") return;
  slot.timer = undefined;
  update(id, { phase: "SENDING" });
  chain = chain.then(async () => {
    if (slotOf(id) === undefined) return;
    const sent = Promise.resolve()
      .then(() => slot.send(slot.entry.dig))
      .catch((): DigUndoResult => ({ kind: "STOPPED" }));
    for (;;) {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const slowNow = new Promise<"SLOW">((resolve) => {
        watchdog = setTimeout(() => resolve("SLOW"), DIG_SEND_GIVE_UP_MS);
      });
      const first = await Promise.race([sent, slowNow]);
      clearTimeout(watchdog);
      if (first !== "SLOW") {
        settle(id, first);
        return;
      }
      // Still on its page: the send keeps its place in the line (nothing is called "couldn't start" while it may still
      // answer, and the next dig never meets this one in flight); the note says it is still starting.
      if (!slot.alive()) break;
      if (slotOf(id) !== undefined && !slot.entry.slow) update(id, { slow: true });
    }
    if (slotOf(id) !== undefined) update(id, { phase: "REFUSED", result: { kind: "REFUSED", message: slot.unconfirmedLine } });
    // A late answer still counts when it did start the dig (the map finds it in any case, from the account's records).
    void sent.then((late) => {
      if (late.kind === "STARTED" && slotOf(id) !== undefined) settle(id, late);
    });
  });
}

function settle(id: number, result: DigUndoResult): void {
  if (slotOf(id) === undefined) return;
  if (result.kind === "STOPPED") {
    drop(id);
    return;
  }
  update(id, { phase: result.kind, result });
  if (result.kind === "STARTED") dropLater(id, DIG_STARTED_SHOWN_MS);
}

/** Which place a dig waits on: a path, open questions, or a group's picks (one dig of picks per path, owner Q-D1). */
export function digTargetKey(target: DigTarget): string {
  if (target.kind === "path") return `path:${target.path.id}`;
  if (target.kind === "open") return `open:${target.questions.map((question) => question.id).join(",")}`;
  return `picks:${target.path?.id ?? "root"}`;
}

/** The group a dig hangs under on the map (a path id, or "root" for the main question's own open questions). */
export function digGroupOf(target: DigTarget): string {
  if (target.kind === "path") return target.path.id;
  if (target.kind === "picks") return target.path?.id ?? "root";
  return target.questions[0]?.pathId ?? "root";
}

/** Starts a dig's 10 seconds. Returns its id (for Undo). */
export function addDig(input: AddDigInput): number {
  serial += 1;
  const id = serial;
  const entry: DigUndoEntry = Object.freeze({
    id,
    parentRunId: input.parentRunId,
    runIds: Object.freeze([...new Set([...input.runIds, input.parentRunId])]),
    dig: input.dig,
    targetKey: digTargetKey(input.dig.target),
    sharePercent: input.sharePercent,
    ...(input.sharePeriod === undefined ? {} : { sharePeriod: input.sharePeriod }),
    showMode: input.showMode,
    phase: "COUNTING",
    period: input.period ?? "today",
    slow: false,
    focused: false,
    result: null
  });
  const slot: Slot = {
    entry,
    send: input.send,
    failedLine: input.failedLine,
    unconfirmedLine: input.unconfirmedLine ?? input.failedLine,
    alive: input.alive ?? (() => false),
    timer: undefined
  };
  slots = [...slots, slot];
  slot.timer = setTimeout(() => fire(id), Math.max(0, input.dig.sendsAt - Date.now()));
  emit();
  return id;
}

/** Undo: a dig still counting is never sent. Returns false when it was too late (already being sent). */
export function undoDig(id: number): boolean {
  const slot = slotOf(id);
  if (slot === undefined || slot.entry.phase !== "COUNTING") return false;
  if (slot.timer !== undefined) clearTimeout(slot.timer);
  slot.timer = undefined;
  update(id, { phase: "CANCELLED" });
  dropLater(id, DIG_CANCELLED_SHOWN_MS);
  return true;
}

/** Closes a note that no longer waits (started, refused, cancelled). A dig that still waits is never dropped here. */
export function dismissDig(id: number): void {
  const slot = slotOf(id);
  if (slot === undefined || waiting(slot.entry)) return;
  drop(id);
}

export function markDigFocused(id: number): void {
  const slot = slotOf(id);
  if (slot === undefined || slot.entry.focused) return;
  update(id, { focused: true });
}

/** The dig waiting (counting or being sent) on this place of this debate, or null. */
export function waitingDigFor(entries: readonly DigUndoEntry[], parentRunId: string | null, target: DigTarget): DigUndoEntry | null {
  if (parentRunId === null) return null;
  const key = digTargetKey(target);
  return entries.find((entry) => waiting(entry) && entry.parentRunId === parentRunId && entry.targetKey === key) ?? null;
}

/** The digs that still wait and belong to this debate (or to a debate under it, when the dig said so). */
export function waitingDigsOf(entries: readonly DigUndoEntry[], runId: string): readonly DigUndoEntry[] {
  const id = runId.toLowerCase();
  return entries.filter((entry) => waiting(entry) && entry.runIds.some((candidate) => candidate.toLowerCase() === id));
}

/** Resolves once no dig of this debate waits any more (sent, refused or undone). Ruling F7: the report waits for it. */
export function waitForDigs(runId: string): Promise<void> {
  if (waitingDigsOf(snapshot, runId).length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const listener = (): void => {
      if (waitingDigsOf(snapshot, runId).length > 0) return;
      listeners.delete(listener);
      resolve();
    };
    listeners.add(listener);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): readonly DigUndoEntry[] => snapshot;
const getServerSnapshot = (): readonly DigUndoEntry[] => EMPTY;
const getClaimed = (): boolean => claims > 0;
const getServerClaimed = (): boolean => false;

/** Every dig note of the site now, oldest first (outside React). */
export function readDigUndo(): readonly DigUndoEntry[] {
  return snapshot;
}

/** Every dig note of the site, oldest first. */
export function useDigUndo(): readonly DigUndoEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * journey-d3 / dig-f16: a page that draws the dig notes in its own bottom stack claims them, so the site-wide holder
 * (app/v4/layout.tsx) does not draw them a second time.
 */
export function useClaimDigNotes(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, [active]);
}

export function useDigNotesClaimed(): boolean {
  return useSyncExternalStore(subscribe, getClaimed, getServerClaimed);
}

/** Tests only: forgets every dig and its timer (the module lives as long as the page). */
export function resetDigUndo(): void {
  for (const slot of slots) if (slot.timer !== undefined) clearTimeout(slot.timer);
  slots = [];
  claims = 0;
  chain = Promise.resolve();
  emit();
}
