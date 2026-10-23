import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { EntitlementRepository, PostgresInternalAllowanceRepository, createPool, migrate } from "@debateai/db";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  parsePreviewEnvironmentConfig,
  parsePreviewLineUp,
  previewModelRow,
  previewPlanTierRosters,
  previewThinkingLevelFor,
  previewThinkingLevelOnRequest,
  previewThinkingStepOf,
  previewTargetJsonRow,
  type PreviewThinkingLevels
} from "@debateai/providers";
import {
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText,
  readCallConcurrencyPolicy,
  registerVersionToSafeLegacyNumber,
  type RegisterPublicationRow
} from "@debateai/register";
import { STORY_CHECKER_V4_CONTRACT_ID } from "@debateai/story";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { buildDevelopmentStaffV2DeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { createRunInFlight, type RunInFlight } from "../../apps/runner/src/run-in-flight.js";
import {
  createRunnerSettingsCache,
  createRunSettingsVersions,
  loadRunnerVersionSettings,
  preloadRunnerSettings,
  readRunnerSiteContext,
  type RunnerSiteEnvironment
} from "../../apps/runner/src/run-settings.js";
import { checkRunnerSettingsVersion } from "../../apps/runner/src/settings-check.js";
import { checkAdmissionSettingsVersion, readAdmissionCheckSite, type ApiCheckEnvironment } from "../../apps/api/src/settings-check.js";
import { loadAdmissionSettings, type AdmissionRunMembers } from "../../apps/api/src/admission-settings.js";
import { createActiveSettingsVersionReader } from "../../apps/api/src/active-settings-version.js";
import { activateSettingsVersion, recordSettingsVerdict, settingsVerdictOf } from "../../tools/settings-version/settings-operator.js";
import {
  DEEPSEEK, GLM, HAIKU, MIMO, QWEN, RUN_RESILIENCE, TARGETS, previewDebateHarness, type AdmittedRun, type PreviewGates
} from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { publishRegisterFixture, readCompleteRegisterFixtureRows, registerFixtureRow } from "../support/registerFixtures.js";
import { TASK11_POLICY, internalFundingFixture } from "../support/internalFundingFixture.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §13 "Testing" (plan 2026-10-21-side-by-side-S-settings Task S19, with SA11's end-to-end case 10 folded
 * in, ruling R68) — EACH DEBATE RUNS ON ITS OWN SETTINGS VERSION, end to end, in ONE runner composed as
 * apps/runner/src/main.ts composes it: the site reads (`readRunnerSiteContext`), the per-version loader in its cache
 * (`createRunnerSettingsCache` over `loadRunnerVersionSettings`, the REAL register reads of this database), the run →
 * version map, every call charged to its own run's version's money guard and sent at its own debate's thinking table,
 * over the two preview gates' unix-socket doubles (tests/support/preview-gate-stubs.ts) through the house harness
 * (tests/support/preview-debate-harness.ts, `perVersion`). No AI is ever called.
 *
 * The register is built the way the live preview's is (history v4, then the publish kit v2 with the plan's `lineUp`), and
 * the release runs HOSTED (money guards) on the preview's sockets-only setting (addition D14):
 *  - S, the release's site version: the kit's version plus what a hosted release needs here (the story's money ceiling,
 *    the room's read budget, a per-run ceiling of seven tenths of a dollar) and a funded staff publication (case 9). Its call lanes
 *    allow one call at a time;
 *  - S+1, a copy of S with (a) a lower per-run ceiling, (b) three story rounds instead of two, (c) `perDebate: 3`, and
 *    (SA11) a new line-up: Free [GLM, Claude Haiku], Premium [GLM, Qwen, Claude Haiku], Qwen's pros-and-cons at "low";
 *  - S+2, S+1 with Qwen at "medium" everywhere (case 8's PASS verdict; activated in case 10 while a debate of S waits);
 *  - BAD, S with a stale judge prompt fingerprint (case 3: a version this release cannot run).
 * The release r<S>-… is current; check-version's two real halves PASS S+1 and S+2 (the verdicts the operator records).
 * The cases run in order on one database (S+1 is activated in case 2, S+2 in case 10). Embedded Postgres; CI skips this
 * directory; run it alone. The activation and API cases live in ./settings-per-debate-ops.test.ts.
 */
let database: TestDatabase;
let runtime: Pool;
let funding: ReturnType<typeof internalFundingFixture>;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

const OBSERVATION = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-23T08:00:00.000Z" };
const SOURCE_REF = "fixture:settings-per-debate";
/** The site's line-up (today's live values, the kit's plan `lineUp`, addition D23). */
const SITE_LINE_UP = parsePreviewLineUp({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: null });
/** The site's lanes: one call at a time per debate; the runner-wide limits are a site member (S+1 keeps them). */
const SITE_CALL_CONCURRENCY = Object.freeze({ perDebate: 1, perModelPerDebate: 1, perModelPerRunner: Object.freeze({ default: 50, deepinfra: 150, anthropic: 50 }) });
/** SA11 case 10: S+1's line-up (Free [GLM, Haiku]; Qwen's pros-and-cons at "low"). */
const NEXT_THINKING: PreviewThinkingLevels = Object.freeze({ [QWEN]: Object.freeze({ steps: Object.freeze({ pros_cons: "low" as const }) }) });
const NEXT_LINE_UP = Object.freeze({ kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, QWEN, HAIKU],
  thinking_levels: NEXT_THINKING });
/** S+2: Qwen at "medium" on every step (a debate of S that took S+2's table would show it). */
const LATER_LINE_UP = Object.freeze({ ...NEXT_LINE_UP, thinking_levels: Object.freeze({ [QWEN]: Object.freeze({ level: "medium" as const }) }) });
/**
 * The per-run ceilings (micro-dollars; each version keeps the site's 30% answer reserve, so the body, the arguing, has 70%
 * of it). S: seven tenths of a dollar, a body of 490,000. S+1: five hundredths, a body of 35,000 — room for its three opening calls
 * in flight (each projects ~5,000-7,000 at the preview's 8,192-token floor) and for a whole debate at the stand-in's
 * usual 150 tokens a reply, but not for a debate whose replies report 1,600 tokens each (case 1: ~700 micros a call).
 */
const SITE_PER_RUN_MICROS = 700_000;
const NEXT_PER_RUN_MICROS = 50_000;
/** Case 1: the tokens every reply of both debates reports (the same for both: only their ceilings differ). */
const LONG_REPLY = Object.freeze({ input: 100, output: 1600 });
/** The story's money ceiling (hosted): one story of the dearest storyteller fits; the day holds a run and a story. */
const STORY_ENVELOPE = Object.freeze({ kind: "STORY_COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1_000_000,
  per_story_ceiling_micros: 1_000_000, per_story_overrun_basis_points: 0, provisional: true,
  provisional_reason: "fixture: the story's own ceiling for a hosted preview release (settings-per-debate)" });
const SOCKETS_ONLY = parsePreviewEnvironmentConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  scope_id: "settings-per-debate" }))!;
const TARGETS_JSON = JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow));
const DECLARED_MODELS = Object.freeze([...new Set(TARGETS.map((target) => target.model))]);
/** Condition 6, live (the activation's): every gate serves every reviewed model. */
const ALL_GATES = Object.freeze({ deepinfra: Object.freeze([GLM, DEEPSEEK, MIMO, QWEN]), anthropic: Object.freeze([HAIKU]) });
const DIGEST_SEPARATOR = "-";

