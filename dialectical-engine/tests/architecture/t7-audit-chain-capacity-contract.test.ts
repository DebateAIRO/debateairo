import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("T7 audit-chain capacity contract", () => {
  it("records the one-writer residual and an O(1)-head future design without changing production", async () => {
    const [migration, repository, disposition] = await Promise.all([
      read("migrations/0040_account_erasure.sql"),
      read("packages/db/src/identity.ts"),
      read("docs/missions/2026-08-17-accounts-privacy-security/reviews/T7-audit-chain-capacity-disposition.md")
    ]);

    expect(migration.match(/pg_advisory_xact_lock\(hashtextextended\('identity:audit-chain',0\)\)/g))
      .toHaveLength(1);
    expect(migration).toContain("LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash");
    expect(migration).toContain("WHERE child.audit_id IS NULL");

    const createStart = repository.indexOf("async createPendingAccount(");
    const deliveryStart = repository.indexOf("async recordVerificationDelivery(input:");
    expect(createStart).toBeGreaterThan(-1);
    expect(deliveryStart).toBeGreaterThan(createStart);
    expect(repository.slice(createStart, deliveryStart)).toContain("return this.transaction(async (client)");
    expect(repository.slice(createStart, deliveryStart)).toContain("identity.create_pending_account_with_audit(");
    expect(repository.slice(deliveryStart)).toContain("await this.transaction(async (client)");
    expect(repository.slice(deliveryStart)).toContain("identity.record_verification_delivery_with_audit(");

    expect(disposition).toContain("Decision: `ACCEPTED_BOUNDED_CAPACITY_RESIDUAL`");
    expect(disposition).toContain("602.0 ms");
    expect(disposition).toContain("6,248.2 ms");
    expect(disposition).toMatch(/historical capacity evidence, not a current latency\s+SLA/);
    expect(disposition).toContain("do not prove unlimited distributed-source capacity");
    expect(disposition).toContain("singleton `identity.audit_chain_head`");
    expect(disposition).toContain("O(1) pointer lookup");
    expect(disposition).toContain("Partitioning by account or route is not accepted");
  });
});
