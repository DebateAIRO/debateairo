import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it,vi } from "vitest";
import {
  migrate,
  PostgresSupportCaseRepository,
  PostgresSupportCaseSummaryRepository,
  PostgresSupportSessionRepository,
  PostgresSupportShredRepository
} from "../../packages/db/src/index.js";
import {
  createAdvisorySummaryService,
  createSupportCaseAccessService,
  createSupportCasesService,
  SupportCaseError,
  type SupportCaseSummaryRecord
} from "../../apps/api/src/support/cases.js";
import { SupportModelError } from "../../apps/api/src/support/model.js";
import { createSupportCaseService } from "../../apps/api/src/support/session.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const createdAt = new Date("2026-09-07T12:00:00.000Z");

function wrapped(fill: number): Buffer {
  return Buffer.concat([Buffer.from([1]),Buffer.alloc(60,fill)]);
}

function contentV2(fill: number): Buffer {
  return Buffer.concat([Buffer.from([2]),Buffer.alloc(28,fill)]);
}

async function session(ownerRef: string | null = null): Promise<string> {
  const sessionId = randomUUID();
  const repository = new PostgresSupportSessionRepository(
    database.pool,
    async () => wrapped(2)
  );
  await repository.create({
    sessionId,
    tokenSha256: sessionId.replaceAll("-","").repeat(2),
    identityOwnerRef: ownerRef,
    language: "en",
    kbVersion: "b".repeat(64),
    createdAt
  });
  return sessionId;
}

function service() {
  const repository = new PostgresSupportCaseRepository(
    database.pool,
    async () => Object.freeze({
      wrappedKey: wrapped(3),
      transcriptSnapshotCiphertext: contentV2(3)
    })
  );
  return createSupportCasesService(repository);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => database?.stop(),120_000);

