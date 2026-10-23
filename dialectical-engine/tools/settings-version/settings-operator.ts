import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { RELEASE_KEY_PATTERN, TypedDomainError, parseReleaseKey } from "@debateai/kernel";
import { parsePreviewEnvironmentConfig } from "@debateai/providers";
import {
  SETTINGS_CHECKER,
  SETTINGS_CHECK_LINE_KIND,
  isSettingsCheckCode,
  readSealedPreviewLineUp,
  settingsSeatableGateModels,
  settingsSeatableModels,
  settingsVersionLineUp,
  type SealedPreviewLineUp,
  type SettingsCheckReport
} from "@debateai/register";
import { readRunnerRoleRefs } from "../../apps/runner/src/settings-check.js";

/**
 * Side-by-side spec §13 "Activating a settings version" and §11 (rollback) — S15, THE OPERATOR MODULE.
 *
 * Plain words: the owner changes debate settings without an upload in three steps: check a sealed version against the
 * live release (S14's two dry-boot halves), record the verdict, activate it. This module is what the operator commands
 * (`tools/settings-version/cli.ts`: verdict, activate, status, latest-passed, switch-plan) and the release switch's
 * settings step decide with. It is the ONE operator module allowed to read the activation pointer
 * (`register.read_active_settings_version()`, plan D8; S16 pins it): the activation's compare-and-swap and the switch's
 * both need the value the operator saw. Every write is one of 0124's definer functions; nothing here edits a row.
 *
 * Its database connection is the release writers' (the operator principal; on the preview root as `postgres` through the
 * local socket), never a runtime login. Lines it prints are operator receipts: codes, keys, version numbers, digests.
 */

/** A connection the module reads and writes through: a pool client (one transaction at a time) or a test fake. */
export type SettingsOperatorClient = Pick<PoolClient, "query">;

/** The verdict a check produced: both halves of one (release, version), and the digest that ties the record to them. */
export type SettingsVerdict = Readonly<{ releaseKey: string; version: number; verdict: "PASS" | "FAIL"; digest: string }>;

/** What `settings:status` prints: the live release, the pointer (null = never activated) and what new asks use. */
export type SettingsStatus = Readonly<{
  currentRelease: string | null;
  pointer: number | null;
  /** The pointer, or the current release's own site version while nothing was ever activated (D1); null with no release. */
  effectiveActive: number | null;
  /** Every version the current release has passed: its site version and its latest-PASS verdicts, ascending. */
  passed: readonly number[];
}>;

/** One gate's live answer, as condition 6 reads it: the models it serves now (`/remaining`'s `enabled_models`). */
export type GateEnabledModels = Readonly<Record<string, readonly string[]>>;

/** A model a version can seat, and the gate (provider) its calls go through (`ref`: the seat ref, when one named it). */
export type SettingsGateModel = Readonly<{ ref?: string; gate: string; model: string }>;

/**
 * Addition D21 (SA10): what the live check needs of the release's own environment to know a version's seatable set:
 * the env's line-up (the two old forms of PREVIEW_PROVIDER_TEST_CONFIG_JSON carry one; null for the sockets-only form),
 * which a version without the row runs on, and the models the release's declared targets serve (the structure-repair
 * model is seatable when one of them serves it). The root wiring reads both from the release's API env file and hands
 * them over as one file (`--seatable-env`, parseSeatableEnvironment).
 */
export type SettingsSeatableEnvironment = Readonly<{ envLineUp: SealedPreviewLineUp | null; declaredModels: readonly string[] }>;

/**
 * The reads the live condition 6 makes (addition D21, SA10): every model the version can SEAT (its seatable set, the
 * same rule check-version's runner half applies: both rosters, the four seats' models, the structure-repair model when a
 * declared target serves it), not only the four seats (S15). `refusals` are codes found while reading (a row-less
 * version with no env line-up: PREVIEW_LINE_UP_REQUIRED).
 */
export type ActivationReaders = Readonly<{
  /** Each model the version can seat with its gate; an unreviewed ref or model is SETTINGS_GATE_UNREVIEWED (in `unreviewed`). */
  readGateModels: (client: SettingsOperatorClient, version: number, environment: SettingsSeatableEnvironment) => Promise<Readonly<{
    models: readonly SettingsGateModel[];
    unreviewed: readonly string[];
    refusals?: readonly string[];
  }>>;
}>;

