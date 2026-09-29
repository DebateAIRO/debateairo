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
import { PostgresPublicationCheckRecordRepository, PostgresPublicationRepository, migrate } from "@debateai/db";
import type { Answer } from "@debateai/contract";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import {
  createPublicationContentCheck,
  PublicationJudgeFailure
} from "../../apps/api/src/publication-check/check.js";
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
  }, 120_000);
});
