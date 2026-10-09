import { TypedDomainError } from "@debateai/kernel";

/*
 * The payment port (spec 2026-10-05 §2.3). The rest of the code talks to NETOPIA only through `CardPayments`; the
 * NETOPIA package implements it, and so do the protocol fake and the test stubs. Types and the error vocabulary only:
 * billing-core stays free of node: imports, so `SecretToken` is an interface here and its one implementation is
 * @debateai/payments-netopia's `createSecretToken`.
 */

export type PaymentProvider = "netopia";
export type PaymentEnvironment = "sandbox" | "live";
export type PriceCurrency = "USD" | "EUR" | "RON";          // Part C (§2.16); Part N keeps "USD"

/** The cardholder NETOPIA needs on every payment (mandatory for saved-card charges, [SALES]). */
export type Payer = Readonly<{
  firstName: string; lastName: string; email: string; phone: string;   // phone: E.164
  country: string;            // ISO 3166-1 alpha-2
  region: string | null; city: string; postalCode: string | null; street: string;
}>;

/** Redacts itself everywhere; `reveal()` is the only way to the plaintext (§2.2 rule 5). */
export interface SecretToken { reveal(): string; readonly fingerprint: string }

export type HostedPaymentStart = Readonly<{
  orderId: string;            // our charge id (32 lower-case hex)
  amountMicros: number;       // 0 only for a card check (§2.11)
  currency: PriceCurrency;
  description: string;        // the order line in the buyer's locale (order-text catalogue)
  payer: Payer;
  clientId: string;           // our customer's stable id (§2.6.4)
  returnUrl: string; notifyUrl: string;
  language: string;           // one NETOPIA page language (§2.4.2)
}>;
export type HostedPaymentStarted = Readonly<{ providerPaymentId: string; redirectUrl: string }>;

export type SavedCardCharge = Readonly<{
  orderId: string; amountMicros: number; currency: PriceCurrency; description: string;
  payer: Payer; cardToken: SecretToken; payerIp: string; returnUrl: string; notifyUrl: string; language: string;
}>;

export type PaymentState =
  | "PENDING" | "ACTION_REQUIRED" | "AUTHORIZED" | "PAID" | "DECLINED" | "FAILED" | "VOIDED" | "EXPIRED"
  | "REFUNDED" | "CHARGEBACK_OPENED" | "CHARGEBACK_LOST" | "CHARGEBACK_REPRESENTED"
  | "UNCLEAR";                // a status whose meaning NETOPIA has not confirmed (§2.4.4): never acted on alone

export type SavedCard = Readonly<{ token: SecretToken; expMonth: number | null; expYear: number | null; last4: string | null }>;

export type DeclineSide = "CARD" | "MERCHANT";   // §2.4.5: only CARD declines start the dunning

export type PaymentReport = Readonly<{
  orderId: string; providerPaymentId: string; state: PaymentState;
  providerStatus: string;     // NETOPIA's number, as text, for records and support
  amountMicros: number | null; currency: string | null;
  cardCountry: string | null; // ISO alpha-2, from the issuer's numeric code; null when absent
  savedCard: SavedCard | null;
  declineCode: string | null; declineSide: DeclineSide | null; bankDeclined: boolean;
  occurredAt: Date | null;    // §2.4.3's parsing rule; null when NETOPIA gives no usable time
  clientId: string | null;    // as NETOPIA echoes it, when it does
}>;

export interface CardPayments {
  readonly provider: PaymentProvider;
  readonly environment: PaymentEnvironment;
  startHostedPayment(i: HostedPaymentStart): Promise<HostedPaymentStarted>;
  chargeSavedCard(i: SavedCardCharge): Promise<PaymentReport>;
  status(i: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER">;
  /** Absent until NETOPIA confirms its refund call (N-10). RefundDesk then hands refunds to the owner (§2.12). */
  refund?(i: Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>): Promise<PaymentReport>;
}

/**
 * The only errors a port method throws (§2.3's table). A decline is never one of them: it is a PaymentReport with
 * state DECLINED. PAYMENT_PAYER_INCOMPLETE is a programming error the caller must have prevented (§2.4.2).
 */
export type PaymentErrorCode =
  | "PAYMENT_PROVIDER_UNAVAILABLE" | "PAYMENT_OUTCOME_UNKNOWN" | "PAYMENT_CREDENTIALS_REFUSED"
  | "PAYMENT_CONFIGURATION_REFUSED" | "PAYMENT_RESPONSE_INVALID" | "PAYMENT_PAYER_INCOMPLETE";

const PAYMENT_ERROR_CODES: ReadonlySet<string> = new Set<PaymentErrorCode>([
  "PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_OUTCOME_UNKNOWN", "PAYMENT_CREDENTIALS_REFUSED",
  "PAYMENT_CONFIGURATION_REFUSED", "PAYMENT_RESPONSE_INVALID", "PAYMENT_PAYER_INCOMPLETE"
]);
/** The codes that prove nothing reached NETOPIA's books: no money can have moved. */
const NOTHING_SENT: ReadonlySet<string> = new Set<PaymentErrorCode>([
  "PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_CREDENTIALS_REFUSED", "PAYMENT_CONFIGURATION_REFUSED"
]);
/** A detail is a short code (NETOPIA's error code, an HTTP status, "redirect", a field name), never free text. */
const DETAIL = /^[A-Za-z0-9_.-]{1,32}$/u;

/** A TypedDomainError whose code (and message) is `code` or `code:detail`; any other detail is dropped. */
export function paymentError(code: PaymentErrorCode, detail?: string): TypedDomainError {
  const full = detail !== undefined && DETAIL.test(detail) ? `${code}:${detail}` : code;
  return new TypedDomainError(full, full);
}

/** The base code of a payment error (detail stripped), or null for anything else. */
export function paymentErrorCode(error: unknown): PaymentErrorCode | null {
  if (!(error instanceof TypedDomainError)) return null;
  const colon = error.code.indexOf(":");
  const base = colon < 0 ? error.code : error.code.slice(0, colon);
  return PAYMENT_ERROR_CODES.has(base) ? base as PaymentErrorCode : null;
}

/** True for the codes that prove nothing reached NETOPIA (UNAVAILABLE, CREDENTIALS_REFUSED, CONFIGURATION_REFUSED). */
export function paymentNothingSent(error: unknown): boolean {
  const code = paymentErrorCode(error);
  return code !== null && NOTHING_SENT.has(code);
}