/** The two register reads the seatable set is built from (the defaults below; unit tests hand fakes of these alone). */
export type SeatableVersionReads = Readonly<{
  readSeatRefs: (client: SettingsOperatorClient, version: number) => Promise<readonly string[]>;
  readLineUp: (client: SettingsOperatorClient, version: number) => Promise<SealedPreviewLineUp | null>;
}>;

/**
 * The SA10 reader (addition D21): the version's seatable set over this one connection — its four seat refs and its
 * line-up as sealed (its row, else the env's: `settingsVersionLineUp`; neither: PREVIEW_LINE_UP_REQUIRED), with the
 * declared models (`settingsSeatableModels`, check-version's rule) — each reviewed model with its gate (provider = gate).
 */
export function seatableGateModelsReader(reads: SeatableVersionReads): ActivationReaders["readGateModels"] {
  return async (client, version, environment) => {
    const seatRefs = await reads.readSeatRefs(client, version);
    const lineUp = settingsVersionLineUp(await reads.readLineUp(client, version), environment.envLineUp);
    const seatable = settingsSeatableModels({
      lineUp: lineUp ?? { free_model_ids: [], premium_model_ids: [], thinking_levels: null }, seatRefs, declaredModels: environment.declaredModels
    });
    const { models, unreviewed } = settingsSeatableGateModels(seatable);
    return Object.freeze({ models, unreviewed, refusals: Object.freeze(lineUp === null ? ["PREVIEW_LINE_UP_REQUIRED"] : []) });
  };
}

/**
 * The register reads at the version: the seat refs by the runner half's own reader (check-version, S14; over this one
 * connection, it only runs `query`), the line-up row as sealed (shape only, `readSealedPreviewLineUp`).
 */
export const SEATABLE_VERSION_READS: SeatableVersionReads = Object.freeze({
  readSeatRefs: (client: SettingsOperatorClient, version: number) => readRunnerRoleRefs(client as unknown as Pool, version),
  readLineUp: (client: SettingsOperatorClient, version: number) => readSealedPreviewLineUp(client, version)
});

export const ACTIVATION_READERS: ActivationReaders = Object.freeze({ readGateModels: seatableGateModelsReader(SEATABLE_VERSION_READS) });

const SEATABLE_ENV_SCHEMA = "preview-settings-seatable-env-v1";
const SEATABLE_ENV_KEYS = Object.freeze(["declaredModels", "previewConfig", "schema"]);
/**
 * The root wiring's `--seatable-env` file (deploy/preview-lifecycle/v1/settings-version.mjs): exactly
 * `{"schema":"preview-settings-seatable-env-v1","previewConfig":<the API env's PREVIEW_PROVIDER_TEST_CONFIG_JSON text>,
 * "declaredModels":[<each declared target's model>, at least one]}`. The config text is read by the env's own parser
 * (`parsePreviewEnvironmentConfig`, so the three forms cannot drift); anything else is SETTINGS_SEATABLE_ENV_INVALID —
 * an empty model list included: a wrong file must never shrink the seatable set silently (SA10 fix round 1).
 */
export function parseSeatableEnvironment(text: string): SettingsSeatableEnvironment {
  const refusedEnv = (): SettingsOperatorRefusal => new SettingsOperatorRefusal("SETTINGS_SEATABLE_ENV_INVALID",
    "The release's line-up and target models could not be read from the hand-over file");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw refusedEnv(); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw refusedEnv();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== SEATABLE_ENV_KEYS.join(",") || row.schema !== SEATABLE_ENV_SCHEMA) throw refusedEnv();
  const models = row.declaredModels;
  if (!Array.isArray(models) || models.length === 0 || models.some((model) => typeof model !== "string" || model.length === 0)) throw refusedEnv();
  if (typeof row.previewConfig !== "string") throw refusedEnv();
  let envLineUp: SealedPreviewLineUp | null;
  try { envLineUp = parsePreviewEnvironmentConfig(row.previewConfig)?.envLineUp ?? null; } catch { throw refusedEnv(); }
  return Object.freeze({ envLineUp, declaredModels: Object.freeze([...new Set(models as string[])]) });
}

