import { createHash } from "node:crypto";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";

/**
 * Engine redesign (spec 2026-10-15 §9; INTERFACE §2.2): the one seal over engine 2's sealed prompt contracts. The runner
 * is the one place that can import map, judgement, serve and its own evaluator contracts, so the list lives here. Engine
 * 1's fingerprints (judge, composer, conformance, map) never gain an engine-2 contract; engine-2 contracts are sealed
 * ONLY by this text's hash, the register's engineContractHash row.
 */
export const ENGINE_CONTRACT_FINGERPRINT_HEADER = "debateai.engine-contracts.v1" as const;

/**
 * Every engine-2 sealed contract, append-only in phase order, never reordered (INTERFACE §2.2, §2.5). R1d: none, so the
 * fingerprint text is the header alone (deviation 2: the story v4 contracts are test-pinned, not sealed). R2 appends
 * verdict.judge.v1 and verdict.investigate.v1; R3 the map v2 contracts and the assigned-root v2 pair; R4 the writer's
 * and checker's engine pair. A phase that appends moves tests/unit/engine-contract-hash.test.ts's two pins.
 */
export function engineSealedContracts(): readonly PromptContract[] {
  return Object.freeze([]);
}

/** The ids of engineSealedContracts(), in order (pinned by tests/unit/engine-contract-hash.test.ts). */
export const ENGINE_SEALED_CONTRACT_IDS: readonly string[] = Object.freeze(engineSealedContracts().map((contract) => contract.contractId));

/** The header, then each contract's own fingerprint text (frame version included), joined as the map's text is joined. */
export function engineContractFingerprintText(contracts: readonly PromptContract[] = engineSealedContracts()): string {
  return [ENGINE_CONTRACT_FINGERPRINT_HEADER, ...contracts.map((contract) => promptContractFingerprintText(contract))].join("\n---\n");
}

/** The seal: what the register's engineContractHash row must equal, and what every engine-2 call carries as `contractHash`. */
export function engineContractHash(contracts: readonly PromptContract[] = engineSealedContracts()): string {
  return createHash("sha256").update(engineContractFingerprintText(contracts)).digest("hex");
}
