import type { Pool } from "pg";

/** The 0065 guard-valid fixture measured by REQ-REV-SF-9 p2, with an account owner substituted. */
export async function seedSupportFixture(pool: Pool, input: Readonly<{ ownerRef: string | null }>):
  Promise<Readonly<{ sessionId: string; caseId: string }>> {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const caseId = "99999999-9999-4999-8999-999999999999";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`INSERT INTO support.session(session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at)
      VALUES ($1,repeat('a',64),NULL,'en','OPEN',repeat('b',64),'2026-09-01T10:00:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support.session_key VALUES ($1,'\\x01'::bytea || decode(repeat('00',60),'hex'),'2026-09-01T10:00:00Z',NULL)`, [sessionId]);
    await client.query(`INSERT INTO support.session(session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at,shredded_at)
      VALUES ('33333333-3333-4333-8333-333333333333',repeat('c',64),$1,'en','CLOSED',repeat('b',64),'2026-09-02T10:00:00Z','2026-09-03T10:00:00Z')`, [input.ownerRef]);
    await client.query(`INSERT INTO support.session_key VALUES ('33333333-3333-4333-8333-333333333333',decode(repeat('00',61),'hex'),'2026-09-02T10:00:00Z','2026-09-03T10:00:00Z')`);
    await client.query(`INSERT INTO support.shred_audit VALUES ('2026-09-03T10:00:00Z','probe','owner',$1,1)`, [input.ownerRef]);
    await client.query(`INSERT INTO support.message(message_id,session_id,role,content_ciphertext,outcome,language,detected_language,redacted,received_at)
      VALUES ('44444444-4444-4444-8444-444444444444',$1,'user','\\x01','NO_SOURCE','en','en',false,'2026-09-01T10:01:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support.message(message_id,session_id,role,content_ciphertext,outcome,language,detected_language,redacted,received_at)
      VALUES ('44444444-4444-4444-8444-444444444445',$1,'assistant','\\x01','NO_SOURCE','en','en',false,'2026-09-01T10:01:01Z')`, [sessionId]);
    await client.query(`INSERT INTO support.abuse_event VALUES ('55555555-5555-4555-8555-555555555555',$1,'INJECTION',repeat('d',64),repeat('e',64),'2026-09-01T10:02:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support.admission_event VALUES ('66666666-6666-4666-8666-666666666661','MESSAGE',$1,NULL,repeat('e',64),'2026-09-01T10:01:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support.admission_event VALUES ('66666666-6666-4666-8666-666666666662','SESSION',NULL,NULL,repeat('e',64),'2026-09-01T10:00:00Z')`);
    await client.query(`INSERT INTO support.rating VALUES ('77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444',$1,'yes','2026-09-01T10:03:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support.tool_call VALUES ('88888888-8888-4888-8888-888888888888',$1,'read_own_run_state',repeat('f',64),'{}'::jsonb,'2026-09-01T10:04:00Z')`, [sessionId]);
    await client.query(`INSERT INTO support."case"(case_id,token_sha256,session_id,language,created_at,transcript_snapshot_ciphertext,state,kb_version)
      VALUES ($1,repeat('0',64),$2,'en','2026-09-01T10:05:00Z','\\x01','NEW',repeat('b',64))`, [caseId,sessionId]);
    await client.query(`INSERT INTO support.case_key VALUES ($1,'\\x01'::bytea || decode(repeat('00',60),'hex'),'2026-09-01T10:05:00Z',NULL)`, [caseId]);
    await client.query(`INSERT INTO support.case_event VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,NULL,'NEW','2026-09-01T10:05:00Z','system')`, [caseId]);
    await client.query(`INSERT INTO support.case_message(case_message_id,case_id,role,content_ciphertext,at)
      VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$1,'user','\\x01','2026-09-01T10:05:00Z')`, [caseId]);
    await client.query(`INSERT INTO support.relay_call VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-09-01','2026-09-01T10:06:00Z')`);
    await client.query(`INSERT INTO support.relay_waiter(waiter_id,enqueued_at) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-09-01T10:06:00Z')`);
    await client.query(`INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
      VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','COMPLETED','2026-09-01T10:06:01Z',NULL)`);
    await client.query("COMMIT");
    return { sessionId, caseId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
