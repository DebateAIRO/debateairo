import type { TaxEngine, TaxStatus } from "@debateai/billing-core";
import type { BillingCurrency } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { planNetPrice, priceCurrencyFor, type BillingPlans, type BillingPolicy, type PlanId } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { taxRefusalDetail } from "./quote.js";

/**
 * Terms §12: "Prices include VAT, GST or sales tax, which depends on where you live". The tax one place adds to every
 * plan, priced in that place's currency, as the plans list shows it before any address is given.
 */
export type DisplayedTax = Readonly<{
  country: string;
  currency: BillingCurrency;
  taxName: string;
  taxRateBasisPoints: number;
  status: TaxStatus;
  /** Every plan's net price in `currency` with the place's tax, in micro-units; the free plan's is 0. */
  totalMicros: ReadonlyMap<PlanId, number>;
}>;

/**
 * Where a visitor lives, as far as the list's tax needs it: the country, and in the US and Canada (where the state's
 * or province's tax comes from it) the postal code, already checked against the country's format.
 */
export type DisplayedTaxPlace = Readonly<{ country: string; postalCode: string | null }>;

export interface DisplayedTaxPort {
  /** Null while the tax service has not answered for the place. */
  read(place: DisplayedTaxPlace): Promise<DisplayedTax | null>;
}

type Entry = { value: DisplayedTax | null; freshUntil: number; pending: Promise<DisplayedTax | null> | null };

/** Rates change by law, a few times a year; a quarter of a day keeps a change from waiting past the next morning. */
const FRESH_MS = 6 * 60 * 60 * 1_000;
/** A place the tax service could not price is asked again after a minute, never on every visit. */
const RETRY_MS = 60 * 1_000;
/**
 * The longest a visitor's page waits for a refresh (Quaderno's client may take two 5-second attempts); past it the page
 * gets the last answer, or none, and the refresh still finishes for the visitors after.
 */
const WAIT_MS = 2_000;
/**
 * The places kept at once. Countries are a few hundred; US and Canadian postal codes come from visitors, so the least
 * recently read place makes room for a new one rather than the cache growing with every code typed.
 */
const MAX_PLACES = 4_096;

/** An answer that is not the plan's net, or not in the place's currency: never shown as the place's price. */
const ANSWER_MISMATCH = "TAX_ANSWER_MISMATCH";

/** The audit line's content-free codes: the tax engine's own (P4's detail beside it), or the mismatch. */
function failureFields(error: unknown): Readonly<Record<string, string>> {
  if (error instanceof TypedDomainError && error.code === ANSWER_MISMATCH) return { code: ANSWER_MISMATCH };
  if (error instanceof TypedDomainError && /^TAX_SERVICE_[A-Z]{1,24}$/u.test(error.code)) {
    return { code: error.code, reason: taxRefusalDetail(error) };
  }
  return { code: "UNKNOWN" };
}

/**
 * The plans list's tax, per place, from the tax engine the quote asks (Quaderno), with the place as the location: the
 * country, and in the US and Canada the postal code the checkout's quote also sends, so the card and the checkout
 * agree. One answer per place is kept for `FRESH_MS`, one request at a time asks for it, and a failed refresh keeps
 * the last answer, so a tax-service outage leaves the cards as they were.
 */
export class DisplayedTaxReader implements DisplayedTaxPort {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly deps: Readonly<{
    tax: Pick<TaxEngine, "quote">;
    plans: BillingPlans;
    policy: Pick<BillingPolicy, "taxCode">;
    audit: BillingAudit;
    clock: () => Date;
    /** Tests only: `WAIT_MS` and `MAX_PLACES` otherwise. */
    waitMs?: number;
    maxPlaces?: number;
  }>) {}

  async read(place: DisplayedTaxPlace): Promise<DisplayedTax | null> {
    const now = this.deps.clock().getTime();
    const key = place.postalCode === null ? place.country : `${place.country} ${place.postalCode}`;
    const entry = this.#entries.get(key) ?? { value: null, freshUntil: 0, pending: null };
    // Map order is read order: the first key is the least recently read place.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    if (this.#entries.size > (this.deps.maxPlaces ?? MAX_PLACES)) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    if (now < entry.freshUntil) return entry.value;
    entry.pending ??= this.#refresh(place, entry, now).finally(() => { entry.pending = null; });
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<DisplayedTax | null>((resolve) => {
      timer = setTimeout(() => resolve(entry.value), this.deps.waitMs ?? WAIT_MS);
      timer.unref();
    });
    return Promise.race([entry.pending, waited]).finally(() => clearTimeout(timer));
  }

  async #refresh(place: DisplayedTaxPlace, entry: Entry, now: number): Promise<DisplayedTax | null> {
    try {
      entry.value = await this.#price(place, new Date(now));
      entry.freshUntil = now + FRESH_MS;
    } catch (error) {
      // The country only, never the postal code: an audit line carries no part of an address.
      this.deps.audit("billing.plans.tax_unavailable", { country: place.country, ...failureFields(error) });
      entry.freshUntil = now + RETRY_MS;
    }
    return entry.value;
  }

  async #price(place: DisplayedTaxPlace, date: Date): Promise<DisplayedTax> {
    const { country } = place;
    const currency = priceCurrencyFor(this.deps.plans, country);
    const location = Object.freeze({
      country, region: null, postalCode: place.postalCode, city: null, street: null, ip: null
    });
    const quotes = await Promise.all(this.deps.plans.plans.map(async (plan) => {
      const netMicros = planNetPrice(plan, currency);
      if (netMicros === 0) return { planId: plan.planId, quote: null };
      const quote = await this.deps.tax.quote({
        netMicros, currency, location, taxId: null, taxCode: this.deps.policy.taxCode, date
      });
      // The quote's own rule: the plan's net, for a country of that currency, or not the price this visitor would pay.
      if (quote.netMicros !== netMicros || quote.totalMicros !== netMicros + quote.taxMicros
        || priceCurrencyFor(this.deps.plans, quote.taxCountry) !== currency) {
        throw new TypedDomainError(ANSWER_MISMATCH, ANSWER_MISMATCH);
      }
      return { planId: plan.planId, quote };
    }));
    const first = quotes.find((priced) => priced.quote !== null)?.quote;
    if (first === undefined) throw new TypedDomainError(ANSWER_MISMATCH, ANSWER_MISMATCH);
    return Object.freeze({
      country, currency, taxName: first.taxName, taxRateBasisPoints: first.taxRateBasisPoints, status: first.status,
      totalMicros: new Map(quotes.map((priced) => [priced.planId, priced.quote?.totalMicros ?? 0]))
    });
  }
}
