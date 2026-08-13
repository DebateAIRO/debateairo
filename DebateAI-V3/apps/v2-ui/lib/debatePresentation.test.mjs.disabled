import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";

// P4.1: computeLean (web/lib/debatePresentation.ts) is now the CLIENT-SIDE
// STRUCTURAL FALLBACK only -- the backend (coordinator/app/scoring/lean.py)
// prefers a real dialectical-strength reading whenever one exists. This
// guards the fallback's label rule: an exactly-symmetric PRO/CON count (the
// generation contract's permanent guarantee today, per the 2026-07-22 audit)
// must read "Even (structural)", never a bare "Even" that would misrepresent
// a topology artifact as a genuine 50/50 dialectical reading. Mirrors the
// compiled-helper style of debateTreeUtils.test.mjs / lensBranchRendering.
// test.mjs.

const outDir = join(process.cwd(), ".tmp-debate-presentation-test");

function compileHelpers() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand =
    process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/debatePresentation.ts",
    "lib/debateTreeUtils.ts",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--rootDir",
    ".",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--strict",
  ];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tscCommand, ...tscArgs], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync(tscCommand, tscArgs, { cwd: process.cwd(), stdio: "pipe" });
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadHelpers() {
  compileHelpers();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "debatePresentation.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

function node(id, node_type, status = "complete", children = []) {
  return {
    id,
    debate_id: "debate-1",
    parent_id: null,
    node_type,
    depth: 1,
    position: 0,
    claim: `${node_type} ${id}`,
    status,
    materialized_path: id,
    active_generation_id: null,
    active_generation: null,
    children,
  };
}

function root(children) {
  return node("root", "ROOT_CLAIM", "complete", children);
}

test("computeLean returns null for a null tree", async () => {
  const { computeLean } = await loadHelpers();
  assert.equal(computeLean(null), null);
});

test("computeLean returns null when there are no live pro/con nodes", async () => {
  const { computeLean } = await loadHelpers();
  assert.equal(computeLean(root([])), null);
});

test("computeLean labels an exactly-symmetric pro/con split 'Even (structural)'", async () => {
  const { computeLean } = await loadHelpers();
  const tree = root([node("pro-1", "PRO"), node("pro-2", "PRO"), node("con-1", "CON"), node("con-2", "CON")]);
  assert.deepEqual(computeLean(tree), { pct: 50, label: "Even (structural)", source: "structural" });
});

test("computeLean labels a genuinely asymmetric pro-majority split 'Pro', source stays structural", async () => {
  const { computeLean } = await loadHelpers();
  const tree = root([node("pro-1", "PRO"), node("pro-2", "PRO"), node("pro-3", "PRO"), node("con-1", "CON")]);
  assert.deepEqual(computeLean(tree), { pct: 75, label: "Pro", source: "structural" });
});

test("computeLean labels an asymmetric split that still lands in the even band as plain 'Even' (no suffix)", async () => {
  const { computeLean } = await loadHelpers();
  const pros = Array.from({ length: 10 }, (_unused, i) => node(`pro-${i}`, "PRO"));
  const cons = Array.from({ length: 9 }, (_unused, i) => node(`con-${i}`, "CON"));
  const tree = root([...pros, ...cons]);
  const result = computeLean(tree);
  assert.equal(result.label, "Even");
  assert.equal(result.source, "structural");
  assert.equal(result.pct, 53);
});

test("computeLean still excludes abandoned nodes from the count (pre-existing exclusion, unchanged)", async () => {
  const { computeLean } = await loadHelpers();
  const tree = root([node("pro-1", "PRO", "complete"), node("pro-2", "PRO", "abandoned"), node("con-1", "CON", "complete")]);
  // pro-2 is abandoned -> excluded -> 1 live pro vs 1 live con -> symmetric.
  assert.deepEqual(computeLean(tree), { pct: 50, label: "Even (structural)", source: "structural" });
});
