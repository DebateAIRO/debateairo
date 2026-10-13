import type { Pool } from "pg";

/**
 * Debate shape (spec §4): the map's prompt contracts, sealed. ONE optional row in its own family: never a
 * register.required_row, so every older version keeps parsing and reads ABSENT. The runner requires it only when the
 * register also seals a debateShapePolicy row, and refuses to boot when it differs from the code's fingerprint.
 */
export const MAP_CONTRACT_HASH_ROW_KEY = "mapContractHash" as const;

export function parseMapContractHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new TypeError("MAP_CONTRACT_HASH_INVALID");
  return value;
}

export async function readMapContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, MAP_CONTRACT_HASH_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseMapContractHash(row.value_json);
}
