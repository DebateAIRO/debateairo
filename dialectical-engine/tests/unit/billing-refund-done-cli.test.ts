import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseBillingRefundDoneEnvironment } from "@debateai/register";
import {
  parseRefundDoneArguments, renderRefundDonePlan, renderRefundDoneResult, runBillingRefundDoneCli, type RefundDoneArguments
} from "../../apps/api/src/billing/refund-done-cli.js";
import {
  disputeCommand, hostCommand, refundDoneCommand, refundHeldSteps, refundMailOf, refundReminderDue, renderOwnerRefundList,
  type OwnerRefundLine, type OwnerRefundPlan
} from "../../apps/api/src/billing/refunds.js";
import { chargebackLostSteps } from "../../apps/api/src/billing/verify-payment.js";
import { runbookBillingCommands } from "../support/runbookHostCommands.js";

const REF = "a".repeat(32);
/** F6a (ops-4): README §14.8's own form of an owner command on the host, as the API's user with the API's EnvironmentFile. */
const ON_HOST = "systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api"
  + " --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm";
const DAY = 86_400_000;
const output = () => {
  const lines = { out: "", err: "" };
  return { lines, sink: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};
const plan = (extra: Partial<OwnerRefundPlan> = {}): OwnerRefundPlan => ({
  chargeId: REF, providerPaymentId: "ntp-12345", reason: "WITHDRAWAL", currency: "USD", amountMicros: 5_000_000,
  openMicros: 12_100_000, restMicros: 7_100_000, mail: null, despiteChargeback: false, ...extra
});

describe("N14 the refund-done command (spec §2.12.2 item 4)", () => {
  it("accepts --charge <32 hex> --amount <decimal> and an optional --confirm, in any order", () => {
    expect(parseRefundDoneArguments(["--charge", REF, "--amount", "12.10"]))
      .toEqual({ chargeRef: REF, amountMicros: 12_100_000, confirm: false, despiteChargeback: false });
    expect(parseRefundDoneArguments(["--confirm", "--amount", "5", "--charge", REF]))
      .toEqual({ chargeRef: REF, amountMicros: 5_000_000, confirm: true, despiteChargeback: false });
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

  it("takes --despite-chargeback at most once, in any position, and hands it to the plan (ruling PR-41)", async () => {
    expect(parseRefundDoneArguments(["--despite-chargeback", "--charge", REF, "--amount", "1.00"]))
      .toEqual({ chargeRef: REF, amountMicros: 1_000_000, confirm: false, despiteChargeback: true });
    expect(parseRefundDoneArguments(["--charge", REF, "--despite-chargeback", "--amount", "1.00", "--confirm"]))
      .toEqual({ chargeRef: REF, amountMicros: 1_000_000, confirm: true, despiteChargeback: true });
    expect(parseRefundDoneArguments(["--charge", REF, "--amount", "1.00", "--confirm", "--despite-chargeback"]))
      .toEqual({ chargeRef: REF, amountMicros: 1_000_000, confirm: true, despiteChargeback: true });
    for (const args of [["--despite-chargeback", "--charge", REF, "--amount", "1", "--despite-chargeback"],
      ["--charge", REF, "--amount", "1", "--despite-chargeback", "--despite-chargeback"], ["--despite-chargeback"]]) {
      expect(() => parseRefundDoneArguments(args), args.join(" ")).toThrow("BILLING_REFUND_DONE_USAGE");
    }
    const twice = output();
    expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "1", "--despite-chargeback", "--despite-chargeback"], twice.sink, vi.fn())).toBe(2);
    expect(twice.lines.err).toBe("BILLING_REFUND_DONE_USAGE\n");

    const held = output();
    const refuse = vi.fn(async () => ({
      plan: async () => { throw new TypeError("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK"); }, record: vi.fn(), close: async () => undefined
    }));
    expect(await runBillingRefundDoneCli(["--charge", REF, "--amount", "1.00", "--confirm"], held.sink, refuse)).toBe(1);
    expect(held.lines.err).toBe("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK\n");
    expect(held.lines.out).toBe("");

    const asked: RefundDoneArguments[] = [];
    const record = vi.fn(async () => "RECORDED" as const);
    const despite = output();
    const open = vi.fn(async () => ({
      plan: async (input: RefundDoneArguments) => { asked.push(input); return plan({ amountMicros: 12_100_000, restMicros: 0, despiteChargeback: true }); },
      record, close: async () => undefined
    }));
    expect(await runBillingRefundDoneCli(["--despite-chargeback", "--charge", REF, "--amount", "12.10", "--confirm"], despite.sink, open)).toBe(0);
    expect(asked).toEqual([{ chargeRef: REF, amountMicros: 12_100_000, confirm: true, despiteChargeback: true }]);
    expect(record).toHaveBeenCalledWith({ chargeRef: REF, amountMicros: 12_100_000, confirm: true, despiteChargeback: true });
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
      `  ${ON_HOST} billing:refund-done --charge ${REF} --amount 12.10`,
      `- charge ${"b".repeat(32)}, NETOPIA payment ntp-2: refund 24.20 USD (the whole payment), reason SUBSCRIPTION_ENDED, open since 2026-10-01`,
      `  ${ON_HOST} billing:refund-done --charge ${"b".repeat(32)} --amount 24.20`
    ].join("\n"));
    expect(refundDoneCommand(REF, 5_000_000)).toBe(`${ON_HOST} billing:refund-done --charge ${REF} --amount 5.00`);
  });

  it("F6a (ops-4): gives the runbook's own host command, without --confirm, so the owner sees the preview first", () => {
    const command = refundDoneCommand(REF, 12_100_000);
    expect(command).toBe("systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api"
      + " --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine"
      + ` /usr/bin/pnpm billing:refund-done --charge ${REF} --amount 12.10`);
    expect(command).not.toContain("--confirm");
    // The same form, paths included, as README §14.8's preview line (its read-in values in place of ours).
    const runbook = readFileSync(fileURLToPath(new URL("../../deploy/vps/README.md", import.meta.url)), "utf8");
    expect(runbook).toContain(`${command.replace(`--charge ${REF} --amount 12.10`, '--charge "$CHARGE_REF" --amount "$AMOUNT"')}\n`);
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

// F8 (ruling PR-56, decision 5): the O3s that name an owner command print README §14.8's host form, each on its own
// line, as ops-4 made the O2 emails do; a bare `pnpm …` fails in a root shell (no settings) and skips the preview.
describe("F8 the owner commands in O3 emails are the runbook's host form", () => {
  const runbook = readFileSync(fileURLToPath(new URL("../../deploy/vps/README.md", import.meta.url)), "utf8");
  const PAYMENT = "ntp-7300312";

  it("hostCommand gives any owner command as the runbook runs it on the host (billing:check, its whole line)", () => {
    expect(hostCommand("billing:check")).toBe(`${ON_HOST} billing:check`);
    expect(runbookBillingCommands()).toContain(hostCommand("billing:check"));
    expect(runbook.split("\n")).toContain(hostCommand("billing:check"));
  });

  it("prints billing:dispute as the runbook runs it (it records at once: there is no preview to run first)", () => {
    for (const outcome of ["won", "lost"] as const) {
      const command = disputeCommand(REF, outcome);
      expect(command).toBe(`${ON_HOST} billing:dispute --charge ${REF} --outcome ${outcome}`);
      expect(runbook).toContain(`${command.replace(`--charge ${REF} --outcome ${outcome}`, '--charge "$CHARGE_REF" --outcome "$OUTCOME"')}\n`);
    }
    expect(runbook.split("\n").filter((line) => line.includes("/usr/bin/pnpm billing:dispute") && line.includes("--confirm"))).toEqual([]);
  });

  it("O3 REFUND_HELD_BY_CHARGEBACK: the dispute command, and the refund-done preview first, then --confirm", () => {
    const steps = (pausedEmailQueued: boolean) => refundHeldSteps({
      chargeId: REF, currency: "USD", paymentId: PAYMENT, reason: "WITHDRAWAL", openMicros: 12_100_000, pausedEmailQueued
    });
    const refundDone = `${ON_HOST} billing:refund-done --charge ${REF} --amount 12.10 --despite-chargeback`;
    expect(steps(false)).toBe([
      `A refund of 12.10 USD (reason WITHDRAWAL) was due on this payment (NETOPIA payment ${PAYMENT}), and NETOPIA now`
        + " reports a charge-back on it: the person's bank is taking the money back. Do not refund it in NETOPIA's admin;"
        + " the site no longer lists it as due.",
      "If the dispute ends for us, record that as root on the server with the command below (it records at once): the"
        + " refund is then due again and comes back into the reminder. If it ends for the person, nothing is left to refund.",
      `  ${ON_HOST} billing:dispute --charge ${REF} --outcome won`,
      "If you had already refunded it in NETOPIA's admin before the dispute, record that refund as root on the server"
        + " with the command below: run it once to see what it records, then again with --confirm added at the end to"
        + " record it. Then tell NETOPIA, so the dispute is answered.",
      `  ${refundDone}`
    ].join("\n"));
    expect(steps(true)).toContain("taking the money back. The customer was emailed that the plan is paused (M10). Do not refund");
    // The preview line is README §14.8's own (its read-in values in place of ours), with the flag the held row names.
    expect(runbook).toContain(`${refundDone.replace(`--charge ${REF} --amount 12.10 --despite-chargeback`, '--charge "$CHARGE_REF" --amount "$AMOUNT"')}\n`);
    expect(steps(false)).not.toMatch(/(^|[^/])pnpm billing:|--confirm --|--despite-chargeback --confirm/u);
  });

  it("O3 CHARGEBACK_LOST (the owner's decision of 24 October 2026): what happened, no command, and the accountant's storno question", () => {
    const head = `NETOPIA reports that the person's bank took back this payment (NETOPIA payment ${PAYMENT}): the dispute on it`
      + " is lost (status 10). ";
    const storno = "Ask your accountant whether a cancelling invoice (storno) is needed for this payment.";
    const tail = `No command is needed.\n${storno}`;
    const base = { chargeId: REF, paymentId: PAYMENT, heldRefund: null, releasedRefund: null } as const;
    expect(chargebackLostSteps({ ...base, ended: true })).toBe(head
      + "The site has ended the plan, the person is on Free, and the customer was emailed that the plan has ended"
      + " (M10_ENDED).\n" + tail);
    const unchanged = chargebackLostSteps({ ...base, ended: false });
    expect(unchanged).toBe(head
      + "No plan changed: the payment bought nothing, or its plan had already ended, was not active, or its dispute"
      + " was already recorded.\n" + tail);
    // No held or released refund: nothing to run, in either form.
    expect(unchanged).not.toContain("billing:");
  });

  it("O3 CHARGEBACK_LOST with a held refund (reviewer I-1): nothing left to refund, unless it was already refunded: then the host-form refund-done --despite-chargeback", () => {
    const held = chargebackLostSteps({
      chargeId: REF, paymentId: PAYMENT, ended: true, releasedRefund: null,
      heldRefund: { openMicros: 12_100_000, currency: "USD", reason: "WITHDRAWAL" }
    });
    expect(held).toContain("(M10_ENDED).\n" + [
      "A refund of 12.10 USD (reason WITHDRAWAL) was held on this payment because of the dispute. The bank has taken the"
        + " money back, so nothing is left to refund: do not refund it in NETOPIA's admin.",
      "If you had already refunded this payment in NETOPIA's admin before the dispute, the person got the money twice:"
        + " record your refund with the command below and tell NETOPIA, so they can answer the bank.",
      `  ${ON_HOST} billing:refund-done --charge ${REF} --amount 12.10 --despite-chargeback`,
      "Run it as root on the server once to see what it records, then again with --confirm added at the end to record it.",
      "No command is needed unless you had already refunded it.",
      "Ask your accountant whether a cancelling invoice (storno) is needed for this payment."
    ].join("\n"));
    expect(held).not.toContain("No command is needed.");
    expect(held).not.toMatch(/(^|[^/])pnpm billing:|--despite-chargeback --confirm/u);
  });

  it("O3 CHARGEBACK_LOST after a dispute recorded won (reviewer M-2): the released refund, the plan not ended, and no command that ends it", () => {
    const released = { openMicros: 12_100_000, currency: "USD", reason: "WITHDRAWAL" };
    const notEnded = chargebackLostSteps({ chargeId: REF, paymentId: PAYMENT, ended: false, heldRefund: null, releasedRefund: released });
    expect(notEnded).toBe(`NETOPIA reports that the person's bank took back this payment (NETOPIA payment ${PAYMENT}): the`
      + " dispute on it is lost (status 10). No plan changed: the payment bought nothing, or its plan had already ended,"
      + " was not active, or its dispute was already recorded.\n" + [
      "This dispute was recorded as won earlier, but NETOPIA now reports it lost: the plan was not ended. Check the payment"
        + " in NETOPIA's admin before making the released refund, and end the plan by hand if the bank kept the money.",
      "No owner command ends it: billing:dispute --outcome lost answers that the dispute is already settled once it was"
        + " recorded won.",
      "Ask your accountant whether a cancelling invoice (storno) is needed for this payment."
    ].join("\n"));
    expect(notEnded).not.toContain("No command is needed");
    expect(notEnded).not.toContain("held on this payment");
    // A won call that left the plan SUSPENDED (RESOLVED_AFTER_END) lets the 10 end it: the plan clause is left out.
    const ended = chargebackLostSteps({ chargeId: REF, paymentId: PAYMENT, ended: true, heldRefund: null, releasedRefund: released });
    expect(ended).toContain("(M10_ENDED).\nThis dispute was recorded as won earlier, but NETOPIA now reports it lost. Check the"
      + " payment in NETOPIA's admin before making the released refund.\nAsk your accountant");
    expect(ended).not.toContain("the plan was not ended");
  });
});
