import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startBillingStack, type BillingStack } from "../support/billingStack.js";

/**
 * W8 (P2-I12, the owner's ruling of 2 October 2026): billing mail follows the account's CURRENT email at the time of
 * sending. The person subscribes, changes their account email in Settings (turn 14's real service, which tells billing
 * nothing), and from then on the cancel link, the receipts and the invoice go to the new address, never the old one.
 * The address kept with the billing profile is used only after the account is erased
 * (tests/integration/billing-cancel-link.test.ts covers that side). CI skips integration suites: run this before every
 * merge that touches billing.
 */
let stack: BillingStack;

beforeAll(async () => { stack = await startBillingStack(); }, 600_000);
afterAll(async () => { await stack?.stop(); });

const ids = (mails: ReadonlyArray<{ templateId: string }>): string[] => mails.map((mail) => mail.templateId);

describe("W8 billing mail across an account email change", () => {
  it("sends the cancel link, the renewal receipt and the invoice to the new address, and nothing more to the old", async () => {
    const before = "before.change@example.test";
    const after = "after.change@example.test";
    const person = await stack.signUp(before, "DE");
    await stack.subscribe(person, "PLUS", "DE");
    expect(ids(stack.mailsTo(before))).toEqual(expect.arrayContaining(["M1", "M2_INVOICE_LINK"]));
    expect(stack.tax.sales.at(-1)!.customer.email).toBe(before);
    const sentToBefore = stack.mailsTo(before).length;

    await stack.changeEmail(person, after);

    // /cancel (Terms §12): the old address no longer names an account; the new one gets M9 at the new address.
    for (const email of [before, after]) {
      const asked = await stack.post(null, "/v1/billing/cancel-link", { email });
      expect([asked.status, asked.body]).toEqual([202, { status: "ACCEPTED" }]);
    }
    const m9 = await stack.waitForMail(after, "M9");
    expect(m9.params.cancelLinkUrl).toMatch(/\/cancel#token=[A-Za-z0-9_-]{43}$/u);

    // The renewal: its receipt and its Quaderno invoice carry the address the account has now.
    stack.advanceDays(31);
    await stack.runRenewals();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(ids(stack.mailsTo(after))).toEqual(["M9", "M2_INVOICE_LINK"]);
    expect(stack.tax.sales.at(-1)!.customer.email).toBe(after);

    // Nothing after the change reached the replaced address: not the link, not the receipt.
    expect(stack.mailsTo(before)).toHaveLength(sentToBefore);
  });
});
