import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * R22 decision 6: every later step reads what the AIs wrote. The final report's sources may read the shown quotes, the pages'
 * addresses and reader 1's notes, and never a passage: no web extract, no pack, no page text. The proof over real rows is
 * tests/integration/investigation-report-ai-text-only.test.ts; this keeps a later edit from reaching for one again.
 */
const sources = readFileSync(resolve(import.meta.dirname, "../../apps/runner/src/investigation-close-sources.ts"), "utf8");
const dossier = readFileSync(resolve(import.meta.dirname, "../../apps/runner/src/investigation-dossier.ts"), "utf8");
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

describe("the report's sources read AI text only", () => {
  it("opens no extract, no pack and no page text", () => {
    const body = code(sources);
    for (const reaching of ["WEB_EVIDENCE_CARRIERS.extract", "WEB_EVIDENCE_CARRIERS.pack", "WEB_EVIDENCE_CARRIERS.pageText", "evidence.extracts", "evidence.packs",
      "web_extract", "web_pack", "web_page_text", "readReplyTexts", "web_reply_text"]) {
      expect(body, reaching).not.toContain(reaching);
    }
    expect(body).toContain("readShownQuotes");
  });

  it("hands the dossier no stored extract's words: a stored path's are dropped where it is read", () => {
    const body = code(sources);
    expect(body).toContain("points: path.points, extracts: Object.freeze([])");
    expect(body).not.toMatch(/\.extracts\b/u);
  });

  it("the dossier cuts every quote to the shown length and serialises no extract", () => {
    const body = code(dossier);
    expect(body).toContain("cutQuoteAtWordEdge(source.quote)");
    expect(body).not.toMatch(/\.extracts\b/u);
  });
});
