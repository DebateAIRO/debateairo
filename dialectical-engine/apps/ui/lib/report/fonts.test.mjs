import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openSync } from "fontkit";
import { LOCALES } from "../i18n/locales.ts";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../v3/storyFixture.ts";
import { STORY_SCRIPT_SAMPLE_LOCALES, storyScriptSample, storyScriptSampleText } from "../v3/storyScriptSamples.ts";
import { reportPlacedFont } from "./reportGlyphs.ts";
import { REPORT_FONT_FACES, reportFaces } from "./reportFonts.ts";
import { reportSupportedForLocale } from "./reportLanguage.ts";
import { reportPrintedText } from "./reportLayout.ts";
import { buildReportModel } from "./reportModel.ts";

const fontRoot = new URL("../../assets/fonts/", import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, fontRoot));
const opened = new Map();
const open = (font) => {
  if (!opened.has(font)) opened.set(font, openSync(path(font)));
  return opened.get(font);
};

// A Latin-script report's faces: Fraunces 600 for the fixed headings, Plus
// Jakarta Sans 400, 400 italic and 700 for everything else.
const LATIN_FACES = [
  "fraunces/Fraunces9pt-SemiBold.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Regular.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Italic.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Bold.ttf"
];
const SANS = LATIN_FACES.filter((font) => font.startsWith("plus-jakarta-sans/"));
// The standard PDF fonts cannot print ș and ț; every Latin face must.
const ROMANIAN = [..."șțăîâȘȚĂÎÂ„”"];
// The list of points and the story text print these in the sans face.
const ARITHMETIC = [..."→≈·—…"];

// R2 (spec §14.3): each interface locale's own letters, upper and lower case,
// the ones a report in that language prints beyond plain a–z.
const LETTERS = Object.freeze({
  bg: "абвгдежзийклмнопрстуфхцчшщъьюяАБВГ", cs: "ěščřžýáíéůúťďňĚŠČŘŽÝÁÍÉŮÚŤĎŇ", da: "æøåÆØÅ", de: "äöüßÄÖÜ",
  el: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔ", en: "’“”", es: "ñáéíóúü¿¡ÑÁÉ", et: "õäöüšžÕÄÖÜŠŽ", fi: "äöåÄÖÅ",
  fr: "àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ«»", ga: "áéíóúÁÉÍÓÚ", he: "אבגדהוזחטיכלמנסעפצקרשת", hi: "अआइईउऊकखगघ",
  hr: "čćđšžČĆĐŠŽ", hu: "áéíóöőúüűÁÉÍÓÖŐÚÜŰ", id: "", it: "àèéìòùÀÈÉÌÒÙ", ja: "日本語のテキスト", ko: "한국어텍스트",
  lt: "ąčęėįšųūžĄČĘĖĮŠŲŪŽ", lv: "āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ", mt: "ċġħżĊĠĦŻ", nl: "éëïÉËÏ", pl: "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
  pt: "ãõçáéíóúâêôàÃÕÇ", ro: "ăâîșțĂÂÎȘȚ„”", ru: "абвгдеёжзыэюяАБВЁ", sk: "áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ",
  sl: "čšžČŠŽ", sv: "åäöÅÄÖ", tr: "çğıİöşüÇĞÖŞÜ", uk: "абвгґдеєжзиіїйАБВГҐЄІЇ", ar: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
  vi: "ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ", zh: "中文文本"
});

const missing = (font, characters) => characters.filter((character) => !open(font).hasGlyphForCodePoint(character.codePointAt(0)));

/**
 * The packages react-pdf's text pipeline is made of, found the way Node finds
 * them for the renderer: each from the package that depends on it.
 */
const fromUi = createRequire(import.meta.url);
const pipelineEntry = (() => {
  const renderer = fromUi.resolve("@react-pdf/renderer");
  const fromRenderer = createRequire(renderer);
  const layout = fromRenderer.resolve("@react-pdf/layout");
  const render = fromRenderer.resolve("@react-pdf/render");
  const font = fromRenderer.resolve("@react-pdf/font");
  const pdfkit = fromRenderer.resolve("pdfkit");
  const textkit = createRequire(layout).resolve("@react-pdf/textkit");
  return Object.freeze({
    "@react-pdf/renderer": renderer,
    "@react-pdf/layout": layout,
    "@react-pdf/render": render,
    "@react-pdf/font": font,
    "@react-pdf/textkit": textkit,
    "@react-pdf/textkit (for render)": createRequire(render).resolve("@react-pdf/textkit"),
    "fontkit": createRequire(font).resolve("fontkit"),
    "fontkit (for pdfkit)": createRequire(pdfkit).resolve("fontkit"),
    "pdfkit": pdfkit,
    "bidi-js": createRequire(textkit).resolve("bidi-js")
  });
})();

