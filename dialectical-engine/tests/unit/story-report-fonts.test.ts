import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { bakeGlyphOffsets, basesBeforeTheirMarks, placeGlyphs, type ReportGlyphPosition } from "../../apps/ui/lib/report/reportGlyphs.js";
import { REPORT_FONT_FACES, REPORT_FONT_FAMILIES, reportFaces, reportScript } from "../../apps/ui/lib/report/reportFonts.js";
import { reportLayout } from "../../apps/ui/lib/report/reportLayout.js";

const NON_LATIN = ["bg", "ru", "uk", "el", "he", "ar", "hi", "zh", "ja", "ko"];
const LATIN = LOCALES.map(({ code }) => code).filter((code) => !NON_LATIN.includes(code));
const { sans, serif, notoSans, hebrew, devanagari, simplifiedChinese, japanese, korean } = REPORT_FONT_FAMILIES;

describe("the report's faces, chosen from its language (lib/report/reportFonts.ts)", () => {
  it("keeps today's look for every Latin-script locale: Plus Jakarta Sans for the text, Fraunces for the part titles", () => {
    expect(LATIN).toHaveLength(25);
    for (const locale of LATIN) {
      expect(reportScript(locale), locale).toBe("latin");
      const faces = reportFaces(locale, "Răspunsul nostru");
      expect(faces.body[0], locale).toBe(sans);
      expect(faces.heading.slice(0, 2), locale).toEqual([serif, sans]);
      expect(faces.headingWeight, locale).toBe(600);
    }
  });

  it("prints every other script in its own Noto face, the part titles in that face's bold", () => {
    const own = {
      bg: notoSans, ru: notoSans, uk: notoSans, el: notoSans, he: hebrew,
      hi: devanagari, zh: simplifiedChinese, ja: japanese, ko: korean
    };
    for (const [locale, family] of Object.entries(own)) {
      const faces = reportFaces(locale, "");
      // Hebrew and Devanagari letters come from their own face, second in line: Noto Sans first takes what
      // those faces do not have (reportFonts.ts says why it must be first).
      const second = locale === "he" || locale === "hi";
      expect(faces.body[second ? 1 : 0], locale).toBe(family);
      if (second) expect(faces.body[0], locale).toBe(notoSans);
      expect(faces.heading, locale).toEqual(faces.body);
      expect(faces.headingWeight, locale).toBe(700);
      // Fraunces is a Latin display face: never outside a Latin report.
      expect(faces.heading, locale).not.toContain(serif);
    }
  });

  it("always follows with Noto Sans (Latin, Cyrillic, Greek) and Plus Jakarta Sans (→ ≈ and the other symbols)", () => {
    for (const { code } of LOCALES.filter(({ code }) => code !== "ar")) {
      const { body } = reportFaces(code, "");
      expect(body, code).toContain(notoSans);
      expect(body, code).toContain(sans);
    }
  });

  it("adds a face for another script only when the report's text holds it, so a Latin report never loads the CJK files", () => {
    expect(reportFaces("ro", "Răspunsul nostru: mutați-vă treptat, cu Zoom și α").body).toEqual([sans, notoSans]);
    expect(reportFaces("ro", "Citat: 日本語のテキスト").body).toEqual([sans, notoSans, japanese, simplifiedChinese]);
    expect(reportFaces("ro", "Citat: 中文").body).toEqual([sans, notoSans, simplifiedChinese]);
    expect(reportFaces("en", "Quote: 한국어").body).toEqual([sans, notoSans, korean]);
    expect(reportFaces("ru", "Цитата: שלום и नमस्ते").body).toEqual([notoSans, sans, hebrew, devanagari]);
    expect(reportFaces("he", "").body).toEqual([notoSans, hebrew, sans]);
    expect(reportFaces("hi", "").body).toEqual([notoSans, devanagari, sans]);
    // A face already in the list is not added twice.
    expect(reportFaces("ja", "日本語のテキスト").body).toEqual([japanese, notoSans, sans, simplifiedChinese]);
    expect(reportFaces("zh", "中文").body).toEqual([simplifiedChinese, notoSans, sans]);
  });

  it("has no face for Arabic, which the report cannot print yet", () => {
    expect(reportScript("ar")).toBe("arabic");
    expect(() => reportFaces("ar", "")).toThrow("REPORT_LOCALE_UNSUPPORTED");
  });

  it("registers only regular, bold, and italic where the script has one; a script without an italic prints it upright", () => {
    for (const [family, faces] of Object.entries(REPORT_FONT_FACES)) {
      if (family === serif) {
        expect(faces.map(({ fontWeight, fontStyle }) => `${fontWeight} ${fontStyle}`)).toEqual(["600 normal"]);
        continue;
      }
      expect(faces.map(({ fontWeight, fontStyle }) => `${fontWeight} ${fontStyle}`), family).toEqual(["400 normal", "400 italic", "700 normal"]);
      const regular = faces[0]!.file;
      const italic = faces[1]!.file;
      if (family === sans || family === notoSans) expect(italic, family).toMatch(/-Italic\.ttf$/u);
      else expect(italic, family).toBe(regular);
    }
  });
});

