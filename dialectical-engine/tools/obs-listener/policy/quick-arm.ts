import type { PolicyBundle } from "./loader.js";

export type QuickPredicateState = "TRUE" | "FALSE" | "UNSET";
export type QuickPredicateReason =
  | "SATISFIED"
  | "EVIDENCE_UNSET"
  | "FIX13_NOT_VETOED"
  | "HISTORY_BELOW_BOUND"
  | "THRESHOLD_UNSET"
  | "REGISTER_NOT_RATIFIED"
  | "ALLOWLIST_EMPTY"
  | "ALLOWLIST_EVIDENCE_MISSING"
  | "DRILL_NOT_PASSED"
  | "REMOTE_PROTECTION_UNVERIFIED"
  | "RUNTIME_BUILD_REF_UNVERIFIED";

export interface QuickPredicate {
  readonly state: QuickPredicateState;
  readonly reason: QuickPredicateReason;
}

export type QuickRegisterKey =
  | "obs.quickProductionLineCap"
  | "obs.quickTotalLineCap"
  | "obs.blastRadiusMaxReachable"
  | "obs.fingerprintMaturityN"
  | "obs.canaryWindowMs"
  | "obs.lineageDepthMax"
  | "obs.fixCooldownMs";

export interface QuickEntryEvidence {
  readonly fix13Vetoed?: boolean;
  readonly mergedHistory?: Readonly<{
    mergedFixes: number;
    agreementRate: number;
  }>;
  readonly ratifiedRegisters?: Readonly<Partial<Record<QuickRegisterKey, number>>>;
  readonly allowlistEvidence?: readonly Readonly<{
    glob: string;
    evidenceRef: string;
  }>[];
  readonly autoDisableRearmDrillPassed?: boolean;
  readonly remoteBranchProtection?: Readonly<{
    verified: boolean;
    rulesetHash: string | null;
  }>;
  readonly runtimeBuildRefs?: readonly Readonly<{
    runtime: "api" | "runner" | "scheduler";
    buildRef: string;
    commit: string | null;
    verified: boolean;
  }>[];
}

export interface QuickEntryReport {
  readonly schema: "fixagent-quick-entry/v1";
  readonly configured: "OFF" | "ON";
  readonly effective: "OFF";
  readonly reason: "POLICY_OFF" | "ON_HALF_GATED";
  readonly ready: false;
  readonly predicates: Readonly<Record<"a" | "b" | "c" | "d" | "e" | "f" | "g", QuickPredicate>>;
}

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const QUICK_REGISTER_KEYS = Object.freeze([
  "obs.quickProductionLineCap",
  "obs.quickTotalLineCap",
  "obs.blastRadiusMaxReachable",
  "obs.fingerprintMaturityN",
  "obs.canaryWindowMs",
  "obs.lineageDepthMax",
  "obs.fixCooldownMs",
] as const satisfies readonly QuickRegisterKey[]);
const RUNTIMES = Object.freeze(["api", "runner", "scheduler"] as const);

function predicate(state: QuickPredicateState, reason: QuickPredicateReason): QuickPredicate {
  return Object.freeze({ state, reason });
}

function registerNumber(bundle: PolicyBundle, key: string): number | null {
  const entry = bundle.register_seeds.find((candidate) => candidate.key === key);
  return entry !== undefined && typeof entry.value === "number" && Number.isFinite(entry.value)
    ? entry.value
    : null;
}

function fix13Predicate(value: boolean | undefined): QuickPredicate {
  if (value === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  return value
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "FIX13_NOT_VETOED");
}

