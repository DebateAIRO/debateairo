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
import { createHash, randomUUID } from "node:crypto";
import { migrate } from "@debateai/db";
import {
  DEBATE_SHAPE_POLICY_ROW_KEY,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText
} from "@debateai/register";
import { PREVIEW_REVIEWED_PROVIDER_REFS, PREVIEW_GLM_DEADLINE_MS, parsePreviewLineUp, previewTargetJsonRow, type PreviewLineUp } from "@debateai/providers";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { runPractice, type PracticeControl } from "../../tools/preview-practice/practice.js";
import { practiceDebateGraph } from "../../tools/preview-practice/practice-lanes.js";
import type { TranscriptEngineGraph } from "../../tools/preview-practice/practice-engine-graph.js";
import { reproduceServedPropagation } from "../../tools/preview-practice/practice-rescore.js";
import { PRACTICE_LANGUAGE_DRY_REWRITES, practiceLanguageDryReading } from "../../tools/preview-practice/practice-language.js";
import { PRACTICE_LANGUAGE_CASES, PRACTICE_QUESTIONS } from "../../tools/preview-practice/practice-questions.js";
import { startPreviewGateStubs, stubChatBody, stubMapContent, type GateOverride, type GateRecord, type GateRequest } from "../support/preview-gate-stubs.js";
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
 * MiMo's first panel reply breaks the schema; MiMo answers the patch follow-up with the patch (`patch: "PATCH"`) or, as
 * a model that ignores the requested form, with a whole answer: the stand-in's own valid panel reply (`"WHOLE"`, which
 * passes the step's check and is accepted, owner ruling 2026-10-12) or the same broken reply again (`"WHOLE_BROKEN"`,
 * refused as a patch, so the call goes on to the full re-ask).
 */
function mimoFirstPanelSlips(options: Readonly<{ patch: "PATCH" | "WHOLE" | "WHOLE_BROKEN" }>): (request: GateRequest) => GateOverride | null {
  let mimoPanels = 0;
  return (request) => {
    if (request.model === MIMO && isPatchRequest(request)) {
      return options.patch === "PATCH" ? { content: PANEL_PATCH } : options.patch === "WHOLE_BROKEN" ? { content: BAD_PANEL } : null;
    }
    return request.model === MIMO && request.kind === "PANEL" && ++mimoPanels === 1 ? { content: BAD_PANEL } : null;
  };
}

let folder: string;
let registerExportPath: string;
const closers: (() => Promise<void>)[] = [];

/**
 * A register built the way the live preview's was (history v4, then the publish kit v2 on top), exported by the README's
 * SQL. `lineUp` (addition D23): the kit's plan `lineUp`, so version 5 carries the previewLineUpPolicy row.
 */
async function exportedRegister(lineUp: PreviewLineUp | null = null): Promise<string> {
  const scratch = await startTestDatabase();
  try {
    await migrate(scratch.pool);
    const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), OBSERVATION, undefined, "on", null, null, null, null, null,
      lineUp)];
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

/**
 * The live settings file's shape (README step S-2), with the preview's own values. `socketsOnly` (addition D14, R25): the
 * server setting from T+1 on, the gate part alone (no lists of AIs, no table).
 */
