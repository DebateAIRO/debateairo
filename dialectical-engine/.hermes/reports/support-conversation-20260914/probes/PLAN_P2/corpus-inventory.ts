import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadHelpCorpus } from "../../../../../.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const productRevision = "e0dcfe77f49655bea774bdfacf988b911be4ff06";
const contentDirectory = resolve(
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
  "packages/support-kb/content",
);
const reviewManifestPath = resolve(
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
  "packages/support-kb/reviews/manifest.json",
);
const reviewManifest = JSON.parse(readFileSync(reviewManifestPath, "utf8")) as {
  articles: Array<{
    id: string;
    lang: "en" | "ro";
    sha256: string;
    reviewedBy: string;
    reviewerSession: string;
    reviewedOn: string;
    evidence: string;
  }>;
};
const corpus = loadHelpCorpus(contentDirectory, { reviewManifest });
const reviews = new Map(reviewManifest.articles.map((record) => [
  `${record.id}.${record.lang}`,
  record,
]));
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const entries = corpus.entries.map((entry) => {
  const logicalKey = `${entry.id}.${entry.lang}`;
  const filename = `${logicalKey}.md`;
  const review = reviews.get(logicalKey);
  return {
    logicalKey,
    id: entry.id,
    language: entry.lang,
    title: entry.title,
    status: entry.status,
    sourceOrigin: `packages/support-kb/content/${filename}`,
    sourceDefinitions: entry.sources,
    articleSha256: sha256(readFileSync(resolve(contentDirectory, filename))),
    existingProvenance: review === undefined ? {
      kind: "owner-ratified-article",
      ratifiedBy: entry.ratifiedBy,
      ratifiedOn: entry.ratifiedOn,
      verifiedAgainst: entry.verifiedAgainst,
    } : {
      kind: "sol-reviewed-article",
      reviewedBy: review.reviewedBy,
      reviewerSession: review.reviewerSession,
      reviewedOn: review.reviewedOn,
      evidence: review.evidence,
      reviewedSha256: review.sha256,
      ratifiedBy: entry.ratifiedBy,
      ratifiedOn: entry.ratifiedOn,
      verifiedAgainst: entry.verifiedAgainst,
    },
    proposedRecoveryRecord: "packages/support-kb/recovery/components.json",
  };
});

console.log(JSON.stringify({
  schemaVersion: 1,
  productRevision,
  runtimeCorpus: {
    loader: "packages/support-kb/src/index.ts:loadHelpCorpus",
    apiCaller: "apps/api/src/main.ts",
    statusCaller: "apps/runner/src/support-status-cli.ts",
    filesystemEntryCount: entries.length,
    logicalIdCount: new Set(entries.map(({ id }) => id)).size,
    languageCounts: {
      en: entries.filter(({ language }) => language === "en").length,
      ro: entries.filter(({ language }) => language === "ro").length,
    },
    solReviewedArticleCount: entries.filter(({ existingProvenance }) =>
      existingProvenance.kind === "sol-reviewed-article").length,
    ownerRatifiedArticleCount: entries.filter(({ existingProvenance }) =>
      existingProvenance.kind === "owner-ratified-article").length,
    inCodeRuntimeEntryCount: 0,
    note: "The production API obtains every runtime entry from the filesystem loader; code-defined entries found in tests are fixtures, not shipped runtime corpus members.",
  },
  currentSnapshot: {
    kbVersion: corpus.kbVersion,
    shippedPairCount: corpus.shippedCount,
    ignoredLogicalIdCount: corpus.ignoredCount,
    previewReviewedPairCount: corpus.previewReviewedCount,
    ownerRatifiedPairCount: corpus.ownerRatifiedCount,
    catalogDigest: corpus.catalogDigest,
  },
  entries,
}, null, 2));
