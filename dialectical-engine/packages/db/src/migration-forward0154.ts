import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0154, Iceland and Liechtenstein in the sign-up's Region list (expand): 0095's country CHECK on
 * identity.registration_region widened by IS and LI, NOT VALID. No table, function or grant is added.
 */
const NAME = "0154_region_iceland_liechtenstein.sql";
const VERSION = "region-iceland-liechtenstein-forward0154-v1";
const MANIFEST_PATH = "lineage/region-iceland-liechtenstein-forward0154.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0153_dig_tree_settled.sql";
const TABLE = "identity.registration_region";
const CONSTRAINT = "registration_region_country_code_check";
const AMENDS: readonly never[] = [];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0154_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/**
 * The CHECK's name, table and kind. Its code list is pinned by tests (registration-region-database B2), not digested,
 * as 0125 leaves its own CHECKs, so a later step may widen the list again without a postcondition drift on 0154.
 */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const rows = (await client.query(`
    SELECT k.conname,k.contype,c.oid::regclass::text relation FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    WHERE k.conrelid=to_regclass($1) AND k.conname=$2`, [TABLE, CONSTRAINT])).rows;
  if (rows.length !== 1) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify(rows));
}

export async function loadForward0154(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
