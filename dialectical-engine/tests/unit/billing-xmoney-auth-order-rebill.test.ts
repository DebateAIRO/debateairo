// tests/unit/billing-xmoney-auth-order-rebill.test.ts
// W14 (P2-I3): a card change (A12) makes a 1.00 `auth` order the subscription's order, and every later renewal and
// upgrade rebills it. Whether such a rebill captures money or only holds it is X0's recorded answer: the helper
// releases the rebill and reads the status after (`void-ok` is a released hold, `refund-ok` a refunded capture), the
// fake follows the answer it is given, and P3b's recorded suite compares the two.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { XMoneyClient, signOrderPayload } from "@debateai/payments-xmoney";
import { XMONEY_REQUIRED_FIXTURE_KINDS } from "../../tools/billing/scrub-xmoney-fixture.js";
import { authOrderRebillAnswer, releaseCapture } from "../../tools/billing/xmoney-sandbox.js";
import { startFakeXMoney, type FakeXMoneyOptions } from "../support/fake-xmoney.js";

describe("W14 X0 (h) records whether a rebill of the card check's order captures money (P2-I3)", () => {
  it("reads the released rebill's status as a hold, a capture, or an answer nobody can act on", () => {
    expect(authOrderRebillAnswer("void-ok")).toBe("HOLD");
    expect(authOrderRebillAnswer("refund-ok")).toBe("CAPTURED");
    // Anything else (still complete-ok after the release, a refused release, a cancel) settles nothing: the recorded
    // suite then fails, and the owner reports the line.
    for (const status of ["complete-ok", "cancel-ok", "complete-failed", "in-progress", "NONE", ""]) {
      expect(authOrderRebillAnswer(status), status).toBe("UNKNOWN");
    }
  });

  it("captures each release under its own required kind, so the two releases never collide in the scrubber", () => {
    expect(releaseCapture("card-check")).toEqual({ before: "transaction-auth", after: "transaction-auth-released" });
    // The rebill's own read is already captured by `rebill --as auth-order`; only the status after its release is new.
    expect(releaseCapture("auth-order-rebill")).toEqual({ before: null, after: "transaction-rebill-auth-order-released" });
    for (const kind of ["transaction-auth", "transaction-auth-released", "transaction-rebill-auth-order-released"]) {
      expect(XMONEY_REQUIRED_FIXTURE_KINDS as readonly string[], kind).toContain(kind);
    }
    expect(() => releaseCapture("renewal")).toThrow("XMONEY_ARGUMENT_REQUIRED:--as");
  });
});

describe("W14 the fake rebills an auth-mode order the way X0 recorded it (P2-I3)", () => {
  async function rebillTheCardCheckOrder(options: FakeXMoneyOptions, mode: "auth" | "authAndCapture" = "auth") {
    const fake = await startFakeXMoney(options);
    try {
      const client = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId });
      const identifier = randomBytes(16).toString("hex");
      const { customerId } = await client.createCustomer({ identifier, email: "person@example.test", country: "RO" });
      const signed = signOrderPayload({
        publicKey: fake.publicKey, siteId: fake.siteId, customer: { identifier, email: "person@example.test", country: "RO" },
        order: { orderId: randomBytes(16).toString("hex"), type: "managed", amount: "1.00", currency: "USD", description: "Card check" },
        cardTransactionMode: mode, saveCard: true, backUrl: "https://debateai.test/settings/card"
      }, fake.privateKey);
      const first = await fake.completeSignedOrder({ orderPayload: signed.payload, orderChecksum: signed.checksum, cardCountry: "RO", succeed: true });
      await client.refund({ transactionId: first.transactionId, amountDecimal: null, reason: "customer-demand", message: "card check" });
      const rebilled = await client.rebill({ orderId: first.orderId, customerId, amountDecimal: "1.00" });
      const paid = (await client.getTransaction(rebilled.transactionId)).status;
      const booked = fake.transactions.get(rebilled.transactionId)!.mode;
      await client.refund({ transactionId: rebilled.transactionId, amountDecimal: null, reason: "customer-demand", message: "x0" });
      const released = (await client.getTransaction(rebilled.transactionId)).status;
      return { paid, booked, released, answer: authOrderRebillAnswer(released) };
    } finally {
      await fake.stop();
    }
  }

  it("captures by default: what A12 assumes until X0 says otherwise", async () => {
    expect(await rebillTheCardCheckOrder({})).toEqual({
      paid: "complete-ok", booked: "authAndCapture", released: "refund-ok", answer: "CAPTURED"
    });
    expect(await rebillTheCardCheckOrder({ authOrderRebill: "capture" })).toMatchObject({ answer: "CAPTURED" });
  });

  it("only holds when X0 recorded a hold: complete-ok alike, and told apart only by its release", async () => {
    // A hold and a capture both read complete-ok, which is why VERIFY_PAYMENT cannot tell them apart.
    expect(await rebillTheCardCheckOrder({ authOrderRebill: "hold" })).toEqual({
      paid: "complete-ok", booked: "auth", released: "void-ok", answer: "HOLD"
    });
  });

  it("never changes a rebill of an order that was paid in full", async () => {
    expect(await rebillTheCardCheckOrder({ authOrderRebill: "hold" }, "authAndCapture"))
      .toMatchObject({ booked: "authAndCapture", released: "refund-ok", answer: "CAPTURED" });
  });
});
