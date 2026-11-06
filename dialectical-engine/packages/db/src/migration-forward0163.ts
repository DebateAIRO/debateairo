import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0163, a dig under the main question of a path debate updates the main answer (V4 start step; plan 2026-11-03 Task 55e; spec 2026-11-03
 * §4.4; drained): 0138's CHECK on identity.main_answer_update.trigger_kind widened by PATH_ADDED. No table, function or grant is added.
 * 0138's postcondition digests the CHECK, so the step declares that amendment, and keeps 0130's verifier.
 */
const NAME = "0163_main_answer_path_added.sql";
const VERSION = "main-answer-path-added-forward0163-v1";
const MANIFEST_PATH = "lineage/main-answer-path-added-forward0163.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0162_carry_on_session_free_digs.sql";
const TABLE = "identity.main_answer_update";
const CONSTRAINT = "main_answer_update_trigger_check";
/** 0138's digest pins the CHECK this step widens, so it declares that (as 0162 declares its own). The manifest carries the same list. */
const AMENDS: readonly PostconditionAmendment[] = Object.freeze([Object.freeze({
  step: "0138_tree_updates.sql",
  relations: Object.freeze([TABLE]),
  constraints: Object.freeze([CONSTRAINT]),
  field: "constraint_definition" as const
})]);
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0163_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/**
 * The CHECK's name, table, kind and whether it is validated. Its kinds are pinned by tests (main-answer-path-added-0163-contract and the
 * v2 report suite), not digested, as 0154 leaves its own list, so a later step may widen it again without a postcondition drift on 0163
 * (it still declares the amendment of 0138's, whose digest holds the definition).
 */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const rows = (await client.query(`
    SELECT k.conname,k.contype,k.convalidated validated,c.oid::regclass::text relation FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    WHERE k.conrelid=to_regclass($1) AND k.conname=$2`, [TABLE, CONSTRAINT])).rows;
  if (rows.length !== 1) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify(rows));
}

export async function loadForward0163(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
