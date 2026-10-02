import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { currentDocument } from "@debateai/legal-manifest";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

describe("P18 the two consent sentences are in the legal manifest", () => {
  it("carries both sentences of every locale, hashed from that locale's billing.json", () => {
    for (const { code } of LOCALES) {
      const billing = JSON.parse(readFileSync(resolve("apps/ui/messages", code, "billing.json"), "utf8")) as Record<string, string>;
      expect(currentDocument("CONSENT_RENEWAL", code), `${code} renewal`)
        .toEqual(consentDocument(billing["billing.consent.renewal"]!));
      expect(currentDocument("CONSENT_IMMEDIATE_START", code), `${code} immediate start`)
        .toEqual(consentDocument(billing["billing.consent.immediateStart"]!));
    }
  });
});
