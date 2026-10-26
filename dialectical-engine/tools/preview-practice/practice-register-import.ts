/**
 * Preview practice: copy the LIVE register into the throwaway database.
 *
 * Plain words: the practice must run on exactly the settings the live preview runs on. Root exports them read-only
 * from the live database into one JSON file, with the one SQL statement in README.md step S-1 (it lives only there,
 * because it is run by hand on the live database, never by code; tests/integration/preview-practice-run.test.ts runs
 * that very statement, read out of the README, and imports what it returns). This module puts exactly those versions into the
 * practice's own throwaway database, through the register's own publication paths:
 *  - versions 1 to 4 through the historical import (`importHistorical`), the path every fixture and the stage use;
 *  - every later GENERAL version through the general publication (`publishGeneral`, local deployment), on the base
 *    the export names, which allocates the same version number when the versions are imported in order;
 *  - a SUPPORT_CONFIGURATION version cannot be replayed through its own path (it needs the support publication's
 *    inputs, which the export does not carry), and the register is never written any other way (the register's
 *    own architecture law), so such an export is refused (PRACTICE_REGISTER_PATH_UNSUPPORTED).
 * Every version's rows are hashed (the register's own snapshot hash) and compared with the export's recorded hash
 * before and after the import, so the practice provably runs on the live bytes.
 *
 * `--register-next` (2026-10-12, register 12): the owner's rule is that a practice debate with all real AIs passes
 * BEFORE any upload, and an upload that brings new sealed prompts also needs a new register version, which only the
 * server's publish operation makes. So the practice can make that version itself, in its throwaway database, the way
 * the server will: `composePracticeNextRegisterVersion` runs the preview publish kit's own source build and composer
 * (`buildPreviewSourceRowsV2`, `composePreviewSnapshotV2` in deploy/preview-auth-dev/v1/publish-register-v2.ts) on top
 * of the exported newest version, with the newest version's own checker choice, role-rotation switch and measured
 * runtime (read back from its rows), and `importPracticeRegister` publishes the result through the same general
 * publication as one more version. The practice then runs on it, and its report names every row that changed, which
 * is the delta the owner will be shown for approval on the server (the server re-measures only its runtime row).
 *
 * Kit v3 (2026-10-14, the hosted preview): the server's `native-plan --operation plan --hosted-billing '<JSON>'`
 * composes with publish kit v3 (deploy/preview-auth-dev/v1/publish-register-v3.ts), the first hosted version on a
 * local base and every later version on a hosted one (a hosted base without the inputs refuses there,
 * HOSTED_BILLING_REQUIRED). `--register-next --hosted-billing '<JSON>'` does the same here:
 * `composePracticeHostedNextRegisterVersion` runs the kit's own `buildPreviewSourceRowsV3` and
 * `composePreviewSnapshotV3` (with its hosted boot questions) with the plan's inputs, the same JSON the plan takes,
 * checked first by the release tool's own validators in native-operator.mjs. Its checker, rotation and call-concurrency
 * inputs follow the PLAN's rules, not the base's (GLM, on, and the base's call-concurrency row carried, unless
 * `--checker`, `--role-rotation` or `--register-call-concurrency` say otherwise), so the same flags print the same
 * changed rows as the server's proposal; where those defaults move a row away from the base, the practice says so.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  canonicalRegisterJson,
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  DEBATE_SHAPE_POLICY_ROW_KEY,
  debateShapePolicyRow,
  ENGINE_VERSION_POLICY_ROW_KEY,
  engineVersionPolicyRow,
  LENGTH_GUIDANCE_POLICY_ROW_KEY,
  lengthGuidancePolicyRow,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  PREVIEW_LINE_UP_POLICY_ROW_KEY,
  previewLineUpPolicyFromValue,
  previewLineUpPolicyRow,
  type BootstrapRegister,
  type CallConcurrencyPolicy,
  type DebateShapePolicy,
  type EngineVersionPolicy,
  type LengthGuidancePolicy,
  type RegisterPublicationRow
} from "@debateai/register";
import type { PreviewLineUp } from "@debateai/providers";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import {
  buildPreviewSourceRowsV2,
  composePreviewSnapshotV2,
  PREVIEW_DEEPSEEK_CHECKER_ROLE_REF,
  PREVIEW_EVALUATOR_ROLE_REF,
  type PreviewCheckerChoice,
  type PreviewRoleRotationChoice
} from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import {
  buildPreviewSourceRowsV3,
  composePreviewSnapshotV3,
  STORY_COST_ENVELOPE_POLICY_ROW_KEY,
  type PreviewHostedBillingChoice
} from "../../deploy/preview-auth-dev/v1/publish-register-v3.js";
import { PRACTICE_LINE_UP_SOURCE_REF, PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_REGISTER_EXPORT_SCHEMA = "preview-practice-register-export-v1" as const;

export type PracticeRegisterExportVersion = Readonly<{
  register_version: string;
  row_count: number;
  sealed?: boolean;
  base_register_version: string | null;
  publication_id: string | null;
  request_sha256: string | null;
  snapshot_sha256: string | null;
  publication_kind: string | null;
  recorded_at: string | null;
}>;

export type PracticeRegisterExportRow = Readonly<{
  register_version: string;
  row_key: string;
  /** The jsonb value as PostgreSQL prints it (`value_json::text`); canonicalised on import. */
  value_json: string;
  source_ref: string;
}>;

export type PracticeRegisterExport = Readonly<{
  schema: typeof PRACTICE_REGISTER_EXPORT_SCHEMA;
  versions: readonly PracticeRegisterExportVersion[];
  rows: readonly PracticeRegisterExportRow[];
}>;

export class PracticeRegisterError extends Error {
  constructor(readonly code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "PracticeRegisterError";
  }
}

const SHA256 = /^[0-9a-f]{64}$/u;

