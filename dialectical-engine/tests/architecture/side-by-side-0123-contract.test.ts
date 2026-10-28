// tests/architecture/side-by-side-0123-contract.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";

/**
 * 0123 (side-by-side uploads spec 2026-10-21 §1, §5; plan A, tasks A1-A5) is ONE chain step built section by section:
 * A1 gives it the release stamp on core.run and the encrypted insert path that writes it; A2 the release table, its view,
 * its two readers and its two serialized writers (§3); A3 the re-admission records and the two new wait reasons (§4, §5);
 * A4 the funding functions redefined so a grant stays valid under the version it was issued with, and the funding
 * publication reader at a version (§6); A5 the append-only spend waiver and the funded spend reader that honours it (§7).
 * It is the drained transition
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
  it("is appended to the chain's STEPS after the engine's map answer step (the settings activation 0124, the Italy-specific approval 0125 and row-level security 0126 follow it)", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0122,loadForward0123,loadForward0124,loadForward0125,loadForward0126]");
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
    // Final review A4: the state reader also answers still_draining (a DRAINING event with no later RETIRED one), and
    // the closing block checks its result shape.
    const reader = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION core.read_release_state(p_release_key text)"));
    expect(reader.slice(0, reader.indexOf("$$;"))).toContain(
      "RETURNS TABLE(state text, front_pair_stopped boolean, retire_requested boolean, still_draining boolean)");
    expect(reader.slice(0, reader.indexOf("$$;"))).toContain("AND retired.event_seq > drained.event_seq)) AS still_draining");
    expect(sql).toContain(
      "IS DISTINCT FROM 'TABLE(state text, front_pair_stopped boolean, retire_requested boolean, still_draining boolean)'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.record_release_switch(text,text,timestamptz,text,bigint) TO debateai_release_operator;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.record_release_event(text,text,text,text) TO debateai_release_operator;");
    expect(sql).toContain("SIDE_BY_SIDE_RELEASE_TABLE_CONTRACT_INCOMPLETE");
    // The loader digests the table whole, the view, the four functions and the two roles.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const TABLES=['core.release_event',"); // §4 appends core.run_supersession
    expect(loader).toContain("const VIEWS=['core.release_state_v'] as const;");
    expect(loader).toContain("const ROLES=['debateai_release_operator','debateai_release_owner'] as const;");
    expect(loader).toContain("'core.record_release_switch(text,text,timestamptz,text,bigint)'");
  });

  it("§4 adds the append-only supersession record, its guard, run ref resolution and the line without superseded runs", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS core.run_supersession (");
    expect(sql).toContain("old_run_id uuid PRIMARY KEY REFERENCES core.run(run_id),");
    expect(sql).toContain("new_run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),");
    expect(sql).toContain("CONSTRAINT run_supersession_reason_closed CHECK (reason IN ('READMITTED'))");
    expect(sql).toContain("CONSTRAINT run_supersession_changes_the_run CHECK (old_run_id <> new_run_id)");
    expect(sql).toContain("SELECT core.install_truncate_guard('core.run_supersession');");
    expect(sql).toMatch(/CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core\.run_supersession\s+FOR EACH STATEMENT EXECUTE FUNCTION core\.reject_mutation\(\);/u);
    expect(sql).toMatch(/CREATE TRIGGER guard_run_supersession BEFORE INSERT ON core\.run_supersession\s+FOR EACH ROW EXECUTE FUNCTION core\.guard_run_supersession\(\);/u);
    // The guard: one lock for every edge, the old run's wait row locked against a concurrent start, the refusal code.
    const guard = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION core.guard_run_supersession()"));
    expect(guard.slice(0, guard.indexOf("$$;"))).toContain(
      "PERFORM 1 FROM core.run_wait AS wait WHERE wait.run_id = NEW.old_run_id FOR UPDATE;");
    // Final review P3: the old run must still be in the line as core.run_waiting_v reads it, read after the lock (an
    // erasure or a set-aside committed between createRun and START refuses), and the closing block binds it.
    const guardBody = guard.slice(0, guard.indexOf("$$;"));
    expect(guardBody).toContain("OR NOT EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = NEW.old_run_id)");
    expect(guardBody.indexOf("core.run_waiting_v")).toBeGreaterThan(guardBody.indexOf("FOR UPDATE;"));
    expect(sql).toContain(
      "OR strpos(pg_get_functiondef(v_guard), 'NOT EXISTS (SELECT 1 FROM core.run_waiting_v AS line WHERE line.run_id = NEW.old_run_id)') = 0");
    expect(sql).toContain("RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_SUPERSESSION_INVALID';");
    expect(sql).toContain("RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_SUPERSESSION_CHAIN_INVALID';");
    expect(sql).toContain("ALTER FUNCTION core.resolve_run_ref(uuid) OWNER TO debateai_release_owner;");
    // The API's role alone records and resolves (controller ruling 2026-10-22): the runner holds debateai_runtime only.
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.resolve_run_ref(uuid) TO debateai_billing_runtime;");
    expect(sql).toContain("GRANT SELECT, INSERT ON core.run_supersession TO debateai_billing_runtime;");
    expect(sql).not.toMatch(/GRANT [^;]*ON (FUNCTION core\.resolve_run_ref\(uuid\)|core\.run_supersession) TO debateai_runtime;/u);
    // A superseded run never starts: a new trigger on 0083's start table, no 0083 object redefined.
    expect(sql).toMatch(/CREATE TRIGGER refuse_starting_superseded_run BEFORE INSERT ON core\.run_wait_start\s+FOR EACH ROW EXECUTE FUNCTION core\.refuse_starting_superseded_run\(\);/u);
    expect(sql).toContain("RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_SUPERSEDED';");
    expect(sql).toContain("GRANT SELECT ON core.run_supersession TO debateai_release_owner;");
    // The view: 0083's, with one more clause, and 0083's grant re-asserted.
    const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW core.run_waiting_v AS"));
    const original = read("migrations/0083_budget_holds_waiting_line.sql");
    const before = original.slice(original.indexOf("CREATE OR REPLACE VIEW core.run_waiting_v AS"));
    expect(view.slice(0, view.indexOf(";"))).toBe(`${before.slice(0, before.indexOf(";"))}
  AND NOT EXISTS (SELECT 1 FROM core.run_supersession s WHERE s.old_run_id = wait.run_id)`);
    expect(view).toContain("GRANT SELECT ON core.run_waiting_v TO debateai_runtime;");
    // A-x1: the readmitted provision is the content role's alone, and the commit takes its marked intent.
    expect(sql).toContain("ALTER TABLE core.run_key_provision_intent ADD COLUMN IF NOT EXISTS readmitted_from_run_id uuid NULL;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.prepare_readmitted_run_key_provision(uuid,uuid) TO debateai_content_provision;");
    // A marked intent commits through the readmit lock ONLY; an unmarked one keeps 0040's lock (one CASE branch).
    expect(sql).toContain("WHERE marked.run_id=v_run_id AND marked.readmitted_from_run_id IS NOT NULL");
    expect(sql).toContain(") THEN core.lock_readmitted_run_key_provision_for_commit(");
    expect(sql).toContain(") ELSE core.lock_run_key_provision_for_commit(");
    // One live re-admission per old run: the durable marker on the binding and the pending-intent index.
    expect(sql).toContain("ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS readmitted_from_run_id uuid NULL;");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS run_key_provision_intent_one_readmission_idx");
    expect(sql).toContain("RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_READMISSION_TAKEN';");
    expect(sql).toContain("SIDE_BY_SIDE_READMISSION_CONTRACT_INCOMPLETE");
    // C11 review (controller ruling 2026-10-22): the re-admissions of a waiting run whose START never committed, next
    // to the readmitted provision it frees: a STABLE definer with the pinned path, reading the binding's marker, for the
    // API's role alone (the waker records each FAILED under the old run's owner lease).
    const unstartedAt = sql.indexOf("CREATE OR REPLACE FUNCTION core.list_unstarted_readmissions(p_old_run_id uuid)");
    expect(unstartedAt).toBeGreaterThan(sql.indexOf("CREATE OR REPLACE FUNCTION core.lock_readmitted_run_key_provision_for_commit("));
    expect(unstartedAt).toBeLessThan(sql.indexOf("-- §5. Two new wait reasons"));
    const unstarted = sql.slice(unstartedAt, sql.indexOf("$$;", unstartedAt));
    for (const line of ["RETURNS SETOF uuid", "STABLE", "SECURITY DEFINER", "SET search_path = pg_catalog",
      "WHERE marked.readmitted_from_run_id = p_old_run_id",
      "AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = marked.run_id)"]) {
      expect(unstarted).toContain(line);
    }
    expect(sql).toContain("REVOKE ALL ON FUNCTION core.list_unstarted_readmissions(uuid) FROM PUBLIC;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION core.list_unstarted_readmissions(uuid) TO debateai_billing_runtime;");
    expect(sql.match(/GRANT [^;]*core\.list_unstarted_readmissions[^;]*;/gu)).toEqual([
      "GRANT EXECUTE ON FUNCTION core.list_unstarted_readmissions(uuid) TO debateai_billing_runtime;"
    ]);
    // The loader digests the table whole and the six functions; the view and the CHECK are not digested.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const TABLES=['core.release_event','core.run_supersession',"); // §7 appends the waiver
    for (const signature of ["core.guard_run_supersession()", "core.resolve_run_ref(uuid)", "core.refuse_starting_superseded_run()",
      "core.prepare_readmitted_run_key_provision(uuid,uuid)", "core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
      "core.list_unstarted_readmissions(uuid)"]) {
      expect(loader).toContain(`'${signature}'`);
    }
    expect(loader).toContain("const VIEWS=['core.release_state_v'] as const;");
    expect(read("packages/db/src/index.ts")).toContain('"core.prepare_readmitted_run_key_provision(uuid,uuid)"');
    expect(read("packages/db/src/index.ts")).toContain("FROM core.list_unstarted_readmissions($1::uuid) AS listed(run_id)");
  });

  it("§5 widens the wait reasons with SITE_BUSY and SWITCHING, NOT VALID then validated", () => {
    expect(sql).toContain("AND strpos(pg_catalog.pg_get_constraintdef(check_constraint.oid), 'waits_for') > 0");
    expect(sql).toContain("AND strpos(pg_catalog.pg_get_constraintdef(check_constraint.oid), 'person_recheck_at') = 0");
    expect(sql).toContain("ADD CONSTRAINT run_wait_reason_waits_for_check CHECK (waits_for IN ('SITE','PERSON','SITE_BUSY','SWITCHING')) NOT VALID;");
    expect(sql).toContain("ALTER TABLE core.run_wait_reason VALIDATE CONSTRAINT run_wait_reason_waits_for_check;");
    expect(sql).toContain("SIDE_BY_SIDE_WAIT_REASON_CONTRACT_INCOMPLETE");
  });

  it("§6 redefines the five funding functions without the version comparisons and the self command naming a revoke's grant version, re-asserting owner and grants, and adds the reader at a version", () => {
    const body = (signature: string): string => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
      expect(start, signature).toBeGreaterThan(sql.indexOf("-- §6. Funding grants stay valid"));
      return sql.slice(start, sql.indexOf("END $$;", start));
    };
    expect(sql).toContain("-- Drained T, spec §9, C15:");
    const reserve = body("billing.reserve_internal_provider_call(");
    expect(reserve).not.toContain("register_version=(v_grant->>'policyRegisterVersion')");
    expect(reserve).toContain("IF v_grant IS NULL OR v_now>=(v_grant->>'expiresAt')::timestamptz OR v_now<(v_grant->>'startsAt')::timestamptz THEN");
    const state = body("billing.read_internal_run_state(");
    expect(state).toContain("IF NOT EXISTS(SELECT 1 FROM staff.funding_policy_selection f WHERE f.singleton) THEN RETURN 'UNAVAILABLE';END IF;");
    expect(state).toContain("FROM register.register_version v WHERE v.register_version=v_grant.policy_register_version;");
    expect(state).not.toContain("FROM core.run");
    expect(body("billing.read_internal_allowance(")).not.toContain("INTERNAL_FUNDING_POLICY_MISMATCH");
    expect(body("billing.read_internal_allowance(")).toContain("IF v_policy IS NULL THEN");
    expect(body("billing.guard_internal_charge_scope(")).not.toContain("policy_register_version");
    const revoke = body("staff.revoke_internal_allowance(");
    expect(revoke).not.toContain("(staff.read_internal_funding_policy())->'registerVersion'");
    expect(revoke).toContain("IF v_grant.policy_register_version IS DISTINCT FROM (p_command->>'policyRegisterVersion')::bigint THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;");
    // configure is not redefined: new grants take the selection's version.
    expect(sql).not.toContain("FUNCTION staff.configure_internal_allowance(");
    expect(body("staff.read_internal_funding_policy_at(")).not.toContain("funding_policy_selection");
    // The staff app's revoke names its grant's own version; a configure (no grant) still names the selection's.
    const self = body("staff.read_self_allowance_command(");
    expect(self).toContain("SELECT policy_register_version INTO v_version FROM billing.internal_grant WHERE grant_id=p_grant AND owner_ref=v_owner;");
    expect(self).toContain("v_version:=(v_policy->>'registerVersion')::bigint;");
    expect(self).toContain("'policyRegisterVersion',v_version);");
    for (const signature of ["billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)", "billing.read_internal_run_state(uuid)",
      "billing.read_internal_allowance(uuid,timestamptz)", "billing.guard_internal_charge_scope()",
      "staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)", "staff.read_internal_funding_policy_at(bigint)",
      "staff.read_self_allowance_command(jsonb,text,uuid)"]) {
      expect(sql).toContain(`ALTER FUNCTION ${signature} OWNER TO debateai_staff_security_owner;`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,debateai_runtime,debateai_staff_recovery;`);
      if (signature !== "billing.guard_internal_charge_scope()") expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`);
    }
    expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION billing.guard_internal_charge_scope()");
    // No billing function is added: every billing function §6 and §7 name already exists in 0092/0093.
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION billing\.(?!reserve_internal_provider_call\(|read_internal_run_state\(|read_internal_allowance\(|guard_internal_charge_scope\(|read_internal_grant_spent\()/u);
    expect(sql).toContain("SIDE_BY_SIDE_FUNDING_CONTRACT_INCOMPLETE");
    // The loader digests the new reader; the six redefinitions are checked by the closing block and the tests.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("'staff.read_internal_funding_policy_at(bigint)'");
    expect(loader).not.toContain("'billing.read_internal_allowance(uuid,timestamptz)'");
  });

  it("§7 adds the append-only spend waiver and redefines the funded spend reader to leave waived runs out, site-day readers untouched", () => {
    const section = sql.slice(sql.indexOf("-- §7. The spend waiver"), sql.indexOf("-- THE CONTRACT THIS FILE CLAIMS"));
    expect(section).toContain("CREATE TABLE IF NOT EXISTS ledger.model_spend_waiver (");
    expect(section).toContain("run_id uuid PRIMARY KEY REFERENCES core.run(run_id),");
    expect(section).toContain("recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),");
    expect(section).toContain("CONSTRAINT model_spend_waiver_reason_closed CHECK (\n    reason IN ('BACKSTOP', 'OWNER_STOPPED', 'SETTINGS_VERSION_UNSUPPORTED', 'RELEASE_NOT_SERVED'))");
    expect(section).toContain("SELECT core.install_truncate_guard('ledger.model_spend_waiver');");
    expect(section).toMatch(/CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger\.model_spend_waiver\s+FOR EACH STATEMENT EXECUTE FUNCTION core\.reject_mutation\(\);/u);
    expect(section).toContain("GRANT SELECT, INSERT ON ledger.model_spend_waiver TO debateai_runtime;");
    expect(section).toContain("GRANT SELECT ON ledger.model_spend_waiver TO debateai_staff_security_owner;");
    expect(section).toContain("GRANT SELECT ON ledger.model_spend_waiver TO debateai_replay;");
    // The reasons are the TS list, verbatim (the runner lane's battery reuses SpendWaiverReason).
    expect(read("packages/db/src/spend-waiver.ts")).toContain('["BACKSTOP", "OWNER_STOPPED", "SETTINGS_VERSION_UNSUPPORTED", "RELEASE_NOT_SERVED"] as const');
    expect(read("packages/db/src/index.ts")).toContain('export { SPEND_WAIVER_REASONS, recordSpendWaiver, type SpendWaiverReason } from "./spend-waiver.js";');
    // The funded reader: 0093's body byte for byte plus one clause, its owner, definer, path and grants re-asserted.
    const original = read("migrations/0093_internal_provider_admission.sql");
    const head = "CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(";
    const before = original.slice(original.indexOf(head), original.indexOf("$$;", original.indexOf(head)));
    const after = section.slice(section.indexOf(head), section.indexOf("$$;", section.indexOf(head)));
    expect(after).toBe(`${before} AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)\n`);
    const signature = "billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)";
    expect(section).toContain(`ALTER FUNCTION ${signature} OWNER TO debateai_staff_security_owner;`);
    expect(section).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,debateai_runtime,debateai_staff_recovery;`);
    expect(section).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`);
    // The commitments reader and every site-day reader stay as they were.
    expect(sql).not.toContain("FUNCTION billing.read_internal_grant_commitments(");
    expect(sql).toContain("SIDE_BY_SIDE_SPEND_WAIVER_CONTRACT_INCOMPLETE");
    const store = read("packages/budget/src/model-spend.ts");
    const owner = store.slice(store.indexOf("async readOwnerSpentMicros("), store.indexOf("async readOwnerCountedHoldsMicros("));
    expect(owner).toContain("AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = spend.run_id)");
    expect(store.split("model_spend_waiver")).toHaveLength(2); // the subscription reader alone: no site-day reader names it
    // The loader digests the table whole; the redefinition is checked by the closing block and these tests.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const TABLES=['core.release_event','core.run_supersession','ledger.model_spend_waiver'] as const;");
    expect(loader).not.toContain(`'${signature}'`);
  });

  it("§8 redefines the per-debate private erasure on the debate's re-admission chain, with 0099's clamp, owner and grants kept, and adds the chain reader", () => {
    const section = sql.slice(sql.indexOf("-- §8. Deleting a debate erases every run of it"), sql.indexOf("-- THE CONTRACT THIS FILE CLAIMS"));
    expect(section.length).toBeGreaterThan(0);
    const body = (head: string): string => {
      const start = section.indexOf(`CREATE OR REPLACE FUNCTION ${head}`);
      expect(start, head).toBeGreaterThanOrEqual(0);
      return section.slice(start, section.indexOf("$$;", start));
    };
    // The chain reader: up through the run each one re-admits, then down through every run whose re-admission marker
    // names a run found, 17 links each way at most; a link only between two encrypted runs of one account, never a bare
    // supersession edge; ids only, no role.
    const chain = body("core.private_erasure_run_chain(p_run_id uuid)");
    for (const line of ["RETURNS uuid[]", "STABLE", "SECURITY DEFINER", "SET search_path = pg_catalog",
      "WHERE child.run_id = v_root;",
      "WHERE child.readmitted_from_run_id = ANY(v_generation) AND child.run_id <> ALL(v_chain)"]) expect(chain).toContain(line);
    for (const link of [
      "JOIN core.run AS child_run ON child_run.run_id = child.run_id AND child_run.content_encryption_version = 1",
      "ON parent.run_id = child.readmitted_from_run_id AND parent.user_id = child.user_id",
      "JOIN core.run AS parent_run ON parent_run.run_id = parent.run_id AND parent_run.content_encryption_version = 1"
    ]) expect(chain.split(link), link).toHaveLength(3);
    expect(chain).not.toContain("core.run_supersession");
    expect(chain.split("IF v_hops > 17 THEN")).toHaveLength(3);
    expect(chain.split("MESSAGE = 'RUN_SUPERSESSION_CHAIN_INVALID'")).toHaveLength(3);
    expect(section).not.toMatch(/GRANT [^;]*core\.private_erasure_run_chain/u);
    expect(section).toMatch(/REVOKE ALL ON FUNCTION core\.private_erasure_run_chain\(uuid\)\s+FROM PUBLIC,debateai_runtime,[^;]*debateai_erasure_runtime,[^;]*;/u);
    // The three erasure functions: the grant bound to any run of the chain, never to the run named alone.
    const prepare = body("core.prepare_private_run_erasure(");
    const resume = body("core.resume_private_run_erasure(");
    const finalize = body("core.finalize_private_run_erasure(");
    for (const [name, text] of [["prepare", prepare], ["resume", resume], ["finalize", finalize]] as const) {
      expect(text, name).toContain("SECURITY DEFINER");
      expect(text, name).toContain("SET search_path = pg_catalog");
      expect(text, name).toContain("core.private_erasure_run_chain(");
      expect(text, name).toContain("step_grant.target_run_id=ANY(v_chain)");
      expect(text, name).not.toContain("step_grant.target_run_id=p_run_id");
      expect(text, name).not.toContain("step_grant.target_run_id=v_run_id");
    }
    // 0099's session clamp as applied (two each in prepare and resume), never the unclamped expiry.
    const clamp = "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())";
    expect(prepare.split(clamp)).toHaveLength(3);
    expect(resume.split(clamp)).toHaveLength(3);
    for (const text of [prepare, resume, finalize]) expect(text).not.toContain("AND session.absolute_expires_at>");
    // Prepare: the chain read again under the supersession guard's lock, after the account lock; the other runs owned
    // first and last by the person, locked, their content leases tried; the grant consumed once; legacy judged on the run
    // named alone (0085's check: only it can be plaintext), published and erased over the person's runs; publication
    // copies checked before any run is marked; the first id returned.
    const supersessionLock = "IF NOT pg_try_advisory_xact_lock(hashtextextended('debateai:run-supersession',0)) THEN";
    expect(prepare.indexOf(supersessionLock)).toBeGreaterThan(prepare.indexOf("SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);"));
    expect(prepare.indexOf("v_chain := core.private_erasure_run_chain(p_run_id);", prepare.indexOf(supersessionLock)))
      .toBeGreaterThan(prepare.indexOf(supersessionLock));
    expect(prepare).toContain("PERFORM 1 FROM core.run AS run WHERE run.run_id=ANY(v_members) ORDER BY run.run_id FOR UPDATE NOWAIT;");
    expect(prepare).toContain("IF NOT pg_try_advisory_xact_lock(hashtextextended('debateai:run-content-lease:v1:'||v_member::text,0)) THEN");
    expect(prepare.split("UPDATE identity.step_up_grant SET consumed_at=v_now")).toHaveLength(2);
    expect(prepare.indexOf("RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN;\n      END IF;\n    END LOOP;"))
      .toBeLessThan(prepare.indexOf("UPDATE identity.step_up_grant SET consumed_at=v_now"));
    expect(prepare).toContain("IF v_content_encryption_version IS DISTINCT FROM 1 THEN\n      RETURN QUERY SELECT 'LEGACY_PLAINTEXT_RETAINED'::text,NULL::uuid; RETURN;");
    expect(prepare).not.toContain("run.content_encryption_version IS DISTINCT FROM 1");
    expect(prepare).toContain("WHERE snapshot.run_id=ANY(v_pending) AND cleanup.publication_ref IS NULL");
    expect(prepare.indexOf("WHERE snapshot.run_id=ANY(v_pending) AND cleanup.publication_ref IS NULL"))
      .toBeLessThan(prepare.indexOf("FOREACH v_member IN ARRAY v_pending LOOP"));
    expect(prepare).toContain("RETURN QUERY SELECT 'PREPARED'::text,v_first_request_ref;");
    // Resume: the oldest still-pending binding of this grant in the chain, its own run locked and owned.
    expect(resume).toContain("ORDER BY binding.created_at,binding.request_ref");
    expect(resume).toContain("WHERE run.run_id=v_run_id\n  FOR UPDATE NOWAIT;");
    // Owner and grants re-asserted as 0040 left them: EXECUTE for the erasure runtime alone.
    for (const signature of ["core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)", "core.resume_private_run_erasure(uuid,uuid,uuid,uuid,text)",
      "core.finalize_private_run_erasure(uuid,timestamptz,timestamptz,integer,integer)"]) {
      expect(section).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")}\\s+FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,\\s+debateai_publication_cleanup,debateai_content_provision;`, "u"));
      expect(section).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO debateai_erasure_runtime;`);
      expect(section).not.toContain(`ALTER FUNCTION ${signature} OWNER`);
    }
    expect(sql).toContain("SIDE_BY_SIDE_ERASURE_CHAIN_CONTRACT_INCOMPLETE");
    // The closing block checks the reader's links too: the marker between one account's runs, both encrypted, and no
    // bare supersession edge.
    const closing = sql.slice(sql.indexOf("-- THE CONTRACT THIS FILE CLAIMS"));
    for (const check of [
      "strpos(pg_get_functiondef(p.oid), 'ON parent.run_id = child.readmitted_from_run_id AND parent.user_id = child.user_id') > 0",
      "strpos(pg_get_functiondef(p.oid), 'child_run.content_encryption_version = 1') > 0",
      "strpos(pg_get_functiondef(p.oid), 'parent_run.content_encryption_version = 1') > 0",
      "strpos(pg_get_functiondef(p.oid), 'core.run_supersession') = 0"
    ]) expect(closing).toContain(check);
    // The loader digests the new reader; the three redefinitions are checked by the closing block and these tests.
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("'core.private_erasure_run_chain(uuid)'");
    expect(loader).not.toContain("'core.prepare_private_run_erasure(");
    // The coordinator completes every marked run, asking resume for the next until none is left.
    const coordinator = read("packages/db/src/account-erasure.ts");
    expect(coordinator).toContain("const next = await this.repository.resume(input);");
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
      "the engine's map answer step (0122, below) the twelfth, the side-by-side releases (0123, below) the thirteenth");
  });

  it("is the plan's step after 0122 and before 0124 (the settings activation), with no supplemental verifier", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-4)?.name).toBe("0123_side_by_side_releases.sql");
    expect(plan.forwardChain.at(-5)?.name).toBe("0122_engine_map_check.sql");
    expect(plan.forwardChain.at(-3)?.name).toBe("0124_settings_activation.sql");
    expect(plan.forwardChain.at(-2)?.name).toBe("0125_italy_specific_approval.sql");
    expect(plan.forwardChain.at(-1)?.name).toBe("0126_row_level_security.sql");
    expect(plan.forwardChain.at(-4)?.replayVerifierSql).toBeUndefined();
    expect(plan.forwardChain.at(-4)?.verifierPath).toBe("lineage/verify-effective-capabilities-111.sql");
  });
});
