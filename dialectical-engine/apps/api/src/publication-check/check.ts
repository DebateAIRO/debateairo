import { PUBLICATION_PART_KINDS, type PublicDebate, type PublicationPartKind, type PublicationRefusalStatement } from "../../../../packages/contract/src/index.js";
import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import type { PromptPacket } from "../../../../packages/providers/src/index.js";
import { buildFramedPrompt } from "../../../../packages/providers/src/prompt-frame.js";
import { extractCheckedText, packJudgeCalls, type CheckedText } from "./material.js";
import { publicationCheckContract, PUBLICATION_CHECK_POLICY_VERSION } from "./policy.js";
import { combineJudgeCalls, judgeCallValue, parseJudgeAnswer, type JudgeCallResult } from "./verdict.js";

export type JudgeFailureCause = "JUDGE_NOT_CONFIGURED" | "JUDGE_DOOR_REFUSED" | "JUDGE_TRANSPORT_FAILED"
  | "JUDGE_HTTP_STATUS" | "JUDGE_DEADLINE" | "JUDGE_ANSWER_NOT_JSON" | "JUDGE_ANSWER_SCHEMA" | "JUDGE_ANSWER_UNKNOWN_PART";
export class PublicationJudgeFailure extends Error {
  constructor(override readonly cause: JudgeFailureCause) { super(cause); this.name = "PublicationJudgeFailure"; }
}
export interface PublicationJudgePort {
  readonly providerRef: string;
  readonly modelId: string;
  complete(input: { packet: PromptPacket; signal: AbortSignal }): Promise<{ text: string }>;
}
export type PublicationRefusalGround = PublicationRefusalStatement["ground"];
export type PublicationCheckResult = { outcome: "ALLOW" }
  | { outcome: "BLOCK" | "UNSURE"; statement: PublicationRefusalStatement }
  | { outcome: "UNAVAILABLE"; cause: JudgeFailureCause };
export interface PublicationCheckRecord {
  readonly run_id: string;
  readonly attempted_at: Date;
  readonly outcome: PublicationCheckResult["outcome"];
  readonly failure_cause: JudgeFailureCause | null;
  readonly rules: readonly (1 | 2)[];
  readonly part_kinds: readonly PublicationPartKind[];
  readonly ground: PublicationRefusalGround | null;
  readonly judge_provider_ref: string | null;
  readonly judge_model_id: string | null;
  readonly policy_version: string;
  readonly judge_call_count: number;
}
export interface PublicationCheckRecorder { record(row: PublicationCheckRecord): Promise<void> }
export interface PublicationContentCheck {
  check(input: { runId: string; snapshot: PublicDebate }): Promise<PublicationCheckResult>;
}
type JudgeOptions = { judge: PublicationJudgePort | null; deadlineMs?: number; maxMaterialCodePoints?: number; maxConcurrentCalls?: number };

/**
 * The deadline D of one publish check (SPEC-v2 R7: D ≤ 60 s): every judge call of the attempt shares ONE
 * `AbortSignal.timeout(D)`. FIX-HS2-p2 ui-B2 / ruling R-D2: 60 000 ms, SPEC-v2 R7's cap. At 50 s the §4 eval against
 * the dev judge still failed one run in three (one call past 50 s); what stays slower than 60 s is the dev judge's
 * own tail (V-15). main.ts wires this constant and the UI proxy's publish ceiling exceeds it
 * (tests/unit/hs-s02-publish-route.test.ts "composition").
 */
export const PUBLICATION_CHECK_DEADLINE_MS = 60_000;

/**
 * FIX-HS2-p1 sd-N1: the record's `judge_provider_ref` / `judge_model_id` hold operator identifiers, never text.
 * The same grammar is a CHECK on the table (migrations/0079_publication_check_record_identifiers.sql): no space,
 * no `@`, 1–256 characters, and never uuid-shaped. A judge whose identifiers fail it is not a configured judge.
 */
const JUDGE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u;
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
export function isJudgeIdentifier(value: string): boolean {
  return JUDGE_IDENTIFIER.test(value) && !UUID_SHAPED.test(value);
}
function configuredJudge(judge: PublicationJudgePort | null): PublicationJudgePort | null {
  return judge !== null && isJudgeIdentifier(judge.providerRef) && isJudgeIdentifier(judge.modelId) ? judge : null;
}
export type JudgedParts = {
  result: PublicationCheckResult;
  rules: readonly (1 | 2)[];
  partKinds: readonly PublicationPartKind[];
  ground: PublicationRefusalGround | null;
  judgeCallCount: number;
};

