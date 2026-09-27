import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
// The same module instance renderReport.ts loads (pnpm keeps react-pdf under apps/ui only).
import { Font } from "../../apps/ui/node_modules/@react-pdf/renderer";
import { createRequire } from "node:module";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { loadReportCatalogs, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { renderReportPdf, reportHyphenation, resolveReportFontDirectory } from "../../apps/ui/lib/report/renderReport.js";
import { REPORT_PLACED_FONT, reportPlacedFont } from "../../apps/ui/lib/report/reportGlyphs.js";
import { reportLayout, reportPrintedText } from "../../apps/ui/lib/report/reportLayout.js";
import { buildReportModel } from "../../apps/ui/lib/report/reportModel.js";
import {
  STORY_FIXTURE_ANSWER,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import {
  STORY_SCRIPT_SAMPLE_LOCALES,
  storyScriptSample,
  storyScriptSampleText,
  type StoryScriptSampleLocale
} from "../../apps/ui/lib/v3/storyScriptSamples.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * The fontkit the renderer shapes with, loaded by Node the way @react-pdf/font
 * loads it. Imported through vite instead, fontkit and its own dependencies
 * resolve to other builds, and those shape Devanagari differently (the i sign
 * stays after its consonant), so the expected glyphs would be wrong.
 */
const fromRenderer = createRequire(createRequire(resolve(process.cwd(), "apps/ui/package.json")).resolve("@react-pdf/renderer"));
const fromFontPackage = createRequire(fromRenderer.resolve("@react-pdf/font"));
const { create: fontkitCreate, openSync: fontkitOpenSync } = fromFontPackage("fontkit") as {
  create(data: Buffer): unknown;
  openSync(path: string): unknown;
};

/** The part of a fontkit font this file reads. */
interface OpenedFont {
  readonly numGlyphs: number;
  getGlyph(id: number): { readonly advanceWidth: number; readonly path: { toSVG(): string } };
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): { readonly glyphs: readonly { readonly id: number }[] };
}

function answerWithPoints(roots: number, childrenPerRoot: number): Answer {
  const nodes: Answer["nodes"] = [];
  const edges: Answer["edges"] = [];
  for (let root = 0; root < roots; root += 1) {
    nodes.push(storyFixtureNode({
      id: `r${root}`, claim: `Poziția ${root + 1}: mutarea în Cluj merită doar cu lucru hibrid.`, way: "REASONING",
      base: 0.5, final: 0.5, maker: "OpenAI", review: null, locator: null, marks: []
    }));
    for (let child = 0; child < childrenPerRoot; child += 1) {
      nodes.push(storyFixtureNode({
        id: `r${root}-c${child}`, claim: `Argumentul ${child + 1} pentru poziția ${root + 1}: chiria și școala contează.`,
        way: "REASONING", base: 0.4, final: 0.4, maker: "Anthropic",
        review: { outcome: "agree", by: "xAI", reason: "Argumentul se sprijină pe datele din dezbatere." },
        locator: null, marks: []
      }));
      edges.push(storyFixtureEdge({ from: `r${root}-c${child}`, to: `r${root}`, relation: "support", strength: 0.4 }));
    }
  }
  return { ...STORY_FIXTURE_ANSWER, nodes, edges };
}

/** answerWithPoints, its points in the sample language's own words (the sample's five claims, in turn). */
function answerWithPointsIn(locale: StoryScriptSampleLocale, roots: number, childrenPerRoot: number): Answer {
  const claims = storyScriptSample(locale).answer.nodes.map((node) => node.claim);
  const base = answerWithPoints(roots, childrenPerRoot);
  return { ...base, nodes: base.nodes.map((node, index) => ({ ...node, claim: `${claims[index % claims.length]!} (${index + 1})` })) };
}

/** The decompressed text of each content stream, lower-cased. */
function streamTexts(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      out.push(inflateSync(pdf.subarray(start, end)).toString("latin1").toLowerCase());
    } catch {
      // not a deflate stream (an image, say); nothing to read
    }
  }
  return out;
}

/** The decompressed text of every content stream, lower-cased: enough to read the ToUnicode maps. */
function inflatedStreams(pdf: Buffer): string {
  return streamTexts(pdf).join("\n");
}

/**
 * Every glyph the pages draw, as the four hex digits pdfkit writes for an
 * embedded font (Identity-H). A glyph 0000 is the font's .notdef: an empty box
 * where a character had no glyph.
 */
function drawnGlyphs(pdf: Buffer): string[] {
  const glyphs: string[] = [];
  for (const stream of streamTexts(pdf)) {
    for (const array of stream.matchAll(/\[([^\]]*)\]\s*tj/gu)) {
      for (const hex of array[1]!.matchAll(/<([0-9a-f]*)>/gu)) {
        for (let at = 0; at < hex[1]!.length; at += 4) glyphs.push(hex[1]!.slice(at, at + 4));
      }
    }
  }
  return glyphs;
}

