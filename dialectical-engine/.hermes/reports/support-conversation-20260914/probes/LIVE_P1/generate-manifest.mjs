import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths = [
  "agent-reports/LIVE_P1.md",
  "evidence/LIVE_P1.md",
  "evidence/LIVE_P1-actual-relay-receipt.json",
  "evidence/LIVE_P1-compact-ro.png",
  "evidence/LIVE_P1-full-en.png",
  "evidence/LIVE_P1-full-ro.png",
  "evidence/LIVE_P1-required-suites-draft.json",
  "evidence/LIVE_P1-required-suites.json",
  "evidence/LIVE_P1-stack-custody.json",
  "evidence/LIVE_P1-stack-receipt.json",
  "logs/LIVE_P1-actual-relay-browser.log",
  "logs/LIVE_P1-integrated-suite.log",
  "logs/LIVE_P1-launch-detached.log",
  "logs/LIVE_P1-stack-postflight.log",
  "logs/LIVE_P1-stack-preflight.log",
  "logs/LIVE_P1-stack-ready.log",
  "logs/LIVE_P1-stack-reload-stop.log",
  "logs/LIVE_P1-strict-seven-consumer-control-final.log",
  "logs/LIVE_P1-strict-seven-consumer-control.log",
  "probes/LIVE_P1/capture-actual-relay.mjs",
  "probes/LIVE_P1/console-classifier.mjs",
  "probes/LIVE_P1/diagnostic-consumer.mjs",
  "probes/LIVE_P1/generate-manifest.mjs",
  "probes/LIVE_P1/start-preview-detached.mjs",
  "probes/LIVE_P1/verify-diagnostic-consumer.mjs",
  "probes/LIVE_P1/verify-manifest.mjs"
];

const immutable_sha256 = {};
for (const path of paths) {
  immutable_sha256[path] = createHash("sha256").update(await readFile(`${root}/${path}`)).digest("hex");
}

const manifest = {
  schema_version: 1,
  node: "LIVE_P1",
  revision: "e0dcfe77f49655bea774bdfacf988b911be4ff06",
  immutable_sha256,
  exclusions: {
    "logs/LIVE_P1-stack-detached.log": "Active mode-0600 runtime log may grow while the supported preview remains active."
  }
};
await writeFile(`${root}/evidence/LIVE_P1-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`manifest_entries=${paths.length}\n`);
