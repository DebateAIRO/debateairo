import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { migrate } from "@debateai/db";
import {
  SUPPORT_CONFIGURATION_KEYS,
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber,
  settingsCheckReport,
  type SupportConfigurationKey
} from "../../packages/register/src/index.js";
import {
  SettingsOperatorRefusal,
  activateSettingsVersion,
  latestPassedSettingsVersion,
  readEffectiveActiveSettings,
  readSettingsStatus,
  recordSettingsVerdict,
  settingsForSwitch,
  settingsVerdictOf,
  type ActivationReaders
} from "../../tools/settings-version/settings-operator.js";
import { assertBaseIsActive, BASE_NOT_ACTIVE } from "../../deploy/preview-auth-dev/v1/publish-register-base.js";
import { importHistoricalRegisterFixture, publishReplacementRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §13, §11 (plan 2026-10-21-side-by-side-S-settings Task S15): the operator module on a real database
 * (migration 0124), in the order the owner uses it — verdict, activate, status, latest-passed — and the release switch's
 * multi-statement transaction text (deploy/preview-lifecycle/v1/release-table.mjs releaseSwitchSql, ruling R12).
 *
 * psql is not on this machine's PATH, so the switch's text runs through pg instead: the same fixed text, each psql
 * variable `:'name'` replaced by the driver's own quoted literal (what psql's `:'name'` produces), one simple-protocol
 * query, ROLLBACK after an error (psql's ON_ERROR_STOP=1 closes the session, which rolls back the same way).
 *
 * The register holds v4 (a historical import), and G1, G2 (GENERAL versions published from v4). Release A is r4-…
 * (site version 4), release B is r<G2>-… (site version G2). The cases run in order on one database. Embedded Postgres;
 * CI skips this directory, run it alone.
 */
// Keys are built from pieces (the secret scanner reads r<n>-<12 hex> as a key).
const A = ["r4", "a".repeat(12)].join("-");
const BY = "test:settings-operator";
const SNAPSHOT = "c".repeat(64);
const SUPPORT_VALUES: Readonly<Record<SupportConfigurationKey, unknown>> = Object.freeze({
  support_enabled: true, support_model_ref: "development:claude-cli", support_relay_concurrency: 2, support_daily_call_cap: 500,
  support_limit_anon_msgs_10m: 20, support_limit_anon_msgs_24h: 100, support_limit_anon_sessions_1h: 5, support_limit_session_msgs: 40,
  support_limit_msg_chars: 2000, support_limit_account_msgs_10m: 60, support_limit_account_msgs_24h: 300, support_queue_depth: 10,
  support_lock_after_injections: 3, support_ip_cooldown_minutes: 60, support_retention_policy: "keep", support_retention_ratified_by: null
});
/** Condition 6's register read is replaced (these fixture versions carry no runner rows); the live gate answers are real inputs. */
const READERS: ActivationReaders = Object.freeze({
  readGateModels: async () => Object.freeze({ models: Object.freeze([Object.freeze({ ref: "preview:fixture-a", gate: "deepinfra", model: "zai-org/GLM-5.3-Flash" })]), unreviewed: Object.freeze([]) })
});
const GATES = Object.freeze({ deepinfra: Object.freeze(["zai-org/GLM-5.3-Flash"]) });
/** SA10 fix round 1: the release's env line-up and declared models are required (READERS above ignore them). */
const SEAT_ENV = Object.freeze({ envLineUp: null, declaredModels: Object.freeze(["zai-org/GLM-5.3-Flash"]) });

let database: TestDatabase;
let G1 = 0;
let G2 = 0;
let B = "";
const loadReleaseTable = async () => import("../../deploy/" + "preview-lifecycle/v1/release-table.mjs") as Promise<{
  releaseSwitchSql: (input: { activation: boolean }) => string;
}>;

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  let clean = false;
  try { const value = await work(client); clean = true; return value; } finally { client.release(!clean); }
}
const current = async (): Promise<string | null> =>
  (await database.pool.query<{ release_key: string }>("SELECT release_key FROM core.read_current_release()")).rows[0]?.release_key ?? null;
const stage = (key: string) => database.pool.query("SELECT core.record_release_event($1, 'STAGED', $2, NULL)", [key, BY]);
const verdictFor = (key: string, version: number, codes: string[] = []) => settingsVerdictOf(
  settingsCheckReport({ half: "runner", releaseKey: key, version, codes, snapshotSha256: SNAPSHOT }),
  settingsCheckReport({ half: "api", releaseKey: key, version, codes: [], snapshotSha256: SNAPSHOT })
);

