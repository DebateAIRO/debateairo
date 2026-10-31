// tests/architecture/web-evidence-0132-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { WEB_EVIDENCE_CARRIERS, webPageTextRef } from "../../packages/db/src/web-evidence.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0132 (Perplexity plan 2026-10-30, task W1-3; owner answers Q4, Q7, Q11): the web evidence store. Eight identity tables
 * keyed by the run and by the account's owner_ref (ON DELETE CASCADE), six of them run content carriers checked by one
 * trigger (encryption required, erasure barrier, attestation), the page text in its own transient table, append-only
 * otherwise. An `expand` step that keeps 0130's effective verifier in force. No database here: the behaviour is
 * tests/integration/web-evidence-database.test.ts.
 */
const NAME = "0132_web_evidence.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/web-evidence-forward0132.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0132 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");

const TABLES = ["identity.web_search", "identity.web_page", "identity.web_page_text", "identity.web_reading",
  "identity.web_extract", "identity.web_pick", "identity.web_pack", "identity.web_researched"] as const;
const CARRIERS = ["identity.web_search", "identity.web_page", "identity.web_page_text", "identity.web_reading",
  "identity.web_extract", "identity.web_pack"] as const;
const RUNNER = [
  "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)",
  "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)",
  "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)",
  "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)",
  "identity.record_web_picks(uuid,text,uuid[])",
  "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)",
  "identity.read_web_evidence(uuid)",
  "identity.read_web_page_texts(uuid,uuid[])",
  "identity.settle_web_researched(uuid,uuid,text)"
] as const;
const API = "identity.record_web_researched(uuid,uuid,uuid)";
const FORGET = "identity.forget_erased_debate_web_evidence(uuid)";
const EXPORT_READER = "identity.read_data_export_web_evidence(uuid,uuid)";
const PRIVATE = ["identity.enforce_web_evidence_content()", "identity.guard_web_evidence_record()",
  "identity.web_evidence_run_owner(uuid)"] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return sql.slice(at, sql.indexOf("\n);", at));
};