/** Reads and checks the export file's shape. Anything unexpected refuses: the practice never guesses a register. */
export function parsePracticeRegisterExport(text: string): PracticeRegisterExport {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRegisterError("PRACTICE_REGISTER_EXPORT_INVALID", "not JSON"); }
  const bad = (detail: string): never => { throw new PracticeRegisterError("PRACTICE_REGISTER_EXPORT_INVALID", detail); };
  if (typeof value !== "object" || value === null || Array.isArray(value)) bad("not an object");
  const document = value as Record<string, unknown>;
  if (document.schema !== PRACTICE_REGISTER_EXPORT_SCHEMA) bad("schema");
  if (!Array.isArray(document.versions) || document.versions.length === 0) bad("versions");
  if (!Array.isArray(document.rows) || document.rows.length === 0) bad("rows");
  const versions = (document.versions as unknown[]).map((entry): PracticeRegisterExportVersion => {
    if (typeof entry !== "object" || entry === null) bad("version entry");
    const row = entry as Record<string, unknown>;
    const text = (key: string, nullable: boolean): string | null => {
      const member = row[key];
      if (member === null || member === undefined) return nullable ? null : bad(`version ${key}`);
      if (typeof member !== "string") return bad(`version ${key}`);
      return member;
    };
    const registerVersion = parseRegisterVersionText(text("register_version", false));
    if (typeof row.row_count !== "number" || !Number.isSafeInteger(row.row_count) || row.row_count < 1) bad("row_count");
    const snapshot = text("snapshot_sha256", true);
    if (snapshot !== null && !SHA256.test(snapshot.trim())) bad("snapshot_sha256");
    return Object.freeze({
      register_version: registerVersion, row_count: row.row_count as number,
      ...(typeof row.sealed === "boolean" ? { sealed: row.sealed } : {}),
      base_register_version: text("base_register_version", true), publication_id: text("publication_id", true),
      request_sha256: text("request_sha256", true), snapshot_sha256: snapshot === null ? null : snapshot.trim(),
      publication_kind: text("publication_kind", true), recorded_at: text("recorded_at", true)
    });
  });
  const rows = (document.rows as unknown[]).map((entry): PracticeRegisterExportRow => {
    if (typeof entry !== "object" || entry === null) bad("row entry");
    const row = entry as Record<string, unknown>;
    if (typeof row.register_version !== "string" || typeof row.row_key !== "string"
      || typeof row.value_json !== "string" || typeof row.source_ref !== "string") bad("row member");
    return Object.freeze({ register_version: parseRegisterVersionText(row.register_version), row_key: row.row_key as string,
      value_json: row.value_json as string, source_ref: row.source_ref as string });
  });
  // Compared as big integers, never converted to a JS number (the register's version law).
  const ordered = [...versions].sort((a, b) => {
    const left = BigInt(a.register_version);
    const right = BigInt(b.register_version);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (new Set(ordered.map((entry) => entry.register_version)).size !== ordered.length) bad("duplicate version");
  for (const row of rows) {
    if (!ordered.some((entry) => entry.register_version === row.register_version)) bad(`row of unknown version ${row.register_version}`);
  }
  return Object.freeze({ schema: PRACTICE_REGISTER_EXPORT_SCHEMA, versions: Object.freeze(ordered), rows: Object.freeze(rows) });
}

/** One version's rows in the register's own row form (canonical JSON text). */
export function practiceVersionRows(document: PracticeRegisterExport, version: string): readonly RegisterPublicationRow[] {
  return Object.freeze(document.rows.filter((row) => row.register_version === version)
    .sort((a, b) => (a.row_key < b.row_key ? -1 : a.row_key > b.row_key ? 1 : 0))
    .map((row) => Object.freeze({
      rowKey: row.row_key,
      valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.value_json, "utf8")),
      sourceRef: row.source_ref
    })));
}

/**
 * Addition D12, D14 (owner 2026-10-22): the line-up a version's rows carry (its previewLineUpPolicy row, read by the row's
 * own reader), or null without the row (ABSENT: the env's line-up). For the practice's start checks, before the database
 * starts: the export's newest version, or the code's next one with --register-next. A row the reader refuses is
 * PRACTICE_LINE_UP_INVALID with the reader's own code (as the live boot would refuse it).
 */
export function practiceRowsLineUp(rows: readonly RegisterPublicationRow[]): PreviewLineUp | null {
  const row = rows.find((entry) => entry.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY);
  if (row === undefined) return null;
  try { return previewLineUpPolicyFromValue(JSON.parse(row.valueJsonText)); } catch (error) {
    throw new PracticeRefusal("PRACTICE_LINE_UP_INVALID", `${PREVIEW_LINE_UP_POLICY_ROW_KEY}: ${error instanceof Error ? error.message.split(":")[0] : "UNKNOWN"}`);
  }
}

/** The snapshot hash of one version as it now stands in a database (the same function the publication uses). */
export async function databaseVersionSnapshotSha256(pool: Pool, version: string): Promise<string | null> {
  const result = await pool.query<{ row_key: string; value_json_text: string; source_ref: string }>(
    `SELECT row_key, value_json::text AS value_json_text, source_ref FROM register.register_row
      WHERE register_version=$1 ORDER BY row_key`, [version]);
  if (result.rows.length === 0) return null;
  return computeRegisterSnapshotSha256(result.rows.map((row) => Object.freeze({
    rowKey: row.row_key, valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8")), sourceRef: row.source_ref
  })));
}

export type PracticeRegisterImportStep = Readonly<{
  registerVersion: string;
  rowCount: number;
  snapshotSha256: string;
  path: "ALREADY_PRESENT" | "HISTORICAL_IMPORT" | "GENERAL_PUBLICATION" | "CODE_NEXT_VERSION";
}>;

