import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  SUPPORT_CAPABILITIES,SUPPORT_CATALOG_CANONICAL
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const mission = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const componentPath = `${lane}/packages/support-kb/recovery/components.json`;
const inventoryPath = `${mission}/.hermes/reports/support-conversation-20260914/evidence/PLAN_P2-inventory.json`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const componentBytes = readFileSync(componentPath);
const document = JSON.parse(componentBytes.toString("utf8"));
const inventory = JSON.parse(readFileSync(inventoryPath,"utf8"));
const origins = new Map(inventory.corpusMembers.map((row) => [row.logicalKey,row.sourceOrigin]));
const rows = document.components.map((component) => ({
  logicalKey: `${component.id}.${component.lang}`,
  id: component.id,
  lang: component.lang,
  sourceOrigin: origins.get(`${component.id}.${component.lang}`),
  articleSha256: component.articleSha256,
  modelProjectionSha256: sha256(component.modelProjection),
  fallbackSha256: sha256(component.fallback),
  intendedActionIds: [...new Set(SUPPORT_CAPABILITIES
    .filter(({ articleIds }) => articleIds.includes(component.id))
    .flatMap(({ actionIds }) => actionIds))]
}));
if (rows.length !== 36 || rows.some(({ sourceOrigin }) => sourceOrigin === undefined)) {
  throw new Error("FIX_P2_EDITORIAL_CENSUS_INCOMPLETE");
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  status: "UNREVIEWED_COMPONENT_HANDOFF",
  productRevision: "f440287179f71e18a4b4b93607951c1e5f862cc1",
  componentPath: "packages/support-kb/recovery/components.json",
  componentFileSha256: sha256(componentBytes),
  catalogPath: "packages/support-kb/src/catalog.ts:SUPPORT_CATALOG_CANONICAL",
  catalogSha256: sha256(SUPPORT_CATALOG_CANONICAL),
  componentCount: rows.length,
  ownerRatification: { ratifiedBy: "",ratifiedOn: "" },
  components: rows
},null,2)}\n`);
