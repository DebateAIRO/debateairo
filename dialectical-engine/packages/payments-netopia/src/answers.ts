// packages/payments-netopia/src/answers.ts
import { paymentError, type HostedPaymentStarted, type PaymentReport, type PaymentState, type SavedCard, type SecretToken } from "@debateai/billing-core";
import { netopiaCountryToIso2 } from "./countries.js";
import { NETOPIA_FACTS } from "./facts.js";
import { isNetopiaPaymentId, isNetopiaPaymentUrl } from "./hosts.js";
import { isJsonRecord, valueAtPath } from "./json.js";
import { netopiaAmountToMicros } from "./money.js";
import { createSecretToken, isSecretTokenText } from "./secret-token.js";
import { bankDeclined, declineSideOf, isOutcomeCode, statusToState } from "./status.js";
import { parseOccurredAt } from "./time.js";

/*
 * Spec 2026-10-05 §2.4.3: HTTP-200 answers, parsed by parseJsonKeepingNumberText (numbers are text). Lenient about members we
 * do not use; strict about those we do. Only N1's payment errors, whose detail is a member's NAME or NETOPIA's short code.
 */
export type AnswerPurpose = "CHARGE" | "STATUS";
export type PaymentAnswer =
  | Readonly<{ kind: "REPORT"; report: PaymentReport; orderReused: boolean }>
  | Readonly<{ kind: "ORDER_REUSED_WITHOUT_PAYMENT" }>
  | Readonly<{ kind: "NO_SUCH_ORDER" }>;

const STATUS_TEXT = /^(?:[1-9]|1[0-9]|2[0-3])$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const CODE = /^[0-9A-Za-z_-]{1,10}$/u;
const ECHOED_ID = /^[A-Za-z0-9_.:-]{1,64}$/u;
const LAST_FOUR = /([0-9]{4})$/u;
const MONTH_TEXT = /^(?:[1-9]|1[0-2])$/u;
const YEAR_TEXT = /^20[0-9]{2}$/u;
const SUCCESS_CODES: ReadonlySet<string> = new Set(["00", "0"]);
/** The status a report names when NETOPIA gave its state by a code alone: a decline (12), 3-D Secure (15), locked (1). */
const STATUS_OF_CODE_STATE: Readonly<Partial<Record<PaymentState, string>>> = Object.freeze({ DECLINED: "12", ACTION_REQUIRED: "15", PENDING: "1" });

function invalid(member?: string): never {
  throw paymentError("PAYMENT_RESPONSE_INVALID", member);
}
const record = (value: unknown): Record<string, unknown> => (isJsonRecord(value) ? value : {});
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function answerCode(json: Record<string, unknown>): string | null {
  if (json.error === undefined || json.error === null) return null;
  if (!isJsonRecord(json.error)) invalid("error");
  const code = json.error.code;
  if (code === undefined || code === null) return null;
  if (typeof code !== "string" || !CODE.test(code)) invalid("code");
  return code;
}

function paymentOf(json: Record<string, unknown>): Record<string, unknown> | null {
  if (json.payment === undefined || json.payment === null) return null;
  return isJsonRecord(json.payment) ? json.payment : invalid("payment");
}

function statusTextOf(payment: Record<string, unknown> | null): string | null {
  const status = payment?.status;
  if (status === undefined || status === null) return null;
  return typeof status === "string" && STATUS_TEXT.test(status) ? status : invalid("status");
}

function ntpIdOf(payment: Record<string, unknown> | null): string {
  const ntpId = payment?.ntpID;
  return isNetopiaPaymentId(ntpId) ? ntpId : invalid("ntpID");
}

function savedCardOf(json: Record<string, unknown>, payment: Record<string, unknown>): SavedCard | null {
  let token: SecretToken | null = null;
  for (const path of NETOPIA_FACTS.tokenPaths) {
    const value = valueAtPath(json, path);
    if (value === undefined || value === null) continue;
    // Lenient on purpose: a token of an odd shape leaves no saved card; it never rejects the payment it came with.
    token = isSecretTokenText(value) ? createSecretToken(value) : null;
    break;
  }
  if (token === null) return null;
  const binding = record(payment.binding);
  const month = text(binding.expireMonth);
  const year = text(binding.expireYear);
  return Object.freeze({
    token,
    expMonth: month !== null && MONTH_TEXT.test(month) ? Number(month) : null,
    expYear: year !== null && YEAR_TEXT.test(year) ? Number(year) : null,
    last4: LAST_FOUR.exec(text(record(payment.instrument).panMasked) ?? "")?.[1] ?? null
  });
}

