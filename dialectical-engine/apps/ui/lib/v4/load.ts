import { ContractHttpError, type Answer, type AnswerStory, type ContractClient, type RunProjection } from "@debateai/contract";
import { contractClient, isNotFound } from "../api.js";
import { buildV4Map } from "./mapModel.js";
import type { DigLink, DigView } from "./types.js";

export { storyReadFailed } from "./mapModel.js";

/*
 * V4 initial (2026-10-28): the V4 pages read only today's V3 endpoints (run, run answer, answer, story). The id in a
 * V4 address is a run id; an answer id still opens (as the classic page allows), resolved to its run.
 */

export type V4Load =
  | Readonly<{ kind: "RUN"; runId: string; run: RunProjection }>
  /** `story` is never null from loadV4 (fix wave 1: a failed read is an UNAVAILABLE record); the type keeps null for callers. */
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null }>;

type StoryClient = Pick<ContractClient, "readAnswerStory">;
type LoadClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswer" | "readAnswerStory">;
type DigClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswerStory">;

/**
 * V3's unreadableStory record (lib/v3/useAnswerStory.ts), field for field. It is restated, not imported, because that
 * module's "@/lib/api" import does not resolve under the root typecheck that covers tests/**.
 */
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

/** The same three failures V3's story poll treats as final (lib/v3/useAnswerStory.ts). */
const FINAL_STORY_FAILURES: ReadonlySet<string> = new Set(["NOT_FOUND", "SESSION_REQUIRED", "FORBIDDEN"]);

/**
 * The answer's story. It never throws and never returns null (DATA-3, DATA-10/TIME-5), so a story failure can never
 * hide an answer already read: a 404, SESSION_REQUIRED or FORBIDDEN becomes V3's final UNAVAILABLE record
 * (`STORY_<code>`), and any other failure a passing STORY_READ_FAILED record that `storyReadFailed` tells the page to
 * try again, as V3's poll does.
 */
export async function loadStory(answerId: string, client: StoryClient = contractClient, answerVersion = 1): Promise<AnswerStory> {
  try {
    // Inside the promise chain on purpose: a client that throws at once is a failed read, never a crash.
    return await Promise.resolve().then(() => client.readAnswerStory(answerId));
  } catch (failure) {
    if (failure instanceof ContractHttpError && FINAL_STORY_FAILURES.has(failure.code)) {
      return unreadableStory(answerId, answerVersion, `STORY_${failure.code}`);
    }
    return unreadableStory(answerId, answerVersion, "STORY_READ_FAILED");
  }
}

export async function loadV4(id: string, client: LoadClient = contractClient): Promise<V4Load> {
  let run: RunProjection;
  try {
    run = await client.readRun(id);
  } catch (failure) {
    if (!isNotFound(failure)) throw failure;
    // Not a run id: read it as an answer id.
    const answer = await client.readAnswer(id);
    return { kind: "SERVED", runId: answer.run_ref, answer, story: await loadStory(answer.answer_id, client, answer.answer_version) };
  }
  if (run.state !== "SETTLED") return { kind: "RUN", runId: id, run };
  let answer: Answer;
  try {
    answer = await client.readRunAnswer(id);
  } catch (failure) {
    // Settled but its answer is not readable yet: still finishing, so the page keeps waiting.
    if (isNotFound(failure)) return { kind: "RUN", runId: id, run };
    throw failure;
  }
  return { kind: "SERVED", runId: id, answer, story: await loadStory(answer.answer_id, client, answer.answer_version) };
}

function digView(link: DigLink, state: DigView["state"]): DigView {
  return { link, state, headline: null, counts: null };
}

/** What a dig's follow-up debate has become (row D decision 1: digs show on the map while they run). */
export async function loadDigView(link: DigLink, client: DigClient = contractClient): Promise<DigView> {
  let run: RunProjection;
  try {
    run = await client.readRun(link.childRunId);
  } catch (failure) {
    if (isNotFound(failure)) return digView(link, "FAILED");
    throw failure;
  }
  switch (run.state) {
    case "WAITING":
      // Only a real wait for a free spot says so (RULES-4).
      return digView(link, "WAITING");
    case "QUEUED":
    case "CLAIMED":
    case "RUNNING":
    case "HOLDING":
      return digView(link, "RUNNING");
    case "FAILED":
      return digView(link, "FAILED");
    case "SETTLED":
      break;
  }
  let answer: Answer;
  try {
    answer = await client.readRunAnswer(link.childRunId);
  } catch (failure) {
    if (isNotFound(failure)) return digView(link, "RUNNING");
    throw failure;
  }
  // A failed story read leaves the dig DONE without a headline; the page reads it again later (TIME-5, TIME-8).
  const story = await loadStory(answer.answer_id, client, answer.answer_version);
  const map = buildV4Map({ runId: link.childRunId, answer, story });
  return { link, state: "DONE", headline: map.headline, counts: map.counts };
}