function settingsText(options: Readonly<{ socketsOnly?: boolean }> = {}): string {
  const gate = { deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    scope_id: "preview-practice-test" };
  const config = options.socketsOnly === true ? gate : { ...gate, free_model_ids: FIVE.slice(0, 2), premium_model_ids: FIVE };
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
    const { stubs, env, common, quiet, out } = await scenario(mimoFirstPanelSlips({ patch: "PATCH" }));
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

  it("owner ruling 2026-10-12: the patch follow-up answered with a whole answer that passes the step's check is accepted: REPAIRED by PATCH (two tries), PASS_WITH_WARNINGS (exit 10)", async () => {
    const { stubs, env, common, quiet } = await scenario(mimoFirstPanelSlips({ patch: "WHOLE" }));
    const outcome = await runPractice(["formats", ...common, "--samples", "1", "--gap-ms", "0"], env, quiet);
    const report = outcome.report as unknown as RepairReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS_WITH_WARNINGS", reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect(outcome.exitCode).toBe(10);
    expect(stubs.requests.filter((request) => request.model === MIMO && request.kind === "PANEL").map((request) => isPatchRequest(request)))
      .toEqual([false, true]);
    expect(report.slipsByModel[MIMO]).toMatchObject({ slips: 1, repaired: 1, repairedByPatch: 1, repairedByFullAsk: 0 });
    expect(report.failures).toEqual([expect.objectContaining({ model: MIMO, lane: "PANEL", status: "REPAIRED", repairKind: "PATCH",
      issues: ["invalid_type@steelman.fidelity"] })]);
    expect(report.failures[0]!.attempts.map((attempt) => [attempt.outcome, attempt.parseStatus, attempt.replyForm]))
      .toEqual([["FAILED", "SCHEMA_FAILED", "ORIGINAL"], ["OK", "PARSED", "PATCH"]]);
  }, 300_000);

  it("the patch follow-up answered with the same broken whole answer again is refused as a patch; the full re-ask fixes it: REPAIRED by FULL (three tries), PASS_WITH_WARNINGS (exit 10)", async () => {
    const { stubs, env, common, quiet } = await scenario(mimoFirstPanelSlips({ patch: "WHOLE_BROKEN" }));
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

  it("hosted (2026-10-14): a hosted settings export with the server-only billing settings, --register-next --hosted-billing (billing on): kit v3's next version, the hosted runner and room, billing kept off: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    // The hosted preview's export: hosted mode, plus the api.env lines runbook H6/H7 adds (set aside unread).
    const hostedSettings = join(folder, `hosted-settings-${randomUUID()}.env`);
    await writeFile(hostedSettings, settingsText().replace("DEBATEAI_DEPLOYMENT_MODE=local", "DEBATEAI_DEPLOYMENT_MODE=hosted")
      + ["GEOIP_COUNTRY_DB_PATH=/var/lib/debateai-geoip/dbip-country-lite.mmdb", "TOR_EXIT_LIST_PATH=/var/lib/debateai-geoip/tor-exit-list.txt",
        "NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com", "NETOPIA_API_KEY_PATH=/etc/debateai-v3-preview/billing/netopia-api-key",
        "NETOPIA_IPN_KEYS_PATH=/etc/debateai-v3-preview/billing/netopia-ipn-keys.pem", ""].join("\n"));
    const logged: string[] = [];
    const hostedBilling = JSON.stringify({ billing: "on", perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000,
      askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } });
    const args = common.map((arg) => arg.endsWith("settings.env") ? hostedSettings : arg);
    const outcome = await runPractice(["debate", ...args, "--register-export", registerExportPath, "--depth", "1", "--register-next",
      "--hosted-billing", hostedBilling], env, { ...quiet, log: (line) => logged.push(line) });
    const report = outcome.report as unknown as {
      verdict: string; reasons: string[]; admission: { admitted: boolean; panel: { modelId: string }[] };
      run: { workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
      register: { registerVersion: string; steps: { path: string }[]; codeNext: { composer: string; addedKeys: string[]; changedKeys: string[] } };
      deployment: { mode: string; room: boolean; billingInRegister: string; billingInPractice: string; setAsideSettings: string[];
        ceilings: { perRunCeilingMicros: number; dailyCeilingMicros: number; perStoryCeilingMicros: number | null; band: boolean } };
    };
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.register.registerVersion).toBe("6");
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION", "CODE_NEXT_VERSION"]);
    expect(report.register.codeNext).toMatchObject({ composer: "preview-register-composer-v3", addedKeys: expect.arrayContaining(["storyCostEnvelopePolicy"]) });
    expect(report.register.codeNext.changedKeys).toEqual(expect.arrayContaining(["admissionPolicy", "billingPolicy", "costEnvelopePolicy"]));
    expect(report.deployment).toEqual({ mode: "hosted", room: true, billingInRegister: "on", billingInPractice: "off",
      setAsideSettings: ["GEOIP_COUNTRY_DB_PATH", "TOR_EXIT_LIST_PATH", "NETOPIA_API_BASE_URL", "NETOPIA_API_KEY_PATH", "NETOPIA_IPN_KEYS_PATH"],
      ceilings: { perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000, perStoryCeilingMicros: 50_000, band: true, billingPlansSealed: true } });
    expect(report.admission.admitted).toBe(true);
    expect(report.admission.panel.map((member) => member.modelId).sort()).toEqual([...FIVE].sort());
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    // The log names what was set aside (names only) and how billing ran; no set-aside value is printed or written.
    expect(logged).toContain("settings: server-only settings set aside unread (never opened, never sent): GEOIP_COUNTRY_DB_PATH, TOR_EXIT_LIST_PATH, NETOPIA_API_BASE_URL, NETOPIA_API_KEY_PATH, NETOPIA_IPN_KEYS_PATH");
    expect(logged.some((line) => line.startsWith("hosted mode: the ask went through the room"))).toBe(true);
    const written = readFileSync(join(out, "report.json"), "utf8") + readFileSync(join(out, "report.md"), "utf8") + logged.join("\n");
    for (const secretPath of ["/etc/debateai-v3-preview/billing", "netopia-payments.com", "dbip-country-lite"]) expect(written).not.toContain(secretPath);
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain("- billing: on in the register, kept off in the practice");
  }, 600_000);

  // The hosted money rules are live in the practice, not decoration: a per-debate ceiling of one micro-dollar. The
  // boot's own RUN_CEILING_BELOW_ONE_CALL cannot fire on the preview (it prices the plan rosters' models, none of which
  // is a preview model, and no scorecard is in force there: firstCallPlanModels, assertRunCeilingCoversOneCall), so on
  // the server such a version would start and fail its first debate; the practice shows exactly that, before upload.
  it("hosted (2026-10-14), control: a per-debate ceiling below one call: the hosted runner's envelope refuses the first call (RUN_CEILING_BELOW_FIRST_CALL): FAIL (exit 20)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const hostedSettings = join(folder, `hosted-settings-${randomUUID()}.env`);
    await writeFile(hostedSettings, settingsText().replace("DEBATEAI_DEPLOYMENT_MODE=local", "DEBATEAI_DEPLOYMENT_MODE=hosted"));
    const args = common.map((arg) => arg.endsWith("settings.env") ? hostedSettings : arg);
    const outcome = await runPractice(["debate", ...args, "--register-export", registerExportPath, "--register-next", "--hosted-billing",
      JSON.stringify({ billing: "off", perRunCeilingMicros: 1, dailyCeilingMicros: 10_000_000, askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } })],
    env, quiet);
    expect(outcome.exitCode).toBe(20);
    expect(outcome.report).toMatchObject({ verdict: "FAIL", admission: { admitted: true },
      run: { workItemOutcome: "THREW", failureCode: "RUN_CEILING_BELOW_FIRST_CALL" } });
    // Only the health probes went out: the envelope refused the first debate call before it was sent.
    expect(stubs.requests.filter((request) => request.kind !== "PROBE")).toEqual([]);
  }, 600_000);

  it("--transcript: transcript.json holds every model call of the ledger in order, with the prompts the gates received and the replies they gave, decrypted", async () => {
    const { stubs, env, common, quiet, out } = await scenario(mimoFirstPanelSlips({ patch: "PATCH" }));
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
      structure: { answer: { nodes?: { node_id: string }[] } | null; story: { outcome: string } | null; engineGraph?: TranscriptEngineGraph };
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
    // R2 (E12): the whole graph, read from the throwaway database before it went.
    const graph = transcript.structure.engineGraph!;
    expect(graph.engine).toBe(1);
    const served = new Set(Object.keys(graph.served.finalStrength));
    for (const node of transcript.structure.answer!.nodes!) expect(served.has(node.node_id)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(served.size);
    const rootIndexes = graph.nodes.filter((node) => node.kind === "ROOT").map((node) => node.rootIndex).sort((a, b) => a - b);
    expect(rootIndexes).toEqual(rootIndexes.map((_, index) => index));
    expect(graph.served.servedRootNodeId).not.toBeNull();
    // Every judged node has its author's voice; every grader voice is another maker's.
    for (const node of graph.nodes.filter((entry) => graph.served.baseStrength[entry.nodeId] !== undefined)) {
      const voices = graph.voices.filter((voice) => voice.nodeId === node.nodeId);
      expect(voices.filter((voice) => voice.isAuthor)).toHaveLength(1);
      for (const voice of voices.filter((entry) => !entry.isAuthor)) expect(voice.maker).not.toBe(node.authorMaker);
    }
    expect(graph.unreadVoices).toEqual([]);
    expect(graph.reviews.length).toBeGreaterThan(0);
    // Pre-flight PF-R2a2.9: engine 1 never applies the dispute factor.
    expect(graph.nodes.some((node) => node.disputeFactorApplied)).toBe(false);
    // R2 (E12): the rescore gives back exactly what this run served (the engine's own arithmetic over its recorded inputs).
    expect(reproduceServedPropagation(graph)).toMatchObject({ ok: true });
  }, 600_000);

  it("owner ruling 2026-10-12 (\"Fixed slips = warning\") and the patch follow-up: MiMo's first panel reply breaks the schema and the short patch follow-up fixes it: PASS_WITH_WARNINGS (exit 10), repaired by PATCH", async () => {
    const { env, common, quiet } = await scenario(mimoFirstPanelSlips({ patch: "PATCH" }));
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
    // Every refused call went first, then the patch follow-up. LG-A (L33, controller ruling 8; Tasks 11 and 13): the practice
    // wires the structure-repair route (Haiku is a target), so each MiMo call is routed and sent at most 2 POSTs. R22 (owner
    // ruling 2026-10-29, "Allow 3 sends"): a panel seat is a judge call, so after its refused patch it sends the one full
    // re-ask too, refused again here.
    expect(new Set(report.failures.map((failure) => failure.replyForm))).toEqual(new Set(["ORIGINAL", "PATCH", "FULL"]));
  }, 600_000);

  it("refuses to start (HARNESS_ERROR, exit 40) without the acknowledgement, and sends nothing", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath], { ...env, PRACTICE_ACK: "yes" }, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"]);
    expect(stubs.requests).toEqual([]);
  }, 60_000);

  it("debate shape (P2d Task 2): the command hands the ask settings to the debate, which refuses them on a register without a debate-shape row before any AI is asked (HARNESS_ERROR, exit 40)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--answer-length", "short"], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW"]);
    expect(stubs.requests).toEqual([]);
  }, 300_000);
});

