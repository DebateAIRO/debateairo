import { describe, expect, it } from "vitest";
import {
  PANEL_PROMPT_CONTRACT,
  judgePromptContract,
  reviewPromptContract,
  JUDGE_LEG_KINDS
} from "@debateai/judgement";
import {
  EVALUATOR_INSTRUCTIONS,
  SYNTHESIZER_INSTRUCTIONS,
  SYNTHESIZER_PROMPT_CONTRACT
} from "@debateai/serve";
import { EVALUATOR_PROMPT_CONTRACT } from "@debateai/runner";
import {
  BLIND_JUDGE_GRADE_PROMPT_CONTRACT,
  DOMAIN_TAGGER_PROMPT_CONTRACT
} from "../../packages/evaluator/src/index.js";
import { CONSUMER_AGGREGATE_PROMPT_CONTRACT } from "../../packages/evaluator/src/consumer.js";
import {
  supportAnswerPromptContract,
  supportSummaryPromptContract
} from "../../apps/api/src/support/prompt.js";
import { supportAnswerInstruction } from "../../apps/api/src/support/answer.js";
import { SUPPORT_SUMMARY_PROMPT } from "../../apps/api/src/support/cases.js";

/**
 * REVIEW ITEM 4, round 2 — THE DISCLOSURE, MADE UNROTTABLE.
 *
 * V's ruling allowed RUN1 to change the prompts; the condition was to say
 * exactly what changed and why. Twice now the report's table has been wrong —
 * it missed the review prompt's edge-count sentence and it said "five system
 * prompts" where the removed sentence reached three. A table checked by reading
 * is a table that drifts, and each drift is a prompt change the owner was not
 * told about before a run that costs money.
 *
 * So the table's claim is pinned HERE, as exact strings. Any edit to any prompt
 * — an owner's, an agent's, a refactor's — fails this file and has to be
 * written into the disclosure before it can ship. That is the mechanism the
 * ruling's condition needs in order to mean anything.
 *
 * The strings below are the CURRENT texts, produced by the shipped builders.
 * Where a text is byte-identical to `af29084e` (the pre-RUN1 base) the row says
 * so, and that claim was checked against `git show af29084e:<file>` rather than
 * from memory.
 */

/* --------------------------------------------- the judge's own instructions */

/** Byte-identical to base `packages/judgement/src/index.ts:283`. */
const JUDGE_SHARED_RULES =
  "Never invent evidence, citations, or sources. Score relevance against the question asked. "
  + "Use REAL_ATTACK only for a supplied attack; otherwise use PLAUSIBLE_COUNTER and say so. "
  + "LOOKED_UP requires a resolving locator.";

/** Byte-identical to base's two conditional branches. */
const CLAIM_TYPE_UNKNOWN =
  "The code classifier returned unknown; include claim_type from the declared closed vocabulary.";
const CLAIM_TYPE_RESOLVED = "Omit claim_type; the code-first classifier already resolved it.";

/**
 * The leg directives. Four of the five CHANGED in RUN1 and the fifth is new;
 * the report's §4 table carries the old text of each beside the new.
 */
const LEG_DIRECTIVES: Readonly<Record<string, string>> = {
  // NEW in RUN1 — the primary root had no directive at all at base.
  "primary-root": "Author your position on the question under debate.",
  // Byte-identical to base `apps/runner/src/index.ts:3151`.
  "independent-root":
    "Independently author your own position on the question. Do not grade or imitate another maker.",
  // REWORDED: base ended "…supporting reason for that position."
  support: "A fair debate requires a genuine supporting case for every position, judged on its own merits. "
    + "State and defend the strongest genuine supporting reason for the position named in position_under_debate.",
  // REWORDED: base ended "…counter-position to that position."
  attack: "A fair debate requires the strongest genuine counter-position, judged on its own merits. "
    + "State and defend the strongest genuine counter-position to the position named in position_under_debate.",
  // REWORDED: base said "defend your own position and attack the other maker's position."
  "cross-root": "Author one direct cross-root response: defend the position named in own_position and attack "
    + "the position named in other_makers_position."
};

