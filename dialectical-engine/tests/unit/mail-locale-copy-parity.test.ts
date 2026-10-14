import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S01 copy parity (SPEC-v4 R-34, R-42, R-45; Appendix B A-2). For each of the 35 catalogue codes: the auth.* key set of
 * its packages/mail-templates/messages/<code>/mail.json equals en's, with no key missing and no key extra; and its
 * Privacy Policy §13 (the lines between `## 13.` and `## 14.` in apps/ui/legal/<code>/privacy-policy.md) has the
 * English block shape, six blocks of kinds p, table, p, p, p, p: an intro paragraph, the table, the queued-mail
 * paragraph at index 2 (SPEC-v3 R-37), then three paragraphs. A partial merge that ships English for some locales
 * changes neither the key set nor the shape; the render test reads the words, this test reads the shape.
 */

const MESSAGES = resolve("packages/mail-templates/messages");
const LEGAL = resolve("apps/ui/legal");
const CODES = readdirSync(MESSAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const ENGLISH_SECTION_KINDS = ["p", "table", "p", "p", "p", "p"] as const;

const authKeysOf = (code: string): string[] =>
  Object.keys(JSON.parse(readFileSync(join(MESSAGES, code, "mail.json"), "utf8")) as Record<string, unknown>)
    .filter((key) => key.startsWith("auth."))
    .sort();

const EN_AUTH_KEYS = authKeysOf("en");

type Block = { kind: "p" | "table"; text: string };

/** Section 13 of a locale's Privacy Policy: the lines between its `## 13.` and `## 14.` headings. */
function section13(code: string): string {
  const markdown = readFileSync(join(LEGAL, code, "privacy-policy.md"), "utf8");
  return /^## 13\..*$([\s\S]*?)^## 14\./m.exec(markdown)?.[1] ?? "";
}

/** §13 body to blocks: a run of pipe lines is one table, a blank-line-separated run of other lines is one paragraph. */
function blocks(section: string): Block[] {
  const out: Block[] = [];
  let current: string[] = [];
  let currentKind: Block["kind"] | null = null;
  for (const line of [...section.split("\n"), ""]) {
    const trimmed = line.trim();
    const kind: Block["kind"] | null = trimmed.startsWith("|") ? "table" : trimmed === "" ? null : "p";
    if (kind !== currentKind || kind === null) {
      if (currentKind !== null && current.length > 0) out.push({ kind: currentKind, text: current.join("\n") });
      current = kind === null ? [] : [line];
      currentKind = kind;
    } else {
      current.push(line);
    }
  }
  return out;
}

const kindsOf = (code: string): string[] => blocks(section13(code)).map((block) => block.kind);

describe("S01 copy parity over the 35 catalogue codes (R-34, R-42, R-45)", () => {
  it("the catalogue holds the 35 codes and en holds the 115 auth keys", () => {
    expect(CODES).toHaveLength(35);
    expect(EN_AUTH_KEYS).toHaveLength(115);
  });

  it("the English §13 has the six-block shape the other locales must keep", () => {
    expect(kindsOf("en")).toEqual([...ENGLISH_SECTION_KINDS]);
  });

  for (const code of CODES) {
    it(`the auth.* key set equals en's, with no missing and no extra key (${code})`, () => {
      const own = authKeysOf(code);
      const missing = EN_AUTH_KEYS.filter((key) => !own.includes(key));
      const extra = own.filter((key) => !EN_AUTH_KEYS.includes(key));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`the §13 block kinds equal the English six-block shape (${code})`, () => {
      expect(kindsOf(code)).toEqual([...ENGLISH_SECTION_KINDS]);
    });
  }
});
