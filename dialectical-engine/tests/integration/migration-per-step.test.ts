import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
// Test-only: loadMigrationPlan returns the real plan with its forward chain cut or extended while `chain.shape` is set
// (a database left by the release before 0123, or the real chain plus a probe step). The mocked module instance is the
// one migrate() imports, because migrate comes from the same source module below.
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
import { migrate } from "../../packages/db/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { applyForwardStep, replayForwardChain, type ChainStep } from "../../packages/db/src/migration-forward-chain.js";
import { parseN1Header, type N1Declaration } from "../../packages/db/src/migration-n1.js";
import { seedInstalledAuth106 } from "../support/auth106.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * One transaction per forward step (side-by-side spec 2026-10-21 §5, "Each step runs on its own"; plan A, task A6,
 * Review Focus 1 and 2). migrate() takes the schema-migrations advisory lock for its session, runs a prologue
 * transaction (the base recipe, 0108, 0110, the replay of every applied chain step), then each pending step in its own
 * transaction with SET LOCAL lock_timeout = '2s', five tries, a 2 s pause, then MIGRATION_LOCK_TIMEOUT. CI skips this
 * directory; run it alone.
 */
const SIDE_BY_SIDE = "0123_side_by_side_releases.sql";
/** Row-level security (mission row-level-security, SPEC-v4 R26): a chain step after 0123, the one before the last. */
const RLS = "0130_row_level_security.sql";
/** The V4 account memory (owner rulings N7 and N11): the chain's sixth step from the end since the Perplexity plan's two, 0134, 0135 and 0136. */
const V4 = "0131_v4_account_memory.sql";
/** The Perplexity plan's web evidence store and investigations (task W1-3): the two steps before the last three. */
const WEB = "0132_web_evidence.sql";
const INVESTIGATIONS = "0133_investigations.sql";
/** The dig model and the month pause (dig-model revision task W2-8): the third step from the end. */
const DIG_MODEL = "0134_dig_model_and_month_pause.sql";
/** A dig's picks and its path rewrite's material (dig-model revision task W3-7): the step before the last. */
const DIG_PICKS = "0135_dig_picks.sql";
/** The investigation's final report (R22 task W5-1): seven steps from the end. */
const INVESTIGATION_REPORTS = "0136_investigation_reports.sql";
/** The public debates (R22 F1, decision 13): six steps from the end. */
const PUBLIC_DEBATES = "0137_public_debates.sql";
/** The tree updates (R22 F1, decisions 2, 3 and 5): five steps from the end. */
const TREE_UPDATES = "0138_tree_updates.sql";
/** The passage retention (R22 F1, decisions 6 and 7): four steps from the end. */
const PASSAGE_RETENTION = "0139_passage_retention.sql";
/** The funded spend kinds (R22 F1, decision 14): five steps from the end. */
const SPEND_KINDS = "0140_internal_spend_kinds.sql";
/** The path suggestions (R22 decision 9): four steps from the end. */
const PATH_SUGGESTIONS = "0141_path_suggestions.sql";
/** The team's one limit (R22 decisions 14 and 24): four steps from the end. */
const TEAM_LIMIT = "0142_team_limit.sql";
/** The hand-over of a paused debate (R22 decision 12): three steps from the end. */
const RUN_HANDOVER = "0143_run_handover.sql";
/** The small AI's quota charge at step 2 (R22 decisions 29 and 31): two steps from the end. */
const ASK_CLARIFY_CHARGE = "0144_ask_clarify_charge.sql";
/** The pages waiting after "Add to researched" (W4-4): the chain's last step. */
const WEB_RESEARCHED_UNSETTLED = "0145_web_researched_unsettled.sql";
/** The Owner's allowances for team members (R22 decision 32): three steps from the end. */
const TEAM_ALLOWANCES = "0146_team_allowances.sql";
/** The public tree (R22 decisions 13 and 22). */
const PUBLIC_TREE = "0147_public_tree.sql";
/** Erasing an account keeps a public debate (R22 decision 21): the chain's last step. */
const ERASURE_KEEPS_PUBLIC = "0148_erasure_keeps_public.sql";
const PUBLIC_REPORT_TEAM_MONTH = "0149_public_report_team_month.sql";
const PUBLIC_REVIEW = "0150_public_review.sql";
const PUBLIC_FLAG = "0151_public_flag.sql";
const REPORT_EXPORT = "0152_report_export_and_check_usage.sql";
const DIG_TREE_SETTLED = "0153_dig_tree_settled.sql";
const REGION_WIDEN = "0154_region_iceland_liechtenstein.sql";
const OWNER_ANSWER_WRITES = "0155_owner_answer_writes.sql";
const MODERATION_NOTICE = "0156_moderation_notice.sql";
const MODERATION_STATEMENTS = "0157_moderation_statements.sql";
const PRE_START_CHARGE = "0158_pre_start_charge.sql";
const START_PATHS = "0159_start_paths.sql";
const PATH_RESULTS = "0160_path_results.sql";
const PATH_PROGRESS = "0161_path_progress.sql";
const SAVED_QUESTIONS = "0162_saved_questions.sql";
const CARRY_ON_DIGS = "0163_carry_on_session_free_digs.sql";
const PATH_ADDED = "0164_main_answer_path_added.sql";
const PRE_START_RELEASE = "0165_pre_start_release.sql";
const MAIN_ANSWER_TIMES = "0166_main_answer_times.sql";
const PUBLIC_REPORT_OWN_CARRIER = "0167_public_report_own_carrier.sql";
const SET_ASIDE_CONTINUE = "0168_set_aside_continue.sql";
const PIECE_SETTINGS_VERSION = "0169_piece_settings_version.sql";
/** The daily outbound mail limit (owner's rulings of 2026-11-01; built as 0153 on dev, #234): the step before the last. */
const OUTBOUND_MAIL = "0170_outbound_mail_limit.sql";
/** The security review's fixes in the database: the chain's last step. */
const SECURITY_REVIEW = "0171_security_review_hardening.sql";
const EXPAND: N1Declaration = Object.freeze({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
/** A later step with constant digests, as forward-chain-replay-verifiers.test.ts builds its probes, plus its n1 header. */
function probe(previous: ChainStep, name: string, sql: string, n1: N1Declaration = EXPAND): ChainStep {
  return Object.freeze({
    name, version: `${name}-v1`, manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql,
    previousName: previous.name, previousManifestSha256: previous.manifestSha256, previousVerifierSha256: previous.verifierSha256,
    verifierPath: previous.verifierPath, verifierSha256: previous.verifierSha256, verifierSql: previous.verifierSql,
    postconditionEvidence: async () => "d".repeat(64), n1
  });
}
const extendedBy = (make: (last: ChainStep) => ChainStep) => (steps: readonly unknown[]): readonly unknown[] =>
  [...steps, make(steps.at(-1) as ChainStep)];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let db: TestDatabase;
const ledger = async (): Promise<string[]> =>
  (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name")).rows.map((row) => row.name);
const receipts = async (): Promise<string[]> =>
  (await db.pool.query<{ source_name: string }>("SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name")).rows.map((row) => row.source_name);
afterEach(() => { chain.shape = undefined; vi.restoreAllMocks(); });

describe("Review Focus 1: a step that fails (or a kill) between steps", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    // An installed Auth106 database: migrate() records the 0093 compatibility resolution, and a chain step that moves
    // its evidence (0115) re-seals it, so a stale re-seal would be refused by the next run (MIGRATION_RESOLUTION_BINDING_DRIFT).
    await seedInstalledAuth106(db.pool);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });

  it("a failing step leaves every earlier step committed", async () => {
    const real = (await loadMigrationPlan()).forwardChain.map((step) => step.name);
    expect(real).toHaveLength(61);
    expect(real.at(-42)).toBe(RLS);
    expect(real.at(-41)).toBe(V4);
    expect(real.at(-40)).toBe(WEB);
    expect(real.at(-39)).toBe(INVESTIGATIONS);
    expect(real.at(-38)).toBe(DIG_MODEL);
    expect(real.at(-37)).toBe(DIG_PICKS);
    expect(real.at(-36)).toBe(INVESTIGATION_REPORTS);
    expect(real.at(-35)).toBe(PUBLIC_DEBATES);
    expect(real.at(-34)).toBe(TREE_UPDATES);
    expect(real.at(-33)).toBe(PASSAGE_RETENTION);
    expect(real.at(-32)).toBe(SPEND_KINDS);
    expect(real.at(-31)).toBe(PATH_SUGGESTIONS);
    expect(real.at(-30)).toBe(TEAM_LIMIT);
    expect(real.at(-29)).toBe(RUN_HANDOVER);
    expect(real.at(-28)).toBe(ASK_CLARIFY_CHARGE);
    expect(real.at(-27)).toBe(WEB_RESEARCHED_UNSETTLED);
    expect(real.at(-26)).toBe(TEAM_ALLOWANCES);
    expect(real.at(-25)).toBe(PUBLIC_TREE);
    expect(real.at(-24)).toBe(ERASURE_KEEPS_PUBLIC);
    expect(real.at(-23)).toBe(PUBLIC_REPORT_TEAM_MONTH);
    expect(real.at(-22)).toBe(PUBLIC_REVIEW);
    expect(real.at(-21)).toBe(PUBLIC_FLAG);
    expect(real.at(-20)).toBe(REPORT_EXPORT);
    expect(real.at(-19)).toBe(DIG_TREE_SETTLED);
    expect(real.at(-18)).toBe(REGION_WIDEN);
    expect(real.at(-17)).toBe(OWNER_ANSWER_WRITES);
    expect(real.at(-16)).toBe(MODERATION_NOTICE);
    expect(real.at(-15)).toBe(MODERATION_STATEMENTS);
    expect(real.at(-14)).toBe(PRE_START_CHARGE);
    expect(real.at(-13)).toBe(START_PATHS);
    expect(real.at(-12)).toBe(PATH_RESULTS);
    expect(real.at(-11)).toBe(PATH_PROGRESS);
    expect(real.at(-10)).toBe(SAVED_QUESTIONS);
    expect(real.at(-9)).toBe(CARRY_ON_DIGS);
    expect(real.at(-8)).toBe(PATH_ADDED);
    expect(real.at(-7)).toBe(PRE_START_RELEASE);
    expect(real.at(-6)).toBe(MAIN_ANSWER_TIMES);
    expect(real.at(-5)).toBe(PUBLIC_REPORT_OWN_CARRIER);
    expect(real.at(-4)).toBe(SET_ASIDE_CONTINUE);
    expect(real.at(-3)).toBe(PIECE_SETTINGS_VERSION);
    expect(real.at(-2)).toBe(OUTBOUND_MAIL);
    expect(real.at(-1)).toBe(SECURITY_REVIEW);
    chain.shape = extendedBy((last) => probe(last, "0199_probe_fail.sql", "SELECT 1/0"));
    await expect(migrate(db.pool)).rejects.toMatchObject({ code: "22012" });
    chain.shape = undefined;
    // All sixty-one real steps were applied by that same run and stay committed; the probe left nothing.
    expect(await receipts()).toEqual(real);
    expect((await db.pool.query("SELECT count(*)::int AS n FROM public.debateai_schema_migration_step")).rows[0].n).toBe(61);
    expect(await ledger()).toEqual(expect.arrayContaining(real));
    expect(await ledger()).not.toContain("0199_probe_fail.sql");
    // The next run continues where the last one stopped: everything replays, nothing is left to apply.
    await migrate(db.pool);
    expect(await receipts()).toEqual(real);
  }, 300_000);
});