/** The code's next version, composed by the preview publish kit on the exported newest version. */
export type PracticeNextRegisterVersion = Readonly<{
  baseRegisterVersion: string;
  baseSnapshotSha256: string;
  rows: readonly RegisterPublicationRow[];
  snapshotSha256: string;
  addedKeys: readonly string[];
  changedKeys: readonly string[];
  /** The delta's own hash, as the server's proposal prints it (`deltaSha256`); the server's differs by its runtime row. */
  deltaSha256: string;
  checker: "glm" | "deepseek";
  roleRotation: PreviewRoleRotationChoice;
  /** Kit v3 only: the composer the server's proposal names, the plan's hosted inputs, and what the defaults moved. */
  composer?: "preview-register-composer-v3";
  hostedBilling?: PreviewHostedBillingChoice;
  /** Plain lines: where the plan's defaults (GLM, rotation on) move a row away from the base's choice. */
  notes?: readonly string[];
}>;

/**
 * The plan's three optional choices (release-artifacts.mjs native-plan `--checker`/`--deepseek-enabled-on-gate`,
 * `--role-rotation`, `--call-concurrency`), as the practice's `--checker`, `--deepseek-enabled-on-gate`,
 * `--role-rotation` and `--register-call-concurrency` give them. Absent: kit v2 reads the base's choice (as before);
 * kit v3 takes the plan's default (GLM, on, the base's call-concurrency row carried).
 */
export type PracticeNextRegisterChoices = Readonly<{
  checker?: PreviewCheckerChoice;
  roleRotation?: PreviewRoleRotationChoice;
  callConcurrency?: CallConcurrencyPolicy;
  /**
   * `--shape-policy` with `--register-next` (controller ruling D-REGNEXT): handed to the kit's own source build as its
   * `debateShape` (kit v2 directly, kit v3 through kit v2, as the plan's `--debate-shape`), so the code's next version
   * carries the row exactly as the server's publish would. Absent: no row from the code (a base's own row is carried
   * unchanged, R19).
   */
  debateShape?: DebateShapePolicy;
  /** `--length-policy` with `--register-next` (LG-C): the kit's own source build's `lengthGuidance`, as the plan's `--length-guidance`. */
  lengthGuidance?: LengthGuidancePolicy;
  /**
   * `--engine-policy` with `--register-next` (R1d, INTERFACE §15.1): the kit's own source build's `engineVersion`
   * (Task 8's trailing parameter of buildPreviewSourceRowsV2 / V3), as the server's plan would carry it. Absent: no row
   * from the code (a base's own row is carried unchanged).
   */
  engineVersion?: EngineVersionPolicy;
  /**
   * `--line-up` with `--register-next` (side-by-side spec §13, addition D23): the kit's own source build's `lineUp` (kit
   * v2's tenth argument, kit v3's eleventh), as the plan's `--line-up` would carry it. Absent: no row from the code (a
   * base's own row is carried unchanged, R19).
   */
  lineUp?: PreviewLineUp;
}>;

export type PracticeRegisterImportReceipt = Readonly<{
  /**
   * The version the debate ran on. As the import returns it: the export's newest version, or the code's next one
   * (`--register-next`). In a debate's report, after `--shape-policy` published the practice's own version on top, that
   * version (final review M-2), and the imported newest version moves to `importedRegisterVersion`.
   */
  registerVersion: string;
  /** Only when the practice's own debate-shape version was published on top: the newest version the import brought in. */
  importedRegisterVersion?: string;
  steps: readonly PracticeRegisterImportStep[];
  /** Present when the practice runs on the code's next version (`--register-next`): what that version changed. */
  codeNext?: Readonly<{ baseRegisterVersion: string; addedKeys: readonly string[]; changedKeys: readonly string[]; deltaSha256: string;
    /** Kit v3 only (hosted). */
    composer?: "preview-register-composer-v3"; hostedBilling?: PreviewHostedBillingChoice; notes?: readonly string[] }>;
}>;

/** The release tool's own validators of the plan's JSON inputs (native-operator.mjs), loaded as the release tool loads them. */
type NativeOperatorChecks = Readonly<{
  validateHostedBillingChoice: (value: unknown) => PreviewHostedBillingChoice;
  validateCallConcurrencyChoice: (value: unknown) => CallConcurrencyPolicy;
}>;
const NATIVE_OPERATOR_MODULE = new URL("../../deploy/preview-auth-dev/v1/native-operator.mjs", import.meta.url).href;

/**
 * The practice's `--register-next` inputs, checked by the same rules as the server's `native-plan --operation plan`
 * (release-artifacts.mjs): `--hosted-billing` and `--register-call-concurrency` are one JSON object each, checked by
 * native-operator.mjs's own validators; `--checker` is glm or deepseek, deepseek only with
 * `--deepseek-enabled-on-gate yes`; `--role-rotation` is on or off. `kit` is v3 exactly when `--hosted-billing` is given.
 * A refusal names the flag (PRACTICE_REGISTER_NEXT_INPUT_INVALID) or the server's own code.
 */