let S = 0;
let S1 = 0;
let S2 = 0;
let BAD = 0;
let RELEASE = "";

const runnerEnvironment = (): RunnerSiteEnvironment => Object.freeze({
  REGISTER_VERSION: S, DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", PROVIDER_DISCOVERY_TARGETS_JSON: TARGETS_JSON,
  PREVIEW_GATE_SETTINGS: SOCKETS_ONLY.gate, PREVIEW_ENV_LINE_UP: SOCKETS_ONLY.envLineUp,
  CLAIM_MS: harness.fixtureSettings().claimMs, CLAIM_MARGIN_MS: harness.fixtureSettings().claimMarginMs
});
const apiEnvironment = (mode: "local" | "hosted"): ApiCheckEnvironment => Object.freeze({
  REGISTER_VERSION: S, RELEASE_KEY: RELEASE, DEPLOYMENT_MODE: mode, NODE_ENV: "test", PROVIDER_DISCOVERY_TARGETS_JSON: TARGETS_JSON,
  PREVIEW_GATE_SETTINGS: SOCKETS_ONLY.gate, PREVIEW_ENV_LINE_UP: SOCKETS_ONLY.envLineUp
});

/** A house pool read-only in every transaction, as `role` (check-version's halves run so; tests/integration/settings-check-version). */
function readOnlyPool(role: string, name: string): Pool {
  const options = encodeURIComponent(`-c default_transaction_read_only=on -c role=${role}`);
  const separator = database.connectionString.includes("?") ? "&" : "?";
  return createPool(`${database.connectionString}${separator}options=${options}`, { max: 2, connectionTimeoutMillis: 5000, name });
}

