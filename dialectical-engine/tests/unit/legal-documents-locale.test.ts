import { describe, expect, it } from "vitest";
import { assertLegalLocale } from "../../apps/ui/scripts/legal-locale-check.mjs";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";

function clone(document: LegalDocument): LegalDocument {
  return structuredClone(document);
}

describe("localized legal-document structure", () => {
  it("rejects an unchanged English document presented as Japanese", () => {
    expect(() =>
      assertLegalLocale({
        english: PRIVACY_POLICY,
        localized: clone(PRIVACY_POLICY),
        locale: "ja",
        key: "privacy"
      })
    ).toThrow(/Japanese|ja|English|translated/i);
  });
});
