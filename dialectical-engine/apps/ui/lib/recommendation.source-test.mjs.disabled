import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recommendationPath = path.join(root, "lib", "recommendation.ts");
const drawerPath = path.join(root, "components", "NodeDetailDrawer.tsx");
const debatePagePath = path.join(root, "app", "debate", "[id]", "DebatePageClient.tsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  fs.existsSync(recommendationPath),
  "recommendation.ts should define the focused top-recommendation helper"
);
const recommendationSource = fs.readFileSync(recommendationPath, "utf8");
assert(
  /export function selectTopRecommendation/.test(recommendationSource),
  "recommendation.ts should export selectTopRecommendation"
);
assert(
  /export function selectAdditionalRecommendations/.test(recommendationSource),
  "recommendation.ts should export selectAdditionalRecommendations"
);
assert(
  /recommended_investigations|RecommendedInvestigation/.test(recommendationSource),
  "selectTopRecommendation should operate on the real scoring recommendation type"
);
assert(
  /reason\.trim\(\)/.test(recommendationSource),
  "selectTopRecommendation should ignore recommendations without displayable reasons"
);
assert(
  /priority/.test(recommendationSource) && /sort/.test(recommendationSource),
  "selectTopRecommendation should select the highest-priority recommendation deterministically"
);
assert(
  /export function formatRecommendationAction/.test(recommendationSource),
  "recommendation.ts should export formatRecommendationAction"
);
assert(
  /target_node_id/.test(recommendationSource),
  "recommendation helpers should preserve the real target_node_id click-through contract"
);

const drawerSource = fs.readFileSync(drawerPath, "utf8");

assert(
  drawerSource.includes("selectTopRecommendation"),
  "NodeDetailDrawer should select one top recommendation from the scoring payload"
);
assert(
  drawerSource.includes("Top recommendation"),
  "NodeDetailDrawer should render a top recommendation section"
);
assert(
  drawerSource.includes("selectAdditionalRecommendations"),
  "NodeDetailDrawer should select additional recommendations from the scoring payload"
);
assert(
  drawerSource.includes("<details") && drawerSource.includes("<summary"),
  "NodeDetailDrawer should render additional recommendations in a compact native disclosure"
);
assert(
  drawerSource.includes("additionalRecommendations.map"),
  "NodeDetailDrawer should render a list of additional recommendations when available"
);
assert(
  drawerSource.includes("onFocusRecommendationNode"),
  "NodeDetailDrawer should expose a compact click-through callback for targeted recommendations"
);
assert(
  drawerSource.includes("const targetClaimId = recommendationTargetClaimId(recommendation)") &&
    /disabled=\{!targetClaimId \|\| !canFocusTarget\}/.test(drawerSource),
  "NodeDetailDrawer should disable recommendation click-through when target_node_id is missing"
);
assert(
  /onFocusRecommendationNode\(targetClaimId\)/.test(drawerSource),
  "NodeDetailDrawer should call the click-through callback with the real target_node_id"
);
assert(
  drawerSource.includes("This recommendation references a claim that is not visible in the current debate tree."),
  "NodeDetailDrawer should explain when a real target_node_id is unavailable in the visible tree"
);
assert(
  drawerSource.includes("Unable to focus that recommendation target because it is no longer visible."),
  "NodeDetailDrawer should show an honest focus-failed message when a visible target disappears before click-through"
);
assert(
  /onFocusRecommendationNode\(targetClaimId\) === false/.test(drawerSource),
  "NodeDetailDrawer should detect failed recommendation focus attempts"
);

const debatePageSource = fs.readFileSync(debatePagePath, "utf8");

assert(
  /function focusRecommendationNode/.test(debatePageSource),
  "DebatePageClient should define a recommendation focus handler"
);
assert(
  /findNode\(debate\?\.tree \?\? null, targetNodeId\)/.test(debatePageSource),
  "DebatePageClient should verify the recommendation target exists in the real debate tree"
);
assert(
  /setSelectedNodeId\(targetNodeId\)/.test(debatePageSource) &&
    /setDetailNodeId\(targetNodeId\)/.test(debatePageSource),
  "DebatePageClient should select and open the real target claim when a recommendation is clicked"
);
assert(
  /showToast\("Recommendation target is no longer visible\."\)/.test(debatePageSource),
  "DebatePageClient should report stale recommendation targets when focus fails"
);
