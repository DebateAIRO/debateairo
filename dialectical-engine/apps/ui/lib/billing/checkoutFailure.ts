import { ContractHttpError } from "@debateai/contract";

/** Server refusal code → the billing sentence that says it plainly. Anything else is the generic sentence. */
const KEY_BY_SERVER_CODE: Readonly<Record<string, string>> = Object.freeze({
  COUNTRY_PAYMENT_UNAVAILABLE: "billing.checkout.countryUnavailable",
  COUNTRY_UNKNOWN: "billing.checkout.countryUnavailable",
  TOR_REFUSED: "billing.checkout.countryUnavailable",
  COUNTRY_BLOCKED: "billing.checkout.countryUnavailable",
  TAX_ID_INVALID: "billing.checkout.taxIdInvalid",
  TAX_SERVICE_UNAVAILABLE: "billing.checkout.serviceUnavailable",
  ALREADY_SUBSCRIBED: "billing.checkout.alreadySubscribed",
  QUOTE_EXPIRED: "billing.checkout.quoteExpired",
  // CheckoutFlow shows this sentence as a link to the accept screen (W10, P2-M20).
  LEGAL_REACCEPTANCE_REQUIRED: "billing.checkout.reacceptRequired",
  // W10 (P2-M19, 429): the hourly budget of quotes (shared with plan and card changes) or of checkouts is spent.
  ADMISSION_RATE_LIMITED: "billing.checkout.rateLimited",
  // P8c compares the consent pair with the reader's locale's manifest entry: a page older than a sentence edit.
  LEGAL_DOCUMENT_STALE: "billing.checkout.pageOutdated",
  // G3: the server wants the "Yes, I live there" confirmation first.
  COUNTRY_CONFIRMATION_REQUIRED: "billing.checkout.confirmCountryRequired",
  // N18 (spec §2.6.2 step 8): NETOPIA's page could not be opened; nothing was charged.
  PAYMENT_PROVIDER_UNAVAILABLE: "billing.checkout.formUnavailable",
  // N18 (spec §2.6.1): a payer field NETOPIA needs is missing, or the phone has no country code.
  BILLING_ADDRESS_REQUIRED: "billing.checkout.detailsRequired",
  BILLING_PHONE_INVALID: "billing.checkout.phoneInvalid",
  // D6b P15 (409): an account deletion is pending, so the quote and the checkout take no new money.
  ACCOUNT_ERASURE_PENDING: "billing.checkout.erasurePending",
  // P8c's age guard (R3-2, 503): the server could not read the one-time age check, so it took nothing. Try again.
  AGE_CHECK_UNAVAILABLE: "billing.checkout.genericError",
  // P8c's age guard (R3-2, 403): CheckoutFlow sends the person to the age gate's interstitial instead of a sentence;
  // should the code ever reach a sentence, it is the generic one, never a wrong specific one.
  AGE_CONFIRMATION_REQUIRED: "billing.checkout.genericError"
});

export function checkoutFailureKey(failure: unknown): string {
  if (failure instanceof ContractHttpError && failure.serverCode !== null) {
    return KEY_BY_SERVER_CODE[failure.serverCode] ?? "billing.checkout.genericError";
  }
  return "billing.checkout.genericError";
}
