import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0191, the Owner adds a buyer with the security key alone (drained; migrations/lineage/README.md "The Owner adds a buyer
 * with the security key alone (0191)"): 0186's table CHECK that only a removal may be written without an alert is
 * dropped, and 0186's door is restated without the one line that refused an addition without an alert, so an addition
 * made while the team tools are locked is written with alerted false, as a removal is. It adds nothing, so its own
 * postcondition pins the one function it restates (owner, definer, settings, volatility, body and ACL) and the table's
 * whole list of constraints, which no longer holds the dropped CHECK; both are declared as one amendment of 0186, whose
 * postcondition digests them. It keeps 0130's verifier. Once applied, any later change is a step of its own.
 */
const NAME = "0191_preview_buyer_add_key_only.sql";
const VERSION = "preview-buyer-add-key-only-forward0191-v1";
const MANIFEST_PATH = "lineage/preview-buyer-add-key-only-forward0191.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0190_check_deletes_public_debate.sql";
/** The one function this step restates (0186's door). */
const FUNCTIONS: readonly string[] = ["staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb)"];
/** The CHECK this step drops (0186's, unnamed in its CREATE TABLE, so Postgres named it), on its table. */
const RELATIONS: readonly string[] = ["staff.preview_buyer_event"];
const CONSTRAINTS: readonly string[] = ["preview_buyer_event_check"];
/** The earlier step whose digest this step changes. The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([
  Object.freeze({ step: "0186_preview_buyers.sql", functions: Object.freeze([...FUNCTIONS]), field: "function_definition" as const,
    relations: Object.freeze([...RELATIONS]), constraints: Object.freeze([...CONSTRAINTS]) })
]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0191_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/**
 * The door whole (owner, definer, settings, volatility, body and ACL) and every constraint of its table by name and
 * definition: the dropped CHECK cannot be looked up by name, so the whole list pins that it is gone and stays gone.
 */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const constraints = (await client.query(`
    SELECT k.conname,k.contype,pg_get_constraintdef(k.oid) definition,k.convalidated validated FROM pg_constraint k
    WHERE k.conrelid=to_regclass($1) ORDER BY k.conname`, [RELATIONS[0]])).rows;
  if (constraints.length === 0 || constraints.some((row: { conname: string }) => CONSTRAINTS.includes(row.conname))) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions, constraints }));
}

export async function loadForward0191(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
