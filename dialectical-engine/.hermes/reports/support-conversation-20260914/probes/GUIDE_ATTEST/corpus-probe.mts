import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine';
const report = '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/reviews/GUIDE_EDITORIAL_RECHECK.md';
const output = '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_ATTEST/corpus.json';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const { loadHelpCorpus } = await import(pathToFileURL(`${root}/packages/support-kb/src/index.ts`).href);
const manifestBytes = readFileSync(`${root}/packages/support-kb/reviews/manifest.json`);
const componentBytes = readFileSync(`${root}/packages/support-kb/recovery/components.json`);
const reviewManifest = JSON.parse(manifestBytes.toString('utf8'));
const corpus = loadHelpCorpus(`${root}/packages/support-kb/content`, {
  reviewManifest,
  recoveryComponents: componentBytes,
  requireReviewedRecovery: true,
});
const guideIds = new Set(['app-navigation','debate-workspace-menus','settings-help-menus','support-status-limits']);
const guideRecords = corpus.reviewManifest.recovery?.components.filter((row: { id: string }) => guideIds.has(row.id)) ?? [];
if (guideRecords.length !== 8) throw new Error(`guide record count ${guideRecords.length}`);
for (const row of guideRecords) {
  if (row.reviewedBy !== 'SOL' || row.reviewerSession !== '01a09ef7-e096-7c31-9b35-806840028cf0' || row.reviewedOn !== '2026-09-17' || row.evidence !== report || row.ratifiedBy !== '' || row.ratifiedOn !== '') {
    throw new Error(`invalid guide binding ${row.id}.${row.lang}`);
  }
}
if (sha256(corpus.manifest) !== corpus.kbVersion) throw new Error('kbVersion does not bind canonical manifest');
const result = {
  schemaVersion: corpus.reviewManifest.schemaVersion,
  articleReviewCount: corpus.reviewManifest.articles.length,
  recoveryReviewRecordCount: corpus.reviewManifest.recovery?.components.length ?? 0,
  admittedEntryCount: corpus.entries.length,
  admittedLogicalPairCount: corpus.shippedCount,
  ignoredCount: corpus.ignoredCount,
  previewReviewedCount: corpus.previewReviewedCount,
  ownerRatifiedCount: corpus.ownerRatifiedCount,
  recoveryReviewedCount: corpus.recoveryReviewedCount,
  recoveryOwnerRatifiedCount: corpus.recoveryOwnerRatifiedCount,
  guideRecordCount: guideRecords.length,
  guideOwnerRatifiedCount: guideRecords.filter((row: { ratifiedBy: string; ratifiedOn: string }) => row.ratifiedBy !== '' || row.ratifiedOn !== '').length,
  manifestFileSha256: sha256(manifestBytes),
  componentFileSha256: sha256(componentBytes),
  canonicalCorpusDigest: sha256(corpus.manifest),
  kbVersion: corpus.kbVersion,
  immutable: Object.isFrozen(corpus) && Object.isFrozen(corpus.entries) && Object.isFrozen(corpus.reviewManifest) && Object.isFrozen(corpus.reviewManifest.recovery) && Object.isFrozen(corpus.reviewManifest.recovery?.components),
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
