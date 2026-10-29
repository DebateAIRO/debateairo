import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");
const COLUMNS = ["reply_repairs", "reply_failure_class", "reply_form", "cached_input_tokens", "guided_words", "actual_words"] as const;

/** LG-A (spec 2026-10-15 §3.6, L27, L34; INTERFACE §4): the build's one migration, pinned as text. */
describe("reply measures migration 0120 — architecture contract", () => {
  it("adds the six nullable columns and their six named CHECKs, and no trigger, owner change or row change", async () => {
    const sql = await read("migrations/0120_reply_measures.sql");
    // (pre-flight PF-A33) The checks read the SQL without its `--` comments: the header names what it does in words.
    const code = sql.replace(/--.*$/gmu, "");
    for (const [column, type] of [["reply_repairs", "text[]"], ["reply_failure_class", "text"], ["reply_form", "text"],
      ["cached_input_tokens", "integer"], ["guided_words", "integer"], ["actual_words", "integer"]] as const) {
      expect(code).toContain(`ADD COLUMN IF NOT EXISTS ${column} ${type} NULL`);
    }
    for (const constraint of ["raw_artifact_reply_repairs_code_shaped", "raw_artifact_reply_failure_class_known",
      "raw_artifact_reply_form_known", "raw_artifact_cached_input_tokens_non_negative", "raw_artifact_guided_words_non_negative",
      "raw_artifact_actual_words_non_negative"]) {
      expect(code).toContain(`DROP CONSTRAINT IF EXISTS ${constraint},`);
      expect(code).toContain(`ADD CONSTRAINT ${constraint} CHECK`);
    }
    expect(code).toContain("IN ('STRUCTURE', 'CONTENT', 'CUT_OFF', 'EMPTY')");
    expect(code).toContain("IN ('ORIGINAL', 'PATCH', 'FULL', 'STRUCTURE', 'LENGTH_RETRY')");
    expect(code).not.toMatch(/CREATE\s+FUNCTION|CREATE\s+(OR\s+REPLACE\s+)?TRIGGER|ALTER\s+FUNCTION|OWNER\s+TO|SECURITY\s+INVOKER|UPDATE\s+ledger|INSERT\s+INTO|DELETE\s+FROM/iu);
  });

  // (pre-flight PF-A44, ruling R8) The one function 0120 defines: 0049's terminal recorded facts, redefined so a
  // structure-repaired call's OK row (`REPAIR:STRUCTURE:<original key>`) counts like the original key's.
  it("redefines exactly one function, the terminal recorded facts, as 0049 wrote it but for the four counted families, and re-asserts 0049's grants", async () => {
    const code = (await read("migrations/0120_reply_measures.sql")).replace(/--.*$/gmu, "");
    expect([...code.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([a-z_.]+)\(/giu)].map(([, name]) => name))
      .toEqual(["core.read_terminal_recorded_facts"]);
    expect([...code.matchAll(/\b(?:GRANT|REVOKE)\b[^;]*;/giu)].map(([statement]) => statement.replace(/\s+/gu, " "))).toEqual([
      "REVOKE ALL ON FUNCTION core.read_terminal_recorded_facts(uuid) FROM PUBLIC;",
      "GRANT EXECUTE ON FUNCTION core.read_terminal_recorded_facts(uuid) TO debateai_runtime;"
    ]);
    const original = await read("migrations/0049_terminal_recorded_facts.sql");
    const expected = original
      .replace("entry.call_site_key='JUDGE'", "entry.call_site_key IN ('JUDGE','REPAIR:STRUCTURE:JUDGE')")
      .replace("entry.call_site_key LIKE 'COMPOSER:%'",
        "(entry.call_site_key LIKE 'COMPOSER:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:COMPOSER:%')")
      .replace("entry.call_site_key LIKE 'CONFORMANCE:%'",
        "(entry.call_site_key LIKE 'CONFORMANCE:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:CONFORMANCE:%')")
      .replace("entry.call_site_key LIKE 'POST_COMPOSE_R9:%'",
        "(entry.call_site_key LIKE 'POST_COMPOSE_R9:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:POST_COMPOSE_R9:%')");
    expect(expected).not.toBe(original);
    // From the function's first line to the end of the file, 0120 is 0049 with exactly those four counts widened:
    // the same signature, return table, LANGUAGE sql, STABLE, SECURITY DEFINER, search_path, REVOKE and GRANT.
    expect(code.slice(code.indexOf("CREATE OR REPLACE FUNCTION core.read_terminal_recorded_facts("))).toBe(expected);
  });

  it("mirrors every column in the Drizzle schema and writes every one in the ledger's one INSERT", async () => {
    const schema = await read("packages/db/src/schema.ts");
    for (const [field, column] of [["replyRepairs", "reply_repairs"], ["replyFailureClass", "reply_failure_class"], ["replyForm", "reply_form"],
      ["cachedInputTokens", "cached_input_tokens"], ["guidedWords", "guided_words"], ["actualWords", "actual_words"]] as const) {
      expect(schema).toMatch(new RegExp(`${field}: (text|integer)\\("${column}"\\)`, "u"));
    }
    const ledger = await read("packages/ledger/src/index.ts");
    const insert = ledger.slice(ledger.indexOf("INSERT INTO ledger.raw_artifact ("), ledger.indexOf("RETURNING raw_artifact_id"));
    expect(insert.length).toBeGreaterThan(0);
    for (const column of COLUMNS) expect(insert).toContain(column);
  });

  it("follows the reclaim resume in the chain, with its own loader", async () => {
    const chain = await read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0119,loadForward0120,loadForward0121,loadForward0122,loadForward0123,loadForward0124,loadForward0125,loadForward0126,loadForward0127,loadForward0128,loadForward0129,loadForward0130,loadForward0131,loadForward0132,loadForward0133,loadForward0134,loadForward0135]");
    const loader = await read("packages/db/src/migration-forward0120.ts");
    expect(loader).toContain("const PREVIOUS='0119_reclaim_resume.sql';");
    expect(loader).toContain("const NAME='0120_reply_measures.sql';");
  });
});
