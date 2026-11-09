"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContractHttpError, savedQuestionDocFits, type ContractClient, type SavedQuestionDoc } from "@debateai/contract";
import { SAVE_PAUSE_MS } from "./savedQuestion.js";

/*
 * V4 start step, Task 76f (saved-questions spec 2026-11-04 §3.3; owner cards "When saved" and "How long"; answers S1 A, S2 A,
 * S3 A): the save queue of the question the account keeps. Once the page says saving may go (`enabled`: signed in, the start
 * step on the site, the consent given, step 2 shown and its check passed, no language offer waiting), the first save is one
 * POST of the document as it stands; then each change goes as one PUT of the whole document, at once for the moments the page
 * names (`immediate`: the list landing, a late merge, a combined question written or given up) and otherwise SAVE_PAUSE_MS
 * after the last change. One request at a time: a change made meanwhile waits, and the newest document goes next. Nothing is
 * kept in the browser: the id lives in the page (and its history entry), the document on the server.
 */

/**
 * OFF: never on for this question. IDLE: on, with nothing to send yet. PENDING: a change waits (its pause, a request before it,
 * or a box too long to send). SAVING: a request is out. SAVED: the newest document landed. FAILED: the last one did not land
 * (offline, a passing fault, crisis words): the next change tries again, and coming back online too. STOPPED: saving stopped
 * for this page (`stopped` says why).
 */
export type SaveState = "OFF" | "IDLE" | "PENDING" | "SAVING" | "SAVED" | "FAILED" | "STOPPED";
/** Why saving stopped: changed in another window (or gone), signed out, refused for any other reason, or 20 already kept. */
export type SaveStop = "ELSEWHERE" | "SIGNED_OUT" | "OFF" | "FULL";

/** What a refused or failed save means: a stop with its reason, or a failure (retried on `online` only when it may pass by itself). */
function failureOf(error: unknown): Readonly<{ stop: SaveStop }> | Readonly<{ retryOnline: boolean }> {
  if (!(error instanceof ContractHttpError)) return { retryOnline: false };
  const code = error.serverCode;
  if (error.status === 401) return { stop: "SIGNED_OUT" };
  if (error.status === 404 || code === "SAVED_QUESTION_REVISION") return { stop: "ELSEWHERE" };
  if (code === "SAVED_QUESTIONS_FULL") return { stop: "FULL" };
  if (code === "SAVED_QUESTIONS_OFF" || code === "SAVED_QUESTION_INVALID" || code === "SAVED_QUESTION_TOO_LARGE"
    || code === "SAVED_QUESTIONS_UNAVAILABLE" || error.status === 403) {
    return { stop: "OFF" };
  }
  // Offline (no answer) or a passing server fault; anything else (crisis words, 422) waits for the next change.
  return { retryOnline: error.status === 0 || error.status >= 500 };
}

type Wanted = Readonly<{ doc: SavedQuestionDoc; text: string }>;

