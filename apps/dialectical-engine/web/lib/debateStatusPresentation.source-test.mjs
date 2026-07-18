import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("frontend status presentation uses one shared abandoned-status normalizer", () => {
  const treeUtils = read("lib/debateTreeUtils.ts");
  const presentation = read("lib/debatePresentation.ts");
  const scoring = read("lib/scoringResponse.ts");
  const drawer = read("components/NodeDetailDrawer.tsx");
  const tree = read("components/DebateTree.tsx");

  assert.match(
    treeUtils,
    /export function isAbandonedArgumentStatus\(rawStatus: string \| null \| undefined\): boolean \{[\s\S]*?return s === "abandoned" \|\| s === "stale" \|\| s === "paused" \|\| s === "stopped";[\s\S]*?\}/
  );
  assert.match(treeUtils, /if \(isAbandonedArgumentStatus\(s\)\) return "abandoned";/);
  assert.match(presentation, /import \{ toArgumentClaimStatus \} from "\.\/debateTreeUtils";/);
  assert.match(scoring, /import \{ toArgumentClaimStatus \} from "\.\/debateTreeUtils";/);
  assert.match(drawer, /import \{ isAbandonedArgumentStatus \} from "@\/lib\/debateTreeUtils";/);
  assert.match(tree, /import \{[^}]*\bisAbandonedArgumentStatus\b[^}]*\} from "@\/lib\/debateTreeUtils";/);

  const duplicateInlineChecks = [presentation, scoring, drawer, tree].filter((source) =>
    /s === "abandoned" \|\| s === "stale" \|\| s === "paused" \|\| s === "stopped"/.test(source)
  );
  assert.equal(duplicateInlineChecks.length, 0);
});

test("drawer and tree share model presentation helpers", () => {
  const helper = read("components/ModelPresentation.tsx");
  const drawer = read("components/NodeDetailDrawer.tsx");
  const tree = read("components/DebateTree.tsx");

  assert.match(helper, /export function ModelMetaLine/);
  assert.match(helper, /export function ModelBadge/);
  assert.match(drawer, /import \{ ModelMetaLine \} from "@\/components\/ModelPresentation";/);
  assert.match(tree, /import \{ ModelBadge, modelColorStyle \} from "@\/components\/ModelPresentation";/);
});
