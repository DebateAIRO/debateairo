import type { Pool } from "pg";
import { settingsRefusalCode } from "@debateai/db";

/**
 * Side-by-side spec §13 "Activation is refused unless" (S14) — THE CHECK-VERSION REPORT, one shape for both halves.
 *
 * Plain words: `check-version <v>` is the dry boot of one release against one sealed settings version, run twice: once
 * from the release's runner folder under its runner env (apps/runner/src/settings-check.ts) and once from its API folder
 * under its API env (apps/api/src/settings-check.ts). Neither half makes an AI call or writes anything. Each prints
 * exactly one line, `DEBATEAI_SETTINGS_CHECK <json>`, with PASS or FAIL and every refusal code it met; S15's verdict
 * command reads both lines (strictly) and records the verdict. This module holds what the two halves share: the report
 * and its line, the rule that turns a step's refusal into a code, the step runner, and the version facts both read.
 *
 * Codes are content-free (codes, row keys, member names, provider refs we mint): the line is an operator receipt.
 */

/** The journal line's kind (`DEBATEAI_SETTINGS_CHECK <json>`). */
export const SETTINGS_CHECK_LINE_KIND = "DEBATEAI_SETTINGS_CHECK" as const;
/** The checker's name and version, carried by every report (a later checker names itself anew). */
export const SETTINGS_CHECKER = "check-version-v1" as const;

export type SettingsCheckHalf = "runner" | "api";

/**
 * One half's report. `codes` are sorted and unique; `verdict` is PASS exactly when there are none. `snapshotSha256` is
 * the checked version's sealed snapshot digest (`register.register_version.snapshot_sha256`), so the verdict can tie both
 * halves to the same sealed rows; null when the version has none (an older or unknown version).
 */
export type SettingsCheckReport = Readonly<{
  half: SettingsCheckHalf;
  releaseKey: string;
  version: number;
  verdict: "PASS" | "FAIL";
  codes: readonly string[];
  snapshotSha256: string | null;
  checker: typeof SETTINGS_CHECKER;
}>;

/**
 * One independent step of a half: what it found, as codes (none = it held). A typed refusal the step throws is recorded
 * as its code (`settingsCheckRefusalCode`); anything else is not a finding but a failure to check (the CLI's exit 2).
 */
export type SettingsCheckStep = Readonly<{ name: string; run: () => Promise<readonly string[]> }>;

const CODE_WITH_DETAIL = /^[A-Z][A-Z0-9_]{2,}:[A-Za-z0-9_.:/-]+$/u;

/**
 * The code a check records for one refusal: the settings caches' own rule (`settingsRefusalCode`, ruling R31: a
 * TypedDomainError's code, or an Error whose whole message is a code), with the detail kept when a typed refusal's
 * message is exactly `<code>:<detail>` (e.g. SETTINGS_HASH_UNDECLARED:engineContractHash). A database failure and an
 * untyped error are null: never a finding.
 */
export function settingsCheckRefusalCode(error: unknown): string | null {
  const code = settingsRefusalCode(error);
  if (code === null) return null;
  if (error instanceof Error && error.message.startsWith(`${code}:`) && CODE_WITH_DETAIL.test(error.message)) {
    return error.message;
  }
  return code;
}

/**
 * Runs every step, one after another (one connection's worth of reads at a time), and returns every code found, in
 * step order. A step's typed refusal is its code and the next step still runs, so one run lists every problem; an
 * untyped error (a database failure included) propagates at once: the half could not check.
 */
export async function runSettingsCheckSteps(steps: readonly SettingsCheckStep[]): Promise<readonly string[]> {
  const codes: string[] = [];
  for (const step of steps) {
    try {
      codes.push(...await step.run());
    } catch (error) {
      const code = settingsCheckRefusalCode(error);
      if (code === null) throw error;
      codes.push(code);
    }
  }
  return Object.freeze(codes);
}

/** A half's report from what it found: codes sorted and unique, PASS exactly when there are none. */
export function settingsCheckReport(input: Readonly<{
  half: SettingsCheckHalf;
  releaseKey: string;
  version: number;
  codes: readonly string[];
  snapshotSha256: string | null;
}>): SettingsCheckReport {
  const codes = Object.freeze([...new Set(input.codes)].sort());
  return Object.freeze({
    half: input.half,
    releaseKey: input.releaseKey,
    version: input.version,
    verdict: codes.length === 0 ? "PASS" as const : "FAIL" as const,
    codes,
    snapshotSha256: input.snapshotSha256,
    checker: SETTINGS_CHECKER
  });
}

