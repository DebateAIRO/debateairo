import type { Pool } from "pg";

/**
 * Engine redesign (spec 2026-10-15 §3.3, §9; INTERFACE §2.1): engine 2's prompt contracts, sealed. ONE optional row in its
 * own family: never a register.required_row, so every older version keeps parsing and reads ABSENT. The development
 * builder writes it into every version (apps/runner/src/dev-deployment-register.ts, code-owned like mapContractHash); the
 * runner reads it ONLY beside an engineVersionPolicy row and refuses to boot when it differs from the code's fingerprint
 * (apps/runner/src/engine-boot.ts).
 */
export const ENGINE_CONTRACT_HASH_ROW_KEY = "engineContractHash" as const;

export function parseEngineContractHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new TypeError("ENGINE_CONTRACT_HASH_INVALID");
  return value;
}

export async function readEngineContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ENGINE_CONTRACT_HASH_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseEngineContractHash(row.value_json);
}
