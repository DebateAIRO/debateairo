import { randomUUID } from "node:crypto";
import { computeWindows, invoiceIssuerFor, type TaxEngine } from "@debateai/billing-core";
import { e164Phone, isRomanianInvoiceLocality, postcodeOptional } from "@debateai/contract";
import type { BillingRepository, QuoteRow } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { TypedDomainError } from "@debateai/kernel";
import {
  planById,
  planNetPrice,
  priceCurrencyFor,
  type BillingPlans,
  type BillingPolicy,
  type CountryPolicy,
  type PlanId
} from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { sealQuoteLocation, taxLocationOf, type QuoteLocation } from "./records.js";
import { BillingRefusal } from "./refusal.js";

/** Plan tier during states (spec §2.5.6): a person in one of these may not start a second subscription. */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "SUSPENDED"]);

export type QuoteInput = Readonly<{
  ownerRef: string;
  ip: string;
  planId: Exclude<PlanId, "FREE">;
  /** Null: the connection's country (P19's pre-fill). */
  country: string | null;
  /** Older pages' single name; ignored when both firstName and lastName are given. */
  name: string | null;
  /** Spec 2026-10-05 §2.6.1: NETOPIA's cardholder (names, phone as typed, street). */
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  street: string | null;
  region: string | null;
  postalCode: string | null;
  city: string | null;
  company: Readonly<{ name: string; vatId: string; address: string }> | null;
  now: Date;
}>;

export type QuoteResult = Readonly<{
  quote: QuoteRow;
  declaredCountry: string;
  countryConfirmNeeded: boolean;
  ipCountry: string;
  addressRequired: boolean;
  renewsOn: Date;
  withdrawalDays: number | null;
}>;

export interface QuoteServicePort {
  create(input: QuoteInput): Promise<QuoteResult>;
}

/**
 * For a ROUTE only (the quote here, D6b's P12 quotes through P11a's `quoteTax`): TAX_SERVICE_UNAVAILABLE / _REFUSED
 * (P4) become the one 503 "try again in a minute", the only answer a person can act on; anything else is a bug. The
 * renewal path never collapses them (P11a's `quoteTaxAt`): a refusal there is an operator alarm, not an outage.
 */
export function taxServiceRefusal(error: unknown): BillingRefusal | null {
  return error instanceof TypedDomainError
    && (error.code === "TAX_SERVICE_UNAVAILABLE" || error.code === "TAX_SERVICE_REFUSED")
    ? new BillingRefusal(503, "TAX_SERVICE_UNAVAILABLE") : null;
}

/**
 * The content-free detail of P4's TAX_SERVICE_REFUSED (Quaderno's status, as `QUADERNO_HTTP_401`), for an audit line;
 * anything else reads `UNKNOWN`.
 */
export function taxRefusalDetail(error: unknown): string {
  return error instanceof TypedDomainError && /^QUADERNO_[A-Z0-9_]{1,48}$/.test(error.message) ? error.message : "UNKNOWN";
}

/** A31 (h), R-15: the countries whose region the invoice and the tax need (state, province, county). */
const REGION_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA", "RO"]);

/**
 * Spec 2026-10-05 §2.6.1: NETOPIA needs the full cardholder on every payment: names, phone, street, city, the postal code
 * (optional only for `postcodeOptional`'s list) and the region in the US, Canada and Romania. R-15 / P2-M15 still hold
 * for a Romanian invoice. The checkout's 422 BILLING_ADDRESS_REQUIRED holds a crafted request to the same rule.
 */
export function addressRequired(location: QuoteLocation, taxCountry: string, policy: BillingPolicy): boolean {
  if (location.firstName === null || location.lastName === null || location.phone === null) return true;
  if (location.street === null || location.city === null) return true;
  if (location.postalCode === null && !postcodeOptional(location.country)) return true;
  if (REGION_COUNTRIES.has(location.country) && location.region === null) return true;
  if (invoiceIssuerFor(taxCountry, policy.invoiceIssuerRules) !== "SMARTBILL") return false;
  const name = location.company?.name ?? location.name;
  return name === null || location.region === null || !isRomanianInvoiceLocality(location.region, location.city);
}

export class QuoteService implements QuoteServicePort {
  constructor(private readonly deps: Readonly<{
    repository: Pick<BillingRepository, "withTransaction" | "insertQuote" | "subscriptionForOwner" | "ownerErasurePending">;
    tax: Pick<TaxEngine, "quote" | "validateTaxId">;
    geo: GeoLookup;
    countryPolicy: CountryPolicy;
    policy: BillingPolicy;
    plans: BillingPlans;
    recordsKey: Buffer;
    audit: BillingAudit;
  }>) {}

  private refused(refusal: BillingRefusal): BillingRefusal {
    this.deps.audit("billing.quote.refused", { code: refusal.code });
    return refusal;
  }

