"use client";

import { useEffect, useRef, useState } from "react";
import type { AskClarifyResponse } from "@debateai/contract";
import { contractClient } from "@/lib/api";

/** The page stops waiting after this and shows no questions: a little past the server's own 8 seconds (ASK_CLARIFY_DEADLINE_MS). */
export const ASK_CLARIFY_PAGE_WAIT_MS = 10_000;

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });

/** One clarifying call: its line, its answer (NONE on any failure or after the page's wait), and how to stop it. */
type ClarifyCall = Readonly<{ question: string; answer: Promise<AskClarifyResponse>; stop: () => void }>;

/** Asks once for `question`. The whole wait is bounded: whatever the network does, the page carries on. */
function clarifyCall(question: string, settled: (call: ClarifyCall, answer: AskClarifyResponse) => void): ClarifyCall {
  const controller = new AbortController();
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const asked = new Promise<AskClarifyResponse>((resolve) => {
    giveUp = setTimeout(() => {
      resolve(NONE);
      controller.abort();
    }, ASK_CLARIFY_PAGE_WAIT_MS);
    contractClient.clarifyAsk({ question_line: question }, controller.signal).then(resolve, () => resolve(NONE));
  });
  const call: ClarifyCall = {
    question,
    answer: asked.then((answer) => {
      clearTimeout(giveUp);
      settled(call, answer);
      return answer;
    }),
    stop: () => {
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
 */
export function useAskClarify(input: Readonly<{ active: boolean; question: string; mayCall: boolean }>): Readonly<{
  reply: AskClarifyResponse | null;
  waiting: boolean;
}> {
  const { active, question, mayCall } = input;
  const [reply, setReply] = useState<AskClarifyResponse | null>(null);
  const [waiting, setWaiting] = useState(false);
  const known = useRef(new Map<string, AskClarifyResponse>());
  /**
   * The one call still running, and its line (review of Task 70b; read-d2, ask-f12). Leaving step 2 (Back) never stops it, so
   * Next with the same words waits for that call instead of asking again; a new line stops it, and so does leaving the page.
   */
  const running = useRef<ClarifyCall | null>(null);

  useEffect(() => () => {
    running.current?.stop();
    running.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      setWaiting(false);
      return;
    }
    const seen = known.current.get(question);
    if (seen !== undefined || !mayCall) {
      setReply(seen ?? NONE);
      setWaiting(false);
      return;
    }
    if (running.current !== null && running.current.question !== question) {
      running.current.stop();
      running.current = null;
    }
    const call = running.current ?? clarifyCall(question, (done, answer) => {
      // A failure may be asked again (Back and Next); the server's limit bounds that.
      if (answer.source === "AI") known.current.set(done.question, answer);
      if (running.current === done) running.current = null;
    });
    running.current = call;
    setWaiting(true);
    let shown = true;
    void call.answer.then((answer) => {
      if (!shown) return;
      setReply(answer);
      setWaiting(false);
    });
    return () => { shown = false; };
  }, [active, question, mayCall]);

  return { reply, waiting };
}
