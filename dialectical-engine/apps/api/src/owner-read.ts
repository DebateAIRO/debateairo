import {
  AnswerSchema, AnswerStorySchema, AnswerDisclosureSchema, ExecutionLedgerDigestSchema,
  InspectionSchema, NodeSchema, RunProjectionSchema,
  type Answer, type AnswerStory, type AnswerDisclosure, type ExecutionLedgerDigest,
  type Inspection, type Node, type RunProjection, type Session
} from "@debateai/contract";
import type { RunOwnershipAccess } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { STORY_UNREADABLE, answerCarriesStoryLabel, buildAnswerStory, deriveStoryStatus } from "@debateai/story";
import { apiOperationalErrorDiagnostic, type ApiOptions } from "./index.js";
import { OPEN_SYNTHESIS_ANSWER_ACCESS } from "./synthesis-check/hold.js";

export type OwnerReadDeps = Pick<ApiOptions, "application" | "stories" | "disclosures" | "storyClock" | "synthesisAnswerAccess">;
type LogContext = Readonly<{ requestId: string; route: string }>;

async function answerIsShown(d: OwnerReadDeps, answer: Pick<Answer, "run_ref" | "answer_id" | "answer_version">): Promise<boolean> {
  return (await (d.synthesisAnswerAccess ?? OPEN_SYNTHESIS_ANSWER_ACCESS).stateOf({
    runId: answer.run_ref, answerId: answer.answer_id, answerVersion: answer.answer_version
  })) === "SHOW";
}

export function ownerSession(ownerRef: string, sessionId: string): Session {
  return Object.freeze({
    asker_id: `owner:${ownerRef}`,
    session_id: sessionId,
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  });
}

/**
 * S01: the end check's removal destroys a debate's keys in the same tick, so from then on the debate's own reads fail
 * as erased content. For its page that is "not found", on which the page takes the removal notice, never a server
 * failure. An erased read of a debate the check did not remove still fails as before.
 */
export async function unlessRemovedByCheck<T>(
  d: Pick<OwnerReadDeps, "synthesisAnswerAccess">, runId: string, read: () => Promise<T | null>
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "PRIVATE_CONTENT_ERASED"
      && await (d.synthesisAnswerAccess ?? OPEN_SYNTHESIS_ANSWER_ACCESS).stateOf({ runId }) === "REMOVED") return null;
    throw error;
  }
}

export async function readOwnerRun(
  d: OwnerReadDeps, runId: string, session: Session, ownership: RunOwnershipAccess
): Promise<RunProjection | null> {
  const run = await unlessRemovedByCheck(d, runId, () => d.application.readRun(runId, session, ownership));
  if (run === null) return null;
  const state = await (d.synthesisAnswerAccess ?? OPEN_SYNTHESIS_ANSWER_ACCESS).stateOf({ runId });
  if (state === "REMOVED") return null;
  return RunProjectionSchema.parse(state === "HELD" ? { ...run, synthesis_check: "CHECKING" } : run);
}

export async function readOwnerRunAnswer(
  d: OwnerReadDeps, runId: string, session: Session, ownership: RunOwnershipAccess
): Promise<Answer | null> {
  const answer = await unlessRemovedByCheck(d, runId, () => d.application.readRunAnswer(runId, session, ownership));
  return answer === null || !await answerIsShown(d, answer) ? null : AnswerSchema.parse(answer);
}

export async function readOwnerAnswer(
  d: OwnerReadDeps, answerId: string, version: number | undefined, session: Session, ownership: RunOwnershipAccess
): Promise<Answer | null> {
  const answer = await d.application.readAnswer(answerId, session, version, ownership);
  return answer === null || !await answerIsShown(d, answer) ? null : AnswerSchema.parse(answer);
}

export async function readOwnerInspection(
  d: OwnerReadDeps, answerId: string, version: number | undefined, session: Session, ownership: RunOwnershipAccess
): Promise<Inspection | null> {
  if (d.synthesisAnswerAccess !== undefined) {
    const answer = await d.application.readAnswer(answerId, session, version, ownership);
    if (answer === null || !await answerIsShown(d, answer)) return null;
  }
  const inspection = await d.application.readInspection(answerId, session, version, ownership);
  return inspection === null ? null : InspectionSchema.parse(inspection);
}