/**
 * The module's refusals: a typed code (the house class) plus what the operator line needs, content-free. `codes` lists
 * every condition-6 finding (sorted, unique); `passed` the versions a release has passed (an operator hint).
 */
export class SettingsOperatorRefusal extends TypedDomainError {
  readonly codes: readonly string[];
  readonly passed: readonly number[] | undefined;
  constructor(code: string, message: string, extra: Readonly<{ codes?: readonly string[]; passed?: readonly number[] }> = {}) {
    super(code, message);
    this.name = "SettingsOperatorRefusal";
    this.codes = Object.freeze([...new Set(extra.codes ?? [])].sort());
    this.passed = extra.passed === undefined ? undefined : Object.freeze([...extra.passed]);
  }
}

const reportInvalid = (): SettingsOperatorRefusal =>
  new SettingsOperatorRefusal("SETTINGS_CHECK_REPORT_INVALID", "A check-version report line is not exactly what a half prints");

// --- The verdict -----------------------------------------------------------------------------------------------------

const REPORT_KEYS = Object.freeze(["half", "releaseKey", "version", "verdict", "codes", "snapshotSha256", "checker"]);
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * S14's line, read strictly (`settingsCheckLine` in packages/register/src/settings-check-report.ts): the kind, one space,
 * one compact JSON object with exactly the report's seven keys in its order (as JSON.stringify prints it), an optional
 * final newline. The half, a well-formed
 * release key, the version as a positive safe JSON integer, PASS exactly when the codes (sorted, unique, code-shaped) are
 * empty, the snapshot digest or null, this checker. Anything else is SETTINGS_CHECK_REPORT_INVALID.
 */
export function parseSettingsCheckLine(line: string): SettingsCheckReport {
  if (typeof line !== "string") throw reportInvalid();
  const text = line.endsWith("\n") ? line.slice(0, -1) : line;
  const prefix = `${SETTINGS_CHECK_LINE_KIND} `;
  if (!text.startsWith(prefix) || /[\r\n]/u.test(text)) throw reportInvalid();
  const body = text.slice(prefix.length);
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw reportInvalid(); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw reportInvalid();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== REPORT_KEYS.length || keys.some((key, index) => key !== REPORT_KEYS[index])) throw reportInvalid();
  const { half, releaseKey, version, verdict, codes, snapshotSha256, checker } = row;
  if (half !== "runner" && half !== "api") throw reportInvalid();
  if (typeof releaseKey !== "string" || !RELEASE_KEY_PATTERN.test(releaseKey)) throw reportInvalid();
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw reportInvalid();
  if (verdict !== "PASS" && verdict !== "FAIL") throw reportInvalid();
  if (!Array.isArray(codes) || codes.some((code) => !isSettingsCheckCode(code))) throw reportInvalid();
  const sorted = [...new Set(codes as string[])].sort();
  if (sorted.length !== codes.length || sorted.some((code, index) => code !== codes[index])) throw reportInvalid();
  if ((verdict === "PASS") !== (codes.length === 0)) throw reportInvalid();
  if (snapshotSha256 !== null && (typeof snapshotSha256 !== "string" || !SHA256_HEX.test(snapshotSha256))) throw reportInvalid();
  if (checker !== SETTINGS_CHECKER) throw reportInvalid();
  // Byte for byte S14's compact JSON (no extra space, no other escaping): the line is exactly what a half prints.
  if (JSON.stringify(row) !== body) throw reportInvalid();
  return Object.freeze({
    half,
    releaseKey,
    version,
    verdict,
    codes: Object.freeze(sorted),
    snapshotSha256: snapshotSha256 as string | null,
    checker
  });
}

/**
 * The lines of one half's output file: exactly one DEBATEAI_SETTINGS_CHECK line and nothing else but empty lines. A
 * half reported twice, an unknown line or none is SETTINGS_CHECK_REPORT_INVALID.
 */
export function parseSettingsCheckOutput(text: string): SettingsCheckReport {
  if (typeof text !== "string") throw reportInvalid();
  const lines = text.split("\n").filter((line) => line.length > 0);
  if (lines.length !== 1) throw reportInvalid();
  return parseSettingsCheckLine(lines[0]!);
}