// Side-by-side spec §13, ADDITION D14-D16, D23 (Task SA8): the practice debates the line-up of the version it runs on, and
// can try a new one with `--line-up <file>` in its own throwaway version; a sockets-only settings file (R25) works.
describe("preview practice: debate mode, the line-up (addition D14-D16, D23)", () => {
  type LineUpReport = { verdict: string; reasons: string[]; register: { registerVersion: string; importedRegisterVersion?: string };
    admission: { admitted: boolean; panel: { modelId: string }[]; satOut: unknown[] }; run: { workItemOutcome: string };
    byModelAndSite: { model: string; site: string }[] };
  /** Qwen off both plans, Haiku on Free: a line-up today's server setting does not hold. */
  const FOUR = FIVE.filter((model) => model !== "Qwen/Qwen3.8-Flash");
  const TRIED = { free_model_ids: [GLM, HAIKU], premium_model_ids: FOUR, thinking_levels: null };
  const exportDigest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

  it("a sockets-only settings file and a live version carrying the row: the debate runs the row's line-up, on the live version: PASS (exit 0)", async () => {
    const socketsOnly = join(folder, `settings-sockets-only-${randomUUID()}.env`);
    await writeFile(socketsOnly, settingsText({ socketsOnly: true }));
    const withRow = join(folder, `register-export-line-up-${randomUUID()}.json`);
    await writeFile(withRow, await exportedRegister(parsePreviewLineUp(TRIED)));
    const before = exportDigest(withRow);
    const { env, common, quiet } = await scenario();
    const args = common.map((value) => value === join(folder, "settings.env") ? socketsOnly : value);
    const logged: string[] = [];
    const outcome = await runPractice(["debate", ...args, "--register-export", withRow, "--depth", "1"], env,
      { ...quiet, log: (line) => logged.push(line) });
    const report = outcome.report as unknown as LineUpReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(report.register.registerVersion).toBe("5");
    expect(report.admission).toMatchObject({ admitted: true, satOut: [] });
    expect(report.admission.panel.map((member) => member.modelId).sort()).toEqual([...FOUR].sort());
    expect(report.byModelAndSite.some((row) => row.model === "Qwen/Qwen3.8-Flash" && row.site === "JUDGE")).toBe(false);
    expect(logged.some((line) => line.startsWith("line-up of version 5: the version's own row;"))).toBe(true);
    expect(exportDigest(withRow)).toBe(before);
  }, 900_000);

  it("--line-up on today's settings file: the row goes into the practice's own version (6), the settings' lists set aside, the export untouched: PASS (exit 0)", async () => {
    const tried = join(folder, `line-up-${randomUUID()}.json`);
    // The --print-line-up member form, as the release tool's --line-up takes it.
    await writeFile(tried, JSON.stringify({ lineUp: TRIED }));
    const before = exportDigest(registerExportPath);
    const { env, common, quiet } = await scenario();
    const logged: string[] = [];
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1", "--line-up", tried], env,
      { ...quiet, log: (line) => logged.push(line) });
    const report = outcome.report as unknown as LineUpReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(report.register).toMatchObject({ registerVersion: "6", importedRegisterVersion: "5" });
    expect(report.admission.panel.map((member) => member.modelId).sort()).toEqual([...FOUR].sort());
    expect(logged).toContain("the line-up row added in this throwaway copy as version 6, with this code's contract hashes");
    expect(logged.some((line) => line.startsWith("line-up of version 6: the --line-up file's;"))).toBe(true);
    expect(exportDigest(registerExportPath)).toBe(before);
  }, 900_000);

  it("a sockets-only settings file and a row-less version: PREVIEW_LINE_UP_REQUIRED before the database starts (HARNESS_ERROR, exit 40)", async () => {
    const socketsOnly = join(folder, `settings-sockets-only-${randomUUID()}.env`);
    await writeFile(socketsOnly, settingsText({ socketsOnly: true }));
    const { stubs, env, common, quiet } = await scenario();
    const args = common.map((value) => value === join(folder, "settings.env") ? socketsOnly : value);
    const outcome = await runPractice(["debate", ...args, "--register-export", registerExportPath, "--depth", "1"], env, quiet);
    expect([outcome.report.verdict, outcome.exitCode, outcome.report.reasons]).toEqual(["HARNESS_ERROR", 40, ["HARNESS_ERROR:PREVIEW_LINE_UP_REQUIRED"]]);
    expect(stubs.requests).toEqual([]);
  }, 120_000);
});

