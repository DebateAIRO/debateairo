import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresSupportSessionRepository } from "../../packages/db/src/index.js";
import { capturingPool, rowsRead, type CapturedStatement } from "../support/planRowsRead.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type Limits = Readonly<{
  supportLimitSessionMessages: number;
  supportLimitMessageCharacters: number;
  supportLimitAnonMessages10m: number;
  supportLimitAnonMessages24h: number;
  supportLimitAccountMessages10m: number;
  supportLimitAccountMessages24h: number;
}>;

type OpenSession = Readonly<{ sessionId: string; tokenSha256: string; identityOwnerRef: string | null }>;

const T = new Date("2026-10-01T12:00:00.000Z");
const DEFAULT_LIMITS: Limits = Object.freeze({
  supportLimitSessionMessages: 40,
  supportLimitMessageCharacters: 2000,
  supportLimitAnonMessages10m: 20,
  supportLimitAnonMessages24h: 100,
  supportLimitAccountMessages10m: 20,
  supportLimitAccountMessages24h: 100
});

let database: TestDatabase;
let captured: ReturnType<typeof capturingPool>;
let sessions: PostgresSupportSessionRepository;

function offset(milliseconds: number): Date {
  return new Date(T.getTime() + milliseconds);
}

async function open(ownerRef: string | null): Promise<OpenSession> {
  const sessionId = randomUUID();
  const tokenSha256 = sessionId.replaceAll("-","").repeat(2);
  const created = await sessions.create({
    sessionId,
    tokenSha256,
    identityOwnerRef: ownerRef,
    language: "en",
    kbVersion: "b".repeat(64),
    createdAt: new Date(T.getTime() - 60_000)
  });
  return Object.freeze({ sessionId: created.sessionId, tokenSha256, identityOwnerRef: created.identityOwnerRef });
}

async function admit(
  session: OpenSession,
  ipSha256: string,
  at: Date,
  limits: Limits = DEFAULT_LIMITS
): Promise<string> {
  return sessions.admitMessage({
    sessionId: session.sessionId,
    tokenSha256: session.tokenSha256,
    injection: false,
    messageSha256: "c".repeat(64),
    ipSha256,
    at,
    lockAfterInjections: 3,
    identityOwnerRef: session.identityOwnerRef,
    characterCount: 5,
    limits
  });
}

async function insertMessageRow(input: Readonly<{
  sessionId?: string;
  ownerRef?: string | null;
  ipSha256: string;
  at: Date;
}>): Promise<void> {
  await database.pool.query(`
    INSERT INTO support.admission_event(
      admission_event_id,scope_kind,session_id,identity_owner_ref,ip_sha256,at
    ) VALUES($1,'MESSAGE',$2,$3,$4,$5)
  `,[randomUUID(),input.sessionId ?? randomUUID(),input.ownerRef ?? null,input.ipSha256,input.at]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  captured = capturingPool(database.pool);
  sessions = new PostgresSupportSessionRepository(
    captured.pool,
    async () => Buffer.concat([Buffer.from([1]),Buffer.alloc(60,7)])
  );
  await database.pool.query(`
    INSERT INTO support.admission_event(
      admission_event_id,scope_kind,session_id,identity_owner_ref,ip_sha256,at
    )
    SELECT gen_random_uuid(),'MESSAGE',gen_random_uuid(),NULL,
      encode(sha256(convert_to('noise-'||i,'UTF8')),'hex'),$1::timestamptz - i * interval '2 minutes'
    FROM generate_series(1,20000) AS i
  `,[T]);
  await database.pool.query("ANALYZE support.admission_event");
},120_000);

afterAll(async () => database?.stop(),120_000);

