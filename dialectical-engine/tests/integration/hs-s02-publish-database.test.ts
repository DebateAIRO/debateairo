import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  hashToken,
  loadKek,
  type AuditContextHasher
} from "../../packages/crypto/src/index.js";
import { createPool, PostgresPublicationCheckRecordRepository, PostgresPublicationRepository, migrate, withRunContentLease, type Pool } from "@debateai/db";
import type { Answer } from "@debateai/contract";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import {
  createPublicationContentCheck,
  PublicationJudgeFailure,
  type PublicationJudgePort
} from "../../apps/api/src/publication-check/check.js";
import { extractCheckedText } from "../../apps/api/src/publication-check/material.js";
import type { PublicationContentLease } from "../../apps/api/src/publications.js";
import { PUBLICATION_CHECK_POLICY_VERSION } from "../../apps/api/src/publication-check/policy.js";
import { createJudgeStub, type JudgeStubStep } from "../support/hs-s02-judge-stub.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * hate-speech S02-14 (SPEC-v2 R8, R10, R14(a)) over the real database: a refused
 * attempt (BLOCK, UNSURE, UNAVAILABLE) leaves the debate private and every
 * publication table and the owner's answer unchanged, writes exactly one
 * content-free check record, and puts the canary text into no row of any
 * application table and no log line. ALLOW publishes and records ALLOW.
 *
 * The canary rides ONLY in the answer handed to publish (its question line and
 * one claim), never in a row written before the attempt, so a hit in the scan
 * can only come from the attempt itself.
 */

type CaseFixture = Readonly<{ n: number; lang: string; text: string; expected: string }>;
const CASES = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../acceptance/fixtures/hs-s02-cases.json"), "utf8")) as CaseFixture[];
const CASE_1_EN = CASES.find((entry) => entry.n === 1 && entry.lang === "en")!.text;

/** tests/architecture/security-migration-0065.test.ts:30-31 — the application schemas. */
const APPLICATION_SCHEMAS = [
  "core", "evaluator", "evidence", "identity", "ledger", "memory",
  "obs", "observation", "register", "scorecard", "serve", "support"
] as const;
const PUBLICATION_TABLES = [
  "serve.publication_snapshot", "serve.publication_key_provision_intent", "core.run_visibility_event"
] as const;
const ATTEMPTED_AT = new Date("2026-09-29T12:00:00.000Z");

const source = Object.freeze({ ip: "192.0.2.41", userAgent: "HS S02 Publish Browser", requestId: "request:hs-s02-publish" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "33".repeat(32),
  hashUserAgent: async () => "44".repeat(32)
}) as unknown as AuditContextHasher;

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
let application: PostgresPublicationApplication;

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("HS_S02_OWNER_UNPROVISIONED");
  return owner;
}

function ownerSession(): AuthenticatedSession {
  const { userId, ownerRef, sessionId } = theOwner();
  return Object.freeze({
    session: Object.freeze({
      asker_id: `owner:${ownerRef}`,
      session_id: sessionId,
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const
    }),
    userId,
    ownerRef,
    tokenHash: `hash:${sessionId}`,
    csrfTokenHash: `hash:csrf:${sessionId}`,
    authKind: "cookie" as const
  });
}

async function publishGrant(runId: string): Promise<string> {
  const { userId, sessionId } = theOwner();
  const token = `hs-s02-publish-${randomUUID()}`;
  await database.pool.query(
    `INSERT INTO identity.step_up_grant (
       step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
       issued_at,expires_at,consumed_at
     ) VALUES ($1,$2,$3,$4,'PUBLISH',$5,$6,$7,NULL)`,
    [randomUUID(), hashToken("step-up-grant", token), sessionId, userId, runId,
      new Date(Date.now() - 1_000), new Date(Date.now() + 60_000)]
  );
  return token;
}

