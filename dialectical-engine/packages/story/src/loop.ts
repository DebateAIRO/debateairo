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
 * It NEVER throws for what a provider or a budget does: every such failure is
 * a FAILED outcome with a code, so the caller can store it and the site stops
 * waiting. It throws only on a programming error (fewer than one round).
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

export type StoryLoopOutcome =
  | {
    readonly outcome: "READY" | "READY_WITH_RESERVATION";
    readonly body: StoryBody;
    readonly reservation: string | null;
    readonly rounds: readonly StoryRoundRecord[];
  }
  | { readonly outcome: "FAILED"; readonly failureCode: string; readonly rounds: readonly StoryRoundRecord[] };

function storyCallRecord(record: StoryCallRecord): StoryCallRecord {
  return Object.freeze({ artifactRef: record.artifactRef, callSiteKey: record.callSiteKey, lineage: record.lineage });
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
  const failed = (failureCode: string): StoryLoopOutcome =>
    Object.freeze({ outcome: "FAILED" as const, failureCode, rounds: Object.freeze([...rounds]) });
  let priorObjection: string | null = null;
  let lastUnsatisfied: { readonly body: StoryBody; readonly objection: string } | null = null;

  for (let round = 1; round <= input.maxRounds; round += 1) {
    let written: StoryCallRecord & { readonly body: StoryBody };
    try {
      written = await deps.writeStory({ round, priorObjection });
    } catch (error) {
      return failed(storyFailureCode(error, "WRITE"));
    }
    const writer = storyCallRecord(written);

    let checked: StoryCallRecord & { readonly verdict: StoryCheckerVerdict };
    try {
      checked = await deps.checkStory({ round, candidate: written.body });
    } catch (error) {
      rounds.push(Object.freeze({ round, writer, checker: null, satisfied: false, objection: null }));
      return failed(storyFailureCode(error, "CHECK"));
    }
    const { satisfied, objection } = checked.verdict;
    rounds.push(Object.freeze({ round, writer, checker: storyCallRecord(checked), satisfied, objection }));
    if (satisfied) {
      return Object.freeze({ outcome: "READY" as const, body: written.body, reservation: null, rounds: Object.freeze([...rounds]) });
    }
    // The parser refuses an unsatisfied verdict without an objection; a checker
    // double that returns one anyway has broken its contract.
    if (objection === null) return failed(STORY_LOOP_FAILURE_CODES.checkUnavailable);
    priorObjection = objection;
    lastUnsatisfied = { body: written.body, objection };
  }

  if (lastUnsatisfied === null) return failed(STORY_LOOP_FAILURE_CODES.unexpected);
  return Object.freeze({
    outcome: "READY_WITH_RESERVATION" as const,
    body: lastUnsatisfied.body,
    reservation: lastUnsatisfied.objection,
    rounds: Object.freeze([...rounds])
  });
}