describe("NV-34 support message admission counts", () => {
  it("reads only the keyed rows for anonymous and account messages, admitted or rate limited", async () => {
    const anonymous = await open(null);
    const account = await open(randomUUID());
    const rateLimited: Limits = {
      ...DEFAULT_LIMITS,
      supportLimitAnonMessages10m: 1,
      supportLimitAccountMessages10m: 1
    };
    const calls: { label: string; statements: CapturedStatement[] }[] = [];
    captured.statements.splice(0);
    await expect(admit(anonymous,"d".repeat(64),T)).resolves.toBe("ADMITTED");
    calls.push({ label: "anonymous ADMITTED",statements: captured.statements.splice(0) });
    await expect(admit(anonymous,"d".repeat(64),T,rateLimited)).resolves.toBe("RATE_LIMITED");
    calls.push({ label: "anonymous RATE_LIMITED",statements: captured.statements.splice(0) });
    await expect(admit(account,"e".repeat(64),T)).resolves.toBe("ADMITTED");
    calls.push({ label: "account ADMITTED",statements: captured.statements.splice(0) });
    await expect(admit(account,"e".repeat(64),T,rateLimited)).resolves.toBe("RATE_LIMITED");
    calls.push({ label: "account RATE_LIMITED",statements: captured.statements.splice(0) });

    const matched = calls.flatMap(({ label,statements }) => statements
      .filter(({ text }) => text.includes("support.admission_event") && text.includes("count("))
      .map((statement) => ({ label,statement })));
    expect(matched.map(({ label }) => label)).toEqual([
      "anonymous ADMITTED","anonymous RATE_LIMITED","account ADMITTED","account RATE_LIMITED"
    ]);
    expect(matched).toHaveLength(4);
    for (const { label,statement } of matched) {
      expect.soft(
        await rowsRead(database.pool,statement.text,statement.values,["admission_event"]),
        `${label} count statement rows read`
      ).toBeLessThanOrEqual(50);
    }
  });

  it("keeps today's keys and inclusive windows", async () => {
    const X = "f".repeat(64);
    const Y = "1".repeat(64);
    const Z = "2".repeat(64);
    const W = "3".repeat(64);
    const O = randomUUID();
    const S = await open(null);
    const minute = 60_000;
    const day = 24 * 60 * minute;

    await insertMessageRow({ ipSha256: X,at: offset(-10 * minute) });
    await insertMessageRow({ ipSha256: X,at: offset(-10 * minute - 1) });
    await insertMessageRow({ ipSha256: X,ownerRef: O,at: offset(-day) });
    await insertMessageRow({ ipSha256: X,at: offset(-day - 1) });
    await insertMessageRow({ ipSha256: X,at: offset(1) });
    await insertMessageRow({ ipSha256: Y,ownerRef: O,at: offset(-5 * minute) });
    await insertMessageRow({ ipSha256: Y,ownerRef: O,at: offset(-23 * 60 * minute) });
    await insertMessageRow({ ipSha256: Y,ownerRef: O,at: offset(-day - 1) });
    await insertMessageRow({ ipSha256: Y,ownerRef: O,at: offset(1) });
    await insertMessageRow({ sessionId: S.sessionId,ipSha256: Z,at: offset(-30_000) });
    await insertMessageRow({ sessionId: S.sessionId,ipSha256: Z,at: offset(-40_000) });
    await insertMessageRow({ sessionId: S.sessionId,ipSha256: Z,at: offset(1) });

    const anonymousX = await open(null);
    const accountO = await open(O);

    // Anonymous source X: short 1 (T-10 min inclusive), daily 3 (T-24 h inclusive, an account row of X included).
    await expect(admit(anonymousX,X,T,{ ...DEFAULT_LIMITS,supportLimitAnonMessages10m: 1 }))
      .resolves.toBe("RATE_LIMITED");
    await expect(admit(anonymousX,X,T,{
      ...DEFAULT_LIMITS,supportLimitAnonMessages10m: 2,supportLimitAnonMessages24h: 3
    })).resolves.toBe("RATE_LIMITED");
    // Owner O from source Y: short 1, daily 3 (its T-24 h row on source X included; keyed by owner, not by Y).
    await expect(admit(accountO,Y,T,{ ...DEFAULT_LIMITS,supportLimitAccountMessages10m: 1 }))
      .resolves.toBe("RATE_LIMITED");
    await expect(admit(accountO,Y,T,{
      ...DEFAULT_LIMITS,supportLimitAccountMessages10m: 2,supportLimitAccountMessages24h: 3
    })).resolves.toBe("RATE_LIMITED");
    // Session S: 2 rows, counted whatever source sends the message.
    await expect(admit(S,W,T,{ ...DEFAULT_LIMITS,supportLimitSessionMessages: 2 }))
      .resolves.toBe("RATE_LIMITED");

    // ADMITTED probes last: the T-24 h-1 ms and future rows are excluded, so each count stays below its limit.
    await expect(admit(anonymousX,X,T,{
      ...DEFAULT_LIMITS,supportLimitAnonMessages10m: 2,supportLimitAnonMessages24h: 4
    })).resolves.toBe("ADMITTED");
    await expect(admit(accountO,Y,T,{
      ...DEFAULT_LIMITS,supportLimitAccountMessages10m: 2,supportLimitAccountMessages24h: 4
    })).resolves.toBe("ADMITTED");
    await expect(admit(S,W,T,{ ...DEFAULT_LIMITS,supportLimitSessionMessages: 3 }))
      .resolves.toBe("ADMITTED");
  });
});
