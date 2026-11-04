"use client";

import { useCallback, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { recordDig } from "./accountMemory.js";
import { crisisWordsOf, digQuestion, digTargetQuestions, ownWords } from "./askText.js";
import {
  addDig, DIG_UNDO_MS, digTargetKey, readDigUndo, undoDig as undoWaitingDig, useDigUndo, waitingDigFor, type DigUndoEntry,
  type DigUndoResult
} from "./digUndo.js";
import type { V4DigQuota } from "./digQuota.js";
import { firstByOf } from "./mapLooks.js";
import { sharePeriodOf } from "./money.js";
import { askParentOf, placesOf, removePick } from "./suggestions.js";
import type { DigLink, DigMode, DigTarget, PendingDig, V4DigDraft, V4Map } from "./types.js";
import { rememberSentDig } from "./useSentDigs.js";
import type { useV4Ask, V4AskOutcome } from "./useV4Ask.js";

/*
 * The map page's dig queue (dig-d3 B, owner pick 3 Nov; moved out of V4DebateClient so the page only wires it): a dig
 * pressed on the map waits out its 10 seconds in the site-wide list of lib/v4/digUndo.ts, keeps its Undo when the person
 * digs again or opens another page, and is sent one at a time. Nothing is sent before `sendsAt` (row D decision 1, N4).
 *
 * The screens a dig may need are asked AT THE PRESS, before its 10 seconds start, while this page is on screen and can
 * show them (the review of 4 Nov; dig-f9, owner's screen review 3 Nov), with useV4Ask's own pieces (no second crisis text):
 *  - V, 2026-09-30: the person's own views in a dig are their words (ASK-4: never the AI-written text around them); words
 *    of a person in crisis get useV4Ask's help screen at once, and nothing waits or is sent;
 *  - V, 2026-09-29: the one-time data consent opens at the press; the 10 seconds start only once it is given, and "No"
 *    starts nothing. A second press on the same place while it is open does nothing more.
 * The question check's screen cannot move to the press: it is the server's answer to a sent dig (ruling N4), so it may still
 * open after the 10 seconds; it then names the dig it is about ("About your dig on “Mostly renewables”:", `aboutOf`).
 * A send that still meets a screen after the page has gone says so in its note ("open the map and dig again") instead of
 * vanishing without a word. Memory only: nothing is kept in the browser's storage.
 */

/** Decision A: a dig started in this tab, in memory only (gone on reload). */
export type VisitDig = Readonly<{ link: DigLink; parentQuestion: string }>;

/**
 * The digs started in this tab. Module-level so they survive moving between V4 pages without a reload: the dig's own
 * page then knows when it started and where it came from.
 */
export const startedThisVisit = new Map<string, VisitDig>();

type DigAsk = Pick<ReturnType<typeof useV4Ask>, "submit" | "ensureConsent" | "offerCrisisHelp">;

const STOPPED: DigUndoResult = Object.freeze({ kind: "STOPPED" });

export type DigQueue = Readonly<{
  /** Every dig note of the site (digs in their 10 seconds, being sent, or just settled). */
  waitingDigs: readonly DigUndoEntry[];
  /** Puts a dig in its 10 seconds (a dig pressed here, or a failed dig tried again, dig-f12). */
  queueDig: (dig: PendingDig) => void;
  /** A dig of this place, in the page's Quick look / Thorough choice. */
  startDig: (target: DigTarget) => void;
  undoDig: (id: number) => void;
}>;

export function useDigQueue(input: Readonly<{
  map: V4Map | null;
  canDig: boolean;
  servedRunId: string | null;
  servedQuestionLine: string | null;
  /** The debates above this one (top first): their report pages wait for a dig sent from here too (ruling F7). */
  aboveRunIds: readonly string[];
  /**
   * The dig buttons' quota (lib/v4/useDigQuota.ts), read at the press: the pressed button's own share (dig-f5), the window
   * it is of (public-f14), and whether new digs wait for a reset (dig-f11: then nothing starts).
   */
  digQuotaRef: Readonly<{ current: Readonly<{ quota: V4DigQuota; room: AskRoom | null }> }>;
  planTier: "free" | "premium";
  /** The Quick look / Thorough choice a new dig is sent with (owner N13: always quick on Free). */
  sentDigMode: DigMode;
  draftRef: Readonly<{ current: V4DigDraft }>;
  commitDraft: (draft: V4DigDraft) => void;
  setVisitLinks: Dispatch<SetStateAction<readonly DigLink[]>>;
  ask: DigAsk;
  /** A dig of this debate started counting (dig-f23: it ends the "Picks cleared" offer). */
  onCounting: () => void;
  /** dig-f9: the line the question check's screen opens with when it answers this dig ("About your dig on “…”:"). */
  aboutOf: (target: DigTarget) => ReactNode;
  /** report-d2: the report waits for digs or is written, so digging rests (its buttons say why); nothing starts. */
  digsRest: boolean;
  catalog: MessageCatalog;
  locale: string;
}>): DigQueue {
  const {
    map, canDig, servedRunId, servedQuestionLine, aboveRunIds, digQuotaRef, planTier, sentDigMode, draftRef, commitDraft,
    setVisitLinks, ask, onCounting, aboutOf, digsRest, catalog, locale
  } = input;
  const restRef = useRef(digsRest);
  useEffect(() => {
    restRef.current = digsRest;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const waitingDigs = useDigUndo();

  const send = async (dig: PendingDig, parentRunId: string, parentQuestionLine: string): Promise<DigUndoResult> => {
    let outcome: V4AskOutcome;
    try {
      // ASK-4: a dig carries AI-written text, so it is sent as a dig (no client crisis pop-up on AI words). W3-4: with its
      // parent (the debate it digs, the places, the mode and the picks as sent).
      // dig-f9: the question check's screen can only come with the server's answer, 10 seconds after the click, so it
      // names the dig it is about.
      outcome = await ask.submit(digQuestion(dig.target, parentQuestionLine, catalog, locale), dig.mode, "dig",
        askParentOf(parentRunId, dig.target, dig.mode), undefined, aboutOf(dig.target));
    } catch {
      outcome = { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
    }
    if (outcome.kind === "STARTED") {
      const startedAt = new Date().toISOString();
      const link: DigLink = {
        parentRunId,
        childRunId: outcome.runId,
        openQuestionIds: placesOf(dig.target),
        questions: digTargetQuestions(dig.target),
        mode: dig.mode,
        startedAt,
        // dig-f20: the person's own words are never marked as AI text (kept for this visit; the dig's answer tells later).
        firstBy: firstByOf(dig.target)
      };
      // Kept for this visit even when the page has gone meanwhile (Decision A: memory only), and in the account (N11:
      // which debate it came from, where on the map, its mode). Best-effort: without the record it is found by text.
      startedThisVisit.set(link.childRunId, { link, parentQuestion: ownWords(parentQuestionLine) });
      // dig-f12: "Try this dig again" digs exactly what was sent (memory only, lib/v4/useSentDigs.ts).
      rememberSentDig(link.childRunId, { target: dig.target, mode: dig.mode });
      void recordDig(link);
      const started: DigUndoResult = { kind: "STARTED", childRunId: link.childRunId, startedAt };
      if (!mounted.current) return started;
      // Shown at once (as working); the dig loop reads its real state straight away.
      setVisitLinks((previous) => [...previous.filter((known) => known.childRunId !== link.childRunId), link]);
      // The picks it was made of are taken off the tray (picks made during the send stay).
      const sentKeys = new Set(dig.target.kind === "picks"
        ? dig.target.picks.map((pick) => pick.key)
        : dig.target.kind === "open" ? dig.target.questions.map((question) => `open:${question.id}`) : []);
      if (sentKeys.size > 0) {
        commitDraft([...sentKeys].reduce((left, key) => removePick(left, key), draftRef.current));
      }
      // dig-f10: the person stays where they are; the note says it started, with [See it].
      return started;
    }
    if (outcome.kind === "REFUSED") return { kind: "REFUSED", message: outcome.message };
    // A pop-up took over: on this page it is on screen, so the note goes quietly. With the page gone nobody saw it, so
    // the note says the dig did not start and how to start it again (never a silent loss).
    return mounted.current ? STOPPED : { kind: "REFUSED", message: t(catalog, "v4.dig.notStartedAway") };
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // One consent question at a time: a second press while it is open waits for the same answer.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  const consentAsk = useRef<Promise<boolean> | null>(null);
  const askConsent = useCallback((): Promise<boolean> => {
    const pending = consentAsk.current;
    if (pending !== null) return pending;
    const asked = Promise.resolve().then(() => askRef.current.ensureConsent()).catch(() => false);
    consentAsk.current = asked;
    void asked.then(() => {
      if (consentAsk.current === asked) consentAsk.current = null;
    });
    return asked;
  }, []);

  /** The places whose consent is open right now (a second press there does nothing more). */
  const checking = useRef(new Set<string>());

  const queueDig = useCallback((dig: PendingDig): void => {
    // W3-4: nothing is dug from the deepest level (the page offers no button there; this holds it). report-d2: nor while
    // the report waits for digs or is written (its buttons rest).
    if (map === null || !canDig || servedRunId === null || servedQuestionLine === null || digsRest) return;
    // One waiting dig per place: its buttons say it is starting, with its Undo, instead of starting a second one. The live
    // list is read (not this render's copy), so a quick second press never starts a second dig.
    if (waitingDigFor(readDigUndo(), servedRunId, dig.target) !== null) return;
    const key = digTargetKey(dig.target);
    if (checking.current.has(key)) return;
    // dig-f11: while new digs wait for a reset, nothing starts (the buttons say so, greyed, with the reset time).
    if (digQuotaRef.current.quota.waitLine !== null) return;
    const parentRunId = servedRunId;
    const parentQuestionLine = servedQuestionLine;
    // V, 2026-09-30: the person's own views read as a person in crisis: useV4Ask's help screen now, and no dig. The words
    // checked are exactly the ones the send reads (askParentOf, crisisWordsOf).
    if (askRef.current.offerCrisisHelp(crisisWordsOf("dig", "", askParentOf(parentRunId, dig.target, dig.mode)))) return;
    // V, 2026-09-29 (dig-f9): the one-time consent, asked while this page can show it; the 10 seconds start from its yes.
    const delay = Math.max(0, dig.sendsAt - Date.now());
    checking.current.add(key);
    void askConsent().then((agreed) => {
      checking.current.delete(key);
      if (!agreed) return;
      // The same holds after the answer: one waiting dig per place, nothing while new digs wait or the report is written.
      if (restRef.current || waitingDigFor(readDigUndo(), parentRunId, dig.target) !== null) return;
      const quota = digQuotaRef.current;
      if (quota.quota.waitLine !== null) return;
      const sharePeriod = sharePeriodOf(quota.room);
      addDig({
        parentRunId,
        runIds: aboveRunIds,
        dig: { ...dig, sendsAt: Date.now() + delay },
        // dig-f5 / dig-f8: the note repeats the share of the button that was pressed, of its own window (public-f14:
        // Free's is of this month; the server may name another, map-f33).
        sharePercent: quota.quota.share(dig.target),
        ...(sharePeriod === "PERSON_DAY" ? {} : { sharePeriod }),
        showMode: planTier !== "free",
        // journey-f8: Free's share is of this month.
        period: sharePeriod === "PERSON_MONTH" ? "month" : "today",
        // The page may be gone by then: the send works from its last state (useV4Ask reads through refs).
        send: (waiting) => sendRef.current(waiting, parentRunId, parentQuestionLine),
        failedLine: t(catalog, "v4.dig.failed"),
        unconfirmedLine: t(catalog, "v4.dig.unconfirmed"),
        alive: () => mounted.current
      });
    });
  }, [map, canDig, servedRunId, servedQuestionLine, aboveRunIds, digQuotaRef, planTier, catalog, askConsent, digsRest]);

  const startDig = useCallback((target: DigTarget): void => {
    queueDig({ target, mode: sentDigMode, sendsAt: Date.now() + DIG_UNDO_MS });
  }, [queueDig, sentDigMode]);

  const undoDig = useCallback((id: number): void => {
    undoWaitingDig(id);
  }, []);

  // dig-f23: a dig being started ends the "Picks cleared" offer (its note would sit beside the dig's own note).
  const newestCounting = waitingDigs.reduce((newest, entry) =>
    (entry.phase === "COUNTING" && entry.parentRunId === servedRunId && entry.id > newest ? entry.id : newest), 0);
  useEffect(() => {
    if (newestCounting > 0) onCounting();
  }, [newestCounting, onCounting]);

  // A dig sent while this map was not on screen (the person had opened another page) shows once it has started.
  useEffect(() => {
    if (servedRunId === null) return;
    const started = waitingDigs.flatMap((entry) => {
      const result = entry.result;
      if (entry.parentRunId !== servedRunId || result?.kind !== "STARTED") return [];
      const visit = startedThisVisit.get(result.childRunId);
      return visit === undefined ? [] : [visit.link];
    });
    if (started.length === 0) return;
    setVisitLinks((previous) => {
      const known = new Set(previous.map((link) => link.childRunId));
      const fresh = started.filter((link) => !known.has(link.childRunId));
      return fresh.length === 0 ? previous : [...previous, ...fresh];
    });
  }, [waitingDigs, servedRunId, setVisitLinks]);

  return { waitingDigs, queueDig, startDig, undoDig };
}
