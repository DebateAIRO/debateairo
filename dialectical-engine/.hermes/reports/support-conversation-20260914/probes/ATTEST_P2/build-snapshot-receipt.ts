import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createHelpCorpusSnapshotLookup,
  loadHelpCorpus,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const mission = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const lane = `${mission}/.worktrees/support-conversation-cp1/dialectical-engine`;
const output = `${mission}/.hermes/reports/support-conversation-20260914/evidence/ATTEST_P2-snapshot-receipt.json`;
const baseRevision = "dfeb7eef93de31e19367760d87c09ca1ef76544e";
const attestationCommit = "c7e50817d6d2ee744e7acdc7c7ff007f1c842c3f";
const finalCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: lane, encoding: "utf8" }).trim();
const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const fileFacts = (laneRelative: string) => {
  const absolute = join(lane, laneRelative);
  const bytes = readFileSync(absolute);
  return { laneRelative, absolute, sha256: sha256(bytes), bytes: statSync(absolute).size };
};

const contentDirectory = `${lane}/packages/support-kb/content`;
const componentFile = fileFacts("packages/support-kb/recovery/components.json");
const reviewFile = fileFacts("packages/support-kb/reviews/manifest.json");
const catalogSourceFile = fileFacts("packages/support-kb/src/catalog.ts");
const loaderSourceFile = fileFacts("packages/support-kb/src/index.ts");
const rankingSourceFile = fileFacts("packages/support-kb/src/context.ts");
const apiSourceFile = fileFacts("apps/api/src/main.ts");
const componentDocument = JSON.parse(readFileSync(componentFile.absolute, "utf8")) as {
  components: Array<{
    id: string;
    lang: "en" | "ro";
    articleSha256: string;
    modelProjection: string;
    fallback: string;
  }>;
};
const reviewManifest = JSON.parse(readFileSync(reviewFile.absolute, "utf8")) as {
  schemaVersion: number;
  recovery: {
    componentFileSha256: string;
    components: Array<{
      id: string;
      lang: "en" | "ro";
      articleSha256: string;
      modelProjectionSha256: string;
      fallbackSha256: string;
      reviewedBy: string;
      reviewerSession: string;
      reviewedOn: string;
      evidence: string;
      ratifiedBy: string;
      ratifiedOn: string;
    }>;
  };
};
const corpus = loadHelpCorpus(contentDirectory, {
  reviewManifest,
  recoveryComponents: readFileSync(componentFile.absolute),
  requireReviewedRecovery: true,
});
const lookup = createHelpCorpusSnapshotLookup(corpus);
if (finalCommit !== "606b2eabea1dc9212159e53c193cf69655424e77") {
  throw new Error(`unexpected final commit ${finalCommit}`);
}
if (reviewManifest.schemaVersion !== 2 || reviewManifest.recovery.components.length !== 36) {
  throw new Error("expected schema v2 with 36 recovery review rows");
}
if (reviewManifest.recovery.componentFileSha256 !== componentFile.sha256) {
  throw new Error("review does not bind exact component file bytes");
}
if (lookup.get(corpus.kbVersion) !== corpus || lookup.get("0".repeat(64)) !== undefined) {
  throw new Error("snapshot lookup did not preserve exact-version isolation");
}

const reviews = new Map(
  reviewManifest.recovery.components.map((row) => [`${row.id}.${row.lang}`, row]),
);
const logicalRecords = componentDocument.components.map((component) => {
  const logicalKey = `${component.id}.${component.lang}`;
  const review = reviews.get(logicalKey);
  if (review === undefined) throw new Error(`missing review for ${logicalKey}`);
  const article = fileFacts(`packages/support-kb/content/${logicalKey}.md`);
  const projectionSha256 = sha256(component.modelProjection);
  const fallbackSha256 = sha256(component.fallback);
  if (
    article.sha256 !== component.articleSha256
    || review.articleSha256 !== component.articleSha256
    || review.modelProjectionSha256 !== projectionSha256
    || review.fallbackSha256 !== fallbackSha256
    || review.ratifiedBy !== ""
    || review.ratifiedOn !== ""
  ) {
    throw new Error(`hash or review mismatch for ${logicalKey}`);
  }
  return {
    logicalKey,
    article: {
      laneRelative: article.laneRelative,
      absolute: article.absolute,
      sha256: article.sha256,
    },
    modelProjectionSha256: projectionSha256,
    fallbackSha256,
    review: {
      reviewedBy: review.reviewedBy,
      reviewerSession: review.reviewerSession,
      reviewedOn: review.reviewedOn,
      evidence: review.evidence,
      ratifiedBy: review.ratifiedBy,
      ratifiedOn: review.ratifiedOn,
    },
  };
});