describe("preview practice: debate mode, the new debate shape (spec 2026-10-12 §5)", () => {
  const SHAPE_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url));
  type ShapeReport = {
    verdict: string; reasons: string[]; ask: unknown;
    register: { registerVersion: string; importedRegisterVersion?: string; steps: { path: string }[];
      codeNext?: { baseRegisterVersion: string; addedKeys: string[]; changedKeys: string[] } };
    run: { runId: string; workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
    byModelAndSite: { model: string; site: string }[];
    shape?: { source: string; registerVersion: string; row: string | null; storedDepthParams: unknown; sizes: Record<string, unknown> | null;
      opening: string | null; mapMarks: Record<string, number>; chosenAnswers: number | null; alsoRaised: number | null;
      panelCloseCallExtensions: number; scrutinyExtensions: number; mapCallsByStep: Record<string, number>; notExercised: string | null };
    language?: { siteLanguage: string; offered: boolean; choice: string | null;
      lock: { code: string; source: string; recordCode: string; localReason: string | null;
        fast: { outcome: string; reason: string | null; main: string | null } | null } | null;
      rewriteUsed: boolean; storedLanguage: string | null; plannerLanguage: string | null; plannerDisagrees: boolean | null };
  };
  const exportDigest = () => createHash("sha256").update(readFileSync(registerExportPath)).digest("hex");
  /** How many also-raised points the storyteller was handed (its `also_raised` field, P2c), over all its answered calls. */
  const storytellerAlsoRaised = (requests: readonly GateRecord[]): number => requests
    .filter((request) => request.kind === "STORYTELLER" && request.answer === "OK")
    .map((request) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields
      .find((field) => field.name === "also_raised")?.content)
    .reduce((sum, content) => sum + (content === undefined ? 0 : (JSON.parse(content) as unknown[]).length), 0);

  it("--shape-policy (the owners' start values): the map, the chosen answers argued, a served answer and a READY story handed what was also raised: PASS (exit 0)", async () => {
    const before = exportDigest();
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--shape-policy", SHAPE_POLICY_START, "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    // The export is only read; the import itself is today's; the practice's own version is one above it.
    expect(exportDigest()).toBe(before);
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION"]);
    // Final review M-2: the register block names the version the debate ran on, the imported newest under its own name.
    expect(report.register).toMatchObject({ registerVersion: "6", importedRegisterVersion: "5" });
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // Both compositions read the row: the ask path stored the four settings, admission froze the sizes, the runner ran the map.
    expect(report.shape).toMatchObject({
      source: "FLAG", registerVersion: "6", row: "ADDED", opening: "ANGLE_MAP", chosenAnswers: 2, notExercised: null,
      storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
      sizes: { plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", mapAIs: 5, graders: 3, opening: "ANGLE_MAP" }
    });
    expect(report.shape!.alsoRaised).toBeGreaterThan(0);
    expect(report.shape!.mapCallsByStep).toMatchObject({ angles: 1, merge: 1, choose: 1 });
    expect(report.shape!.mapCallsByStep.list).toBeGreaterThanOrEqual(2);
    expect(report.shape!.mapCallsByStep.gap).toBeGreaterThanOrEqual(1);
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(true);
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    // The ask's one fast language check ran (the row-absent case below sends none; pre-flight PF-D15).
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE").map((request) => request.answer)).toEqual(["OK"]);
    expect(stubs.requests.filter((request) => request.kind === "MAP" && request.answer === "OK").length).toBeGreaterThanOrEqual(5);
    expect(storytellerAlsoRaised(stubs.requests)).toBeGreaterThan(0);
    // The question language (Task 7b): the Romanian question on the Romanian site. Romanian is an always-ask site (ruling
    // L-KEEP), so the fast check read it (the stub's one language: FAST, never ELD_SITE), and the run stored that lock
    // (admission froze a shape: ruling L-SHAPED-ONLY; pre-flight PF-D27). The planner named the same language. Its
    // naming is recorded for the operator only (CR-3): no condition mark is expected for it.
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: false, choice: null,
      lock: { code: "ro", source: "FAST", recordCode: "FAST", localReason: null, fast: { outcome: "ONE", main: "ro" } },
      rewriteUsed: false, storedLanguage: "ro", plannerLanguage: "ro", plannerDisagrees: false });
    // The transcript holds the map and ran on the practice's version.
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as {
      run: { registerVersion: string }; attempts: { family: string }[];
      structure: { map?: { choice: { alsoRaised: unknown[] } | null; items: unknown[] } };
    };
    expect(transcript.run.registerVersion).toBe("6");
    expect(transcript.attempts.some((attempt) => attempt.family === "MAP")).toBe(true);
    expect(transcript.structure.map?.choice?.alsoRaised.length ?? 0).toBeGreaterThan(0);
    expect(transcript.structure.map?.items.length ?? 0).toBeGreaterThan(0);
  }, 900_000);

  it("--register-next --shape-policy (the path every branch debate takes, ruling D-BOTHNEXT): the code's next version carries the row, nothing more is published: PASS (exit 0)", async () => {
    // Final review M-1: the export is one the publish kit itself would publish from this code, so the code's next
    // version is the live one plus the debate-shape row the kit's own source build adds (controller ruling D-REGNEXT).
    const before = exportDigest();
    const logs: string[] = [];
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--register-next", "--depth", "1",
      "--shape-policy", SHAPE_POLICY_START, "--transcript"], env, { ...quiet, log: (line: string) => { logs.push(line); } });
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(exportDigest()).toBe(before);
    // The import brought in 4 and 5, then the code's next version (6) with the row ADDED; nothing was published on top.
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION", "CODE_NEXT_VERSION"]);
    expect(report.register).toMatchObject({ registerVersion: "6", codeNext: { baseRegisterVersion: "5", addedKeys: [DEBATE_SHAPE_POLICY_ROW_KEY] } });
    expect(report.register.codeNext!.changedKeys).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect("importedRegisterVersion" in report.register).toBe(false);
    expect(logs.some((line) => line.includes("practising on this code's next version 6"))).toBe(true);
    expect(logs.some((line) => line.includes("in this throwaway copy as version"))).toBe(false);
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // A real shape block, read from the database: both compositions read the row in the code's next version.
    expect(report.shape).toMatchObject({
      source: "FLAG", registerVersion: "6", row: "ADDED", opening: "ANGLE_MAP", chosenAnswers: 2, notExercised: null,
      storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
      sizes: { plan: "premium", mapAIs: 5, graders: 3, opening: "ANGLE_MAP" }
    });
    expect(report.shape!.mapCallsByStep).toMatchObject({ angles: 1, merge: 1, choose: 1 });
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE").map((request) => request.answer)).toEqual(["OK"]);
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: false, lock: { code: "ro", source: "FAST" }, storedLanguage: "ro" });
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as { run: { registerVersion: string } };
    expect(transcript.run.registerVersion).toBe("6");
  }, 900_000);

  it("hosted: --register-next --hosted-billing --shape-policy (the merge of #165): kit v3's next version carries the row, the hosted runner and ask run the new shape and lock the language: PASS (exit 0)", async () => {
    // Controller ruling D-REGNEXT in hosted mode: the policy reaches kit v3's own source build (as the plan's
    // --debate-shape), and both hosted compositions read the row, its map hash and the question-language decider as the
    // two main.ts files do.
    const before = exportDigest();
    const { stubs, env, common, quiet } = await scenario();
    const hostedSettings = join(folder, `hosted-settings-${randomUUID()}.env`);
    await writeFile(hostedSettings, settingsText().replace("DEBATEAI_DEPLOYMENT_MODE=local", "DEBATEAI_DEPLOYMENT_MODE=hosted"));
    const args = common.map((arg) => arg.endsWith("settings.env") ? hostedSettings : arg);
    const hostedBilling = JSON.stringify({ billing: "off", perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000,
      askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } });
    const outcome = await runPractice(["debate", ...args, "--register-export", registerExportPath, "--register-next", "--hosted-billing",
      hostedBilling, "--depth", "1", "--shape-policy", SHAPE_POLICY_START], env, quiet);
    const report = outcome.report as unknown as ShapeReport & {
      register: { codeNext: { composer?: string } }; deployment?: { mode: string; room: boolean; billingInPractice: string } };
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(exportDigest()).toBe(before);
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION", "CODE_NEXT_VERSION"]);
    expect(report.register).toMatchObject({ registerVersion: "6", codeNext: { composer: "preview-register-composer-v3" } });
    expect(report.register.codeNext!.addedKeys).toEqual(expect.arrayContaining([DEBATE_SHAPE_POLICY_ROW_KEY, "storyCostEnvelopePolicy"]));
    expect(report.deployment).toMatchObject({ mode: "hosted", room: true, billingInPractice: "off" });
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    expect(report.shape).toMatchObject({ source: "FLAG", registerVersion: "6", row: "ADDED", opening: "ANGLE_MAP", notExercised: null,
      sizes: { plan: "premium", mapAIs: 5, opening: "ANGLE_MAP" } });
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE").map((request) => request.answer)).toEqual(["OK"]);
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: false, lock: { code: "ro", source: "FAST" }, storedLanguage: "ro" });
  }, 900_000);

  // Final review M-5: the one-language offer and its answer, through the real decider and the ask's own resubmission
  // (the signed check reference, the owner's scope). The fast check reads lang-ro-en-mix as a real mix with a usable
  // rewrite (the dry script's reading); every other request is the doubles' own.
  const MIX_CASE = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-ro-en-mix")!;
  const MIX_REWRITE = PRACTICE_LANGUAGE_DRY_REWRITES["lang-ro-en-mix"]!;
  const questionLineOf = (request: GateRequest): string | undefined =>
    readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields.find((field) => field.name === "question_line")?.content;
  const mixScript = (request: GateRequest): GateOverride | null =>
    request.kind === "QUESTION_LANGUAGE" ? { content: practiceLanguageDryReading(questionLineOf(request) ?? "") } : null;
  const offerDebate = async (choice: readonly string[]) => {
    const { stubs, env, common, quiet, out } = await scenario(mixScript);
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--register-next", "--depth", "1",
      "--question", "lang-ro-en-mix", ...choice, "--shape-policy", SHAPE_POLICY_START, "--transcript"], env, quiet);
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as { run: { question: { id: string; text: string } } };
    const angles = stubs.requests.filter((request) => request.kind === "MAP" && questionLineOf(request) !== undefined);
    return { outcome, report: outcome.report as unknown as ShapeReport, stubs, transcript, mapQuestions: new Set(angles.map(questionLineOf)) };
  };

  it("lang-ro-en-mix with --language-choice use: the offer is made, the ask is sent again with the server's rewrite, and the debate argues it: PASS (exit 0)", async () => {
    const { outcome, report, stubs, transcript, mapQuestions } = await offerDebate(["--site-language", "ro", "--language-choice", "use"]);
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE").map((request) => request.answer)).toEqual(["OK"]);
    // The lock came from the person's choice on the server's signed offer; the rewrite was used and stored as Romanian.
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: true, choice: "USE_REWRITE", rewriteUsed: true,
      lock: { code: "ro", source: "CHOICE", recordCode: "CHOICE", fast: { outcome: "MIX", main: "ro" } }, storedLanguage: "ro" });
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true } });
    // The map planned the rewrite, never the mixed wording; the transcript still names the case's own question.
    expect([...mapQuestions]).toEqual([MIX_REWRITE]);
    expect(transcript.run.question).toEqual({ id: "lang-ro-en-mix", text: MIX_CASE.questionLine });
  }, 900_000);

  it("lang-ro-en-mix with the default answer (keep), asked on the case's own site: the offer is made and the person's wording is kept: PASS (exit 0)", async () => {
    const { outcome, report, mapQuestions } = await offerDebate([]);
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: true, choice: "KEEP_MINE", rewriteUsed: false,
      lock: { code: "ro", source: "CHOICE", recordCode: "CHOICE" }, storedLanguage: "ro" });
    expect([...mapQuestions]).toEqual([MIX_CASE.questionLine]);
  }, 900_000);

  it("no --shape-policy and a register without the row: today's shape, nothing new in the report, no map call", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1", "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect("shape" in report).toBe(false);
    expect("language" in report).toBe(false);
    // R1d (Task 22, PF-D8.11): every admitted debate's ask names the engine from its own receipt; no engine row: engine 1.
    expect(report.ask).toEqual({ questionId: "ro", depth: 1, planTier: "premium", engine: { engine: 1 } });
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(false);
    expect(stubs.requests.some((request) => request.kind === "MAP")).toBe(false);
    // Without the row the ask builds, calls and reads nothing new (P2L): no fast language check either.
    expect(stubs.requests.some((request) => request.kind === "QUESTION_LANGUAGE")).toBe(false);
    expect(storytellerAlsoRaised(stubs.requests)).toBe(0);
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as { run: { registerVersion: string }; structure: object };
    expect(transcript.run.registerVersion).toBe("5");
    // R2 (E12): a served run always carries the engine graph.
    expect(Object.keys(transcript.structure)).toEqual(["answer", "inspection", "story", "engineGraph"]);
  }, 600_000);

  it("refuses a malformed --shape-policy before anything starts: HARNESS_ERROR (exit 40), no gate touched", async () => {
    const bad = join(folder, `shape-bad-${randomUUID()}.json`);
    await writeFile(bad, JSON.stringify({ ...(JSON.parse(readFileSync(SHAPE_POLICY_START, "utf8")) as object), version: 2 }));
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--shape-policy", bad], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_POLICY_INVALID"]);
    expect(stubs.requests).toEqual([]);
    expect(stubs.remainingReads).toEqual([]);
  }, 60_000);

  it("--depth-mode without a debate-shape row: refused before any model call (HARNESS_ERROR, exit 40)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth-mode", "fixed"], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW"]);
    expect(stubs.requests).toEqual([]);
  }, 300_000);

  const LENGTH_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/length-policy-start.json", import.meta.url));
  type LengthReport = ShapeReport & {
    length?: { source: string; registerVersion: string; row: string | null;
      frozen: { plan: string; answerLength: string; steps: Record<string, number> } | null; unreadable: string | null };
    lengthByModelAndStep?: { model: string; step: string; guidedWords: number | null }[];
  };

  // (pre-flight PF-C4.4) OVERVIEW C-1 / engine INTERFACE §4.1: the writer's words are 200 / 350 / 1,000
  // (LENGTH_GUIDANCE_START.answerWriterWords, packages/kernel/src/length-guidance.ts:99 at 2d59b9000).
  it("--length-policy (the owners' start values) with today's shape: frozen on the receipt, the writer told 350 words, guided words in the table: PASS", async () => {
    const before = exportDigest();
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--length-policy", LENGTH_POLICY_START, "--transcript"], env, quiet);
    const report = outcome.report as unknown as LengthReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(exportDigest()).toBe(before);
    expect(report.register).toMatchObject({ registerVersion: "6", importedRegisterVersion: "5" });
    expect(report.shape).toBeUndefined();
    expect(report.length).toMatchObject({ source: "FLAG", registerVersion: "6", row: "ADDED",
      frozen: { plan: "premium", answerLength: "standard", steps: { answer_writer: 350, pros_cons: 250 } } });
    const writerRows = (report.lengthByModelAndStep ?? []).filter((row) => row.step === "answer_writer");
    expect(writerRows.length).toBeGreaterThan(0);
    for (const row of writerRows) expect(row.guidedWords).toBe(350);
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
  }, 900_000);

  it("refuses a malformed or non-JSON --length-policy before anything starts: HARNESS_ERROR (exit 40), no gate touched (Review Focus 5)", async () => {
    const malformed = join(folder, `length-bad-${randomUUID()}.json`);
    await writeFile(malformed, JSON.stringify({ ...(JSON.parse(readFileSync(LENGTH_POLICY_START, "utf8")) as object), runawayMultiplier: 99 }));
    const notJson = join(folder, `length-not-json-${randomUUID()}.json`);
    await writeFile(notJson, "{not json");
    for (const bad of [malformed, notJson]) {
      const { stubs, env, common, quiet } = await scenario();
      const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--length-policy", bad], env, quiet);
      expect(outcome.exitCode).toBe(40);
      expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_LENGTH_POLICY_INVALID"]);
      expect(stubs.requests).toEqual([]);
      expect(stubs.remainingReads).toEqual([]);
    }
  }, 60_000);

  it("--answer-length detailed with --length-policy and no --shape-policy is accepted; without either row it is refused before any call", async () => {
    const { env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--length-policy", LENGTH_POLICY_START, "--answer-length", "detailed"], env, quiet);
    const report = outcome.report as unknown as LengthReport;
    expect(report.length?.frozen).toMatchObject({ answerLength: "detailed", steps: { answer_writer: 1000 } });
    const refused = await scenario();
    const without = await runPractice(["debate", ...refused.common, "--register-export", registerExportPath, "--depth", "1",
      "--answer-length", "detailed"], refused.env, refused.quiet);
    expect(without.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW"]);
    expect(refused.stubs.requests).toEqual([]);
  }, 900_000);
});

