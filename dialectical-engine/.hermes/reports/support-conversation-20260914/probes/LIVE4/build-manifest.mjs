import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths = [
  "agent-reports/LIVE4.md",
  "agent-reports/LIVE4-superseded.md",
  "evidence/LIVE4.md",
  "evidence/LIVE4-required-suites.json",
  "evidence/LIVE4-actual-relay-receipt.json",
  "evidence/LIVE4-diagnostic-projection-receipt.json",
  "evidence/LIVE4-stack-custody.json",
  "evidence/LIVE4-stack-custody-r2.json",
  "evidence/LIVE4-stack-receipt.json",
  "evidence/LIVE4-full-en.png",
  "evidence/LIVE4-full-ro.png",
  "evidence/LIVE4-compact-ro.png",
  "evidence/LIVE4-superseded.md",
  "evidence/LIVE4-superseded-manifest.json",
  "evidence/LIVE4-superseded-actual-relay-receipt.json",
  "evidence/LIVE4-superseded-map.json",
  "logs/LIVE4-integrated-suite.log",
  "logs/LIVE4-diagnostic-consumer-control.log",
  "logs/LIVE4-strict-seven-consumer-control.log",
  "logs/LIVE4-retrospective-projection.log",
  "logs/LIVE4-stack-preflight.log",
  "logs/LIVE4-stack-reload-stop.log",
  "logs/LIVE4-launch-detached.log",
  "logs/LIVE4-stack-ready.log",
  "logs/LIVE4-stack-ready-diagnosis.log",
  "logs/LIVE4-stack-detached.log",
  "logs/LIVE4-launch-detached-r2.log",
  "logs/LIVE4-stack-ready-r2.log",
  "logs/LIVE4-actual-relay-browser.log",
  "logs/LIVE4-stack-postflight.log",
  "logs/LIVE4-superseded-diagnostic-consumer-control.log",
  "logs/LIVE4-superseded-manifest-verification.log",
  "probes/LIVE4/start-preview-detached.mjs",
  "probes/LIVE4/start-preview-detached-r2.mjs",
  "probes/LIVE4/capture-actual-relay.mjs",
  "probes/LIVE4/console-classifier.mjs",
  "probes/LIVE4/diagnostic-consumer.mjs",
  "probes/LIVE4/verify-diagnostic-consumer.mjs",
  "probes/LIVE4/project-retrospective-receipt.mjs",
  "probes/LIVE4/build-manifest.mjs",
  "probes/LIVE4/verify-manifest.mjs",
  "probes/LIVE4/superseded-diagnostic-consumer.mjs",
  "probes/LIVE4/superseded-verify-diagnostic-consumer.mjs",
  "probes/LIVE4/superseded-build-manifest.mjs",
  "probes/LIVE4/superseded-verify-manifest.mjs"
];
const hashes = {};
for (const path of paths) {
  hashes[path] = createHash("sha256").update(await readFile(`${reportRoot}/${path}`)).digest("hex");
}
const manifest = {
  schema_version: 1,node:"LIVE4",ticket:"t_d69a47ed",session:"/root/preview",
  revision:"6e5ab5fc41acebbff4264efc7d481df3db8dce44",
  worktree_clean:true,product_or_git_edits:0,
  integrated:{ files_passed:21,tests_passed:831,todo:1,total:832,rc:0,duration_seconds:80.34 },
  actual_matrix:{ requests:7,http_200:7,grounded:6,refused:1,manually_useful:6,retries:0 },
  diagnostic:{ attributed:1,no_event:6,ambiguous:0,invalid:0,duplicates:0,
    code:"SUPPORT_DRAFT_TEXT_INTERNAL_IDENTIFIER",predicate:"NARRATIVE_INTERNAL_IDENTIFIER",
    producer_keys:["attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"],
    projection:"RETROSPECTIVE_STRICT_SEVEN",new_support_requests:0,attribution_strengthened:false },
  console_errors:{ HTTP_401:11,HTTP_404:0,JS_OR_HYDRATION:0,OTHER:0,raw_text_retained:false },
  preview:{ pid:91461,process_group:91461,parent_pid:1,normal_tls_help_status:200,detached_after_idle:true,active:true },
  immutable_sha256:hashes,
  excluded_mutable_artifact:"logs/LIVE4-stack-detached-r2.log",
  superseded_nonconforming:{
    reason:"original consumer serialized twelve producer fields instead of the permitted seven",
    map:"evidence/LIVE4-superseded-map.json",
    conforming:false
  },
  usage:"UNAVAILABLE",result:"FUNCTIONAL_BLOCKER"
};
await writeFile(`${reportRoot}/evidence/LIVE4-manifest.json`,JSON.stringify(manifest,null,2)+"\n");
process.stdout.write(`manifest_entries=${paths.length}\n`);