export async function parsePracticeNextRegisterInputs(flags: Readonly<{
  hostedBilling?: string | undefined;
  checker?: string | undefined;
  deepseekEnabledOnGate?: string | undefined;
  roleRotation?: string | undefined;
  callConcurrency?: string | undefined;
  /**
   * `--shape-policy`'s policy, already checked by the register's own parser (practice-shape.ts); with `--register-next`
   * it goes into the next version (controller ruling D-REGNEXT), as the plan's `--debate-shape '<JSON>'`. It does not
   * choose the kit.
   */
  debateShape?: DebateShapePolicy | null | undefined;
  /**
   * `--length-policy`'s policy, already checked by the register's own parser (practice-length.ts); with `--register-next`
   * it goes into the next version, as the plan's `--length-guidance '<JSON>'`. It does not choose the kit.
   */
  lengthGuidance?: LengthGuidancePolicy | null | undefined;
  /** `--engine-policy`'s policy, already checked by practice-engine.ts; it goes into the next version and chooses no kit. */
  engineVersion?: EngineVersionPolicy | null | undefined;
  /** `--line-up`'s line-up, already checked by practice-settings.ts; it goes into the next version and chooses no kit. */
  lineUp?: PreviewLineUp | null | undefined;
}>, load: () => Promise<NativeOperatorChecks> = async () => await import(NATIVE_OPERATOR_MODULE) as NativeOperatorChecks):
  Promise<Readonly<{ kit: "v2" | "v3"; hostedBilling: PreviewHostedBillingChoice | null; choices: PracticeNextRegisterChoices }>> {
  const invalid = (flag: string): never => { throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_INPUT_INVALID", flag); };
  const json = (text: string, flag: string): unknown => { try { return JSON.parse(text) as unknown; } catch { return invalid(flag); } };
  if (flags.checker !== undefined && flags.checker !== "glm" && flags.checker !== "deepseek") invalid("--checker");
  if (flags.checker === "deepseek" && flags.deepseekEnabledOnGate !== "yes") {
    throw new PracticeRegisterError("CHECKER_DEEPSEEK_NOT_ENABLED_ON_GATE", "--checker deepseek needs --deepseek-enabled-on-gate yes");
  }
  if (flags.deepseekEnabledOnGate !== undefined && flags.checker !== "deepseek") invalid("--deepseek-enabled-on-gate");
  if (flags.roleRotation !== undefined && flags.roleRotation !== "on" && flags.roleRotation !== "off") invalid("--role-rotation");
  const needsOperator = flags.hostedBilling !== undefined || flags.callConcurrency !== undefined;
  const operator = needsOperator ? await load() : null;
  let hostedBilling: PreviewHostedBillingChoice | null = null;
  if (flags.hostedBilling !== undefined) {
    const value = json(flags.hostedBilling, "--hosted-billing");
    try { hostedBilling = operator!.validateHostedBillingChoice(value); } catch { invalid("--hosted-billing"); }
  }
  let callConcurrency: CallConcurrencyPolicy | undefined;
  if (flags.callConcurrency !== undefined) {
    const value = json(flags.callConcurrency, "--register-call-concurrency");
    try { callConcurrency = operator!.validateCallConcurrencyChoice(value); } catch { invalid("--register-call-concurrency"); }
  }
  const choices: PracticeNextRegisterChoices = Object.freeze({
    ...(flags.checker === undefined ? {} : { checker: flags.checker === "deepseek"
      ? Object.freeze({ checker: "deepseek" as const, deepseekEnabledOnGate: true as const }) : Object.freeze({ checker: "glm" as const }) }),
    ...(flags.roleRotation === undefined ? {} : { roleRotation: flags.roleRotation as PreviewRoleRotationChoice }),
    ...(callConcurrency === undefined ? {} : { callConcurrency }),
    ...(flags.debateShape === undefined || flags.debateShape === null ? {} : { debateShape: flags.debateShape }),
    ...(flags.lengthGuidance === undefined || flags.lengthGuidance === null ? {} : { lengthGuidance: flags.lengthGuidance }),
    ...(flags.engineVersion === undefined || flags.engineVersion === null ? {} : { engineVersion: flags.engineVersion }),
    ...(flags.lineUp === undefined || flags.lineUp === null ? {} : { lineUp: flags.lineUp })
  });
  return Object.freeze({ kit: hostedBilling === null ? "v2" as const : "v3" as const, hostedBilling, choices });
}

/** True when the version carries the hosted story money row, which only publish kit v3 seals (a hosted base). */
export function practiceBaseIsHosted(document: PracticeRegisterExport): boolean {
  const base = document.versions[document.versions.length - 1]!;
  return practiceVersionRows(document, base.register_version).some((row) => row.rowKey === STORY_COST_ENVELOPE_POLICY_ROW_KEY);
}

/** The measured runtime the server's publish recorded in the base's `nodeRuntimeVersion` row (publish-register-v2.ts). */
const NODE_RUNTIME_SOURCE_REF =
  /^preview-auth-dev-v1 actual Node (v[0-9]+\.[0-9]+\.[0-9]+); measured ([^;]+); source ([0-9a-f]{40})\/([0-9a-f]{40}); operator sha256:([0-9a-f]{64})$/u;

/** The base's own runtime observation, read back from its `nodeRuntimeVersion` and `pnpmVersion` rows (both kits). */
function practiceBaseRuntime(baseRows: readonly RegisterPublicationRow[], unsupported: (detail: string) => never) {
  const row = (key: string): RegisterPublicationRow => baseRows.find((entry) => entry.rowKey === key) ?? unsupported(`base has no ${key}`);
  const value = (key: string): unknown => JSON.parse(row(key).valueJsonText) as unknown;
  const measured = NODE_RUNTIME_SOURCE_REF.exec(row("nodeRuntimeVersion").sourceRef) ?? unsupported("nodeRuntimeVersion source reference");
  const pnpmVersion = value("pnpmVersion");
  if (value("nodeRuntimeVersion") !== measured[1] || typeof pnpmVersion !== "string") unsupported("runtime rows");
  return Object.freeze({
    nodeVersion: measured[1]!, pnpmVersion: pnpmVersion as string, observedAt: measured[2]!,
    sourceRevision: measured[3]!, sourceTree: measured[4]!, operatorSha256: measured[5]!
  });
}

/**
 * Composes the code's next preview register version on the exported newest version, exactly as the server's
 * `native-plan --operation plan` composes the proposal (native-operator.mjs), with three inputs the server takes from
 * the operator or the machine read back from the base instead, so the practice changes nothing the code does not:
 *  - the checker choice: DeepSeek when the base's `evaluatorRoleRef` is DeepSeek's ref, GLM when it is GLM's second ref;
 *  - the role-rotation switch: the base's `answerRoleRotationPolicy.enabled` ('on' when the base has no such row);
 *  - the runtime observation: the base's `nodeRuntimeVersion` row and its source reference, and its `pnpmVersion` row.
 * Anything else in the base that cannot be read that way refuses (PRACTICE_REGISTER_NEXT_UNSUPPORTED), and so does a
 * code that changes no row (there is then no next version to practise). `choices` (the plan's `--checker`,
 * `--role-rotation`, `--call-concurrency`) replace the base's reading when given; `choices.debateShape` (the plan's
 * `--debate-shape`, the practice's `--shape-policy`) adds the debate-shape row. A hosted base (one kit v3 sealed)
 * refuses: the server's plan needs the hosted inputs there too (PRACTICE_REGISTER_NEXT_HOSTED_BILLING_REQUIRED).
 */
export async function composePracticeNextRegisterVersion(
  document: PracticeRegisterExport,
  bootstrap?: BootstrapRegister,
  choices: PracticeNextRegisterChoices = {}
): Promise<PracticeNextRegisterVersion> {
  if (practiceBaseIsHosted(document)) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_HOSTED_BILLING_REQUIRED",
      "the newest version is a hosted one (publish kit v3): give --hosted-billing as the server's plan does");
  }
  const unsupported = (detail: string): never => { throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_UNSUPPORTED", detail); };
  const base = document.versions[document.versions.length - 1]!;
  const baseRows = practiceVersionRows(document, base.register_version);
  const row = (key: string): RegisterPublicationRow => baseRows.find((entry) => entry.rowKey === key) ?? unsupported(`base has no ${key}`);
  const value = (key: string): unknown => JSON.parse(row(key).valueJsonText) as unknown;
  const checker: PreviewCheckerChoice = choices.checker ?? (() => {
    const evaluator = value("evaluatorRoleRef") as { providerRef?: unknown } | null;
    return evaluator?.providerRef === PREVIEW_DEEPSEEK_CHECKER_ROLE_REF
      ? Object.freeze({ checker: "deepseek" as const, deepseekEnabledOnGate: true as const })
      : evaluator?.providerRef === PREVIEW_EVALUATOR_ROLE_REF ? Object.freeze({ checker: "glm" as const }) : unsupported("evaluatorRoleRef");
  })();
  const roleRotation: PreviewRoleRotationChoice = choices.roleRotation ?? (() => {
    const rotationRow = baseRows.find((entry) => entry.rowKey === "answerRoleRotationPolicy");
    const rotationEnabled = rotationRow === undefined ? true : (JSON.parse(rotationRow.valueJsonText) as { enabled?: unknown }).enabled;
    if (typeof rotationEnabled !== "boolean") unsupported("answerRoleRotationPolicy");
    return rotationEnabled === true ? "on" as const : "off" as const;
  })();
  const runtime = practiceBaseRuntime(baseRows, unsupported);
  // `choices.debateShape` (controller ruling D-REGNEXT): the kit's own source build's `debateShape`; `choices.lengthGuidance`
  // (LG-C) its `lengthGuidance` (the question-language argument stays today's default, null).
  // `choices.engineVersion` (R1d): the kit's own source build's engine row, as the plan's would be; `choices.lineUp`
  // (addition D23) its line-up row, as the plan's `--line-up` would be.
  const sourceRows = await buildPreviewSourceRowsV2(bootstrap ?? await loadBootstrapRegister(), runtime, checker, roleRotation,
    choices.callConcurrency ?? null, choices.debateShape ?? null, null, choices.lengthGuidance ?? null, choices.engineVersion ?? null,
    choices.lineUp ?? null);
  const baseSnapshotSha256 = computeRegisterSnapshotSha256(baseRows);
  const snapshot = composePreviewSnapshotV2({
    sourceRows, baseRows, baseRegisterVersion: base.register_version, baseSnapshotSha256
  });
  if (snapshot.addedKeys.length === 0 && snapshot.changedKeys.length === 0) unsupported("the code changes no register row");
  return Object.freeze({
    baseRegisterVersion: base.register_version, baseSnapshotSha256,
    rows: snapshot.rows, snapshotSha256: snapshot.snapshotSha256,
    addedKeys: snapshot.addedKeys, changedKeys: snapshot.changedKeys, deltaSha256: snapshot.deltaSha256,
    checker: checker.checker, roleRotation
  });
}

