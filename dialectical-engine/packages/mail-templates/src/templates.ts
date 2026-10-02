/** R-8's sixteen ids plus ruling Q-5's owner template O2 (a refund that could not be completed). */
export const MAIL_TEMPLATE_IDS = Object.freeze([
  "M1", "M2_INVOICE_LINK", "M2_INVOICE_ATTACHED", "M3", "M4", "M5A", "M5B", "M5C",
  "M6", "M7", "M8", "M9", "M10", "M11", "M11_DUPLICATE", "O1", "O2"
] as const);

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

/**
 * How a param is checked and shown. plan: a plan id shown by its catalogue name. amount: a decimal
 * "24.20" shown as USD in the locale. date: an ISO date or instant shown as a long date (UTC). url: https
 * only, rendered as a link. count: a small whole number. text: one short line. block: the owner summary's
 * preformatted lines. flag: "true" or "false"; it only chooses a sentence and is never printed.
 */
export type MailParamKind = "plan" | "amount" | "date" | "url" | "count" | "text" | "block" | "flag";

/**
 * What a param-dependent paragraph tests. present: an optional param was given. true: a flag is "true".
 * nonzero: an amount is not 0.00.
 */
export type MailParamTest = "present" | "true" | "nonzero";

/**
 * What a sentence may depend on: an attachment the message REALLY carries (A26(b)). The sender derives the facts
 * from the attachments it was handed (`mailAttachmentFactsOf`); a resolver that found nothing adds none.
 */
export const MAIL_ATTACHMENT_FACTS = Object.freeze(["TERMS_TEXT", "INVOICE_PDF"] as const);
export type MailAttachmentFact = (typeof MAIL_ATTACHMENT_FACTS)[number];

/** The file names apps/api/src/mail-attachments.ts gives the two text attachments; the facts are read from them. */
export const TERMS_ATTACHMENT_FILENAME = "terms-of-service.txt";
export const WITHDRAWAL_FORM_ATTACHMENT_FILENAME = "withdrawal-form.txt";

export function mailAttachmentFactsOf(
  attachments: ReadonlyArray<Readonly<{ filename: string; contentType: string }>>
): ReadonlySet<MailAttachmentFact> {
  const facts = new Set<MailAttachmentFact>();
  for (const attachment of attachments) {
    if (attachment.filename === TERMS_ATTACHMENT_FILENAME && attachment.contentType.startsWith("text/plain")) {
      facts.add("TERMS_TEXT");
    }
    if (attachment.contentType === "application/pdf") facts.add("INVOICE_PDF");
  }
  return facts;
}

/**
 * A catalogue key, the owner summary's block, a sentence that depends on an attachment (`attached` when the message
 * carries it, `missing` otherwise; both use the same params), or a sentence that depends on a param (`then` when the
 * test holds, `otherwise` when not; `null` shows nothing).
 */
export type MailParagraph =
  | string
  | Readonly<{ block: string }>
  | Readonly<{ ifAttached: MailAttachmentFact; attached: string; missing: string }>
  | Readonly<{ ifParam: string; test: MailParamTest; then: string; otherwise: string | null }>;

export type MailTemplateDefinition = Readonly<{
  catalogue: "mail" | "owner";
  subject: string;
  paragraphs: ReadonlyArray<MailParagraph>;
  params: Readonly<Record<string, MailParamKind>>;
  /** Params a caller may leave out. Only the `then` sentence of a `present` test on that param reads one. */
  optional?: Readonly<Record<string, MailParamKind>>;
}>;

/** Filled from SELLER_COMPANY (P6a's mirror of COMPANY, R3-4) by the renderer; a caller passing one is refused. */
export const RESERVED_MAIL_PARAMS = Object.freeze(["merchantName", "merchantAddress", "merchantEmail"] as const);

const define = (template: MailTemplateDefinition): MailTemplateDefinition => Object.freeze(template);
const retry = Object.freeze({ plan: "plan", retryDate: "date", cardPageUrl: "url" } as const);
const charged = Object.freeze({ plan: "plan", totalAmount: "amount", chargeDate: "date" } as const);

