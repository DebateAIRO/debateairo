import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { RELEASE_KEY_PATTERN, TypedDomainError, parseReleaseKey } from "@debateai/kernel";
import { previewModelRowForRef } from "@debateai/providers";
import { SETTINGS_CHECKER, SETTINGS_CHECK_LINE_KIND, type SettingsCheckReport } from "@debateai/register";
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

/** A model a version can seat, and the gate (provider) its calls go through. */
export type SettingsGateModel = Readonly<{ ref: string; gate: string; model: string }>;

/**
 * The reads the live condition 6 makes. Today (S15) every role ref the version names (synthesizer, evaluator, storyteller,
 * story checker), read with the register's own readers at the version, as check-version reads them. SA10 (addition D21)
 * widens it to every seatable model of the version: it replaces `readGateModels` and nothing else.
 */
export type ActivationReaders = Readonly<{
  /** Each model the version can seat with its gate; an unreviewed ref is SETTINGS_GATE_UNREVIEWED:<ref> (in `unreviewed`). */
  readGateModels: (client: SettingsOperatorClient, version: number) => Promise<Readonly<{
    models: readonly SettingsGateModel[];
    unreviewed: readonly string[];
  }>>;
}>;

/** The S15 reader: the four role refs at the version, each mapped to its reviewed preview row (provider = gate). */
export async function readRoleRefGateModels(client: SettingsOperatorClient, version: number): Promise<Readonly<{
  models: readonly SettingsGateModel[];
  unreviewed: readonly string[];
}>> {
  // The runner half's own reader (check-version, S14), over this one connection: it only runs `query`.
  const refs = await readRunnerRoleRefs(client as unknown as Pool, version);
  const models: SettingsGateModel[] = [];
  const unreviewed: string[] = [];
  for (const ref of new Set(refs)) {
    const row = previewModelRowForRef(ref);
    if (row === undefined) unreviewed.push(ref);
    else models.push(Object.freeze({ ref, gate: row.provider, model: row.model }));
  }
  return Object.freeze({ models: Object.freeze(models), unreviewed: Object.freeze(unreviewed) });
}

export const ACTIVATION_READERS: ActivationReaders = Object.freeze({ readGateModels: readRoleRefGateModels });

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
/** A report code: S14's shape (`CODE` or `CODE:<detail>`), printable ASCII, no space. */
const REPORT_CODE = /^[A-Z][A-Z0-9_]{2,}(?::[!-~]{1,240})?$/u;
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
  if (!Array.isArray(codes) || codes.some((code) => typeof code !== "string" || !REPORT_CODE.test(code))) throw reportInvalid();
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
 * Condition 6, live (plan D6/D9, addition D21): each model the version can seat must be switched on at its gate now
 * (`/remaining`'s `enabled_models`). An unreviewed ref, a gate with no answer, or a model its gate does not serve each
 * add their code; all of them refuse together (SETTINGS_GATE_LIVE_CHECK_FAILED with `codes`).
 */
async function assertGatesServe(client: SettingsOperatorClient, version: number, gates: GateEnabledModels, readers: ActivationReaders): Promise<void> {
  const { models, unreviewed } = await readers.readGateModels(client, version);
  const codes = unreviewed.map((ref) => `SETTINGS_GATE_UNREVIEWED:${ref}`);
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
 *   4. condition 6 live, when gate answers are given (the preview: every gate's `/remaining`);
 *   5. `SELECT register.activate_settings_version($1,$2,$3,$4,$5)` inside `BEGIN ISOLATION LEVEL READ COMMITTED` … `COMMIT`
 *      (0124 requires READ COMMITTED), with the pointer and the release read in step 2 as the expected values.
 * The database's refusals keep their codes (by SQLSTATE and code): SETTINGS_ACTIVATION_CONFLICT (40001),
 * SETTINGS_VERSION_KIND_INVALID / SETTINGS_ACTIVATION_UNCHANGED (22023), SETTINGS_VERSION_NOT_PASSED (55000); a 22023
 * with DETAIL READ_COMMITTED_REQUIRED is SETTINGS_ACTIVATION_ISOLATION_INVALID (never expected: step 5 sets it).
 */
export async function activateSettingsVersion(
  client: SettingsOperatorClient,
  input: Readonly<{ version: number; activatedBy: string; reason: string; gateEnabledModels?: GateEnabledModels }>,
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
  if (input.gateEnabledModels !== undefined) await assertGatesServe(client, input.version, input.gateEnabledModels, readers);
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
