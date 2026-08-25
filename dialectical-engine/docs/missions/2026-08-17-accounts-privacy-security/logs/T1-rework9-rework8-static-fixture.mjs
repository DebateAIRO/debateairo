#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const cwd = realpathSync(resolve(here, "../../../.."));
const launcherPath = join(here, "T1-rework9-gate-launcher.mjs");
const controllerPath = join(here, "T1-rework9-gate-controller.mjs");
const workerPath = join(here, "T1-rework9-gate-worker.mjs");
const recoveryPath = join(here, "T1-rework9-rework8-abort-recovery.mjs");
const authorityPath = join(here, "T1-rework9-rework8-abort-authority.json");
const evidencePath = join(here, "T1-rework9-rework8-abort-failure-evidence.json");
const incidentPacketPath = join(here,
  "T1-rework9-execution-302197e8-e713-47f7-9518-9f078eede931.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const measureVitestBinding = (root) => {
  const packageLinkPath = join(root, "node_modules/vitest");
  const logicalEntrypointPath = join(packageLinkPath, "vitest.mjs");
  const linkStat = lstatSync(packageLinkPath);
  if (!linkStat.isSymbolicLink()) throw new Error("VITEST_PACKAGE_LINK_NOT_SYMLINK");
  const linkTarget = readlinkSync(packageLinkPath);
  const canonicalPackagePath = realpathSync(packageLinkPath);
  const canonicalEntrypointPath = realpathSync(logicalEntrypointPath);
  const entryStat = lstatSync(canonicalEntrypointPath);
  if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
    throw new Error("VITEST_CANONICAL_ENTRYPOINT_NOT_REGULAR");
  }
  return Object.freeze({
    package_link: Object.freeze({
      path: packageLinkPath,
      target: linkTarget,
      target_sha256: sha256(linkTarget),
      device: linkStat.dev,
      inode: linkStat.ino,
      size: linkStat.size,
      mtime_ms: linkStat.mtimeMs,
      canonical_path: canonicalPackagePath
    }),
    entrypoint: Object.freeze({
      logical_path: logicalEntrypointPath,
      path: canonicalEntrypointPath,
      sha256: sha256(readFileSync(canonicalEntrypointPath)),
      size: entryStat.size,
      mtime_ms: entryStat.mtimeMs
    })
  });
};

const sameBinding = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const actual = measureVitestBinding(cwd);
const incidentPacket = JSON.parse(readFileSync(incidentPacketPath, "utf8"));
const launcher = readFileSync(launcherPath, "utf8");
const controller = readFileSync(controllerPath, "utf8");
const worker = readFileSync(workerPath, "utf8");
const recoverySource = readFileSync(recoveryPath, "utf8");
const liveAuthority = JSON.parse(readFileSync(authorityPath, "utf8"));
const liveLinkStat = lstatSync(liveAuthority.vitest_binding.package_link.path);
const compareLiveLinkMtime = (expected, corrected) => {
  for (const key of ["device", "inode", "size", "mtime_ms"]) {
    const statKey = key === "device" ? "dev" : key === "inode" ? "ino"
      : corrected && key === "mtime_ms" ? "mtimeMs" : key;
    if (liveLinkStat[statKey] !== expected[key]) {
      throw new Error(`CUSTODY_MISMATCH:vitest_package_link.${key}:actual=${String(
        liveLinkStat[statKey])}:expected=${expected[key]}`);
    }
  }
};
const oldLogicalEqualityFails = actual.entrypoint.logical_path !== actual.entrypoint.path
  && incidentPacket.vitest_entrypoint.path === actual.entrypoint.logical_path
  && incidentPacket.vitest_entrypoint.sha256 === actual.entrypoint.sha256;
const oldSourceDefects = [
  launcher.includes("realpathSync(PINNED_VITEST_ENTRYPOINT) !== PINNED_VITEST_ENTRYPOINT")
    ? "launcher_rejects_pnpm_logical_path" : null,
  worker.includes("realpathSync(PINNED_VITEST_ENTRYPOINT) !== PINNED_VITEST_ENTRYPOINT")
    ? "worker_rejects_pnpm_logical_path" : null,
  !launcher.includes("vitest_package_link") ? "launcher_does_not_bind_package_symlink" : null,
  !worker.includes("vitest_package_link") ? "worker_does_not_bind_package_symlink" : null
].filter(Boolean);
const mode = process.argv[2] ?? "green";

