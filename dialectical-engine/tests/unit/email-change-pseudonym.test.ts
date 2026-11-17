import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { encrypt, generateDek, type AuditContextHasher } from "@debateai/crypto";
import { PostgresEmailChangeRepository } from "@debateai/db";
import { EmailChangeService } from "../../apps/api/src/email-change.js";

// Design Document v2 (3a): the top bar's identity pill names the signed-in account by its own pseudonym. The account's
// email read carries it. It is read for the session's own account only, after the session is known to be live, and an
// account with none still gets its addresses.

type Dependencies = ConstructorParameters<typeof EmailChangeService>[0];

const USER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const session = Object.freeze({ userId: USER, sessionId: "33333333-3333-4333-8333-333333333333" });

function service(found: boolean, pseudonym: string | null) {
  const dek = generateDek();
  const emailCiphertext = encrypt(dek, Buffer.from("ana.popescu@unibuc.ro", "utf8"), [
    "identity", "user.email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"
  ]);
  const readSettings = vi.fn(async () => found
    ? Object.freeze({ emailCiphertext, recoveryEmailCiphertext: null, pending: null })
    : null);
  const readOwnPseudonym = vi.fn(async (_userId: string) => pseudonym);
  const built = new EmailChangeService({
    repository: { readSettings, readOwnPseudonym } as unknown as Dependencies["repository"],
    users: { load: async () => Buffer.from(dek) } as unknown as Dependencies["users"],
    blindIndexKey: new Uint8Array(32),
    mail: {} as unknown as Dependencies["mail"]
  });
  return { built, readSettings, readOwnPseudonym };
}

describe("the account's own pseudonym on its email read (service)", () => {
  it("returns the pseudonym of the session's own account with its addresses", async () => {
    const { built, readOwnPseudonym } = service(true, "CobaltFalcon48");
    await expect(built.settings(session)).resolves.toEqual({
      email: "ana.popescu@unibuc.ro", recoveryEmail: null, pending: null, pseudonym: "CobaltFalcon48"
    });
    expect(readOwnPseudonym.mock.calls).toEqual([[USER]]);
  });

  it("returns the addresses with no pseudonym when the account has none", async () => {
    const { built } = service(true, null);
    await expect(built.settings(session)).resolves.toEqual({
      email: "ana.popescu@unibuc.ro", recoveryEmail: null, pending: null, pseudonym: null
    });
  });

  it("reads no pseudonym when the session is not a live one of an active account", async () => {
    const { built, readOwnPseudonym } = service(false, "CobaltFalcon48");
    await expect(built.settings(session)).resolves.toBeNull();
    expect(readOwnPseudonym).not.toHaveBeenCalled();
  });
});

describe("the account's own pseudonym on its email read (database statement)", () => {
  const hasher = {} as unknown as AuditContextHasher;

  // A table that holds two accounts and answers the one statement as the database would: the row whose id is the
  // statement's only parameter, when that account is active.
  function repository(rows: ReadonlyArray<Readonly<{ user_id: string; pseudonym: string; state: string }>>) {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        statements.push({ sql, params });
        return { rows: rows.filter((row) => row.user_id === params[0] && row.state === "active")
          .map((row) => ({ pseudonym: row.pseudonym })) };
      }
    } as unknown as Pool;
    return { built: new PostgresEmailChangeRepository(pool, hasher), statements };
  }

  const ACCOUNTS = [
    { user_id: USER, pseudonym: "CobaltFalcon48", state: "active" },
    { user_id: OTHER, pseudonym: "AmberHeron17", state: "active" }
  ] as const;

  it("asks for one account, the one it is handed, and only while it is active", async () => {
    const { built, statements } = repository(ACCOUNTS);
    await expect(built.readOwnPseudonym(USER)).resolves.toBe("CobaltFalcon48");
    expect(statements).toHaveLength(1);
    expect(statements[0]!.params).toEqual([USER]);
    const sql = statements[0]!.sql.replace(/\s+/gu, " ").trim();
    expect(sql).toBe(`SELECT account.pseudonym FROM identity."user" AS account WHERE account.user_id=$1 AND account.state='active'`);
  });

  it("answers null for an account that is erased, closed or unknown", async () => {
    await expect(repository([{ ...ACCOUNTS[0], state: "erased" }, ACCOUNTS[1]]).built.readOwnPseudonym(USER)).resolves.toBeNull();
    await expect(repository([ACCOUNTS[1]]).built.readOwnPseudonym(USER)).resolves.toBeNull();
  });

  it("answers null for a stored pseudonym that is not text", async () => {
    const pool = { query: async () => ({ rows: [{ pseudonym: null }] }) } as unknown as Pool;
    await expect(new PostgresEmailChangeRepository(pool, hasher).readOwnPseudonym(USER)).resolves.toBeNull();
  });
});
