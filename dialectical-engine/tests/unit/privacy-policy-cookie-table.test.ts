import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_BROWSER_STORAGE, LEGAL_COOKIES, type LegalInventoryItem } from "../../apps/ui/lib/legal/pages.js";

/**
 * S01 PP13 side of R18, and R12-R13 (SPEC-v2; PLAN "PP13 shape", D-34, D-38). Every locale's Privacy Policy §13 —
 * the lines between its `## 13.` and `## 14.` headings in `apps/ui/legal/<loc>/privacy-policy.md` — is five blocks:
 * an intro paragraph, one markdown table of the eight items of record, and three paragraphs. The table names exactly
 * the items `/cookies` lists (LISTED = LEGAL_COOKIES then LEGAL_BROWSER_STORAGE), and each row's kind and lifetime cells
 * are that locale's own `/cookies` strings (`apps/ui/messages/<loc>/legal.json`), character for character.
 */

const ROOT = process.cwd();
const LEGAL_DIR = join(ROOT, "apps/ui/legal");
const LISTED: readonly LegalInventoryItem[] = [...LEGAL_COOKIES, ...LEGAL_BROWSER_STORAGE];
const LOCALES = readdirSync(LEGAL_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "archive")   // origin/dev 06b111c8f: archive of published texts
  .map((entry) => entry.name)
  .sort();

/** The ASCII digit runs each lifetime cell carries, in LISTED order (SPEC-v2 R12 iv). */
const DIGIT_RUNS: readonly (readonly string[])[] = [["14"], ["14"], ["30"], ["1"], ["8", "15"], ["8", "15"], ["30"], ["30"], ["299"], ["299"], ["5"], ["5"], ["5"], [], [], [], [], ["15"]];

type Block = { kind: "p" | "table"; text: string };

function section13(locale: string): string {
  const markdown = readFileSync(join(LEGAL_DIR, locale, "privacy-policy.md"), "utf8");
  const match = /^## 13\..*$([\s\S]*?)^## 14\./m.exec(markdown);
  return match?.[1] ?? "";
}

/** §13 body → blocks: a run of pipe lines is one table, a blank-line-separated run of other lines one paragraph. */
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

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

