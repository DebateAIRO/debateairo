import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SELLER_COMPANY } from "@debateai/billing-core";
import { companyFacts, renderMail, renderWithdrawalForm } from "@debateai/mail-templates";
import { COMPANY } from "../../apps/ui/lib/legal/pages.js";

/**
 * Ruling R3-4: the company facts have ONE source, `COMPANY` in apps/ui/lib/legal/pages.ts (the colleague's PR #42),
 * and the API and the mail read ONE mirror of it, P6a's `SELLER_COMPANY` (`@debateai/billing-core`), which
 * tests/unit/billing-seller-company.test.tsx holds equal to COMPANY. After an edit of COMPANY, copy the same values
 * into packages/billing-core/src/company.ts and commit both files together; nothing in the mail package moves.
 */
const FACTS = Object.freeze({
  legalName: COMPANY.legalName,
  registeredOffice: COMPANY.registeredOffice,
  emailGeneral: COMPANY.emails.general
});

describe("P17 the emails print the company facts of COMPANY, through its one mirror (ruling R3-4)", () => {
  it("reads the three facts it prints from SELLER_COMPANY, and they are COMPANY's", () => {
    expect(companyFacts()).toEqual({
      legalName: SELLER_COMPANY.legalName,
      registeredOffice: SELLER_COMPANY.registeredOffice,
      emailGeneral: SELLER_COMPANY.emails.general
    });
    expect(companyFacts(), "COMPANY changed: copy the same values into packages/billing-core/src/company.ts").toEqual(FACTS);
  });

  it("keeps no mirror of its own: the renderer imports SELLER_COMPANY and reads no company file", () => {
    const source = readFileSync(resolve("packages/mail-templates/src/render.ts"), "utf8");
    expect(source).toContain('import { SELLER_COMPANY, type SellerCompany } from "@debateai/billing-core";');
    expect(source).not.toMatch(/_company\.json|_merchant\.json/u);
  });

  it("prints exactly those facts in every email's footer and in the model withdrawal form", () => {
    expect(renderMail("M10", "en", { plan: "PRO" }).text)
      .toContain(`${COMPANY.legalName}, ${COMPANY.registeredOffice}. Questions: ${COMPANY.emails.general}`);
    expect(renderWithdrawalForm("en"))
      .toContain(`To: ${COMPANY.legalName}, ${COMPANY.registeredOffice}, ${COMPANY.emails.general}`);
  });
});
