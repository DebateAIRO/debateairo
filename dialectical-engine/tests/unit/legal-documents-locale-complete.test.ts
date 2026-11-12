import { access, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { assertLegalLocale } from "../../apps/ui/scripts/legal-locale-check.mjs";
import {
  LEGAL_TRANSLATIONS_PATH,
  legalTranslationFollows,
  parseLegalTranslations,
  renderLegalModule
} from "../../apps/ui/scripts/generate-legal-data.mjs";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import type { LegalDocument, LegalDocumentKey } from "../../apps/ui/lib/legalDocument.js";

const DOCUMENTS = {
  privacy: {
    kind: "PRIVACY",
    draft: "privacy-policy.md",
    module: "privacyPolicy.ts",
    exportName: "PRIVACY_POLICY",
    english: PRIVACY_POLICY
  },
  terms: {
    kind: "TERMS",
    draft: "terms-of-service.md",
    module: "termsOfService.ts",
    exportName: "TERMS_OF_SERVICE",
    english: TERMS_OF_SERVICE
  }
} as const;

/** Which English text each translation was translated from (generate-legal-data.mjs, "English first"). */
const TRANSLATIONS = parseLegalTranslations(
  JSON.parse(readFileSync(resolve(process.cwd(), LEGAL_TRANSLATIONS_PATH), "utf8"))
);

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
        const localized = module[config.exportName]!;
        // English first: a translation of an older English text lags by design while work goes on. It is held to the
        // English structure once it is translated from the current English text, and the release check
        // (pnpm run legal:release-check) refuses a release while any language lags. Until then it still carries the
        // shared version number, and a module that is its draft's.
        if (!legalTranslationFollows(TRANSLATIONS, config.kind, locale, config.english.sha256)) {
          expect(localized.version, `${locale}/${key}: version`).toBe(config.english.version);
          expect(localized.key).toBe(key);
          return;
        }
        assertLegalLocale({
          english: config.english,
          localized,
          locale,
          key
        });
      });
    }
  }
});