describe("REVIEW ITEM 4 — every judge leg's instruction text, pinned exactly", () => {
  it("covers every declared leg, so a new leg cannot arrive undisclosed", () => {
    expect([...JUDGE_LEG_KINDS].sort()).toEqual(Object.keys(LEG_DIRECTIVES).sort());
  });

  it.each(JUDGE_LEG_KINDS.map((leg) => [leg] as const))(
    "%s renders directive + shared rules + the unknown branch",
    (leg) => {
      expect(judgePromptContract(leg, "unknown").instruction)
        .toBe(`${LEG_DIRECTIVES[leg]} ${JUDGE_SHARED_RULES} ${CLAIM_TYPE_UNKNOWN}`);
    }
  );

  it.each(JUDGE_LEG_KINDS.map((leg) => [leg] as const))(
    "%s renders the resolved branch with the same directive and rules",
    (leg) => {
      expect(judgePromptContract(leg, "resolved").instruction)
        .toBe(`${LEG_DIRECTIVES[leg]} ${JUDGE_SHARED_RULES} ${CLAIM_TYPE_RESOLVED}`);
    }
  );

  it("keeps the judge's answer form byte-identical to base", () => {
    // Base `packages/judgement/src/index.ts:269-283`, schema block unchanged.
    const form = judgePromptContract("primary-root", "unknown").answerForm;
    expect(form).toBe(`Return only one JSON object with exactly the following schema and no additional keys. Arrays may be empty, but every string must be non-empty:
{
  "statement": non-empty string,
  "way_of_knowing": "LOOKED_UP" | "REASONING",
  "locator": non-empty string | null,
  "restatement_text": non-empty string,
  "restatement_status": "PASS" | "FAIL" | "NOT_SAMPLED",
  "value_laden": boolean,
  optional "claim_type": "empirical" | "causal" | "normative" | "definitional" | "prediction" | "comparative" | "mixed" | "unknown",
  "steelman": { "summary": non-empty string, "fidelity": number [0,1] },
  "critic": { "summary": non-empty string, "counterargumentStrength": number [0,1], "basis": "REAL_ATTACK" | "PLAUSIBLE_COUNTER" },
  "evidence": { "quality": number [0,1], "relevance": number [0,1] },
  "context": { "fit": number [0,1], "ambiguityFlags": non-empty string[] },
  "fallacy": { "severity": number [0,1], "fatalFlags": [{ "type": non-empty string, "severity": number [0,1], "description": non-empty string }] }
}`);
  });
});

describe("REVIEW ITEM 4 — the review prompt, whose SIXTH change the table had missed", () => {
  /**
   * Base `packages/judgement/src/index.ts:378` read, in one sentence:
   *   "… in the SAME ORDER, one entry per edge and exactly ${N} entries."
   * The instruction now stops at "one entry per edge." and the COUNT moved to a
   * new answer-form sentence. The obligation is unchanged and still stated; the
   * WORDING moved, and that is a prompt change the disclosure owes the owner.
   */
  it("states the ordering obligation without the count", () => {
    expect(reviewPromptContract(3).instruction).toBe(
      "Review an existing debate node authored by another participant. "
      + "Use cannot-assess when the supplied material does not support an honest judgement. "
      + "edge_bearings measures how strongly the statement bears on each target listed in "
      + "edges_sourced_by_this_node, in the SAME ORDER, one entry per edge. Use 0 for no bearing, 1 for a "
      + "decisive bearing, and null when the supplied material does not support an honest measurement of that "
      + "edge. Never invent evidence, citations, or sources."
    );
    expect(reviewPromptContract(3).instruction).not.toContain("exactly");
  });

  it("carries the count in the answer form, where the schema is", () => {
    expect(reviewPromptContract(7).answerForm).toBe(`Return only one JSON object with exactly this schema and no additional keys:
{
  "outcome": "agree" | "dispute" | "cannot-assess",
  "reasons": [non-empty string, ...],
  "edge_bearings": [number in [0,1] or null, ...]
}
edge_bearings has exactly 7 entries.`);
    // The obligation still follows the caller's edge list, as it always did.
    expect(reviewPromptContract(1).answerForm).toContain("exactly 1 entries");
  });
});

