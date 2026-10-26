import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { PostgresModelSpendStore } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunWaitRepository, createPool, migrate } from "@debateai/db";
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
  registerVersionToSafeLegacyNumber,
  settingsCheckReport,
  type SettingsCheckReport
} from "../../packages/register/src/index.js";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { DEVELOPMENT_RUN_DEATH_POLICY, seedDevelopmentDeploymentRegister } from "../../apps/runner/src/dev-deployment-register.js";
import { checkRunnerSettingsVersion, type RunnerCheckEnvironment } from "../../apps/runner/src/settings-check.js";
import { checkAdmissionSettingsVersion, type ApiCheckEnvironment } from "../../apps/api/src/settings-check.js";
import { readActiveSettingsVersionOn } from "../../apps/api/src/active-settings-version.js";
import type { AdmissionRunMembers } from "../../apps/api/src/admission-settings.js";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import type { ActiveVersionAlarm } from "../../apps/api/src/admission-alarm.js";
import {
  SettingsOperatorRefusal,
  activateSettingsVersion,
  assertSettingsGatesServe,
  readSettingsStatus,
  recordSettingsVerdict,
  settingsForSwitch,
  settingsVerdictOf,
  siteVersionOfRelease,
  type ActivationReaders,
  type GateEnabledModels,
  type SettingsOperatorClient,
  type SettingsSeatableEnvironment,
  type SettingsStatus
} from "../../tools/settings-version/settings-operator.js";
import {
  publishRegisterFixture,
  publishReplacementRegisterFixture,
  readCompleteRegisterFixtureRows,
  registerFixtureRow
} from "../support/registerFixtures.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §13 Testing (plan 2026-10-21-side-by-side-S-settings Task S19, the OPERATOR/API half; the runner half
 * is tests/integration/settings-per-debate.test.ts): per-debate settings end to end on migration 0124's real tables, the
 * real check-version halves (S14), the real operator module (S15, tools/settings-version/settings-operator.ts), the
 * release switch's exact SQL text (deploy/preview-lifecycle/v1/release-table.mjs releaseSwitchSql, ruling R12) and the
 * real ask path with its room and waker (S11, S13). No AI call anywhere; scripted members and estimators only.
 *
 *  - Case 4, activation refused by each condition of spec §13 "Activation is refused unless": conditions 2-5 on a HOSTED
 *    development release (condition 4, money, exists only hosted), condition 6 on a PREVIEW release (the gates exist
 *    only there): each broken version gets a FAIL verdict from both real halves and `activateSettingsVersion` refuses
 *    SETTINGS_VERSION_NOT_PASSED with nothing moved; condition 1 (no verdict at all) the same; condition 6's live half
 *    through the operator's PRODUCTION reader with gate answers that lack a seatable model. Controls: each release's
 *    own site version and a clean candidate pass both halves, and the clean candidate is activated.
 *  - Case 5, an activation racing a release switch (two connections, three orders, deterministic: no sleeps): exactly one
 *    commits, and the current release has then passed the active version.
 *  - Case 6, the admission re-check: an ask decided on S+1 whose (release, S+1) verdict turns FAIL between the version
 *    read and the room's decision waits SWITCHING, uncharged; a tick while the pair still fails starts nothing; once the
 *    owner re-activates S the next tick re-admits it on S.
 *  - Case 7, re-admission only at START: a run stamped S waits through two closed-room ticks untouched after S+1 is
 *    activated; the first open tick re-admits it on S+1; one line row for the person throughout.
 *  - Extra (S13 review, ruling R11): a current release that has not passed the active version holds every START.
 *  - Extra (SA10 review, addition D21): the operator's production reader reads a candidate's own previewLineUpPolicy row.
 *  - Final fix wave F2a (ruling R77): the operator refuses to record a FAIL for the (current release, active version)
 *    pair; a FAIL of any other version records.
 *
 * Two embedded databases, because a release's site version is one register: the development register (local panel,
 * declared hosted) for conditions 1-5 and cases 5-7, and a register built the way the live preview's is (history v4,
 * then publish kit v2 with the plan's `lineUp`) for condition 6 and the SA10 extra; settings-check-version.test.ts
 * splits the same way. A preview register cannot carry the development panel's role refs, and the development register
 * has no gates. CI skips tests/integration: run it alone (run-clean.sh, one heavy command at a time).
 */

const SOURCE_REF = "fixture:settings-per-debate-ops";
const BY = "test:settings-per-debate-ops";
/** Release keys are built from pieces (the secret scanner reads r<n>-<12 hex> as a key). */
const keyOf = (site: number, hex: string): string => [`r${String(site)}`, hex.repeat(12 / hex.length)].join("-");
/**
 * Off the preview, condition 6 holds trivially (spec §13: "preview only; on the public server this holds trivially"):
 * the development release seats no gated model, so its activations read an empty seatable set. The production reader
 * (ACTIVATION_READERS, the default) is exercised on the preview release below.
 */
const OFF_PREVIEW_READERS: ActivationReaders = Object.freeze({
  readGateModels: async () => Object.freeze({ models: Object.freeze([]), unreviewed: Object.freeze([]) })
});
const OFF_PREVIEW_ENV: SettingsSeatableEnvironment = Object.freeze({ envLineUp: null, declaredModels: Object.freeze(["off-preview"]) });
const SNAPSHOT = "e".repeat(64);

/** A house pool on a test database, read-only in every transaction, as `role` (the halves' own runtime roles, S14). */
function readOnlyPool(on: TestDatabase, role: string, name: string): Pool {
  const options = encodeURIComponent(`-c default_transaction_read_only=on -c role=${role}`);
  const separator = on.connectionString.includes("?") ? "&" : "?";
  return createPool(`${on.connectionString}${separator}options=${options}`, { max: 2, connectionTimeoutMillis: 5000, name });
}

async function withClient<T>(on: TestDatabase, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await on.pool.connect();
  let clean = false;
  try { const value = await work(client); clean = true; return value; } finally { client.release(!clean); }
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the call succeeded");
}

const statusOf = (on: TestDatabase): Promise<SettingsStatus> => withClient(on, (client) => readSettingsStatus(client));

const loadReleaseTable = async () => import("../../deploy/" + "preview-lifecycle/v1/release-table.mjs") as Promise<{
  releaseSwitchSql: (input: { activation: boolean }) => string;
}>;

/**
 * The release switch exactly as the preview sends it to psql (release-table.mjs, ruling R12), its `:'name'` variables
 * quoted by the driver (what psql's `:'name'` produces), one simple-protocol query, ROLLBACK after an error (psql's
 * ON_ERROR_STOP=1 closes the session, which rolls back the same way). Resolves the printed values, or rejects.
 */
