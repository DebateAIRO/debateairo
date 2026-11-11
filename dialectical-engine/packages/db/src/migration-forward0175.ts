import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0175, the statement to a debate's author says an AI read the report first only when the check gave a verdict (Q3 of the final review of 0172;
 * drained): 0157's identity.moderation_statement_ground, restated in place from 0172's body, sets automated_detection only for a verdict (AGREE,
 * NOT_FOUND or UNSURE) given by the statement's moment, never for UNAVAILABLE. It adds nothing, so its own postcondition pins the one function it
 * restates (owner, definer, settings, volatility, body and ACL), declared as an amendment of 0157, whose postcondition digests it. It keeps 0130's
 * verifier. Once applied, any later change is a step of its own.
 */
const NAME = "0175_statement_ai_read_verdict.sql";
const VERSION = "statement-ai-read-verdict-forward0175-v1";
const MANIFEST_PATH = "lineage/statement-ai-read-verdict-forward0175.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0174_public_review_ungrounded_door.sql";
/** The one function this step restates (0157's; 0172 restated it last). */
const FUNCTIONS: readonly string[] = ["identity.moderation_statement_ground(uuid)"];
/** The earlier step whose digest this step changes. The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([
  Object.freeze({ step: "0157_moderation_statements.sql", functions: Object.freeze([...FUNCTIONS]), field: "function_definition" as const })
]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0175_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The one function: owner, definer, settings, volatility, body and ACL. */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions }));
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
