// tests/unit/payments-xmoney-signing.test.ts
import { createCipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  aesKeyFromPrivateKey,
  decryptNotice,
  parseJsonKeepingNumberText,
  signOrderPayload,
  xmoneyEnvironmentOf,
  XMoneyClient,
  type XMoneyEmbeddedOrder
} from "@debateai/payments-xmoney";
import { customerForm, recordingOrder, signRecordingOrder } from "../../tools/billing/xmoney-sandbox.js";

// Known vectors, computed with node:crypto on 29 Sep 2026 independently of this package.
const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "latin1");
const ORDER: XMoneyEmbeddedOrder = {
  publicKey: "pk_vector",
  siteId: "1",
  customer: { identifier: "c0ffee00c0ffee00c0ffee00c0ffee00", email: "person@example.test", country: "RO" },
  order: { orderId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", type: "managed", amount: "24.20", currency: "USD", description: "Plus plan" },
  cardTransactionMode: "authAndCapture",
  saveCard: true,
  backUrl: "https://debateai.test/checkout/return?charge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};
const PAYLOAD = "eyJwdWJsaWNLZXkiOiJwa192ZWN0b3IiLCJzaXRlSWQiOiIxIiwiY3VzdG9tZXIiOnsiaWRlbnRpZmllciI6ImMwZmZlZTAwYzBmZmVlMDBjMGZmZWUwMGMwZmZlZTAwIiwiZW1haWwiOiJwZXJzb25AZXhhbXBsZS50ZXN0IiwiY291bnRyeSI6IlJPIn0sIm9yZGVyIjp7Im9yZGVySWQiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSIsInR5cGUiOiJtYW5hZ2VkIiwiYW1vdW50IjoiMjQuMjAiLCJjdXJyZW5jeSI6IlVTRCIsImRlc2NyaXB0aW9uIjoiUGx1cyBwbGFuIn0sImNhcmRUcmFuc2FjdGlvbk1vZGUiOiJhdXRoQW5kQ2FwdHVyZSIsInNhdmVDYXJkIjp0cnVlLCJiYWNrVXJsIjoiaHR0cHM6Ly9kZWJhdGVhaS50ZXN0L2NoZWNrb3V0L3JldHVybj9jaGFyZ2U9YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEifQ==";
const CHECKSUM = "RG0vjCXNudLDX+eoAZcoemx1X0VqsQQAvAMMSWQ4TPwKj8Zgn3S5nbAhQ68o2PDjqtbnAJHH9wpSc+kW6wUW9g==";
// {"transactionStatus":"complete-ok","orderId":4711,"externalOrderId":"bbbb…(32)","transactionId":9001,
//  "customerId":55,"amount":24.2,"currency":"USD","cardId":77,"timestamp":1790000000}, IV 000102…0f
const NOTICE = "AAECAwQFBgcICQoLDA0ODw==,YCMaebE19lb0PYzWXWNJkBzs839drejtHwjTmNcT/AkDb6WvDwq4gGYAMNok1u4zmKv9jlYtSdFAjzIYI1pIrdsqrEAmPsP6ZY5VXTULQCzWnkTzQDSQqbxDWkibZMtBoiKAdk1HoGtzLwBdlXW6BNzG0g8OPO51/ephyX1T5YHoSmw6ACjv0V8H0wNyCbrULnKJV2M8QyZ9uVEB2mnIgePLD1OWO6Pjv+Oj2vWd0fPo65ma+58iLFmoDKMUIMRH1rSAXPN0i3+eWs+PdH6yGg==";
const undecryptable = expect.objectContaining({ code: "XMONEY_NOTICE_UNDECRYPTABLE" });

describe("P3a — signing the embedded order", () => {
  it("matches the known vector", () => {
    expect(signOrderPayload(ORDER, KEY)).toEqual({ payload: PAYLOAD, checksum: CHECKSUM });
  });
  it("does not depend on how the caller ordered its fields", () => {
    const shuffled = {
      backUrl: ORDER.backUrl, saveCard: true as const, cardTransactionMode: ORDER.cardTransactionMode,
      order: { description: "Plus plan", currency: "USD" as const, amount: "24.20", type: "managed" as const, orderId: ORDER.order.orderId },
      customer: { country: "RO", email: "person@example.test", identifier: ORDER.customer.identifier },
      siteId: "1", publicKey: "pk_vector"
    };
    expect(signOrderPayload(shuffled, KEY)).toEqual({ payload: PAYLOAD, checksum: CHECKSUM });
  });
  it("refuses an order id that is not our charge id, and an amount that is not two decimals", () => {
    expect(() => signOrderPayload({ ...ORDER, order: { ...ORDER.order, orderId: "not-a-charge" } }, KEY))
      .toThrow(expect.objectContaining({ code: "XMONEY_ORDER_INVALID" }));
    expect(() => signOrderPayload({ ...ORDER, order: { ...ORDER.order, amount: "24.2" } }, KEY))
      .toThrow(expect.objectContaining({ code: "XMONEY_ORDER_INVALID" }));
  });
});

describe("P3a — the AES key", () => {
  it("is exactly 32 bytes, and a copy the caller can zero", () => {
    const key = aesKeyFromPrivateKey(KEY);
    expect(key.equals(KEY)).toBe(true);
    key.fill(0);
    expect(KEY.toString("latin1")).toBe("0123456789abcdef0123456789abcdef");
    expect(() => aesKeyFromPrivateKey(Buffer.alloc(31, 1))).toThrow(expect.objectContaining({ code: "XMONEY_KEY_LENGTH_INVALID" }));
    expect(() => aesKeyFromPrivateKey(Buffer.alloc(40, 1))).toThrow(expect.objectContaining({ code: "XMONEY_KEY_LENGTH_INVALID" }));
  });
});

describe("P3a — decrypting a notice", () => {
  it("matches the known vector and keeps every number's exact text", () => {
    expect(decryptNotice(NOTICE, KEY)).toEqual({
      transactionStatus: "complete-ok", orderId: "4711", externalOrderId: "b".repeat(32), transactionId: "9001",
      customerId: "55", amountDecimal: "24.2", currency: "USD", cardId: "77", timestamp: 1_790_000_000
    });
  });
  it("survives a form decoder that turned + into a space", () => {
    expect(NOTICE).toContain("+");
    expect(decryptNotice(NOTICE.replaceAll("+", " "), KEY).transactionId).toBe("9001");
  });
  it.each([
    ["the wrong key", () => decryptNotice(NOTICE, Buffer.from("fedcba9876543210fedcba9876543210", "latin1"))],
    ["no comma", () => decryptNotice(NOTICE.replace(",", ""), KEY)],
    ["an IV that is not 16 bytes", () => decryptNotice(`AAEC,${NOTICE.split(",")[1]!}`, KEY)],
    ["a truncated ciphertext", () => decryptNotice(NOTICE.slice(0, -8), KEY)],
    ["not base64", () => decryptNotice("%%%%,%%%%", KEY)]
  ])("refuses %s", (_label, run) => {
    expect(run).toThrow(undecryptable);
  });
});

describe("P3a — numbers keep their source text past what a double can hold", () => {
  it("decrypts ids above 2^53 and a trailing-zero amount exactly as xMoney wrote them", () => {
    const plaintext = `{"transactionStatus":"complete-ok","orderId":12345678901234567890,"externalOrderId":"${"b".repeat(32)}",`
      + `"transactionId":9007199254740993,"customerId":55,"amount":24.20,"currency":"USD","cardId":77,"timestamp":1790000000}`;
    const iv = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
    const cipher = createCipheriv("aes-256-cbc", KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const notice = decryptNotice(`${iv.toString("base64")},${ciphertext.toString("base64")}`, KEY);
    expect(notice.orderId).toBe("12345678901234567890");
    expect(notice.transactionId).toBe("9007199254740993");
    expect(notice.amountDecimal).toBe("24.20");
  });
  it("keeps the text of numbers inside arrays (P3b's relatedTransactionIds shape)", () => {
    expect(parseJsonKeepingNumberText('{"ids":[9007199254740993],"amount":24.20}'))
      .toEqual({ ids: ["9007199254740993"], amount: "24.20" });
  });
  it("refuses, rather than losing digits, on a runtime that gives the reviver no source text", () => {
    const realParse = JSON.parse;
    const spy = vi.spyOn(JSON, "parse").mockImplementation((text: string, reviver?: (key: string, value: unknown) => unknown) => (
      reviver === undefined
        ? realParse(text)
        : realParse(text, function (this: unknown, key: string, value: unknown) { return reviver.call(this, key, value); })
    ) as unknown);
    try {
      expect(() => parseJsonKeepingNumberText('{"id":1}')).toThrow("JSON_NUMBER_SOURCE_UNAVAILABLE");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("P3a — the environment follows the base URL (A22)", () => {
  it("is live only for the live API host", () => {
    expect(xmoneyEnvironmentOf("https://api.xmoney.com")).toBe("live");
    expect(xmoneyEnvironmentOf("https://api-stage.xmoney.com/")).toBe("stage");
    expect(xmoneyEnvironmentOf("http://127.0.0.1:8797")).toBe("stage");
  });
});

describe("P3a — what X0's recording page signs is what this package signs", () => {
  it("signs X0's recording order byte for byte like signOrderPayload", () => {
    const recorded = recordingOrder({
      publicKey: ORDER.publicKey, siteId: ORDER.siteId, identifier: ORDER.customer.identifier, email: ORDER.customer.email,
      country: ORDER.customer.country, chargeId: ORDER.order.orderId, amount: ORDER.order.amount,
      mode: ORDER.cardTransactionMode, description: ORDER.order.description, backUrl: ORDER.backUrl
    });
    expect(signRecordingOrder(recorded, KEY)).toEqual(signOrderPayload(ORDER, KEY));
  });
});

describe("P3b — what X0's customer step posts is what XMoneyClient.createCustomer posts (W1)", () => {
  it("posts the same form to POST /customer, with a country and without one", async () => {
    for (const country of ["RO", null]) {
      const sent: Array<{ method: string; path: string; body: string }> = [];
      const client = new XMoneyClient({
        baseUrl: "https://stage.invalid", privateKey: KEY, siteId: "4242",
        fetch: async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          sent.push({ method: init?.method ?? "GET", path: url.pathname, body: String(init?.body ?? "") });
          return new Response(JSON.stringify({ code: 200, message: "Success", data: { id: 5 } }), { status: 200 });
        }
      });
      const identifier = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
      await client.createCustomer({ identifier, email: "person@example.test", country });
      expect(sent).toEqual([{
        method: "POST", path: "/customer",
        body: customerForm({ identifier, email: "person@example.test", siteId: "4242", country }).toString()
      }]);
    }
  });
});

// X0's fixture of the order the stage form ACCEPTED, re-signed under the published test key. Skipped by name
// until the owner records it; P22's go-live checklist row 14 (docs/missions/2026-09-01-security-hardening/
// GO-LIVE-CHECKLIST.md) carries "all 26 required X0 kinds present and the X0 suites green".
const ACCEPTED_ORDER = resolve(import.meta.dirname, "../fixtures/xmoney/order-payload.json");
describe.runIf(existsSync(ACCEPTED_ORDER))("P3a — the order xMoney's stage accepted (X0 fixture)", () => {
  it("is reproduced byte for byte: payload and checksum", () => {
    const fixture = JSON.parse(readFileSync(ACCEPTED_ORDER, "utf8")) as {
      format: string; body: { order: XMoneyEmbeddedOrder }; testKeySignature: { payload: string; checksum: string };
    };
    expect(fixture.format).toBe("debateai.xmoney-fixture.v1");
    expect(signOrderPayload(fixture.body.order, Buffer.from("0123456789abcdef0123456789abcdef", "latin1")))
      .toEqual(fixture.testKeySignature);
  });
});
