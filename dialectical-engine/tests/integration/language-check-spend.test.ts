import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LANGUAGE_CHECK_SPEND_WRITER,
  PostgresModelSpendStore,
  languageCheckSpendWriterPresent,
  recordLanguageCheckSpend
} from "@debateai/budget";
import { RunRepository, migrate } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0117 (question-language spec 2026-10-13, plan P2L Task 19): the fast language check's cost is a SITE cost in the
 * day's pot (`readDaySpentMicros`), written before any debate exists, by ONE writer: the SECURITY DEFINER function
 * `ledger.record_language_check_spend`, which the API's runtime role may execute (pre-flight PF-L58, option (a)).
 * Embedded Postgres; run this file alone.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
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

/** One client acting as the API's runtime role for `work`; the role is reset before the client goes back. */
async function asRuntime<T>(work: (client: { query: TestDatabase["pool"]["query"] }) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("SET ROLE debateai_runtime");
    return await work(client as never);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}

describe("0117: the language check's site cost (one writer, the day's pot)", () => {
  it("the boot probe sees the one writer once 0117 is applied", async () => {
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
    const before = await store.readDaySpentMicros("2026-10-13");
    const spendId = randomUUID();
    await asRuntime((client) => client.query("SELECT ledger.record_language_check_spend($1::uuid,$2,$3::date,$4,$5,$6)",
      [spendId, "language-check:anthropic:claude-haiku-5-5", "2026-10-13", 85, 310, 28]));
    expect(await store.readDaySpentMicros("2026-10-13")).toBe(before + 85);
    const row = (await database.pool.query("SELECT spend_source, run_id, spend_phase, attempt_id, provider_ref, charge_micros::int, input_tokens::int, output_tokens::int FROM ledger.model_spend WHERE spend_id=$1", [spendId])).rows[0];
    expect(row).toEqual({ spend_source: "LANGUAGE_CHECK", run_id: null, spend_phase: null, attempt_id: null,
      provider_ref: "language-check:anthropic:claude-haiku-5-5", charge_micros: 85, input_tokens: 310, output_tokens: 28 });
  });

  it("the typed writer is the same call, and a second record of the same check is refused (append-only, one id)", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const before = await store.readDaySpentMicros("2026-10-14");
    const entry = { spendId: randomUUID(), providerRef: "language-check:anthropic:claude-haiku-5-5", chargedOn: "2026-10-14",
      chargeMicros: 45, inputTokens: 310, outputTokens: 28 };
    await asRuntime((client) => recordLanguageCheckSpend(client, entry));
    expect(await store.readDaySpentMicros("2026-10-14")).toBe(before + 45);
    await expect(asRuntime((client) => recordLanguageCheckSpend(client, entry))).rejects.toThrow(/model_spend_pkey/u);
    // A run-scoped reader never sees it: no run, no phase.
    expect((await database.pool.query("SELECT count(*)::int n FROM ledger.model_spend WHERE spend_source='LANGUAGE_CHECK' AND (run_id IS NOT NULL OR spend_phase IS NOT NULL)")).rows[0].n).toBe(0);
  });

  it("the function refuses what the table refuses: a negative charge or token count, a blank provider", async () => {
    for (const [charge, input, output, provider] of [[-1, 1, 1, "language-check:x"], [1, -1, 1, "language-check:x"], [1, 1, -1, "language-check:x"], [1, 1, 1, " "]] as const) {
      await expect(asRuntime((client) => client.query("SELECT ledger.record_language_check_spend($1::uuid,$2,$3::date,$4,$5,$6)",
        [randomUUID(), provider, "2026-10-13", charge, input, output]))).rejects.toThrow();
    }
  });

  it("a LANGUAGE_CHECK row that names a run (or a phase) is refused by the CHECK, whoever writes it", async () => {
    const runId = await createLegacyRun();
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'LANGUAGE_CHECK',$2,'language-check:anthropic:claude-haiku-5-5','2026-10-13',1,1,1)`, [randomUUID(), runId]
    )).rejects.toThrow(/model_spend_language_check_is_runless/u);
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase)
       VALUES ($1,'LANGUAGE_CHECK',NULL,'language-check:anthropic:claude-haiku-5-5','2026-10-13',1,1,1,'BODY')`, [randomUUID()]
    )).rejects.toThrow(/model_spend_language_check_is_runless|model_spend_phase_is_a_run_charge/u);
    // A source outside the widened list is still refused.
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'LANGUAGE',NULL,'p','2026-10-13',1,1,1)`, [randomUUID()]
    )).rejects.toThrow(/model_spend_spend_source_check/u);
  });

  it("recordSpend refuses LANGUAGE_CHECK (the function is the one writer, PF-L58), and a RUN charge still needs its run", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const base = { spendId: randomUUID(), runId: null, providerRef: "language-check:anthropic:claude-haiku-5-5", chargedOn: "2026-10-13",
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
