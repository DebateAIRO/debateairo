// NV-16 (security audit run 3): an MFA-recovery start is bounded per account and destination in the database
// (migrations/0125_security_fixes_run3.sql, identity.mfa_recovery_start_bounded). The new release's repository calls
// the bounded function; the sealed identity.mfa_recovery_start stays for the release before.
import { describe, expect, it, vi } from "vitest";
import { PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";

const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };

describe("the MFA-recovery start's database call", () => {
  function pool() { const calls: { sql: string; args: unknown[] }[] = []; return { calls, pool: { query: vi.fn(async (sql: string, args: unknown[]) => { calls.push({ sql, args }); return { rows: [{ result: true }] }; }) } }; }
  it("names the bounded start with the unchanged arguments", async () => {
    const { calls, pool: p } = pool(), repo = new PostgresMfaRecoveryRepository(p as never, {} as never, 1), index = Buffer.alloc(32, 1);
    // SOURCE did not come from prepareSource, so it carries no mail language and the call goes to the pool directly.
    await expect(repo.start({ index, destination: "primary", candidateId: null, channels: [], linkHash: "l", cancelHash: "c", notices: [], source: SOURCE, id: "i" })).resolves.toBe(true);
    expect(calls).toEqual([
      { sql: "SELECT identity.mfa_recovery_start_bounded($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result", args: [index, "primary", null, [], "l", "c", "[]", SOURCE, 1, "i"] }
    ]);
  });
});
