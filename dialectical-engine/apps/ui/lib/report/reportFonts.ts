/**
 * The report's fonts (apps/ui/assets/fonts; SOURCES.md records where every file
 * comes from), and the faces a report picks from its language.
 *
 * - A Latin-script report keeps its look: Plus Jakarta Sans for the text and
 *   Fraunces for the fixed part titles.
 * - Every other script prints in its own Noto face, headings in its bold.
 * - Text can mix scripts: a Russian story quotes an English product name, a
 *   Romanian one a Greek letter. So each face is followed by fallbacks, and
 *   react-pdf takes each character from the first face in the list that has
 *   it. Noto Sans (Latin, Cyrillic, Greek) and Plus Jakarta Sans (→ ≈ and the
 *   report's other symbols) always follow. A face for another script is added
 *   only when the report's text holds that script, so a Latin report never
 *   loads the large CJK files.
 *
 * Nothing here imports react-pdf, so the choice can be tested on its own
 * (fonts.test.mjs checks every catalogue value against it).
 */

/** The names react-pdf knows the faces by. */
export const REPORT_FONT_FAMILIES = Object.freeze({
  sans: "ReportSans",
  serif: "ReportSerif",
  notoSans: "ReportNotoSans",
  hebrew: "ReportNotoHebrew",
  devanagari: "ReportNotoDevanagari",
  simplifiedChinese: "ReportNotoSC",
  japanese: "ReportNotoJP",
  korean: "ReportNotoKR"
});

export type ReportFontFamily = (typeof REPORT_FONT_FAMILIES)[keyof typeof REPORT_FONT_FAMILIES];

export interface ReportFontFile {
  /** The file, relative to the fonts directory. */
  readonly file: string;
  readonly fontWeight: 400 | 600 | 700;
  readonly fontStyle: "normal" | "italic";
}

function face(file: string, fontWeight: ReportFontFile["fontWeight"], fontStyle: ReportFontFile["fontStyle"] = "normal"): ReportFontFile {
  return Object.freeze({ file, fontWeight, fontStyle });
}

/**
 * A script with no italic prints the report's italic style in its regular
 * face: the regular file is registered a second time, as the italic.
 */
function uprightOnly(regular: string, bold: string): readonly ReportFontFile[] {
  return Object.freeze([face(regular, 400), face(regular, 400, "italic"), face(bold, 700)]);
}

/** Only the weights and styles the report prints: regular, bold, and italic where the script has one. */
export const REPORT_FONT_FACES: Readonly<Record<ReportFontFamily, readonly ReportFontFile[]>> = Object.freeze({
  ReportSans: Object.freeze([
    face("plus-jakarta-sans/PlusJakartaSans-Regular.ttf", 400),
    face("plus-jakarta-sans/PlusJakartaSans-Italic.ttf", 400, "italic"),
    face("plus-jakarta-sans/PlusJakartaSans-Bold.ttf", 700)
  ]),
  ReportSerif: Object.freeze([face("fraunces/Fraunces9pt-SemiBold.ttf", 600)]),
  ReportNotoSans: Object.freeze([
    face("noto-sans/NotoSans-Regular.ttf", 400),
    face("noto-sans/NotoSans-Italic.ttf", 400, "italic"),
    face("noto-sans/NotoSans-Bold.ttf", 700)
  ]),
  ReportNotoHebrew: uprightOnly("noto-sans-hebrew/NotoSansHebrew-Regular.ttf", "noto-sans-hebrew/NotoSansHebrew-Bold.ttf"),
  ReportNotoDevanagari: uprightOnly("noto-sans-devanagari/NotoSansDevanagari-Regular.ttf", "noto-sans-devanagari/NotoSansDevanagari-Bold.ttf"),
  ReportNotoSC: uprightOnly("noto-sans-sc/NotoSansSC-Regular.otf", "noto-sans-sc/NotoSansSC-Bold.otf"),
  ReportNotoJP: uprightOnly("noto-sans-jp/NotoSansJP-Regular.otf", "noto-sans-jp/NotoSansJP-Bold.otf"),
  ReportNotoKR: uprightOnly("noto-sans-kr/NotoSansKR-Regular.otf", "noto-sans-kr/NotoSansKR-Bold.otf")
});

