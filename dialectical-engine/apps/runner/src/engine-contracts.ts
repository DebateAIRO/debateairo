import { createHash } from "node:crypto";
import {
  COMPARING_JUDGE_PROMPT_CONTRACT, COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT, POINT_INVESTIGATION_PROMPT_CONTRACT, WEB_STEP_PROMPT_CONTRACTS,
  WEB_WORDING_V2_SEALED_CONTRACTS, judgeAssignedRootV2PromptContract, judgeSourcesSealedContracts
} from "@debateai/judgement";
import { MAP_ENGINE_CONTRACT_NAMES, mapEnginePromptContracts } from "@debateai/map";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { SYNTHESIZER_LENGTH_READER_SOURCES_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SOURCES_PROMPT_CONTRACT } from "@debateai/serve";

/**
 * Engine redesign (spec 2026-10-15 §9; INTERFACE §2.2): the one seal over engine 2's sealed prompt contracts. The runner
 * is the one place that can import map, judgement, serve and its own evaluator contracts, so the list lives here. Engine
 * 1's fingerprints (judge, composer, conformance, map) never gain an engine-2 contract; engine-2 contracts are sealed
 * ONLY by this text's hash, the register's engineContractHash row.
 */
export const ENGINE_CONTRACT_FINGERPRINT_HEADER = "debateai.engine-contracts.v1" as const;

/**
 * Every engine-2 sealed contract, append-only in phase order, never reordered (INTERFACE §2.2, §2.5). R1d: none, so the
 * fingerprint text is the header alone (deviation 2: the story v4 contracts are test-pinned, not sealed). R2a appends
 * verdict.investigate.v1 and R2b verdict.judge.v1 (R2 plan deviation 1); R3 the map v2 contracts and the assigned-root
 * v2 pair; R4 the writer's and checker's engine pair; W1-5 (web search, 2026-10-30) the web wording; W1-5b its second
 * wording as new ids (the v1s it supersedes stay sealed, unused). A phase that
 * appends moves ENGINE_SEALED_IDS and ENGINE_CONTRACT_HASH_SEALED in tests/unit/engine-contract-hash.test.ts.
 */
export function engineSealedContracts(): readonly PromptContract[] {
  // Append-only, in phase order: R2a seals the investigation (spec §4.2b), R2b the comparing judges (spec §4.8); R3 and
  // R4 append theirs after them.
  return Object.freeze([
    POINT_INVESTIGATION_PROMPT_CONTRACT,
    COMPARING_JUDGE_PROMPT_CONTRACT,
    // R3 (engine redesign spec §9, INTERFACE §2.2): the map's eight engine-2 contracts in MAP_ENGINE_CONTRACT_NAMES order,
    // then the fixed-words position writer, unknown then resolved.
    ...MAP_ENGINE_CONTRACT_NAMES.map((name) => mapEnginePromptContracts()[name]),
    judgeAssignedRootV2PromptContract("unknown"),
    judgeAssignedRootV2PromptContract("resolved"),
    // Web search (plan 2026-10-30 task W1-5; design §7.1 items 1-7, approved 2026-10-30): the web step's four (planner,
    // reader 1, the top-3 pick, readers 2 and 3); the arguing legs' and the review's sources variants (items 5, 6); the
    // comparing judges' (item 7); the answer writer's two (item 7). None is in the judge or composer seal.
    ...WEB_STEP_PROMPT_CONTRACTS,
    ...judgeSourcesSealedContracts(),
    COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT,
    SYNTHESIZER_LENGTH_SOURCES_PROMPT_CONTRACT,
    SYNTHESIZER_LENGTH_READER_SOURCES_PROMPT_CONTRACT,
    // W1-5b (owner approvals of 2026-10-30): the planner v2 (the local pair), the pick v2 and readers 2 and 3 v2 (3 or 5
    // pages, from code), and the dig-suggestion call (W0-1 drafts §2.1). web.plan.v1, web.pick.v1 and web.read-top.v1
    // above are never removed or edited: sealed, unused.
    ...WEB_WORDING_V2_SEALED_CONTRACTS
  ]);
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