/** A GENERAL version from `base`: rows replaced (each keeping its source reference) or added. */
async function publishFrom(base: number, change: Readonly<{ replace?: Readonly<Record<string, unknown>>; add?: Readonly<Record<string, unknown>>;
  rows?: readonly RegisterPublicationRow[] }>): Promise<number> {
  const baseText = parseRegisterVersionText(String(base));
  const rows = new Map((await readCompleteRegisterFixtureRows(database.pool, baseText)).map((row) => [row.rowKey, row] as const));
  for (const [rowKey, value] of Object.entries(change.replace ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(true);
    rows.set(rowKey, registerFixtureRow(rowKey, value, rows.get(rowKey)!.sourceRef));
  }
  for (const [rowKey, value] of Object.entries(change.add ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(false);
    rows.set(rowKey, registerFixtureRow(rowKey, value, SOURCE_REF));
  }
  for (const row of change.rows ?? []) rows.set(row.rowKey, row);
  const receipt = await publishRegisterFixture(database.pool, {
    publicationId: randomUUID(), baseRegisterVersion: baseText, rows: Object.freeze([...rows.values()]), sourceRef: SOURCE_REF
  });
  return registerVersionToSafeLegacyNumber(receipt.registerVersion);
}
async function rowValue(version: number, rowKey: string): Promise<Record<string, unknown>> {
  const row = (await readCompleteRegisterFixtureRows(database.pool, parseRegisterVersionText(String(version)))).find((one) => one.rowKey === rowKey);
  if (row === undefined) throw new Error(`test: ${rowKey} absent at ${String(version)}`);
  return JSON.parse(row.valueJsonText) as Record<string, unknown>;
}

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  let clean = false;
  try { const value = await work(client); clean = true; return value; } finally { client.release(!clean); }
}
/** check-version's two REAL halves (S14) on read-only runtime pools, and the verdict the operator records (S15). */
async function checkAndRecord(version: number): Promise<"PASS" | "FAIL"> {
  const runnerPool = readOnlyPool("debateai_runtime", "test:s19-check-runner");
  const apiPool = readOnlyPool("debateai_billing_runtime", "test:s19-check-api");
  try {
    const runner = await checkRunnerSettingsVersion({ pool: runnerPool, environment: { ...runnerEnvironment(), RELEASE_KEY: RELEASE }, version });
    const api = await checkAdmissionSettingsVersion({ pool: apiPool, environment: apiEnvironment("hosted"), version });
    const verdict = settingsVerdictOf(runner, api);
    expect({ runner: runner.codes, api: api.codes }, `check-version of ${String(version)}`).toEqual({ runner: [], api: [] });
    await withClient((client) => recordSettingsVerdict(client, verdict));
    return verdict.verdict;
  } finally {
    await Promise.allSettled([runnerPool.end(), apiPool.end()]);
  }
}
/** `activate <v>` through the operator module with its PRODUCTION readers and every gate serving every model (condition 6 live). */
async function activate(version: number, reason: string) {
  return withClient((client) => activateSettingsVersion(client, {
    version, activatedBy: "owner", reason, gateEnabledModels: ALL_GATES,
    seatableEnvironment: { envLineUp: null, declaredModels: DECLARED_MODELS }
  }));
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // Case 9's funding: a runtime login (debateai_runtime + debateai_billing_runtime), and the fixture's funding publication.
  const login = ["s19", "funding"].join("_");
  const password = ["private", "fixture", login].join("-");
  await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' IN ROLE debateai_runtime,debateai_billing_runtime`);
  const url = new URL(database.connectionString);
  url.username = login;
  url.password = password;
  runtime = createPool(url.toString());
  funding = internalFundingFixture(database.pool, runtime);
  await funding.selectFunding();

  // The live preview's register: history v4, then the publish kit v2 with the plan's line-up and the site's lanes.
  const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), OBSERVATION, undefined, "on", SITE_CALL_CONCURRENCY,
    null, null, null, null, SITE_LINE_UP)];
  const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
    .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
  const base = [...source.filter((row) => !["consumerRecoveryPolicy", "publicationCheckPolicy", "taxAuthorities", "answerRoleRotationPolicy"]
    .includes(row.rowKey)), ...owned];
  await createPostgresRegisterPublicationPort(database.pool).importHistorical({ registerVersion: parseRegisterVersionText("4"), rows: base });
  const v4 = await readSealedSnapshot(database.pool, "4");
  const snapshot = composePreviewSnapshotV2({ sourceRows: source, baseRows: v4.rows, baseRegisterVersion: "4", baseSnapshotSha256: v4.snapshotSha256 });
  const kit = registerVersionToSafeLegacyNumber(parseRegisterVersionText(String((await publishPreviewRegisterV2(database.pool, {
    publicationId: randomUUID(), sourceRef: "settings-per-debate preview fixture", snapshot,
    approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256,
      snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } })).registerVersion)));

  // S: what a hosted release needs (the story's ceiling; the room's read budget, paid plans P4-G) and the funded staff
  // publication the fixture seals (its three rows: staff access with ALLOWANCE_WRITE, the funded product roles, the enabled
  // internal allowance), so the funding publication is the site version itself (case 9).
  if (!TASK11_POLICY.enabled) throw new Error("test: the fixture's funding policy is enabled");
  const funded = (await buildDevelopmentStaffV2DeploymentRegisterPublicationRows(await loadBootstrapRegister(), TEST_DEVELOPMENT_PROVIDER_PANEL,
    undefined, "local", TASK11_POLICY)).filter((row) => ["staffAccessPolicy", "productRolePolicy", "internalAllowancePolicy"].includes(row.rowKey));
  expect(funded.map((row) => row.rowKey).sort()).toEqual(["internalAllowancePolicy", "productRolePolicy", "staffAccessPolicy"]);
  const admission = await rowValue(kit, "admissionPolicy");
  const siteEnvelope = await rowValue(kit, "costEnvelopePolicy");
  S = await publishFrom(kit, {
    add: { storyCostEnvelopePolicy: STORY_ENVELOPE },
    replace: {
      admissionPolicy: { ...admission, ask_room_reads: { key: "owner", limit: 120, window_ms: 60000, capacity: 120 } },
      costEnvelopePolicy: { ...siteEnvelope, per_run_ceiling_micros: SITE_PER_RUN_MICROS }
    },
    rows: funded
  });
  RELEASE = [`r${String(S)}`, "5e771ab50019"].join(DIGEST_SEPARATOR);
  const envelope = await rowValue(S, "costEnvelopePolicy");
  S1 = await publishFrom(S, { replace: {
    costEnvelopePolicy: { ...envelope, per_run_ceiling_micros: NEXT_PER_RUN_MICROS },
    storyLoopMaxRounds: { kind: "STORY_LOOP_MAX_ROUNDS", maxRounds: 3 },
    callConcurrencyPolicy: { kind: "CALL_CONCURRENCY_POLICY", ...SITE_CALL_CONCURRENCY, perDebate: 3, perModelPerDebate: 3 },
    previewLineUpPolicy: NEXT_LINE_UP
  } });
  S2 = await publishFrom(S1, { replace: { previewLineUpPolicy: LATER_LINE_UP } });
  const judge = await rowValue(S, "judgeContractHash") as unknown as string;
  BAD = await publishFrom(S, { replace: { judgeContractHash: judge.replace(/^.{8}/u, "00000000") } });

  // The release is current (Phase 1's release table), and it has passed S+1 and S+2 by check-version's real halves.
  await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test:settings-per-debate', NULL)", [RELEASE]);
  await database.pool.query("SELECT core.record_release_switch($1, NULL, now(), 'test:settings-per-debate', NULL)", [RELEASE]);
  expect(await checkAndRecord(S1)).toBe("PASS");
  expect(await checkAndRecord(S2)).toBe("PASS");
}, 900_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); vi.restoreAllMocks(); });
afterAll(async () => { await runtime?.end(); await database?.stop(); });

/* ------------------------------------------------------------------ the runner, per version */

/**
 * main.ts's boot over this database, hosted on the preview: the site reads (one money in-flight counter, made here and
 * watched), the per-version cache with the site version required first, the run → version map, the scheduler from the
 * site's lanes row, and the harness's per-version runner over `gates`. The site's ONE spend store is watched too (its
 * `recordSpend` is wrapped in place, the object itself kept), so a test can see that every version's guard charges it.
 */
