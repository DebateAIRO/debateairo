import type { MakerLineage, StoryBody } from "@debateai/contract";
import { RUN_COST_ENVELOPE_MONEY_REACHED } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderCallFailedError, ProviderContentUnacceptedError } from "@debateai/providers";
import type { StoryCheckerVerdict } from "./validate.js";

/**
 * THE WRITE-AND-CHECK LOOP (spec §6). Each round the storyteller writes (its
 * call already ran the deterministic checks as its content classifier), then
 * the checker judges. Satisfied: READY. Rounds used up while the checker still
 * objects: READY_WITH_RESERVATION, carrying the last objection verbatim.
 *
 * It NEVER throws for what a provider, a budget or a dependency does. A failure
 * after an earlier round produced a checked-but-objected draft keeps that draft
 * as READY_WITH_RESERVATION with its objection (spec §6); with no such draft it
 * is a FAILED outcome with a code and a cause, so the caller can store it and
 * the site stops waiting. It throws only on a programming error (fewer than one
 * round, or a round count that is not an integer).
 */

export const STORY_LOOP_FAILURE_CODES = Object.freeze({
  writeRejected: "STORY_WRITE_REJECTED",
  transportDeath: "STORY_TRANSPORT_DEATH",
  checkUnavailable: "STORY_CHECK_UNAVAILABLE",
  envelopeExhausted: "STORY_ENVELOPE_EXHAUSTED",
  unexpected: "STORY_UNEXPECTED_ERROR"
} as const);

/** The story money seam's refusal (the story gateway's own envelope, spec §8). */
const STORY_COST_ENVELOPE_REACHED = "STORY_COST_ENVELOPE_REACHED";
/** The attempt-allowance refusal the gateway wrapper throws (`apps/runner/src/index.ts`). */
const STORY_CALL_BUDGET_EXHAUSTED = "CALL_BUDGET_EXHAUSTED";
/** A dependency resolved to something that is not the result its contract promises. */
const STORY_DEPENDENCY_RESULT_INVALID = "STORY_DEPENDENCY_RESULT_INVALID";
/** The cause of an unsatisfied verdict without an objection (the name the verdict parser uses). */
const STORY_CHECKER_OBJECTION_REQUIRED = "STORY_CHECKER_OBJECTION_REQUIRED";
/** The cause when what was thrown carries no code-shaped code or name. */
const STORY_CAUSE_UNKNOWN = "UNKNOWN";
/** A cause is a typed code or an error class name, never a message or model text. */
const STORY_CAUSE_SHAPE = /^[A-Za-z][A-Za-z0-9_]{0,95}$/u;

/** `STORY:STORYTELLER:{round}` or `STORY:CHECKER:{round}`: the only call sites the story gateway accepts. */
export function storyCallSiteKey(role: "STORYTELLER" | "CHECKER", round: number): string {
  return `STORY:${role}:${String(round)}`;
}

export interface StoryCallRecord {
  readonly artifactRef: string;
  readonly callSiteKey: string;
  readonly lineage: MakerLineage;
}

export interface StoryLoopDependencies {
  writeStory(input: { readonly round: number; readonly priorObjection: string | null }): Promise<StoryCallRecord & { readonly body: StoryBody }>;
  checkStory(input: { readonly round: number; readonly candidate: StoryBody }): Promise<StoryCallRecord & { readonly verdict: StoryCheckerVerdict }>;
}

export interface StoryRoundRecord {
  readonly round: number;
  readonly writer: StoryCallRecord;
  readonly checker: StoryCallRecord | null;
  readonly satisfied: boolean;
  readonly objection: string | null;
}

/** A later round's failure, when the loop kept an earlier checked draft instead (spec §6). */
export interface StoryLaterFailure {
  readonly failureCode: string;
  /** Same shape as a FAILED outcome's cause: a typed code or a class name, never model text. */
  readonly cause: string;
}

export type StoryLoopOutcome =
  | {
    readonly outcome: "READY" | "READY_WITH_RESERVATION";
    readonly body: StoryBody;
    readonly reservation: string | null;
    /**
     * The round whose draft is served, and whose writer and checker made it.
     * Under the earlier-draft fallback this is that earlier round, not the last
     * one run, so the stored lineage names the models that wrote and judged the
     * story the reader sees.
     */
    readonly servedRound: number;
    /** Set only when a later round failed and the earlier draft was kept. */
    readonly laterFailure: StoryLaterFailure | null;
    readonly rounds: readonly StoryRoundRecord[];
  }
  | {
    readonly outcome: "FAILED";
    readonly failureCode: string;
    /** The caught error's typed code, else its class name, else "UNKNOWN". Never a message or model text. */
    readonly cause: string;
    readonly rounds: readonly StoryRoundRecord[];
  };

function storyCallRecord(record: StoryCallRecord): StoryCallRecord {
  return Object.freeze({ artifactRef: record.artifactRef, callSiteKey: record.callSiteKey, lineage: record.lineage });
}

function isStoryCallRecord(value: unknown): value is StoryCallRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { readonly artifactRef?: unknown; readonly callSiteKey?: unknown; readonly lineage?: unknown };
  return typeof record.artifactRef === "string"
    && typeof record.callSiteKey === "string"
    && typeof record.lineage === "object" && record.lineage !== null;
}

function isWrittenStory(value: unknown): value is StoryCallRecord & { readonly body: StoryBody } {
  if (!isStoryCallRecord(value)) return false;
  const body = (value as { readonly body?: unknown }).body;
  return typeof body === "object" && body !== null;
}

