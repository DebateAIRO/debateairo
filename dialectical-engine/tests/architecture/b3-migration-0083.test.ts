import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Migration 0083 read as TEXT, so the CI gate proves its shape without a
 * database (the behaviour is proven in tests/integration/b3-holds-waiting-line.test.ts,
 * which CI skips).
 */
const sql = await readFile(new URL("../../migrations/0083_budget_holds_waiting_line.sql", import.meta.url), "utf8");

describe("B3 migration 0083 as text", () => {
  it("lets the owner's disclosure row name the person's allowance as a stop, replay-safely (R-20)", () => {
    for (const name of ["serve_disclosure_body_stop_check", "serve_disclosure_serve_stop_check"]) {
      const drop = sql.indexOf(`ALTER TABLE serve.serve_disclosure DROP CONSTRAINT IF EXISTS ${name};`);
      const add = sql.indexOf(`ALTER TABLE serve.serve_disclosure ADD CONSTRAINT ${name}`);
      expect(drop, name).toBeGreaterThan(-1);
      expect(add, name).toBeGreaterThan(drop);
    }
    expect(sql).toContain("CHECK (body_stop IS NULL OR body_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY', 'ALLOWANCE'))");
    expect(sql).toContain(
      "CHECK (serve_stop IS NULL OR serve_stop IN ('MONEY', 'ATTEMPTS', 'USAGE', 'DAILY', 'ALLOWANCE', 'TRANSPORT_DEATH', 'NO_ARTIFACT'))"
    );
  });

  it("stores no owner and references no account row, so erasure needs no new path", () => {
    expect(sql).not.toMatch(/REFERENCES\s+identity\./u);
    expect(sql).not.toMatch(/\bowner_ref\s+uuid\b/u);
  });

  it("grants SELECT and INSERT to the runtime alone, and nothing else (contract §1)", () => {
    const grants = [...sql.matchAll(/^GRANT ([^;]*) TO (\w+);/gmu)].map((match) => [match[1], match[2]] as const);
    expect(grants.length).toBeGreaterThan(0);
    for (const [privileges, grantee] of grants) {
      expect(grantee).toBe("debateai_runtime");
      expect(privileges, grantee).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|ALL)\b/u);
    }
  });

  it("records why a run waits as a word and an instant, never a figure", () => {
    expect(sql).toContain("waits_for text NOT NULL CHECK (waits_for IN ('SITE', 'PERSON'))");
    expect(sql).toContain("CHECK ((waits_for = 'PERSON') = (person_recheck_at IS NOT NULL))");
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS core.run_wait_reason"));
    expect(table.slice(0, table.indexOf(");"))).not.toMatch(/micros|owner_ref|question/u);
  });

  it("drops an owner's waiting run from the line once the owner's account is not active", () => {
    const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW core.run_waiting_v"));
    expect(view).toContain("account.owner_ref = run_owner.owner_ref AND account.state = 'active'");
    expect(view).toContain("jsonb_array_length(run.discovered_panel) AS maker_count");
  });
});
