import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAIL_ATTACHMENT_FACTS,
  MAIL_LOCALES,
  MAIL_TEMPLATES,
  MAIL_TEMPLATE_IDS,
  MailTemplateError,
  TERMS_ATTACHMENT_FILENAME,
  WITHDRAWAL_FORM_ATTACHMENT_FILENAME,
  loadMailCatalogues,
  mailAttachmentFactsOf,
  renderMail,
  renderWithdrawalForm,
  type MailAttachmentFact,
  type MailTemplateId
} from "@debateai/mail-templates";

const SAMPLE: Readonly<Record<string, string>> = Object.freeze({
  plan: "PLUS",
  totalAmount: "24.20",
  refundAmount: "12.10",
  renewDate: "2026-10-29",
  chargeDate: "2026-10-29T10:00:00.000Z",
  retryDate: "2026-10-30",
  accessEndDate: "2026-10-29",
  cancelPageUrl: "https://dezbatere.ro/cancel",
  termsUrl: "https://dezbatere.ro/terms",
  invoiceUrl: "https://quadernoapp.com/i/abc123",
  cardPageUrl: "https://dezbatere.ro/settings/card",
  pricingUrl: "https://dezbatere.ro/pricing",
  settingsUrl: "https://dezbatere.ro/settings",
  cancelLinkUrl: `https://dezbatere.ro/cancel#token=${"A".repeat(43)}`,
  withdrawalDays: "14",
  canUndo: "true",
  paused: "true",
  ownerSettled: "true",
  notRequested: "true",
  otherSystem: "true",
  bankDeclined: "true",
  confirmCard: "true",
  paymentAlert: "true",
  cardExpiring: "true",
  endedPlan: "PRO",
  invoiceNumber: "DBAI 0042",
  quarter: "2026-Q4",
  summaryText: "RO  net 100.00  tax 21.00\nDE  net 50.00  tax 9.50",
  chargeRef: "0123456789abcdef0123456789abcdef",
  reasonCode: "PAYMENT_CONFIGURATION_REFUSED",
  withdrawalDate: "2026-10-12T08:30:00.000Z",
  refundDeadline: "2026-10-26T08:30:00.000Z",
  refundReason: "WITHDRAWAL",
  ownerRef: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93",
  jobKind: "SMARTBILL_INVOICE",
  reference: "charge 0123456789abcdef0123456789abcdef",
  receivedAt: "2026-10-06T18:00:00.000Z",
  paymentRef: "ntp-1234567890",
  currency: "USD",
  whole: "true",
  doneCommand: "pnpm billing:refund-done --charge 0123456789abcdef0123456789abcdef --amount 12.10 --confirm",
  refundCount: "2",
  refundList: "- charge 0123456789abcdef0123456789abcdef, NETOPIA payment ntp-1: refund 12.10 USD (part of the payment)\n  pnpm billing:refund-done --charge 0123456789abcdef0123456789abcdef --amount 12.10 --confirm",
  nextSteps: "SmartBill never confirmed it: look for it in SmartBill; if it is there, record it with pnpm billing:invoice"
    + " --charge 0123456789abcdef0123456789abcdef --kind INVOICE --record <series>-<number>"
});

/** Every param a template declares, the optional ones included. */
function paramsFor(id: MailTemplateId): Record<string, string> {
  const template = MAIL_TEMPLATES[id];
  return Object.fromEntries(Object.keys({ ...template.params, ...(template.optional ?? {}) }).map((name) => {
    const value = SAMPLE[name];
    if (value === undefined) throw new Error(`no sample for ${name}`);
    return [name, value];
  }));
}

/** The other branch of every param condition: optional params left out, flags "false", amounts "0.00". */
function variantFor(id: MailTemplateId): Record<string, string> {
  return Object.fromEntries(Object.entries(MAIL_TEMPLATES[id].params).map(([name, kind]) => [
    name, kind === "flag" ? "false" : kind === "amount" ? "0.00" : SAMPLE[name]!
  ]));
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof MailTemplateError) return error.code;
    throw error;
  }
  throw new Error("expected a MailTemplateError");
}

/** A catalogue sentence's longest stretch without a placeholder: what a rendered email must (or must not) contain. */
const longestFixedPart = (sentence: string): string =>
  sentence.split(/\{[A-Za-z][A-Za-z0-9_]*\}/u).map((part) => part.trim()).sort((a, b) => b.length - a.length)[0]!;

const NOTHING: ReadonlySet<MailAttachmentFact> = new Set();
const EVERYTHING: ReadonlySet<MailAttachmentFact> = new Set(MAIL_ATTACHMENT_FACTS);

