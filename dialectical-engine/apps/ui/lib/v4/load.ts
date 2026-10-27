import type { Answer, AnswerStory, ContractClient, RunProjection } from "@debateai/contract";
import { contractClient, isNotFound } from "../api.js";
import { buildV4Map } from "./mapModel.js";
import type { DigLink, DigView } from "./types.js";

/*
 * V4 initial (2026-10-28): the V4 pages read only today's V3 endpoints (run, run answer, answer, story). The id in a
 * V4 address is a run id; an answer id still opens (as the classic page allows), resolved to its run.
 */

export type V4Load =
  | Readonly<{ kind: "RUN"; runId: string; run: RunProjection }>
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null }>;

type StoryClient = Pick<ContractClient, "readAnswerStory">;
type LoadClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswer" | "readAnswerStory">;
type DigClient = Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswerStory">;

/** The answer's story, or null when there is none yet (404). Other failures are the caller's to show. */
export async function loadStory(answerId: string, client: StoryClient = contractClient): Promise<AnswerStory | null> {
  try {
    return await client.readAnswerStory(answerId);
  } catch (failure) {
    if (isNotFound(failure)) return null;
    throw failure;
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
    return { kind: "SERVED", runId: answer.run_ref, answer, story: await loadStory(answer.answer_id, client) };
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
  return { kind: "SERVED", runId: id, answer, story: await loadStory(answer.answer_id, client) };
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
    case "QUEUED":
    case "WAITING":
      return digView(link, "WAITING");
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
  const story = await loadStory(answer.answer_id, client);
  const map = buildV4Map({ runId: link.childRunId, answer, story });
  return { link, state: "DONE", headline: map.headline, counts: map.counts };
}
