import { readFileSync } from "node:fs";

const missionRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const laneRoot = `${missionRoot}/.worktrees/support-conversation-cp1/dialectical-engine`;
const evidenceRoot = `${missionRoot}/.hermes/reports/support-conversation-20260914`;
const corpus = JSON.parse(readFileSync(`${evidenceRoot}/logs/PLAN_P2-corpus-inventory.log`, "utf8"));

const withAbsolute = (paths) => paths.map((laneRelative) => ({
  laneRelative,
  absolute: `${laneRoot}/${laneRelative}`,
}));

const fixProductPaths = [
  "packages/support-kb/src/index.ts",
  "packages/support-kb/src/recovery.ts",
  "packages/support-kb/src/context.ts",
  "packages/support-kb/recovery/components.json",
  "apps/api/src/main.ts",
  "apps/api/src/support/answer.ts",
  "apps/api/src/support/response-policy.ts",
  "packages/kernel/src/support-credentials.ts",
  "packages/kernel/src/support-text-views.ts",
  "apps/runner/src/support-status-cli.ts",
  "tests/unit/support-kb.test.ts",
  "tests/unit/support-recovery-components.test.ts",
  "tests/unit/support-context.test.ts",
  "tests/unit/support-answer-context.test.ts",
  "tests/unit/support-credentials.test.ts",
  "tests/unit/support-redaction.test.ts",
  "tests/unit/support-response-policy.test.ts",
  "tests/unit/support-text-views.test.ts",
  "tests/integration/support-routes.test.ts",
  "tests/integration/support-cases.test.ts",
  "tests/integration/support-metrics.test.ts",
];

const attestProductPaths = [
  "packages/support-kb/reviews/manifest.json",
  "tests/unit/support-recovery-attestation.test.ts",
];

const retainedTests = [
  "tests/unit/support-kb.test.ts",
  "tests/unit/support-context.test.ts",
  "tests/unit/support-navigation.test.ts",
  "tests/architecture/support-catalog-coverage.test.ts",
  "tests/unit/support-response-policy.test.ts",
  "tests/unit/support-classify.test.ts",
  "tests/unit/support-security-guidance.test.ts",
  "tests/unit/support-model.test.ts",
  "tests/unit/support-escalation.test.ts",
  "tests/integration/support-routes.test.ts",
  "tests/integration/support-metrics.test.ts",
  "tests/integration/support-degraded.test.ts",
  "tests/integration/support-relay-reservations.test.ts",
  "tests/render/sup-01-help.test.tsx",
  "tests/integration/support-config-convergence.test.ts",
  "tests/integration/support-own-context.test.ts",
  "tests/integration/support-shred.test.ts",
  "tests/unit/support-answer-context.test.ts",
  "tests/unit/support-redaction.test.ts",
  "tests/integration/support-cases.test.ts",
  "tests/unit/support-credentials.test.ts",
  "tests/unit/support-model-references.test.ts",
  "tests/unit/support-text-views.test.ts",
];
const newTests = [
  "tests/unit/support-recovery-components.test.ts",
  "tests/unit/support-recovery-attestation.test.ts",
];

const inventory = {
  schemaVersion: 1,
  node: "PLAN_P2",
  productRevision: corpus.productRevision,
  roots: { missionAbsolute: missionRoot, laneAbsolute: laneRoot, evidenceAbsolute: evidenceRoot },
  census: corpus.runtimeCorpus,
  currentSnapshot: corpus.currentSnapshot,
  corpusMembers: corpus.entries.map((entry) => ({
    ...entry,
    sourceOriginAbsolute: `${laneRoot}/${entry.sourceOrigin}`,
    proposedRecoveryLogicalKey: entry.logicalKey,
  })),
  recoveryComponentSchema: {
    laneRelativePath: "packages/support-kb/recovery/components.json",
    absolutePath: `${laneRoot}/packages/support-kb/recovery/components.json`,
    topLevelExactKeys: ["schemaVersion", "components"],
    recordExactKeys: ["id", "lang", "articleSha256", "modelProjection", "fallback"],
    recordCount: 36,
    reviewRecordExactKeys: [
      "id", "lang", "articleSha256", "modelProjectionSha256", "fallbackSha256",
      "reviewedBy", "reviewerSession", "reviewedOn", "evidence", "ratifiedBy", "ratifiedOn",
    ],
    reviewedByRequiredValue: "SOL",
    ownerRatificationAtImplementation: { ratifiedBy: "", ratifiedOn: "" },
  },
  writeOwnership: {
    FIX_P2: {
      purpose: "Implement code, tests, and exact unreviewed component bytes; the corpus remains ineligible until a later valid attestation.",
      productPaths: withAbsolute(fixProductPaths),
      productPathCount: fixProductPaths.length,
    },
    EDIT_P2: {
      purpose: "A separate Sol reviewer reviews the exact component bytes and emits evidence; it does not edit product or provenance.",
      missionPaths: [{
        missionRelative: "docs/missions/support-conversation-20260914/reviews/EDITORIAL-RECOVERY-p1.md",
        absolute: `${missionRoot}/docs/missions/support-conversation-20260914/reviews/EDITORIAL-RECOVERY-p1.md`,
      }],
      productPathCount: 0,
    },
    ATTEST_P2: {
      purpose: "Copy only actual review identity/evidence and exact hashes into manifest schema v2, then verify the real production corpus.",
      productPaths: withAbsolute(attestProductPaths),
      productPathCount: attestProductPaths.length,
    },
  },
  tests: {
    retainedFromLIVE_P1: withAbsolute(retainedTests),
    retainedCount: retainedTests.length,
    new: withAbsolute(newTests),
    newCount: newTests.length,
    finalIntegratedUnion: withAbsolute([...retainedTests, ...newTests]),
    finalIntegratedCount: retainedTests.length + newTests.length,
    fixP2WrittenTests: withAbsolute(fixProductPaths.filter((path) => path.startsWith("tests/"))),
    attestP2WrittenTests: withAbsolute(attestProductPaths.filter((path) => path.startsWith("tests/"))),
  },
  exclusions: {
    productionInCodeEntries: [],
    testOnlyOrLegacyHarnesses: [{
      laneRelative: "tests/support-eval/run.ts",
      absolute: `${laneRoot}/tests/support-eval/run.ts`,
      reason: "Test harness only; it is not a production corpus caller or CP1 live-admission authority.",
    }],
  },
};

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