describe("glyph placement (lib/report/reportGlyphs.ts)", () => {
  const positions = (...pairs: [number, number][]): ReportGlyphPosition[] =>
    pairs.map(([xAdvance, xOffset]) => ({ xAdvance, xOffset }));
  const drawnAt = (list: readonly ReportGlyphPosition[]): number[] => {
    let pen = 0;
    return list.map((position) => {
      const spot = pen + position.xOffset;
      pen += position.xAdvance;
      return spot;
    });
  };
  const width = (list: readonly ReportGlyphPosition[]): number => list.reduce((sum, position) => sum + position.xAdvance, 0);

  it("draws a mark where the font placed it, with no offset left for the renderer to misprint", () => {
    // A letter 500 wide, its mark placed 300 back over it, then the next letter.
    const run = positions([500, 0], [0, -300], [400, 0]);
    const before = drawnAt(run);
    bakeGlyphOffsets(run);
    expect(run.map(({ xOffset }) => xOffset)).toEqual([0, 0, 0]);
    expect(drawnAt(run)).toEqual(before);
    expect(drawnAt(run)).toEqual([0, 200, 500]);
  });

  it("keeps the run's width, so lines break where they did", () => {
    const run = positions([620, 0], [0, -410], [0, -380], [330, 0], [0, 25], [500, 0]);
    const before = { width: width(run), drawn: drawnAt(run) };
    bakeGlyphOffsets(run);
    expect(width(run)).toBe(before.width);
    expect(drawnAt(run)).toEqual(before.drawn);
  });

  it("leaves a run without offsets exactly as it was", () => {
    const run = positions([500, 0], [320, 0], [410, 0]);
    bakeGlyphOffsets(run);
    expect(run).toEqual(positions([500, 0], [320, 0], [410, 0]));
  });

  it("keeps the first glyph where the run starts, and the rest where the font put them", () => {
    const run = positions([0, 120], [500, 0], [0, -250]);
    bakeGlyphOffsets(run);
    expect(drawnAt(run)).toEqual([0, 0, 250]);
    expect(width(run)).toBe(500);
  });
});

describe("right to left (lib/report/reportLayout.ts)", () => {
  it("sets a Hebrew report right to left: aligned right, the fates, numbers and labels on the right, the page numbers on the left", () => {
    expect(reportLayout("he", "")).toMatchObject({
      direction: "rtl", textAlign: "right", markerSide: "right", pageNumberSide: "left", trackedCapitals: false
    });
  });

  it("keeps every left-to-right report as it was: aligned left, markers on the left, page numbers on the right", () => {
    for (const { code } of LOCALES.filter(({ code }) => code !== "ar" && code !== "he")) {
      expect(reportLayout(code, ""), code).toMatchObject({ direction: "ltr", textAlign: "left", markerSide: "left", pageNumberSide: "right" });
    }
  });

  it("letter-spaces the small capitals only where the script has capitals", () => {
    const tracked = LOCALES.map(({ code }) => code).filter((code) => code !== "ar" && reportLayout(code, "").trackedCapitals);
    expect(tracked.sort()).toEqual([...LATIN, "bg", "el", "ru", "uk"].sort());
  });
});

describe("glyph placement in a right-to-left run (lib/report/reportGlyphs.ts)", () => {
  // fontkit's right-to-left run, left to right: a mark (placed 52 into its letter), the letter, a dot (placed
  // 140 into the next letter), that letter.
  const run = (): ReportGlyphPosition[] => [
    { xAdvance: 0, xOffset: 52 }, { xAdvance: 269, xOffset: 0 }, { xAdvance: 0, xOffset: 140 }, { xAdvance: 477, xOffset: 0 }
  ];
  const drawnAt = (list: readonly ReportGlyphPosition[]): number[] => {
    let pen = 0;
    return list.map((position) => { const spot = pen + position.xOffset; pen += position.xAdvance; return spot; });
  };

  it("draws each letter before its marks", () => {
    expect(basesBeforeTheirMarks(run())).toEqual([1, 0, 3, 2]);
    expect(basesBeforeTheirMarks([{ xAdvance: 300, xOffset: 0 }, { xAdvance: 0, xOffset: 0 }])).toEqual([0, 1]);
  });

  it("draws every glyph where fontkit placed it, with no offset, and keeps the run's width", () => {
    const positions = run();
    const glyphs = ["mark", "letter", "dot", "next letter"];
    placeGlyphs(glyphs, positions, basesBeforeTheirMarks(positions));
    expect(glyphs).toEqual(["letter", "mark", "next letter", "dot"]);
    expect(drawnAt(positions)).toEqual([0, 52, 269, 409]);
    expect(positions.every(({ xOffset }) => xOffset === 0)).toBe(true);
    expect(positions.reduce((sum, { xAdvance }) => sum + xAdvance, 0)).toBe(746);
  });
});
