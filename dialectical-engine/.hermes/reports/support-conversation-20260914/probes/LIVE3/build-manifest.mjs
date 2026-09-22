import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths = [
  "agent-reports/LIVE3.md",
  "evidence/LIVE3.md",
  "evidence/LIVE3-required-suites.json",
  "evidence/LIVE3-actual-relay-receipt.json",
  "evidence/LIVE3-diagnostic-baseline.json",
  "evidence/LIVE3-diagnostic-counts.json",
  "evidence/LIVE3-stack-custody.json",
  "evidence/LIVE3-stack-custody-r2.json",
  "evidence/LIVE3-stack-receipt.json",
  "evidence/LIVE3-full-en.png",
  "evidence/LIVE3-full-ro.png",
  "evidence/LIVE3-compact-ro.png",
  "logs/LIVE3-integrated-suite.log",
  "logs/LIVE3-stack-preflight.log",
  "logs/LIVE3-stack-reload-stop.log",
  "logs/LIVE3-launch-detached.log",
  "logs/LIVE3-stack-ready.log",
  "logs/LIVE3-stack-ready-diagnosis.log",
  "logs/LIVE3-stack-launch-category.log",
  "logs/LIVE3-stack-detached.log",
  "logs/LIVE3-launch-detached-r2.log",
  "logs/LIVE3-stack-ready-r2.log",
  "logs/LIVE3-actual-relay-browser.log",
  "logs/LIVE3-console-classifier-control.log",
  "logs/LIVE3-diagnostic-counts.log",
  "logs/LIVE3-stack-postflight.log",
  "probes/LIVE3/start-preview-detached.mjs",
  "probes/LIVE3/start-preview-detached-r2.mjs",
  "probes/LIVE3/capture-actual-relay.mjs",
  "probes/LIVE3/console-classifier.mjs",
  "probes/LIVE3/verify-console-classifier.mjs",
  "probes/LIVE3/count-diagnostics.mjs",
  "probes/LIVE3/build-manifest.mjs",
  "probes/LIVE3/verify-manifest.mjs"
];
const hashes = {};
for (const path of paths) {
  hashes[path] = createHash("sha256").update(await readFile(`${reportRoot}/${path}`)).digest("hex");
}
const manifest = {
  schema_version: 1,
  node: "LIVE3",
  ticket: "t_8a5cf2e8",
  session: "/root/preview",
  revision: "43cf9386ea3c9e7c79523ec38debe63271d19292",
  worktree_clean: true,
  product_or_git_edits: 0,
  integrated: { files_passed: 20,tests_passed: 776,todo: 1,total: 777,rc: 0,duration_seconds: 78.83 },
  actual_matrix: { requests: 7,http_200: 7,grounded: 4,refused: 3,clean_manual_passes: 3,retries: 0 },
  fixed_diagnostics: { TEXT_LINK_OR_MARKUP: 1,TEXT_CREDENTIAL_OR_SECURITY_ACTION: 2,request_attribution: false },
  console_errors: { HTTP_401: 11,HTTP_404: 0,JS_OR_HYDRATION: 0,OTHER: 0,raw_text_retained: false },
  preview: { pid: 40443,process_group: 40443,parent_pid: 1,normal_tls_help_status: 200,detached_after_idle: true,active: true },
  immutable_sha256: hashes,
  excluded_mutable_artifact: "logs/LIVE3-stack-detached-r2.log",
  usage: "UNAVAILABLE",
  result: "FUNCTIONAL_BLOCKER"
};
await writeFile(`${reportRoot}/evidence/LIVE3-manifest.json`,JSON.stringify(manifest,null,2) + "\n");
process.stdout.write(`manifest_entries=${paths.length}\n`);
