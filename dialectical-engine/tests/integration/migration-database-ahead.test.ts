import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// Test-only: loadMigrationPlan returns the real plan with its forward chain cut while `chain.shape` is set (the database
// the release before this code's last step leaves), as migration-per-step.test.ts does. The mocked module instance is the one migrate()
// and the database-ahead readers import, because they come from the same source module below.
const chain = vi.hoisted(() => ({ shape: undefined as undefined | ((steps: readonly unknown[]) => readonly unknown[]) }));
vi.mock("../../packages/db/src/migration-lineage.js", async (original) => {
  const real = await original<typeof import("../../packages/db/src/migration-lineage.js")>();
  return {
    ...real,
    loadMigrationPlan: async () => {
      const plan = await real.loadMigrationPlan();
      return chain.shape === undefined ? plan : { ...plan, forwardChain: Object.freeze([...chain.shape(plan.forwardChain)]) };
    }
  };
});
import { describeForwardSteps, migrate, readPendingForwardSteps, verifyDatabaseAhead, type ForwardStepDeclaration, type MigrateOptions } from "../../packages/db/src/index.js";
import { loadMigrationPlan, type MigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * "Database ahead" start mode (side-by-side spec 2026-10-21 §5; plan A, task A7, Review Focus 3): an older release starts
 * on a database that a newer release has already moved forward by steps it declared `-- n1: expand` and
 * `-- n1: keeps-verifier`, all from ONE newer chain (its own list proves it when given, else one chain head), recorded
 * in the migrator-private declaration table public.debateai_schema_migration_step_n1. migrate() replays its own steps, applies nothing and reports the extra
 * steps; verifyDatabaseAhead makes the same acceptance check read-only. Anything else is refused
 * DATABASE_AHEAD_NOT_ACCEPTED <DETAIL> <name>. CI skips this directory; run it alone.
 */
const SIDE_BY_SIDE = "0123_side_by_side_releases.sql";
/** Synthesis-flag S05's support records step, drained (uploaded the old way): the step before this code's chain head. */
const SUPPORT_STEP = "0129_support_answer_scope.sql";
/** The steps after 0122 before the head, each with its n1 header: 0124, the settings activation (side-by-side spec §13),
 *  and 0125, the Italy-specific approval (mission italy-clause-approval), are `-- n1: expand` steps; 0123 and
 *  synthesis-flag's 0126 to 0129 are drained. Every one keeps the verifier. */
const DECLARED = [[SIDE_BY_SIDE, false], ["0124_settings_activation.sql", true],
  ["0125_italy_specific_approval.sql", true], ["0126_synthesis_check.sql", false],
  ["0127_publication_review.sql", false], ["0128_threat_reports.sql", false], [SUPPORT_STEP, false]] as const;
/** Row-level security (mission row-level-security, SPEC-v4 R26): the step before this code's chain head, `-- n1: drained`,
 *  superseding the verifier (no keeps-verifier). */
const RLS = "0130_row_level_security.sql";
/** The V4 account memory (owner rulings N7 and N11), `-- n1: expand` and `-- n1: keeps-verifier` (it keeps 0130's verifier),
 *  then the Perplexity plan's web evidence store and investigations (task W1-3), each expand and keeping it too. */
const V4 = "0131_v4_account_memory.sql";
const WEB = "0132_web_evidence.sql";
/** This code's chain head since the Perplexity plan's two steps. */
const HEAD_STEP = "0133_investigations.sql";
const AFTER_RLS = [V4, WEB, HEAD_STEP] as const;
// A newer release's steps come after this code's chain head (0133 since the investigations).
const FIRST = "0134_probe_ahead.sql";
const SECOND = "0135_probe_ahead.sql";
/** 0111's effective-capability verifier, which 0112 to 0129 keep in force. */
const VERIFIER = "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a";
/** 0130's verifier, which supersedes 0111's (SPEC-v4 R34): the one in force at this code's head (0131 to 0133 keep it),
 *  which extra steps keep. */
const IN_FORCE_VERIFIER = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const HEAD = "e".repeat(64);
const hex = (digit: string): string => digit.repeat(64);

let db: TestDatabase;
let plan: MigrationPlan;
const ledger = async (): Promise<string[]> =>
  (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name")).rows.map((row) => row.name);

/** A newer release's step as its migrate() leaves it: a ledger row, a receipt and a declaration (each optional). */
type Probe = Readonly<{
  name: string; previous: string; manifest: string; source: string; verifier?: string; base?: string;
  expand?: boolean; keepsVerifier?: boolean; head?: string; receipt?: boolean; declared?: boolean;
}>;
const first = (changes: Partial<Probe> = {}): Probe =>
  ({ name: FIRST, previous: plan.forwardChain.at(-1)!.manifestSha256, manifest: hex("1"), source: hex("3"), ...changes });
const second = (changes: Partial<Probe> = {}): Probe => ({ name: SECOND, previous: hex("1"), manifest: hex("2"), source: hex("4"), ...changes });
async function seed(probe: Probe): Promise<void> {
  await db.pool.query("INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())", [probe.name]);
  if (probe.receipt !== false) {
    await db.pool.query(`INSERT INTO public.debateai_schema_migration_step(source_name,base_recipe_sha256,previous_manifest_sha256,
      forward_manifest_sha256,source_sha256,verifier_sha256,precondition_evidence_digest,postcondition_evidence_digest,executed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,statement_timestamp())`,
    [probe.name, probe.base ?? plan.recipeSha256, probe.previous, probe.manifest, probe.source, probe.verifier ?? IN_FORCE_VERIFIER, hex("a"), hex("b")]);
  }
  if (probe.declared !== false) {
    await db.pool.query(`INSERT INTO public.debateai_schema_migration_step_n1(source_name,n1_expand,keeps_verifier,outside_transaction,
      chain_head_manifest_sha256,recorded_at) VALUES($1,$2,$3,false,$4,statement_timestamp())`,
    [probe.name, probe.expand ?? true, probe.keepsVerifier ?? true, probe.head ?? HEAD]);
  }
}
/** The newer release's own description of a probe step, as describeForwardSteps() prints it into its plan. */
const declaration = (probe: Probe): ForwardStepDeclaration => Object.freeze({
  name: probe.name, manifestSha256: probe.manifest, sourceSha256: probe.source, verifierSha256: probe.verifier ?? IN_FORCE_VERIFIER,
  n1Expand: probe.expand ?? true, keepsVerifier: probe.keepsVerifier ?? true, outsideTransaction: false
});
/** Both entry points refuse with the exact message, and migrate()'s prologue leaves the ledger as it was. */
async function refused(detail: string, name: string, options?: MigrateOptions): Promise<void> {
  const refusal = { name: "TypedDomainError", code: "DATABASE_AHEAD_NOT_ACCEPTED", message: `DATABASE_AHEAD_NOT_ACCEPTED ${detail} ${name}` };
  const before = await ledger();
  await expect(migrate(db.pool, options)).rejects.toMatchObject(refusal);
  await expect(verifyDatabaseAhead(db.pool, options)).rejects.toMatchObject(refusal);
  expect(await ledger()).toEqual(before);
}

describe("an older release on a database a newer release moved forward (Review Focus 3)", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-DECLARED.length - 4, -4).map((step) => step.name)).toEqual(DECLARED.map(([name]) => name));
    expect(plan.forwardChain.at(-5)!.verifierSha256).toBe(VERIFIER);
    expect(plan.forwardChain.at(-4)!.name).toBe(RLS);
    expect(plan.forwardChain.at(-4)!.verifierSha256).toBe(IN_FORCE_VERIFIER);
    expect(plan.forwardChain.slice(-3).map((step) => step.name)).toEqual([...AFTER_RLS]);
    for (const step of plan.forwardChain.slice(-3)) expect(step.verifierSha256).toBe(IN_FORCE_VERIFIER);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });
  afterEach(async () => {
    await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name=ANY($1::text[])", [[FIRST, SECOND, "0100_stray.sql", "0199_Stray.sql"]]);
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name=ANY($1::text[])", [[FIRST, SECOND]]);
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step_n1 WHERE source_name=ANY($1::text[])", [[FIRST, SECOND]]);
  });

  it("a fresh migrate records the declarations of 0123 and every later step", async () => {
    // Steps up to 0122 predate the n1 header and record nothing; 0123 (drained) is the first step with a declaration
    // row and 0124 (expand) the second; row-level security's 0130 (drained, superseding the verifier) comes next, then the
    // V4 account memory's 0131 and the Perplexity plan's 0132 and 0133 (expand, keeping 0130's verifier), 0133 the last. One migrate() applied them all, so all name
    // its chain head.
    expect((await db.pool.query(`SELECT source_name,n1_expand,keeps_verifier,outside_transaction,chain_head_manifest_sha256,recorded_at
      FROM public.debateai_schema_migration_step_n1 ORDER BY source_name`)).rows).toEqual([...DECLARED.map(([source_name, n1_expand]) => ({
      source_name, n1_expand, keeps_verifier: true, outside_transaction: false,
      chain_head_manifest_sha256: plan.forwardChain.at(-1)!.manifestSha256, recorded_at: expect.any(Date)
    })), {
      source_name: RLS, n1_expand: false, keeps_verifier: false, outside_transaction: false,
      chain_head_manifest_sha256: plan.forwardChain.at(-1)!.manifestSha256, recorded_at: expect.any(Date)
    }, ...AFTER_RLS.map((source_name) => ({
      source_name, n1_expand: true, keeps_verifier: true, outside_transaction: false,
      chain_head_manifest_sha256: plan.forwardChain.at(-1)!.manifestSha256, recorded_at: expect.any(Date)
    }))]);
  });

  // A7 review: migrate() refuses in replayForwardChain first, so each case also runs verifyDatabaseAhead (plan D's preview
  // gate) on a database one step ahead, where assertForwardRecordsPrivate is the only gate before the rows are read.
  it("the declaration table is migrator-private: a grant to a runtime role is refused", async () => {
    expect((await db.pool.query("SELECT has_table_privilege('debateai_runtime','public.debateai_schema_migration_step_n1','SELECT,INSERT,UPDATE,DELETE') AS any")).rows[0].any).toBe(false);
    await db.pool.query("GRANT SELECT ON public.debateai_schema_migration_step_n1 TO debateai_authorization_runtime");
    try {
      await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_DECLARATION_ACL_DRIFT");
      await seed(first());
      await expect(verifyDatabaseAhead(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_DECLARATION_ACL_DRIFT");
    } finally {
      await db.pool.query("REVOKE SELECT ON public.debateai_schema_migration_step_n1 FROM debateai_authorization_runtime");
    }
  });

  it("the receipt table is migrator-private: a grant to a runtime role is refused", async () => {
    await db.pool.query("GRANT SELECT ON public.debateai_schema_migration_step TO debateai_authorization_runtime");
    try {
      await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_RECEIPT_ACL_DRIFT");
      await seed(first());
      await expect(verifyDatabaseAhead(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_RECEIPT_ACL_DRIFT");
    } finally {
      await db.pool.query("REVOKE SELECT ON public.debateai_schema_migration_step FROM debateai_authorization_runtime");
    }
  });

  it("a database one release ahead is accepted", async () => {
    await seed(first());
    expect(await migrate(db.pool)).toEqual({ appliedSteps: [], extraSteps: [FIRST] });
    expect(await verifyDatabaseAhead(db.pool)).toEqual({ mode: "AHEAD", knownSteps: 23, extraSteps: [FIRST] });
    // Two steps of the same newer release, chained one after the other.
    await seed(second());
    expect(await migrate(db.pool)).toEqual({ appliedSteps: [], extraSteps: [FIRST, SECOND] });
    expect(await ledger()).toEqual(expect.arrayContaining([SIDE_BY_SIDE, RLS, ...AFTER_RLS, FIRST, SECOND]));
  });

  it("exactly current reports CURRENT", async () => {
    expect(await verifyDatabaseAhead(db.pool)).toEqual({ mode: "CURRENT", knownSteps: 23, extraSteps: [] });
    expect(await migrate(db.pool)).toEqual({ appliedSteps: [], extraSteps: [] });
  });

  it("describeForwardSteps describes this code's whole chain with its n1 headers", async () => {
    const steps = await describeForwardSteps();
    expect(steps.map((step) => step.name)).toEqual(plan.forwardChain.map((step) => step.name));
    expect(steps.at(-4)).toEqual({ name: RLS, manifestSha256: plan.forwardChain.at(-4)!.manifestSha256,
      sourceSha256: plan.forwardChain.at(-4)!.sourceSha256, verifierSha256: IN_FORCE_VERIFIER, n1Expand: false, keepsVerifier: false, outsideTransaction: false });
    // 0130 is drained and supersedes the verifier, so its header omits keeps-verifier (SPEC-v4 R26, R34); 0131, 0132 and
    // 0133 are expand steps that keep 0130's verifier.
    expect(steps.slice(-3)).toEqual(plan.forwardChain.slice(-3).map((step) => ({ name: step.name, manifestSha256: step.manifestSha256,
      sourceSha256: step.sourceSha256, verifierSha256: IN_FORCE_VERIFIER, n1Expand: true, keepsVerifier: true, outsideTransaction: false })));
    expect(steps.slice(-3).map((step) => step.name)).toEqual([...AFTER_RLS]);
    const tail = plan.forwardChain.slice(-DECLARED.length - 4, -4);
    expect(steps.slice(-DECLARED.length - 4, -4)).toEqual(DECLARED.map(([name, n1Expand], index) => ({ name,
      manifestSha256: tail[index]!.manifestSha256, sourceSha256: tail[index]!.sourceSha256, verifierSha256: VERIFIER,
      n1Expand, keepsVerifier: true, outsideTransaction: false })));
    // 0122 and earlier declare nothing (all false).
    expect(steps.slice(0, -DECLARED.length - 4).every((step) => !step.n1Expand && !step.keepsVerifier && !step.outsideTransaction)).toBe(true);
  });

  it("half a newer release is accepted", async () => {
    await seed(first());
    const newerChain = [...await describeForwardSteps(), declaration(first()), declaration(second())];
    expect(await migrate(db.pool, { newerChain })).toEqual({ appliedSteps: [], extraSteps: [FIRST] });
    expect(await verifyDatabaseAhead(db.pool, { newerChain })).toEqual({ mode: "AHEAD", knownSteps: 23, extraSteps: [FIRST] });
  });

  it("refuses NOT_DECLARED: an extra step with no declaration row", async () => {
    await seed(first({ declared: false }));
    await refused("NOT_DECLARED", FIRST);
  });

  it("refuses NOT_EXPAND: an extra step not declared expand", async () => {
    await seed(first({ expand: false }));
    await refused("NOT_EXPAND", FIRST);
  });

  it("refuses NOT_KEEPS_VERIFIER: an extra step not declared keeps-verifier", async () => {
    await seed(first({ keepsVerifier: false }));
    await refused("NOT_KEEPS_VERIFIER", FIRST);
  });

  it("refuses VERIFIER_CHANGED: an extra step's receipt names another verifier", async () => {
    await seed(first({ verifier: hex("f") }));
    await refused("VERIFIER_CHANGED", FIRST);
  });

  it("refuses CHAIN_BROKEN: an extra step not chained from this code's last manifest, or on another base recipe", async () => {
    await seed(first({ previous: hex("9") }));
    await refused("CHAIN_BROKEN", FIRST);
    await db.pool.query("UPDATE public.debateai_schema_migration_step SET previous_manifest_sha256=$1,base_recipe_sha256=$2 WHERE source_name=$3",
      [plan.forwardChain.at(-1)!.manifestSha256, hex("9"), FIRST]);
    await refused("CHAIN_BROKEN", FIRST);
    // The second extra must chain from the first one's manifest.
    await db.pool.query("UPDATE public.debateai_schema_migration_step SET base_recipe_sha256=$1 WHERE source_name=$2", [plan.recipeSha256, FIRST]);
    await seed(second({ previous: hex("9") }));
    await refused("CHAIN_BROKEN", SECOND);
  });

  it("refuses RECEIPT_MISSING: an extra ledger name with no receipt", async () => {
    await seed(first({ receipt: false }));
    await refused("RECEIPT_MISSING", FIRST);
  });

  it("refuses MORE_THAN_ONE_RELEASE: extra steps declared by two different newer chains, without the newer release's list", async () => {
    await seed(first());
    await seed(second({ head: hex("c") }));
    await refused("MORE_THAN_ONE_RELEASE", SECOND);
  });

  // Final review A1: T+1 applied 0134 and was rolled back; its fix release T+1b keeps 0134 byte for byte and adds 0135
  // (this code's own chain ends at 0133 since the investigations).
  // Each migrate() records its own chain head, so the two extra steps carry two heads. With the newer release's own list
  // (the preview always passes it), rules 3 and 7 prove one linear chain of that one release, so the heads are not
  // compared; without the list, the heads are the only proof of one release, and two heads still refuse.
  it("an aborted release's step then its fix release's step: accepted with the fix release's list only (final review A1)", async () => {
    await seed(first({ head: hex("1") })); // T+1's chain ends at 0134
    await seed(second({ head: hex("2") })); // T+1b's chain ends at 0135
    const own = await describeForwardSteps();
    const newerChain = [...own, declaration(first()), declaration(second())];
    expect(await migrate(db.pool, { newerChain })).toEqual({ appliedSteps: [], extraSteps: [FIRST, SECOND] });
    expect(await verifyDatabaseAhead(db.pool, { newerChain })).toEqual({ mode: "AHEAD", knownSteps: 23, extraSteps: [FIRST, SECOND] });
    await refused("MORE_THAN_ONE_RELEASE", SECOND);
    // Rule 7 still binds without rule 6: the fix release's step must be in its list as the database recorded it, and
    // the aborted release's own list (which ends at 0134) does not reach 0135.
    await refused("NEWER_CHAIN_MISMATCH", SECOND, { newerChain: [...own, declaration(first()), declaration(second({ manifest: hex("7") }))] });
    await refused("NEWER_CHAIN_MISMATCH", SECOND, { newerChain: [...own, declaration(first())] });
  });

  it("refuses NEWER_CHAIN_MISMATCH: the newer release's own list disagrees with the database or with this code", async () => {
    await seed(first());
    const own = await describeForwardSteps();
    // The extra step's manifest differs from the newer release's list.
    await refused("NEWER_CHAIN_MISMATCH", FIRST, { newerChain: [...own, declaration(first({ manifest: hex("7") }))] });
    // A list that is missing 0123: this code's chain is not a prefix of it.
    await refused("NEWER_CHAIN_MISMATCH", SIDE_BY_SIDE, { newerChain: [...own.filter((step) => step.name !== SIDE_BY_SIDE), declaration(first())] });
    // A list that is missing this code's step before last (0130).
    await refused("NEWER_CHAIN_MISMATCH", RLS, { newerChain: [...own.filter((step) => step.name !== RLS), declaration(first())] });
    // A list that is missing this code's last step (0133).
    await refused("NEWER_CHAIN_MISMATCH", HEAD_STEP, { newerChain: [...own.slice(0, -1), declaration(first())] });
    // A list that declares the extra step drained.
    await refused("NEWER_CHAIN_MISMATCH", FIRST, { newerChain: [...own, declaration(first({ expand: false }))] });
  });

  it("refuses PENDING_KNOWN_STEP: one of this code's own steps is not applied while a newer step is", async () => {
    // This code's last step (0133 since the investigations) is the one left unapplied, on a database the release
    // before 0133 left (the web evidence store's 0132 applied): a step before the last one missing is a gap in the chain
    // (MIGRATION_FORWARD_CHAIN_ORDER), and a step's rows removed from a database it changed may be refused by a replay
    // before any ahead check (as 0130's are, BILLING_NETOPIA_111_TABLE_PRIVILEGE), so the case builds that database.
    // The database every step of this code reached holds 0133's ledger row and receipt; the one below holds neither.
    const ledgerRow = (await db.pool.query("SELECT * FROM public.debateai_schema_migration WHERE name=$1", [HEAD_STEP])).rows[0];
    const receiptRow = (await db.pool.query("SELECT * FROM public.debateai_schema_migration_step WHERE source_name=$1", [HEAD_STEP])).rows[0];
    expect(ledgerRow).toBeDefined();
    expect(receiptRow).toBeDefined();
    const full = db;
    db = await startTestDatabase();
    try {
      chain.shape = (steps) => steps.slice(0, -1);
      try { await migrate(db.pool); } finally { chain.shape = undefined; }
      expect(await ledger()).toContain(WEB);
      expect(await ledger()).not.toContain(HEAD_STEP);
      await seed(first());
      await refused("PENDING_KNOWN_STEP", HEAD_STEP);
    } finally {
      await db.stop();
      db = full;
    }
    // On the database every step of this code reached, the same newer step is one release ahead.
    await seed(first());
    expect(await migrate(db.pool)).toEqual({ appliedSteps: [], extraSteps: [FIRST] });
  }, 300_000);

  it("an unknown name before this code's last step still refuses UNKNOWN_APPLIED_NAME", async () => {
    // 0100_stray.sql sorts before 0133; 0199_Stray.sql sorts after it but is not shaped like a step name
    // (FORWARD_STEP_NAME).
    for (const name of ["0100_stray.sql", "0199_Stray.sql"]) {
      await db.pool.query("INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())", [name]);
      try {
        await expect(migrate(db.pool)).rejects.toThrow(/MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME/);
        await expect(verifyDatabaseAhead(db.pool)).rejects.toThrow(/MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME/);
      } finally {
        await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name=$1", [name]);
      }
    }
  });
});

describe("the newer code's view of a database a release behind", () => {
  let behind: TestDatabase;
  beforeAll(async () => {
    behind = await startTestDatabase();
    // The database the release before this code leaves: the chain minus its last step (0133).
    chain.shape = (steps) => steps.slice(0, -1);
    try { await migrate(behind.pool); } finally { chain.shape = undefined; }
  }, 300_000);
  afterAll(async () => { await behind?.stop(); });

  it("readPendingForwardSteps lists what a newer code would apply", async () => {
    const real = await loadMigrationPlan();
    const step = real.forwardChain.at(-1)!;
    expect(await readPendingForwardSteps(behind.pool)).toEqual([{ name: HEAD_STEP, manifestSha256: step.manifestSha256,
      sourceSha256: step.sourceSha256, verifierSha256: IN_FORCE_VERIFIER, n1Expand: true, keepsVerifier: true, outsideTransaction: false }]);
    // Steps up to 0122 record no declaration row; 0123 to 0132 record the rows that release leaves.
    expect((await behind.pool.query("SELECT source_name FROM public.debateai_schema_migration_step_n1 ORDER BY source_name")).rows)
      .toEqual([...DECLARED.map(([source_name]) => ({ source_name })), { source_name: RLS }, { source_name: V4 }, { source_name: WEB }]);
    // Read-only: nothing was applied.
    expect((await behind.pool.query("SELECT count(*)::int AS n FROM public.debateai_schema_migration WHERE name=$1", [HEAD_STEP])).rows[0].n).toBe(0);
  });
});
