/*
 * a11y repair (2026-11-19): a legal table arrives as a list of rows whose cells are joined with an
 * em dash, and its header row used to be thrown away, so a screen reader heard "Account — Email
 * address … — You, at registration" with no way to tell which column a value came from. The rows
 * now keep their column names for screen readers only: the visible line is the same untouched run of
 * text (hidden from screen readers), and an sr-only copy names each value's column. Labels inside the
 * visible text would change how the browser shapes it; the page must look the same to the pixel.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseBlocks } from "../../apps/ui/scripts/generate-legal-data.mjs";
import { LegalDocumentBody, legalRowSpoken } from "../../apps/ui/components/legal/LegalBodies.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LegalPageLayout } from "../../apps/ui/components/legal/LegalPageLayout.js";
import { LegalCookiesBody } from "../../apps/ui/components/legal/LegalBodies.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import legalEnglish from "../../apps/ui/messages/en/legal.json" with { type: "json" };

const source = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("a legal page asked for in another language says which language it is in", () => {
  const layout = (locale?: string) =>
    renderToStaticMarkup(
      <LegalPageLayout current="privacy" chromeCatalog={chromeEnglish} legalCatalog={legalEnglish} eyebrow="E" title="T" meta="M" locale={locale}>
        <p>body</p>
      </LegalPageLayout>
    );

  it("tags the navigation and the text with the language they are in", () => {
    expect(layout("ar")).toContain('<div class="legalGrid" lang="ar">');
  });

  it("adds no lang when no language is passed", () => {
    expect(layout()).toContain('<div class="legalGrid">');
  });

  it("the two pages that take ?lang pass the language they loaded", () => {
    for (const page of ["apps/ui/app/privacy/page.tsx", "apps/ui/app/terms/page.tsx"]) {
      expect(source(page), page).toMatch(/<LegalPageLayout[^>]*\n?[^>]*locale=\{locale\}/);
    }
  });
});

describe("the cookie tables keep their column headers when stacked", () => {
  it("has explicit table roles and a header row that is never display:none", () => {
    const markup = renderToStaticMarkup(<LegalCookiesBody legalCatalog={legalEnglish} />);
    expect(markup).toContain('<table role="table" class="legalTable legalCookieTable">');
    expect(markup).toContain('<thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">');
    expect(markup).toMatch(/<td role="cell" class="legalKindCell">/);
    expect(source("apps/ui/app/legal.css")).not.toMatch(/thead\s*\{\s*display:\s*none/);
  });
});

const TABLE = [
  "| Category | What, exactly | Source |",
  "| --- | --- | --- |",
  "| **Account** | Email address | You, at registration |",
  "| Bot check |  | Cloudflare |"
];

describe("legal tables keep their column names", () => {
  it("parseBlocks keeps the visible rows and adds the header and cells", () => {
    expect(parseBlocks(TABLE)).toEqual([
      {
        kind: "list",
        items: ["Account — Email address — You, at registration", "Bot check — Cloudflare"],
        table: {
          head: ["Category", "What, exactly", "Source"],
          rows: [
            ["Account", "Email address", "You, at registration"],
            ["Bot check", "", "Cloudflare"]
          ]
        }
      }
    ]);
  });

  it("a plain bulleted list carries no table", () => {
    expect(parseBlocks(["- one", "- two"])).toEqual([{ kind: "list", items: ["one", "two"] }]);
  });

  it("says each value after its column name, skipping empty cells", () => {
    const head = ["Category", "What, exactly", "Source"];
    expect(renderToStaticMarkup(<>{legalRowSpoken({ head, rows: [] }, ["Bot check", "", "Cloudflare"])}</>)).toBe(
      '<span style="position:relative"><span class="srOnly">Category: Bot check. Source: Cloudflare. </span></span>'
    );
    expect(renderToStaticMarkup(<>{legalRowSpoken({ head, rows: [] }, ["Account", "Email, hashed.", "You"])}</>)).toBe(
      '<span style="position:relative"><span class="srOnly">Category: Account. What, exactly: Email, hashed. Source: You. </span></span>'
    );
  });

  it("a plain list item has no spoken copy", () => {
    expect(legalRowSpoken(undefined, undefined)).toBeNull();
  });

  it("on the page, a table row keeps its visible text as one hidden run and adds the spoken copy", () => {
    const markup = renderToStaticMarkup(<LegalDocumentBody document={PRIVACY_POLICY} />);
    const block = PRIVACY_POLICY.sections.flatMap((section) => section.blocks).find((candidate) => candidate.kind === "list" && candidate.table !== undefined);
    if (block === undefined || block.kind !== "list" || block.table === undefined) throw new Error("no table in the privacy policy");
    const [firstCell] = block.table.rows[0]!;
    // One wrapper (the line is one flex item): the visible run first, then the spoken copy in its own positioned box.
    expect(markup).toMatch(new RegExp(`<li><span><span aria-hidden="true">${firstCell} — [^<]*</span><span style="position:relative"><span class="srOnly">${block.table.head[0]}: ${firstCell}\\. `));
  });

  it("the generated privacy policy carries its table headers", () => {
    const tables = PRIVACY_POLICY.sections.flatMap((section) =>
      section.blocks.filter((block) => block.kind === "list" && block.table !== undefined)
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const block of tables) {
      if (block.kind !== "list" || block.table === undefined) throw new Error("unreachable");
      expect(block.table.rows).toHaveLength(block.items.length);
      block.table.rows.forEach((row, index) => {
        expect(row.filter((cell) => cell.length > 0).join(" — ")).toBe(block.items[index]);
      });
    }
  });
});