/** Sorted-key JSON (arrays in order): equal values always print equal, whatever order they were written in. */
export function canonicalSettingsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSettingsJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalSettingsJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Side-by-side spec §13: the verdict of one check — PASS only when both halves PASS. The runner half must say `runner`,
 * the API half `api`, and both must name the same release key, the same version and the same sealed snapshot (S14 ties
 * each half to the version's sealed rows), else SETTINGS_CHECK_REPORT_INVALID. The digest is the sha256 of the canonical
 * JSON of { releaseKey, version, runner, api } (both whole reports), so a recorded verdict names exactly what it judged.
 */
export function settingsVerdictOf(runner: SettingsCheckReport, api: SettingsCheckReport): SettingsVerdict {
  if (runner.half !== "runner" || api.half !== "api") throw reportInvalid();
  if (runner.releaseKey !== api.releaseKey || runner.version !== api.version || runner.snapshotSha256 !== api.snapshotSha256) {
    throw reportInvalid();
  }
  const digest = createHash("sha256")
    .update(canonicalSettingsJson({ releaseKey: runner.releaseKey, version: runner.version, runner, api }), "utf8")
    .digest("hex");
  return Object.freeze({
    releaseKey: runner.releaseKey,
    version: runner.version,
    verdict: runner.verdict === "PASS" && api.verdict === "PASS" ? "PASS" as const : "FAIL" as const,
    digest
  });
}

/** Every code both halves met, sorted and unique (the verdict line's `codes`; empty on a PASS). */
export function settingsVerdictCodes(runner: SettingsCheckReport, api: SettingsCheckReport): readonly string[] {
  return Object.freeze([...new Set([...runner.codes, ...api.codes])].sort());
}

// --- Database errors -------------------------------------------------------------------------------------------------

type DatabaseError = Readonly<{ code?: unknown; message?: unknown; detail?: unknown }>;
const databaseError = (error: unknown): DatabaseError =>
  typeof error === "object" && error !== null ? error as DatabaseError : {};
/** A 0124 refusal by its SQLSTATE and its message (the code), never the message alone (S1's deferred minor). */
const refusedAs = (error: unknown, sqlState: string, code: string): boolean => {
  const shape = databaseError(error);
  return shape.code === sqlState && shape.message === code;
};

/** register.record_settings_verdict (0124, the verdict log's one writer); SETTINGS_VERDICT_INVALID (22023) stays typed. */
export async function recordSettingsVerdict(client: SettingsOperatorClient, verdict: SettingsVerdict): Promise<void> {
  try {
    await client.query("SELECT register.record_settings_verdict($1::text, $2::bigint, $3::text, $4::text)",
      [verdict.releaseKey, verdict.version, verdict.verdict, verdict.digest]);
  } catch (error) {
    if (refusedAs(error, "22023", "SETTINGS_VERDICT_INVALID")) {
      throw new SettingsOperatorRefusal("SETTINGS_VERDICT_INVALID", "The database refused the verdict (key, version, word or digest)");
    }
    throw error;
  }
}

// --- Reads -----------------------------------------------------------------------------------------------------------

const VERSION_TEXT = /^[1-9][0-9]{0,15}$/u;
/** A bigint column read as text: a positive safe integer, or null for SQL NULL; anything else is a broken read. */
function versionOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const version = VERSION_TEXT.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new TypeError("SETTINGS_VERSION_READ_INVALID");
  return version;
}
/** A release's own site version, the number in its key (D1); null for anything that is not a release key. */
export function siteVersionOfRelease(releaseKey: string | null): number | null {
  if (releaseKey === null || !RELEASE_KEY_PATTERN.test(releaseKey)) return null;
  return parseReleaseKey(releaseKey).siteVersion;
}

async function readCurrentRelease(client: SettingsOperatorClient): Promise<string | null> {
  const result = await client.query<{ release_key: string }>("SELECT c.release_key FROM core.read_current_release() AS c");
  const key = result.rows[0]?.release_key ?? null;
  if (result.rows.length > 1 || (key !== null && !RELEASE_KEY_PATTERN.test(key))) throw new TypeError("SETTINGS_CURRENT_RELEASE_READ_INVALID");
  return key;
}
/** The pointer (plan D8: this module is the operator's one reader). */
async function readPointer(client: SettingsOperatorClient): Promise<number | null> {
  const result = await client.query<{ pointer: string | null }>("SELECT register.read_active_settings_version()::text AS pointer");
  return versionOf(result.rows[0]?.pointer ?? null);
}
async function readPassed(client: SettingsOperatorClient, releaseKey: string): Promise<readonly number[]> {
  const result = await client.query<{ v: string }>("SELECT v::text AS v FROM register.read_passed_settings_versions($1::text) AS v", [releaseKey]);
  return Object.freeze(result.rows.map((row) => versionOf(row.v)!));
}

