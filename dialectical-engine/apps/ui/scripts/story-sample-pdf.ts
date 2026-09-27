import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReportCatalogs, type ReportCatalogLoader } from "../lib/report/reportLanguage";
import { renderReportPdf } from "../lib/report/renderReport";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_LANGUAGE, storyFixture } from "../lib/v3/storyFixture";

/**
 * The owner's sample report (spec 2026-09-26 §10, "look first, then wire"):
 * the fixture story rendered by the real PDF code, in the question's language
 * (Romanian), exactly as the report route will print it (spec §14.3). The
 * story carries a note worth knowing and a reservation, so both boxes show.
 *
 * Usage: pnpm --filter dialectical-engine-v2ui run story:sample-pdf <absolute path to the output .pdf>
 * (pnpm runs the script from apps/ui, so a relative path is resolved from there,
 * and so are the vendored fonts).
 */
const outputPath = process.argv[2];
if (outputPath === undefined || outputPath.trim().length === 0) {
  console.error(
    "Usage: pnpm --filter dialectical-engine-v2ui run story:sample-pdf <absolute path to the output .pdf> " +
      "(a relative path is resolved from apps/ui)"
  );
  process.exit(2);
}

// The UI's own message files, found next to this script: the same catalogues the
// report route loads through loadNamespace, which is server-only (Next).
const messages = fileURLToPath(new URL("../messages/", import.meta.url));
const load: ReportCatalogLoader = async (locale, namespace) =>
  JSON.parse(readFileSync(resolve(messages, locale, `${namespace}.json`), "utf8")) as Record<string, string>;

const pdf = await renderReportPdf({
  answer: STORY_FIXTURE_ANSWER,
  story: storyFixture("READY_WITH_RESERVATION"),
  generatedAt: new Date(),
  catalogs: await loadReportCatalogs({ questionTag: STORY_FIXTURE_LANGUAGE.tag, interfaceLocale: "en", load })
});
writeFileSync(resolve(outputPath), pdf);
console.log(`STORY_SAMPLE_PDF_WRITTEN=${resolve(outputPath)} bytes=${pdf.length}`);