/** The embedded fonts' names, without pdfkit's six-letter subset tag. */
function embeddedFonts(raw: string): string[] {
  return [...new Set(Array.from(raw.matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)/gu), (match) => match[1]!))].sort();
}

/** The decompressed bytes of one indirect object's stream (pdfkit writes each as `N 0 obj << /Length … /Filter /FlateDecode >>`). */
function objectStream(pdf: Buffer, object: string): Buffer {
  const raw = pdf.toString("latin1");
  const start = new RegExp(`\\n${object} 0 obj\\n<<\\n/Length \\d+\\n/Filter /FlateDecode\\n>>\\nstream\\n`, "u").exec(raw);
  if (start === null) return Buffer.alloc(0);
  const from = start.index + start[0].length;
  return inflateSync(pdf.subarray(from, raw.indexOf("endstream", from)));
}

/** One run of glyphs a page draws: where it starts, the embedded font's object and name, and its glyph ids in that font. */
interface DrawnPiece {
  readonly x: number;
  readonly y: number;
  readonly fontObject: string;
  readonly font: string;
  readonly glyphs: readonly number[];
}

/**
 * Every run of glyphs each page draws, in drawing order, each placed through
 * the page's transformation and text matrices: one TJ, or one glyph that
 * render 4.7.0 moved with its own text matrix (a mark with an offset).
 */
function drawnPieces(pdf: Buffer): DrawnPiece[][] {
  const raw = pdf.toString("latin1");
  const names = new Map(Array.from(raw.matchAll(/\n(\d+) 0 obj\n<<\n\/Type \/Font\n\/Subtype \/Type0\n\/BaseFont \/(?:[A-Z]{6}\+)?([^\n]+)/gu), (match) => [match[1]!, match[2]!]));
  // pdfkit names its fonts F1, F2… once for the whole document.
  const fonts = new Map(Array.from(raw.matchAll(/\/(F\d+) (\d+) 0 R/gu), (match) => [match[1]!, match[2]!]));
  const pages: DrawnPiece[][] = [];
  for (const page of raw.matchAll(/\/Type \/Page\n\/Parent \d+ 0 R\n[\s\S]*?\/Contents (\d+) 0 R/gu)) {
    type Matrix = [number, number, number, number, number, number];
    const times = (m: Matrix, n: Matrix): Matrix => [
      m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
      m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
      m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
    ];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const saved: Matrix[] = [];
    let fontObject: string | undefined;
    let at = { x: 0, y: 0 };
    const pieces: DrawnPiece[] = [];
    const number = "(-?[\\d.]+)";
    const operators = new RegExp(`(?<save>\\bq\\b)|(?<restore>\\bQ\\b)|(?<cm>${number} ${number} ${number} ${number} ${number} ${number} cm)|\\/(?<font>F\\d+) [\\d.]+ Tf|(?<tm>${number} ${number} ${number} ${number} ${number} ${number} Tm)|\\[(?<tj>[^\\]]*)\\] TJ`, "gu");
    for (const token of objectStream(pdf, page[1]!).toString("latin1").matchAll(operators)) {
      const groups = token.groups!;
      const values = token.slice(1).filter((value) => value !== undefined && /^-?[\d.]+$/u.test(value)).map(Number);
      if (groups.save !== undefined) saved.push(ctm);
      else if (groups.restore !== undefined) ctm = saved.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (groups.cm !== undefined) ctm = times(values as Matrix, ctm);
      else if (groups.font !== undefined) fontObject = fonts.get(groups.font);
      else if (groups.tm !== undefined) {
        const [x, y] = [values[4]!, values[5]!];
        at = { x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] };
      } else if (groups.tj !== undefined && fontObject !== undefined) {
        const glyphs = Array.from(groups.tj.matchAll(/<([0-9a-f]*)>/giu), (hex) => hex[1]!.match(/.{4}/gu) ?? []).flat().map((glyph) => parseInt(glyph, 16));
        pieces.push({ ...at, fontObject, font: names.get(fontObject) ?? "", glyphs });
      }
    }
    pages.push(pieces);
  }
  return pages;
}

/** Each page's pieces, grouped into lines from the top, each line's pieces from the left. */
function piecesByLine(pieces: readonly DrawnPiece[]): DrawnPiece[][] {
  const lines = new Map<number, DrawnPiece[]>();
  for (const piece of pieces) lines.set(Math.round(piece.y), [...(lines.get(Math.round(piece.y)) ?? []), piece]);
  return [...lines.entries()].sort(([a], [b]) => b - a).map(([, line]) => [...line].sort((a, b) => a.x - b.x));
}

/**
 * The text each page draws, line by line, left to right as it stands on the
 * page: every glyph read back through its font's ToUnicode map, every run
 * placed through the page's transformation and text matrices. A right-to-left
 * line reads here in the order it is printed.
 */
