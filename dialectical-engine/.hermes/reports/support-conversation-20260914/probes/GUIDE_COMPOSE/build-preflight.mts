import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const inputPath = `${reportRoot}/evidence/GUIDE_COMPOSE-inputs.json`;
const revision = "9bf56f95711d19e6405fff5db06c4ad3d606bd68";
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const bindFile = (laneRelative: string) => {
  const absolute = `${productRoot}/${laneRelative}`;
  const bytes = readFileSync(absolute);
  return Object.freeze({ laneRelative, absolute, sha256: sha256(bytes), bytes: bytes.length });
};

const inputs = JSON.parse(readFileSync(inputPath, "utf8")) as {
  revision: string;
  files: string[];
  argv: string[];
  inputs: Array<{ path: string; sha256: string; bytes: number }>;
};
if (inputs.revision !== revision) throw new Error("revision mismatch in indexed inputs");
const verifiedInputs = inputs.inputs.map((item) => {
  const bytes = readFileSync(item.path);
  const actual = { sha256: sha256(bytes), bytes: bytes.length };
  return Object.freeze({ ...item, actual, matches: actual.sha256 === item.sha256 && actual.bytes === item.bytes });
});
if (verifiedInputs.some((item) => !item.matches)) throw new Error("indexed input mismatch");
const missingSuites = inputs.files.filter((file) => {
  try { return !statSync(`${productRoot}/${file}`).isFile(); } catch { return true; }
});
if (missingSuites.length > 0) throw new Error(`missing suites: ${missingSuites.join(",")}`);

const { loadHelpCorpus } = await import(pathToFileURL(`${productRoot}/packages/support-kb/src/index.ts`).href);
const manifestBytes = readFileSync(`${productRoot}/packages/support-kb/reviews/manifest.json`);
const componentBytes = readFileSync(`${productRoot}/packages/support-kb/recovery/components.json`);
const corpus = loadHelpCorpus(`${productRoot}/packages/support-kb/content`, {
  reviewManifest: JSON.parse(manifestBytes.toString("utf8")) as unknown,
  recoveryComponents: componentBytes,
  requireReviewedRecovery: true,
});
if (corpus.entries.length !== 44) throw new Error(`entry count ${corpus.entries.length}`);
if (corpus.reviewManifest.recovery === undefined) throw new Error("reviewed recovery missing");
if (corpus.reviewManifest.recovery.components.some((row: { ratifiedBy: string; ratifiedOn: string }) => row.ratifiedBy !== "" || row.ratifiedOn !== "")) {
  throw new Error("owner recovery ratification must remain blank");
}
const logicalRecords = corpus.entries.map((entry: {
  id: string;
  lang: string;
  modelProjection?: string;
  fallback?: string;
  recoveryReview?: {
    articleSha256: string;
    modelProjectionSha256: string;
    fallbackSha256: string;
    reviewedBy: string;
    reviewerSession: string;
    reviewedOn: string;
    evidence: string;
    ratifiedBy: string;
    ratifiedOn: string;
  };
}) => {
  const logicalKey = `${entry.id}.${entry.lang}`;
  const article = bindFile(`packages/support-kb/content/${logicalKey}.md`);
  const review = entry.recoveryReview;
  if (entry.modelProjection === undefined || entry.fallback === undefined || review === undefined) {
    throw new Error(`missing strict reviewed recovery ${logicalKey}`);
  }
  if (article.sha256 !== review.articleSha256) throw new Error(`article digest mismatch ${logicalKey}`);
  if (sha256(entry.modelProjection) !== review.modelProjectionSha256) throw new Error(`projection digest mismatch ${logicalKey}`);
  if (sha256(entry.fallback) !== review.fallbackSha256) throw new Error(`fallback digest mismatch ${logicalKey}`);
  if (review.ratifiedBy !== "" || review.ratifiedOn !== "") throw new Error(`owner fields nonblank ${logicalKey}`);
  return Object.freeze({
    logicalKey,
    article,
    modelProjectionSha256: review.modelProjectionSha256,
    fallbackSha256: review.fallbackSha256,
    review: Object.freeze({
      reviewedBy: review.reviewedBy,
      reviewerSession: review.reviewerSession,
      reviewedOn: review.reviewedOn,
      evidence: review.evidence,
      ratifiedBy: review.ratifiedBy,
      ratifiedOn: review.ratifiedOn,
    }),
  });
});
const timestamp = new Date().toISOString();
const files = Object.freeze({
  component: bindFile("packages/support-kb/recovery/components.json"),
  review: bindFile("packages/support-kb/reviews/manifest.json"),
  catalogSource: bindFile("packages/support-kb/src/catalog.ts"),
  loaderSource: bindFile("packages/support-kb/src/index.ts"),
  rankingSource: bindFile("packages/support-kb/src/context.ts"),
  productionApiSource: bindFile("apps/api/src/main.ts"),
});
const snapshot = {
  schemaVersion: 1,
  status: "MEASURED STRICT REVIEWED RECOVERY SNAPSHOT; NO OWNER ACCEPTANCE",
  node: "GUIDE_COMPOSE",
  ticket: "t_aa345824",
  finalCommit: revision,
  measuredAt: timestamp,
  files,
  snapshot: {
    kbVersion: corpus.kbVersion,
    entryCount: corpus.entries.length,
    logicalPairCount: corpus.shippedCount,
    ignoredCount: corpus.ignoredCount,
    previewReviewedCount: corpus.previewReviewedCount,
    ownerRatifiedCount: corpus.ownerRatifiedCount,
    recoveryReviewedCount: corpus.recoveryReviewedCount,
    recoveryOwnerRatifiedCount: corpus.recoveryOwnerRatifiedCount,
  },
  logicalRecords,
  authority: "measurement-only",
};
writeFileSync(`${reportRoot}/evidence/GUIDE_COMPOSE-snapshot-receipt.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
writeFileSync(`${reportRoot}/evidence/GUIDE_COMPOSE-required-suites.json`, `${JSON.stringify({
  schemaVersion: 1,
  node: "GUIDE_COMPOSE",
  ticket: "t_aa345824",
  revision,
  kbVersion: corpus.kbVersion,
  capturedBeforeExecutionAt: timestamp,
  files: inputs.files,
  argv: inputs.argv,
  status: "PENDING_EXECUTION",
  exitCode: null,
  passed: null,
  failed: null,
  TODO: null,
  log: null,
}, null, 2)}\n`);
writeFileSync(`${reportRoot}/probes/GUIDE_COMPOSE/input-verification.json`, `${JSON.stringify({
  revision,
  verifiedAt: timestamp,
  inputIndex: { absolute: inputPath, sha256: sha256(readFileSync(inputPath)), bytes: statSync(inputPath).size },
  inputs: verifiedInputs,
  suiteFiles: inputs.files.length,
  missingSuites,
  kbVersion: corpus.kbVersion,
  entryCount: corpus.entries.length,
  ownerRecoveryFieldsBlank: true,
}, null, 2)}\n`);
console.log(JSON.stringify({ revision, kbVersion: corpus.kbVersion, entries: corpus.entries.length, inputs: verifiedInputs.length, suites: inputs.files.length }));
