import { removesDebate, type Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { originVersionOf, synthesisTextOf, verdictOfRecord, SynthesisCheckRepository } from "@debateai/serve";
import { runSynthesisCheck, type SynthesisCheckDeps } from "./check.js";
import { SYNTHESIS_CHECK_POLICY_VERSION } from "./policy.js";

const SYNTHESIS_CHECK_MAX_IN_FLIGHT = 4;

export class SynthesisCheckWorker {
  constructor(private readonly deps: Readonly<{
    repository: SynthesisCheckRepository;
    erasure: { reconcile(limit: number): Promise<unknown> };
    withContentLease<T>(runId: string, use: () => Promise<T>): Promise<T>;
    readAnswer(runId: string, answerId: string, version: number, ownerRef: string): Promise<Answer | null>;
    check: SynthesisCheckDeps;
    deadlineMs: number;
    log(line: string): void;
  }>) {}

  async runOnce(): Promise<void> {
    try {
      const claims = await this.deps.repository.claimNextRequests(SYNTHESIS_CHECK_MAX_IN_FLIGHT, this.deps.deadlineMs);
      const removals = await Promise.all(claims.map(async (claim): Promise<boolean> => {
        try {
          const ownerRef = await this.deps.repository.ownerRefOfRun(claim.runId);
          if (ownerRef === null) {
            this.deps.log("SYNTHESIS_CHECK_UNEXPECTED");
            return false;
          }
          const texts = await this.deps.withContentLease(claim.runId, async () => {
            const versions = new Map<number, string | null>();
            for (let version = 1; version <= claim.answerVersion; version++) {
              const answer = await this.deps.readAnswer(claim.runId, claim.answerId, version, ownerRef);
              if (answer === null) return null;
              versions.set(version, synthesisTextOf(answer));
            }
            return versions;
          });
          if (texts === null) {
            this.deps.log("SYNTHESIS_CHECK_ANSWER_UNREADABLE");
            return false;
          }
          const synthesisOriginVersion = originVersionOf(texts, claim.answerVersion);
          const verdict = verdictOfRecord(
            await this.deps.repository.readRecords({
              runId: claim.runId, answerId: claim.answerId, maxVersion: claim.answerVersion
            }), (origin) => origin === synthesisOriginVersion
          );
          if (verdict !== null && verdict.verdict !== "UNAVAILABLE") {
            const inheritedResultId = await this.deps.repository.readFinalResultId({
              answerId: claim.answerId, synthesisOriginVersion
            });
            if (inheritedResultId !== null) {
              await this.deps.repository.insertInheritance({
                attemptId: claim.attemptId, runId: claim.runId, answerId: claim.answerId,
                answerVersion: claim.answerVersion, inheritedResultId
              });
              this.deps.log("SYNTHESIS_CHECK_INHERITED");
              return false;
            }
          }
          const result = await runSynthesisCheck(this.deps.check, {
            runId: claim.runId, answerId: claim.answerId, answerVersion: claim.answerVersion,
            synthesisText: texts.get(claim.answerVersion) ?? null,
            deadlineAt: new Date(claim.startedAt.getTime() + this.deps.deadlineMs)
          });
          const inserted = await this.deps.repository.insertResult({
            attemptId: claim.attemptId, runId: claim.runId, answerId: claim.answerId,
            answerVersion: claim.answerVersion,
            synthesisOriginVersion,
            outcome: result.outcome, modelProviderRef: result.modelProviderRef,
            modelId: result.modelId, policyVersion: SYNTHESIS_CHECK_POLICY_VERSION,
            callCount: result.callCount, deadlineMs: this.deps.deadlineMs
          });
          if (inserted === "ALREADY_FINAL") {
            const inheritedResultId = await this.deps.repository.readFinalResultId({
              answerId: claim.answerId, synthesisOriginVersion
            });
            if (inheritedResultId !== null) await this.deps.repository.insertInheritance({
              attemptId: claim.attemptId, runId: claim.runId, answerId: claim.answerId,
              answerVersion: claim.answerVersion, inheritedResultId
            });
          }
          return inserted === "INSERTED" && removesDebate(result.outcome);
        } catch (error) {
          this.deps.log(error instanceof TypedDomainError && error.code === "PRIVATE_CONTENT_ERASED"
            ? "SYNTHESIS_CHECK_ANSWER_UNREADABLE" : "SYNTHESIS_CHECK_UNEXPECTED");
          return false;
        }
      }));
      if (removals.some(Boolean)) {
        try { await this.deps.erasure.reconcile(100); }
        catch { this.deps.log("SYNTHESIS_CHECK_ERASURE_PENDING"); }
      }
      await this.deps.repository.purgeExpiredRemovalNotices();
    } catch {
      this.deps.log("SYNTHESIS_CHECK_UNEXPECTED");
    }
  }
}
