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
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  canonicalRegisterJson,
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  DEBATE_SHAPE_POLICY_ROW_KEY,
  debateShapePolicyRow,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type BootstrapRegister,
  type DebateShapePolicy,
  type RegisterPublicationRow
} from "@debateai/register";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import {
  buildPreviewSourceRowsV2,
  composePreviewSnapshotV2,
  PREVIEW_DEEPSEEK_CHECKER_ROLE_REF,
  PREVIEW_EVALUATOR_ROLE_REF,
  type PreviewCheckerChoice,
  type PreviewRoleRotationChoice
} from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

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
}>;

export type PracticeRegisterImportReceipt = Readonly<{
  registerVersion: string;
  steps: readonly PracticeRegisterImportStep[];
  /** Present when the practice runs on the code's next version (`--register-next`): what that version changed. */
  codeNext?: Readonly<{ baseRegisterVersion: string; addedKeys: readonly string[]; changedKeys: readonly string[]; deltaSha256: string }>;
}>;

/** The measured runtime the server's publish recorded in the base's `nodeRuntimeVersion` row (publish-register-v2.ts). */
const NODE_RUNTIME_SOURCE_REF =
  /^preview-auth-dev-v1 actual Node (v[0-9]+\.[0-9]+\.[0-9]+); measured ([^;]+); source ([0-9a-f]{40})\/([0-9a-f]{40}); operator sha256:([0-9a-f]{64})$/u;

/**
 * Composes the code's next preview register version on the exported newest version, exactly as the server's
 * `native-plan --operation plan` composes the proposal (native-operator.mjs), with three inputs the server takes from
 * the operator or the machine read back from the base instead, so the practice changes nothing the code does not:
 *  - the checker choice: DeepSeek when the base's `evaluatorRoleRef` is DeepSeek's ref, GLM when it is GLM's second ref;
 *  - the role-rotation switch: the base's `answerRoleRotationPolicy.enabled` ('on' when the base has no such row);
 *  - the runtime observation: the base's `nodeRuntimeVersion` row and its source reference, and its `pnpmVersion` row.
 * Anything else in the base that cannot be read that way refuses (PRACTICE_REGISTER_NEXT_UNSUPPORTED), and so does a
 * code that changes no row (there is then no next version to practise).
 */
export async function composePracticeNextRegisterVersion(
  document: PracticeRegisterExport,
  bootstrap?: BootstrapRegister,
  /**
   * `--shape-policy` with `--register-next` (controller ruling D-REGNEXT): handed to the kit's own source build as its
   * `debateShape`, so the code's next version carries the row exactly as the server's publish would. Null: no row
   * from the code (a base's own row is carried unchanged, R19).
   */
  debateShape: DebateShapePolicy | null = null
): Promise<PracticeNextRegisterVersion> {
  const unsupported = (detail: string): never => { throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_UNSUPPORTED", detail); };
  const base = document.versions[document.versions.length - 1]!;
  const baseRows = practiceVersionRows(document, base.register_version);
  const row = (key: string): RegisterPublicationRow => baseRows.find((entry) => entry.rowKey === key) ?? unsupported(`base has no ${key}`);
  const value = (key: string): unknown => JSON.parse(row(key).valueJsonText) as unknown;
  const evaluator = value("evaluatorRoleRef") as { providerRef?: unknown } | null;
  const checker: PreviewCheckerChoice = evaluator?.providerRef === PREVIEW_DEEPSEEK_CHECKER_ROLE_REF
    ? Object.freeze({ checker: "deepseek" as const, deepseekEnabledOnGate: true as const })
    : evaluator?.providerRef === PREVIEW_EVALUATOR_ROLE_REF ? Object.freeze({ checker: "glm" as const }) : unsupported("evaluatorRoleRef");
  const rotationRow = baseRows.find((entry) => entry.rowKey === "answerRoleRotationPolicy");
  const rotationEnabled = rotationRow === undefined ? true : (JSON.parse(rotationRow.valueJsonText) as { enabled?: unknown }).enabled;
  if (typeof rotationEnabled !== "boolean") unsupported("answerRoleRotationPolicy");
  const roleRotation: PreviewRoleRotationChoice = rotationEnabled === true ? "on" : "off";
  const measured = NODE_RUNTIME_SOURCE_REF.exec(row("nodeRuntimeVersion").sourceRef) ?? unsupported("nodeRuntimeVersion source reference");
  const pnpmVersion = value("pnpmVersion");
  if (value("nodeRuntimeVersion") !== measured[1] || typeof pnpmVersion !== "string") unsupported("runtime rows");
  const sourceRows = await buildPreviewSourceRowsV2(bootstrap ?? await loadBootstrapRegister(), {
    nodeVersion: measured[1]!, pnpmVersion: pnpmVersion as string, observedAt: measured[2]!,
    sourceRevision: measured[3]!, sourceTree: measured[4]!, operatorSha256: measured[5]!
  }, checker, roleRotation, null, debateShape);
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
      changedKeys: next.changedKeys, deltaSha256: next.deltaSha256 })
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
 * this candidate code sends (pre-flight PF-D7).
 */
export const PRACTICE_CODE_HASH_ROW_KEYS = Object.freeze(["composerContractHash", "conformanceContractHash", "judgeContractHash",
  "mapContractHash"] as const);

/**
 * The code's own values of those four rows, exactly as the development register builder seals them
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
 * The practice version's rows: the export's LAST version's rows exactly as imported, with the debate-shape row added
 * (or the export's own replaced) and the code's four contract-hash rows put in place of the export's, in key order.
 * Pure.
 */
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy,
  codeHashRows: readonly RegisterPublicationRow[]): Readonly<{ rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED" }> {
  const last = document.versions[document.versions.length - 1]!;
  const base = practiceVersionRows(document, last.register_version);
  const shaped = debateShapePolicyRow(policy, PRACTICE_SHAPE_SOURCE_REF);
  const replaced = base.some((row) => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
  const own = new Set<string>([DEBATE_SHAPE_POLICY_ROW_KEY, ...codeHashRows.map((row) => row.rowKey)]);
  const rows = [...base.filter((row) => !own.has(row.rowKey)),
    Object.freeze({ rowKey: shaped.rowKey, valueJsonText: shaped.valueJsonText, sourceRef: shaped.sourceRef }), ...codeHashRows]
    .sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
  return Object.freeze({ rows: Object.freeze(rows), row: replaced ? "REPLACED" : "ADDED" });
}

/**
 * Publishes the practice version in the THROWAWAY database only, through the register's own general publication on
 * the export's last version, and proves it: the number allocated is exactly one above, and its rows hash as built.
 * The export document is only read.
 */
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  policy: DebateShapePolicy): Promise<PracticeShapeVersion> {
  const { rows, row } = practiceShapeVersionRows(document, policy, await practiceCodeContractHashRows());
  const expected = String(BigInt(receipt.registerVersion) + 1n);
  const published = await createPostgresRegisterPublicationPort(pool).publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(receipt.registerVersion),
    rows,
    sourceRef: PRACTICE_SHAPE_SOURCE_REF,
    deployment: "local"
  });
  if (published.registerVersion !== expected) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT", `expected ${expected}, the publication allocated ${published.registerVersion}`);
  }
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  if (await databaseVersionSnapshotSha256(pool, expected) !== snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${expected} (the practice's debate-shape version)`);
  }
  return Object.freeze({ baseRegisterVersion: receipt.registerVersion, registerVersion: expected, row, snapshotSha256 });
}
