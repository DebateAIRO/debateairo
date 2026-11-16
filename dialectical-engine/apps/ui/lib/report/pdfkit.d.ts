/**
 * pdfkit 0.20.1 ships no types. Only what lib/report/pdfAiMark.ts touches is declared: the document's PDF version, its
 * Info values, and the metadata mixin's appendXML / endMetadata (pdfkit's js/pdfkit.node.mjs, MetadataMixin).
 */
declare module "pdfkit" {
  export interface PdfKitDocumentInternals {
    /** 1.3 (the default: no XMP is written), 1.4, 1.5, 1.6 or 1.7. */
    version: number;
    info: Record<string, unknown>;
    appendXML(xml: string, newline?: boolean): void;
    endMetadata(): void;
  }
  const PDFDocument: { prototype: PdfKitDocumentInternals };
  export default PDFDocument;
}
