import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { recordQuestionCheckSpend } from "@debateai/budget";
import { migrate, RunRepository } from "@debateai/db";
import { readPromptFrame } from "@debateai/providers";
import { judgeCallValue } from "../../apps/api/src/publication-check/verdict.js";
import { createQuestionCheck } from "../../apps/api/src/question-check/check.js";
import { QuestionCheckFailure, type QuestionCheckPort } from "../../apps/api/src/question-check/transport.js";
import { readQuestionSubjects } from "../../apps/api/src/question-check/subjects.js";
import { SUPPORT_RELAY_PROVIDER_REF } from "../../apps/api/src/support/model.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const identity = testHttpIdentity("s04-database-gate");
const question = "Should a private sentinel question lead to a debate?";
// V, 2026-10-28: the model answers the subject (or NONE) and whether the question is healthy; nothing is kept.
const labels = ["NONE healthy", "DRUGS healthy", "HARM_TO_OTHERS not", "WEAPONS_TERRORISM not", "DRUGS not", "CRIME not",
  "HATE_SPEECH not", "RELIGIOUS_INSULT not", "SUICIDE_AND_ASSISTED_DYING not", "OWN_CRISIS not", "SUICIDE_METHODS healthy",
  "QUESTION_CHECK_HTTP_STATUS"] as const;
const starts = (label: string) => label.endsWith(" healthy") && !label.startsWith("SUICIDE_METHODS");