export async function readOwnerLedgerDigest(
  d: OwnerReadDeps, answerId: string, session: Session, ownership: RunOwnershipAccess
): Promise<ExecutionLedgerDigest | null> {
  if (d.synthesisAnswerAccess !== undefined) {
    const answer = await d.application.readAnswer(answerId, session, undefined, ownership);
    if (answer === null || !await answerIsShown(d, answer)) return null;
  }
  const digest = await d.application.readLedgerDigest(answerId, session, ownership);
  return digest === null ? null : ExecutionLedgerDigestSchema.parse(digest);
}

export async function readOwnerStory(
  d: OwnerReadDeps, answerId: string, session: Session, ownership: RunOwnershipAccess,
  logContext?: LogContext
): Promise<AnswerStory | null> {
  const stories = d.stories;
  if (stories === undefined) return null;
  const answer = await d.application.readAnswer(answerId, session, undefined, ownership);
  if (answer === null) return null;
  if (!await answerIsShown(d, answer)) return null;
  let body: AnswerStory;
  try {
    const stored = await stories.readStory({
      answerId: answer.answer_id,
      answerVersion: answer.answer_version,
      ownership
    });
    const floor = stored === null && answer.verdict_state === null && d.disclosures !== undefined
      ? await d.disclosures.readFloor({ answerId: answer.answer_id, ownership })
      : null;
    const anchor = stored === null
      ? await stories.readStoryAnchor({ answerId: answer.answer_id, ownership })
      : null;
    const derived = deriveStoryStatus({
      stored,
      answerHasVerdict: answerCarriesStoryLabel({
        verdictState: answer.verdict_state,
        floorVerdictState: floor?.verdict_state ?? null
      }),
      answerCreatedAt: anchor?.storedAt ?? new Date(answer.relevant_as_of),
      now: d.storyClock?.() ?? new Date()
    });
    body = AnswerStorySchema.parse(buildAnswerStory({
      answerId: answer.answer_id,
      answerVersion: stored?.answerVersion ?? anchor?.answerVersion ?? answer.answer_version,
      stored,
      derived
    }));
  } catch (error) {
    console.error(JSON.stringify(Object.freeze({
      event: "api.story.unreadable",
      ...(logContext === undefined ? {} : { requestId: logContext.requestId, route: logContext.route }),
      diagnostic: apiOperationalErrorDiagnostic(error)
    })));
    body = AnswerStorySchema.parse(buildAnswerStory({
      answerId: answer.answer_id,
      answerVersion: answer.answer_version,
      stored: null,
      derived: STORY_UNREADABLE
    }));
  }
  return body;
}

export async function readOwnerDisclosure(
  d: OwnerReadDeps, answerId: string, session: Session, ownership: RunOwnershipAccess,
  logContext?: LogContext
): Promise<AnswerDisclosure | null> {
  const disclosures = d.disclosures;
  if (disclosures === undefined) return null;
  const answer = await d.application.readAnswer(answerId, session, undefined, ownership);
  if (answer === null) return null;
  if (!await answerIsShown(d, answer)) return null;
  let disclosure: AnswerDisclosure | null;
  try {
    const read = await disclosures.readDisclosure({ answerId: answer.answer_id, ownership });
    disclosure = read === null ? null : AnswerDisclosureSchema.parse(read);
  } catch (error) {
    const corruptRecord = (error instanceof TypedDomainError && error.code === "SERVE_DISCLOSURE_ROW_INVALID")
      || (error instanceof Error && error.name === "ZodError");
    if (!corruptRecord) throw error;
    console.error(JSON.stringify(Object.freeze({
      event: "api.disclosure.unreadable",
      ...(logContext === undefined ? {} : { requestId: logContext.requestId, route: logContext.route }),
      diagnostic: apiOperationalErrorDiagnostic(error)
    })));
    disclosure = null;
  }
  return disclosure;
}

export async function readOwnerNode(
  d: OwnerReadDeps, answerId: string, nodeId: string, session: Session, ownership: RunOwnershipAccess
): Promise<Node | null> {
  if (d.synthesisAnswerAccess !== undefined) {
    const answer = await d.application.readAnswer(answerId, session, undefined, ownership);
    if (answer === null || !await answerIsShown(d, answer)) return null;
  }
  const node = await d.application.readNode(answerId, nodeId, session, ownership);
  return node === null ? null : NodeSchema.parse(node);
}
