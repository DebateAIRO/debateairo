import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const recoveryTables = [
  "account_recovery_request",
  "account_recovery_state_event"
] as const;

function envelope(keyId: string) {
  return {
    v: 1,
    keyId,
    nonce: randomBytes(12).toString("base64"),
    ct: randomBytes(48).toString("base64"),
    tag: randomBytes(16).toString("base64")
  };
}

async function insertRequest(pool: Pool) {
  return (await pool.query<{
    recovery_request_id: string;
    public_handle: string;
    requested_at: Date;
  }>(`
    INSERT INTO identity.account_recovery_request(channel_refs_ciphertext)
    VALUES ($1::jsonb)
    RETURNING recovery_request_id,public_handle,requested_at
  `, [JSON.stringify(envelope(`recovery-request:${randomUUID()}`))])).rows[0]!;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("P2-03 opaque account-recovery persistence", () => {
  it("creates only the exact opaque/encrypted request and append-only history shape", async () => {
    const columns = await database.pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      column_default: string | null;
    }>(`
      SELECT table_name,column_name,data_type,column_default
      FROM information_schema.columns
      WHERE table_schema='identity' AND table_name=ANY($1::text[])
      ORDER BY table_name,ordinal_position
    `, [recoveryTables]);
    expect(columns.rows.map(({ table_name, column_name, data_type }) => ({
      table_name, column_name, data_type
    }))).toEqual([
      { table_name: "account_recovery_request", column_name: "recovery_request_id", data_type: "uuid" },
      { table_name: "account_recovery_request", column_name: "public_handle", data_type: "uuid" },
      { table_name: "account_recovery_request", column_name: "channel_refs_ciphertext", data_type: "jsonb" },
      { table_name: "account_recovery_request", column_name: "requested_at", data_type: "timestamp with time zone" },
      { table_name: "account_recovery_state_event", column_name: "event_id", data_type: "uuid" },
      { table_name: "account_recovery_state_event", column_name: "recovery_request_id", data_type: "uuid" },
      { table_name: "account_recovery_state_event", column_name: "event_sequence", data_type: "bigint" },
      { table_name: "account_recovery_state_event", column_name: "state", data_type: "text" },
      { table_name: "account_recovery_state_event", column_name: "occurred_at", data_type: "timestamp with time zone" }
    ]);
    expect(columns.rows.filter((column) =>
      column.column_name === "requested_at" || column.column_name === "occurred_at"
    ).every((column) => column.column_default?.includes("clock_timestamp()"))).toBe(true);
    expect(columns.rows.some((column) => /email|address|channel_binding|user_id/.test(column.column_name)))
      .toBe(false);

    const before = Date.now();
    const request = await insertRequest(database.pool);
    const after = Date.now();
    expect(request.public_handle).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.public_handle).not.toBe(request.recovery_request_id);
    expect(request.requested_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(request.requested_at.getTime()).toBeLessThanOrEqual(after);

    await expect(database.pool.query(`
      INSERT INTO identity.account_recovery_request(channel_refs_ciphertext)
      VALUES ('{"email":"plaintext@example.test"}'::jsonb)
    `)).rejects.toMatchObject({ code: "23514" });
  });

  it("replays safely and enforces exact indexes plus immutable request/history rows", async () => {
    const migration = await readFile(
      new URL("../../migrations/0044_account_recovery_persistence.sql", import.meta.url),
      "utf8"
    );
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    await expect(database.pool.query(migration)).resolves.toBeDefined();

    const indexes = await database.pool.query<{ tablename: string; indexname: string }>(`
      SELECT tablename,indexname FROM pg_indexes
      WHERE schemaname='identity' AND tablename=ANY($1::text[])
      ORDER BY tablename,indexname
    `, [recoveryTables]);
    expect(indexes.rows).toEqual([
      { tablename: "account_recovery_request", indexname: "account_recovery_request_pkey" },
      { tablename: "account_recovery_request", indexname: "account_recovery_request_public_handle_unique" },
      { tablename: "account_recovery_state_event", indexname: "account_recovery_state_event_pkey" },
      { tablename: "account_recovery_state_event", indexname: "account_recovery_state_event_request_order" },
      { tablename: "account_recovery_state_event", indexname: "account_recovery_state_event_request_sequence_unique" }
    ]);

    const request = await insertRequest(database.pool);
    const eventBefore = Date.now();
    const event = (await database.pool.query<{
      event_id: string;
      event_sequence: string;
      occurred_at: Date;
    }>(`
      INSERT INTO identity.account_recovery_state_event(recovery_request_id,state)
      VALUES ($1,'REQUESTED') RETURNING event_id,event_sequence::text,occurred_at
    `, [request.recovery_request_id])).rows[0]!;
    expect(event.event_sequence).toMatch(/^[1-9][0-9]*$/);
    expect(event.occurred_at.getTime()).toBeGreaterThanOrEqual(eventBefore);
    expect(event.occurred_at.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(database.pool.query(
      "UPDATE identity.account_recovery_request SET public_handle=gen_random_uuid() WHERE recovery_request_id=$1",
      [request.recovery_request_id]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query(
      "DELETE FROM identity.account_recovery_state_event WHERE event_id=$1", [event.event_id]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query(
      "TRUNCATE identity.account_recovery_state_event"
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("denies direct table access to actual application login principals", async () => {
    const suffix = randomBytes(6).toString("hex");
    const roles = [
      "debateai_runtime",
      "debateai_authorization_runtime",
      "debateai_erasure_runtime",
      "debateai_content_provision",
      "debateai_publication_cleanup",
      "debateai_replay"
    ] as const;
    for (const [index, memberRole] of roles.entries()) {
      const login = `p203_${index}_${suffix}`;
      const password = `p203-${index}-${suffix}`;
      await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' INHERIT`);
      await database.pool.query(`GRANT ${memberRole} TO ${login}`);
      const url = new URL(database.connectionString);
      url.username = login;
      url.password = password;
      const principal = createPool(url.toString());
      try {
        await expect(principal.query(
          "SELECT recovery_request_id FROM identity.account_recovery_request LIMIT 1"
        )).rejects.toMatchObject({ code: "42501" });
        await expect(principal.query(`
          INSERT INTO identity.account_recovery_request(channel_refs_ciphertext)
          VALUES ($1::jsonb)
        `, [JSON.stringify(envelope(`forbidden:${login}`))])).rejects.toMatchObject({ code: "42501" });
        await expect(principal.query(
          "UPDATE identity.account_recovery_state_event SET state='CANCELLED' WHERE false"
        )).rejects.toMatchObject({ code: "42501" });
        await expect(principal.query(
          "DELETE FROM identity.account_recovery_state_event WHERE false"
        )).rejects.toMatchObject({ code: "42501" });
        await expect(principal.query(
          "TRUNCATE identity.account_recovery_state_event"
        )).rejects.toMatchObject({ code: "42501" });
        await expect(principal.query(
          "SELECT nextval('identity.account_recovery_state_event_event_sequence_seq')"
        )).rejects.toMatchObject({ code: "42501" });
      } finally {
        await principal.end();
      }
    }
  });
});
