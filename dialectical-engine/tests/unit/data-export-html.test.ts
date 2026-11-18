import { describe, expect, it } from "vitest";
import { renderYourDataHtml } from "../../apps/api/src/data-export/html-page.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";

const page = () => renderYourDataHtml(snapshotA, loadArchiveCatalog("en"));

describe("data export readable page", () => {
  it("H-1 is self-contained without active or external resources", () => {
    const html = page();
    for (const pattern of [/<script/i, / src=/i, /href="http/i, /<link/i]) expect(html).not.toMatch(pattern);
    expect(html.match(/<style>/g)).toHaveLength(1);
  });
  it("H-2 shows localized heading, generation time, and account", () => {
    const html = page();
    expect(html).toContain("Your Dialectical Engine data");
    expect(html).toContain("Prepared on 9 October 2026 at 00:15 UTC for Ada.");
    expect(html).toContain("Ada");
    expect(html).toContain("ada@example.test");
    expect(html).toContain("Member since");
    expect(html).toContain("2 Jan 2024");
  });
  it("H-3 orders debate questions newest first", () => {
    const html = page();
    expect(html.indexOf("MARK-Q2")).toBeLessThan(html.indexOf("MARK-Q1"));
  });
  it("H-4 shows producer visibility, newest answer, nine story paths, claims, and verdict words", () => {
    const html = page();
    expect(snapshotA.debates.debates.map((debate) => debate.visibility_history.at(-1)?.state))
      .toEqual(["PUBLISHED", "PRIVATE", "PRIVATE"]);
    expect(html).toMatch(/MARK-Q1[\s\S]*?Published/);
    for (const n of [1, 2]) {
      expect(html).toContain(`MARK-Q${n}`);
      expect(html).toContain(n === 1 ? "8 Oct 2026" : "9 Oct 2026");
      expect(html).toContain(n === 1 ? "Published" : "Private");
      expect(html).toContain(n === 1 ? "Supported" : "Close call");
      for (const path of ["headline", "summary", "confidence", "paths.line", "change.text", "why.reasons.text", "long.sections.title", "long.sections.paragraphs.text", "reviewer_note.text"]) {
        expect(html).toContain(`MARK-STORY-${path}-${n}`);
      }
      for (const letter of ["a", "b", "c"]) expect(html).toContain(`MARK-NODE${n}${letter}-v2`);
      expect(html).toContain(`MARK-ANSWER${n}-v2`);
      expect(html).not.toContain(`MARK-ANSWER${n}-v1`);
    }
  });
  it("H-5 explains content whose key was destroyed", () => {
    expect(page()).toContain("The content of this debate can no longer be read: its key was destroyed.");
  });
  it("H-6 explains an archive with no debates", () => {
    expect(renderYourDataHtml({ ...snapshotA, debates: { debates: [], web_sources: [] } }, loadArchiveCatalog("en"))).toContain("You have no debates.");
  });
  it("H-7 never renders a UUID", () => {
    expect(page()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
  it("H-8 has one dark mode rule, escapes user text, and follows S5 structure", () => {
    const altered = { ...snapshotA, debates: { debates: [{ ...snapshotA.debates.debates[0]!, question: `<b>&"'` }], web_sources: [] } };
    const html = renderYourDataHtml(altered, loadArchiveCatalog("en"));
    expect(html.match(/@media \(prefers-color-scheme: dark\)/g)).toHaveLength(1);
    expect(html).toContain("&lt;b&gt;&amp;&quot;&#39;");
    expect(html).not.toContain(`<b>&"'`);
    const archiveHtml = page();
    expect(archiveHtml).toMatch(/<header>[\s\S]*?<h1>[^<]+<\/h1>[\s\S]*?<\/header>/);
    expect(archiveHtml).toMatch(/<section class="account-section">[\s\S]*?<div class="account-card">[\s\S]*?<dl>/);
    expect(archiveHtml).toMatch(/<p class="label">Question<\/p>\s*<h3>MARK-Q2<\/h3>\s*<p class="meta">/);
    expect(archiveHtml).toMatch(/<p class="label verdict-label">Verdict<\/p>\s*<span class="pill contested" data-ai-generated="true">Close call<\/span>/);
    expect(archiveHtml).toMatch(/<footer>[^<]*README\.txt[^<]*<\/footer>/);
    // Design Document v2 (18 November 2026): the page carries the site's own light and dark colours, and none of the
    // beige theme it replaced.
    for (const token of ["#F3F5F9", "#FFFFFF", "#121826", "#0E131D", "#171E2B", "#EEF2F8", "#FFC08A", "#8C4510"]) {
      expect(archiveHtml).toContain(token);
    }
    for (const token of ["#F9F6F1", "#FDFBF6", "#29261F", "#14110E", "#181410", "#F2EAD9", "Georgia"]) {
      expect(archiveHtml).not.toContain(token);
    }
  });
  it("H-9 uses the drawn short dates for the German account and debates", () => {
    const html = renderYourDataHtml({ ...snapshotA, locale: "de" }, loadArchiveCatalog("de"));
    expect(html).toContain("02.01.2024");
    expect(html).toContain("08.10.2026");
    expect(html).toContain("09.10.2026");
  });
  it("H-11 (V-42) does not show the role rotation record", () => {
    const html = page();
    expect(html).not.toMatch(/MARK-ROT|Maker [ABCD]|LEAST_SHARE_SEEDED_TIE_V1/);
  });

  it("H-12 (EU AI Act Art. 50(2)) marks each AI-generated part for machines, never the person's question, and shows nothing new", () => {
    const html = page();
    const marked = (pattern: RegExp) => html.match(pattern)?.length ?? 0;
    for (const n of [1, 2]) {
      expect(html).toMatch(new RegExp(`<div class="answer" data-ai-generated="true">MARK-ANSWER${n}-v2`));
      expect(html).toMatch(new RegExp(`<p class="story-text" data-ai-generated="true">MARK-STORY-headline-${n}</p>`));
      expect(html).toMatch(new RegExp(`<ul data-ai-generated="true"><li>MARK-NODE${n}a-v2</li>`));
      // The question is the person's own words: never marked.
      expect(html).toMatch(new RegExp(`<h3>MARK-Q${n}</h3>`));
    }
    expect(marked(/<span class="pill [a-z]+" data-ai-generated="true">/g)).toBe(2);
    expect(marked(/<div class="answer" data-ai-generated="true">/g)).toBe(2);
    expect(marked(/<p class="story-text" data-ai-generated="true">/g)).toBeGreaterThanOrEqual(18);
    expect(marked(/<p class="story-text">/g)).toBe(0);
    expect(marked(/<ul data-ai-generated="true">/g)).toBe(2);
    expect(html).not.toMatch(/<h3[^>]*data-ai-generated/);
    // The mark is an attribute only: the style sheet never selects on it, so nothing a reader sees changes.
    expect(html.match(/<style>([\s\S]*?)<\/style>/)?.[1]).not.toContain("data-ai-generated");
  });

  it("H-10 keeps the S5 heading, label, and unreadable metadata declarations", () => {
    const style = page().match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const declarations = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const block = style.match(new RegExp(`(?:^|[}\\n])${escaped}\\{([^}]*)\\}`))?.[1] ?? "";
      return Object.fromEntries(block.split(";").filter(Boolean).map((item) => item.split(":")));
    };
    expect(declarations("h1")).toMatchObject({ "font-size": "30px", "font-weight": "700", "letter-spacing": "-.02em" });
    expect(declarations("h2")).toMatchObject({ "font-size": "20px", "font-weight": "700" });
    expect(declarations("h3")).toMatchObject({ "font-size": "22px", "font-weight": "700", "line-height": "1.3" });
    expect(declarations(".label")).toMatchObject({ color: "var(--muted)", margin: "18px 0 6px" });
    expect(declarations(".label:first-child")["margin-top"]).toBe("0");
    expect(declarations("article>.meta:first-child")["margin-top"]).toBe("0");
  });
});
