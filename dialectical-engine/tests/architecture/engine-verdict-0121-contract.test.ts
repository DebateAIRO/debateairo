// tests/architecture/engine-verdict-0121-contract.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "@debateai/crypto";
import { ENGINE_ANSWER_LETTERS, ENGINE_QUESTION_KINDS } from "@debateai/kernel";

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sql = read("migrations/0121_engine_verdict.sql");
// The SQL with its `--` comments stripped (as reply-measures-0120-contract.test.ts does): the statement scans below read
// code only, so a comment that names a statement can never satisfy or break them (pre-flight PF-R2a5.1).
const code = sql.replace(/--.*$/gmu, "");
const flat = (text: string): string => text.replace(/\s+/gu, " ");
const TABLES = ["ledger.point_investigation", "ledger.verdict_vote"] as const;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** One CHECK's text: from `CONSTRAINT <name> CHECK` to the next constraint or the end of the statement. */
function check(name: string): string {
  const head = `CONSTRAINT ${name} CHECK`;
  const at = sql.indexOf(head);
  expect(at, name).toBeGreaterThan(-1);
  const ends = [sql.indexOf("CONSTRAINT ", at + head.length), sql.indexOf(";", at + head.length)].filter((index) => index > -1);
  return sql.slice(at, Math.min(...ends));
}

