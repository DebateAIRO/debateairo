import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const reportRoot = `${root}/.hermes/reports/support-conversation-20260914`;
const relativePaths = [
  "probes/GUIDE_RUNTIME6/reload-owned-preview.mjs",
  "probes/GUIDE_RUNTIME6/start-preview-detached.mjs",
  "probes/GUIDE_RUNTIME6/verify-ready.mjs",
  "probes/GUIDE_RUNTIME6/verify-idle.mjs",
  "probes/GUIDE_RUNTIME6/package-receipt.mjs",
  "logs/GUIDE_RUNTIME6-reload.log",
  "logs/GUIDE_RUNTIME6-start.log",
  "logs/GUIDE_RUNTIME6-readiness.log",
  "logs/GUIDE_RUNTIME6-idle.log",
  "evidence/GUIDE_RUNTIME6-pre-reload.json",
  "evidence/GUIDE_RUNTIME6-stop.json",
  "evidence/GUIDE_RUNTIME6-stack-custody.json",
  "evidence/GUIDE_RUNTIME6-readiness.json",
  "evidence/GUIDE_RUNTIME6-idle-custody.json",
  "evidence/GUIDE_RUNTIME6.md",
  "agent-reports/GUIDE_RUNTIME6.md",
];
const artifacts = [];
for (const relative of relativePaths) {
  const path = resolve(reportRoot, relative);
  if (path.includes("GUIDE_LIVE7-stack.log") || path.includes("GUIDE_LIVE5-stack.log")) {
    throw new Error("GUIDE_RUNTIME6_PRIVATE_LOG_MUST_NOT_BE_HASHED");
  }
  const bytes = await readFile(path);
  const details = await stat(path);
  artifacts.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: details.size });
}
const receipt = {
  schemaVersion: 1,
  node: "GUIDE_RUNTIME6",
  ticket: "t_88dc7708",
  revision: "152eed4da1cd3e66b74d8301159ba76427552409",
  verdict: "PASS_BOUNDED_RUNTIME_RELOAD",
  runtime: {
    pid: 77769,
    ppid: 1,
    pgid: 77769,
    command: "pnpm dev:auth:up",
    profile: "support-preview",
    ongoingPrivateLog: `${reportRoot}/logs/GUIDE_LIVE7-stack.log`,
    ongoingPrivateLogExcludedFromArtifacts: true,
  },
  limitations: [
    "RUNTIME_READINESS_ONLY",
    "NO_SUPPORT_MODEL_STATUS_OR_CAPACITY_TRAFFIC",
    "NO_OWNER_QUOTA_OR_TESTABILITY_CLAIM",
    "FORGOT_DESTINATION_UNRESOLVED",
    "NO_CHECKPOINT_OR_ACCEPTANCE_CLAIM",
  ],
  artifacts,
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ artifactCount: artifacts.length, verdict: receipt.verdict }, null, 2)}\n`);
