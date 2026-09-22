import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, openSync } from "node:fs";
import { access, lstat, open, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-api-environment.ts";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-auth-stack-profile.ts";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot = `${root}/evidence`;
const contractPath = `${evidenceRoot}/GUIDE_HARNESS_FIX23-command-contract.json`;
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const prerequisitePath = `${evidenceRoot}/GUIDE_LIVE24-prerequisites.json`;
const stopPath = `${evidenceRoot}/GUIDE_LIVE24-stop.json`;
const capacityDirectLog = `${root}/logs/GUIDE_LIVE24-phase3-direct.log`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = Object.freeze({
  contract: "7502ed0d8bb8618e4ba56c2157efd24a5d9af92258b91ebc90d4ef6c82727c9c",
  preflight: "dfce83ea1e186372e9d16c0989e3117d262968c8c724d23540ad46572324df58",
  readiness: "03fb0a8c0fef2d92496c6a2a7a0f263d15a2746752ce8b54cadaf4a8198c7a7f",
  live21Failure: "da8e4479d7a835eb0b14a4c745ec578eb8232d7ee7ae49b9d70458e5a88abb5b",
  live22Failure: "6334368b5eac927c7a06cef44448eea97aea5a05a6d6de185a598e69e425a5cb",
  live23Failure: "38449a79fcf4b56bfde62962bdf046771a3356059c09716023fcda85730468d4",
});

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_ENVIRONMENT_BYTES = 64 * 1024;

function currentUid() {
  assert.equal(typeof process.getuid, "function", "GUIDE_LIVE24_OWNER_UNVERIFIED");
  return process.getuid();
}

async function assertPrivateDirectory(path) {
  const metadata = await lstat(path).catch(() => null);
  assert.ok(metadata !== null, "GUIDE_LIVE24_PRIVATE_DIRECTORY_MISSING");
  assert.equal(metadata.isSymbolicLink(), false, "GUIDE_LIVE24_PRIVATE_DIRECTORY_SYMLINK");
  assert.equal(metadata.isDirectory(), true, "GUIDE_LIVE24_PRIVATE_DIRECTORY_TYPE");
  assert.equal(metadata.uid, currentUid(), "GUIDE_LIVE24_PRIVATE_DIRECTORY_OWNER");
  assert.equal(metadata.mode & 0o777, PRIVATE_DIRECTORY_MODE, "GUIDE_LIVE24_PRIVATE_DIRECTORY_MODE");
}

async function readPrivateEnvironment(path) {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch { throw new Error("GUIDE_LIVE24_PRIVATE_FILE_CUSTODY_INVALID"); }
  try {
    const metadata = await handle.stat();
    assert.equal(metadata.isFile(), true, "GUIDE_LIVE24_PRIVATE_FILE_TYPE");
    assert.equal(metadata.uid, currentUid(), "GUIDE_LIVE24_PRIVATE_FILE_OWNER");
    assert.equal(metadata.nlink, 1, "GUIDE_LIVE24_PRIVATE_FILE_LINKS");
    assert.equal(metadata.mode & 0o777, PRIVATE_FILE_MODE, "GUIDE_LIVE24_PRIVATE_FILE_MODE");
    assert.ok(metadata.size >= 1 && metadata.size <= MAX_ENVIRONMENT_BYTES, "GUIDE_LIVE24_PRIVATE_FILE_SIZE");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
}

function parseExactEnvironment(source) {
  assert.equal(source.endsWith("\n"), true, "GUIDE_LIVE24_ENVIRONMENT_FINAL_NEWLINE");
  assert.equal(source.includes("\r"), false, "GUIDE_LIVE24_ENVIRONMENT_CR");
  assert.equal(source.includes("\0"), false, "GUIDE_LIVE24_ENVIRONMENT_NUL");
  const lines = source.slice(0, -1).split("\n");
  assert.equal(lines.length, DEVELOPMENT_API_ENVIRONMENT_KEYS.length, "GUIDE_LIVE24_ENVIRONMENT_KEY_COUNT");
  let supportDatabaseUrl;
  for (const [index, key] of DEVELOPMENT_API_ENVIRONMENT_KEYS.entries()) {
    const line = lines[index];
    assert.equal(line.startsWith(`${key}=`), true, "GUIDE_LIVE24_ENVIRONMENT_KEY_ORDER");
    const value = line.slice(key.length + 1);
    assert.notEqual(value.length, 0, "GUIDE_LIVE24_ENVIRONMENT_EMPTY_VALUE");
    if (key === "SUPPORT_DATABASE_URL") supportDatabaseUrl = value;
  }
  assert.equal(typeof supportDatabaseUrl, "string", "GUIDE_LIVE24_SUPPORT_DATABASE_URL_MISSING");
  return supportDatabaseUrl;
}

async function readNarrowDatabaseUrl(repositoryRoot) {
  const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
  await assertPrivateDirectory(dirname(custodyRoot));
  await assertPrivateDirectory(custodyRoot);
  const value = parseExactEnvironment(await readPrivateEnvironment(join(custodyRoot, "api.env")));
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:", "GUIDE_LIVE24_DATABASE_PROTOCOL");
  assert.equal(url.hostname, "127.0.0.1", "GUIDE_LIVE24_DATABASE_HOST");
  assert.equal(url.port, String(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE.postgresPort), "GUIDE_LIVE24_DATABASE_PORT");
  assert.equal(url.pathname, "/debateai", "GUIDE_LIVE24_DATABASE_NAME");
  assert.equal(url.username, "debateai_dev_support", "GUIDE_LIVE24_DATABASE_USER");
  assert.ok(url.password.length > 0, "GUIDE_LIVE24_DATABASE_PASSWORD_MISSING");
  assert.equal(url.search.length, 0, "GUIDE_LIVE24_DATABASE_QUERY");
  assert.equal(url.hash.length, 0, "GUIDE_LIVE24_DATABASE_FRAGMENT");
  return value;
}

async function assertAbsent(path) {
  try { await access(path); throw new Error(`GUIDE_LIVE24_OUTPUT_PRESENT:${path}`); }
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
    await writeFile(stopPath, `${JSON.stringify({ schemaVersion: 1, node: "GUIDE_LIVE24", phase: name, status }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    throw new Error(`GUIDE_LIVE24_PHASE_FAILED:${name}:${status}`);
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
assert.equal(sha256(await readFile(`${evidenceRoot}/GUIDE_LIVE21-failure.json`)), expected.live21Failure);
assert.equal(sha256(await readFile(`${evidenceRoot}/GUIDE_LIVE22-failure.json`)), expected.live22Failure);
assert.equal(sha256(await readFile(`${evidenceRoot}/GUIDE_LIVE23-failure.json`)), expected.live23Failure);

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

const sourceChecks = [
  ["apps/api/src/main.ts", "createPool(environment.SUPPORT_DATABASE_URL)"],
  ["apps/runner/src/dev-database-principals.ts", 'environmentKey: "SUPPORT_DATABASE_URL"'],
  ["apps/runner/src/dev-database-principals.ts", 'roleName: "debateai_dev_support"'],
  ["apps/runner/src/support-status-cli-credentials.ts", 'const SUPPORT_KEY = "SUPPORT_DATABASE_URL"'],
];
for (const [relative, anchor] of sourceChecks) {
  assert.equal((await readFile(join(productRoot, relative), "utf8")).includes(anchor), true, "GUIDE_LIVE24_SUPPORT_SOURCE_ANCHOR_MISSING");
}
const connectionString = await readNarrowDatabaseUrl(productRoot);
assert.equal(typeof connectionString, "string");
assert.equal(connectionString.startsWith("postgresql://"), true);
const capacityEnvironment = { ...process.env, GUIDE_COUNTS_ONLY_DATABASE_URL: connectionString };
assert.equal(typeof capacityEnvironment.GUIDE_COUNTS_ONLY_DATABASE_URL, "string");
assert.equal(capacityEnvironment.GUIDE_COUNTS_ONLY_DATABASE_URL.startsWith("postgresql://"), true);

await writeFile(prerequisitePath, `${JSON.stringify({
  schemaVersion: 1,
  node: "GUIDE_LIVE24",
  revision: contract.revision,
  retained: { preflightSha256: expected.preflight, readinessSha256: expected.readiness },
  runtime: { pid: readiness.pid, pgid: readiness.pgid, commandMarker: "pnpm dev:auth:up", ordinaryTlsStatus: 200 },
  connection: {
    source: `${productRoot}/.local/dev-auth/api.env`,
    loader: `${productRoot}/apps/runner/src/dev-api-process.ts#readPrivateEnvironment+parseExactEnvironment`,
    keySource: `${productRoot}/apps/runner/src/dev-api-environment.ts#DEVELOPMENT_API_ENVIRONMENT_KEYS`,
    privateReader: "faithful bounded local reproduction of unexported source helpers",
    selectedSourceKey: "SUPPORT_DATABASE_URL",
    childEnvironmentKey: "GUIDE_COUNTS_ONLY_DATABASE_URL",
    principalRole: "debateai_dev_support",
    publicSourceAnchors: sourceChecks.map(([path, anchor]) => ({ path, anchor })),
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
