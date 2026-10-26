import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { encrypt } from "@debateai/crypto";
import { AccountErasureCoordinator, PostgresThreatReportRepository, migrate } from "@debateai/db";
import * as closure from "../../apps/api/src/staff/threat-report-closure.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const erasureId = randomUUID();
const userId = randomUUID();
const ownerRef = randomUUID();
const key = Buffer.alloc(32, 7);
const aad = ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"] as const;
const ciphertext = encrypt(key, Buffer.from("asker@example.test"), aad);

function fixture(beforeKeyDestruction: (input: { erasureId: string; userId: string; email: string }) => Promise<void>) {
  const order: string[] = [];
  let userKeyExists = true;
  const manifest = { userId, ownerRef, runIds: [], legacyRunIds: [], publishedRunIds: [],
    currentPublicationRefs: [], cleanupPublicationRefs: [], deletePublicDebates: false };
  const repository = {
    preview: async () => manifest, withNotificationLease: async (_user: string, run: () => Promise<unknown>) => run(),
    prepare: async () => "PREPARED", cleanupManifest: async () => manifest,
    completionNotificationsReady: async () => true, finalize: async () => "CLEANED",
    status: async () => "CLEANED"
  };
  const users = { load: async () => Buffer.from(key), destroy: async () => { order.push("destroy"); userKeyExists = false; return "DESTROYED"; },
    exists: async () => userKeyExists };
  const runs = { listByOwner: async () => [], exists: async () => false, ownerRef: async () => ownerRef,
    destroy: async () => "ALREADY_ABSENT" };
  const coordinator = new AccountErasureCoordinator(repository as never, users as never, runs as never, undefined,
    { readEmailCiphertext: async () => ciphertext,
      beforeKeyDestruction: async input => { order.push("hold"); await beforeKeyDestruction(input); } });
  return { coordinator, order };
}

describe("S04 threat report account erasure", () => {
  it("holds the email before destroying the asker's DEK", async () => {
    // Property: closing the account preserves the address for a kept report before key destruction.
    // Mutant: move the hook below users.destroy; erasure worker interval is a neighbour.
    let observed: unknown;
    const { coordinator, order } = fixture(async input => { observed = input; });
    const outcome = await coordinator.execute(erasureId, { ip: "127.0.0.1", userAgent: "test", requestId: randomUUID() });
    expect({ outcome, order, observed }).toEqual({ outcome: "CLEANED", order: ["hold", "destroy"],
      observed: { erasureId, userId, email: "asker@example.test" } });
  });

  it("returns CONTENDED and destroys no key if the email hold fails", async () => {
    // Property: a failed hold cannot leave a kept report with an unreadable email.
    // Mutant: swallow the hook rejection; a list response change is a neighbour.
    const { coordinator, order } = fixture(async () => { throw new Error("hold failed"); });
    const outcome = await coordinator.execute(erasureId, { ip: "127.0.0.1", userAgent: "test", requestId: randomUUID() });
    expect({ outcome, order }).toEqual({ outcome: "CONTENDED", order: ["hold"] });
  });

  it("finishes a retry after the user key was already destroyed", async () => {
    // Property: the email hold is required before the first key destruction, but an interrupted finalize can be retried.
    // Mutant: load the absent key on every retry; changing the report-erasure timer is a neighbour.
    const calls: string[] = [];
    const manifest = { userId, ownerRef, runIds: [], legacyRunIds: [], publishedRunIds: [],
      currentPublicationRefs: [], cleanupPublicationRefs: [], deletePublicDebates: false };
    const repository = {
      preview: async () => null,
      status: async () => calls.includes("finalize") ? "CLEANED" : "PREPARED",
      cleanupManifest: async () => manifest,
      withNotificationLease: async (_user: string, run: () => Promise<unknown>) => run(),
      completionNotificationsReady: async () => true,
      finalize: async (input: { alreadyAbsentUserDekCount: number }) => {
        calls.push("finalize");
        expect(input.alreadyAbsentUserDekCount).toBe(1);
        return "CLEANED";
      }
    };
    const users = {
      load: async () => { calls.push("load"); throw new Error("USER_DEK_UNRESOLVED"); },
      destroy: async () => { calls.push("destroy"); return "ALREADY_ABSENT" as const; },
      exists: async () => false
    };
    const runs = { listByOwner: async () => [], exists: async () => false, ownerRef: async () => ownerRef,
      destroy: async () => "ALREADY_ABSENT" as const };
    const coordinator = new AccountErasureCoordinator(repository as never, users as never, runs as never, undefined, {
      readEmailCiphertext: async () => { calls.push("read"); return ciphertext; },
      beforeKeyDestruction: async () => { calls.push("hold"); }
    });
    const outcome = await coordinator.execute(erasureId, { ip: "127.0.0.1", userAgent: "test", requestId: randomUUID() });
    expect(outcome).toBe("CLEANED");
    expect(calls).toEqual(["destroy", "finalize"]);
  });

});