/** A settled private run of the owner, and the answer publish is handed: fixture case 1 + the canary. */
async function settledRun(label: string, canary: string): Promise<{ runId: string; answer: Answer }> {
  const marker = `${label}-${randomUUID()}`;
  const runId = await createEncryptedStoryRun(database.pool, theOwner(), `hs-s02 publish ${marker}`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`hs-s02-fact-${marker}`], residualObjections: [], badges: [],
      conditionMarks: ["DEFECT"], reversalPoint: `hs-s02-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    }
  });
  const served = buildFairShapedAnswer({ run_ref: runId, answer_id: answerId, question_line: `${CASE_1_EN} ${canary}` });
  return {
    runId,
    answer: {
      ...served,
      nodes: served.nodes.map((node, index) => index === 0 ? { ...node, claim: `${node.claim} ${canary}` } : node)
    }
  };
}

async function tableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of PUBLICATION_TABLES) {
    counts[table] = (await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;
  }
  return counts;
}

async function answerRows(runId: string): Promise<string[]> {
  return (await database.pool.query<{ row: string }>(
    "SELECT a::text AS row FROM serve.answer a WHERE a.run_id = $1 ORDER BY a.answer_id, a.answer_version",
    [runId]
  )).rows.map((entry) => entry.row);
}

async function checkRecords(runId: string) {
  return (await database.pool.query(
    `SELECT run_id, attempted_at, outcome, failure_cause, rules, part_kinds, ground,
            judge_provider_ref, judge_model_id, policy_version, judge_call_count
       FROM serve.publication_check_record WHERE run_id = $1`,
    [runId]
  )).rows;
}

/** Every base table of the application schemas whose row, as JSON text, contains the canary. */
async function tablesHolding(canary: string): Promise<string[]> {
  const tables = (await database.pool.query<{ schema: string; name: string }>(
    `SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1::text[])
      ORDER BY table_schema, table_name`,
    [[...APPLICATION_SCHEMAS]]
  )).rows;
  expect(tables.length).toBeGreaterThan(50);
  const holding: string[] = [];
  for (const table of tables) {
    const found = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${table.schema}"."${table.name}" t WHERE to_jsonb(t)::text LIKE $1`,
      [`%${canary}%`]
    );
    if (found.rows[0]!.n > 0) holding.push(`${table.schema}.${table.name}`);
  }
  return holding;
}

