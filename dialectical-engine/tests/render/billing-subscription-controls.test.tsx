// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { SubscriptionControls, type SubscriptionClient } from "../../apps/ui/components/billing/SubscriptionControls.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = new Date("2026-10-03T12:00:00.000Z");

/** P12b's BillingSubscriptionResponse.subscription, field for field (the schema is strict). */
function subscription(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "PLUS", status: "ACTIVE", cancel_requested: false, current_period_end: "2026-10-29T10:00:00.000Z",
    renews_on: "2026-10-29T10:00:00.000Z", renewal_total: "24.20", scheduled_downgrade_plan_id: null,
    // A Romanian window: it closes at midnight in Bucharest (UTC+3 in October), the end of October 13 there.
    withdrawal_open_until: "2026-10-13T21:00:00.000Z", withdrawal_last_day: "2026-10-13",
    can_upgrade: true, can_change_card: true, ...overrides
  };
}
const INVOICES = {
  invoices: [
    { number: "DBAI 0042", issued_on: "2026-10-01", total: "24.20", kind: "INVOICE", url: "https://quadernoapp.com/i/abc" },
    { number: "DBAI 0043", issued_on: "2026-10-02", total: "24.20", kind: "CREDIT_NOTE", url: null }
  ]
};
/** P8a's public plans list: the net prices the downgrade confirm names (ruling Q-7). */
const PLANS = {
  currency: "USD",
  plans: [
    { plan_id: "FREE", net_price: "0.00", allowance_vs_plus: "0.04" },
    { plan_id: "PLUS", net_price: "20.00", allowance_vs_plus: "1" },
    { plan_id: "PRO", net_price: "50.00", allowance_vs_plus: "4" },
    { plan_id: "MAX", net_price: "200.00", allowance_vs_plus: "30" }
  ]
};