/**
 * Security review F2 (0171): a dig is known by its own row (identity.dig_run), which every dig's run is created with from 0171 on. A dig made before
 * the step has only the records it left (its link to its parent, its place in an investigation under its parent, its picks, its public
 * contribution), and its parent's erasure takes the first two, so the step marks each such dig as it applies, by its run's owner now, leaving out a
 * run that was erased and an owner that is gone. Nothing published is touched (the operator's step, migrations/lineage/README.md).
 */
describe("0171's backfill: a dig made before the step has its own row after it, and stays a dig when its parent is erased", () => {
  let seq = 8_800_000;
  beforeAll(async () => {
    db = await startTestDatabase();
    chain.shape = (steps) => steps.slice(0, (steps as readonly ChainStep[]).findIndex((step) => step.name === SECURITY_REVIEW));
    try { await migrate(db.pool); } finally { chain.shape = undefined; }
    expect(await ledger()).toContain(DIG_TREE_SETTLED);
    expect(await ledger()).not.toContain(SECURITY_REVIEW);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });

  /** Rows as the steps before 0171 left them, written past their guards and keys (the tests' own seeding). */
  async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = 'replica'");
      for (const [sql, values] of statements) await client.query(sql, [...values]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async function account(): Promise<string> {
    const userId = randomUUID();
    await db.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `backfill-${userId}`]);
    return (await db.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  }
  /** A debate of `owner`'s (any id: an erased account's owner too), as its run row and its ownership event. */
  async function debate(owner: string): Promise<string> {
    const runId = randomUUID();
    seq += 1;
    await seeded([[`INSERT INTO core.run
        (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
         depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
         question_blind_index_version,content_encryption_version)
        VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low','{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,
         'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner}`, randomUUID(), seq]],
      ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner, seq]]]);
    return runId;
  }
  const marks = async (): Promise<ReadonlyArray<Readonly<{ run_id: string; owner_ref: string }>>> =>
    (await db.pool.query<{ run_id: string; owner_ref: string }>("SELECT run_id::text, owner_ref::text FROM identity.dig_run ORDER BY run_id")).rows;
  const isDig = async (runId: string): Promise<boolean> =>
    (await db.pool.query<{ dig: boolean }>("SELECT identity.run_is_dig($1) AS dig", [runId])).rows[0]!.dig;

  it("marks the link-only, member-only, picks and public digs by their run's owner now, leaves out an erased run and a gone owner, and the marks outlive the parent", async () => {
    const owner = await account();
    const heir = await account();
    const parent = await debate(owner);
    const [linked, member, picked, contributed, erased, handedOver] = await Promise.all([debate(owner), debate(owner), debate(owner), debate(owner),
      debate(owner), debate(owner)]);
    const orphaned = await debate(randomUUID());
    const investigationId = randomUUID();
    const publicationRef = randomUUID();
    seq += 1;
    await seeded([
      // A dig whose link alone was written (the page's own call after a join that did not take), and one whose link was all it had, then erased.
      ...[linked, erased].map((dig) => ["INSERT INTO identity.dig_link (child_run_id,owner_ref,parent_run_id,places,mode) VALUES ($1,$2,$3,'{}','quick')",
        [dig, owner, parent]] as const),
      ["INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES ($1,clock_timestamp(),1,0)", [erased]],
      // A dig that is a member of its parent's investigation alone.
      ["INSERT INTO identity.investigation (investigation_id,owner_ref,root_run_id,state) VALUES ($1,$2,$3,'open')", [investigationId, owner, parent]],
      ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref) VALUES ($1,$2,$3)", [parent, investigationId, owner]],
      ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref,parent_run_id,mode) VALUES ($1,$2,$3,$4,'quick')", [member, investigationId, owner, parent]],
      // A dig with its picks, and one whose picks stayed when its run changed hands since (its row names its owner now).
      ...[picked, handedOver].map((dig) => ["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,pick_count) VALUES ($1,$2,$3,0)", [dig, owner, parent]] as const),
      ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [handedOver, heir, seq]],
      // A public dig whose contribution was written, and one whose account was erased since (0137 sets the contribution's owner to none).
      ["INSERT INTO identity.public_contribution (dig_run_id,owner_ref,publication_ref,root_run_id,parent_run_id) VALUES ($1,$2,$3,$4,$4)", [contributed, owner, publicationRef, parent]],
      ["INSERT INTO identity.public_contribution (dig_run_id,owner_ref,publication_ref,root_run_id,parent_run_id) VALUES ($1,NULL,$2,$3,$3)", [orphaned, publicationRef, parent]]
    ]);
    // The step applies over them.
    await migrate(db.pool);
    expect(await ledger()).toContain(SECURITY_REVIEW);
    const expected = [...[linked, member, picked, contributed].map((run_id) => ({ run_id, owner_ref: owner })), { run_id: handedOver, owner_ref: heir }]
      .sort((left, right) => left.run_id.localeCompare(right.run_id));
    expect(await marks()).toEqual(expected);
    expect([await isDig(parent), await isDig(orphaned)]).toEqual([false, true]);
    // The parent erased as a deletion finishes it: its tombstone, then its per-debate forgets, which take its links and its investigation.
    await seeded([["INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES ($1,clock_timestamp(),1,0)", [parent]]]);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      for (const forget of ["page_memory", "investigation"]) await client.query(`SELECT identity.forget_erased_debate_${forget}($1)`, [parent]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    expect(Number((await db.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.dig_link WHERE parent_run_id=$1", [parent])).rows[0]!.n)).toBe(0);
    expect(Number((await db.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.investigation_member WHERE run_id=$1", [member])).rows[0]!.n)).toBe(0);
    for (const dig of [linked, member, picked, contributed, handedOver]) expect(await isDig(dig), dig).toBe(true);
    // Applied again (the next migrate()), nothing moves.
    await migrate(db.pool);
    expect(await marks()).toEqual(expected);
  }, 300_000);
});

describe("Review Focus 2: a page read holding a lock on core.run while 0123's ALTER waits", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    // The database a release before 0123 leaves: the chain up to 0123 (then the settings activation 0124, the
    // Italy-specific approval 0125, synthesis-flag's 0126 to 0129, row-level security's 0130, the V4 account memory
    // 0131, the Perplexity plan's 0132 and 0133, the dig model's 0134, the dig picks' 0135 and the investigation reports'
    // 0136, which migrate() applies after 0123 and which take no lock on core.run: 0125 alters legal.acceptance only, 0131
    // to 0136 create identity tables, 0134 and 0136 also re-add CHECKs on ledger.model_spend, NOT VALID).
    chain.shape = (steps) => steps.slice(0, (steps as readonly ChainStep[]).findIndex((step) => step.name === SIDE_BY_SIDE));
    try { await migrate(db.pool); } finally { chain.shape = undefined; }
    expect(await ledger()).not.toContain(SIDE_BY_SIDE);
    expect(await ledger()).not.toContain(RLS);
    expect(await ledger()).not.toContain(V4);
    expect(await ledger()).not.toContain(INVESTIGATIONS);
    expect(await ledger()).not.toContain(DIG_MODEL);
    expect(await ledger()).not.toContain(DIG_PICKS);
    expect(await ledger()).not.toContain(INVESTIGATION_REPORTS);
    expect(await ledger()).not.toContain(PUBLIC_DEBATES);
    expect(await ledger()).not.toContain(TREE_UPDATES);
    expect(await ledger()).not.toContain(PASSAGE_RETENTION);
    expect(await ledger()).not.toContain(SPEND_KINDS);
    expect(await ledger()).not.toContain(PATH_SUGGESTIONS);
    expect(await ledger()).not.toContain(TEAM_LIMIT);
    expect(await ledger()).not.toContain(RUN_HANDOVER);
    expect(await ledger()).not.toContain(ASK_CLARIFY_CHARGE);
    expect(await ledger()).not.toContain(WEB_RESEARCHED_UNSETTLED);
    expect(await ledger()).not.toContain(TEAM_ALLOWANCES);
    expect(await ledger()).not.toContain(PUBLIC_TREE);
    expect(await ledger()).not.toContain(ERASURE_KEEPS_PUBLIC);
    expect(await ledger()).not.toContain(PUBLIC_REPORT_TEAM_MONTH);
    expect(await ledger()).not.toContain(PUBLIC_REVIEW);
    expect(await ledger()).not.toContain(PUBLIC_FLAG);
    expect(await ledger()).not.toContain(DIG_TREE_SETTLED);
    expect(await ledger()).not.toContain(REGION_WIDEN);
    expect(await ledger()).not.toContain(OWNER_ANSWER_WRITES);
    expect(await ledger()).not.toContain(MODERATION_NOTICE);
    expect(await ledger()).not.toContain(MODERATION_STATEMENTS);
    expect(await ledger()).not.toContain(PRE_START_CHARGE);
    expect(await ledger()).not.toContain(START_PATHS);
    expect(await ledger()).not.toContain(PATH_RESULTS);
    expect(await ledger()).not.toContain(PATH_PROGRESS);
    expect(await ledger()).not.toContain(SAVED_QUESTIONS);
    expect(await ledger()).not.toContain(CARRY_ON_DIGS);
    expect(await ledger()).not.toContain(PATH_ADDED);
    expect(await ledger()).not.toContain(PRE_START_RELEASE);
    expect(await ledger()).not.toContain(MAIN_ANSWER_TIMES);
    expect(await ledger()).not.toContain(PUBLIC_REPORT_OWN_CARRIER);
    expect(await ledger()).not.toContain(OUTBOUND_MAIL);
    expect(await ledger()).not.toContain(SECURITY_REVIEW);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });

  /** A page read: a transaction holding ACCESS SHARE on core.run, as any SELECT does until it ends. */
  async function holdCoreRun(): Promise<PoolClient> {
    const holder = await db.pool.connect();
    await holder.query("BEGIN");
    await holder.query("LOCK TABLE core.run IN ACCESS SHARE MODE");
    return holder;
  }
  /** Resolves once 0123's ALTER TABLE core.run is queued for its lock. */
  async function alterWaiting(): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const waiting = (await db.pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='core.run'::regclass AND mode='AccessExclusiveLock' AND NOT granted) AS waiting")).rows[0]!.waiting;
      if (waiting) return;
      await sleep(25);
    }
    throw new Error("ALTER_NEVER_WAITED");
  }
  const retryLines = (warn: Readonly<{ mock: Readonly<{ calls: readonly (readonly unknown[])[] }> }>): unknown[] =>
    warn.mock.calls.map((call) => call[0]).filter((line) => String(line).startsWith("[MIGRATION_LOCK_RETRY]"));

  it("a held lock: five short waits, then MIGRATION_LOCK_TIMEOUT", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const holder = await holdCoreRun();
    try {
      const started = Date.now();
      const attempt = migrate(db.pool).then(() => "NOT_REFUSED", (error: unknown) => error);
      // A third reader, started 1 s into the attempt and while the ALTER waits, queues behind it for at most one try.
      await sleep(1000);
      await alterWaiting();
      const reader = await db.pool.connect();
      try {
        await reader.query("SET statement_timeout = '3s'");
        expect((await reader.query<{ n: number }>("SELECT count(*)::int AS n FROM core.run")).rows[0]!.n).toBeGreaterThanOrEqual(0);
        await reader.query("RESET statement_timeout");
      } finally { reader.release(); }
      const refusal = await attempt;
      const elapsed = Date.now() - started;
      expect(refusal).toMatchObject({ code: "MIGRATION_LOCK_TIMEOUT", message: `MIGRATION_LOCK_TIMEOUT ${SIDE_BY_SIDE}` });
      // Five 2 s waits and four 2 s pauses.
      expect(elapsed).toBeGreaterThanOrEqual(16_000);
      expect(elapsed).toBeLessThan(40_000);
      expect(retryLines(warn)).toEqual([1, 2, 3, 4].map((n) => `[MIGRATION_LOCK_RETRY] ${SIDE_BY_SIDE} try ${n}/5`));
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    // Nothing of that step remains: no ledger row, no receipt, no column.
    expect(await ledger()).not.toContain(SIDE_BY_SIDE);
    expect(await receipts()).not.toContain(SIDE_BY_SIDE);
    expect((await db.pool.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='core.run'::regclass AND attname='release_key'")).rows[0].n).toBe(0);
  }, 120_000);

  it("the step goes through once the lock is released", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const holder = await holdCoreRun();
    let attempt: Promise<unknown> | undefined;
    try {
      attempt = migrate(db.pool);
      await alterWaiting();
      await sleep(3000);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    await attempt;
    expect(await ledger()).toContain(SIDE_BY_SIDE);
    expect(await receipts()).toContain(SIDE_BY_SIDE);
    expect(retryLines(warn)).toContain(`[MIGRATION_LOCK_RETRY] ${SIDE_BY_SIDE} try 1/5`);
  }, 120_000);

  it("an outside-transaction step is recorded only over a valid index of its own table (A6 review)", async () => {
    // applyForwardStep alone, as migrate() runs it after runOutsideTransactionStep: here the build never ran, or left an
    // invalid index, or an index of that name sits on another table. Each is refused and leaves no ledger row or receipt.
    const name = "0199_probe_index_check.sql";
    const sql = "-- probe (side-by-side §5)\n-- n1: expand\n-- n1: keeps-verifier\n-- n1: outside-transaction\n"
      + "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_check_idx ON core.run (created_at_seq);\n";
    const real = await loadMigrationPlan();
    const step = probe(real.forwardChain.at(-1)!, name, sql, parseN1Header(name, sql));
    const extended = { ...real, forwardChain: Object.freeze([...real.forwardChain, step]) };
    const recordAlone = async (): Promise<unknown> => {
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const done = await replayForwardChain(client, extended, new Set(await ledger()));
        await applyForwardStep(client, extended, step, done);
        await client.query("COMMIT");
        return "NOT_REFUSED";
      } catch (error) {
        await client.query("ROLLBACK");
        return error;
      } finally { client.release(); }
    };
    const refused = { code: "MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID", message: `MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID ${name}` };
    try {
      expect(await recordAlone()).toMatchObject(refused);
      await db.pool.query("CREATE INDEX probe_check_idx ON core.run (created_at_seq)");
      await db.pool.query("UPDATE pg_index SET indisvalid=false WHERE indexrelid='core.probe_check_idx'::regclass");
      expect(await recordAlone()).toMatchObject(refused);
      await db.pool.query("DROP INDEX core.probe_check_idx");
      await db.pool.query("CREATE INDEX probe_check_idx ON core.work_item (run_id)");
      expect(await recordAlone()).toMatchObject(refused);
      expect(await ledger()).not.toContain(name);
      expect(await receipts()).not.toContain(name);
      // Over a valid index of its own table the same step is recorded.
      await db.pool.query("DROP INDEX core.probe_check_idx");
      await db.pool.query("CREATE INDEX probe_check_idx ON core.run (created_at_seq)");
      expect(await recordAlone()).toBe("NOT_REFUSED");
      expect(await receipts()).toContain(name);
    } finally {
      await db.pool.query("DELETE FROM public.debateai_schema_migration_step_n1 WHERE source_name=$1", [name]);
      await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name=$1", [name]);
      await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name=$1", [name]);
      await db.pool.query("DROP INDEX IF EXISTS core.probe_check_idx");
    }
  }, 120_000);

  it("an outside-transaction step builds its index concurrently", async () => {
    const name = "0199_probe_concurrent_index.sql";
    const sql = "-- probe (side-by-side §5)\n-- n1: expand\n-- n1: keeps-verifier\n-- n1: outside-transaction\n"
      + "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_run_seq_idx ON core.run (created_at_seq);\n";
    chain.shape = extendedBy((last) => probe(last, name, sql, parseN1Header(name, sql)));
    const index = async (): Promise<{ oid: string; valid: boolean } | undefined> => (await db.pool.query<{ oid: string; valid: boolean }>(
      "SELECT indexrelid::text AS oid, indisvalid AS valid FROM pg_index WHERE indexrelid=to_regclass('core.probe_run_seq_idx')")).rows[0];
    await migrate(db.pool);
    const built = await index();
    expect(built?.valid).toBe(true);
    expect(await receipts()).toContain(name);
    expect(await ledger()).toContain(name);
    // A build interrupted after its catalog row (an INVALID index left behind) and never recorded (no receipt, no
    // ledger row, no declaration row: side-by-side §5 writes all three in the step's transaction): the next run drops
    // the invalid index concurrently, builds it again and records the step.
    await db.pool.query("UPDATE pg_index SET indisvalid=false WHERE indexrelid='core.probe_run_seq_idx'::regclass");
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step_n1 WHERE source_name=$1", [name]);
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name=$1", [name]);
    await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name=$1", [name]);
    await migrate(db.pool);
    const rebuilt = await index();
    expect(rebuilt?.valid).toBe(true);
    expect(rebuilt?.oid).not.toBe(built?.oid);
    expect(await receipts()).toContain(name);
    expect(await ledger()).toContain(name);
  }, 120_000);
});
