import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { assertLegalLocale } from "../../apps/ui/scripts/legal-locale-check.mjs";
import { renderLegalModule } from "../../apps/ui/scripts/generate-legal-data.mjs";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import type { LegalDocument, LegalDocumentKey } from "../../apps/ui/lib/legalDocument.js";

const DOCUMENTS = {
  privacy: {
    draft: "privacy-policy.md",
    module: "privacyPolicy.ts",
    exportName: "PRIVACY_POLICY",
    english: PRIVACY_POLICY
  },
  terms: {
    draft: "terms-of-service.md",
    module: "termsOfService.ts",
    exportName: "TERMS_OF_SERVICE",
    english: TERMS_OF_SERVICE
  }
} as const;

describe("localized legal-document completeness", () => {
  for (const { code: locale } of LOCALES) {
    for (const [key, config] of Object.entries(DOCUMENTS) as [
      LegalDocumentKey,
      (typeof DOCUMENTS)[LegalDocumentKey]
    ][]) {
      it(`${locale}/${key} has a draft, a fresh module, and valid structure`, async () => {
        const draftPath = resolve(process.cwd(), "apps/ui/legal", locale, config.draft);
        const outputPath = locale === "en"
          ? resolve(process.cwd(), "apps/ui/lib", config.module)
          : resolve(process.cwd(), "apps/ui/lib/legal", locale, config.module);
        await access(draftPath);
        await access(outputPath);
        const markdown = await readFile(draftPath, "utf8");
        const committed = await readFile(outputPath, "utf8");
        expect(renderLegalModule(markdown, key, locale), `${outputPath} is stale`).toBe(committed);
        const module = await import(`${pathToFileURL(outputPath).href}?fresh=${Date.now()}`) as Record<
          string,
          LegalDocument
        >;
        assertLegalLocale({
          english: config.english,
          localized: module[config.exportName]!,
          locale,
          key
        });
      });
    }
  }
});
