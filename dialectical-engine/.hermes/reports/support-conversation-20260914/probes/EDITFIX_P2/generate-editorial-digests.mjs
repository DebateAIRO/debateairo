import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  SUPPORT_CAPABILITIES,SUPPORT_CATALOG_CANONICAL
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const mission = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const componentBytes = readFileSync(`${lane}/packages/support-kb/recovery/components.json`);
const document = JSON.parse(componentBytes.toString("utf8"));
const inventory = JSON.parse(readFileSync(
  `${mission}/.hermes/reports/support-conversation-20260914/evidence/PLAN_P2-inventory.json`,"utf8"
));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const origins = new Map(inventory.corpusMembers.map((row) => [row.logicalKey,row.sourceOrigin]));
const components = document.components.map((component) => ({
  logicalKey:`${component.id}.${component.lang}`,id:component.id,lang:component.lang,
  sourceOrigin:origins.get(`${component.id}.${component.lang}`),
  articleSha256:component.articleSha256,
  modelProjectionSha256:sha256(component.modelProjection),
  fallbackSha256:sha256(component.fallback),
  intendedActionIds:[...new Set(SUPPORT_CAPABILITIES
    .filter(({ articleIds }) => articleIds.includes(component.id))
    .flatMap(({ actionIds }) => actionIds))]
}));
if (components.length !== 36 || components.some(({ sourceOrigin }) => sourceOrigin === undefined)) {
  throw new Error("EDITFIX_P2_EDITORIAL_CENSUS_INCOMPLETE");
}
console.log(JSON.stringify({
  schemaVersion:1,status:"UNREVIEWED_COMPONENT_HANDOFF",
  productRevision:"dfeb7eef93de31e19367760d87c09ca1ef76544e",
  componentPath:"packages/support-kb/recovery/components.json",
  componentFileSha256:sha256(componentBytes),
  catalogPath:"packages/support-kb/src/catalog.ts:SUPPORT_CATALOG_CANONICAL",
  catalogSha256:sha256(SUPPORT_CATALOG_CANONICAL),componentCount:components.length,
  ownerRatification:{ ratifiedBy:"",ratifiedOn:"" },components
},null,2));