describe("P17 renderMail", () => {
  it("renders every template in every locale, with and without its attachments and on both sides of each param condition, with no placeholder left and no remote resource", () => {
    for (const id of MAIL_TEMPLATE_IDS) {
      for (const locale of MAIL_LOCALES) {
        for (const params of [paramsFor(id), variantFor(id)]) {
          for (const attached of [NOTHING, EVERYTHING]) {
            const mail = renderMail(id, locale, params, { attached });
            for (const part of [mail.subject, mail.text, mail.html]) {
              expect(part, `${id}/${locale}`).not.toMatch(/\{[A-Za-z][A-Za-z0-9_]*\}/);
            }
            expect(mail.subject, `${id}/${locale}`).not.toMatch(/[\r\n]/);
            expect(mail.html, `${id}/${locale}`).not.toMatch(/<img|src=|url\(|http:\/\//i);
            for (const [name, kind] of Object.entries(MAIL_TEMPLATES[id].params)) {
              if (kind === "url") expect(mail.html, `${id}/${locale}`).toContain(`<a href="${SAMPLE[name]}">`);
            }
          }
        }
      }
    }
  });

  it("formats the English confirmation email in plain words", () => {
    const mail = renderMail("M1", "en", paramsFor("M1"));
    expect(mail.subject).toBe("Your Plus plan is active");
    expect(mail.text).toContain(
      "You pay $24.20 a month, tax included. The plan renews on October 29, 2026 and then every month until you cancel."
    );
    expect(mail.text).toContain("https://dezbatere.ro/cancel");
    expect(mail.text).toContain("you may withdraw within 14 days");
    expect(mail.text).toContain("DebateAIRO S.R.L.");
    expect(mail.html).toMatch(/^<!doctype html>\n<html lang="en" dir="ltr">/);
  });

  it("says the accepted Terms are attached only when they are, and never calls the current page the accepted version", () => {
    const linked = renderMail("M1", "en", paramsFor("M1"));
    expect(linked.text).toContain("Our current Terms are online at https://dezbatere.ro/terms");
    expect(linked.text).not.toContain("The Terms you accepted");
    const attached = renderMail("M1", "en", paramsFor("M1"), { attached: new Set(["TERMS_TEXT"]) });
    expect(attached.text).toContain("The Terms you accepted are attached. The latest version is always at https://dezbatere.ro/terms");
    expect(attached.text).not.toContain("Our current Terms");
    // The page online may change after this email; the email must not say it shows the version accepted.
    expect(attached.text).not.toMatch(/also online|same as the|accepted are online/u);
  });

  it("offers the withdrawal right and its form only where it exists (withdrawalDays is optional, P9b)", () => {
    const { withdrawalDays: _days, ...noRight } = paramsFor("M1");
    const without = renderMail("M1", "en", noRight).text;
    expect(without).not.toContain("withdraw");
    expect(without).not.toContain("withdrawal form");
    expect(without).toContain("You pay $24.20 a month, tax included.");
    expect(renderMail("M1", "en", paramsFor("M1")).text).toContain("The model withdrawal form is attached to this email.");
    expect(codeOf(() => renderMail("M1", "en", { ...paramsFor("M1"), withdrawalDays: "fourteen" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
  });

  it("offers the undo only while the plan still runs (a cancel while a payment is failing ends it at once)", () => {
    // A plan that is not paused: M7 as it was before P2-W10's optional flag (an M7 queued before it carries none).
    const { paused: _paused, ...notPaused } = paramsFor("M7");
    const running = renderMail("M7", "en", notPaused).text;
    expect(running).toContain("You keep your Plus plan until October 29, 2026. You will not be charged again.");
    expect(running).toContain("Changed your mind? You can undo this in Settings before that date: https://dezbatere.ro/settings");
    const ended = renderMail("M7", "en", { ...notPaused, canUndo: "false" }).text;
    expect(ended).toContain("Your Plus plan ended on October 29, 2026. You will not be charged again.");
    expect(ended).toContain("You can choose a plan again at any time in Settings: https://dezbatere.ro/settings");
    expect(ended).not.toContain("undo");
    expect(ended).not.toContain("You keep your");
    // D6b's P12b also ends an ACTIVE plan at once (after the paid month's end, or inside the renewal's lead): the
    // sentence names no reason, so it never claims a payment failed.
    expect(ended).not.toMatch(/fail|renew/iu);
    expect(codeOf(() => renderMail("M7", "en", { ...notPaused, canUndo: "yes" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    const { canUndo: _flag, ...withoutFlag } = notPaused;
    expect(codeOf(() => renderMail("M7", "en", withoutFlag))).toBe("MAIL_TEMPLATE_PARAM_MISSING");
    expect(renderMail("M7", "en", { ...notPaused, paused: "false" }).text).toBe(running);
  });

  it("tells a person who cancels a plan paused by a dispute that it won't renew, with no undo line, in every locale (P2-W10)", () => {
    const paused = { ...paramsFor("M7"), paused: "true", canUndo: "false" };
    const english = renderMail("M7", "en", paused).text;
    expect(english).toContain(
      "Your Plus plan won't renew, and you won't be charged again. Its paid features stay paused while the payment"
      + " dispute is open. If the dispute ends in your favour, you can use them until October 29, 2026."
    );
    expect(english).not.toContain("undo");
    expect(english).not.toContain("You keep your");
    expect(english).not.toContain("ended on");
    expect(MAIL_TEMPLATES.M7.optional).toEqual({ paused: "flag" });
    // In every locale: the paused sentence first, then the "choose a plan" line; never the undo, "until" or "ended"
    // sentence. The text is the greeting, the paragraphs, the sign-off and the footer, one blank line apart.
    const catalogues = loadMailCatalogues();
    const { paused: _flag, ...notPaused } = paused;
    for (const locale of MAIL_LOCALES) {
      const [, first, second] = renderMail("M7", locale, paused).text.split("\n\n");
      const [, until, undo] = renderMail("M7", locale, { ...notPaused, canUndo: "true" }).text.split("\n\n");
      const [, endedNow, again] = renderMail("M7", locale, notPaused).text.split("\n\n");
      expect(first, `${locale} paused`).toContain(longestFixedPart(catalogues[locale]["mail.M7.paused"]!));
      expect(first, locale).not.toMatch(/\{[A-Za-z][A-Za-z0-9_]*\}/u);
      expect([until, endedNow], `${locale} first paragraph`).not.toContain(first);
      expect(second, `${locale} no undo line`).not.toBe(undo);
      expect(second, `${locale} second paragraph`).toBe(again);
    }
  });

  it("opens M5A–C with a sentence true in every case, and names the bank only when the bank declined (W10, P2-I21)", () => {
    const first = "We couldn't take this month's payment for your Plus plan. You keep your plan while we try again.";
    for (const id of ["M5A", "M5B", "M5C"] as const) {
      // An outage past Q-1's 72 hours, our own refused key, an unknown outcome or a tax service that stayed down: no
      // bank was asked, so no sentence blames one.
      // N11: `confirmCard` (AUTHENTICATION_REQUIRED) is left "false" here; its own sentence is pinned in
      // tests/unit/billing-netopia-renewal-rules.test.ts.
      const ours = renderMail(id, "en", { ...paramsFor(id), bankDeclined: "false", confirmCard: "false" }).text;
      expect(ours, id).toContain(`Hello,\n\n${first}\n\n`);
      expect(ours, id).not.toMatch(/bank/iu);
      // PAYMENT_DECLINED: the same first sentence, then the bank's refusal.
      const declined = renderMail(id, "en", { ...paramsFor(id), bankDeclined: "true", confirmCard: "false" }).text;
      expect(declined, id).toContain(`Hello,\n\n${first}\n\nYour bank refused the payment.\n\n`);
      expect(MAIL_TEMPLATES[id].params.bankDeclined, id).toBe("flag");
      const { bankDeclined: _flag, ...withoutFlag } = paramsFor(id);
      expect(codeOf(() => renderMail(id, "en", withoutFlag)), id).toBe("MAIL_TEMPLATE_PARAM_MISSING");
    }
    // In every locale the bank's refusal is a sentence of its own, never folded into the first one.
    const catalogues = loadMailCatalogues();
    for (const locale of MAIL_LOCALES) {
      const catalogue = catalogues[locale];
      expect(catalogue["mail.M5.refused"], locale).toBeUndefined();
      expect(catalogue["mail.M5.notTaken"], locale).toBeDefined();
      expect(catalogue["mail.M5.notTaken"], locale).not.toContain(catalogue["mail.M5.bankRefused"]!);
    }
  });

  it("says in M11 that the plan ended only when a refused renewal or upgrade ended it (W10, P2-M9)", () => {
    const refunded = "We can't accept cards issued in that card's country, so the $12.10 taken or held on it goes back to your card in full.";
    const ended = renderMail("M11", "en", { refundAmount: "12.10", endedPlan: "PRO" }).text;
    expect(ended).toContain(
      `${refunded}\n\nBecause of this, your Pro plan has ended and your account is now on the Free plan. Your debates are kept.`
    );
    // A checkout's payment (its plan never started) and an older queued M11 carry no endedPlan: the email as before.
    const checkout = renderMail("M11", "en", { refundAmount: "12.10" }).text;
    expect(checkout).toContain(refunded);
    expect(checkout).not.toMatch(/ended|Free/u);
    expect(MAIL_TEMPLATES.M11.optional).toEqual({ endedPlan: "plan" });
  });

  it("says a withdrawal with nothing due back refunded nothing, and never shows $0.00 as a refund", () => {
    // RefundDesk's and P12d's M8 carry no `ownerSettled` (P2-M7's flag is the owner's 0.00/0.00 settlement's alone).
    const { ownerSettled: _settled, ...withdrawal } = paramsFor("M8");
    expect(renderMail("M8", "en", withdrawal).text).toContain("we refunded $12.10 to your card");
    const nothing = renderMail("M8", "en", { ...withdrawal, refundAmount: "0.00" }).text;
    expect(nothing).toContain("Your Plus plan has ended. The part you already used covers the whole price, so nothing was due back to you.");
    expect(nothing).not.toContain("refunded");
    expect(nothing).not.toContain("$0.00");
  });

  it("says only that nothing more is due when the owner settles a withdrawal at 0.00 and 0.00, in every locale (P2-M7)", () => {
    const settled = renderMail("M8", "en", { plan: "PLUS", refundAmount: "0.00", ownerSettled: "true" }).text;
    expect(settled).toContain("Your Plus plan has ended, and nothing more is due back to you.");
    // The money had usually gone back already (a dashboard refund): never "the part you already used covers it".
    expect(settled).not.toContain("covers the whole price");
    expect(settled).not.toContain("$0.00");
    // A settlement with money due keeps today's sentence; so does every M8 the flag is not given to.
    expect(renderMail("M8", "en", { plan: "PLUS", refundAmount: "12.10", ownerSettled: "true" }).text)
      .toContain("Your Plus plan has ended, and we refunded $12.10 to your card.");
    expect(renderMail("M8", "en", { plan: "PLUS", refundAmount: "0.00", ownerSettled: "false" }).text)
      .toContain("The part you already used covers the whole price");
    expect(MAIL_TEMPLATES.M8.optional).toEqual({ ownerSettled: "flag" });
    const catalogues = loadMailCatalogues();
    for (const locale of MAIL_LOCALES) {
      const text = renderMail("M8", locale, { plan: "PLUS", refundAmount: "0.00", ownerSettled: "true" }).text;
      expect(text, locale).not.toMatch(/\{[A-Za-z][A-Za-z0-9_]*\}/u);
      expect(text, `${locale} nothingMoreDue`).toContain(longestFixedPart(catalogues[locale]["mail.M8.nothingMoreDue"]!));
      expect(text, `${locale} nothingDue`).not.toContain(longestFixedPart(catalogues[locale]["mail.M8.nothingDue"]!));
    }
  });

  it("says the Romanian invoice is attached only when the PDF is, and otherwise where to find it", () => {
    const params = paramsFor("M2_INVOICE_ATTACHED");
    expect(renderMail("M2_INVOICE_ATTACHED", "en", params, { attached: new Set(["INVOICE_PDF"]) }).text)
      .toContain("Your invoice DBAI 0042 is attached to this email.");
    const missing = renderMail("M2_INVOICE_ATTACHED", "en", params).text;
    expect(missing).toContain("Your invoice number is DBAI 0042. It is listed in Settings, under Subscription.");
    expect(missing).not.toContain("is attached");
  });

  it("derives the facts from what a message really carries", () => {
    expect([...mailAttachmentFactsOf([])]).toEqual([]);
    expect([...mailAttachmentFactsOf([
      { filename: TERMS_ATTACHMENT_FILENAME, contentType: "text/plain; charset=UTF-8" },
      { filename: WITHDRAWAL_FORM_ATTACHMENT_FILENAME, contentType: "text/plain; charset=UTF-8" }
    ])]).toEqual(["TERMS_TEXT"]);
    expect([...mailAttachmentFactsOf([{ filename: "DBAI-0042.pdf", contentType: "application/pdf" }])]).toEqual(["INVOICE_PDF"]);
    // A text file that is not the Terms, or a PDF named like the Terms, proves neither sentence.
    expect([...mailAttachmentFactsOf([{ filename: TERMS_ATTACHMENT_FILENAME, contentType: "application/pdf" }])]).toEqual(["INVOICE_PDF"]);
  });

  it("M11's subject and refund sentence never name a plan or the Free plan (a checkout's plan never started), and M11_DUPLICATE keeps its own subject", () => {
    const catalogues = loadMailCatalogues();
    for (const locale of MAIL_LOCALES) {
      const catalogue = catalogues[locale];
      const free = catalogue["mail.plan.FREE"]!.toLocaleLowerCase(locale);
      for (const key of ["mail.M11.subject", "mail.M11.refunded"]) {
        expect(catalogue[key]!.toLocaleLowerCase(locale), `${locale}:${key}`).not.toContain(free);
        expect(catalogue[key], `${locale}:${key}`).not.toMatch(/\{plan\}/u);
      }
    }
    // In every locale the localized Free name is checked above; the product names are checked on the English
    // (a translation may use "Pro" as an ordinary word, as Czech and Slovak do).
    const english = catalogues.en;
    for (const key of ["mail.M11.subject", "mail.M11.refunded"]) {
      expect(english[key], key).not.toMatch(/\b(?:Free|Plus|Pro|Max)\b/u);
    }
    const refused = renderMail("M11", "en", paramsFor("M11"));
    expect(refused.subject).toBe("We couldn't accept your card");
    expect(refused.subject).not.toContain("refunded your payment");
    expect(refused.text).toContain("the $12.10 taken or held on it goes back to your card in full.");
    expect(renderMail("M11_DUPLICATE", "en", paramsFor("M11_DUPLICATE")).subject).toBe("We refunded your payment");
    expect(MAIL_TEMPLATES.M11_DUPLICATE.subject).not.toBe(MAIL_TEMPLATES.M11.subject);
  });

  it("reads no catalogue when the package is imported, only on the first render", () => {
    // P17: apps/api imports this package in every mode, so a bad catalogue or owner edit must never stop its boot.
    const source = readFileSync(resolve("packages/mail-templates/src/render.ts"), "utf8");
    const moduleLevel = source.split("\n").filter((line) => /^(?:export\s+)?(?:const|let|var)\s/u.test(line));
    expect(moduleLevel.filter((line) => /loadMailCatalogues\(|readStringTable\(/u.test(line))).toEqual([]);
    expect(() => loadMailCatalogues(resolve("packages/mail-templates"))).toThrow("MAIL_TEMPLATE_CATALOGUE_INVALID");
  });

  it("writes Arabic and Hebrew right to left, and falls back to English for an unknown locale", () => {
    expect(renderMail("M9", "ar", paramsFor("M9")).html).toContain('<html lang="ar" dir="rtl">');
    expect(renderMail("M9", "he", paramsFor("M9")).html).toContain('<html lang="he" dir="rtl">');
    expect(renderMail("M9", "xx", paramsFor("M9"))).toEqual(renderMail("M9", "en", paramsFor("M9")));
  });

  it("renders the owner's summary in English whatever locale is asked", () => {
    const owner = renderMail("O1", "ro", paramsFor("O1"));
    expect(owner.subject).toBe("DebateAI tax summary for 2026-Q4");
    expect(owner.text).toContain("RO  net 100.00  tax 21.00\nDE  net 50.00  tax 9.50");
    expect(owner.html).toContain("<pre");
  });

  it("tells the owner at once, in English, which refund could not be completed (ruling Q-5's O2)", () => {
    const owner = renderMail("O2", "de", { ...paramsFor("O2"), notRequested: "false", otherSystem: "false" });
    expect(owner.subject).toBe("A refund could not be completed and needs your attention");
    expect(owner.text).toContain("Charge reference: 0123456789abcdef0123456789abcdef");
    expect(owner.text).toContain("Amount to refund: $12.10");
    expect(owner.text).toContain("Reason code: PAYMENT_CONFIGURATION_REFUSED");
    expect(owner.html).toContain('<html lang="en" dir="ltr">');
    // Owner-facing, never a customer's data: the charge id, the amount and the code are all it carries, plus P2-I5's
    // flag, which only picks the sentences and is never printed.
    expect(Object.keys(MAIL_TEMPLATES.O2.params).sort()).toEqual(["chargeRef", "notRequested", "reasonCode", "refundAmount"]);
    expect(MAIL_TEMPLATES.O2.params.notRequested).toBe("flag");
    expect(codeOf(() => renderMail("O2", "en", { ...paramsFor("O2"), reasonCode: "X\nY" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
  });

  it("keeps O2 for a refund NETOPIA refused as it was before P2-I5's flag, in NETOPIA's words (N23)", () => {
    // W9's optional reason and deadline and P2-W4's other-system flag left out: the render of every O2 queued before them.
    const { refundReason: _reason, refundDeadline: _deadline, otherSystem: _other, ...before } = paramsFor("O2");
    const refused = renderMail("O2", "en", { ...before, notRequested: "false" });
    // The five sentences of ruling Q-5's O2, in order (compared with the render before the flag existed; N23 put the
    // intro and the next step in NETOPIA's words).
    expect(refused.text.startsWith([
      "Hello,",
      "A refund we asked for could not be completed: NETOPIA refused it, or its outcome stayed unknown after every retry. No more tries are made by themselves.",
      "Charge reference: 0123456789abcdef0123456789abcdef",
      "Amount to refund: $12.10",
      "Reason code: PAYMENT_CONFIGURATION_REFUSED",
      "Check this payment in NETOPIA's admin and settle the refund by hand there. The owner summary lists it until then.",
      "The DebateAI team"
    ].join("\n\n"))).toBe(true);
    expect(refused.subject).toBe("A refund could not be completed and needs your attention");
  });

  it("names a dead withdrawal refund's reason, its legal deadline and how to settle it so M8 follows (W9, P2-M8)", () => {
    const dead = renderMail("O2", "en", { ...paramsFor("O2"), notRequested: "false", otherSystem: "false" });
    expect(dead.text).toContain("Reason code: PAYMENT_CONFIGURATION_REFUSED\n\nRefund reason: WITHDRAWAL\n\n");
    expect(dead.text).toContain(
      "This is a withdrawal refund: the law requires it to be made by October 26, 2026 at the latest (14 days after"
      + " the withdrawal). First look at this payment in NETOPIA's admin. If it already shows a refund of $12.10, an"
      + " earlier attempt went through: do not refund again. If it shows none, refund exactly $12.10 on this payment, in"
      + " one refund. A refund of the whole payment is recorded by the site itself; for part of a payment, record it"
      + " with pnpm billing:refund-done once it is made. The customer's refund email (M8) then follows by itself."
    );
    // W9 fix round 1 (F1): NETOPIA's admin is checked first, and the amount is exact: a refund over it is in no record
    // (recordRefunded records the request's amount), so the email never asks for "at least" an amount.
    expect(dead.text).not.toContain("at least");
    expect(dead.html).not.toContain("at least");
    // The reason alone (another refund than a withdrawal's): no deadline sentence.
    const { refundDeadline: _deadline, ...other } = paramsFor("O2");
    const refusedCard = renderMail("O2", "en", {
      ...other, refundReason: "CARD_COUNTRY_BLOCKED", notRequested: "false", otherSystem: "false"
    }).text;
    expect(refusedCard).toContain("Refund reason: CARD_COUNTRY_BLOCKED");
    expect(refusedCard).not.toContain("withdrawal");
    expect(Object.keys(MAIL_TEMPLATES.O2.optional ?? {}).sort()).toEqual(["otherSystem", "refundDeadline", "refundReason"]);
  });

  it("tells the owner at once of a withdrawal they must settle by hand, with its deadline (W9, P2-I11)", () => {
    const owner = renderMail("O2_WITHDRAWAL", "ro", { ...paramsFor("O2_WITHDRAWAL"), reasonCode: "WITHDRAWAL_BY_OWNER" });
    expect(owner.subject).toBe("A withdrawal needs you to settle its refund by hand");
    expect(owner.html).toContain('<html lang="en" dir="ltr">');
    expect(owner.text.startsWith([
      "Hello,",
      "A customer withdrew from their plan, and the plan has ended. A refund made in NETOPIA's admin, or an"
        + " earlier refund request, already touched one of their payments, so the site could not work out what is still"
        + " due. Nothing has been refunded for this withdrawal yet.",
      "Owner reference: 0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93",
      "Reason code: WITHDRAWAL_BY_OWNER",
      "Withdrawn on October 12, 2026. The law requires the refund to be made by October 26, 2026 at the latest (14"
        + " days after the withdrawal).",
      "Work out what is still due as the runbook describes (\"A withdrawal sent by email or on the model form\"),"
        + " refund in NETOPIA's admin what the site cannot, then record the settlement with pnpm billing:withdraw"
        + " --owner 0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93 --refund <amount> --dashboard <amount>. The customer's refund"
        + " email (M8) follows. The owner summary lists it as WITHDRAWAL_BY_OWNER until then.",
      "The DebateAI team"
    ].join("\n\n"))).toBe(true);
    // Owner-facing: the owner reference, the code and two dates; never a customer's name, email or card.
    expect(Object.keys(MAIL_TEMPLATES.O2_WITHDRAWAL.params).sort())
      .toEqual(["ownerRef", "reasonCode", "refundDeadline", "withdrawalDate"]);
  });

  it("tells the owner at once of a legal document or an email that was never sent, and what to do (W12, P2-I16)", () => {
    const { paymentAlert: _alert, ...deadJob } = paramsFor("O3");
    const owner = renderMail("O3", "de", { ...deadJob, reasonCode: "INVOICE_UNKNOWN" });
    expect(owner.subject).toBe("Billing needs your attention (INVOICE_UNKNOWN)");
    expect(owner.html).toContain('<html lang="en" dir="ltr">');
    expect(owner.html).toContain("<pre");
    expect(owner.text.startsWith([
      "Hello,",
      // F4: true beside the M3 line ("the renewal waits and sends the notice again"), which can be in the same O3.
      "A job that issues an invoice or a credit note, or that sends an email, stopped after its last try. That job is not"
        + " tried again by itself; only the notice of a changed renewal amount (M3) is sent again, by the renewal.",
      "Job: SMARTBILL_INVOICE",
      "Reference: charge 0123456789abcdef0123456789abcdef",
      "Reason code: INVOICE_UNKNOWN",
      "SmartBill never confirmed it: look for it in SmartBill; if it is there, record it with pnpm billing:invoice"
        + " --charge 0123456789abcdef0123456789abcdef --kind INVOICE --record <series>-<number>",
      "The owner summary (pnpm billing:tax-summary, and the quarterly email) lists it until it is settled.",
      "The DebateAI team"
    ].join("\n\n"))).toBe(true);
    // Owner-facing: a job kind, our own reference, a code and the steps; never a customer's name, email or card.
    expect(Object.keys(MAIL_TEMPLATES.O3.params).sort()).toEqual(["jobKind", "nextSteps", "reasonCode", "reference"]);
  });

  it("acknowledges a withdrawal at once, saying only what has happened (W9, P2-I11's M8_RECEIVED)", () => {
    const refunding = renderMail("M8_RECEIVED", "en", paramsFor("M8_RECEIVED"));
    expect(refunding.subject).toBe("We've received your withdrawal");
    expect(refunding.text).toContain("We received your withdrawal from your Plus plan on October 12, 2026. Your plan has ended.");
    expect(refunding.text).toContain("We're refunding $12.10 to your card and will email you again when it's done.");
    // Never "refunded" before the money moved: M8 says that, after the refund.
    expect(refunding.text).not.toMatch(/refunded|confirmed/u);
    const { refundAmount: _amount, ...byOwner } = paramsFor("M8_RECEIVED");
    const review = renderMail("M8_RECEIVED", "en", byOwner).text;
    expect(review).toContain("We received your withdrawal from your Plus plan on October 12, 2026. Your plan has ended.");
    expect(review).toContain(
      "A refund was already made on one of your payments, so we'll check what is still due and email you within 14 days."
    );
    expect(review).not.toContain("We're refunding");
    expect(MAIL_TEMPLATES.M8_RECEIVED.subject).not.toBe(MAIL_TEMPLATES.M8.subject);
    expect(renderMail("M8_RECEIVED", "ro", paramsFor("M8_RECEIVED")).subject).toBe("Am primit retragerea dumneavoastră");
  });

  it("never asks the owner to refund a job the charge records no request for (P2-I5's REFUND_NOT_REQUESTED)", () => {
    const forged = renderMail("O2", "en", { ...paramsFor("O2"), reasonCode: "REFUND_NOT_REQUESTED", notRequested: "true" });
    expect(forged.subject).toBe("A refund could not be completed and needs your attention");
    for (const part of [forged.text, forged.html]) {
      expect(part).not.toContain("NETOPIA refused");
      expect(part).not.toContain("Amount to refund");
      expect(part).not.toContain("settle the refund by hand");
    }
    expect(forged.text).toContain("Charge reference: 0123456789abcdef0123456789abcdef");
    expect(forged.text).toContain("Reason code: REFUND_NOT_REQUESTED");
    // The four things it must say: nothing was sent; it matches no request we hold; the amount is only the job's;
    // something able to write to the billing database queued it, so whoever runs the server checks the requests.
    expect(forged.text).toContain("stopped before anything was sent to NETOPIA");
    expect(forged.text).toContain("it does not match any refund request our records hold for this payment");
    expect(forged.text).toContain("Amount the job named: $12.10. This is only the job's own figure, not a refund to make.");
    expect(forged.text).toContain("Something able to write to the billing database queued it, so tell whoever runs the server.");
    expect(forged.text).toContain("They check this charge's own refund requests: a request that was never refunded is still owed.");
  });

  it("tells the owner a refund job of another payment system sent nothing and is owed nothing here (P2-W4)", () => {
    // RefundDesk sends the flag and neither the reason nor the deadline (C2: the scope's English, the default).
    const { refundReason: _reason, refundDeadline: _deadline, ...base } = paramsFor("O2");
    const other = renderMail("O2", "en", { ...base, reasonCode: "OTHER_PAYMENT_SYSTEM", notRequested: "false", otherSystem: "true" });
    expect(other.subject).toBe("A refund could not be completed and needs your attention");
    expect(other.text.startsWith([
      "Hello,",
      "A refund job was stopped before anything was sent: the payment it names was taken in another payment system than"
        + " the one this server uses (the previous card processor, or NETOPIA's sandbox or live). No money moved.",
      "Charge reference: 0123456789abcdef0123456789abcdef",
      "Amount to refund: $12.10",
      "Reason code: OTHER_PAYMENT_SYSTEM",
      "Nothing is owed on this server. If it was a real customer's payment in the other system, refund it in that"
        + " system's admin; a sandbox test payment needs nothing. The owner summary lists it as REFUND_OTHER_SYSTEM.",
      "The DebateAI team"
    ].join("\n\n"))).toBe(true);
    for (const part of [other.text, other.html]) {
      expect(part).not.toContain("NETOPIA refused");
      expect(part).not.toContain("settle the refund by hand");
      // No deadline paragraph, and never "M8 follows by itself": this API never sees the other system's refunds.
      expect(part).not.toContain("the law requires");
      expect(part).not.toContain("M8");
      expect(part).not.toContain("A refund job was stopped before anything was sent to NETOPIA: it does not match");
    }
    // The flag off (or left out, as in every O2 queued before it) keeps the refused wording; notRequested still wins.
    const refused = renderMail("O2", "en", { ...base, notRequested: "false", otherSystem: "false" }).text;
    expect(refused).toContain("A refund we asked for could not be completed: NETOPIA refused it");
    expect(refused).not.toContain("another payment system");
    const forged = renderMail("O2", "en", { ...base, notRequested: "true" }).text;
    expect(forged).toContain("it does not match any refund request our records hold for this payment");
    expect(forged).not.toContain("another payment system");
    expect(MAIL_TEMPLATES.O2.optional?.otherSystem).toBe("flag");
  });

  it("refuses missing, unknown, reserved and malformed params with a code and no value", () => {
    const m1 = paramsFor("M1");
    const { plan: _plan, ...withoutPlan } = m1;
    expect(codeOf(() => renderMail("M1", "en", withoutPlan))).toBe("MAIL_TEMPLATE_PARAM_MISSING");
    expect(codeOf(() => renderMail("M1", "en", { ...m1, extra: "x" }))).toBe("MAIL_TEMPLATE_PARAM_UNKNOWN");
    expect(codeOf(() => renderMail("M1", "en", { ...m1, merchantName: "x" }))).toBe("MAIL_TEMPLATE_PARAM_UNKNOWN");
    expect(codeOf(() => renderMail("M1", "en", { ...m1, termsUrl: "http://secret.example/terms" })))
      .toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderMail("M1", "en", { ...m1, totalAmount: "24.2" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderMail("M1", "en", { ...m1, plan: "GOLD" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderMail("M2_INVOICE_ATTACHED", "en", {
      ...paramsFor("M2_INVOICE_ATTACHED"), invoiceNumber: "1\r\nBcc: x@example.test"
    }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderMail("NOPE" as MailTemplateId, "en", {}))).toBe("MAIL_TEMPLATE_UNKNOWN");
    try {
      renderMail("M1", "en", { ...m1, termsUrl: "http://secret.example/terms" });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("escapes every value in the HTML part", () => {
    const mail = renderMail("M2_INVOICE_ATTACHED", "en", {
      ...paramsFor("M2_INVOICE_ATTACHED"), invoiceNumber: "<b>1</b>"
    });
    expect(mail.html).toContain("&lt;b&gt;1&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>1</b>");
    expect(mail.text).toContain("<b>1</b>");
  });

  it("renders the model withdrawal form with the company (COMPANY's facts, through SELLER_COMPANY) filled in", () => {
    const english = renderWithdrawalForm("en");
    expect(english).toContain("Model withdrawal form");
    expect(english).toContain("To: DebateAIRO S.R.L.");
    expect(renderWithdrawalForm("ro")).not.toBe(english);
    expect(renderWithdrawalForm("xx")).toBe(english);
  });

  it("N9/N10: speaks of a payment, not of a dead job, when O3 carries paymentAlert", () => {
    const owner = renderMail("O3", "en", {
      jobKind: "PAYMENT_NOTICE", reference: "notice 0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", reasonCode: "NOTICE_PARSE_FAILED",
      nextSteps: "Report the code.", paymentAlert: "true"
    });
    expect(owner.subject).toBe("Billing needs your attention (NOTICE_PARSE_FAILED)");
    expect(owner.text).toContain("A payment needs your attention. Nothing more was charged, and the customer was not emailed about it.");
    expect(owner.text).toContain("This email is sent once for this reference and reason within the hour.");
    expect(owner.text).not.toContain("A job that issues an invoice");
    expect(Object.keys(MAIL_TEMPLATES.O3.optional ?? {})).toEqual(["paymentAlert"]);
  });

  it("N9: tells the owner at once that NETOPIA's message about an open charge could not be verified (O4)", () => {
    const owner = renderMail("O4", "ro", paramsFor("O4"));
    expect(owner.subject).toBe("A NETOPIA payment message could not be verified (PAYMENT_CONFIGURATION_REFUSED)");
    expect(owner.html).toContain('<html lang="en" dir="ltr">');
    expect(owner.text.startsWith([
      "Hello,",
      "NETOPIA sent a message about one of our open payments, and the site could not verify it with the trusted NETOPIA"
        + " key. It was answered \"try again\", so NETOPIA keeps sending it, and a sealed copy is kept for 14 days.",
      "Charge reference: 0123456789abcdef0123456789abcdef",
      "Received at: 2026-10-06T18:00:00.000Z (UTC)",
      "Reason code: PAYMENT_CONFIGURATION_REFUSED",
      "Check the NETOPIA key with the check command (pnpm billing:check, as the runbook shows). If the key is wrong or"
        + " out of date, put the right one in place with deploy/vps/billing-setup.sh --replace netopia and restart the"
        + " API: every kept message is checked again at the start, saved cards included.",
      "At most one such email is sent an hour; the owner summary (pnpm billing:tax-summary) counts every kept message by day."
    ].join("\n\n"))).toBe(true);
    expect(Object.keys(MAIL_TEMPLATES.O4.params).sort()).toEqual(["chargeRef", "reasonCode", "receivedAt"]);
  });

  it("N17: M12 says which card is missing, in English and Romanian", () => {
    const expiring = renderMail("M12", "en", paramsFor("M12"));
    expect(expiring.text).toContain("The card we have expires before then.");
    expect(expiring.text).not.toContain("We couldn't keep your card");
    const missing = renderMail("M12", "ro", { ...paramsFor("M12"), cardExpiring: "false" });
    expect(missing.text).toContain("Nu am putut păstra cardul de la ultima dumneavoastră plată.");
  });
});
