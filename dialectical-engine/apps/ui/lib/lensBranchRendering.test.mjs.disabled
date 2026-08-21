import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";

// Regression guard for the "de-quartzed" web rendering path: the UI must render
// ANY number of lens/branch nodes with arbitrary backend node_type strings and
// keep working for the four legacy POV literals -- without baking in exactly
// SCIENTIFIC_POV/STATISTICAL_POV/ETHICAL_POV/PRACTICAL_POV. Mirrors the compiled
// -helper style of debateTreeUtils.test.mjs.

const outDir = join(process.cwd(), ".tmp-lens-branch-rendering-test");

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
  const presentationUrl = pathToFileURL(join(outDir, "lib", "debatePresentation.js")).href;
  const treeUtilsUrl = pathToFileURL(join(outDir, "lib", "debateTreeUtils.js")).href;
  const presentation = await import(`${presentationUrl}?cacheBust=${Date.now()}`);
  const treeUtils = await import(`${treeUtilsUrl}?cacheBust=${Date.now()}`);
  return { ...presentation, ...treeUtils };
}

function node(id, node_type, extra = {}, children = []) {
  return {
    id,
    debate_id: "debate-1",
    parent_id: null,
    node_type,
    depth: 1,
    position: 0,
    claim: id,
    status: "complete",
    materialized_path: id,
    active_generation_id: null,
    active_generation: null,
    children,
    ...extra,
  };
}

test("perspectiveChildren returns every lens branch for a non-four, arbitrary-node_type debate", async () => {
  const { perspectiveChildren } = await loadHelpers();

  const sixLenses = [
    "ECONOMIC_POV",
    "HISTORICAL",
    "LEGAL_LENS",
    "SECURITY",
    "ENVIRONMENTAL_POV",
    "GEOPOLITICAL_ANGLE",
  ];
  const root = node("root", "ROOT_CLAIM", {}, sixLenses.map((t, i) => node(`lens-${i}`, t)));

  assert.equal(
    perspectiveChildren(root).length,
    6,
    "all six arbitrary lens branches must be treated as perspectives, not just four legacy POVs",
  );

  const threeLenses = ["ECONOMIC_POV", "SECURITY", "HISTORICAL"];
  const threeRoot = node("root3", "ROOT_CLAIM", {}, threeLenses.map((t, i) => node(`l3-${i}`, t)));
  assert.equal(perspectiveChildren(threeRoot).length, 3);
});

test("isLensNodeType accepts arbitrary lens types and rejects structural/argument types", async () => {
  const { isLensNodeType } = await loadHelpers();

  for (const lens of ["ECONOMIC_POV", "HISTORICAL", "LEGAL_LENS", "SCIENTIFIC_POV"]) {
    assert.equal(isLensNodeType(lens), true, `${lens} should be a lens/branch node type`);
  }
  for (const structural of ["ROOT_CLAIM", "PRO", "CON", "EVIDENCE"]) {
    assert.equal(isLensNodeType(structural), false, `${structural} must not be treated as a lens`);
  }
});

test("roleOf maps any non-argument node_type to the generic pov role", async () => {
  const { roleOf } = await loadHelpers();

  assert.equal(roleOf(node("a", "ROOT_CLAIM")), "root");
  assert.equal(roleOf(node("b", "PRO")), "pro");
  assert.equal(roleOf(node("c", "CON")), "con");
  for (const lens of ["ECONOMIC_POV", "HISTORICAL", "LEGAL_LENS", "GEOPOLITICAL_ANGLE"]) {
    assert.equal(roleOf(node("x", lens)), "pov", `${lens} should render on the generic pov path`);
  }
});

test("lensLabelFromNodeType derives readable labels for arbitrary lenses and keeps legacy labels", async () => {
  const { lensLabelFromNodeType } = await loadHelpers();

  // Legacy four keep their exact human labels.
  assert.equal(lensLabelFromNodeType("SCIENTIFIC_POV"), "Scientific");
  assert.equal(lensLabelFromNodeType("STATISTICAL_POV"), "Statistical");
  assert.equal(lensLabelFromNodeType("ETHICAL_POV"), "Ethical");
  assert.equal(lensLabelFromNodeType("PRACTICAL_POV"), "Practical");

  // Arbitrary backend lenses derive a real, non-generic label.
  assert.equal(lensLabelFromNodeType("ECONOMIC_POV"), "Economic");
  assert.equal(lensLabelFromNodeType("HISTORICAL"), "Historical");
  assert.equal(lensLabelFromNodeType("LEGAL_LENS"), "Legal Lens");
  assert.equal(lensLabelFromNodeType("GEOPOLITICAL_ANGLE"), "Geopolitical Angle");

  // Only a truly empty/unknown type falls back to the generic label.
  assert.equal(lensLabelFromNodeType(""), "Lens");
  assert.equal(lensLabelFromNodeType(null), "Lens");
});

test("roleLabel and branchLabelOf are data-driven: prefer backend label/lens, else derive", async () => {
  const { roleLabel, branchLabelOf } = await loadHelpers();

  // Derived from node_type when no backend label/lens present.
  assert.equal(roleLabel(node("a", "ECONOMIC_POV")), "Economic");
  assert.equal(roleLabel(node("b", "SCIENTIFIC_POV")), "Scientific");
  assert.notEqual(
    roleLabel(node("c", "ENVIRONMENTAL_POV")),
    "Lens",
    "a named lens must not collapse to the generic fallback",
  );

  // Backend-provided label/lens wins over the derived label.
  assert.equal(branchLabelOf(node("d", "ECONOMIC_POV", { label: "Cost & Markets" })), "Cost & Markets");
  assert.equal(branchLabelOf(node("e", "SOMETHING_NEW", { lens: "Systems view" })), "Systems view");
  assert.equal(roleLabel(node("f", "ANYTHING", { label: "Custom Lens" })), "Custom Lens");

  // Pro/Con/Root routing is unchanged.
  assert.equal(roleLabel(node("g", "PRO")), "Pro");
  assert.equal(roleLabel(node("h", "CON")), "Con");
  assert.equal(roleLabel(node("i", "ROOT_CLAIM")), "Root claim");
});
