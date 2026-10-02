// tests/unit/billing-seller-company.test.tsx
// A .tsx on purpose (like tests/unit/s10-erasure-ui-render.test.tsx): it imports apps/ui/lib/legal/pages.ts, whose
// own imports carry no extension, so the root NodeNext typecheck (tests/**/*.ts) must not read it; vitest does.
import { describe, expect, it } from "vitest";
import { SELLER_COMPANY, isUnverifiedCompanyFact } from "@debateai/billing-core";
import { COMPANY, isUnverified } from "../../apps/ui/lib/legal/pages.js";

describe("P6a — the API's mirror of the company facts (RULINGS-R3 R3-4)", () => {
  it("is COMPANY from apps/ui/lib/legal/pages.ts value for value, brackets included", () => {
    expect(
      SELLER_COMPANY,
      "apps/ui/lib/legal/pages.ts COMPANY and packages/billing-core/src/company.ts SELLER_COMPANY differ: " +
        "COMPANY is the one source of truth — copy the same values into SELLER_COMPANY in the same commit"
    ).toEqual(COMPANY);
  });

  it("is frozen all the way down, as COMPANY is", () => {
    expect(Object.isFrozen(SELLER_COMPANY)).toBe(true);
    for (const inner of [SELLER_COMPANY.tradingNames, SELLER_COMPANY.vat, SELLER_COMPANY.emails, SELLER_COMPANY.languages]) {
      expect(Object.isFrozen(inner)).toBe(true);
    }
  });

  it("calls a fact unverified exactly when the legal notice does", () => {
    for (const value of [SELLER_COMPANY.cui, SELLER_COMPANY.phone, SELLER_COMPANY.emails.privacy, "RO12345678", "[+40 …]"]) {
      expect(isUnverifiedCompanyFact(value), value).toBe(isUnverified(value));
    }
  });

  it("keeps the CUI digits only (or still bracketed), so /legal's CUI row never shows the RO VAT code", () => {
    // /legal shows COMPANY.cui as "Sole registration code (CUI)" and COMPANY.vat.number as "VAT", two rows
    // (apps/ui/components/legal/LegalBodies.tsx). SmartBill's RO form comes from COMPANY.vat (P6a's
    // SMARTBILL_CIF_FORM), never from an RO-prefixed CUI.
    for (const cui of [COMPANY.cui, SELLER_COMPANY.cui]) {
      expect(
        isUnverified(cui) || /^[0-9]{2,10}$/u.test(cui),
        `CUI "${cui}": digits only, without RO — the RO VAT code belongs in COMPANY.vat (X1 Step 3 item 6)`
      ).toBe(true);
    }
    // Once both are filled, the RO VAT code is RO + the CUI's digits: one fact, never two that disagree.
    const vat = COMPANY.vat;
    if (vat.kind === "registered" && !isUnverified(vat.number) && !isUnverified(COMPANY.cui)) {
      expect(vat.number, "COMPANY.vat.number is RO + COMPANY.cui").toBe(`RO${COMPANY.cui}`);
    }
  });
});
