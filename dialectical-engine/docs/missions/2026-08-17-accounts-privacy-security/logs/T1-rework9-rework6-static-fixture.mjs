#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("./", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const launcher = read("T1-rework9-gate-launcher.mjs");
const controller = read("T1-rework9-gate-controller.mjs");
const controllerTemplate = read("T1-rework9-gate-controller.plist.template");
const workerTemplate = read("T1-rework9-gate-worker.plist.template");
const helperPath = new URL("T1-rework9-launchd-stream-custody.mjs", root);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
const render = (template, replacements) => {
  let rendered = template;
  for (const [name, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`__${name}__`, xml(value));
  }
  if (/__[A-Z_]+__/.test(rendered)) throw new Error("FIXTURE_PLACEHOLDER_REMAINS");
  return rendered;
};
const stringForKey = (plist, key) => {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  if (match === null) throw new Error(`FIXTURE_KEY_MISSING:${key}`);
  return match[1].replaceAll("&amp;", "&").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&apos;", "'");
};

const fakeReceipt = "/Documents/repo/logs/T1-rework9-gate-11111111-1111-4111-8111-111111111111";
const fakeTmp = "/private/var/folders/private/debateai-t1gate-11111111-1111-4111-8111-111111111111";
const common = {
  NODE: "/runtime/node", RECEIPT_DIR: fakeReceipt, EXECUTION_PACKET: "/Documents/packet.json",
  SECRET_FILE: `${fakeTmp}/controller-custody.secret`, CWD: "/Documents/repo",
  TMPDIR: fakeTmp, RUN_ID: "11111111-1111-4111-8111-111111111111"
};
const renderedController = render(controllerTemplate, {
  ...common, CONTROLLER_LABEL: "com.debateai.controller.fake", CONTROLLER: "/Documents/controller.mjs",
  CONTROLLER_STDOUT: `${fakeTmp}/controller.stdout.log`,
  CONTROLLER_STDERR: `${fakeTmp}/controller.stderr.log`
});
const renderedWorker = render(workerTemplate, {
  ...common, WORKER_LABEL: "com.debateai.worker.fake", WORKER: "/Documents/worker.mjs",
  WORKER_STDOUT: `${fakeTmp}/worker.stdout.log`, WORKER_STDERR: `${fakeTmp}/worker.stderr.log`
});
const violations = [];
for (const [name, plist, expectedOut, expectedErr] of [
  ["controller", renderedController, `${fakeTmp}/controller.stdout.log`, `${fakeTmp}/controller.stderr.log`],
  ["worker", renderedWorker, `${fakeTmp}/worker.stdout.log`, `${fakeTmp}/worker.stderr.log`]
]) {
  const stdout = stringForKey(plist, "StandardOutPath");
  const stderr = stringForKey(plist, "StandardErrorPath");
  if (stdout !== expectedOut || stdout.startsWith(fakeReceipt)) violations.push(`${name}_stdout_documents`);
  if (stderr !== expectedErr || stderr.startsWith(fakeReceipt)) violations.push(`${name}_stderr_documents`);
}
if (!launcher.includes("launchd_streams: launchdStreams")) violations.push("owner_missing_launchd_streams");
if (!launcher.includes("for (const stream of Object.values(launchdStreamPaths))")) {
  violations.push("temp_streams_not_exclusive");
}
if (!launcher.includes("for (const stream of [testStdout, testStderr])")) {
  violations.push("documents_streams_precreated_by_old_loop");
}
if (launcher.includes("CONTROLLER_STDOUT: controllerStdout")
  || launcher.includes("CONTROLLER_STDERR: controllerStderr")) {
  violations.push("controller_plist_receipt_streams");
}
if (launcher.includes("WORKER_STDOUT: workerStdout")
  || launcher.includes("WORKER_STDERR: workerStderr")) {
  violations.push("worker_plist_receipt_streams");
}
const sealIndex = controller.indexOf("sealLaunchdStreams({");
const postflightIndex = controller.indexOf("const processPost = capture(");
const terminalIndex = controller.indexOf("const terminalReceipt = Object.freeze(");
const releaseIndex = controller.indexOf("const releaseReceipt = Object.freeze(");
if (sealIndex < 0 || postflightIndex < 0 || sealIndex > postflightIndex) {
  violations.push("streams_not_sealed_before_postflight");
}
if (!controller.includes("launchd_streams_sha256: launchdStreamsSha256")) {
  violations.push("postflight_missing_stream_hash");
}
if (terminalIndex < 0 || !controller.slice(terminalIndex, releaseIndex).includes("launchd_streams_sha256")) {
  violations.push("terminal_missing_stream_hash");
}
if (releaseIndex < 0 || !controller.slice(releaseIndex).includes("launchd_streams_sha256")) {
  violations.push("release_missing_stream_hash");
}
if (violations.length > 0) {
  process.stderr.write(`REWORK6_RED ${violations.join(",")} old_documents_precreated_output_contract=true\n`);
  process.exit(1);
}

