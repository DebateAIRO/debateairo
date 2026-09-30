/**
 * The two checkout consent sentences (paid-plans spec §2.5.3) are legal documents too: the manifest pins their
 * exact wording per locale, so the acceptance row proves which sentence the person ticked. They live in the
 * `billing` catalogue, under the namespace-prefixed keys every catalogue uses. R-27: a locale whose billing.json
 * does not exist yet, or does not carry the two sentences yet (B10c creates the namespace before P18 writes
 * them), contributes nothing; a billing.json that carries ONE of the two, or an empty one, stops the generator.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONSENT_KEYS = Object.freeze({
  CONSENT_RENEWAL: "billing.consent.renewal",
  CONSENT_IMMEDIATE_START: "billing.consent.immediateStart"
});

/** The version is derived from the hash, so any edit of a sentence is a new version. */
export function consentDocument(text) {
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  return Object.freeze({ version: `sha256-${sha256.slice(0, 12)}`, sha256 });
}

export function buildConsentManifestEntries({ messagesRoot, locales }) {
  const entries = {};
  for (const locale of locales) {
    let catalogue;
    try {
      catalogue = JSON.parse(readFileSync(join(messagesRoot, locale, "billing.json"), "utf8"));
    } catch (error) {
      if (error !== null && typeof error === "object" && error.code === "ENOENT") continue;
      throw error;
    }
    const keys = Object.values(CONSENT_KEYS);
    if (keys.every((key) => !Object.hasOwn(catalogue, key))) continue;
    const documents = {};
    for (const [kind, key] of Object.entries(CONSENT_KEYS)) {
      const text = catalogue[key];
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error(`${locale}/billing.json: ${key} missing`);
      }
      documents[kind] = consentDocument(text);
    }
    entries[locale] = Object.freeze(documents);
  }
  return Object.freeze(entries);
}
