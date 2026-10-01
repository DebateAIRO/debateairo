import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPPORT_CAPABILITY_TRANSLATIONS, SUPPORT_TRANSLATED_CAPABILITY_IDS, supportCapabilityName
} from "../../packages/support-kb/src/capability-names.js";
import { localizeSupportControlNames } from "../../packages/support-kb/src/control-names.js";
import { SUPPORT_CONTROL_NAMES } from "../../packages/support-kb/src/ui-labels.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";
import { SUPPORT_ACTION_IDS, SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext } from "../../packages/support-kb/src/context.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";

const msg = (loc: string, ref: string): string => {
  const [ns, key] = ref.split(":") as [string, string];
  return (JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${loc}/${ns}.json`), "utf8")) as Record<string,string>)[key]!
    .replace(/\s*[↗→]\s*$/u, "").trim();
};
// SPEC-v5 R13 KEY rows (docs/missions/cookie-compliance/slices/S05/checks/capability-labels.json): the page link each names.
const KEY_ROWS: Readonly<Record<string, string>> = {
  "ai-transparency": "chrome:chrome.aiTransparency", "legal-notice": "chrome:chrome.legal.notice",
  "legal-terms": "chrome:chrome.legal.terms", "legal-terms-versions": "chrome:chrome.legal.versions",
  "legal-privacy": "chrome:chrome.legal.privacy", "legal-health-data": "chrome:chrome.legal.health",
  "legal-cookies": "chrome:chrome.legal.cookies", "legal-providers": "chrome:chrome.legal.providers",
  "sign-up": "home:home.createAccount", "settings": "chrome:chrome.settings"
};
const OTHER = SUPPORT_LOCALES.filter((l) => l !== "en" && l !== "ro");
const capability = (id: string) => SUPPORT_CAPABILITIES.find((item) => item.id === id)!;
const contextText = (language: (typeof SUPPORT_LOCALES)[number]) => buildSupportKnowledgeContext({
  entries: [], capabilities: SUPPORT_CAPABILITIES, language, query: "", historyText: "", maxCodePoints: 24_000,
  availableActionIds: resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: true, language }).map(({ id }) => id),
  referenceFor: createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001").referenceFor
}).text;

describe("S05 capability names in the model's capability line (SPEC-v5 R13, V-22)", () => {
  it("covers every catalogue capability with exactly one KEY or TRANSLATE row", () => {
    const rows = new Set([...Object.keys(KEY_ROWS), ...SUPPORT_TRANSLATED_CAPABILITY_IDS]);
    expect(rows.size).toBe(20);
    expect(SUPPORT_CAPABILITIES.map(({ id }) => id).sort()).toEqual([...rows].sort());
  });
  it("keeps the catalogue's own name in en and ro", () => {
    for (const item of SUPPORT_CAPABILITIES) {
      expect(supportCapabilityName(item, "en")).toBe(item.labels.en);
      expect(supportCapabilityName(item, "ro")).toBe(item.labels.ro);
    }
  });
  it("names each KEY-row area by the page link its screen shows, in all 33 locales", () => {
    for (const loc of OTHER) for (const [id, ref] of Object.entries(KEY_ROWS))
      expect(supportCapabilityName(capability(id), loc)).toBe(msg(loc, ref));
  });
  it("writes a TRANSLATE-row name in all 33 locales: present, not empty, not the en name, no digit, not a control's label", () => {
    // D-ORCH-S05-2 (N3): each locale's names are compared with its FULL label set — the generated pairs hold only the
    // labels that differ from en, so the en labels a locale shows unchanged ("Account", "Privacy" in it/nl) are added
    // back from the other locales' pairs; the union names all 53 lexicon controls today (asserted, so a control that
    // becomes identical in every locale fails here instead of slipping out of the set).
    const allEn = new Set(OTHER.flatMap((loc) => SUPPORT_CONTROL_NAMES[loc].map(([en]) => en)));
    expect(allEn.size).toBe(53);
    for (const loc of OTHER) {
      const differing = new Set(SUPPORT_CONTROL_NAMES[loc].map(([en]) => en));
      const labels = [...SUPPORT_CONTROL_NAMES[loc].map(([, local]) => local), ...[...allEn].filter((en) => !differing.has(en))];
      for (const id of SUPPORT_TRANSLATED_CAPABILITY_IDS) {
        const name = SUPPORT_CAPABILITY_TRANSLATIONS[loc]?.[id] ?? "";
        expect(name.trim(), `${loc} ${id}`).not.toBe("");
        expect(name.trim().toLowerCase(), `${loc} ${id}`).not.toBe(capability(id).labels.en.trim().toLowerCase());
        expect(name, `${loc} ${id}`).not.toMatch(/\p{Nd}/u);                                   // "Hilfe 6" (N3)
        expect(labels, `${loc} ${id}`).not.toContain(name.trim());                              // D-S05-35 (d), full set
        expect(supportCapabilityName(capability(id), loc)).toBe(name);
      }
      expect(new Set(SUPPORT_CAPABILITIES.map((item) => supportCapabilityName(item, loc))).size, loc).toBe(20);   // N3
    }
  });
  it("names de legal-privacy by its legal page link, never the Privacy settings control", () => {
    expect(supportCapabilityName(capability("legal-privacy"), "de")).toBe(msg("de", "chrome:chrome.legal.privacy"));
    expect(supportCapabilityName(capability("legal-privacy"), "de")).not.toBe(msg("de", "consent:consent.settings.title"));
  });
  it("writes supportCapabilityName into the capability line and never the control-label swap (negative, all 33)", () => {
    for (const loc of OTHER) {
      const text = contextText(loc);
      for (const item of SUPPORT_CAPABILITIES) {
        const name = supportCapabilityName(item, loc);
        expect(text, `${loc} ${item.id}`).toContain(`\n- ${name} | `);
        const swapped = localizeSupportControlNames(item.labels.en, loc);
        if (swapped !== item.labels.en && swapped !== name) expect(text, `${loc} ${item.id}`).not.toContain(`\n- ${swapped} | `);
      }
    }
  });
  it("leaves the en and ro capability lines byte-identical to the catalogue names", () => {
    for (const loc of ["en", "ro"] as const) for (const item of SUPPORT_CAPABILITIES)
      expect(contextText(loc)).toContain(`\n- ${item.labels[loc]} | `);
  });
});