const { sealLaunchdStreams } = await import(pathToFileURL(helperPath.pathname).href);
const sandbox = mkdtempSync(join(tmpdir(), "t1-rework6-fixture-"));
const privateDir = join(sandbox, "private");
const receiptDir = join(sandbox, "receipt");
mkdirSync(privateDir, { mode: 0o700 });
mkdirSync(receiptDir, { mode: 0o700 });
chmodSync(privateDir, 0o700);
chmodSync(receiptDir, 0o700);
const plan = Object.freeze({
  controller: Object.freeze({
    stdout: Object.freeze({ launchd_path: join(privateDir, "controller.stdout.log"), receipt_path: join(receiptDir, "controller.stdout.log") }),
    stderr: Object.freeze({ launchd_path: join(privateDir, "controller.stderr.log"), receipt_path: join(receiptDir, "controller.stderr.log") })
  }),
  worker: Object.freeze({
    stdout: Object.freeze({ launchd_path: join(privateDir, "worker.stdout.log"), receipt_path: join(receiptDir, "worker.stdout.log") }),
    stderr: Object.freeze({ launchd_path: join(privateDir, "worker.stderr.log"), receipt_path: join(receiptDir, "worker.stderr.log") })
  })
});
const bytes = Object.freeze({
  controller_stdout: "controller-out\n", controller_stderr: "controller-error\n",
  worker_stdout: "worker-out\n", worker_stderr: "worker-error\n"
});
for (const [source, value] of [
  [plan.controller.stdout.launchd_path, bytes.controller_stdout],
  [plan.controller.stderr.launchd_path, bytes.controller_stderr],
  [plan.worker.stdout.launchd_path, bytes.worker_stdout],
  [plan.worker.stderr.launchd_path, bytes.worker_stderr]
]) writeFileSync(source, value, { mode: 0o600, flag: "wx" });
const first = sealLaunchdStreams({ plan, receiptDir, runTmpdir: privateDir });
const second = sealLaunchdStreams({ plan, receiptDir, runTmpdir: privateDir });
for (const [role, stream, expected] of [
  ["controller", "stdout", bytes.controller_stdout], ["controller", "stderr", bytes.controller_stderr],
  ["worker", "stdout", bytes.worker_stdout], ["worker", "stderr", bytes.worker_stderr]
]) {
  const entry = first[role][stream];
  if (readFileSync(entry.receipt.path, "utf8") !== expected
    || entry.launchd.sha256 !== sha256(expected) || entry.receipt.sha256 !== sha256(expected)
    || entry.launchd.sha256 !== entry.receipt.sha256) throw new Error("STREAM_COPY_HASH_MISMATCH");
}
if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("STREAM_SEAL_NOT_IDEMPOTENT");
writeFileSync(plan.worker.stderr.launchd_path, "late-byte", { flag: "a" });
let mutationFailedClosed = false;
try { sealLaunchdStreams({ plan, receiptDir, runTmpdir: privateDir }); } catch {
  mutationFailedClosed = true;
}
if (!mutationFailedClosed) throw new Error("STREAM_MUTATION_DID_NOT_FAIL_CLOSED");
if (!existsSync(plan.controller.stdout.receipt_path)) throw new Error("DURABLE_RECEIPT_MISSING");
const recoveryTool = read("T1-rework9-rework6-never-started-recovery.mjs");
const authority = JSON.parse(read("T1-rework9-rework6-never-started-authority.json"));
const evidence = JSON.parse(read("T1-rework9-rework6-never-started-failure-evidence.json"));
if (authority.classification !== "SUPERVISOR_ONLY_NEVER_STARTED"
  || authority.run_id !== "15c9c6c5-3ca3-4e68-9fb9-587d8e19309f"
  || authority.grok_rework6_approval_required_before_execution !== true
  || authority.no_new_run_test_viewer_worker_or_supervisor_authority !== true
  || evidence.bindings.claim_sha256
    !== "8c598375472af4d603a803470d54dd9619b116e9c9cd06e986bf7b9d19df7f4d"
  || evidence.router_read_only_unified_log_diagnostic.mutable_unified_log_is_recovery_authority
    !== false) throw new Error("REWORK6_RECOVERY_BINDING_MISMATCH");
if (!recoveryTool.includes("archiveLockPreservingInodes")
  || !recoveryTool.includes("Immutable intent precedes the sole atomic archive")
  || /launchctl", \["(?:bootstrap|bootout)"|unlinkSync|rmdirSync|rmSync/.test(recoveryTool)) {
  throw new Error("REWORK6_RECOVERY_AUTHORITY_WIDENED");
}
process.stdout.write("REWORK6_GREEN launchd_documents_streams=false temp_0700=true durable_copy_hash=exact worker_absent_path=covered controller_preexec_recovery_helper=available ordering=streams-before-postflight-before-terminal-before-release idempotent=true mutation_fail_closed=true recovery_run_bound=true recovery_not_executed=true\n");