/** Engine redesign R2 (spec 2026-10-15 §4.2b, §4.7, §4.9; INTERFACE §8.7, §9.5-§9.7, §14): R2's one migration, pinned as text. */
describe("0121: the engine verdict, R2's one migration", () => {
  it.each(TABLES)("%s is append-only, TRUNCATE-guarded, erasure-barred and granted like a carrier", (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
    expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\n  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
    expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();`);
    expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC;`);
    expect(sql).toContain(`GRANT SELECT, INSERT ON ${table} TO debateai_runtime;`);
    expect(sql).toContain(`GRANT SELECT ON ${table} TO debateai_replay;`);
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*ON ${escapeRegExp(table)}`, "u"));
    expect(CONTENT_CARRIERS).toContain(table);
  });

  it.each([
    ["ledger.point_investigation", "point_investigation", "NEW.node_id::text"],
    ["ledger.verdict_vote", "verdict_vote", "NEW.judge_seat::text"]
  ] as const)("%s seals its content with its own two guards, attested to the row's own key", (table, suffix, key) => {
    expect(sql).toContain(`CREATE TRIGGER aaa_enforce_content_attestation_v2\nBEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_${suffix}();`);
    expect(sql).toContain(`CREATE TRIGGER enforce_content_ciphertext\nBEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_${suffix}();`);
    const attestation = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_${suffix}()`));
    const body = attestation.slice(0, attestation.indexOf("$$;"));
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain(`NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, ${key},`);
    expect(sql).toContain(`RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ${table}' USING ERRCODE = '22023';`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_${suffix}() FROM PUBLIC;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_${suffix}() TO debateai_runtime;`);
  });

  it("defines only its own four functions, which no earlier migration names, and leaves 0069's progress shape alone", () => {
    const own = [...code.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z0-9_.]+)\(/gu)].map(([, name]) => name); // pre-flight PF-R2a5.1: code, not comments
    expect(own).toEqual([
      "core.enforce_content_ciphertext_point_investigation", "core.enforce_content_attestation_v2_point_investigation",
      "core.enforce_content_ciphertext_verdict_vote", "core.enforce_content_attestation_v2_verdict_vote"
    ]);
    const migrations = new URL("../../migrations/", import.meta.url);
    for (const earlier of readdirSync(migrations).filter((name) => /^\d{4}_.+\.sql$/u.test(name) && name < "0121_")) {
      const text = readFileSync(new URL(earlier, migrations), "utf8");
      for (const name of own) expect(text, earlier).not.toContain(name!);
    }
    expect(code).not.toMatch(/FUNCTION\s+core\.progress_value_is_code_shaped/u);
  });

  it("the engine calls never go through the runner's cooldown book (the reason 0069's progress shape stays as it is)", () => {
    const runner = read("apps/runner/src/index.ts");
    expect(runner).not.toMatch(/(?:cooldownAttempt|withCooldownRetry)\(\{[^}]*(?:VERDICT:|pointInvestigationCallSiteKey|comparingJudgeCallSiteKey)/su);
  });

  it("holds every readable column to a closed vocabulary or a code shape", () => {
    expect(flat(check("point_investigation_result_closed"))).toContain(
      "result IN ('HOLDS', 'FAILS', 'DEAD_END', 'INVESTIGATION_UNAVAILABLE', 'INVESTIGATION_SKIPPED', 'INVESTIGATION_CAPPED')");
    expect(flat(check("point_investigation_basis_closed"))).toContain("basis IN ('established', 'assumption', 'none')");
    expect(flat(check("verdict_vote_question_kind_closed"))).toContain(
      `question_kind IN (${ENGINE_QUESTION_KINDS.map((kind) => `'${kind}'`).join(", ")})`);
    expect(flat(check("verdict_vote_not_counted_reason_closed"))).toContain("not_counted_reason IN ('OWN_MAKER', 'JUDGE_FAILED')");
    const letter = new RegExp(/chosen_letter ~ '([^']+)'/u.exec(check("verdict_vote_letter_shape"))![1]!, "u");
    for (const value of ENGINE_ANSWER_LETTERS) expect(letter.test(value), value).toBe(true);
    for (const value of ["I", "a", "AB", "", "A "]) expect(letter.test(value), value).toBe(false);
    expect(check("verdict_vote_same_as_codes")).toContain('like_regex "^[A-H]$"');
    for (const name of ["point_investigation_codes", "verdict_vote_codes"]) {
      for (const column of ["maker", "provider_ref", "model_id"]) {
        expect(check(name)).toContain(`core.jsonb_is_code_token(to_jsonb(${column}))`);
      }
    }
  });

  it("re-adds both verdict-state CHECKs with SPLIT beside every state they held", () => {
    expect(sql).toMatch(/ALTER TABLE serve\.answer\s+DROP CONSTRAINT IF EXISTS answer_verdict_state_check,\s+ADD CONSTRAINT answer_verdict_state_check CHECK/u);
    expect(flat(check("answer_verdict_state_check"))).toContain("verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED', 'SPLIT')");
    expect(sql).toMatch(/ALTER TABLE serve\.serve_disclosure\s+DROP CONSTRAINT IF EXISTS serve_disclosure_floor_verdict_state_check,\s+ADD CONSTRAINT serve_disclosure_floor_verdict_state_check CHECK/u);
    expect(flat(check("serve_disclosure_floor_verdict_state_check"))).toContain(
      "floor_verdict_state IS NULL OR floor_verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED', 'SPLIT')");
  });

  it("re-adds the served-root CHECK with the judges' rule beside 0055's declared history, and the review-outcome CHECK with the new node mark", () => {
    const rule = flat(check("condition_mark_served_root_rule_rule_check"));
    for (const value of ["max-propagated-strength-lexicographic-tiebreak", "comparing-judges-votes-honest-strength-tiebreak", "first-configured-provider"]) {
      expect(rule).toContain(`served_root_rule = '${value}'`);
    }
    expect(flat(check("condition_mark_review_outcome_check"))).toContain(
      "mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED', 'UNASSESSED-AT-REDUCED-WEIGHT') AND review_outcome = 'cannot-assess'");
  });

  it("is replay-safe in the repository's form: every added CHECK and every trigger is dropped IF EXISTS first", () => {
    // Every scan reads `code` (comments stripped): the file's header comment names CREATE TABLE IF NOT EXISTS in words,
    // and a comment must never decide this test (pre-flight PF-R2a5.1).
    const added = [...code.matchAll(/ADD CONSTRAINT ([a-z_]+)/gu)].map(([, name]) => name!);
    expect(added.sort()).toEqual(["answer_verdict_state_check", "condition_mark_review_outcome_check",
      "condition_mark_served_root_rule_rule_check", "serve_disclosure_floor_verdict_state_check"]);
    for (const name of added) expect(code).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name},\\s+ADD CONSTRAINT ${name} CHECK`, "u"));
    const triggers = [...code.matchAll(/CREATE TRIGGER ([a-z0-9_]+)\s+BEFORE [A-Z ]+ ON ([a-z_.]+)/gu)];
    expect(triggers).toHaveLength(8);
    for (const [, trigger, table] of triggers) {
      expect(code).toContain(`DROP TRIGGER IF EXISTS ${trigger!} ON ${table!};`);
    }
    expect([...code.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s/gu)]).toHaveLength(2);
    expect(code).not.toMatch(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/u);
  });

  it("names nodes only of the same run, through core.node's UNIQUE (run_id, node_id)", () => {
    for (const [constraint, column] of [
      ["point_investigation_node_same_run", "node_id"],
      ["point_investigation_leader_without_same_run", "leader_without_root_node_id"],
      ["point_investigation_leader_with_same_run", "leader_with_root_node_id"],
      ["verdict_vote_root_same_run", "chosen_root_node_id"]
    ] as const) {
      expect(sql).toContain(`CONSTRAINT ${constraint} FOREIGN KEY (run_id, ${column}) REFERENCES core.node(run_id, node_id)`);
    }
    expect(sql).not.toContain("REFERENCES core.node(node_id)");
    // A later copy (0119) re-uses the order numbers on its own nodes: no unique order per run.
    expect(sql).not.toMatch(/UNIQUE \(run_id, investigation_order\)/u);
  });

  it("checks its own contract at the end: the ten guards and the four re-added CHECKs", () => {
    expect(sql).toContain("RAISE EXCEPTION 'ENGINE_VERDICT_GUARD_CONTRACT_INCOMPLETE';");
    expect(sql).toContain("RAISE EXCEPTION 'ENGINE_VERDICT_CHECK_CONTRACT_INCOMPLETE';");
  });

  it("mirrors both tables in the Drizzle schema with their content columns", () => {
    const schema = read("packages/db/src/schema.ts");
    for (const [name, table] of [["pointInvestigation", "point_investigation"], ["verdictVote", "verdict_vote"]] as const) {
      const start = schema.indexOf(`export const ${name} = ledger.table("${table}", {`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const block = schema.slice(start, schema.indexOf("});", start));
      expect(block).toContain('content: jsonb("content").notNull(),');
      expect(block).toContain('contentCiphertext: jsonb("content_ciphertext"),');
      expect(block).toContain('contentAttestation: bytea("content_attestation"),');
    }
  });

  it("follows the reply measures in the chain, with its own loader", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0120,loadForward0121,loadForward0122,loadForward0123,loadForward0124,loadForward0125,loadForward0126,loadForward0127,loadForward0128,loadForward0129,loadForward0130,loadForward0131,loadForward0132,loadForward0133,loadForward0134,loadForward0135]");
    const loader = read("packages/db/src/migration-forward0121.ts");
    expect(loader).toContain("const PREVIOUS='0120_reply_measures.sql';");
    expect(loader).toContain("const NAME='0121_engine_verdict.sql';");
    expect(loader).toContain("const TABLES=['ledger.point_investigation','ledger.verdict_vote'] as const;");
  });
});
