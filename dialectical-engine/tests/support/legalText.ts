import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * How the legal tests read the Terms of Service and the Privacy Policy: as they are now, straight from
 * apps/ui/legal/<language>/, and by section, never by a line number counted from the top of the file.
 *
 * When a legal text changes, change the checks that pin the changed words, in the same commit. A check of a wording
 * that is gone is deleted with it. Do not add a helper that turns the new text back into the old one so that old
 * checks keep passing: every text that was released is kept byte for byte in apps/ui/legal/archive under its sha256,
 * the manifest (packages/legal-manifest/src/manifest.json) lists it, and tests/unit/legal-manifest.test.ts and
 * tests/unit/legal-reset-10.test.ts hold the archive to the manifest. tests/unit/legal-tests-read-the-text-as-it-is.test.ts
 * refuses such a helper.
 */

export type LegalKind = "PRIVACY" | "TERMS";

export const LEGAL_FILES: Readonly<Record<LegalKind, string>> = { PRIVACY: "privacy-policy.md", TERMS: "terms-of-service.md" };

/** A language's text as it is now. */
export const legalText = (kind: LegalKind, code: string): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", code, LEGAL_FILES[kind]), "utf8");

export const legalLines = (kind: LegalKind, code: string): string[] => legalText(kind, code).split("\n");

/**
 * The day the current texts take effect, as the English Privacy Policy's version line gives it (`<day> <Month> <year>`).
 * apps/ui/scripts/legal-redate.mjs sets it in every draft at once, so a test reads it here instead of typing it;
 * tests/unit/legal-reset-10.test.ts holds every draft of both documents to it.
 */
export const legalEffectiveDay = (): string => {
  const day = /^\*\*Version \d+\.\d+ · Effective (\d{1,2} [A-Z][a-z]+ \d{4}) · /mu.exec(legalText("PRIVACY", "en"))?.[1];
  if (day === undefined) throw new Error("the English Privacy Policy's version line gives no day");
  return day;
};

/** Where numbered section `section` starts: the index of its `## <section>. …` heading. */
const headingAt = (lines: readonly string[], section: number): number => {
  const found = lines.flatMap((line, index) => (line.startsWith(`## ${section}. `) ? [index] : []));
  if (found.length !== 1) throw new Error(`section ${section} has ${found.length} headings`);
  return found[0]!;
};

/**
 * The line `below` lines under the heading of numbered section `section`. Every language has the same lines in the
 * same order inside a section, so one position names the same row or paragraph in all of them, and a line added to
 * another section moves nothing here.
 */
export const sectionLine = (lines: readonly string[], section: number, below: number): string => {
  const line = lines[headingAt(lines, section) + below];
  if (line === undefined || line.startsWith("## ")) throw new Error(`section ${section} has no line ${below} below its heading`);
  return line;
};

/** The body of numbered section `section`: everything between its heading and the next `## ` heading. */
export const sectionBody = (text: string, section: number): string => {
  const body = new RegExp(`^## ${section}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${section}`);
  return body;
};

/** The cells of a table row. */
export const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());