describe("preview practice: language mode, the question language (P2L)", () => {
  type LanguageReport = { verdict: string; exitCode: number; reasons: string[]; mode: string;
    cases: { id: string; lock: string; lockSource: string; offered: boolean; fastNeeded: boolean;
      fastCheck: { outcome: string; proposedQuestion: string | null };
      planner: { status: string; questionLanguage: string | null; disagrees: boolean | null } }[];
    notRun: unknown[] };
  const EN_ON_RO = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-en-on-ro")!;
  const MIX = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-ro-en-mix")!;
  /** The fast check answers each case as it expects (the dry script's reading); the planner of lang-en-on-ro names Romanian. */
  const languageScript = (request: GateRequest): GateOverride | null => {
    const chat = stubChatBody(request.provider, request.body);
    const question = readFramedMaterial(wirePacket(chat)).fields.find((field) => field.name === "question_line")?.content ?? "";
    if (request.kind === "QUESTION_LANGUAGE") return { content: practiceLanguageDryReading(question) };
    if (request.kind === "MAP" && question === EN_ON_RO.questionLine) {
      return { content: JSON.stringify({ ...(JSON.parse(stubMapContent(chat, 1)) as object), question_language: "ro" }) };
    }
    return null;
  };

  it("language mode: every case locked as expected, the mix offered, the fast check asked for every case, the planner recorded only: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario(languageScript);
    const outcome = await runPractice(["language", ...common], env, quiet);
    const report = outcome.report as unknown as LanguageReport;
    // No case is settled by eld alone (ro, en and id are always-ask, ruling L-KEEP; lang-ku-arab is under eld's floor),
    // so a LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:<record code> can only come from the fast check's side: the rewrite
    // refused (FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:…, ruling L-REWRITE) or an offer body the contract refuses
    // (FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED). STOP and report it; never weaken this (pre-flight PF-D20, PF-D22).
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.mode).toBe("language");
    expect(report.cases.map((entry) => [entry.id, entry.lock]))
      .toEqual(PRACTICE_LANGUAGE_CASES.map((entry) => [entry.id, entry.expectedLock]));
    // Every lock's source (controller ruling D-SETTLE): eld settles none of them (lang-ro-plain on ro is FAST, never
    // ELD_SITE); lang-zh-short is worked out with the fast check off, so its script decides (LOCAL_ELD).
    expect(report.cases.map((entry) => [entry.id, entry.lockSource])).toEqual([["lang-ro-plain", "FAST"], ["lang-ro-en-mix", "OFFER"],
      ["lang-en-on-ro", "FAST"], ["lang-short-code", "FAST"], ["lang-sr-latn", "FAST"], ["lang-id", "FAST"], ["lang-ro-borrowed", "FAST"],
      ["lang-zh-short", "LOCAL_ELD"], ["lang-ku-arab", "FAST"], ["lang-en-hukou", "FAST"]]);
    // The fast check is asked for EVERY case, whatever eld said; one planner call (with any repair) per case; nothing else.
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE" && request.answer === "OK")).toHaveLength(PRACTICE_LANGUAGE_CASES.length);
    expect(report.cases.every((entry) => entry.fastCheck.outcome !== "DOWN")).toBe(true);
    expect(stubs.requests.filter((request) => request.kind === "MAP").length).toBeGreaterThanOrEqual(PRACTICE_LANGUAGE_CASES.length);
    expect(stubs.requests.every((request) => request.kind === "QUESTION_LANGUAGE" || request.kind === "MAP")).toBe(true);
    expect(report.cases.find((entry) => entry.id === "lang-ro-en-mix")).toMatchObject({ offered: true, lockSource: "OFFER",
      fastCheck: { outcome: "MIX", proposedQuestion: PRACTICE_LANGUAGE_DRY_REWRITES["lang-ro-en-mix"] } });
    // CR-3: the planner of lang-en-on-ro named Romanian; it is recorded, and the verdict above is still PASS.
    expect(report.cases.find((entry) => entry.id === "lang-en-on-ro")!.planner).toMatchObject({ status: "ANSWERED", questionLanguage: "ro", disagrees: true });
    // language.jsonl: a start line, one line per case, an end line; never a case's question text.
    const log = readFileSync(join(out, "language.jsonl"), "utf8");
    expect(log.trim().split("\n").map((line) => (JSON.parse(line) as { kind: string }).kind))
      .toEqual(["start", ...PRACTICE_LANGUAGE_CASES.map(() => "case"), "end"]);
    for (const entry of PRACTICE_LANGUAGE_CASES) expect(log).not.toContain(entry.questionLine);
    // report.md: the mixed question beside its rewrite, for the owners' read.
    const markdown = readFileSync(join(out, "report.md"), "utf8");
    expect(markdown).toContain(`original «${MIX.questionLine}»; rewrite «${PRACTICE_LANGUAGE_DRY_REWRITES["lang-ro-en-mix"]!}»`);
  }, 300_000);
});

