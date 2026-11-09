import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0169, a new piece of an older debate is written with the settings the owners switched on, and the runner may read which those are (V4 start
 * step; plan 2026-11-03 Task 57o-fix; the owner's answers of 8 Nov, "Use today's settings" and "Your switched-on one (Recommended)"; expand):
 * the runner's role may call 0124's pointer reader (a version number, nothing private). 0124's postcondition digests the reader's grants, so
 * the step declares that amendment. And each piece notes which settings wrote it (Task 57p; the owner's answer of 8 Nov, "On each piece's
 * record"): a nullable settings_version with its CHECK on eight records of five steps (whose digests hold those tables' columns and CHECKs,
 * so the step declares those amendments, kind column_added), and ten new writers that store it, each owned and granted as the writer it
 * supersedes. It pins the reader, the ten writers (owner, definer, path, volatility, definition, grants) and the eight columns with their
 * CHECKs; it keeps 0130's verifier.
 */
const NAME = "0169_piece_settings_version.sql";
const VERSION = "piece-settings-version-forward0169-v1";
const MANIFEST_PATH = "lineage/piece-settings-version-forward0169.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0168_set_aside_continue.sql";
/** Task 57p: the ten writers this step adds, each `<the writer it supersedes>_with_settings(<its arguments>, bigint)`. */
const WRITERS = [
  "identity.record_web_reading_with_settings(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea,bigint)",
  "identity.record_path_rewrite_with_settings(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)",
  "identity.record_investigation_report_version_with_settings(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)",
  "identity.record_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)",
  "identity.record_path_rewrite_in_line_with_settings(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)",
  "identity.record_main_answer_update_with_settings(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)",
  "identity.record_public_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)",
  "identity.record_public_check_passed_with_settings(uuid,uuid,bigint)",
  "identity.record_public_answer_update_with_settings(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)",
  "identity.record_public_report_with_settings(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)"
] as const;
/** The functions this step pins whole: the one whose grants it changes (0124's pointer reader, first) and its ten writers. */
const FUNCTIONS = ["register.read_active_settings_version()", ...WRITERS] as const;
/** Task 57p: the eight records whose column (and its CHECK) this step adds. */
const TABLES = ["identity.web_reading", "identity.path_rewrite", "identity.investigation_report", "identity.path_update", "identity.main_answer_update",
  "identity.public_answer_update", "identity.public_contribution_check", "identity.public_report"] as const;
const columnAdded = (step: string, relations: readonly string[]): PostconditionAmendment =>
  Object.freeze({ step, relations: Object.freeze([...relations]), columns: Object.freeze(["settings_version"]), field: "column_added" as const });
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([
  Object.freeze({ step: "0124_settings_activation.sql", functions: Object.freeze(FUNCTIONS.slice(0, 1)), grantees: Object.freeze(["debateai_runtime"]), field: "function_acl" as const }),
  columnAdded("0132_web_evidence.sql", ["identity.web_reading"]),
  columnAdded("0134_dig_model_and_month_pause.sql", ["identity.path_rewrite"]),
  columnAdded("0136_investigation_reports.sql", ["identity.investigation_report"]),
  columnAdded("0138_tree_updates.sql", ["identity.main_answer_update", "identity.path_update"]),
  columnAdded("0147_public_tree.sql", ["identity.public_answer_update", "identity.public_contribution_check", "identity.public_report"])
]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0169_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The reader and the ten writers (owner, definer, path, volatility, definition, ACL), as 0124 digests its own functions; the eight columns with their CHECKs. */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const columns = (await client.query(`
    SELECT relation,format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,a.attacl::text acl,a.atthasdef defaulted,
      (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k
        WHERE k.conrelid=c.oid AND k.conname=split_part(relation,'.',2)||'_settings_version_check') checks
    FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='settings_version' AND NOT a.attisdropped ORDER BY relation`, [TABLES])).rows;
  if (columns.length !== TABLES.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions, columns }));
}

export async function loadForward0169(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