function reportOf(json: Record<string, unknown>, context: Readonly<{ orderId: string; now: Date }>, code: string | null, forced: PaymentState | null): PaymentReport {
  const payment = paymentOf(json) ?? invalid("payment");
  const order = record(json.order);
  if (order.orderID !== undefined && order.orderID !== context.orderId) invalid("orderID");
  const statusText = statusTextOf(payment);
  const providerPaymentId = ntpIdOf(payment);
  const state: PaymentState = forced ?? (statusText === null ? invalid("status") : statusToState(Number(statusText)));
  const providerStatus = statusText ?? STATUS_OF_CODE_STATE[state] ?? invalid("status");
  if (payment.amount !== undefined && payment.amount !== null && typeof payment.amount !== "string") invalid("amount");
  const amount = text(payment.amount);
  const currency = payment.currency;
  if (currency !== undefined && currency !== null && (typeof currency !== "string" || !CURRENCY.test(currency))) invalid("currency");
  // The refusal's code: the answer's error code, else the message-style payment.code (IPNs, some status reads).
  const paymentCode = text(payment.code);
  const ownCode = code !== null && !SUCCESS_CODES.has(code) ? code
    : paymentCode !== null && CODE.test(paymentCode) && !SUCCESS_CODES.has(paymentCode) ? paymentCode : null;
  const refused = state === "DECLINED" || state === "FAILED";
  const declineCode = refused ? ownCode : null;
  const instrument = record(payment.instrument);
  const cardCountry = netopiaCountryToIso2(text(instrument.country)) ?? netopiaCountryToIso2(text(record(payment.data).ISSUER_COUNTRY));
  const clientId = [order.clientID, instrument.clientID].find((value): value is string => typeof value === "string" && ECHOED_ID.test(value)) ?? null;
  return Object.freeze({
    orderId: context.orderId, providerPaymentId, state, providerStatus,
    amountMicros: amount === null ? null : netopiaAmountToMicros(amount),
    currency: typeof currency === "string" ? currency : null, cardCountry, savedCard: savedCardOf(json, payment), declineCode,
    declineSide: refused ? declineSideOf(declineCode, Number(providerStatus)) : null,
    bankDeclined: state === "DECLINED" && bankDeclined(declineCode),
    occurredAt: parseOccurredAt(text(payment.operationDate), context.now), clientId
  });
}

const answerRecord = (json: unknown): Record<string, unknown> => (isJsonRecord(json) ? json : invalid());

/** True when a status read's answer says plainly NETOPIA knows no such order: the pinned code, and no payment status. */
export function isNotFoundAnswer(json: unknown): boolean {
  if (!isJsonRecord(json) || (isJsonRecord(json.payment) && json.payment.status !== undefined && json.payment.status !== null)) return false;
  const code = record(json.error).code;
  return typeof code === "string" && NETOPIA_FACTS.notFoundCodes.includes(code);
}

/** Only for a loopback development base (the protocol fake): the payment URL may sit on the base's own origin. */
function sameOrigin(url: string, allowed: string | null): boolean {
  if (allowed === null) return false;
  try { return new URL(url).origin === new URL(allowed).origin; } catch { return false; }
}

/** The hosted start's answer: 101, NETOPIA's ntpID from the JSON, and an https payment URL on a NETOPIA host. */
export function readStartAnswer(json: unknown, context: Readonly<{ sameOriginAllowed: string | null }>): HostedPaymentStarted {
  const answer = answerRecord(json);
  const code = answerCode(answer);
  if (code === "101") {
    const payment = paymentOf(answer);
    const providerPaymentId = ntpIdOf(payment);
    const url = payment?.paymentURL;
    if (typeof url !== "string" || !(isNetopiaPaymentUrl(url) || sameOrigin(url, context.sameOriginAllowed))) invalid("paymentURL");
    return Object.freeze({ providerPaymentId, redirectUrl: url });
  }
  if (code === null || (isOutcomeCode(code) && code !== "56") || NETOPIA_FACTS.cardDeclineCodes.includes(code)) invalid(code ?? undefined);
  // 56 (the order exists: nothing new was started), 32/33 (merchant settings), 99, any code we do not know.
  throw paymentError("PAYMENT_CONFIGURATION_REFUSED", code);
}

/** A saved-card charge's or a status read's answer (spec §2.4.3's table). */
export function readPaymentAnswer(json: unknown, context: Readonly<{ orderId: string; now: Date; purpose: AnswerPurpose }>): PaymentAnswer {
  const answer = answerRecord(json);
  const code = answerCode(answer);
  const payment = paymentOf(answer);
  const statusText = statusTextOf(payment);
  const report = (forced: PaymentState | null, orderReused = false): PaymentAnswer =>
    Object.freeze({ kind: "REPORT", report: reportOf(answer, context, code, forced), orderReused });
  if (context.purpose === "STATUS") {
    if (code !== null && NETOPIA_FACTS.notFoundCodes.includes(code) && statusText === null) return Object.freeze({ kind: "NO_SUCH_ORDER" });
    if (statusText !== null) return report(null);
    if (code === null || isOutcomeCode(code) || NETOPIA_FACTS.cardDeclineCodes.includes(code)) invalid();
    throw paymentError("PAYMENT_CONFIGURATION_REFUSED", code);
  }
  if (code === null || SUCCESS_CODES.has(code)) return statusText === null ? invalid() : report(null);
  if (code === "100") return report("ACTION_REQUIRED");
  if (code === "102") return report("PENDING");
  if (code === "56") {
    const ntpId = payment?.ntpID;
    return statusText !== null && isNetopiaPaymentId(ntpId) ? report(null, true) : Object.freeze({ kind: "ORDER_REUSED_WITHOUT_PAYMENT" });
  }
  if (NETOPIA_FACTS.cardDeclineCodes.includes(code)) return report("DECLINED");
  throw paymentError("PAYMENT_CONFIGURATION_REFUSED", code);
}
