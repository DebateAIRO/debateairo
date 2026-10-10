/**
 * R-8's sixteen ids, ruling Q-5's owner template O2 (a refund that could not be completed), W9's (P2-I11)
 * M8_RECEIVED (a withdrawal's acknowledgement of receipt) and O2_WITHDRAWAL (a withdrawal the owner settles by hand),
 * W12's (P2-I16) O3 (a legal document or an email that was never sent), and N9's O4 (NETOPIA's message about an open
 * charge could not be verified), and N14's O2_REFUND_DUE and O2_REFUND_REMINDER (a NETOPIA refund for the owner to make
 * in NETOPIA's admin, and the daily list of the open ones), and N17's M12 (a card is needed before a renewal).
 */
export const MAIL_TEMPLATE_IDS = Object.freeze([
  "M1", "M2_INVOICE_LINK", "M2_INVOICE_ATTACHED", "M3", "M4", "M5A", "M5B", "M5C",
  "M6", "M7", "M8", "M8_RECEIVED", "M9", "M10", "M11", "M11_DUPLICATE", "M12", "O1", "O2", "O2_WITHDRAWAL",
  "O2_REFUND_DUE", "O2_REFUND_REMINDER", "O3", "O4"
] as const);

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

/**
 * How a param is checked and shown. plan: a plan id shown by its catalogue name. amount: a decimal
 * "24.20" shown in the email's currency (`params.currency`: USD, EUR or RON; USD when absent) in the locale. date: an ISO date or instant shown as a long date (UTC). url: https
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
 * A sentence that depends on a param: `then` when the test holds, `otherwise` when not (`null` shows nothing). P2-W4:
 * `otherwise` may itself be a condition, so one paragraph chooses among three sentences on two flags (O2's intro).
 */
export type MailParamCondition = Readonly<{
  ifParam: string; test: MailParamTest; then: string; otherwise: string | MailParamCondition | null;
}>;

/**
 * A catalogue key, the owner summary's block, a sentence that depends on an attachment (`attached` when the message
 * carries it, `missing` otherwise; both use the same params), or a sentence that depends on a param.
 */
export type MailParagraph =
  | string
  | Readonly<{ block: string }>
  | Readonly<{ ifAttached: MailAttachmentFact; attached: string; missing: string }>
  | MailParamCondition;

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
/**
 * W10 (P2-I21): `bankDeclined` is "true" only for a charge the bank declined (PAYMENT_DECLINED); every other failed
 * attempt (an outage past Q-1's 72 hours, our refused key, an unknown outcome, NETOPIA's own refusal, a tax service
 * that stayed down, a retry whose total changed) asked no bank, so its email never says one refused.
 * N11 (spec §2.9.2): the optional flag `confirmCard` is "true" for AUTHENTICATION_REQUIRED (the bank asked for its
 * security check on a renewal nobody was present to finish): its sentence replaces the bank's refusal. An M5 queued
 * without it reads as before.
 */
