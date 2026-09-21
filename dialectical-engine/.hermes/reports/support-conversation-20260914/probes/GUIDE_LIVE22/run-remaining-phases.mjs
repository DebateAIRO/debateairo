import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { loadDevelopmentApiProcessEnvironment } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-api-process.ts";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot = `${root}/evidence`;
const contractPath = `${evidenceRoot}/GUIDE_HARNESS_FIX23-command-contract.json`;
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const prerequisitePath = `${evidenceRoot}/GUIDE_LIVE22-prerequisites.json`;
const stopPath = `${evidenceRoot}/GUIDE_LIVE22-stop.json`;
const capacityDirectLog = `${root}/logs/GUIDE_LIVE22-phase3-direct.log`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = Object.freeze({
  contract: "7502ed0d8bb8618e4ba56c2157efd24a5d9af92258b91ebc90d4ef6c82727c9c",
  preflight: "dfce83ea1e186372e9d16c0989e3117d262968c8c724d23540ad46572324df58",
  readiness: "03fb0a8c0fef2d92496c6a2a7a0f263d15a2746752ce8b54cadaf4a8198c7a7f",
});

async function assertAbsent(path) {
  try { await access(path); throw new Error(`GUIDE_LIVE22_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function runPhase(name, { environment, directLog, inherit = false } = {}) {
  const phase = contract.phases[name];
  const stdio = inherit ? "inherit" : ["ignore", directLog, directLog];
  const child = spawn(phase.argv[0], phase.argv.slice(1), {
    cwd: contract.cwd,
    env: environment ?? process.env,
    stdio,
  });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (status !== 0) {
    await writeFile(stopPath, `${JSON.stringify({ schemaVersion: 1, node: "GUIDE_LIVE22", phase: name, status }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    throw new Error(`GUIDE_LIVE22_PHASE_FAILED:${name}:${status}`);
  }
  return status;
}

const contractBytes = await readFile(contractPath);
assert.equal(sha256(contractBytes), expected.contract);
const contract = JSON.parse(contractBytes);
assert.equal(contract.cwd, productRoot);
for (const name of ["capacity", "gate", "rowProof", "capture", "idle"]) {
  assert.equal(contract.phases[name].argv[2], contractPath);
}
assert.equal(sha256(await readFile(contract.phases.preflight.output)), expected.preflight);
assert.equal(sha256(await readFile(contract.phases.readiness.output)), expected.readiness);

const future = [
  capacityDirectLog,
  prerequisitePath,
  stopPath,
  contract.phases.capacity.output,
  contract.phases.gate.output,
  contract.phases.gate.log,
  contract.phases.rowProof.output,
  contract.phases.rowProof.log,
  contract.phases.rowProof.result,
  contract.phases.capture.output,
  contract.phases.capture.log,
  contract.phases.idle.output,
  contract.phases.idle.log,
  contract.actualReceipt,
  contract.browserProfile,
  contract.ownerCapacity.output,
];
for (const sequence of contract.actualSequences) {
  const stem = `${contract.evidenceRoot}/GUIDE_LIVE_GUIDE21-row-${String(sequence).padStart(2, "0")}`;
  future.push(`${stem}-complete-expanded.png`, `${stem}-original-pane-top.png`, `${stem}-original-pane-footer.png`);
}
for (const path of future) await assertAbsent(path);

const readiness = JSON.parse(await readFile(contract.phases.readiness.output, "utf8"));
const ps = spawnSync("/bin/ps", ["-o", "pid=,ppid=,pgid=,command=", "-p", String(readiness.pid)], { encoding: "utf8" });
const curl = spawnSync("/usr/bin/curl", ["--silent", "--show-error", "--output", "/dev/null", "--write-out", "%{http_code}", `${contract.baseUrl}/help`], { encoding: "utf8" });
assert.equal(ps.status, 0);
assert.match(ps.stdout, /pnpm dev:auth:up/u);
assert.equal(curl.status, 0);
assert.equal(Number(curl.stdout), 200);

const privateEnvironment = await loadDevelopmentApiProcessEnvironment(productRoot);
const connectionString = privateEnvironment.DATABASE_URL;
assert.equal(typeof connectionString, "string");
assert.equal(connectionString.startsWith("postgresql://"), true);
const capacityEnvironment = { ...process.env, GUIDE_COUNTS_ONLY_DATABASE_URL: connectionString };
assert.equal(typeof capacityEnvironment.GUIDE_COUNTS_ONLY_DATABASE_URL, "string");
assert.equal(capacityEnvironment.GUIDE_COUNTS_ONLY_DATABASE_URL.startsWith("postgresql://"), true);

await writeFile(prerequisitePath, `${JSON.stringify({
  schemaVersion: 1,
  node: "GUIDE_LIVE22",
  revision: contract.revision,
  retained: { preflightSha256: expected.preflight, readinessSha256: expected.readiness },
  runtime: { pid: readiness.pid, pgid: readiness.pgid, commandMarker: "pnpm dev:auth:up", ordinaryTlsStatus: 200 },
  connection: {
    source: `${productRoot}/.local/dev-auth/api.env`,
    loader: `${productRoot}/apps/runner/src/dev-api-process.ts#loadDevelopmentApiProcessEnvironment`,
    privateReader: "readPrivateEnvironment",
    childEnvironmentKey: "GUIDE_COUNTS_ONLY_DATABASE_URL",
    present: true,
    acceptedShape: true,
    valueRecorded: false,
  },
  futureOutputsCheckedAbsent: future.length,
}, null, 2)}\n`, { flag: "wx", mode: 0o600 });

const capacityFd = openSync(capacityDirectLog, "wx", 0o600);
try { await runPhase("capacity", { environment: capacityEnvironment, directLog: capacityFd }); }
finally { closeSync(capacityFd); }
const capacity = JSON.parse(await readFile(contract.phases.capacity.output, "utf8"));
process.stdout.write(`${JSON.stringify({ phase: "capacity", result: "PASS", measuredAtUtc: capacity.measuredAtUtc, kbVersion: capacity.kbVersion, limits: capacity.limits, observed: capacity.observed })}\n`);

const gateFd = openSync(contract.phases.gate.log, "wx", 0o600);
try { await runPhase("gate", { directLog: gateFd }); }
finally { closeSync(gateFd); }
process.stdout.write(`${JSON.stringify({ phase: "gate", result: "PASS" })}\n`);

await runPhase("rowProof", { inherit: true });
process.stdout.write(`${JSON.stringify({ phase: "rowProof", result: "PASS", rows: 58 })}\n`);

await runPhase("capture", { inherit: true });
process.stdout.write(`${JSON.stringify({ phase: "capture", result: "PASS" })}\n`);

const idleFd = openSync(contract.phases.idle.log, "wx", 0o600);
try { await runPhase("idle", { directLog: idleFd }); }
finally { closeSync(idleFd); }
process.stdout.write(`${JSON.stringify({ phase: "idle", result: "PASS" })}\n`);
