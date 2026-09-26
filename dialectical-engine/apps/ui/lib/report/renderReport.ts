import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { Answer, AnswerStory } from "@debateai/contract";
import { REPORT_FONT_SANS, REPORT_FONT_SERIF, ReportDocument } from "./ReportDocument.js";

/**
 * The vendored OFL fonts (apps/ui/assets/fonts, with each family's OFL.txt).
 * Only the faces the report and the story panel use: Fraunces 600 for the fixed
 * headings, Plus Jakarta Sans 400, 400 italic and 700 for everything else.
 */
export const REPORT_FONT_FILES = Object.freeze({
  serifSemiBold: "fraunces/Fraunces9pt-SemiBold.ttf",
  sansRegular: "plus-jakarta-sans/PlusJakartaSans-Regular.ttf",
  sansItalic: "plus-jakarta-sans/PlusJakartaSans-Italic.ttf",
  sansBold: "plus-jakarta-sans/PlusJakartaSans-Bold.ttf"
});

/**
 * No machine path: the UI process runs from apps/ui (deploy/vps/systemd
 * debateai-ui.service WorkingDirectory, and the dev UI process), the root test
 * suite runs from the repository root, so the directory is deduced from the
 * working directory and the lookup fails loudly when neither holds the fonts.
 */
export function resolveReportFontDirectory(cwd: string = process.cwd()): string {
  for (const candidate of [resolve(cwd, "assets/fonts"), resolve(cwd, "apps/ui/assets/fonts")]) {
    if (existsSync(join(candidate, REPORT_FONT_FILES.sansRegular))) return candidate;
  }
  throw new Error("REPORT_FONTS_UNRESOLVED: the report fonts are not under assets/fonts or apps/ui/assets/fonts");
}

let registeredFontDirectory: string | null = null;

function registerReportFonts(directory: string): void {
  if (registeredFontDirectory === directory) return;
  Font.register({
    family: REPORT_FONT_SERIF,
    fonts: [{ src: join(directory, REPORT_FONT_FILES.serifSemiBold), fontWeight: 600 }]
  });
  Font.register({
    family: REPORT_FONT_SANS,
    fonts: [
      { src: join(directory, REPORT_FONT_FILES.sansRegular), fontWeight: 400 },
      { src: join(directory, REPORT_FONT_FILES.sansItalic), fontWeight: 400, fontStyle: "italic" },
      { src: join(directory, REPORT_FONT_FILES.sansBold), fontWeight: 700 }
    ]
  });
  // The default hyphenation is English. The story is in the question's language, so words are never split.
  Font.registerHyphenationCallback((word) => [word]);
  registeredFontDirectory = directory;
}

/** Renders the owner's full report. Nothing is written to disk; the caller streams the bytes. */
export async function renderReportPdf(input: Readonly<{
  answer: Answer;
  story: AnswerStory;
  generatedAt: Date;
  fontDirectory?: string;
}>): Promise<Buffer> {
  registerReportFonts(input.fontDirectory ?? resolveReportFontDirectory());
  return renderToBuffer(ReportDocument({ answer: input.answer, story: input.story, generatedAt: input.generatedAt }));
}
