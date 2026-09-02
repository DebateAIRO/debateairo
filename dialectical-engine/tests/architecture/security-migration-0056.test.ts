import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import type { PoolClient } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// B22 of the 2026-09-01 security-hardening mission pins
// migrations/0056_security_truncate_definer_searchpath.sql on real PostgreSQL:
//   L5-F4  statement-level BEFORE TRUNCATE guard on the 78 append-only relations
//          that had only the row-level core.reject_mutation() UPDATE/DELETE guard;
//   L5-F1  PUBLIC EXECUTE closed on every function L5 listed (the 27 definer
//          wrappers are dropped by 0040:3286-3312, so they must stay absent; the
//          5 invoker-rights functions carry explicit, caller-exact grants);
//   L5-F10 search_path pinned on the 14 invoker-rights trigger/validator functions.

// L5-data-layer.md "TRUNCATE-guard coverage": the 78 rows marked **no**, verbatim.
const TRUNCATE_GUARDED_RELATIONS = [
  "core.run",
  "core.run_progress_event",
  "core.run_row_activation",
  "core.run_row_activation_event",
  "core.node",
  "core.stranger_restatement",
  "ledger.raw_artifact",
  "ledger.ledger_entry",
  "ledger.reduced_judgement",
  "ledger.propagation_run",
  "ledger.node_strength_record",
  "serve.fact_bundle",
  "serve.composed_text",
  "serve.conformance_record",
  "serve.served_number",
  "serve.served_number_event",
  "serve.answer",
  "register.register_row",
  "register.register_version",
  "core.edge",
  "ledger.sensitivity_record",
  "serve.segment_suppression",
  "serve.condition_mark",
  "serve.condition_mark_node",
  "serve.shadow_suppression",
  "serve.abstention",
  "evidence.query_set",
  "evidence.query_amendment",
  "evidence.source_record",
  "evidence.evidence_item",
  "evidence.absence_row",
  "evidence.probe_capture",
  "evidence.instrument_certification",
  "evidence.citation_route_record",
  "ledger.decision_record",
  "core.verification_trigger_basis",
  "core.critique_packet",
  "core.independence_receipt",
  "core.symmetry_diff",
  "core.objection_record",
  "core.value_hinge",
  "core.reversal_point",
  "ledger.overlay_run",
  "core.revision_trigger",
  "core.review_clock",
  "core.staleness_state",
  "core.question_liveness_event",
  "scorecard.model_identity",
  "scorecard.answer_outcome",
  "scorecard.scorecard_cell",
  "scorecard.routing_decision",
  "scorecard.session_assignment",
  "memory.question_key",
  "memory.memory_link",
  "memory.memory_link_event",
  "memory.alias_row",
  "memory.alias_revocation",
  "memory.pull_record",
  "memory.candidate_record",
  "core.investigation_request",
  "ledger.node_review",
  "core.provider_probe",
  "evaluator.domain",
  "evaluator.domain_admission",
  "evaluator.question_domain",
  "evaluator.pipeline_event",
  "evaluator.observation",
  "evaluator.profile_cell",
  "evaluator.rank_snapshot",
  "evaluator.model_call_usage",
  "evaluator.relative_cost_cell",
  "evaluator.shadow_decision",
  "evaluator.vllm_probe",
  "evaluator.vllm_catalog_model",
  "evaluator.consumer_selection",
  "evaluator.consumer_output",
  "evaluator.consumer_refresh_receipt",
  "identity.audit_event"
] as const;

// 0040:3091-3278 defines these SECURITY DEFINER wrappers and 0040:3286-3312
// drops them again in the same migration (present since its first commit
// 970870f3). L5-F1 counted them as live; a migrated database never has them.
const DROPPED_DEFINER_WRAPPERS = [
  "identity.audit_registration_allowed(uuid,uuid,jsonb)",
  "identity.audit_registration_unavailable(uuid,jsonb)",
  "identity.audit_verification_sent(uuid,uuid,jsonb)",
  "identity.audit_verification_delivery_failed(uuid,uuid,jsonb,text)",
  "identity.audit_verification_consumed(uuid,uuid,jsonb)",
  "identity.audit_verification_consumed_denied(uuid,jsonb)",
  "identity.audit_verification_resend(uuid,uuid,jsonb)",
  "identity.audit_verification_resend_denied(uuid,jsonb,text)",
  "identity.audit_mfa_totp_begin(uuid,uuid,jsonb)",
  "identity.audit_mfa_totp_begin_denied(uuid,jsonb,text)",
  "identity.audit_mfa_totp_verified(uuid,uuid,jsonb)",
  "identity.audit_mfa_totp_verified_denied(uuid,jsonb,text)",
  "identity.audit_mfa_verification_failed(uuid,jsonb,text)",
  "identity.audit_mfa_recovery_codes_generated(uuid,uuid,jsonb)",
  "identity.audit_mfa_recovery_codes_denied(uuid,jsonb)",
  "identity.audit_mfa_enrollment_activated(uuid,uuid,jsonb)",
  "identity.audit_mfa_enrollment_denied(uuid,jsonb)",
  "identity.audit_mfa_recovery_consumed(uuid,uuid,jsonb)",
  "identity.audit_mfa_recovery_denied(uuid,jsonb)",
  "identity.audit_login_password_verified(uuid,uuid,jsonb)",
  "identity.audit_login_password_denied(uuid,jsonb)",
  "identity.audit_session_created(uuid,uuid,jsonb,text)",
  "identity.audit_session_revoked(uuid,uuid,jsonb)",
  "identity.audit_session_revoked_denied(uuid,jsonb)",
  "identity.audit_session_step_up(uuid,uuid,jsonb)",
  "identity.audit_sessions_revoked_all(uuid,uuid,jsonb,integer)",
  "identity.audit_sessions_revoked_all_denied(uuid,jsonb)"
] as const;

