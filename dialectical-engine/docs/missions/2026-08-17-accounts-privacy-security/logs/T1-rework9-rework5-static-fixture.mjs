#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const controllerPath = join(root, "T1-rework9-gate-controller.plist.template");
const workerPath = join(root, "T1-rework9-gate-worker.plist.template");
const viewerPath = join(root, "T1-rework9-gate-viewer.mjs");
const controllerTemplate = readFileSync(controllerPath, "utf8");
const workerTemplate = readFileSync(workerPath, "utf8");
const viewerSource = readFileSync(viewerPath, "utf8");
const recoveryPath = join(root, "T1-rework9-rework5-never-started-recovery.mjs");
const authorityPath = join(root, "T1-rework9-rework5-never-started-authority.json");
const recoverySource = readFileSync(recoveryPath, "utf8");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
const shaFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
const unxml = (value) => value.replaceAll("&apos;", "'").replaceAll("&quot;", "\"")
  .replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
const render = (template, replacements) => {
  let output = template;
  for (const [name, value] of Object.entries(replacements)) {
    output = output.replaceAll(`__${name}__`, xml(value));
  }
  if (/__[A-Z_]+__/.test(output)) throw new Error("FIXTURE_PLACEHOLDER_REMAINS");
  return output;
};
const programArguments = (plist) => {
  const match = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (match === null) throw new Error("PROGRAM_ARGUMENTS_MISSING");
  return [...match[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((item) => unxml(item[1]));
};

const sample = Object.freeze({
  NODE: "/private/runtime path/node&binary",
  CONTROLLER: "/repo/controller <one>.mjs",
  WORKER: "/repo/worker 'two'.mjs",
  RECEIPT_DIR: "/receipt/a & b",
  EXECUTION_PACKET: "/packet/<exact>.json",
  SECRET_FILE: "/secret/\"quoted\" file",
  CWD: "/repo/cwd with spaces",
  TMPDIR: "/private/tmp/a&b",
  RUN_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  CONTROLLER_LABEL: "com.debateai.fixture.controller",
  WORKER_LABEL: "com.debateai.fixture.worker",
  CONTROLLER_STDOUT: "/logs/controller stdout.log",
  CONTROLLER_STDERR: "/logs/controller stderr.log",
  WORKER_STDOUT: "/logs/worker stdout.log",
  WORKER_STDERR: "/logs/worker stderr.log"
});
const controller = render(controllerTemplate, sample);
const worker = render(workerTemplate, sample);
const expectedPrefix = ["/bin/zsh", "-c", 'exec "$@"', "t1-gate-launchd-wrapper"];
const expectedController = [...expectedPrefix, sample.NODE, sample.CONTROLLER, sample.RECEIPT_DIR,
  sample.EXECUTION_PACKET, sample.SECRET_FILE];
const expectedWorker = [...expectedPrefix, sample.NODE, sample.WORKER, sample.RECEIPT_DIR,
  sample.EXECUTION_PACKET, sample.SECRET_FILE];
const controllerArgs = programArguments(controller);
const workerArgs = programArguments(worker);
const failures = [];
if (JSON.stringify(controllerArgs) !== JSON.stringify(expectedController)) {
  failures.push(`controller_direct_program=${controllerArgs[0]}`);
}
if (JSON.stringify(workerArgs) !== JSON.stringify(expectedWorker)) {
  failures.push(`worker_direct_program=${workerArgs[0]}`);
}
for (const [name, rendered] of [["controller", controller], ["worker", worker]]) {
  for (const token of [sample.CWD, sample.TMPDIR, sample.RUN_ID]) {
    if (!rendered.includes(xml(token))) failures.push(`${name}_preserved_binding_missing`);
  }
  if (!rendered.includes("<key>AbandonProcessGroup</key>\n  <false/>")) {
    failures.push(`${name}_abandon_process_group_changed`);
  }
  if (/setsid|nohup|disown|start_new_session|exec\s+[^"<]*__/.test(rendered)) {
    failures.push(`${name}_extra_process_or_interpolation`);
  }
}
if (!controller.includes("<key>KeepAlive</key>\n  <dict>")
  || !worker.includes("<key>KeepAlive</key>\n  <false/>")) {
  failures.push("keepalive_semantics_changed");
}
const inheritedTty = /spawnSync\("\/usr\/bin\/tty", \[\], \{\s*encoding: "utf8",\s*stdio: \["inherit", "pipe", "inherit"\]\s*\}\)/m;
if (!inheritedTty.test(viewerSource)) failures.push("viewer_tty_stdin_not_inherited");
if (/spawnSync\("\/usr\/bin\/tty", \[\], \{ encoding: "utf8" \}\)/.test(viewerSource)) {
  failures.push("viewer_tty_default_piped_stdin");
}
for (const token of ["VIEWER_CHALLENGE_INVALID", "VIEWER_TTY_UNAVAILABLE", "viewer.ready.json",
  "unlinkSync(challengePath)", "detached: false", 'stdio: "inherit"']) {
  if (!viewerSource.includes(token)) failures.push(`viewer_rule_missing:${token}`);
}
for (const token of [
  "e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16", "viewer.ready.json",
  "never-started-rework5-archived-lock", "labelAbsentExact", "inspectProcesses",
  "immutable recovery intent precedes the only rename", "archiveLockPreservingInodes",
  "NEVER_STARTED_RECOVERED_LOCK_ARCHIVED"
]) {
  if (!recoverySource.includes(token)) failures.push(`recovery_rule_missing:${token}`);
}
if (!recoverySource.includes('from "./T1-rework9-rework3-recovery-core.mjs"')) {
  failures.push("approved_recovery_core_not_reused");
}
for (const pattern of [/launchctl", \["bootstrap"/, /launchctl", \["bootout"/,
  /unlinkSync|rmdirSync|rmSync/, /spawnSync\([^\n]*(?:vitest|viewer|worker|controller)/]) {
  if (pattern.test(recoverySource)) failures.push(`recovery_forbidden:${pattern.source}`);
}
for (const [name, binding] of [["tool", authority.recovery_tool],
  ["core", authority.recovery_core], ["evidence", authority.failure_evidence],
  ["packet", authority.execution_packet]]) {
  const stats = lstatSync(binding.path);
  if (shaFile(binding.path) !== binding.sha256 || stats.size !== binding.size
    || stats.mtimeMs !== binding.mtime_ms) failures.push(`authority_tuple_mismatch:${name}`);
}
if (authority.run_id !== "e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16"
  || authority.classification !== "NEVER_STARTED_ONLY" || authority.one_time !== true
  || authority.no_second_run_authority !== true
  || authority.no_test_viewer_worker_or_supervisor_execution_authority !== true
  || (lstatSync(authorityPath).mode & 0o222) !== 0) {
  failures.push("recovery_authority_not_exact_or_immutable");
}
if (failures.length > 0) {
  process.stderr.write(`REWORK5_RED ${failures.join(" ")} rendered_argv_escaping=checked no_extra_process_group=checked\n`);
  process.exit(1);
}
process.stdout.write(`REWORK5_GREEN controller_argv=${JSON.stringify(controllerArgs)} worker_argv=${JSON.stringify(workerArgs)} rendered_argv_escaping=exact no_extra_process_group=true viewer_tty_stdin=inherited readiness_challenge=preserved\n`);