/**
 * The half's one line, keys in the report's order, the version as a JSON number:
 * `DEBATEAI_SETTINGS_CHECK {"half":"runner","releaseKey":"r18-…","version":18,"verdict":"PASS","codes":[],"snapshotSha256":"…","checker":"check-version-v1"}`.
 */
export function settingsCheckLine(report: SettingsCheckReport): string {
  const ordered = {
    half: report.half,
    releaseKey: report.releaseKey,
    version: report.version,
    verdict: report.verdict,
    codes: report.codes,
    snapshotSha256: report.snapshotSha256,
    checker: report.checker
  };
  return `${SETTINGS_CHECK_LINE_KIND} ${JSON.stringify(ordered)}\n`;
}

/** The register's own facts about one version, by its number only (never "the newest version"); null when unknown. */
export type SettingsVersionFacts = Readonly<{
  sealed: boolean;
  /** NULL for a version published before publication kinds existed (a general one), else GENERAL or SUPPORT. */
  publicationKind: string | null;
  snapshotSha256: string | null;
}>;

export async function readSettingsVersionFacts(pool: Pick<Pool, "query">, version: number): Promise<SettingsVersionFacts | null> {
  const result = await pool.query<{ sealed: boolean; publication_kind: string | null; snapshot_sha256: string | null }>(
    "SELECT sealed,publication_kind,snapshot_sha256 FROM register.register_version WHERE register_version=$1",
    [version]
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return Object.freeze({
    sealed: row.sealed === true,
    publicationKind: row.publication_kind,
    snapshotSha256: row.snapshot_sha256 === null ? null : String(row.snapshot_sha256).trim()
  });
}

const POSITIVE_INTEGER_TEXT = /^[1-9][0-9]{0,15}$/u;

/**
 * The CLI's one argument: the version, a positive integer written plainly (no sign, no leading zero, no flag; the
 * release key is the process's RELEASE_KEY, never an argument). Anything else is null: the CLI exits 2.
 */
export function parseSettingsCheckArguments(args: readonly string[]): number | null {
  if (args.length !== 1 || !POSITIVE_INTEGER_TEXT.test(args[0]!)) return null;
  const version = Number(args[0]);
  return Number.isSafeInteger(version) ? version : null;
}

const REASON_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;

/**
 * Why a half could not check, content-free: a typed code, the error's own code when it is code-shaped (a driver's
 * ECONNREFUSED, a SQLSTATE-free class name), else the error's class name. Never a message: a database error can carry a
 * connection string or a value.
 */
export function settingsCheckUnavailableReason(error: unknown): string {
  const code = settingsRefusalCode(error);
  if (code !== null) return code.split(":")[0]!;
  const own = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof own === "string" && REASON_CODE.test(own)) return own;
  return error instanceof Error && REASON_CODE.test(error.name.toUpperCase()) ? error.name.toUpperCase() : "UNKNOWN";
}

/**
 * Side-by-side spec §13 (S14) — ONE CHECK-VERSION COMMAND, either half. The argument first (no environment read for a
 * bad one); then `check(version)`, which loads the half's environment, opens its database and closes it. Exactly one
 * stdout line on a report — `DEBATEAI_SETTINGS_CHECK <json>` — and exit 0 (PASS) or 1 (FAIL); exit 2 when the half
 * could not check (a bad argument, an unreadable environment, an unreachable database, an untyped error), with one
 * content-free stderr line (`SETTINGS_CHECK_USAGE` or `SETTINGS_CHECK_UNAVAILABLE:<reason>`) and no report line.
 */
export async function runSettingsCheckCommand(input: Readonly<{
  args: readonly string[];
  output: Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
  check: (version: number) => Promise<SettingsCheckReport>;
}>): Promise<0 | 1 | 2> {
  const version = parseSettingsCheckArguments(input.args);
  if (version === null) {
    input.output.stderr("SETTINGS_CHECK_USAGE: one argument, the settings version (a positive integer)\n");
    return 2;
  }
  let report: SettingsCheckReport;
  try {
    report = await input.check(version);
  } catch (error) {
    input.output.stderr(`SETTINGS_CHECK_UNAVAILABLE:${settingsCheckUnavailableReason(error)}\n`);
    return 2;
  }
  input.output.stdout(settingsCheckLine(report));
  return report.verdict === "PASS" ? 0 : 1;
}