/**
 * Kit v3 (the hosted preview): composes the code's next version on the exported newest version exactly as the
 * server's `native-plan --operation plan --hosted-billing '<JSON>'` composes its proposal (native-operator.mjs: kit
 * v3's `buildPreviewSourceRowsV3` with the plan's hosted inputs, checker, rotation and call-concurrency choices, then
 * `composePreviewSnapshotV3`, which asks the hosted API's boot questions of the composed rows). The base may be local
 * (the first hosted version, runbook H6) or hosted (H7 and every later release). The choices follow the plan's
 * defaults, never the base's: GLM, rotation on, the base's call-concurrency row carried. Where those defaults move the
 * checker or the rotation away from the base, `notes` says so (the server's proposal will show the same row change
 * unless the plan is given the same flag). The runtime observation is the base's own, as for kit v2; so the server's
 * proposal differs from this one by `nodeRuntimeVersion`'s source reference (re-measured there) and so by its hashes.
 */
export async function composePracticeHostedNextRegisterVersion(
  document: PracticeRegisterExport,
  hostedBilling: PreviewHostedBillingChoice,
  choices: PracticeNextRegisterChoices = {},
  bootstrap?: BootstrapRegister
): Promise<PracticeNextRegisterVersion> {
  const unsupported = (detail: string): never => { throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_UNSUPPORTED", detail); };
  const base = document.versions[document.versions.length - 1]!;
  const baseRows = practiceVersionRows(document, base.register_version);
  const runtime = practiceBaseRuntime(baseRows, unsupported);
  const checker: PreviewCheckerChoice = choices.checker ?? Object.freeze({ checker: "glm" as const });
  const roleRotation: PreviewRoleRotationChoice = choices.roleRotation ?? "on";
  const notes: string[] = [];
  const baseValue = (key: string): Record<string, unknown> | null => {
    const found = baseRows.find((entry) => entry.rowKey === key);
    const parsed = found === undefined ? null : JSON.parse(found.valueJsonText) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  };
  const baseChecker = baseValue("evaluatorRoleRef")?.providerRef;
  if (choices.checker === undefined && baseChecker === PREVIEW_DEEPSEEK_CHECKER_ROLE_REF) {
    notes.push("the newest version's answer checker is DeepSeek; without --checker deepseek --deepseek-enabled-on-gate yes the next "
      + "version moves it back to GLM (so does the server's plan without the same flags)");
  }
  if (choices.roleRotation === undefined && baseValue("answerRoleRotationPolicy")?.enabled === false) {
    notes.push("the newest version has role rotation off; without --role-rotation off the next version switches it on "
      + "(so does the server's plan without the same flag)");
  }
  // `choices.debateShape` (controller ruling D-REGNEXT): kit v3 hands it to kit v2's source build, as the plan's own
  // `--debate-shape` does (publish-register-v3.ts), and asks the runner's debate-shape boot refusals before sealing;
  // `choices.lengthGuidance` (LG-C) likewise, as the plan's `--length-guidance`.
  // `choices.engineVersion` (R1d): the kit's own source build's engine row, as the plan's would be; `choices.lineUp`
  // (addition D23) its line-up row, as the plan's `--line-up` would be.
  const sourceRows = await buildPreviewSourceRowsV3(bootstrap ?? await loadBootstrapRegister(), runtime, hostedBilling, checker, roleRotation,
    choices.callConcurrency ?? null, choices.debateShape ?? null, null, choices.lengthGuidance ?? null, choices.engineVersion ?? null,
    choices.lineUp ?? null);
  const baseSnapshotSha256 = computeRegisterSnapshotSha256(baseRows);
  const snapshot = composePreviewSnapshotV3({
    sourceRows, baseRows, baseRegisterVersion: base.register_version, baseSnapshotSha256
  });
  if (snapshot.addedKeys.length === 0 && snapshot.changedKeys.length === 0) unsupported("the code changes no register row");
  return Object.freeze({
    baseRegisterVersion: base.register_version, baseSnapshotSha256,
    rows: snapshot.rows, snapshotSha256: snapshot.snapshotSha256,
    addedKeys: snapshot.addedKeys, changedKeys: snapshot.changedKeys, deltaSha256: snapshot.deltaSha256,
    checker: checker.checker, roleRotation,
    composer: snapshot.composer, hostedBilling, notes: Object.freeze(notes)
  });
}

/**
 * Imports every exported version, in order, and proves each one. With `next` (the code's next version, from
 * `composePracticeNextRegisterVersion` on this same export), it then publishes that version on top, through the same
 * general publication, and the practice runs on it.
 */
export async function importPracticeRegister(pool: Pool, document: PracticeRegisterExport,
  next: PracticeNextRegisterVersion | null = null): Promise<PracticeRegisterImportReceipt> {
  const port = createPostgresRegisterPublicationPort(pool);
  const steps: PracticeRegisterImportStep[] = [];
  for (const version of document.versions) {
    const rows = practiceVersionRows(document, version.register_version);
    if (rows.length !== version.row_count) {
      throw new PracticeRegisterError("PRACTICE_REGISTER_EXPORT_INVALID", `version ${version.register_version} row count`);
    }
    const snapshotSha256 = computeRegisterSnapshotSha256(rows);
    if (version.snapshot_sha256 !== null && version.snapshot_sha256 !== snapshotSha256) {
      throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${version.register_version} export`);
    }
    const present = await databaseVersionSnapshotSha256(pool, version.register_version);
    let path: PracticeRegisterImportStep["path"];
    if (present !== null) {
      if (present !== snapshotSha256) {
        throw new PracticeRegisterError("PRACTICE_REGISTER_CONFLICT", `version ${version.register_version} already differs`);
      }
      path = "ALREADY_PRESENT";
    } else if (BigInt(version.register_version) <= 4n && version.publication_kind === null) {
      await port.importHistorical({ registerVersion: parseRegisterVersionText(version.register_version), rows });
      path = "HISTORICAL_IMPORT";
    } else if (version.publication_kind === "GENERAL") {
      if (version.base_register_version === null) {
        throw new PracticeRegisterError("PRACTICE_REGISTER_EXPORT_INVALID", `version ${version.register_version} has no base`);
      }
      const receipt = await port.publishGeneral({
        publicationId: randomUUID(),
        baseRegisterVersion: parseRegisterVersionText(version.base_register_version),
        rows,
        sourceRef: `preview practice: copy of live register version ${version.register_version}`,
        deployment: "local"
      });
      if (receipt.registerVersion !== version.register_version) {
        throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT",
          `expected ${version.register_version}, the publication allocated ${receipt.registerVersion}`);
      }
      path = "GENERAL_PUBLICATION";
    } else {
      throw new PracticeRegisterError("PRACTICE_REGISTER_PATH_UNSUPPORTED",
        `version ${version.register_version} (${version.publication_kind ?? "no publication kind"})`);
    }
    const after = await databaseVersionSnapshotSha256(pool, version.register_version);
    if (after !== snapshotSha256) {
      throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${version.register_version} after import`);
    }
    steps.push(Object.freeze({ registerVersion: version.register_version, rowCount: rows.length, snapshotSha256, path }));
  }
  const last = document.versions[document.versions.length - 1]!;
  if (next === null) return Object.freeze({ registerVersion: last.register_version, steps: Object.freeze(steps) });
  if (next.baseRegisterVersion !== last.register_version || next.baseSnapshotSha256 !== steps[steps.length - 1]!.snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_UNSUPPORTED", "the next version was composed on another base");
  }
  const receipt = await port.publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(next.baseRegisterVersion),
    rows: next.rows,
    sourceRef: `preview practice: this code's next version on top of live register version ${next.baseRegisterVersion}`,
    deployment: "local"
  });
  if (BigInt(receipt.registerVersion) !== BigInt(next.baseRegisterVersion) + 1n) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT",
      `expected ${String(BigInt(next.baseRegisterVersion) + 1n)}, the publication allocated ${receipt.registerVersion}`);
  }
  if (await databaseVersionSnapshotSha256(pool, receipt.registerVersion) !== next.snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${receipt.registerVersion} (the code's next) after import`);
  }
  steps.push(Object.freeze({ registerVersion: receipt.registerVersion, rowCount: next.rows.length, snapshotSha256: next.snapshotSha256,
    path: "CODE_NEXT_VERSION" as const }));
  return Object.freeze({
    registerVersion: receipt.registerVersion, steps: Object.freeze(steps),
    codeNext: Object.freeze({ baseRegisterVersion: next.baseRegisterVersion, addedKeys: next.addedKeys,
      changedKeys: next.changedKeys, deltaSha256: next.deltaSha256,
      ...(next.composer === undefined ? {} : { composer: next.composer, hostedBilling: next.hostedBilling!, notes: next.notes ?? [] }) })
  });
}

