import { randomUUID } from "node:crypto";
import { computeWindows, invoiceIssuerFor, type TaxEngine } from "@debateai/billing-core";
import { isRomanianInvoiceLocality } from "@debateai/contract";
import type { BillingRepository, QuoteRow } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { TypedDomainError } from "@debateai/kernel";
import { planById, type BillingPlans, type BillingPolicy, type CountryPolicy, type PlanId } from "@debateai/register";
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
  name: string | null;
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

/**
 * R-15: the issuer the rules give this tax country (SmartBill for Romania) refuses an invoice without the buyer's
 * name, city and county. A company's name is the buyer's name. P2-M15: the county must be one SmartBill names and, in
 * Bucharest, the city a sector (`isRomanianInvoiceLocality`, the same lists the checkout offers), or SPV will not
 * validate the e-Factura. Spec §1.3: US and Canadian sales tax is decided by the state or the ZIP code, so a buyer
 * there gives at least one of the two.
 */
export function addressRequired(location: QuoteLocation, taxCountry: string, policy: BillingPolicy): boolean {
  if ((location.country === "US" || location.country === "CA") && location.region === null && location.postalCode === null) {
    return true;
  }
  if (invoiceIssuerFor(taxCountry, policy.invoiceIssuerRules) !== "SMARTBILL") return false;
  const name = location.company?.name ?? location.name;
  return name === null || location.city === null || location.region === null
    || !isRomanianInvoiceLocality(location.region, location.city);
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
    let taxId: string | null = null;
    let company: QuoteLocation["company"] = null;
    if (input.company !== null) {
      const check = await this.taxCall(this.deps.tax.validateTaxId(place.declaredCountry, input.company.vatId));
      if (!check.valid) throw this.refused(new BillingRefusal(422, "TAX_ID_INVALID"));
      taxId = input.company.vatId;
      company = Object.freeze({ ...input.company, vatValidated: true });
    }
    const validated: QuoteLocation = Object.freeze({
      name: input.name, country: place.declaredCountry, region: input.region, postalCode: input.postalCode,
      city: input.city, street: null, ip: input.ip === "unknown" ? null : input.ip, ipCountry: place.ipCountry, company
    });
    const taxQuote = await this.taxCall(this.deps.tax.quote({
      netMicros: plan.netPriceMicros, currency: "USD", location: taxLocationOf(validated), taxId,
      taxCode: this.deps.policy.taxCode, date: input.now
    }));
    if (taxQuote.netMicros !== plan.netPriceMicros) throw this.refused(new BillingRefusal(503, "TAX_SERVICE_UNAVAILABLE"));
    const quoteId = randomUUID();
    const sealed = sealQuoteLocation(this.deps.recordsKey, quoteId, validated);
    const quote = Object.freeze({
      quoteId, ownerRef: input.ownerRef, planId: input.planId, kind: "SUBSCRIBE",
      netMicros: taxQuote.netMicros, taxMicros: taxQuote.taxMicros, totalMicros: taxQuote.totalMicros,
      taxCountry: taxQuote.taxCountry, taxRegion: taxQuote.taxRegion, taxRateBasisPoints: taxQuote.taxRateBasisPoints,
      taxStatus: taxQuote.status, taxName: taxQuote.taxName, quadernoRef: taxQuote.reference,
      expiresAt: new Date(input.now.getTime() + this.deps.policy.quoteTtlSeconds * 1_000), createdAt: input.now,
      locationCiphertext: sealed.ciphertext, keyId: sealed.keyId,
      // R-31: only an UPGRADE quote carries a recurring total different from its amount due (P12c).
      recurringTotalMicros: null
    }) as QuoteRow;
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
