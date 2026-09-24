import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = resolve(import.meta.dirname, "../../apps/runner/src/production-database-principals.ts");

/**
 * DL2-F6 (delta audit), the B30 / L2-F4 rule again: the production principal attestation
 * sorts the MANIFEST in JavaScript and compares it index-wise against rows PostgreSQL
 * returned under `ORDER BY target.rolname`. `rolname` is the `name` type, ordered by bytes,
 * so the two orderings must agree — and `localeCompare` does not order by bytes. They agree
 * today only because every role name happens to be `[a-z_]`. One digit-bearing name, e.g. a
 * second API principal `debateai_prod_api2`, and ICU puts `_` before the digit while the
 * database puts the digit first: the attestation would then fail closed on a correct
 * database, under every locale, at exactly the moment someone provisions the VPS.
 */
describe("DL2-F6 — principal ordering matches PostgreSQL byte order, not a locale", () => {
  it("orders a digit-bearing role name the way the database does", () => {
    const names = ["debateai_prod_api_support", "debateai_prod_api2", "debateai_prod_api"];
    const byCodeUnits = [...names].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    // `LC_ALL=C sort` is byte order — the same order `name` columns use.
    const byBytes = execFileSync("sort", { input: `${names.join("\n")}\n`, encoding: "utf8", env: { ...process.env, LC_ALL: "C" } })
      .trim().split("\n");
    expect(byCodeUnits).toEqual(byBytes);
    expect([...names].sort((left, right) => left.localeCompare(right)), "the defect this pins")
      .not.toEqual(byBytes);
  });

  it("gives the same order under every locale", () => {
    const program = 'const n=["debateai_prod_api_support","debateai_prod_api2"];'
      + 'process.stdout.write(JSON.stringify([...n].sort((l,r)=>l<r?-1:l>r?1:0)));';
    const orders = ["en_US.UTF-8", "cs_CZ.UTF-8", "C"].map((locale) =>
      execFileSync(process.execPath, ["-e", program], { encoding: "utf8", env: { ...process.env, LANG: locale, LC_ALL: locale } }));
    expect(new Set(orders).size, `one order for every locale, saw ${orders.join(" | ")}`).toBe(1);
  });

  it("the attestation source sorts by code units and never by locale", async () => {
    const source = await readFile(SOURCE, "utf8");
    // A CALL, not the word: the comment above the comparator names the defect on purpose.
    expect(source).not.toMatch(/\.localeCompare\s*\(/);
    expect(source).toContain("compareCodeUnits");
  });
});
