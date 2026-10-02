import { describe, expect, it } from "vitest";
import { encrypt, generateDek } from "@debateai/crypto";
import type { Pool } from "pg";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { DekAccountEmailReader } from "../../apps/api/src/billing/account-email.js";

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
