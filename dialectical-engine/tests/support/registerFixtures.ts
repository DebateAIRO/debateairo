import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  canonicalDecimal,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type GeneralRegisterPublication,
  type HistoricalRegisterImportReceipt,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow
} from "../../packages/register/src/index.js";
import type { CanonicalJsonAst, RegisterVersionText } from "../../packages/register/src/index.js";

export const LEGACY_REGISTER_V1_SNAPSHOT_SHA256 =
  "8fde270cae50e99ea7ff723f50c26a64833a72347838ed4aee0eb9cbfea3104b" as const;

export const DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 =
  "120bdfea9776cff519113d915694f02b1e4302a14a4282c8e6272a0bf09a5e96" as const;

function fixtureValueAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map(fixtureValueAst));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, member]) => [key, fixtureValueAst(member)])
    ));
  }
  throw new TypeError("REGISTER_FIXTURE_VALUE_INVALID");
}

export function registerFixtureRow(
  rowKey: string,
  value: unknown,
  sourceRef: string
): RegisterPublicationRow {
  return Object.freeze({
    rowKey,
    valueJsonText: canonicalRegisterJson(fixtureValueAst(value)),
    sourceRef
  });
}

export async function readCompleteRegisterFixtureRows(
  pool: Pool,
  version: RegisterVersionText
): Promise<readonly RegisterPublicationRow[]> {
  const result = await pool.query<{
    row_key: string;
    value_json_text: string;
    source_ref: string;
  }>(`
    SELECT row_key,value_json::text AS value_json_text,source_ref
    FROM register.register_row WHERE register_version=$1 ORDER BY row_key
  `, [version]);
  return Object.freeze(result.rows.map((row) => Object.freeze({
    rowKey: row.row_key,
    valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8")),
    sourceRef: row.source_ref
  })));
}

export async function publishReplacementRegisterFixture(
  pool: Pool,
  baseRegisterVersion: RegisterVersionText,
  replacements: readonly RegisterPublicationRow[],
  sourceRef: string
): Promise<RegisterPublicationReceipt> {
  const byKey = new Map(
    (await readCompleteRegisterFixtureRows(pool, baseRegisterVersion)).map((row) => [row.rowKey, row])
  );
  for (const row of replacements) byKey.set(row.rowKey, row);
  return publishRegisterFixture(pool, {
    publicationId: randomUUID(),
    baseRegisterVersion,
    rows: Object.freeze([...byKey.values()]),
    sourceRef
  });
}

export async function importHistoricalRegisterFixture(
  pool: Pool,
  version: 1 | 2 | 3 | 4,
  rows: readonly RegisterPublicationRow[]
): Promise<HistoricalRegisterImportReceipt> {
  return createPostgresRegisterPublicationPort(pool).importHistorical({
    registerVersion: parseRegisterVersionText(String(version)),
    rows
  });
}

export async function publishRegisterFixture(
  pool: Pool,
  input: GeneralRegisterPublication
): Promise<RegisterPublicationReceipt> {
  return createPostgresRegisterPublicationPort(pool).publishGeneral(input);
}

/** Frozen bytes from remote dev f19c706f; current development builders may evolve. */
export async function readLegacyDevelopmentV4Rows(): Promise<readonly RegisterPublicationRow[]> {
  const rows = JSON.parse(await readFile(new URL("./fixtures/register-development-v4.json", import.meta.url), "utf8")) as Array<{ rowKey: string; valueJsonText: string; sourceRef: string }>;
  return rows.map(row => ({ ...row, valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.valueJsonText)) }));
}