async function asRuntime<T extends Record<string, unknown> = Record<string, unknown>>(
  statement: string, values: unknown[] = []
): Promise<T[]> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_runtime");
    const rows = (await client.query<T>(statement, values)).rows;
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function staffHolder(owner: boolean): Promise<void> {
  const userId = randomUUID(), staffId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user"
    (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
    [userId, createHash("sha256").update(userId).digest(), userId]);
  await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,state,capabilities)
    VALUES($1,$2,'ACTIVE',$3)`, [staffId,userId,owner
      ? ["TEAM_READ","TEAM_INVITE","TEAM_GRANT","TEAM_DISABLE","AUDIT_READ","EMERGENCY_DISABLE","PUBLICATION_REVIEW","THREAT_REPORT"]
      : ["THREAT_REPORT"]]);
  if (owner) await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffId]);
}

async function tableCounts(): Promise<Map<string, number>> {
  const tables = (await database.pool.query<{ schemaname: string; tablename: string }>(
    `SELECT schemaname,tablename FROM pg_tables
     WHERE schemaname IN ('core','serve','ledger','billing','staff') ORDER BY schemaname,tablename`
  )).rows;
  const statement = tables.map((table, index) =>
    `SELECT ${index} AS i, count(*)::int AS n FROM "${table.schemaname}"."${table.tablename}"`).join(" UNION ALL ");
  const counts = (await database.pool.query<{ i: number; n: number }>(statement)).rows;
  return new Map(counts.map(row => [`${tables[row.i]!.schemaname}.${tables[row.i]!.tablename}`, row.n]));
}

function delta(before: Map<string, number>, after: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...after].filter(([table, count]) => count !== before.get(table))
    .map(([table, count]) => [table, count - (before.get(table) ?? 0)]));
}

async function personSpend(): Promise<number> {
  const rows = (await database.pool.query<{ micros: string }>(`SELECT coalesce(sum(s.charge_micros),0)::text micros
    FROM ledger.model_spend s JOIN billing.run_charge_scope c ON c.run_id=s.run_id
    WHERE c.owner_ref=$1`, [identity.authenticated.ownerRef])).rows;
  return Number(rows[0]!.micros);
}

function serverFor(label: typeof labels[number], reports: { event: string; code: string }[]) {
  const port: QuestionCheckPort = {
    providerRef: SUPPORT_RELAY_PROVIDER_REF, modelId: "claude-haiku-5-5",
    complete: async ({ packet }) => {
      if (label === "QUESTION_CHECK_HTTP_STATUS") throw new QuestionCheckFailure(label);
      const [subject, health] = label.split(" ");
      return { text: JSON.stringify({ call: judgeCallValue(readPromptFrame(packet).fence), subject, healthy: health === "healthy" }),
        usage: { inputTokens: 3, outputTokens: 4 } };
    }
  };
  const check = createQuestionCheck({ subjects: readQuestionSubjects(), port: () => port, deadlineMs: 1_000,
    price: { input: 1, output: 2 }, dayPot: null, clock: () => new Date(),
    spend: { record: entry => recordQuestionCheckSpend({ query: async (sql: string, values?: unknown[]) =>
      ({ rows: await asRuntime(sql, values) }) } as never, entry) }, report: line => { reports.push(line); } });
  const application = new Proxy({}, { get: (_target, key) => key === "submit"
    ? async () => {
      const runId = await new RunRepository(database.pool).startRun({
        questionLine: question, principal: { kind: "legacy", legacyAskerId: `gate:${randomUUID()}` },
        sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
        compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
        discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
        envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
        askContract: {}, batteryRows: []
      });
      await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, identity.authenticated.ownerRef]);
      return { run_ref: runId, status: "QUEUED" };
    } : async () => null }) as AskApplication;
  const api = buildApi({ application, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: line => check.check(line) } });
  return api;
}

describe("S04 ask gate over the database", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,$4,'active',now())`,
      [identity.authenticated.userId, createHash("sha256").update(identity.authenticated.userId).digest(),
        identity.authenticated.userId, identity.authenticated.ownerRef]);
    await staffHolder(true);
    await staffHolder(false);
  }, 600_000);
  afterAll(async () => database?.stop());

  const observed = new Map<string, Record<string, number>>();
  const captured: string[] = [];
  const spent = new Map<string, [number, number]>();

  it.each(labels)("lists the rows %s adds", async label => {
    // Property: only a healthy question starts a run; every other outcome adds only the cost record, so no question is stored.
    // Mutant: call application.submit for a refused label; a response-body change is a neighbour.
    const reports: { event: string; code: string }[] = [];
    const log = vi.spyOn(console, "error").mockImplementation((...args) => { captured.push(args.map(String).join(" ")); });
    const api = serverFor(label, reports);
    try {
      const before = await tableCounts(), personBefore = await personSpend();
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { question_line: question, risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
          composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "test",
          as_of: "2026-10-21T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] } });
      expect(response.statusCode).toBe(starts(label) ? 202 : label === "QUESTION_CHECK_HTTP_STATUS" ? 503 : 422);
      const change = delta(before, await tableCounts());
      observed.set(label, change);
      spent.set(label, [personBefore, await personSpend()]);
      captured.push(...reports.map(line => JSON.stringify(line)));
      expect(change["ledger.model_spend"]).toBe(1);
      if (starts(label)) {
        expect(change).toEqual({ "ledger.model_spend": 1, "core.run": 1,
          "core.question_liveness_event": 1, "core.run_progress_event": 3,
          "core.run_ownership_event": 1 });
      } else {
        expect(change).toEqual({ "ledger.model_spend": 1 });
      }
    } finally { log.mockRestore(); await api.close(); }
  }, 600_000);

  it("leaves the person's spent amount unchanged for every outcome", () => {
    // Property: the runless site-cost charge never becomes the account's spend.
    // Mutant: attach the check charge to the asker's run; a staff alert change is a neighbour.
    expect(spent.size).toBe(labels.length);
    for (const [label, [before, after]] of spent) expect(after, label).toBe(before);
  });

  it("captures no question text or subject id in logs across every outcome", () => {
    // Property: diagnostics hold machine failure codes, not the private material or classifier labels.
    // Mutant: include questionLine in a report call; a spend amount change is a neighbour.
    expect(observed.size).toBe(labels.length);
    const lines = captured.join("\n");
    expect(lines).not.toContain(question);
    for (const id of readQuestionSubjects().map(subject => subject.id)) expect(lines).not.toContain(id);
  });
});
