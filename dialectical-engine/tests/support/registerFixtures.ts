import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
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

export const TEST_PLAN_TIER_ROSTERS = PLAN_TIER_ROSTERS;

// Moved 2026-09-13 when the five live slots and file-owned plan-tier rosters reached v4.
// The previous intermediate snapshot was 1f3c42c4eeb5588e144aff775ef59fd15bdf50b4f5c5064e6bc806333fa14457.
export const DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 =
  "f02c8c003c75c2513672fc4380d4302d5dd18e576fcb498d968c61ba5cb32cf9" as const;

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
