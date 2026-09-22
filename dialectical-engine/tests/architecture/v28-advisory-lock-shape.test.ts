import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * RE-REVIEW CRITICAL 1 — THE ADVISORY LOCK MUST NAME A FUNCTION THAT EXISTS.
 *
 * Round 2's daily-admission lock was written as
 * `pg_advisory_xact_lock(hashtext(…)::bigint, hashtext($1)::bigint)`.
 * PostgreSQL has `pg_advisory_xact_lock(bigint)` and
 * `pg_advisory_xact_lock(integer, integer)` — and bigint → integer is an
 * ASSIGNMENT cast, not an implicit one, so the two-argument call resolves to no
 * function at all. Every hosted ask would have raised 42883 out of
 * `evaluateAskAdmission`, where `markAskRefusal` wraps only `TypedDomainError`,
 * and answered 500.
 *
 * Nothing here can execute SQL — the engine is down for this whole package — so
 * the guard is on the STATEMENT TEXT, which is the part that was wrong. The
 * repository already has one correct shape, used a dozen times in
 * `migrations/0040_account_erasure.sql`: the single-argument `bigint` form over
 * `hashtextextended(<text>, 0)`. This row requires it and forbids the
 * two-argument form, so the same mistake cannot come back through a later edit.
 *
 * The behavioural proof — that two real backends serialise — is in
 * `tests/integration/v28-model-spend.test.ts`, which is NOT RUN here.
 */
const STORE = new URL("../../packages/budget/src/model-spend.ts", import.meta.url);

describe("V-28 the daily-admission lock uses a function PostgreSQL has", () => {
  it("takes the single-key bigint form over hashtextextended(…, 0)", async () => {
    const source = await readFile(STORE, "utf8");

    expect(source).toContain("pg_advisory_xact_lock(");
    expect(source).toMatch(/pg_catalog\.hashtextextended\([^)]*,\s*0\s*\)/u);
  });

  it("never passes two keys, which would resolve to no function", async () => {
    const source = await readFile(STORE, "utf8");
    // The statement is built by TypeScript string concatenation, so the SQL is
    // reconstructed before it is read: `"…" + "…"` becomes one string.
    const sql = source.replace(/"\s*\+\s*"/gu, "");

    const calls: string[] = [];
    for (const match of sql.matchAll(/pg_advisory_xact_lock\(/gu)) {
      let depth = 1;
      let index = match.index + match[0].length;
      const start = index;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "(") depth += 1;
        if (sql[index] === ")") depth -= 1;
        index += 1;
      }
      calls.push(sql.slice(start, index - 1));
    }

    expect(calls).toHaveLength(1);
    // A top-level comma is a second key, which means the (integer, integer)
    // overload — and every key this code can build is a bigint.
    for (const argument of calls) {
      let depth = 0;
      for (const character of argument) {
        if (character === "(") depth += 1;
        else if (character === ")") depth -= 1;
        else if (character === "," && depth === 0) {
          throw new Error(`pg_advisory_xact_lock was passed two keys: ${argument}`);
        }
      }
    }
  });

  it("never uses hashtext, whose result is an integer", async () => {
    const source = await readFile(STORE, "utf8");

    // `hashtext` returns integer; casting it to bigint is what produced the
    // unresolvable two-argument call in the first place.
    expect(source).not.toMatch(/\bhashtext\(/u);
  });
});
