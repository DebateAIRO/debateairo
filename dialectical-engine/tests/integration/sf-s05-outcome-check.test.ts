import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let db: TestDatabase;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
}, 300_000);
afterAll(async () => { await db?.stop(); });

async function insertAsSupport(outcome: string): Promise<string> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_support");
    const sessionId = randomUUID();
    await client.query(`INSERT INTO support.session
      (session_id, session_token_sha256, language, state, kb_version, created_at)
      VALUES ($1, $2, 'en', 'OPEN', $3, now())`, [sessionId, "a".repeat(64), "b".repeat(64)]);
    const result = await client.query<{ outcome: string }>(`INSERT INTO support.message
      (message_id, session_id, role, content_ciphertext, outcome, language, detected_language, redacted, received_at)
      VALUES ($1, $2, 'assistant', $3, $4, 'en', 'en', false, now()) RETURNING outcome`,
      [randomUUID(), sessionId, Buffer.from([2, ...Array(28).fill(0)]), outcome]);
    return result.rows[0]!.outcome;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

it.each(["OFF_TOPIC", "CRISIS", "THREAT"])("stores an assistant row with outcome %s", async (outcome) => {
  await expect(insertAsSupport(outcome)).resolves.toBe(outcome);
});

it("refuses an unknown outcome with support_message_outcome_ck", async () => {
  await expect(insertAsSupport("SOMETHING_ELSE")).rejects.toMatchObject({ constraint: "support_message_outcome_ck" });
});
