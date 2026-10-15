import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildAcceptanceRegisterRows } from "../../acceptance/seed-register.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { EVALUATOR_CONTRACT_TEXT, EVALUATOR_PROMPT_CONTRACT, EVALUATOR_V1_PROMPT_CONTRACT } from "@debateai/runner";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_PROMPT_CONTRACT } from "@debateai/serve";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const sourceOf = (relative: string): Promise<string> =>
  readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

/**
 * F-SEALEDROWS-A. The conformance slot fingerprints the EVALUATOR prompt alone
 * (V, 2026-09-04): the writer's prompt already carries `composerContractHash`,
 * so one slot holds one prompt and a later edit says WHICH wording moved.
 *
 * THREE LOCATORS DIED BEFORE THIS FILE LOOKED LIKE THIS, and all three failed
 * the same way — each could resolve to something that was not the evaluator
 * prompt:
 *   1. quoting the prompt's own words matched ZERO after T9 reworded it (LOUD);
 *   2. taking the first object carrying a `criteria` member let an unrelated
 *      schema declared EARLIER win (QUIET, codex r1);
 *   3. balancing braces over raw text miscounted a `}` inside a string, comment,
 *      regex or template literal, and matched a COMMENTED-OUT declaration after
 *      a real rename — returning an unrelated prompt with exit 0 (QUIET again,
 *      codex r2).
 *
 * There is no locator now. `apps/runner/src/index.ts` exports the prompt and
 * SENDS that same constant; the seeders import and digest it. The tests below
 * therefore do not probe a search — they pin the two properties that make a
 * search unnecessary, and one that makes reintroducing a search visible.
 */
