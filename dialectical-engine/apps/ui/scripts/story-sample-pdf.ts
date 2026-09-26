import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderReportPdf } from "../lib/report/renderReport";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../lib/v3/storyFixture";

/**
 * The owner's sample report (spec 2026-09-26 §10, "look first, then wire"):
 * the fixture story rendered by the real PDF code. The story carries both a
 * reviewer's note and a checker's reservation, so every box shows.
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

const pdf = await renderReportPdf({
  answer: STORY_FIXTURE_ANSWER,
  story: storyFixture("READY_WITH_RESERVATION"),
  generatedAt: new Date()
});
writeFileSync(resolve(outputPath), pdf);
console.log(`STORY_SAMPLE_PDF_WRITTEN=${resolve(outputPath)} bytes=${pdf.length}`);
