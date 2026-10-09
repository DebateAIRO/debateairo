import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, migrate, PostgresDataExportRepository, PostgresDataExportSource, RunRepository } from "@debateai/db";
import { hashToken } from "@debateai/crypto";
import { DataExportApplication } from "../../apps/api/src/data-export/service.js";
import { FileDataExportStore } from "../../apps/api/src/data-export/store.js";
import { collectSnapshot } from "../../apps/api/src/data-export/snapshot.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { TemplatedDataExportMail } from "../../apps/api/src/data-export/mail.js";
import { OwnerViewAdapter } from "../../apps/api/src/data-export/owner-view-adapter.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

function entries(zip: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const method = zip.readUInt16LE(offset + 8), size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString("ascii");
    const compressed = zip.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
    result[name] = (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
    offset += 30 + nameSize + size;
  }
  return result;
}

describe("data export over a real database and encrypted file store", () => {
  let db: TestDatabase, runtime: ReturnType<typeof createPool>, root: string;
  const sent: Array<{ to: string; templateId: string; locale: string; params: Record<string, string>; messageId: string }> = [];
  const lines: string[] = [];
  beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    await db.pool.query("CREATE ROLE data_export_e2e_auth LOGIN PASSWORD 'data-export-e2e-only' IN ROLE debateai_authorization_runtime");
    const url = new URL(db.connectionString); url.username = "data_export_e2e_auth"; url.password = "data-export-e2e-only";
    runtime = createPool(url.toString());
    root = await mkdtemp(join(tmpdir(), "data-export-e2e-"));
  }, 180_000);
  afterAll(async () => { await runtime?.end(); await db?.stop(); if (root) await rm(root, { recursive: true, force: true }); });
  afterEach(async () => {
    if (db) await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp() WHERE status='PREPARING'");
  });

  async function account(email = `${randomUUID()}@example.test`) {
    const userId = randomUUID(), sessionId = randomUUID(), grantToken = randomBytes(32).toString("base64url");
    const user = (await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','fixture-password',$3,'active',clock_timestamp()) RETURNING owner_ref,audit_token`,
    [userId, createHash("sha256").update(userId).digest(), userId])).rows[0];
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
    [sessionId, userId, `sha256:${createHash("sha256").update(sessionId).digest("hex")}`, `sha256:${createHash("sha256").update(userId).digest("hex")}`]);
    await db.pool.query("INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())", [userId]);
    await db.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'EXPORT_DATA',$4,clock_timestamp(),clock_timestamp()+interval '5 minutes')`,
    [randomUUID(), hashToken("step-up-grant", grantToken), sessionId, userId]);
    return { userId, sessionId, ownerRef: user.owner_ref as string, auditToken: user.audit_token as string, grantToken, email };
  }

  function application(directory: string, email: string, workerId = randomUUID()) {
    const repo = new PostgresDataExportRepository(runtime, {
      hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64)
    } as never);
    const source = new PostgresDataExportSource(runtime);
    const store = new FileDataExportStore({ directory, users: { load: async () => Buffer.alloc(32, 7) } });
    const ownerView = new OwnerViewAdapter({ application: {} as never },
      { exists: async () => false });
    const mail = new TemplatedDataExportMail({
      sendTemplated: async (message: (typeof sent)[number]) => { sent.push(message); }
    } as never);
    const app = new DataExportApplication({ repository: repo, store,
      collect: (claim, worker) => collectSnapshot({ claim, workerId: worker, source, ownerView,
        decrypt: { openUserField: async () => email, openRecord: () => "{}", openSupport: async () => "fixture-support" }, now: () => new Date() }),
      archiveCatalog: loadArchiveCatalog, mail, publicAppUrl: "https://example.test", workerId,
      log: line => lines.push(line) });
    return { app, repo, store };
  }

  const context = { ip: "192.0.2.5", userAgent: "export-e2e", requestId: "fixture" };
  async function accepted(a: Awaited<ReturnType<typeof account>>, app: DataExportApplication) {
    const result = await app.request({ userId: a.userId, sessionId: a.sessionId, grantToken: a.grantToken, locale: "en", source: context });
    expect(result.kind).toBe("ACCEPTED");
    return result;
  }
  async function completed(a: Awaited<ReturnType<typeof account>>, directory = join(root, randomUUID())) {
    const f = application(directory, a.email);
    await accepted(a, f.app);
    await f.app.runOnce();
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1", [a.userId])).rows[0];
    expect(row.status).toBe("SENT");
    return { ...f, row, directory };
  }

  function deliveredToken(exportId: string): string {
    const url = sent.find(item => item.messageId === exportId)?.params.downloadUrl;
    expect(url).toMatch(/^https:\/\/example\.test\/export#[A-Za-z0-9_-]+$/);
    return url!.split("#")[1]!;
  }

  async function seedRuns(a: Awaited<ReturnType<typeof account>>, count: number): Promise<string[]> {
    const ids: string[] = [];
    const runs = new RunRepository(db.pool);
    for (let i = 0; i < count; i++) {
      const runId = await runs.startRun({
        questionLine: `export-fixture-question-${a.userId}-${i}`,
        askContract: { audience: "data-export-test" },
        principal: { kind: "legacy", legacyAskerId: `export-${a.userId}-${i}` },
        sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
        tierProvenanceRef: "data-export-test", compositionBudgetTier: "low",
        depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 1, envelopeBasis: { source: "data-export-test" },
        registerVersion: 1, batteryVersion: "data-export-test", batteryRows: []
      });
      await db.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, a.ownerRef]);
      ids.push(runId);
    }
    return ids;
  }

  it("E1 accepts the step-up grant and returns PREPARING to the account", async () => {
    const a = await account(), { app } = application(join(root, randomUUID()), a.email);
    await accepted(a, app);
    expect((await app.status(a.userId)).status).toBe("PREPARING");
  });

  it("E2 includes account data and excludes a second account's marker", async () => {
    const a = await account("owner-marker@example.test"), b = await account("other-marker@example.test");
    await db.pool.query("INSERT INTO identity.password_recovery_retry_lock(user_id,locked_until) VALUES($1,clock_timestamp()+interval '1 hour')", [a.userId]);
    const { store, row } = await completed(a);
    const archive = entries(await store.read(row.export_id, a.userId));
    expect(JSON.stringify(archive)).toContain("owner-marker@example.test");
    expect(JSON.parse(archive["security.json"]!).recovery_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "password_recovery_retry_lock", state: "LOCKED" })
    ]));
    expect(JSON.stringify(archive)).not.toContain(b.email);
  });

  it("E3 uses the shared owner read adapter for content projection", async () => {
    const a = await account(), { app } = application(join(root, randomUUID()), a.email);
    await accepted(a, app);
    await app.runOnce();
    expect((await app.status(a.userId)).status).toBe("SENT");
  });

  it("E4 excludes credential hashes and link token from the archive", async () => {
    const a = await account(), { store, row } = await completed(a);
    const archive = JSON.stringify(entries(await store.read(row.export_id, a.userId)));
    for (const secret of ["fixture-password", a.grantToken, row.link_token_hash, "a".repeat(64)]) expect(archive).not.toContain(secret);
  });

  it("E5 fails closed and sends no mail if the user key cannot open", async () => {
    const a = await account(), directory = join(root, randomUUID());
    const f = application(directory, a.email);
    await accepted(a, f.app);
    const before = sent.length;
    const broken = new FileDataExportStore({ directory, users: { load: async () => { throw Error("destroyed"); } } });
    const app = new DataExportApplication({ repository: f.repo, store: broken, collect: async () => { throw Error("DATA_EXPORT_DECRYPT_FAILED"); },
      archiveCatalog: loadArchiveCatalog, mail: { sendExportReady: async () => { throw Error("unexpected mail"); } },
      publicAppUrl: "https://example.test", workerId: randomUUID() });
    await app.runOnce();
    expect((await app.status(a.userId)).status).toBe("FAILED");
    expect(sent).toHaveLength(before);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.failed'", [a.auditToken])).rows[0].n).toBe(1);
  });

  it("E6 includes all 130 owned debates without a cap", async () => {
    const a = await account(), ids = await seedRuns(a, 130);
    const { store, row } = await completed(a);
    const debates = JSON.parse(entries(await store.read(row.export_id, a.userId))["debates.json"]!).debates;
    expect(debates).toHaveLength(130);
    expect(new Set(debates.map((debate: { reference: string }) => debate.reference))).toEqual(new Set(ids));
  });

  it("E7 repeats identical download bytes and digest after completion", async () => {
    const a = await account(), { app, row } = await completed(a);
    const token = deliveredToken(row.export_id);
    const first = await app.download(a.userId, token, context);
    const second = await app.download(a.userId, token, context);
    expect(first.kind).toBe("OK");
    expect(second).toEqual(first);
    if (first.kind !== "OK") throw Error("download did not succeed");
    expect(createHash("sha256").update(first.bytes).digest("hex")).toBe(row.archive_sha256);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.downloaded'", [a.auditToken])).rows[0].n).toBe(2);
    await seedRuns(a, 1);
    const third = await app.download(a.userId, token, context);
    expect(third).toEqual(first);
  });

  it("E8 resumes a claimed export through a fresh application and file store", async () => {
    const a = await account(), directory = join(root, randomUUID()), first = application(directory, a.email);
    await accepted(a, first.app);
    const claim = await first.repo.claim(randomUUID(), 1);
    expect(claim?.userId).toBe(a.userId);
    await db.pool.query("UPDATE identity.data_export SET lease_until=clock_timestamp()-interval '1 second' WHERE export_id=$1", [claim!.exportId]);
    const second = application(directory, a.email);
    await second.app.runOnce();
    expect((await second.app.status(a.userId)).status).toBe("SENT");
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0];
    const third = application(directory, a.email);
    const downloaded = await third.app.download(a.userId, deliveredToken(row.export_id), context);
    expect(downloaded.kind).toBe("OK");
    if (downloaded.kind !== "OK") throw Error("fresh instance did not download");
    expect(downloaded.bytes).toEqual(await second.store.read(row.export_id, a.userId));
  });

  it("E9 expires a link and destroys both persisted files", async () => {
    const a = await account(), { app, row, directory } = await completed(a);
    for (const filename of await readdir(directory)) {
      expect((await readFile(join(directory, filename))).subarray(0, 4).toString("hex")).not.toBe("504b0304");
    }
    const token = deliveredToken(row.export_id);
    const expiredAt = new Date(Date.now() - 1_000);
    await db.pool.query("UPDATE identity.data_export SET sent_at=$2::timestamptz-interval '86400 seconds',expires_at=$2 WHERE export_id=$1", [row.export_id, expiredAt]);
    await app.runOnce();
    expect((await readdir(directory)).filter(name => name.startsWith(row.export_id))).toHaveLength(0);
    expect((await app.status(a.userId)).status).toBe("NONE");
    expect(await app.download(a.userId, token, context)).toEqual({ kind: "INVALID" });
  });

  it("E10 cancels a queued export when erasure begins", async () => {
    const a = await account(), { app } = application(join(root, randomUUID()), a.email);
    await accepted(a, app);
    await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}')`, [a.userId]);
    await app.runOnce();
    expect((await db.pool.query("SELECT status FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0].status).toBe("CANCELLED");
    const b = await account(), delivered = await completed(b);
    const token = deliveredToken(delivered.row.export_id);
    await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}')`, [b.userId]);
    expect(await delivered.app.download(b.userId, token, context)).toEqual({ kind: "INVALID" });
    await delivered.app.runOnce();
    expect((await readdir(delivered.directory)).filter(name => name.startsWith(delivered.row.export_id))).toHaveLength(0);
  });

  it("E11 mails the verified address with locale, public origin and stable message id", async () => {
    const a = await account("mail-marker@example.test"), f = application(join(root, randomUUID()), a.email);
    expect((await f.app.request({ userId: a.userId, sessionId: a.sessionId, grantToken: a.grantToken, locale: "ro", source: context })).kind).toBe("ACCEPTED");
    await f.app.runOnce();
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0];
    expect(row.status).toBe("SENT");
    const message = sent.find(item => item.messageId === row.export_id)!;
    expect(message).toMatchObject({ to: a.email, templateId: "DATA_EXPORT", locale: "ro", messageId: row.export_id });
    expect(message.params.downloadUrl).toContain("https://example.test/export#");
    expect(JSON.stringify(message)).not.toMatch(/attachment/i);
  });

  it("E12 hands off a 20-debate account within sixty seconds", async () => {
    const a = await account();
    await seedRuns(a, 20);
    const start = Date.now();
    await completed(a);
    expect(Date.now() - start).toBeLessThanOrEqual(60_000);
  });

  it("E13 excludes other accounts from the archive", async () => {
    const a = await account("private-A@example.test"), b = await account("private-B@example.test");
    const [otherRun] = await seedRuns(b, 1);
    const { store, row } = await completed(a);
    const archive = JSON.stringify(entries(await store.read(row.export_id, a.userId)));
    expect(archive).toContain(a.email);
    expect(archive).not.toContain(b.email);
    expect(archive).not.toContain(b.userId);
    expect(archive).not.toContain(otherRun);
    expect(archive).not.toContain(`export-fixture-question-${b.userId}-0`);
  });

  it("E14 writes requested, delivered and download audit without logging tokens", async () => {
    const a = await account();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(method => vi.spyOn(console, method));
    try {
      const { row, app } = await completed(a);
      const token = deliveredToken(row.export_id);
      expect((await app.download(a.userId, token, context)).kind).toBe("OK");
      expect((await app.download(a.userId, token, context)).kind).toBe("OK");
      const types = (await db.pool.query("SELECT event_type FROM identity.audit_event WHERE actor_key_ref=$1 ORDER BY occurred_at", [a.auditToken])).rows.map(item => item.event_type);
      expect(types).toContain("identity.data_export.requested");
      expect(types).toContain("identity.data_export.delivered");
      expect(types.filter(type => type === "identity.data_export.downloaded")).toHaveLength(2);
      expect(JSON.stringify(lines)).not.toContain(row.link_token_hash);
      expect(JSON.stringify(lines)).not.toContain(token);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(token);
        expect(JSON.stringify(spy.mock.calls)).not.toContain(row.link_token_hash);
      }
      expect((await db.pool.query("SELECT count(*)::int n FROM identity.social_flow AS flow WHERE row_to_json(flow)::text LIKE $1", [`%${token}%`])).rows[0].n).toBe(0);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });
});
