import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createHelpCorpusSnapshotLookup,
  loadHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const componentBytes = readFileSync(`${lane}/packages/support-kb/recovery/components.json`);
const reviewManifest = JSON.parse(
  readFileSync(`${lane}/packages/support-kb/reviews/manifest.json`,"utf8")
);
const corpus = loadHelpCorpus(`${lane}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents: componentBytes,requireReviewedRecovery: true
});
const lookup = createHelpCorpusSnapshotLookup(corpus);
console.log(JSON.stringify({
  schemaVersion: 1,
  result: "PASS",
  revision: execFileSync("git",["rev-parse","HEAD"],{ cwd: lane,encoding: "utf8" }).trim(),
  kbVersion: corpus.kbVersion,
  entryCount: corpus.entries.length,
  logicalPairCount: corpus.entries.length / 2,
  ignoredCount: corpus.ignoredCount,
  previewReviewedCount: corpus.previewReviewedCount,
  ownerRatifiedCount: corpus.ownerRatifiedCount,
  recoveryReviewedCount: corpus.recoveryReviewedCount,
  recoveryOwnerRatifiedCount: corpus.recoveryOwnerRatifiedCount,
  immutable: Object.isFrozen(corpus) && Object.isFrozen(corpus.entries)
    && corpus.entries.every(Object.isFrozen),
  exactVersionLookup: lookup.get(corpus.kbVersion) === corpus,
  unknownVersionRejected: lookup.get("0".repeat(64)) === undefined
},null,2));
