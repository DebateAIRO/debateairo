import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReportCatalogs, type ReportCatalogLoader } from "../lib/report/reportLanguage";
import { renderReportPdf } from "../lib/report/renderReport";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_FLOOR_ANSWER,
  STORY_FIXTURE_LANGUAGE,
  storyFixture,
  storyFixtureDisclosure
} from "../lib/v3/storyFixture";
import { STORY_SCRIPT_SAMPLE_LOCALES, storyScriptSample, type StoryScriptSampleLocale } from "../lib/v3/storyScriptSamples";

/**
 * The owner's sample report (spec 2026-09-26 §10, "look first, then wire"):
 * the fixture story rendered by the real PDF code, in the question's language
 * (Romanian), exactly as the report route will print it (spec §14.3). The
 * story carries a note worth knowing and a reservation, so both boxes show,
 * and "About this report" names the models that wrote and checked the answer.
 * Given a language (ru, el, he, ar, hi, zh, ja, ko), it prints that script's
 * sample story instead (lib/v3/storyScriptSamples.ts), and refuses Arabic as
 * the route does. Given a variant (Task M6), it prints the Romanian sample as
 * the engine money rule would: "floor" (no answer could be written, so the
 * answer is the debate's strongest position) or "lower-cost" (a lower-cost
 * model wrote the answer, the debate stopped exploring early, and the answer
 * was written from its most important points). Only About says so.
 *
 * Usage: pnpm --filter dialectical-engine-v2ui run story:sample-pdf <absolute path to the output .pdf> [language|floor|lower-cost]
 * (pnpm runs the script from apps/ui, so a relative path is resolved from there,
 * and so are the vendored fonts).
 */
const VARIANTS: readonly string[] = Object.freeze(["floor", "lower-cost"]);
const [outputPath, choice] = process.argv.slice(2);
const samples: readonly string[] = STORY_SCRIPT_SAMPLE_LOCALES;
if (outputPath === undefined || outputPath.trim().length === 0 || (choice !== undefined && !samples.includes(choice) && !VARIANTS.includes(choice))) {
  console.error(
    "Usage: pnpm --filter dialectical-engine-v2ui run story:sample-pdf <absolute path to the output .pdf> " +
      `[${[...samples, ...VARIANTS].join("|")}] (a relative path is resolved from apps/ui)`
  );
  process.exit(2);
}
const language = choice !== undefined && samples.includes(choice) ? choice : undefined;

// The UI's own message files, found next to this script: the same catalogues the
// report route loads through loadNamespace, which is server-only (Next).
const messages = fileURLToPath(new URL("../messages/", import.meta.url));
const load: ReportCatalogLoader = async (locale, namespace) =>
  JSON.parse(readFileSync(resolve(messages, locale, `${namespace}.json`), "utf8")) as Record<string, string>;

const sample = choice === "floor"
  ? { answer: STORY_FIXTURE_FLOOR_ANSWER, story: storyFixture("READY"), disclosure: storyFixtureDisclosure("floor") }
  : choice === "lower-cost"
    ? { answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY_WITH_RESERVATION"), disclosure: storyFixtureDisclosure("lower-cost") }
    : language === undefined
      ? { answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY_WITH_RESERVATION"), disclosure: storyFixtureDisclosure("served") }
      : { ...storyScriptSample(language as StoryScriptSampleLocale), disclosure: null };
const pdf = await renderReportPdf({
  ...sample,
  generatedAt: new Date(),
  catalogs: await loadReportCatalogs({ questionTag: language ?? STORY_FIXTURE_LANGUAGE.tag, interfaceLocale: "en", load })
});
writeFileSync(resolve(outputPath), pdf);
console.log(`STORY_SAMPLE_PDF_WRITTEN=${resolve(outputPath)} bytes=${pdf.length}`);
