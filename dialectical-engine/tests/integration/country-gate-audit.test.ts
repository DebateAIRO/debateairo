import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresIdentityRepository } from "@debateai/db";
import { Argon2WorkerPool, AuditContextHasher } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let argon2: Argon2WorkerPool;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  argon2 = new Argon2WorkerPool();
  await argon2.ready();
}, 120_000);

afterAll(async () => {
  await database?.stop();
  await argon2?.close();
});

describe("the country-gate audit capability (0080, G3a)", () => {
  it("chains one content-free DENY row and never stores the raw address", async () => {
    const identity = new PostgresIdentityRepository(database.pool, new AuditContextHasher(
      argon2, Buffer.alloc(32, 0x6e), authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).auditSourceIpKdf
    ));
    await identity.recordCountryGateRefusal({
      route: "register", code: "COUNTRY_SIGNUP_UNAVAILABLE", country: "RU",
      windowStartedAt: new Date("2026-10-01T10:00:00.000Z"),
      source: { ip: "5.45.1.1", userAgent: "test/1", requestId: "request-1" }
    });
    const rows = await database.pool.query<{
      event_type: string; target_type: string; decision: string; success: boolean; justification: string; source: string;
    }>(`SELECT event_type,target_type,decision,success,justification,source_context::text AS source
        FROM identity.audit_event WHERE event_type='identity.country_gate.refused'`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      target_type: "geo.register", decision: "DENY", success: false,
      justification: "aggregate:country-gate;route:register;code:COUNTRY_SIGNUP_UNAVAILABLE;country:RU;evidence:ip;window:2026-10-01T10:00:00.000Z"
    });
    expect(rows.rows[0]!.source).not.toContain("5.45.1.1");
  });

  it("refuses a code that does not belong to its route", async () => {
    const digest = `argon2id-audit:v1:${"a".repeat(64)}`;
    await expect(database.pool.query("SELECT identity.audit_country_gate_refused($1::jsonb,$2)", [
      JSON.stringify({ ipArgon2id: digest, userAgentArgon2id: digest }),
      "aggregate:country-gate;route:asks;code:COUNTRY_UNKNOWN;country:RU;evidence:ip;window:2026-10-01T10:00:00.000Z"
    ])).rejects.toMatchObject({ code: "22023" });
  });
});