async function perVersionRunner(gates: PreviewGates) {
  const inFlightRuns = new Set<string>();
  const counter = createRunInFlight();
  const moneyInFlight: RunInFlight = Object.freeze({
    ...counter,
    begin: (runId: string, projectedMicros: bigint) => { inFlightRuns.add(runId); return counter.begin(runId, projectedMicros); }
  });
  const { site } = await readRunnerSiteContext({ pool: database.pool, environment: runnerEnvironment(), moneyInFlight });
  const store = site.money!.store;
  const chargedRuns = new Set<string>();
  const recordSpend = store.recordSpend.bind(store);
  store.recordSpend = async (entry) => { if (entry.runId !== null) chargedRuns.add(entry.runId); return recordSpend(entry); };
  const settingsLines: Readonly<Record<string, unknown>>[] = [];
  const cache = createRunnerSettingsCache({
    load: (version) => loadRunnerVersionSettings(database.pool, version, site, { log: () => undefined }),
    log: (line) => { settingsLines.push(line); }
  });
  await cache.requireSettings(S);
  const versions = createRunSettingsVersions();
  const lanes = await readCallConcurrencyPolicy(database.pool, S);
  const composed = await harness.previewRunner(gates, "resend", {
    perVersion: { cache, versions, site }, resilience: RUN_RESILIENCE, releaseKey: RELEASE,
    ...(lanes.state === "SET" ? { callConcurrency: lanes.policy } : {})
  });
  return { ...composed, cache, versions, site, inFlightRuns, chargedRuns, settingsLines, store };
}
type PerVersionRunner = Awaited<ReturnType<typeof perVersionRunner>>;

/** A reviewed model's first declared target (GLM: its writer ref, preview:fixture-a). */
const refOf = (model: string): string => TARGETS.find((target) => target.model === model)!.providerRef;
/** The roster an ask on `version` is admitted from, by the API's own per-version loader (`loadAdmissionSettings`). */
async function admissionRoster(version: number, plan: "free" | "premium"): Promise<readonly string[]> {
  const pool = readOnlyPool("debateai_billing_runtime", "test:s19-admission");
  try {
    const site = await readAdmissionCheckSite(pool, apiEnvironment("local"));
    const loaded = await loadAdmissionSettings(pool, version, site);
    return previewPlanTierRosters(loaded.previewConfig, PLAN_TIER_ROSTERS)[plan];
  } finally {
    await pool.end();
  }
}
/** A debate admitted on `version` with the panel admission froze from that version's `plan` roster, stamped with the release. */
async function admit(label: string, version: number, plan: "free" | "premium" = "premium"): Promise<AdmittedRun> {
  const roster = await admissionRoster(version, plan);
  return harness.admittedRun(label, { panelRefs: roster.map(refOf), registerVersion: version, releaseKey: RELEASE, depth: 2 });
}

/** The story checker always objects, so a story runs every round its version allows (its `storyLoopMaxRounds`). */
const OBJECTION = "The summary calls the answer settled, but the label says it is contested (P1).";
function checkerObjects(request: GateRequest, chat: string): GateOverride | null {
  if (request.kind !== "STORY_CHECKER") return null;
  const v4 = readFramedMaterial(wirePacket(chat)).contractId === STORY_CHECKER_V4_CONTRACT_ID;
  return { content: JSON.stringify({ satisfied: false, ...(v4 ? { misleading: true } : {}), objection: OBJECTION, criteria: {
    faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: true, no_overstatement: false,
    citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
  } }) };
}
/** Each /complete held a little, so a debate's calls overlap as far as its lane lets them (probes are answered at once). */
const held = (request: GateRequest): number => (request.kind === "PROBE" ? 0 : 40);

