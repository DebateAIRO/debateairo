// tests/unit/payments-xmoney-signing.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aesKeyFromPrivateKey,
  decryptNotice,
  signOrderPayload,
  xmoneyEnvironmentOf,
  type XMoneyEmbeddedOrder
} from "@debateai/payments-xmoney";
import { recordingOrder, signRecordingOrder } from "../../tools/billing/xmoney-sandbox.js";

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

// X0's fixture of the order the stage form ACCEPTED, re-signed under the published test key. Skipped by name
// until the owner records it; P23's checklist carries "all 25 required X0 kinds present and the X0 suites green".
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