/** The version in the nearest package.json named `name` above a resolved entry file. */
function installedVersion(entry, name) {
  for (let directory = dirname(entry); directory !== dirname(directory); directory = dirname(directory)) {
    let manifest = null;
    try {
      manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (manifest.name === name) return manifest.version;
  }
  throw new Error(`no package.json for ${name} above ${entry}`);
}

/**
 * The faces react-pdf itself prints each family in: its own font store
 * (@react-pdf/font, FontFamily.resolve), with the report's faces registered.
 * A weight a family lacks resolves the way CSS does (600 prints in the bold);
 * a style a family lacks throws, as it does when a report renders.
 */
const { default: FontStore } = await import(pathToFileURL(pipelineEntry["@react-pdf/font"]).href);
const fontStore = new FontStore();
for (const [family, faces] of Object.entries(REPORT_FONT_FACES)) {
  fontStore.register({ family, fonts: faces.map(({ file, fontWeight, fontStyle }) => ({ src: file, fontWeight, fontStyle })) });
}
const faceFile = (family, fontWeight, fontStyle) => fontStore.getFont({ fontFamily: family, fontWeight, fontStyle }).src;

/**
 * The characters of `text` that none of `families` can print in the given
 * weight and style: react-pdf takes each character from the first family in
 * the list that has it, and prints .notdef (an empty box) when none has.
 */
function uncovered(families, text, fontWeight, fontStyle) {
  const files = families.map((family) => faceFile(family, fontWeight, fontStyle));
  return [...new Set(text)].filter((character) => character !== "\n" && !files.some((file) => open(file).hasGlyphForCodePoint(character.codePointAt(0))));
}

const STYLES = [[400, "normal"], [700, "normal"], [400, "italic"]];

test("checks each weight in the face react-pdf prints it in: a 600 heading prints in a family's bold when it has no 600", () => {
  assert.equal(faceFile("ReportSerif", 600, "normal"), "fraunces/Fraunces9pt-SemiBold.ttf");
  assert.equal(faceFile("ReportSans", 600, "normal"), "plus-jakarta-sans/PlusJakartaSans-Bold.ttf");
  assert.equal(faceFile("ReportNotoSans", 600, "normal"), "noto-sans/NotoSans-Bold.ttf");
  assert.equal(faceFile("ReportNotoSans", 400, "italic"), "noto-sans/NotoSans-Italic.ttf");
  // A script without an italic prints the italic style in its regular face.
  assert.equal(faceFile("ReportNotoSC", 400, "italic"), "noto-sans-sc/NotoSansSC-Regular.otf");
  assert.throws(() => faceFile("ReportSerif", 400, "italic"), /Could not resolve font/u);
});

// What reportGlyphs.ts (fontkit's glyph cache, the doubled x offset, the dropped y offset, right-to-left shaping),
// reportLineBreaks.ts (textkit's runs, hyphenation points and zero-width breaks) and renderReport.ts (the font store)
// were measured against, and the report's render tests check. Two are pinned exactly: @react-pdf/renderer in
// package.json, and pdfkit by the renderer itself. The rest (layout, render, font, both textkits, both fontkits and
// bidi-js) are caret ranges under them, held by the lockfile alone.
const MEASURED_PIPELINE = Object.freeze({
  "@react-pdf/renderer": "4.9.0",
  "@react-pdf/layout": "5.2.0",
  "@react-pdf/render": "4.7.0",
  "@react-pdf/font": "4.1.2",
  "@react-pdf/textkit": "7.0.1",
  "@react-pdf/textkit (for render)": "7.0.1",
  "fontkit": "2.0.4",
  "fontkit (for pdfkit)": "2.0.4",
  "pdfkit": "0.20.1",
  "bidi-js": "1.0.3"
});

test("react-pdf's text pipeline is the one the report's workarounds were measured against", () => {
  const installed = Object.fromEntries(Object.entries(pipelineEntry).map(([key, entry]) => [key, installedVersion(entry, key.split(" ")[0])]));
  assert.deepEqual(installed, MEASURED_PIPELINE,
    "react-pdf's text pipeline changed. Before bumping, re-measure lib/report/reportGlyphs.ts, reportLineBreaks.ts and " +
      "renderReport.ts against the new source (the task R-fonts notes say what each works around), run the report's " +
      "render tests (tests/render/story-report-pdf.test.tsx) and look at a rendered page per script; then update MEASURED_PIPELINE.");
});

test("every Latin face prints Romanian letters and quotes", () => {
  for (const font of LATIN_FACES) assert.deepEqual(missing(font, ROMANIAN), [], font);
});

test("the sans family prints the report's symbols", () => {
  for (const font of SANS) assert.deepEqual(missing(font, ARITHMETIC), [], font);
});

test("the faces chosen for each language print its letters; Arabic has none, and the report refuses it", () => {
  assert.deepEqual(Object.keys(LETTERS).sort(), LOCALES.map(({ code }) => code).sort());
  for (const { code } of LOCALES) {
    if (code === "ar") {
      assert.throws(() => reportFaces(code, LETTERS.ar), /REPORT_LOCALE_UNSUPPORTED/u);
      assert.equal(reportSupportedForLocale(code), false);
      continue;
    }
    const { body, heading, headingWeight } = reportFaces(code, LETTERS[code]);
    for (const [fontWeight, fontStyle] of STYLES) assert.deepEqual(uncovered(body, LETTERS[code], fontWeight, fontStyle), [], `${code} ${fontWeight} ${fontStyle}`);
    assert.deepEqual(uncovered(heading, LETTERS[code], headingWeight, "normal"), [], `${code} heading`);
  }
});

/** One locale's catalogue, read the way the report route reads it. */
const catalogue = (locale, namespace) =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}/${namespace}.json`, import.meta.url), "utf8"));

/**
 * Everything a report in `locale` can print from its catalogues and formats:
 * every public.report.* and public.story.* value, the ways of knowing, and a
 * whole report built from a sample story (its dates, numbers, percentages and
 * lists in that language, and the sample's own text).
 */
function printable(locale) {
  const publicCatalog = catalogue(locale, "public");
  const composeCatalog = catalogue(locale, "compose");
  const values = [
    ...Object.entries(publicCatalog).filter(([key]) => key.startsWith("public.report.") || key.startsWith("public.story.")),
    ...Object.entries(composeCatalog).filter(([key]) => key.startsWith("compose.v3.wayOfKnowing."))
  ].map(([, value]) => value);
  const sample = STORY_SCRIPT_SAMPLE_LOCALES.includes(locale)
    ? storyScriptSample(locale)
    : { answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY_WITH_RESERVATION") };
  const model = buildReportModel(sample.answer, sample.story, new Date("2026-09-26T12:00:00.000Z"), {
    locale, publicCatalog, composeCatalog, metadataCatalog: catalogue("en", "public")
  });
  return `${values.join("\n")}\n${reportPrintedText(model)}`;
}

test("every catalogue value and every formatted value a report prints has a glyph in the faces chosen for its language", () => {
  const printed = LOCALES.map(({ code }) => code).filter(reportSupportedForLocale);
  assert.ok(printed.length >= 30, printed.join(" "));
  for (const locale of printed) {
    const text = printable(locale);
    const { body, heading, headingWeight } = reportFaces(locale, text);
    for (const [fontWeight, fontStyle] of STYLES) assert.deepEqual(uncovered(body, text, fontWeight, fontStyle), [], `${locale} ${fontWeight} ${fontStyle}`);
    assert.deepEqual(uncovered(heading, text, headingWeight, "normal"), [], `${locale} heading`);
  }
});

test("every script sample's text has a glyph in the faces chosen for its language", () => {
  for (const locale of STORY_SCRIPT_SAMPLE_LOCALES.filter(reportSupportedForLocale)) {
    const text = storyScriptSampleText(locale);
    const { body } = reportFaces(locale, text);
    for (const [fontWeight, fontStyle] of STYLES) assert.deepEqual(uncovered(body, text, fontWeight, fontStyle), [], `${locale} ${fontWeight} ${fontStyle}`);
  }
});

test("a mark is printed where Noto Sans Devanagari places it: its offset moves into the advances, and the word keeps its width", () => {
  const font = open("noto-sans-devanagari/NotoSansDevanagari-Regular.ttf");
  // Words whose marks the font places with an x offset (the nukta, the candrabindu, the u and ai signs).
  const text = "ज़रूरी हूँ कुछ रुपये फ़ैसला";
  const raw = font.layout(text);
  const placed = reportPlacedFont(font).layout(text);
  assert.ok(raw.positions.filter((position) => position.xOffset !== 0).length >= 3, "the control run has x offsets");
  assert.deepEqual(placed.positions.map((position) => position.xOffset).filter((offset) => offset !== 0), []);
  const drawn = (positions) => {
    let pen = 0;
    return positions.map((position) => { const spot = pen + position.xOffset; pen += position.xAdvance; return spot; });
  };
  const width = (positions) => positions.reduce((sum, position) => sum + position.xAdvance, 0);
  assert.deepEqual(drawn(placed.positions), drawn(raw.positions));
  assert.equal(width(placed.positions), width(raw.positions));
  assert.deepEqual(placed.glyphs.map((glyph) => glyph.id), raw.glyphs.map((glyph) => glyph.id));
  // Everything else is the font itself, for pdfkit to embed.
  assert.equal(reportPlacedFont(font).postscriptName, font.postscriptName);
  assert.equal(reportPlacedFont(font).unitsPerEm, font.unitsPerEm);
});

test("every glyph of a run stands for the characters of its own place in the text, so textkit finds where each line ends", () => {
  // "ें" is one glyph in both words, standing for one character in क़दमों (the ों left over from ो) and two in में.
  const words = ["क़दमों", "में", "करें,", "लें।"];
  const characters = (run) => run.glyphs.reduce((sum, glyph) => sum + glyph.codePoints.length, 0);
  // Control: fontkit keeps the glyph shaped first, with its first characters, so a later word counts short.
  const cached = openSync(path("noto-sans-devanagari/NotoSansDevanagari-Regular.ttf"));
  const short = words.filter((word) => characters(cached.layout(word.normalize("NFD"))) !== word.normalize("NFD").length);
  assert.ok(short.length > 0, "the control shows the cache miscounting");
  const placed = reportPlacedFont(openSync(path("noto-sans-devanagari/NotoSansDevanagari-Regular.ttf")));
  for (const word of [...words, ...words]) {
    const text = word.normalize("NFD");
    assert.equal(characters(placed.layout(text)), text.length, word);
  }
});

test("a Hebrew point is printed where Noto Sans Hebrew places it in right-to-left text, as textkit lays the run out", () => {
  const text = "שָׁלוֹם עֲבוֹדָה";
  const spots = (run) => {
    let pen = 0;
    return run.glyphs.map((glyph, index) => {
      const spot = pen + run.positions[index].xOffset;
      pen += run.positions[index].xAdvance;
      return `${glyph.id}@${spot}`;
    }).sort();
  };
  // fontkit shaping the run right to left by itself, drawn left to right: where every glyph belongs.
  const own = openSync(path("noto-sans-hebrew/NotoSansHebrew-Regular.ttf")).layout(text, [], undefined, undefined, "rtl");
  // textkit asks for left to right, then reverses the run (the control: the points land a letter off).
  const textkit = (font) => {
    const run = font.layout(text, [], undefined, undefined, "ltr");
    return { glyphs: [...run.glyphs].reverse(), positions: [...run.positions].reverse() };
  };
  assert.notDeepEqual(spots(textkit(openSync(path("noto-sans-hebrew/NotoSansHebrew-Regular.ttf")))), spots(own));
  const placed = textkit(reportPlacedFont(openSync(path("noto-sans-hebrew/NotoSansHebrew-Regular.ttf"))));
  assert.deepEqual(spots(placed), spots(own));
  assert.deepEqual(placed.positions.filter((position) => position.xOffset !== 0), []);
});

// Every family directory under assets/fonts, and every file in it.
const FAMILY_DIRECTORIES = readdirSync(fileURLToPath(fontRoot), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const VENDORED_FILES = FAMILY_DIRECTORIES
  .flatMap((family) => readdirSync(path(`${family}/`)).map((name) => `${family}/${name}`)).sort();

/** The rows of SOURCES.md's file table: path, sha256 and size, as recorded when each file was fetched. */
function recordedSources() {
  const rows = new Map();
  for (const line of readFileSync(path("SOURCES.md"), "utf8").split("\n")) {
    const row = /^\| `([^`]+)` \|[^|]*\| (https:\/\/raw\.githubusercontent\.com\/\S+) \| ([0-9a-f]{64}) \| ([0-9]+) \|$/u.exec(line);
    if (row !== null) rows.set(row[1], { url: row[2], sha256: row[3], bytes: Number(row[4]) });
  }
  return rows;
}

