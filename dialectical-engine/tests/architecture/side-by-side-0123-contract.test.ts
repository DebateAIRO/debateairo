// tests/architecture/side-by-side-0123-contract.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";

/**
 * 0123 (side-by-side uploads spec 2026-10-21 §1, §5; plan A, tasks A1-A5) is ONE chain step built section by section:
 * A1 gives it the release stamp on core.run and the encrypted insert path that writes it; A2 the release table, its view,
 * its two readers and its two serialized writers (§3). It is the drained transition
 * upload's step (`-- n1: drained`) and adds no billing object, so 0111's effective verifier stays in force
 * (`-- n1: keeps-verifier`, migrations/lineage/README.md step 3).
 */
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const sql = read("migrations/0123_side_by_side_releases.sql");
const manifest = JSON.parse(read("migrations/lineage/side-by-side-releases-forward0123.json")) as Record<string, unknown> & {
  version: string; baseRecipeSha256: string;
  previous: { name: string; manifestSha256: string; verifierSha256: string };
  migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string };
};
const shape = (value: unknown): unknown => typeof value === "object" && value !== null && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]).sort(([a], [b]) => String(a).localeCompare(String(b))))
  : typeof value;

describe("0123: the side-by-side releases step", () => {
  it("is appended last to the chain's STEPS, after the engine's map answer step", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0122,loadForward0123]");
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const NAME='0123_side_by_side_releases.sql';");
    expect(loader).toContain("const VERSION='side-by-side-releases-forward0123-v1';");
    expect(loader).toContain("const PREVIOUS='0122_engine_map_check.sql';");
    expect(loader).toContain("MIGRATION_FORWARD0123_");
  });

  it("has 0122's manifest shape, bound to 0122's manifest and to the verifier in force (0111's)", () => {
    const previous = JSON.parse(read("migrations/lineage/engine-map-check-forward0122.json")) as unknown;
    expect(shape(manifest)).toEqual(shape(previous));
    expect(manifest.version).toBe("side-by-side-releases-forward0123-v1");
    expect(manifest.previous.name).toBe("0122_engine_map_check.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/engine-map-check-forward0122.json")));
    expect(manifest.previous.verifierSha256).toBe(sha256(read("migrations/lineage/verify-effective-capabilities-111.sql")));
    expect(manifest.previous.verifierSha256.startsWith("aba0e0b3")).toBe(true);
    expect(manifest.migration).toEqual({ name: "0123_side_by_side_releases.sql", sha256: sha256(sql) });
    expect(manifest.verifier.path).toBe("lineage/verify-effective-capabilities-111.sql");
    expect(manifest.verifier.sha256).toBe(manifest.previous.verifierSha256);
  });

  it("declares itself drained and verifier-keeping in its leading comment block", () => {
    const lines = sql.split("\n");
    const header = lines.slice(0, lines.findIndex((line) => !line.startsWith("--")));
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain("-- n1: drained");
    expect(header).toContain("-- n1: keeps-verifier");
  });

  it("§1 adds core.run.release_key with its default and shape CHECK, replay-safe", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS release_key text NOT NULL DEFAULT 'legacy'");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS run_release_key_shape");
    expect(sql).toContain("ADD CONSTRAINT run_release_key_shape CHECK (release_key = 'legacy' OR release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$')");
  });

  it("§2 redefines core.create_encrypted_run in place: releaseKey admitted and written, its definer, path and grants re-asserted", () => {
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION core.create_encrypted_run(");
    expect(start).toBeGreaterThan(0);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("RETURNS boolean");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = pg_catalog");
    expect(body).toContain("'contentCiphertext','contentAttestation','contentAttestationSecret','releaseKey'");
    expect(body).toContain("COALESCE(p_run->>'releaseKey','legacy')");
    // startRun's capability probe reads these two names in the definition; they must survive the redefinition.
    expect(body).toContain("'planTier'");
    expect(body).toContain("'argumentLanguageTag'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\)\s+FROM PUBLIC,debateai_runtime,[^;]*debateai_content_provision;/u);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\) TO debateai_content_provision;/u);
    // The closing contract checks what the file claims, by code.
    expect(sql).toContain("SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE");
  });

  it("§3 adds the release table, its view, two readers for the runtime and two writers serialized on one lock", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS core.release_event (");
    expect(sql).toContain("CONSTRAINT release_event_key_shape CHECK (release_key <> 'legacy' AND release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS release_event_key_seq_idx ON core.release_event (release_key, event_seq DESC);");
    expect(sql).toContain("SELECT core.install_truncate_guard('core.release_event');");
    expect(sql).toMatch(/CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core\.release_event\s+FOR EACH STATEMENT EXECUTE FUNCTION core\.reject_mutation\(\);/u);
    expect(sql).toContain("CREATE OR REPLACE VIEW core.release_state_v AS");
    for (const role of ["debateai_release_owner", "debateai_release_operator"]) expect(sql).toContain(`CREATE ROLE ${role} NOLOGIN NOINHERIT;`);
    // Both writers take the one lock the INTERFACE names, first, and need READ COMMITTED.
    expect(sql.split("PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai:release-switch', 0));")).toHaveLength(3);
    expect(sql.split("IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN")).toHaveLength(3);
    // Phase 2's settings hook (plan S, addendum item 5), verbatim, after the compare-and-swap and before the inserts.
    const hook = [
      "  IF pg_catalog.to_regprocedure('register.release_switch_settings_hook(text,bigint)') IS NOT NULL THEN",
      "    PERFORM register.release_switch_settings_hook(p_new, p_expected_active_settings);",
      "  ELSIF p_expected_active_settings IS NOT NULL THEN",
      "    RAISE EXCEPTION 'SETTINGS_ACTIVATION_CONFLICT';",
      "  END IF;"
    ].join("\n");
    const hookAt = sql.indexOf(hook);
    expect(hookAt).toBeGreaterThan(sql.indexOf("MESSAGE = 'RELEASE_SWITCH_CONFLICT'"));
    expect(hookAt).toBeLessThan(sql.indexOf("VALUES (p_new, 'CURRENT', p_take_traffic_from, p_recorded_by)"));
    for (const signature of ["core.read_current_release()", "core.read_release_state(text)",
      "core.record_release_switch(text,text,timestamptz,text,bigint)", "core.record_release_event(text,text,text,text)"]) {
      expect(sql).toContain(`ALTER FUNCTION ${signature} OWNER TO debateai_release_owner;`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    }
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.read_current_release() TO debateai_runtime;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.read_release_state(text) TO debateai_runtime;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.record_release_switch(text,text,timestamptz,text,bigint) TO debateai_release_operator;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.record_release_event(text,text,text,text) TO debateai_release_operator;");
    expect(sql).toContain("SIDE_BY_SIDE_RELEASE_TABLE_CONTRACT_INCOMPLETE");
    // The loader digests the table whole, the view, the four functions and the two roles.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const TABLES=['core.release_event'] as const;");
    expect(loader).toContain("const VIEWS=['core.release_state_v'] as const;");
    expect(loader).toContain("const ROLES=['debateai_release_operator','debateai_release_owner'] as const;");
    expect(loader).toContain("'core.record_release_switch(text,text,timestamptz,text,bigint)'");
  });

  it("§2's closing check covers every role 0040's REVOKE names, not only PUBLIC and the runtime", () => {
    for (const role of ["debateai_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_publication_cleanup"]) {
      expect(sql).toContain(`OR has_function_privilege('${role}', v_function, 'EXECUTE')`);
    }
  });

  it("is documented as the thirteenth step, keeping 0111's verifier", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme).toContain("## Side-by-side releases (0123)");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the engine's map answer step (0122, below) the twelfth and the side-by-side releases (0123, below) the thirteenth");
  });

  it("is the plan's last step, with no supplemental verifier", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-1)?.name).toBe("0123_side_by_side_releases.sql");
    expect(plan.forwardChain.at(-2)?.name).toBe("0122_engine_map_check.sql");
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
    expect(plan.forwardChain.at(-1)?.verifierPath).toBe("lineage/verify-effective-capabilities-111.sql");
  });
});