/** settings:status: the current release, the pointer, what new asks use, and what the current release has passed. */
export async function readSettingsStatus(client: SettingsOperatorClient): Promise<SettingsStatus> {
  const currentRelease = await readCurrentRelease(client);
  const pointer = await readPointer(client);
  return Object.freeze({
    currentRelease,
    pointer,
    effectiveActive: pointer ?? siteVersionOfRelease(currentRelease),
    passed: currentRelease === null ? Object.freeze([]) : await readPassed(client, currentRelease)
  });
}

/**
 * Spec §11 (rollback): the version a rollback to `releaseKey` activates — that release's most recent PASS (by
 * `checked_at`) whose latest verdict is still PASS; with none, the release's own site version (D1: the case of T, which
 * has no check-version at all).
 */
export async function latestPassedSettingsVersion(client: SettingsOperatorClient, releaseKey: string): Promise<number> {
  const site = siteVersionOfRelease(releaseKey);
  if (site === null) throw new SettingsOperatorRefusal("SETTINGS_OPERATOR_USAGE", "A release key is r<site settings version>-<12 lowercase hex>");
  const result = await client.query<{ v: string }>(
    `SELECT latest.register_version::text AS v
       FROM (SELECT DISTINCT ON (verdict_row.register_version) verdict_row.register_version, verdict_row.verdict, verdict_row.checked_at
               FROM register.settings_verdict AS verdict_row
              WHERE verdict_row.release_key = $1::text
              ORDER BY verdict_row.register_version, verdict_row.checked_at DESC) AS latest
      WHERE latest.verdict = 'PASS'
      ORDER BY latest.checked_at DESC
      LIMIT 1`,
    [releaseKey]
  );
  return versionOf(result.rows[0]?.v ?? null) ?? site;
}

// --- The switch's settings step ----------------------------------------------------------------------------------------

/**
 * Spec §13/§11, the release switch's settings step: what the switch passes to `core.record_release_switch` as
 * `p_expected_active_settings` (the pointer now; 0124's hook refuses any other value) and which version, if any, the
 * same transaction activates right after it (`register.activate_settings_version`), so the deferred check of 0124 passes
 * at COMMIT. In order:
 *   - `activate` given: the new release must have passed it (else SETTINGS_VERSION_NOT_PASSED, naming what it passed);
 *     already the pointer: nothing to activate;
 *   - no pointer yet: the new release's own site version is activated (owner answer Q-S2: settings:status shows a real
 *     row from the first T+1 switch on; no behaviour difference, D1);
 *   - the new release has passed the pointer: nothing to activate;
 *   - else SETTINGS_VERSION_NOT_PASSED, naming the versions the new release has passed (the operator re-plans the switch
 *     with `--activate <v>`).
 */
export async function settingsForSwitch(client: SettingsOperatorClient, input: Readonly<{ newRelease: string; activate?: number }>):
  Promise<Readonly<{ expectedActiveSettings: number | null; activate: number | null }>> {
  const site = siteVersionOfRelease(input.newRelease);
  if (site === null || (input.activate !== undefined && (!Number.isSafeInteger(input.activate) || input.activate < 1))) {
    throw new SettingsOperatorRefusal("SETTINGS_OPERATOR_USAGE", "switch-plan takes a release key and an optional positive version");
  }
  const pointer = await readPointer(client);
  const passed = await readPassed(client, input.newRelease);
  const notPassed = (): SettingsOperatorRefusal => new SettingsOperatorRefusal("SETTINGS_VERSION_NOT_PASSED",
    "The new release has not passed that settings version; plan the switch with --activate <a version it passed>", { passed });
  let activate: number | null;
  if (input.activate !== undefined) {
    if (!passed.includes(input.activate)) throw notPassed();
    activate = input.activate === pointer ? null : input.activate;
  } else if (pointer === null) {
    activate = site;
  } else if (passed.includes(pointer)) {
    activate = null;
  } else {
    throw notPassed();
  }
  return Object.freeze({ expectedActiveSettings: pointer, activate });
}

