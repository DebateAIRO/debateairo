// acceptance/billing-fakes/tax-rules.ts
// The fixed tax table both fakes use (the in-memory FakeTaxEngine and the HTTP fake Quaderno).
export type FakeTaxDecision = Readonly<{
  status: "TAXABLE" | "NON_TAXABLE" | "NOT_REGISTERED" | "REVERSE_CHARGE";
  basisPoints: number; name: string; country: string; region: string | null;
}>;

const COUNTRY_RATES: ReadonlyMap<string, Readonly<{ basisPoints: number; name: string }>> = new Map([
  ["RO", { basisPoints: 2100, name: "VAT" }],
  ["DE", { basisPoints: 1900, name: "MwSt." }],
  ["FR", { basisPoints: 2000, name: "TVA" }]
]);
const US_REGION_RATES: ReadonlyMap<string, Readonly<{ basisPoints: number; name: string }>> = new Map([
  ["TX", { basisPoints: 625, name: "Sales tax" }]
]);
const HOME_COUNTRY = "RO";
/**
 * Where a VALID company id makes the fake sale a reverse charge: every EU/EEA country but Romania (the EU 27 without
 * RO, plus IS, LI, NO). Romanian B2B stays domestic TAXABLE, and outside the EU/EEA there is no reverse charge — a
 * deliberate narrowing of spec §2.5.7's "reverse_charge for a VAT ID with VALID in it".
 */
export const FAKE_REVERSE_CHARGE_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV",
  "MT", "NL", "PL", "PT", "SE", "SI", "SK", "IS", "LI", "NO"
]);

export function fakeTaxIdIsValid(taxId: string): boolean {
  return taxId.includes("VALID") && !taxId.includes("INVALID");
}

export function fakeUsRegionFromPostalCode(postalCode: string | null): string | null {
  return postalCode !== null && /^7[5-9][0-9]{3}/u.test(postalCode) ? "TX" : null;
}

export function fakeTaxDecision(i: Readonly<{ country: string; region: string | null; taxId: string | null }>): FakeTaxDecision {
  const country = i.country.toUpperCase();
  const rate = COUNTRY_RATES.get(country);
  if (i.taxId !== null && fakeTaxIdIsValid(i.taxId) && country !== HOME_COUNTRY && FAKE_REVERSE_CHARGE_COUNTRIES.has(country)) {
    return { status: "REVERSE_CHARGE", basisPoints: 0, name: "Reverse charge", country, region: null };
  }
  if (country === "US") {
    const region = i.region === null ? null : i.region.toUpperCase();
    const state = region === null ? undefined : US_REGION_RATES.get(region);
    return state === undefined
      ? { status: "NOT_REGISTERED", basisPoints: 0, name: "Sales tax", country, region }
      : { status: "TAXABLE", basisPoints: state.basisPoints, name: state.name, country, region };
  }
  return rate === undefined
    ? { status: "NOT_REGISTERED", basisPoints: 0, name: "VAT", country, region: null }
    : { status: "TAXABLE", basisPoints: rate.basisPoints, name: rate.name, country, region: null };
}

/** Rounded half up to the cent. */
export function fakeTaxMicros(netMicros: number, basisPoints: number): number {
  const exactMicros = (BigInt(netMicros) * BigInt(basisPoints)) / 10_000n;
  return Number(((exactMicros + 5_000n) / 10_000n) * 10_000n);
}
