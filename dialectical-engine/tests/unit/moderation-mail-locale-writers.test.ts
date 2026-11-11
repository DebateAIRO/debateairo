import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Owner, 2026-11-08: identity.moderation_notice (0156) and identity.moderation_statement (0157) allow exactly the 35 site
 * locales in mail_locale; en-US and en-GB wait for a stop-first upload (tests/integration/mail-locale-columns.test.ts says
 * why). This pins the other half: the only writers of the two tables pick the language from that same list of 35, and fall
 * back to English, so en-US or en-GB can never reach either table. A later step that writes into either table, or redefines
 * a writer, must come through here.
 */
const SITE_LOCALES = [
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro",
  "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr"
] as const;
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const steps = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS), "utf8") }));
const quoted = (list: string): string[] => [...list.matchAll(/'([^']+)'/gu)].map((match) => match[1]!);
/** The body of one CREATE OR REPLACE FUNCTION, up to its closing $$. */
function functionBody(sql: string, signature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start, signature).toBeGreaterThan(-1);
  const open = sql.indexOf("$$", start);
  return sql.slice(open + 2, sql.indexOf("$$", open + 2));
}

const WRITERS = [
  { table: "moderation_notice", step: "0156_moderation_notice.sql", writer: "identity.queue_moderation_notices()", fallback: "ELSE 'en' END" },
  { table: "moderation_statement", step: "0157_moderation_statements.sql", writer: "identity.state_moderation(", fallback: "LIMIT 1), 'en')" }
] as const;

describe("moderation mail: the writers can only store one of the 35 site locales", () => {
  for (const { table, step, writer, fallback } of WRITERS) {
    it(`${table}: one step writes it, through ${writer}, and that writer is never redefined`, () => {
      expect(steps.filter(({ sql }) => new RegExp(`INSERT INTO identity\\.${table}\\b`, "u").test(sql)).map(({ name }) => name)).toEqual([step]);
      expect(steps.filter(({ sql }) => sql.replaceAll("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION").includes(`CREATE FUNCTION ${writer}`)).map(({ name }) => name)).toEqual([step]);
      const body = functionBody(steps.find(({ name }) => name === step)!.sql, writer);
      expect(body).toContain(`INSERT INTO identity.${table}`);
    });

    it(`${table}: the column allows the 35, and the writer picks from the same 35 or falls back to English`, () => {
      const sql = steps.find(({ name }) => name === step)!.sql;
      const check = sql.match(new RegExp(`CONSTRAINT ${table}_mail_locale_check CHECK \\(mail_locale IN \\(([^)]*)\\)\\)`, "u"));
      expect(check, `${table} CHECK`).not.toBeNull();
      expect(quoted(check![1]!).sort()).toEqual([...SITE_LOCALES].sort());
      const body = functionBody(sql, writer);
      const lists = [...body.matchAll(/ARRAY\[([^\]]*)\]/gu)].map((match) => quoted(match[1]!));
      expect(lists).toHaveLength(1);
      expect([...lists[0]!].sort()).toEqual([...SITE_LOCALES].sort());
      expect(body).toContain(fallback);
      expect(body).not.toMatch(/en-(US|GB)/iu);
    });
  }
});
