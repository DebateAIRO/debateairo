import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Migration 0084 (spec 2026-09-29 §2.4.2-§2.4.3, contract §1; R1 A6, A8, A15,
 * A20; rulings R-12, R-13, R-22), read as text so the CI gate proves the shape
 * without a database. The behaviour is proven on a real database in
 * tests/integration/b5-billing-entitlement.test.ts.
 */
const sql = await readFile(new URL("../../migrations/0084_billing_entitlement.sql", import.meta.url), "utf8");

describe("0084 is append-only, erasure-safe and granted to the runtime alone", () => {
  it("guards both tables against UPDATE, DELETE and TRUNCATE with the purge-aware guard, and verifies the four triggers", () => {
    for (const table of ["billing.entitlement_event", "billing.run_charge_scope"]) {
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\n`
        + "  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge();");
    }
    expect(sql).not.toContain("EXECUTE FUNCTION core.reject_mutation()");
    expect(sql).toMatch(/'billing\.reject_mutation_unless_retention_purge\(\)'::regprocedure/u);
    expect(sql).toMatch(/\)<>4 THEN\s+RAISE EXCEPTION 'BILLING_ENTITLEMENT_APPEND_ONLY_GUARD_INVALID'/u);
  });

  it("defines the A15 guard P1a's tables use too: DELETE only under the purge flag, UPDATE never", () => {
    const guard = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION billing.reject_mutation_unless_retention_purge()"),
      sql.indexOf("REVOKE EXECUTE ON FUNCTION billing.reject_mutation_unless_retention_purge() FROM PUBLIC;")
    );
    expect(guard).toContain("SET search_path = pg_catalog");
    expect(guard).toContain("IF TG_OP = 'DELETE'\n"
      + "     AND pg_catalog.current_setting('debateai.retention_purge', true) IS NOT DISTINCT FROM 'on' THEN\n"
      + "    RETURN NULL;");
    expect(guard).toContain("RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP\n"
      + "    USING ERRCODE = '55000';");
  });

  it("pins search_path on every function it defines (DL5-F5 covers the billing schema from now on)", () => {
    const entitlementAt = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION billing.entitlement_at(p_owner_ref uuid, p_now timestamptz)"),
      sql.indexOf("-- What the runner may read (A20)")
    );
    expect(entitlementAt).toMatch(/STABLE\nSET search_path = pg_catalog\nAS \$\$/u);
    const functions = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (billing\.\w+)\(/gu)].map((match) => match[1]);
    expect(functions).toEqual(["billing.reject_mutation_unless_retention_purge", "billing.entitlement_at"]);
  });

  it("admits every entitlement cause the billing jobs write, R-22's two and Q-1's RENEWAL_PENDING included", () => {
    const causes = sql.slice(sql.indexOf("cause text NOT NULL CHECK (cause IN ("), sql.indexOf("-- NULL for Free;"));
    for (const cause of [
      "SIGNED_UP_FREE", "SUBSCRIBED", "UPGRADED", "DOWNGRADED", "RENEWED", "ENDED_CANCEL", "ENDED_WITHDRAWAL",
      "ENDED_DUNNING", "SUSPENDED_CHARGEBACK", "RESUMED", "ERASURE_STOPPED", "RENEWAL_POSTPONED", "PAST_DUE_GRACE",
      "RENEWAL_PENDING"
    ]) expect(causes, cause).toContain(`'${cause}'`);
    expect([...causes.matchAll(/'([A-Z_]+)'/gu)]).toHaveLength(14);
  });

  it("keeps the three causes that only extend paid access on paid rows (R-22, Q-1)", () => {
    expect(sql).toContain("CONSTRAINT entitlement_event_extension_is_paid\n"
      + "    CHECK (cause NOT IN ('RENEWAL_POSTPONED', 'PAST_DUE_GRACE', 'RENEWAL_PENDING') OR plan_id <> 'FREE')");
  });

  it("never references the account row, so erasure is neither blocked nor cascaded (§2.2 rule 5)", () => {
    expect(sql).not.toMatch(/REFERENCES\s+identity\./u);
    expect(sql).toMatch(/run_id uuid PRIMARY KEY REFERENCES core\.run\(run_id\)/u);
  });

  it("carries the A6 override and the A8 paid-through instant, and one Free sign-up per owner", () => {
    expect(sql).toMatch(/month_credit_override_micros bigint/u);
    expect(sql).toMatch(/paid_through timestamptz/u);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS entitlement_event_one_signup_per_owner[\s\S]*WHERE cause = 'SIGNED_UP_FREE'/u);
  });

  it("grants to debateai_runtime and nobody else, lets it read the windows view (A20), and grants no UPDATE or DELETE (R-12)", () => {
    const grantees = new Set([...sql.matchAll(/^GRANT [^;]* TO (\w+);/gmu)].map((match) => match[1]));
    expect([...grantees]).toEqual(["debateai_runtime"]);
    expect(sql).toContain("GRANT SELECT ON billing.person_windows_v TO debateai_runtime;");
    expect(sql).toContain("GRANT SELECT, INSERT ON billing.entitlement_event, billing.run_charge_scope TO debateai_runtime;");
    expect(sql).not.toMatch(/^GRANT [^;]*\b(?:UPDATE|DELETE|TRUNCATE)\b/mu);
  });
});