/**
 * Debate shape (plan 2026-10-12-debate-shape-phase2d, `--shape-policy`): the source ref of the one row the practice adds.
 * It says where the row came from, so no reader can mistake the practice's version for a live one.
 */
export const PRACTICE_SHAPE_SOURCE_REF = "preview practice: --shape-policy, this throwaway register only" as const;

export type PracticeShapeVersion = Readonly<{
  baseRegisterVersion: string;
  registerVersion: string;
  /** ADDED: the export had no debate-shape row. REPLACED: its own row was superseded in this throwaway copy. */
  row: "ADDED" | "REPLACED";
  snapshotSha256: string;
}>;

/**
 * The contract-hash rows the practice version takes from THIS code (P2b ruling X3, plan 2026-10-12-debate-shape-phase2d
 * Contract deviation 7). The runner refuses a debate-shape row whose map hash is not its own map contracts, and its
 * boot (assertRegisterPromptContractHashes) refuses a register whose judge, composer or conformance hash is not what
 * this candidate code sends (pre-flight PF-D7). Engine redesign (R1d Task 4): engineContractHash too, the seal the runner
 * checks beside an engine row (apps/runner/src/engine-boot.ts), so a throwaway version always carries this code's seal.
 */
export const PRACTICE_CODE_HASH_ROW_KEYS = Object.freeze(["composerContractHash", "conformanceContractHash", "engineContractHash",
  "judgeContractHash", "mapContractHash"] as const);

