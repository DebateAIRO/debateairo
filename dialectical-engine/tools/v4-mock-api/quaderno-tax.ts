import { DisplayedTaxReader } from "../../apps/api/src/billing/displayed-tax.js";
import { microsToDecimal } from "../../packages/billing-core/src/money.js";
import { readCustodyAuthorizationHeader } from "../../packages/crypto/src/index.js";
import type { BillingPlans, PlanId } from "../../packages/register/src/billing-plans.js";
import { QuadernoTaxEngine } from "../../packages/tax-quaderno/src/index.js";

/** Quaderno's sandbox: test accounts, no real invoices, the same tax answers as live for the account's registrations. */
export const QUADERNO_SANDBOX_URL = "https://sandbox-quadernoapp.com/api";

export type QuadernoPlace = Readonly<{ country: string; postalCode: string | null }>;

/** The plans list's tax for a place, as GET /v1/billing/plans sends it; null while Quaderno has not priced it. */
export type QuadernoPriced = Readonly<{
  tax: Readonly<{ country: string; tax_name: string; tax_rate_bp: number; tax_status: string }>;
  totals: Readonly<Record<PlanId, string>>;
}>;

export type QuadernoPricing = (place: QuadernoPlace) => Promise<QuadernoPriced | null>;

/**
 * Terms §12 against Quaderno itself: every country the page asks for is priced by the API's own reader
 * (`DisplayedTaxReader`, one answer per place kept six hours, a failed one asked again after a minute) over the
 * production Quaderno client, so the mock shows exactly the tax Quaderno answers for that account. A place Quaderno
 * cannot price, or prices in another currency, is null: no price, as the API answers TAX_UNAVAILABLE.
 */
export function quadernoPricing(o: Readonly<{
  plans: BillingPlans; apiKey: string; baseUrl?: string; fetch?: typeof fetch; log?: (line: string) => void;
}>): QuadernoPricing {
  const reader = new DisplayedTaxReader({
    tax: new QuadernoTaxEngine({
      baseUrl: o.baseUrl ?? QUADERNO_SANDBOX_URL, apiKey: o.apiKey, ...(o.fetch === undefined ? {} : { fetch: o.fetch })
    }),
    plans: o.plans,
    // The development register's tax code (billing-policy.ts), as the API's quote sends it.
    policy: { taxCode: "saas" },
    audit: (event, fields) => o.log?.(`${JSON.stringify({ mock: event, ...fields })}\n`),
    clock: () => new Date()
  });
  return async (place) => {
    const read = await reader.read(place);
    // As the route: a price only when every plan has one; never a net price called a total.
    if (read === null || o.plans.plans.some((plan) => !read.totalMicros.has(plan.planId))) return null;
    return Object.freeze({
      tax: Object.freeze({
        country: read.country, tax_name: read.taxName, tax_rate_bp: read.taxRateBasisPoints, tax_status: read.status
      }),
      totals: Object.freeze(Object.fromEntries(o.plans.plans.map((plan) =>
        [plan.planId, microsToDecimal(read.totalMicros.get(plan.planId)!)])) as Record<PlanId, string>)
    });
  };
}

/**
 * MOCK_QUADERNO_API_KEY_PATH (`keyPath`): a file holding the sandbox API key on one line, kept as the API keeps its own
 * (0600, in a 0700 folder you own). Unset or empty, the mock prices from its own table. MOCK_QUADERNO_BASE_URL
 * (`baseUrl`) points at another Quaderno (default the sandbox).
 */
export function quadernoPricingFromKeyFile(o: Readonly<{
  plans: BillingPlans; keyPath: string | undefined; baseUrl: string | undefined; log: (line: string) => void;
}>): QuadernoPricing | null {
  const keyPath = o.keyPath?.trim();
  if (keyPath === undefined || keyPath === "") return null;
  let apiKey: string;
  try {
    apiKey = readCustodyAuthorizationHeader(keyPath);
  } catch (error) {
    throw new Error(`MOCK_QUADERNO_API_KEY_PATH_INVALID: ${(error as Error).name} (one line, 0600, in a 0700 folder you own)`);
  }
  return quadernoPricing({ plans: o.plans, apiKey, baseUrl: o.baseUrl?.trim() || QUADERNO_SANDBOX_URL, log: o.log });
}