if (mode === "correction1-red") {
  let observedError;
  try {
    compareLiveLinkMtime(liveAuthority.vitest_binding.package_link, false);
  } catch (error) {
    observedError = error;
  }
  if (!(observedError instanceof Error)
    || !observedError.message.startsWith(
      "CUSTODY_MISMATCH:vitest_package_link.mtime_ms:actual=undefined")
    || !recoverySource.includes('key === "inode" ? "ino" : key]')) {
    throw new Error(`CORRECTION1_RED_NOT_SPECIFIC:${String(observedError)}`);
  }
  process.stdout.write(`REWORK8_CORRECTION1_RED actual_live_pnpm_link=true `
    + `mtime_ms_observed=undefined expected_mtime_ms=${liveAuthority.vitest_binding.package_link.mtime_ms} `
    + `error=CUSTODY_MISMATCH:vitest_package_link.mtime_ms\n`);
  process.exitCode = 1;
} else if (mode === "correction1-green") {
  if (!recoverySource.includes('key === "mtime_ms" ? "mtimeMs" : key')) {
    throw new Error("CORRECTION1_FIXED_MAPPING_MISSING");
  }
  compareLiveLinkMtime(liveAuthority.vitest_binding.package_link, true);
  const mutated = { ...liveAuthority.vitest_binding.package_link,
    mtime_ms: liveAuthority.vitest_binding.package_link.mtime_ms + 1 };
  let mutationError;
  try {
    compareLiveLinkMtime(mutated, true);
  } catch (error) {
    mutationError = error;
  }
  if (!(mutationError instanceof Error)
    || !mutationError.message.startsWith(
      "CUSTODY_MISMATCH:vitest_package_link.mtime_ms")) {
    throw new Error(`CORRECTION1_MUTATED_MTIME_NOT_KILLED:${String(mutationError)}`);
  }
  process.stdout.write(`REWORK8_CORRECTION1_GREEN actual_live_pnpm_link=true `
    + `mtime_ms=${liveLinkStat.mtimeMs} corrected_stats_field=mtimeMs `
    + `frozen_mtime_match=true mutated_mtime_killed=true recovery_not_executed=true\n`);
} else if (mode === "red") {
  if (!oldLogicalEqualityFails || oldSourceDefects.length !== 4
    || !actual.package_link.target.startsWith(".pnpm/")
    || !actual.entrypoint.path.includes("/node_modules/.pnpm/")) {
    throw new Error(`REWORK8_RED_PRECONDITION_MISMATCH:${oldSourceDefects.join(",")}`);
  }
  process.stdout.write(`REWORK8_RED logical_equals_realpath=false actual_pnpm_symlink=true `
    + `defects=${oldSourceDefects.join(",")}\n`);
  process.exitCode = 1;
} else {
  if (!oldLogicalEqualityFails || oldSourceDefects.length !== 0) {
    throw new Error(`REWORK8_GREEN_SOURCE_DEFECT:${oldSourceDefects.join(",")}`);
  }
  const fixtureRoot = mkdtempSync(join(tmpdir(), "t1-rework9-rework8-link-fixture-"));
  try {
    const nodeModules = join(fixtureRoot, "node_modules");
    const packageOne = join(nodeModules, ".pnpm/vitest@fixture-one/node_modules/vitest");
    const packageTwo = join(nodeModules, ".pnpm/vitest@fixture-two/node_modules/vitest");
    mkdirSync(packageOne, { recursive: true, mode: 0o700 });
    mkdirSync(packageTwo, { recursive: true, mode: 0o700 });
    writeFileSync(join(packageOne, "vitest.mjs"), "export const fixture = 1;\n", {
      mode: 0o600, flag: "wx"
    });
    writeFileSync(join(packageTwo, "vitest.mjs"), "export const fixture = 1;\n", {
      mode: 0o600, flag: "wx"
    });
    const packageLink = join(nodeModules, "vitest");
    symlinkSync(".pnpm/vitest@fixture-one/node_modules/vitest", packageLink);
    const expected = measureVitestBinding(fixtureRoot);
    if (!sameBinding(measureVitestBinding(fixtureRoot), expected)) {
      throw new Error("UNCHANGED_BINDING_REJECTED");
    }
    unlinkSync(packageLink);
    symlinkSync(".pnpm/vitest@fixture-two/node_modules/vitest", packageLink);
    if (sameBinding(measureVitestBinding(fixtureRoot), expected)) {
      throw new Error("PACKAGE_LINK_DRIFT_NOT_DETECTED");
    }
    unlinkSync(packageLink);
    symlinkSync(".pnpm/vitest@fixture-one/node_modules/vitest", packageLink);
    writeFileSync(join(packageOne, "vitest.mjs"), "export const fixture = 2;\n");
    if (sameBinding(measureVitestBinding(fixtureRoot), expected)) {
      throw new Error("CANONICAL_TARGET_DRIFT_NOT_DETECTED");
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const requiredSourceTokens = [
    [launcher, "readlinkSync"], [launcher, "vitest_package_link"],
    [launcher, "canonicalEntrypointPath"], [worker, "readlinkSync"],
    [worker, "vitest_package_link"], [worker, "canonicalEntrypointPath"],
    [controller, "vitest_package_link"]
  ];
  if (requiredSourceTokens.some(([source, token]) => !source.includes(token))
    || !worker.includes("const vitestEntrypoint = vitestBinding.entrypoint")
    || !worker.includes("spawn(testRuntime.path, [vitestEntrypoint.path")) {
    throw new Error("CANONICAL_BINDING_SOURCE_GUARD_MISSING");
  }
      const recovery = recoverySource;
  const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (authority.run_id !== incidentPacket.run_id
    || authority.classification !== "LAUNCHER_ABORT_BEFORE_OWNER"
    || authority.private_runtime_preservation_required !== true
    || authority.no_new_run_test_viewer_worker_or_supervisor_authority !== true
    || evidence.private_runtime.entries.length !== 2
    || evidence.private_runtime.launchd_stream_files_absent !== true
    || !recovery.includes("archiveLockPreservingInode")
    || !recovery.includes("verifyPrivateRuntimePreserved")
    || /launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync/.test(recovery)) {
    throw new Error("ABORT_RECOVERY_GUARD_MISSING");
  }
  process.stdout.write(`REWORK8_GREEN logical_equals_realpath=false actual_pnpm_symlink=true `
    + `package_link_drift_killed=true canonical_target_drift_killed=true `
    + `exact_canonical_argv=true recovery_run_bound=true private_runtime_preserved=true `
    + `recovery_not_executed=true\n`);
}
