import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore } from "@debateai/budget";
import {
  createPool, migrate, PostgresInvestigationReportRunnerRepository, PostgresInvestigationRepository, type InvestigationReportsRead,
  type Pool, type UnreportedClosing, type WebSealed
} from "@debateai/db";
import type { ProviderCallRequest, ProviderCallResult } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import { sweepInvestigationClosings, type InvestigationCloseSettings } from "../../apps/runner/src/investigation-close.js";
import { investigationReportProjectedMicros } from "../../apps/runner/src/investigation-close-sources.js";
import { PRICES, contractOf, investigationInput, team } from "../support/investigation-close-world.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * W5-1 on real PostgreSQL with scripted vendors: "Write my report" closes the investigation and wipes its page texts in
 * one transaction (0133); the runner's sweep (0136) waits while a dig is still running (owner F7 A), then writes the
 * version with Haiku writing and GLM checking, every call charged as INVESTIGATION_REPORT on the root run and admitted
 * against the plan's reserve read from the ledger since the closing began; the version is stored once, sealed under the
 * root's key, and the closing is marked written; reopening and closing again writes version 2, which reads version 1's
 * answer, and version 1 stays. The investigation's content is the made-up dossier of the unit tests (the sources' reads
 * of stories and points are the path rewrite's, covered by its own integration test). Data is made up.
 */
let database: TestDatabase;
let api: Pool;
let runner: Pool;
let sequence = 9_700_000;
const SECRET = Buffer.alloc(32, 7);
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const CARRIER = "identity.investigation_report";

