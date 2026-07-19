import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const typesSource = readFileSync(join(root, "lib", "types.ts"), "utf8");
const canvasSource = readFileSync(join(root, "components", "DebateCanvas.tsx"), "utf8");
const drawerSource = readFileSync(join(root, "components", "NodeDetailDrawer.tsx"), "utf8");

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("DebateNode consumes the served path lifecycle fields", () => {
  const debateNode = typesSource.match(/export type DebateNode = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(debateNode, "types.ts should declare DebateNode");
  assert.match(debateNode, /\bpath_status\?: string;/);
  assert.match(debateNode, /\bstopping_status\?: string;/);
  assert.match(debateNode, /\bstopping_reason\?: string \| null;/);
});

test("the drawer explains a lifecycle-set-aside path with its real nonblank reason", () => {
  assert.match(
    drawerSource,
    /function isSetAsidePath\(node: DebateNode\): boolean \{[\s\S]*node\.path_status\?\.trim\(\)\.toLowerCase\(\)[\s\S]*node\.stopping_status\?\.trim\(\)\.toLowerCase\(\)[\s\S]*pathStatus === "abandoned"[\s\S]*stoppingStatus === "abandon"[\s\S]*stoppingStatus === "abandoned"[\s\S]*\}/,
    "The drawer should identify a set-aside path from served lifecycle fields"
  );
  assert.match(
    drawerSource,
    /const stoppingReason = node\.stopping_reason\?\.trim\(\);[\s\S]*\{isSetAsidePath\(node\) && stoppingReason \? \([\s\S]*set aside because: \{stoppingReason\}/,
    "The exact explanation should render only for a set-aside path with a nonblank served reason"
  );
});

test("the canvas defaults set-aside paths to visible and offers a real hide/show filter", () => {
  assert.match(
    canvasSource,
    /const \[showSetAsidePaths, setShowSetAsidePaths\] = useState\(true\);/,
    "Set-aside paths must be shown by default"
  );
  assert.match(
    canvasSource,
    /function isSetAsidePath\(node: DebateNode\): boolean \{[\s\S]*node\.path_status\?\.trim\(\)\.toLowerCase\(\)[\s\S]*node\.stopping_status\?\.trim\(\)\.toLowerCase\(\)[\s\S]*pathStatus === "abandoned"[\s\S]*stoppingStatus === "abandon"[\s\S]*stoppingStatus === "abandoned"[\s\S]*\}/,
    "The filter should identify set-aside paths from lifecycle fields, not scores"
  );
  assert.match(
    canvasSource,
    /function withoutSetAsidePaths\(node: DebateNode\): DebateNode \{[\s\S]*\.filter\(\(child\) => !isSetAsidePath\(child\)\)[\s\S]*\.map\(withoutSetAsidePaths\)[\s\S]*return \{ \.\.\.node, children \};[\s\S]*\}/,
    "Hiding should derive a filtered tree without mutating the served tree"
  );
  assert.match(
    canvasSource,
    /const visibleRoot = showSetAsidePaths \? root : withoutSetAsidePaths\(root\);[\s\S]*layoutTree\(visibleRoot, heightOf\)/,
    "The layout must consume the toggle-selected tree while preserving the original by default"
  );
  assert.match(
    canvasSource,
    /<input[\s\S]*type="checkbox"[\s\S]*checked=\{showSetAsidePaths\}[\s\S]*setShowSetAsidePaths\(event\.currentTarget\.checked\)[\s\S]*Show set-aside paths/,
    "The visible checkbox should control the filter state"
  );
  // W1: terminally failed branches carry path_status "abandoned" too, but the
  // deliberate-sounding "Set aside" badge is suppressed there in favor of the
  // failed-branch card.
  assert.match(
    canvasSource,
    /const setAside = isSetAsidePath\(node\);[\s\S]*data-set-aside=\{setAside \? "true" : undefined\}[\s\S]*\{setAside && state !== "failed" \? \([\s\S]*Set aside/,
    "Canvas cards should expose a lifecycle-derived set-aside badge"
  );
});

test("runtime set-aside copy never labels paths as low value or irrelevant", () => {
  const runtimeCopy = withoutComments(`${canvasSource}\n${drawerSource}`);
  assert.doesNotMatch(runtimeCopy, /["'`][^"'`\r\n]*(?:low value|irrelevant)[^"'`\r\n]*["'`]/i);
});
