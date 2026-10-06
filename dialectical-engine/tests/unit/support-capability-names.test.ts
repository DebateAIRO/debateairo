import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPPORT_CAPABILITY_TRANSLATIONS, SUPPORT_TRANSLATED_CAPABILITY_IDS, supportCapabilityName
} from "../../packages/support-kb/src/capability-names.js";
import { localizeSupportControlNames } from "../../packages/support-kb/src/control-names.js";
import { SUPPORT_CAPABILITY_KEY_NAMES, SUPPORT_CONTROL_NAMES, SUPPORT_UI_LABELS } from "../../packages/support-kb/src/ui-labels.js";
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
// Paid plans (P24): the five paid-plan pages a screen link names — the footer's three links, the Settings card's
// Update card and the privacy policy's link to its versions list.
const KEY_ROWS: Readonly<Record<string, string>> = {
  "ai-transparency": "chrome:chrome.aiTransparency", "legal-notice": "chrome:chrome.legal.notice",
  "legal-terms": "chrome:chrome.legal.terms", "legal-terms-versions": "chrome:chrome.legal.versions",
  "legal-privacy": "chrome:chrome.legal.privacy", "legal-health-data": "chrome:chrome.legal.health",
  "legal-cookies": "chrome:chrome.legal.cookies", "legal-providers": "chrome:chrome.legal.providers",
  "sign-up": "home:home.createAccount", "settings": "chrome:chrome.settings",
  "billing-pricing": "chrome:chrome.footer.pricing", "billing-card-change": "billing:billing.subscription.updateCard",
  "billing-cancel": "chrome:chrome.footer.cancel", "billing-withdraw": "chrome:chrome.footer.withdraw",
  "legal-privacy-versions": "legal:legal.privacyVersions.link"
};
const OTHER = SUPPORT_LOCALES.filter((l) => l !== "en" && l !== "ro");
// REV-S05-p1 ct N2: in the 23 Latin-script locales a TRANSLATE name is neither a placeholder nor an English paraphrase.
// The checker's SCRIPT rule covers the other 10; latin_allow is SPEC-v5 R13 (iii)'s list.
const NON_LATIN = new Set(["ar", "he", "hi", "ja", "zh", "ko", "ru", "uk", "bg", "el"]);
const LATIN_ALLOW = new Set(["Dialectical", "Engine", "MFA", "AI", "US", "JSON", "DebateAI"]);
const PLACEHOLDER = /^(?:todo|tbd|tbc|tba|fixme|xxx+|lorem|ipsum|placeholder|translate|translation|untranslated|null|undefined)$/iu;   // per word; not "n/a": Irish "na" is a word
// REV-S05-p2 ct N1 + RECHECK-S05 N2 — the class, not its samples. Two shapes are refused, however they are spelled:
// (1) a placeholder WHOLE name: the name's letters alone (accents, case, spaces, dots, slashes and dashes dropped) are
//     empty, x…, or a placeholder word — "N/A", "N / A", "N.A.", "n.d.", "N/D", "N.V.", "XX", "TBA", "null", "None", "—";
//     inside a real name a short word like Irish "na" stays legal, because only the WHOLE name is matched;
// (2) a locale-code TAG: a code (any case) that opens the name before ":" or a spaced dash, or stands in brackets
//     anywhere — "DE: …", "de : …", "[de] …", "(DE) …", "de – …". A code joined to a word ("IT-Support", "ET-tugi",
//     "DE-Nutzer") is not a tag. A code of any case also never counts as a word of the locale's own language, so
//     "de Support conversations and human cases" is refused by the own-word rule.
const PLACEHOLDER_LETTERS = new Set(["", "na", "nd", "nv", "nc", "tba", "tbd", "tbc", "todo", "fixme", "null", "undefined",
  "none", "nil", "empty", "missing", "placeholder", "lorem", "ipsum", "loremipsum", "translate", "translation", "untranslated", "dummy", "wip"]);
