import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const L = `${ROOT}/logs`;
const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const SCRIPT = `${ROOT}/probes/GUIDE_OPERATOR_FIX28/run-operator.mjs`;
const COMMAND = `${E}/GUIDE_OPERATOR_FIX27-command-contract.json`;
const OUTPUT = `${E}/GUIDE_OPERATOR_FIX28-operator-contract.json`;
const PHASES = ["preflight", "readiness", "capacity", "gate", "rowProof", "capture", "idle"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function record(path) {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
}

const commandBytes = await readFile(COMMAND);
assert.equal(sha256(commandBytes), "04512905c4f1b224a5ed1b8249fc0484650ed06ee3519bcec7f90db9ba15bc7a");
const command = JSON.parse(commandBytes);
assert.deepEqual(Object.keys(command.phases), PHASES);
for (const phase of PHASES) assert.equal(command.phases[phase].argv[2], COMMAND);
const operatorLogs = Object.fromEntries(PHASES.map(phase => [phase,
  `${L}/GUIDE_OPERATOR_FIX27-operator-${phase}.log`]));
const prerequisite = `${E}/GUIDE_LIVE27-prerequisites.json`;
const stop = `${E}/GUIDE_LIVE27-stop.json`;
const ownerTestability = `${E}/GUIDE_LIVE25-owner-testability.json`;
const absencePaths = [
  stop,
  ...Object.values(command.phases).flatMap(phase => [phase.output, phase.log]),
  command.phases.preflight.ui.output,
  command.phases.preflight.ui.log,
  command.phases.rowProof.result,
  command.actualReceipt,
  command.browserProfile,
  command.ownerCapacity.output,
  ownerTestability,
  ...Object.values(operatorLogs),
  prerequisite,
  ...command.actualSequences.flatMap(sequence => {
    const stem = `${command.evidenceRoot}/GUIDE_LIVE_GUIDE21-row-${String(sequence).padStart(2, "0")}`;
    return [`${stem}-complete-expanded.png`, `${stem}-original-pane-top.png`, `${stem}-original-pane-footer.png`];
  })
];
assert.equal(absencePaths.length, 123);
assert.equal(new Set(absencePaths).size, 123);

const result = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX28",
  ticket: "t_7c6e8882",
  revision: command.revision,
  executed: false,
  cwd: PRODUCT,
  argv: [NODE, "--import", "tsx", SCRIPT],
  script: await record(SCRIPT),
  commandContract: { path: COMMAND, sha256: sha256(commandBytes), bytes: commandBytes.byteLength },
  phaseOrder: PHASES,
  operatorOwned: {
    outputs: { prerequisite, stop },
    logs: operatorLogs
  },
  futureAbsence: {
    count: absencePaths.length,
    uniqueCount: new Set(absencePaths).size,
    paths: absencePaths,
    addedByFix28: [command.phases.rowProof.result, ownerTestability]
  },
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
    actualTrafficDuringAuthorControls: { runtime: 0, browser: 0, http: 0, status: 0, capacity: 0, database: 0, support: 0, model: 0 }
  }
};
await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output: await record(OUTPUT), futureAbsence: result.futureAbsence.count })}\n`);

