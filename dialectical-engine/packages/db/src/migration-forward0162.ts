import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0162, carry-on digs without a live sign-in (V4 start step; plan 2026-11-03 Task 56a; decision record answer 11, owner ruling 3 Nov night;
 * drained): the carry-on markers on the key provision intent and the run binding (one binding per debate and path), the carry-on dig's key
 * provision and its commit lock, and 0123's core.create_encrypted_run redefined with one more branch. It pins the columns, CHECKs and index
 * it adds and the three functions it creates or redefines, declares the redefinition as an amendment of 0123's postcondition, and keeps
 * 0130's verifier.
 */
const NAME = "0162_carry_on_session_free_digs.sql";
const VERSION = "carry-on-forward0162-v1";
const MANIFEST_PATH = "lineage/carry-on-forward0162.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0161_saved_questions.sql";
/** The columns 0162 adds, as table.column. */
const COLUMNS = [
  "core.run_key_provision_intent.carry_on_parent_run_id",
  "identity.run_execution_binding.carry_on_parent_run_id",
  "identity.run_execution_binding.carry_on_path_id"
] as const;
/** The CHECKs 0162 adds, as table.constraint. */
const CONSTRAINTS = [
  "core.run_key_provision_intent.run_key_provision_intent_one_marker",
  "identity.run_execution_binding.run_execution_binding_carry_on_pair",
  "identity.run_execution_binding.run_execution_binding_one_marker"
] as const;
/** The UNIQUE index 0162 adds: one carry-on dig per debate and path. */
const INDEXES = ["identity.run_execution_binding_one_carry_on_dig_idx"] as const;
/** The prepare and the commit lock it adds, and 0123's create_encrypted_run it redefines (whole: owner, definer, path, volatility, body, ACL). */
const FUNCTIONS = [
  "core.prepare_carry_on_run_key_provision(uuid,uuid,text)",
  "core.lock_carry_on_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
  "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)"
] as const;
/** 0123's digest pins the function this step redefines, so it declares that (0144's route). The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([Object.freeze({
  step: "0123_side_by_side_releases.sql",
  functions: Object.freeze(["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)"]),
  field: "function_definition" as const
})]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0162_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
/** 'schema.table.name' → ['schema.table', 'name']. */
const split = (qualified: string): readonly [string, string] =>
  [qualified.slice(0, qualified.lastIndexOf(".")), qualified.slice(qualified.lastIndexOf(".") + 1)];

/**
 * The 3 columns (type, NOT NULL, default), the 3 CHECKs (validated, definition), the index (definition, unique, valid) and the 3 functions
 * (owner, definer, path, volatility, definition digest, ACL). Only what 0162 adds or redefines: the two tables' other columns, constraints
 * and indexes belong to 0040 and 0123.
 */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const columns = (await client.query(`
    SELECT qualified,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value
    FROM unnest($1::text[],$2::text[],$3::text[]) AS wanted(qualified,relation,name)
    JOIN pg_attribute a ON a.attrelid=to_regclass(wanted.relation) AND a.attname=wanted.name AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ORDER BY qualified`,
  [COLUMNS, COLUMNS.map((name) => split(name)[0]), COLUMNS.map((name) => split(name)[1])])).rows;
  if (columns.length !== COLUMNS.length) return fail("POSTCONDITION_OBJECTS");
  const constraints = (await client.query(`
    SELECT qualified,k.convalidated validated,pg_get_constraintdef(k.oid) definition
    FROM unnest($1::text[],$2::text[],$3::text[]) AS wanted(qualified,relation,name)
    JOIN pg_constraint k ON k.conrelid=to_regclass(wanted.relation) AND k.conname=wanted.name ORDER BY qualified`,
  [CONSTRAINTS, CONSTRAINTS.map((name) => split(name)[0]), CONSTRAINTS.map((name) => split(name)[1])])).rows;
  if (constraints.length !== CONSTRAINTS.length) return fail("POSTCONDITION_OBJECTS");
  const indexes = (await client.query(`
    SELECT relation,pg_get_indexdef(i.indexrelid) definition,i.indisunique is_unique,i.indisvalid valid
    FROM unnest($1::text[]) relation JOIN pg_index i ON i.indexrelid=to_regclass(relation) ORDER BY relation`, [INDEXES])).rows;
  if (indexes.length !== INDEXES.length) return fail("POSTCONDITION_OBJECTS");
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ columns, constraints, indexes, functions }));
}

export async function loadForward0162(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const bytes = await readFile(new URL(MANIFEST_PATH, directory));
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!exactKeys(raw, ["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"])
    || raw.version !== VERSION || raw.baseRecipeSha256 !== anchor.baseRecipeSha256
    || !exactKeys(raw.previous, ["name", "manifestSha256", "verifierSha256"])
    || raw.previous.name !== PREVIOUS || anchor.previousName !== PREVIOUS
    || raw.previous.manifestSha256 !== anchor.previousManifestSha256
    || raw.previous.verifierSha256 !== anchor.previousVerifierSha256
    || !exactKeys(raw.migration, ["name", "sha256"]) || raw.migration.name !== NAME
    || !digest(raw.migration.sha256)
    || !exactKeys(raw.verifier, ["path", "sha256"]) || raw.verifier.path !== VERIFIER_PATH
    || !digest(raw.verifier.sha256) || JSON.stringify(raw.amendsPostconditionsOf) !== JSON.stringify(AMENDS)) return fail("MANIFEST");
  const sqlBytes = await readFile(new URL(NAME, directory));
  if (sha(sqlBytes) !== raw.migration.sha256) return fail("SOURCE_DIGEST");
  const verifierBytes = await readFile(new URL(VERIFIER_PATH, directory));
  if (sha(verifierBytes) !== raw.verifier.sha256) return fail("VERIFIER_DIGEST");
  return Object.freeze({
    name: NAME, version: VERSION, manifestSha256: sha(bytes), sourceSha256: raw.migration.sha256,
    sql: sqlBytes.toString("utf8"), previousName: PREVIOUS,
    previousManifestSha256: anchor.previousManifestSha256,
    previousVerifierSha256: anchor.previousVerifierSha256,
    verifierPath: VERIFIER_PATH, verifierSha256: raw.verifier.sha256,
    verifierSql: verifierBytes.toString("utf8"), postconditionEvidence, amendsPostconditionsOf: AMENDS
  });
}