// --- The activation ----------------------------------------------------------------------------------------------------

/** `activated_by`'s CHECK in 0124, exactly (no ':' — S1's deferred minor): validated before anything is read or written. */
export const ACTIVATED_BY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,127}$/u;
const usage = (message: string): SettingsOperatorRefusal => new SettingsOperatorRefusal("SETTINGS_OPERATOR_USAGE", message);

/** `--by` and `--reason`, exactly as 0124's CHECKs take them: a label, and one line of 1..512 characters. */
export function assertActivationLabels(activatedBy: unknown, reason: unknown): void {
  if (typeof activatedBy !== "string" || !ACTIVATED_BY_PATTERN.test(activatedBy)) {
    throw usage("--by is a name of letters, digits, space . _ @ - (no colon), at most 128 characters");
  }
  if (typeof reason !== "string" || reason.length < 1 || reason.length > 512 || /[\u0000-\u001f\u007f-\u009f]/u.test(reason)) {
    throw usage("--reason is one line of 1 to 512 characters");
  }
}

/**
 * Condition 6, live (plan D6/D9, addition D21): each model the version can SEAT (its seatable set, SA10) must be
 * switched on at its gate now (`/remaining`'s `enabled_models`). An unreviewed ref or model, a gate with no answer, a
 * model its gate does not serve, or a missing line-up each add their code; all of them refuse together
 * (SETTINGS_GATE_LIVE_CHECK_FAILED with `codes`). THE ONE live check: the activation (`activateSettingsVersion`) and a
 * forward release switch's `--activate <v>` (`cli.ts gate-check`, ruling R60) both run it. The gate-code fingerprint
 * half of D21 (the gates run this release's helper, so equal menus and bounds) is the root wiring's: it reads root-only
 * files (settings-version.mjs).
 */
export async function assertSettingsGatesServe(client: SettingsOperatorClient, input: Readonly<{
  version: number; gateEnabledModels: GateEnabledModels; seatableEnvironment: SettingsSeatableEnvironment;
}>, readers: ActivationReaders = ACTIVATION_READERS): Promise<void> {
  const gates = input.gateEnabledModels;
  const { models, unreviewed, refusals } = await readers.readGateModels(client, input.version, input.seatableEnvironment);
  const codes = [...(refusals ?? []), ...unreviewed.map((ref) => `SETTINGS_GATE_UNREVIEWED:${ref}`)];
  for (const { gate, model } of models) {
    const enabled = Object.hasOwn(gates, gate) ? gates[gate] : undefined;
    if (enabled === undefined) codes.push(`SETTINGS_GATE_UNANSWERED:${gate}`);
    else if (!enabled.includes(model)) codes.push(`SETTINGS_GATE_MODEL_DISABLED:${gate}:${model}`);
  }
  if (codes.length > 0) {
    throw new SettingsOperatorRefusal("SETTINGS_GATE_LIVE_CHECK_FAILED", "A model this version can seat is not switched on at its gate", { codes });
  }
}

/**
 * Spec §13 `activate <v>`. In order, nothing written until the last step:
 *   1. `--by` and `--reason` as 0124's CHECKs take them (SETTINGS_OPERATOR_USAGE);
 *   2. the current release (core.read_current_release) and the pointer; no current release: SETTINGS_ACTIVATION_CONFLICT;
 *   3. an early plain refusal when the current release has not passed `v` (register.settings_version_passed; the
 *      database refuses again anyway): SETTINGS_VERSION_NOT_PASSED, naming what it passed;
 *   4. condition 6 live, ALWAYS (ruling R59), over the version's whole seatable set (SA10, `assertSettingsGatesServe`;
 *      `seatableEnvironment`, required, is the release's env line-up and declared models): every gate's
 *      `/remaining` answer that was read; a gate with no answer refuses the models it serves (no answers at all =
 *      everything refused, never "skip the check"). The public server,
 *      which has no preview gates, has no settings operator until Phase 3 (R58): that phase decides its exemption from
 *      the release's deployment; this module has no opt-out;
 *   5. `SELECT register.activate_settings_version($1,$2,$3,$4,$5)` inside `BEGIN ISOLATION LEVEL READ COMMITTED` … `COMMIT`
 *      (0124 requires READ COMMITTED), with the pointer and the release read in step 2 as the expected values.
 * The database's refusals keep their codes (by SQLSTATE and code): SETTINGS_ACTIVATION_CONFLICT (40001),
 * SETTINGS_VERSION_KIND_INVALID / SETTINGS_ACTIVATION_UNCHANGED (22023), SETTINGS_VERSION_NOT_PASSED (55000); a 22023
 * with DETAIL READ_COMMITTED_REQUIRED is SETTINGS_ACTIVATION_ISOLATION_INVALID (never expected: step 5 sets it).
 */
