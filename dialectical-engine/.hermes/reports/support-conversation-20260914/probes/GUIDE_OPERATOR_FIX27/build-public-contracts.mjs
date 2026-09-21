import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const L = `${ROOT}/logs`;
const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const SCRIPT = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/run-operator.mjs`;
const COMMAND_CONTRACT = `${E}/GUIDE_OPERATOR_FIX27-command-contract.json`;
const OPERATOR_CONTRACT = `${E}/GUIDE_OPERATOR_FIX27-operator-contract.json`;
const OWNER_MAP = `${E}/GUIDE_OPERATOR_FIX27-owner-map.json`;
const PHASES = ["preflight", "readiness", "capacity", "gate", "rowProof", "capture", "idle"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const record = async path => {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
};

const commandBytes = await readFile(COMMAND_CONTRACT);
const command = JSON.parse(commandBytes);
assert.equal(command.cwd, PRODUCT);
assert.deepEqual(Object.keys(command.phases), PHASES);
const script = await record(SCRIPT);
const operatorLogs = Object.fromEntries(PHASES.map(phase => [phase,
  `${L}/GUIDE_OPERATOR_FIX27-operator-${phase}.log`]));
const operator = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX27",
  ticket: "t_c68906dd",
  revision: command.revision,
  executed: false,
  cwd: PRODUCT,
  argv: [NODE, "--import", "tsx", SCRIPT],
  script,
  commandContract: { path: COMMAND_CONTRACT, sha256: sha256(commandBytes), bytes: commandBytes.byteLength },
  phaseOrder: PHASES,
  operatorOwned: {
    outputs: {
      prerequisite: `${E}/GUIDE_LIVE27-prerequisites.json`,
      stop: `${E}/GUIDE_LIVE27-stop.json`
    },
    logs: operatorLogs
  },
  wrapperOwned: Object.fromEntries(PHASES.map(phase => [phase, {
    output: command.phases[phase].output,
    contractLog: command.phases[phase].log
  }])),
  environment: {
    privateSourceFile: `${PRODUCT}/.local/dev-auth/api.env`,
    selectedSourceKey: "SUPPORT_DATABASE_URL",
    childEnvironmentKey: "GUIDE_COUNTS_ONLY_DATABASE_URL",
    expectedRole: "debateai_dev_support",
    valueRecorded: false
  },
  constraints: {
    stopFirst: true,
    preserveNumericChildStatus: true,
    wrapperOwnedPathsAbsentAtInvocation: true,
    operatorLogsWrittenAfterChildExit: true,
    actualTrafficDuringAuthorControls: { browser: 0, http: 0, status: 0, database: 0, support: 0, model: 0 }
  }
};
await writeFile(OPERATOR_CONTRACT, `${JSON.stringify(operator, null, 2)}\n`, { flag: "wx", mode: 0o600 });

const map = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX27",
  revision: command.revision,
  contract: COMMAND_CONTRACT,
  rules: {
    operatorMayOpenContractOwnedPath: false,
    operatorLogWriteTime: "AFTER_CHILD_EXIT",
    phaseOutputWriteMode: "EXCLUSIVE",
    stopFirst: true
  },
  phases: Object.fromEntries(PHASES.map(phase => {
    const details = command.phases[phase];
    const childOwnsContractLog = phase === "rowProof" || phase === "capture";
    return [phase, {
      output: { path: details.output, owner: "PHASE_WRAPPER", writeMode: "EXCLUSIVE" },
      contractLog: {
        path: details.log,
        owner: childOwnsContractLog ? "PHASE_WRAPPER_CHILD_STDIO" : "CONTRACT_RESERVED_ABSENCE_PATH",
        operatorMayOpen: false
      },
      operatorLog: { path: operatorLogs[phase], owner: "THIN_OPERATOR", writeTime: "AFTER_CHILD_EXIT", writeMode: "EXCLUSIVE" }
    }];
  })),
  nested: {
    preflightUiOutput: { path: command.phases.preflight.ui.output, owner: "PREFLIGHT_UI_CHILD" },
    preflightUiLog: { path: command.phases.preflight.ui.log, owner: "PREFLIGHT_WRAPPER_CHILD_STDIO" },
    rowProofResult: { path: command.phases.rowProof.result, owner: "ROW_PROOF_CHILD" },
    actualReceipt: { path: command.actualReceipt, owner: "CAPTURE_CHILD" },
    browserProfile: { path: command.browserProfile, owner: "CAPTURE_CHILD" },
    actualScreenshots: { owner: "CAPTURE_CHILD", stem: `${command.evidenceRoot}/GUIDE_LIVE_GUIDE21-row-<sequence>` },
    prerequisite: { path: operator.operatorOwned.outputs.prerequisite, owner: "THIN_OPERATOR" },
    stop: { path: operator.operatorOwned.outputs.stop, owner: "THIN_OPERATOR", condition: "FIRST_NONZERO_PHASE_ONLY" }
  }
};
const allPaths = [
  ...PHASES.flatMap(phase => [map.phases[phase].output.path, map.phases[phase].contractLog.path, map.phases[phase].operatorLog.path]),
  map.nested.preflightUiOutput.path, map.nested.preflightUiLog.path, map.nested.rowProofResult.path,
  map.nested.actualReceipt.path, map.nested.browserProfile.path, map.nested.prerequisite.path, map.nested.stop.path,
  command.ownerCapacity.output
];
assert.equal(new Set(allPaths).size, allPaths.length, "GUIDE_OPERATOR_FIX27_OWNER_MAP_COLLISION");
map.uniqueConcretePaths = allPaths.length;
await writeFile(OWNER_MAP, `${JSON.stringify(map, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ operator: await record(OPERATOR_CONTRACT), ownerMap: await record(OWNER_MAP) })}\n`);

