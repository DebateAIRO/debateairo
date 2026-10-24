import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LANGUAGE_CHECK_SPEND_WRITER,
  PostgresModelSpendStore,
  costEnvelopeDay,
  languageCheckSpendWriterPresent,
  recordLanguageCheckSpend
} from "@debateai/budget";
import { RunRepository, migrate } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0118 (question-language spec 2026-10-13, plan P2L Task 19): the fast language check's cost is a SITE cost in the
 * day's pot (`readDaySpentMicros`), written before any debate exists, by ONE writer: the SECURITY DEFINER function
 * `ledger.record_language_check_spend`, which the API's runtime role may execute (pre-flight PF-L58, option (a)).
 * Embedded Postgres; run this file alone.
 */
let database: TestDatabase;
/** The writer accepts UTC today +-1 only (fix round 2), so every day here is relative to now. */
const dayOffset = (days: number): string => costEnvelopeDay(new Date(Date.now() + days * 86_400_000));
const TODAY = dayOffset(0);
const PROVIDER = "language-check:anthropic:claude-haiku-5-5";
/**
 * Row-level security (0124, D29): a system login holds debateai_runtime and the cross-account marker (the runner's
 * shape); the bare runtime role with no account context may write no row that names no run of its account.
 */
const RUNTIME_TWIN = "language_check_runtime_twin";

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createSystemTwin(database, RUNTIME_TWIN, ["debateai_runtime"]);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

async function createLegacyRun(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Is a language check a run's charge?",
    principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

/** One client acting as the API's runtime role (or `role`) for `work`; the role is reset before the client goes back. */
async function asRuntime<T>(work: (client: { query: TestDatabase["pool"]["query"] }) => Promise<T>, role = "debateai_runtime"): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await work(client as never);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}

