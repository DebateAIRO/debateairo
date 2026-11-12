"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RunProjection } from "@debateai/contract";
import { V4UndoNote, type V4UndoNoteState } from "@/components/v4/V4UndoNote";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { DIG_CANCELLED_SHOWN_MS } from "@/lib/v4/digUndo";
import { takeContinueHandOff } from "@/lib/v4/failedRun";
import { continueStopped, limitLine } from "@/lib/v4/money";
import { START_UNDO_MS } from "@/lib/v4/startUndo";

/*
 * V4 start step, Task 57g (the owner's 7 Nov answers: "we need to have a way to continue where it broke, and not charge the customer
 * again"; his card "Button on the stopped page"): the press of "Continue where it stopped" on the page of a question that did not finish.
 * It continues the SAME debate on the same page, after the site's Undo window, exactly as Start's (Task 76b: START_UNDO_MS and Start's
 * words in the shared note, V4UndoNote): Undo (or Esc) cancels and nothing is ever sent; after the window, one POST /v1/runs/{id}/continue
 * (the month pause's call, lib/v4/money.ts continueStopped). CONTINUING: the page reads the debate again, so it shows the running debate
 * (its wait or progress screen, as after Start). NOT_CONTINUABLE: the stopped page stays and the button goes (the debate is read again).
 * NO_ROOM: the usual quota words (the page's room read: "You've used what today allows. …"; when it does not say the person's window holds,
 * the month pause's "We couldn't continue this debate. Please try again."). Anything else: that same line, and the button can be pressed
 * again. Nothing navigates. Arriving from the ask page's "Change the question" with the words left as they were (failedRun.ts
 * handOffContinue), the press starts by itself once, when the first read says the debate can continue. Nothing is kept in the browser.
 */

type Press =
  | Readonly<{ phase: "COUNTING" | "SENDING"; sendsAt: number; serial: number }>
  | Readonly<{ phase: "CANCELLED"; serial: number }>
  | Readonly<{ phase: "REFUSED"; line: string; serial: number }>;

const NOTE_STATE: Readonly<Record<Press["phase"], V4UndoNoteState>> = { COUNTING: "counting", SENDING: "sending", CANCELLED: "cancelled", REFUSED: "done" };

export type StoppedContinue = Readonly<{
  /** The button is offered (the read says `continuable`, a question's page, and no press was refused as not continuable). */
  offered: boolean;
  press: () => void;
  /** What a press shows under the button (null: nothing). */
  note: ReactNode;
}>;

export function useStoppedContinue(input: Readonly<{
  runId: string;
  /** The debate as last read (null: not read yet, or not a run read). */
  run: RunProjection | null;
  /** The first read answered, whatever it said. */
  loaded: boolean;
  /** This page is a dig's own (no Continue there yet: the owner's open question on a dig's own try). */
  dig: boolean;
  /** The page's room read, for the quota words of a refusal for no room. */
  room: AskRoom | null;
  /** Reads the debate again at once. */
  reread: () => void;
  catalog: MessageCatalog;
  locale: string;
}>): StoppedContinue {
  const { runId, run, loaded, dig, room, reread, catalog, locale } = input;
  const failed = run !== null && run.state === "FAILED";
  const [gone, setGone] = useState(false);
  const [press, setPress] = useState<Press | null>(null);
  const offered = failed && run.continuable === true && !dig && !gone;

  const latest = useRef({ offered, room, reread, catalog, locale });
  useEffect(() => {
    latest.current = { offered, room, reread, catalog, locale };
  });
  const pressRef = useRef<Press | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serial = useRef(0);
  const mounted = useRef(true);
  const show = useCallback((next: Press | null): void => {
    pressRef.current = next;
    setPress(next);
  }, []);
  const clearTimer = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  // Once the debate is no longer stopped (it runs again) the press is over; a later stop starts afresh.
  useEffect(() => {
    if (failed) return;
    clearTimer();
    setGone(false);
    show(null);
  }, [failed, show, clearTimer]);

  const send = useCallback(async (sending: Press & { phase: "COUNTING" }): Promise<void> => {
    if (pressRef.current !== sending) return;
    show({ phase: "SENDING", sendsAt: sending.sendsAt, serial: sending.serial });
    const outcome = await continueStopped(runId);
    if (!mounted.current) return;
    const now = latest.current;
    if (outcome.kind === "CONTINUING") {
      // The note says "Starting…" until the read shows the debate running (the effect above then ends the press).
      now.reread();
      return;
    }
    if (outcome.kind === "NOT_CONTINUABLE") {
      setGone(true);
      show(null);
      now.reread();
      return;
    }
    const held = outcome.kind === "NO_ROOM" ? limitLine(now.room, now.locale) : null;
    show({
      phase: "REFUSED",
      line: held === null ? t(now.catalog, "v4.money.continueFailed") : t(now.catalog, held.key, held.values),
      serial: sending.serial
    });
  }, [runId, show]);

  const begin = useCallback((): void => {
    const current = pressRef.current;
    if (!latest.current.offered || current?.phase === "COUNTING" || current?.phase === "SENDING") return;
    clearTimer();
    serial.current += 1;
    const counting = { phase: "COUNTING" as const, sendsAt: Date.now() + START_UNDO_MS, serial: serial.current };
    show(counting);
    timer.current = setTimeout(() => {
      timer.current = null;
      void send(counting);
    }, START_UNDO_MS);
  }, [send, show, clearTimer]);

  const undo = useCallback((): void => {
    const current = pressRef.current;
    if (current?.phase !== "COUNTING") return;
    clearTimer();
    const cancelled = { phase: "CANCELLED" as const, serial: current.serial };
    show(cancelled);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pressRef.current === cancelled) show(null);
    }, DIG_CANCELLED_SHOWN_MS);
  }, [show, clearTimer]);

  // Arriving from "Change the question" with the words unchanged: the hand-off is taken with the first read (so it is used once, whatever
  // that read says), and the press starts by itself only when that read says the debate can continue.
  const handOffTaken = useRef(false);
  useEffect(() => {
    if (!loaded || handOffTaken.current) return;
    handOffTaken.current = true;
    if (takeContinueHandOff(runId, Date.now()) && offered) begin();
  }, [loaded, offered, runId, begin]);

  const note = press === null ? null : (
    <V4UndoNote
      key={press.serial}
      state={NOTE_STATE[press.phase]}
      label={t(catalog, "v4.start.undo.noteNoShare")}
      sendsAt={press.phase === "COUNTING" || press.phase === "SENDING" ? press.sendsAt : 0}
      durationMs={START_UNDO_MS}
      onUndo={undo}
      undoLabel={t(catalog, "v4.start.undo")}
      stillLine={t(catalog, "v4.undo.still")}
      announce={t(catalog, "v4.start.undo.announce")}
      sendingLine={t(catalog, "v4.ask.starting")}
      confirmedLine={t(catalog, "v4.start.undo.done")}
      {...(press.phase === "REFUSED" ? { doneLine: press.line, doneAnnounce: press.line } : {})}
      returnFocus={() => document.querySelector<HTMLElement>(".v4DebFailedContinue")}
    />
  );
  return { offered, press: begin, note };
}
