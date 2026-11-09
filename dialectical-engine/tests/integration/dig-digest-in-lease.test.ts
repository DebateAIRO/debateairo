// tests/integration/dig-digest-in-lease.test.ts (V4 start step, Task 55d; R22 decision 9 and W4-2 as the runner runs them). The
// runner runs a dig's web step INSIDE the dig's own content lease (apps/runner/src/index.ts: withDisclosureContentLease around the
// whole debate), and a lease may never widen to another debate. Pinned on a migrated embedded PostgreSQL, the runner's own login and
// an R22 dig of a first debate that searched, read its pages and has a story: inside the dig's lease every planner of the dig is told
// what the investigation already looked into (the story's line, the searches and reader 1's notes), and a page the first debate read
// is reused, each other debate read under a lease of its own; the lease guard still refuses a widening; a debate whose lease cannot be
// had (an erasure holding it) is left out after a bounded wait, and the dig goes on. Scripted vendors and a scripted Perplexity
// (tests/support/web-step-world.ts); every question, page and line is made up.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema } from "@debateai/contract";
import {
  configureContentEncryption, contentCipherFor, createPool, migrate, PostgresDigPicksRepository, PostgresInvestigationRepository,
  prepareLeasedContentEncryptionForRuns, withRunContentLease, type Pool
} from "@debateai/db";
import { WEB_DIG_PLANNER_V3_CONTRACT_ID } from "@debateai/judgement";
import { createPerplexitySearchPort, readPromptFrame, type PromptPacket } from "@debateai/providers";
import { StoryRepository } from "@debateai/story";
import { selectPathPages } from "../../packages/evidence/src/host-filter.js";
import { readAlreadyInvestigated } from "../../apps/runner/src/investigation-digest.js";
import { runRunnerWebStep, type WebStepPath, type WebStepResult, type WebStepRunnerSettings } from "../../apps/runner/src/web-step.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PATHS, QUERIES, QUESTION, membersOf, perplexity, searchMoney, team, type Team } from "../support/web-step-world.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let api: Pool;
let runner: Pool;
let owner: StoryEncryptedOwner;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  logins = await provisionRlsLogins(database);
  api = createPool(logins.url("API_SYSTEM_DATABASE_URL"));
  configureContentEncryption(api, contentCipherFor(database.pool)!);
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  configureContentEncryption(runner, contentCipherFor(database.pool)!);
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end()]);
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const FACTS = { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "none",
  buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } as const;
/** What the first debate's story says of its one path. */
const STORY_LINE = "Yes: a second pier would cut the summer queues by a third.";
const DIG_QUESTION = "Would winter ridership fill a second ferry pier?";
const PICKS = Object.freeze(["Does winter ridership fall?", "I think tourists keep the ferries full all year."]);
const Q1 = "winter ferry ridership harbour statistics";
const Q2 = "tourist ferry passengers all year survey";
const DIG_PLAN = (packet: PromptPacket): string => JSON.stringify({ country: null, needs_search: true, reason: null, pace: "normal",
  searches: ((query: string) => [{ side: "for", local: false, query }, { side: "against", local: false, query: `${query} doubts` }])(
    readPromptFrame(packet).fields.find((entry) => entry.name === "chosen")?.content === PICKS[1] ? Q2 : Q1) });
const DIG_PATHS: readonly WebStepPath[] = Object.freeze([
  Object.freeze({ pathRef: "b1", answer: "Yes: winter crossings stay steady.", forPoints: [], againstPoints: [] }),
  Object.freeze({ pathRef: "b2", answer: "No: the ferries are empty in winter.", forPoints: [], againstPoints: [] })
]);
/** The address the first debate's search for QUERIES.a1for found first (web-step-world's Perplexity). */
const READ_BEFORE_URL = `https://${QUERIES.a1for.replace(/[^a-z]+/gu, "-")}-1.example/page`;

/** Perplexity for a dig: as many results as asked, each its own site; Q1's first result is the page the first debate read. */
function digPerplexity() {
  const fetchStub = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; max_results: number };
    const slug = body.query.replace(/[^a-z]+/gu, "-");
    const results = Array.from({ length: body.max_results }, (_, at) => ({ title: `${body.query} ${String(at + 1)}`,
      url: body.query === Q1 && at === 0 ? READ_BEFORE_URL : `https://${slug}-${String(at + 1)}.example/page`,
      snippet: `The ${body.query} page ${String(at + 1)} counts winter riders.\nIt was found by the dig.`, date: "2026-03-01", last_updated: null }));
    return new Response(JSON.stringify({ id: `search-${randomUUID()}`, results }), { status: 200 });
  }) as typeof fetch;
  return createPerplexitySearchPort({ fetch: fetchStub, selectPages: (pages) => selectPathPages(pages, new Set()), timeLimitMs: 50 });
}

const settingsOf = (search: WebStepRunnerSettings["search"]): WebStepRunnerSettings => Object.freeze({
  switchedOn: true, search, searchSubject: {} as never, searchSeamOf: () => searchMoney().seam(), readRunPlan: async () => "PLUS" as const });

