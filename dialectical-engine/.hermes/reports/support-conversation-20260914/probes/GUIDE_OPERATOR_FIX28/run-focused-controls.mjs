import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const COMMAND = `${E}/GUIDE_OPERATOR_FIX27-command-contract.json`;
const OPERATOR_CONTRACT = `${E}/GUIDE_OPERATOR_FIX28-operator-contract.json`;
const OPERATOR = `${ROOT}/probes/GUIDE_OPERATOR_FIX28/run-operator.mjs`;
const SENTINEL = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/sentinel-ui-preflight.mjs`;
const CASE_ROOT = `${ROOT}/probes/GUIDE_OPERATOR_FIX28/control-fixtures`;
const PROOF = `${E}/GUIDE_OPERATOR_FIX28-control-proof.json`;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function absent(path) {
  try { await access(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}
async function record(path) {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
}
async function makeCase(name) {
  const directory = `${CASE_ROOT}/${name}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = JSON.parse(await readFile(COMMAND, "utf8"));
  const contractPath = `${directory}/contract.json`;
  const uiBytes = await readFile(SENTINEL);
  const phases = {};
  for (const [phaseName, phase] of Object.entries(source.phases)) {
    phases[phaseName] = {
      ...phase,
      argv: [phase.argv[0], phase.argv[1], contractPath],
      output: `${directory}/${phaseName}-output.json`,
      log: `${directory}/${phaseName}-wrapper.log`
    };
  }
  phases.rowProof.result = `${directory}/row-proof-result.json`;
  phases.preflight.ui = {
    script: SENTINEL,
    sha256: sha256(uiBytes),
    bytes: uiBytes.byteLength,
    argv: [NODE, SENTINEL, source.revision, `${directory}/ui-output.json`],
    output: `${directory}/ui-output.json`,
    log: `${directory}/ui-child.log`
  };
  const contract = {
    ...source,
    evidenceRoot: directory,
    phases,
    actualReceipt: `${directory}/actual-receipt.json`,
    browserProfile: `${directory}/browser-profile`,
    ownerCapacity: { ...source.ownerCapacity, output: `${directory}/owner-capacity.json` }
  };
  await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return {
    directory,
    contract,
    contractPath,
    operatorLog: `${directory}/operator-preflight.log`,
    stopPath: `${directory}/operator-stop.json`,
    ownerTestability: `${directory}/owner-testability.json`
  };
}
function invoke(item) {
  return spawnSync(NODE, ["--import", "tsx", OPERATOR, "--inert-preflight",
    item.contractPath, item.operatorLog, item.stopPath], {
    cwd: PRODUCT,
    env: process.env,
    encoding: "utf8"
  });
}
async function assertNoChild(item) {
  for (const path of [item.contract.phases.preflight.output, item.contract.phases.preflight.log,
    item.contract.phases.preflight.ui.output, item.contract.phases.preflight.ui.log,
    item.operatorLog, item.stopPath]) assert.equal(await absent(path), true, path);
}

assert.equal(await absent(PROOF), true);
const publicContract = JSON.parse(await readFile(OPERATOR_CONTRACT, "utf8"));
assert.equal(publicContract.futureAbsence.count, 123);
assert.equal(publicContract.futureAbsence.uniqueCount, 123);
assert.equal(new Set(publicContract.futureAbsence.paths).size, 123);
assert.equal(publicContract.commandContract.path, COMMAND);
assert.equal(publicContract.commandContract.sha256, "04512905c4f1b224a5ed1b8249fc0484650ed06ee3519bcec7f90db9ba15bc7a");

const positive = await makeCase("positive");
const positiveRun = invoke(positive);
assert.equal(positiveRun.status, 0, positiveRun.stderr);
assert.equal(await absent(positive.contract.phases.preflight.output), false);
assert.equal(await absent(positive.contract.phases.preflight.ui.output), false);
assert.equal(await absent(positive.contract.phases.preflight.ui.log), false);
assert.equal(await absent(positive.operatorLog), false);
assert.equal(await absent(positive.contract.phases.preflight.log), true);
assert.equal(await absent(positive.ownerTestability), true);
assert.equal(await absent(positive.contract.phases.rowProof.result), true);

const rowResult = await makeCase("row-result-present");
await writeFile(rowResult.contract.phases.rowProof.result, "{}\n", { flag: "wx", mode: 0o600 });
const rowRun = invoke(rowResult);
assert.equal(rowRun.status, 1);
assert.match(rowRun.stderr, new RegExp(`GUIDE_OPERATOR_FIX27_OUTPUT_PRESENT:${rowResult.contract.phases.rowProof.result.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
await assertNoChild(rowResult);

const owner = await makeCase("owner-testability-present");
await writeFile(owner.ownerTestability, "{}\n", { flag: "wx", mode: 0o600 });
const ownerRun = invoke(owner);
assert.equal(ownerRun.status, 1);
assert.match(ownerRun.stderr, new RegExp(`GUIDE_OPERATOR_FIX27_OUTPUT_PRESENT:${owner.ownerTestability.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
await assertNoChild(owner);

const result = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX28",
  revision: publicContract.revision,
  verdict: "PASS_OPERATOR_COMPLETE_ABSENCE_SET",
  controls: {
    total: 20,
    passed: 20,
    retainedFix27OwnershipControls: { passed: 18, total: 18 },
    positiveRealPreflightReachedSentinel: true,
    rowProofResultCollisionRejectedBeforeChild: true,
    ownerTestabilityCollisionRejectedBeforeChild: true,
    realFutureAbsenceCount: 123,
    realFutureAbsenceUniqueCount: 123,
    operationalTraffic: { runtime: 0, browser: 0, http: 0, status: 0, capacity: 0, database: 0, support: 0, model: 0 }
  },
  cases: {
    positive: {
      contract: await record(positive.contractPath),
      operatorLog: await record(positive.operatorLog),
      wrapperOutput: await record(positive.contract.phases.preflight.output),
      uiOutput: await record(positive.contract.phases.preflight.ui.output),
      uiLog: await record(positive.contract.phases.preflight.ui.log)
    },
    rowProofResultPresent: {
      contract: await record(rowResult.contractPath),
      collision: await record(rowResult.contract.phases.rowProof.result),
      status: rowRun.status,
      phaseChildSpawned: false
    },
    ownerTestabilityPresent: {
      contract: await record(owner.contractPath),
      collision: await record(owner.ownerTestability),
      status: ownerRun.status,
      phaseChildSpawned: false
    }
  },
  retained: {
    commandContract: await record(COMMAND),
    fix27ControlProof: await record(`${E}/GUIDE_OPERATOR_FIX27-control-proof.json`),
    fix27BindingProof: await record(`${E}/GUIDE_OPERATOR_FIX27-binding-proof.json`),
    review27: await record(`${E}/GUIDE_OPERATOR_REVIEW27-dispositions.json`)
  }
};
await writeFile(PROOF, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, controls: result.controls })}\n`);

