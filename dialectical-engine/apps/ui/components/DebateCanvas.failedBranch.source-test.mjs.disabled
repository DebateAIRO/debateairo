import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const canvasSource = readFileSync(join(root, "components", "DebateCanvas.tsx"), "utf8");
const presentationSource = readFileSync(join(root, "lib", "debatePresentation.ts"), "utf8");

test("renderStateOf maps a terminally failed node to the dedicated failed state", () => {
  assert.match(
    presentationSource,
    /ClaimRenderState =[^;]*"failed"/,
    "ClaimRenderState must include the failed render state"
  );
  assert.match(
    presentationSource,
    /=== "failed"\) return "failed"/,
    "renderStateOf must derive the failed state from the node's raw failed status"
  );
});

test("DebateCanvas renders a failed branch honestly instead of a normal claim card", () => {
  assert.match(
    canvasSource,
    /state === "failed"/,
    "DebateCanvas must branch on the failed render state"
  );
  assert.match(canvasSource, /Failed branch/, "Failed branch pill copy must be present");
  assert.match(
    canvasSource,
    /continued without this branch/i,
    "Failed branch copy must say the debate continued without it"
  );
  // A failed branch is already terminally failed -- it must not also carry
  // the deliberate-sounding "Set aside" badge its abandoned path_status
  // would otherwise trigger.
  assert.match(
    canvasSource,
    /setAside && state !== "failed"/,
    "Set aside badge must be suppressed on failed branches"
  );
});