/** The runner's one call on the runner's login, its readers the real ones (none handed in), every logged code kept. */
function runnerStep(runId: string, question: string, paths: readonly WebStepPath[], ais: Team, search: WebStepRunnerSettings["search"],
  logged: string[]): Promise<WebStepResult> {
  return runRunnerWebStep({
    pool: runner, settings: settingsOf(search), lane: null, runId, subjectItemId: `work-${runId}`, mode: "quick", question,
    questionLanguage: null, placeCountry: null, asOf: new Date("2026-10-31T09:00:00Z"), siteLanguage: { code: "en", name: "English" },
    paths, members: membersOf(ais.all), contractHash: "seal-engine", bound: { maxAttempts: 2, tokenCeiling: 4_096, deadlineMs: 60_000 },
    log: (event) => { logged.push(event); }
  });
}

/** A first debate whose web step read its pages, then settled with a story on one path (an R22 story: the path named by its position). */
async function firstDebate(): Promise<string> {
  const parent = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  const result = await runnerStep(parent, QUESTION, PATHS, team(), perplexity().port, []);
  expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId: parent, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = randomUUID();
  const paragraph = { text: "A paragraph.", node_refs: [position] };
  const body = StoryBodySchema.parse({ shape_id: "general",
    short: { headline: "Headline.", summary: "Summary.", confidence: "Fairly sure.",
      paths: [{ position_ref: position, fate: "HELD_UP", line: STORY_LINE, node_refs: [position] }], change: paragraph },
    why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null });
  expect(await new StoryRepository(database.pool).insert({ runId: parent, answerId, answerVersion: 1, outcome: "READY", failureCode: null,
    shapeId: "general", packVersion: "2026-09-26.1", packFingerprint: "f".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 1, artifactRefs: [randomUUID()], body, reservation: null, verdictBasis: null, pointNumbers: null, languageTag: "en",
    storytellerRepairs: 0 })).toBe("INSERTED");
  return parent;
}

/** A dig of the parent, joined at start with its two picks kept (the asks route's two steps, on the API's login). */
async function digOf(parent: string): Promise<string> {
  const dig = await createEncryptedStoryRun(database.pool, owner, DIG_QUESTION);
  const position = randomUUID();
  expect(await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: parent, childRunId: dig,
    places: [`path:${position}`], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: 1 });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: parent, positionRef: position,
    picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: `path:${position}`, author: "AI_SUGGESTION", text: PICKS[0]! },
      { kind: "OWN_VIEW", suggestionId: null, place: `path:${position}`, author: "PERSON_OWN_VIEW", text: PICKS[1]! }] })).toBe("RECORDED");
  return dig;
}

const contractOf = (body: string): string => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages }).contractId;
const fieldOf = (body: string, name: string): string | undefined => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages })
  .fields.find((field) => field.name === name)?.content;
const LEASE_KEY = (runId: string): string => `debateai:run-content-lease:v1:${runId}`;

describe("an R22 dig's web step inside the dig's own content lease, as the runner runs it (Task 55d)", () => {
  it("every planner is told what the investigation already looked into (the parent's story line, searches and notes), and a page the parent read is reused", async () => {
    const parent = await firstDebate();
    const dig = await digOf(parent);
    const ais = team({ haiku: { planner: DIG_PLAN } });
    const logged: string[] = [];
    const result = await withRunContentLease(runner, [dig], () => runnerStep(dig, DIG_QUESTION, DIG_PATHS, ais, digPerplexity(), logged));
    const planners = ais.haiku.bodies.filter((body) => contractOf(body) === WEB_DIG_PLANNER_V3_CONTRACT_ID);
    expect(planners).toHaveLength(2);
    for (const body of planners) {
      const known = fieldOf(body, "already_investigated") ?? "";
      expect(known).not.toBe("[]");
      expect(known).toContain(STORY_LINE);
      expect(known).toContain(QUERIES.a1for);
      expect(known).toContain("It counts ferry riders.");
    }
    // W4-2 measured in the same lease: the page the parent read is reused, not read again.
    expect(logged).not.toContain("WEB_REUSE_UNREAD");
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(result.dig!.reusedPageIds).toHaveLength(1);
  });

  it("the lease guard still refuses a widening: inside the dig's lease the parent's run is never added to it", async () => {
    const parent = await firstDebate();
    const dig = await digOf(parent);
    await withRunContentLease(runner, [dig], async () => {
      await expect(withRunContentLease(runner, [parent], async () => "read")).rejects.toMatchObject({ code: "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN" });
      await expect(withRunContentLease(runner, [dig, parent], async () => "read")).rejects.toMatchObject({ code: "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN" });
      await expect(prepareLeasedContentEncryptionForRuns(runner, [parent])).rejects.toMatchObject({ code: "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN" });
    });
  });

  it("a parent whose lease cannot be had (an erasure holds it) is left out after a bounded wait; the dig's digest still comes back", async () => {
    const parent = await firstDebate();
    const dig = await digOf(parent);
    const cutAt = new Date(Date.now() + 60_000).toISOString();
    // The erasure's hold: the one EXCLUSIVE holder of a run's content lease (account-erasure.ts), here on a client of its own.
    const erasure = await database.pool.connect();
    try {
      await erasure.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [LEASE_KEY(parent)]);
      const started = Date.now();
      const digest = await withRunContentLease(runner, [dig], () => readAlreadyInvestigated(runner, dig, cutAt));
      expect(digest).toBe("[]");
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      await erasure.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [LEASE_KEY(parent)]);
      erasure.release();
    }
    // Once the erasure lets go, the same digest reads the parent.
    expect(await withRunContentLease(runner, [dig], () => readAlreadyInvestigated(runner, dig, cutAt))).toContain(STORY_LINE);
  });
});