function historyPredicate(bundle: PolicyBundle, evidence: QuickEntryEvidence["mergedHistory"]): QuickPredicate {
  if (evidence === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  const requiredFixes = registerNumber(bundle, "obs.quickPreconditionMergedFixes");
  const requiredAgreement = registerNumber(bundle, "obs.quickPreconditionAgreementRate");
  if (requiredFixes === null || requiredAgreement === null) return predicate("UNSET", "THRESHOLD_UNSET");
  const valid = Number.isSafeInteger(evidence.mergedFixes) && evidence.mergedFixes >= 0 &&
    Number.isFinite(evidence.agreementRate) && evidence.agreementRate >= 0 && evidence.agreementRate <= 1;
  return valid && evidence.mergedFixes >= requiredFixes && evidence.agreementRate >= requiredAgreement
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "HISTORY_BELOW_BOUND");
}

function registersPredicate(evidence: QuickEntryEvidence["ratifiedRegisters"]): QuickPredicate {
  if (evidence === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  const complete = QUICK_REGISTER_KEYS.every((key) => {
    const value = evidence[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
  return complete
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "REGISTER_NOT_RATIFIED");
}

function allowlistPredicate(bundle: PolicyBundle, evidence: QuickEntryEvidence["allowlistEvidence"]): QuickPredicate {
  if (bundle.allowlist.length === 0) return predicate("FALSE", "ALLOWLIST_EMPTY");
  if (evidence === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  const packets = new Map(evidence.map((entry) => [entry.glob, entry.evidenceRef] as const));
  const complete = packets.size === bundle.allowlist.length && bundle.allowlist.every((glob) => {
    const evidenceRef = packets.get(glob);
    return evidenceRef !== undefined && EVIDENCE_REF.test(evidenceRef);
  });
  return complete
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "ALLOWLIST_EVIDENCE_MISSING");
}

function booleanPredicate(
  value: boolean | undefined,
  falseReason: "DRILL_NOT_PASSED",
): QuickPredicate {
  if (value === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  return value ? predicate("TRUE", "SATISFIED") : predicate("FALSE", falseReason);
}

function protectionPredicate(evidence: QuickEntryEvidence["remoteBranchProtection"]): QuickPredicate {
  if (evidence === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  return evidence.verified && evidence.rulesetHash !== null && HASH.test(evidence.rulesetHash)
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "REMOTE_PROTECTION_UNVERIFIED");
}

function runtimePredicate(evidence: QuickEntryEvidence["runtimeBuildRefs"]): QuickPredicate {
  if (evidence === undefined) return predicate("UNSET", "EVIDENCE_UNSET");
  const byRuntime = new Map(evidence.map((entry) => [entry.runtime, entry] as const));
  const complete = byRuntime.size === RUNTIMES.length && RUNTIMES.every((runtime) => {
    const entry = byRuntime.get(runtime);
    return entry !== undefined && entry.verified && entry.commit !== null && COMMIT.test(entry.commit) &&
      entry.buildRef.length > 0 && !entry.buildRef.startsWith("UNTRACKED-DEV");
  });
  return complete
    ? predicate("TRUE", "SATISFIED")
    : predicate("FALSE", "RUNTIME_BUILD_REF_UNVERIFIED");
}

export function evaluateQuickEntry(
  bundle: PolicyBundle,
  evidence: QuickEntryEvidence = Object.freeze({}),
): QuickEntryReport {
  const predicates = Object.freeze({
    a: fix13Predicate(evidence.fix13Vetoed),
    b: historyPredicate(bundle, evidence.mergedHistory),
    c: registersPredicate(evidence.ratifiedRegisters),
    d: allowlistPredicate(bundle, evidence.allowlistEvidence),
    e: booleanPredicate(evidence.autoDisableRearmDrillPassed, "DRILL_NOT_PASSED"),
    f: protectionPredicate(evidence.remoteBranchProtection),
    g: runtimePredicate(evidence.runtimeBuildRefs),
  });
  return Object.freeze({
    schema: "fixagent-quick-entry/v1",
    configured: bundle.quick_arm,
    effective: "OFF",
    reason: bundle.quick_arm === "OFF" ? "POLICY_OFF" : "ON_HALF_GATED",
    ready: false,
    predicates,
  });
}
