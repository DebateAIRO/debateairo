// The preview practice tool (dialectical-engine/tools/preview-practice/practice.ts), end to end against the scripted
// unix-socket gate doubles (tests/support/preview-gate-stubs.ts, shared with preview-busy-model-run.test.ts). Both
// modes run through the tool's own entry point (runPractice), with the real gate RPC ports, the real guarded fetch,
// the real gateways, the real prompt builders and format checks; the debate mode also through a real throwaway
// embedded PostgreSQL, the real migrations, a register exported the way root exports the live one (the README's SQL)
// and imported through the register's own publication paths, the real ask path (PostgresAskApplication.submit) and
// the real runner. Only the waits (60-second resend, 10-minute cooldown) are injected. No vendor is ever contacted.
// Integration suites are skipped by the CI gate: run this file by hand before merging.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "@debateai/db";
import {
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText
} from "@debateai/register";
import { PREVIEW_REVIEWED_PROVIDER_REFS, PREVIEW_GLM_DEADLINE_MS, previewTargetJsonRow } from "@debateai/providers";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { runPractice } from "../../tools/preview-practice/practice.js";
import { practiceDebateGraph } from "../../tools/preview-practice/practice-lanes.js";
import { PRACTICE_QUESTIONS } from "../../tools/preview-practice/practice-questions.js";
import { startPreviewGateStubs, type GateOverride, type GateRequest } from "../support/preview-gate-stubs.js";
import { startTestDatabase } from "../support/testDatabase.js";

const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const GLM = "zai-org/GLM-5.3-Flash";
const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", MIMO, "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const OBSERVATION = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-12T08:00:00.000Z" };

/** A panel reply that breaks the schema the way MiMo's did on 2026-10-11: a number written as a word. */
const BAD_PANEL = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: "high" },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 }, context: { fit: 0, ambiguityFlags: [] }, fallacy: { severity: 1, fatalFlags: [] }
});
const mimoPanelBad = (request: GateRequest): GateOverride | null =>
  request.model === MIMO && request.kind === "PANEL" ? { content: BAD_PANEL } : null;

let folder: string;
let registerExportPath: string;
const closers: (() => Promise<void>)[] = [];

/** A register built the way the live preview's was (history v4, then the publish kit v2 on top), exported by the README's SQL. */
async function exportedRegister(): Promise<string> {
  const scratch = await startTestDatabase();
  try {
    await migrate(scratch.pool);
    const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), OBSERVATION)];
    const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
      .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
    const base = [...source.filter((row) => !["consumerRecoveryPolicy", "publicationCheckPolicy", "taxAuthorities", "answerRoleRotationPolicy"]
      .includes(row.rowKey)), ...owned];
    await createPostgresRegisterPublicationPort(scratch.pool).importHistorical({ registerVersion: parseRegisterVersionText("4"), rows: base });
    const v4 = await readSealedSnapshot(scratch.pool, "4");
    const snapshot = composePreviewSnapshotV2({ sourceRows: source, baseRows: v4.rows, baseRegisterVersion: "4", baseSnapshotSha256: v4.snapshotSha256 });
    await publishPreviewRegisterV2(scratch.pool, { publicationId: randomUUID(), sourceRef: "preview practice fixture", snapshot,
      approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256,
        snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } });
    // The README's own root command (step S-1), its SQL read out of the README and run with version 5.
    const readme = await readFile(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const sql = /-c "(SELECT json_build_object\('schema','preview-practice-register-export-v1'[^"]+)"/u.exec(readme)![1]!.split("${V}").join("5");
    const row = (await scratch.pool.query<{ document: unknown }>(`${sql} AS document`)).rows[0]!;
    return JSON.stringify(row.document);
  } finally {
    await scratch.stop();
  }
}

/** The live settings file's shape (README step S-2), with the preview's own values. */
function settingsText(): string {
  const config = { deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2), premium_model_ids: FIVE, requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    scope_id: "preview-practice-test" };
  const claimMs = 2 * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + PREVIEW_GLM_DEADLINE_MS) + PREVIEW_GLM_DEADLINE_MS + 60_000;
  return [
    `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(config)}`,
    `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))}`,
    "REGISTER_VERSION=5", "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production",
    `CLAIM_MS=${String(claimMs)}`, "CLAIM_MARGIN_MS=60000", "MAX_RECOMPOSE=1",
    "JUDGEMENT_NUMBER_KIND=base-probability", "JUDGEMENT_PRODUCER=judgement:preview-practice-test",
    "PROPAGATION_NUMBER_KIND=propagated-probability", "PROPAGATION_PRODUCER=propagation:preview-practice-test",
    "PROVIDER_PROBE_TIMEOUT_MS=5000", "PROVIDER_REF=preview:fixture-a",
    "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00", "SETTLEMENT_WATCH_HANDLE=settlement-watch:preview-practice-test", ""
  ].join("\n");
}