async function runSwitchText(on: TestDatabase, variables: Record<string, string>, activation: boolean): Promise<string[]> {
  const { releaseSwitchSql } = await loadReleaseTable();
  return withClient(on, async (client) => {
    const text = releaseSwitchSql({ activation }).replace(/:'([a-z_]+)'/gu, (_, name: string) => {
      if (!Object.hasOwn(variables, name)) throw new Error(`variable ${name} missing`);
      return client.escapeLiteral(variables[name]!);
    });
    try {
      const results = await client.query(text) as unknown as { command: string; rows: Record<string, unknown>[] }[];
      return results.filter((one) => one.command === "SELECT").map((one) => String(Object.values(one.rows[0]!)[0]));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}
const switchVariables = (newKey: string, expectedCurrent: string | null, expectedActive: number | null, activate?: number): Record<string, string> => ({
  new_key: newKey, expected_current: expectedCurrent ?? "", seconds: "0", recorded_by: "root:release-switch",
  expected_active: expectedActive === null ? "" : String(expectedActive),
  ...(activate === undefined ? {} : { activate: String(activate), activated_by: "root release-switch", activation_reason: `release switch to ${newKey}` })
});
const stage = (on: TestDatabase, key: string) => on.pool.query("SELECT core.record_release_event($1, 'STAGED', $2, NULL)", [key, BY]);

/** 0123 refuses a switch while an earlier release still drains (RELEASE_SWITCH_CONFLICT): the drained ones retire first. */
async function retireDrained(on: TestDatabase): Promise<void> {
  const draining = await on.pool.query<{ release_key: string }>("SELECT release_key FROM core.release_state_v WHERE state = 'DRAINING'");
  for (const { release_key: drained } of draining.rows) {
    await on.pool.query("SELECT core.record_release_event($1, 'RETIRED', $2, NULL)", [drained, BY]);
  }
}

/**
 * Makes `key` current the way the owner's switch does (S15): the operator's switch plan (`settingsForSwitch`, asked to
 * activate the new release's own site version, which every release passes: D1, owner answer Q-S2), then the switch text.
 */
async function makeCurrent(on: TestDatabase, key: string): Promise<void> {
  await retireDrained(on);
  const before = await statusOf(on);
  const plan = await withClient(on, (client) => settingsForSwitch(client, { newRelease: key, activate: siteVersionOfRelease(key)! }));
  await stage(on, key);
  await runSwitchText(on, switchVariables(key, before.currentRelease, plan.expectedActiveSettings, plan.activate ?? undefined), plan.activate !== null);
  expect((await statusOf(on)).currentRelease).toBe(key);
}

/** A verdict from two synthetic half reports (cases 5-7: the verdict row is the input there, not the check). */
const syntheticVerdict = (key: string, version: number, codes: string[] = []) => settingsVerdictOf(
  settingsCheckReport({ half: "runner", releaseKey: key, version, codes, snapshotSha256: SNAPSHOT }),
  settingsCheckReport({ half: "api", releaseKey: key, version, codes: [], snapshotSha256: SNAPSHOT })
);
const pass = (on: TestDatabase, key: string, version: number) => withClient(on, (client) => recordSettingsVerdict(client, syntheticVerdict(key, version)));
/**
 * A FAIL verdict for (key, version), written straight through 0124's writer (`register.record_settings_verdict`), as a
 * hand-run psql could. Ruling R77 (final fix wave F2a): the operator never records a FAIL for the (current release, active
 * version) pair (the last case of this block); cases 6 and the S13 extra still prove how the API holds asks if that state
 * exists anyway, so they write it beside the operator.
 */
const fail = (on: TestDatabase, key: string, version: number) => on.pool.query(
  "SELECT register.record_settings_verdict($1::text, $2::bigint, 'FAIL', $3::text)",
  [key, version, syntheticVerdict(key, version, ["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"]).digest]);
/** The owner's activation off the preview (condition 6 trivially true there). */
const activateOffPreview = (on: TestDatabase, version: number, client?: SettingsOperatorClient) => {
  const run = (target: SettingsOperatorClient) => activateSettingsVersion(target, {
    version, activatedBy: "owner", reason: `activate ${String(version)}`, gateEnabledModels: {}, seatableEnvironment: OFF_PREVIEW_ENV
  }, OFF_PREVIEW_READERS);
  return client === undefined ? withClient(on, run) : run(client);
};
const activationRows = async (on: TestDatabase): Promise<number> =>
  (await on.pool.query<{ n: number }>("SELECT count(*)::integer AS n FROM register.settings_activation")).rows[0]!.n;

// =====================================================================================================================
// Database 1: the development register, declared HOSTED (conditions 1-5, cases 5-7, the S13 extra).
// =====================================================================================================================

let dev: TestDatabase;
/** The development register as seeded (local), and the hosted release's site version built from it. */
let DEV_SITE = 0;
let HOSTED_SITE = 0;
let H = "";
let devRunnerPool: Pool;
let devApiPool: Pool;

async function devSiteRowValue(rowKey: string): Promise<unknown> {
  const rows = await readCompleteRegisterFixtureRows(dev.pool, parseRegisterVersionText(String(HOSTED_SITE)));
  const row = rows.find((candidate) => candidate.rowKey === rowKey);
  if (row === undefined) throw new Error(`SITE_ROW_ABSENT:${rowKey}`);
  return JSON.parse(row.valueJsonText) as unknown;
}

/** A new GENERAL version from a development version (the hosted site by default), rows replaced, added or dropped. */
async function publishFromDev(change: Readonly<{
  replace?: Readonly<Record<string, unknown>>; add?: Readonly<Record<string, unknown>>; drop?: readonly string[]; base?: number;
}>): Promise<number> {
  const base = parseRegisterVersionText(String(change.base ?? HOSTED_SITE));
  const rows = new Map((await readCompleteRegisterFixtureRows(dev.pool, base)).map((row) => [row.rowKey, row] as const));
  for (const rowKey of change.drop ?? []) expect(rows.delete(rowKey), rowKey).toBe(true);
  // A replaced row keeps its source reference: the development runner policy's reader checks its rows' provenance.
  for (const [rowKey, value] of Object.entries(change.replace ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(true);
    rows.set(rowKey, registerFixtureRow(rowKey, value, rows.get(rowKey)!.sourceRef));
  }
  for (const [rowKey, value] of Object.entries(change.add ?? {})) {
    expect(rows.has(rowKey), rowKey).toBe(false);
    rows.set(rowKey, registerFixtureRow(rowKey, value, SOURCE_REF));
  }
  const receipt = await publishRegisterFixture(dev.pool, {
    publicationId: randomUUID(), baseRegisterVersion: base, rows: Object.freeze([...rows.values()]), sourceRef: SOURCE_REF
  });
  return registerVersionToSafeLegacyNumber(receipt.registerVersion);
}

/** A sealed GENERAL version that differs from the hosted site by one probe row (cases 5-7: any sealed version will do). */
async function probeVersion(marker: string): Promise<number> {
  return registerVersionToSafeLegacyNumber((await publishReplacementRegisterFixture(dev.pool, parseRegisterVersionText(String(HOSTED_SITE)),
    [registerFixtureRow("settingsPerDebateOpsProbe", marker, SOURCE_REF)], `${SOURCE_REF}:${marker}`)).registerVersion);
}

/** The development panel's configured providers as a HOSTED release declares them: https vendors, a credential file, a price. */
function hostedTargets(): string {
  const rows = JSON.parse(TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
  return JSON.stringify(rows.map((row, index) => {
    const { authorization_header: _inline, ...rest } = row;
    return {
      ...rest,
      base_url: `https://vendor-${String(index)}.example/v1`,
      authorization_file: `/etc/debateai/providers/vendor-${String(index)}.key`,
      input_price_micros_per_million: 1,
      output_price_micros_per_million: 1
    };
  }));
}

/** Both halves of check-version for the hosted release H (its own runner and API env, hosted, no preview overlay). */
async function checkHosted(version: number): Promise<Readonly<{ runner: SettingsCheckReport; api: SettingsCheckReport }>> {
  const common = { REGISTER_VERSION: HOSTED_SITE, RELEASE_KEY: H, DEPLOYMENT_MODE: "hosted" as const, NODE_ENV: "test",
    PROVIDER_DISCOVERY_TARGETS_JSON: hostedTargets(), PREVIEW_GATE_SETTINGS: undefined, PREVIEW_ENV_LINE_UP: undefined };
  const runnerEnvironment: RunnerCheckEnvironment = Object.freeze({ ...common, CLAIM_MS: 7200000, CLAIM_MARGIN_MS: 1000 });
  const apiEnvironment: ApiCheckEnvironment = Object.freeze({ ...common });
  const runner = await checkRunnerSettingsVersion({ pool: devRunnerPool, environment: runnerEnvironment, version });
  const api = await checkAdmissionSettingsVersion({ pool: devApiPool, environment: apiEnvironment, version });
  return Object.freeze({ runner, api });
}

/**
 * Case 4's shape for one broken version: both real halves, their codes exactly as expected, the verdict FAIL (recorded
 * through the operator), and the activation refused SETTINGS_VERSION_NOT_PASSED with nothing moved (the pointer, the
 * current release and the activation log as they were).
 */
async function expectRefusedByCondition(on: TestDatabase, version: number, halves: Readonly<{ runner: SettingsCheckReport; api: SettingsCheckReport }>,
  expected: Readonly<{ runner: readonly string[]; api: readonly string[] }>, activate: (version: number) => Promise<unknown>): Promise<void> {
  expect({ runner: halves.runner.codes, api: halves.api.codes }).toEqual(expected);
  const verdict = settingsVerdictOf(halves.runner, halves.api);
  expect(verdict).toMatchObject({ verdict: "FAIL", version });
  await withClient(on, (client) => recordSettingsVerdict(client, verdict));
  const before = await statusOf(on);
  const rows = await activationRows(on);
  const refused = await refusal(activate(version));
  expect(refused).toBeInstanceOf(SettingsOperatorRefusal);
  expect((refused as SettingsOperatorRefusal).code).toBe("SETTINGS_VERSION_NOT_PASSED");
  expect((refused as SettingsOperatorRefusal).passed).not.toContain(version);
  expect(await statusOf(on)).toEqual(before);
  expect(await activationRows(on)).toBe(rows);
}

beforeAll(async () => {
  dev = await startTestDatabase();
  await migrate(dev.pool);
  // The seeder writes its receipt under a repository root: a fresh folder in this run's own temp folder.
  const repositoryRoot = await mkdtemp(join(tmpdir(), "settings-per-debate-ops-"));
  await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  const receipt = await seedDevelopmentDeploymentRegister({ adminPool: dev.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot });
  DEV_SITE = registerVersionToSafeLegacyNumber(parseRegisterVersionText(receipt.registerVersion));
  // A hosted API with the band also needs admissionPolicy's ask_room_reads (paid plans P4-G), as settings-check-version builds it.
  const admission = JSON.parse((await readCompleteRegisterFixtureRows(dev.pool, parseRegisterVersionText(String(DEV_SITE))))
    .find((row) => row.rowKey === "admissionPolicy")!.valueJsonText) as Record<string, unknown>;
  HOSTED_SITE = await publishFromDev({ base: DEV_SITE, replace: { admissionPolicy: {
    ...admission, ask_room_reads: { key: "owner", limit: 120, window_ms: 60000, capacity: 120 }
  } } });
  H = keyOf(HOSTED_SITE, "0123456789ab");
  devRunnerPool = readOnlyPool(dev, "debateai_runtime", "test:s19-ops-runner");
  devApiPool = readOnlyPool(dev, "debateai_billing_runtime", "test:s19-ops-api");
  await makeCurrent(dev, H);
}, 600_000);

afterAll(async () => {
  await Promise.allSettled([devRunnerPool?.end(), devApiPool?.end()]);
  await dev?.stop();
});

describe("case 4 (side-by-side §13 Testing): activation is refused by each condition — the hosted development release", () => {
  const activateOnDev = (version: number) => activateOffPreview(dev, version);

  it("control: the release's own site version passes both halves; it is current and active (the first switch, Q-S2)", async () => {
    const { runner, api } = await checkHosted(HOSTED_SITE);
    expect([runner.verdict, runner.codes, api.verdict, api.codes]).toEqual(["PASS", [], "PASS", []]);
    expect(await statusOf(dev)).toEqual({ currentRelease: H, pointer: HOSTED_SITE, effectiveActive: HOSTED_SITE, passed: [HOSTED_SITE] });
  });

  it("condition 1 without any verdict: refused SETTINGS_VERSION_NOT_PASSED; control: the same clean version, checked PASS, is activated", async () => {
    const envelope = await devSiteRowValue("costEnvelopePolicy") as Record<string, number>;
    const clean = await publishFromDev({ replace: { costEnvelopePolicy: { ...envelope, per_run_ceiling_micros: envelope.per_run_ceiling_micros! + 50000 } } });
    const before = await statusOf(dev);
    const rows = await activationRows(dev);
    const refused = await refusal(activateOnDev(clean));
    expect([(refused as SettingsOperatorRefusal).code, (refused as SettingsOperatorRefusal).passed]).toEqual(["SETTINGS_VERSION_NOT_PASSED", [HOSTED_SITE]]);
    expect(await statusOf(dev)).toEqual(before);
    expect(await activationRows(dev)).toBe(rows);
    // Control: both halves PASS, the verdict is recorded, and the activation is accepted.
    const { runner, api } = await checkHosted(clean);
    expect([runner.verdict, runner.codes, api.verdict, api.codes]).toEqual(["PASS", [], "PASS", []]);
    await withClient(dev, (client) => recordSettingsVerdict(client, settingsVerdictOf(runner, api)));
    const done = await activateOnDev(clean);
    expect([done.previous, done.releaseKey]).toEqual([before.pointer, H]);
    expect(await statusOf(dev)).toEqual({ currentRelease: H, pointer: clean, effectiveActive: clean, passed: [HOSTED_SITE, clean] });
  });

  it("condition 2 (site settings differ from the release's site version): SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy, then refused", async () => {
    const session = await devSiteRowValue("sessionPolicy") as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(session).map(([member, value]) =>
      [member, typeof value === "number" && Number.isSafeInteger(value) ? value + 1 : value]));
    expect(changed).not.toEqual(session);
    const version = await publishFromDev({ replace: { sessionPolicy: changed } });
    await expectRefusedByCondition(dev, version, await checkHosted(version),
      { runner: [], api: ["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"] }, activateOnDev);
  });

  it("condition 3 (needs an env change): a synthesizer ref this release does not declare, then refused", async () => {
    const ref = "development:never-declared-cli";
    const current = await devSiteRowValue("synthesizerRoleRef") as Record<string, unknown>;
    const version = await publishFromDev({ replace: { synthesizerRoleRef: { ...current, providerRef: ref } } });
    // The runner names the env change beside its claim gate's own refusal of the same cause (no declared provider serves
    // the synthesizer): both are condition 3's; the API half seats no synthesizer off the preview.
    await expectRefusedByCondition(dev, version, await checkHosted(version),
      { runner: [`SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:${ref}`, "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED"], api: [] }, activateOnDev);
  });

  it("condition 4 (the site's day holds one debate but not one debate plus its story): STORY_DAILY_CEILING_INSUFFICIENT from both halves, then refused", async () => {
    const envelope = await devSiteRowValue("costEnvelopePolicy") as Record<string, number>;
    const story = { kind: "STORY_COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1000000,
      per_story_ceiling_micros: 50000, per_story_overrun_basis_points: 2000, provisional: true,
      provisional_reason: "fixture: the story's cap beside a raised per-run ceiling" };
    // The largest per-run ceiling the row accepts beside the site's own day (settings-check-version's (d) recipe): the
    // day then holds one run, not one run and its story.
    let perRun = envelope.daily_ceiling_micros!;
    const rowAccepts = (value: number): boolean => {
      try { costEnvelopePolicyFromValue({ ...envelope, per_run_ceiling_micros: value }, SOURCE_REF); return true; } catch { return false; }
    };
    while (!rowAccepts(perRun)) perRun -= 1000;
    expect(perRun).toBeGreaterThan(envelope.per_run_ceiling_micros!);
    const version = await publishFromDev({ replace: { costEnvelopePolicy: { ...envelope, per_run_ceiling_micros: perRun } }, add: { storyCostEnvelopePolicy: story } });
    await expectRefusedByCondition(dev, version, await checkHosted(version),
      { runner: ["STORY_DAILY_CEILING_INSUFFICIENT"], api: ["STORY_DAILY_CEILING_INSUFFICIENT"] }, activateOnDev);
  });

  it("condition 5 (hashes always declared): no engineContractHash row is SETTINGS_HASH_UNDECLARED:engineContractHash, then refused", async () => {
    const version = await publishFromDev({ drop: ["engineContractHash"] });
    await expectRefusedByCondition(dev, version, await checkHosted(version),
      { runner: ["SETTINGS_HASH_UNDECLARED:engineContractHash"], api: [] }, activateOnDev);
  });
});

// =====================================================================================================================
// Case 5: an activation racing a release switch (same database 1; its own releases A1..B3 and versions V1, V2).
// =====================================================================================================================

describe("case 5 (side-by-side §13 \"Switches and activations never interleave\"): an activation racing a switch, two connections", () => {
  let V1 = 0;
  let V2 = 0;

  beforeAll(async () => {
    V1 = await probeVersion("race-v1");
    V2 = await probeVersion("race-v2");
  });

  /**
   * Release `a` current with the pointer at V1 (a passed V1 and V2: the owner is about to activate V2); release `b`
   * staged, having passed V1 only (the switch "B passed V1"). Fresh releases per order: the tables are append-only.
   */
  async function raceSetup(a: string, b: string): Promise<void> {
    await makeCurrent(dev, a);
    await pass(dev, a, V1);
    await pass(dev, a, V2);
    await activateOffPreview(dev, V1);
    await stage(dev, b);
    await pass(dev, b, V1);
    await retireDrained(dev);
    expect(await statusOf(dev)).toMatchObject({ currentRelease: a, pointer: V1 });
    expect(await withClient(dev, (client) => settingsForSwitch(client, { newRelease: b }))).toEqual({ expectedActiveSettings: V1, activate: null });
  }

  /** A connection whose statements pass through, with `before` run once just before the first statement matching `at`. */
  function interleaved(client: PoolClient, at: RegExp, before: () => Promise<void>): SettingsOperatorClient {
    let fired = false;
    const query = (async (...args: unknown[]) => {
      if (!fired && typeof args[0] === "string" && at.test(args[0])) {
        fired = true;
        await before();
      }
      return (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as unknown as PoolClient["query"];
    return { query };
  }

  /** Afterwards the current release has passed the effective active version (spec §13: no new debate could otherwise start). */
  async function expectPassedActive(expected: Readonly<{ currentRelease: string; pointer: number }>): Promise<void> {
    const status = await statusOf(dev);
    expect(status).toMatchObject({ ...expected, effectiveActive: expected.pointer });
    expect(status.passed).toContain(status.effectiveActive);
  }

  it("order 1: the activation read A and V1, then the switch to B committed: the activation is refused SETTINGS_ACTIVATION_CONFLICT; B stands on V1", async () => {
    const a = keyOf(HOSTED_SITE, "a1"), b = keyOf(HOSTED_SITE, "b1");
    await raceSetup(a, b);
    const rows = await activationRows(dev);
    let switched: string[] = [];
    const refused = await refusal(withClient(dev, (client) => activateOffPreview(dev, V2,
      // The activation has read the current release (a) and the pointer (V1); before its transaction begins, the switch
      // commits on another connection (the hook's expected pointer V1 is still true, and B passed V1).
      interleaved(client, /^BEGIN ISOLATION LEVEL READ COMMITTED/u, async () => { switched = await runSwitchText(dev, switchVariables(b, a, V1), false); }))));
    expect(switched).toHaveLength(1);
    expect((refused as SettingsOperatorRefusal).code).toBe("SETTINGS_ACTIVATION_CONFLICT");
    expect(await activationRows(dev)).toBe(rows);
    await expectPassedActive({ currentRelease: b, pointer: V1 });
  });

  it("order 2: the switch planned on V1, then the activation of V2 committed: the switch's compare-and-swap refuses it; A stands on V2", async () => {
    const a = keyOf(HOSTED_SITE, "a2"), b = keyOf(HOSTED_SITE, "b2");
    await raceSetup(a, b);
    const plan = await withClient(dev, (client) => settingsForSwitch(client, { newRelease: b }));
    const done = await activateOffPreview(dev, V2);
    expect([done.previous, done.releaseKey]).toEqual([V1, a]);
    const refused = await refusal(runSwitchText(dev, switchVariables(b, a, plan.expectedActiveSettings), plan.activate !== null));
    expect((refused as Error).message).toBe("SETTINGS_ACTIVATION_CONFLICT");
    await expectPassedActive({ currentRelease: a, pointer: V2 });
  });

  it("order 3, the shared lock held: the activation holds the switch lock uncommitted while the switch waits on it; on COMMIT the switch is refused", async () => {
    const a = keyOf(HOSTED_SITE, "a3"), b = keyOf(HOSTED_SITE, "b3");
    await raceSetup(a, b);
    let waitingSwitch: Promise<unknown> | undefined;
    const done = await withClient(dev, (client) => activateOffPreview(dev, V2, interleaved(client, /^COMMIT/u, async () => {
      // The activation's transaction holds 0124's advisory lock (register.activate_settings_version took it) and its new
      // row; the switch starts on its own connection and must wait for that lock: proved by pg_locks, not by a sleep.
      waitingSwitch = runSwitchText(dev, switchVariables(b, a, V1), false).then(() => "COMMITTED", (error: unknown) => error);
      for (let polls = 0; ; polls += 1) {
        const waiting = (await dev.pool.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted")).rows[0]!.n;
        if (waiting > 0) break;
        if (polls > 2000) throw new Error("the switch never waited on the shared lock");
        await new Promise((resolve) => setImmediate(resolve));
      }
    })));
    expect([done.previous, done.releaseKey]).toEqual([V1, a]);
    const switched = await waitingSwitch;
    expect((switched as Error).message).toBe("SETTINGS_ACTIVATION_CONFLICT");
    await expectPassedActive({ currentRelease: a, pointer: V2 });
  });
});

// =====================================================================================================================
// Cases 6, 7 and the S13 extra: the API's admission and its waker on database 1 (scripted members and estimators).
// =====================================================================================================================

describe("cases 6, 7 and the S13 extra (side-by-side §13 \"The API re-checks at admission\", O3): the ask path and the waker", () => {
  const ESTIMATE = 1000;
  const FULL_DAY = 1000;
  const RAISED_DAY = 10000000;
  let now = new Date("2035-03-01T10:00:20.000Z");

  const freeAsk: AskRequest = {
    question_line: "Should a debate admitted during a settings change start on the version that is active when it starts?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker-declaration:settings-per-debate-ops",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "side-by-side S19 integration test",
    as_of: "2026-10-22T00:00:00.000Z",
    steering_presets: [],
    plan_tier: "free",
    steering_annotations: []
  };

  // Each case starts with no live job and an empty line, so no other case's run is woken, counted or busy.
  beforeEach(async () => {
    await dev.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')");
    await dev.pool.query("INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v");
  });

  /** A room as main.ts builds it: the gate with the release's site version (the START reads the pointer on its own transaction). */
  function roomOf(releaseKey: string, ceiling: number, alarm?: ActiveVersionAlarm): AskRoom {
    return new AskRoom({
      lockPool: dev.pool,
      spend: new PostgresModelSpendStore(dev.pool),
      line: new RunWaitRepository(dev.pool),
      estimator: { estimateMicros: async () => ESTIMATE },
      personAllowance: { read: async () => [] },
      entitlements: null,
      dailyCeilingMicros: ceiling,
      closeBasisPoints: 9500,
      waitingLinePerPerson: 1,
      clock: () => now,
      gate: new PostgresAskAdmissionGate({
        releaseKey, hosted: false, siteVersion: siteVersionOfRelease(releaseKey)!, ...(alarm === undefined ? {} : { alarm })
      })
    });
  }

  /**
   * The release's application as main.ts composes it: the active version read per ask (here uncached, straight from the
   * pointer, so a tick right after an activation plans on it; main.ts's one-second cache is S13's own test), each
   * version's members, and `afterActiveRead`: the seam between the ask's version read and the room's decision.
   */
  function applicationOf(releaseKey: string, room: AskRoom, spies: Readonly<{
    dispatched?: string[]; afterActiveRead?: (version: number) => Promise<void>;
  }> = {}): PostgresAskApplication {
    const dispatcher: Dispatcher = { dispatch: async ({ runId }) => { spies.dispatched?.push(runId); } };
    const site = siteVersionOfRelease(releaseKey)!;
    const resolveEnvelopeBasis: RunCreationSettings["resolveEnvelopeBasis"] = async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1);
    const resolveRisk: RunCreationSettings["resolveRisk"] = (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    });
    const members = (version: number): AdmissionRunMembers => Object.freeze({ registerVersion: version, resolveEnvelopeBasis, resolveRisk });
    let hook = spies.afterActiveRead;
    const settings: RunCreationSettings = {
      strangerSampleRate: 0,
      registerVersion: site,
      releaseKey,
      batteryVersion: "settings-per-debate-ops",
      settlementWatchHandle: "settings-per-debate-ops",
      resolveDiscoveredPanel: async () => [...new Set([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium])].map((modelId, index) => Object.freeze({
        provider_ref: `provider:s19:${String(index + 1)}`, maker: `maker:s19:${String(index + 1)}`, model_id: modelId,
        probe_evidence_ref: randomUUID(), probed_at: "2026-10-22T00:00:00.000Z"
      })),
      resolveEnvelopeBasis,
      resolveRisk,
      room,
      waitingLine: room,
      admissionSettings: {
        activeSettingsVersion: async () => {
          const version = await readActiveSettingsVersionOn(dev.pool, site);
          const once = hook;
          hook = undefined;
          if (once !== undefined) await once(version);
          return version;
        },
        admissionSettingsFor: async (version) => members(version)
      }
    };
    return new PostgresAskApplication(dev.pool, dispatcher, settings, undefined, dev.pool, createTestAskAdmissionPoolFacades(dev.pool));
  }

  const askAs = (application: PostgresAskApplication, askerId: string) => application.submit(freeAsk, {
    asker_id: askerId, session_id: `session:s19:${randomUUID()}`, caller_scope: "ASKER",
    ownership_provenance: "user_dev_token", provisional_identity_model: true
  } as unknown as Session, { kind: "legacy", legacyAskerId: askerId });

  async function fillDay(day: string, micros: number): Promise<void> {
    await dev.pool.query(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'SUPPORT',NULL,'provider-1',$2::date,$3,1,1)`, [randomUUID(), day, micros]);
  }
  const count = async (sql: string, values: readonly unknown[] = []): Promise<number> =>
    (await dev.pool.query<{ n: number }>(sql, [...values])).rows[0]!.n;
  const stampOf = async (runId: string) => (await dev.pool.query<{ release_key: string; register_version: string }>(
    "SELECT release_key, register_version::text AS register_version FROM core.run WHERE run_id = $1", [runId])).rows[0];
  const latestReasonOf = async (runId: string): Promise<string | undefined> => (await dev.pool.query<{ waits_for: string }>(
    "SELECT waits_for FROM core.run_wait_reason WHERE run_id=$1 ORDER BY evaluated_at DESC, reason_id DESC LIMIT 1", [runId])).rows[0]?.waits_for;
  const holdOf = async (runId: string): Promise<number | null> => {
    const row = (await dev.pool.query<{ held_micros: string }>(
      "SELECT held_micros::text AS held_micros FROM ledger.model_spend_hold WHERE run_id = $1", [runId])).rows[0];
    return row === undefined ? null : Number(row.held_micros);
  };
  const chargesOf = (runId: string) => count("SELECT count(*)::integer AS n FROM ledger.model_spend WHERE run_id = $1", [runId]);
  const supersessionOf = async (oldRunId: string) => (await dev.pool.query<{ old_run_id: string; new_run_id: string; reason: string }>(
    "SELECT old_run_id, new_run_id, reason FROM core.run_supersession WHERE old_run_id = $1", [oldRunId])).rows;
  const waitingIds = async (): Promise<string[]> =>
    (await dev.pool.query<{ run_id: string }>("SELECT run_id FROM core.run_waiting_v")).rows.map((row) => row.run_id);
  const jobsOf = async (runId: string) => (await dev.pool.query<{ command_key: string; state: string }>(
    "SELECT command_key, state FROM core.work_item WHERE run_id = $1 ORDER BY created_at_seq", [runId])).rows;
  const lineRowsOf = (askerId: string) => count(
    "SELECT count(*)::integer AS n FROM core.run_wait AS wait JOIN core.run AS run USING (run_id) WHERE run.asker_id = $1", [askerId]);
  const runsOf = (askerId: string) => count("SELECT count(*)::integer AS n FROM core.run WHERE asker_id = $1", [askerId]);

  it("case 6: the (release, S+1) verdict turns FAIL between the ask's version read and its decision: it waits SWITCHING on S+1, uncharged; re-activating S starts it on S within one tick", async () => {
    const release = keyOf(HOSTED_SITE, "c6");
    const S = HOSTED_SITE;
    await makeCurrent(dev, release);
    const next = await probeVersion("case6-next");
    await pass(dev, release, next);
    await activateOffPreview(dev, next);
    expect(await statusOf(dev)).toMatchObject({ currentRelease: release, pointer: next });

    now = new Date("2035-03-06T10:00:20.000Z");
    const askerId = `s19:case6:${randomUUID()}`;
    const dispatched: string[] = [];
    let injectedAt: number | undefined;
    const application = applicationOf(release, roomOf(release, RAISED_DAY), {
      dispatched,
      // Right after the ask read the active version (S+1, passed), the owner's re-check records a FAIL for the pair.
      afterActiveRead: async (version) => { injectedAt = version; await fail(dev, release, next); }
    });
    const held = await askAs(application, askerId);
    expect(injectedAt).toBe(next);
    expect(held.status).toBe("WAITING");
    expect(held).not.toHaveProperty("waits_for");
    const old = held.run_ref;
    expect(await latestReasonOf(old)).toBe("SWITCHING");
    expect(await stampOf(old)).toEqual({ release_key: release, register_version: String(next) });
    expect([await holdOf(old), await chargesOf(old), await jobsOf(old)]).toEqual([null, 0, []]);
    expect(dispatched).toEqual([]);

    // A tick while the pair still FAILs: the START re-checks S+1 on its own transaction and starts nothing (R11 stops it).
    now = new Date("2035-03-06T10:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
    expect(await waitingIds()).toContain(old);
    expect([await holdOf(old), await chargesOf(old), await jobsOf(old), await supersessionOf(old)]).toEqual([null, 0, [], []]);

    // The owner re-activates S (the release's own site version, always passed): the next tick re-admits the ask on S.
    await activateOffPreview(dev, S);
    now = new Date("2035-03-06T10:02:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    const created = edges[0]!.new_run_id;
    expect(edges).toEqual([{ old_run_id: old, new_run_id: created, reason: "READMITTED" }]);
    expect(await stampOf(created)).toEqual({ release_key: release, register_version: String(S) });
    expect([await holdOf(created), await holdOf(old), await chargesOf(old)]).toEqual([ESTIMATE, null, 0]);
    expect(await jobsOf(created)).toEqual([{ command_key: `S00:${created}:Q1`, state: "READY" }]);
    expect(dispatched).toEqual([created]);
    expect(await lineRowsOf(askerId)).toBe(1);
    expect(await waitingIds()).not.toContain(old);
  });

  it("case 7: a run stamped S waits through two closed-room ticks after S+1 is activated, untouched; the first open tick re-admits it on S+1; one line row throughout", async () => {
    const release = keyOf(HOSTED_SITE, "c7");
    const S = HOSTED_SITE;
    await makeCurrent(dev, release);
    expect((await statusOf(dev)).effectiveActive).toBe(S);
    const day = "2035-03-07";
    now = new Date(`${day}T10:00:20.000Z`);
    await fillDay(day, FULL_DAY);
    const askerId = `s19:case7:${randomUUID()}`;
    const closed = applicationOf(release, roomOf(release, FULL_DAY));
    const waiting = await askAs(closed, askerId);
    expect(waiting.status).toBe("WAITING");
    const old = waiting.run_ref;
    expect(await stampOf(old)).toEqual({ release_key: release, register_version: String(S) });
    expect(await lineRowsOf(askerId)).toBe(1);

    const next = await probeVersion("case7-next");
    await pass(dev, release, next);
    await activateOffPreview(dev, next);
    expect((await statusOf(dev)).effectiveActive).toBe(next);

    for (const minute of ["01", "02"]) {
      now = new Date(`${day}T10:${minute}:00.000Z`);
      await expect(closed.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
      expect(await runsOf(askerId)).toBe(1);
      expect(await supersessionOf(old)).toEqual([]);
      expect([await holdOf(old), await chargesOf(old), await jobsOf(old)]).toEqual([null, 0, []]);
      expect(await waitingIds()).toContain(old);
      expect(await stampOf(old)).toEqual({ release_key: release, register_version: String(S) });
      expect(await lineRowsOf(askerId)).toBe(1);
    }

    now = new Date(`${day}T10:03:00.000Z`);
    const dispatched: string[] = [];
    await expect(applicationOf(release, roomOf(release, RAISED_DAY), { dispatched }).wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    const created = edges[0]!.new_run_id;
    expect(await stampOf(created)).toEqual({ release_key: release, register_version: String(next) });
    expect([await holdOf(created), await holdOf(old)]).toEqual([ESTIMATE, null]);
    expect(dispatched).toEqual([created]);
    expect(await runsOf(askerId)).toBe(2);
    expect(await lineRowsOf(askerId)).toBe(1);
    expect(await waitingIds()).not.toContain(old);
  });

  it("S13 extra (ruling R11): the current release has not passed the active version: every START waits SWITCHING, a tick starts nothing; once the pair passes one tick starts them all on it", async () => {
    const release = keyOf(HOSTED_SITE, "c8");
    await makeCurrent(dev, release);
    const active = await probeVersion("extra-active");
    await pass(dev, release, active);
    await activateOffPreview(dev, active);
    const day = "2035-03-08";
    now = new Date(`${day}T10:00:20.000Z`);
    await fillDay(day, FULL_DAY);
    const people = [`s19:extra:a:${randomUUID()}`, `s19:extra:b:${randomUUID()}`];
    const closed = applicationOf(release, roomOf(release, FULL_DAY));
    const placed: string[] = [];
    for (const person of people) {
      const answer = await askAs(closed, person);
      expect(answer.status).toBe("WAITING");
      placed.push(answer.run_ref);
    }
    for (const runId of placed) expect(await stampOf(runId)).toEqual({ release_key: release, register_version: String(active) });

    // 0124's at-commit check refuses a switch to a release that has not passed the pointer, so the reachable way for the
    // current release to stand on an active version it has not passed is a later FAIL verdict for that pair.
    await fail(dev, release, active);
    now = new Date(`${day}T10:01:00.000Z`);
    const dispatched: string[] = [];
    // Final fix wave F2b (ruling R77): the gate's hold also says the once-a-minute alarm, content-free.
    const alarms: string[] = [];
    const alarm: ActiveVersionAlarm = (version, reason) => { alarms.push(`${String(version)}:${reason}`); return true; };
    const open = applicationOf(release, roomOf(release, RAISED_DAY, alarm), { dispatched });
    // The first START answers SWITCHING and the tick stops there (R11): one run examined, nothing started.
    await expect(open.wakeWaitingRuns()).resolves.toMatchObject({ waiting: 1, started: 0, stopped: true });
    // Final fix wave S8c: the stop is the SWITCHING hold, not a full or busy site (which stop a tick the same way and
    // write no reason row either): the gate's not-passed hold for exactly this (release, version) pair said its alarm
    // once, and the site's day (RAISED_DAY) and its cap leave room.
    expect(alarms).toEqual([`${String(active)}:NOT_PASSED`]);
    for (const runId of placed) {
      expect(await waitingIds()).toContain(runId);
      expect([await holdOf(runId), await chargesOf(runId), await jobsOf(runId)]).toEqual([null, 0, []]);
    }
    // A new ask meanwhile also waits, with no charge. Its recorded reason is the line ahead of it (SITE): the room records
    // a hold (SWITCHING) as the cause only when the hold alone decides the wait (decideAdmission's `cause`), and the two
    // people ahead already make it wait; with an empty line the same re-check records SWITCHING (case 6).
    const third = `s19:extra:c:${randomUUID()}`;
    const fresh = await askAs(open, third);
    expect(fresh.status).toBe("WAITING");
    expect(await latestReasonOf(fresh.run_ref)).toBe("SITE");
    expect([await holdOf(fresh.run_ref), await chargesOf(fresh.run_ref)]).toEqual([null, 0]);
    expect(dispatched).toEqual([]);

    // The pair passes again: one tick starts every one of them on the active version, each on its own row.
    await pass(dev, release, active);
    now = new Date(`${day}T10:02:00.000Z`);
    await expect(open.wakeWaitingRuns()).resolves.toMatchObject({ started: 3, failed: 0, stopped: false });
    const all = [...placed, fresh.run_ref];
    expect([...dispatched].sort()).toEqual([...all].sort());
    for (const runId of all) {
      expect(await stampOf(runId)).toEqual({ release_key: release, register_version: String(active) });
      expect(await holdOf(runId)).toBe(ESTIMATE);
      expect(await supersessionOf(runId)).toEqual([]);
      expect(await waitingIds()).not.toContain(runId);
    }
  });

  it("final fix wave F2a (ruling R77): the operator refuses to record a FAIL for the (current release, active version) pair, with the check's codes; nothing is written and the pair still passes", async () => {
    const release = keyOf(HOSTED_SITE, "c9");
    await makeCurrent(dev, release);
    const active = await probeVersion("f2a-active");
    const other = await probeVersion("f2a-other");
    await pass(dev, release, active);
    await pass(dev, release, other);
    await activateOffPreview(dev, active);
    const verdicts = () => count("SELECT count(*)::integer AS n FROM register.settings_verdict WHERE release_key = $1", [release]);
    const before = await verdicts();
    const codes = ["SETTINGS_SITE_MEMBER_DIFFERS:sessionPolicy"];
    const refused = await refusal(withClient(dev, (client) => recordSettingsVerdict(client, syntheticVerdict(release, active, codes), codes)));
    expect(refused).toBeInstanceOf(SettingsOperatorRefusal);
    expect([(refused as SettingsOperatorRefusal).code, (refused as SettingsOperatorRefusal).codes]).toEqual(["SETTINGS_VERDICT_ACTIVE_PAIR", codes]);
    expect(await verdicts()).toBe(before);
    const status = await statusOf(dev);
    expect([status.currentRelease, status.pointer, status.passed.includes(active)]).toEqual([release, active, true]);
    // What the API reads for new asks is untouched: the active version, still passed by the current release.
    expect(await readActiveSettingsVersionOn(dev.pool, siteVersionOfRelease(release)!)).toBe(active);
    // A FAIL for a passed version that is not the active one records (the operator's refusal is for the active pair only).
    await withClient(dev, (client) => recordSettingsVerdict(client, syntheticVerdict(release, other, codes), codes));
    expect(await verdicts()).toBe(before + 1);
    expect((await statusOf(dev)).passed).not.toContain(other);
    // Once another passed version is active, the old one may be re-checked to FAIL (the recovery the guide names).
    await activateOffPreview(dev, siteVersionOfRelease(release)!);
    await withClient(dev, (client) => recordSettingsVerdict(client, syntheticVerdict(release, active, codes), codes));
    expect(await verdicts()).toBe(before + 2);
    expect((await statusOf(dev)).passed).not.toContain(active);
  });
});

// =====================================================================================================================
// Database 2: a register built the way the live preview's is (condition 6 and the SA10 extra).
// =====================================================================================================================

describe("case 4, condition 6, and the SA10 extra: the preview release (history v4, publish kit v2 with the plan's lineUp)", () => {
  const GLM = "zai-org/GLM-5.3-Flash", DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash", MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
  const QWEN = "Qwen/Qwen3.8-Flash", HAIKU = "claude-haiku-5-5";
  const OBSERVATION = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
    operatorSha256: "c".repeat(64), observedAt: "2026-10-22T08:00:00.000Z" };
  const SITE_LINE_UP = parsePreviewLineUp({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: null });
  const SOCKETS_ONLY = parsePreviewEnvironmentConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    scope_id: "settings-per-debate-ops" }))!;
  const CLAIM_MS = 2 * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + PREVIEW_GLM_DEADLINE_MS) + PREVIEW_GLM_DEADLINE_MS + 60000;
  const TARGETS = JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map((ref) => previewTargetJsonRow(ref)));
  const TARGET_MODELS = Object.freeze([...new Set(PREVIEW_REVIEWED_PROVIDER_REFS.map((ref) => previewTargetJsonRow(ref).model as string))]);
  /** The release's API env in the sockets-only form (R64): no env line-up, the declared targets' models. */
  const SEATABLE_ENV: SettingsSeatableEnvironment = Object.freeze({ envLineUp: null, declaredModels: TARGET_MODELS });
  /** Every gate answering every reviewed model it serves (`/remaining`'s enabled_models), less `missing`. */
  const gatesWithout = (...missing: string[]): GateEnabledModels => {
    const gates: Record<string, string[]> = {};
    for (const model of TARGET_MODELS) {
      const gate = previewModelRow(model)!.provider;
      gates[gate] ??= [];
      if (!missing.includes(model)) gates[gate]!.push(model);
    }
    return Object.freeze(gates);
  };
  let preview: TestDatabase;
  let runnerPool: Pool;
  let apiPool: Pool;
  let SITE = 0;
  let P = "";

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
    const receipt = await publishPreviewRegisterV2(preview.pool, { publicationId: randomUUID(), sourceRef: "settings-per-debate-ops preview fixture", snapshot,
      approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256,
        snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } });
    SITE = registerVersionToSafeLegacyNumber(parseRegisterVersionText(String(receipt.registerVersion)));
    P = keyOf(SITE, "0123456789ab");
    runnerPool = readOnlyPool(preview, "debateai_runtime", "test:s19-ops-runner-preview");
    apiPool = readOnlyPool(preview, "debateai_billing_runtime", "test:s19-ops-api-preview");
    await makeCurrent(preview, P);
  }, 600_000);

  afterAll(async () => {
    await Promise.allSettled([runnerPool?.end(), apiPool?.end()]);
    await preview?.stop();
  });

  /** Both halves for the preview release P: sockets-only setting, every reviewed target declared (S14, SA10). */
  async function checkPreview(version: number): Promise<Readonly<{ runner: SettingsCheckReport; api: SettingsCheckReport }>> {
    const common = { REGISTER_VERSION: SITE, RELEASE_KEY: P, DEPLOYMENT_MODE: "local" as const, NODE_ENV: "test",
      PROVIDER_DISCOVERY_TARGETS_JSON: TARGETS, PREVIEW_GATE_SETTINGS: SOCKETS_ONLY.gate, PREVIEW_ENV_LINE_UP: SOCKETS_ONLY.envLineUp };
    const runner = await checkRunnerSettingsVersion({ pool: runnerPool, environment: { ...common, CLAIM_MS, CLAIM_MARGIN_MS: 60000 }, version });
    const api = await checkAdmissionSettingsVersion({ pool: apiPool, environment: common, version });
    return Object.freeze({ runner, api });
  }
  /** A new GENERAL version from the preview site version with some rows' values replaced (each row's source reference kept). */
  async function publishFromPreview(change: Readonly<Record<string, (current: unknown) => unknown>>): Promise<number> {
    const base = parseRegisterVersionText(String(SITE));
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
  /** Checks a candidate, records its verdict through the operator, and requires PASS (a clean candidate). */
  async function checkedPass(version: number): Promise<void> {
    const { runner, api } = await checkPreview(version);
    expect({ runner: runner.codes, api: api.codes }).toEqual({ runner: [], api: [] });
    await withClient(preview, (client) => recordSettingsVerdict(client, settingsVerdictOf(runner, api)));
  }
  /** The owner's activation on the preview through the operator's PRODUCTION reader (no readers argument: ACTIVATION_READERS). */
  const activateOnPreview = (version: number, gateEnabledModels: GateEnabledModels) => withClient(preview, (client) => activateSettingsVersion(client, {
    version, activatedBy: "owner", reason: `activate ${String(version)}`, gateEnabledModels, seatableEnvironment: SEATABLE_ENV
  }));
  const gateCheck = (version: number, gateEnabledModels: GateEnabledModels) => withClient(preview, (client) =>
    assertSettingsGatesServe(client, { version, gateEnabledModels, seatableEnvironment: SEATABLE_ENV }));

  it("control: the preview's own site version passes both halves; it is current and active", async () => {
    const { runner, api } = await checkPreview(SITE);
    expect({ runner: runner.codes, api: api.codes }).toEqual({ runner: [], api: [] });
    expect(await statusOf(preview)).toEqual({ currentRelease: P, pointer: SITE, effectiveActive: SITE, passed: [SITE] });
  });

  it("condition 6, the code copy: an evaluator token ceiling above every reviewed model's output bound is SETTINGS_GATE_TOKEN_CEILING only, then refused", async () => {
    const above = Math.max(...TARGET_MODELS.map((model) => previewModelRow(model)!.outputBound)) + 1;
    const version = await publishFromPreview({ evaluatorCallBound: (current) => ({ ...(current as Record<string, unknown>), tokenCeiling: above }) });
    const halves = await checkPreview(version);
    // Every model the version can seat is named; nothing else (no other condition) fails.
    const seatable = [...new Set([GLM, DEEPSEEK, MIMO, QWEN, HAIKU])].sort();
    await expectRefusedByCondition(preview, version, halves, {
      runner: seatable.map((model) => `SETTINGS_GATE_TOKEN_CEILING:evaluatorCallBound:${model}`).sort(), api: []
    }, (target) => activateOnPreview(target, gatesWithout()));
  });

  it("condition 6, live: a clean, PASSED candidate is refused SETTINGS_GATE_LIVE_CHECK_FAILED when a gate does not serve a model it seats; accepted when every gate does", async () => {
    const lineUp = { kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: [QWEN, GLM], premium_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU],
      thinking_levels: { [QWEN]: { level: "low", steps: { judge_panel: "medium" } }, [GLM]: { level: "high" } } };
    const version = await publishFromPreview({ previewLineUpPolicy: () => lineUp });
    await checkedPass(version);
    const before = await statusOf(preview);
    const rows = await activationRows(preview);
    const refused = await refusal(activateOnPreview(version, gatesWithout(QWEN)));
    expect(refused).toBeInstanceOf(SettingsOperatorRefusal);
    expect([(refused as SettingsOperatorRefusal).code, (refused as SettingsOperatorRefusal).codes])
      .toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", [`SETTINGS_GATE_MODEL_DISABLED:deepinfra:${QWEN}`]]);
    expect(await statusOf(preview)).toEqual(before);
    expect(await activationRows(preview)).toBe(rows);
    // Control: every gate serves every model it can seat: activated.
    const done = await activateOnPreview(version, gatesWithout());
    expect([done.previous, done.releaseKey]).toEqual([before.pointer, P]);
    expect(await statusOf(preview)).toMatchObject({ currentRelease: P, pointer: version, effectiveActive: version });
  });

  it("SA10 extra: the production reader checks the candidate's OWN previewLineUpPolicy roster (Free [GLM, Haiku], Qwen pros_cons low)", async () => {
    const lineUp = { kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU],
      thinking_levels: { [QWEN]: { level: "medium", steps: { pros_cons: "low" } } } };
    const version = await publishFromPreview({ previewLineUpPolicy: () => lineUp });
    await checkedPass(version);
    // The candidate's roster model (Haiku, on its Free roster) is checked: a gate that does not serve it refuses.
    const missingHaiku = await refusal(gateCheck(version, gatesWithout(HAIKU)));
    expect([(missingHaiku as SettingsOperatorRefusal).code, (missingHaiku as SettingsOperatorRefusal).codes])
      .toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", [`SETTINGS_GATE_MODEL_DISABLED:anthropic:${HAIKU}`]]);
    // The roster read is the candidate's own row, not the site version's: MiMo (the site's Premium roster only) off its
    // gate refuses the site version and not the candidate, which does not seat it.
    const siteMissingMimo = await refusal(gateCheck(SITE, gatesWithout(MIMO)));
    expect((siteMissingMimo as SettingsOperatorRefusal).codes).toEqual([`SETTINGS_GATE_MODEL_DISABLED:deepinfra:${MIMO}`]);
    await expect(gateCheck(version, gatesWithout(MIMO))).resolves.toBeUndefined();
    // The activation itself, through the same production reader: refused without Haiku, nothing moved; accepted with it.
    const before = await statusOf(preview);
    const refused = await refusal(activateOnPreview(version, gatesWithout(HAIKU)));
    expect([(refused as SettingsOperatorRefusal).code, (refused as SettingsOperatorRefusal).codes])
      .toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", [`SETTINGS_GATE_MODEL_DISABLED:anthropic:${HAIKU}`]]);
    expect(await statusOf(preview)).toEqual(before);
    const done = await activateOnPreview(version, gatesWithout(MIMO));
    expect([done.previous, done.releaseKey]).toEqual([before.pointer, P]);
    expect(await statusOf(preview)).toMatchObject({ currentRelease: P, pointer: version, effectiveActive: version });
  });
});
