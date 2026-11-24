import type { Answer } from "@debateai/contract";
import { originVersionOf, verdictOfRecord, SynthesisCheckRepository } from "@debateai/serve";
import { runSynthesisCheck, type SynthesisCheckDeps } from "./check.js";
import { SYNTHESIS_CHECK_POLICY_VERSION } from "./policy.js";

const SYNTHESIS_PUBLISH_POLL_MS = 1_000;

export type SynthesisPublishDecision = "PROCEED" | "APPROVAL_REQUIRED" | "UNAVAILABLE" | "REMOVED";

export interface SynthesisPublishGate {
  decide(input: Readonly<{
    runId: string;
    answer: Answer;
    contentLease: {
      run<T>(use: () => Promise<T>): Promise<T>;
      readAnswer(): Promise<Answer | null>;
    };
    startedAt: Date;
  }>): Promise<SynthesisPublishDecision>;
}

export const UNCONFIGURED_SYNTHESIS_PUBLISH_GATE: SynthesisPublishGate = Object.freeze({
  decide: async () => "UNAVAILABLE" as const
});

export function createSynthesisPublishGate(input: Readonly<{
  repository: SynthesisCheckRepository;
  readAnswerVersions(runId: string, answerId: string, maxVersion: number, ownerRef: string): Promise<ReadonlyMap<number, string | null>>;
  check: SynthesisCheckDeps;
  approvalCovers?(input: Readonly<{ runId: string; answerId: string; originVersion: number }>): Promise<boolean>;
  deadlineMs: number;
  /**
   * How long another attempt (the worker's) may still be running, when that is longer than this gate's own D: on the preview
   * gate the worker also waits out the gate's slot queue. A Publish then waits for that check, within its own D, rather than
   * calling the model a second time beside it. Without it, D.
   */
  inFlightWindowMs?: number;
  /**
   * How long this caller waits for another attempt's check that is still running; without it, up to its own D. Zero: it
   * does not wait, and such a check makes the decision UNAVAILABLE at once (the Free debates' sweep, which asks again on a
   * later pass rather than hold its pass). Either way the gate never runs a check of its own beside one that is running.
   */
  inFlightWaitMs?: number;
  clock(): Date;
  sleep(ms: number): Promise<void>;
}>): SynthesisPublishGate {
  return {
    async decide(target) {
      try {
        const ownerRef = await input.repository.ownerRefOfRun(target.runId);
        if (ownerRef === null) return "UNAVAILABLE";
        const texts = await target.contentLease.run(() => input.readAnswerVersions(
          target.runId, target.answer.answer_id, target.answer.answer_version, ownerRef
        ));
        const synthesisOriginVersion = originVersionOf(texts, target.answer.answer_version);
        const readDecision = async (): Promise<SynthesisPublishDecision | null> => {
          const verdict = verdictOfRecord(await input.repository.readRecords({
            runId: target.runId, answerId: target.answer.answer_id, maxVersion: target.answer.answer_version
          }), (origin) => origin === synthesisOriginVersion);
          if (verdict?.verdict === "FLAGGED") {
            if (verdict.categories.includes("SUICIDE_OR_HARM_TO_OTHERS")) return "REMOVED";
            return await input.approvalCovers?.({
              runId: target.runId, answerId: target.answer.answer_id,
              originVersion: verdict.synthesisOriginVersion
            }) ? "PROCEED" : "APPROVAL_REQUIRED";
          }
          if (verdict?.verdict === "CLEAR" || verdict?.verdict === "NO_SYNTHESIS") return "PROCEED";
          return null;
        };
        const prior = await readDecision();
        if (prior !== null) return prior;
        const deadlineAt = new Date(target.startedAt.getTime() + input.deadlineMs);
        const waitUntil = Math.min(deadlineAt.getTime(), target.startedAt.getTime() + (input.inFlightWaitMs ?? input.deadlineMs));
        let waitedForCheck = false;
        while (input.clock().getTime() < deadlineAt.getTime()) {
          const inFlight = await input.repository.readInFlightAttempts({
            answerId: target.answer.answer_id, maxVersion: target.answer.answer_version,
            deadlineMs: input.inFlightWindowMs ?? input.deadlineMs
          });
          if (!inFlight.some((attempt) => originVersionOf(texts, attempt.answerVersion) === synthesisOriginVersion)) break;
          waitedForCheck = true;
          if (input.clock().getTime() >= waitUntil) break;
          await input.sleep(Math.min(SYNTHESIS_PUBLISH_POLL_MS, waitUntil - input.clock().getTime()));
          const observed = await readDecision();
          if (observed !== null) return observed;
        }
        const afterWait = await readDecision();
        if (afterWait !== null) return afterWait;
        if (waitedForCheck || input.clock().getTime() >= deadlineAt.getTime()) return "UNAVAILABLE";
        const attempt = await input.repository.startPublishAttempt({
          runId: target.runId, answerId: target.answer.answer_id,
          answerVersion: target.answer.answer_version
        });
        const checked = await runSynthesisCheck(input.check, {
          runId: target.runId, answerId: target.answer.answer_id,
          answerVersion: target.answer.answer_version,
          synthesisText: texts.get(target.answer.answer_version) ?? null,
          deadlineAt
        });
        await input.repository.insertResult({
          attemptId: attempt.attemptId, runId: target.runId, answerId: target.answer.answer_id,
          answerVersion: target.answer.answer_version, synthesisOriginVersion,
          outcome: checked.outcome, modelProviderRef: checked.modelProviderRef,
          modelId: checked.modelId, policyVersion: SYNTHESIS_CHECK_POLICY_VERSION,
          callCount: checked.callCount, deadlineMs: input.deadlineMs
        });
        return await readDecision() ?? "UNAVAILABLE";
      } catch {
        return "UNAVAILABLE";
      }
    }
  };
}
