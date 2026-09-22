import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const reportRoot = `${root}/.hermes/reports/support-conversation-20260914`;
const evidence = `${reportRoot}/evidence`;
const reports = `${reportRoot}/agent-reports`;
const revision = "0d34f82f4a2188d0ce1db04655b693798ffd2169";
const verdict = "BLOCKED_AUTOREVIEW_PAID_STARTUP_HANDSHAKE";
const attemptedOutput = `${evidence}/GUIDE_PREVIEW_RECOVER33-handshake-diagnostic.json`;
const runtime9Log = `${reportRoot}/logs/GUIDE_RUNTIME9-stack.log`;
async function absent(path) { try { await access(path); return false; } catch { return true; } }
async function descriptor(path) {
  const bytes = await readFile(path);
  return { absolute: path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
}
const rejectionText = "This action was rejected due to unacceptable risk.\nReason: This executes a real paid Hermes model handshake using locally stored credentials and sends a prompt to an external provider; the user did not explicitly authorize that specific payload, destination, or paid network side effect.\nThe agent must not attempt to achieve the same outcome via workaround, indirect execution, or policy circumvention. Proceed only with a materially safer alternative, or if the user explicitly approves the action after being informed of the risk. Otherwise, stop and request user input.";
const blocked = {
  schemaVersion: 1,
  node: "GUIDE_PREVIEW_RECOVER33",
  ticket: "t_21dbe7b0",
  revision,
  verdict,
  requestedOperation: {
    destination: "Z.AI GLM through the repository-supported Hermes CLI",
    fixedPrompt: "HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK",
    paidExternalRequest: true,
    localStoredCredentialUse: true,
    timeoutMs: 180000
  },
  autoReview: { outcome: "REJECTED", rejectionText },
  execution: {
    diagnosticHandshakeStarted: false,
    diagnosticHandshakeAttempts: 0,
    runtime9Started: false,
    runtime9StartAttempts: 0,
    newStartupModelAttempts: 0,
    supportSessionsCreated: 0,
    supportMessagesSent: 0,
    statusReads: 0,
    capacityReads: 0,
    databaseQueries: 0,
    handshakeDiagnosticOutputAbsent: await absent(attemptedOutput),
    runtime9PrivateLogAbsent: await absent(runtime9Log)
  },
  safeNextStep: "Explicit user approval for up to two paid Z.AI/GLM startup handshakes using the exact fixed prompt and existing local credential; then resume the retained diagnostic before any Runtime9 start.",
  productChanged: false,
  privateLogReadBeyondAuthorizedClosedRuntime8Filter: false,
  privateValuesRetained: false,
  recordedAtUtc: new Date().toISOString()
};
const blockerPath = `${evidence}/GUIDE_PREVIEW_RECOVER33-autoreview-blocker.json`;
await writeFile(blockerPath, `${JSON.stringify(blocked, null, 2)}\n`, { flag: "wx", mode: 0o600 });

const narrative = `# GUIDE_PREVIEW_RECOVER33\n\nVerdict: **${verdict}**. Product revision \`${revision}\` remains clean and unchanged. Runtime9 was not started.\n\nThe one authorized closed Runtime8 log filter verified an own-UID mode-0600 regular file with no writer, retained no raw bytes, and projected only \`DEV_AUTH_STACK_SUPPORT_MODEL_FAILED\`. Public source places credential custody and one real paid Hermes GLM handshake inside that stage before port 8894 binds. Current file custody, binary existence, failed-process absence, and free ports were verified, but none was proved to differ from Runtime8, so an unchanged restart was correctly withheld.\n\nThe frozen handshake amendment authorized one exact production-stage diagnostic using the fixed prompt \`HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK\`. Automatic approval review rejected that external paid request because it would use locally stored credentials to send the prompt to Z.AI/GLM without explicit user approval for the payload, destination, and paid side effect. The command did not start; the diagnostic output and Runtime9 private log remain absent. No new handshake, Support session/message, status, capacity, database, or model traffic occurred.\n\nThe retained diagnostic script uses the exact supported command-environment/profile loader and \`createDevelopmentAuthStackOperations(...).startSupportModelRelay()\`, the existing 180-second timeout, a source-enumerated outcome allowlist, immediate relay cleanup on success, and no raw stdout, stderr, exception, credential, or environment retention. It may only be resumed after explicit user approval. A successful diagnostic would authorize one supported Runtime9 start, which performs a second identical startup handshake.\n\nHistorical \"zero model traffic\" language is qualified: Runtime8 did attempt its startup handshake; no Support-answer traffic occurred. This node added zero new model attempts. Product \`0d34\`, FINAL18, KB \`7ef\`, the current full58 proof, the FIX30 screenshot helper, and the 123 absent future paths remain unchanged from BIND32. No recovery, final operator rebinding, TLS readiness, or Runtime9 custody claim is made.\n\nSKILLS LOADED: retained mission BODY/protocol context; no new skill was invoked. Native session: original Sol \`/root/preview\`. Forgot destination remains unresolved; CP1 acceptance and CP2 remain gated.\n\nSelf-report prompt retained verbatim: “treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.”\n\nEfficiency finding: the startup code collapses distinct Hermes credential, process, timeout, output, and handshake failures into one outer DEV stage. A privacy-safe nested fixed-code projection at the supported lifecycle boundary would have avoided the closed-log exception and the extra authorization round while retaining secret and provider-output privacy.\n`;
const reportPath = `${evidence}/GUIDE_PREVIEW_RECOVER33.md`;
const agentPath = `${reports}/GUIDE_PREVIEW_RECOVER33.md`;
await writeFile(reportPath, narrative, { flag: "wx", mode: 0o600 });
await writeFile(agentPath, narrative, { flag: "wx", mode: 0o600 });
const selfPath = `${evidence}/GUIDE_PREVIEW_RECOVER33-self-report.json`;
await writeFile(selfPath, `${JSON.stringify({
  schemaVersion: 1, node: "GUIDE_PREVIEW_RECOVER33", ticket: "t_21dbe7b0", revision, verdict,
  diagnosis: "DEV_AUTH_STACK_SUPPORT_MODEL_FAILED",
  runtime9Started: false, newStartupModelAttempts: 0, supportAnswerTraffic: 0,
  exactBlocker: "AUTO_REVIEW_EXPLICIT_USER_APPROVAL_REQUIRED_FOR_PAID_ZAI_GLM_HANDSHAKE",
  nextStep: blocked.safeNextStep,
  report: reportPath
}, null, 2)}\n`, { flag: "wx", mode: 0o600 });

const artifactPaths = [
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_PREVIEW_RECOVER33.md`,
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_PREVIEW_RECOVER33_HANDSHAKE.md`,
  `${evidence}/GUIDE_PREVIEW_RECOVER33-inputs.json`,
  `${evidence}/GUIDE_PREVIEW_RECOVER33-freeze-resume.json`,
  `${evidence}/GUIDE_PREVIEW_RECOVER33_HANDSHAKE-freeze-resume.json`,
  `${reportRoot}/probes/GUIDE_PREVIEW_RECOVER33/extract-closed-runtime-code.mjs`,
  `${reportRoot}/probes/GUIDE_PREVIEW_RECOVER33/diagnose-support-model-stage.mjs`,
  `${evidence}/GUIDE_PREVIEW_RECOVER33-diagnosis.json`,
  blockerPath, reportPath, agentPath, selfPath
];
const manifestPath = `${evidence}/GUIDE_PREVIEW_RECOVER33-manifest.json`;
const manifest = {
  schemaVersion: 1, node: "GUIDE_PREVIEW_RECOVER33", ticket: "t_21dbe7b0", revision, verdict,
  privateLogsExcluded: true,
  artifacts: await Promise.all(artifactPaths.map(descriptor))
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const receiptPath = `${evidence}/GUIDE_PREVIEW_RECOVER33-receipt.json`;
const receiptPaths = [...artifactPaths, manifestPath];
const receipt = {
  schemaVersion: 1, node: "GUIDE_PREVIEW_RECOVER33", ticket: "t_21dbe7b0", revision, verdict,
  artifacts: await Promise.all(receiptPaths.map(descriptor)),
  excluded: [
    receiptPath,
    `${reportRoot}/logs/GUIDE_RUNTIME8-stack.log`,
    runtime9Log
  ]
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const receiptStat = await stat(receiptPath);
const receiptHash = createHash("sha256").update(await readFile(receiptPath)).digest("hex");
console.log(JSON.stringify({ verdict, receiptPath, receiptHash, receiptBytes: receiptStat.size, artifactCount: receipt.artifacts.length }));