export const MAIL_TEMPLATES: Readonly<Record<MailTemplateId, MailTemplateDefinition>> = Object.freeze({
  M1: define({
    catalogue: "mail", subject: "mail.M1.subject",
    paragraphs: [
      "mail.M1.active", "mail.M1.price", "mail.M1.cancel",
      // Spec §2.5.6: the withdrawal right, and the form P9b attaches with it, exist only in a withdrawal country;
      // P9b sends withdrawalDays exactly there.
      { ifParam: "withdrawalDays", test: "present", then: "mail.M1.withdrawal", otherwise: null },
      // Spec §2.5.10: the accepted version's text is attached when its bytes still match; otherwise the email says
      // only where the CURRENT Terms are, never that the current page is the version accepted.
      { ifAttached: "TERMS_TEXT", attached: "mail.M1.termsAttached", missing: "mail.M1.termsCurrent" }
    ],
    params: { plan: "plan", totalAmount: "amount", renewDate: "date", cancelPageUrl: "url", termsUrl: "url" },
    optional: { withdrawalDays: "count" }
  }),
  M2_INVOICE_LINK: define({
    catalogue: "mail", subject: "mail.M2.subject",
    paragraphs: ["mail.M2.charged", "mail.M2.invoiceLink", "mail.M2.thanks"],
    params: { ...charged, invoiceUrl: "url" }
  }),
  M2_INVOICE_ATTACHED: define({
    catalogue: "mail", subject: "mail.M2.subject",
    paragraphs: [
      "mail.M2.charged",
      { ifAttached: "INVOICE_PDF", attached: "mail.M2.invoiceAttached", missing: "mail.M2.invoiceInSettings" },
      "mail.M2.thanks"
    ],
    params: { ...charged, invoiceNumber: "text" }
  }),
  M3: define({
    catalogue: "mail", subject: "mail.M3.subject",
    paragraphs: ["mail.M3.change", "mail.M3.cancel"],
    params: { plan: "plan", totalAmount: "amount", chargeDate: "date", cancelPageUrl: "url" }
  }),
  M4: define({
    catalogue: "mail", subject: "mail.M4.subject",
    paragraphs: ["mail.M4.reminder", "mail.M4.cancel"],
    params: { plan: "plan", totalAmount: "amount", renewDate: "date", cancelPageUrl: "url" }
  }),
  M5A: define({ catalogue: "mail", subject: "mail.M5.subject", paragraphs: ["mail.M5.refused", "mail.M5.retry"], params: retry }),
  M5B: define({ catalogue: "mail", subject: "mail.M5.subject", paragraphs: ["mail.M5.refused", "mail.M5.secondTry"], params: retry }),
  M5C: define({ catalogue: "mail", subject: "mail.M5.subject", paragraphs: ["mail.M5.refused", "mail.M5.lastTry"], params: retry }),
  M6: define({
    catalogue: "mail", subject: "mail.M6.subject",
    paragraphs: ["mail.M6.moved", "mail.M6.again"],
    params: { plan: "plan", pricingUrl: "url" }
  }),
  M7: define({
    catalogue: "mail", subject: "mail.M7.subject",
    paragraphs: [
      // P12: a cancel that ends the plan at once (accessEndDate = today) has no "until" to promise and no undo to
      // offer; the sender says so with canUndo "false". That is a cancel while a payment is failing, one after the
      // paid month's end (ruling Q-1's quiet retry), or one inside the renewal's 5-minute lead, so "ended on" names
      // no reason.
      { ifParam: "canUndo", test: "true", then: "mail.M7.until", otherwise: "mail.M7.endedNow" },
      { ifParam: "canUndo", test: "true", then: "mail.M7.undo", otherwise: "mail.M7.again" }
    ],
    params: { plan: "plan", accessEndDate: "date", settingsUrl: "url", canUndo: "flag" }
  }),
  M8: define({
    catalogue: "mail", subject: "mail.M8.subject",
    // P12d: a withdrawal whose used part covers the whole price refunds 0.00, and M8 then says nothing was due back.
    paragraphs: [{ ifParam: "refundAmount", test: "nonzero", then: "mail.M8.refunded", otherwise: "mail.M8.nothingDue" }],
    params: { plan: "plan", refundAmount: "amount" }
  }),
  M9: define({
    catalogue: "mail", subject: "mail.M9.subject",
    paragraphs: ["mail.M9.link", "mail.M9.ignore"],
    params: { cancelLinkUrl: "url" }
  }),
  M10: define({
    catalogue: "mail", subject: "mail.M10.subject",
    paragraphs: ["mail.M10.paused", "mail.M10.contact"],
    params: { plan: "plan" }
  }),
  // M11 follows a checkout payment refused for the card's country. A refused card change (P12e, CARD_CHECK_REFUSED)
  // sends no email, but the wording still names no plan and says "taken or held", so it would stay true there too.
  M11: define({
    catalogue: "mail", subject: "mail.M11.subject",
    paragraphs: ["mail.M11.refunded"],
    params: { refundAmount: "amount" }
  }),
  M11_DUPLICATE: define({
    catalogue: "mail", subject: "mail.M11_DUPLICATE.subject",
    paragraphs: ["mail.M11.duplicate"],
    params: { refundAmount: "amount" }
  }),
  O1: define({
    catalogue: "owner", subject: "owner.O1.subject",
    paragraphs: ["owner.O1.intro", { block: "summaryText" }],
    params: { quarter: "text", summaryText: "block" }
  }),
  // Ruling Q-5: RefundDesk's dead-letter path (P9b) sends this to the owner at once. Our charge id, the amount and
  // the dead job's code; never a customer's name, email or card.
  O2: define({
    catalogue: "owner", subject: "owner.O2.subject",
    paragraphs: ["owner.O2.intro", "owner.O2.charge", "owner.O2.amount", "owner.O2.reason", "owner.O2.next"],
    params: { chargeRef: "text", refundAmount: "amount", reasonCode: "text" }
  })
});
