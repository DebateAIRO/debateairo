import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  readEngineContractHash, readEngineVersionPolicy, readLengthGuidancePolicy, type EngineVersionPolicy
} from "@debateai/register";
import { engineContractHash } from "./engine-contracts.js";

/** What a runner needs to run engine-2 debates, resolved once at boot: the seal its engine-2 calls carry. */
export type EngineRunnerSettings = Readonly<{ engineContractHash: string }>;

/**
 * Engine redesign (spec 2026-10-15 §3.3; INTERFACE §1.5, §2.3). No engineVersionPolicy row: engine 1, today's runner
 * (null). A row, enabled or not (§1.3: read RAW, so a runner on a version whose row was switched off still finishes the
 * engine-2 debates admitted before the switch): the length row must be present (engine 2's calls read their word targets
 * from each run's receipt, which admission fills only beside the length row), and the sealed engineContractHash must be
 * present and equal the code's, or the boot refuses: an engine-2 call must never be stamped with a seal that does not
 * describe what it sends.
 */
export function resolveEngineRunnerSettings(input: Readonly<{
  policy: EngineVersionPolicy | null; lengthPolicyPresent: boolean; engineContractHash: string | null; codeEngineContractHash: string;
}>): EngineRunnerSettings | null {
  if (input.policy === null) return null;
  if (!input.lengthPolicyPresent) {
    throw new TypedDomainError("ENGINE_REQUIRES_LENGTH_POLICY", "The register seals an engineVersionPolicy row without a lengthGuidancePolicy row");
  }
  if (input.engineContractHash === null) {
    throw new TypedDomainError("ENGINE_CONTRACT_HASH_UNSEALED", "The register seals an engineVersionPolicy row without its engineContractHash row");
  }
  if (input.engineContractHash !== input.codeEngineContractHash) {
    throw new TypedDomainError("ENGINE_CONTRACT_HASH_MISMATCH", "The register's engineContractHash is not this runner's engine contracts");
  }
  return Object.freeze({ engineContractHash: input.engineContractHash });
}

/**
 * The one boot read (apps/runner/src/main.ts, the practice runner, the hosted readiness check): the engineVersionPolicy
 * row first; ONLY when it is present, the length row's PRESENCE (its numbers reach a debate through the receipt, never
 * from here) and, only with the length row, the seal. No engine row = today's boot, byte for byte: neither other row is
 * read, so even a malformed seal row cannot refuse a runner that runs engine 1 only. With an engine row, a malformed
 * length row refuses the boot by the register's own code (LENGTH_GUIDANCE_POLICY_INVALID), as the API's boot does
 * (pre-flight PF-D2.6).
 */
export async function readEngineRunnerSettings(
  pool: Pick<Pool, "query">,
  registerVersion: number,
  codeEngineContractHash: string = engineContractHash()
): Promise<EngineRunnerSettings | null> {
  const policy = await readEngineVersionPolicy(pool, registerVersion);
  if (policy === null) return null;
  const lengthPolicyPresent = (await readLengthGuidancePolicy(pool, registerVersion)) !== null;
  return resolveEngineRunnerSettings({
    policy,
    lengthPolicyPresent,
    engineContractHash: lengthPolicyPresent ? await readEngineContractHash(pool, registerVersion) : null,
    codeEngineContractHash
  });
}
