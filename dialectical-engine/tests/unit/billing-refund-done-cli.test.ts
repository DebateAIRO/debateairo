import { describe, expect, it, vi } from "vitest";
import { parseBillingRefundDoneEnvironment } from "@debateai/register";
import {
  parseRefundDoneArguments, renderRefundDonePlan, renderRefundDoneResult, runBillingRefundDoneCli, type RefundDoneArguments
} from "../../apps/api/src/billing/refund-done-cli.js";
import {
  refundDoneCommand, refundMailOf, refundReminderDue, renderOwnerRefundList, type OwnerRefundLine, type OwnerRefundPlan
} from "../../apps/api/src/billing/refunds.js";

const REF = "a".repeat(32);
const DAY = 86_400_000;
const output = () => {
  const lines = { out: "", err: "" };
  return { lines, sink: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};
const plan = (extra: Partial<OwnerRefundPlan> = {}): OwnerRefundPlan => ({
  chargeId: REF, providerPaymentId: "ntp-12345", reason: "WITHDRAWAL", currency: "USD", amountMicros: 5_000_000,
  openMicros: 12_100_000, restMicros: 7_100_000, mail: null, ...extra
});

describe("N14 the refund-done command (spec §2.12.2 item 4)", () => {
  it("accepts --charge <32 hex> --amount <decimal> and an optional --confirm, in any order", () => {
    expect(parseRefundDoneArguments(["--charge", REF, "--amount", "12.10"]))
      .toEqual({ chargeRef: REF, amountMicros: 12_100_000, confirm: false });
    expect(parseRefundDoneArguments(["--confirm", "--amount", "5", "--charge", REF]))
      .toEqual({ chargeRef: REF, amountMicros: 5_000_000, confirm: true });
    for (const args of [[], ["--charge", REF], ["--charge", "xyz", "--amount", "1.00"], ["--charge", REF, "--amount", "0"],
      ["--charge", REF, "--amount", "-1"], ["--charge", REF, "--amount", "1.001"], ["--charge", REF, "--amount", "abc"],
      ["--charge", REF, "--amount", "1", "--confirm", "--confirm"], ["--charge", REF, "--amount", "1", "--extra", "x"]]) {
      expect(() => parseRefundDoneArguments(args), args.join(" ")).toThrow("BILLING_REFUND_DONE_USAGE");
    }
  });

  it("prints what it would record and what the email will say, and records only with --confirm", async () => {
    const preview = renderRefundDonePlan(plan(), false);
    expect(preview).toContain(`Charge ${REF}, NETOPIA payment ntp-12345: record a refund of 5.00 USD (reason WITHDRAWAL).`);
    expect(preview).toContain("Open before: 12.10 USD. Still open after: 7.10 USD.");
    expect(preview).toContain("No email yet: the customer's email and the credit note follow when the rest is recorded.");
    expect(preview).toContain("Nothing was recorded. Run the same command with --confirm to record it.");
    const closing = renderRefundDonePlan(plan({ amountMicros: 12_100_000, restMicros: 0, mail: { template: "M8", text: "Your Plus plan has ended, and we refunded $12.10 to your card." } }), true);
    expect(closing).toContain("The customer's email (M8) will say:\n  Your Plus plan has ended, and we refunded $12.10 to your card.");
    expect(closing).not.toContain("Nothing was recorded");
    expect(renderRefundDoneResult("RECORDED", plan({ restMicros: 0 }))).toBe(`Recorded. The refund on charge ${REF} is complete; the customer's email and the credit note follow.\n`);
    expect(renderRefundDoneResult("PART_RECORDED", plan())).toBe(`Recorded 5.00 USD on charge ${REF}. 7.10 USD is still open and stays in the owner's reminders.\n`);
    expect(renderRefundDoneResult("ALREADY_RECORDED", plan())).toBe(`The refund on charge ${REF} was already recorded; nothing was written.\n`);

    const record = vi.fn(async () => "PART_RECORDED" as const);
    const open = vi.fn(async () => ({ plan: async (_: RefundDoneArguments) => plan(), record, close: async () => undefined }));
    const dry = output();
    expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "5.00"], dry.sink, open)).toBe(0);
    expect(record).not.toHaveBeenCalled();
    expect(dry.lines.out).toContain("Nothing was recorded.");
    const confirmed = output();
    expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "5.00", "--confirm"], confirmed.sink, open)).toBe(0);
    expect(record).toHaveBeenCalledTimes(1);
    expect(confirmed.lines.out).toContain("7.10 USD is still open");
  });

  it("exits 2 on bad usage and 1 with ONE code on a refusal", async () => {
    const usage = output();
    expect(await runBillingRefundDoneCli(["--charge"], usage.sink, vi.fn())).toBe(2);
    expect(usage.lines.err).toBe("BILLING_REFUND_DONE_USAGE\n");
    for (const code of ["BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM", "BILLING_REFUND_DONE_NO_OPEN_REQUEST", "BILLING_REFUND_DONE_EXCEEDS_REQUEST"]) {
      const refused = output();
      const open = vi.fn(async () => ({
        plan: async () => { throw new TypeError(code); }, record: async () => "RECORDED" as const, close: async () => undefined
      }));
      expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "1.00", "--confirm"], refused.sink, open)).toBe(1);
      expect(refused.lines.err).toBe(`${code}\n`);
    }
    const crashed = output();
    const open = vi.fn(async () => ({ plan: async () => { throw new Error("connection string postgres://x"); }, record: vi.fn(), close: async () => undefined }));
    expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "1.00"], crashed.sink, open)).toBe(1);
    expect(crashed.lines.err).toBe("BILLING_REFUND_DONE_FAILED\n");
  });

  it("reads NETOPIA's base URL from the API's EnvironmentFile, and refuses to start without it", () => {
    const base = { DATABASE_URL: "postgres://api@127.0.0.1/debateai", NODE_ENV: "test", REGISTER_VERSION: "3" };
    expect(parseBillingRefundDoneEnvironment({ ...base, NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com" }).NETOPIA_API_BASE_URL)
      .toBe("https://secure-sandbox.netopia-payments.com");
    expect(() => parseBillingRefundDoneEnvironment(base)).toThrow();
  });
});

describe("N14 the owner's refund reminders (spec §2.12.2 item 3)", () => {
  const requestedAt = new Date("2026-10-01T09:00:00Z");
  it("is due on the day the refund became due, then every third day", () => {
    const line = { requestedAt, deadline: null };
    const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 6));
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => refundReminderDue(line, day(n)))).toEqual([true, false, false, true, false, false, true]);
  });

  it("is due every day from three days before a withdrawal's deadline, and after it", () => {
    const deadline = new Date("2026-10-15T09:00:00Z");
    const line = { requestedAt, deadline };
    expect(refundReminderDue(line, new Date("2026-10-11T06:00:00Z"))).toBe(false);
    expect(refundReminderDue(line, new Date("2026-10-12T10:00:00Z"))).toBe(true);
    expect(refundReminderDue(line, new Date("2026-10-14T06:00:00Z"))).toBe(true);
    expect(refundReminderDue(line, new Date("2026-10-17T06:00:00Z"))).toBe(true);
  });

  it("lists each refund with its exact command and what NETOPIA shows", () => {
    const lines: OwnerRefundLine[] = [
      { chargeId: REF, providerPaymentId: "ntp-1", reason: "WITHDRAWAL", currency: "USD", openMicros: 12_100_000, whole: false,
        requestedAt, deadline: new Date("2026-10-15T09:00:00Z"), seenRefunded: true },
      { chargeId: "b".repeat(32), providerPaymentId: "ntp-2", reason: "SUBSCRIPTION_ENDED", currency: "USD", openMicros: 24_200_000,
        whole: true, requestedAt, deadline: null, seenRefunded: false }
    ];
    expect(renderOwnerRefundList(lines)).toBe([
      `- charge ${REF}, NETOPIA payment ntp-1: refund 12.10 USD (part of the payment), reason WITHDRAWAL, open since 2026-10-01, withdrawal deadline 2026-10-15T09:00:00.000Z, NETOPIA shows a refund: only the command is missing`,
      `  pnpm billing:refund-done --charge ${REF} --amount 12.10 --confirm`,
      `- charge ${"b".repeat(32)}, NETOPIA payment ntp-2: refund 24.20 USD (the whole payment), reason SUBSCRIPTION_ENDED, open since 2026-10-01`,
      `  pnpm billing:refund-done --charge ${"b".repeat(32)} --amount 24.20 --confirm`
    ].join("\n"));
    expect(refundDoneCommand(REF, 5_000_000)).toBe(`pnpm billing:refund-done --charge ${REF} --amount 5.00 --confirm`);
  });

  it("names the customer's follow-up email of each reason, and none for a card check", () => {
    expect(refundMailOf("WITHDRAWAL")).toBe("M8");
    expect(refundMailOf("CARD_COUNTRY_BLOCKED")).toBe("M11");
    for (const reason of ["ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "DUPLICATE_PAYMENT", "UPGRADE_CLOSED"] as const) {
      expect(refundMailOf(reason), reason).toBe("M11_DUPLICATE");
    }
    for (const reason of ["CARD_CHECK_RELEASE", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE"] as const) {
      expect(refundMailOf(reason), reason).toBeNull();
    }
  });
});
