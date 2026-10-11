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
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type RegisterPublicationRow
} from "@debateai/register";

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
  path: "ALREADY_PRESENT" | "HISTORICAL_IMPORT" | "GENERAL_PUBLICATION";
}>;

export type PracticeRegisterImportReceipt = Readonly<{
  registerVersion: string;
  steps: readonly PracticeRegisterImportStep[];
}>;

/**
 * Imports every exported version, in order, and proves each one.
 */
export async function importPracticeRegister(pool: Pool, document: PracticeRegisterExport): Promise<PracticeRegisterImportReceipt> {
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
  return Object.freeze({ registerVersion: last.register_version, steps: Object.freeze(steps) });
}