let container: HTMLDivElement;
let root: Root;
let client: { [K in keyof SubscriptionClient]: ReturnType<typeof vi.fn> };

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = {
    getBillingSubscription: vi.fn(async () => ({ subscription: subscription() })),
    getBillingInvoices: vi.fn(async () => INVOICES),
    quoteSubscriptionUpgrade: vi.fn(), upgradeSubscription: vi.fn(), downgradeSubscription: vi.fn(async () => undefined),
    cancelSubscription: vi.fn(async () => undefined), revokeSubscriptionCancel: vi.fn(async () => undefined),
    withdrawSubscription: vi.fn(), stepUp: vi.fn(), getBillingCharge: vi.fn(),
    getBillingPlans: vi.fn(async () => PLANS)
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
}
async function render(): Promise<void> {
  await act(async () => {
    root.render(<SubscriptionControls catalog={billingEnglish} locale="en" client={client as unknown as SubscriptionClient} now={() => NOW} />);
  });
  await settle();
}
const text = (): string => container.textContent ?? "";
const button = (label: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
async function click(label: string): Promise<void> {
  await act(async () => { button(label)!.click(); });
  await settle();
}
async function fill(selector: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("P20 SubscriptionControls (S1)", () => {
  it("renders nothing while it asks, and nothing at all when billing is off, after ONE request", async () => {
    client.getBillingSubscription.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      root.render(<SubscriptionControls catalog={billingEnglish} locale="en" client={client as unknown as SubscriptionClient} now={() => NOW} />);
    });
    // Local mode and billing-off Settings must look exactly as today: no card, not even a "Checking…" line.
    expect(container.innerHTML).toBe("");
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockReset();
    client.getBillingSubscription.mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "Not found"));
    await render();
    expect(container.innerHTML).toBe("");
    expect(client.getBillingInvoices).not.toHaveBeenCalled();
  });

  it("says the plan, the renewal date and total, the actions, and the invoices", async () => {
    await render();
    expect(text()).toContain("Plan: Plus");
    expect(text()).toContain("Renews on October 29, 2026 for $24.20");
    for (const label of ["Change plan", "Cancel", "Withdraw"]) expect(button(label), label).toBeDefined();
    expect(container.querySelector('a[href="/settings/card"]')?.textContent).toBe("Update card");
    expect(text()).toContain("DBAI 0042 · October 1, 2026 · $24.20");
    expect(container.querySelector('a[href="https://quadernoapp.com/i/abc"]')?.textContent).toBe("Open");
    expect(text()).toContain("Credit note");
  });

  it("offers a card change only when the server allows one", async () => {
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ can_change_card: false }) });
    await render();
    expect(container.querySelector('a[href="/settings/card"]')).toBeNull();
  });

  it("cancels after a confirmation, then offers to undo it", async () => {
    await render();
    await click("Cancel");
    expect(text()).toContain("Cancel your plan? You keep it until October 29, 2026.");
    client.getBillingSubscription.mockResolvedValueOnce({
      subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null })
    });
    await click("Yes, cancel");
    expect(client.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Your plan ends on October 29, 2026. You won't be charged again.");
    await click("Undo cancellation");
    expect(client.revokeSubscriptionCancel).toHaveBeenCalledTimes(1);
  });

  it("withdraws through a fresh step-up, like account deletion", async () => {
    client.stepUp.mockResolvedValue({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: "G".repeat(43), action: "WITHDRAW_SUBSCRIPTION", expires_at: "2026-10-03T12:05:00.000Z" }
    });
    client.withdrawSubscription.mockResolvedValue({ refund: "18.00" });
    await render();
    await click("Withdraw");
    expect(text()).toContain("You can withdraw until October 13, 2026.");
    await fill("#billing-withdraw-password", "correct horse");
    await fill("#billing-withdraw-code", "123456");
    await click("Withdraw and refund");
    expect(client.stepUp).toHaveBeenCalledWith("correct horse", "123456", { action: "WITHDRAW_SUBSCRIPTION" });
    expect(client.withdrawSubscription).toHaveBeenCalledWith("G".repeat(43));
    expect(text()).toContain("Done. We refunded $18.00 to your card.");
  });

  it("words P12d's two other withdrawal answers: nothing due back, and a refund the owner settles (refund: null)", async () => {
    client.stepUp.mockResolvedValue({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: "G".repeat(43), action: "WITHDRAW_SUBSCRIPTION", expires_at: "2026-10-03T12:05:00.000Z" }
    });
    for (const [refund, sentence] of [
      ["0.00", "Done. Your plan has ended. The part you already used covers the whole price, so nothing was due back."],
      [null, "Your plan has ended. A refund was already made on one of your payments, so we'll check what is still due and email you within 14 days."]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      client.withdrawSubscription.mockResolvedValueOnce({ refund });
      await render();
      await click("Withdraw");
      await fill("#billing-withdraw-password", "correct horse");
      await fill("#billing-withdraw-code", "123456");
      await click("Withdraw and refund");
      expect(text(), String(refund)).toContain(sentence);
      expect(text(), String(refund)).not.toContain("$0.00");
      expect(text(), String(refund)).not.toContain("We refunded");
    }
  });

  it("refuses to withdraw without the right grant, and hides Withdraw once the window closed", async () => {
    client.stepUp.mockResolvedValue({ status: "step_up_complete", csrf_token: "c".repeat(43) });
    await render();
    await click("Withdraw");
    await fill("#billing-withdraw-password", "x");
    await fill("#billing-withdraw-code", "123456");
    await click("Withdraw and refund");
    expect(client.withdrawSubscription).not.toHaveBeenCalled();
    expect(text()).toContain("The withdrawal couldn't be completed.");
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ withdrawal_open_until: "2026-10-01T00:00:00.000Z", withdrawal_last_day: "2026-09-30" })
    });
    await render();
    expect(button("Withdraw")).toBeUndefined();
  });

  it("names the window's last day in the person's calendar, not the UTC day of its closing instant", async () => {
    // A Portuguese window in November closes at midnight Lisbon time (UTC+0) = 00:00 UTC of the day AFTER the last day.
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ withdrawal_open_until: "2026-11-16T00:00:00.000Z", withdrawal_last_day: "2026-11-15" })
    });
    await render();
    await click("Withdraw");
    expect(text()).toContain("You can withdraw until November 15, 2026.");
    expect(text()).not.toContain("November 16, 2026");
  });

  it("upgrades with a quote for the rest of the month, then waits for the server's charge state", async () => {
    const quoteRef = "22222222-2222-4222-8222-222222222222";
    client.quoteSubscriptionUpgrade.mockResolvedValue({
      quote_ref: quoteRef, plan_id: "PRO", net: "30.00", tax: "6.30", total: "36.30", tax_name: "TVA",
      tax_rate_basis_points: 2100, tax_country: "RO", recurring_total: "60.50",
      renews_on: "2026-10-29T10:00:00.000Z", expires_at: "2026-10-03T12:30:00.000Z"
    });
    client.upgradeSubscription.mockResolvedValue({
      charge_ref: "0123456789abcdef0123456789abcdef", state: "PENDING", reason_code: null
    });
    client.getBillingCharge.mockResolvedValue({ state: "SUCCEEDED", reason_code: null });
    await render();
    await click("Change plan");
    expect(button("Upgrade to Pro")).toBeDefined();
    expect(button("Upgrade to Max")).toBeDefined();
    await click("Upgrade to Pro");
    expect(client.quoteSubscriptionUpgrade).toHaveBeenCalledWith("PRO");
    // A7: $60.50 becomes the announced price the next renewal charges without a notice, so it is shown first.
    expect(text()).toContain(
      "Pay $36.30 now for the rest of this month. From October 29, 2026, Pro costs $60.50 a month, tax included, until you cancel."
    );
    await click("Upgrade and pay");
    expect(client.upgradeSubscription).toHaveBeenCalledWith("PRO", quoteRef);
    expect(text()).toContain("You're on Pro now.");
    expect(client.getBillingSubscription.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("offers no upgrade when the server says none is possible, and still offers the downgrades", async () => {
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "PRO", can_upgrade: false }) });
    await render();
    await click("Change plan");
    expect(button("Upgrade to Max")).toBeUndefined();
    expect(button("Move to Plus at renewal")).toBeDefined();
  });

  it("schedules a downgrade only after a confirm that names the lower plan's price (ruling Q-7), and says it is scheduled", async () => {
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "MAX" }) });
    await render();
    await click("Change plan");
    expect(button("Move to Pro at renewal")).toBeDefined();
    await click("Move to Plus at renewal");
    // The price is P8a's public net price, "+ tax", from the renewal date; nothing has changed yet.
    expect(client.getBillingPlans).toHaveBeenCalledTimes(1);
    expect(client.downgradeSubscription).not.toHaveBeenCalled();
    expect(text()).toContain("Move to Plus at your next renewal? It costs $20.00 a month + tax, from October 29, 2026.");
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ plan_id: "MAX", scheduled_downgrade_plan_id: "PLUS" })
    });
    await click("Yes, move to Plus");
    expect(client.downgradeSubscription).toHaveBeenCalledWith("PLUS");
    const paragraphs = [...container.querySelectorAll("p")].map((paragraph) => paragraph.textContent);
    expect(paragraphs).toContain("Done. You'll move to Plus on October 29, 2026, for $24.20 a month, tax included.");
    expect(paragraphs).toContain("You'll move to Plus on October 29, 2026.");
  });

  it("keeps the plan when the person steps back, and offers no confirm when the price cannot be read", async () => {
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "PRO" }) });
    await render();
    await click("Change plan");
    await click("Move to Plus at renewal");
    await click("Keep my plan");
    expect(text()).not.toContain("Move to Plus at your next renewal?");
    expect(client.downgradeSubscription).not.toHaveBeenCalled();
    client.getBillingPlans.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 503, "x"));
    await click("Change plan");
    await click("Move to Plus at renewal");
    expect(text()).toContain("The plans can't be shown right now. Please try again in a minute.");
    expect(button("Yes, move to Plus")).toBeUndefined();
    expect(client.downgradeSubscription).not.toHaveBeenCalled();
  });

  it("cancelling while a payment is failing says the plan ends now, and the card can still be changed", async () => {
    // The period that failed to renew ended on September 28: a date already past, never a promise.
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ status: "PAST_DUE", renews_on: null, renewal_total: null, current_period_end: "2026-09-28T10:00:00.000Z" })
    });
    await render();
    expect(container.querySelector('a[href="/settings/card"]')?.textContent).toBe("Update card");
    await click("Cancel");
    expect(text()).toContain("Cancel your plan? It ends now, and we stop trying to take the payment.");
    expect(text()).not.toContain("You keep it until");
    expect(text()).not.toContain("September 28, 2026");
  });

  it("during an outage at renewal (ruling Q-1) promises no past date, and a downgrade or a cancel names today", async () => {
    // NOW is October 3; the period ended on October 2 and the renewal is being retried quietly (up to 72 h).
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ plan_id: "PRO", current_period_end: "2026-10-02T10:00:00.000Z", renews_on: "2026-10-02T10:00:00.000Z" })
    });
    // INVOICES lists a credit note of October 2; no invoice here, so any "October 2, 2026" would be the promise.
    client.getBillingInvoices.mockResolvedValue({ invoices: [] });
    await render();
    expect(text()).not.toContain("Renews on October 2");
    expect(text()).toContain("We're processing your renewal. Your plan stays active meanwhile.");
    await click("Change plan");
    await click("Move to Plus at renewal");
    expect(text()).toContain("Move to Plus at your next renewal? It costs $20.00 a month + tax, from October 3, 2026.");
    await click("Keep my plan");
    await click("Cancel");
    expect(text()).toContain("Cancel your plan? You keep it until October 3, 2026.");
    expect(text()).not.toContain("October 2, 2026");
  });

  it("once the paid month is over, a pending cancel names today and offers no undo the server would refuse", async () => {
    // Between the period end and the next period-end sweep (at most 10 minutes) the plan still reads ACTIVE.
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null, current_period_end: "2026-10-02T10:00:00.000Z" })
    });
    client.getBillingInvoices.mockResolvedValue({ invoices: [] });
    await render();
    expect(button("Undo cancellation")).toBeUndefined();
    expect(button("Cancel")).toBeUndefined();
    expect(text()).toContain("Your plan ends on October 3, 2026.");
    expect(text()).not.toContain("October 2, 2026");
    expect(client.revokeSubscriptionCancel).not.toHaveBeenCalled();
  });

  it("a renewal postponed by a price notice still shows its future date, while a cancel names today", async () => {
    // RENEWAL_POSTPONED: the period ended on October 2, the renewal waits for the notice period until October 12.
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ current_period_end: "2026-10-02T10:00:00.000Z", renews_on: "2026-10-12T10:00:00.000Z" })
    });
    await render();
    expect(text()).toContain("Renews on October 12, 2026 for $24.20");
    expect(text()).not.toContain("We're processing your renewal.");
    await click("Cancel");
    // P12's requestCancelLocked ends a plan whose period end has passed today, so the confirm promises no more.
    expect(text()).toContain("Cancel your plan? You keep it until October 3, 2026.");
    expect(text()).not.toContain("You keep it until October 12, 2026");
  });

  it("says 'Nothing changed' only for a refusal made before any charge, and 'still confirming' when money may be moving", async () => {
    const quoteRef = "33333333-3333-4333-8333-333333333333";
    client.quoteSubscriptionUpgrade.mockResolvedValue({
      quote_ref: quoteRef, plan_id: "PRO", net: "30.00", tax: "6.30", total: "36.30", tax_name: "TVA",
      tax_rate_basis_points: 2100, tax_country: "RO", recurring_total: "60.50",
      renews_on: "2026-10-29T10:00:00.000Z", expires_at: "2026-10-03T12:30:00.000Z"
    });
    // [the failure, the sentence, whether the card reads the subscription again]
    for (const [failure, sentence, reloads] of [
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "QUOTE_EXPIRED"), "The payment for the upgrade didn't go through. Nothing changed.", false],
      // The plan may have changed in another tab: say so, and show the plan the server has now.
      [new ContractHttpError("UNPROCESSABLE", 422, "x", "UPGRADE_NOT_HIGHER"), "That plan isn't higher than your current plan. To move to a lower plan, choose it for your next renewal.", true],
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "UPGRADE_NOT_AVAILABLE_NOW"), "Your plan is about to renew, so an upgrade can't start right now. You can upgrade as soon as the renewal has gone through.", false],
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "ACCOUNT_ERASURE_PENDING"), "Your account is scheduled for deletion. Cancel the deletion in Settings to subscribe or change your plan.", false],
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "UPGRADE_IN_PROGRESS"), "Your last upgrade payment is still being confirmed. Please wait a few minutes and try again.", true],
      [new ContractHttpError("NETWORK_FAILURE", 0, "x"), "We're still confirming this with the payment provider.", true],
      [new ContractHttpError("SERVER_FAILURE", 503, "x"), "We're still confirming this with the payment provider.", true]
    ] as const) {
      const label = String(failure.serverCode ?? failure.status);
      act(() => root.unmount());
      root = createRoot(container);
      client.upgradeSubscription.mockRejectedValueOnce(failure);
      await render();
      const readsBefore = client.getBillingSubscription.mock.calls.length;
      await click("Change plan");
      await click("Upgrade to Pro");
      await click("Upgrade and pay");
      expect(text(), label).toContain(sentence);
      expect(client.getBillingSubscription.mock.calls.length > readsBefore, label).toBe(reloads);
      // Only the refusal made before any charge says "Nothing changed"; money may be moving in every other case.
      if (!sentence.includes("Nothing changed")) expect(text(), label).not.toContain("Nothing changed");
    }
  });

  it("words a refused upgrade quote and a refused downgrade by what the server said, before any money moves", async () => {
    for (const [failure, sentence] of [
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "UPGRADE_NOT_AVAILABLE_NOW"), "Your plan is about to renew, so an upgrade can't start right now."],
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "ACCOUNT_ERASURE_PENDING"), "Your account is scheduled for deletion."]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      client.quoteSubscriptionUpgrade.mockRejectedValueOnce(failure);
      await render();
      await click("Change plan");
      await click("Upgrade to Pro");
      expect(text(), failure.serverCode!).toContain(sentence);
      expect(button("Upgrade and pay"), failure.serverCode!).toBeUndefined();
      expect(client.upgradeSubscription).not.toHaveBeenCalled();
    }
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "MAX" }) });
    client.downgradeSubscription.mockRejectedValueOnce(new ContractHttpError("UNPROCESSABLE", 422, "x", "DOWNGRADE_NOT_LOWER"));
    await render();
    await click("Change plan");
    await click("Move to Pro at renewal");
    const readsBefore = client.getBillingSubscription.mock.calls.length;
    await click("Yes, move to Pro");
    expect(text()).toContain("That plan isn't lower than your current plan.");
    // The plan changed elsewhere: the card reads it again.
    expect(client.getBillingSubscription.mock.calls.length).toBeGreaterThan(readsBefore);
    // P12b's DOWNGRADE_NOT_AVAILABLE_NOW: the renewal charge is already written, so nothing was scheduled; say so,
    // never "try again" now, and keep the card as it is (the plan has not changed).
    act(() => root.unmount());
    root = createRoot(container);
    client.downgradeSubscription.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 409, "x", "DOWNGRADE_NOT_AVAILABLE_NOW"));
    await render();
    await click("Change plan");
    await click("Move to Pro at renewal");
    const readsBeforeRenewing = client.getBillingSubscription.mock.calls.length;
    await click("Yes, move to Pro");
    expect(text()).toContain("Your plan is renewing right now, so a change can't be scheduled yet. You can change it as soon as the renewal has gone through.");
    expect(text()).not.toContain("That didn't work. Please try again.");
    expect(client.getBillingSubscription.mock.calls.length).toBe(readsBeforeRenewing);
  });

  it("asks for the updated Terms first when D6b's routes answer LEGAL_REACCEPTANCE_REQUIRED, never 'try again'", async () => {
    const reaccept = "Please accept the updated Terms first, then come back to this page.";
    const refusal = () => new ContractHttpError("FORBIDDEN", 403, "x", "LEGAL_REACCEPTANCE_REQUIRED");
    // The upgrade quote (refused before any quote is priced).
    client.quoteSubscriptionUpgrade.mockRejectedValueOnce(refusal());
    await render();
    await click("Change plan");
    await click("Upgrade to Pro");
    expect(text()).toContain(reaccept);
    expect(button("Upgrade and pay")).toBeUndefined();
    // The upgrade itself.
    act(() => root.unmount());
    root = createRoot(container);
    client.quoteSubscriptionUpgrade.mockResolvedValueOnce({
      quote_ref: "44444444-4444-4444-8444-444444444444", plan_id: "PRO", net: "30.00", tax: "6.30", total: "36.30",
      tax_name: "TVA", tax_rate_basis_points: 2100, tax_country: "RO", recurring_total: "60.50",
      renews_on: "2026-10-29T10:00:00.000Z", expires_at: "2026-10-03T12:30:00.000Z"
    });
    client.upgradeSubscription.mockRejectedValueOnce(refusal());
    await render();
    await click("Change plan");
    await click("Upgrade to Pro");
    await click("Upgrade and pay");
    expect(text()).toContain(reaccept);
    expect(text()).not.toContain("still confirming");
    // The downgrade, after its price confirm.
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "MAX" }) });
    client.downgradeSubscription.mockRejectedValueOnce(refusal());
    await render();
    await click("Change plan");
    await click("Move to Pro at renewal");
    await click("Yes, move to Pro");
    expect(text()).toContain(reaccept);
    expect(text()).not.toContain("That didn't work.");
    // The undo of a cancel (P12b gates it: an undo commits the person to renew under the Terms in force).
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null })
    });
    client.revokeSubscriptionCancel.mockRejectedValueOnce(refusal());
    await render();
    await click("Undo cancellation");
    expect(text()).toContain(reaccept);
    expect(text()).not.toContain("That didn't work.");
  });

  it("W7: an undo refused while the account deletion is pending says so, never 'try again'", async () => {
    client.getBillingSubscription.mockResolvedValue({
      subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null })
    });
    client.revokeSubscriptionCancel.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 409, "x", "ACCOUNT_ERASURE_PENDING"));
    await render();
    await click("Undo cancellation");
    expect(text()).toContain(billingEnglish["billing.checkout.erasurePending"]);
    expect(text()).not.toContain("That didn't work.");
  });

  it("words a closed window, a spent confirmation and an unknown refund outcome, instead of blaming the password", async () => {
    client.stepUp.mockResolvedValue({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: "G".repeat(43), action: "WITHDRAW_SUBSCRIPTION", expires_at: "2026-10-03T12:05:00.000Z" }
    });
    for (const [failure, sentence] of [
      [new ContractHttpError("SERVER_FAILURE", 409, "x", "WITHDRAWAL_WINDOW_CLOSED"), "The 14-day withdrawal period has ended, or it doesn't apply where you live. You can still cancel at any time."],
      [new ContractHttpError("NETWORK_FAILURE", 0, "x"), "We're still confirming this with the payment provider."],
      // The password and code were right (the step-up succeeded); only the grant expired or was already used.
      [new ContractHttpError("FORBIDDEN", 403, "x", "STEP_UP_REQUIRED"), "Please confirm it's you again: that confirmation expired or was already used."]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      client.withdrawSubscription.mockRejectedValueOnce(failure);
      await render();
      await click("Withdraw");
      await fill("#billing-withdraw-password", "correct horse");
      await fill("#billing-withdraw-code", "123456");
      await click("Withdraw and refund");
      expect(text(), String(failure.serverCode ?? failure.status)).toContain(sentence);
      expect(text(), String(failure.serverCode ?? failure.status)).not.toContain("Check your password");
    }
    // A refused step-up (wrong password or code) is the one case that asks to check them.
    act(() => root.unmount());
    root = createRoot(container);
    client.stepUp.mockRejectedValueOnce(new ContractHttpError("SESSION_REQUIRED", 401, "x"));
    await render();
    await click("Withdraw");
    await fill("#billing-withdraw-password", "wrong");
    await fill("#billing-withdraw-code", "000000");
    await click("Withdraw and refund");
    expect(text()).toContain("Check your password and code, then try again.");
  });

  it("tells a person with a failed payment, and one without a plan, what is true", async () => {
    client.getBillingSubscription.mockResolvedValue({ subscription: subscription({ status: "PAST_DUE" }) });
    await render();
    expect(text()).toContain("Your last payment failed. You keep your plan while we try again.");
    expect(button("Change plan")).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(container);
    client.getBillingSubscription.mockResolvedValue({ subscription: null });
    client.getBillingInvoices.mockResolvedValue({ invoices: [] });
    await render();
    expect(text()).toContain("You're on the Free plan.");
    expect(container.querySelector('a[href="/pricing"]')?.textContent).toBe("Choose a plan");
    expect(text()).toContain("No invoices yet.");
  });

  it("words no plan from a failed first read: a 5xx, a network failure, a 401 or a 429 shows nothing and asks for no invoices", async () => {
    for (const failure of [
      new ContractHttpError("SERVER_FAILURE", 503, "x"),
      new ContractHttpError("NETWORK_FAILURE", 0, "x"),
      // Local mode: a dead session's 401 comes before billing-off's 404, so not even a billing heading may show.
      new ContractHttpError("SESSION_REQUIRED", 401, "x"),
      new ContractHttpError("RATE_LIMITED", 429, "x")
    ]) {
      const label = String(failure.status);
      act(() => root.unmount());
      root = createRoot(container);
      client.getBillingSubscription.mockReset();
      client.getBillingInvoices.mockClear();
      client.getBillingSubscription.mockRejectedValue(failure);
      await render();
      expect(container.innerHTML, label).toBe("");
      expect(client.getBillingInvoices, label).not.toHaveBeenCalled();
    }
  });

  it("keeps the plan just read when only the invoices fail, and never says 'No invoices yet.' or 'Free' for it", async () => {
    client.getBillingInvoices.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "x"));
    await render();
    expect(text()).toContain("Plan: Plus");
    expect(text()).toContain("That didn't work. Please try again.");
    for (const label of ["Change plan", "Cancel", "Withdraw"]) expect(button(label), label).toBeDefined();
    expect(text()).not.toContain("You're on the Free plan.");
    expect(text()).not.toContain("No invoices yet.");
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  it("keeps the last plan and invoices the server named when a later read fails", async () => {
    await render();
    client.getBillingSubscription.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 503, "x"));
    await click("Cancel");
    await click("Yes, cancel");
    expect(client.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Plan: Plus");
    expect(text()).toContain("That didn't work. Please try again.");
    expect(text()).toContain("DBAI 0042 · October 1, 2026 · $24.20");
    expect(text()).not.toContain("You're on the Free plan.");
  });
});