const letters = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}]/gu, "");
const isPlaceholderName = (name: string): boolean => PLACEHOLDER_LETTERS.has(letters(name)) || /^x+$/u.test(letters(name));
const LOCALE_CODES = new Set(SUPPORT_LOCALES.map((loc) => loc.toLowerCase()));
const CODE = `(?:${[...LOCALE_CODES].join("|")})`;
const LOCALE_TAG = new RegExp(`^\\s*[\\[(]?\\s*${CODE}\\s*[\\])]?\\s*(?::|\\s[-–—|]\\s)|[\\[(]\\s*${CODE}\\s*[\\])]`, "iu");
// The member table the two rules are written against (asserted below, so a rule that loosens fails on the table itself).
const REFUSE = ["N/A", "N / A", "n.a.", "N.A.", "NA", "N/D", "n.d.", "N.V.", "x", "XX", "xxx", "TBA", "TBD", "TODO", "null",
  "undefined", "None", "—", "???", "...", "DE: Support conversations and human cases", "de: Support conversations and human cases",
  "de : Support conversations and human cases", "[de] Support conversations and human cases",
  "(DE) Support conversations and human cases", "DE - Support conversations and human cases",
  "de – Support conversations and human cases", "de Support conversations and human cases",
  "DE Support conversations and human cases", "de: Support-Gespräche und Fälle mit menschlicher Betreuung",
  "Human help cases", "Support (TBD)", "lorem ipsum", "MFA"];
const ACCEPT = ["IT-Support-Gespräche mit menschlicher Betreuung", "ET-tugi ja inimeste käsitletud juhtumid",
  "Support-Gespräche für DE-Nutzer", "Spás oibre úinéir na díospóireachta", "Comhráite tacaíochta agus cásanna le duine",
  "O Dialectical Engine", "Om Dialectical Engine", "Acerca de Dialectical Engine", "Estado da verificação do e-mail",
  "Debatte mit Tarifoptionen erstellen (Entwurf)"];
const words = (text: string): string[] => text.split(/[^\p{L}]+/u).filter((word) => word !== "");
const ENGLISH = new Set([
  ...SUPPORT_CAPABILITIES.flatMap(({ labels, searchTerms }) => words([labels.en, ...searchTerms.en].join(" "))),
  ...SUPPORT_LOCALES.flatMap((loc) => SUPPORT_CONTROL_NAMES[loc].flatMap(([en]) => words(en))),
  "a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "by", "only", "your", "my", "our", "its"
].map((word) => word.toLowerCase()));
// REV-S05-p1 pt N1: the new-debate area is "Create a debate with plan controls"; its name uses the word the locale's own
// plan selector shows (newDebate.planTier). Each stem below is checked against that message at test time, so a stem
// that is not the screen's word fails here as well as a name that does not carry it. ga lists the lenited form its
// grammar requires after "an" ("an phlean") as a second spelling of the screen's "plean".
const PLAN_STEMS: Readonly<Record<string, string | readonly [string, string]>> = {
  ar: "الخطة", bg: "план", cs: "plán", da: "plan", de: "tarif", el: "προγράμμ", es: "plan", et: "paket", fi: "tilau",
  fr: "formule", ga: ["plean", "phlean"], he: "תוכנית", hi: "योजना", hr: "plan", hu: "előfizetési", id: "paket", it: "piano",
  ja: "プラン", ko: "요금제", lt: "plan", lv: "plān", mt: "pjan", nl: "abonnement", pl: "plan", pt: "plano", ru: "тариф",
  sk: "program", sl: "paket", sv: "abonnemang", tr: "plan", uk: "план", vi: "gói", zh: "方案"
};
const capability = (id: string) => SUPPORT_CAPABILITIES.find((item) => item.id === id)!;
const contextText = (language: (typeof SUPPORT_LOCALES)[number], signedIn = true) => buildSupportKnowledgeContext({
  entries: [], capabilities: SUPPORT_CAPABILITIES, language, query: "", historyText: "", maxCodePoints: 24_000,
  availableActionIds: resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn, language }).map(({ id }) => id),
  referenceFor: createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001").referenceFor
}).text;

/** Why a Latin-script TRANSLATE name is refused, or "" when it is accepted (ct N2 class, RECHECK-S05 N2). */
function refusal(name: string): string {
  if (isPlaceholderName(name)) return "placeholder name";
  if (LOCALE_TAG.test(name)) return "locale-code tag";
  const own = words(name).filter((word) => !LATIN_ALLOW.has(word) && !LOCALE_CODES.has(word.toLowerCase()));
  if (own.some((word) => PLACEHOLDER.test(word))) return "placeholder word";
  if (own.length === 0 || own.every((word) => ENGLISH.has(word.toLowerCase()))) return "no word of its own language";
  return "";
}

