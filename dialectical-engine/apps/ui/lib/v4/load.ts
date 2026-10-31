import {
  ContractHttpError,
  DIG_LEVEL_MAX,
  type Answer,
  type AnswerDig,
  type AnswerStory,
  type ContractClient,
  type RunProjection
} from "@debateai/contract";
import { contractClient, isNotFound } from "../api.js";
import { buildV4Map, isFinishedRewrite } from "./mapModel.js";
import type { DigLink, DigView } from "./types.js";

export { storyReadFailed } from "./mapModel.js";

/*
 * V4 initial (2026-10-28): the V4 pages read only today's V3 endpoints (run, run answer, answer, story). The id in a
 * V4 address is a run id; an answer id still opens (as the classic page allows), resolved to its run.
 * W4-6 (owner Q-D13): a dig writes no story, so a dig's answer (its `dig` part says what it dug) is never followed by a
 * story read; and the trail of a dig back up to the main question is read from the answers above it.
 */

export type V4Load =
  | Readonly<{ kind: "RUN"; runId: string; run: RunProjection }>
  /**
   * `story` is never null from loadV4 for a first debate (fix wave 1: a failed read is an UNAVAILABLE record); it is null
   * for a dig's answer, which has no story (W4-6, Q-D13).
   */
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null }>;

type StoryClient = Pick<ContractClient, "readAnswerStory">;
type LoadClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswer" | "readAnswerStory">;
type DigClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswerStory">;
type AnswerClient = Pick<ContractClient, "readRunAnswer">;

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

/** W4-6: the answer's story, or null for a dig's answer, which has none (Q-D13): nothing is read and nothing waits. */
async function storyFor(answer: Answer, client: StoryClient): Promise<AnswerStory | null> {
  return answer.dig !== undefined ? null : loadStory(answer.answer_id, client, answer.answer_version);
}

export async function loadV4(id: string, client: LoadClient = contractClient): Promise<V4Load> {
  let run: RunProjection;
  try {
    run = await client.readRun(id);
  } catch (failure) {
    if (!isNotFound(failure)) throw failure;
    // Not a run id: read it as an answer id.
    const answer = await client.readAnswer(id);
    return { kind: "SERVED", runId: answer.run_ref, answer, story: await storyFor(answer, client) };
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
  return { kind: "SERVED", runId: id, answer, story: await storyFor(answer, client) };
}

/**
 * W4-6: the served answer of a run read again, to see paths a dig has rewritten since (Answer.path_rewrites). Null while
 * it cannot be read (the page keeps what it shows); never throws.
 */
export async function loadAnswer(runId: string, client: AnswerClient = contractClient): Promise<Answer | null> {
  try {
    return await Promise.resolve().then(() => client.readRunAnswer(runId));
  } catch {
    return null;
  }
}

function digView(link: DigLink, state: DigView["state"], run?: RunProjection): DigView {
  // W4-6 (the money rule): a dig whose own run reached the month wall says it is paused, on its card.
  const pausedUntil = run?.month_pause?.until;
  return { link, state, headline: null, counts: null, ...(pausedUntil === undefined ? {} : { pausedUntil }) };
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
      return digView(link, "RUNNING", run);
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
  // W4-6 (Q-D13): a dig of the new model writes no story: it rewrites the path it came from, and keeps its points.
  if (answer.dig !== undefined) {
    const own = buildV4Map({ runId: link.childRunId, answer, story: null });
    return { link, state: "DONE", headline: null, counts: own.counts, rewrite: answer.dig.rewrite, points: own.points };
  }
  // A failed story read leaves the dig DONE without a headline; the page reads it again later (TIME-5, TIME-8).
  const story = await loadStory(answer.answer_id, client, answer.answer_version);
  const map = buildV4Map({ runId: link.childRunId, answer, story });
  return { link, state: "DONE", headline: map.headline, counts: map.counts };
}

/** W4-6: one step of a dig's trail: a debate above it, and the path of it that the dig below dug (null: an open question). */
export type TrailStep = Readonly<{ runId: string; pathRef: string | null; line: string | null }>;

/**
 * W4-6: a dig's trail up to the main question, top first: each debate above it and the path of it that was dug. `complete`
 * is false when a debate above could not be read (the trail then starts part-way down).
 */
export type DigTrail = Readonly<{ steps: readonly TrailStep[]; complete: boolean }>;

/** The line a debate shows for one of its paths: its newest rewritten text, its dig's own line for it, or the claim. */
function lineIn(answer: Answer, pathRef: string | null): string | null {
  if (pathRef === null) return null;
  const rewritten = answer.path_rewrites?.paths.find((path) => path.position_ref === pathRef)?.current?.line;
  if (rewritten !== undefined) return rewritten;
  const rewrite = answer.dig?.rewrite;
  const own = rewrite !== undefined && rewrite !== null && isFinishedRewrite(rewrite)
    ? rewrite.dig_paths.find((path) => path.position_ref === pathRef)?.line
    : undefined;
  return own ?? answer.nodes.find((node) => node.node_id === pathRef)?.claim ?? null;
}

/** W4-6: reads the answers above a dig, one at a time and at most DIG_LEVEL_MAX of them. Never throws. */
export async function loadDigTrail(dig: AnswerDig, client: AnswerClient = contractClient): Promise<DigTrail> {
  const steps: TrailStep[] = [];
  let below: AnswerDig = dig;
  for (let read = 0; read < DIG_LEVEL_MAX; read += 1) {
    let above: Answer;
    try {
      above = await Promise.resolve().then(() => client.readRunAnswer(below.parent_run_id));
    } catch {
      return { steps, complete: false };
    }
    steps.unshift({ runId: below.parent_run_id, pathRef: below.position_ref, line: lineIn(above, below.position_ref) });
    if (above.dig === undefined) return { steps, complete: true };
    below = above.dig;
  }
  return { steps, complete: false };
}
