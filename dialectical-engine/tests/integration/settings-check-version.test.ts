import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPool, migrate } from "@debateai/db";
import { costEnvelopeGuardPolicy } from "@debateai/budget";
import {
  PREVIEW_GLM_DEADLINE_MS,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  parsePreviewEnvironmentConfig,
  parsePreviewLineUp,
  previewModelRow,
  previewTargetJsonRow
} from "@debateai/providers";
import {
  canonicalRegisterJson,
  costEnvelopePolicyFromValue,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText,
  previewLineUpPolicyFromValue,
  registerVersionToSafeLegacyNumber,
  type SettingsCheckReport
} from "../../packages/register/src/index.js";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { seedDevelopmentDeploymentRegister } from "../../apps/runner/src/dev-deployment-register.js";
import { checkRunnerSettingsVersion, type RunnerCheckEnvironment } from "../../apps/runner/src/settings-check.js";
import { checkAdmissionSettingsVersion, type ApiCheckEnvironment } from "../../apps/api/src/settings-check.js";
import {
  publishRegisterFixture,
  readCompleteRegisterFixtureRows,
  registerFixtureRow
} from "../support/registerFixtures.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §13 "Activation is refused unless" (Task S14): check-version, the dry boot of a release against one
 * sealed settings version, in its two halves, over a REAL database: the development register is the release's site
 * version; each case publishes a test version from it (the register's own publication port) and runs both halves.
 * Both halves run on a house pool whose every transaction is READ ONLY and whose role is the process's own runtime role
 * (the runner's debateai_runtime, the API's debateai_billing_runtime): a write, or a read the role may not make, fails
 * the half (it rejects) instead of passing. Embedded Postgres; CI skips this directory; run it alone.
 */
let database: TestDatabase;
/** The local release's site version: the development register as seeded. */
let SITE = 0;
/**
 * The hosted release's site version: the development register with the one member a hosted API with the band also
 * needs (admissionPolicy's ask_room_reads, paid plans P4-G: without it the API's boot refuses ASK_ROOM_ADMISSION_UNSEALED,
 * as it does here for the local register under hosted mode).
 */
let HOSTED_SITE = 0;
let runnerPool: Pool;
let apiPool: Pool;

const SOURCE_REF = "fixture:settings-check-version";

/** A house pool on a test database (the shared one by default), read-only in every transaction, as `role`. */
function readOnlyPool(role: string, name: string, on: TestDatabase = database): Pool {
  const options = encodeURIComponent(`-c default_transaction_read_only=on -c role=${role}`);
  const separator = on.connectionString.includes("?") ? "&" : "?";
  return createPool(`${on.connectionString}${separator}options=${options}`, { max: 2, connectionTimeoutMillis: 5000, name });
}

type Mode = "local" | "hosted";
const siteOf = (mode: Mode): number => (mode === "local" ? SITE : HOSTED_SITE);
/** A release's key: its own site version's number and a made-up revision (gitleaks: built from pieces). */
const releaseKeyOf = (mode: Mode): string => [`r${siteOf(mode)}`, "0123456789ab"].join("-");

/** The value of one of the local site version's rows, as plain JSON. */
async function siteRowValue(rowKey: string): Promise<unknown> {
  const rows = await readCompleteRegisterFixtureRows(database.pool, parseRegisterVersionText(String(SITE)));
  const row = rows.find((candidate) => candidate.rowKey === rowKey);
  if (row === undefined) throw new Error(`SITE_ROW_ABSENT:${rowKey}`);
  return JSON.parse(row.valueJsonText) as unknown;
}

/** A new GENERAL version: a release's site version's rows (the local one by default), some replaced, added or dropped. */
async function publishFromSite(change: Readonly<{
  replace?: Readonly<Record<string, unknown>>; add?: Readonly<Record<string, unknown>>; drop?: readonly string[]; mode?: Mode;
}>): Promise<number> {
  const base = parseRegisterVersionText(String(siteOf(change.mode ?? "local")));
  const rows = new Map((await readCompleteRegisterFixtureRows(database.pool, base)).map((row) => [row.rowKey, row] as const));
  for (const rowKey of change.drop ?? []) {
    expect(rows.delete(rowKey), rowKey).toBe(true);
  }
  // A replaced row keeps its source reference: the development runner policy's reader checks its rows' provenance.
  for (const [rowKey, value] of Object.entries(change.replace ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(true);
    rows.set(rowKey, registerFixtureRow(rowKey, value, rows.get(rowKey)!.sourceRef));
  }
  for (const [rowKey, value] of Object.entries(change.add ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(false);
    rows.set(rowKey, registerFixtureRow(rowKey, value, SOURCE_REF));
  }
  const receipt = await publishRegisterFixture(database.pool, {
    publicationId: randomUUID(), baseRegisterVersion: base, rows: Object.freeze([...rows.values()]), sourceRef: SOURCE_REF
  });
  return registerVersionToSafeLegacyNumber(receipt.registerVersion);
}

/** The development panel's targets, as the local release declares them (loopback relays). */
const LOCAL_TARGETS = () => TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson;
/**
 * The same configured providers as a HOSTED release declares them: an https vendor host each, no inline credential (a
 * credential file the check never reads), and a price (V-28).
 */
function hostedTargets(): string {
  const rows = JSON.parse(TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
  return JSON.stringify(rows.map((row, index) => {
    const { authorization_header: _inline, ...rest } = row;
    return {
      ...rest,
      base_url: `https://vendor-${index}.example/v1`,
      authorization_file: `/etc/debateai/providers/vendor-${index}.key`,
      input_price_micros_per_million: 1,
      output_price_micros_per_million: 1
    };
  }));
}

const runnerEnvironment = (mode: Mode): RunnerCheckEnvironment => Object.freeze({
  REGISTER_VERSION: siteOf(mode), RELEASE_KEY: releaseKeyOf(mode), DEPLOYMENT_MODE: mode, NODE_ENV: "test",
  PROVIDER_DISCOVERY_TARGETS_JSON: mode === "local" ? LOCAL_TARGETS() : hostedTargets(),
  PREVIEW_GATE_SETTINGS: undefined, PREVIEW_ENV_LINE_UP: undefined, CLAIM_MS: 7200000, CLAIM_MARGIN_MS: 1000
});
const apiEnvironment = (mode: Mode): ApiCheckEnvironment => Object.freeze({
  REGISTER_VERSION: siteOf(mode), RELEASE_KEY: releaseKeyOf(mode), DEPLOYMENT_MODE: mode, NODE_ENV: "test",
  PROVIDER_DISCOVERY_TARGETS_JSON: mode === "local" ? LOCAL_TARGETS() : hostedTargets(),
  PREVIEW_GATE_SETTINGS: undefined, PREVIEW_ENV_LINE_UP: undefined
});

async function checkBoth(version: number, mode: Mode): Promise<Readonly<{ runner: SettingsCheckReport; api: SettingsCheckReport }>> {
  const runner = await checkRunnerSettingsVersion({ pool: runnerPool, environment: runnerEnvironment(mode), version });
  const api = await checkAdmissionSettingsVersion({ pool: apiPool, environment: apiEnvironment(mode), version });
  return Object.freeze({ runner, api });
}

/** The sealed snapshot of a version, as the register recorded it. */
async function snapshotOf(version: number): Promise<string | null> {
  const row = (await database.pool.query<{ snapshot_sha256: string | null }>(
    "SELECT snapshot_sha256 FROM register.register_version WHERE register_version=$1", [version])).rows[0];
  return row?.snapshot_sha256?.trim() ?? null;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The seeder writes its receipt under a repository root: a fresh folder in this run's own temp folder.
  const repositoryRoot = await mkdtemp(join(tmpdir(), "settings-check-version-"));
  await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  const receipt = await seedDevelopmentDeploymentRegister({
    adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot
  });
  SITE = registerVersionToSafeLegacyNumber(parseRegisterVersionText(receipt.registerVersion));
  const admission = await siteRowValue("admissionPolicy") as Record<string, unknown>;
  HOSTED_SITE = await publishFromSite({ replace: { admissionPolicy: {
    ...admission, ask_room_reads: { key: "owner", limit: 120, window_ms: 60000, capacity: 120 }
  } } });
  runnerPool = readOnlyPool("debateai_runtime", "test:check-runner");
  apiPool = readOnlyPool("debateai_billing_runtime", "test:check-api");
}, 600_000);

afterAll(async () => {
  await Promise.allSettled([runnerPool?.end(), apiPool?.end()]);
  await database?.stop();
});

describe("check-version over a real database (side-by-side §13, S14)", () => {
  it("the pools are what the halves run as: every transaction read-only, under each process's runtime role", async () => {
    for (const [pool, role] of [[runnerPool, "debateai_runtime"], [apiPool, "debateai_billing_runtime"]] as const) {
      const row = (await pool.query<{ role: string; read_only: string }>(
        "SELECT current_user AS role, current_setting('transaction_read_only') AS read_only")).rows[0]!;
      expect(row).toEqual({ role, read_only: "on" });
      // Control: a write on these pools is refused, so a half that wrote anything could not pass.
      await expect(pool.query("CREATE TEMP TABLE settings_check_probe (a integer)")).rejects.toThrow(/read-only transaction/u);
    }
  });

  it("each release's own site version: both halves PASS and name the release and the sealed snapshot", async () => {
    for (const mode of ["local", "hosted"] as const) {
      const site = siteOf(mode);
      const { runner, api } = await checkBoth(site, mode);
      expect(runner, mode).toMatchObject({ half: "runner", releaseKey: releaseKeyOf(mode), version: site, verdict: "PASS", codes: [] });
      expect(api, mode).toMatchObject({ half: "api", releaseKey: releaseKeyOf(mode), version: site, verdict: "PASS", codes: [] });
      expect(runner.snapshotSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(runner.snapshotSha256).toBe(await snapshotOf(site));
      expect(api.snapshotSha256).toBe(runner.snapshotSha256);
    }
  });

  it("(a) a copy with a raised per-run ceiling that the day still holds: both halves PASS, local and hosted", async () => {
    const envelope = await siteRowValue("costEnvelopePolicy") as Record<string, number>;
    for (const mode of ["local", "hosted"] as const) {
      const version = await publishFromSite({ mode, replace: {
        costEnvelopePolicy: { ...envelope, per_run_ceiling_micros: envelope.per_run_ceiling_micros! + 50000 }
      } });
      const { runner, api } = await checkBoth(version, mode);
      expect([runner.verdict, runner.codes, api.verdict, api.codes], mode).toEqual(["PASS", [], "PASS", []]);
      expect(runner.snapshotSha256).toBe(await snapshotOf(version));
    }
  });

  it("(b) a changed sessionPolicy: the API half FAILs SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy (a site rule: an upload)", async () => {
    const session = await siteRowValue("sessionPolicy") as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(session).map(([member, value]) =>
      [member, typeof value === "number" && Number.isSafeInteger(value) ? value + 1 : value]));
    expect(changed).not.toEqual(session);
    const version = await publishFromSite({ replace: { sessionPolicy: changed } });
    const { runner, api } = await checkBoth(version, "local");
    expect(api).toMatchObject({ verdict: "FAIL", codes: ["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"] });
    expect(runner).toMatchObject({ verdict: "PASS", codes: [] });
  });

  it("(c) a changed daily_ceiling_micros: SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros", async () => {
    const envelope = await siteRowValue("costEnvelopePolicy") as Record<string, number>;
    const version = await publishFromSite({ replace: {
      costEnvelopePolicy: { ...envelope, daily_ceiling_micros: envelope.daily_ceiling_micros! + 1000000 }
    } });
    const { api } = await checkBoth(version, "local");
    expect(api).toMatchObject({ verdict: "FAIL", codes: ["SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros"] });
  });

  it("(d) a per-run raise the site's day cannot hold: the composed row's own refusal (hosted), beside the day's own difference", async () => {
    const envelope = await siteRowValue("costEnvelopePolicy") as Record<string, number>;
    // The version's own row holds its raise only with a bigger day of its own; the debate runs under the SITE's day,
    // which cannot hold it (composeDebateCostEnvelope re-validates: COST_ENVELOPE_POLICY_INVALID).
    const version = await publishFromSite({ mode: "hosted", replace: { costEnvelopePolicy: {
      ...envelope, per_run_ceiling_micros: envelope.daily_ceiling_micros!, daily_ceiling_micros: envelope.daily_ceiling_micros! * 2
    } } });
    const { runner, api } = await checkBoth(version, "hosted");
    expect(runner).toMatchObject({ verdict: "FAIL", codes: ["COST_ENVELOPE_POLICY_INVALID"] });
    expect(api).toMatchObject({ verdict: "FAIL",
      codes: ["COST_ENVELOPE_POLICY_INVALID", "SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros"] });
  });

  it("(d) a per-run raise the site's day holds alone but not with the story: both halves FAIL STORY_DAILY_CEILING_INSUFFICIENT (hosted)", async () => {
    const envelope = await siteRowValue("costEnvelopePolicy") as Record<string, number>;
    const story = { kind: "STORY_COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1000000,
      per_story_ceiling_micros: 50000, per_story_overrun_basis_points: 2000, provisional: true,
      provisional_reason: "fixture: the story's cap beside a raised per-run ceiling" };
    // The largest per-run ceiling the row accepts beside the site's own day: the day holds one run, not one run and its
    // story, so the refusal is condition 4's (the one check over both money rows).
    let perRun = envelope.daily_ceiling_micros!;
    const rowAccepts = (value: number): boolean => {
      try { costEnvelopePolicyFromValue({ ...envelope, per_run_ceiling_micros: value }, SOURCE_REF); return true; } catch { return false; }
    };
    while (!rowAccepts(perRun)) perRun -= 1000;
    expect(perRun).toBeGreaterThan(envelope.per_run_ceiling_micros!);
    expect(() => costEnvelopeGuardPolicy(costEnvelopePolicyFromValue({ ...envelope, per_run_ceiling_micros: perRun }, SOURCE_REF), {
      perStoryCeilingMicros: story.per_story_ceiling_micros, perStoryOverrunBasisPoints: story.per_story_overrun_basis_points
    })).toThrow(expect.objectContaining({ code: "STORY_DAILY_CEILING_INSUFFICIENT" }));
    const change = {
      replace: { costEnvelopePolicy: { ...envelope, per_run_ceiling_micros: perRun } },
      add: { storyCostEnvelopePolicy: story }
    };
    const { runner, api } = await checkBoth(await publishFromSite({ ...change, mode: "hosted" }), "hosted");
    expect(runner).toMatchObject({ verdict: "FAIL", codes: ["STORY_DAILY_CEILING_INSUFFICIENT"] });
    expect(api).toMatchObject({ verdict: "FAIL", codes: ["STORY_DAILY_CEILING_INSUFFICIENT"] });
    // Local mode has no money to bound: the same change passes there (no envelope is composed).
    const local = await checkBoth(await publishFromSite(change), "local");
    expect([local.runner.codes, local.api.codes]).toEqual([[], []]);
  });

  it("(e) a stale mapContractHash without a shape row: the runner half FAILs (plan D5), though the boot readers never read it", async () => {
    const version = await publishFromSite({ replace: { mapContractHash: "0".repeat(64) } });
    const { runner, api } = await checkBoth(version, "local");
    expect(runner).toMatchObject({ verdict: "FAIL", codes: ["MAP_CONTRACT_HASH_MISMATCH"] });
    expect(api).toMatchObject({ verdict: "PASS", codes: [] });
  });

  it("(f) no engineContractHash row: SETTINGS_HASH_UNDECLARED:engineContractHash", async () => {
    const version = await publishFromSite({ drop: ["engineContractHash"] });
    const { runner } = await checkBoth(version, "local");
    expect(runner).toMatchObject({ verdict: "FAIL", codes: ["SETTINGS_HASH_UNDECLARED:engineContractHash"] });
  });

  it("(g) a synthesizer role ref this release does not declare: SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:<ref>, beside the loader's own refusal", async () => {
    const ref = "development:never-declared-cli";
    const current = await siteRowValue("synthesizerRoleRef") as Record<string, unknown>;
    const version = await publishFromSite({ replace: { synthesizerRoleRef: { ...current, providerRef: ref } } });
    const { runner, api } = await checkBoth(version, "local");
    // The runner names the env change (condition 3) beside its claim gate's own refusal (the synthesizer has no provider
    // in this release); the API half seats no synthesizer off the preview, so its own boot has nothing to refuse.
    expect({ runner: runner.codes, api: api.codes }).toEqual({
      runner: [`SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:${ref}`, "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED"],
      api: []
    });
  });

  it("several problems in one version are listed together; an unknown version is refused by kind", async () => {
    const session = await siteRowValue("sessionPolicy") as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(session).map(([member, value]) =>
      [member, typeof value === "number" && Number.isSafeInteger(value) ? value + 2 : value]));
    const version = await publishFromSite({ replace: { sessionPolicy: changed, mapContractHash: "1".repeat(64) }, drop: ["engineContractHash"] });
    const { runner, api } = await checkBoth(version, "local");
    expect(runner.codes).toEqual(["MAP_CONTRACT_HASH_MISMATCH", "SETTINGS_HASH_UNDECLARED:engineContractHash"]);
    expect(api.codes).toEqual(["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"]);
    // An unknown version is a finding of both halves (one code), never a failure to check it.
    const unknown = await checkBoth(999999, "local");
    for (const report of [unknown.runner, unknown.api]) {
      expect(report).toMatchObject({ verdict: "FAIL", codes: ["SETTINGS_VERSION_KIND_INVALID"], snapshotSha256: null, version: 999999 });
    }
  });
});

/**
 * SA10 (addition D19-D20): check-version on the PREVIEW's line-up, over a second real database holding a register built
 * the way the live preview's is (history v4, then the publish kit v2 with the plan's `lineUp`, so its site version
 * carries the previewLineUpPolicy row), checked under the sockets-only server setting (addition D14-D15) and the
 * reviewed targets. Both halves run on read-only pools under their runtime roles, as above.
 */
describe("check-version on the preview's line-up (SA10, addition D19-D20)", () => {
  const GLM = "zai-org/GLM-5.3-Flash", DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash", MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
  const QWEN = "Qwen/Qwen3.8-Flash", HAIKU = "claude-haiku-5-5";
  const OBSERVATION = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
    operatorSha256: "c".repeat(64), observedAt: "2026-10-22T08:00:00.000Z" };
  /** The site version's line-up (today's live values, the kit's plan `lineUp`, addition D23). */
  const SITE_LINE_UP = parsePreviewLineUp({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: null });
  const SOCKETS_ONLY = parsePreviewEnvironmentConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    scope_id: "settings-check-preview" }))!;
  const CLAIM_MS = 2 * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + PREVIEW_GLM_DEADLINE_MS) + PREVIEW_GLM_DEADLINE_MS + 60000;
  const targetsOf = (refs: readonly string[]) => JSON.stringify(refs.map((ref) => previewTargetJsonRow(ref)));
  const ALL_TARGETS = targetsOf(PREVIEW_REVIEWED_PROVIDER_REFS);
  /** The reviewed DeepInfra set alone (a valid preview target set: every DeepInfra ref, no Anthropic one). */
  const DEEPINFRA_REFS = PREVIEW_REVIEWED_PROVIDER_REFS.filter((ref) => previewModelRow(previewTargetJsonRow(ref).model as string)!.provider === "deepinfra");
  const DEEPINFRA_TARGETS = targetsOf(DEEPINFRA_REFS);
  let preview: TestDatabase;
  let previewRunnerPool: Pool;
  let previewApiPool: Pool;
  let PREVIEW_SITE = 0;

  beforeAll(async () => {
    preview = await startTestDatabase();
    await migrate(preview.pool);
    const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), OBSERVATION, undefined, "on", null, null, null, null, null, SITE_LINE_UP)];
    const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
      .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
    const base = [...source.filter((row) => !["consumerRecoveryPolicy", "publicationCheckPolicy", "taxAuthorities", "answerRoleRotationPolicy"]
      .includes(row.rowKey)), ...owned];
    await createPostgresRegisterPublicationPort(preview.pool).importHistorical({ registerVersion: parseRegisterVersionText("4"), rows: base });
    const v4 = await readSealedSnapshot(preview.pool, "4");
    const snapshot = composePreviewSnapshotV2({ sourceRows: source, baseRows: v4.rows, baseRegisterVersion: "4", baseSnapshotSha256: v4.snapshotSha256 });
    const receipt = await publishPreviewRegisterV2(preview.pool, { publicationId: randomUUID(), sourceRef: "settings-check preview fixture", snapshot,
      approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256,
        snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } });
    PREVIEW_SITE = registerVersionToSafeLegacyNumber(parseRegisterVersionText(String(receipt.registerVersion)));
    previewRunnerPool = readOnlyPool("debateai_runtime", "test:check-runner-preview", preview);
    previewApiPool = readOnlyPool("debateai_billing_runtime", "test:check-api-preview", preview);
  }, 600_000);

  afterAll(async () => {
    await Promise.allSettled([previewRunnerPool?.end(), previewApiPool?.end()]);
    await preview?.stop();
  });

  /** A release on the preview: its site version (the preview's own by default) and its key. */
  async function checkPreview(version: number, targets = ALL_TARGETS, site = PREVIEW_SITE): Promise<Readonly<{ runner: SettingsCheckReport; api: SettingsCheckReport }>> {
    const common = { REGISTER_VERSION: site, RELEASE_KEY: [`r${site}`, "0123456789ab"].join("-"), DEPLOYMENT_MODE: "local" as const, NODE_ENV: "test",
      PROVIDER_DISCOVERY_TARGETS_JSON: targets, PREVIEW_GATE_SETTINGS: SOCKETS_ONLY.gate, PREVIEW_ENV_LINE_UP: SOCKETS_ONLY.envLineUp };
    const runner = await checkRunnerSettingsVersion({ pool: previewRunnerPool, environment: { ...common, CLAIM_MS, CLAIM_MARGIN_MS: 60000 }, version });
    const api = await checkAdmissionSettingsVersion({ pool: previewApiPool, environment: common, version });
    return Object.freeze({ runner, api });
  }
  /**
   * A new GENERAL version from a preview version (its site version by default) with some rows' values replaced (each
   * row's source reference kept): `change` maps a row key to its new value, from its current one.
   */
  async function publishFromPreview(change: Readonly<Record<string, (current: unknown) => unknown>>, from = PREVIEW_SITE): Promise<number> {
    const base = parseRegisterVersionText(String(from));
    const rows = new Map((await readCompleteRegisterFixtureRows(preview.pool, base)).map((row) => [row.rowKey, row] as const));
    for (const [rowKey, next] of Object.entries(change)) {
      const current = rows.get(rowKey);
      expect(current, rowKey).toBeDefined();
      rows.set(rowKey, registerFixtureRow(rowKey, next(JSON.parse(current!.valueJsonText)), current!.sourceRef));
    }
    const receipt = await publishRegisterFixture(preview.pool, {
      publicationId: randomUUID(), baseRegisterVersion: base, rows: Object.freeze([...rows.values()]), sourceRef: SOURCE_REF
    });
    return registerVersionToSafeLegacyNumber(receipt.registerVersion);
  }
  const NEW_LINE_UP = { kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: [QWEN, GLM], premium_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU],
    thinking_levels: { [QWEN]: { level: "low", steps: { judge_panel: "medium" } }, [GLM]: { level: "high" } } };

  it("the preview's own site version: both halves PASS under the sockets-only setting (its row is the line-up)", async () => {
    const { runner, api } = await checkPreview(PREVIEW_SITE);
    expect({ runner: runner.codes, api: api.codes }).toEqual({ runner: [], api: [] });
  });

  it("(h) a version with a valid new line-up and thinking table: both halves PASS", async () => {
    const version = await publishFromPreview({ previewLineUpPolicy: () => NEW_LINE_UP });
    const { runner, api } = await checkPreview(version);
    expect([runner.verdict, runner.codes, api.verdict, api.codes]).toEqual(["PASS", [], "PASS", []]);
    expect(runner.snapshotSha256).toBe(api.snapshotSha256);
  });

  it("(i) Qwen at \"high\" cannot even be published: the row parser refuses it (so the check meets it only from an older, wider code)", () => {
    expect(() => previewLineUpPolicyFromValue({ ...NEW_LINE_UP, thinking_levels: { [QWEN]: { level: "high" } } })).toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });

  it("(j) a roster naming a model no declared target serves: SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model> from both halves", async () => {
    // A release that reaches DeepInfra only: its site version configures (and its env declares) the DeepInfra refs alone
    // (the declared set must equal the configured one); the candidate, published from it, seats Claude Haiku on Premium.
    const deepinfraSite = await publishFromPreview({ configuredProviderSet: (current) => {
      const set = current as { providers: { providerRef: string }[] };
      return { ...set, providers: set.providers.filter((provider) => DEEPINFRA_REFS.includes(provider.providerRef)) };
    } });
    const version = await publishFromPreview({ previewLineUpPolicy: () => NEW_LINE_UP }, deepinfraSite);
    const { runner, api } = await checkPreview(version, DEEPINFRA_TARGETS, deepinfraSite);
    // Each half names the model (condition 3, against its own targets), beside its boot's own refusal of the same roster
    // (the served half of the target check, a code without detail).
    for (const report of [runner, api]) {
      expect(report).toMatchObject({ verdict: "FAIL", codes: ["PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID", `SETTINGS_NEEDS_ENV_CHANGE:TARGET:${HAIKU}`] });
    }
    // The same candidate under a release that reaches Anthropic too passes (h): only the environment differs.
  });
});