export async function activateSettingsVersion(
  client: SettingsOperatorClient,
  input: Readonly<{
    version: number; activatedBy: string; reason: string; gateEnabledModels: GateEnabledModels; seatableEnvironment: SettingsSeatableEnvironment;
  }>,
  readers: ActivationReaders = ACTIVATION_READERS
): Promise<Readonly<{ activationSeq: string; previous: number | null; releaseKey: string }>> {
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw usage("activate takes one positive settings version");
  assertActivationLabels(input.activatedBy, input.reason);
  const currentRelease = await readCurrentRelease(client);
  if (currentRelease === null) {
    throw new SettingsOperatorRefusal("SETTINGS_ACTIVATION_CONFLICT", "No release is current yet: nothing can be activated");
  }
  const previous = await readPointer(client);
  const passedNow = await client.query<{ passed: boolean }>(
    "SELECT register.settings_version_passed($1::text, $2::bigint) AS passed", [currentRelease, input.version]);
  if (passedNow.rows[0]?.passed !== true) {
    throw new SettingsOperatorRefusal("SETTINGS_VERSION_NOT_PASSED",
      "The current release has not passed this version: run the check first", { passed: await readPassed(client, currentRelease) });
  }
  await assertSettingsGatesServe(client, {
    version: input.version, gateEnabledModels: input.gateEnabledModels, seatableEnvironment: input.seatableEnvironment
  }, readers);
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  let activationSeq: string;
  try {
    const result = await client.query<{ activation_seq: string }>(
      "SELECT register.activate_settings_version($1::bigint, $2::bigint, $3::text, $4::text, $5::text)::text AS activation_seq",
      [input.version, previous, currentRelease, input.activatedBy, input.reason]);
    activationSeq = String(result.rows[0]?.activation_seq ?? "");
    if (!VERSION_TEXT.test(activationSeq)) throw new TypeError("SETTINGS_ACTIVATION_READ_INVALID");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw activationRefusal(error);
  }
  return Object.freeze({ activationSeq, previous, releaseKey: currentRelease });
}

/** The database's activation refusals as typed codes (SQLSTATE and code, DETAIL for the isolation case); others pass through. */
function activationRefusal(error: unknown): unknown {
  const shape = databaseError(error);
  if (shape.code === "22023" && shape.detail === "READ_COMMITTED_REQUIRED") {
    return new SettingsOperatorRefusal("SETTINGS_ACTIVATION_ISOLATION_INVALID", "The activation ran outside READ COMMITTED");
  }
  if (refusedAs(error, "40001", "SETTINGS_ACTIVATION_CONFLICT")) {
    return new SettingsOperatorRefusal("SETTINGS_ACTIVATION_CONFLICT", "The release or the active version changed meanwhile: read the status and run it again");
  }
  if (refusedAs(error, "55000", "SETTINGS_VERSION_NOT_PASSED")) {
    return new SettingsOperatorRefusal("SETTINGS_VERSION_NOT_PASSED", "The current release has not passed this version");
  }
  if (refusedAs(error, "22023", "SETTINGS_ACTIVATION_UNCHANGED")) {
    return new SettingsOperatorRefusal("SETTINGS_ACTIVATION_UNCHANGED", "This version is already the active one");
  }
  if (refusedAs(error, "22023", "SETTINGS_VERSION_KIND_INVALID")) {
    return new SettingsOperatorRefusal("SETTINGS_VERSION_KIND_INVALID", "Only a sealed general settings version can be activated");
  }
  if (databaseError(error).code === "23514") return usage("--by or --reason does not fit the activation record");
  return error;
}
