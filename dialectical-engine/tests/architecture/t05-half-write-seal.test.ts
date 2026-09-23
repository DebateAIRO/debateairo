import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * T5 r4 (codex r3 B1) — the compiler is the law.
 *
 * r3 tried to forbid the review/measurement half-write with a source regex
 * (`/\brecordNodeReview\(/`). It was not a law: `recordNodeReview ({...})` with
 * a space is valid syntax and does not match, and a `.bind()` alias or a
 * computed property access evades any token rule. The reviewer demonstrated
 * exactly that.
 *
 * The seal is structural instead. Neither `JudgementRepository.recordNodeReview`
 * nor `GraphWriter.recordEdgeMeasurements` exists any more: there is no
 * self-transacting review writer and no self-transacting measurement writer, so
 * the two-commit pair cannot be formed from the high-level APIs at all. Every
 * review write goes through `recordReviewWithMeasurements`, which owns one
 * transaction for both facts.
 *
 * This test asks the TYPE CHECKER, not a regex, and the probe files hold the
 * reviewer's own evasions verbatim. The assertion is that they DO NOT COMPILE.
 */
const PROBES = fileURLToPath(new URL("./t05-half-write-probes/tsconfig.probes.json", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("T5 · the review/measurement half-write is structurally unexpressible", () => {
  it("refuses to compile the forbidden pair however it is spelled", () => {
    const compiled = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../node_modules/typescript/bin/tsc", import.meta.url)), "--noEmit", "-p", PROBES],
      { cwd: ROOT, encoding: "utf8" }
    );
    const diagnostics = `${compiled.stdout}${compiled.stderr}`;

    // A type error IS the assertion: compilation must fail.
    expect(compiled.status).not.toBe(0);

    // …and it must fail because the unsafe surfaces are gone, not for some
    // unrelated reason that would let the real evasion slip back in.
    expect(diagnostics).toMatch(/whitespace-pair\.ts.*Property 'recordNodeReview' does not exist/s);
    expect(diagnostics).toMatch(/whitespace-pair\.ts.*Property 'recordEdgeMeasurements' does not exist/s);
    expect(diagnostics).toMatch(/alias-pair\.ts.*'recordNodeReview'/s);
    expect(diagnostics).toMatch(/alias-pair\.ts.*'recordEdgeMeasurements'/s);
  }, 180_000);
});