/** The script a report is printed in, from its language (the question's locale). */
export type ReportScript =
  | "latin" | "cyrillicGreek" | "hebrew" | "arabic" | "devanagari" | "simplifiedChinese" | "japanese" | "korean";

const SCRIPT_OF_LOCALE: Readonly<Record<string, ReportScript>> = Object.freeze({
  bg: "cyrillicGreek", ru: "cyrillicGreek", uk: "cyrillicGreek", el: "cyrillicGreek",
  he: "hebrew", ar: "arabic", hi: "devanagari",
  zh: "simplifiedChinese", ja: "japanese", ko: "korean"
});

/** Every other interface locale is written in the Latin script. */
export function reportScript(locale: string): ReportScript {
  return SCRIPT_OF_LOCALE[locale] ?? "latin";
}

const { sans, serif, notoSans, hebrew, devanagari, simplifiedChinese, japanese, korean } = REPORT_FONT_FAMILIES;

/**
 * Each script's own face first, then the two that always follow. Arabic has
 * none: the report cannot print it yet (reportLanguage.ts says why).
 */
const PRIMARY_FACES: Readonly<Record<ReportScript, readonly ReportFontFamily[] | null>> = Object.freeze({
  latin: [sans, notoSans],
  cyrillicGreek: [notoSans, sans],
  hebrew: [hebrew, notoSans, sans],
  arabic: null,
  devanagari: [devanagari, notoSans, sans],
  simplifiedChinese: [simplifiedChinese, notoSans, sans],
  japanese: [japanese, notoSans, sans],
  korean: [korean, notoSans, sans]
});

/**
 * The faces a report adds when its text holds another script. Kana before Han,
 * so a Japanese quotation in a Latin report takes its Han from the Japanese
 * face; Han alone takes the Simplified Chinese one, the largest.
 */
const FALLBACK_FACES: readonly Readonly<{ script: RegExp; family: ReportFontFamily }>[] = Object.freeze([
  { script: /\p{Script=Hebrew}/u, family: hebrew },
  { script: /\p{Script=Devanagari}/u, family: devanagari },
  { script: /[\p{Script=Hiragana}\p{Script=Katakana}]/u, family: japanese },
  { script: /\p{Script=Hangul}/u, family: korean },
  { script: /\p{Script=Han}/u, family: simplifiedChinese }
]);

export interface ReportFaces {
  /** The text's faces, in the order react-pdf tries them for each character. */
  readonly body: readonly ReportFontFamily[];
  /** The fixed part titles' faces. */
  readonly heading: readonly ReportFontFamily[];
  /** Fraunces prints only its 600; every other heading is the text face's bold. */
  readonly headingWeight: 600 | 700;
}

/**
 * The faces for a report in `locale` whose printed text is `printed` (every
 * string it prints, in any order). Throws for a script with no face.
 */
export function reportFaces(locale: string, printed: string): ReportFaces {
  const script = reportScript(locale);
  const primary = PRIMARY_FACES[script];
  if (primary === null) throw new RangeError(`REPORT_LOCALE_UNSUPPORTED: ${locale}`);
  const body = [...primary];
  for (const { script: pattern, family } of FALLBACK_FACES) {
    if (pattern.test(printed) && !body.includes(family)) body.push(family);
  }
  const frozen = Object.freeze(body);
  return script === "latin"
    ? Object.freeze({ body: frozen, heading: Object.freeze([serif, ...frozen]), headingWeight: 600 })
    : Object.freeze({ body: frozen, heading: frozen, headingWeight: 700 });
}
