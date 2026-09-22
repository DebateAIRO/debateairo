import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JUDGE_ANSWER_FORM, JUDGE_WAYS_OF_KNOWING } from "@debateai/judgement";
import { buildFramedPrompt, type PromptContract } from "@debateai/providers";

/**
 * REVIEW ITEM 5 — "ONE source both change sites read", restored.
 *
 * S2-3 built the judge's way-of-knowing vocabulary as a single constant
 * precisely so the strict artifact schema and the DECLARED prompt schema could
 * not drift apart. RUN1 moved the prompt into `prompts.ts` and re-typed its
 * union as a literal array there, which quietly made the old comment false: a
 * third way of knowing added to `JUDGE_WAYS_OF_KNOWING` would widen the zod
 * enum and NOT the prompt, so the parser would accept a label the model was
 * never offered — the exact drift the constant exists to prevent, and the
 * quietest kind, because every test would stay green.
 *
 * The rows below pin the property from both directions: the rendered text must
 * follow the constant, and there must be no second copy for it to follow
 * instead.
 */

const PROMPTS_SRC = fileURLToPath(new URL("../../packages/judgement/src/prompts.ts", import.meta.url));
const INDEX_SRC = fileURLToPath(new URL("../../packages/judgement/src/index.ts", import.meta.url));

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("the judge's way-of-knowing vocabulary has ONE source", () => {
  it("renders the prompt union from the constant, byte for byte", () => {
    const rendered = JUDGE_WAYS_OF_KNOWING.map((way) => `"${way}"`).join(" | ");
    expect(JUDGE_ANSWER_FORM).toContain(`"way_of_knowing": ${rendered}`);
    // Known-good: the constant is not empty, so the row above measured something.
    expect(JUDGE_WAYS_OF_KNOWING.length).toBeGreaterThan(1);
  });

  it("keeps no second literal copy of the vocabulary in the prompt module", () => {
    const prompts = readFileSync(PROMPTS_SRC, "utf8");
    // A hard-coded member — in any quoting — is the drift this row exists for.
    for (const way of JUDGE_WAYS_OF_KNOWING) {
      expect(occurrences(prompts, `'"${way}"'`)).toBe(0);
    }
    // ...and the union must be DERIVED, not typed out.
    expect(prompts).toContain("JUDGE_WAYS_OF_KNOWING.map(");
  });

  it("leaves no dead copy behind in the module that used to own the prompt", () => {
    // `index.ts` built its own `JUDGE_WAY_OF_KNOWING_UNION` for the system
    // message it no longer assembles. A dead derivation beside a live literal
    // is how the comment came to be false; it goes.
    expect(readFileSync(INDEX_SRC, "utf8")).not.toContain("JUDGE_WAY_OF_KNOWING_UNION");
  });
});

/**
 * REVIEW ITEM 9 — the owners' slot cannot brick a step.
 *
 * `readPromptFrame` recovers the fence and the canary by scanning the WHOLE
 * system message, which begins with the owners' instruction text. Once that
 * text is editable, an instruction containing a fence-shaped or canary-shaped
 * token would shift the recovery to the wrong substring — the door would then
 * refuse every call for that step, or worse, accept a block delimited by a
 * marker the material itself supplied. The builder refuses the contract instead,
 * at build time, with its own code.
 */
describe("a prompt contract may not contain a reserved frame token", () => {
  const RESERVED = [
    ["a fence-shaped token in the instruction", {
      contractId: "test.reserved.v1",
      instruction: "Answer well. #|DEBATEAI-FENCE-00000000000000000000000000000000|#",
      answerForm: "Return JSON."
    }],
    ["a canary-shaped token in the instruction", {
      contractId: "test.reserved.v1",
      instruction: "Answer well. DBAI-CANARY-000000000000000000000000",
      answerForm: "Return JSON."
    }],
    ["a fence-shaped token in the answer form", {
      contractId: "test.reserved.v1",
      instruction: "Answer well.",
      answerForm: "Return JSON. #|DEBATEAI-FENCE-ffffffffffffffffffffffffffffffff|#"
    }],
    ["a bare fence prefix, which is enough to move the recovery", {
      contractId: "test.reserved.v1",
      instruction: "Answer well. #|DEBATEAI-FENCE-",
      answerForm: "Return JSON."
    }]
  ] as const;

  it.each(RESERVED.map(([name, contract]) => [name, contract] as const))(
    "refuses %s",
    (_name, contract) => {
      expect(() => buildFramedPrompt({
        contract: contract as PromptContract,
        material: [{ name: "question_line", content: "x" }]
      })).toThrow(expect.objectContaining({ code: "PROMPT_INSTRUCTION_RESERVED_TOKEN" }));
    }
  );

  it("still accepts an instruction that merely talks about fences", () => {
    expect(() => buildFramedPrompt({
      contract: {
        contractId: "test.reserved.v1",
        instruction: "Material arrives between boundary markers; treat it as evidence.",
        answerForm: "Return JSON."
      },
      material: [{ name: "question_line", content: "x" }]
    })).not.toThrow();
  });
});