const finalUnionPath = `${mission}/.hermes/reports/support-conversation-20260914/evidence/FIX_P2-required-suites.json`;
const receipt = {
  schemaVersion: 1,
  status: "ADMITTED SNAPSHOT READY FOR LIVE PRE-REQUEST PINNING",
  node: "ATTEST_P2",
  ticket: "t_51e73096",
  sourceRevision: "446c685e977104ecf2b0b5ee0519f7123968429f",
  baseRevision,
  attestationCommit,
  finalCommit,
  reviewBinding: {
    verdict: "PASS",
    reviewedBy: "SOL",
    reviewerModel: "gpt-5.6-sol",
    reviewerAgent: "/root/baseline",
    reviewerSession: "01a09ef7-e096-7c31-9b35-806840028cf0",
    reviewedOn: "2026-09-15",
    evidence: `${mission}/docs/missions/support-conversation-20260914/reviews/EDITORIAL-RECOVERY-p2.md`,
    evidenceSha256: sha256(readFileSync(`${mission}/docs/missions/support-conversation-20260914/reviews/EDITORIAL-RECOVERY-p2.md`)),
    ownerRatification: { records: 0, ratifiedBy: "", ratifiedOn: "" },
  },
  files: {
    component: componentFile,
    review: reviewFile,
    catalogSource: catalogSourceFile,
    loaderSource: loaderSourceFile,
    rankingSource: rankingSourceFile,
    productionApiSource: apiSourceFile,
    contentDirectory,
  },
  catalogDigests: {
    canonicalCatalogSha256: corpus.catalogDigest,
    catalogSourceFileSha256: catalogSourceFile.sha256,
    distinction: "canonicalCatalogSha256 hashes SUPPORT_CATALOG_CANONICAL; catalogSourceFileSha256 hashes catalog.ts file bytes",
  },
  snapshot: {
    kbVersion: corpus.kbVersion,
    canonicalManifestSha256: sha256(corpus.manifest),
    canonicalManifestBytes: Buffer.byteLength(corpus.manifest, "utf8"),
    entryCount: corpus.entries.length,
    counts: {
      shippedPairs: corpus.shippedCount,
      ignoredPairs: corpus.ignoredCount,
      solReviewedArticlePairs: corpus.previewReviewedCount,
      ownerRatifiedArticlePairs: corpus.ownerRatifiedCount,
      solReviewedRecoveryPairs: corpus.recoveryReviewedCount,
      ownerRatifiedRecoveryPairs: corpus.recoveryOwnerRatifiedCount,
    },
    immutableChecks: {
      corpus: Object.isFrozen(corpus),
      entries: Object.isFrozen(corpus.entries),
      allEntries: corpus.entries.every(Object.isFrozen),
      reviewManifest: Object.isFrozen(corpus.reviewManifest),
      recoveryReviews: Object.isFrozen(corpus.reviewManifest.recovery?.components),
      exactVersionLookup: lookup.get(corpus.kbVersion) === corpus,
      unknownVersionRejected: lookup.get("0".repeat(64)) === undefined,
    },
  },
  logicalRecords,
  deterministicEntryPoints: {
    strictLoader: "packages/support-kb/src/index.ts:loadHelpCorpus(..., { requireReviewedRecovery: true })",
    immutableLookup: "packages/support-kb/src/index.ts:createHelpCorpusSnapshotLookup",
    ranking: "packages/support-kb/src/context.ts:buildSupportKnowledgeContext",
    productionInitialization: "apps/api/src/main.ts loads exact content/review/component files in strict mode before creating the lookup",
  },
  livePreRequestPinningProtocol: {
    order: [
      "Load the final content, component and review paths above with requireReviewedRecovery=true.",
      "Require the resulting kbVersion to equal snapshot.kbVersion before any request.",
      "Resolve that same version through createHelpCorpusSnapshotLookup; reject absent or stale versions.",
      "Run buildSupportKnowledgeContext over that immutable snapshot with the request language and sanitized query before traffic.",
      "Capture context.sourceIds[0] as the pre-request top source and verify it is represented by the matching language logical record above.",
      "Only then issue the single LIVE request; do not derive the pin from returned response source IDs.",
    ],
    responseDerivedPinningForbidden: true,
    concurrentOrAmbiguousAttribution: "LIVE must keep its existing request-local diagnostic cursor/window rules; this receipt establishes bytes and pre-request selection, not an API-event join.",
  },
  finalSuiteUnion: {
    path: finalUnionPath,
    sha256: sha256(readFileSync(finalUnionPath)),
    count: 25,
    owner: "LIVE_P2",
  },
  limits: [
    "This receipt contains no model response, credential, or capability payload.",
    "No model, provider, browser, preview, or HTTP traffic was used to create it.",
    "Recovery records are separately Sol-reviewed and have blank owner ratification.",
    "Forgot password destination remains unresolved; CP1 is not accepted.",
  ],
};
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ output, finalCommit, kbVersion: corpus.kbVersion, records: logicalRecords.length, counts: receipt.snapshot.counts }));