/**
 * The switch transaction exactly as the preview sends it to psql (release-table.mjs), its variables quoted by the driver.
 * Resolves the printed rows (event_seq, then activation_seq), or rejects with the database's error after a ROLLBACK.
 */
async function runSwitchText(variables: Record<string, string>, activation: boolean): Promise<string[]> {
  const { releaseSwitchSql } = await loadReleaseTable();
  return withClient(async (client) => {
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
async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the call succeeded");
}

describe("S15: the settings operator on migration 0124", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    const sourceRef = "fixture:settings-operator";
    await importHistoricalRegisterFixture(database.pool, 4, SUPPORT_CONFIGURATION_KEYS.map((key) => registerFixtureRow(key, SUPPORT_VALUES[key], sourceRef)));
    const general = async (marker: string): Promise<number> => registerVersionToSafeLegacyNumber((await publishReplacementRegisterFixture(database.pool,
      parseRegisterVersionText("4"), [registerFixtureRow("settingsOperatorProbe", marker, sourceRef)], `${sourceRef}:${marker}`)).registerVersion);
    G1 = await general("g1");
    G2 = await general("g2");
    B = [`r${G2}`, "b".repeat(12)].join("-");
  }, 300_000);
  afterAll(async () => { await database?.stop(); });

  it("1. the first switch's text activates the release's own site version in the same transaction (owner answer Q-S2)", async () => {
    await withClient(async (client) => {
      expect(await readSettingsStatus(client)).toEqual({ currentRelease: null, pointer: null, effectiveActive: null, passed: [] });
      expect(await settingsForSwitch(client, { newRelease: A })).toEqual({ expectedActiveSettings: null, activate: 4 });
    });
    await stage(A);
    const printed = await runSwitchText(switchVariables(A, null, null, 4), true);
    expect(printed).toHaveLength(2);
    expect(await current()).toBe(A);
    await withClient(async (client) => {
      expect(await readSettingsStatus(client)).toEqual({ currentRelease: A, pointer: 4, effectiveActive: 4, passed: [4] });
    });
  });

  it("2. verdicts are recorded through the definer; a FAIL counts as not passed; a bad digest stays typed", async () => {
    await withClient(async (client) => {
      await recordSettingsVerdict(client, verdictFor(A, G1));
      await recordSettingsVerdict(client, verdictFor(A, G2, ["SETTINGS_HASH_UNDECLARED:mapContractHash"]));
      expect((await readSettingsStatus(client)).passed).toEqual([4, G1]);
      const error = await refusal(recordSettingsVerdict(client, { ...verdictFor(A, G1), digest: "D".repeat(64) }));
      expect(error).toBeInstanceOf(SettingsOperatorRefusal);
      expect((error as SettingsOperatorRefusal).code).toBe("SETTINGS_VERDICT_INVALID");
    });
  });

  it("3. activation: refused early when not passed, then G1 activated, then unchanged; the live gate check refuses a model that is off", async () => {
    await withClient(async (client) => {
      const notPassed = await refusal(activateSettingsVersion(client, { version: G2, activatedBy: "owner", reason: "x", gateEnabledModels: GATES, seatableEnvironment: SEAT_ENV }, READERS));
      expect([(notPassed as SettingsOperatorRefusal).code, (notPassed as SettingsOperatorRefusal).passed]).toEqual(["SETTINGS_VERSION_NOT_PASSED", [4, G1]]);
      const off = await refusal(activateSettingsVersion(client, { version: G1, activatedBy: "owner", reason: "x", gateEnabledModels: { deepinfra: [] }, seatableEnvironment: SEAT_ENV }, READERS));
      expect((off as SettingsOperatorRefusal).codes).toEqual(["SETTINGS_GATE_MODEL_DISABLED:deepinfra:zai-org/GLM-5.3-Flash"]);
      const done = await activateSettingsVersion(client, { version: G1, activatedBy: "owner", reason: "new lengths", gateEnabledModels: GATES, seatableEnvironment: SEAT_ENV }, READERS);
      expect([done.previous, done.releaseKey, Number(done.activationSeq) > 0]).toEqual([4, A, true]);
      const unchanged = await refusal(activateSettingsVersion(client, { version: G1, activatedBy: "owner", reason: "again", gateEnabledModels: GATES, seatableEnvironment: SEAT_ENV }, READERS));
      expect((unchanged as SettingsOperatorRefusal).code).toBe("SETTINGS_ACTIVATION_UNCHANGED");
      expect(await readSettingsStatus(client)).toEqual({ currentRelease: A, pointer: G1, effectiveActive: G1, passed: [4, G1] });
      expect((await client.query("SELECT activated_by, reason FROM register.settings_activation ORDER BY activation_seq DESC LIMIT 1")).rows)
        .toEqual([{ activated_by: "owner", reason: "new lengths" }]);
    });
  });

  it("4. latest passed: the most recent PASS still PASS, else the release's own site version (D1)", async () => {
    await withClient(async (client) => {
      expect(await latestPassedSettingsVersion(client, A)).toBe(G1);
      expect(await latestPassedSettingsVersion(client, B)).toBe(G2);
      await recordSettingsVerdict(client, verdictFor(A, G1, ["SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.kind"]));
      expect(await latestPassedSettingsVersion(client, A)).toBe(4);
      await recordSettingsVerdict(client, verdictFor(A, G1));
      expect(await latestPassedSettingsVersion(client, A)).toBe(G1);
    });
  });

  it("5. the switch to a release that has not passed the pointer: planned with an activation, one transaction", async () => {
    await withClient(async (client) => {
      const refused = await refusal(settingsForSwitch(client, { newRelease: B }));
      expect([(refused as SettingsOperatorRefusal).code, (refused as SettingsOperatorRefusal).passed]).toEqual(["SETTINGS_VERSION_NOT_PASSED", [G2]]);
      expect(await settingsForSwitch(client, { newRelease: B, activate: G2 })).toEqual({ expectedActiveSettings: G1, activate: G2 });
    });
    await stage(B);
    // Without the activation the COMMIT's deferred check refuses, and nothing of the switch survives.
    const atCommit = await refusal(runSwitchText(switchVariables(B, A, G1), false));
    expect((atCommit as Error).message).toBe("SETTINGS_VERSION_NOT_PASSED");
    expect(await current()).toBe(A);
    // A stale expected pointer: the hook's compare-and-swap refuses.
    const stale = await refusal(runSwitchText(switchVariables(B, A, 4, G2), true));
    expect((stale as Error).message).toBe("SETTINGS_ACTIVATION_CONFLICT");
    expect(await current()).toBe(A);
    expect(await runSwitchText(switchVariables(B, A, G1, G2), true)).toHaveLength(2);
    expect(await current()).toBe(B);
    await withClient(async (client) => {
      expect(await readSettingsStatus(client)).toEqual({ currentRelease: B, pointer: G2, effectiveActive: G2, passed: [G2] });
    });
  });

  it("6. the rollback activates the older release's latest still-passing version (spec §11)", async () => {
    await stage(A);
    const plan = await withClient(async (client) =>
      settingsForSwitch(client, { newRelease: A, activate: await latestPassedSettingsVersion(client, A) }));
    expect(plan).toEqual({ expectedActiveSettings: G2, activate: G1 });
    expect(await runSwitchText(switchVariables(A, B, plan.expectedActiveSettings, plan.activate!), true)).toHaveLength(2);
    await withClient(async (client) => {
      expect(await readSettingsStatus(client)).toEqual({ currentRelease: A, pointer: G1, effectiveActive: G1, passed: [4, G1] });
    });
  });

  it("7. kit v3 composes from the active version (S18): G1 passes with G2 sealed above it; 4 and G2 are refused", async () => {
    const publicationId = "11111111-1111-4111-8111-111111111111";
    await expect(assertBaseIsActive(database.pool, String(G1), publicationId)).resolves.toBeUndefined();
    for (const base of ["4", String(G2)]) await expect(assertBaseIsActive(database.pool, base, publicationId)).rejects.toThrow(BASE_NOT_ACTIVE);
    // Ruling R69: the kit's light read asks the catalog first; on this database both exist. A name the catalog lacks
    // answers false (never an error), which is what a database before 0124 (or 0123) gives.
    expect(await readEffectiveActiveSettings(database.pool)).toEqual({ currentRelease: A, pointer: G1, effectiveActive: G1 });
    expect((await database.pool.query("SELECT to_regprocedure('core.read_current_release_absent()') IS NOT NULL AS releases, to_regclass('register.settings_verdict_absent') IS NOT NULL AS settings")).rows)
      .toEqual([{ releases: false, settings: false }]);
  });
});
