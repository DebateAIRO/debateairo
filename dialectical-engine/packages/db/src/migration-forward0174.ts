import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0174, 0150's staff review door without a ground is no longer the runtime's (the final review of 0172, 11 November 2026; drained): it revokes
 * debateai_runtime's EXECUTE on staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb), so every review step goes through 0172's door with the
 * ground and the law. It adds nothing; the function stays (0150's postcondition digests it), and its grant change is declared as an amendment of 0150.
 * Its own postcondition digests that door whole (owner, definer flag, settings, body and grants), so a later grant back to any role reads as drift.
 */
const NAME = "0174_public_review_ungrounded_door.sql";
const VERSION = "public-review-ungrounded-door-forward0174-v1";
const MANIFEST_PATH = "lineage/public-review-ungrounded-door-forward0174.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0173_settle_dismissed_flag.sql";
/** The door whose grant this step takes back: 0150's own, which its postcondition digests. */
const DOOR = "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)";
/** What this step's postcondition digests: that door alone. */
const FUNCTIONS: readonly string[] = [DOOR];
/** The earlier step whose digest this step changes. The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([
  Object.freeze({ step: "0150_public_review.sql", functions: Object.freeze([DOOR]),
    revokes: Object.freeze([`EXECUTE ON FUNCTION ${DOOR} FROM debateai_runtime`]), field: "function_acl_revoked" as const })
]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0174_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The old door: its owner, definer flag, settings, body (0150's, unchanged) and ACL, the one field this step changes. */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions }));
}

export async function loadForward0174(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
