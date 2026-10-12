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
import { runPractice, type PracticeControl } from "../../tools/preview-practice/practice.js";
import { practiceDebateGraph } from "../../tools/preview-practice/practice-lanes.js";
import { PRACTICE_QUESTIONS } from "../../tools/preview-practice/practice-questions.js";
import { startPreviewGateStubs, stubChatBody, type GateOverride, type GateRequest } from "../support/preview-gate-stubs.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startTestDatabase } from "../support/testDatabase.js";

const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";
/** A formats progress line for one finished job: `<model> <lane> #<n>: <status> <ms>ms`. */
const FINISHED_JOB = /^\S+ [A-Z_]+ #\d+: [A-Z_]+ \d+ms$/u;
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
/**
 * Patch follow-up (owner design, 2026-10-12): a request that is the short follow-up, read through the frame (the one
 * reader): its last block's `machine_reply_form` is PATCH.
 */
const isPatchRequest = (request: GateRequest): boolean => {
  // A claim probe is not framed (and an unknown request is no step's): neither is a follow-up.
  if (request.kind === "PROBE" || request.kind === "UNKNOWN") return false;
  const last = readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields.at(-1);
  return last?.name === "machine_reply_form" && last.content === "PATCH";
};
/** The patch that fixes BAD_PANEL: only the member it was asked for, at the stand-in panel's own value. */
const PANEL_PATCH = JSON.stringify({ "steelman.fidelity": 0 });
/**
 * MiMo's first panel reply breaks the schema; MiMo answers the patch follow-up with the patch (`patch: true`) or, as a
 * model that ignores the requested form, with its whole answer again (the stand-in's own valid panel reply), which is
 * refused as a patch so the call goes on to the full re-ask.
 */
function mimoFirstPanelSlips(options: Readonly<{ patch: boolean }>): (request: GateRequest) => GateOverride | null {
  let mimoPanels = 0;
  return (request) => {
    if (request.model === MIMO && isPatchRequest(request)) return options.patch ? { content: PANEL_PATCH } : null;
    return request.model === MIMO && request.kind === "PANEL" && ++mimoPanels === 1 ? { content: BAD_PANEL } : null;
  };
}

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

async function scenario(override?: (request: GateRequest) => GateOverride | null, delayMs?: (request: GateRequest) => number) {
  const stubs = await startPreviewGateStubs({ storyDefaultShape: PACK.defaultShape, ...(override === undefined ? {} : { override }),
    ...(delayMs === undefined ? {} : { delayMs }) });
  closers.push(stubs.close);
  const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: stubs.sockets.deepinfra,
    PRACTICE_ANTHROPIC_SOCKET: stubs.sockets.anthropic };
  const out = join(folder, `out-${randomUUID()}`);
  const common = ["--settings", join(folder, "settings.env"), "--gate-status-deepinfra", join(folder, "status.json"),
    "--gate-status-anthropic", join(folder, "status.json"), "--out", out];
  const quiet = { sleep: async () => undefined, wait: async () => undefined, log: () => undefined };
  return { stubs, env, common, quiet, out };
}

type SamplesReport = { verdict: string; exitCode: number; reasons: string[]; totals: { samples: number };
  byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[] };