async function scenario(override?: (request: GateRequest) => GateOverride | null) {
  const stubs = await startPreviewGateStubs({ storyDefaultShape: PACK.defaultShape, ...(override === undefined ? {} : { override }) });
  closers.push(stubs.close);
  const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: stubs.sockets.deepinfra,
    PRACTICE_ANTHROPIC_SOCKET: stubs.sockets.anthropic };
  const out = join(folder, `out-${randomUUID()}`);
  const common = ["--settings", join(folder, "settings.env"), "--gate-status-deepinfra", join(folder, "status.json"),
    "--gate-status-anthropic", join(folder, "status.json"), "--out", out];
  const quiet = { sleep: async () => undefined, wait: async () => undefined, log: () => undefined };
  return { stubs, env, common, quiet };
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "practice-it-"));
  await writeFile(join(folder, "settings.env"), settingsText());
  await writeFile(join(folder, "status.json"), JSON.stringify({ state: "active", today_unbilled_releases: 2, halts: 0 }));
  registerExportPath = join(folder, "register-export.json");
  await writeFile(registerExportPath, await exportedRegister());
}, 600_000);
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });
afterAll(async () => { if (folder !== undefined) await rm(folder, { recursive: true, force: true }); });

describe("preview practice: formats mode", () => {
  it("sends every job to every model once and records MiMo's schema-breaking panel reply with its text and code@path", async () => {
    const { stubs, env, common, quiet } = await scenario(mimoPanelBad);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[];
      failures: { model: string; lane: string; status: string; issues: string[]; recheckIssues: string[]; replyText: string }[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
    };
    expect(outcome.exitCode).toBe(20);
    expect(report.verdict).toBe("FAIL");
    expect(report.reasons.some((reason) => reason.startsWith("FORMAT_FAILED"))).toBe(true);
    // Every model did every job (5 x 9), all PARSED except MiMo's panel job.
    expect(report.byModelAndLane).toHaveLength(45);
    expect(Object.fromEntries(report.byModelAndLane.map((row) => [`${row.model}|${row.lane}`, row.statuses])))
      .toEqual(Object.fromEntries(report.byModelAndLane.map((row) => [`${row.model}|${row.lane}`,
        row.model === MIMO && row.lane === "PANEL" ? { SCHEMA_FAILED: 1 } : { PARSED: 1 }])));
    expect(report.failures).toEqual([expect.objectContaining({ model: MIMO, lane: "PANEL", status: "SCHEMA_FAILED",
      issues: ["invalid_type@steelman.fidelity"], recheckIssues: ["invalid_type@steelman.fidelity"] })]);
    expect(report.failures[0]!.replyText).toContain("\"fidelity\":\"high\"");
    // Nothing unknown reached a gate, and the story jobs each cost exactly one call (the other story job is local).
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(stubs.requests.filter((request) => request.kind === "STORYTELLER")).toHaveLength(5);
    expect(stubs.requests.filter((request) => request.kind === "STORY_CHECKER")).toHaveLength(5);
  }, 300_000);

  it("GLM refused as busy every time: GLM SKIPPED_MODEL_BUSY after its first job, the other four all exercised: NOT_PROVEN (exit 30)", async () => {
    const { stubs, env, common, quiet } = await scenario((request) => request.model === GLM ? { unbilled: true } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[]; busyModels: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
      gates: Record<string, { observed: { stop: unknown; unbilled: number } }>;
    };
    expect(report.verdict).toBe("NOT_PROVEN");
    expect(outcome.exitCode).toBe(30);
    expect(report.reasons).toContain(`MODEL_BUSY:${GLM}`);
    expect(report.reasons.some((reason) => reason.startsWith("FORMAT_FAILED") || reason.startsWith("CALL_FAILED")
      || reason.startsWith("GATE_"))).toBe(false);
    expect(report.busyModels).toEqual([GLM]);
    const glm = report.byModelAndLane.filter((row) => row.model === GLM);
    expect(glm[0]!.statuses).toEqual({ UNBILLED_REFUSED: 1 });
    for (const row of glm.slice(1)) expect(row.statuses).toEqual({ SKIPPED_MODEL_BUSY: 1 });
    // The other three DeepInfra models and Haiku did every job.
    for (const row of report.byModelAndLane.filter((entry) => entry.model !== GLM)) expect(row.statuses).toEqual({ PARSED: 1 });
    for (const model of FIVE.filter((entry) => entry !== GLM)) {
      expect(stubs.requests.filter((request) => request.model === model && request.answer === "OK").length).toBeGreaterThanOrEqual(9);
    }
    // GLM was asked once and resent once, never again; the DeepInfra gate was never stopped.
    expect(stubs.requests.filter((request) => request.model === GLM).map((request) => request.answer)).toEqual(["UNBILLED", "UNBILLED"]);
    expect(report.gates.deepinfra!.observed.stop).toBeNull();
  }, 300_000);

  it("the answer-writer's draft citing the surviving objection is accepted (the old root-only citable set refused it): PASS", async () => {
    const graph = practiceDebateGraph(PRACTICE_QUESTIONS[0]!);
    const objection = graph.authored.find((node) => !graph.positionNodeIds.has(node.nodeId))!.nodeId;
    const citesObjection = JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "Free central buses are worth trying.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:objection", text: "The cost objection stays open.", node_refs: [objection], served_number_refs: [] }
    ] });
    const { stubs, env, common, quiet } = await scenario((request) => request.kind === "COMPOSE" ? { content: citesObjection } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--lanes", "SYNTHESIZER"], env, quiet);
    const report = outcome.report as unknown as { verdict: string; reasons: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[] };
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(report.byModelAndLane.map((row) => row.statuses)).toEqual(FIVE.map(() => ({ PARSED: 1 })));
    expect(stubs.requests.filter((request) => request.kind === "COMPOSE")).toHaveLength(5);
  }, 300_000);
});