/** Race even a non-cooperating port; always detach this call's abort listener. */
async function withinDeadline(judge: PublicationJudgePort, packet: PromptPacket, signal: AbortSignal): Promise<{ text: string }> {
  if (signal.aborted) throw new PublicationJudgeFailure("JUDGE_DEADLINE");
  let onAbort = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new PublicationJudgeFailure("JUDGE_DEADLINE"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([judge.complete({ packet, signal }), deadline]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export async function judgeParts(options: JudgeOptions, parts: readonly CheckedText[]): Promise<JudgedParts> {
  const judge = configuredJudge(options.judge);
  if (judge === null) return { result: { outcome: "UNAVAILABLE", cause: "JUDGE_NOT_CONFIGURED" }, rules: [], partKinds: [], ground: null, judgeCallCount: 0 };
  const calls = packJudgeCalls(parts, options.maxMaterialCodePoints);
  const signal = AbortSignal.timeout(options.deadlineMs ?? PUBLICATION_CHECK_DEADLINE_MS);
  const concurrency = options.maxConcurrentCalls ?? 4;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("Invalid judge concurrency");
  const results: JudgeCallResult[] = new Array(calls.length);
  const sentFieldNames = new Set<string>();
  let next = 0, judgeCallCount = 0;
  async function worker() {
    while (next < calls.length) {
      const index = next++, call = calls[index]!;
      if (signal.aborted) { results[index] = { ok: false, cause: "JUDGE_DEADLINE" }; continue; }
      try {
        const { packet, fence } = buildFramedPrompt({ contract: publicationCheckContract(), material: call.fields });
        const expectedCall = judgeCallValue(fence);
        judgeCallCount++;
        for (const field of call.fields) sentFieldNames.add(field.name);
        const response = await withinDeadline(judge!, packet, signal);
        results[index] = parseJudgeAnswer(response.text, call.fields.map(field => field.name), expectedCall);
      } catch (error) {
        const cause = error instanceof TypedDomainError && error.code.startsWith("PROMPT_") ? "JUDGE_DOOR_REFUSED"
          : signal.aborted ? "JUDGE_DEADLINE"
          : error instanceof PublicationJudgeFailure ? error.cause : "JUDGE_TRANSPORT_FAILED";
        results[index] = { ok: false, cause };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, calls.length) }, () => worker()));
  const combined = combineJudgeCalls(results);
  if (combined.outcome === "ALLOW") return { result: { outcome: "ALLOW" }, rules: [], partKinds: [], ground: null, judgeCallCount };
  if (combined.outcome === "UNAVAILABLE") return { result: { outcome: "UNAVAILABLE", cause: combined.cause! }, rules: [], partKinds: [], ground: null, judgeCallCount };
  const names = combined.outcome === "UNSURE" && combined.parts.length === 0
    ? [...sentFieldNames] : combined.parts;
  const partKinds = PUBLICATION_PART_KINDS.filter(kind => names.includes(kind.toLowerCase()));
  const ground = combined.outcome === "BLOCK" && combined.possibly_illegal ? "TERMS_AND_POSSIBLY_ILLEGAL" : "TERMS";
  return {
    result: { outcome: combined.outcome, statement: { outcome: combined.outcome, parts: partKinds, ground, automated: true, visibility: "PRIVATE" } },
    rules: combined.outcome === "BLOCK" ? combined.rules : [], partKinds, ground, judgeCallCount
  };
}

export function createPublicationContentCheck(deps: {
  judge: () => PublicationJudgePort | null;
  recorder: PublicationCheckRecorder;
  clock: () => Date;
  deadlineMs?: number;
  maxMaterialCodePoints?: number;
  maxConcurrentCalls?: number;
}): PublicationContentCheck {
  return { async check({ runId, snapshot }) {
    const attemptedAt = deps.clock(), judge = configuredJudge(deps.judge());
    const judged = await judgeParts({ ...deps, judge }, extractCheckedText(snapshot));
    await deps.recorder.record({
      run_id: runId, attempted_at: attemptedAt, outcome: judged.result.outcome,
      failure_cause: judged.result.outcome === "UNAVAILABLE" ? judged.result.cause : null,
      rules: judged.rules, part_kinds: judged.partKinds, ground: judged.ground,
      judge_provider_ref: judge?.providerRef ?? null, judge_model_id: judge?.modelId ?? null,
      policy_version: PUBLICATION_CHECK_POLICY_VERSION, judge_call_count: judged.judgeCallCount
    });
    return judged.result;
  } };
}
