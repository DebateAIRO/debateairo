import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { Answer, AnswerStory } from "@debateai/contract";
import { ReportDocumentView } from "./ReportDocument.js";
import { reportPlacedFont } from "./reportGlyphs.js";
import { REPORT_FONT_FACES, type ReportFontFamily } from "./reportFonts.js";
import { reportSupportedForLocale, type ReportCatalogs } from "./reportLanguage.js";
import { reportLayout, reportPrintedText } from "./reportLayout.js";
import { buildReportModel, reportWordPieces } from "./reportModel.js";

/**
 * The vendored OFL fonts (apps/ui/assets/fonts, with each family's OFL.txt and
 * SOURCES.md): the faces lib/report/reportFonts.ts lists, and only those.
 */
const FONT_DIRECTORY_MARKER = REPORT_FONT_FACES.ReportSans[0]!.file;

/**
 * No machine path: the UI process runs from apps/ui (deploy/vps/systemd
 * debateai-ui.service WorkingDirectory, and the dev UI process), the root test
 * suite runs from the repository root, so the directory is deduced from the
 * working directory and the lookup fails loudly when neither holds the fonts.
 */
export function resolveReportFontDirectory(cwd: string = process.cwd()): string {
  for (const candidate of [resolve(cwd, "assets/fonts"), resolve(cwd, "apps/ui/assets/fonts")]) {
    if (existsSync(join(candidate, FONT_DIRECTORY_MARKER))) return candidate;
  }
  throw new Error("REPORT_FONTS_UNRESOLVED: the report fonts are not under assets/fonts or apps/ui/assets/fonts");
}

/**
 * The report's line-break rule, registered as react-pdf's hyphenation callback. An ordinary word is never
 * split: the story is in the question's language, so English hyphenation would be wrong. A word longer
 * than REPORT_WORD_BREAK.longerThan (a web address a model copied, say) may break between the pieces
 * reportWordPieces cuts. The pieces come back with an empty string between each two. @react-pdf/textkit
 * 7.0.1 turns an empty syllable into a zero-width space it may break at and prints nothing there, while a
 * break between two plain syllables would print a hyphen. Not one character is added to the text, so a
 * copied address stays exactly as the model wrote it.
 */
export function reportHyphenation(word: string): string[] {
  return reportWordPieces(word).flatMap((piece, index) => (index === 0 ? [piece] : ["", piece]));
}

let registeredFontDirectory: string | null = null;

function registerReportFonts(directory: string): void {
  if (registeredFontDirectory === directory) return;
  for (const [family, faces] of Object.entries(REPORT_FONT_FACES)) {
    Font.register({
      family,
      fonts: faces.map(({ file, fontWeight, fontStyle }) => ({ src: join(directory, file), fontWeight, fontStyle }))
    });
  }
  Font.registerHyphenationCallback(reportHyphenation);
  registeredFontDirectory = directory;
}

type FontSource = NonNullable<ReturnType<typeof Font.getRegisteredFonts>[string]>["sources"][number];
type LoadedFont = NonNullable<FontSource["data"]>;

/** One loaded, placed font per file: a script's italic is its regular file registered twice, and shares it. */
const placedFonts = new Map<string, Promise<LoadedFont>>();
const preparedSources = new WeakSet<FontSource>();

/**
 * Loads the families a report uses before react-pdf does, and hands react-pdf
 * each font wrapped by reportPlacedFont (lib/report/reportGlyphs.ts says why).
 * Only these families are loaded: a Latin report never reads the CJK files.
 * Each file is read once per process, however many times it is registered.
 */
async function prepareReportFonts(families: readonly ReportFontFamily[]): Promise<void> {
  const registered = Font.getRegisteredFonts();
  for (const family of families) {
    for (const source of registered[family]?.sources ?? []) {
      if (preparedSources.has(source)) continue;
      let placed = placedFonts.get(source.src);
      if (placed === undefined) {
        placed = source.load().then(() => {
          if (source.data === null) throw new Error(`REPORT_FONT_UNREADABLE: ${source.src}`);
          return reportPlacedFont(source.data);
        });
        placed.catch(() => placedFonts.delete(source.src));
        placedFonts.set(source.src, placed);
      }
      source.data = await placed;
      source.loadResultPromise = Promise.resolve();
      preparedSources.add(source);
    }
  }
}

/**
 * Renders the owner's full report, in the language of `catalogs`
 * (loadReportCatalogs: the question's, or the reader's when the question's is
 * not known). Nothing is written to disk; the caller streams the bytes. A
 * language whose script the report cannot print is refused here too, never
 * printed as empty boxes.
 */
export async function renderReportPdf(input: Readonly<{
  answer: Answer;
  story: AnswerStory;
  generatedAt: Date;
  catalogs: ReportCatalogs;
  fontDirectory?: string;
}>): Promise<Buffer> {
  if (!reportSupportedForLocale(input.catalogs.locale)) throw new RangeError(`REPORT_LOCALE_UNSUPPORTED: ${input.catalogs.locale}`);
  registerReportFonts(input.fontDirectory ?? resolveReportFontDirectory());
  const model = buildReportModel(input.answer, input.story, input.generatedAt, input.catalogs);
  const { faces } = reportLayout(model.language, reportPrintedText(model));
  await prepareReportFonts([...new Set([...faces.body, ...faces.heading])]);
  return renderToBuffer(ReportDocumentView({ model }));
}
