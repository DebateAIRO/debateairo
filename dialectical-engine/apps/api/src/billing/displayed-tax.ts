import type { TaxEngine, TaxStatus } from "@debateai/billing-core";
import type { BillingCurrency } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { planNetPrice, priceCurrencyFor, type BillingPlans, type BillingPolicy, type PlanId } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { PRICED_REGION_COUNTRIES } from "./invoice-common.js";
import { taxRefusalDetail } from "./quote.js";

/**
 * Terms §12: "Prices include VAT, GST or sales tax, which depends on where you live". The tax one country adds to every
 * plan, priced in that country's currency, as the plans list shows it before any address is given.
 */
export type DisplayedTax = Readonly<{
  country: string;
  currency: BillingCurrency;
  taxName: string;
  taxRateBasisPoints: number;
  status: TaxStatus;
  /** Every plan's net price in `currency` with the country's tax, in micro-units; the free plan's is 0. */
  totalMicros: ReadonlyMap<PlanId, number>;
}>;

export interface DisplayedTaxPort {
  /**
   * Null where the country alone cannot price the tax (the state's or province's tax is only known from the postal
   * code), or while the tax service has not answered for it yet.
   */
  read(country: string): Promise<DisplayedTax | null>;
}

type Entry = { value: DisplayedTax | null; freshUntil: number; pending: Promise<DisplayedTax | null> | null };

/** Rates change by law, a few times a year; a quarter of a day keeps a change from waiting past the next morning. */
const FRESH_MS = 6 * 60 * 60 * 1_000;
/** A country the tax service could not price is asked again after a minute, never on every visit. */
const RETRY_MS = 60 * 1_000;
/**
 * The longest a visitor's page waits for a refresh (Quaderno's client may take two 5-second attempts); past it the page
 * gets the last answer, or none, and the refresh still finishes for the visitors after.
 */
const WAIT_MS = 2_000;

/** An answer that is not the plan's net, or not in the country's currency: never shown as the country's price. */
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
 * The plans list's tax, per country, from the tax engine the quote asks (Quaderno), with the country alone as the
 * location: the same answer the checkout's first quote gets before the address is typed, so the card and the
 * checkout agree. That holds only where the country alone sets the tax: in the US and Canada the state's or
 * province's tax comes from the postal code the checkout asks for, so a country-only answer would show a total lower
 * than the charge, and there the reader answers null (the prices before tax). One answer per country is kept for
 * `FRESH_MS`, one request at a time asks for it, and a failed refresh keeps the last answer, so a tax-service outage
 * leaves the cards as they were.
 */
export class DisplayedTaxReader implements DisplayedTaxPort {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly deps: Readonly<{
    tax: Pick<TaxEngine, "quote">;
    plans: BillingPlans;
    policy: Pick<BillingPolicy, "taxCode">;
    audit: BillingAudit;
    clock: () => Date;
    /** Tests only: `WAIT_MS` otherwise. */
    waitMs?: number;
  }>) {}

  async read(country: string): Promise<DisplayedTax | null> {
    if (PRICED_REGION_COUNTRIES.has(country)) return null;
    const now = this.deps.clock().getTime();
    const entry = this.#entries.get(country) ?? { value: null, freshUntil: 0, pending: null };
    this.#entries.set(country, entry);
    if (now < entry.freshUntil) return entry.value;
    entry.pending ??= this.#refresh(country, entry, now).finally(() => { entry.pending = null; });
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<DisplayedTax | null>((resolve) => {
      timer = setTimeout(() => resolve(entry.value), this.deps.waitMs ?? WAIT_MS);
      timer.unref();
    });
    return Promise.race([entry.pending, waited]).finally(() => clearTimeout(timer));
  }

  async #refresh(country: string, entry: Entry, now: number): Promise<DisplayedTax | null> {
    try {
      entry.value = await this.#price(country, new Date(now));
      entry.freshUntil = now + FRESH_MS;
    } catch (error) {
      this.deps.audit("billing.plans.tax_unavailable", { country, ...failureFields(error) });
      entry.freshUntil = now + RETRY_MS;
    }
    return entry.value;
  }

  async #price(country: string, date: Date): Promise<DisplayedTax> {
    const currency = priceCurrencyFor(this.deps.plans, country);
    const location = Object.freeze({ country, region: null, postalCode: null, city: null, street: null, ip: null });
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