export function useSavedQuestion(input: Readonly<{
  enabled: boolean;
  /** The question the page holds (its first save's answer, or one picked up or reopened); null: none yet. */
  savedId: string | null;
  /** The revision the page read with `savedId` when it took the question from the account (Pick up, a reload); null otherwise. */
  revision?: number | null;
  doc: SavedQuestionDoc | null;
  /** Bumps on the list landing, a late merge, COMBINE_WRITTEN or COMBINE_FAILED: the document goes at once. */
  immediate: number;
  client: ContractClient;
  onSavedId(id: string): void;
}>): Readonly<{ state: SaveState; stopped: SaveStop | null; flush(): Promise<"SAVED" | "NOT_SAVED"> }> {
  const latest = useRef(input);
  latest.current = input;
  const [state, setState] = useState<SaveState>("OFF");
  const [stopped, setStopped] = useState<SaveStop | null>(null);
  const held = useRef({
    /** Each question the page takes starts a new generation; an answer for an older one changes nothing. */
    generation: 0,
    id: null as string | null,
    revision: 0,
    /** The text of the document the account holds now (null: none known). */
    landed: null as string | null,
    wanted: null as Wanted | null,
    flight: null as Promise<void> | null,
    again: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    /** A question taken from the account: the page's first document of it is what the account holds (nothing to send). */
    baseline: false,
    firstTried: false,
    retryOnline: false,
    stopped: null as SaveStop | null,
    enabled: false
  });

  const clearTimer = useCallback((): void => {
    const box = held.current;
    if (box.timer !== null) clearTimeout(box.timer);
    box.timer = null;
  }, []);

  const send = useCallback((): void => {
    const box = held.current;
    if (box.stopped !== null) return;
    if (box.flight !== null) {
      box.again = true;
      return;
    }
    clearTimer();
    const wanted = box.wanted;
    if (wanted === null) return;
    if (wanted.text === box.landed) {
      setState("SAVED");
      return;
    }
    // A box (or a page) too large is not sent until it fits; the page already says the box is too long.
    if (savedQuestionDocFits(wanted.doc) !== "FITS") {
      box.retryOnline = false;
      setState("FAILED");
      return;
    }
    const generation = box.generation;
    const id = box.id;
    const client = latest.current.client;
    box.firstTried = true;
    box.again = false;
    setState("SAVING");
    const request = (async () => id === null ? client.createSavedQuestion(wanted.doc)
      : client.saveSavedQuestion(id, box.revision, wanted.doc))();
    box.flight = request.then((written) => {
      if (box.generation !== generation) return;
      box.flight = null;
      box.id = written.id;
      box.revision = written.revision;
      box.landed = wanted.text;
      if (id === null) latest.current.onSavedId(written.id);
      if (box.again) send();
      else setState(box.wanted?.text === box.landed ? "SAVED" : "PENDING");
    }, (error: unknown) => {
      if (box.generation !== generation) return;
      box.flight = null;
      const failure = failureOf(error);
      if ("stop" in failure) {
        clearTimer();
        box.stopped = failure.stop;
        setStopped(failure.stop);
        setState("STOPPED");
        return;
      }
      box.retryOnline = failure.retryOnline;
      if (box.again) send();
      else setState("FAILED");
    });
  }, [clearTimer]);

  // The page took another question from the account (Pick up, a reload), or let this one go (Start): a fresh queue.
  useEffect(() => {
    const box = held.current;
    if (input.savedId === box.id) return;
    clearTimer();
    box.generation += 1;
    box.id = input.savedId;
    box.revision = latest.current.revision ?? 0;
    box.landed = null;
    box.wanted = null;
    box.flight = null;
    box.again = false;
    box.baseline = input.savedId !== null;
    box.firstTried = false;
    box.retryOnline = false;
    box.stopped = null;
    setStopped(null);
    setState(input.savedId === null ? "OFF" : "SAVED");
  }, [input.savedId, clearTimer]);

  // Each change of the document while saving may go: the first save at once (and the first after saving comes back on, so a new
  // reading of the same question goes by PUT right after its check), otherwise after the pause.
  const text = useMemo(() => input.doc === null ? null : JSON.stringify(input.doc), [input.doc]);
  useEffect(() => {
    const box = held.current;
    const cameOn = input.enabled && !box.enabled;
    box.enabled = input.enabled;
    if (!input.enabled || box.stopped !== null) return;
    if (input.doc === null || text === null) {
      setState((now) => now === "OFF" ? "IDLE" : now);
      return;
    }
    if (box.wanted?.text === text) {
      // Saving came back on with the document unchanged (Back, then Next with the same words; a refused Start): a change still
      // waiting goes now.
      if (cameOn && box.wanted.text !== box.landed && box.timer === null) send();
      return;
    }
    box.wanted = { doc: input.doc, text };
    if (box.baseline) {
      box.baseline = false;
      box.landed = text;
      setState("SAVED");
      return;
    }
    if (text === box.landed && box.flight === null) {
      clearTimer();
      setState("SAVED");
      return;
    }
    if (cameOn || (box.id === null && !box.firstTried)) {
      send();
      return;
    }
    setState("PENDING");
    clearTimer();
    box.timer = setTimeout(() => {
      box.timer = null;
      send();
    }, SAVE_PAUSE_MS);
  }, [input.enabled, input.doc, text, send, clearTimer]);

  // The moments that go at once.
  const lastImmediate = useRef(input.immediate);
  useEffect(() => {
    if (lastImmediate.current === input.immediate) return;
    lastImmediate.current = input.immediate;
    if (input.enabled) send();
  }, [input.immediate, input.enabled, send]);

  // Back online: a save that failed because the page was offline (or the server for a moment) goes again.
  useEffect(() => {
    const up = (): void => {
      const box = held.current;
      if (box.retryOnline && box.flight === null && box.stopped === null) send();
    };
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, [send]);

  // Leaving the page sends nothing more (a change still waiting is what the leave question is about).
  useEffect(() => () => {
    clearTimer();
    held.current.generation += 1;
  }, [clearTimer]);

  /**
   * The latest change, now: the pause is cut short and the request waits for the one already out. Only a question the account
   * already keeps is saved here (a first save still on its way is waited for); "SAVED" when the account holds the page's latest.
   * Nothing waits after it (Start, a reload and Pick up follow): a change it could not send goes with the next change, or when
   * saving comes back on.
   */
  const flush = useCallback(async (): Promise<"SAVED" | "NOT_SAVED"> => {
    const box = held.current;
    for (let round = 0; round < 4; round += 1) {
      if (box.flight !== null) {
        await box.flight;
        continue;
      }
      if (box.stopped !== null || box.id === null || box.wanted === null || box.wanted.text === box.landed) break;
      send();
      if (box.flight === null) break;
    }
    clearTimer();
    return box.stopped === null && box.id !== null && (box.wanted === null || box.wanted.text === box.landed) ? "SAVED" : "NOT_SAVED";
  }, [send, clearTimer]);

  return { state, stopped, flush };
}