  /**
   * The person always gets the one 503 (`taxServiceRefusal`). P2-M27: the audit line names what really happened, so a
   * wrong or revoked Quaderno key (TAX_SERVICE_REFUSED, with P4's detail) is never read as an outage, as the
   * renewal's `billing.renewal.tax_refused` line does.
   */
  private taxCall<T>(call: Promise<T>): Promise<T> {
    return call.catch((error: unknown) => {
      const refusal = taxServiceRefusal(error);
      if (refusal === null) throw error;
      if (error instanceof TypedDomainError && error.code === "TAX_SERVICE_REFUSED") {
        this.deps.audit("billing.quote.refused", { code: "TAX_SERVICE_REFUSED", reason: taxRefusalDetail(error) });
        throw refusal;
      }
      throw this.refused(refusal);
    });
  }

  async create(input: QuoteInput): Promise<QuoteResult> {
    // P15: an account being erased takes no new money (the person stays signed in for the 7-day grace).
    if (await this.deps.repository.ownerErasurePending(input.ownerRef)) {
      throw this.refused(new BillingRefusal(409, "ACCOUNT_ERASURE_PENDING"));
    }
    const existing = await this.deps.repository.subscriptionForOwner(input.ownerRef);
    if (existing !== null && LIVE_SUBSCRIPTION_STATUSES.has(existing.status)) {
      throw this.refused(new BillingRefusal(409, "ALREADY_SUBSCRIBED"));
    }
    const plan = planById(this.deps.plans, input.planId);
    const place = decidePaymentPlace({
      geo: this.deps.geo, policy: this.deps.countryPolicy, ip: input.ip, declaredCountry: input.country
    });
    if (place.kind === "REFUSE") throw this.refused(placeRefusal(place, this.deps.audit));
    // Spec 2026-10-05 §2.6.1: the server keeps the phone as E.164; a number it cannot read is refused, never guessed.
    const phone = input.phone === null ? null : e164Phone(input.phone);
    if (input.phone !== null && phone === null) throw this.refused(new BillingRefusal(422, "BILLING_PHONE_INVALID"));
    let taxId: string | null = null;
    let company: QuoteLocation["company"] = null;
    if (input.company !== null) {
      const check = await this.taxCall(this.deps.tax.validateTaxId(place.declaredCountry, input.company.vatId));
      if (!check.valid) throw this.refused(new BillingRefusal(422, "TAX_ID_INVALID"));
      taxId = input.company.vatId;
      company = Object.freeze({ ...input.company, vatValidated: true });
    }
    // Spec §2.5.3: `name` is "first + last" for the invoice issuers (R-15 reads it unchanged).
    const name = input.firstName !== null && input.lastName !== null ? `${input.firstName} ${input.lastName}` : input.name;
    const validated: QuoteLocation = Object.freeze({
      name, firstName: input.firstName, lastName: input.lastName, phone, country: place.declaredCountry,
      region: input.region, postalCode: input.postalCode, city: input.city, street: input.street,
      ip: input.ip === "unknown" ? null : input.ip, ipCountry: place.ipCountry, company
    });
    // Spec 2026-10-05 §2.16.1: the tax location's country picks the currency, and the plan's price in it.
    const currency = priceCurrencyFor(this.deps.plans, validated.country);
    const netMicros = planNetPrice(plan, currency);
    const taxQuote = await this.taxCall(this.deps.tax.quote({
      netMicros, currency, location: taxLocationOf(validated), taxId, taxCode: this.deps.policy.taxCode, date: input.now
    }));
    // The tax is the plan's net in that currency, for a country of that currency, or the quote is not ours to sell.
    if (taxQuote.netMicros !== netMicros || priceCurrencyFor(this.deps.plans, taxQuote.taxCountry) !== currency) {
      throw this.refused(new BillingRefusal(503, "TAX_SERVICE_UNAVAILABLE"));
    }
    const quoteId = randomUUID();
    const sealed = sealQuoteLocation(this.deps.recordsKey, quoteId, validated);
    const quote: QuoteRow = Object.freeze({
      quoteId, ownerRef: input.ownerRef, planId: input.planId, kind: "SUBSCRIBE",
      netMicros: taxQuote.netMicros, taxMicros: taxQuote.taxMicros, totalMicros: taxQuote.totalMicros,
      taxCountry: taxQuote.taxCountry, taxRegion: taxQuote.taxRegion, taxRateBasisPoints: taxQuote.taxRateBasisPoints,
      taxStatus: taxQuote.status, taxName: taxQuote.taxName, quadernoRef: taxQuote.reference,
      expiresAt: new Date(input.now.getTime() + this.deps.policy.quoteTtlSeconds * 1_000), createdAt: input.now,
      locationCiphertext: sealed.ciphertext, keyId: sealed.keyId,
      // R-31: only an UPGRADE quote carries a recurring total different from its amount due (P12c).
      recurringTotalMicros: null, currency
    });
    await this.deps.repository.withTransaction((client) => this.deps.repository.insertQuote(client, quote));
    return Object.freeze({
      quote,
      declaredCountry: place.declaredCountry,
      countryConfirmNeeded: place.kind === "CONFIRM_COUNTRY",
      ipCountry: place.ipCountry,
      addressRequired: addressRequired(validated, taxQuote.taxCountry, this.deps.policy),
      renewsOn: computeWindows(input.now, input.now).month.end,
      withdrawalDays: this.deps.policy.withdrawalCountries.includes(taxQuote.taxCountry) ? this.deps.policy.withdrawalDays : null
    });
  }
}