async function ledgerCalls(runId: string) {
  return (await database.pool.query<{ call_site_key: string; actor_ref: string; outcome: string; thinking_level: string | null; sequence: string }>(
    `SELECT call_site_key, actor_ref, outcome, thinking_level, sequence::text FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId])).rows;
}
/** The story's storyteller rounds a run asked (STORY:STORYTELLER:<round>). */
async function storytellerRounds(runId: string): Promise<readonly number[]> {
  const rounds = (await ledgerCalls(runId)).map((call) => /^STORY:STORYTELLER:([1-8])$/u.exec(call.call_site_key)?.[1])
    .filter((round): round is string => round !== undefined).map(Number);
  return [...new Set(rounds)].sort((a, b) => a - b);
}
/**
 * What a run stamped with its version (side-by-side spec §13): the run row's own stamp, its first answer's version (the
 * first answer's version is its `factBundleVersion`, which is the settings version itself) and that answer's band-ceiling
 * row version (serve.answer.band_ceiling's register_version), and on its propagation receipt (ledger.propagation_run) the verdict label's
 * register version and the judgement selection rule's. These are every register version a run stores; the panel
 * weighting's (dispersion scale, family multiplier) is used in memory only and stored nowhere.
 */
async function stampsOf(runId: string, answerId: string) {
  // Every version is cast by the database (::integer), never coerced in JavaScript (the register law's rule).
  const run = (await database.pool.query<{ v: number }>("SELECT register_version::integer AS v FROM core.run WHERE run_id=$1", [runId])).rows[0];
  const answer = (await database.pool.query<{ answer_version: number; band: number | null }>(
    "SELECT answer_version, (band_ceiling->>'register_version')::integer AS band FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version LIMIT 1",
    [answerId])).rows[0];
  const receipts = (await database.pool.query<{ label: number | null; selection: number | null }>(
    `SELECT (served_root_selection->'verdictLabel'->>'registerVersion')::integer AS label,
            judgement_selection_rule_register_version::integer AS selection
       FROM ledger.propagation_run WHERE run_id=$1`, [runId])).rows;
  return {
    run: run?.v,
    factBundleVersion: answer?.answer_version,
    bandCeilingVersion: answer?.band,
    labelVersions: receipts.map((row) => row.label),
    selectionVersions: receipts.map((row) => row.selection)
  };
}
const stampedWith = (version: number) => ({
  run: version, factBundleVersion: version, bandCeilingVersion: version, labelVersions: [version], selectionVersions: [version]
});
/**
 * Loses the first copy of `debate` partway (the keep-alive's time limit at its first review call: the same abandon as a
 * lost claim; tests/integration/reclaim-resume.test.ts), lets its sent calls settle, runs `between`, lapses the claim and
 * lets THE SAME runner claim it again to its end.
 */
async function loseThenReclaim(composed: PerVersionRunner, debate: AdmittedRun, gates: PreviewGates, abort: AbortController,
  between: () => Promise<void>) {
  await expect(composed.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal: abort.signal }))
    .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
  const nodeCount = async () => (await database.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM core.node WHERE run_id=$1", [debate.runId])).rows[0]!.n;
  const settleBy = Date.now() + 30_000;
  for (let last = -1, stillSince = Date.now(); ;) {
    const now = await nodeCount();
    if (now !== last) { last = now; stillSince = Date.now(); }
    if (gates.arrivals.every((arrival) => arrival.answeredAt !== null) && Date.now() - stillSince >= 1_000) break;
    if (Date.now() > settleBy) throw new Error("test: the lost copy's calls did not settle within 30 s");
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  const lostAt = Number((await database.pool.query<{ s: string }>(
    "SELECT coalesce(max(sequence), 0)::text AS s FROM ledger.ledger_entry WHERE run_id=$1", [debate.runId])).rows[0]!.s);
  await between();
  await database.pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id = $1", [debate.workItemId]);
  const result = await harness.completedRun(composed, debate, gates);
  return { result, lostAt };
}

/** Qwen's row and each of a run's Qwen calls: the level its version's table gives the call's step. */
const QWEN_ROW = previewModelRow(QWEN)!;
const expectedQwenLevel = (levels: PreviewThinkingLevels | undefined, callSiteKey: string): string => previewThinkingLevelOnRequest(
  previewThinkingLevelFor(levels, QWEN_ROW, previewThinkingStepOf({ callSiteKey, lane: callSiteKey.startsWith("STORY:") ? "story" : "debate" })));


/** A debate whose first copy is lost at its first review call (loseThenReclaim): set its question before it runs. */
function losing() {
  const state = { question: "", abort: new AbortController() };
  const override = (request: GateRequest, chat: string): GateOverride | null => {
    if (state.question !== "" && !state.abort.signal.aborted && request.kind === "REVIEW" && chat.includes(state.question)) state.abort.abort();
    return checkerObjects(request, chat);
  };
  return { state, override };
}

/** A person with an account and an active subscription (the free plan; no entitlement event): spend-waiver.test.ts's. */
async function subscriptionPerson(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
       password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at)
     VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `s19-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}
/** The run belongs to `ownerRef` and is pinned to its funding (a subscription window, or an internal grant), as the room pins it. */
async function ownRun(runId: string, ownerRef: string, grant?: Readonly<{ grantId: string; grantEventId: string }>): Promise<void> {
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const entitlements = new EntitlementRepository(database.pool);
  await withClient(async (client) => {
    if (grant !== undefined) {
      await entitlements.recordRunChargeScope(client, { runId, ownerRef, basis: { kind: "INTERNAL", ...grant }, admittedAt: new Date() });
      return;
    }
    const entitlement = await entitlements.current(ownerRef, new Date());
    await entitlements.recordRunChargeScope(client, { runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt: new Date() });
  });
}
/** One charge on `runId`, billed to the UTC day (the site day), as spend-waiver.test.ts records one. */
async function charge(runId: string, micros: number): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
     VALUES (gen_random_uuid(),'RUN',$1,'preview:fixture-a',(clock_timestamp() AT TIME ZONE 'UTC')::date,$2,1,1)`, [runId, micros]);
}
const spentOf = async (runId: string): Promise<number> => Number((await database.pool.query<{ n: string }>(
  "SELECT coalesce(sum(charge_micros),0)::text AS n FROM ledger.model_spend WHERE run_id=$1", [runId])).rows[0]!.n);

/** A pool that records every SQL text it (and every client it hands out) is asked to run. */
function queryLoggingPool(pool: Pool, log: string[]): Pool {
  const textOf = (args: readonly unknown[]): string => typeof args[0] === "string" ? args[0] : String((args[0] as { text?: unknown } | undefined)?.text ?? "");
  const logged = <T extends object>(target: T, query: (...args: unknown[]) => unknown) => (...args: unknown[]) => { log.push(textOf(args)); return query.apply(target, args); };
  return new Proxy(pool, {
    get(target, property) {
      if (property === "query") return logged(target, target.query as (...args: unknown[]) => unknown);
      if (property === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(inner, key) {
              if (key === "query") return logged(inner, inner.query as (...args: unknown[]) => unknown);
              const value = Reflect.get(inner, key, inner) as unknown;
              return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(inner) : value;
            }
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });
}

describe("each debate runs on its own settings version (side-by-side spec §13 Testing, Task S19)", () => {
  it("1. two debates on two versions in one runner: each its own ceiling, story rounds and lane, its own stamps; one site day", async () => {
    // Both debates' replies report 1,600 tokens: the same spending, so only their versions' ceilings differ.
    const spending: string[] = [];
    const gates = await harness.startGates({}, { unbilled: [] }, checkerObjects, held,
      (request, chat) => request.kind !== "PROBE" && spending.some((question) => chat.includes(question)) ? LONG_REPLY : null);
    const composed = await perVersionRunner(gates);
    const a = await admit("one-a", S);
    const b = await admit("one-b", S1);
    spending.push(a.question, b.question);
    const [resultA, resultB] = await Promise.all([harness.completedRun(composed, a, gates), harness.completedRun(composed, b, gates)]);
    expect([resultA.kind, resultB.kind]).toEqual(["COMPLETED", "COMPLETED"]);
    expect([composed.versions.versionOf(a.runId), composed.versions.versionOf(b.runId)]).toEqual([S, S1]);

    // (a) Money: B's calls are refused at B's own per-run ceiling (the run's money stop ends its arguing); A's never are.
    const moneyMarks = async (answerId: string) => (await database.pool.query<{ mark: string }>(
      "SELECT mark FROM serve.condition_mark WHERE answer_id=$1 AND reason='RUN_COST_ENVELOPE_MONEY_REACHED'", [answerId])).rows.length;
    expect(await moneyMarks(resultB.answerId)).toBeGreaterThan(0);
    expect(await moneyMarks(resultA.answerId)).toBe(0);
    expect((await harness.bodyFactsOf(resultB.answerId))!.body_stop).toBe("MONEY");
    expect((await harness.bodyFactsOf(resultA.answerId))!.body_stop).toBeNull();

    // (b) The story: B's ran S+1's three rounds, A's S's two (the checker objects to every draft).
    expect(composed.cache.loaded(S)!.storyPolicy!.loopMaxRounds).toBe(2);
    expect(composed.cache.loaded(S1)!.storyPolicy!.loopMaxRounds).toBe(3);
    expect(await storytellerRounds(a.runId)).toEqual([1, 2]);
    expect(await storytellerRounds(b.runId)).toEqual([1, 2, 3]);

    // (c) The lanes: B's opened with S+1's three calls at once and reached three; A's one call at a time throughout.
    const laneOf = (runId: string) => composed.lanes.filter((_, index) => composed.laneDebateIds[index] === runId);
    expect(laneOf(a.runId).map((lane) => [lane.callsAtOnce, lane.stats().peakInFlight])).toEqual([[1, 1]]);
    expect(laneOf(b.runId).map((lane) => [lane.callsAtOnce, lane.stats().peakInFlight])).toEqual([[3, 3]]);

    // (d) Each run's stored stamps are its own version.
    expect(await stampsOf(a.runId, resultA.answerId)).toEqual(stampedWith(S));
    expect(await stampsOf(b.runId, resultB.answerId)).toEqual(stampedWith(S1));

    // (e) One site day: each version has its own guard, and both charge the site's ONE spend store and count their calls
    // in its ONE money in-flight counter (the shared wall's day and person windows read that store).
    expect(composed.cache.loaded(S)!.costEnvelope!.guard).not.toBe(composed.cache.loaded(S1)!.costEnvelope!.guard);
    expect([composed.chargedRuns.has(a.runId), composed.chargedRuns.has(b.runId)]).toEqual([true, true]);
    expect([composed.inFlightRuns.has(a.runId), composed.inFlightRuns.has(b.runId)]).toEqual([true, true]);
    const day = await composed.store.readDaySpentMicros(costEnvelopeDay(new Date()));
    expect(day).toBeGreaterThanOrEqual((await spentOf(a.runId)) + (await spentOf(b.runId)));
  }, 900_000);

  it("2. a debate keeps its version across an activation, a re-claim and its story; a new ask after the activation is stamped S+1", async () => {
    const lose = losing();
    const gates = await harness.startGates({}, { unbilled: [] }, lose.override, held);
    const composed = await perVersionRunner(gates);
    const a = await admit("keeps", S);
    lose.state.question = a.question;
    const { result, lostAt } = await loseThenReclaim(composed, a, gates, lose.state.abort, async () => {
      // The owners activate S+1 while A is between its two claims (the operator module, condition 6 live).
      expect(await activate(S1, "S19 case 2")).toMatchObject({ previous: null, releaseKey: RELEASE });
    });
    expect(lostAt).toBeGreaterThan(0);
    // Still S: the run's version map, its stamps, its two lanes (one per claim, S's one call at a time).
    expect(composed.versions.versionOf(a.runId)).toBe(S);
    expect(await stampsOf(a.runId, result.answerId)).toEqual(stampedWith(S));
    expect(composed.lanes.filter((_, index) => composed.laneDebateIds[index] === a.runId).map((lane) => lane.callsAtOnce)).toEqual([1, 1]);
    // The recorded answers were replayed (their prompts' fingerprints matched on S's settings), never asked again.
    const calls = await ledgerCalls(a.runId);
    const opening = /^JUDGE(?::root:(?:secondary|[0-9]+))?(?::seat:[A-Za-z]+)?$/u;
    const openedBefore = calls.filter((call) => Number(call.sequence) <= lostAt && call.outcome === "OK" && opening.test(call.call_site_key))
      .map((call) => `${call.call_site_key} ${call.actor_ref}`);
    expect(openedBefore.length).toBeGreaterThan(0);
    expect(calls.filter((call) => Number(call.sequence) > lostAt && openedBefore.includes(`${call.call_site_key} ${call.actor_ref}`))).toEqual([]);
    // Its story after DONE used S's story policy: two rounds, not S+1's three.
    expect(await storytellerRounds(a.runId)).toEqual([1, 2]);

    // A new ask after the activation: the API reads the pointer (its one reader, at most a second old) and stamps S+1.
    const reader = createActiveSettingsVersionReader({ pool: database.pool, siteVersion: S });
    const members = (version: number): AdmissionRunMembers => Object.freeze({
      registerVersion: version,
      resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
        effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
      })
    });
    const dispatched: string[] = [];
    const dispatcher: Dispatcher = { dispatch: async ({ runId }) => { dispatched.push(runId); } };
    const settings: RunCreationSettings = {
      strangerSampleRate: 0, registerVersion: S, releaseKey: RELEASE, batteryVersion: "s00", settlementWatchHandle: "settlement-watch:s19",
      resolveDiscoveredPanel: async () => [...new Set([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium])].map((modelId, index) => Object.freeze({
        provider_ref: `provider:s19:${String(index + 1)}`, maker: `maker:s19:${String(index + 1)}`, model_id: modelId,
        probe_evidence_ref: randomUUID(), probed_at: "2026-10-23T00:00:00.000Z"
      })),
      resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
        effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
      }),
      admissionSettings: { activeSettingsVersion: () => reader.current(), admissionSettingsFor: async (version) => members(version) }
    };
    const application = new PostgresAskApplication(database.pool, dispatcher, settings, undefined, database.pool,
      createTestAskAdmissionPoolFacades(database.pool));
    const askerId = `s19:after-activation:${randomUUID()}`;
    const ask: AskRequest = {
      question_line: "Should a question asked after an activation run on the newly active settings?", risk_tier: "casual",
      tier_source: "ASKER", tier_provenance_ref: "asker-declaration:s19", composition_budget_tier: "low", depth_params: { depth: 1 },
      decision_scope: "settings-per-debate integration test", as_of: "2026-10-23T00:00:00.000Z", steering_presets: [], plan_tier: "free",
      steering_annotations: []
    };
    const session = { asker_id: askerId, session_id: `session:s19:${randomUUID()}`, caller_scope: "ASKER",
      ownership_provenance: "user_dev_token", provisional_identity_model: true } as unknown as Session;
    const accepted = await application.submit(ask, session, { kind: "legacy", legacyAskerId: askerId });
    const stamp = (await database.pool.query<{ release_key: string; register_version: string }>(
      "SELECT release_key, register_version::text AS register_version FROM core.run WHERE run_id=$1", [accepted.run_ref])).rows[0];
    expect(stamp).toEqual({ release_key: RELEASE, register_version: String(S1) });
    expect(dispatched).toEqual([accepted.run_ref]);
  }, 900_000);

  it("3. a version this release cannot run: set aside before any call, one waiver; out of the person's window, in the site day", async () => {
    const gates = await harness.startGates({}, { unbilled: [] }, checkerObjects, held);
    const composed = await perVersionRunner(gates);
    const ownerRef = await subscriptionPerson();
    // BAD is S with a stale judge prompt fingerprint: admitted (stamped BAD) with S's roster, owned by a subscriber.
    const roster = await admissionRoster(S, "premium");
    const debate = await harness.admittedRun("unsupported", { panelRefs: roster.map(refOf), registerVersion: BAD, releaseKey: RELEASE, depth: 2 });
    await ownRun(debate.runId, ownerRef);
    const warned: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((line: unknown) => { warned.push(String(line)); });
    await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({ code: "SETTINGS_VERSION_UNSUPPORTED" });
    // Phase 1's set-aside form (ruling R10): FAILED with the reason the page reads as SET_ASIDE, and exactly one waiver.
    expect((await database.pool.query("SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1", [debate.workItemId])).rows)
      .toEqual([{ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:SETTINGS_VERSION_UNSUPPORTED" }]);
    expect((await database.pool.query("SELECT reason FROM ledger.model_spend_waiver WHERE run_id=$1", [debate.runId])).rows)
      .toEqual([{ reason: "SETTINGS_VERSION_UNSUPPORTED" }]);
    // No model call: nothing reached a gate (not even a probe), no ledger row, no lane, no run → version entry.
    expect(gates.requests).toEqual([]);
    expect(await ledgerCalls(debate.runId)).toEqual([]);
    expect(composed.laneDebateIds).not.toContain(debate.runId);
    expect(composed.versions.versionOf(debate.runId)).toBeUndefined();
    // The cache keeps BAD as unsupported with the loader's code (its one line), and the debate's own content-free line.
    expect(composed.cache.versions()).toContainEqual({ version: BAD, kind: "UNSUPPORTED" });
    expect(composed.settingsLines).toEqual([{ kind: "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED", version: String(BAD), code: "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH" }]);
    const line = warned.map((text) => { try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; } })
      .find((parsed) => parsed?.kind === "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED");
    expect(line).toMatchObject({ runId: debate.runId, version: String(BAD), code: "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH" });
    // Phase 1's readers: a charge on the set-aside run leaves the person's window and stays in the site's day; the same
    // person's run without a waiver counts in both (the control).
    const other = await harness.admittedRun("unsupported-control", { panelRefs: roster.map(refOf), registerVersion: S, releaseKey: RELEASE, depth: 2 });
    await ownRun(other.runId, ownerRef);
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [other.workItemId]);
    const store = new PostgresModelSpendStore(database.pool);
    const today = costEnvelopeDay(new Date());
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const dayBefore = await store.readDaySpentMicros(today);
    await charge(debate.runId, 700);
    await charge(other.runId, 300);
    expect(await store.readOwnerSpentMicros(ownerRef, from, to)).toBe(300);
    expect((await store.readDaySpentMicros(today)) - dayBefore).toBe(1000);
  }, 900_000);

  it("8. the boot preload: an open run on S+1 and a PASS for S+2 load S, S+1 and S+2 at boot, and the pointer is never read", async () => {
    const open = await harness.admittedRun("preload-open", { panelRefs: (await admissionRoster(S1, "premium")).map(refOf), registerVersion: S1, releaseKey: RELEASE, depth: 2 });
    expect((await database.pool.query("SELECT state FROM core.work_item WHERE work_item_id=$1", [open.workItemId])).rows).toEqual([{ state: "READY" }]);
    const queries: string[] = [];
    const pool = queryLoggingPool(database.pool, queries);
    // main.ts's boot over the logging pool: the site reads, the cache, the site version first, then the preload.
    const { site } = await readRunnerSiteContext({ pool, environment: runnerEnvironment(), moneyInFlight: createRunInFlight() });
    const cache = createRunnerSettingsCache({ load: (version) => loadRunnerVersionSettings(pool, version, site, { log: () => undefined }), log: () => undefined });
    await cache.requireSettings(S);
    const preload = await preloadRunnerSettings({
      cache, pool, work: new WorkItemRepository(pool, Object.freeze({ releaseKey: RELEASE, workerId: "runner:s19-preload" })),
      releaseKey: RELEASE, siteVersion: S
    });
    expect(preload).toEqual({ releaseKey: RELEASE, siteVersion: S, loaded: [S, S1, S2], unsupported: [] });
    expect(cache.versions()).toEqual([{ version: S, kind: "SETTINGS" }, { version: S1, kind: "SETTINGS" }, { version: S2, kind: "SETTINGS" }]);
    // The log saw the preload's own two sources (the control) and never the activation pointer's reader.
    expect(queries.some((text) => text.includes("register.read_passed_settings_versions"))).toBe(true);
    expect(queries.some((text) => /core\.work_item/u.test(text))).toBe(true);
    expect(queries.filter((text) => /read_active_settings_version|settings_activation/iu.test(text))).toEqual([]);
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [open.workItemId]);
  }, 900_000);

  it("9. funding across versions: a debate admitted on S+1, funded by a grant of the funding publication S, runs and charges its grant", async () => {
    const actor = await funding.fundedActor();
    // The funding publication is the site version S (it seals the funded staff rows); the debate runs on S+1.
    await database.pool.query("UPDATE staff.funding_policy_selection SET register_version=$1 WHERE singleton", [S]);
    const command = funding.configureCommand(actor, { policyRegisterVersion: S });
    expect((await funding.configure(actor, command)).rows[0].receipt).toMatchObject({ outcome: "COMPLETED" });
    const grant = (await new PostgresInternalAllowanceRepository(runtime).current(actor.ownerRef, new Date()))!;
    expect(grant.policyRegisterVersion).toBe(S);
    const gates = await harness.startGates({}, { unbilled: [] }, checkerObjects, held);
    const composed = await perVersionRunner(gates);
    const debate = await admit("funded", S1);
    await ownRun(debate.runId, actor.ownerRef, { grantId: grant.grantId, grantEventId: grant.grantEventId });
    const result = await harness.completedRun(composed, debate, gates);
    expect(result.kind).toBe("COMPLETED");
    expect(composed.versions.versionOf(debate.runId)).toBe(S1);
    // Its spend is its grant's: the grant's own reader counts exactly what the run was charged.
    const spent = await spentOf(debate.runId);
    expect(spent).toBeGreaterThan(0);
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const grantSpent = (await runtime.query<{ spent: string }>(
      "SELECT billing.read_internal_grant_spent($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::timestamptz,$6::boolean)::text AS spent",
      [actor.ownerRef, grant.grantId, grant.grantEventId, from, to, true])).rows[0]!.spent;
    expect(Number(grantSpent)).toBe(spent);
    expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(debate.runId)).toBe("ACTIVE");
  }, 900_000);

  it("10. (SA11) the line-up per version: each debate's panel from its own version's roster, each call at its own version's thinking level, re-claim included", async () => {
    // Admission (the API's own per-version loader): S+1's rosters are its row's, S's the site's.
    expect(await admissionRoster(S, "free")).toEqual([GLM, DEEPSEEK]);
    expect(await admissionRoster(S1, "free")).toEqual([GLM, HAIKU]);
    expect(await admissionRoster(S1, "premium")).toEqual([GLM, QWEN, HAIKU]);
    const lose = losing();
    const gates = await harness.startGates({}, { unbilled: [] }, lose.override, held);
    const composed = await perVersionRunner(gates);
    const b = await admit("ten-b", S1, "premium");
    const a = await admit("ten-a", S, "premium");
    lose.state.question = a.question;
    const resultB = await harness.completedRun(composed, b, gates);
    expect(resultB.kind).toBe("COMPLETED");
    // B runs alone, to its end (story included), before A is claimed: every request the gates got so far is B's, the rest A's.
    const bRequests = gates.requests.length;
    const { lostAt } = await loseThenReclaim(composed, a, gates, lose.state.abort, async () => {
      expect(await activate(S2, "S19 case 10")).toMatchObject({ previous: S1, releaseKey: RELEASE });
    });
    expect([composed.versions.versionOf(a.runId), composed.versions.versionOf(b.runId)]).toEqual([S, S1]);
    // B's panel is S+1's roster: every model its calls reached is on it, Qwen included; A's are S's.
    const requestsOfRun = (debate: AdmittedRun) => (debate === b ? gates.requests.slice(0, bRequests) : gates.requests.slice(bRequests))
      .filter((request) => request.kind !== "PROBE");
    const modelsOf = (debate: AdmittedRun) => new Set(requestsOfRun(debate).map((request) => request.model));
    expect([...modelsOf(b)].sort()).toEqual([GLM, QWEN, HAIKU].sort());
    expect([...modelsOf(a)].every((model) => SITE_LINE_UP.premium_model_ids.includes(model))).toBe(true);
    // Every Qwen call carried its own version's level for its step: B's pros-and-cons "low", everything else (and every
    // call of A, before and after its re-claim under the activated S+2) Qwen's default, never S+2's "medium".
    const qwenCalls = async (runId: string) => (await ledgerCalls(runId)).filter((call) => TARGETS.find((target) => target.providerRef === call.actor_ref)?.model === QWEN);
    const callsB = await qwenCalls(b.runId);
    const callsA = await qwenCalls(a.runId);
    expect(callsB.map((call) => call.thinking_level)).toEqual(callsB.map((call) => expectedQwenLevel(NEXT_THINKING, call.call_site_key)));
    expect(callsA.map((call) => call.thinking_level)).toEqual(callsA.map((call) => expectedQwenLevel(undefined, call.call_site_key)));
    expect(callsB.filter((call) => /^JUDGE:(?:defender|critic):/u.test(call.call_site_key) && call.thinking_level === "low").length).toBeGreaterThan(0);
    expect(callsA.filter((call) => Number(call.sequence) > lostAt).length).toBeGreaterThan(0);
    expect(callsA.some((call) => call.thinking_level === "medium")).toBe(false);
    // The scripted gate's record of each call's effort matches: its reasoning_effort per level, for each debate (every
    // request the gate answered OK is one OK ledger row; a replayed call is neither).
    const gateEfforts = (debate: AdmittedRun) => requestsOfRun(debate).filter((request) => request.model === QWEN && request.answer === "OK")
      .map((request) => (typeof request.body.reasoning_effort === "string" ? request.body.reasoning_effort : "DEFAULT_ONLY")).sort();
    const ledgerEfforts = (calls: readonly { thinking_level: string | null; outcome: string }[]) =>
      calls.filter((call) => call.outcome === "OK").map((call) => call.thinking_level ?? "NONE").sort();
    expect(gateEfforts(b)).toEqual(ledgerEfforts(callsB));
    expect(gateEfforts(a)).toEqual(ledgerEfforts(callsA));
  }, 900_000);
});
