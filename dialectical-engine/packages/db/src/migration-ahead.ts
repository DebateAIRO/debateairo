import type { Pool, PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { assertForwardRecordsPrivate } from "./migration-forward-chain.js";
import { identifyLineage, lastForwardStep, loadMigrationPlan, splitLedger, type MigrationPlan } from "./migration-lineage.js";

/**
 * "Database ahead" start mode (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A7). During an upload the
 * newer release migrates the shared database while the older release keeps running, and the older release may restart
 * (a crash, a runner restart). Its migrate() then finds ledger names it does not know. It accepts them only when they
 * are the steps of at most ONE newer release, each declared `-- n1: expand` and `-- n1: keeps-verifier`
 * (public.debateai_schema_migration_step_n1, written by the newer release's applyForwardStep), receipted and chained
 * from this code's last step, with this code's verifier still in force. Then it replays its own steps, applies
 * nothing and reports the extra ones. Anything else is refused DATABASE_AHEAD_NOT_ACCEPTED <DETAIL> <name>.
 *
 * Imported only by migrate()'s module (packages/db/src/index.ts), outside loadMigrationPlan's self-contained closure,
 * so it uses the house TypedDomainError (A6 ruling B; tests/architecture/migration-forward-chain.test.ts pins the
 * closure).
 */
export const DATABASE_AHEAD_NOT_ACCEPTED = "DATABASE_AHEAD_NOT_ACCEPTED" as const;

/** One forward step as its code describes it: its digests and its n1 header (migration-n1.ts). */
export type ForwardStepDeclaration = Readonly<{
  name: string; manifestSha256: string; sourceSha256: string; verifierSha256: string;
  n1Expand: boolean; keepsVerifier: boolean; outsideTransaction: boolean;
}>;
/** `newerChain`: the newer release's whole chain (its describeForwardSteps(), from its root-owned plan). */
export type MigrateOptions = Readonly<{ newerChain?: readonly ForwardStepDeclaration[] }>;
/** The forward steps this run applied, in order, and the steps a newer release added that it accepted. */
export type MigrateReport = Readonly<{ appliedSteps: readonly string[]; extraSteps: readonly string[] }>;
/** `knownSteps`: how many of this code's forward steps the database has applied. */
export type DatabaseAheadReport = Readonly<{ mode: "CURRENT" | "AHEAD"; knownSteps: number; extraSteps: readonly string[] }>;

/** The chain of `plan`, described step by step. */
export function describeChain(plan: MigrationPlan): readonly ForwardStepDeclaration[] {
  return Object.freeze(plan.forwardChain.map((step) => Object.freeze({
    name: step.name, manifestSha256: step.manifestSha256, sourceSha256: step.sourceSha256, verifierSha256: step.verifierSha256,
    n1Expand: step.n1.expand, keepsVerifier: step.n1.keepsVerifier, outsideTransaction: step.n1.outsideTransaction
  })));
}

/** This code's whole chain; the newer release prints it into its root-owned plan (the older release's `newerChain`). */
export async function describeForwardSteps(): Promise<readonly ForwardStepDeclaration[]> {
  return describeChain(await loadMigrationPlan());
}

/**
 * Read-only: the steps of this code's chain the database has not applied, in order. The release check refuses a
 * side-by-side upload when any of them is not n1Expand.
 */
export async function readPendingForwardSteps(pool: Pool): Promise<readonly ForwardStepDeclaration[]> {
  const plan = await loadMigrationPlan();
  return readOnly(pool, async (client) => {
    const applied = new Set(await ledgerNames(client));
    return Object.freeze(describeChain(plan).filter((step) => !applied.has(step.name)));
  });
}

/**
 * Read-only (BEGIN READ ONLY): migrate()'s acceptance check without the migrate. The same ledger split and lineage of
 * the known part (an unknown name that is not ahead still refuses UNKNOWN_APPLIED_NAME), then, when there are extra
 * steps, every rule of assertDatabaseAheadAccepted. CURRENT when the ledger holds no step newer than this code's.
 */
export async function verifyDatabaseAhead(pool: Pool, options: MigrateOptions = {}): Promise<DatabaseAheadReport> {
  const plan = await loadMigrationPlan();
  return readOnly(pool, async (client) => {
    const { known, extra } = splitLedger(plan, await ledgerNames(client));
    identifyLineage(plan, known, await resolutionNames(client));
    const applied = new Set(known);
    await assertDatabaseAheadAccepted(client, plan, applied, extra, options);
    const knownSteps = plan.forwardChain.filter((step) => applied.has(step.name)).length;
    return Object.freeze({ mode: extra.length > 0 ? "AHEAD" : "CURRENT", knownSteps, extraSteps: extra });
  });
}

function notAccepted(detail: string, name: string): never {
  throw new TypedDomainError(DATABASE_AHEAD_NOT_ACCEPTED, `${DATABASE_AHEAD_NOT_ACCEPTED} ${detail} ${name}`);
}
type AheadReceipt = Readonly<{ base_recipe_sha256: string; previous_manifest_sha256: string; forward_manifest_sha256: string; source_sha256: string; verifier_sha256: string }>;
type AheadDeclaration = Readonly<{ n1_expand: boolean; keeps_verifier: boolean; chain_head_manifest_sha256: string }>;

/**
 * The acceptance rules for the `extra` steps (splitLedger) of a database whose known applied names are `applied`; a
 * no-op when there are none. migrate() runs it in its prologue transaction right after replayForwardChain, and
 * verifyDatabaseAhead read-only. Each refusal is DATABASE_AHEAD_NOT_ACCEPTED <DETAIL> <name>:
 * 1. every step of this code's chain is applied (PENDING_KNOWN_STEP), so nothing is left for this code to apply;
 * 2. every extra step has a receipt (RECEIPT_MISSING);
 * 3. the receipts chain from this code's last manifest, one after the other, on the same base recipe (CHAIN_BROKEN);
 * 4. every extra receipt names this code's last verifier, so the verifier this code runs is the one in force
 *    (VERIFIER_CHANGED);
 * 5. every extra step has a declaration row (NOT_DECLARED) saying n1 expand (NOT_EXPAND) and keeps-verifier
 *    (NOT_KEEPS_VERIFIER);
 * 6. without `newerChain`: all extra steps carry one chain head, one newer release (MORE_THAN_ONE_RELEASE);
 * 7. with `newerChain`: this code's chain is a prefix of it (name, manifest, source, verifier), and the extra steps are
 *    a prefix of the rest with the receipts' manifests and sources, each declared expand and keeps-verifier
 *    (NEWER_CHAIN_MISMATCH).
 * Rule 6 is skipped when `newerChain` is given (final review A1, controller ruling 2026-10-22): a release T+1 that
 * applied 0124 and was rolled back, then its fix release T+1b that keeps 0124 and adds 0125, leave two chain heads
 * (each migrate() records its own), yet rules 3 and 7 prove one linear chain of that one newer release, so T can still
 * restart. Without the newer release's list the heads are the only proof of one release, so rule 6 stays.
 * The two tables are read only after their ACL passes (assertForwardRecordsPrivate), so a row a runtime could have
 * written is never trusted.
 */
export async function assertDatabaseAheadAccepted(
  client: PoolClient, plan: MigrationPlan, applied: ReadonlySet<string>, extra: readonly string[], options: MigrateOptions = {}
): Promise<void> {
  if (extra.length === 0) return;
  const pending = plan.forwardChain.find((step) => !applied.has(step.name));
  if (pending !== undefined) notAccepted("PENDING_KNOWN_STEP", pending.name);
  const present = await assertForwardRecordsPrivate(client);
  const receipts = new Map(present.receipts ? (await client.query<AheadReceipt & { source_name: string }>(
    `SELECT source_name,base_recipe_sha256,previous_manifest_sha256,forward_manifest_sha256,source_sha256,verifier_sha256
     FROM public.debateai_schema_migration_step WHERE source_name=ANY($1::text[])`, [extra])).rows.map((row) => [row.source_name, row] as const) : []);
  const declarations = new Map(present.declarations ? (await client.query<AheadDeclaration & { source_name: string }>(
    `SELECT source_name,n1_expand,keeps_verifier,chain_head_manifest_sha256
     FROM public.debateai_schema_migration_step_n1 WHERE source_name=ANY($1::text[])`, [extra])).rows.map((row) => [row.source_name, row] as const) : []);
  const extraReceipts = extra.map((name) => receipts.get(name) ?? notAccepted("RECEIPT_MISSING", name));
  const last = lastForwardStep(plan);
  let previous = last.manifestSha256;
  for (const [index, receipt] of extraReceipts.entries()) {
    if (receipt.base_recipe_sha256 !== plan.recipeSha256 || receipt.previous_manifest_sha256 !== previous) notAccepted("CHAIN_BROKEN", extra[index]!);
    previous = receipt.forward_manifest_sha256;
  }
  for (const [index, receipt] of extraReceipts.entries()) {
    if (receipt.verifier_sha256 !== last.verifierSha256) notAccepted("VERIFIER_CHANGED", extra[index]!);
  }
  const extraDeclarations = extra.map((name) => {
    const declaration = declarations.get(name) ?? notAccepted("NOT_DECLARED", name);
    if (declaration.n1_expand !== true) notAccepted("NOT_EXPAND", name);
    if (declaration.keeps_verifier !== true) notAccepted("NOT_KEEPS_VERIFIER", name);
    return declaration;
  });
  const newer = options.newerChain;
  if (newer === undefined) {
    for (const [index, declaration] of extraDeclarations.entries()) {
      if (declaration.chain_head_manifest_sha256 !== extraDeclarations[0]!.chain_head_manifest_sha256) notAccepted("MORE_THAN_ONE_RELEASE", extra[index]!);
    }
    return;
  }
  for (const [index, step] of plan.forwardChain.entries()) {
    const entry = newer[index];
    if (entry?.name !== step.name || entry.manifestSha256 !== step.manifestSha256 || entry.sourceSha256 !== step.sourceSha256
      || entry.verifierSha256 !== step.verifierSha256) notAccepted("NEWER_CHAIN_MISMATCH", step.name);
  }
  const rest = newer.slice(plan.forwardChain.length);
  for (const [index, name] of extra.entries()) {
    const entry = rest[index], receipt = extraReceipts[index]!;
    if (entry?.name !== name || entry.manifestSha256 !== receipt.forward_manifest_sha256 || entry.sourceSha256 !== receipt.source_sha256
      || entry.n1Expand !== true || entry.keepsVerifier !== true) notAccepted("NEWER_CHAIN_MISMATCH", name);
  }
}

/** `body` in one read-only transaction; a connection that cannot roll back is destroyed, and the read's outcome stands. */
async function readOnly<T>(pool: Pool, body: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let ended = false;
  try {
    await client.query("BEGIN READ ONLY");
    const result = await body(client);
    await client.query("COMMIT");
    ended = true;
    return result;
  } finally {
    if (!ended) ended = await client.query("ROLLBACK").then(() => true, () => false);
    client.release(!ended);
  }
}
/** The ledger's names (none before the first migrate()). */
async function ledgerNames(client: PoolClient): Promise<readonly string[]> {
  const present = (await client.query<{ present: boolean }>("SELECT to_regclass('public.debateai_schema_migration') IS NOT NULL present")).rows[0]?.present === true;
  return present ? (await client.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name")).rows.map(({ name }) => name) : [];
}
/** The resolutions' logical names (none when the resolution table does not exist). */
async function resolutionNames(client: PoolClient): Promise<readonly string[]> {
  const present = (await client.query<{ present: boolean }>("SELECT to_regclass('public.debateai_schema_migration_resolution') IS NOT NULL present")).rows[0]?.present === true;
  return present ? (await client.query<{ logical_name: string }>("SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name")).rows.map(({ logical_name }) => logical_name) : [];
}