describe("S04 threat report erasure database gates", () => {
  let database: TestDatabase;
  let repository: PostgresThreatReportRepository;
  const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  async function listHolder() {
    const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID();
    const privilegeSessionId = randomUUID(), tokenHash = hash(sessionId);
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [userId, createHash("sha256").update(userId).digest(), userId]);
    await database.pool.query(`INSERT INTO identity.session
      (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES ($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
      [sessionId, userId, tokenHash, hash(`csrf:${sessionId}`)]);
    await database.pool.query(`INSERT INTO identity.mfa_factor
      (mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
      VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(),userId]);
    await database.pool.query(`INSERT INTO identity.channel_binding
      (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
      VALUES($1,'email','{}','verified',now(),now())`, [userId]);
    await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,state,capabilities)
      VALUES($1,$2,'ACTIVE',ARRAY['THREAT_REPORT'])`, [staffId,userId]);
    await database.pool.query(`INSERT INTO staff.privilege_session
      (privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,
       security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,
      [privilegeSessionId,staffId,userId,sessionId,hash(`priv:${privilegeSessionId}`),hash(`csrf:priv:${privilegeSessionId}`)]);
    return { tokenHash, context: { staffId,userId,ordinarySessionId:sessionId,privilegeSessionId,
      designation:"DELEGATED",securityEpoch:0,accountSecurityEpoch:0,grantRevision:0,
      capabilities:["THREAT_REPORT"] } };
  }
  let reader: Awaited<ReturnType<typeof listHolder>>;
  async function asRuntime<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string, values: unknown[] = []
  ): Promise<T[]> {
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      const rows = (await client.query<T>(statement, values)).rows;
      await client.query("COMMIT");
      return rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    repository = new PostgresThreatReportRepository({ query: async (sql: string, values?: unknown[]) =>
      ({ rows: await asRuntime(sql, values) }) } as never);
    reader = await listHolder();
  }, 600_000);
  afterAll(async () => database?.stop());

  it("keeps a prepared-erasure threat with the held email and leaves it readable", async () => {
    // Property: a new keep after the hold retains the email without reattaching the erasing account.
    // Mutant: insert a null held_email; erasure timing is a neighbour.
    const target = randomUUID(), erasure = randomUUID();
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [target, Buffer.alloc(32, 9), `erasure-${target}`]);
    await database.pool.query(`INSERT INTO identity.account_erasure_request
      (erasure_id,user_id,requested_at,execute_at,prepared_at,prepared_run_ids,
       prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,
       prepared_cleanup_publication_refs)
      VALUES($1,$2,now(),now(),now(),'{}','{}','{}','{}','{}')`, [erasure,target]);
    await closure.threatReportEmailHold(repository)({ erasureId: erasure, userId: target, email: "held@example.test" });
    await expect(repository.keep("Question kept during erasure", target))
      .rejects.toMatchObject({ message: "THREAT_REPORT_ACCOUNT_ERASING" });
    const ref = await repository.keepWithHeldEmail("Question kept during erasure", target, "held@example.test");
    const rows = (await database.pool.query(`SELECT report_ref,account_user_id,held_email FROM staff.threat_report
      WHERE report_ref=$1 ORDER BY kept_at`, [ref])).rows;
    expect(rows).toEqual([{ report_ref: ref, account_user_id: null, held_email: "held@example.test" }]);
    expect((await repository.list(reader.context, reader.tokenHash)).map(row => row.report_ref)).toContain(ref);
    await expect(repository.read(reader.context, reader.tokenHash, ref)).resolves.toMatchObject({
      question: "Question kept during erasure", held_email: "held@example.test"
    });
  }, 600_000);

  it("one worker tick erases due reports and keeps the future reports by the database clock", async () => {
    // Property: worker calls the database-clock eraser; it does not supply a caller clock.
    // Mutant: skip the interval or pass a future date; a mail-alert interval is a neighbour.
    const refs = Array.from({ length: 4 }, () => randomUUID());
    for (const [index, ref] of refs.entries()) {
      await database.pool.query(`INSERT INTO staff.threat_report(report_ref,question,kept_at)
        VALUES($1,$2,clock_timestamp() - interval '30 days' + ($3::integer * interval '1 second'))`,
        [ref, `Retention ${index}`, index % 2 === 0 ? -1 : 1]);
    }
    let complete!: () => void;
    const completed = new Promise<void>(resolve => { complete = resolve; });
    const calls: unknown[][] = [];
    const workerRepository = { eraseDue: async (...args: unknown[]) => {
      calls.push(args);
      try { return await repository.eraseDue(); }
      finally { complete(); }
    } };
    vi.useFakeTimers();
    let timer: NodeJS.Timeout | undefined;
    try {
      timer = closure.startThreatReportErasure({ repository: workerRepository, everyMs: 1_000 }, { ownIsCurrent: () => true });
      await vi.advanceTimersByTimeAsync(1_000);
      await completed;
      expect(calls).toEqual([[]]);
      const remaining = (await database.pool.query<{ report_ref: string }>(
        "SELECT report_ref FROM staff.threat_report WHERE report_ref=ANY($1::uuid[]) ORDER BY report_ref", [refs]
      )).rows.map(row => row.report_ref);
      expect(remaining).toEqual([refs[1]!, refs[3]!].sort());
    } finally { if (timer) clearInterval(timer); vi.useRealTimers(); }
  }, 600_000);
});
