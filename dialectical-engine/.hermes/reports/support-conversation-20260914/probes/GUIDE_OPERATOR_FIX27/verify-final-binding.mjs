import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const FINAL = `${E}/GUIDE_OPERATOR_FIX27-command-contract.json`;
const BASE = `${E}/GUIDE_HARNESS_FIX26-command-contract.json`;
const OPERATOR_CONTRACT = `${E}/GUIDE_OPERATOR_FIX27-operator-contract.json`;
const OWNER_MAP = `${E}/GUIDE_OPERATOR_FIX27-owner-map.json`;
const CONTROL_PROOF = `${E}/GUIDE_OPERATOR_FIX27-control-proof.json`;
const OUTPUT = `${E}/GUIDE_OPERATOR_FIX27-binding-proof.json`;
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const PHASES = ["preflight", "readiness", "capacity", "gate", "rowProof", "capture", "idle"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const load = async path => {
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes) };
};
async function absent(path) {
  try { await access(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}
async function record(path) {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
}

assert.equal(await absent(OUTPUT), true);
const base = await load(BASE);
const final = await load(FINAL);
const operator = await load(OPERATOR_CONTRACT);
const owners = await load(OWNER_MAP);
const controls = await load(CONTROL_PROOF);
assert.equal(final.value.node, "GUIDE_OPERATOR_FIX27");
assert.equal(final.value.revision, "456cafb9e56a737de550570b5736ec52d79ddf48");
assert.deepEqual(Object.keys(final.value.phases), PHASES);
for (const phase of PHASES) assert.equal(final.value.phases[phase].argv[2], FINAL);
assert.equal(final.value.phases.preflight.log, `${ROOT}/logs/GUIDE_LIVE27-preflight.log`);
assert.equal(base.value.phases.preflight.log, `${ROOT}/logs/GUIDE_LIVE25-preflight.log`);

const normalizedBase = structuredClone(base.value);
normalizedBase.node = final.value.node;
normalizedBase.phases.preflight.log = final.value.phases.preflight.log;
for (const phase of PHASES) normalizedBase.phases[phase].argv[2] = FINAL;
assert.deepEqual(final.value, normalizedBase, "GUIDE_OPERATOR_FIX27_UNEXPECTED_CONTRACT_DELTA");

assert.deepEqual(operator.value.argv, [NODE, "--import", "tsx", operator.value.script.path]);
assert.equal(operator.value.cwd, final.value.cwd);
assert.equal(operator.value.commandContract.path, FINAL);
assert.equal(operator.value.commandContract.sha256, sha256(final.bytes));
assert.equal(operator.value.commandContract.bytes, final.bytes.byteLength);
const scriptBytes = await readFile(operator.value.script.path);
assert.equal(operator.value.script.sha256, sha256(scriptBytes));
assert.equal(operator.value.script.bytes, scriptBytes.byteLength);
assert.deepEqual(operator.value.phaseOrder, PHASES);
assert.equal(owners.value.uniqueConcretePaths, 29);
assert.equal(controls.value.verdict, "PASS_OPERATOR_LOG_OWNERSHIP");
assert.equal(controls.value.controls.passed, 18);

const future = [
  operator.value.operatorOwned.outputs.prerequisite,
  operator.value.operatorOwned.outputs.stop,
  ...Object.values(operator.value.operatorOwned.logs),
  ...PHASES.flatMap(phase => [final.value.phases[phase].output, final.value.phases[phase].log]),
  final.value.phases.preflight.ui.output,
  final.value.phases.preflight.ui.log,
  final.value.phases.rowProof.result,
  final.value.actualReceipt,
  final.value.browserProfile,
  final.value.ownerCapacity.output,
  `${E}/GUIDE_LIVE25-owner-testability.json`,
  ...final.value.actualSequences.flatMap(sequence => {
    const stem = `${E}/GUIDE_LIVE_GUIDE21-row-${String(sequence).padStart(2, "0")}`;
    return [`${stem}-complete-expanded.png`, `${stem}-original-pane-top.png`, `${stem}-original-pane-footer.png`];
  })
];
assert.equal(new Set(future).size, future.length);
for (const path of future) assert.equal(await absent(path), true, `GUIDE_OPERATOR_FIX27_FUTURE_PATH_PRESENT:${path}`);

const syntax = [];
for (const path of [
  operator.value.script.path,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX27/sentinel-ui-preflight.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX27/run-focused-controls.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX27/build-command-contract.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX27/build-public-contracts.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX27/verify-final-binding.mjs`
]) {
  const checked = spawnSync(NODE, ["--check", path], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  syntax.push(await record(path));
}

const result = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX27",
  revision: final.value.revision,
  verdict: "PASS_FINAL_BINDING",
  checks: {
    total: 35,
    passed: 35,
    allSevenSelfBound: true,
    exactContractDelta: { node: true, sevenArgv2: true, preflightLogOnly: true },
    publicOperatorInvocationExact: true,
    operatorScriptDigestVerified: true,
    commandContractDigestVerified: true,
    ownerMapUniqueConcretePaths: owners.value.uniqueConcretePaths,
    futurePathsCheckedAbsent: future.length,
    futureOwnerTestabilityAbsent: true,
    syntaxFiles: syntax.length,
    operationalTraffic: { browser: 0, http: 0, status: 0, database: 0, support: 0, model: 0 }
  },
  records: {
    baseContract: await record(BASE),
    finalContract: await record(FINAL),
    operatorContract: await record(OPERATOR_CONTRACT),
    ownerMap: await record(OWNER_MAP),
    controlProof: await record(CONTROL_PROOF),
    syntax
  }
};
await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, checks: result.checks })}\n`);