describe("SUP-02 cases", () => {
  it("opens one case for concurrent attempts at the same trigger generation", async () => {
    const sessionId = await session();
    let prepared = 0;
    let materialized = 0;
    const repository = new PostgresSupportCaseRepository(
      database.pool,
      async () => {
        materialized += 1;
        return Object.freeze({
          wrappedKey: wrapped(9),
          transcriptSnapshotCiphertext: contentV2(9)
        });
      }
    );
    const attempt = () => repository.createCaseOnce({
      sessionId,identityOwnerRef: null,language: "en",createdAt,
      triggerPredicate: "E7",triggerGeneration: "message:degraded-1",
      toolCalls: [],kbVersion: "b".repeat(64),slaHours: 48,
      prepare: async () => {
        prepared += 1;
        const caseId = randomUUID();
        return Object.freeze({
          caseId,token: `raw-token-${caseId}`,
          tokenSha256: caseId.replaceAll("-","").repeat(2)
        });
      }
    });

    const results = await Promise.all([attempt(),attempt(),attempt()]);
    expect(results.filter((result) => result.kind === "OPENED")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "ALREADY_OPENED")).toHaveLength(2);
    expect(results.filter((result) => result.kind === "ALREADY_OPENED")
      .every((result) => !("token" in result))).toBe(true);
    expect(prepared).toBe(1);
    expect(materialized).toBe(1);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM support.\"case\" WHERE session_id=$1",
      [sessionId]
    )).rows).toEqual([{ count: 1 }]);
    expect((await database.pool.query(`
      SELECT
        (SELECT count(*)::int FROM support.case_key WHERE case_id=opened.case_id) AS keys,
        (SELECT count(*)::int FROM support.case_event WHERE case_id=opened.case_id) AS events
      FROM support."case" AS opened WHERE session_id=$1
    `,[sessionId])).rows).toEqual([{ keys: 1,events: 1 }]);
  });

  it("replays the owning migration without duplicating named constraints", async () => {
    const sql = await readFile("migrations/0051_support_cases.sql","utf8");
    await expect(database.pool.query(sql)).resolves.toBeDefined();
  });

  it("persists a complete case and its initial system transition before returning", async () => {
    const ownerRef = randomUUID();
    const sessionId = await session(ownerRef);
    const caseId = randomUUID();
    await service().openCase({
      caseId,
      tokenSha256: "c".repeat(64),
      sessionId,
      identityOwnerRef: ownerRef,
      language: "en",
      createdAt,
      triggerPredicate: "E1",
      toolCalls: [],
      kbVersion: "b".repeat(64),
      slaHours: 48
    });
    const row = (await database.pool.query(`
      SELECT identity_owner_ref,trigger_predicate,tool_calls,summary_ciphertext,
        summary_at,summary_status,summary_authoritative,kb_version,sla_hours,state
      FROM support."case" WHERE case_id=$1
    `,[caseId])).rows[0];
    expect(row).toMatchObject({
      identity_owner_ref: ownerRef,
      trigger_predicate: "E1",
      tool_calls: [],
      summary_ciphertext: null,
      summary_at: null,
      summary_status: null,
      summary_authoritative: false,
      kb_version: "b".repeat(64),
      sla_hours: 48,
      state: "NEW"
    });
    expect((await database.pool.query(
      "SELECT from_state,to_state,actor FROM support.case_event WHERE case_id=$1",
      [caseId]
    )).rows).toEqual([{ from_state: null,to_state: "NEW",actor: "system" }]);
  });

  it("rejects future v1 content inserts and ciphertext updates without rewriting legacy rows", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    await service().openCase({
      caseId,tokenSha256: "a".repeat(64),sessionId,identityOwnerRef: null,
      language: "en",createdAt,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    const caseMessageId = randomUUID();
    await expect(database.pool.query(`
      INSERT INTO support.case_message(case_message_id,case_id,role,content_ciphertext,at)
      VALUES($1,$2,'user',$3,$4)
    `,[caseMessageId,caseId,Buffer.concat([Buffer.from([1]),Buffer.alloc(28)]),createdAt]))
      .rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
    await database.pool.query(`
      INSERT INTO support.case_message(case_message_id,case_id,role,content_ciphertext,at)
      VALUES($1,$2,'user',$3,$4)
    `,[caseMessageId,caseId,contentV2(4),createdAt]);
    await expect(database.pool.query(
      "UPDATE support.case_message SET content_ciphertext=$2 WHERE case_message_id=$1",
      [caseMessageId,Buffer.concat([Buffer.from([1]),Buffer.alloc(28)])]
    )).rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
    await expect(database.pool.query(
      "UPDATE support.\"case\" SET summary_ciphertext=$2 WHERE case_id=$1",
      [caseId,Buffer.concat([Buffer.from([1]),Buffer.alloc(28)])]
    )).rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
    expect((await database.pool.query(
      "SELECT get_byte(content_ciphertext,0) AS version FROM support.case_message WHERE case_message_id=$1",
      [caseMessageId]
    )).rows).toEqual([{ version: 2 }]);
  });

  it("rejects debateai_support case INSERTs with either v1 snapshot or v1 summary", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_support");
      await expect(client.query(`
        INSERT INTO support."case"(
          case_id,token_sha256,session_id,language,created_at,
          transcript_snapshot_ciphertext,state,summary_ciphertext,
          summary_at,summary_status
        ) VALUES($1,$2,$3,'en',$4,$5,'NEW',$6,$4,'DONE')
      `,[
        caseId,"7".repeat(64),sessionId,createdAt,contentV2(7),
        Buffer.concat([Buffer.from([1]),Buffer.alloc(28,7)])
      ])).rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect((await database.pool.query(
      "SELECT 1 FROM support.\"case\" WHERE case_id=$1",[caseId]
    )).rowCount).toBe(0);

    const snapshotCaseId = randomUUID();
    const snapshotClient = await database.pool.connect();
    try {
      await snapshotClient.query("BEGIN");
      await snapshotClient.query("SET LOCAL ROLE debateai_support");
      await expect(snapshotClient.query(`
        INSERT INTO support."case"(
          case_id,token_sha256,session_id,language,created_at,
          transcript_snapshot_ciphertext,state
        ) VALUES($1,$2,$3,'en',$4,$5,'NEW')
      `,[
        snapshotCaseId,"6".repeat(64),sessionId,createdAt,
        Buffer.concat([Buffer.from([1]),Buffer.alloc(28,6)])
      ])).rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
    } finally {
      await snapshotClient.query("ROLLBACK").catch(() => undefined);
      snapshotClient.release();
    }
    expect((await database.pool.query(
      "SELECT 1 FROM support.\"case\" WHERE case_id=$1",[snapshotCaseId]
    )).rowCount).toBe(0);
  });

  it("returns a shredded case discriminator without unwrapping and preserves ciphertext bytes", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    const tokenSha256 = "9".repeat(64);
    await service().openCase({
      caseId,tokenSha256,sessionId,identityOwnerRef: null,
      language: "ro",createdAt,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    const before = (await database.pool.query<{ ciphertext: Buffer }>(`
      SELECT transcript_snapshot_ciphertext AS ciphertext FROM support."case" WHERE case_id=$1
    `,[caseId])).rows[0]!.ciphertext;
    const shreddedAt = new Date(createdAt.getTime() + 1_000);
    await new PostgresSupportShredRepository(database.pool)
      .shredSession(sessionId,"vitest",shreddedAt);
    let unwrapCalls = 0;
    const access = createSupportCaseAccessService({
      repository: new PostgresSupportCaseSummaryRepository(database.pool),
      keys: {
        unwrapDataKey: async () => { unwrapCalls += 1;throw new Error("must not unwrap"); },
        openContent: () => { throw new Error("must not open"); },
        sealContent: () => { throw new Error("must not seal"); }
      }
    });

    await expect(access.readByToken(tokenSha256,{ limit: 20 })).resolves.toEqual({
      kind: "SHREDDED",caseId,language: "ro",state: "NEW",slaHours: 48,
      messages: [],summary: null,nextCursor: null,
      notice: "Această conversație a fost ștearsă la cererea proprietarului."
    });
    expect(unwrapCalls).toBe(0);
    expect((await database.pool.query<{ ciphertext: Buffer }>(`
      SELECT transcript_snapshot_ciphertext AS ciphertext FROM support."case" WHERE case_id=$1
    `,[caseId])).rows[0]!.ciphertext).toEqual(before);
  });

  it("atomically rejects a case reply when shred wins after the liveness read", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    const tokenSha256 = "8".repeat(64);
    await service().openCase({
      caseId,tokenSha256,sessionId,identityOwnerRef: null,
      language: "en",createdAt,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    let resumeUnwrap!: () => void;
    let observedLiveRead!: () => void;
    const paused = new Promise<void>((resolve) => { resumeUnwrap = resolve; });
    const liveRead = new Promise<void>((resolve) => { observedLiveRead = resolve; });
    const access = createSupportCaseAccessService({
      repository: new PostgresSupportCaseSummaryRepository(database.pool),
      keys: {
        unwrapDataKey: async () => {
          observedLiveRead();
          await paused;
          return Buffer.alloc(32,7);
        },
        openContent: () => { throw new Error("must not decrypt for reply"); },
        sealContent: () => contentV2(7)
      }
    });
    const reply = access.replyByToken({
      tokenSha256,text: "Please reply",at: new Date(createdAt.getTime() + 2_000),
      messageByteLimit: 2_000,caseMessageLimit: 40
    });
    await liveRead;
    const before = (await database.pool.query(`
      SELECT opened.state,opened.transcript_snapshot_ciphertext,
        (SELECT count(*)::int FROM support.case_message WHERE case_id=opened.case_id) AS messages,
        (SELECT count(*)::int FROM support.case_event WHERE case_id=opened.case_id) AS events
      FROM support."case" AS opened WHERE opened.case_id=$1
    `,[caseId])).rows[0];

    await new PostgresSupportShredRepository(database.pool).shredSession(
      sessionId,"vitest",new Date(createdAt.getTime() + 1_000)
    );
    resumeUnwrap();

    await expect(reply).resolves.toEqual({
      kind: "SHREDDED",notice: "This conversation was erased at the owner's request."
    });
    const after = (await database.pool.query(`
      SELECT opened.state,opened.transcript_snapshot_ciphertext,
        (SELECT count(*)::int FROM support.case_message WHERE case_id=opened.case_id) AS messages,
        (SELECT count(*)::int FROM support.case_event WHERE case_id=opened.case_id) AS events
      FROM support."case" AS opened WHERE opened.case_id=$1
    `,[caseId])).rows[0];
    expect(after).toEqual(before);
  });

  it("enforces the closed state graph and never removes a row", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    const cases = service();
    await cases.openCase({
      caseId,tokenSha256: "d".repeat(64),sessionId,identityOwnerRef: null,
      language: "en",createdAt,triggerPredicate: "E2",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    await cases.transition(caseId,"WAITING_ON_V","user",new Date(createdAt.getTime()+1));
    await cases.transition(caseId,"WAITING_ON_USER","V",new Date(createdAt.getTime()+2));
    await cases.transition(caseId,"WAITING_ON_V","user",new Date(createdAt.getTime()+3));
    await cases.transition(caseId,"CLOSED","V",new Date(createdAt.getTime()+4));
    await cases.transition(caseId,"WAITING_ON_V","user",new Date(createdAt.getTime()+5));
    expect((await database.pool.query(
      "SELECT state FROM support.\"case\" WHERE case_id=$1",[caseId]
    )).rows[0]).toEqual({ state: "WAITING_ON_V" });
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM support.case_event WHERE case_id=$1",[caseId]
    )).rows[0]).toEqual({ count: 6 });
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM support.\"case\" WHERE case_id=$1",[caseId]
    )).rows[0]).toEqual({ count: 1 });
  });

  it("rejects an illegal transition with a typed error", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    const cases = service();
    await cases.openCase({
      caseId,tokenSha256: "e".repeat(64),sessionId,identityOwnerRef: null,
      language: "ro",createdAt,triggerPredicate: "E8",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    await expect(cases.transition(
      caseId,"WAITING_ON_USER","V",new Date(createdAt.getTime()+1)
    )).rejects.toBeInstanceOf(SupportCaseError);
    await expect(cases.transition(
      caseId,"WAITING_ON_USER","V",new Date(createdAt.getTime()+1)
    )).rejects.toMatchObject({ code: "SUPPORT_CASE_ILLEGAL_TRANSITION" });
    await cases.transition(caseId,"WAITING_ON_V","user",new Date(createdAt.getTime()+2));
    await cases.transition(caseId,"CLOSED","V",new Date(createdAt.getTime()+3));
    await expect(cases.transition(
      caseId,"NEW","V",new Date(createdAt.getTime()+4)
    )).rejects.toMatchObject({ code: "SUPPORT_CASE_ILLEGAL_TRANSITION" });
  });

  it("stores a non-authoritative one-paragraph advisory summary within the bound", async () => {
    const persisted: Array<Readonly<Record<string,unknown>>> = [];
    const summary = Array.from({ length: 40 },(_,index) => `word${index}`).join(" ") + ".";
    const service = createAdvisorySummaryService({
      complete: async (request) => {
        expect(request.system).toContain("exactly kind, text, sourceIds, and actionIds");
        return JSON.stringify({ kind: "case_summary",text: summary,sourceIds: [],actionIds: [] });
      },
      seal: async (_caseId,text) => Buffer.from(text,"utf8"),
      persist: async (record) => { persisted.push(Object.freeze({
        ...record,
        summaryCiphertext: record.summaryCiphertext === null
          ? null : Buffer.from(record.summaryCiphertext)
      })); },
      clock: () => new Date("2026-09-07T12:00:01.000Z"),
      timeoutMs: 60_000
    });
    await service.summarize({
      caseId: randomUUID(),language: "en",transcript: "USER> Help",createdAt
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      status: "DONE",summaryAuthoritative: false,
      summaryAt: new Date("2026-09-07T12:00:01.000Z")
    });
    expect(Buffer.from(persisted[0]!.summaryCiphertext as Uint8Array).toString("utf8"))
      .toBe(summary);
  });

  it.each([
    ["en","Open //invalid.example/reset and use password syntheticvalue7.",
      "The advisory summary was omitted because it did not pass Support safety checks."],
    ["ro","Deschide https%3A%2F%2Finvalid.example/reset cu parola syntheticvalue7.",
      "Rezumatul consultativ a fost omis deoarece nu a trecut verificările de siguranță ale Asistenței."]
  ] as const)("replaces an unsafe %s advisory summary before seal and persistence", async (
    language,hostile,fallback
  ) => {
    const sealed: string[] = [];
    const persisted: SupportCaseSummaryRecord[] = [];
    const complete = vi.fn(async () => JSON.stringify({
      kind: "case_summary",text: hostile,sourceIds: [],actionIds: []
    }));
    const summaries = createAdvisorySummaryService({
      complete,
      seal: async (_caseId,text) => { sealed.push(text);return Buffer.from(text,"utf8"); },
      persist: async (record) => { persisted.push(record); },
      clock: () => new Date(createdAt.getTime() + 1),timeoutMs: 60_000
    });

    await summaries.summarize({ caseId: randomUUID(),language,transcript: "USER> Help",createdAt });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(sealed).toEqual([fallback]);
    expect(sealed[0]).not.toContain(hostile);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ status: "DONE",summaryAuthoritative: false });
  });

  it("screens legacy transcript, reply, and summary plaintext during case access", async () => {
    const caseId = randomUUID();
    const legacy = "legacyvalue7";
    const fallback = "The advisory summary was omitted because it did not pass Support safety checks.";
    const access = createSupportCaseAccessService({
      repository: {
        listOwnCases: vi.fn(async () => []),
        readCaseEncrypted: vi.fn(async () => ({
          case_id: caseId,language: "en",state: "NEW",sla_hours: 48,
          shredded_at: null,destroyed_at: null,wrapped_key: Buffer.from("wrapped"),
          transcript_snapshot_ciphertext: Buffer.from("transcript"),
          summary_ciphertext: Buffer.from("summary"),case_message_next_cursor: null,
          case_messages: [{
            id: randomUUID(),role: "user",
            content_ciphertext: Buffer.from("reply").toString("base64")
          }]
        })),
        appendCaseMessage: vi.fn()
      },
      keys: {
        unwrapDataKey: vi.fn(async () => Buffer.alloc(32,1)),
        openContent: vi.fn((description: Readonly<{ kind: string }>) => {
          if (description.kind === "case-snapshot") return Buffer.from(JSON.stringify([{
            messageId: randomUUID(),role: "user",text: `My password is ${legacy}`
          }]));
          if (description.kind === "case-message") return Buffer.from(`Parola mea este ${legacy}`);
          return Buffer.from(`Open //invalid.example/reset with password ${legacy}.`);
        }),
        sealContent: vi.fn()
      } as never
    });

    const view = await access.readByToken("f".repeat(64),{ limit: 20 });

    expect(view?.kind).toBe("READABLE");
    if (view?.kind !== "READABLE") throw new Error("expected readable case");
    expect(view.messages.map(({ text }) => text).join(" ")).not.toContain(legacy);
    expect(view.messages.every(({ text }) => text.includes("[REDACTED_SECRET_LIKE]"))).toBe(true);
    expect(view.summary).toBe(fallback);
  });

  it("marks a relay miss TIMED_OUT without summary bytes and keeps the case in the inbox", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    await service().openCase({
      caseId,tokenSha256: "f".repeat(64),sessionId,identityOwnerRef: null,
      language: "en",createdAt,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    const repository = new PostgresSupportCaseSummaryRepository(database.pool);
    const summaries = createAdvisorySummaryService({
      complete: async () => await new Promise<string>(() => undefined),
      seal: async () => { throw new Error("must not seal"); },
      persist: (record) => repository.updateCaseSummary(record),
      clock: () => new Date("2026-09-07T12:01:00.000Z"),
      timeoutMs: 5
    });
    await summaries.summarize({ caseId,language: "en",transcript: "USER> Help",createdAt });
    expect((await database.pool.query(
      "SELECT summary_status,summary_ciphertext,summary_authoritative FROM support.\"case\" WHERE case_id=$1",
      [caseId]
    )).rows).toEqual([{
      summary_status: "TIMED_OUT",summary_ciphertext: null,summary_authoritative: false
    }]);
    expect((await database.pool.query(
      "SELECT case_id FROM support.inbox WHERE case_id=$1",[caseId]
    )).rows).toEqual([{ case_id: caseId }]);
  });

  it("persists the authoritative deadline despite real timer slippage and rejects late DONE", async () => {
    const sessionId = await session();
    const caseId = randomUUID();
    await service().openCase({
      caseId,tokenSha256: "1".repeat(64),sessionId,identityOwnerRef: null,
      language: "en",createdAt,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    const repository = new PostgresSupportCaseSummaryRepository(database.pool);
    let rejectLate!: (reason: Error) => void;
    const summaries = createAdvisorySummaryService({
      complete: async () => await new Promise<string>((_resolve,reject) => {
        rejectLate = reject;
      }),
      seal: async () => { throw new Error("must not seal"); },
      persist: (record) => repository.updateCaseSummary(record),
      clock: () => new Date(createdAt.getTime() + 60_001),
      timeoutMs: 5
    });

    await summaries.summarize({ caseId,language: "en",transcript: "USER> Help",createdAt });
    rejectLate(new Error("relay ignored abort before rejecting"));
    await new Promise((resolve) => setTimeout(resolve,0));
    await expect(repository.updateCaseSummary({
      caseId,status: "DONE",summaryCiphertext: contentV2(9),
      summaryAt: new Date(createdAt.getTime() + 6),summaryAuthoritative: false
    })).rejects.toThrow("SUPPORT_CASE_SUMMARY_INVALID");
    expect((await database.pool.query(`
      SELECT summary_status,summary_ciphertext,summary_at FROM support."case" WHERE case_id=$1
    `,[caseId])).rows).toEqual([{
      summary_status: "TIMED_OUT",summary_ciphertext: null,
      summary_at: new Date(createdAt.getTime() + 5)
    }]);
  });

  it.each(["SUPPORT_MODEL_UNAVAILABLE","SUPPORT_DISABLED"] as const)(
    "propagates immediate typed summary failure %s instead of recording a timeout", async (code) => {
    const persisted: unknown[] = [];
    let signal: AbortSignal | undefined;
    const summaries = createAdvisorySummaryService({
      complete: async (request) => {
        signal = request.signal;
        throw new SupportModelError(code);
      },
      seal: async () => { throw new Error("must not seal"); },
      persist: async (record) => { persisted.push(record); },
      timeoutMs: 1_000
    });

    await expect(summaries.summarize({
      caseId: randomUUID(),language: "en",transcript: "USER> Help",createdAt
    })).rejects.toMatchObject({ code });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(persisted).toEqual([]);
    }
  );

  it("aborts at the deadline, persists one timeout, and rejects a late DONE write", async () => {
    let finish!: (value: string) => void;
    let observedSignal: AbortSignal | undefined;
    const sealed: string[] = [];
    const persisted: Array<Readonly<Record<string,unknown>>> = [];
    const summaries = createAdvisorySummaryService({
      complete: async (request) => {
        observedSignal = request.signal;
        return await new Promise<string>((resolve) => { finish = resolve; });
      },
      seal: async (_caseId,text) => { sealed.push(text);return Buffer.from(text); },
      persist: async (record) => { persisted.push(record); },
      clock: () => new Date(createdAt.getTime() + 10),timeoutMs: 5
    });

    await summaries.summarize({
      caseId: randomUUID(),language: "en",transcript: "USER> Help",createdAt
    });
    expect(observedSignal?.aborted).toBe(true);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ status: "TIMED_OUT",summaryCiphertext: null });
    finish("Late summary.");
    await new Promise((resolve) => setTimeout(resolve,0));
    expect(sealed).toEqual([]);
    expect(persisted).toHaveLength(1);
  });

  it("reports a typed background summary failure through the case-service seam", async () => {
    const diagnostics: Array<Readonly<{ code: string;caseId: string }>> = [];
    const cases = createSupportCaseService({
      messages: {
        listSession: async () => []
      },
      create: async (input) => ({
        caseId: input.caseId,sessionId: input.sessionId,
        identityOwnerRef: input.identityOwnerRef,language: input.language,
        createdAt: input.createdAt,triggerPredicate: input.triggerPredicate,toolCalls: input.toolCalls,
        kbVersion: input.kbVersion,slaHours: input.slaHours,state: "NEW" as const
      }),
      summaries: { summarize: async () => {
        throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
      } },
      reportSummaryFailure: (diagnostic) => { diagnostics.push(diagnostic); }
    });
    const opened = await cases.open({
      sessionId: randomUUID(),language: "en",createdAt,
      identityOwnerRef: null,triggerPredicate: "E1",toolCalls: [],
      kbVersion: "b".repeat(64),slaHours: 48
    });
    await new Promise((resolve) => setTimeout(resolve,0));
    expect(diagnostics).toEqual([{
      code: "SUPPORT_MODEL_UNAVAILABLE",caseId: opened.record.caseId
    }]);
  });
});
