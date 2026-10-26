// tests/architecture/settings-activation-0124-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 0124 (side-by-side uploads spec 2026-10-21 §13; plan 2026-10-21-side-by-side-S-settings Task S1): settings changes
 * without an upload. Three NEW append-only tables in schema register (the activation pointer, the verdict log, the
 * switch's check rows) and seven definer functions owned by 0123's NOLOGIN debateai_release_owner, which share the
 * release switch's advisory lock. It is an `expand` step (additive only: it replaces no function another migration
 * defines, alters no older table, revokes no older grant) and adds no billing object, so 0111's effective verifier
 * stays in force (`-- n1: keeps-verifier`, migrations/lineage/README.md step 3). 0123's core.record_release_switch
 * already calls register.release_switch_settings_hook when it exists (0123 §3), so 0124 touches nothing of 0123.
 */
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const sql = read("migrations/0124_settings_activation.sql");
/** The SQL without its `--` comments (no literal or body of 0124 contains `--`). */
const code = sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLES = ["register.settings_activation", "register.settings_verdict", "register.settings_switch_check"] as const;
const HEADERS = [
  // In file order: the three insert guards come first, beside the triggers that use them.
  "register.settings_activation_insert_guard() RETURNS trigger",
  "register.settings_verdict_insert_guard() RETURNS trigger",
  "register.settings_switch_check_insert_guard() RETURNS trigger",
  "register.settings_version_passed(p_release_key text, p_version bigint) RETURNS boolean",
  "register.read_passed_settings_versions(p_release_key text) RETURNS SETOF bigint",
  "register.read_active_settings_version() RETURNS bigint",
  "register.record_settings_verdict(p_release_key text, p_version bigint, p_verdict text, p_digest text) RETURNS void",
  "register.activate_settings_version(p_version bigint, p_expected_previous bigint, p_expected_current_release text, p_activated_by text, p_reason text) RETURNS bigint",
  "register.release_switch_settings_hook(p_new text, p_expected_active_settings bigint) RETURNS void",
  "register.settings_switch_check_at_commit() RETURNS trigger"
] as const;
const MAIN_SIGNATURES = [
  "register.settings_version_passed(text,bigint)", "register.read_passed_settings_versions(text)",
  "register.read_active_settings_version()", "register.record_settings_verdict(text,bigint,text,text)",
  "register.activate_settings_version(bigint,bigint,text,text,text)", "register.release_switch_settings_hook(text,bigint)",
  "register.settings_switch_check_at_commit()"
] as const;
const GUARD_SIGNATURES = [
  "register.settings_activation_insert_guard()", "register.settings_verdict_insert_guard()",
  "register.settings_switch_check_insert_guard()"
] as const;
const LOCK = "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0))";

/** One function's text, from its header line to the end of its dollar-quoted body. */
function definition(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, name).toBeGreaterThan(start);
  return sql.slice(start, end);
}
/** The attributes between a function's header line and its body. */
const attributes = (name: string): string => {
  const text = definition(name);
  return text.slice(text.indexOf("\n"), text.indexOf("AS $$"));
};

