// cookie-compliance S05 SPEC-v4 R02: the texts the help bot is given or shows, per locale, from the functions the
// respond path calls. No copied text, no second rendering path. cwd = the dialectical-engine root.
// usage: ./node_modules/.bin/tsx tests/support/supportDeliveredNames.ts <out.json>   last line: DUMPED 35 locales <n> units
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHelpCorpus } from "../../packages/support-kb/src/index.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";
import { SUPPORT_ACTION_IDS, SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { supportCapabilityActionLabel } from "../../packages/support-kb/src/context.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import { SUPPORT_TEMPLATE_IDS, supportTemplate } from "../../packages/support-kb/src/templates.js";
import { supportRecoveryFallback, supportSourceLabel, supportSourceProjection } from "../../packages/support-kb/src/control-names.js";
import { supportCapabilityName } from "../../packages/support-kb/src/capability-names.js";

const out = process.argv[2];
if (out === undefined) throw new Error("usage: supportDeliveredNames.ts <out.json>");
const corpus = loadHelpCorpus(resolve("packages/support-kb/content"), {        // apps/api/src/main.ts:109-115
  reviewManifest: JSON.parse(readFileSync(resolve("packages/support-kb/reviews/manifest.json"), "utf8")) as unknown,
  recoveryComponents: readFileSync(resolve("packages/support-kb/recovery/components.json")),
  requireReviewedRecovery: true
});
const REF = "00000000-0000-4000-8000-000000000001";                           // lets owner/public-reference chips resolve
const dump: Record<string, Record<string, string>> = {};
let units = 0;
for (const language of SUPPORT_LOCALES) {
  const corpusLocale = language === "ro" ? "ro" : "en";                        // answer.ts:246
  const texts: Record<string, string> = {};
  for (const entry of corpus.entries.filter(({ lang }) => lang === corpusLocale)) {
    texts[`${entry.id}.title`] = supportSourceLabel(entry, language);          // answer.ts source label
    if (language === "en" || language === "ro") texts[`${entry.id}.body`] = entry.body;
    if (entry.modelProjection !== undefined) texts[`${entry.id}.modelProjection`] = supportSourceProjection(entry, language);
    const fallback = supportRecoveryFallback(entry, language);                 // answer.ts recovery text
    if (fallback !== undefined) texts[`${entry.id}.fallback`] = fallback;
  }
  for (const id of SUPPORT_TEMPLATE_IDS) texts[`template.${id}`] = supportTemplate(id, language);
  for (const id of SUPPORT_ACTION_IDS) {
    const chip = [false, true].flatMap((signedIn) =>
      resolveSupportActions([id], { signedIn, language, ownerDebateId: REF, publicDebateRef: REF }))[0];
    if (chip === undefined) continue;                                          // the capability line lists available ids only
    texts[`chip.${id}`] = chip.label;
    const contextLabel = supportCapabilityActionLabel(id, language);
    if (contextLabel !== undefined) texts[`context.${id}`] = contextLabel;
  }
  for (const capability of SUPPORT_CAPABILITIES)                                // context.ts baseSection capability line
    texts[`capability.${capability.id}`] = supportCapabilityName(capability, language);
  units += Object.keys(texts).length;
  dump[language] = texts;
}
writeFileSync(out, `${JSON.stringify(dump, null, 2)}\n`);
console.log(`DUMPED ${Object.keys(dump).length} locales ${units} units`);