describe("0118: the language check's site cost (one writer, the day's pot)", () => {
  it("the boot probe sees the one writer once 0118 is applied", async () => {
    expect(LANGUAGE_CHECK_SPEND_WRITER).toBe("ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)");
    expect(await asRuntime((client) => languageCheckSpendWriterPresent(client))).toBe(true);
  });

  it("fix round 1: the probe is false for a role that may not EXECUTE the writer, and false when the writer is absent", async () => {
    // debateai_replay may read ledger.model_spend but holds no EXECUTE on the writer.
    const client = await database.pool.connect();
    try {
      await client.query("SET ROLE debateai_replay");
      expect(await languageCheckSpendWriterPresent(client)).toBe(false);
      await client.query("RESET ROLE");
      // The writer absent (dropped inside a transaction that is rolled back): false, for the runtime role too.
      await client.query("BEGIN");
      await client.query(`DROP FUNCTION ${LANGUAGE_CHECK_SPEND_WRITER}`);
      await client.query("SET LOCAL ROLE debateai_runtime");
      expect(await languageCheckSpendWriterPresent(client)).toBe(false);
      await client.query("ROLLBACK");
    } finally {
      await client.query("RESET ROLE").catch(() => undefined);
      client.release();
    }
    expect(await asRuntime((runtime) => languageCheckSpendWriterPresent(runtime))).toBe(true);
  });

  it("the runtime role records one check through the function, and the day's pot grows by its charge", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const before = await store.readDaySpentMicros(TODAY);
    const spendId = randomUUID();
    await asRuntime((client) => client.query("SELECT ledger.record_language_check_spend($1::uuid,$2,$3::date,$4,$5,$6)",
      [spendId, PROVIDER, TODAY, 85, 310, 28]));
    expect(await store.readDaySpentMicros(TODAY)).toBe(before + 85);
    const row = (await database.pool.query("SELECT spend_source, run_id, spend_phase, attempt_id, provider_ref, charge_micros::int, input_tokens::int, output_tokens::int FROM ledger.model_spend WHERE spend_id=$1", [spendId])).rows[0];
    expect(row).toEqual({ spend_source: "LANGUAGE_CHECK", run_id: null, spend_phase: null, attempt_id: null,
      provider_ref: "language-check:anthropic:claude-haiku-5-5", charge_micros: 85, input_tokens: 310, output_tokens: 28 });
  });

  it("the typed writer is the same call, and a second record of the same check is refused (append-only, one id)", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const tomorrow = dayOffset(1);
    const before = await store.readDaySpentMicros(tomorrow);
    const entry = { spendId: randomUUID(), providerRef: PROVIDER, chargedOn: tomorrow, chargeMicros: 45, inputTokens: 310, outputTokens: 28 };
    await asRuntime((client) => recordLanguageCheckSpend(client, entry));
    expect(await store.readDaySpentMicros(tomorrow)).toBe(before + 45);
    await expect(asRuntime((client) => recordLanguageCheckSpend(client, entry))).rejects.toThrow(/model_spend_pkey/u);
    // A run-scoped reader never sees it: no run, no phase.
    expect((await database.pool.query("SELECT count(*)::int n FROM ledger.model_spend WHERE spend_source='LANGUAGE_CHECK' AND (run_id IS NOT NULL OR spend_phase IS NOT NULL)")).rows[0].n).toBe(0);
  });

  it("the function refuses what the table refuses: a negative charge or token count", async () => {
    for (const [charge, input, output] of [[-1, 1, 1], [1, -1, 1], [1, 1, -1]] as const) {
      await expect(asRuntime((client) => client.query("SELECT ledger.record_language_check_spend($1::uuid,$2,$3::date,$4,$5,$6)",
        [randomUUID(), PROVIDER, TODAY, charge, input, output]))).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("fix round 2: the writer takes UTC today +-1 only, and a provider reference of the code shape only (23514)", async () => {
    const call = (provider: string | null, day: string) => asRuntime((client) => client.query(
      "SELECT ledger.record_language_check_spend($1::uuid,$2,$3::date,1,1,1)", [randomUUID(), provider, day]));
    await call(PROVIDER, dayOffset(-1));
    await call(PROVIDER, dayOffset(1));
    await call("language-check:anthropic:claude-haiku-5-5.v2/x_y", TODAY);
    for (const day of [dayOffset(-2), dayOffset(2), "2020-01-01"]) {
      await expect(call(PROVIDER, day)).rejects.toMatchObject({ code: "23514", message: "LANGUAGE_CHECK_SPEND_INVALID" });
    }
    for (const provider of [" ", null, "support:claude-haiku-5-5", "language-check:Anthropic:claude", "language-check:anthropic:",
      `language-check:anthropic:${"m".repeat(129)}`, "language-check:anthropic:has space", "language-check:anthropic:x\nAr trebui"]) {
      await expect(call(provider, TODAY)).rejects.toMatchObject({ code: "23514", message: "LANGUAGE_CHECK_SPEND_INVALID" });
    }
  });

  it("fix round 2: option (a) in the database — a raw INSERT of a LANGUAGE_CHECK row is refused for the runtime role and for anyone but the writer's owner", async () => {
    const raw = `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'LANGUAGE_CHECK',NULL,$2,$3::date,1,1,1)`;
    await expect(asRuntime((client) => client.query(raw, [randomUUID(), PROVIDER, TODAY])))
      .rejects.toMatchObject({ code: "42501", message: "LANGUAGE_CHECK_SPEND_WRITER_ONLY" });
    // The migration owner (this database's superuser) too: only the writer's owner, inside the writer, may.
    await expect(database.pool.query(raw, [randomUUID(), PROVIDER, TODAY]))
      .rejects.toMatchObject({ code: "42501", message: "LANGUAGE_CHECK_SPEND_WRITER_ONLY" });
    // On a system login (RUNTIME_TWIN), whose row-level security admits the row, the guard alone refuses it.
    await expect(asRuntime((client) => client.query(raw, [randomUUID(), PROVIDER, TODAY]), RUNTIME_TWIN))
      .rejects.toMatchObject({ code: "42501", message: "LANGUAGE_CHECK_SPEND_WRITER_ONLY" });
    // The runtime role's other sources are untouched by the guard (on the system login; row-level security, 0124).
    const other = `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on,
      charge_micros, input_tokens, output_tokens) VALUES ($1,'SUPPORT',NULL,'support:x',$2::date,1,1,1)`;
    await asRuntime((client) => client.query(other, [randomUUID(), TODAY]), RUNTIME_TWIN);
    // The bare runtime role with no account context may not write a row that names no run of its account.
    await expect(asRuntime((client) => client.query(other, [randomUUID(), TODAY])))
      .rejects.toMatchObject({ code: "42501", message: 'new row violates row-level security policy for table "model_spend"' });
  });

  it("a LANGUAGE_CHECK row that names a run, a phase or an attempt is refused by the CHECK, even as the writer's owner", async () => {
    const runId = await createLegacyRun();
    const asOwner = async (sql: string, values: unknown[]) => {
      const client = await database.pool.connect();
      try {
        await client.query("SET ROLE debateai_staff_security_owner");
        return await client.query(sql, values);
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    };
    const insert = (column: string, value: string) => asOwner(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, ${column})
       VALUES ($1,'LANGUAGE_CHECK',$2,$3::date,1,1,1,$4)`, [randomUUID(), PROVIDER, TODAY, value]);
    await expect(insert("run_id", runId)).rejects.toThrow(/model_spend_language_check_is_runless/u);
    await expect(insert("spend_phase", "BODY")).rejects.toThrow(/model_spend_language_check_is_runless|model_spend_phase_is_a_run_charge/u);
    await expect(insert("attempt_id", randomUUID())).rejects.toThrow(/model_spend_language_check_is_runless/u);
    // A source outside the widened list is still refused.
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'LANGUAGE',NULL,'p',$2::date,1,1,1)`, [randomUUID(), TODAY]
    )).rejects.toThrow(/model_spend_spend_source_check/u);
  });

  it("recordSpend refuses LANGUAGE_CHECK (the function is the one writer, PF-L58), and a RUN charge still needs its run", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const base = { spendId: randomUUID(), runId: null, providerRef: PROVIDER, chargedOn: TODAY,
      chargeMicros: 1, inputTokens: 1, outputTokens: 1 };
    await expect(store.recordSpend({ ...base, spendSource: "LANGUAGE_CHECK" })).rejects.toMatchObject({ code: "MODEL_SPEND_LANGUAGE_CHECK_FUNCTION_ONLY" });
    await expect(store.recordSpend({ ...base, spendSource: "RUN" })).rejects.toMatchObject({ code: "MODEL_SPEND_RUN_REQUIRED" });
    expect((await database.pool.query("SELECT count(*)::int n FROM ledger.model_spend WHERE spend_id=$1", [base.spendId])).rows[0].n).toBe(0);
  });

  it("only the runtime role may execute the writer; the function runs as the spend writers' owner, never PUBLIC", async () => {
    const acl = (await database.pool.query(`SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
        has_function_privilege('debateai_runtime', p.oid, 'EXECUTE') AS runtime,
        has_function_privilege('debateai_replay', p.oid, 'EXECUTE') AS replay,
        has_function_privilege('debateai_staff_recovery', p.oid, 'EXECUTE') AS recovery,
        EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
      FROM pg_proc p WHERE p.oid=to_regprocedure($1)`, [LANGUAGE_CHECK_SPEND_WRITER])).rows[0];
    expect(acl).toEqual({ owner: "debateai_staff_security_owner", prosecdef: true, proconfig: ["search_path=pg_catalog"],
      runtime: true, replay: false, recovery: false, public: false });
  });
});