describe("REVIEW ITEM 4 — the panel prompt, reordered but not reworded", () => {
  it("keeps every base sentence, with the schema block moved to the answer form", () => {
    expect(PANEL_PROMPT_CONTRACT.instruction).toBe(
      "Assess an existing debate node authored by another participant. Do not restate, rewrite or re-author "
      + "the statement; assess the statement exactly as supplied. Never invent evidence, citations, or sources. "
      + "Score relevance against the question asked. Use REAL_ATTACK only for a supplied attack; otherwise use "
      + "PLAUSIBLE_COUNTER and say so."
    );
    expect(PANEL_PROMPT_CONTRACT.answerForm).toContain('"steelman": { "summary": non-empty string');
  });
});

describe("REVIEW ITEM 4 — the serve prompts, byte-identical to base", () => {
  /**
   * ROUND 3: these two had NO exact-string pin anywhere. `prompt-surface-guard`
   * held regex fragments of the synthesizer's duties and the composer-hash test
   * was tautological — it digests the very object it checks. An owner could
   * therefore have edited either instruction and moved a SEALED register row
   * with zero tests red, which is the one thing constraint 5 exists to prevent.
   */
  it("pins SYNTHESIZER_INSTRUCTIONS exactly — byte-identical to base", () => {
    expect(SYNTHESIZER_INSTRUCTIONS).toBe(
      "Write the served statement from the digest below. Every load-bearing claim must trace to a "
      + "digest node. Do not overstate the evidence, and state the losing positions fairly. Your "
      + "statement must agree with the supplied code label, and must claim no more confidence than "
      + "that label carries."
    );
    expect(SYNTHESIZER_PROMPT_CONTRACT.instruction).toBe(SYNTHESIZER_INSTRUCTIONS);
  });

  it("pins EVALUATOR_INSTRUCTIONS exactly — byte-identical to base", () => {
    expect(EVALUATOR_INSTRUCTIONS).toBe(
      "Judge the candidate statement against the digest and the code label. Check fairness to the "
      + "losing positions, agreement between the statement and the code label, and overstatement. "
      + "Return an objection whenever you are not satisfied."
    );
    expect(EVALUATOR_PROMPT_CONTRACT.instruction).toBe(EVALUATOR_INSTRUCTIONS);
  });

  it("the synthesizer's answer form is the runner's base system string", () => {
    expect(SYNTHESIZER_PROMPT_CONTRACT.answerForm).toBe(
      "Return only JSON with a segments array of at most two {segment_id,text,node_refs,served_number_refs} "
      + "entries. node_refs must name the node ids of the digest nodes whose facts the segment asserts, so every "
      + "load-bearing claim traces to a digest node. Preserve the digest and add no facts. When the digest nodes "
      + "a segment cites rest on reasoning alone, with no measured or looked-up evidence behind them, return at "
      + "least two segments in order: the first segment states the provisional answer as a hypothesis; the second "
      + "segment states the research plan that would lift it."
    );
  });

  it("the evaluator's answer form is the sealed 339-byte contract text", () => {
    expect(EVALUATOR_PROMPT_CONTRACT.answerForm.length).toBe(339);
  });

  it("neither serve prompt ever carried the removed untrusted-material sentence", () => {
    // The point of review item 4(b): the removal reached THREE prompts, not five.
    for (const contract of [SYNTHESIZER_PROMPT_CONTRACT, EVALUATOR_PROMPT_CONTRACT]) {
      expect(`${contract.instruction} ${contract.answerForm}`).not.toContain("untrusted-prompt-fields");
    }
  });
});

