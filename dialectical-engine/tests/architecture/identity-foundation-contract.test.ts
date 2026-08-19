import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../migrations/0030_identity_foundation.sql", import.meta.url);

describe("S2 identity migration decisions", () => {
  it("makes every reject_mutation decision explicit and preserves the VR-2 chain", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toMatch(/identity\.audit_event\s+—\s+ARMED/i);
    for (const table of ["user", "mfa_factor", "recovery_code", "channel_binding", "session"]) {
      expect(migration).toMatch(new RegExp(`identity\\.(?:"?${table}"?)\\s+—\\s+UNARMED`, "i"));
    }
    expect(migration).toMatch(/without chain re-anchoring/i);
    expect(migration).toMatch(/append-only event tables with latest-wins projections/i);
    expect(migration).toMatch(/never\s+UPDATE\s+core\.run/i);
    expect(migration).toMatch(/MUST NEVER contain passwords[^\n]*tokens/i);
  });

  it("does not create a Postgres content-key table or plaintext contact columns", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).not.toMatch(/CREATE\s+TABLE[^;]*(?:user_data_key|content_key)/i);
    expect(migration).not.toMatch(/^\s*(?:email|recovery_email|phone)\s+(?:text|varchar|character)/im);
    expect(migration).toContain("email_ciphertext");
    expect(migration).toContain("recovery_email_ciphertext");
    expect(migration).toContain("phone_ciphertext");
  });
});
