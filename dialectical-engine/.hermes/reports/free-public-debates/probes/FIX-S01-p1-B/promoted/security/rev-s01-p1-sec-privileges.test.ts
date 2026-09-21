// TEMPORARY REVIEW FIXTURE — REV-S01-p1-security-data-safety. Deleted before handoff.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const NEW_FUNCTIONS = [
  "core.run_is_free_public_bound(uuid)",
  "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)",
  "serve.prepare_system_publication_key_provision(uuid,uuid,uuid,uuid)",
  "serve.abandon_system_publication_key_provision(uuid,uuid)",
  "serve.claim_system_publication_key_provision_cleanup(integer)",
  "serve.complete_system_publication_key_provision_cleanup(uuid,uuid)",
  "identity.audit_system_publication_attempt(uuid,uuid,text,timestamptz,text)",
  "core.transition_system_run_publication(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz,uuid,uuid)",
  "core.upsert_free_public_auto_publish_work(uuid,uuid,uuid,text)",
  "core.clear_free_public_auto_publish_work(uuid)",
  "core.claim_free_public_auto_publish_work(integer)",
  "core.enforce_publication_v2_ref_binding()",
  "core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)"
] as const;

const TABLES = [
  "core.run_visibility_event",
  "identity.audit_event",
  "serve.publication_key_cleanup_intent",
  "serve.system_publication_key_provision_intent",
  "core.free_public_auto_publish_work",
  "serve.publication_snapshot",
  "core.run",
  "identity.publication_event_binding"
] as const;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE rev_s01_nobody NOLOGIN NOINHERIT");
  await database.pool.query("GRANT USAGE ON SCHEMA core,serve,identity TO rev_s01_nobody");
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

describe("REV-S01-p1 security: privilege surface of 0066-0068", () => {
  it("prints the product roles present after migrate", async () => {
    const roles = await database.pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname LIKE 'debateai%' ORDER BY rolname"
    );
    console.log("ROLES:", JSON.stringify(roles.rows.map((r) => r.rolname)));
    expect(roles.rows.length).toBeGreaterThan(0);
  });

  it("prints EXECUTE privilege for every function the slice creates or replaces", async () => {
    const roles = (await database.pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname LIKE 'debateai%' ORDER BY rolname"
    )).rows.map((r) => r.rolname).concat(["public", "rev_s01_nobody"]);
    const table: Record<string, Record<string, boolean | string>> = {};
    for (const fn of NEW_FUNCTIONS) {
      table[fn] = {};
      for (const role of roles) {
        const result = await database.pool.query<{ allowed: boolean | null }>(
          "SELECT has_function_privilege($1,$2,'execute') AS allowed",
          [role, fn]
        );
        table[fn][role] = result.rows[0]?.allowed ?? "NULL";
      }
    }
    console.log("EXECUTE_MATRIX:\n" + JSON.stringify(table, null, 1));
    expect(Object.keys(table).length).toBe(NEW_FUNCTIONS.length);
  });

  it("prints prosecdef and proconfig (search_path) for every function the slice creates", async () => {
    const rows = await database.pool.query<{
      sig: string; prosecdef: boolean; proconfig: string[] | null;
    }>(
      `SELECT p.oid::regprocedure::text AS sig, p.prosecdef, p.proconfig
         FROM pg_proc p
        WHERE p.oid::regprocedure::text = ANY($1::text[])
        ORDER BY sig`,
      [NEW_FUNCTIONS.map((f) => f.replace(/\(/, "(")).map((f) => f)]
    );
    // regprocedure text normalises; fall back to a name-based lookup for anything missed.
    const byName = await database.pool.query<{
      sig: string; prosecdef: boolean; proconfig: string[] | null;
    }>(
      `SELECT p.oid::regprocedure::text AS sig, p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.proname IN (
          'run_is_free_public_bound','create_encrypted_run',
          'prepare_system_publication_key_provision','abandon_system_publication_key_provision',
          'claim_system_publication_key_provision_cleanup',
          'complete_system_publication_key_provision_cleanup',
          'audit_system_publication_attempt','transition_system_run_publication',
          'upsert_free_public_auto_publish_work','clear_free_public_auto_publish_work',
          'claim_free_public_auto_publish_work','enforce_publication_v2_ref_binding',
          'prepare_private_run_erasure'
        ) AND n.nspname IN ('core','serve','identity')
        ORDER BY sig`
    );
    console.log("SECDEF_SEARCHPATH:\n" + JSON.stringify(byName.rows, null, 1));
    console.log("REGPROC_ROWS:", rows.rows.length);
    const unpinned = byName.rows.filter(
      (r) => r.prosecdef && (r.proconfig ?? []).every((c) => !c.startsWith("search_path="))
    );
    console.log("SECDEF_WITHOUT_PINNED_SEARCH_PATH:", JSON.stringify(unpinned));
    expect(byName.rows.length).toBeGreaterThan(0);
  });

  it("prints table privileges on every table the two trigger admissions read or write", async () => {
    const roles = (await database.pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname LIKE 'debateai%' ORDER BY rolname"
    )).rows.map((r) => r.rolname).concat(["public", "rev_s01_nobody"]);
    const table: Record<string, Record<string, string>> = {};
    for (const rel of TABLES) {
      table[rel] = {};
      for (const role of roles) {
        const result = await database.pool.query<{
          s: boolean; i: boolean; u: boolean; d: boolean;
        }>(
          `SELECT has_table_privilege($1,$2,'select') AS s,
                  has_table_privilege($1,$2,'insert') AS i,
                  has_table_privilege($1,$2,'update') AS u,
                  has_table_privilege($1,$2,'delete') AS d`,
          [role, rel]
        );
        const r = result.rows[0];
        const grants = [r?.s ? "S" : "", r?.i ? "I" : "", r?.u ? "U" : "", r?.d ? "D" : ""]
          .join("");
        table[rel][role] = grants === "" ? "-" : grants;
      }
    }
    console.log("TABLE_MATRIX:\n" + JSON.stringify(table, null, 1));
    expect(Object.keys(table).length).toBe(TABLES.length);
  });

  it("prints who may execute the two trigger admissions' precondition writers", async () => {
    const rows = await database.pool.query(
      `SELECT p.oid::regprocedure::text AS sig,
              has_function_privilege('debateai_runtime',p.oid,'execute') AS runtime,
              has_function_privilege('debateai_erasure_runtime',p.oid,'execute') AS erasure,
              has_function_privilege('public',p.oid,'execute') AS pub
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.proname LIKE '%publication_key_cleanup%'
           OR p.proname LIKE '%private_run_erasure%'
        ORDER BY sig`
    );
    console.log("CLEANUP_INTENT_WRITERS:\n" + JSON.stringify(rows.rows, null, 1));
    expect(rows.rows.length).toBeGreaterThan(0);
  });
});
