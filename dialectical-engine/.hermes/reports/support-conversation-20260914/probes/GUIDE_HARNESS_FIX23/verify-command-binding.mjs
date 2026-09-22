import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";

const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const contractPath = `${evidenceRoot}/GUIDE_HARNESS_FIX23-command-contract.json`;
const predecessorPath = `${evidenceRoot}/GUIDE_HARNESS_BIND21-command-contract.json`;
const proofPath = `${evidenceRoot}/GUIDE_HARNESS_FIX23-binding-proof.json`;
const correctedCapture = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX22/capture-public-guide.mjs";
const ownerOutput = `${evidenceRoot}/GUIDE_LIVE21-owner-capacity.json`;
const phaseNames = ["preflight", "readiness", "capacity", "gate", "rowProof", "capture", "idle"];

function assertSelfBinding(contract, expectedPath) {
  for (const phaseName of phaseNames) {
    assert.equal(contract.phases?.[phaseName]?.argv?.[2], expectedPath, `GUIDE_FIX23_${phaseName.toUpperCase()}_CONTRACT_PATH_INVALID`);
  }
  assert.equal(contract.ownerCapacity?.output, ownerOutput, "GUIDE_FIX23_OWNER_CAPACITY_NOT_VISIBLE");
  assert.equal(contract.phases?.capture?.childArgv?.[3], correctedCapture, "GUIDE_FIX23_CAPTURE_CHILD_INVALID");
}

async function readForDispatch(path, onValidated) {
  const contract = await readFinalContract(path);
  assertSelfBinding(contract, contractPath);
  onValidated();
  return contract;
}

let predecessorActivity = 0;
await assert.rejects(
  readForDispatch(predecessorPath, () => { predecessorActivity += 1; }),
  /GUIDE_FIX23_[A-Z]+_CONTRACT_PATH_INVALID/u,
);
assert.equal(predecessorActivity, 0, "GUIDE_FIX23_PREDECESSOR_ACTIVITY_OCCURRED");

let actualActivity = 0;
const contract = await readForDispatch(contractPath, () => { actualActivity += 1; });
assert.equal(actualActivity, 1, "GUIDE_FIX23_ACTUAL_CONTRACT_NOT_VALIDATED");
const bytes = await readFile(contractPath);
const contractSha256 = createHash("sha256").update(bytes).digest("hex");

const proof = {
  schemaVersion: 1,
  node: "GUIDE_HARNESS_FIX23",
  revision: contract.revision,
  result: "PASS",
  controls: 6,
  passed: 6,
  names: [
    "actual final contract parsed by shared readFinalContract",
    "all seven phase argv[2] values self-bind exact final contract",
    "proof reports SHA-256 of actual final contract bytes",
    "phase1 sees corrected owner-capacity output binding",
    "capture child remains corrected FIX22 source",
    "real predecessor contract fails before operational activity",
  ],
  phaseContractPaths: Object.fromEntries(phaseNames.map((name) => [name, contract.phases[name].argv[2]])),
  commandContractSha256: contractSha256,
  ownerCapacityOutput: contract.ownerCapacity.output,
  captureChild: contract.phases.capture.childArgv[3],
  predecessorNegative: {
    path: predecessorPath,
    operationalActivity: predecessorActivity,
    result: "REJECTED_BEFORE_OPERATIONAL_ACTIVITY",
  },
  operationalTraffic: {
    browser: 0,
    runtime: 0,
    http: 0,
    status: 0,
    capacity: 0,
    database: 0,
    support: 0,
    model: 0,
  },
};

await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ result: proof.result, passed: proof.passed, controls: proof.controls, commandContractSha256: contractSha256 }));