/**
 * The code's own values of those five rows, exactly as the development register builder seals them
 * (apps/runner/src/dev-deployment-register.ts), its source ref included: the runner's policy reader
 * (apps/runner/src/dev-runner-policy.ts) refuses a judge, composer or conformance hash row sealed by anyone else
 * (DEV_RUNNER_POLICY_PROVENANCE_INVALID; found by P2d Task 6's whole shape debate). The version itself is still
 * published under PRACTICE_SHAPE_SOURCE_REF, and so is the debate-shape row. Throwaway database only.
 */
export async function practiceCodeContractHashRows(): Promise<readonly RegisterPublicationRow[]> {
  const rows = await buildDevelopmentRunnerRegisterRows();
  return Object.freeze(PRACTICE_CODE_HASH_ROW_KEYS.map((rowKey) => {
    const row = rows.find((entry) => entry.rowKey === rowKey);
    if (row === undefined || typeof row.value !== "string") throw new PracticeRegisterError("PRACTICE_CODE_HASH_MISSING", rowKey);
    return Object.freeze({ rowKey, valueJsonText: canonicalRegisterJson(row.value), sourceRef: row.sourceRef });
  }));
}

/**
 * Length guidance (LG-C, `--length-policy`): the source ref of the length row the practice adds, so no reader can mistake
 * the practice's version for a live one.
 */
export const PRACTICE_LENGTH_SOURCE_REF = "preview practice: --length-policy, this throwaway register only" as const;

/** R1d (`--engine-policy`): the source ref of the engine row the practice adds; no reader can mistake it for a live one. */
export const PRACTICE_ENGINE_SOURCE_REF = "preview practice: --engine-policy, this throwaway register only" as const;

/** The practice's own version (no --register-next): which override rows it added or replaced. */
export type PracticeOverrideVersion = Readonly<{
  baseRegisterVersion: string; registerVersion: string; snapshotSha256: string;
  shapeRow: "ADDED" | "REPLACED" | null; lengthRow: "ADDED" | "REPLACED" | null;
  /** R1d: what the --engine-policy row did in this version (null: no engine override). */
  engineRow: "ADDED" | "REPLACED" | null;
  /** Addition D23: what the --line-up row did in this version (null: no line-up given; absent from older callers' doubles). */
  lineUpRow?: "ADDED" | "REPLACED" | null;
}>;

/** The three override rows a practice version may carry (R1d: engine; addition D23: the line-up), as the debate hands them. */
export type PracticeOverrideRows = Readonly<{
  shape: DebateShapePolicy | null; length: LengthGuidancePolicy | null; engine?: EngineVersionPolicy | null; lineUp?: PreviewLineUp | null;
}>;

/**
 * The practice version's rows: the export's last version's rows with each given override row added (or the export's own
 * replaced) and the code's contract-hash rows in place of the export's, in key order. Pure.
 */