// Exact EXECUTE grant map after 0056. A role listed here (or a role that
// inherits from it, e.g. debateai_authorization_runtime -> debateai_runtime)
// can execute; every other debateai role cannot; PUBLIC never can.
const EXECUTE_GRANTS: Readonly<Record<string, readonly string[]>> = {
  // callers: packages/db/src/index.ts:773 (every runtime append), packages/liveness/src/index.ts:375,
  // settlement (0015:148) and evaluator (0023:445,458) writers.
  "ledger.allocate_sequence()": [
    "debateai_runtime", "debateai_settlement_watch", "debateai_evaluator_worker", "debateai_evaluator_api"
  ],
  // CHECK on register.register_row (0006:90-95): PostgreSQL privilege-checks a CHECK
  // function at executor init for any INSERT by the executing role, so the one app
  // role holding INSERT there (debateai_runtime, 0000:301) keeps EXECUTE — mirrors
  // 0040:6285 for serve.conformance_segment_results_are_valid. The only current
  // INSERT path (persistBootstrapRegister via the dev register CLI) runs as the owner.
  "register.claim_type_composition_map_is_valid(jsonb)": ["debateai_runtime"],
  // trigger functions: fired by the trigger machinery, no application caller.
  "evidence.validate_instrument_certification()": [],
  "evidence.validate_citation_route_record()": [],
  "ledger.reject_same_maker_node_review()": [],
  // new in 0056: migration-owner tooling only.
  "core.reject_truncate()": [],
  "core.install_truncate_guard(regclass)": []
};

const SEARCH_PATH_PINNED_FUNCTIONS = [
  "evidence.validate_citation_route_record()",
  "evidence.validate_instrument_certification()",
  "ledger.allocate_sequence()",
  "ledger.reject_same_maker_node_review()",
  "register.claim_type_composition_map_is_valid(jsonb)",
  "core.enforce_node_structure()",
  "core.reject_mutation()",
  "core.reject_terminal_with_wait()",
  "core.run_is_owned_by(uuid,uuid,text)",
  "evaluator.reject_same_maker_addon()",
  "evaluator.validate_observation_supersession()",
  "identity.reject_owner_ref_rotation()",
  "identity.reject_pseudonym_rotation()",
  "serve.conformance_segment_results_are_valid(jsonb)"
] as const;
const PINNED_SEARCH_PATH = "search_path=pg_catalog, pg_temp";

let database: TestDatabase;

