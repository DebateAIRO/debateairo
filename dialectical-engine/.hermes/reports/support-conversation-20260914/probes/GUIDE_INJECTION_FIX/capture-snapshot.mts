import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const manifest = JSON.parse(readFileSync(resolve(root,"packages/support-kb/reviews/manifest.json"),"utf8"));
const recoveryComponents = readFileSync(resolve(root,"packages/support-kb/recovery/components.json"));
const corpus = loadHelpCorpus(resolve(root,"packages/support-kb/content"),{
  reviewManifest:manifest,recoveryComponents,requireReviewedRecovery:true
});
const lookup = createHelpCorpusSnapshotLookup(corpus);
const result = {
  schemaVersion:1,result:"PASS",revision:"78988fc2e5e24595bd9cd6ec0a3965c6039dc718",
  kbVersion:corpus.kbVersion,entryCount:corpus.entries.length,
  logicalPairCount:corpus.shippedCount,ignoredCount:corpus.ignoredCount,
  previewReviewedCount:corpus.previewReviewedCount,ownerRatifiedCount:corpus.ownerRatifiedCount,
  recoveryReviewedCount:corpus.recoveryReviewedCount,
  recoveryOwnerRatifiedCount:corpus.recoveryOwnerRatifiedCount,
  immutable:Object.isFrozen(corpus) && Object.isFrozen(corpus.entries)
    && corpus.entries.every(Object.isFrozen),
  exactVersionLookup:lookup.get(corpus.kbVersion) === corpus,
  unknownVersionRejected:lookup.get("0".repeat(64)) === undefined
};
if (result.kbVersion !== "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
  || result.entryCount !== 44 || !result.immutable || !result.exactVersionLookup
  || !result.unknownVersionRejected) throw new Error("GUIDE_INJECTION_FIX_SNAPSHOT_INVALID");
console.log(JSON.stringify(result,null,2));
