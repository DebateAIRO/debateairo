/**
 * T16 consumer scanner — the DoD's "consumers read register only (no code
 * constants; grep-proof in test)" made DISCRIMINATING (codex T16-r1 B4).
 *
 * The scanner is a pure function over (path, source) pairs so the same code
 * runs against the real consumer surface AND against committed synthetic
 * positive/negative controls. A scan that only bans decimal literals cannot
 * see `const evaluatorLoopMaxRounds = 3`; a scan that bans every integer
 * cannot be lived with. The rules below discriminate: a sealed VALUE anywhere,
 * or a policy IDENTIFIER bound to a LITERAL. Binding a policy identifier to
 * another identifier — `branchingFactor: ENGINE_BRANCHING_FACTOR`, or
 * `maxRounds: controls.evaluatorLoopMaxRounds` — is the lawful consumer form
 * and is never an offence.
 */

export interface PolicySource {
  readonly path: string;
  readonly source: string;
}

export interface PolicyOffence {
  readonly path: string;
  readonly line: number;
  readonly rule: "SEALED_DECIMAL" | "POLICY_IDENTIFIER_LITERAL" | "BAND_VOCABULARY" | "FAMILY_BEHAVIOR";
  readonly detail: string;
}

/**
 * The consumer surface. Register WRITERS are the owners of these values and are
 * excluded by name: `dev-deployment-register.ts` seeds them, and
 * `acceptance/seed-register.ts` is outside every scanned directory.
 */
export const CONSUMER_SOURCE_DIRECTORIES = [
  "packages/judgement/src",
  "packages/serve/src",
  "packages/propagation/src",
  "apps/runner/src",
  "apps/api/src"
] as const;

export const REGISTER_WRITER_FILES = ["apps/runner/src/dev-deployment-register.ts"] as const;

/**
 * Every decimal T16 seals — plus `0.02`, the δ seed D77 (c) superseded, which
 * stays banned so a consumer cannot quietly restate the value the refit moved
 * off. A consumer holding any of these holds a policy.
 */
export const SEALED_DECIMALS = ["0.02", "0.01", "0.005", "0.05", "0.70", "0.7", "0.35", "0.25", "0.5"] as const;

/**
 * Policy identifiers. Row keys plus the value members that name a policy
 * unambiguously. Deliberately EXCLUDES generic names (`delta`, `scale`,
 * `threshold`, `maxRounds`) so unrelated code is not banned — those are caught
 * by their value when they carry a sealed decimal.
 */
export const POLICY_IDENTIFIERS = [
  "globalStopDelta", "branchFreezeEpsilon",
  "verdictMarginGamma", "verdictHighCut", "verdictLowCut",
  "disagreementThreshold", "disagreementQuantity",
  "synthesizerRoleRef", "evaluatorRoleRef", "evaluatorLoopMaxRounds",
  "dispersionScale", "repeatedFamilyMultiplier", "downgradeBands", "providerFamilyMap",
  "envelopeFormulaInputs",
  "highCut", "lowCut", "oneStepDown", "unknownFamilyBehavior",
  "reviewerCallsPerNode", "synthesizerMaxRounds", "evaluatorMaxRounds", "panelCallsPerNodeBasis",
  "branchingFactor", "compositionSegmentCap", "fixedOrgansPerComposition", "maxRecompose"
] as const;

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length;

function pushMatches(
  offences: PolicyOffence[],
  file: PolicySource,
  pattern: RegExp,
  rule: PolicyOffence["rule"],
  describe: (match: RegExpMatchArray) => string
): void {
  for (const match of file.source.matchAll(pattern)) {
    offences.push({
      path: file.path,
      line: lineOf(file.source, match.index ?? 0),
      rule,
      detail: describe(match)
    });
  }
}

export function scanForHardcodedPolicy(files: readonly PolicySource[]): readonly PolicyOffence[] {
  const offences: PolicyOffence[] = [];
  const identifiers = POLICY_IDENTIFIERS.join("|");
  for (const file of files) {
    if ((REGISTER_WRITER_FILES as readonly string[]).includes(file.path)) continue;
    for (const decimal of SEALED_DECIMALS) {
      pushMatches(
        offences,
        file,
        new RegExp(`(?<![\\d.])${decimal.replace(".", "\\.")}(?![\\d])`, "g"),
        "SEALED_DECIMAL",
        () => `carries the sealed value ${decimal}`
      );
    }
    // A policy name bound to a literal number, string, or array.
    pushMatches(
      offences,
      file,
      new RegExp(`\\b(${identifiers})\\s*[:=]\\s*(-?\\d|"|'|\\[|\`)`, "g"),
      "POLICY_IDENTIFIER_LITERAL",
      (match) => `binds the policy identifier ${match[1]} to a literal`
    );
    pushMatches(
      offences,
      file,
      /\[\s*"CAPPED"\s*,\s*"FULL"\s*\]|"FULL"\s*:\s*"CAPPED"/g,
      "BAND_VOCABULARY",
      () => "restates the sealed band vocabulary or its downgrade map"
    );
    pushMatches(
      offences,
      file,
      /EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT|\bfamilyRef\s*[:=]\s*"/g,
      "FAMILY_BEHAVIOR",
      () => "restates the sealed provider-family map or its UNKNOWN behavior"
    );
  }
  return Object.freeze(offences);
}
