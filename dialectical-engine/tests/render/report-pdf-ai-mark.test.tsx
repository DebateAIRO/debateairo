import { inflateSync } from "node:zlib";
import { cloneElement } from "react";
// The same module instance renderReport.ts loads (pnpm keeps react-pdf under apps/ui only).
import { renderToBuffer } from "../../apps/ui/node_modules/@react-pdf/renderer";
import { beforeAll, describe, expect, it } from "vitest";
import { InvestigationReportVersionSchema } from "@debateai/contract";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { InvestigationReportDocument } from "../../apps/ui/lib/report/InvestigationReportDocument.js";
import { buildInvestigationReportPdfModel, type FinishedInvestigationReport } from "../../apps/ui/lib/report/investigationReportModel.js";
import { installPdfAiMark } from "../../apps/ui/lib/report/pdfAiMark.js";
import { ReportDocumentView } from "../../apps/ui/lib/report/ReportDocument.js";
import { loadReportCatalogs, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { buildReportModel } from "../../apps/ui/lib/report/reportModel.js";
import {
  renderInvestigationReportPdf, renderReportPdf, resolveReportFontDirectory, resolveReportLogo
} from "../../apps/ui/lib/report/renderReport.js";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";

/*
 * EU AI Act Art. 50(2) (owner's decision, 16 Nov 2026, option 3): both report PDFs carry an XMP packet in the catalog's
 * /Metadata stream that says, for machines, the document is AI-generated (IPTC digital source type
 * trainedAlgorithmicMedia), beside the Info dictionary's Keywords. Nothing a reader sees changes: every drawn stream is
 * byte for byte the one the same document makes without the mark (PDF 1.3, no XMP).
 */
const DIGITAL_SOURCE_TYPE = "<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>";
const GENERATED_AT = new Date("2026-09-26T12:00:00.000Z");
const QUESTION_WITH_MARKUP = "Should we & they <build> a \"pier\"?";

/** The catalog's /Metadata stream (pdfkit writes it uncompressed), or null when the catalog names none. */
function xmpOf(pdf: Buffer): string | null {
  const raw = pdf.toString("latin1");
  const catalog = /\/Type \/Catalog[\s\S]*?>>/u.exec(raw)?.[0] ?? "";
  const reference = /\/Metadata (\d+) 0 R/u.exec(catalog);
  if (reference === null) return null;
  const object = new RegExp(`\\n${reference[1]} 0 obj\\n<<[\\s\\S]*?>>\\nstream\\n([\\s\\S]*?)\\nendstream`, "u").exec(raw);
  return object === null ? null : Buffer.from(object[1]!, "latin1").toString("utf8");
}

/** Every deflated stream, inflated: the pages' drawing, the fonts, the images. The XMP is not one of them. */
function drawnStreams(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const marker = /stream\r?\n/gu;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try { out.push(inflateSync(pdf.subarray(start, end)).toString("latin1")); } catch { /* not a deflate stream */ }
  }
  return out;
}
const pageCount = (pdf: Buffer): number => (pdf.toString("latin1").match(/\/Type \/Page\b/gu) ?? []).length;

function investigationVersion(): FinishedInvestigationReport {
  return InvestigationReportVersionSchema.parse({
    report_version: 2, closed_at: "2026-10-31T10:00:00.000Z", state: "READY", written_at: "2026-10-31T10:08:00.000Z",
    answer: { segments: ["The whole debate points to rush hour."] },
    story: { short_answer: "Partly.", what_would_change: "Winter ridership falls.", how_it_went: [], still_open: ["Winter."] },
    sources: [{ site: "city.example.org", title: "Ferry ridership", quote: "q", line: "l", link: "https://city.example.org/a" }],
    paths: [{ line: "Partly: it helps at rush hour.", summary: "s", fate: "PARTLY_HELD", level: 0,
      points: [{ text: "Rush hour.", trust: "SURE", side: "for", sources: [0] }] }],
    shortened: false
  }) as FinishedInvestigationReport;
}

let ROMANIAN: ReportCatalogs;
let ENGLISH: ReportCatalogs;
beforeAll(async () => {
  ROMANIAN = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "en", load: loadNamespace });
  ENGLISH = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load: loadNamespace });
});

describe("the report PDFs' machine-readable AI mark (XMP)", () => {
  const story = () => renderReportPdf({ answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY_WITH_RESERVATION"), generatedAt: GENERATED_AT, catalogs: ROMANIAN });
  const investigation = () => renderInvestigationReportPdf({ question: QUESTION_WITH_MARKUP, version: investigationVersion(), catalogs: ENGLISH });

  it.each([["the debate's report", story], ["the investigation's report", investigation]] as const)(
    "%s: a PDF 1.4 whose catalog's /Metadata says AI-generated, consistent with its Info dictionary", async (_name, render) => {
      const pdf = await render();
      expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
      const xmp = xmpOf(pdf);
      expect(xmp).not.toBeNull();
      expect(xmp).toContain('xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"');
      expect(xmp).toContain(DIGITAL_SOURCE_TYPE);
      expect(xmp).toContain("<dc:format>application/pdf</dc:format>");
      expect(xmp).toContain("<pdf:Keywords>AI-generated</pdf:Keywords>");
      expect(xmp).toContain("<pdf:Producer>Dialectical Engine</pdf:Producer>");
      // Said once, however many times the mark was installed.
      expect(xmp!.split(DIGITAL_SOURCE_TYPE)).toHaveLength(2);
      expect(xmp!.match(/<dc:format>/gu)).toHaveLength(1);
    }, 120_000);

  it("escapes the question's own markup characters in the XMP, so the packet stays well-formed XML", async () => {
    installPdfAiMark();
    installPdfAiMark();
    const xmp = xmpOf(await investigation())!;
    expect(xmp).not.toContain("<build>");
    expect(xmp).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/u);
    expect(xmp).toContain("&amp; they &lt;build&gt; a &quot;pier&quot;");
    expect(xmp.split(DIGITAL_SOURCE_TYPE)).toHaveLength(2);
  }, 120_000);

  it("changes nothing a reader sees: the debate's report draws exactly what it draws unmarked (PDF 1.3, no XMP)", async () => {
    const marked = await story();
    const model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), GENERATED_AT, ROMANIAN, null);
    const view = ReportDocumentView({ model, logo: model.charts.length === 0 ? null : resolveReportLogo(resolveReportFontDirectory()) });
    const unmarked = await renderToBuffer(cloneElement(view, { pdfVersion: "1.3" }));
    expect(xmpOf(unmarked)).toBeNull();
    expect(pageCount(marked)).toBe(pageCount(unmarked));
    expect(pageCount(marked)).toBeGreaterThan(1);
    expect(drawnStreams(marked)).toEqual(drawnStreams(unmarked));
  }, 120_000);

  it("changes nothing a reader sees: the investigation's report draws exactly what it draws unmarked", async () => {
    const marked = await investigation();
    const model = buildInvestigationReportPdfModel({ question: QUESTION_WITH_MARKUP, version: investigationVersion(), catalogs: ENGLISH });
    const unmarked = await renderToBuffer(cloneElement(InvestigationReportDocument({ model }), { pdfVersion: "1.3" }));
    expect(xmpOf(unmarked)).toBeNull();
    expect(pageCount(marked)).toBe(pageCount(unmarked));
    expect(drawnStreams(marked)).toEqual(drawnStreams(unmarked));
  }, 120_000);
});
