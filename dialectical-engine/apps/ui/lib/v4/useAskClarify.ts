"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AskClarifyEarlier, AskClarifyResponse } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { ASK_CLARIFY_PAGE_WAIT_MS } from "@/lib/v4/clarifyWait";

/**
 * The page stops waiting after this and shows no questions: the API's own bound plus 2 s. V4 start step, Task 76h: the value
 * lives in lib/v4/clarifyWait.ts with the other wait times (Task 91c's sitting moves them together); re-exported here, where
 * the page's tests read it.
 */
export { ASK_CLARIFY_PAGE_WAIT_MS };

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });

/**
 * One clarifying call: its line, the earlier wording's questions and answers it was sent with (Task 76g; null: none), when the
 * wait for that line began, its answer (NONE on any failure or after the page's wait; null once stopped, which nobody shows), and
 * how to stop it.
 */
type ClarifyCall = Readonly<{
  question: string;
  earlier: AskClarifyEarlier | null;
  startedAt: number;
  answer: Promise<AskClarifyResponse | null>;
  stop: () => void;
}>;

/** Asks once for `question`. The whole wait is bounded: whatever the network does, the page carries on. */
function clarifyCall(question: string, earlier: AskClarifyEarlier | null, startedAt: number,
  settled: (call: ClarifyCall, answer: AskClarifyResponse) => void): ClarifyCall {
  const controller = new AbortController();
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const asked = new Promise<AskClarifyResponse>((resolve) => {
    giveUp = setTimeout(() => {
      resolve(NONE);
      controller.abort();
    }, ASK_CLARIFY_PAGE_WAIT_MS);
    contractClient.clarifyAsk({ question_line: question, ...(earlier === null ? {} : { earlier }) }, controller.signal).then(resolve, () => resolve(NONE));
  });
  const call: ClarifyCall = {
    question,
    earlier,
    startedAt,
    answer: asked.then((answer) => {
      clearTimeout(giveUp);
      // Task 76h: a call stopped by "Try again" (or a new line, or leaving) is never shown, so a fresh one is never undone.
      if (stopped) return null;
      settled(call, answer);
      return answer;
    }),
    stop: () => {
      stopped = true;
      clearTimeout(giveUp);
      controller.abort();
    }
  };
  return call;
}

/**
 * Decision 29: what step 2 shows for the question. Nothing here can hold the page up: Start works while it waits, and any failure is no questions.
 * V4 start step, Task 70b (read-f14, read-d2): `question` is the line read at Next, never the step-2 box; it is asked at once whenever it
 * changes (Back, new words, Next), and a line this page already holds an answer for, or is still asking about, is not asked again (Back
 * and Next with the same words). Nothing typed on step 2 is read again. `mayCall` false (the consent was refused, or the words read as a person in crisis): no
 * call, no questions.
 * Task 76h (ask-d3, read-f23): `startedAt` is when the wait for this line began (null when not waiting), so the page's wait lines follow
 * it; `retry()` ("Try again") stops this page's waiting request and asks the same line again (the server joins the reading still running
 * or answers its cached reply), and the page's own wait starts again. The first frame of a new reading already waits, so the held rows
 * show from it and a reply this page holds shows at once.
 * Task 76g (read-f1): `earlier`, the earlier wording's questions and answers, goes with a call for a new line (read when the call
 * starts; "Try again" sends it again); it never changes which reply is reused. `line` is the line `reply` answers, so the page
 * knows when the reading of a new line has landed (null: no reply yet).
 * Task 76e (owner answer S1 A; read-f23): `seed`, a reply the page already holds for `question` (a kept step 2's questions as
 * shown), is that line's reply at once: no call, never waiting. An AI seed is then known for the line, as an answer would be.
 */
