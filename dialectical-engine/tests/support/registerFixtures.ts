import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  canonicalDecimal,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type GeneralRegisterPublicationRequest,
  type HistoricalRegisterImportReceipt,
  type RegisterPublicationDeployment,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow
} from "../../packages/register/src/index.js";
import type { CanonicalJsonAst, RegisterVersionText } from "../../packages/register/src/index.js";

export const LEGACY_REGISTER_V1_SNAPSHOT_SHA256 =
  "8fde270cae50e99ea7ff723f50c26a64833a72347838ed4aee0eb9cbfea3104b" as const;

// SEALED HISTORY: the snapshot of development register version 4 exactly as it was
// published (three provider slots, 32 rows) — the bytes `readLegacyDevelopmentV4Rows`
// replays from `fixtures/register-development-v4.json`, and the value the P3-02 runbook
// tells an operator to confirm on a deployed database. It never moves.
//
// 6a05a0d0 (2026-09-13) moved this pin to 42b90bca…, the five-slot panel's snapshot, on a
// line where "v4 rows" were still rebuilt by the CURRENT development builder; the five-slot
// set was published as a NEW version above 4 (version 9 in the debate-tiers ledger,
// .hermes/reports/debate-tiers/LEDGER.md), never as version 4. The merge e2689c26
// (2026-09-23) then paired that moved pin with the frozen three-slot bytes, so every
// assertion of this constant against the fixture failed. Restored 2026-09-28.
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

/**
 * C-I5: a fixture publication is a LOCAL one unless the case says otherwise —
 * the hosted arm carries V-9(4)'s vendor vetting, which is driven on its own in
 * `tests/unit/v9-configured-provider-set-deployment.test.ts`.
 */
export async function publishRegisterFixture(
  pool: Pool,
  input: GeneralRegisterPublicationRequest & {
    readonly deployment?: RegisterPublicationDeployment;
  }
): Promise<RegisterPublicationReceipt> {
  return createPostgresRegisterPublicationPort(pool)
    .publishGeneral({ deployment: "local", ...input });
}

/** Frozen bytes from remote dev f19c706f; current development builders may evolve. */
export async function readLegacyDevelopmentV4Rows(): Promise<readonly RegisterPublicationRow[]> {
  const rows = JSON.parse(await readFile(new URL("./fixtures/register-development-v4.json", import.meta.url), "utf8")) as Array<{ rowKey: string; valueJsonText: string; sourceRef: string }>;
  return rows.map(row => ({ ...row, valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.valueJsonText)) }));
}