describe("0124: the settings activation step", () => {
  it("names itself and declares expand and keeps-verifier in its leading comment block", () => {
    const lines = sql.split("\n");
    expect(lines[0]).toBe("-- 0124 · Settings changes without an upload (side-by-side spec §13; plan 2026-10-21-side-by-side-S-settings Task S1).");
    const header = lines.slice(0, lines.findIndex((line) => line.trim() !== "" && !line.startsWith("--")));
    expect(header).toContain("-- n1: expand");
    expect(header).toContain("-- n1: keeps-verifier");
    expect(header).not.toContain("-- n1: drained");
    for (const claim of ["THE RULE 0063 WROTE DOWN, obeyed here", "core.record_release_switch",
      "register.release_switch_settings_hook", "0123's objects are not touched", "Additive and replay-safe in the repository's form"]) {
      expect(header.join("\n").replace(/\n--\s*/gu, " "), claim).toContain(claim);
    }
  });

  it("creates exactly its three tables and alters, drops, renames or revokes nothing older", () => {
    expect([...code.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map(([, name]) => name)).toEqual([...TABLES]);
    expect(code).not.toMatch(/\bALTER\s+TABLE\b/u);
    expect(code).not.toMatch(/\bRENAME\b/u);
    // Every DROP is a trigger dropped IF EXISTS on one of 0124's own tables, re-created by the next statement.
    const drops = [...code.matchAll(/\bDROP\b/gu)].map((match) => code.slice(match.index));
    expect(drops.length).toBe(7);
    for (const drop of drops) {
      const pair = /^DROP TRIGGER IF EXISTS ([a-z_]+) ON (register\.[a-z_]+);\s*CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+)\b[^;]*?\bON (register\.[a-z_]+)\b/u.exec(drop);
      expect(pair, drop.slice(0, 80)).not.toBeNull();
      expect(pair![3]).toBe(pair![1]);
      expect(pair![4]).toBe(pair![2]);
      expect(TABLES).toContain(pair![2]);
    }
    // Every REVOKE is `REVOKE ALL ... FROM PUBLIC` on 0124's own objects.
    const revokes = [...code.matchAll(/^REVOKE [^\n]+$/gmu)].map(([line]) => line);
    expect(revokes).toEqual([
      ...TABLES.map((table) => `REVOKE ALL ON ${table} FROM PUBLIC;`),
      ...[...MAIN_SIGNATURES, ...GUARD_SIGNATURES].map((signature) => `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`)
    ]);
    expect(code.match(/\bREVOKE\b/gu)).toHaveLength(revokes.length);
  });

  it("defines exactly its ten functions, each header on one line, defining nothing an earlier migration defines", () => {
    expect([...code.matchAll(/^CREATE OR REPLACE FUNCTION (.+)$/gmu)].map(([, header]) => header)).toEqual([...HEADERS]);
    expect(code.match(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gu)).toHaveLength(HEADERS.length);
    // No earlier migration defines any of the ten (0123 only CALLS the hook, behind to_regprocedure).
    const earlier = readdirSync(new URL("../../migrations/", import.meta.url))
      .filter((file) => /^\d{4}_.+\.sql$/u.test(file) && file < "0124_");
    for (const header of HEADERS) {
      const name = header.slice(0, header.indexOf("("));
      const defined = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${name.replace(".", "\\.")}\\s*\\(`, "iu");
      for (const file of earlier) expect(read(`migrations/${file}`), `${file} ${name}`).not.toMatch(defined);
    }
    expect(read("migrations/0123_side_by_side_releases.sql")).toContain(
      "PERFORM register.release_switch_settings_hook(p_new, p_expected_active_settings);");
  });

  it("pins every function's path and security: definers, except the three SECURITY INVOKER insert guards", () => {
    for (const signature of MAIN_SIGNATURES) {
      const name = signature.slice(0, signature.indexOf("("));
      expect(attributes(name), name).toMatch(/\bSECURITY DEFINER\b/u);
      expect(attributes(name), name).toMatch(/\bSET search_path = pg_catalog\n/u);
    }
    for (const signature of GUARD_SIGNATURES) {
      const name = signature.slice(0, signature.indexOf("("));
      expect(attributes(name), name).toMatch(/\bSECURITY INVOKER\b/u);
      expect(attributes(name), name).toMatch(/\bSET search_path = pg_catalog\n/u);
      expect(definition(name)).toContain("RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SETTINGS_ACTIVATION_WRITER_INVALID'");
      expect(definition(name)).toContain("current_user <> 'debateai_release_owner'");
    }
    for (const name of ["register.settings_version_passed", "register.read_passed_settings_versions", "register.read_active_settings_version"]) {
      expect(attributes(name), name).toMatch(/\bLANGUAGE sql\nSTABLE\n/u);
    }
  });

  it("takes the release switch's lock in the activation and the hook, and reads the pointer only through its reader", () => {
    for (const name of ["register.activate_settings_version", "register.release_switch_settings_hook"]) {
      expect(definition(name), name).toContain(`PERFORM ${LOCK};`);
    }
    // The verdict writer records a fact, not a decision: no lock.
    expect(definition("register.record_settings_verdict")).not.toContain("pg_advisory_xact_lock");
    // Ruling R1: ONE direct read of the pointer table, in its reader; the activation, the hook and the commit check call it.
    expect(code.match(/FROM register\.settings_activation\b/gu)).toHaveLength(1);
    expect(definition("register.read_active_settings_version")).toContain(
      "SELECT a.register_version FROM register.settings_activation AS a ORDER BY a.activation_seq DESC LIMIT 1");
    for (const name of ["register.activate_settings_version", "register.release_switch_settings_hook", "register.settings_switch_check_at_commit"]) {
      expect(definition(name), name).toContain("register.read_active_settings_version()");
    }
    expect(definition("register.settings_switch_check_at_commit")).toContain("core.read_current_release()");
    expect(definition("register.activate_settings_version")).toContain("core.read_current_release()");
  });

  it("refuses with the plan's codes, in the plan's order", () => {
    const activation = definition("register.activate_settings_version");
    const order = ["READ_COMMITTED_REQUIRED", "SETTINGS_ACTIVATION_CONFLICT", "SETTINGS_VERSION_KIND_INVALID",
      "SETTINGS_ACTIVATION_UNCHANGED", "SETTINGS_VERSION_NOT_PASSED", "INSERT INTO register.settings_activation"];
    const at = order.map((needle) => activation.indexOf(needle));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(activation).toContain("publication_kind IS NULL OR v.publication_kind = 'GENERAL'");
    expect(definition("register.release_switch_settings_hook")).toContain("MESSAGE = 'SETTINGS_ACTIVATION_CONFLICT'");
    expect(definition("register.settings_switch_check_at_commit")).toContain("MESSAGE = 'SETTINGS_VERSION_NOT_PASSED'");
    expect(definition("register.record_settings_verdict")).toContain("MESSAGE = 'SETTINGS_VERDICT_INVALID'");
    // D1: a release passes its own site version; otherwise its latest verdict decides.
    expect(definition("register.settings_version_passed")).toContain("pg_catalog.substring(p_release_key, '^r([1-9][0-9]*)-') = p_version::text");
    expect(definition("register.settings_version_passed")).toContain("ORDER BY v.checked_at DESC LIMIT 1");
    expect(definition("register.read_passed_settings_versions")).toContain("SELECT DISTINCT ON (v.register_version)");
  });

  it("checks the switch at COMMIT through a deferred constraint trigger", () => {
    expect(sql).toContain("DROP TRIGGER IF EXISTS settings_switch_check_at_commit ON register.settings_switch_check;\n"
      + "CREATE CONSTRAINT TRIGGER settings_switch_check_at_commit AFTER INSERT ON register.settings_switch_check DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION register.settings_switch_check_at_commit();");
  });

  it("guards each table append-only, truncate-guarded and writer-only, and says so itself", () => {
    for (const table of TABLES) {
      const name = table.slice("register.".length);
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC;`);
      expect(sql).toContain(`DROP TRIGGER IF EXISTS reject_mutation ON ${table};\nCREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toContain(`DROP TRIGGER IF EXISTS ${name}_insert_guard ON ${table};\nCREATE TRIGGER ${name}_insert_guard BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION register.${name}_insert_guard();`);
    }
    expect(sql).toMatch(/DO \$settings_activation_contract\$[\s\S]*RAISE EXCEPTION 'SETTINGS_ACTIVATION_GUARD_CONTRACT_INCOMPLETE';[\s\S]*\$settings_activation_contract\$;\n$/u);
  });

  it("writes no sequence call and no latest-register-version read", () => {
    expect(sql).not.toContain("nextval(");
    expect(sql).not.toMatch(/max\s*\(\s*(?:[a-z_]+[.])?register_version\s*\)/iu);
    expect(sql).not.toMatch(/register_version\s+DESC\s+LIMIT\s+1/iu);
  });

  it("owns and grants exactly what the plan says, one grantee per GRANT line", () => {
    const statements = [...code.matchAll(/^(?:ALTER FUNCTION|GRANT) [^\n]+$/gmu)].map(([line]) => line);
    expect(statements).toEqual([
      // Ruling R9: all ten are the release owner's (the insert guards too, though they run as their invoker).
      ...[...MAIN_SIGNATURES, ...GUARD_SIGNATURES].map((signature) => `ALTER FUNCTION ${signature} OWNER TO debateai_release_owner;`),
      // The owner's USAGE on the schema is 0123's (0123 §3); the operator needs it to call the operator functions.
      "GRANT USAGE ON SCHEMA register TO debateai_release_operator;",
      "GRANT SELECT ON register.register_version TO debateai_release_owner;",
      "GRANT SELECT, INSERT ON register.settings_activation, register.settings_verdict, register.settings_switch_check TO debateai_release_owner;",
      "GRANT USAGE ON SEQUENCE register.settings_activation_activation_seq_seq, register.settings_switch_check_check_seq_seq TO debateai_release_owner;",
      "GRANT EXECUTE ON FUNCTION register.read_active_settings_version() TO debateai_billing_runtime;",
      "GRANT EXECUTE ON FUNCTION register.read_active_settings_version() TO debateai_release_operator;",
      "GRANT EXECUTE ON FUNCTION register.settings_version_passed(text,bigint), register.read_passed_settings_versions(text) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION register.settings_version_passed(text,bigint), register.read_passed_settings_versions(text) TO debateai_release_operator;",
      "GRANT EXECUTE ON FUNCTION register.activate_settings_version(bigint,bigint,text,text,text), register.record_settings_verdict(text,bigint,text,text) TO debateai_release_operator;",
      "GRANT SELECT ON register.settings_activation, register.settings_verdict TO debateai_release_operator;"
    ]);
    expect(code.match(/\bGRANT\b/gu)).toHaveLength(10);
    expect(statements.filter((line) => line.startsWith("GRANT ")).every((line) => / TO [a-z_]+;$/u.test(line))).toBe(true);
    // The hook and the commit check get no grant: 0123's switch runs as their owner.
    expect(code).not.toMatch(/GRANT[^\n]*(?:release_switch_settings_hook|settings_switch_check_at_commit)/u);
  });

  it("follows 0123 in the chain, with its own loader, bound to 0123's manifest and 0111's verifier", () => {
    const manifest = JSON.parse(read("migrations/lineage/settings-activation-forward0124.json")) as {
      version: string; baseRecipeSha256: string; previous: { name: string; manifestSha256: string; verifierSha256: string };
      migration: { name: string; sha256: string }; verifier: { path: string; sha256: string };
    };
    const previous = JSON.parse(read("migrations/lineage/side-by-side-releases-forward0123.json")) as { baseRecipeSha256: string };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest.version).toBe("settings-activation-forward0124-v1");
    expect(manifest.baseRecipeSha256).toBe(previous.baseRecipeSha256);
    expect(manifest.previous).toEqual({
      name: "0123_side_by_side_releases.sql",
      manifestSha256: sha256(read("migrations/lineage/side-by-side-releases-forward0123.json")),
      verifierSha256: sha256(read("migrations/lineage/verify-effective-capabilities-111.sql"))
    });
    expect(manifest.migration).toEqual({ name: "0124_settings_activation.sql", sha256: sha256(sql) });
    expect(manifest.verifier).toEqual({ path: "lineage/verify-effective-capabilities-111.sql", sha256: manifest.previous.verifierSha256 });
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0123,loadForward0124]");
    const loader = read("packages/db/src/migration-forward0124.ts");
    for (const line of ["const NAME='0124_settings_activation.sql';", "const VERSION='settings-activation-forward0124-v1';",
      "const MANIFEST_PATH='lineage/settings-activation-forward0124.json';",
      "const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql';", "const PREVIOUS='0123_side_by_side_releases.sql';",
      "MIGRATION_FORWARD0124_"]) expect(loader).toContain(line);
    expect(loader).not.toMatch(/replayVerifierSql\s*:/u);
    for (const object of [...TABLES, ...MAIN_SIGNATURES, ...GUARD_SIGNATURES]) expect(loader).toContain(`'${object}'`);
  });
});
