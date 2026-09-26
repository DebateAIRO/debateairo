import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
// The same module instance renderReport.ts loads (pnpm keeps react-pdf under apps/ui only).
import { Font } from "../../apps/ui/node_modules/@react-pdf/renderer";
import { renderReportPdf, reportHyphenation, resolveReportFontDirectory } from "../../apps/ui/lib/report/renderReport.js";
import {
  STORY_FIXTURE_ANSWER,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";

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

/** The decompressed text of every content stream, lower-cased: enough to read the ToUnicode maps. */
function inflatedStreams(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      out.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
    } catch {
      // not a deflate stream (an image, say); nothing to read
    }
  }
  return out.join("\n").toLowerCase();
}

describe("renderReportPdf (spec §10)", () => {
  it("finds the vendored fonts from the repository root and from apps/ui", () => {
    expect(resolveReportFontDirectory(process.cwd())).toBe(resolve(process.cwd(), "apps/ui/assets/fonts"));
    expect(resolveReportFontDirectory(resolve(process.cwd(), "apps/ui"))).toBe(resolve(process.cwd(), "apps/ui/assets/fonts"));
    expect(() => resolveReportFontDirectory(resolve(process.cwd(), "packages"))).toThrow("REPORT_FONTS_UNRESOLVED");
  });

  it("renders the fixture story to a PDF with embedded fonts, internal links and Romanian letters", async () => {
    const pdf = await renderReportPdf({
      answer: STORY_FIXTURE_ANSWER,
      story: storyFixture("READY_WITH_RESERVATION"),
      generatedAt: new Date("2026-09-26T12:00:00.000Z")
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
    // The outline (bookmarks) lists the report's fixed parts.
    expect([...raw.matchAll(/\/Title \(([^)]*)\)/g)].map((match) => match[1])).toEqual([
      "In short", "The full story", "How this verdict was computed", "Appendix: every point", "About this report"
    ]);
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
    const pdf = await renderReportPdf({ answer, story, generatedAt: new Date("2026-09-26T12:00:00.000Z") });
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
      generatedAt: new Date("2026-09-26T12:00:00.000Z")
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    expect(raw.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(20);
    // Every one of the 150 appendix entries is a link target.
    expect(new Set(raw.match(/\(point-P[0-9]+\)/g)).size).toBe(150);
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
    // The appendix points are link targets; P5 is the one the sample's reservation names.
    expect(pdf.toString("latin1")).toContain("(point-P5)");
  }, 125_000);

  it("fails loudly without an output path", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("<absolute path to the output .pdf>");
  }, 125_000);
});
