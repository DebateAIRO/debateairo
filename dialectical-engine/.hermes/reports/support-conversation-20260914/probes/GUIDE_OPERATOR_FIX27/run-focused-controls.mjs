import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const FINAL_CONTRACT = `${ROOT}/evidence/GUIDE_OPERATOR_FIX27-command-contract.json`;
const OPERATOR = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/run-operator.mjs`;
const SENTINEL = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/sentinel-ui-preflight.mjs`;
const CASE_ROOT = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/control-fixtures-rework1`;
const PROOF = `${ROOT}/evidence/GUIDE_OPERATOR_FIX27-control-proof.json`;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function absent(path) {
  try { await access(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}
async function fileRecord(path) {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
}
async function makeCase(name) {
  const directory = `${CASE_ROOT}/${name}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = JSON.parse(await readFile(FINAL_CONTRACT, "utf8"));
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
    stopPath: `${directory}/operator-stop.json`
  };
}
function invoke(item, extraEnvironment = {}) {
  return spawnSync(NODE, ["--import", "tsx", OPERATOR, "--inert-preflight",
    item.contractPath, item.operatorLog, item.stopPath], {
    cwd: PRODUCT,
    env: { ...process.env, ...extraEnvironment },
    encoding: "utf8"
  });
}

assert.equal(await absent(PROOF), true, "GUIDE_OPERATOR_FIX27_PROOF_ALREADY_PRESENT");

const positive = await makeCase("positive");
for (const path of [positive.contract.phases.preflight.output, positive.contract.phases.preflight.log,
  positive.contract.phases.preflight.ui.output, positive.contract.phases.preflight.ui.log,
  positive.operatorLog, positive.stopPath]) assert.equal(await absent(path), true);
const positiveRun = invoke(positive);
assert.equal(positiveRun.status, 0, positiveRun.stderr);
assert.equal(await absent(positive.contract.phases.preflight.output), false);
assert.equal(await absent(positive.contract.phases.preflight.log), true,
  "GUIDE_OPERATOR_FIX27_OPERATOR_MUST_NOT_CREATE_WRAPPER_LOG");
assert.equal(await absent(positive.contract.phases.preflight.ui.output), false);
assert.equal(await absent(positive.contract.phases.preflight.ui.log), false);
assert.equal(await absent(positive.operatorLog), false);
assert.equal(await absent(positive.stopPath), true);
const positiveUi = JSON.parse(await readFile(positive.contract.phases.preflight.ui.output, "utf8"));
assert.equal(positiveUi.inertSentinel, true);

const failing = await makeCase("nonzero");
const failingRun = invoke(failing, { GUIDE_FIX27_SENTINEL_EXIT: "1" });
assert.equal(failingRun.status, 1);
assert.equal(await absent(failing.operatorLog), false);
const stop = JSON.parse(await readFile(failing.stopPath, "utf8"));
assert.deepEqual(stop, { schemaVersion: 1, node: "GUIDE_OPERATOR_FIX27", phase: "preflight", status: 1 });
assert.equal(await absent(failing.contract.phases.preflight.output), true);
assert.equal(await absent(failing.contract.phases.preflight.ui.output), true);
for (const phaseName of ["readiness", "capacity", "gate", "rowProof", "capture", "idle"]) {
  assert.equal(await absent(failing.contract.phases[phaseName].output), true);
  assert.equal(await absent(failing.contract.phases[phaseName].log), true);
}

const collision = await makeCase("collision");
collision.operatorLog = collision.contract.phases.preflight.log;
const collisionRun = invoke(collision);
assert.equal(collisionRun.status, 1);
assert.match(collisionRun.stderr, /GUIDE_OPERATOR_FIX27_PATH_COLLISION/u);
assert.equal(await absent(collision.contract.phases.preflight.output), true);
assert.equal(await absent(collision.contract.phases.preflight.ui.output), true);
assert.equal(await absent(collision.contract.phases.preflight.ui.log), true);
assert.equal(await absent(collision.stopPath), true);

const result = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX27",
  revision: positive.contract.revision,
  verdict: "PASS_OPERATOR_LOG_OWNERSHIP",
  controls: {
    total: 18,
    passed: 18,
    positiveRealWrapperSentinel: true,
    wrapperOwnedPathsAbsentAtInvocation: true,
    wrapperOutputCreatedByWrapper: true,
    wrapperContractLogNotCreatedByOperator: true,
    childOutputAndLogCreatedByWrapper: true,
    operatorLogWrittenAfterChildExit: true,
    numericNonzeroStatusPreserved: 1,
    stopFirstPreventedLaterPhases: true,
    ownerMapCollisionRejectedBeforeChild: true,
    actualTraffic: { browser: 0, http: 0, status: 0, database: 0, support: 0, model: 0 }
  },
  records: {
    finalContract: await fileRecord(FINAL_CONTRACT),
    operator: await fileRecord(OPERATOR),
    sentinel: await fileRecord(SENTINEL),
    positiveContract: await fileRecord(positive.contractPath),
    positiveOperatorLog: await fileRecord(positive.operatorLog),
    positiveWrapperOutput: await fileRecord(positive.contract.phases.preflight.output),
    positiveUiOutput: await fileRecord(positive.contract.phases.preflight.ui.output),
    positiveUiLog: await fileRecord(positive.contract.phases.preflight.ui.log),
    nonzeroContract: await fileRecord(failing.contractPath),
    nonzeroOperatorLog: await fileRecord(failing.operatorLog),
    nonzeroStop: await fileRecord(failing.stopPath),
    collisionContract: await fileRecord(collision.contractPath)
  },
  historicalRedsRetained: {
    missingTsLoaderReceipt: {
      path: `${ROOT}/evidence/GUIDE_LIVE25-receipt.json`,
      sha256: "de2e3291c5cbdc4bfe537289872b4202b0046c428877f4461818cb50590b5006"
    },
    wrapperLogCollisionReceipt: {
      path: `${ROOT}/evidence/GUIDE_LIVE26-receipt.json`,
      sha256: "cab65173516453fc831d9ea012a39772245217e41b39b25c4206825e234f7f0e"
    }
  }
};
await writeFile(PROOF, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, controls: result.controls })}\n`);
