import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths = [
  `${root}/probes/GUIDE_RUNTIME5/inventory.mjs`,
  `${root}/probes/GUIDE_RUNTIME5/start-preview-detached.mjs`,
  `${root}/probes/GUIDE_RUNTIME5/start-preview-after-docker.mjs`,
  `${root}/probes/GUIDE_RUNTIME5/verify-ready.mjs`,
  `${root}/probes/GUIDE_RUNTIME5/verify-idle.mjs`,
  `${root}/probes/GUIDE_RUNTIME5/package-receipt.mjs`,
  `${root}/evidence/GUIDE_RUNTIME5-prestart.json`,
  `${root}/evidence/GUIDE_RUNTIME5-stack-custody.json`,
  `${root}/evidence/GUIDE_RUNTIME5-stack-custody-active.json`,
  `${root}/evidence/GUIDE_RUNTIME5-startup-recovery.json`,
  `${root}/evidence/GUIDE_RUNTIME5-readiness.json`,
  `${root}/evidence/GUIDE_RUNTIME5-idle-custody.json`,
  `${root}/evidence/GUIDE_RUNTIME5.md`,
  `${root}/agent-reports/GUIDE_RUNTIME5.md`,
  `${root}/logs/GUIDE_RUNTIME5-inventory.log`,
  `${root}/logs/GUIDE_RUNTIME5-start.log`,
  `${root}/logs/GUIDE_RUNTIME5-readiness.log`,
  `${root}/logs/GUIDE_RUNTIME5-readiness-active.log`,
  `${root}/logs/GUIDE_RUNTIME5-idle.log`,
];
const artifacts = [];
for (const path of paths) {
  const bytes = await readFile(path);
  artifacts.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: (await stat(path)).size,
  });
}
const receipt = {
  schemaVersion: 1,
  node: "GUIDE_RUNTIME5",
  ticket: "t_187346a1",
  session: "/root/preview",
  revision: "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  verdict: "PASS_RUNTIME_RESTORED_ONLY",
  createdAt: new Date().toISOString(),
  checks: {
    productClean: true,
    oldSupervisorAbsent: true,
    requiredPreviewListeners: 12,
    requiredPreviewListenersPresent: 12,
    unrelatedListenersPreserved: true,
    detachedSupervisor: { pid: 20420, ppid: 1, pgid: 20420 },
    ordinarySystemTls: { url: "https://localhost:3100/help", status: 200, customCa: false, insecure: false },
    supportRequests: 0,
    statusQueries: 0,
    capacityQueries: 0,
    modelRequests: 0,
  },
  ongoingPrivateLog: `${root}/logs/GUIDE_LIVE5-stack.log`,
  ongoingPrivateLogExcludedFromArtifacts: true,
  limitations: [
    "Runtime restoration does not prove Support answer quality, capacity, manual quota, owner testability, checkpoint readiness, or acceptance.",
    "Forgot password remains unresolved and actionless.",
  ],
  artifacts,
};
await writeFile(`${root}/evidence/GUIDE_RUNTIME5-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ artifacts: artifacts.length, verdict: receipt.verdict }, null, 2)}\n`);
