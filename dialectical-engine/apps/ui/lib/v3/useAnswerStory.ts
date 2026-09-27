import { useEffect, useState } from "react";
import { ContractHttpError, type AnswerStory, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";

/**
 * The owner page's story poll (spec 2026-09-26 §10). The first read is
 * immediate; while the story is WRITING the next read waits 5 s, then 10 s,
 * 20 s, and 30 s from then on. Any other status ends the poll, and so does
 * leaving the page. The server's waiting window decides when WRITING becomes
 * UNAVAILABLE, so a story lost to a dead runner stops the poll too.
 */
export const STORY_POLLING = Object.freeze({
  firstDelayMs: 5_000,
  maxDelayMs: 30_000,
  readFailureLimit: 4
});

export type StoryReader = Pick<ContractClient, "readAnswerStory">;

const TERMINAL_READ_FAILURES: ReadonlySet<string> = new Set(["NOT_FOUND", "SESSION_REQUIRED", "FORBIDDEN"]);

/**
 * The one UNAVAILABLE reason that may pass (Task 10): the server could not read
 * the stored story, perhaps for a moment. It counts as a failed read.
 */
const PASSING_UNAVAILABLE_REASON = "STORY_UNREADABLE";

export function nextStoryPollDelay(previous: number | null): number {
  return previous === null ? STORY_POLLING.firstDelayMs : Math.min(STORY_POLLING.maxDelayMs, previous * 2);
}

/** What the panel shows when the story cannot be read at all: today's composed text. */
export function unreadableStory(answerId: string, answerVersion: number, reason: string): AnswerStory {
  return {
    answer_id: answerId,
    answer_version: answerVersion,
    status: "UNAVAILABLE",
    unavailable_reason: reason,
    shape: null,
    pack: null,
    written_at: null,
    storyteller: null,
    checker: null,
    rounds: null,
    language: null,
    reservation: null,
    verdict_basis: null,
    point_numbers: null,
    story: null
  };
}

/**
 * The story of `answerId`, kept fresh while it is written; null before the
 * first reply. NOT_FOUND, SESSION_REQUIRED and FORBIDDEN end the poll at once
 * as a local UNAVAILABLE. Any other failed read, a STORY_UNREADABLE answer
 * included, keeps what the panel shows and tries again on the same backoff;
 * the fourth failure in a row ends the poll: with the server's own
 * STORY_UNREADABLE answer if that was the fourth, else as STORY_READ_FAILED.
 * A new answer (a re-run) drops the old story and starts again at once, and a
 * late reply for the old answer never lands.
 */
export function useAnswerStory(
  answerId: string | null,
  options: Readonly<{ answerVersion?: number; client?: StoryReader }> = {}
): AnswerStory | null {
  const [state, setState] = useState<Readonly<{ answerId: string; story: AnswerStory }> | null>(null);
  // The version only labels a locally made UNAVAILABLE record; the panel never shows it.
  const answerVersion = options.answerVersion ?? 1;
  const client = options.client;
  useEffect(() => {
    if (answerId === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay: number | null = null;
    let failures = 0;
    const settle = (story: AnswerStory) => {
      if (active) setState({ answerId, story });
    };
    const schedule = () => {
      delay = nextStoryPollDelay(delay);
      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, delay);
    };
    const fail = (last: AnswerStory) => {
      failures += 1;
      if (failures >= STORY_POLLING.readFailureLimit) settle(last);
      else schedule();
    };
    const poll = async (): Promise<void> => {
      let story: AnswerStory;
      try {
        // Inside the promise chain on purpose: a client without the method is a failure, never a crash.
        story = await Promise.resolve().then(() => (client ?? contractClient).readAnswerStory(answerId));
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ContractHttpError && TERMINAL_READ_FAILURES.has(failure.code)) {
          settle(unreadableStory(answerId, answerVersion, `STORY_${failure.code}`));
          return;
        }
        fail(unreadableStory(answerId, answerVersion, "STORY_READ_FAILED"));
        return;
      }
      if (!active) return;
      if (story.status === "UNAVAILABLE" && story.unavailable_reason === PASSING_UNAVAILABLE_REASON) {
        fail(story);
        return;
      }
      failures = 0;
      settle(story);
      if (story.status === "WRITING") schedule();
    };
    void poll();
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [answerId, answerVersion, client]);
  return state !== null && state.answerId === answerId ? state.story : null;
}