function drawnLines(pdf: Buffer): string[][] {
  const raw = pdf.toString("latin1");
  // pdfkit writes a glyph that stands for several characters as <0915 094d 0937>.
  const text = (hex: string) => String.fromCharCode(...hex.split(" ").filter(Boolean).map((unit) => parseInt(unit, 16)));
  // Each embedded font's glyph → text map, from its ToUnicode CMap.
  const maps = new Map<string, Map<number, string>>();
  for (const font of raw.matchAll(/\n(\d+) 0 obj\n<<\n\/Type \/Font\n\/Subtype \/Type0\n[^>]*?\/ToUnicode (\d+) 0 R/gu)) {
    const glyphs = new Map<number, string>();
    for (const range of objectStream(pdf, font[2]!).toString("latin1").matchAll(/<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/giu)) {
      const first = parseInt(range[1]!, 16);
      Array.from(range[2]!.matchAll(/<([0-9a-f ]*)>/giu)).forEach((unicode, index) => glyphs.set(first + index, text(unicode[1]!)));
    }
    maps.set(font[1]!, glyphs);
  }
  return drawnPieces(pdf).map((pieces) => piecesByLine(pieces).map((line) => line
    .map((piece) => piece.glyphs.map((glyph) => maps.get(piece.fontObject)?.get(glyph) ?? "�").join("")).join("")));
}

/**
 * A font's glyphs by outline: each glyph id to the lowest id with the same
 * outline and advance, so two copies of one drawing count as one glyph.
 */
const canonicalGlyphs = new WeakMap<OpenedFont, Readonly<{ ofId: (id: number) => number; ofOutline: Map<string, number> }>>();
function glyphIdentity(font: OpenedFont): Readonly<{ ofId: (id: number) => number; ofOutline: Map<string, number> }> {
  const known = canonicalGlyphs.get(font);
  if (known !== undefined) return known;
  const ofOutline = new Map<string, number>();
  const byId: number[] = [];
  for (let id = 0; id < font.numGlyphs; id += 1) {
    const glyph = font.getGlyph(id);
    const key = `${glyph.advanceWidth}|${glyph.path.toSVG()}`;
    if (!ofOutline.has(key)) ofOutline.set(key, id);
    byId.push(ofOutline.get(key)!);
  }
  const identity = { ofId: (id: number) => byId[id] ?? -1, ofOutline };
  canonicalGlyphs.set(font, identity);
  return identity;
}

/**
 * The runs of glyphs the pages draw in one embedded font, one per TJ (a text
 * run of one line; render 4.7.0 also gives a glyph with an offset a TJ of its
 * own), each as glyphs of the vendored font file it was cut from (`original`,
 * each glyph as its outline's lowest id). pdfkit renumbers a font's glyphs
 * when it subsets it, so each glyph of the embedded subset is matched to the
 * original glyph with the same outline and advance (-1 when none).
 */
function drawnGlyphRuns(pdf: Buffer, fontName: string, original: OpenedFont): (readonly number[])[] {
  const raw = pdf.toString("latin1");
  const descriptor = new RegExp(`/FontName /[A-Z]{6}\\+${fontName}\\n[\\s\\S]*?/FontFile2 (\\d+) 0 R`, "u").exec(raw);
  if (descriptor === null) return [];
  const subset = fontkitCreate(objectStream(pdf, descriptor[1]!)) as unknown as OpenedFont;
  const { ofOutline } = glyphIdentity(original);
  const toOriginal = (id: number) => {
    const glyph = subset.getGlyph(id);
    return ofOutline.get(`${glyph.advanceWidth}|${glyph.path.toSVG()}`) ?? -1;
  };
  return drawnPieces(pdf).flat().filter((piece) => piece.font === fontName).map((piece) => piece.glyphs.map(toOriginal));
}

/**
 * The PDF's outline titles, decoded: pdfkit writes an ASCII title as a plain
 * string and any other as UTF-16BE with a byte order mark, escaped.
 */
function outlineTitles(raw: string): string[] {
  const titles: string[] = [];
  for (let at = raw.indexOf("/Title ("); at >= 0; at = raw.indexOf("/Title (", at + 1)) {
    let index = at + "/Title (".length;
    let bytes = "";
    for (; raw[index] !== ")"; index += 1) {
      if (raw[index] !== "\\") { bytes += raw[index]; continue; }
      index += 1;
      const escaped = raw[index]!;
      if (/[0-7]/u.test(escaped)) {
        const octal = raw.slice(index, index + 3).match(/^[0-7]{1,3}/u)![0];
        bytes += String.fromCharCode(parseInt(octal, 8));
        index += octal.length - 1;
      } else {
        bytes += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[escaped] ?? escaped;
      }
    }
    const buffer = Buffer.from(bytes, "latin1");
    titles.push(buffer[0] === 0xfe && buffer[1] === 0xff ? buffer.subarray(2).swap16().toString("utf16le") : bytes);
  }
  return titles;
}

