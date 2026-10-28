// NV-38 (security audit run 3): the backup-email and MFA-recovery repositories claim through 0125's pending-notice
// claims, whose lease starts when the claim ends, in ONE statement each. The MFA claim no longer reads its locale in a
// second, lease-refusing statement (identity.mail_locale_of_mfa_claim): the claim returns mail_locale itself, and the
// repository fails closed on a missing or unknown one.
import { describe, expect, it } from "vitest";
import { PostgresBackupEmailRepository, PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";

const NOTICE = {
  noticeId: "11111111-1111-4111-8111-111111111111", leaseId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333", channelId: "44444444-4444-4444-8444-444444444444",
  event: "COMPLETED", payload: { v: 1 }, expiresAt: "2026-10-28T12:00:00.000Z"
} as const;

/** A pool that records every statement and answers each with `result`. */
function recordingPool(result: unknown) {
  const calls: { sql: string; args: readonly unknown[] }[] = [];
  const pool = { query: async (sql: string, args: readonly unknown[]) => { calls.push({ sql, args }); return { rows: [{ result }] }; } };
  return { pool: pool as never, calls };
}

describe("recovery notice claims (NV-38)", () => {
  it("the backup-email claim is one call of the pending-notice claim and carries its mail locale", async () => {
    const { pool, calls } = recordingPool({ ...NOTICE, mail_locale: "ro" });
    const notice = await new PostgresBackupEmailRepository(pool, {} as never, 1).claimNotice(5600);
    expect(calls).toEqual([{ sql: "SELECT identity.backup_email_claim_pending_notice($1) AS result", args: [5600] }]);
    expect(notice).toEqual({ ...NOTICE, mailLocale: "ro" });
  });

  it("the MFA-recovery claim is one call of the pending-notice claim, with no second locale read", async () => {
    const { pool, calls } = recordingPool({ ...NOTICE, mail_locale: "ro" });
    const notice = await new PostgresMfaRecoveryRepository(pool, {} as never, 1).claimNotice(5600);
    expect(calls).toEqual([{ sql: "SELECT identity.mfa_recovery_claim_pending_notice($1) AS result", args: [5600] }]);
    expect(notice).toEqual({ ...NOTICE, mailLocale: "ro" });
  });

  it("the MFA-recovery claim fails closed on a result without a known mail locale", async () => {
    for (const result of [{ ...NOTICE }, { ...NOTICE, mail_locale: "xx" }]) {
      const { pool, calls } = recordingPool(result);
      await expect(new PostgresMfaRecoveryRepository(pool, {} as never, 1).claimNotice(5600)).rejects.toThrow("MAIL_LOCALE_INVALID");
      expect(calls).toHaveLength(1);
    }
  });

  it("a null claim means nothing is due, for both flows", async () => {
    for (const repository of [PostgresBackupEmailRepository, PostgresMfaRecoveryRepository]) {
      const { pool, calls } = recordingPool(null);
      await expect(new repository(pool, {} as never, 1).claimNotice(5600)).resolves.toBeNull();
      expect(calls).toHaveLength(1);
    }
  });
});
