import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0175, everyone told "until the review ends" hears how it ended (what was left of 0172's M3, owner, 11 November 2026; drained): 0172's statement
 * queue restated so a re-publish tells each person whose content left with other content what stays off or that it is back, and a decision tells
 * those of a dig taken out too; 0172's page reader restated so none of those kinds carries the facts; 0157's kind CHECK widened by four kinds. It
 * adds nothing, so its own postcondition pins the two functions it restates (owner, definer, settings, volatility, body and ACL) and the CHECK, all
 * declared as one amendment of 0157, whose postcondition digests them. It keeps 0130's verifier. Once applied, any later change is a step of its own.
 */
const NAME = "0175_moderation_final_outcome.sql";
const VERSION = "moderation-final-outcome-forward0175-v1";
const MANIFEST_PATH = "lineage/moderation-final-outcome-forward0175.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0174_public_review_ungrounded_door.sql";
/** The two functions this step restates (0157's; 0172 restated both last). */
const FUNCTIONS: readonly string[] = ["identity.queue_moderation_statements()", "identity.read_own_moderation_statements(uuid)"];
/** The CHECK this step swaps (0157's, named in its CREATE TABLE; 0172 swapped it last), on its table. */
const RELATIONS: readonly string[] = ["identity.moderation_statement"];
const CONSTRAINTS: readonly string[] = ["moderation_statement_kind_check"];
/** The earlier step whose digest this step changes. The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([
  Object.freeze({ step: "0157_moderation_statements.sql", functions: Object.freeze([...FUNCTIONS]), field: "function_definition" as const,
    relations: Object.freeze([...RELATIONS]), constraints: Object.freeze([...CONSTRAINTS]) })
]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0175_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The two functions (owner, definer, settings, volatility, body and ACL) and the kind CHECK's definition. */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const constraints = (await client.query(`
    SELECT k.conname,pg_get_constraintdef(k.oid) definition,k.convalidated validated FROM pg_constraint k
    WHERE k.conrelid=to_regclass($1) AND k.conname=ANY($2::text[]) ORDER BY k.conname`, [RELATIONS[0], CONSTRAINTS])).rows;
  if (constraints.length !== CONSTRAINTS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions, constraints }));
}

export async function loadForward0175(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
