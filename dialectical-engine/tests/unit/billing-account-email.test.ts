import { describe, expect, it } from "vitest";
import { encrypt, generateDek } from "@debateai/crypto";
import type { Pool } from "pg";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { DekAccountEmailReader, DekBillingRecipientReader } from "../../apps/api/src/billing/account-email.js";

const USER = "44444444-4444-4444-8444-444444444444";

function reader(email: string, aadUser = USER) {
  const dek = generateDek();
  const envelope = encrypt(dek, Buffer.from(email, "utf8"), [
    "identity", "user.email_ciphertext", aadUser, "run:none", aadUser, `user-dek:${aadUser}`, "1"
  ]);
  const pool = { query: async () => ({ rows: [{ email_ciphertext: envelope }] }) } as unknown as Pool;
  const users = { load: async () => Buffer.from(dek) } as unknown as ReadableUserDekStore;
  return new DekAccountEmailReader(pool, users);
}

describe("P8c the account email for the xMoney customer", () => {
  it("decrypts the account address with the person's DEK and the registration AAD", async () => {
    expect(await reader("person@example.test").read(USER)).toBe("person@example.test");
  });

  it("refuses a ciphertext bound to another user and an address that is not one mailbox", async () => {
    await expect(reader("person@example.test", "55555555-5555-4555-8555-555555555555").read(USER)).rejects.toThrow();
    await expect(reader("a@example.test,b@example.test").read(USER)).rejects.toMatchObject({ code: "BILLING_ACCOUNT_EMAIL_UNAVAILABLE" });
  });

  it("refuses when no active account row exists", async () => {
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    await expect(new DekAccountEmailReader(pool, {} as ReadableUserDekStore).read(USER))
      .rejects.toMatchObject({ code: "BILLING_ACCOUNT_EMAIL_UNAVAILABLE" });
  });
});

describe("W8 (P2-I12) the address billing mail follows", () => {
  const CUSTOMER = "66666666-6666-4666-8666-666666666666";

  function recipients(
    rows: ReadonlyArray<Readonly<{ user_id: string; email_ciphertext: unknown }>>, keys: ReadonlyMap<string, Buffer>
  ) {
    const queries: Array<Readonly<{ text: string; values: unknown[] }>> = [];
    const pool = {
      query: async (text: string, values: unknown[]) => { queries.push({ text, values }); return { rows }; }
    } as unknown as Pool;
    const users = {
      exists: async (userId: string) => keys.has(userId),
      load: async (userId: string) => Buffer.from(keys.get(userId)!)
    } as unknown as ReadableUserDekStore;
    return { reader: new DekBillingRecipientReader(pool, users), queries };
  }

  function sealed(email: string) {
    const dek = generateDek();
    const envelope = encrypt(dek, Buffer.from(email, "utf8"), [
      "identity", "user.email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"
    ]);
    return { dek: Buffer.from(dek), envelope };
  }

  it("reads the CURRENT address of the account behind the billing customer, whatever its state", async () => {
    const { dek, envelope } = sealed("after-the-change@example.test");
    const { reader, queries } = recipients([{ user_id: USER, email_ciphertext: envelope }], new Map([[USER, dek]]));
    expect(await reader.currentAddress(CUSTOMER)).toBe("after-the-change@example.test");
    expect(queries).toHaveLength(1);
    expect(queries[0]!.values).toEqual([CUSTOMER]);
    // The join from the billing customer to its account by owner_ref, with no state filter: a frozen or suspended
    // account still has its address, and only an erased one (its row gone) has none.
    expect(queries[0]!.text).toMatch(/billing\.customer[\s\S]*identity\."user"[\s\S]*owner_ref/u);
    expect(queries[0]!.text).not.toMatch(/state/u);
  });

  it("answers null once the account is erased: no account row, or its key already destroyed", async () => {
    expect(await recipients([], new Map()).reader.currentAddress(CUSTOMER)).toBeNull();
    const { envelope } = sealed("being-erased@example.test");
    expect(await recipients([{ user_id: USER, email_ciphertext: envelope }], new Map()).reader.currentAddress(CUSTOMER))
      .toBeNull();
  });

  it("refuses an address bound to another user or that is not one mailbox, so the mail waits instead of misgoing", async () => {
    const { dek, envelope } = sealed("a@example.test,b@example.test");
    await expect(recipients([{ user_id: USER, email_ciphertext: envelope }], new Map([[USER, dek]])).reader
      .currentAddress(CUSTOMER)).rejects.toMatchObject({ code: "BILLING_ACCOUNT_EMAIL_UNAVAILABLE" });
    const other = "77777777-7777-4777-8777-777777777777";
    const mine = sealed("person@example.test");
    await expect(recipients([{ user_id: other, email_ciphertext: mine.envelope }], new Map([[other, mine.dek]])).reader
      .currentAddress(CUSTOMER)).rejects.toThrow();
  });
});