describe("0132: the web evidence store step", () => {
  it("C-T follows 0131 in the chain's STEPS, with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0131,loadForward0132,loadForward0133,loadForward0134,loadForward0135]");
    const loader = read("packages/db/src/migration-forward0132.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "web-evidence-forward0132-v1";');
    expect(loader).toContain('const PREVIOUS = "0131_v4_account_memory.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0132_");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...PRIVATE, ...RUNNER, API, FORGET, EXPORT_READER]) expect(loader).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual(["0131_v4_account_memory.sql", NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0131's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/v4-account-memory-forward0131.json")) as { baseRecipeSha256: string };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest).toEqual({
      version: "web-evidence-forward0132-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0131_v4_account_memory.sql",
        manifestSha256: sha256(read("migrations/lineage/v4-account-memory-forward0131.json")),
        verifierSha256: VERIFIER_130
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and only through its one reviewed owner block", async () => {
    const sql = read(SQL_PATH);
    const earlier = readdirSync(new URL("../../migrations/", import.meta.url))
      .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of [...PRIVATE, ...RUNNER, API, FORGET, EXPORT_READER]) {
      expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1])).toEqual(["N1_DYNAMIC_SQL"]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O creates only its eight tables, each keyed by its run and its account (ON DELETE CASCADE), truncate-guarded", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      const body = tableBody(sql, table);
      expect(body, table).toMatch(/\n {2}run_id uuid NOT NULL,\n/u);
      expect(body, table).toMatch(/owner_ref uuid NOT NULL REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
      // No foreign key to core.run, as 0131: ownership is checked on every call.
      expect(body, table).not.toMatch(/REFERENCES core\.run/u);
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER guard_web_evidence_record BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\\n`, "u"));
    }
  });

  it("C-P keeps no plaintext: every text lives in a carrier's envelope, and only ids, enums, numbers and times are plain", () => {
    const sql = code(read(SQL_PATH));
    for (const table of TABLES) {
      const body = tableBody(sql, table);
      const textColumns = [...body.matchAll(/\n {2}([a-z_]+) text(?:\[\])?\b/gu)].map((match) => match[1]);
      // The only text columns: closed words and bounded ids, each with its CHECK.
      for (const column of textColumns) {
        expect(["path_ref", "side", "language_kind", "language", "country", "look_back", "outcome", "read_depth", "maker",
          "label", "extract_labels"], `${table}.${column}`).toContain(column);
      }
      expect(body, table).not.toMatch(/\b(?:query|words|address|url|title|site|quote|line|text_content|body)\s+(?:text|jsonb)\b/u);
      const carrier = (CARRIERS as readonly string[]).includes(table);
      expect(/content_ciphertext jsonb/u.test(body), table).toBe(carrier);
      expect(/content_attestation bytea/u.test(body), table).toBe(carrier);
      // No plaintext twin of the envelope (0127's `content` sentinel column is not needed: there is no plaintext mode).
      expect(body, table).not.toMatch(/\n {2}content jsonb/u);
    }
    // Every carrier is in CONTENT_CARRIERS and checked on insert by the one content trigger, bound to its own row id.
    const keys: Record<string, string> = { "identity.web_search": "search_id", "identity.web_page": "page_id",
      "identity.web_page_text": "page_id", "identity.web_reading": "reading_id", "identity.web_extract": "extract_id",
      "identity.web_pack": "pack_id" };
    for (const carrier of CARRIERS) {
      expect(CONTENT_CARRIERS).toContain(carrier);
      expect(sql).toContain(`CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON ${carrier}\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('${keys[carrier]}');`);
    }
    expect(Object.values(WEB_EVIDENCE_CARRIERS).sort()).toEqual([...CARRIERS].sort());
    const trigger = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION identity.enforce_web_evidence_content()"),
      sql.indexOf("\n$$;", sql.indexOf("CREATE OR REPLACE FUNCTION identity.enforce_web_evidence_content()")));
    // A run without content encryption is refused (never plaintext), an erased run too, and the attestation is checked.
    expect(trigger).toContain("IF NOT COALESCE(core.run_uses_content_encryption(v_run), false) THEN");
    expect(trigger).toContain("MESSAGE='WEB_EVIDENCE_ENCRYPTION_REQUIRED'");
    expect(trigger).toContain("IF NOT core.run_private_content_is_live(v_run) THEN");
    expect(trigger).toContain("core.content_envelope_attestation_bytes(v_run, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, v_row->>TG_ARGV[0],");
    // The page text is its own carrier, never a column of the page.
    expect(tableBody(sql, "identity.web_page")).not.toMatch(/\n {2}(?:text_ciphertext|page_text|text_content)\s/u);
    expect(webPageTextRef("6f1c8a52-0d5b-4b55-9d3a-1f0b7a1e2c3d", Buffer.alloc(32, 1)))
      .toBe(`web-page-text:6f1c8a52-0d5b-4b55-9d3a-1f0b7a1e2c3d@${"01".repeat(32)}`);
  });

  it("C-F defines its functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created.sort()).toEqual([...PRIVATE, ...RUNNER, API, FORGET, EXPORT_READER].map(nameOf).sort());
    for (const signature of [...RUNNER, API, FORGET, EXPORT_READER, PRIVATE[0], PRIVATE[1]]) {
      const name = nameOf(signature);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    expect(sql).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
  });

  it("C-G grants nine runner functions to the runtime role, the choice to the API's role, the deletion and the reader to theirs", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...RUNNER.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${API} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${FORGET} TO debateai_erasure_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(12);
    // No table right for anyone.
    expect(code(sql)).not.toMatch(/\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\b/u);
  });

  it("C-D (R22 item 16) deleting one debate deletes its web evidence in the finalize transaction, only once it is erased", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.forget_erased_debate_web_evidence(");
    const forget = sql.slice(at, sql.indexOf("\n$$;", at));
    expect(forget).toMatch(/IF p_run_id IS NULL OR NOT EXISTS \(SELECT 1 FROM serve\.private_run_erasure_tombstone[\s\S]*?MESSAGE='WEB_EVIDENCE_DEBATE_NOT_ERASED';/u);
    for (const table of TABLES) expect(forget, table).toContain(`DELETE FROM ${table} AS `);
    const helper = read("packages/db/src/erasure-page-memory.ts");
    const pageMemory = helper.indexOf('"SELECT identity.forget_erased_debate_page_memory($1)"');
    const investigation = helper.indexOf('"SELECT identity.forget_erased_debate_investigation($1)"');
    const web = helper.indexOf('"SELECT identity.forget_erased_debate_web_evidence($1)"');
    const commit = helper.indexOf('client.query("COMMIT")');
    expect(pageMemory).toBeGreaterThan(0);
    expect([pageMemory, investigation, web, commit].every((value, index, all) => index === 0 || value > all[index - 1]!)).toBe(true);
    expect(read("packages/db/src/account-erasure.ts")).toMatch(
      /const ERASURE_FUNCTION_SIGNATURES = Object\.freeze\(\[[\s\S]*?FORGET_ERASED_DEBATE_PAGE_MEMORY,\n[^\n]*\n {2}FORGET_ERASED_DEBATE_WEB_EVIDENCE,\n {2}FORGET_ERASED_DEBATE_INVESTIGATION,\n[^\n]*\n {2}FORGET_ERASED_DEBATE_DIG_MODEL,\n[^\n]*\n {2}FORGET_ERASED_DEBATE_DIG_PICKS\n\] as const\);/u);
  });

  it("C-R is documented as the twenty-second step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the V4 account memory (0131, below) the twenty-first, the web evidence store (0132, below) the twenty-second, the investigations (0133, below) the twenty-third, the dig model with the month pause (0134, below) the twenty-fourth and the dig picks (0135, below) the twenty-fifth.");
    const heading = "## The web evidence store (0132) and investigations (0133)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(readme.indexOf("## The V4 account memory (0131)"));
    expect(readme.indexOf("## Replay: every applied step keeps its own checks")).toBeGreaterThan(at);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-second", NAME, "web-evidence-forward0132.json", "packages/db/src/migration-forward0132.ts",
      "`loadForward0132`", "MIGRATION_FORWARD0132_", "identity.web_page_text", "CONTENT_CARRIERS", "-- n1: expand",
      "-- n1: keeps-verifier", "ledger.call_prompt"]) {
      expect(section, needle).toContain(needle);
    }
  });
});
