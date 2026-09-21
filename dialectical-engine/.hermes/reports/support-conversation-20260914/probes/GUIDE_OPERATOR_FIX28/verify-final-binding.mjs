import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const NODE = "/Users/vladmihaimiron/.local/bin/node";
const OLD_SOURCE = `${ROOT}/probes/GUIDE_OPERATOR_FIX27/run-operator.mjs`;
const NEW_SOURCE = `${ROOT}/probes/GUIDE_OPERATOR_FIX28/run-operator.mjs`;
const COMMAND = `${E}/GUIDE_OPERATOR_FIX27-command-contract.json`;
const OPERATOR = `${E}/GUIDE_OPERATOR_FIX28-operator-contract.json`;
const CONTROL = `${E}/GUIDE_OPERATOR_FIX28-control-proof.json`;
const OUTPUT = `${E}/GUIDE_OPERATOR_FIX28-binding-proof.json`;
const PHASES = ["preflight", "readiness", "capacity", "gate", "rowProof", "capture", "idle"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function absent(path) {
  try { await access(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}
async function record(path) {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
}

assert.equal(await absent(OUTPUT), true);
const [oldBytes, newBytes, commandBytes, operatorBytes, controlBytes] = await Promise.all([
  readFile(OLD_SOURCE), readFile(NEW_SOURCE), readFile(COMMAND), readFile(OPERATOR), readFile(CONTROL)
]);
assert.equal(sha256(commandBytes), "04512905c4f1b224a5ed1b8249fc0484650ed06ee3519bcec7f90db9ba15bc7a");
const command = JSON.parse(commandBytes);
const operator = JSON.parse(operatorBytes);
const control = JSON.parse(controlBytes);
assert.deepEqual(Object.keys(command.phases), PHASES);
for (const phase of PHASES) assert.equal(command.phases[phase].argv[2], COMMAND);
assert.deepEqual(operator.argv, [NODE, "--import", "tsx", NEW_SOURCE]);
assert.equal(operator.cwd, command.cwd);
assert.equal(operator.script.sha256, sha256(newBytes));
assert.equal(operator.script.bytes, newBytes.byteLength);
assert.equal(operator.commandContract.sha256, sha256(commandBytes));
assert.equal(operator.futureAbsence.count, 123);
assert.equal(operator.futureAbsence.uniqueCount, 123);
assert.equal(operator.futureAbsence.paths.length, 123);
assert.equal(new Set(operator.futureAbsence.paths).size, 123);
assert.deepEqual(operator.futureAbsence.addedByFix28,
  [command.phases.rowProof.result, `${E}/GUIDE_LIVE25-owner-testability.json`]);
for (const path of operator.futureAbsence.paths) assert.equal(await absent(path), true, path);
assert.equal(control.verdict, "PASS_OPERATOR_COMPLETE_ABSENCE_SET");
assert.equal(control.controls.passed, 20);

let normalized = newBytes.toString("utf8");
normalized = normalized.replace(`const FINAL_OWNER_TESTABILITY=\`\${E}/GUIDE_LIVE25-owner-testability.json\`;\n`, "");
normalized = normalized.replace(`const ownerTestabilityPath=inert ? \`\${dirname(contractPath)}/owner-testability.json\` : FINAL_OWNER_TESTABILITY;\n`, "");
normalized = normalized.replace(`  contract.phases.rowProof.result,contract.actualReceipt,contract.browserProfile,\n  contract.ownerCapacity.output,ownerTestabilityPath,\n`,
  `  contract.actualReceipt,contract.browserProfile,contract.ownerCapacity.output,\n`);
normalized = normalized.replace(`assert.equal(future.length,inert ? 23 : 123,"GUIDE_OPERATOR_FIX28_FUTURE_PATH_COUNT");\n`, "");
assert.equal(normalized, oldBytes.toString("utf8"), "GUIDE_OPERATOR_FIX28_DELTA_EXCEEDS_TWO_PATH_CORRECTION");

const syntax = [];
for (const path of [NEW_SOURCE,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX28/build-operator-contract.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX28/run-focused-controls.mjs`,
  `${ROOT}/probes/GUIDE_OPERATOR_FIX28/verify-final-binding.mjs`]) {
  const result = spawnSync(NODE, ["--check", path], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  syntax.push(await record(path));
}
const result = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX28",
  revision: command.revision,
  verdict: "PASS_FINAL_BINDING",
  checks: {
    total: 30,
    passed: 30,
    commandContractExactRetained: true,
    sevenSelfPathsRetained: true,
    publicOperatorInvocationExact: true,
    operatorScriptDigestVerified: true,
    exactTwoPathSourceDelta: true,
    realFutureAbsenceCount: 123,
    realFutureAbsenceUniqueCount: 123,
    realFuturePathsAbsent: 123,
    syntaxFiles: syntax.length,
    operationalTraffic: { runtime: 0, browser: 0, http: 0, status: 0, capacity: 0, database: 0, support: 0, model: 0 }
  },
  records: {
    retainedCommandContract: await record(COMMAND),
    oldOperatorSource: await record(OLD_SOURCE),
    correctedOperatorSource: await record(NEW_SOURCE),
    operatorContract: await record(OPERATOR),
    controlProof: await record(CONTROL),
    syntax
  }
};
await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, checks: result.checks })}\n`);