describe("F-SEALEDROWS-A · the conformance fingerprint is the evaluator prompt, unsearched", () => {
  it("builds BOTH deployment seeders", async () => {
    expect((await buildAcceptanceRegisterRows()).length).toBeGreaterThan(0);
    expect((await buildDevelopmentRunnerRegisterRows()).length).toBeGreaterThan(0);
  });

  it("fingerprints the exported evaluator constant in BOTH deployments", async () => {
    const acceptance = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    const development = Object.fromEntries((await buildDevelopmentRunnerRegisterRows()).map((r) => [r.rowKey, r.value]));
    expect(acceptance.conformanceContractHash)
      .toBe(sha256(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT as PromptContract)));
    expect(development.conformanceContractHash).toBe(acceptance.conformanceContractHash);
  });

  /**
   * THE VALUE ITSELF, pinned. Moving the prompt into a constant was a mechanism
   * change and must NOT have been a product change: this is the digest the
   * sealed registers already carry, so no deployment needs re-seeding. It is
   * also the guard V's ruling actually needs — editing the prompt changes a
   * sealed register value, and this test is where that becomes visible instead
   * of silent.
   */
  /**
   * THE VALUE ITSELF, pinned — and MOVED ONCE, deliberately, by RUN1.
   *
   * The evaluator's own words are byte-identical to what shipped (the length and
   * digest below are the sealed ones from 2026-09-04, unchanged); what moved is
   * that the text is now the ANSWER FORM of a prompt contract whose instruction
   * slot holds `EVALUATOR_INSTRUCTIONS` and whose frame version is folded in.
   * That is why `conformanceContractHash` moved from
   * `2364b1b548c0e5a4f758ef325ed0234764aec9f88bc340a1f8c958bd3cc69b73` to the
   * value below, published as register version 6 (constraint 5: the sealed row
   * is SUPERSEDED, never edited).
   */
  it("has NOT moved the evaluator's own words, and pins the new sealed fingerprint", async () => {
    expect(EVALUATOR_CONTRACT_TEXT.length).toBe(339);
    expect(sha256(EVALUATOR_CONTRACT_TEXT))
      .toBe("2364b1b548c0e5a4f758ef325ed0234764aec9f88bc340a1f8c958bd3cc69b73");
    expect((EVALUATOR_PROMPT_CONTRACT as PromptContract).answerForm).toBe(EVALUATOR_CONTRACT_TEXT);
    // Practice debate 3 (2026-10-12): serve.evaluator.v2 changed only the owners' instruction slot
    // (owner-approved wording), so the answer form above is still the sealed 2026-09-04 text and the
    // fingerprint moves again, to a NEW sealed value; serve.evaluator.v1's f205421c…9dcc stays history
    // (register versions sealed before v2, the preview's 11 among them, carry it).
    expect(sha256(promptContractFingerprintText(EVALUATOR_V1_PROMPT_CONTRACT as PromptContract)))
      .toBe("f205421cc088ff2f3b4981bfffbfaa09224c2d0ec974c2852ad4b2138e929dcc");
    expect(sha256(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT as PromptContract)))
      .toBe("660ec7cba5aa70bbd29e190580b7385802cd21bc6b212d11646b54c1d84ee22f");
  });

  /**
   * ROUND 3 — the OTHER two sealed rows, pinned as literals.
   *
   * `conformanceContractHash` has been pinned by value since 2026-09-04 and that
   * is what made RUN1's move of it VISIBLE. `judgeContractHash` and
   * `composerContractHash` moved in RUN1 with no literal anywhere: every test
   * that touched them recomputed them from the same objects they were checking,
   * so a later prompt edit would have moved a sealed register value with zero
   * tests red. Constraint 5 says a sealed value is superseded, never edited —
   * these two rows are what make an edit impossible to miss.
   *
   * Both are register version 6 (RUN1); the version 5 values are recorded in
   * the RUN1 report's hash table as history.
   */
  it("pins the judge and composer fingerprints as sealed VALUES, not derivations", async () => {
    const acceptance = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    const development = Object.fromEntries((await buildDevelopmentRunnerRegisterRows()).map((r) => [r.rowKey, r.value]));
    // Debate shape (Phase 2b Task 4): the judge seal grew from e7f7e4b0…1365 (frozen V1, history) by six contracts.
    expect(acceptance.judgeContractHash)
      .toBe("aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612");
    // serve.synthesizer.v2 (2026-10-09) superseded the v1 composer seal
    // d96e7cc9…c866, and serve.synthesizer.v3 (2026-10-12, practice debate 3)
    // superseded v2's 340e11a6…8b70 (register versions sealed before each keep
    // the value they carry). The debate shape's length variant (2026-10-13)
    // joined v3 in this seal; v3's 4b141d3a…f90f is history. Answer writer v4
    // (owner-approved wording, 2026-10-15) with its length variant length.v2
    // superseded v3 + length.v1's 9a46af29…5662, which is history too.
    expect(acceptance.composerContractHash)
      .toBe("879d2c5d0213832fe466537603e5171e53248cce41188473550616d2dd5b4a47");
    // Both deployments seal the same values, or one of them is seeding a prompt
    // the other never sends.
    expect(development.judgeContractHash).toBe(acceptance.judgeContractHash);
    expect(development.composerContractHash).toBe(acceptance.composerContractHash);
  });

  it("keeps the writer's prompt in its own slot — evaluator ALONE (V 2026-09-04)", async () => {
    const acceptance = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    // RUN1: the writer's prompt is its own CONTRACT now, not a literal in the
    // runner's source, so the slot separation is asserted against the objects.
    expect(acceptance.conformanceContractHash).not.toBe(acceptance.composerContractHash);
    expect(acceptance.composerContractHash)
      .toBe(sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT));
    expect(acceptance.conformanceContractHash).not.toBe(
      sha256([
        promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
        promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT as PromptContract)
      ].join("\n"))
    );
  });

  /**
   * WHAT USED TO STAND HERE, AND WHY IT IS GONE (codex r4 B1).
   *
   * Four source-reading predicates: the call site must contain an exact
   * fragment, the seeders must contain an exact initializer, an exact import
   * form, an exact single definition. Codex defeated all of them at once —
   * keep the 339-byte prompt, re-export it under the same name from a
   * differently named local, put the exact expected fragments in a COMMENT,
   * and point the real evaluator packet at another identifier. Every predicate
   * returned true and the provider received different text. They also REJECTED
   * correct code: a multiline initializer, an aliased import, a reordered
   * system-message literal and a one-line constant all failed them.
   *
   * That is the fifth form of one defect, and the lesson is the one this lane
   *already learned twice: a check that reads the code which builds a request is a
   * proxy for the request. The seeder half stopped being a proxy when it tested
   * behaviour; this half now does the same. What the runner SENDS is asserted
   * where it is sent — at the provider gateway, in
   * `tests/integration/database.test.ts`, "SENDS the exported evaluator
   * contract to the provider, observed at the gateway boundary". Formatting,
   * aliases and field order cannot reach that assertion; sending different text
   * is the only thing that can fail it.
   */

});