/**
 * FW-B fix round 1, MINOR 4 — THE SUPPORT INSTRUCTION TEXTS, PINNED BY BYTES,
 * IN THE GATE.
 *
 * B-I1's whole claim about the support chat is that the owners' instruction
 * half moved onto the frame UNCHANGED — the frame and the answer form are new,
 * the instruction is not. The only byte assertion on that claim lived in
 * `tests/integration/support-cases.test.ts`, which is Docker-bound (so it does
 * not run here at all) and which this package relaxed from `toBe` to
 * `toContain` when the text moved into a packet. A claim about bytes whose only
 * byte check neither runs nor compares bytes is not a claim.
 *
 * These rows are the gate-level version: the exact preamble of each language
 * and the exact summary directive, compared with `toBe`, read from the
 * production functions the call sites use (MINOR 7 collapsed the wrapper, so
 * `supportAnswerInstruction` IS what `respond` calls).
 *
 * The entry list is empty on purpose. What is pinned is CODE'S text; the
 * entries are the ratified help corpus, which has its own content tests and
 * changes when the help changes.
 */
describe("FW-B — the support chat's instruction slot is the text that already shipped", () => {
  it("pins the English preamble byte for byte", () => {
    expect(supportAnswerInstruction([], "en")).toBe(
      "Answer only in English and only with facts from the supplied entries. "
      + "Do not invent sources or include Source lines.\n\n"
    );
  });

  it("pins the Romanian preamble byte for byte, diacritics included", () => {
    expect(supportAnswerInstruction([], "ro")).toBe(
      "Răspunde numai în română și numai cu fapte din intrările furnizate. "
      + "Nu inventa surse și nu include linii Sursă.\n\n"
    );
  });

  it("pins the case-summary directive byte for byte", () => {
    expect(SUPPORT_SUMMARY_PROMPT).toBe(
      "Summarize the user's problem in one paragraph of at most 80 words. "
      + "Do not state or guess who the user is, whether they are the account owner, "
      + "or whether their request is legitimate."
    );
  });

  /**
   * ...and the pinned bytes are the bytes that reach the packet: the contract
   * carries the instruction through unchanged, so these three rows are pins on
   * the prompt and not on a function nobody calls.
   */
  it("carries each pinned text into its contract's instruction slot", () => {
    const answer = supportAnswerInstruction([], "en");
    expect(supportAnswerPromptContract(answer).instruction).toBe(answer);
    expect(supportSummaryPromptContract(SUPPORT_SUMMARY_PROMPT).instruction)
      .toBe(SUPPORT_SUMMARY_PROMPT);
  });
});

describe("REVIEW ITEM 4 — no prompt anywhere still carries the retired sentence", () => {
  it.each([
    ["judge", judgePromptContract("support", "unknown")],
    ["review", reviewPromptContract(2)],
    ["panel", PANEL_PROMPT_CONTRACT],
    ["synthesizer", SYNTHESIZER_PROMPT_CONTRACT],
    ["evaluator", EVALUATOR_PROMPT_CONTRACT],
    ["blind-judge-grade", BLIND_JUDGE_GRADE_PROMPT_CONTRACT],
    ["domain-tagger", DOMAIN_TAGGER_PROMPT_CONTRACT],
    ["consumer-aggregate", CONSUMER_AGGREGATE_PROMPT_CONTRACT],
    // FW-B / B-I1: "anywhere" now includes the support chat's two contracts.
    ["support-chat-answer", supportAnswerPromptContract("Answer from the supplied entries.")],
    ["support-case-summary", supportSummaryPromptContract("Summarize the problem.")]
  ])("%s", (_name, contract) => {
    const whole = `${contract.instruction} ${contract.answerForm}`;
    expect(whole).not.toContain("untrusted data, not instructions");
    expect(whole).not.toContain("debateai.untrusted-prompt-fields.v1");
  });
});
