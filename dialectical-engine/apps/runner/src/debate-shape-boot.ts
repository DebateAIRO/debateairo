import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { mapPromptContractHash } from "@debateai/map";
import { readDebateShapePolicy, readMapContractHash, type DebateShapePolicy } from "@debateai/register";

/** What a runner needs to argue the debate shape, resolved once at boot. */
export type DebateShapeRunnerSettings = Readonly<{ mapContractHash: string }>;

/**
 * Spec §3.1 / §4: no debateShapePolicy row — today's runner (null). A row — the sealed mapContractHash must be present
 * and equal the code's fingerprint, or the boot refuses: a map call must never be stamped with a hash that does not
 * describe what it sends. The row is read raw: a disabled row (enabled: false) still needs its sealed map hash, so a
 * runner on that version can finish the shaped runs admitted before the switch.
 */
export function resolveDebateShapeRunnerSettings(input: Readonly<{
  policy: DebateShapePolicy | null; mapContractHash: string | null; codeMapContractHash: string;
}>): DebateShapeRunnerSettings | null {
  if (input.policy === null) return null;
  if (input.mapContractHash === null) {
    throw new TypedDomainError("DEBATE_SHAPE_MAP_HASH_UNSEALED", "The register seals a debateShapePolicy row without its mapContractHash row");
  }
  if (input.mapContractHash !== input.codeMapContractHash) {
    throw new TypedDomainError("MAP_CONTRACT_HASH_MISMATCH", "The register's mapContractHash is not this runner's map contracts");
  }
  return Object.freeze({ mapContractHash: input.mapContractHash });
}

/**
 * The one boot read (apps/runner/src/main.ts, the practice runner, the hosted readiness check): the debateShapePolicy
 * row first, and the mapContractHash row ONLY when that row is present. No shape row = today's boot, byte for byte:
 * the map hash row is never read, so even a malformed one cannot refuse a runner that does not argue the shape.
 */
export async function readDebateShapeRunnerSettings(
  pool: Pick<Pool, "query">,
  registerVersion: number,
  codeMapContractHash: string = mapPromptContractHash()
): Promise<DebateShapeRunnerSettings | null> {
  const policy = await readDebateShapePolicy(pool, registerVersion);
  if (policy === null) return null;
  return resolveDebateShapeRunnerSettings({ policy, mapContractHash: await readMapContractHash(pool, registerVersion), codeMapContractHash });
}
