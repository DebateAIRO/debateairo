import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
// The same module instance renderReport.ts loads (pnpm keeps react-pdf under apps/ui only).
import { Font } from "../../apps/ui/node_modules/@react-pdf/renderer";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { loadReportCatalogs, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { renderReportPdf, reportHyphenation, resolveReportFontDirectory } from "../../apps/ui/lib/report/renderReport.js";
import {
  STORY_FIXTURE_ANSWER,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import {
  storyScriptSample,
  storyScriptSampleText,
  type StoryScriptSampleLocale
} from "../../apps/ui/lib/v3/storyScriptSamples.js";

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
    ["hi", ["NotoSans-Regular", "NotoSansDevanagari-Bold", "NotoSansDevanagari-Regular"]]
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

  it("fails loudly without an output path", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("<absolute path to the output .pdf>");
  }, 125_000);
});
