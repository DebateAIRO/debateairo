import { TypedDomainError } from "@debateai/kernel";
import type { PriceCurrency, SubscriptionState, TaxEngine, TaxLocation, TaxQuote } from "@debateai/billing-core";
import type { BillingRepository } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import { taxServiceRefusal } from "./quote.js";
import {
  openBillingProfile,
  openQuoteLocation,
  taxLocationOf,
  type BillingProfile,
  type QuoteLocation
} from "./records.js";

/**
 * R-39: everything a later quote for this subscription needs, read in ONE place: the location sealed on its
 * SUBSCRIBE quote (with the company, when it bought as one) and the latest billing profile. The renewal (P11a),
 * the look-ahead (P11b), upgrades, downgrades and the card change (P12) all price at this location. The VAT id is
 * the one this subscription's own checkout validated and sealed in that location, never a later profile's (P2-M30):
 * A8c can revive an abandoned checkout after a newer checkout under other details wrote the latest profile, and the
 * documents name the buyer from the sealed location, so a zero-VAT charge always prints the VAT id it was priced with.
 */
export type StoredTaxContext = Readonly<{
  quoteLocation: QuoteLocation;
  location: TaxLocation;
  /**
   * Only the VAT id this subscription's checkout validated and sealed in `quoteLocation`, never a later profile's
   * (P2-M30); a reverse charge is the tax service's decision on it.
   */
  taxId: string | null;
  profile: BillingProfile | null;
  customerId: string;
  /** The subscription's currency (CREATED's), which its checkout quote was priced in: every later quote's. */
  currency: PriceCurrency;
}>;

export async function storedTaxContext(
  deps: Readonly<{
    billing: Pick<BillingRepository, "chargesForSubscription" | "quote" | "customerByOwner" | "latestProfile">;
    recordsKey: Buffer;
  }>,
  state: Pick<SubscriptionState, "subscriptionId" | "ownerRef" | "currency">
): Promise<StoredTaxContext> {
  const charges = await deps.billing.chargesForSubscription(state.subscriptionId);
  const initial = charges.find((charge) => charge.kind === "INITIAL");
  const quote = initial === undefined || initial.quoteId === null
    ? null : await deps.billing.quote(initial.quoteId, state.ownerRef);
  const customer = await deps.billing.customerByOwner(state.ownerRef);
  if (quote === null || customer === null) {
    throw new TypedDomainError("BILLING_STORED_CONTEXT_MISSING", "The subscription has no initial quote or customer");
  }
  if (quote.currency !== state.currency) {
    throw new TypedDomainError("BILLING_CURRENCY_MISMATCH", "The subscription and its checkout quote name different currencies");
  }
  const quoteLocation = openQuoteLocation(deps.recordsKey, quote.quoteId, quote.locationCiphertext);
  const latest = await deps.billing.latestProfile(customer.customerId);
  const profile = latest === null ? null : openBillingProfile(deps.recordsKey, customer.customerId, latest.profileCiphertext);
  const company = quoteLocation.company;
  return Object.freeze({
    quoteLocation,
    location: taxLocationOf(quoteLocation),
    taxId: company !== null && company.vatValidated ? company.vatId : null,
    profile,
    customerId: customer.customerId,
    currency: state.currency
  });
}

/**
 * One tax quote at the stored location, with P4's error AS IT IS: `TAX_SERVICE_UNAVAILABLE` (an outage, retried) and
 * `TAX_SERVICE_REFUSED` (permanent until fixed: a revoked key is `QUADERNO_HTTP_401`, a refused request
 * `QUADERNO_HTTP_422`) keep their codes and P4's detail. The renewal path (P11a, P11b) needs the difference.
 */
export async function quoteTaxAt(
  tax: Pick<TaxEngine, "quote">, policy: BillingPolicy, context: StoredTaxContext, netMicros: number, now: Date
): Promise<TaxQuote> {
  return tax.quote({
    netMicros, currency: context.currency, location: context.location, taxId: context.taxId, taxCode: policy.taxCode, date: now
  });
}

/**
 * The same quote for a ROUTE (D6b's P12 upgrade and downgrade quotes): both tax errors become P8b's one 503
 * "try again in a minute", the only answer a person can act on. Never used on the renewal path.
 */
export async function quoteTax(
  tax: Pick<TaxEngine, "quote">, policy: BillingPolicy, context: StoredTaxContext, netMicros: number, now: Date
): Promise<TaxQuote> {
  try {
    return await quoteTaxAt(tax, policy, context, netMicros, now);
  } catch (error) {
    throw taxServiceRefusal(error) ?? error;
  }
}