/** The body rows of §13's table: every pipe line whose first cell is one backticked name. */
function bodyRows(section: string): string[][] {
  return section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map(cells)
    .filter((row) => /^`[^`]+`$/.test(row[0] ?? ""));
}

const nameOf = (row: readonly string[]) => (row[0] ?? "").slice(1, -1);

/**
 * Compares each locale's §13 table names with a LISTED list, both ways. Returns one line per locale that differs,
 * naming every name the table lacks and every name the list lacks.
 */
function compareNames(listed: readonly string[]): string[] {
  const out: string[] = [];
  for (const locale of LOCALES) {
    const table = bodyRows(section13(locale)).map(nameOf);
    const notInTable = listed.filter((name) => !table.includes(name));
    const notListed = table.filter((name) => !listed.includes(name));
    if (notInTable.length > 0 || notListed.length > 0) {
      out.push(`${locale}: listed but not in §13 [${notInTable.join(", ")}]; in §13 but not listed [${notListed.join(", ")}]`);
    }
  }
  return out;
}

function catalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "apps/ui/messages", locale, "legal.json"), "utf8")) as Record<string, unknown>;
}

describe("Privacy Policy §13 — the eighteen actual stored items in every locale (R12, R13, R18)", () => {
  it("every locale's §13 table names exactly the LISTED items, both ways", () => {
    expect(LOCALES).toHaveLength(35);
    expect(compareNames(LISTED.map(({ name }) => name))).toEqual([]);
  });

  it("the comparison reports a name removed from LISTED", () => {
    const [removed, ...rest] = LISTED.map(({ name }) => name);
    const report = compareNames(rest);
    expect(report).toHaveLength(35);
    for (const locale of LOCALES) {
      const line = report.find((entry) => entry.startsWith(`${locale}: `));
      expect(line, `${locale} not reported`).toBeDefined();
      expect(line).toContain(`in §13 but not listed [${removed}]`);
    }
  });

  it("the comparison refuses an extra unlisted name in every locale", () => {
    const reports = compareNames([...LISTED.map(({ name }) => name), "synthetic-unlisted-item"]);
    expect(reports).toHaveLength(35);
    for (const report of reports) expect(report).toContain("listed but not in §13 [synthetic-unlisted-item]");
  });

  it("every locale's §13 table binds name, kind and lifetime to that locale's /cookies strings", () => {
    const misses: string[] = [];
    for (const locale of LOCALES) {
      const legal = catalog(locale);
      const rows = bodyRows(section13(locale));
      if (rows.length !== LISTED.length) {
        misses.push(`${locale}: ${rows.length} body rows, want ${LISTED.length}`);
        continue;
      }
      LISTED.forEach((item, index) => {
        const row = rows[index] ?? [];
        if (row.length !== 4) misses.push(`${locale} row ${index + 1}: ${row.length} columns, want 4`);
        if (nameOf(row) !== item.name) misses.push(`${locale} row ${index + 1}: name ${nameOf(row)} want ${item.name}`);
        if (row[1] !== legal[item.kindKey]) misses.push(`${locale} ${item.name}: kind ${JSON.stringify(row[1])} != ${JSON.stringify(legal[item.kindKey])}`);
        if (row[2] !== legal[item.purposeKey]) misses.push(`${locale} ${item.name}: purpose differs from its exact locale catalogue`);
        if (row[3] !== legal[item.lifeKey]) misses.push(`${locale} ${item.name}: lifetime ${JSON.stringify(row[3])} != ${JSON.stringify(legal[item.lifeKey])}`);
        const digits = (row[3] ?? "").match(/[0-9]+/g) ?? [];
        if (JSON.stringify(digits) !== JSON.stringify(DIGIT_RUNS[index])) {
          misses.push(`${locale} ${item.name}: lifetime digits ${JSON.stringify(digits)} want ${JSON.stringify(DIGIT_RUNS[index])}`);
        }
      });
    }
    expect(misses).toEqual([]);
  });

  it("the English §13 carries the four statements and none of the removed sentences", () => {
    const section = section13("en");
    const found = blocks(section);
    expect(found.map(({ kind }) => kind)).toEqual(["p", "table", "p", "p", "p"]);
    const phrases: Record<number, readonly string[]> = {
      0: ["18 items", "13 cookies", "5 entries", "strictly necessary", "only by Dialectical Engine", "Cookie Policy", "dezbatere.ro/cookies"],
      2: ["no other party", "across websites"],
      3: ["Do Not Track", "with or without"],
      4: ["block or delete", "browser settings", "stops working", "signing in", "language", "display"]
    };
    const lacking = Object.entries(phrases).flatMap(([index, list]) =>
      list.filter((phrase) => !(found[Number(index)]?.text ?? "").toLowerCase().includes(phrase.toLowerCase())).map((phrase) => `block ${index} lacks ${phrase}`)
    );
    expect(lacking).toEqual([]);
    for (const absent of ["two cookies", "region", "United Kingdom"]) {
      expect(section.toLowerCase(), `en §13 still says ${absent}`).not.toContain(absent.toLowerCase());
    }
  });

  it("every other locale's §13 keeps the English block shape, the literal Do Not Track, and no English paragraph", () => {
    const english = blocks(section13("en"));
    const misses: string[] = [];
    for (const locale of LOCALES.filter((code) => code !== "en")) {
      const found = blocks(section13(locale));
      const kinds = found.map(({ kind }) => kind);
      if (JSON.stringify(kinds) !== JSON.stringify(english.map(({ kind }) => kind))) {
        misses.push(`${locale}: blocks ${kinds.join(",")} differ from en`);
        continue;
      }
      if (!(found[3]?.text ?? "").includes("Do Not Track")) misses.push(`${locale}: block 3 lacks the literal Do Not Track`);
      if (!(found[0]?.text ?? "").includes("\\[dezbatere.ro/cookies\\]")) misses.push(`${locale}: block 0 lacks \\[dezbatere.ro/cookies\\]`);
      found.forEach((block, index) => {
        if (block.kind === "p" && block.text.trim() === english[index]?.text.trim()) misses.push(`${locale}: paragraph ${index} equals en`);
      });
    }
    expect(misses).toEqual([]);
  });
});
