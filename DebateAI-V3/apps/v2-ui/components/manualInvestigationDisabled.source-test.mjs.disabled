import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drawerPath = path.join(root, "components", "NodeDetailDrawer.tsx");
const recommendationPath = path.join(root, "lib", "recommendation.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const drawerSource = fs.readFileSync(drawerPath, "utf8");
const recommendationSource = fs.readFileSync(recommendationPath, "utf8");
const manualButtonSource = drawerSource.slice(
  drawerSource.indexOf("function manualInvestigationButton"),
  drawerSource.indexOf("return (", drawerSource.indexOf("function manualInvestigationButton"))
);

assert(
  /manualInvestigationActionState/.test(recommendationSource),
  "recommendation.ts should expose an honest manual-investigation action state helper"
);
assert(
  /ManualInvestigationStatus/.test(recommendationSource) && /status: "unavailable"/.test(recommendationSource),
  "manual-investigation state should use the real queued/unavailable backend status contract"
);
assert(
  recommendationSource.includes("No existing backend orchestration path is wired for ask_user."),
  "ask_user should surface the backend unavailable reason instead of fake orchestration"
);
assert(
  /status: "queued"/.test(recommendationSource),
  "wired manual-investigation actions should remain representable as queued"
);
assert(
  drawerSource.includes("manualInvestigationActionState"),
  "NodeDetailDrawer should derive recommendation action state from the shared helper"
);
assert(
  /disabled=\{manualInvestigationState\.disabled\}/.test(drawerSource),
  "NodeDetailDrawer should disable recommendation actions when manual orchestration is unavailable"
);
assert(
  drawerSource.includes("{manualInvestigationState.label}"),
  "NodeDetailDrawer should render the helper-provided disabled action label"
);
assert(
  drawerSource.includes("{manualInvestigationState.reason}"),
  "NodeDetailDrawer should show the helper-provided concrete unavailable reason"
);
assert(
  !/startManualInvestigation|runManualInvestigation|fake/i.test(drawerSource),
  "NodeDetailDrawer should not introduce a placeholder manual-investigation run flow"
);
assert(
  !/manual-investigations|startManualInvestigation|runManualInvestigation/i.test(recommendationSource),
  "recommendation helpers should not hide a manual-investigation API shim behind the unavailable state"
);
assert(
  manualButtonSource.includes("runFlowWired: false"),
  "manual investigation buttons should explicitly treat the runtime run flow as unavailable"
);
assert(
  !/onClick=|onQueued|set[A-Z][A-Za-z]*(Queued|Progress|Child|Node)|progress|job_id/i.test(manualButtonSource),
  "disabled manual investigation buttons should not create fake jobs, progress, or child-node state"
);
