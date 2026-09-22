import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { promptContractFingerprintText } from "@debateai/providers";

/**
 * F-SEALEDROWS-A · codex r3 B1, part 1 — THE DATAFLOW PROPERTY, TESTED AS
 * DATAFLOW RATHER THAN AS SPELLING.
 *
 * The property both seeders must have is "the conformance slot digests the
 * IMPORTED constant". The previous guard tried to state that by banning four
 * spellings of the alternative, and codex bypassed it in one line: reintroduce
 * `digest(requireMatch(runner, /EVALUATOR_CONTRACT_TEXT\s*=\s*"([^"]+)"/, ...))`
 * and every test stayed green, because a deny-list only knows the forms someone
 * thought to forbid.
 *
 * So this does not read the source at all. It REPLACES the exported constant
 * with a sentinel and requires both sealed fingerprints to follow it. A seeder
 * that digests the import follows the sentinel; a seeder that searches the
 * runner's source text keeps hashing the real prompt and FAILS — as does any
 * other form that does not read the import, including forms nobody predicted.
 * That is what makes it positive: the check passes only for code that actually
 * carries the value through, and fails by default for everything else.
 *
 * A TypeScript AST check was preferred by the reviewer. TypeScript 7.0.2 is the
 * native port: its package entry exports only `version`, `createSourceFile`
 * does not exist, and parsing requires standing up a Program through
 * `typescript/unstable/sync` — too heavy for a unit test, and still only a
 * structural approximation of the property this asserts directly.
 */
const SENTINEL = "SENTINEL evaluator contract text — not the shipped prompt.";

/**
 * RUN1 (V-11 addendum): the seeders now fingerprint the evaluator's PROMPT
 * CONTRACT — the owners' instruction slot plus the code-owned answer form plus
 * the frame version — rather than one bare string. The property this file owns
 * is unchanged and is asserted the same way: the fingerprint FOLLOWS the object
 * the runner sends, so replacing that object here must move both deployments'
 * hash. A source scan would be blind to this substitution, which is the point.
 */
const SENTINEL_CONTRACT = Object.freeze({
  contractId: "serve.evaluator.v1",
  instruction: "SENTINEL evaluator instructions — not the shipped text.",
  answerForm: SENTINEL
});

vi.mock("@debateai/runner", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, EVALUATOR_CONTRACT_TEXT: SENTINEL, EVALUATOR_PROMPT_CONTRACT: SENTINEL_CONTRACT };
});

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("F-SEALEDROWS-A · the fingerprint FOLLOWS the constant, in both deployments", () => {
  it("acceptance digests the imported constant, not the runner's source text", async () => {
    const { buildAcceptanceRegisterRows } = await import("../../acceptance/seed-register.js");
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    expect(rows.conformanceContractHash).toBe(sha256(promptContractFingerprintText(SENTINEL_CONTRACT)));
  });

  it("development digests the imported constant, not the runner's source text", async () => {
    const { buildDevelopmentRunnerRegisterRows } = await import("../../apps/runner/src/dev-deployment-register.js");
    const rows = Object.fromEntries((await buildDevelopmentRunnerRegisterRows()).map((r) => [r.rowKey, r.value]));
    expect(rows.conformanceContractHash).toBe(sha256(promptContractFingerprintText(SENTINEL_CONTRACT)));
  });
});

/**
 * codex r3 B1, part 2 — SCHEMA/PROMPT AGREEMENT, the invariant whose coverage was
 * deleted rather than made moot.
 *
 * Deleting the locator removed the parser/prompt-drift refusal in its OLD FORM.
 * It did NOT make the invariant untrue, and I was wrong to call the whole of B1b
 * moot by construction: the per-copy zero/duplicate/anchor cases really had
 * nothing left to exercise, but this one did. Add a required boolean criterion
 * to `evaluatorVerdictSchema` and leave `EVALUATOR_CONTRACT_TEXT` alone and the
 * suite stayed green — while every provider response, following the SENT prompt,
 * would omit a member the parser now requires, and the content-repair path would
 * exhaust on a prompt that cannot satisfy its own schema.
 *
 * The keys come from the DECLARED zod shape at runtime, so this cannot go stale
 * the way a source scan does: rename a criterion and the new name must appear in
 * the prompt, whatever spelling it takes.
 */
describe("F-SEALEDROWS-A · the parser and the prompt agree", () => {
  it("names every DECLARED criterion in the prompt the provider is actually sent", async () => {
    const runner = await vi.importActual<Record<string, unknown>>("@debateai/runner");
    const schema = runner.evaluatorVerdictSchema as {
      shape: { criteria: { shape: Record<string, unknown> } };
    };
    const declared = Object.keys(schema.shape.criteria.shape);
    const prompt = runner.EVALUATOR_CONTRACT_TEXT as string;

    // the check is worthless if the shape came back empty
    expect(declared.length).toBeGreaterThan(0);
    for (const criterion of declared) {
      expect(prompt, `the prompt must name the declared criterion ${criterion}`).toContain(criterion);
    }
  });

  it("declares no criterion the prompt cannot ask for — the two sets are the SAME size", async () => {
    const runner = await vi.importActual<Record<string, unknown>>("@debateai/runner");
    const schema = runner.evaluatorVerdictSchema as {
      shape: { criteria: { shape: Record<string, unknown> } };
    };
    const declared = Object.keys(schema.shape.criteria.shape);
    const prompt = runner.EVALUATOR_CONTRACT_TEXT as string;
    // the prompt states its criteria as a brace-delimited list; every name in
    // that list must be declared, so the prompt cannot ask for something the
    // parser will reject either.
    const listed = prompt.match(/criteria is \{([^}]+)\}/)?.[1]?.split(",").map((k) => k.trim()) ?? [];
    expect(listed.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...declared].sort());
  });
});