const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type Account = Readonly<{ ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `close-${userId}`]);
  return { ownerRef: (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref };
}
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
async function run(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  await seeded([[`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]],
    ["INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]]]);
  return runId;
}
async function work(runId: string, state: "DONE" | "CLAIMED"): Promise<void> {
  await seeded([[`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
    VALUES ($1,'fixture','[]'::jsonb,$2,$3,$4,$5,NULL,$6)`, [runId, `fixture:${randomUUID()}`, state,
    state === "CLAIMED" ? "fixture-runner" : null, state === "CLAIMED" ? new Date(Date.now() + 600_000) : null, ++sequence]]]);
}
async function pageText(owner: Account, runId: string): Promise<void> {
  await seeded([[`INSERT INTO identity.web_page_text (page_id,run_id,owner_ref,content_ciphertext,content_attestation)
    VALUES ($1,$2,$3,$4::jsonb,'\\x00'::bytea)`, [randomUUID(), runId, owner.ownerRef, JSON.stringify(ENVELOPE)]]]);
}
const pageTexts = async (runId: string): Promise<number> =>
  Number((await database.pool.query("SELECT count(*) AS n FROM identity.web_page_text WHERE run_id=$1", [runId])).rows[0].n);
async function sealed(runId: string, ref: string): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [runId, CARRIER, ref, JSON.stringify(ENVELOPE), SECRET])).rows[0]!.value;
  return { envelope: ENVELOPE as never, attestation };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE close_api LOGIN PASSWORD 'close-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE close_runner LOGIN PASSWORD 'close-runner-test-only' IN ROLE debateai_runtime");
  api = loginPool("close_api", "close-api-test-only");
  runner = loginPool("close_runner", "close-runner-test-only");
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end()]);
  await database?.stop();
});

/** The closing over the runner's own pool: the real store and spend ledger, scripted vendors, the made-up dossier. */
function settingsFor(root: string, vendors: ReturnType<typeof team>, contents: Map<string, unknown>): InvestigationCloseSettings {
  // The ledger's row security reaches every account only on the runner's cross-account route (packages/db
  // account-context.ts), which this harness does not build; the spend store's own SQL is read here as the owner.
  const spend = new PostgresModelSpendStore(database.pool);
  const charging = (provider: { call: (request: ProviderCallRequest) => Promise<ProviderCallResult> }) => ({
    call: async (request: ProviderCallRequest) => {
      const result = await provider.call(request);
      // As the gateway's report seam would: one INVESTIGATION_REPORT row on the root run (the worst case: the projection).
      await seeded([[`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES ($1,'INVESTIGATION_REPORT',$2,$3,current_date,$4,1,1)`,
      [randomUUID(), request.runId, request.providerRef, investigationReportProjectedMicros(request, PRICES[request.providerRef]!)]]]);
      return result;
    }
  });
  const members = [
    { provider: charging(vendors.haiku.provider), providerRef: "ref-haiku", maker: "Anthropic" },
    { provider: charging(vendors.glm.provider), providerRef: "ref-glm", maker: "Z.AI" }
  ];
  return Object.freeze({
    reports: new PostgresInvestigationReportRunnerRepository(runner),
    sources: { inputOf: async (closing: UnreportedClosing, earlier: InvestigationReportsRead | null) => {
      const prior = (earlier?.reports ?? []).filter((entry) => entry.report_version < closing.reportVersion && entry.outcome !== "FAILED").at(-1);
      const opened = prior === undefined ? undefined : contents.get(prior.report_id) as { answer: { segments: string[] } } | undefined;
      const input = investigationInput({ first: { ...investigationInput().first, runId: root },
        digs: investigationInput().digs.map((dig) => (dig.parentRunId === investigationInput().first.runId ? { ...dig, parentRunId: root } : dig)),
        earlier: opened === undefined ? null : { version: prior!.report_version, segments: opened.answer.segments } });
      return { input, free: false, questionLine: input.question.line };
    } },
    seal: async (rootRunId: string, reportId: string, content: unknown) => {
      contents.set(reportId, content);
      return sealed(rootRunId, reportId);
    },
    roles: { resolveProvider: (ref: string) => members.find((member) => member.providerRef === ref) ?? null, backupCandidates: members,
      backupMakers: members.map((member) => ({ providerRef: member.providerRef, maker: member.maker })) },
    writerRoleRef: "ref-haiku",
    checkerRoleRef: "ref-glm",
    admission: {
      spentMicros: (rootRunId: string) => spend.readRunInvestigationReportSpentMicros(rootRunId),
      projectedMicros: (request: ProviderCallRequest) => investigationReportProjectedMicros(request, PRICES[request.providerRef]!)
    }
  });
}

describe("W5-1 Write my report on real PostgreSQL", () => {
  it("closes and wipes, waits for the running dig, writes version 1, then version 2 after a reopening; version 1 stays", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const reports = new PostgresInvestigationReportRunnerRepository(runner);
    const root = await run(person);
    await work(root, "DONE");
    const id = (await investigations.open(person.ownerRef, root))!;
    const dig = await run(person);
    expect(await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: ["path:pos-1"], mode: "quick" }))
      .toMatchObject({ outcome: "JOINED" });
    await work(dig, "CLAIMED");
    await pageText(person, root);
    await pageText(person, dig);

    // "Write my report": closed, version 1 numbered, every member's page text wiped in the same transaction.
    expect(await investigations.close(person.ownerRef, id)).toEqual({ outcome: "CLOSED", reportVersion: 1, wipedTexts: 2 });
    expect([await pageTexts(root), await pageTexts(dig)]).toEqual([0, 0]);

    const contents = new Map<string, unknown>();
    const vendors = team();
    // The dig is still running: the closing waits (F7 A), nothing is sent or charged.
    const waited = await sweepInvestigationClosings(settingsFor(root, vendors, contents), 100);
    expect(waited.outcomes).toContain("WAITING");
    expect(vendors.haiku.requests).toHaveLength(0);
    expect((await reports.readWaiting(root))?.waiting).toEqual([dig]);

    // The dig settles (a pre-R22 dig: no picks, so no rewrite to wait for): the version is written.
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE run_id=$1", [dig]).catch(async () =>
      seeded([["UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE run_id=$1", [dig]]]));
    expect((await reports.readWaiting(root))?.waiting).toEqual([]);
    const first = await sweepInvestigationClosings(settingsFor(root, vendors, contents), 100);
    expect(first.outcomes).toContain("RECORDED");
    expect(vendors.haiku.requests.map((request) => contractOf(request.packet))).toEqual(["report.answer.v1", "report.story.v1"]);
    for (const request of [...vendors.haiku.requests, ...vendors.glm.requests]) expect(request.runId).toBe(root);
    const afterFirst = (await reports.readOfRun(root))!;
    expect(afterFirst.reports.map((entry) => [entry.report_version, entry.outcome, entry.story_outcome])).toEqual([[1, "READY", "READY"]]);
    expect(afterFirst.reports[0]!.covered_rewrite_id).toBe("88888888-8888-4888-8888-888888888888");
    // The money: what the closing spent is the ledger's, inside the reserve; the closing is marked written.
    const spentOne = afterFirst.reports[0]!.spent_micros;
    expect(spentOne).toBeGreaterThan(0);
    expect(spentOne).toBeLessThanOrEqual(INVESTIGATION_REPORT_POLICY.reserveMicros.paid);
    const written = (await investigations.read(person.ownerRef, root))!;
    expect(written.state).toBe("closed");
    expect(written.closings[0]!.report_ref).toBe(afterFirst.reports[0]!.report_id);
    expect(await reports.readUnreported(100).then((listed) => listed.filter((closing) => closing.investigationId === id))).toEqual([]);

    // Reopen and close again: version 2, written over version 1's answer, its spend counted from its own closing on.
    expect(await investigations.reopen(person.ownerRef, id)).toBe("REOPENED");
    expect(await investigations.close(person.ownerRef, id)).toMatchObject({ outcome: "CLOSED", reportVersion: 2 });
    expect(await new PostgresModelSpendStore(database.pool).readRunInvestigationReportSpentMicros(root)).toBe(0);
    const later = team();
    expect((await sweepInvestigationClosings(settingsFor(root, later, contents), 100)).outcomes).toContain("RECORDED");
    expect(contractOf(later.haiku.requests[0]!.packet)).toBe("report.answer.later.v1");
    const both = (await reports.readOfRun(root))!;
    expect(both.reports.map((entry) => [entry.report_version, entry.outcome])).toEqual([[1, "READY"], [2, "READY"]]);
    expect(both.reports[0]!.spent_micros).toBe(spentOne);
    expect(both.reports[1]!.spent_micros).toBeLessThanOrEqual(INVESTIGATION_REPORT_POLICY.reserveMicros.paid);
    // A second pass writes nothing more.
    expect((await sweepInvestigationClosings(settingsFor(root, team(), contents), 100)).outcomes.filter((outcome) => outcome === "RECORDED")).toEqual([]);
  }, 120_000);
});
