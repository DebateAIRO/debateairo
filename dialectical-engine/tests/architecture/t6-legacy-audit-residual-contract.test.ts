import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("T6 legacy audit erasure residual contract", () => {
  it("records a count-only residual without rewriting the immutable audit chain", async () => {
    const [migration, disposition, evidence, packet] = await Promise.all([
      read("migrations/0043_legacy_audit_erasure_residual.sql"),
      read("docs/missions/2026-08-17-accounts-privacy-security/reviews/T6-legacy-audit-residual-disposition.md"),
      read("docs/missions/2026-08-17-accounts-privacy-security/logs/S10-erasure-evidence-artifact.md"),
      read("docs/missions/2026-08-17-accounts-privacy-security/reviews/S10-review-packet.md")
    ]);

    expect(migration).toContain("CREATE OR REPLACE VIEW identity.legacy_audit_erasure_residual_v");
    expect(migration).toContain("security_barrier = true");
    expect(migration).toContain("'PRE_0032_NOT_VALID_RESIDUAL'::text");
    expect(migration).toContain("count(*)::bigint AS residual_row_count");
    expect(migration).toContain("REVOKE ALL ON identity.legacy_audit_erasure_residual_v");
    expect(migration).not.toMatch(/(?:DELETE|UPDATE)\s+(?:FROM\s+)?identity\.audit_event/i);
    expect(migration).not.toContain("VALIDATE CONSTRAINT");

    expect(disposition).toContain("Decision: `RECORD_AS_RULED_RESIDUAL`");
    expect(disposition).toContain("does not include T6 rows");
    expect(disposition).toContain("not a claim of");
    expect(evidence).toContain("T6 legacy audit erasure residual disposition");
    expect(packet).toContain("T6 legacy audit erasure residual disposition");
  });
});