/** Captures every console and std-stream write made while `use` runs. */
async function capturingLogs<T>(use: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
  const originals = consoleMethods.map((name) => console[name]);
  const stdout = process.stdout.write, stderr = process.stderr.write;
  const keep = (...values: unknown[]) => {
    lines.push(values.map((value) => typeof value === "string" ? value : (() => {
      try { return JSON.stringify(value); } catch { return String(value); }
    })()).join(" "));
  };
  for (const name of consoleMethods) console[name] = keep;
  process.stdout.write = ((chunk: unknown) => { lines.push(String(chunk)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { lines.push(String(chunk)); return true; }) as typeof process.stderr.write;
  try {
    return { result: await use(), lines };
  } finally {
    consoleMethods.forEach((name, index) => { console[name] = originals[index]!; });
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

async function attempt(label: string, step: JudgeStubStep) {
  const canary = `HSCANARY-${randomUUID()}`;
  const { runId, answer } = await settledRun(label, canary);
  const judge = createJudgeStub([step]);
  const contentCheck = createPublicationContentCheck({
    judge: () => judge,
    recorder: new PostgresPublicationCheckRecordRepository(database.pool),
    clock: () => ATTEMPTED_AT
  });
  const grantToken = await publishGrant(runId);
  const countsBefore = await tableCounts();
  const answerBefore = await answerRows(runId);
  const { result, lines } = await capturingLogs(() => application.publish({
    runId, answer, authenticated: ownerSession(), grantToken, source, contentCheck
  }));
  return { runId, canary, result, lines, countsBefore, answerBefore, judge };
}

function expectedRecord(runId: string, fields: Readonly<{
  outcome: string; failure_cause: string | null; rules: number[]; part_kinds: string[]; ground: string | null;
}>) {
  return {
    run_id: runId,
    attempted_at: ATTEMPTED_AT,
    ...fields,
    judge_provider_ref: "test:judge",
    judge_model_id: "test-model",
    policy_version: PUBLICATION_CHECK_POLICY_VERSION,
    judge_call_count: 1
  };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  application = new PostgresPublicationApplication(
    new PostgresPublicationRepository(database.pool, fakeAuditHasher),
    new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xa4))))
  );
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("hate-speech S02 publish path over the real database (R8, R10, R14(a))", () => {
  const refusals = [
    {
      outcome: "BLOCK",
      step: JSON.stringify({ verdict: "BLOCK", rules: [1], parts: ["question", "arguments"], possibly_illegal: true }),
      result: {
        state: "REFUSED",
        statement: { outcome: "BLOCK", parts: ["QUESTION", "ARGUMENTS"], ground: "TERMS_AND_POSSIBLY_ILLEGAL", automated: true, visibility: "PRIVATE" }
      },
      record: { outcome: "BLOCK", failure_cause: null, rules: [1], part_kinds: ["QUESTION", "ARGUMENTS"], ground: "TERMS_AND_POSSIBLY_ILLEGAL" }
    },
    {
      outcome: "UNSURE",
      step: JSON.stringify({ verdict: "UNSURE", rules: [], parts: ["question"], possibly_illegal: false }),
      result: {
        state: "REFUSED",
        statement: { outcome: "UNSURE", parts: ["QUESTION"], ground: "TERMS", automated: true, visibility: "PRIVATE" }
      },
      record: { outcome: "UNSURE", failure_cause: null, rules: [], part_kinds: ["QUESTION"], ground: "TERMS" }
    },
    {
      outcome: "UNAVAILABLE",
      step: new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED"),
      result: { state: "CHECK_UNAVAILABLE" },
      record: { outcome: "UNAVAILABLE", failure_cause: "JUDGE_TRANSPORT_FAILED", rules: [], part_kinds: [], ground: null }
    }
  ] as const;

  for (const refusal of refusals) {
    it(`${refusal.outcome}: the debate stays private and unchanged, one content-free record, the canary nowhere`, async () => {
      const run = await attempt(refusal.outcome.toLowerCase(), refusal.step);
      expect(run.result).toEqual(refusal.result);
      expect(run.judge.packets.length).toBe(1);
      // (a) still private
      await expect(application.readOwnedVisibility({ runId: run.runId, authenticated: ownerSession() }))
        .resolves.toEqual({ state: "PRIVATE", public_ref: null });
      // (b) no snapshot, no key provision intent, no visibility transition
      expect(await tableCounts()).toEqual(run.countsBefore);
      // (c) the owner's answer row is byte-identical
      expect(await answerRows(run.runId)).toEqual(run.answerBefore);
      expect(run.answerBefore.length).toBe(1);
      // (d) exactly one record with the outcome's eleven fields
      expect(await checkRecords(run.runId)).toEqual([expectedRecord(run.runId, {
        ...refusal.record, rules: [...refusal.record.rules], part_kinds: [...refusal.record.part_kinds]
      })]);
      // (e) the canary is in no application row and no log line
      expect(await tablesHolding(run.canary)).toEqual([]);
      expect(run.lines.filter((line) => line.includes(run.canary))).toEqual([]);
    }, 120_000);
  }

  it("ALLOW publishes, records ALLOW, and still writes the canary into no row and no log line", async () => {
    const run = await attempt("allow", JSON.stringify({ verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false }));
    expect(run.result).toEqual({ state: "PUBLISHED", public_ref: expect.stringMatching(/^[0-9a-f-]{36}$/u) });
    const publicRef = (run.result as { public_ref: string }).public_ref;
    await expect(application.readOwnedVisibility({ runId: run.runId, authenticated: ownerSession() }))
      .resolves.toEqual({ state: "PUBLISHED", public_ref: publicRef });
    expect(await checkRecords(run.runId)).toEqual([expectedRecord(run.runId, {
      outcome: "ALLOW", failure_cause: null, rules: [], part_kinds: [], ground: null
    })]);
    expect(await tablesHolding(run.canary)).toEqual([]);
    expect(run.lines.filter((line) => line.includes(run.canary))).toEqual([]);
    // The published snapshot carries the canary: the scan above is blind to ciphertext, not to the text.
    const debate = await application.readPublicDebate(publicRef);
    expect(debate?.question).toContain(run.canary);
    // FIX-HS2-p1 ct-B1 / ct-B2: the judge read every checked leaf of the snapshot that was stored — every node,
    // every review reason — and none of the owner's, the session's, the run's or the publication's identifiers.
    const material = run.judge.packets.map(packet => JSON.parse(packet.messages[1]!.content.split("\n").slice(1, -1).join("\n"))
      .fields.map((field: { content: string }) => field.content).join("\n\n")).join("\n\n");
    const leaves = extractCheckedText(debate!);
    expect(leaves.filter(leaf => leaf.kind === "ARGUMENTS").length).toBeGreaterThanOrEqual(2);
    for (const leaf of leaves) expect(material, leaf.text).toContain(leaf.text);
    const wire = JSON.stringify(run.judge.packets);
    const { userId, ownerRef, sessionId } = theOwner();
    for (const identifier of [run.runId, userId, ownerRef, sessionId, publicRef, source.ip, source.requestId, source.userAgent, debate!.author_pseudonym]) {
      expect(wire, identifier).not.toContain(identifier);
    }
  }, 120_000);
});

/**
 * FIX-HS2-p1 sd-B1 (ruling R-P), re-derived from the security lens's wedge probe
 * (.hermes/reports/hate-speech/probes/REV-HS-S02-p1-security-data-safety/rev-hs-s02-p1-sd-db-probe.test.ts):
 * the pool is main.ts's (createPool, pg's default max 10, no acquire timeout), the recorder writes on the SAME
 * pool, and publish is composed exactly as the route composes it — its lease is `withRunContentLease(pool, [runId])`
 * and its answer re-read runs under that lease. The probe's pre-fix composition (publish INSIDE one lease) is the
 * last case: the product now refuses it before any judge call instead of wedging.
 */
describe("hate-speech S02 publish path — the runtime pool under concurrent attempts (sd-B1)", () => {
  async function experiment(attempts: number, judgeLatencyMs: number, staggerMs: number) {
    const pool: Pool = createPool(database.connectionString);
    const app = new PostgresPublicationApplication(
      new PostgresPublicationRepository(pool, fakeAuditHasher),
      new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xa7))))
    );
    const { runId, answer } = await settledRun("pool", `HSCANARY-${randomUUID()}`);
    const grantToken = await publishGrant(runId);
    let judgeCalls = 0;
    const judge: PublicationJudgePort = {
      providerRef: "test:judge", modelId: "test-model",
      complete: async () => {
        judgeCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, judgeLatencyMs));
        return { text: JSON.stringify({ verdict: "BLOCK", rules: [1], parts: ["question"], possibly_illegal: false }) };
      }
    };
    const contentCheck = createPublicationContentCheck({
      judge: () => judge, recorder: new PostgresPublicationCheckRecordRepository(pool), clock: () => new Date()
    });
    const contentLease: PublicationContentLease = {
      run: (use) => withRunContentLease(pool, [runId], async () => use()),
      readAnswer: async () => answer
    };
    const started = Date.now();
    const settled: string[] = [];
    const attemptsDone = Promise.allSettled(Array.from({ length: attempts }, async (_value, index) => {
      await new Promise((resolve) => setTimeout(resolve, index * staggerMs));
      const current = await contentLease.run(contentLease.readAnswer);
      const result = await app.publish({
        runId, answer: current!, authenticated: ownerSession(), grantToken, source, contentCheck, contentLease
      });
      settled.push(result?.state ?? "null");
    }));
    // An unrelated request on the same pool while the judges are still answering.
    await new Promise((resolve) => setTimeout(resolve, Math.min(attempts * staggerMs, 3_000) + 200));
    const unrelatedStart = Date.now();
    await pool.query("SELECT 1");
    const unrelatedMs = Date.now() - unrelatedStart;
    const verdict = await Promise.race([
      attemptsDone.then(() => "SETTLED"),
      new Promise<string>((resolve) => setTimeout(() => resolve("WEDGED"), 30_000))
    ]);
    const records = (await database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM serve.publication_check_record WHERE run_id=$1", [runId])).rows[0]!.n;
    const stats = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
    console.info(`POOL attempts=${attempts} judge=${judgeLatencyMs}ms stagger=${staggerMs}ms → ${verdict} after ${Date.now() - started}ms; settled=${settled.length}/${attempts}; judgeCalls=${judgeCalls}; records=${records}; unrelated SELECT 1 = ${unrelatedMs}ms; pool=${JSON.stringify(stats)}`);
    if (verdict === "SETTLED") await pool.end();
    return { verdict, settled, judgeCalls, records, unrelatedMs, stats };
  }

  // Property: 12 attempts 250 ms apart with a 3 s judge (the lens's wedge shape, above the pool max) all settle,
  // each is judged and recorded once, and an unrelated query is served while the judges are answering.
  it("12 attempts 250 ms apart, judge 3 s: all settle, all recorded, an unrelated SELECT 1 returns", async () => {
    const run = await experiment(12, 3_000, 250);
    expect(run.verdict).toBe("SETTLED");
    expect(run.settled).toEqual(Array.from({ length: 12 }, () => "REFUSED"));
    expect(run.judgeCalls).toBe(12);
    expect(run.records).toBe(12);
    expect(run.unrelatedMs).toBeLessThan(1_000);
    expect(run.stats.waiting).toBe(0);
  }, 90_000);

  // Property: the pre-fix composition — publish INSIDE the run's content lease — is refused before the judge is
  // called, so it can never hold a pooled client across the judge's wait.
  it("publish composed inside a content lease throws PUBLICATION_CHECK_UNDER_CONTENT_LEASE before any judge call", async () => {
    const { runId, answer } = await settledRun("lease", `HSCANARY-${randomUUID()}`);
    const grantToken = await publishGrant(runId);
    const judge = createJudgeStub([JSON.stringify({ verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false })]);
    const contentCheck = createPublicationContentCheck({
      judge: () => judge, recorder: new PostgresPublicationCheckRecordRepository(database.pool), clock: () => ATTEMPTED_AT
    });
    const countsBefore = await tableCounts();
    await expect(withRunContentLease(database.pool, [runId], () => application.publish({
      runId, answer, authenticated: ownerSession(), grantToken, source, contentCheck
    }))).rejects.toThrow("PUBLICATION_CHECK_UNDER_CONTENT_LEASE");
    expect(judge.packets).toHaveLength(0);
    expect(await checkRecords(runId)).toEqual([]);
    expect(await tableCounts()).toEqual(countsBefore);
  }, 120_000);
});