/**
 * Whole-branch review I-3, ruling W-0117: 0118's postcondition pins only what 0118 owns (its writer, its guard and the
 * guard's trigger, and its own run-less CHECK). The source list `model_spend_spend_source_check` is 0074's, shared by
 * every spend source: 0118 widens it, but a later migration that widens it again must not stop every migrate() with a
 * postcondition drift on 0118.
 */
describe("0118's postcondition pins only what 0118 owns (W-0117)", () => {
  const LANGUAGE_CHECK_STEP = "0118_language_check_spend.sql";
  const constraintDef = async (name: string): Promise<string> => (await database.pool.query<{ def: string }>(
    "SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname=$1 AND conrelid='ledger.model_spend'::regclass", [name]
  )).rows[0]!.def;
  const replaceCheck = (name: string, definition: string): Promise<unknown> =>
    database.pool.query(`ALTER TABLE ledger.model_spend DROP CONSTRAINT ${name}, ADD CONSTRAINT ${name} ${definition}`);

  it("a later migration may widen the shared source list without a drift on 0118", async () => {
    const before = await constraintDef("model_spend_spend_source_check");
    expect(before).toContain("LANGUAGE_CHECK");
    await replaceCheck("model_spend_spend_source_check",
      "CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK', 'FUTURE_SOURCE'))");
    try {
      await migrate(database.pool);   // before W-0117: MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT 0118_language_check_spend.sql
    } finally {
      await replaceCheck("model_spend_spend_source_check", before);
    }
    await migrate(database.pool);
  }, 180_000);

  it("control: 0118's own run-less CHECK is still pinned", async () => {
    const before = await constraintDef("model_spend_language_check_is_runless");
    await replaceCheck("model_spend_language_check_is_runless", "CHECK (spend_source <> 'LANGUAGE_CHECK' OR run_id IS NULL)");
    try {
      await expect(migrate(database.pool)).rejects.toThrow(`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${LANGUAGE_CHECK_STEP}`);
    } finally {
      await replaceCheck("model_spend_language_check_is_runless", before);
    }
    await migrate(database.pool);
  }, 180_000);
});
