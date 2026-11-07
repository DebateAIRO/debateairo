"use client";

import { useEffect, useRef, useState } from "react";
import type { AskClarifyResponse } from "@debateai/contract";
import { contractClient } from "@/lib/api";

/** The page stops waiting after this and shows no questions: a little past the server's own 8 seconds (ASK_CLARIFY_DEADLINE_MS). */
export const ASK_CLARIFY_PAGE_WAIT_MS = 10_000;
/** A question edited at step 2 is read again once the typing has paused this long. */
const EDIT_PAUSE_MS = 1_200;

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });

/**
 * Decision 29: what step 2 shows for the question. Nothing here can hold the page up: Start works while it waits, and any failure is no questions. A text this page already asked about is not asked again (Back and Next, or an edit undone). `mayCall` false (the consent was refused, or
 * the words read as a person in crisis): no call, no questions.
 */
export function useAskClarify(input: Readonly<{ active: boolean; question: string; mayCall: boolean }>): Readonly<{
  reply: AskClarifyResponse | null;
  waiting: boolean;
}> {
  const { active, question, mayCall } = input;
  const [reply, setReply] = useState<AskClarifyResponse | null>(null);
  const [waiting, setWaiting] = useState(false);
  const known = useRef(new Map<string, AskClarifyResponse>());
  const asked = useRef(false);

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
    setWaiting(true);
    const controller = new AbortController();
    let settled = false;
    const settle = (answer: AskClarifyResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      // A failure may be asked again (Back and Next); the server's limit bounds that.
      if (answer.source === "AI") known.current.set(question, answer);
      setReply(answer);
      setWaiting(false);
    };
    // The whole wait, the edit's pause included: whatever the network does, the page carries on.
    const giveUp = setTimeout(() => {
      settle(NONE);
      controller.abort();
    }, ASK_CLARIFY_PAGE_WAIT_MS);
    const ask = (): void => {
      asked.current = true;
      contractClient.clarifyAsk({ question_line: question }, controller.signal).then(settle, () => settle(NONE));
    };
    const pause = asked.current ? setTimeout(ask, EDIT_PAUSE_MS) : undefined;
    if (pause === undefined) ask();
    return () => {
      settled = true;
      clearTimeout(pause);
      clearTimeout(giveUp);
      controller.abort();
    };
  }, [active, question, mayCall]);

  return { reply, waiting };
}
