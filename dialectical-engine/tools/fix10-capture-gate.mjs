#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function fail(code) { throw new TypeError(code); }
function object(value, code) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code); return value; }

export function validateCapture(rawReport, rawManifest, exitCode) {
  const report = object(rawReport, "FIX10_CAPTURE_REPORT");
  const manifest = object(rawManifest, "FIX10_CAPTURE_MANIFEST");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail("FIX10_CAPTURE_MANIFEST");
  if (exitCode !== 0) fail("FIX10_CAPTURE_EXIT");
  if (report.success !== true || report.numFailedTests !== 0 || report.numFailedTestSuites !== 0 || report.numPendingTests !== 0) fail("FIX10_CAPTURE_STATUS");
  if (!Array.isArray(report.testResults) || report.testResults.length !== manifest.files.length) fail("FIX10_CAPTURE_FILE_COUNT");
  const expectedNames = manifest.files.flatMap((entry) => object(entry, "FIX10_CAPTURE_MANIFEST").names ?? fail("FIX10_CAPTURE_MANIFEST"));
  if (report.numTotalTests !== expectedNames.length || report.numPassedTests !== expectedNames.length || expectedNames.length === 0) fail("FIX10_CAPTURE_TEST_COUNT");
  const actualNames = [];
  const remaining = [...report.testResults];
  for (let index = 0; index < manifest.files.length; index += 1) {
    const expected = object(manifest.files[index], "FIX10_CAPTURE_MANIFEST");
    if (typeof expected.path !== "string") fail("FIX10_CAPTURE_MANIFEST");
    const matches = remaining.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate }) => typeof object(candidate, "FIX10_CAPTURE_REPORT").name === "string" &&
        object(candidate, "FIX10_CAPTURE_REPORT").name.endsWith(`/${expected.path}`));
    if (matches.length !== 1) fail("FIX10_CAPTURE_FILE");
    const selected = matches[0];
    if (selected === undefined) fail("FIX10_CAPTURE_FILE");
    const result = object(selected.candidate, "FIX10_CAPTURE_REPORT");
    remaining.splice(selected.candidateIndex, 1);
    if (!Array.isArray(result.assertionResults) || result.assertionResults.some((item) => object(item, "FIX10_CAPTURE_REPORT").status !== "passed")) fail("FIX10_CAPTURE_STATUS");
    actualNames.push(...result.assertionResults.map((item) => object(item, "FIX10_CAPTURE_REPORT").fullName));
  }
  if (remaining.length !== 0) fail("FIX10_CAPTURE_FILE_COUNT");
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) fail("FIX10_CAPTURE_NAMES");
  return Object.freeze({ files: manifest.files.length, tests: expectedNames.length });
}

async function capture(command, args, cwd) {
  return new Promise((done) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env: { ...process.env }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = []; const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("close", (code, signal) => done({ argv: [command, ...args], cwd, environment_names: Object.keys(process.env).sort(),
      start_ms: String(startedAt), end_ms: String(Date.now()), stdout: Buffer.concat(stdout).toString("base64"),
      stderr: Buffer.concat(stderr).toString("base64"), exit_code: code, signal }));
  });
}

async function main() {
  const [manifestPath, evidencePath, ...files] = process.argv.slice(2);
  if (!manifestPath || !evidencePath || files.length === 0) fail("FIX10_CAPTURE_USAGE");
  try { await readFile(evidencePath); fail("FIX10_CAPTURE_EVIDENCE_EXISTS"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const cwd = process.cwd();
  const captured = await capture(process.execPath, [resolve(cwd, "node_modules/vitest/vitest.mjs"), "run", "--reporter=json", ...files], cwd);
  await writeFile(evidencePath, `${JSON.stringify(captured)}\n`, { flag: "wx", mode: 0o600 });
  const report = JSON.parse(Buffer.from(captured.stdout, "base64").toString("utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = validateCapture(report, manifest, captured.exit_code);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