/** An Info dictionary entry's plain ASCII string: pdfkit writes each as its own object ("/Subject 116 0 R"). */
function infoString(raw: string, name: "Subject" | "Keywords"): string | null {
  const reference = new RegExp(`/${name} (\\d+) 0 R`, "u").exec(raw);
  if (reference === null) return null;
  return new RegExp(`\\n${reference[1]} 0 obj\\n\\(([^)]*)\\)\\nendobj`, "u").exec(raw)?.[1] ?? null;
}

let ROMANIAN: ReportCatalogs;
let ENGLISH: ReportCatalogs;
beforeAll(async () => {
  ROMANIAN = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "en", load: loadNamespace });
  ENGLISH = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load: loadNamespace });
});

describe("renderReportPdf (spec §10)", () => {
  it("finds the vendored fonts from the repository root and from apps/ui", () => {
    expect(resolveReportFontDirectory(process.cwd())).toBe(resolve(process.cwd(), "apps/ui/assets/fonts"));
    expect(resolveReportFontDirectory(resolve(process.cwd(), "apps/ui"))).toBe(resolve(process.cwd(), "apps/ui/assets/fonts"));
    expect(() => resolveReportFontDirectory(resolve(process.cwd(), "packages"))).toThrow("REPORT_FONTS_UNRESOLVED");
  });

  it("renders the fixture story to a Romanian PDF with embedded fonts, internal links and Romanian letters", async () => {
    const pdf = await renderReportPdf({
      answer: STORY_FIXTURE_ANSWER,
      story: storyFixture("READY_WITH_RESERVATION"),
      generatedAt: new Date("2026-09-26T12:00:00.000Z"),
      catalogs: ROMANIAN
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    // Both families are embedded: the serif headings and the sans text.
    expect(raw.match(/\/FontFile2/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Fraunces/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+PlusJakartaSans/);
    expect(raw.match(/\/Subtype \/Link/g)?.length ?? 0).toBeGreaterThan(10);
    // Every link is internal (a named destination in the appendix); no link leaves the file.
    expect(raw).not.toMatch(/\/URI\s*\(/);
    for (let point = 1; point <= 8; point += 1) expect(raw).toContain(`(point-P${point})`);
    // Only the appendix entries are destinations: nothing without an id adds one.
    expect(raw).not.toContain("(undefined)");
    // The outline (bookmarks) lists the report's fixed parts, in Romanian.
    expect(outlineTitles(raw)).toEqual([
      "Pe scurt", "Povestea completă", "De ce acest răspuns", "Punctele dezbaterii", "Despre acest raport"
    ]);
    // The document says it is Romanian, and its metadata carries the ENGLISH disclosure line for machines.
    expect(raw).toContain("/Lang (ro)");
    expect(infoString(raw, "Subject")).toBe("This report was written by AI models from the debate's arguments.");
    expect(infoString(raw, "Keywords")).toBe("AI-generated");
    const maps = inflatedStreams(pdf);
    // ș ț ă î â are mapped in the embedded fonts' ToUnicode tables: they print and copy as themselves.
    for (const codePoint of ["0219", "021b", "0103", "00ee", "00e2"]) expect(maps).toContain(`<${codePoint}>`);
  }, 60_000);

  it("breaks a 150-character address in a story paragraph and in an appendix claim instead of running off the page", async () => {
    const url =
      "https://www.exemplu-imobiliare.ro/anunturi/inchiriere/cluj-napoca/apartamente-3-camere/zorilor?pret_min=2500&pret_max=4200&sortare=pret&pagina=12&id=9";
    expect(url).toHaveLength(150);
    const story = storyFixture("READY_WITH_RESERVATION");
    story.story!.long.sections[0]!.paragraphs[0]!.text = `Anunțurile sunt aici: ${url} și arată chirii mai mari.`;
    const answer: Answer = {
      ...STORY_FIXTURE_ANSWER,
      nodes: STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id === "n-yes-rent" ? { ...node, claim: `Vezi ${url}` } : node)
    };
    const pdf = await renderReportPdf({ answer, story, generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs: ROMANIAN });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).not.toContain("(undefined)");
    // The renderer registered exactly this rule, so it is the one the PDF above was laid out with.
    expect(Font.getHyphenationCallback()).toBe(reportHyphenation);
    // The rule the renderer registers: ordinary words stay whole; the address gets zero-width break
    // points (empty syllables) between pieces of at most 20 characters, and not one character is added.
    expect(reportHyphenation("Anunțurile")).toEqual(["Anunțurile"]);
    // Chinese and Japanese text breaks between its characters, with the same zero-width break points.
    expect(reportHyphenation("我们的")).toEqual(["我", "", "们", "", "的"]);
    const parts = reportHyphenation(url);
    expect(parts.join("")).toBe(url);
    expect(parts.filter((part) => part === "").length).toBeGreaterThan(7);
    expect(Math.max(...parts.map((part) => part.length))).toBeLessThanOrEqual(20);
  }, 60_000);

  it("renders a 150-point appendix across many pages", async () => {
    // Regression guard, measured 2026-09-26: with a Page-level lineHeight next to the page-number
    // footer, @react-pdf/renderer 4.9.0 threw "unsupported number" once the appendix passed ~15 pages.
    const story: AnswerStory = { ...storyFixture("READY"), point_numbers: null };
    const pdf = await renderReportPdf({
      answer: answerWithPoints(10, 14),
      story,
      generatedAt: new Date("2026-09-26T12:00:00.000Z"),
      catalogs: ENGLISH
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    expect(raw.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(20);
    // Every one of the 150 appendix entries is a link target.
    expect(new Set(raw.match(/\(point-P[0-9]+\)/g)).size).toBe(150);
    expect(outlineTitles(raw)).toEqual([
      "In short", "The full story", "Why this answer", "The points of the debate", "About this report"
    ]);
  }, 120_000);

  it("refuses to print a language it cannot print correctly, instead of printing it wrongly", async () => {
    // Arabic: react-pdf 4.9.0 drops the vertical mark positions its dotted letters need (reportLanguage.ts).
    const arabic: ReportCatalogs = { ...ENGLISH, locale: "ar" };
    const { answer, story } = storyScriptSample("ar");
    await expect(renderReportPdf({
      answer,
      story,
      generatedAt: new Date("2026-09-26T12:00:00.000Z"),
      catalogs: arabic
    })).rejects.toThrow("REPORT_LOCALE_UNSUPPORTED");
  });
});

describe("the report in the question's own script (R-fonts)", () => {
  const GENERATED = new Date("2026-09-26T12:00:00.000Z");
  const catalogs = (locale: string) => loadReportCatalogs({ questionTag: locale, interfaceLocale: "en", load: loadNamespace });
  const render = async (locale: StoryScriptSampleLocale) => {
    const { answer, story } = storyScriptSample(locale);
    return renderReportPdf({ answer, story, generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs: await catalogs(locale) });
  };
  /**
   * The letters each sample prints, as the ToUnicode maps write them. Not the
   * Devanagari independent vowels: Noto Sans Devanagari draws ई as इ plus a
   * mark, one glyph that can copy out as only one of the two.
   */
  const letters = (text: string) => [...new Set([...text])]
    .filter((character) => /\p{L}/u.test(character) && !/[\u0904-\u0914]/u.test(character))
    .map((character) => character.codePointAt(0)!.toString(16).padStart(4, "0"));

  it.each([
    ["ru", ["NotoSans-Bold", "NotoSans-Italic", "NotoSans-Regular"]],
    ["el", ["NotoSans-Bold", "NotoSans-Italic", "NotoSans-Regular"]],
    ["he", ["NotoSans-Regular", "NotoSansHebrew-Bold", "NotoSansHebrew-Regular"]],
    ["hi", ["NotoSans-Regular", "NotoSansDevanagari-Bold", "NotoSansDevanagari-Regular"]],
    ["zh", ["NotoSansSC-Bold", "NotoSansSC-Regular"]],
    ["ja", ["NotoSansJP-Bold", "NotoSansJP-Regular"]],
    ["ko", ["NotoSansKR-Bold", "NotoSansKR-Regular"]]
  ] as const)("prints the %s sample in its own Noto face, with no empty box and no fallback to the standard fonts", async (locale, faces) => {
    const pdf = await render(locale);
    const raw = pdf.toString("latin1");
    expect(raw).toContain(`/Lang (${locale})`);
    const embedded = embeddedFonts(raw);
    for (const face of faces) expect(embedded, locale).toContain(face);
    // Nothing fell back to Helvetica, whose standard encoding has no glyph for these letters.
    expect(embedded.filter((name) => /Helvetica|Times|Courier/u.test(name)), locale).toEqual([]);
    const glyphs = drawnGlyphs(pdf);
    expect(glyphs.length, locale).toBeGreaterThan(500);
    expect(glyphs.filter((glyph) => glyph === "0000"), `${locale}: .notdef drawn`).toEqual([]);
    // Every letter of the sample copies out of the PDF as itself.
    const maps = inflatedStreams(pdf);
    const sample = storyScriptSampleText(locale);
    const missing = letters(sample).filter((codePoint) => !maps.includes(codePoint));
    expect(missing, locale).toEqual([]);
  }, 120_000);

  it("prints Hebrew right to left: each line in reading order from the right, a Latin name, a number and [Pn] in their own order, the fates on the right, the page numbers on the left", async () => {
    const hebrew = await catalogs("he");
    const pdf = await render("he");
    const pages = drawnLines(pdf);
    const all = pages.flat().join("\n");
    // No direction mark, embedding or isolate reaches the PDF's text: the report adds none, and its words carry none.
    expect(inflatedStreams(pdf)).not.toMatch(/[< ](200e|200f|061c|202[a-e]|206[6-9])[ >]/u);
    const controls = [0x200e, 0x200f, 0x061c, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    expect([...all].filter((character) => controls.includes(character.codePointAt(0)!))).toEqual([]);
    /** How a run of Hebrew words stands on the page: its letters from the right. */
    const printed = (words: string) => [...words].reverse().join("");
    // The headline, as printed on the page, from its first words at the right edge.
    expect(pages[0]!.some((line) => line.endsWith(printed("התשובה שלנו:")))).toBe(true);
    // Every Hebrew word of the sample is drawn whole, its letters from the right.
    const words = [...new Set(storyScriptSampleText("he").split(/[\s.,:;()]+/u).filter((word) => /^\p{Script=Hebrew}+$/u.test(word)))];
    expect(words.length).toBeGreaterThan(200);
    expect(words.filter((word) => !all.includes(printed(word)))).toEqual([]);
    // A Latin word, a number and a citation keep their own left-to-right order inside the Hebrew lines.
    expect(all).toContain("Zoom");
    expect(all).not.toContain("mooZ");
    expect(all).toContain("35%");
    expect(all).toMatch(/\[P\d\]/u);
    // Each short path line starts at the right with its fate, in the fate column.
    const fate = hebrew.publicCatalog["public.story.fate.partlyHeld"]!;
    expect(pages[0]!.filter((line) => line.endsWith(printed(fate))).length).toBe(2);
    // The footer: page numbers on the left, the footer's words on the right.
    const footer = pages[0]!.at(-1)!;
    expect(footer.indexOf("1")).toBeLessThan(footer.indexOf("DebateAI"));
    // A left-to-right report keeps its footer the other way round (control).
    const romanian = drawnLines(await renderReportPdf({
      answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY"), generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs: ROMANIAN
    }));
    const romanianFooter = romanian[0]!.at(-1)!;
    expect(romanianFooter.indexOf("DebateAI")).toBeLessThan(romanianFooter.indexOf("1"));
  }, 120_000);

  it.each(["hi", "he"] as const)("hands react-pdf every face of the %s report through the glyph fix (reportGlyphs.ts), never the bare font", async (locale) => {
    const { answer, story } = storyScriptSample(locale);
    const reportCatalogs = await catalogs(locale);
    await renderReportPdf({ answer, story, generatedAt: GENERATED, catalogs: reportCatalogs });
    const { faces } = reportLayout(locale, reportPrintedText(buildReportModel(answer, story, GENERATED, reportCatalogs)));
    const registered = Font.getRegisteredFonts();
    const sources = [...new Set([...faces.body, ...faces.heading])].flatMap((family) => registered[family]?.sources ?? []);
    // Noto Sans, the script's own face and Plus Jakarta Sans, each regular, italic and bold.
    expect(sources.length).toBe(9);
    for (const source of sources) {
      expect(source.data, source.src).not.toBeNull();
      expect((source.data as unknown as Record<symbol, unknown>)[REPORT_PLACED_FONT], source.src).toBe(true);
    }
  }, 120_000);

  it("draws every Devanagari word of a Hindi report glyph for glyph as fontkit shapes it: none lost at a line end, none moved, no dotted circle", async () => {
    // textkit 7.0.1 finds where a line ends in the glyphs by counting each glyph's characters; fontkit's glyph
    // cache gave some glyphs the characters of their first use, so lines lost or moved glyphs (reportGlyphs.ts, 1).
    const { answer, story } = storyScriptSample("hi");
    const reportCatalogs = await catalogs("hi");
    const pdf = await renderReportPdf({ answer, story, generatedAt: GENERATED, catalogs: reportCatalogs });
    const directory = resolveReportFontDirectory();
    const open = (file: string) => fontkitOpenSync(join(directory, file)) as unknown as OpenedFont;
    const noto = open("noto-sans/NotoSans-Regular.ttf");
    const faces = {
      "NotoSansDevanagari-Regular": open("noto-sans-devanagari/NotoSansDevanagari-Regular.ttf"),
      "NotoSansDevanagari-Bold": open("noto-sans-devanagari/NotoSansDevanagari-Bold.ttf")
    };
    const devanagari = faces["NotoSansDevanagari-Regular"];
    // The stretches of a text the Devanagari face prints: what Noto Sans, first in the Hindi list, has no glyph for.
    const stretches = (text: string): string[] => {
      const found: string[] = [];
      let stretch = "";
      for (const character of text) {
        const codePoint = character.codePointAt(0)!;
        if (!noto.hasGlyphForCodePoint(codePoint) && devanagari.hasGlyphForCodePoint(codePoint)) {
          stretch += character;
          continue;
        }
        if (stretch.length > 0) found.push(stretch);
        stretch = "";
      }
      if (stretch.length > 0) found.push(stretch);
      return found;
    };
    // fontkit's shaping of each stretch (textkit decomposes Devanagari first), in each face, as outlines. The
    // shaping font is a font object of its own, each glyph built with its own characters (reportPlacedFont): a font
    // whose glyph cache already holds glyphs, as glyphIdentity's does, shapes Devanagari wrongly (reportGlyphs.ts, 1).
    const shapers = new Map(Object.entries(faces).map(([name, font]) => [font, reportPlacedFont(open(
      name === "NotoSansDevanagari-Bold" ? "noto-sans-devanagari/NotoSansDevanagari-Bold.ttf" : "noto-sans-devanagari/NotoSansDevanagari-Regular.ttf"
    ))]));
    const shaped = (font: OpenedFont, stretch: string) =>
      shapers.get(font)!.layout(stretch.normalize("NFD")).glyphs.map((glyph) => glyphIdentity(font).ofId(glyph.id)).join(" ");
    const printed = [...new Set(stretches(reportPrintedText(buildReportModel(answer, story, GENERATED, reportCatalogs))))];
    const drawn = Object.entries(faces).map(([name, font]) => ({
      font,
      runs: drawnGlyphRuns(pdf, name, font).map((run) => run.join(" ")),
      expected: new Set(printed.map((stretch) => shaped(font, stretch)))
    }));
    expect(drawn.reduce((sum, face) => sum + face.runs.length, 0)).toBeGreaterThan(200);
    const dottedCircle = shaped(devanagari, "\u25CC");
    expect(drawn.flatMap((face) => face.runs.filter((run) => run.split(" ").includes(dottedCircle)))).toEqual([]);
    // Every run drawn in a Devanagari face is one of the printed stretches, shaped in that face, glyph for glyph.
    expect(drawn.flatMap((face) => face.runs.filter((run) => !face.expected.has(run)))).toEqual([]);
    // And every stretch of the sample is drawn whole, in one face or the other.
    const sample = [...new Set(stretches(storyScriptSampleText("hi")))];
    expect(sample.length).toBeGreaterThan(200);
    expect(sample.filter((stretch) => !drawn.some((face) => face.runs.includes(shaped(face.font, stretch))))).toEqual([]);
  }, 120_000);

  it.each(["he", "hi", "ru", "zh"] as const)("prints punctuation next to a point number the %s text names, where a span starts inside a fallback stretch, with no empty box", async (locale) => {
    // textkit 7.0.1 lets a span's own first face win for a stretch it had given to a fallback face; the
    // first face of each report must therefore have every character that can stand next to a span.
    const { answer, story } = storyScriptSample(locale);
    const paragraph = story.story!.long.sections[1]!.paragraphs[0]!;
    paragraph.text = `${paragraph.text} (P1) P1, P1. P1: «P1» "P1" [P1] P1;`;
    const pdf = await renderReportPdf({ answer, story, generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs: await catalogs(locale) });
    expect(drawnGlyphs(pdf).filter((glyph) => glyph === "0000"), locale).toEqual([]);
    expect(embeddedFonts(pdf.toString("latin1")).filter((name) => /Helvetica|Times|Courier/u.test(name)), locale).toEqual([]);
  }, 120_000);

  it.each(["zh", "ja", "ko"] as const)("breaks %s lines without printing a hyphen the text does not have, and fills the lines", async (locale) => {
    // No model names (they hold hyphens): every hyphen on these pages would be one the line breaking printed.
    const { answer, story } = storyScriptSample(locale);
    const unnamed: Answer = { ...answer, nodes: answer.nodes.map((node) => ({ ...node, maker_lineage: null, review: node.review === null ? null : { ...node.review, reviewer_lineage: null } })) };
    const pdf = await renderReportPdf({
      answer: unnamed,
      story: { ...story, storyteller: null, checker: null },
      generatedAt: new Date("2026-09-26T12:00:00.000Z"),
      catalogs: await catalogs(locale)
    });
    const pages = drawnLines(pdf);
    const text = pages.flat().join("\n");
    expect(text).toContain(locale === "ko" ? "하이브리드" : locale === "ja" ? "ハイブリッド" : "混合办公");
    expect(text.match(/-/gu) ?? [], locale).toEqual([]);
    // The long story's paragraphs wrap into many lines. Chinese and Japanese lines are filled: a full line
    // holds about 44 fullwidth characters (471 pt at 10.5 pt), where cutting only every 20 characters, the
    // long-word rule alone, leaves at most 40.
    expect(pages[1]!.length, locale).toBeGreaterThan(15);
    if (locale !== "ko") expect(pages[1]!.filter((line) => [...line].length > 40).length, locale).toBeGreaterThanOrEqual(5);
  }, 120_000);
});

describe("every interface language (R-fonts)", () => {
  it("renders the report in each of the 35 locales but Arabic, with no empty box and no standard font, and refuses Arabic", async () => {
    const printed: string[] = [];
    for (const { code } of LOCALES) {
      const sample = (STORY_SCRIPT_SAMPLE_LOCALES as readonly string[]).includes(code)
        ? storyScriptSample(code as StoryScriptSampleLocale)
        : { answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY_WITH_RESERVATION") };
      if (code === "ar") {
        await expect(renderReportPdf({ ...sample, generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs: { ...ENGLISH, locale: "ar" } }))
          .rejects.toThrow("REPORT_LOCALE_UNSUPPORTED");
        continue;
      }
      const catalogs = await loadReportCatalogs({ questionTag: code, interfaceLocale: "en", load: loadNamespace });
      const pdf = await renderReportPdf({ ...sample, generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs });
      const raw = pdf.toString("latin1");
      expect(raw, code).toContain(`/Lang (${code})`);
      expect(embeddedFonts(raw).filter((name) => /Helvetica|Times|Courier/u.test(name)), code).toEqual([]);
      expect(drawnGlyphs(pdf).filter((glyph) => glyph === "0000"), code).toEqual([]);
      printed.push(code);
    }
    expect(printed).toHaveLength(34);
  }, 300_000);

  it.each(["ja", "he"] as const)("renders a 150-point appendix across many pages in %s", async (locale) => {
    const { story } = storyScriptSample(locale);
    const pdf = await renderReportPdf({
      answer: answerWithPointsIn(locale, 10, 14),
      story: { ...story, point_numbers: null },
      generatedAt: new Date("2026-09-26T12:00:00.000Z"),
      catalogs: await loadReportCatalogs({ questionTag: locale, interfaceLocale: "en", load: loadNamespace })
    });
    const raw = pdf.toString("latin1");
    expect(raw.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(20);
    expect(new Set(raw.match(/\(point-P[0-9]+\)/g)).size).toBe(150);
    expect(drawnGlyphs(pdf).filter((glyph) => glyph === "0000")).toEqual([]);
  }, 180_000);
});

describe("the owner's sample report script (look first, then wire)", () => {
  const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/story-sample-pdf.ts", ...args], {
    cwd: resolve(process.cwd(), "apps/ui"),
    env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.scripts.json" },
    encoding: "utf8",
    timeout: 120_000
  });

  it("writes the fixture story's report to the path it is given and says where", () => {
    const output = join(mkdtempSync(join(tmpdir(), "story-sample-pdf-")), "story-report-sample.pdf");
    const result = run([output]);
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    const pdf = readFileSync(output);
    expect(result.stdout.trim()).toBe(`STORY_SAMPLE_PDF_WRITTEN=${output} bytes=${pdf.length}`);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // The appendix points are link targets, and the sample is the Romanian question's report.
    expect(pdf.toString("latin1")).toContain("(point-P5)");
    expect(pdf.toString("latin1")).toContain("/Lang (ro)");
  }, 125_000);

  it("writes a script sample's report when given its language, and refuses Arabic", () => {
    const directory = mkdtempSync(join(tmpdir(), "story-sample-pdf-"));
    const output = join(directory, "story-report-ja.pdf");
    const result = run([output, "ja"]);
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    const pdf = readFileSync(output);
    expect(result.stdout.trim()).toBe(`STORY_SAMPLE_PDF_WRITTEN=${output} bytes=${pdf.length}`);
    expect(pdf.toString("latin1")).toContain("/Lang (ja)");
    const arabic = run([join(directory, "story-report-ar.pdf"), "ar"]);
    expect(arabic.status).not.toBe(0);
    expect(arabic.stderr).toContain("REPORT_LOCALE_UNSUPPORTED: ar");
    const unknown = run([join(directory, "story-report-xx.pdf"), "xx"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("Usage:");
  }, 125_000);

  it("writes the Romanian sample as a floor answer and as a lower-cost answer (Task M6)", () => {
    const directory = mkdtempSync(join(tmpdir(), "story-sample-pdf-"));
    for (const variant of ["floor", "lower-cost"]) {
      const output = join(directory, `story-report-${variant}.pdf`);
      const result = run([output, variant]);
      expect({ variant, status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
      const pdf = readFileSync(output);
      expect(result.stdout.trim()).toBe(`STORY_SAMPLE_PDF_WRITTEN=${output} bytes=${pdf.length}`);
      expect(pdf.toString("latin1")).toContain("/Lang (ro)");
    }
  }, 250_000);

  it("fails loudly without an output path", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("<absolute path to the output .pdf>");
    expect(result.stderr).toContain("|floor|lower-cost]");
  }, 125_000);
});