const readReport = (out: string) => JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as SamplesReport;
const sampleLines = (out: string) => readFileSync(join(out, "samples.jsonl"), "utf8").trim().split("\n")
  .map((line) => JSON.parse(line) as { kind: string; sample?: { status: string } }).filter((line) => line.kind === "sample");

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "practice-it-"));
  await writeFile(join(folder, "settings.env"), settingsText());
  await writeFile(join(folder, "status.json"), JSON.stringify({ state: "active", unsent_streak: 0, today_unbilled_releases: 2, halts: 0 }));
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

  type RepairReport = {
    verdict: string; reasons: string[];
    totals: { formatFailures: number; formatRepaired: number; formatRepairedByPatch: number; formatRepairedByFullAsk: number };
    slipsByModel: Record<string, { answered: number; slips: number; repaired: number; unrecovered: number; slipRateExceeded: boolean;
      repairedByPatch: number; repairedByFullAsk: number }>;
    failures: { model: string; lane: string; status: string; issues: string[]; repairKind: string | null;
      attempts: { outcome: string; parseStatus: string | null; replyForm: string | null }[] }[];
    byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
  };

  it("owner ruling 2026-10-12 (\"Fixed slips = warning\") and the patch follow-up: MiMo's first panel reply breaks the schema, the short patch follow-up fixes it: REPAIRED by PATCH, PASS_WITH_WARNINGS (exit 10)", async () => {
    const { stubs, env, common, quiet, out } = await scenario(mimoFirstPanelSlips({ patch: true }));
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as RepairReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS_WITH_WARNINGS", reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect(outcome.exitCode).toBe(10);
    // The second try is the app's own: the short follow-up went to the gate as MiMo's second PANEL request of the job.
    const mimoPanel = stubs.requests.filter((request) => request.model === MIMO && request.kind === "PANEL");
    expect(mimoPanel.map((request) => isPatchRequest(request))).toEqual([false, true]);
    expect(report.byModelAndLane.find((row) => row.model === MIMO && row.lane === "PANEL")?.statuses).toEqual({ REPAIRED: 1 });
    expect(report.slipsByModel[MIMO]).toMatchObject({ slips: 1, repaired: 1, unrecovered: 0, slipRateExceeded: false,
      repairedByPatch: 1, repairedByFullAsk: 0 });
    expect(report.totals).toMatchObject({ formatFailures: 0, formatRepaired: 1, formatRepairedByPatch: 1, formatRepairedByFullAsk: 0 });
    // The slip's text and its code@path stay in the report for diagnosis, with how it was fixed.
    expect(report.failures).toEqual([expect.objectContaining({ model: MIMO, lane: "PANEL", status: "REPAIRED", repairKind: "PATCH",
      issues: ["invalid_type@steelman.fidelity"] })]);
    expect(report.failures[0]!.attempts.map((attempt) => [attempt.outcome, attempt.parseStatus, attempt.replyForm]))
      .toEqual([["FAILED", "SCHEMA_FAILED", "ORIGINAL"], ["OK", "PARSED", "PATCH"]]);
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain("1 fixed by the same call (by patch 1, by full re-ask 0, otherwise 0)");
  }, 300_000);

  it("the patch follow-up answered with the whole answer again is refused as a patch; the full re-ask fixes it: REPAIRED by FULL (three tries), PASS_WITH_WARNINGS (exit 10)", async () => {
    const { stubs, env, common, quiet } = await scenario(mimoFirstPanelSlips({ patch: false }));
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as RepairReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS_WITH_WARNINGS", reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect(outcome.exitCode).toBe(10);
    expect(stubs.requests.filter((request) => request.model === MIMO && request.kind === "PANEL").map((request) => isPatchRequest(request)))
      .toEqual([false, true, false]);
    expect(report.slipsByModel[MIMO]).toMatchObject({ slips: 1, repaired: 1, repairedByPatch: 0, repairedByFullAsk: 1 });
    expect(report.totals).toMatchObject({ formatFailures: 0, formatRepaired: 1, formatRepairedByPatch: 0, formatRepairedByFullAsk: 1 });
    // The diagnosis is the slip itself (the first reply), not the refused patch.
    expect(report.failures).toEqual([expect.objectContaining({ model: MIMO, lane: "PANEL", status: "REPAIRED", repairKind: "FULL",
      issues: ["invalid_type@steelman.fidelity"] })]);
    expect(report.failures[0]!.attempts.map((attempt) => attempt.replyForm)).toEqual(["ORIGINAL", "PATCH", "FULL"]);
  }, 300_000);

  it("--busy-wait-minutes 0 (the old rule): GLM refused as busy every time: GLM SKIPPED_MODEL_BUSY after its first job, the other four all exercised: NOT_PROVEN (exit 30)", async () => {
    const { stubs, env, common, quiet } = await scenario((request) => request.model === GLM ? { unbilled: true } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--busy-wait-minutes", "0"], env, quiet);
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

  it("--busy-wait-minutes 0: GLM cools off at the gate (MODEL_COOLING): GLM SKIPPED_MODEL_BUSY after its first job, the other four all exercised, the gate never stopped: NOT_PROVEN (exit 30)", async () => {
    const { stubs, env, common, quiet } = await scenario((request) => request.model === GLM ? { gateRefuses: "MODEL_COOLING" } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--busy-wait-minutes", "0"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[]; busyModels: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
      gates: Record<string, { observed: { stop: unknown; modelCooling: number; gateRefused: number } }>;
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
    for (const row of report.byModelAndLane.filter((entry) => entry.model !== GLM)) expect(row.statuses).toEqual({ PARSED: 1 });
    // GLM was asked once and resent once, both refused by the gate's cool-off; the vendor was never asked for GLM.
    expect(stubs.requests.filter((request) => request.model === GLM).map((request) => request.answer)).toEqual(["COOLING", "COOLING"]);
    expect(report.gates.deepinfra!.observed).toMatchObject({ stop: null, modelCooling: 2, gateRefused: 0 });
  }, 300_000);

  it("slow answer (owner ruling 2026-10-12): MiMo's story call is booked at its maximum by the gate (PROVIDER_CHARGE_BOOKED_MAX): that job fails as a billed call, the gate is never stopped, every other job runs, and the report says so", async () => {
    const { stubs, env, common, quiet, out } = await scenario((request) => request.model === MIMO && request.kind === "STORYTELLER"
      ? { gateRefuses: "PROVIDER_CHARGE_BOOKED_MAX" } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
      gates: Record<string, { observed: { stop: unknown; bookedMax: number; unbilled: number; transportFailed: number; gateRefused: number } }>;
    };
    // Each of MiMo's story POSTs reached the vendor and was booked; nothing else was refused.
    const booked = stubs.requests.filter((request) => request.answer === "BOOKED_MAX");
    expect(booked.length).toBeGreaterThanOrEqual(1);
    expect(booked.every((request) => request.model === MIMO && request.kind === "STORYTELLER")).toBe(true);
    expect(report.gates.deepinfra!.observed).toMatchObject({ stop: null, bookedMax: booked.length, unbilled: 0, transportFailed: 0, gateRefused: 0 });
    // A billed failed call: never read as money, a halted gate, or a busy model.
    expect(report.reasons.some((reason) => reason.startsWith("GATE_") || reason.startsWith("MODEL_BUSY"))).toBe(false);
    const story = report.byModelAndLane.find((row) => row.model === MIMO && row.lane === "STORYTELLER")!;
    expect(Object.keys(story.statuses)).not.toContain("PARSED");
    for (const row of report.byModelAndLane.filter((entry) => !(entry.model === MIMO && entry.lane === "STORYTELLER"))) {
      expect(row.statuses).toEqual({ PARSED: 1 });
    }
    expect(report.verdict).toBe("FAIL");
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain(`${String(booked.length)} booked at their maximum (sent, then timed out or cut off`);
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

  it("--levels (spec 2026-10-12 §4.8): each job once per run, each body carrying its run's effort; the log names the runs, the report a levels table", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const logged: string[] = [];
    const outcome = await runPractice(["formats", ...common, "--samples", "2", "--gap-ms", "0", "--models", `${GLM},${DEEPSEEK}`,
      "--lanes", "PANEL", "--levels", `${GLM}=high,low`], env, { ...quiet, log: (line: string) => logged.push(line) });
    expect({ exitCode: outcome.exitCode, verdict: outcome.report.verdict }).toEqual({ exitCode: 0, verdict: "PASS" });
    // GLM: the runs take turns per job (high, low, then low, high); DeepSeek, not in the plan, runs once at the server's level.
    expect(stubs.requests.filter((request) => request.model === GLM).map((request) => request.body.reasoning_effort)).toEqual(["high", "low", "low", "high"]);
    expect(stubs.requests.filter((request) => request.model === DEEPSEEK).map((request) => request.body.reasoning_effort)).toEqual(["high", "high"]);
    expect(logged).toContain(`levels: ${GLM}: high#1, low#1 (each job once per run, the runs taking turns)`);
    const lines = readFileSync(join(out, "samples.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({ kind: "start", levels: { [GLM]: ["high#1", "low#1"] } });
    const samples = lines.filter((line) => line.kind === "sample").map((line) => line.sample as Record<string, unknown>);
    expect(samples.filter((sample) => sample.model === GLM).map((sample) => sample.levelRun)).toEqual(["high#1", "low#1", "low#1", "high#1"]);
    expect(samples.filter((sample) => sample.model === DEEPSEEK).every((sample) => !("levelRun" in sample) && !("answerText" in sample))).toBe(true);
    const report = outcome.report as unknown as { plannedSamples: number; levels: Record<string, Record<string, { jobs: number; firstTry: number }>> };
    expect(report.plannedSamples).toBe(6);
    expect(report.levels).toEqual({ [GLM]: { "high#1": expect.objectContaining({ jobs: 2, firstTry: 2 }), "low#1": expect.objectContaining({ jobs: 2, firstTry: 2 }) } });
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain(`| ${GLM} | high#1 | 2/2 | 2 | 0 | 0 | 0 |`);
  }, 300_000);

  it("--levels off a model's menu refuses before any gate is asked (HARNESS_ERROR, PRACTICE_LEVELS_INVALID)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["formats", ...common, "--levels", `${GLM}=medium`], env, quiet);
    expect(outcome.report).toMatchObject({ verdict: "HARNESS_ERROR", reasons: ["HARNESS_ERROR:PRACTICE_LEVELS_INVALID"] });
    expect(stubs.requests).toEqual([]);
    expect(stubs.remainingReads).toEqual([]);
  }, 300_000);
});

/**
 * The command as the operator starts it, a real process tree, against the stub gates answering slowly: through pnpm
 * (`pnpm exec tsx tools/preview-practice/practice.ts`: pnpm, the tsx launcher, node) and as README S-6 now starts it
 * (`node_modules/.bin/tsx tools/preview-practice/practice.ts`: the tsx launcher, node). The in-process tests above never
 * see a signal; on 2026-10-12 a single Ctrl-C ended a live run with exit 130 and no report: embedded-postgres (imported
 * when the command loads) registers async-exit-hook, whose SIGINT listener calls process.exit(130) on the next tick.
 */
describe("preview practice: Ctrl-C through the real launch path (pnpm, tsx)", () => {
  const ENGINE = fileURLToPath(new URL("../..", import.meta.url));
  type Launched = { exit: Promise<number | null>; lines: string[]; pid: number; out: string;
    stubs: Awaited<ReturnType<typeof startPreviewGateStubs>> };
  async function launch(via: "pnpm" | "tsx", delay: number): Promise<Launched> {
    const stubs = await startPreviewGateStubs({ storyDefaultShape: PACK.defaultShape, delayMs: () => delay });
    closers.push(stubs.close);
    const out = join(folder, `out-${randomUUID()}`);
    const command = ["tools/preview-practice/practice.ts", "formats", "--settings", join(folder, "settings.env"),
      "--gate-status-deepinfra", join(folder, "status.json"), "--gate-status-anthropic", join(folder, "status.json"), "--out", out,
      "--samples", "1", "--lanes", "JUDGE_POSITION,PANEL", "--gap-ms", "0"];
    const [program, args] = via === "pnpm" ? ["pnpm", ["exec", "tsx", ...command]] as const
      : [join(ENGINE, "node_modules", ".bin", "tsx"), command] as const;
    const child = spawn(program, [...args], { cwd: ENGINE, detached: true, stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: stubs.sockets.deepinfra,
        PRACTICE_ANTHROPIC_SOCKET: stubs.sockets.anthropic } });
    const lines: string[] = [];
    let rest = "";
    child.stderr!.on("data", (chunk: Buffer) => {
      const parts = (rest + chunk.toString("utf8")).split("\n");
      rest = parts.pop()!;
      lines.push(...parts);
    });
    const exit = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
    // Never leave a practice behind (the group is the launcher's own, made by `detached`).
    closers.push(async () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ } });
    return { exit, lines, pid: child.pid!, out, stubs };
  }
  const until = async (check: () => boolean, what: string) => {
    for (let waited = 0; !check(); waited += 50) {
      if (waited > 120_000) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  /** The node process that runs practice.ts itself: the descendant started with tsx's preflight. */
  const innermost = (root: number): number => {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,command="], { encoding: "utf8" }).split("\n").map((line) => line.trim())
      .filter((line) => line !== "").map((line) => { const [pid, ppid, ...command] = line.split(/\s+/u); return { pid: Number(pid), ppid: Number(ppid), command: command.join(" ") }; });
    const tree = new Set([root]);
    for (let grew = true; grew;) { grew = false; for (const row of rows) if (tree.has(row.ppid) && !tree.has(row.pid)) { tree.add(row.pid); grew = true; } }
    const found = rows.find((row) => tree.has(row.pid) && row.command.includes("preflight") && row.command.includes("practice.ts"));
    if (found === undefined) throw new Error("the practice's own node process was not found");
    return found.pid;
  };
  const finishedJobs = (lines: readonly string[]) => lines.filter((line) => FINISHED_JOB.test(line)).length;
  /** report.json NOT_PROVEN for the interrupt, the log ended, and every call a gate answered reached the tool. */
  const expectInterruptedReport = (run: Launched) => {
    const report = readReport(run.out);
    expect(report.verdict).toBe("NOT_PROVEN");
    expect(report.reasons).toContain("RUN_INTERRUPTED");
    const kinds = readFileSync(join(run.out, "samples.jsonl"), "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { kind: string; event?: { outcome: string } });
    expect(kinds.some((line) => line.kind === "end")).toBe(true);
    expect(kinds.filter((line) => line.kind === "wire" && line.event!.outcome === "VENDOR_OK").length)
      .toBe(run.stubs.requests.filter((request) => request.answer === "OK").length);
    expect(run.stubs.concurrency.now).toBe(0);
  };

  it("pnpm exec tsx, one SIGINT to the practice's own node process (the live 2026-10-12 case): calls in flight finish, report.json, exit 30", async () => {
    const run = await launch("pnpm", 1_500);
    await until(() => finishedJobs(run.lines) >= 1, "a finished job");
    process.kill(innermost(run.pid), "SIGINT");
    expect({ code: await run.exit, report: existsSync(join(run.out, "report.json")) }).toEqual({ code: 30, report: true });
    expectInterruptedReport(run);
  }, 180_000);

  it("tsx (README S-6), one SIGINT to the whole process group as a terminal Ctrl-C sends it: calls in flight finish, report.json, exit 30", async () => {
    const run = await launch("tsx", 1_500);
    await until(() => finishedJobs(run.lines) >= 1, "a finished job");
    process.kill(-run.pid, "SIGINT");
    expect({ code: await run.exit, report: existsSync(join(run.out, "report.json")) }).toEqual({ code: 30, report: true });
    expectInterruptedReport(run);
  }, 180_000);

  it("pnpm exec tsx, a terminal Ctrl-C (the whole group): pnpm itself quits at once (and sends SIGTERM on), but the practice still finishes its calls in flight and writes NOT_PROVEN", async () => {
    const run = await launch("pnpm", 1_500);
    await until(() => finishedJobs(run.lines) >= 1, "a finished job");
    const practice = innermost(run.pid);
    process.kill(-run.pid, "SIGINT");
    await run.exit;
    await until(() => !alive(practice), "the practice's own exit");
    expect(run.lines).toContain("PRACTICE_VERDICT NOT_PROVEN exit 30");
    expectInterruptedReport(run);
  }, 180_000);

  it("tsx (README S-6), a second SIGINT more than 2 s after the first quits at once: report.json from the finished samples, exit 50", async () => {
    const run = await launch("tsx", 6_000);
    await until(() => finishedJobs(run.lines) >= 1, "a finished job");
    process.kill(-run.pid, "SIGINT");
    await until(() => run.lines.some((line) => line.startsWith("interrupt:")), "the first interrupt's line");
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    process.kill(-run.pid, "SIGINT");
    expect({ code: await run.exit, report: existsSync(join(run.out, "report.json")) }).toEqual({ code: 50, report: true });
    const report = readReport(run.out);
    expect(report.verdict).toBe("ABORTED");
    expect(report.reasons[0]).toBe("ABORTED:OPERATOR_SECOND_INTERRUPT");
    expect(report.totals.samples).toBeGreaterThanOrEqual(1);
  }, 180_000);
});

describe("preview practice: formats mode, a busy model waits and retries", () => {
  type BusyReport = SamplesReport & { busyModels: string[];
    busyByModel: Record<string, { waits: number; totalWaitMs: number; recovered: boolean; gaveUp: boolean }> };
  const logLines = (out: string) => readFileSync(join(out, "samples.jsonl"), "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as { kind: string; model?: string; waitMs?: number; reason?: string });

  it("GLM busy twice (each after its resend), then answering: GLM waits, retries the same job, does every job: PASS_WITH_WARNINGS (exit 10)", async () => {
    let glmAsked = 0;
    const { stubs, env, common, quiet, out } = await scenario((request) => request.model === GLM && glmAsked++ < 4 ? { unbilled: true } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as BusyReport;
    expect({ verdict: report.verdict, exit: outcome.exitCode, reasons: report.reasons })
      .toEqual({ verdict: "PASS_WITH_WARNINGS", exit: 10, reasons: ["UNBILLED_REFUSALS:4"] });
    expect(report.busyModels).toEqual([]);
    for (const row of report.byModelAndLane) expect(row.statuses).toEqual({ PARSED: 1 });
    expect(report.busyByModel[GLM]).toMatchObject({ waits: 2, recovered: true, gaveUp: false });
    const lines = logLines(out);
    expect(lines.filter((line) => line.kind === "busy-wait").map((line) => line.model)).toEqual([GLM, GLM]);
    expect(lines.filter((line) => line.kind === "resume").map((line) => line.model)).toEqual([GLM, GLM]);
    expect(lines.some((line) => line.kind === "busy")).toBe(false);
    expect(stubs.requests.filter((request) => request.model === GLM).map((request) => request.answer).slice(0, 5))
      .toEqual(["UNBILLED", "UNBILLED", "UNBILLED", "UNBILLED", "OK"]);
  }, 300_000);

  it("GLM busy past the budget: its waits add up to the budget, then its remaining jobs are skipped: NOT_PROVEN (exit 30)", async () => {
    const { env, common, quiet, out } = await scenario((request) => request.model === GLM ? { unbilled: true } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--busy-wait-minutes", "10"], env, quiet);
    const report = outcome.report as unknown as BusyReport;
    expect(outcome.exitCode).toBe(30);
    expect(report.reasons).toContain(`MODEL_BUSY:${GLM}`);
    expect(report.busyModels).toEqual([GLM]);
    expect(report.busyByModel[GLM]).toMatchObject({ totalWaitMs: 600_000, recovered: false, gaveUp: true });
    const glm = report.byModelAndLane.filter((row) => row.model === GLM);
    expect(glm[0]!.statuses).toEqual({ UNBILLED_REFUSED: 1 });
    for (const row of glm.slice(1)) expect(row.statuses).toEqual({ SKIPPED_MODEL_BUSY: 1 });
    for (const row of report.byModelAndLane.filter((entry) => entry.model !== GLM)) expect(row.statuses).toEqual({ PARSED: 1 });
    expect(logLines(out).filter((line) => line.kind === "busy-wait").reduce((sum, line) => sum + line.waitMs!, 0)).toBe(600_000);
  }, 300_000);

  it("GLM cooling off at the gate: each wait is the gate's retry_after (60 s, at most a quarter more)", async () => {
    const { env, common, quiet, out } = await scenario((request) => request.model === GLM ? { gateRefuses: "MODEL_COOLING" } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--busy-wait-minutes", "3",
      "--lanes", "JUDGE_POSITION,PANEL"], env, quiet);
    expect(outcome.exitCode).toBe(30);
    const waits = logLines(out).filter((line) => line.kind === "busy-wait");
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(waits.every((line) => line.reason === "MODEL_COOLING")).toBe(true);
    for (const line of waits.slice(0, -1)) {
      expect(line.waitMs).toBeGreaterThanOrEqual(60_000);
      expect(line.waitMs).toBeLessThanOrEqual(75_000);
    }
    expect(waits.reduce((sum, line) => sum + line.waitMs!, 0)).toBe(180_000);
  }, 300_000);
});

describe("preview practice: formats mode, never losing a finished sample", () => {
  it("one interrupt after three finished jobs: the calls in flight finish, the rest are skipped, report.json is written from samples.jsonl: NOT_PROVEN (exit 30)", async () => {
    const { env, common, quiet, out } = await scenario();
    const at: { control: PracticeControl | null } = { control: null };
    let finished = 0;
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, { ...quiet,
      onControl: (given) => { at.control = given; },
      log: (line) => { if (FINISHED_JOB.test(line) && ++finished === 3) at.control!.stop(); } });
    const report = readReport(out);
    expect(outcome.exitCode).toBe(30);
    expect(report).toMatchObject({ verdict: "NOT_PROVEN", exitCode: 30 });
    expect(report.reasons).toContain("RUN_INTERRUPTED");
    expect(report.reasons.some((reason) => reason.startsWith("FORMAT_FAILED") || reason.startsWith("CALL_FAILED"))).toBe(false);
    // Every planned job is in the log and the report: the finished ones, then the skipped rest.
    const lines = sampleLines(out);
    expect(lines).toHaveLength(45);
    expect(report.totals.samples).toBe(45);
    const sent = lines.filter((line) => line.sample!.status !== "SKIPPED_GATE_STOPPED");
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent.length).toBeLessThan(45);
    expect(sent.every((line) => line.sample!.status === "PARSED")).toBe(true);
  }, 300_000);

  it("a second interrupt quits at once: report.json is ABORTED (exit 50) with the samples finished so far, and `report --out` builds the same again", async () => {
    const { env, common, quiet, out } = await scenario();
    const at: { control: PracticeControl | null; exit: number | null; report: SamplesReport | null } = { control: null, exit: null, report: null };
    let finished = 0;
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, { ...quiet,
      onControl: (given) => { at.control = given; },
      log: (line) => {
        if (FINISHED_JOB.test(line) && ++finished === 3) {
          at.exit = at.control!.abort("OPERATOR_SECOND_INTERRUPT");
          // On the disk before the quit.
          at.report = readReport(out);
        }
      } });
    const aborted = at.report!;
    expect(at.exit).toBe(50);
    expect(aborted).toMatchObject({ verdict: "ABORTED", exitCode: 50 });
    expect(aborted.reasons[0]).toBe("ABORTED:OPERATOR_SECOND_INTERRUPT");
    expect(aborted.totals.samples).toBeGreaterThanOrEqual(3);
    expect(aborted.totals.samples).toBe(sampleLines(out).length);
    // The run, carried on in-process here (the command quits), never writes over the aborted report.
    expect(outcome.exitCode).toBe(50);
    expect(readReport(out)).toEqual(aborted);
    const rebuilt = await runPractice(["report", "--out", out], {}, quiet);
    expect(rebuilt.exitCode).toBe(50);
    expect(readReport(out)).toMatchObject({ verdict: "ABORTED", reasons: aborted.reasons, totals: aborted.totals });
  }, 300_000);

  it("refuses an --out folder that already holds a samples log, sending nothing and leaving its report alone", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--models", DEEPSEEK, "--lanes", "PANEL"], env, quiet);
    const before = readFileSync(join(out, "report.json"), "utf8");
    const sentBefore = stubs.requests.length;
    const again = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--models", DEEPSEEK, "--lanes", "PANEL"], env, quiet);
    expect(again.exitCode).toBe(40);
    expect(again.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_OUT_ALREADY_HOLDS_SAMPLES"]);
    expect(stubs.requests.length).toBe(sentBefore);
    expect(readFileSync(join(out, "report.json"), "utf8")).toBe(before);
  }, 300_000);
});

describe("preview practice: formats mode, models at once", () => {
  // A slow vendor: long enough that calls sent together are held together (the counters prove the overlap, not a clock).
  const slow = () => 150;
  it("two slow models overlap (one call each at a time), where --sequential never has two calls at once", async () => {
    const parallel = await scenario(undefined, slow);
    const args = ["--samples", "2", "--gap-ms", "0", "--models", `${GLM},${DEEPSEEK}`, "--lanes", "JUDGE_POSITION,PANEL"];
    const first = await runPractice(["formats", ...parallel.common, ...args], parallel.env, parallel.quiet);
    expect(first.report.verdict).toBe("PASS");
    expect(parallel.stubs.concurrency.mostByProvider.deepinfra).toBe(2);
    expect(parallel.stubs.concurrency.mostByModel).toEqual({ [GLM]: 1, [DEEPSEEK]: 1 });
    expect(parallel.stubs.requests.filter((request) => request.answer === "OK")).toHaveLength(8);

    const sequential = await scenario(undefined, slow);
    const second = await runPractice(["formats", ...sequential.common, ...args, "--sequential"], sequential.env, sequential.quiet);
    expect(second.report.verdict).toBe("PASS");
    expect(sequential.stubs.concurrency.most).toBe(1);
    expect(sequential.stubs.requests.filter((request) => request.answer === "OK")).toHaveLength(8);
  }, 300_000);

  it("keeps to the gate's own limit from root's status (max_concurrent_calls 1): the DeepInfra models take turns at the gate", async () => {
    const { stubs, env, quiet, out } = await scenario(undefined, slow);
    const limited = join(folder, `status-limited-${randomUUID()}.json`);
    await writeFile(limited, JSON.stringify({ state: "active", unsent_streak: 0, halts: 0, max_concurrent_calls: 1 }));
    const outcome = await runPractice(["formats", "--settings", join(folder, "settings.env"), "--gate-status-deepinfra", limited,
      "--gate-status-anthropic", join(folder, "status.json"), "--out", out, "--samples", "2", "--gap-ms", "0",
      "--models", `${GLM},${DEEPSEEK},${HAIKU}`, "--lanes", "JUDGE_POSITION"], env, quiet);
    expect(outcome.report.verdict).toBe("PASS");
    expect(stubs.concurrency.mostByProvider.deepinfra).toBe(1);
    // Haiku, on the other gate, still went beside them.
    expect(stubs.concurrency.most).toBe(2);
  }, 300_000);

  it("Haiku's vendor error that was not billed (PROVIDER_ERROR_UNBILLED): never busy, counted in the Anthropic gate's run until the brake stops it at four; a failed call: FAIL (exit 20)", async () => {
    const { stubs, env, common, quiet } = await scenario((request) => request.model === HAIKU ? { gateRefuses: "PROVIDER_ERROR_UNBILLED" } : null);
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0", "--lanes", "JUDGE_POSITION,PANEL,REVIEW"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[]; busyModels: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
      gates: Record<string, { observed: { stop: { reason: string } | null; vendorErrorUnbilled: number; vendorRefused: number } }>;
    };
    expect(outcome.exitCode).toBe(20);
    expect(report.reasons).toContain("CALL_FAILED:2");
    expect(report.busyModels).toEqual([]);
    expect(report.byModelAndLane.filter((row) => row.model === HAIKU).map((row) => row.statuses))
      .toEqual([{ VENDOR_ERROR_UNBILLED: 1 }, { VENDOR_ERROR_UNBILLED: 1 }, { SKIPPED_GATE_STOPPED: 1 }]);
    expect(report.gates.anthropic!.observed).toMatchObject({ vendorErrorUnbilled: 4, vendorRefused: 0, stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
    expect(report.gates.deepinfra!.observed.stop).toBeNull();
    expect(stubs.requests.filter((request) => request.model === HAIKU).map((request) => request.answer)).toEqual(Array(4).fill("ERROR_UNBILLED"));
    for (const row of report.byModelAndLane.filter((entry) => entry.model !== HAIKU)) expect(row.statuses).toEqual({ PARSED: 1 });
  }, 300_000);
});

describe("preview practice: debate mode", () => {
  it("a clean script: all five admitted, a served answer, a READY story, no format failure: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
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
    // Without --transcript nothing but the two report files.
    expect(existsSync(join(out, "transcript.json"))).toBe(false);
  }, 600_000);

  it("--transcript: transcript.json holds every model call of the ledger in order, with the prompts the gates received and the replies they gave, decrypted", async () => {
    const { stubs, env, common, quiet, out } = await scenario(mimoFirstPanelSlips({ patch: true }));
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1", "--transcript"], env, quiet);
    const report = outcome.report as unknown as { verdict: string; totals: { calls: number }; run: { runId: string } };
    // The report is the same as without the flag (owner ruling: fixed slip, a warning).
    expect(report.verdict).toBe("PASS_WITH_WARNINGS");
    const text = readFileSync(join(out, "transcript.json"), "utf8");
    const transcript = JSON.parse(text) as {
      schema: string; run: { runId: string; question: { id: string; text: string }; registerVersion: string; panel: unknown[];
        workItemOutcome: string; story: { outcome: string } };
      totals: { attempts: number; withPrompt: number; withReply: number };
      attempts: { sequence: number; providerRef: string; model: string; maker: string | null; family: string; outcome: string;
        replyForm: string | null; prompt: { messages: unknown[] } | null; reply: { content: string } | null;
        parse: { status: string | null } }[];
      structure: { answer: { nodes?: unknown[] } | null; story: { outcome: string } | null };
      unavailable: string[];
    };
    expect(transcript.schema).toBe("preview-practice-transcript-v1");
    expect(transcript.run).toMatchObject({ runId: report.run.runId, question: { id: "ro", text: PRACTICE_QUESTIONS.find((question) => question.id === "ro")!.questionLine },
      registerVersion: "5", workItemOutcome: "COMPLETED", story: { outcome: "READY" } });
    expect(transcript.run.panel).toHaveLength(5);
    // As many calls as the ledger (the report counts the same rows), in ledger order, each with its maker.
    expect(transcript.attempts).toHaveLength(report.totals.calls);
    expect(transcript.totals.attempts).toBe(report.totals.calls);
    const sequences = transcript.attempts.map((attempt) => attempt.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    for (const attempt of transcript.attempts) expect(attempt.maker).not.toBeNull();
    // Every prompt a DeepInfra gate answered is in the transcript exactly as the gate received it.
    const prompts = new Set(transcript.attempts.flatMap((attempt) => attempt.prompt === null ? [] : [JSON.stringify(attempt.prompt.messages)]));
    const answered = stubs.requests.filter((request) => request.provider === "deepinfra" && request.answer === "OK" && request.kind !== "PROBE");
    expect(answered.length).toBeGreaterThan(0);
    for (const request of answered) expect(prompts.has(JSON.stringify(request.body.messages))).toBe(true);
    // MiMo's schema-breaking panel reply and its patch, word for word, with the forms the runner sent.
    const mimoPanel = transcript.attempts.filter((attempt) => attempt.model === MIMO && attempt.family === "PANEL");
    expect(mimoPanel.find((attempt) => attempt.parse.status === "SCHEMA_FAILED")).toMatchObject({ replyForm: "ORIGINAL", reply: { content: BAD_PANEL } });
    expect(mimoPanel.find((attempt) => attempt.replyForm === "PATCH")).toMatchObject({ reply: { content: PANEL_PATCH } });
    expect(transcript.totals.withReply).toBeGreaterThan(0);
    // The debate as served and the story as stored.
    expect(transcript.structure.answer?.nodes?.length ?? 0).toBeGreaterThan(0);
    expect(transcript.structure.story).toMatchObject({ outcome: "READY" });
    // Nothing of the settings file or the sockets is written.
    expect(text).not.toContain(env.PRACTICE_DEEPINFRA_SOCKET);
    expect(text).not.toContain(env.PRACTICE_ANTHROPIC_SOCKET);
    expect(text).not.toContain("REDACTED");
  }, 600_000);

  it("owner ruling 2026-10-12 (\"Fixed slips = warning\") and the patch follow-up: MiMo's first panel reply breaks the schema and the short patch follow-up fixes it: PASS_WITH_WARNINGS (exit 10), repaired by PATCH", async () => {
    const { env, common, quiet } = await scenario(mimoFirstPanelSlips({ patch: true }));
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1"], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[];
      totals: { formatFailures: number; formatRepaired: number; formatRepairedByPatch: number; formatRepairedByFullAsk: number };
      slipsByModel: Record<string, { repaired: number; repairedByPatch: number; repairedByFullAsk: number; repairedOtherwise: number }>;
      run: { workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
      failures: { model: string; callSiteKey: string; parseStatus: string; fixedBySameCall: boolean; replyForm: string | null }[];
      cacheByModel: Record<string, { calls: number }>;
    };
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS_WITH_WARNINGS", reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect(outcome.exitCode).toBe(10);
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // The kind is read from the prompts the runner stored for each try (ledger.call_prompt in the practice database).
    expect(report.totals).toMatchObject({ formatFailures: 0, formatRepaired: 1, formatRepairedByPatch: 1, formatRepairedByFullAsk: 0 });
    expect(report.slipsByModel[MIMO]).toMatchObject({ repaired: 1, repairedByPatch: 1, repairedByFullAsk: 0, repairedOtherwise: 0 });
    expect(report.failures).toEqual([expect.objectContaining({ model: MIMO, parseStatus: "SCHEMA_FAILED", fixedBySameCall: true, replyForm: "ORIGINAL" })]);
    expect(report.failures[0]!.callSiteKey.startsWith("PANEL:")).toBe(true);
    // The prompt cache block is there for every AI that answered (the stand-in reports no cached count).
    expect(Object.keys(report.cacheByModel).sort()).toEqual([...FIVE].sort());
  }, 600_000);

  it("MiMo answers a panel seat with a schema-breaking reply: FAIL (exit 20), with MiMo's reply text and code@path", async () => {
    const { env, common, quiet } = await scenario(mimoPanelBad);
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath], env, quiet);
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[];
      failures: { model: string; callSiteKey: string; parseStatus: string; issues: string[]; recheckIssues: string[]; replyText: string;
        replyForm: string | null }[];
    };
    expect(report.verdict).toBe("FAIL");
    expect(outcome.exitCode).toBe(20);
    expect(report.reasons.some((reason) => reason.startsWith("FORMAT_FAILED"))).toBe(true);
    expect(report.failures.length).toBeGreaterThan(0);
    for (const failure of report.failures) {
      expect(failure.callSiteKey.startsWith("PANEL:")).toBe(true);
      expect(failure).toMatchObject({ model: MIMO, parseStatus: "SCHEMA_FAILED" });
      expect(failure.replyText).toContain("\"fidelity\":\"high\"");
      if (failure.replyForm === "PATCH") {
        // The patch follow-up answered with the whole wrong answer again: refused as a patch, not re-checked.
        expect(failure).toMatchObject({ issues: ["PATCH_KEY_NOT_REQUESTED@$"], recheckIssues: [] });
      } else {
        expect(failure).toMatchObject({ recheckIssues: ["invalid_type@steelman.fidelity"] });
        expect(failure.issues).toContain("invalid_type@steelman.fidelity");
      }
    }
    // Every refused call went first, then the patch follow-up, then the full re-ask.
    expect(new Set(report.failures.map((failure) => failure.replyForm))).toEqual(new Set(["ORIGINAL", "PATCH", "FULL"]));
  }, 600_000);

  it("refuses to start (HARNESS_ERROR, exit 40) without the acknowledgement, and sends nothing", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath], { ...env, PRACTICE_ACK: "yes" }, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"]);
    expect(stubs.requests).toEqual([]);
  }, 60_000);
});
