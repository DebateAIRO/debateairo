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
