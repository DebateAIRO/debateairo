import { removesDebate, type Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { originVersionOf, readSynthesisTexts, verdictOfRecord, SynthesisCheckRepository } from "@debateai/serve";
import { runSynthesisCheck, type SynthesisCheckDeps } from "./check.js";
import { SYNTHESIS_CHECK_POLICY_VERSION } from "./policy.js";

/** The most finished debates one tick checks. */
const SYNTHESIS_CHECK_MAX_IN_FLIGHT = 4;

type Claim = Awaited<ReturnType<SynthesisCheckRepository["claimNextRequests"]>>[number];

export class SynthesisCheckWorker {
  constructor(private readonly deps: Readonly<{
    repository: SynthesisCheckRepository;
    erasure: { reconcile(limit: number): Promise<unknown> };
    withContentLease<T>(runId: string, use: () => Promise<T>): Promise<T>;
    readAnswer(runId: string, answerId: string, version: number, ownerRef: string): Promise<Answer | null>;
    check: SynthesisCheckDeps;
    deadlineMs: number;
    /**
     * How many checks, one call each, may run at once; without it, four. On the Anthropic gate it is one
     * (publication-check/gate-transport.ts, contentCheckCallsAtOnce), so the worker never holds more than one of the gate's
     * few slots, which a debate's own calls and the question check share.
     */
    maxConcurrentCalls?: number;
    log(line: string): void;
  }>) {}

  /**
   * One tick: up to four finished debates checked. A round claims as many as may run at once and checks them; with fewer at
   * once than four (the gate), the next round claims only when the last one has answered, so nothing claimed waits behind
   * another check. Every check still ends at its request's time plus the window. With four at once there is one round, as before.
   */
  async runOnce(): Promise<void> {
    try {
      const atOnce = Math.max(1, Math.min(this.deps.maxConcurrentCalls ?? SYNTHESIS_CHECK_MAX_IN_FLIGHT, SYNTHESIS_CHECK_MAX_IN_FLIGHT));
      let claimed = 0;
      while (claimed < SYNTHESIS_CHECK_MAX_IN_FLIGHT) {
        const claims = await this.deps.repository.claimNextRequests(Math.min(atOnce, SYNTHESIS_CHECK_MAX_IN_FLIGHT - claimed), this.deps.deadlineMs);
        claimed += claims.length;
        await this.checkRound(claims);
        if (claims.length < atOnce) break;
      }
      await this.deps.repository.purgeExpiredRemovalNotices();
    } catch {
      this.deps.log("SYNTHESIS_CHECK_UNEXPECTED");
    }
  }

  /** The claims of one round, checked together; a removal the round found is reconciled before the next round. */
  private async checkRound(claims: readonly Claim[]): Promise<void> {
    const processClaim = async (claim: Claim): Promise<boolean> => {
      try {
        const ownerRef = await this.deps.repository.ownerRefOfRun(claim.runId);
        if (ownerRef === null) {
          this.deps.log("SYNTHESIS_CHECK_UNEXPECTED");
          return false;
        }
        const texts = await this.deps.withContentLease(claim.runId, () => readSynthesisTexts(claim.answerVersion,
          (version) => this.deps.readAnswer(claim.runId, claim.answerId, version, ownerRef)));
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
        // The check ends at its request's own time plus the window, as the hold does: a debate claimed late (on the gate the
        // worker checks one at a time) gets what is left of its window, not a new window of its own.
        const result = await runSynthesisCheck(this.deps.check, {
          runId: claim.runId, answerId: claim.answerId, answerVersion: claim.answerVersion,
          synthesisText: texts.get(claim.answerVersion) ?? null,
          deadlineAt: new Date(Math.min(claim.requestedAt.getTime(), claim.startedAt.getTime()) + this.deps.deadlineMs)
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
    };
    const byAnswer = new Map<string, Claim[]>();
    for (const claim of claims) {
      const group = byAnswer.get(claim.answerId) ?? [];
      group.push(claim);
      byAnswer.set(claim.answerId, group);
    }
    const removals = await Promise.all([...byAnswer.values()].map(async (group) => {
      const ordered = group.sort((a, b) => a.answerVersion - b.answerVersion);
      let texts: Map<number, string | null> | null = null;
      try {
        const ownerRef = await this.deps.repository.ownerRefOfRun(ordered[0]!.runId);
        if (ownerRef !== null) texts = await this.deps.withContentLease(ordered[0]!.runId,
          () => readSynthesisTexts(ordered[ordered.length - 1]!.answerVersion,
            (version) => this.deps.readAnswer(ordered[0]!.runId, ordered[0]!.answerId, version, ownerRef)));
      } catch { /* processClaim reports the unavailable content for each claim */ }
      const byOrigin = new Map<number, Claim[]>();
      for (const claim of ordered) {
        const origin = texts === null ? 0 : originVersionOf(texts, claim.answerVersion);
        const chain = byOrigin.get(origin) ?? [];
        chain.push(claim);
        byOrigin.set(origin, chain);
      }
      const outcomes = await Promise.all([...byOrigin.values()].map(async (chain) => {
        let removed = false;
        for (const claim of chain) removed = await processClaim(claim) || removed;
        return removed;
      }));
      return outcomes.some(Boolean);
    }));
    if (removals.some(Boolean)) {
      try { await this.deps.erasure.reconcile(100); }
      catch { this.deps.log("SYNTHESIS_CHECK_ERASURE_PENDING"); }
    }
  }
}