describe("preview practice: debate mode", () => {
  it("a clean script: all five admitted, a served answer, a READY story, no format failure: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[]; admission: { admitted: boolean; panel: { modelId: string }[]; satOut: unknown[]; rotation: unknown };
      run: { workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
      byModelAndSite: { model: string; site: string }[]; register: { steps: { path: string }[] };
    };
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION"]);
    expect(report.admission).toMatchObject({ admitted: true, satOut: [] });
    expect(report.admission.panel.map((member) => member.modelId).sort()).toEqual([...FIVE].sort());
    expect(report.admission.rotation).not.toBeNull();
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // Every one of the five argued (a JUDGE call each) and sat on panels.
    for (const model of FIVE) {
      expect(report.byModelAndSite.some((row) => row.model === model && row.site === "JUDGE")).toBe(true);
      expect(report.byModelAndSite.some((row) => row.model === model && row.site === "PANEL")).toBe(true);
    }
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
  }, 600_000);

  it("MiMo answers a panel seat with a schema-breaking reply: FAIL (exit 20), with MiMo's reply text and code@path", async () => {
    const { env, common, quiet } = await scenario(mimoPanelBad);
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[];
      failures: { model: string; callSiteKey: string; parseStatus: string; issues: string[]; recheckIssues: string[]; replyText: string }[];
    };
    expect(report.verdict).toBe("FAIL");
    expect(outcome.exitCode).toBe(20);
    expect(report.reasons.some((reason) => reason.startsWith("FORMAT_FAILED"))).toBe(true);
    expect(report.failures.length).toBeGreaterThan(0);
    for (const failure of report.failures) {
      expect(failure).toMatchObject({ model: MIMO, parseStatus: "SCHEMA_FAILED", recheckIssues: ["invalid_type@steelman.fidelity"] });
      expect(failure.callSiteKey.startsWith("PANEL:")).toBe(true);
      expect(failure.issues).toContain("invalid_type@steelman.fidelity");
      expect(failure.replyText).toContain("\"fidelity\":\"high\"");
    }
  }, 600_000);

  it("refuses to start (HARNESS_ERROR, exit 40) without the acknowledgement, and sends nothing", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath], { ...env, PRACTICE_ACK: "yes" }, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"]);
    expect(stubs.requests).toEqual([]);
  }, 60_000);
});
