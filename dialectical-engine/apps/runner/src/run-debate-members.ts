import type { WalkingSkeletonSettings } from "./index.js";
import type { RunnerVersionSettings } from "./run-settings.js";

/**
 * Side-by-side spec §13 runner point 7 (S5, moved here by S6) — the debate members of one settings version, and their
 * ONE mapping. Type imports only, so index.ts (WalkingSkeletonRunner's per-debate settings, `mergeRunnerSettings`) and
 * run-settings.ts (the loader, main.ts, the practice runner) both use it without an import cycle.
 */

/**
 * The debate members of WalkingSkeletonSettings: every setting a debate's run reads from its settings version. The
 * process members (the worker, the claim times, the provider topology, the scheduler, the money seams, the story
 * writer, the probes) are the process's and stay in main.ts's literal; the release's site members never come from here.
 */
export type RunnerDebateMembers = Pick<WalkingSkeletonSettings, "judgeBound" | "composerBound" | "conformanceBound" |
  "judgeContractHash" | "composerContractHash" | "conformanceContractHash" | "propagationContractHash" |
  "serveContractHash" | "factBundleVersion" | "compositionRow" | "servePolicy" | "judgementPolicy" | "scoringOperator" |
  "runDeathPolicy" | "hiddenNodeScoreThreshold" | "verdictLabelPolicy" | "panelPolicy" | "stoppingPolicy" |
  "synthesisRolePolicy" | "debateShape" | "engine" | "storyPolicy" | "callLaneLimits">;

/**
 * Side-by-side spec §13 runner point 7 — THE DEBATE MEMBERS OF ONE VERSION, written ONCE (main.ts, the practice runner
 * and, from S6, the per-debate cache spread it). `factBundleVersion` is the version itself, so a debate's facts are
 * stamped with the version its settings came from. The preview line-up is not a member: the runner's engine never reads
 * the rosters (admission froze the panel) and only the gateways read the thinking table (addition SA5).
 */
export function runnerSettingsOfVersion(version: RunnerVersionSettings): RunnerDebateMembers {
  const { policy } = version;
  return Object.freeze({
    judgeBound: policy.bounds.JUDGE,
    composerBound: policy.bounds.COMPOSER,
    conformanceBound: policy.bounds.CONFORMANCE,
    judgeContractHash: policy.hashes.judge,
    composerContractHash: policy.hashes.composer,
    conformanceContractHash: policy.hashes.conformance,
    propagationContractHash: policy.hashes.propagation,
    serveContractHash: policy.hashes.serve,
    factBundleVersion: version.registerVersion,
    compositionRow: policy.compositionRow,
    servePolicy: {
      compositionBudgets: policy.compositionBudgets,
      candidateConfidenceBand: policy.candidateConfidenceBand,
      bandCeiling: policy.bandCeiling
    },
    judgementPolicy: policy.judgementPolicy,
    scoringOperator: policy.scoringOperator,
    runDeathPolicy: policy.runDeathPolicy,
    hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
    verdictLabelPolicy: policy.verdictLabelPolicy,
    panelPolicy: policy.panelPolicy,
    stoppingPolicy: policy.stoppingPolicy,
    // S6-2 / T9 (board F33 class): the SHIPPED entry point must LOAD and PASS
    // every register family the run reads. Without this line the claim-time
    // gate refuses every work item and no statement is ever synthesized.
    synthesisRolePolicy: policy.synthesisRolePolicy,
    // Debate shape (spec 2026-10-12 §3): null without the row (today's runner).
    debateShape: version.debateShape,
    // Engine redesign (R1d): null without the engine row (engine 1, today's runner).
    engine: version.engine,
    // Side-by-side spec §13 (S6 reads them): the version's story policy and its debate call lanes.
    storyPolicy: version.storyPolicy,
    callLaneLimits: version.callLaneLimits
  });
}