test("each vendored family ships its SIL Open Font License", () => {
  assert.ok(FAMILY_DIRECTORIES.length >= 8, FAMILY_DIRECTORIES.join(", "));
  for (const family of FAMILY_DIRECTORIES) {
    assert.match(readFileSync(path(`${family}/OFL.txt`), "utf8"), /SIL Open Font License/i, family);
  }
});

test("SOURCES.md records every vendored file, with the sha256 and size it has on disk, at a pinned commit", () => {
  const sources = recordedSources();
  assert.deepEqual([...sources.keys()].sort(), VENDORED_FILES);
  for (const [file, { url, sha256, bytes }] of sources) {
    const data = readFileSync(path(file));
    assert.equal(createHash("sha256").update(data).digest("hex"), sha256, file);
    assert.equal(data.length, bytes, file);
    // A full 40-character commit in the URL, never a branch name that can move.
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//u, file);
    assert.ok(url.endsWith(`/${file.split("/").at(-1)}`), `${file}: ${url}`);
  }
});

test("the vendored faces are static fonts, never variable ones (react-pdf prints a variable font at its default weight only)", () => {
  for (const file of VENDORED_FILES.filter((name) => /\.(ttf|otf)$/u.test(name))) {
    const face = openSync(path(file));
    assert.equal(face.variationAxes === undefined ? 0 : Object.keys(face.variationAxes).length, 0, file);
  }
});
