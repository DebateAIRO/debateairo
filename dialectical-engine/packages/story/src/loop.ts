import type { MakerLineage, StoryBody } from "@debateai/contract";
import { DAILY_COST_ENVELOPE_REACHED, PERSON_ALLOWANCE_REACHED, RUN_COST_ENVELOPE_MONEY_REACHED } from "@debateai/budget";
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
 *
 * Story v4 (R1d, spec §7.2 items 7-8; `input.v4`): only a MISLEADING problem starts another round. A verdict that is
 * not satisfied but not misleading is a wording note: the draft is served READY with no reservation, and the note stays
 * in the round record for the owner. A misleading round hands the next its own draft (`priorDraft`) and the problem,
 * so the storyteller revises what it wrote; misleading on the last round is READY_WITH_RESERVATION. `firstRound` lets
 * a second loop (the backup storyteller) number its rounds after the first loop's; the last round is at most 8, the
 * story call-site keys' range.
 *
 * W3-5 (dig-model revision): the loop is generic in the draft it carries (`B`, the story's body by default), so the path
 * rewrite (./path-rewrite.ts) reuses these rounds, this fallback and these failure codes for its own draft.
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

/** The last round a story call-site key names (`STORY:STORYTELLER:1` to `:8`; the register caps the rounds at 8). */
const STORY_LOOP_LAST_ROUND = 8;

/** The loop's last round (`STORY_LOOP_LAST_ROUND`), for the writer's backup loop (Task 17 review 2): one number, one place. */
export function storyLoopLastRound(): number {
  return STORY_LOOP_LAST_ROUND;
}

/** `STORY:STORYTELLER:{round}` or `STORY:CHECKER:{round}`: the only call sites the story gateway accepts. */
export function storyCallSiteKey(role: "STORYTELLER" | "CHECKER", round: number): string {
  return `STORY:${role}:${String(round)}`;
}

export interface StoryCallRecord {
  readonly artifactRef: string;
  readonly callSiteKey: string;
  readonly lineage: MakerLineage;
}

/** What the loop reads of a checker's verdict (the story's carries its criteria too; the path rewrite's does not). */
export type StoryLoopVerdict = Pick<StoryCheckerVerdict, "satisfied" | "objection" | "misleading">;

export interface StoryLoopDependencies<B = StoryBody> {
  /**
   * `priorDraft` (story v4): the draft the checker found misleading, which this round revises as the model's own turn
   * (`buildStoryRevisionPrompt`). Always null under v3, and in a loop's first round.
   */
  writeStory(input: {
    readonly round: number;
    readonly priorObjection: string | null;
    readonly priorDraft: B | null;
  }): Promise<StoryCallRecord & { readonly body: B }>;
  checkStory(input: { readonly round: number; readonly candidate: B }): Promise<StoryCallRecord & { readonly verdict: StoryLoopVerdict }>;
}

export interface StoryRoundRecord {
  readonly round: number;
  readonly writer: StoryCallRecord;
  readonly checker: StoryCallRecord | null;
  readonly satisfied: boolean;
  readonly objection: string | null;
  /** Story v4 only, on a round whose checker answered: whether the objection named a misleading problem. */
  readonly misleading?: boolean;
}

/** A later round's failure, when the loop kept an earlier checked draft instead (spec §6). */
export interface StoryLaterFailure {
  readonly failureCode: string;
  /** Same shape as a FAILED outcome's cause: a typed code or a class name, never model text. */
  readonly cause: string;
}

export type StoryLoopOutcome<B = StoryBody> =
  | {
    readonly outcome: "READY" | "READY_WITH_RESERVATION";
    readonly body: B;
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

function isWrittenStory<B>(value: unknown): value is StoryCallRecord & { readonly body: B } {
  if (!isStoryCallRecord(value)) return false;
  const body = (value as { readonly body?: unknown }).body;
  return typeof body === "object" && body !== null;
}

function isCheckedStory(value: unknown): value is StoryCallRecord & { readonly verdict: StoryLoopVerdict } {
  if (!isStoryCallRecord(value)) return false;
  const verdict = (value as { readonly verdict?: unknown }).verdict;
  if (typeof verdict !== "object" || verdict === null) return false;
  const { satisfied, objection, misleading } = verdict as {
    readonly satisfied?: unknown; readonly objection?: unknown; readonly misleading?: unknown
  };
  return typeof satisfied === "boolean" && (objection === null || typeof objection === "string")
    && (misleading === undefined || typeof misleading === "boolean");
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
  // The money stops: the story's own envelope and attempt allowance, the run's money, and the
  // shared walls of the day (the private preview's team pot answers with it) and of the owner's
  // allowance windows. Each is the envelope speaking, never an unexpected error.
  if (error instanceof TypedDomainError
    && (error.code === STORY_COST_ENVELOPE_REACHED
      || error.code === STORY_CALL_BUDGET_EXHAUSTED
      || error.code === RUN_COST_ENVELOPE_MONEY_REACHED
      || error.code === DAILY_COST_ENVELOPE_REACHED
      || error.code === PERSON_ALLOWANCE_REACHED)) {
    return STORY_LOOP_FAILURE_CODES.envelopeExhausted;
  }
  return STORY_LOOP_FAILURE_CODES.unexpected;
}

export async function runStoryLoop<B = StoryBody>(
  input: { readonly maxRounds: number; readonly v4?: true; readonly firstRound?: number },
  deps: StoryLoopDependencies<B>
): Promise<StoryLoopOutcome<B>> {
  if (!Number.isInteger(input.maxRounds) || input.maxRounds < 1) {
    throw new TypedDomainError("STORY_LOOP_ROUNDS_INVALID", `The story loop needs at least one round, not ${String(input.maxRounds)}`);
  }
  const firstRound = input.firstRound ?? 1;
  const lastRound = firstRound + input.maxRounds - 1;
  if (!Number.isInteger(firstRound) || firstRound < 1 || lastRound > STORY_LOOP_LAST_ROUND) {
    throw new TypedDomainError(
      "STORY_LOOP_ROUNDS_INVALID",
      `The story loop's rounds lie within 1 to ${String(STORY_LOOP_LAST_ROUND)}, not ${String(firstRound)} to ${String(lastRound)}`
    );
  }
  const v4 = input.v4 === true;
  const rounds: StoryRoundRecord[] = [];
  let priorObjection: string | null = null;
  let priorDraft: B | null = null;
  type ObjectedDraft = { readonly round: number; readonly body: B; readonly objection: string };
  let lastUnsatisfied: ObjectedDraft | null = null;
  const reserved = (draft: ObjectedDraft, laterFailure: StoryLaterFailure | null): StoryLoopOutcome<B> =>
    Object.freeze({
      outcome: "READY_WITH_RESERVATION" as const,
      body: draft.body,
      reservation: draft.objection,
      servedRound: draft.round,
      laterFailure,
      rounds: Object.freeze([...rounds])
    });
  /** A failure keeps the latest checked-but-objected draft when one exists (spec §6); otherwise it is FAILED. */
  const stopped = (failureCode: string, cause: string): StoryLoopOutcome<B> => {
    const earlierDraft = lastUnsatisfied;
    if (earlierDraft !== null) return reserved(earlierDraft, Object.freeze({ failureCode, cause }));
    return Object.freeze({ outcome: "FAILED" as const, failureCode, cause, rounds: Object.freeze([...rounds]) });
  };
  const ready = (round: number, body: B): StoryLoopOutcome<B> => Object.freeze({
    outcome: "READY" as const,
    body,
    reservation: null,
    servedRound: round,
    laterFailure: null,
    rounds: Object.freeze([...rounds])
  });

  for (let round = firstRound; round <= lastRound; round += 1) {
    // Every read of a dependency's result stays inside its guarded region, so a
    // malformed result becomes a named failure instead of a thrown TypeError.
    let writer: StoryCallRecord;
    let body: B;
    try {
      const written: unknown = await deps.writeStory({ round, priorObjection, priorDraft });
      if (!isWrittenStory<B>(written)) throw dependencyResultInvalid("writeStory");
      writer = storyCallRecord(written);
      body = written.body;
    } catch (error) {
      return stopped(storyFailureCode(error, "WRITE"), storyFailureCause(error));
    }

    let checker: StoryCallRecord;
    let satisfied: boolean;
    let objection: string | null;
    let misleading: boolean;
    try {
      const checked: unknown = await deps.checkStory({ round, candidate: body });
      if (!isCheckedStory(checked)) throw dependencyResultInvalid("checkStory");
      checker = storyCallRecord(checked);
      ({ satisfied, objection } = checked.verdict);
      misleading = checked.verdict.misleading === true;
    } catch (error) {
      rounds.push(Object.freeze({ round, writer, checker: null, satisfied: false, objection: null }));
      return stopped(storyFailureCode(error, "CHECK"), storyFailureCause(error));
    }
    rounds.push(Object.freeze({ round, writer, checker, satisfied, objection, ...(v4 ? { misleading } : {}) }));
    if (satisfied) return ready(round, body);
    // The parser refuses an unsatisfied verdict without an objection; a checker
    // double that returns one anyway has broken its contract.
    if (objection === null) return stopped(STORY_LOOP_FAILURE_CODES.checkUnavailable, STORY_CHECKER_OBJECTION_REQUIRED);
    // Story v4: a wording note is no reason to rewrite. The draft is served as it is, with no reservation; the note
    // stays in this round's record (and in the checker's own artifact) for the owner, never for the reader.
    if (v4 && !misleading) return ready(round, body);
    priorObjection = objection;
    // Story v4: the next round revises this draft as the model's own turn. v3 starts again from the material.
    if (v4) priorDraft = body;
    lastUnsatisfied = { round, body, objection };
  }

  // Every round either returned or left an objected draft, so the rounds ran out with one.
  if (lastUnsatisfied === null) return stopped(STORY_LOOP_FAILURE_CODES.unexpected, STORY_CAUSE_UNKNOWN);
  return reserved(lastUnsatisfied, null);
}
