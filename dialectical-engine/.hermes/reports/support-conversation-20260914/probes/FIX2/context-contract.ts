import { readFileSync } from "node:fs";

import {
  loadHelpCorpus,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_CAPABILITIES,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";
import {
  buildSupportKnowledgeContext,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/context.ts";

const contentPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/content";
const manifestPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/reviews/manifest.json";
const corpus = loadHelpCorpus(contentPath, {
  reviewManifest: JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
});

const prompts = [
  ["en-creation", "en", "How do I create a debate?"],
  ["en-settings", "en", "What can I change in Settings?"],
  ["en-export", "en", "How does JSON export work?"],
  ["ro-creation", "ro", "Cum creez o dezbatere?"],
  ["ro-settings", "ro", "Ce pot schimba în Setări?"],
  ["ro-export", "ro", "Cum funcționează exportul JSON?"],
] as const;

for (const [topic, language, query] of prompts) {
  const context = buildSupportKnowledgeContext({
    entries: corpus.entries,
    capabilities: SUPPORT_CAPABILITIES,
    language,
    query,
    historyText: "",
    maxCodePoints: 23_500,
  });
  const routeTokenCount = context.text.match(/route=\//gu)?.length ?? 0;
  process.stdout.write(`${JSON.stringify({
    topic,
    sourceIds: context.sourceIds,
    requestedActionIds: context.requestedActionIds,
    contextCodePoints: [...context.text].length,
    routeTokenCount,
  })}\n`);
}
