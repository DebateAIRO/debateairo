/// <reference path="./pdfkit.d.ts" />
import PDFDocument, { type PdfKitDocumentInternals } from "pdfkit";

/**
 * EU AI Act Art. 50(2) (owner's decision, 16 Nov 2026, option 3): the report PDFs' machine-readable AI mark, shared by
 * the debate's report (ReportDocument.tsx) and the investigation's (InvestigationReportDocument.tsx).
 *
 * Both Documents say `pdfVersion={REPORT_PDF_VERSION}` and `keywords={AI_GENERATED_KEYWORD}`. At PDF 1.4 pdfkit (the
 * writer @react-pdf/renderer 4.9.0 drives) writes its own XMP packet into the catalog's /Metadata stream, with
 * pdf:Keywords and pdf:Producer taken from the same values as the Info dictionary; at its default 1.3 it writes none.
 * react-pdf exposes no hook into that packet, so `installPdfAiMark` wraps pdfkit's one metadata step (endMetadata, run
 * once at the end of every document) to add the IPTC digital source type and dc:format. Only a document whose Info
 * Keywords declare it AI-generated is touched; any other PDF the process makes is written exactly as before.
 *
 * pdfkit writes the Info values into the packet unescaped, and a report's title holds the person's question; for a marked
 * document they are XML-escaped (the Info dictionary itself is already written by then, unchanged). The PDF version and
 * the packet change nothing drawn (tests/render/report-pdf-ai-mark.test.tsx compares every drawn stream).
 *
 * pdfkit is a declared dependency of apps/ui at the version react-pdf resolves (0.20.1, one copy in the lockfile), and
 * next.config.mjs lists it in serverExternalPackages beside @react-pdf/renderer, so both load the one same module.
 */
export const REPORT_PDF_VERSION = "1.4";
export const AI_GENERATED_KEYWORD = "AI-generated";
export const IPTC_DIGITAL_SOURCE_TYPE_AI = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

const xmlEscape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[character]!);

/** The packet's added description: one rdf:Description beside pdfkit's own (several per packet are allowed). */
const AI_XMP_DESCRIPTION = `
        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
            <dc:format>application/pdf</dc:format>
            <Iptc4xmpExt:DigitalSourceType>${xmlEscape(IPTC_DIGITAL_SOURCE_TYPE_AI)}</Iptc4xmpExt:DigitalSourceType>
        </rdf:Description>
        `;

function declaresAiGenerated(info: Record<string, unknown>): boolean {
  return typeof info.Keywords === "string" && info.Keywords.split(/[\s,;]+/u).includes(AI_GENERATED_KEYWORD);
}

function escapedInfo(info: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(info).map(([key, value]) => [key, typeof value === "string" ? xmlEscape(value) : value]));
}

/** Set once on pdfkit's prototype; a registry symbol, so a second copy of this module (a test, a reload) sees it too. */
const INSTALLED = Symbol.for("debateai.report.pdfAiMark");

/** Installs the mark once per process; every later call does nothing. */
export function installPdfAiMark(): void {
  const prototype = PDFDocument.prototype;
  if (Object.hasOwn(prototype, INSTALLED)) return;
  const endMetadata = prototype.endMetadata;
  prototype.endMetadata = function markedEndMetadata(this: PdfKitDocumentInternals): void {
    if (!declaresAiGenerated(this.info)) {
      endMetadata.call(this);
      return;
    }
    this.appendXML(AI_XMP_DESCRIPTION);
    const info = this.info;
    this.info = escapedInfo(info);
    try {
      endMetadata.call(this);
    } finally {
      this.info = info;
    }
  };
  Object.defineProperty(prototype, INSTALLED, { value: true });
}