describe("S05 capability names in the model's capability line (SPEC-v5 R13, V-22)", () => {
  it("covers every catalogue capability with exactly one KEY or TRANSLATE row", () => {
    const rows = new Set([...Object.keys(KEY_ROWS), ...SUPPORT_TRANSLATED_CAPABILITY_IDS]);
    expect(rows.size).toBe(29);
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
    // back from the other locales' pairs; the union names all 52 current lexicon controls after the retired legacy-claim
    // control was removed (asserted, so a control that
    // becomes identical in every locale fails here instead of slipping out of the set).
    for (const name of REFUSE) expect(refusal(name), `refuse ${JSON.stringify(name)}`).not.toBe("");     // RECHECK-S05 N2 class
    for (const name of ACCEPT) expect(refusal(name), `accept ${JSON.stringify(name)}`).toBe("");
    const allEn = new Set(OTHER.flatMap((loc) => SUPPORT_CONTROL_NAMES[loc].map(([en]) => en)));
    expect(allEn.size).toBe(52);
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
        if (!NON_LATIN.has(loc)) {                                                              // ct N2
          expect(refusal(name), `${loc} ${id} "${name}"`).toBe("");
        }
      }
      expect(new Set(SUPPORT_CAPABILITIES.map((item) => supportCapabilityName(item, loc))).size, loc).toBe(29);   // N3
      const forms = [PLAN_STEMS[loc] ?? "<no stem>"].flat();                                    // pt N1
      const planName = (SUPPORT_CAPABILITY_TRANSLATIONS[loc]?.["new-debate"] ?? "").toLocaleLowerCase(loc);
      expect(msg(loc, "newDebate:newDebate.planTier").toLocaleLowerCase(loc), `${loc} plan selector`).toContain(forms[0]);
      expect(forms.some((form) => planName.includes(form)), `${loc} new-debate "${planName}" lacks ${forms.join("/")}`).toBe(true);
    }
  });
  it("names de legal-privacy by its legal page link, never the Privacy settings control", () => {
    expect(supportCapabilityName(capability("legal-privacy"), "de")).toBe(msg("de", "chrome:chrome.legal.privacy"));
    expect(supportCapabilityName(capability("legal-privacy"), "de")).not.toBe(msg("de", "consent:consent.settings.title"));
  });
  it("writes supportCapabilityName into the capability line and never the control-label swap (negative, all 33); one line shape", () => {
    // REV-S05-p1 sd N1: every name that reaches the model's capability line or a delivered text — TRANSLATE names, KEY
    // page links, both sides of the control-name pairs, the action labels — is one line: no control/format character,
    // no line or paragraph separator, no "|" field separator, no "actions=", at most 100 code points. And the
    // CAPABILITY CATALOG block holds exactly one well-formed line per capability, in all 35 locales, signed in and out.
    const SHAPE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}|]+$/u;
    const names = SUPPORT_LOCALES.flatMap((loc) => [
      ...Object.values(SUPPORT_CAPABILITY_TRANSLATIONS[loc as (typeof OTHER)[number]] ?? {}),
      ...Object.values(SUPPORT_CAPABILITY_KEY_NAMES[loc]), ...SUPPORT_CONTROL_NAMES[loc].flat(),
      ...Object.values(SUPPORT_UI_LABELS[loc]), ...SUPPORT_CAPABILITIES.map((item) => supportCapabilityName(item, loc))
    ].map((name) => [loc, name] as const));
    expect(names.length).toBeGreaterThan(35 * 29);
    for (const [loc, name] of names) {
      expect(name, `${loc} ${JSON.stringify(name)}`).toMatch(SHAPE);
      expect(name, `${loc} ${JSON.stringify(name)}`).not.toContain("actions=");
      expect([...name].length, `${loc} ${JSON.stringify(name)}`).toBeLessThanOrEqual(100);
    }
    for (const loc of SUPPORT_LOCALES) for (const signedIn of [true, false]) {
      const block = contextText(loc, signedIn).split("\n\nCAPABILITY CATALOG\n")[1]!.split("\n\n")[0]!.split("\n");
      expect(block, `${loc} ${signedIn}`).toHaveLength(SUPPORT_CAPABILITIES.length);
      for (const line of block) expect(line, `${loc} ${signedIn}`).toMatch(/^- [^|\n]+ \| [^|\n]+ \| actions=[^|\n]*$/u);
    }
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
