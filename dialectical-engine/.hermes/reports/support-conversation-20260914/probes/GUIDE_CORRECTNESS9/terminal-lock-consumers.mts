import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  migrate,PostgresSupportSessionRepository
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/db/src/index.ts";
import {
  startTestDatabase
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/tests/support/testDatabase.ts";

const database = await startTestDatabase();
const rows:Array<Record<string,unknown>> = [];
try {
  await migrate(database.pool);
  const repository = new PostgresSupportSessionRepository(
    database.pool,async () => Buffer.concat([Buffer.from([1]),Buffer.alloc(60,0x41)])
  );
  const sessionId = randomUUID();
  const tokenSha256 = "a".repeat(64);
  const createdAt = new Date("2026-09-20T13:00:00.000Z");
  await repository.create({
    sessionId,tokenSha256,identityOwnerRef:null,language:"en",
    kbVersion:"b".repeat(64),createdAt
  });
  const firstMessageId = randomUUID();
  const secondMessageId = randomUUID();
  const ciphertext = Buffer.concat([Buffer.from([2]),Buffer.alloc(28,0x31)]);
  await database.pool.query(`
    INSERT INTO support.message(
      message_id,session_id,role,content_ciphertext,outcome,language,
      detected_language,redacted,received_at,completed_at,model_called
    ) VALUES
      ($2,$1,'assistant',$4,'ANSWER_GROUNDED','en','en',false,$5,$5,false),
      ($3,$1,'assistant',$4,'ANSWER_GROUNDED','en','en',false,$5,$5,false)
  `,[sessionId,firstMessageId,secondMessageId,ciphertext,createdAt]);

  const openRating = await repository.rateMessage({
    sessionId,tokenSha256,messageId:firstMessageId,rating:"yes",
    at:new Date(createdAt.getTime()+1)
  });
  assert.deepEqual(openRating,["yes"]);
  rows.push({ case:"open-positive-rating",result:openRating });

  await database.pool.query(`
    INSERT INTO support.abuse_event(
      abuse_event_id,session_id,class,message_sha256,ip_sha256,at
    ) VALUES($1,$2,'LOCK',NULL,$3,$4)
  `,[randomUUID(),sessionId,"c".repeat(64),new Date(createdAt.getTime()+2)]);

  const readDefault = await repository.read({ sessionId,tokenSha256 });
  const readRaised = await repository.read({ sessionId,tokenSha256,lockAfterInjections:99 });
  assert.equal(readDefault?.state,"LOCKED");
  assert.equal(readRaised?.state,"LOCKED");
  rows.push({ case:"read-terminal-default-and-raised",default:readDefault?.state,raised:readRaised?.state });

  const admission = await repository.admitMessage({
    sessionId,tokenSha256,injection:false,messageSha256:"d".repeat(64),
    ipSha256:"e".repeat(64),at:new Date(createdAt.getTime()+3),
    lockAfterInjections:99,identityOwnerRef:null,characterCount:5,
    limits:{
      supportLimitSessionMessages:40,supportLimitMessageCharacters:4000,
      supportLimitAnonMessages10m:20,supportLimitAnonMessages24h:100,
      supportLimitAccountMessages10m:40,supportLimitAccountMessages24h:200
    }
  });
  assert.equal(admission,"LOCKED");
  rows.push({ case:"admission-terminal-after-threshold-rise",result:admission });

  const lockedRating = await repository.rateMessage({
    sessionId,tokenSha256,messageId:secondMessageId,rating:"human",
    at:new Date(createdAt.getTime()+4)
  });
  assert.equal(lockedRating,null);
  const count = Number((await database.pool.query<{ count:string }>(
    "SELECT count(*)::text AS count FROM support.rating WHERE session_id=$1",[sessionId]
  )).rows[0]?.count);
  assert.equal(count,1);
  rows.push({ case:"direct-rating-terminal",result:lockedRating,ratingCount:count });

  console.log(JSON.stringify({ status:"PASS",rows },null,2));
} finally {
  await database.stop();
}
