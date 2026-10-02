// packages/billing-core/src/company.ts
/**
 * The company and seller facts for the API and the billing mail (RULINGS-R3 R3-4). The ONE source of truth is
 * `COMPANY` in apps/ui/lib/legal/pages.ts, which the legal notice (/legal) states in 35 locales; packages and the
 * API cannot import the UI, so this is its mirror, value for value. A bracketed value is one the owner or counsel
 * has not confirmed yet and stays bracketed here too. tests/unit/billing-seller-company.test.tsx fails the moment
 * the two differ: fill a fact in COMPANY, then copy it here in the same commit.
 */
export type SellerVatStatus = Readonly<
  { kind: "unconfirmed" } | { kind: "registered"; number: string } | { kind: "not-registered" }
>;

export type SellerCompany = Readonly<{
  legalName: string;
  /** The names the product is sold under, the main one first. */
  tradingNames: readonly string[];
  registeredOffice: string;
  tradeRegisterNo: string;
  /**
   * Codul unic de înregistrare, digits only (never with `RO`): /legal shows it as the CUI row. SmartBill's
   * `companyVatCode` / `cif=` is built from it, or from `vat.number`, as `SMARTBILL_CIF_FORM` in
   * apps/api/src/billing/connectors.ts chooses (P6a; X1 rows 3, 7, 16).
   */
  cui: string;
  /** The VAT status; once registered, `number` is the RO VAT code (`RO` + the CUI's digits), /legal's VAT row. */
  vat: SellerVatStatus;
  shareCapital: string;
  /** The person responsible for the company (its administrator). */
  representative: string;
  phone: string;
  emails: Readonly<{ general: string; legal: string; privacy: string; reports: string; authorities: string }>;
  /** The languages the mailboxes are answered in, in the order the legal notice names them. */
  languages: readonly string[];
}>;

export const SELLER_COMPANY: SellerCompany = Object.freeze({
  legalName: "DebateAIRO S.R.L.",
  tradingNames: Object.freeze(["DebateAI", "Dialectical Engine"]),
  registeredOffice: "[…], București, România",
  tradeRegisterNo: "[J40/…/…]",
  cui: "[…]",
  // The company is VAT-registered (owner, 29 September 2026): COMPANY.vat's value, copied (the mirror test pins it).
  vat: Object.freeze({ kind: "registered", number: "[RO…]" }),
  shareCapital: "[RON …]",
  representative: "[…]",
  phone: "[+40 …]",
  emails: Object.freeze({
    general: "[hello@dezbatere.ro]",
    legal: "[legal@dezbatere.ro]",
    privacy: "privacy@dezbatere.ro",
    reports: "[abuse@dezbatere.ro]",
    authorities: "[dsa@dezbatere.ro]"
  }),
  languages: Object.freeze(["ro", "en"])
});

/** True for a fact still waiting for the owner or counsel — the legal notice's own rule (pages.ts `isUnverified`). */
export function isUnverifiedCompanyFact(value: string): boolean {
  return value.includes("[");
}
