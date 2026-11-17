import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0177, once an account is erased nothing kept beside a debate names its owner reference (drained): when the account row is deleted, each
 * of its debates gets a new random reference in place of the account's, in the rows that otherwise never change (the run, its ownership
 * records, a legacy claim, the memory rows) and on billing's usage row, whose entitlement event id is replaced too. So a kept public debate
 * shares no value with the records kept for the law (the acceptance record, the billing tables) nor with the account's other debates. It adds
 * four functions and one index (the ownership records by owner reference, so an account with no debate is recognised without a scan) and swaps the
 * mutation guard of seven tables for one that allows that single change; its postcondition pins the functions (owner, definer, settings, volatility,
 * body and ACL), those tables' guard triggers, the trigger on the account row and the index. It keeps 0130's
 * verifier and amends no chain step. Once applied, any later change is a step of its own.
 */
const NAME = "0177_erased_owner_unlinked.sql";
const VERSION = "erased-owner-unlinked-forward0177-v1";
const MANIFEST_PATH = "lineage/erased-owner-unlinked-forward0177.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0176_moderation_final_outcome.sql";
const FUNCTIONS: readonly string[] = [
  "core.reject_mutation_except_erased_owner()", "billing.reject_charge_scope_mutation()",
  "billing.reject_charge_scope_update_except_erased_owner()", "identity.unlink_erased_owner_runs()"
];
/** The tables whose guard this step swaps, and the account table that gains the trigger, with the trigger names pinned on each. */
const GUARDED: readonly string[] = [
  "billing.run_charge_scope", "core.legacy_run_claim", "core.run", "core.run_ownership_event", "identity.user",
  "memory.memory_link_event", "memory.pull_record", "memory.question_key"
];
const TRIGGERS: readonly string[] = ["reject_mutation", "reject_update_except_erased_owner", "unlink_erased_owner_runs"];
const AMENDS: readonly never[] = [];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0177_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The four functions (owner, definer, settings, volatility, body and ACL) and, on each table, the named triggers (enabled state, definition). */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const triggers = (await client.query(`
    SELECT relation,t.tgname,t.tgenabled::text enabled,pg_get_triggerdef(t.oid) definition
    FROM unnest($1::text[]) relation JOIN pg_trigger t ON t.tgrelid=to_regclass(CASE relation WHEN 'identity.user' THEN 'identity."user"' ELSE relation END)
    WHERE NOT t.tgisinternal AND t.tgname=ANY($2::text[]) ORDER BY relation,t.tgname`, [GUARDED, TRIGGERS])).rows;
  // Seven guards under 0000's name, the usage row's row guard, and the trigger on the account row.
  if (triggers.length !== 9) return fail("POSTCONDITION_OBJECTS");
  const indexes = (await client.query(`
    SELECT pg_get_indexdef(i.indexrelid) definition,i.indisvalid valid FROM pg_index i
    WHERE i.indexrelid=to_regclass('core.run_ownership_event_owner_ref')`)).rows;
  if (indexes.length !== 1) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions, triggers, indexes }));
}

export async function loadForward0177(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
