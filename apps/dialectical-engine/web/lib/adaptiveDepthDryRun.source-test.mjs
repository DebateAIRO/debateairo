import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPath = path.join(root, "lib", "api.ts");
const typesPath = path.join(root, "lib", "types.ts");
const debatePagePath = path.join(root, "app", "debate", "[id]", "DebatePageClient.tsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const apiSource = fs.readFileSync(apiPath, "utf8");
const typesSource = fs.readFileSync(typesPath, "utf8");
const debatePageSource = fs.readFileSync(debatePagePath, "utf8");

assert(
  /DebateAdaptiveDepthDryRunResponse/.test(typesSource),
  "types.ts should define the adaptive depth dry-run response contract"
);
assert(
  /AdaptiveDepthDryRunPlan/.test(typesSource) && /AdaptiveDepthDryRunItem/.test(typesSource),
  "types.ts should define the nested adaptive depth dry-run plan and item contracts"
);
assert(
  /expansion_hint:\s*AdaptiveDepthExpansionHint/.test(typesSource),
  "AdaptiveDepthDryRunItem should expose the backend expansion_hint field"
);
assert(
  /recommended_action:\s*InvestigationAction \| null/.test(typesSource),
  "AdaptiveDepthDryRunItem should preserve nullable recommended_action from the API"
);

assert(
  /getDebateAdaptiveDepthDryRun/.test(apiSource),
  "api.ts should export getDebateAdaptiveDepthDryRun"
);
assert(
  /\/api\/debates\/\$\{id\}\/scoring\/adaptive-depth\/dry-run/.test(apiSource),
  "getDebateAdaptiveDepthDryRun should call the backend dry-run GET endpoint"
);
assert(
  !/adaptive-depth\/dry-run`[\s\S]{0,180}method:\s*"POST"/.test(apiSource),
  "adaptive depth dry-run helper must not POST or mutate debate state"
);
assert(
  /DebateAdaptiveDepthApprovalRequest/.test(typesSource) &&
    /DebateAdaptiveDepthApprovalResponse/.test(typesSource),
  "types.ts should define the adaptive depth approval request/response contract"
);
assert(
  /approveDebateAdaptiveDepthExpansion/.test(apiSource),
  "api.ts should export approveDebateAdaptiveDepthExpansion"
);
assert(
  /\/api\/debates\/\$\{id\}\/scoring\/adaptive-depth\/approvals/.test(apiSource) &&
    /method:\s*"POST"/.test(apiSource.match(/approveDebateAdaptiveDepthExpansion[\s\S]*?\n}/)?.[0] || ""),
  "approveDebateAdaptiveDepthExpansion should POST to the backend approval endpoint"
);

assert(
  /getDebateAdaptiveDepthDryRun/.test(debatePageSource),
  "DebatePageClient should load the adaptive depth dry-run plan"
);
assert(
  /type AdaptiveDepthDryRunAsyncState/.test(debatePageSource),
  "DebatePageClient should track adaptive depth dry-run loading separately from scoring"
);
assert(
  /function AdaptiveDepthDryRunPanel/.test(debatePageSource),
  "DebatePageClient should render a focused adaptive depth dry-run panel"
);
assert(
  /data-adaptive-depth-dry-run-state=\{adaptiveDepthDryRunState\.status\}/.test(debatePageSource),
  "DebatePageClient should expose the dry-run state for focused UI checks"
);
assert(
  /const items = state\.data\.plan\.items[\s\S]*items\.map/.test(debatePageSource),
  "AdaptiveDepthDryRunPanel should render only items from the API response"
);
assert(
  /No adaptive depth expansions are recommended/.test(debatePageSource),
  "AdaptiveDepthDryRunPanel should show an honest empty state when the API returns no items"
);
const adaptiveDepthDryRunChipSource =
  debatePageSource.match(/function AdaptiveDepthDryRunChip[\s\S]*?\r?\n}\r?\n/s)?.[0] || "";
assert(
  /formatAdaptiveDepthPressure\(item\.pressure\)/.test(adaptiveDepthDryRunChipSource),
  "AdaptiveDepthDryRunChip should visualize branch pressure from each dry-run item"
);
assert(
  /className="adaptiveDepthMeter"/.test(debatePageSource) &&
    /width: formatAdaptiveDepthScore\(item\.score\)/.test(debatePageSource),
  "AdaptiveDepthDryRunChip should visualize branch score from the real dry-run score field"
);
assert(
  /item\.expansion_hint === "expand"/.test(debatePageSource) &&
    /Recommended depth/.test(debatePageSource),
  "AdaptiveDepthDryRunChip should make expansion_hint drive the recommended depth label"
);
assert(
  /item\.reasons\.map\(formatAdaptiveDepthReason\)/.test(debatePageSource) &&
    /item\.hole_count/.test(debatePageSource) &&
    /item\.recommended_investigation_count/.test(debatePageSource) &&
    /item\.node_id/.test(debatePageSource),
  "AdaptiveDepthDryRunChip should render real dry-run reason/count/node fields instead of placeholders"
);
assert(
  /Adaptive depth dry-run unavailable/.test(debatePageSource),
  "AdaptiveDepthDryRunPanel should show an honest unavailable state"
);
assert(
  /approveDebateAdaptiveDepthExpansion/.test(debatePageSource),
  "DebatePageClient should wire the user-approved adaptive expansion action"
);
assert(
  /const actionableItems = items\.filter\(\(item\) => item\.expansion_hint === "expand"\)/.test(debatePageSource),
  "AdaptiveDepthDryRunPanel should approve and run only dry-run items with expansion_hint=expand"
);
assert(
  /Approve and run selected expansions/.test(debatePageSource) &&
    /approvalState\.status === "starting"/.test(debatePageSource),
  "AdaptiveDepthDryRunPanel should expose a clear honest approve-and-run action state"
);
assert(
  !/progress|percent|eta/i.test(debatePageSource.match(/type AdaptiveDepthApprovalState[\s\S]*?;/s)?.[0] || ""),
  "AdaptiveDepthApprovalState should not expose fake progress fields"
);