function isCheckedStory(value: unknown): value is StoryCallRecord & { readonly verdict: StoryCheckerVerdict } {
  if (!isStoryCallRecord(value)) return false;
  const verdict = (value as { readonly verdict?: unknown }).verdict;
  if (typeof verdict !== "object" || verdict === null) return false;
  const { satisfied, objection } = verdict as { readonly satisfied?: unknown; readonly objection?: unknown };
  return typeof satisfied === "boolean" && (objection === null || typeof objection === "string");
}

function dependencyResultInvalid(dependency: "writeStory" | "checkStory"): TypedDomainError {
  return new TypedDomainError(STORY_DEPENDENCY_RESULT_INVALID, `The story loop's ${dependency} resolved to a malformed result`);
}

/** What was thrown, as a stored cause: its typed code, else its class name, else UNKNOWN; never its message. */
function storyFailureCause(error: unknown): string {
  const named = error instanceof TypedDomainError ? error.code : error instanceof Error ? error.name : null;
  return typeof named === "string" && STORY_CAUSE_SHAPE.test(named) ? named : STORY_CAUSE_UNKNOWN;
}

/** Which named failure a thrown error is. The order matters: both provider errors are TypedDomainErrors. */
function storyFailureCode(error: unknown, stage: "WRITE" | "CHECK"): string {
  if (error instanceof ProviderContentUnacceptedError) {
    return stage === "WRITE" ? STORY_LOOP_FAILURE_CODES.writeRejected : STORY_LOOP_FAILURE_CODES.checkUnavailable;
  }
  if (error instanceof ProviderCallFailedError) return STORY_LOOP_FAILURE_CODES.transportDeath;
  if (error instanceof TypedDomainError
    && (error.code === STORY_COST_ENVELOPE_REACHED
      || error.code === STORY_CALL_BUDGET_EXHAUSTED
      || error.code === RUN_COST_ENVELOPE_MONEY_REACHED)) {
    return STORY_LOOP_FAILURE_CODES.envelopeExhausted;
  }
  return STORY_LOOP_FAILURE_CODES.unexpected;
}

export async function runStoryLoop(
  input: { readonly maxRounds: number },
  deps: StoryLoopDependencies
): Promise<StoryLoopOutcome> {
  if (!Number.isInteger(input.maxRounds) || input.maxRounds < 1) {
    throw new TypedDomainError("STORY_LOOP_ROUNDS_INVALID", `The story loop needs at least one round, not ${String(input.maxRounds)}`);
  }
  const rounds: StoryRoundRecord[] = [];
  let priorObjection: string | null = null;
  type ObjectedDraft = { readonly round: number; readonly body: StoryBody; readonly objection: string };
  let lastUnsatisfied: ObjectedDraft | null = null;
  const reserved = (draft: ObjectedDraft, laterFailure: StoryLaterFailure | null): StoryLoopOutcome =>
    Object.freeze({
      outcome: "READY_WITH_RESERVATION" as const,
      body: draft.body,
      reservation: draft.objection,
      servedRound: draft.round,
      laterFailure,
      rounds: Object.freeze([...rounds])
    });
  /** A failure keeps the latest checked-but-objected draft when one exists (spec §6); otherwise it is FAILED. */
  const stopped = (failureCode: string, cause: string): StoryLoopOutcome => {
    const earlierDraft = lastUnsatisfied;
    if (earlierDraft !== null) return reserved(earlierDraft, Object.freeze({ failureCode, cause }));
    return Object.freeze({ outcome: "FAILED" as const, failureCode, cause, rounds: Object.freeze([...rounds]) });
  };

  for (let round = 1; round <= input.maxRounds; round += 1) {
    // Every read of a dependency's result stays inside its guarded region, so a
    // malformed result becomes a named failure instead of a thrown TypeError.
    let writer: StoryCallRecord;
    let body: StoryBody;
    try {
      const written: unknown = await deps.writeStory({ round, priorObjection });
      if (!isWrittenStory(written)) throw dependencyResultInvalid("writeStory");
      writer = storyCallRecord(written);
      body = written.body;
    } catch (error) {
      return stopped(storyFailureCode(error, "WRITE"), storyFailureCause(error));
    }

    let checker: StoryCallRecord;
    let satisfied: boolean;
    let objection: string | null;
    try {
      const checked: unknown = await deps.checkStory({ round, candidate: body });
      if (!isCheckedStory(checked)) throw dependencyResultInvalid("checkStory");
      checker = storyCallRecord(checked);
      ({ satisfied, objection } = checked.verdict);
    } catch (error) {
      rounds.push(Object.freeze({ round, writer, checker: null, satisfied: false, objection: null }));
      return stopped(storyFailureCode(error, "CHECK"), storyFailureCause(error));
    }
    rounds.push(Object.freeze({ round, writer, checker, satisfied, objection }));
    if (satisfied) {
      return Object.freeze({
        outcome: "READY" as const,
        body,
        reservation: null,
        servedRound: round,
        laterFailure: null,
        rounds: Object.freeze([...rounds])
      });
    }
    // The parser refuses an unsatisfied verdict without an objection; a checker
    // double that returns one anyway has broken its contract.
    if (objection === null) return stopped(STORY_LOOP_FAILURE_CODES.checkUnavailable, STORY_CHECKER_OBJECTION_REQUIRED);
    priorObjection = objection;
    lastUnsatisfied = { round, body, objection };
  }

  // Every round either returned or left an objected draft, so the rounds ran out with one.
  if (lastUnsatisfied === null) return stopped(STORY_LOOP_FAILURE_CODES.unexpected, STORY_CAUSE_UNKNOWN);
  return reserved(lastUnsatisfied, null);
}