export function useAskClarify(input: Readonly<{
  active: boolean; question: string; mayCall: boolean; earlier?: AskClarifyEarlier | null; seed?: AskClarifyResponse
}>): Readonly<{
  reply: AskClarifyResponse | null;
  line: string | null;
  waiting: boolean;
  startedAt: number | null;
  retry(): void;
}> {
  const { active, question, mayCall, seed } = input;
  // Task 76g: the earlier wording's questions and answers as the page has them now; a call takes them when it starts.
  const earlier = useRef<AskClarifyEarlier | null>(null);
  earlier.current = input.earlier ?? null;
  // Task 76g: the reply together with the line it answers.
  const [replied, setReplied] = useState<Readonly<{ reply: AskClarifyResponse; line: string }> | null>(null);
  const setReply = useCallback((reply: AskClarifyResponse, line: string): void => setReplied({ reply, line }), []);
  const [waiting, setWaiting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Task 76h: one more ask of the same line ("Try again").
  const [asks, setAsks] = useState(0);
  const known = useRef(new Map<string, AskClarifyResponse>());
  /**
   * The one call still running, and its line (review of Task 70b; read-d2, ask-f12). Leaving step 2 (Back) never stops it, so
   * Next with the same words waits for that call instead of asking again; a new line stops it, and so does leaving the page.
   */
  const running = useRef<ClarifyCall | null>(null);

  const settled = useCallback((done: ClarifyCall, answer: AskClarifyResponse): void => {
    // A failure may be asked again (Back and Next); the server's limit bounds that.
    if (answer.source === "AI") known.current.set(done.question, answer);
    if (running.current === done) running.current = null;
  }, []);

  // Task 76h (read-f23): what this hook is asked for is known while the page draws, so its first frame for a new line already
  // waits (and a reply it already holds shows at once), before the effect below asks.
  // Task 76e: a seed's first frame already shows it.
  const asking = active ? `${seed !== undefined ? "SEED" : mayCall ? "ASK" : "NO"}\n${question}` : null;
  const [drawnFor, setDrawnFor] = useState<string | null>(null);
  if (asking !== drawnFor) {
    setDrawnFor(asking);
    const seen = known.current.get(question);
    if (asking === null) {
      setWaiting(false);
      setStartedAt(null);
    } else if (seed !== undefined) {
      setReply(seed, question);
      setWaiting(false);
      setStartedAt(null);
    } else if (seen !== undefined || !mayCall) {
      setReply(seen ?? NONE, question);
      setWaiting(false);
      setStartedAt(null);
    } else {
      setWaiting(true);
      setStartedAt(running.current?.question === question ? running.current.startedAt : null);
    }
  }

  useEffect(() => () => {
    running.current?.stop();
    running.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      setWaiting(false);
      setStartedAt(null);
      return;
    }
    // Task 76e: a seed is the line's reply, with no call; a call still running for another line stops, as for a new line.
    if (seed !== undefined) {
      if (seed.source === "AI") known.current.set(question, seed);
      if (running.current !== null && running.current.question !== question) {
        running.current.stop();
        running.current = null;
      }
      setReply(seed, question);
      setWaiting(false);
      setStartedAt(null);
      return;
    }
    const seen = known.current.get(question);
    if (seen !== undefined || !mayCall) {
      setReply(seen ?? NONE, question);
      setWaiting(false);
      setStartedAt(null);
      return;
    }
    if (running.current !== null && running.current.question !== question) {
      running.current.stop();
      running.current = null;
    }
    const call = running.current ?? clarifyCall(question, earlier.current, Date.now(), settled);
    running.current = call;
    setWaiting(true);
    setStartedAt(call.startedAt);
    let shown = true;
    void call.answer.then((answer) => {
      if (!shown || answer === null) return;
      setReply(answer, call.question);
      setWaiting(false);
      setStartedAt(null);
    });
    return () => { shown = false; };
  }, [active, question, mayCall, asks, settled, setReply, seed]);

  /**
   * Task 76h (ask-d3): "Try again". The wait keeps its start (its words stay as they are); only the page's own wait starts again.
   * Task 76g: with the same earlier questions and answers.
   */
  const retry = useCallback((): void => {
    const call = running.current;
    if (call === null) return;
    call.stop();
    running.current = clarifyCall(call.question, call.earlier, call.startedAt, settled);
    setAsks((count) => count + 1);
  }, [settled]);

  return { reply: replied?.reply ?? null, line: replied?.line ?? null, waiting, startedAt, retry };
}