export function practiceOverrideVersionRows(document: PracticeRegisterExport, overrides: PracticeOverrideRows,
  codeHashRows: readonly RegisterPublicationRow[]): Readonly<{
    rows: readonly RegisterPublicationRow[]; shapeRow: "ADDED" | "REPLACED" | null; lengthRow: "ADDED" | "REPLACED" | null;
    engineRow: "ADDED" | "REPLACED" | null; lineUpRow: "ADDED" | "REPLACED" | null;
  }> {
  const last = document.versions[document.versions.length - 1]!;
  const base = practiceVersionRows(document, last.register_version);
  const added: RegisterPublicationRow[] = [];
  if (overrides.shape !== null) {
    const row = debateShapePolicyRow(overrides.shape, PRACTICE_SHAPE_SOURCE_REF);
    added.push(Object.freeze({ rowKey: row.rowKey, valueJsonText: row.valueJsonText, sourceRef: row.sourceRef }));
  }
  if (overrides.length !== null) {
    const row = lengthGuidancePolicyRow(overrides.length, PRACTICE_LENGTH_SOURCE_REF);
    added.push(Object.freeze({ rowKey: row.rowKey, valueJsonText: row.valueJsonText, sourceRef: row.sourceRef }));
  }
  // R1d: the engine row, in the same one throwaway version as the shape and length rows.
  const engine = overrides.engine ?? null;
  if (engine !== null) {
    const row = engineVersionPolicyRow(engine, PRACTICE_ENGINE_SOURCE_REF);
    added.push(Object.freeze({ rowKey: row.rowKey, valueJsonText: row.valueJsonText, sourceRef: row.sourceRef }));
  }
  // Addition D23 (`--line-up`): the line-up row, in the same one throwaway version (never a second version on top).
  const lineUp = overrides.lineUp ?? null;
  if (lineUp !== null) {
    const row = previewLineUpPolicyRow(lineUp, PRACTICE_LINE_UP_SOURCE_REF);
    added.push(Object.freeze({ rowKey: row.rowKey, valueJsonText: row.valueJsonText, sourceRef: row.sourceRef }));
  }
  const own = new Set<string>([...added.map((row) => row.rowKey), ...codeHashRows.map((row) => row.rowKey)]);
  const rows = [...base.filter((row) => !own.has(row.rowKey)), ...added, ...codeHashRows]
    .sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
  const change = (key: string, given: boolean) => !given ? null : base.some((row) => row.rowKey === key) ? "REPLACED" as const : "ADDED" as const;
  return Object.freeze({ rows: Object.freeze(rows), shapeRow: change(DEBATE_SHAPE_POLICY_ROW_KEY, overrides.shape !== null),
    lengthRow: change(LENGTH_GUIDANCE_POLICY_ROW_KEY, overrides.length !== null),
    engineRow: change(ENGINE_VERSION_POLICY_ROW_KEY, engine !== null),
    lineUpRow: change(PREVIEW_LINE_UP_POLICY_ROW_KEY, lineUp !== null) });
}

/**
 * The practice version's rows with the debate-shape row alone (see practiceOverrideVersionRows): the export's LAST
 * version's rows exactly as imported, with the debate-shape row added (or the export's own replaced) and the code's four
 * contract-hash rows put in place of the export's, in key order. Pure.
 */
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy,
  codeHashRows: readonly RegisterPublicationRow[]): Readonly<{ rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED" }> {
  const built = practiceOverrideVersionRows(document, { shape: policy, length: null }, codeHashRows);
  return Object.freeze({ rows: built.rows, row: built.shapeRow! });
}

/**
 * Publishes the practice's override version (the --shape-policy, --length-policy and/or --engine-policy rows; ONE
 * version for all) in the THROWAWAY database only, through the register's own general publication on the export's last
 * version, and proves it: the number allocated is exactly one above, and its rows hash as built. The export document is
 * only read.
 */
export async function publishPracticeOverrideVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  overrides: PracticeOverrideRows): Promise<PracticeOverrideVersion> {
  const { rows, shapeRow, lengthRow, engineRow, lineUpRow } = practiceOverrideVersionRows(document, overrides, await practiceCodeContractHashRows());
  const expected = String(BigInt(receipt.registerVersion) + 1n);
  const published = await createPostgresRegisterPublicationPort(pool).publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(receipt.registerVersion),
    rows,
    // R1d: `--engine-policy` alone (allowed when the export already holds the length row) is stamped as the engine's;
    // addition D23: `--line-up` alone as the line-up's.
    sourceRef: overrides.shape !== null ? PRACTICE_SHAPE_SOURCE_REF
      : overrides.length !== null ? PRACTICE_LENGTH_SOURCE_REF
        : (overrides.engine ?? null) !== null ? PRACTICE_ENGINE_SOURCE_REF : PRACTICE_LINE_UP_SOURCE_REF,
    deployment: "local"
  });
  if (published.registerVersion !== expected) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT", `expected ${expected}, the publication allocated ${published.registerVersion}`);
  }
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  if (await databaseVersionSnapshotSha256(pool, expected) !== snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${expected} (the practice's override version)`);
  }
  return Object.freeze({ baseRegisterVersion: receipt.registerVersion, registerVersion: expected, snapshotSha256, shapeRow, lengthRow, engineRow,
    ...((overrides.lineUp ?? null) === null ? {} : { lineUpRow }) });
}

/** The practice's own version with the debate-shape row alone (see publishPracticeOverrideVersion). */
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  policy: DebateShapePolicy): Promise<PracticeShapeVersion> {
  const version = await publishPracticeOverrideVersion(pool, document, receipt, { shape: policy, length: null });
  return Object.freeze({ baseRegisterVersion: version.baseRegisterVersion, registerVersion: version.registerVersion,
    row: version.shapeRow!, snapshotSha256: version.snapshotSha256 });
}

/** INTERFACE §8: the practice's own version with the length row alone, in the throwaway database only. */
export async function publishPracticeLengthVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  policy: LengthGuidancePolicy): Promise<PracticeOverrideVersion> {
  return publishPracticeOverrideVersion(pool, document, receipt, { shape: null, length: policy });
}
