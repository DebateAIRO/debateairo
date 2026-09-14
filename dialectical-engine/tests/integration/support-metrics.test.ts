import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrate,PostgresSupportStatusRepository } from "../../packages/db/src/index.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const now = new Date("2026-09-08T12:00:00.000Z");

function v2(): Buffer {
  return Buffer.concat([Buffer.from([2]),Buffer.alloc(28,0x31)]);
}

async function seedSession(input: Readonly<{
  ageMs: number;
  rating?: "yes" | "no" | "human";
  openedCase?: boolean;
  outcome?: "ANSWER_GROUNDED" | "REFUSE_SAFETY";
  modelCalled?: boolean;
}>): Promise<void> {
  const sessionId = randomUUID();
  const userId = randomUUID();
  const answerId = randomUUID();
  const at = new Date(now.getTime()-input.ageMs);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
    INSERT INTO support.session(
      session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
    ) VALUES($1,$2,NULL,'en','OPEN',$3,$4)
  `,[sessionId,sessionId.replaceAll("-","").repeat(2),"b".repeat(64),at]);
    await client.query(`
    INSERT INTO support.session_key(session_id,wrapped_key,created_at)
      VALUES($1,$2,$3)
  `,[sessionId,Buffer.concat([Buffer.from([1]),Buffer.alloc(60,0x32)]),at]);
    await client.query(`
    INSERT INTO support.message(
      message_id,session_id,role,content_ciphertext,outcome,language,
      detected_language,redacted,received_at,completed_at,model_called
    ) VALUES
      ($2,$1,'user',$4,$6,'en','en',false,$5,$5,false),
      ($3,$1,'assistant',$4,$6,'en','en',false,$5,$5,$7)
  `,[sessionId,userId,answerId,v2(),at,input.outcome ?? "ANSWER_GROUNDED",input.modelCalled ?? false]);
    if (input.rating !== undefined) {
      await client.query(`INSERT INTO support.rating(
        rating_id,message_id,session_id,rating,at
      ) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),answerId,sessionId,input.rating,at]);
    }
    if (input.openedCase) {
      const caseId = randomUUID();
      await client.query(`INSERT INTO support."case"(
        case_id,token_sha256,session_id,language,created_at,
        transcript_snapshot_ciphertext,state,trigger_predicate
      ) VALUES($1,$2,$3,'en',$4,$5,'NEW','E5')`,[
        caseId,randomUUID().replaceAll("-","").repeat(2),sessionId,at,v2()
      ]);
      await client.query(`INSERT INTO support.case_key(case_id,wrapped_key,created_at)
        VALUES($1,$2,$3)`,[
        caseId,Buffer.concat([Buffer.from([1]),Buffer.alloc(60,0x33)]),at
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => database?.stop(),120_000);

describe("support outcome metrics", () => {
  it("returns null for zero denominators and exact 7/30-day bounded ratios", async () => {
    const repository = new PostgresSupportStatusRepository(database.pool,() => now);
    await expect(repository.status()).resolves.toMatchObject({
      deflection7Days: null,deflection30Days: null,
      ratingResolution7Days: null,ratingResolution30Days: null
    });

    await seedSession({ ageMs: 1,rating: "yes" });
    await seedSession({ ageMs: 3,outcome: "REFUSE_SAFETY",modelCalled: true });
    await seedSession({ ageMs: 2,rating: "no",openedCase: true });
    await seedSession({ ageMs: 10*24*60*60*1_000 });
    await seedSession({ ageMs: 30*24*60*60*1_000,rating: "yes" });
    await seedSession({ ageMs: 30*24*60*60*1_000+1,rating: "yes" });

    await expect(repository.status()).resolves.toMatchObject({
      deflection7Days: 1/3,
      deflection30Days: 3/5,
      ratingResolution7Days: 0.5,
      ratingResolution30Days: 2/3
    });
    const status = await repository.status();
    expect(status.relayState).toBe("AVAILABLE");
    expect(status.callsToday).toBe(1);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM support.rating AS rating JOIN support.message AS message ON message.message_id=rating.message_id WHERE message.outcome='REFUSE_SAFETY'"
    )).rows).toEqual([{ count: 0 }]);
  });
});
