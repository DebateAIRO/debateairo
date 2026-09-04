import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildAcceptanceRegisterRows } from "../../acceptance/seed-register.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { EVALUATOR_CONTRACT_TEXT } from "@debateai/runner";

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
    expect(acceptance.conformanceContractHash).toBe(sha256(EVALUATOR_CONTRACT_TEXT));
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
  it("has NOT moved the sealed value — the prompt is byte-identical to what shipped", async () => {
    expect(EVALUATOR_CONTRACT_TEXT.length).toBe(339);
    expect(sha256(EVALUATOR_CONTRACT_TEXT))
      .toBe("2364b1b548c0e5a4f758ef325ed0234764aec9f88bc340a1f8c958bd3cc69b73");
  });

  it("keeps the writer's prompt in its own slot — evaluator ALONE (V 2026-09-04)", async () => {
    const runner = await sourceOf("apps/runner/src/index.ts");
    const acceptance = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    const composer = runner.match(/content: "(Return only JSON with a segments array[^"]+)"/)?.[1];
    expect(composer).toBeDefined();
    expect(acceptance.conformanceContractHash).not.toBe(acceptance.composerContractHash);
    expect(acceptance.conformanceContractHash).not.toBe(sha256(composer!));
    expect(acceptance.conformanceContractHash).not.toBe(sha256([composer, EVALUATOR_CONTRACT_TEXT].join("\n")));
  });

  /**
   * THE THING HASHED IS THE THING SENT. A fingerprint over a constant proves
   * nothing if the wire still carries a literal, so the evaluator call site must
   * reference the constant and no `Return only JSON {satisfied` literal may
   * survive anywhere in the runner.
   */
  it("SENDS the constant it fingerprints — no literal survives at the call site", async () => {
    const runner = await sourceOf("apps/runner/src/index.ts");
    expect(runner).toContain('{ role: "system", content: EVALUATOR_CONTRACT_TEXT },');
    const literals = [...runner.matchAll(/content: "Return only JSON \{satisfied/g)];
    expect(literals).toHaveLength(0);
  });

  /**
   * THE POSITIVE STRUCTURAL FORM (codex r3 B1, part 1).
   *
   * What stood here was a DENY-LIST: it banned four spellings of a source
   * search. Codex bypassed it in one line with a fifth spelling, and every test
   * stayed green. A deny-list is the same mistake as a text search one level up
   * — it enumerates the forms it knows.
   *
   * So this states what each site MUST BE, exactly, and anything else fails by
   * default whether or not anyone predicted it. The dataflow itself is proven
   * separately and behaviourally in `f-sealedrows-a-dataflow.test.ts`, which
   * substitutes the constant and requires both fingerprints to follow it; this
   * covers the half that cannot be observed at runtime — what the runner SENDS.
   */
  it("takes the fingerprint from the imported identifier, in exactly that form, in BOTH seeders", async () => {
    for (const relative of ["acceptance/seed-register.ts", "apps/runner/src/dev-deployment-register.ts"]) {
      const source = await sourceOf(relative);
      // the ONE accepted initializer, verbatim
      expect(source, relative).toContain("conformanceContractHash: digest(EVALUATOR_CONTRACT_TEXT),");
      // and the identifier is IMPORT-BOUND, not a local of any kind
      expect(source, relative).toMatch(/import \{ EVALUATOR_CONTRACT_TEXT \} from "[^"]+";/);
      // exactly one conformance initializer, so a second cannot hide beside it
      expect([...source.matchAll(/conformanceContractHash:/g)], relative).toHaveLength(1);
    }
  });

  it("SENDS that identifier as the evaluator system message, in exactly that form", async () => {
    const runner = await sourceOf("apps/runner/src/index.ts");
    expect([...runner.matchAll(/\{ role: "system", content: EVALUATOR_CONTRACT_TEXT \},/g)]).toHaveLength(1);
    // exactly one definition, and it is an exported string constant
    expect([...runner.matchAll(/export const EVALUATOR_CONTRACT_TEXT =\n  "/g)]).toHaveLength(1);
    // every OTHER system message must carry a literal; none may carry the
    // evaluator prompt's opening, which is how a second copy would return
    expect([...runner.matchAll(/content: "Return only JSON \{satisfied/g)]).toHaveLength(0);
  });

  it("keeps ONE definition — F-SEALEDROWS-C closed, not merely pinned by test", async () => {
    const runner = await sourceOf("apps/runner/src/index.ts");
    expect([...runner.matchAll(/export const EVALUATOR_CONTRACT_TEXT/g)]).toHaveLength(1);
    for (const relative of ["acceptance/seed-register.ts", "apps/runner/src/dev-deployment-register.ts"]) {
      const source = await sourceOf(relative);
      expect(source).toMatch(/import \{ EVALUATOR_CONTRACT_TEXT \} from/);
    }
  });
});