const retry = Object.freeze({ plan: "plan", retryDate: "date", cardPageUrl: "url", bankDeclined: "flag" } as const);
const retryOptional = Object.freeze({ confirmCard: "flag" } as const);
/** W10 (P2-I21): the first M5 sentence is true in every case; then the bank's check or its refusal, when there was one. */
const notTaken: ReadonlyArray<MailParagraph> = Object.freeze([
  "mail.M5.notTaken",
  {
    ifParam: "confirmCard", test: "true", then: "mail.M5.confirmCard",
    otherwise: { ifParam: "bankDeclined", test: "true", then: "mail.M5.bankRefused", otherwise: null }
  }
]);
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
  M5A: define({
    catalogue: "mail", subject: "mail.M5.subject", paragraphs: [...notTaken, "mail.M5.retry"], params: retry, optional: retryOptional
  }),
  M5B: define({
    catalogue: "mail", subject: "mail.M5.subject", paragraphs: [...notTaken, "mail.M5.secondTry"], params: retry, optional: retryOptional
  }),
  M5C: define({
    catalogue: "mail", subject: "mail.M5.subject", paragraphs: [...notTaken, "mail.M5.lastTry"], params: retry, optional: retryOptional
  }),
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
      // no reason. P2-W10: a plan paused by a card dispute (SUSPENDED) can be cancelled too; its M7 carries the optional
      // flag `paused` "true" (with canUndo "false"): it won't renew, its features stay paused while the dispute is open,
      // and a dispute won gives them back until {accessEndDate}, its period end. Left out, M7 reads as before.
      { ifParam: "paused", test: "true", then: "mail.M7.paused",
        otherwise: { ifParam: "canUndo", test: "true", then: "mail.M7.until", otherwise: "mail.M7.endedNow" } },
      { ifParam: "canUndo", test: "true", then: "mail.M7.undo", otherwise: "mail.M7.again" }
    ],
    params: { plan: "plan", accessEndDate: "date", settingsUrl: "url", canUndo: "flag" },
    optional: { paused: "flag" }
  }),
  M8: define({
    catalogue: "mail", subject: "mail.M8.subject",
    // P12d: a withdrawal whose used part covers the whole price refunds 0.00, and M8 then says nothing was due back.
    // P2-M7: a withdrawal the owner settles at 0.00 and 0.00 (`settleOwnerWithdrawal`, the optional flag `ownerSettled`
    // "true") usually had its money back already (a dashboard refund), so its M8 says only that nothing more is due.
    paragraphs: [{ ifParam: "refundAmount", test: "nonzero", then: "mail.M8.refunded",
      otherwise: { ifParam: "ownerSettled", test: "true", then: "mail.M8.nothingMoreDue", otherwise: "mail.M8.nothingDue" } }],
    params: { plan: "plan", refundAmount: "amount" },
    optional: { ownerSettled: "flag" }
  }),
  // W9 (P2-I11): Directive 2011/83/EU art. 11(3)'s acknowledgement of receipt on a durable medium, queued in the
  // withdrawal's own transaction (Settings and the owner's command alike). It says only what has happened: received
  // on {withdrawalDate} and the plan ended; then either the refund on its way (refundAmount present; M8 says
  // "refunded" once the money moved) or, without an amount, the owner's check (a refund was already made). A
  // withdrawal with nothing due back sends no M8_RECEIVED: its M8, queued in the same transaction, is the acknowledgement.
  M8_RECEIVED: define({
    catalogue: "mail", subject: "mail.M8_RECEIVED.subject",
    paragraphs: [
      "mail.M8_RECEIVED.received",
      { ifParam: "refundAmount", test: "present", then: "mail.M8_RECEIVED.refunding", otherwise: "mail.M8_RECEIVED.ownerReview" }
    ],
    params: { plan: "plan", withdrawalDate: "date" },
    optional: { refundAmount: "amount" }
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
  // M11 follows a payment refused for the card's country. A refused card change (P12e, CARD_CHECK_REFUSED) sends no
  // email, but the wording still names no plan and says "taken or held", so it would stay true there too. W10
  // (P2-M9): a refused renewal or upgrade ends the plan at once (VERIFY_PAYMENT's endRefusedPayment), and RefundDesk
  // then names it (`endedPlan`); a checkout's payment, whose plan never started, and an M11 queued before W10 carry
  // none, so they read as before.
  M11: define({
    catalogue: "mail", subject: "mail.M11.subject",
    paragraphs: ["mail.M11.refunded", { ifParam: "endedPlan", test: "present", then: "mail.M11.planEnded", otherwise: null }],
    params: { refundAmount: "amount" },
    optional: { endedPlan: "plan" }
  }),
  M11_DUPLICATE: define({
    catalogue: "mail", subject: "mail.M11_DUPLICATE.subject",
    paragraphs: ["mail.M11.duplicate"],
    params: { refundAmount: "amount" }
  }),
  // N17 (spec §2.15.3): ten days before a renewal of a plan with no usable card. `cardExpiring` "true": a card is held
  // but expires before the renewal; otherwise the last payment's card could not be kept (no token, or it was revoked).
  M12: define({
    catalogue: "mail", subject: "mail.M12.subject",
    paragraphs: [
      "mail.M12.intro",
      { ifParam: "cardExpiring", test: "true", then: "mail.M12.expiring", otherwise: "mail.M12.missing" },
      "mail.M12.action"
    ],
    params: { plan: "plan", renewDate: "date", cardPageUrl: "url", cardExpiring: "flag" }
  }),
  O1: define({
    catalogue: "owner", subject: "owner.O1.subject",
    paragraphs: ["owner.O1.intro", { block: "summaryText" }],
    params: { quarter: "text", summaryText: "block" }
  }),
  // Ruling Q-5: RefundDesk's dead-letter path (P9b) sends this to the owner at once. Our charge id, the amount and
  // the dead job's code; never a customer's name, email or card. P2-I5: a job the charge records no request for
  // (REFUND_NOT_REQUESTED, notRequested "true") moved no money and is no refund to make, so it says that instead:
  // nothing went to NETOPIA, the amount is only the job's, and whoever runs the server checks the charge's requests.
  // W9 (P2-M8): a real refund's O2 also names what the refund was for (`refundReason`, the intent's reason) and, for a
  // withdrawal's, its legal deadline and how to refund by hand so that M8 still follows (`refundDeadline`). Both are
  // optional, so an O2 queued before them renders as it did; RefundDesk sends neither for REFUND_NOT_REQUESTED.
  // P2-W4: REFUND_CHARGE_MISSING also takes the not-requested sentences (notRequested "true"). A job of another
  // payment system (OTHER_PAYMENT_SYSTEM, the optional flag `otherSystem` "true") says nothing was sent and nothing is
  // owed on this server, with no deadline; notRequested wins if both were ever set. Left out, it changes nothing.
  O2: define({
    catalogue: "owner", subject: "owner.O2.subject",
    paragraphs: [
      { ifParam: "notRequested", test: "true", then: "owner.O2.notRequestedIntro",
        otherwise: { ifParam: "otherSystem", test: "true", then: "owner.O2.otherSystemIntro", otherwise: "owner.O2.intro" } },
      "owner.O2.charge",
      { ifParam: "notRequested", test: "true", then: "owner.O2.notRequestedAmount", otherwise: "owner.O2.amount" },
      "owner.O2.reason",
      { ifParam: "refundReason", test: "present", then: "owner.O2.refundReason", otherwise: null },
      { ifParam: "refundDeadline", test: "present", then: "owner.O2.withdrawalDeadline", otherwise: null },
      { ifParam: "notRequested", test: "true", then: "owner.O2.notRequestedNext",
        otherwise: { ifParam: "otherSystem", test: "true", then: "owner.O2.otherSystemNext", otherwise: "owner.O2.next" } }
    ],
    params: { chargeRef: "text", refundAmount: "amount", reasonCode: "text", notRequested: "flag" },
    optional: { refundReason: "text", refundDeadline: "date", otherSystem: "flag" }
  }),
  // W9 (P2-I11): the O2 variant for a withdrawal handed to the owner (`refund_by_owner`: a dashboard refund or an
  // earlier request touched a payment), sent at once from the withdrawal's own transaction, so the 14-day refund
  // deadline never waits for the quarterly O1. The owner reference (an opaque id, what `pnpm billing:withdraw --owner`
  // takes), the summary's code WITHDRAWAL_BY_OWNER and two dates; never a customer's name, email or card. The settling
  // command is README §14.8's host form (a bare `pnpm billing:withdraw` has no settings in a root shell), a paragraph of
  // its own; it reads only ownerRef, so an O2_WITHDRAWAL queued before it renders it too.
  O2_WITHDRAWAL: define({
    catalogue: "owner", subject: "owner.O2_WITHDRAWAL.subject",
    paragraphs: [
      "owner.O2_WITHDRAWAL.intro", "owner.O2_WITHDRAWAL.owner", "owner.O2.reason", "owner.O2_WITHDRAWAL.deadline",
      "owner.O2_WITHDRAWAL.next", "owner.O2_WITHDRAWAL.command"
    ],
    params: { ownerRef: "text", reasonCode: "text", withdrawalDate: "date", refundDeadline: "date" }
  }),
  // N14 (spec §2.12.2, ruling C-3): while NETOPIA's refund call is unconfirmed, RefundDesk hands each NETOPIA refund to
  // the owner at once: our charge id, NETOPIA's payment number, the exact amount and currency, whether it is the whole
  // payment, the reason, a withdrawal's legal deadline, and the exact command that records it. Never a customer's name,
  // email or card. F6a (final review ops-3, ops-4): the steps say to look at the payment in NETOPIA's admin first, and the
  // command is README §14.8's host form (systemd-run as the API's user), longer than a text param's 200 characters, so it
  // is a block: a paragraph of its own, copied whole.
  O2_REFUND_DUE: define({
    catalogue: "owner", subject: "owner.O2_REFUND_DUE.subject",
    paragraphs: [
      "owner.O2_REFUND_DUE.intro", "owner.O2.charge", "owner.O2_REFUND_DUE.payment", "owner.O2_REFUND_DUE.amount",
      { ifParam: "whole", test: "true", then: "owner.O2_REFUND_DUE.whole", otherwise: "owner.O2_REFUND_DUE.part" },
      "owner.O2.refundReason",
      { ifParam: "refundDeadline", test: "present", then: "owner.O2_REFUND_DUE.deadline", otherwise: null },
      "owner.O2_REFUND_DUE.next",
      { ifParam: "whole", test: "true", then: "owner.O2_REFUND_DUE.recordedBySite", otherwise: "owner.O2_REFUND_DUE.command" },
      { block: "doneCommand" },
      "owner.O2_REFUND_DUE.reminded"
    ],
    params: {
      chargeRef: "text", paymentRef: "text", refundAmount: "amount", currency: "text", refundReason: "text", whole: "flag",
      doneCommand: "block"
    },
    optional: { refundDeadline: "date" }
  }),
  // N14 (spec §2.12.2 item 3): the daily list of the open owner refunds, each with its exact command (`refundList`,
  // preformatted English lines built by RefundDesk). Our ids only.
  O2_REFUND_REMINDER: define({
    catalogue: "owner", subject: "owner.O2_REFUND_REMINDER.subject",
    paragraphs: ["owner.O2_REFUND_REMINDER.intro", { block: "refundList" }, "owner.O2_REFUND_REMINDER.seen"],
    params: { refundCount: "count", refundList: "block" }
  }),
  // W12 (P2-I16, the controller's ruling): the outbox worker's dead-letter hook sends this to the owner at once when an
  // invoice or credit-note job, or an email, dies (never for a dead O3 itself). The job kind, our own reference (a
  // charge id, or the email job's ref of template and ids), the dead job's code, and the steps (`nextSteps`, the same
  // wording the owner summary prints, with the `pnpm billing:invoice` command to copy); never a customer's name, email
  // or card.
  // N10/N11 (spec §2.8, §2.9, ruling C-8): the same O3 also carries a payment that needs the owner (an amount or customer
  // NETOPIA reports that our charge does not hold, a status whose meaning NETOPIA has not confirmed, a renewal NETOPIA
  // refused for our own settings or key, a renewal whose outcome stays open). Those set the optional flag `paymentAlert`
  // "true": the intro and the closing line then speak of the payment, never of a dead job. The reference is our own
  // charge id; never a customer's name, email or card.
  O3: define({
    catalogue: "owner", subject: "owner.O3.subject",
    paragraphs: [
      { ifParam: "paymentAlert", test: "true", then: "owner.O3.paymentIntro", otherwise: "owner.O3.intro" },
      "owner.O3.job", "owner.O3.reference", "owner.O2.reason", { block: "nextSteps" },
      { ifParam: "paymentAlert", test: "true", then: "owner.O3.paymentListed", otherwise: "owner.O3.listed" }
    ],
    params: { jobKind: "text", reference: "text", reasonCode: "text", nextSteps: "block" },
    optional: { paymentAlert: "flag" }
  }),
  // N9 (spec 2026-10-05 §2.7.4 step 3): NETOPIA's message about one of our open charges failed verification. Sent at
  // once, at most one an hour (the intake's dedupe ref is the UTC hour). Our charge id, the time and the reason code;
  // never the message, its token or anything of the customer.
  O4: define({
    catalogue: "owner", subject: "owner.O4.subject",
    paragraphs: ["owner.O4.intro", "owner.O2.charge", "owner.O4.received", "owner.O2.reason", "owner.O4.next", "owner.O4.listed"],
    params: { chargeRef: "text", receivedAt: "text", reasonCode: "text" }
  })
});