function sqlState(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failureOf(client: PoolClient, sql: string, values?: readonly unknown[]): Promise<unknown> {
  await client.query("SAVEPOINT expected_failure");
  try {
    await client.query(sql, values === undefined ? undefined : [...values]);
    return undefined;
  } catch (error) {
    return error;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
  }
}

async function withRolledBackTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    return await operation(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function truncateGuardDefinitions(client: PoolClient, relation: string): Promise<string[]> {
  const result = await client.query<{ definition: string }>(`
    SELECT pg_catalog.pg_get_triggerdef(trigger.oid) AS definition
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid=$1::regclass AND trigger.tgname='reject_truncate' AND NOT trigger.tgisinternal
  `, [relation]);
  return result.rows.map((row) => row.definition);
}

async function executeMap(signature: string, granted: readonly string[]): Promise<{
  publicCanExecute: boolean;
  roles: readonly { role: string; canExecute: boolean; expected: boolean }[];
}> {
  const publicResult = await database.pool.query<{ can_execute: boolean }>(
    "SELECT has_function_privilege('public',$1,'EXECUTE') AS can_execute", [signature]
  );
  const roles = await database.pool.query<{ role: string; can_execute: boolean; expected: boolean }>(`
    SELECT role.rolname AS role,
      has_function_privilege(role.rolname,$1,'EXECUTE') AS can_execute,
      EXISTS (
        SELECT 1 FROM unnest($2::text[]) AS granted(rolname)
        WHERE pg_has_role(role.rolname,granted.rolname,'USAGE')
      ) AS expected
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname LIKE 'debateai%' AND NOT role.rolsuper
    ORDER BY role.rolname
  `, [signature, [...granted]]);
  return {
    publicCanExecute: publicResult.rows[0]!.can_execute,
    roles: roles.rows.map((row) => ({ role: row.role, canExecute: row.can_execute, expected: row.expected }))
  };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("0056 TRUNCATE guard on real PostgreSQL (L5-F4)", () => {
  it.each(TRUNCATE_GUARDED_RELATIONS)("%s refuses TRUNCATE from the database owner", async (relation) => {
    await withRolledBackTransaction(async (client) => {
      expect(await truncateGuardDefinitions(client, relation)).toEqual([
        `CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON ${relation} FOR EACH STATEMENT EXECUTE FUNCTION core.reject_truncate()`
      ]);
      // CASCADE: a relation referenced by foreign keys is otherwise refused by the
      // FK check before any trigger fires; the target's own BEFORE TRUNCATE
      // statement trigger runs first and must be the one that refuses.
      const failure = await failureOf(client, `TRUNCATE ${relation} CASCADE`);
      expect(failure, `${relation} accepted TRUNCATE`).toBeDefined();
      expect(sqlState(failure)).toBe("55000");
      expect(messageOf(failure)).toContain("TRUNCATE_REJECTED");
      expect(messageOf(failure)).toContain(`table ${relation} rejects TRUNCATE`);
    });
  });

  it("core.install_truncate_guard is idempotent, reusable on a new relation, and refuses a conflicting trigger", async () => {
    await withRolledBackTransaction(async (client) => {
      await client.query("SELECT core.install_truncate_guard('core.run')");
      await client.query("SELECT core.install_truncate_guard('core.run'::regclass)");
      expect(await truncateGuardDefinitions(client, "core.run")).toHaveLength(1);

      // The pre-0056 guards (0034/0037/0039/0040/0041/0044, core.reject_mutation()) are
      // recognised and left untouched, so the mission can call it on every relation.
      const [obsGuard] = await truncateGuardDefinitions(client, "obs.occurrence");
      await client.query("SELECT core.install_truncate_guard('obs.occurrence')");
      expect(await truncateGuardDefinitions(client, "obs.occurrence")).toEqual([obsGuard]);
      expect(obsGuard).toContain("EXECUTE FUNCTION core.reject_mutation()");

      await client.query("CREATE TABLE core.b22_scratch (id integer)");
      await client.query("SELECT core.install_truncate_guard('core.b22_scratch')");
      await client.query("SELECT core.install_truncate_guard('core.b22_scratch')");
      expect(await truncateGuardDefinitions(client, "core.b22_scratch")).toHaveLength(1);
      const scratchFailure = await failureOf(client, "TRUNCATE core.b22_scratch");
      expect(sqlState(scratchFailure)).toBe("55000");
      expect(messageOf(scratchFailure)).toContain("TRUNCATE_REJECTED");

      await client.query("CREATE TABLE core.b22_conflict (id integer)");
      await client.query(
        "CREATE TRIGGER reject_truncate AFTER TRUNCATE ON core.b22_conflict FOR EACH STATEMENT EXECUTE FUNCTION core.reject_truncate()"
      );
      const conflict = await failureOf(client, "SELECT core.install_truncate_guard('core.b22_conflict')");
      expect(sqlState(conflict)).toBe("55000");
      expect(messageOf(conflict)).toContain("TRUNCATE_GUARD_CONFLICT");

      await client.query("ALTER TABLE core.b22_scratch DISABLE TRIGGER reject_truncate");
      const disabled = await failureOf(client, "SELECT core.install_truncate_guard('core.b22_scratch')");
      expect(sqlState(disabled)).toBe("55000");
      expect(messageOf(disabled)).toContain("TRUNCATE_GUARD_CONFLICT");
    });
  });
});

describe("0056 EXECUTE privileges (L5-F1)", () => {
  it("keeps the 27 transitional SECURITY DEFINER audit wrappers absent", async () => {
    const result = await database.pool.query<{ signature: string }>(`
      SELECT signature FROM unnest($1::text[]) AS candidate(signature)
      WHERE to_regprocedure(signature) IS NOT NULL
    `, [[...DROPPED_DEFINER_WRAPPERS]]);
    expect(result.rows.map((row) => row.signature)).toEqual([]);
  });

  it.each(Object.entries(EXECUTE_GRANTS))("%s is executable by exactly %j", async (signature, granted) => {
    const map = await executeMap(signature, granted);
    expect(map.publicCanExecute).toBe(false);
    expect(map.roles.length).toBeGreaterThan(10);
    for (const row of map.roles) {
      expect(row.canExecute, `${row.role} on ${signature}`).toBe(row.expected);
    }
  });
});

describe("0056 search_path pins (L5-F10)", () => {
  it("pins search_path on the 14 invoker-rights trigger and validator functions", async () => {
    const result = await database.pool.query<{ signature: string; proconfig: string[] | null; prosecdef: boolean | null }>(`
      SELECT candidate.signature, proc.proconfig, proc.prosecdef
      FROM unnest($1::text[]) AS candidate(signature)
      LEFT JOIN pg_catalog.pg_proc AS proc ON proc.oid=to_regprocedure(candidate.signature)
      ORDER BY candidate.signature
    `, [[...SEARCH_PATH_PINNED_FUNCTIONS]]);
    expect(result.rows).toHaveLength(SEARCH_PATH_PINNED_FUNCTIONS.length);
    for (const row of result.rows) {
      expect(row.prosecdef, `${row.signature} exists as invoker-rights`).toBe(false);
      expect(row.proconfig ?? [], row.signature).toContain(PINNED_SEARCH_PATH);
    }
  });

  it("pinned functions still execute: node structure trigger fires for debateai_runtime without EXECUTE, validators resolve", async () => {
    await withRolledBackTransaction(async (client) => {
      const run = await client.query<{ run_id: string }>(`
        INSERT INTO core.run (
          question_line, asker_id, session_id, caller_scope, as_of,
          asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
          composition_budget_tier, depth_params, agent_count, discovered_panel,
          stranger_sample_rate, envelope_basis, register_version,
          battery_version, created_at_seq
        ) VALUES (
          'b22 smoke', 'asker:b22', 'session:b22', 'ASKER', '2026-09-01T00:00:00.000Z',
          'casual', 'casual', 'ASKER', 'asker-declaration:b22',
          'low', '{}', 1,
          '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
          1, '{}', 1, 's02', ledger.allocate_sequence()
        ) RETURNING run_id
      `);
      const runId = run.rows[0]!.run_id;
      expect((await client.query<{ owned: boolean }>(
        "SELECT core.run_is_owned_by($1,NULL,'asker:b22') AS owned", [runId]
      )).rows[0]!.owned).toBe(true);

      await client.query("SET LOCAL ROLE debateai_runtime");
      expect((await client.query<{ can_execute: boolean }>(
        "SELECT has_function_privilege('debateai_runtime','core.enforce_node_structure()','EXECUTE') AS can_execute"
      )).rows[0]!.can_execute).toBe(false);
      const composition = await client.query<{ rejected: boolean; accepted: boolean }>(`
        SELECT register.claim_type_composition_map_is_valid('[]'::jsonb) AS rejected,
          register.claim_type_composition_map_is_valid(
            '{"kind":"CLAIM_TYPE_COMPOSITION_MAP","entries":{}}'::jsonb
          ) AS accepted
      `);
      expect(composition.rows[0]).toEqual({ rejected: false, accepted: true });
      const insertNode = `
        INSERT INTO core.node (
          run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
          materialized_path, generation_status, path_status, exploration_decision,
          way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
        ) VALUES ($1,$2,'unknown',$3,$4,$5,$6,$7,'complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
        RETURNING node_id
      `;
      const root = await client.query<{ node_id: string }>(insertNode, [runId, "root", null, null, 0, 0, "0"]);
      const rootId = root.rows[0]!.node_id;
      const inconsistentChild = await failureOf(client, insertNode, [runId, "child", rootId, "support", 5, 1, "0/1"]);
      expect(sqlState(inconsistentChild)).toBe("23514");
      expect(messageOf(inconsistentChild)).toContain("inconsistent with its parent");
      await client.query(insertNode, [runId, "child", rootId, "support", 1, 1, "0/1"]);
      expect((await client.query<{ sequence: string }>("SELECT ledger.allocate_sequence()::text AS sequence")).rows[0]!.sequence)
        .toMatch(/^[0-9]+$/u);
      expect((await client.query<{ valid: boolean }>(
        "SELECT serve.conformance_segment_results_are_valid('[]'::jsonb) AS valid"
      )).rows[0]!.valid).toBe(true);
    });
  });
});
