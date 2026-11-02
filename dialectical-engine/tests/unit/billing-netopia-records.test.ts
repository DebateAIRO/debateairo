// tests/unit/billing-netopia-records.test.ts
// N9 (spec 2026-10-05 §2.5.2, §2.15.1, §2.2 rule 5): the sealed parts of NETOPIA's messages and the saved card.
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { openRecord } from "@debateai/crypto";
import { createSecretToken } from "@debateai/payments-netopia";
import {
  noticeQuarantineIdOf, openCardToken, openQuarantined, sealCardToken, sealNoticeAllowed, sealNoticeRaw, sealQuarantined
} from "../../apps/api/src/billing/records.js";

const KEY = Buffer.alloc(32, 5);
const TOKEN = ["tok", "records", "77aa"].join("-");

describe("N9 the sealed NETOPIA records", () => {
  it("opens a saved card into a SecretToken that prints [token], bound to its own row", () => {
    const tokenId = randomUUID();
    const sealed = sealCardToken(KEY, tokenId, createSecretToken(TOKEN));
    const opened = openCardToken(KEY, { tokenId, tokenCiphertext: sealed.ciphertext });
    expect(opened.reveal()).toBe(TOKEN);
    expect(String(opened)).toBe("[token]");
    expect(JSON.stringify({ opened })).not.toContain(TOKEN);
    expect(inspect(opened)).not.toContain(TOKEN);
    expect(() => openCardToken(KEY, { tokenId: randomUUID(), tokenCiphertext: sealed.ciphertext })).toThrow("RECORD_DECRYPT_FAILED");
  });

  it("seals the allow-list and the raw bytes under their own table, column and row", () => {
    const noticeId = randomUUID();
    const allowed = { orderID: "a".repeat(32), ntpID: "1234567", status: 3, amount: "24.2", last4: "5098", expireMonth: null };
    const sealedAllowed = sealNoticeAllowed(KEY, noticeId, allowed);
    const opened = openRecord(KEY, { table: "billing.payment_notice", column: "allowed_ciphertext", rowId: noticeId }, sealedAllowed.ciphertext);
    expect(JSON.parse(opened.toString("utf8"))).toEqual(allowed);
    const raw = Buffer.from(`{ "payment": { "message": "Plată aprobată" } }`, "utf8");
    const sealedRaw = sealNoticeRaw(KEY, noticeId, raw);
    expect(openRecord(KEY, { table: "billing.payment_notice_raw", column: "raw_ciphertext", rowId: noticeId }, sealedRaw.ciphertext)
      .equals(raw)).toBe(true);
    expect(() => openRecord(KEY, { table: "billing.payment_notice", column: "allowed_ciphertext", rowId: noticeId }, sealedRaw.ciphertext))
      .toThrow("RECORD_DECRYPT_FAILED");
    expect(sealedAllowed.keyId).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("seals a quarantined message's bytes and header apart, and opens them back exactly (header absent included)", () => {
    const quarantineId = randomUUID();
    const raw = Buffer.from("{\"order\":{\"orderID\":\"" + "b".repeat(32) + "\"}}", "utf8");
    const header = ["eyJhbGciOiJSUzUxMiJ9", "eyJpc3MiOiJ4In0", "c2ln"].join(".");
    const sealed = sealQuarantined(KEY, quarantineId, raw, header);
    expect(sealed.headerCiphertext).not.toBeNull();
    const opened = openQuarantined(KEY, { quarantineId, rawCiphertext: sealed.rawCiphertext, headerCiphertext: sealed.headerCiphertext });
    expect(opened.rawBody.equals(raw)).toBe(true);
    expect(opened.header).toBe(header);
    const bare = sealQuarantined(KEY, quarantineId, Buffer.alloc(0), undefined);
    expect(bare.headerCiphertext).toBeNull();
    const openedBare = openQuarantined(KEY, { quarantineId, rawCiphertext: bare.rawCiphertext, headerCiphertext: null });
    expect([openedBare.rawBody.length, openedBare.header]).toEqual([0, undefined]);
    // The two columns cannot stand in for each other, nor another row's.
    expect(() => openQuarantined(KEY, { quarantineId, rawCiphertext: sealed.headerCiphertext!, headerCiphertext: null })).toThrow("RECORD_DECRYPT_FAILED");
    expect(() => openQuarantined(KEY, { quarantineId: randomUUID(), rawCiphertext: sealed.rawCiphertext, headerCiphertext: null }))
      .toThrow("RECORD_DECRYPT_FAILED");
  });

  it("NV-44: names a quarantined message by its bytes and header under the records key, as a version-8 UUID", () => {
    const raw = Buffer.from("{\"order\":{\"orderID\":\"" + "c".repeat(32) + "\"}}", "utf8");
    const header = ["eyJhbGciOiJSUzUxMiJ9", "eyJpc3MiOiJ4In0", "c2ln"].join(".");
    const id = noticeQuarantineIdOf(KEY, raw, header);
    expect(noticeQuarantineIdOf(KEY, Buffer.from(raw), header)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    const changed = Buffer.from(raw);
    changed.writeUInt8(changed.readUInt8(changed.length - 3) ^ 1, changed.length - 3);
    expect(noticeQuarantineIdOf(KEY, changed, header)).not.toBe(id);
    expect(noticeQuarantineIdOf(KEY, raw, undefined)).not.toBe(noticeQuarantineIdOf(KEY, raw, ""));
    expect(noticeQuarantineIdOf(KEY, raw, `${header}x`)).not.toBe(id);
    // Keyed: another records key names the same bytes differently, so the clear id confirms no guess.
    expect(noticeQuarantineIdOf(Buffer.alloc(32, 9), raw, header)).not.toBe(id);
    expect(() => noticeQuarantineIdOf(Buffer.alloc(31, 5), raw, header)).toThrow("RECORD_KEY_INVALID");
    const sealed = sealQuarantined(KEY, id, raw, header);
    const opened = openQuarantined(KEY, { quarantineId: id, rawCiphertext: sealed.rawCiphertext, headerCiphertext: sealed.headerCiphertext });
    expect([opened.rawBody.equals(raw), opened.header]).toEqual([true, header]);
  });
});