/**
 * Engine row + story v4 (spec 2026-10-15 engine redesign §7, §14; plan R1d Task 24): a whole practice debate against the
 * scripted gates. With the length row AND the engine row the story is engine 2's (storyteller v4 and checker v4, each
 * told its targets, no shape asked, the pack default stored); with the length row alone, or with neither, it is
 * today's v3. A checker that finds round 1 misleading starts round 2, which revises its own draft.
 */
describe("engine 2's story (R1d)", () => {
  const LENGTH_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/length-policy-start.json", import.meta.url));
  const ENGINE_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/engine-policy-start.json", import.meta.url));
  type PinOutcome = { pinnedModel: string; wroteModel: string | null; servedBy: string[]; held: boolean };
  type EngineReport = {
    verdict: string; reasons: string[]; ask: { engine?: { engine: number } };
    register: { registerVersion: string; codeNext?: { addedKeys: string[] } };
    run: { story: { outcome: string } };
    storyRounds?: { model: string; round: number; misleading: boolean | null; wordingNoteOnly: boolean; revisedOwnDraft: boolean; outcome: string }[];
    storyBackups?: unknown[];
    storyReadyRate?: { ready: number; readyWithReservation: number; failed: number };
    storyLengthByField?: { field: string; guidedWords: number | null }[];
    storyJsonBreaks?: { model: string; replies: number; parseFailed: number }[];
    writerPins?: { answerWriter: PinOutcome | null; storyteller: PinOutcome | null };
    investigations?: { cannotAssessReviews: number; run: number; capped: number; skipped: number; unavailable: number };
    /** W5-2: the web table (an engine-2 debate with a debate-shape map only); absent when the web step left no row. */
    web?: { search: string; paths: { plan: string | null; searches: number }[]; totals: { searches: number; searchFeeMicros: number } };
    /** R2 B11: the comparing judges' block (engine 2 only). */
    judgeVotes?: { model: string; maker: string; letter: string | null; counted: boolean | null }[];
    labels?: { label: string; trigger: string; engine1LadderLabel: string | null } | null;
    admission: { panel: { providerRef: string; modelId: string }[];
      rotation: { answerWriter: string; answerChecker: string; storyteller: string; storyChecker: string } | null };
  };
  /**
   * Carried from Task 22: the report's new blocks are PRESENT and in report.md. Their two database readers
   * (collectPracticeStoryLength, collectPracticeStoryEngine) swallow a failure into a progress line and leave the block
   * out, so a reader that broke on the real database would otherwise go unseen.
   */
  const expectStoryBlocks = (report: EngineReport, out: string, engine: 1 | 2, storytellers?: readonly string[]) => {
    expect(report.ask.engine).toEqual({ engine });
    expect(report.storyRounds?.length).toBeGreaterThan(0);
    expect(report.storyBackups).toBeDefined();
    expect(report.storyReadyRate).toBeDefined();
    expect(report.storyLengthByField?.length).toBeGreaterThan(0);
    // One row per storyteller AI; the stand-ins always answer readable JSON.
    expect(report.storyJsonBreaks?.length).toBeGreaterThan(0);
    expect(report.storyJsonBreaks!.every((row) => row.replies > 0 && row.parseFailed === 0)).toBe(true);
    if (storytellers !== undefined) expect(report.storyJsonBreaks!.map((row) => row.model).sort()).toEqual([...storytellers].sort());
    const markdown = readFileSync(join(out, "report.md"), "utf8");
    expect(markdown).toContain(engine === 2 ? "Engine: 2 (the engine row; the story is told with story v4)." : "Engine: 1 (today's engine; story v3).");
    expect(markdown).toContain("Story rounds (codes only;");
    expect(markdown).toContain(`Story outcomes: READY ${String(report.storyReadyRate!.ready)}, `);
    expect(markdown).toContain("Story length per AI and field");
    // R2 (A17): the investigations block's reader swallows a failure the same way, so it is checked present here too;
    // engine 1 runs no investigation.
    expect(report.investigations).toBeDefined();
    if (engine === 1) expect(report.investigations).toMatchObject({ run: 0, capped: 0, skipped: 0, unavailable: 0 });
    expect(markdown).toContain("| cannot-assess reviews | asked |");
    // W5-2: billing is kept off in the practice, so its run has no paid plan: a web step that ran planned no search for
    // any path, sent none and paid none, and its table says so.
    if (report.web !== undefined) {
      expect(report.web.search).toBe("PERPLEXITY");
      expect(report.web.paths.every((path) => path.plan === "NOT_ON_PLAN" && path.searches === 0)).toBe(true);
      expect(report.web.totals).toMatchObject({ searches: 0, searchFeeMicros: 0 });
      expect(markdown).toContain("Web search per path (W5-2;");
    }
  };
  const framedOf = (request: GateRecord) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body)));
  const answered = (requests: readonly GateRecord[], kind: "STORYTELLER" | "STORY_CHECKER") =>
    requests.filter((request) => request.kind === kind && request.answer === "OK");
  const ownTurnOf = (request: GateRecord) => wirePacket(stubChatBody(request.provider, request.body)).messages
    .find((message) => message.role === "assistant")?.content;
  /** The story's own calls carry no `length` field and keep today's v3 contracts. */
  const expectStoryV3 = (requests: readonly GateRecord[]) => {
    const calls = [...answered(requests, "STORYTELLER"), ...answered(requests, "STORY_CHECKER")];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const framed = framedOf(call);
      expect(["story.storyteller.v3", "story.checker.v3"]).toContain(framed.contractId);
      expect(framed.fields.map((field) => field.name)).not.toContain("length");
    }
  };
  /** A v4 checker reply that finds the story misleading (in the practice question's language, Romanian). */
  const OBJECTION = "Rezumatul spune că toate pozițiile au rezistat, dar materialul arată că a doua poziție a căzut în fața obiecției sale.";
  const MISLEADING_V4 = JSON.stringify({ satisfied: false, misleading: true, objection: OBJECTION, criteria: {
    faithful_to_material: false, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
    citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
  } });

  // Task 20 review 1 (final wave B14): engine 2 needs the length row; the export has none and no --length-policy is given,
  // so runPractice refuses at its argument checks, before the throwaway database starts and before any gate is asked.
  it("--engine-policy without any length row: PRACTICE_ENGINE_REQUIRES_LENGTH_POLICY before the database starts (HARNESS_ERROR, exit 40)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const lines: string[] = [];
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--engine-policy", ENGINE_POLICY_START], env, { ...quiet, log: (line: string) => { lines.push(line); } });
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ENGINE_REQUIRES_LENGTH_POLICY"]);
    expect(lines.some((line) => line.includes("practice database started"))).toBe(false);
    expect(stubs.requests).toEqual([]);
    expect(stubs.remainingReads).toEqual([]);
  }, 60_000);

  it("R1d-1 --register-next --length-policy --engine-policy: storyteller v4 and checker v4 with their targets, no shape asked, the pack default stored, ask.engine 2: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const lines: string[] = [];
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--register-next", "--depth", "1",
      "--length-policy", LENGTH_POLICY_START, "--engine-policy", ENGINE_POLICY_START, "--transcript"], env,
    { ...quiet, log: (line: string) => { lines.push(line); } });
    const report = outcome.report as unknown as EngineReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    // The kit's own source build carried both rows into the code's next version (Task 20's --register-next path).
    expect(report.register.codeNext?.addedKeys).toEqual(expect.arrayContaining(["engineVersionPolicy", "lengthGuidancePolicy"]));
    expect(report.ask.engine).toEqual({ engine: 2 });
    expect(report.run.story.outcome).toBe("READY");
    const tellers = answered(stubs.requests, "STORYTELLER");
    const checkers = answered(stubs.requests, "STORY_CHECKER");
    expect(tellers.length).toBeGreaterThan(0);
    expect(checkers.length).toBeGreaterThan(0);
    for (const teller of tellers) {
      const framed = framedOf(teller);
      expect(framed.contractId).toBe("story.storyteller.v4");
      expect(framed.fields.find((field) => field.name === "length")?.content).toMatch(/^short\.headline: about 15 words\n/u);
      // Decision 2: the AI is never asked for a shape id; code sets it.
      expect(stubChatBody(teller.provider, teller.body)).not.toContain("shape_id");
    }
    for (const checker of checkers) {
      const framed = framedOf(checker);
      expect(framed.contractId).toBe("story.checker.v4");
      expect(framed.fields.find((field) => field.name === "length")?.content).toMatch(/\nobjection: about 250 words$/u);
    }
    // The one shape (R1d: the pack default) is stored on the row and in the body.
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as {
      structure: { story: { shapeId: string | null; body: { shape_id: string } | null } | null } };
    expect(PACK.defaultShape).toBe("general");
    expect(transcript.structure.story?.shapeId).toBe("general");
    expect(transcript.structure.story?.body?.shape_id).toBe("general");
    expectStoryBlocks(report, out, 2);
    expect(report.storyRounds).toHaveLength(1);
    expect(report.storyRounds?.[0]).toMatchObject({ round: 1, outcome: "SATISFIED", misleading: false, revisedOwnDraft: false });
    expect(report.storyBackups).toEqual([]);
    expect(report.storyReadyRate).toEqual({ ready: 1, readyWithReservation: 0, failed: 0 });
    expect(report.storyLengthByField!.find((row) => row.field === "headline")?.guidedWords).toBe(15);
    expect(report.storyLengthByField!.find((row) => row.field === "long")?.guidedWords).toBeNull();
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    // R2 B11 carry (B12): a real engine-2 practice debate's report carries the comparing judges' block, read from the
    // throwaway database (its reader swallows a failure into a progress line and leaves the block out), with today's
    // ladder from the receipt's engine1Ladder record. The stand-in judges answered, in the question's language.
    expect(stubs.requests.filter((request) => request.kind === "VERDICT_JUDGE").length).toBeGreaterThan(0);
    expect(stubs.requests.filter((request) => request.kind === "VERDICT_JUDGE").every((request) => request.answer === "OK")).toBe(true);
    expect(lines.filter((line) => line.includes("could not be read"))).toEqual([]);
    expect(report.judgeVotes?.length).toBeGreaterThan(0);
    expect(report.judgeVotes!.every((vote) => vote.letter === "A")).toBe(true);
    expect(report.labels).toMatchObject({ trigger: expect.stringMatching(/^JUDGES_/u),
      engine1LadderLabel: expect.stringMatching(/^(SUPPORTED|CONTESTED|UNSUPPORTED)$/u) });
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain("Comparing judges (engine 2: the label comes from their votes;");
  }, 900_000);

  it("R1d-2 --length-policy alone: the story stays v3 with no length field, the other calls are told their lengths, ask.engine 1: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--length-policy", LENGTH_POLICY_START], env, quiet);
    const report = outcome.report as unknown as EngineReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.ask.engine).toEqual({ engine: 1 });
    expectStoryV3(stubs.requests);
    // LG-C's own calls are lengthed with the length row (decision 1 changes only the story).
    const others = stubs.requests.filter((request) => request.answer === "OK"
      && !["PROBE", "STORYTELLER", "STORY_CHECKER", "UNKNOWN"].includes(request.kind));
    expect(others.some((request) => framedOf(request).fields.some((field) => field.name === "length" || field.name === "answer_length"))).toBe(true);
    // The story was told without targets: the table shows its words with none.
    expect(report.storyLengthByField!.length).toBeGreaterThan(0);
    expect(report.storyLengthByField!.every((row) => row.guidedWords === null)).toBe(true);
    expect(report.storyRounds!.every((row) => row.misleading === null)).toBe(true);
    expectStoryBlocks(report, out, 1);
    expect(report.storyBackups).toEqual([]);
    expect(report.storyReadyRate).toEqual({ ready: 1, readyWithReservation: 0, failed: 0 });
  }, 900_000);

  it("R1d-3 neither row, the answer writer and the storyteller pinned: today's v3 story, ask.engine 1, both pins held: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--answer-writer-model", HAIKU, "--storyteller-model", MIMO], env, quiet);
    const report = outcome.report as unknown as EngineReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.ask.engine).toEqual({ engine: 1 });
    expectStoryV3(stubs.requests);
    expect(report.writerPins).toEqual({
      // Ruling A1 (Task 21 review): held = the pinned model SERVED the step (the answered final-writer calls; the stored story).
      answerWriter: { pinnedModel: HAIKU, wroteModel: HAIKU, servedBy: [HAIKU], held: true },
      storyteller: { pinnedModel: MIMO, wroteModel: MIMO, servedBy: [MIMO], held: true }
    });
    expect(new Set(answered(stubs.requests, "STORYTELLER").map((request) => request.model))).toEqual(new Set([MIMO]));
    expect(new Set(stubs.requests.filter((request) => request.kind === "COMPOSE" && request.answer === "OK").map((request) => request.model)))
      .toEqual(new Set([HAIKU]));
    expect(report.storyBackups).toEqual([]);
    expect(report.storyReadyRate).toEqual({ ready: 1, readyWithReservation: 0, failed: 0 });
    expectStoryBlocks(report, out, 1, [MIMO]);
    expect(report.storyRounds!.every((row) => row.model === MIMO && row.misleading === null)).toBe(true);
    expect(report.storyLengthByField!.every((row) => row.guidedWords === null)).toBe(true);
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain(`- storyteller: pinned ${MIMO}, wrote ${MIMO}, served by ${MIMO}, held: yes`);
  }, 900_000);

  it("R1d-4 --length-policy --engine-policy, round 1's checker finds the story misleading: round 2 sends the storyteller its own draft as its own turn and the problems, and the story is READY: PASS (exit 0)", async () => {
    let checkerCalls = 0;
    const misleadingFirst = (request: GateRequest): GateOverride | null =>
      request.kind === "STORY_CHECKER" && ++checkerCalls === 1 ? { content: MISLEADING_V4 } : null;
    const { stubs, env, common, quiet, out } = await scenario(misleadingFirst);
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--length-policy", LENGTH_POLICY_START, "--engine-policy", ENGINE_POLICY_START], env, quiet);
    const report = outcome.report as unknown as EngineReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    // The practice's own throwaway version (no --register-next) carried both rows (Task 20's override path).
    expect(report.register.registerVersion).toBe("6");
    expect(report.ask.engine).toEqual({ engine: 2 });
    const tellers = answered(stubs.requests, "STORYTELLER");
    expect(tellers).toHaveLength(2);
    expect(ownTurnOf(tellers[0]!)).toBeUndefined();
    // Round 2: a fresh call, the round-1 material unchanged, the accepted draft as the model's own turn, then the problems.
    const ownTurn = ownTurnOf(tellers[1]!);
    expect(ownTurn).toBeDefined();
    expect(ownTurn).not.toContain("shape_id");
    expect(JSON.parse(ownTurn!)).toHaveProperty("short");
    const revision = framedOf(tellers[1]!);
    expect(revision.contractId).toBe("story.storyteller.v4");
    expect(revision.fields.at(-1)).toMatchObject({ name: "machine_reply_form", content: "REVISION" });
    expect(revision.fields.find((field) => field.name === "revision_problems")?.content).toBe(OBJECTION);
    expect(revision.fields.map((field) => field.name)).not.toContain("prior_objection");
    expect(report.storyRounds).toEqual([
      expect.objectContaining({ round: 1, misleading: true, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "MISLEADING" }),
      expect.objectContaining({ round: 2, misleading: false, revisedOwnDraft: true, outcome: "SATISFIED" })
    ]);
    expect(report.run.story.outcome).toBe("READY");
    // Carried: the blocks are present; the draft's own maker revised it; the table shows engine 2's targets.
    expectStoryBlocks(report, out, 2, [tellers[0]!.model]);
    expect(tellers[1]!.model).toBe(tellers[0]!.model);
    expect(report.storyRounds![1]!.model).toBe(report.storyRounds![0]!.model);
    expect(report.storyBackups).toEqual([]);
    expect(report.storyReadyRate).toEqual({ ready: 1, readyWithReservation: 0, failed: 0 });
    expect(report.storyLengthByField!.find((row) => row.field === "headline")?.guidedWords).toBe(15);
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
  }, 900_000);

  it("R1d-5 formats --lanes STORYTELLER,STORY_CHECKER --story-length: every AI is asked engine 2's story (v4) and check with their targets; without the switch, today's v3 ids and no length field: PASS", async () => {
    type FormatsStoryReport = { verdict: string; reasons: string[];
      byModelAndLane: { model: string; lane: string; statuses: Record<string, number> }[];
      storyLengthByField?: { model: string; field: string; guidedWords: number | null }[] };
    const args = ["--samples", "1", "--gap-ms", "0", "--lanes", "STORYTELLER,STORY_CHECKER"];
    const v4 = await scenario();
    const told = await runPractice(["formats", ...v4.common, ...args, "--story-length"], v4.env, v4.quiet);
    const toldReport = told.report as unknown as FormatsStoryReport;
    expect({ verdict: toldReport.verdict, reasons: toldReport.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(toldReport.byModelAndLane).toHaveLength(10);
    expect(toldReport.byModelAndLane.every((row) => JSON.stringify(row.statuses) === JSON.stringify({ PARSED: 1 }))).toBe(true);
    const tellers = answered(v4.stubs.requests, "STORYTELLER");
    const checkers = answered(v4.stubs.requests, "STORY_CHECKER");
    // One story job and one check job per AI; the other half of each job is the practice's local stand-in.
    expect(new Set(tellers.map((request) => request.model))).toEqual(new Set(FIVE));
    expect(new Set(checkers.map((request) => request.model))).toEqual(new Set(FIVE));
    expect(tellers).toHaveLength(5);
    expect(checkers).toHaveLength(5);
    for (const teller of tellers) {
      const framed = framedOf(teller);
      expect(framed.contractId).toBe("story.storyteller.v4");
      expect(framed.fields.find((field) => field.name === "length")?.content).toMatch(/^short\.headline: about 15 words\n/u);
      expect(stubChatBody(teller.provider, teller.body)).not.toContain("shape_id");
    }
    for (const checker of checkers) {
      const framed = framedOf(checker);
      expect(framed.contractId).toBe("story.checker.v4");
      expect(framed.fields.find((field) => field.name === "length")?.content).toMatch(/\nobjection: about 250 words$/u);
    }
    const toldHeadlines = (toldReport.storyLengthByField ?? []).filter((row) => row.field === "headline");
    expect(new Set(toldHeadlines.map((row) => row.model))).toEqual(new Set(FIVE));
    expect(toldHeadlines.every((row) => row.guidedWords === 15)).toBe(true);
    expect(v4.stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);

    const v3 = await scenario();
    const today = await runPractice(["formats", ...v3.common, ...args], v3.env, v3.quiet);
    const todayReport = today.report as unknown as FormatsStoryReport;
    expect({ verdict: todayReport.verdict, reasons: todayReport.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(todayReport.byModelAndLane).toHaveLength(10);
    expect(todayReport.byModelAndLane.every((row) => JSON.stringify(row.statuses) === JSON.stringify({ PARSED: 1 }))).toBe(true);
    expect(answered(v3.stubs.requests, "STORYTELLER")).toHaveLength(5);
    expect(answered(v3.stubs.requests, "STORY_CHECKER")).toHaveLength(5);
    expectStoryV3(v3.stubs.requests);
    expect(todayReport.storyLengthByField?.length).toBeGreaterThan(0);
    expect(todayReport.storyLengthByField!.every((row) => row.guidedWords === null)).toBe(true);
    expect(v3.stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
  }, 600_000);

  /**
   * Task 18's filter (controller ruling "backup vs sit-out book"; until now pinned by source text only): a maker the
   * preview's sit-out book has benched is never the backup storyteller. The control run finds the AI the backup goes
   * to when nobody sits out; the second run makes that AI sit out (its first call ends in the vendor's gate-proven
   * unbilled refusal, the call and its resend) and the backup goes to another maker, which tells the story.
   * Fix round 1: the role rotation is seeded by the ask's `as_of` and question, so both runs ask with the SAME fixed
   * `as_of` and draw the same roles; the benched AI (the control's backup) is then never the planned story checker,
   * whom the picker skips anyway, and the case can only pass through Task 18's filter (asserted below).
   */
  it("R1d-6 --length-policy --engine-policy, the pinned storyteller unreachable: a backup of another maker tells the story; a maker the sit-out book benched is never the backup", async () => {
    type BackupRow = { firstModel: string; signal: string; backupModel: string | null; outcome: string };
    const storytellerDown = (request: GateRequest): GateOverride | null =>
      request.model === MIMO && request.kind === "STORYTELLER" ? { gateRefuses: "PROVIDER_ERROR_UNBILLED" } : null;
    const args = ["--register-export", registerExportPath, "--depth", "1", "--length-policy", LENGTH_POLICY_START,
      "--engine-policy", ENGINE_POLICY_START, "--storyteller-model", MIMO];
    const asOf = "2026-10-17T06:00:00.000Z";
    const modelOf = (report: EngineReport, providerRef: string | undefined) =>
      report.admission.panel.find((member) => member.providerRef === providerRef)?.modelId;
    const control = await scenario(storytellerDown);
    const first = (await runPractice(["debate", ...control.common, ...args], control.env, { ...control.quiet, asOf })).report as unknown as EngineReport;
    // The pinned storyteller's two unbilled vendor errors are the only warning; the backup told the story. Final wave A1
    // (Task 21 ruling): the pin did not hold, because the backup, not the pinned model, served the story: NOT_PROVEN.
    expect({ verdict: first.verdict, reasons: first.reasons })
      .toEqual({ verdict: "NOT_PROVEN", reasons: ["PRACTICE_PIN_NOT_HELD:STORYTELLER", "UNBILLED_REFUSALS:2"] });
    expect(first.ask.engine).toEqual({ engine: 2 });
    expect(first.run.story.outcome).toBe("READY");
    const [controlBackup] = first.storyBackups as BackupRow[];
    expect(first.storyBackups).toHaveLength(1);
    expect(controlBackup).toMatchObject({ firstModel: MIMO, signal: "UNREACHABLE", outcome: "READY" });
    const benched = controlBackup!.backupModel!;
    expect(benched).not.toBe(MIMO);
    expect(new Set(answered(control.stubs.requests, "STORYTELLER").map((request) => request.model))).toEqual(new Set([benched]));
    expect(first.writerPins?.storyteller).toEqual({ pinnedModel: MIMO, wroteModel: MIMO, servedBy: [benched], held: false });

    const benchedBusy = (request: GateRequest): GateOverride | null =>
      request.model === benched && request.kind !== "PROBE" ? { unbilled: true } : storytellerDown(request);
    const second = await scenario(benchedBusy);
    const report = (await runPractice(["debate", ...second.common, ...args], second.env, { ...second.quiet, asOf })).report as unknown as EngineReport;
    expect(report.ask.engine).toEqual({ engine: 2 });
    // Precondition: the same roles in both runs, and the benched AI is not the planned story checker (whom the picker
    // skips without any filter), so only Task 18's filter can keep the backup away from it.
    expect(report.admission.rotation).not.toBeNull();
    expect(report.admission.rotation).toEqual(first.admission.rotation);
    const plannedChecker = modelOf(report, report.admission.rotation!.storyChecker);
    expect(plannedChecker).toBeDefined();
    expect(plannedChecker).not.toBe(benched);
    expect(modelOf(report, report.admission.rotation!.storyteller)).toBe(MIMO);
    expect(new Set(answered(second.stubs.requests, "STORY_CHECKER").map((request) => request.model))).toEqual(new Set([plannedChecker]));
    // The benched AI is named busy (it sat out the rest of the run): NOT_PROVEN, as every run with a busy AI.
    expect(report.reasons).toContain(`MODEL_BUSY:${benched}`);
    expect(second.stubs.requests.some((request) => request.model === benched && request.answer === "UNBILLED")).toBe(true);
    expect(second.stubs.requests.some((request) => request.model === benched && request.answer === "OK" && request.kind !== "PROBE")).toBe(false);
    const [backup] = report.storyBackups as BackupRow[];
    expect(report.storyBackups).toHaveLength(1);
    expect(backup).toMatchObject({ firstModel: MIMO, signal: "UNREACHABLE", outcome: "READY" });
    expect([benched, MIMO, null]).not.toContain(backup!.backupModel);
    expect(second.stubs.requests.some((request) => request.model === benched && request.kind === "STORYTELLER")).toBe(false);
    expect(new Set(answered(second.stubs.requests, "STORYTELLER").map((request) => request.model))).toEqual(new Set([backup!.backupModel]));
    expect(report.run.story.outcome).toBe("READY");
  }, 900_000);
});
