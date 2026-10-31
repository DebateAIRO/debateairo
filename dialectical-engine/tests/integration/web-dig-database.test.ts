// tests/integration/web-dig-database.test.ts
// W4-7 (Perplexity plan 2026-10-30; W4-2's dig web step and reuse, on real PostgreSQL). A first debate's web step stores
// its pages; a dig of it joins the investigation (0133) with its picks kept (0135, the API's login); the runner's own call
// (runRunnerWebStep on the runner's login, the real readers, store and key) runs the dig's web step: the dig planner, one
// search per pick, the readers, ONE pack. Pinned: the dig's searches, pages, picks, extracts and pack are stored under its
// first path; every dig path's legs read that pack (the packs reader takes the step's outcomes); a page the first debate
// read is reused, no reader paid again; once the investigation's texts are wiped, a second dig's search fetches the page
// again for its 0.1 cent, no reader paid; a dig claimed again (after a lost claim, and once more after it finished) sends
// byte-identical prompts, answered by the replay book, and its legs read the same bytes. Scripted vendors behind the real
// gateway and a scripted Perplexity behind the real adapter (tests/support/web-step-world.ts); every page is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configureContentEncryption, contentCipherFor, createPool, PostgresDigPicksRepository, PostgresInvestigationRepository,
  WEB_EVIDENCE_CARRIERS, migrate, type Pool
} from "@debateai/db";
import { WEB_DIG_PLANNER_CONTRACT_ID, framedJudgePromptForTest, type JudgeLeg } from "@debateai/judgement";
import { LENGTH_GUIDANCE_START, type LengthGuide } from "@debateai/kernel";
import {
  PERPLEXITY_SEARCH_CHARGE_MICROS, createPerplexitySearchPort, readPromptFrame, type PromptPacket, type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { selectPathPages } from "../../packages/evidence/src/host-filter.js";
import { createReplayBook, recordedCalls, replayingGateway } from "../../apps/runner/src/run-replay.js";
import { legWithWebSources, readDebateWebPacks, type DebateWebPacks } from "../../apps/runner/src/web-packs.js";
import {
  postgresWebStepPorts, runRunnerWebStep, type WebStepPath, type WebStepResult, type WebStepRunnerSettings
} from "../../apps/runner/src/web-step.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PATHS, QUERIES, QUESTION, membersOf, perplexity, recorded, searchMoney, team, type Team } from "../support/web-step-world.js";

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
const GUIDE: LengthGuide = { words: 120, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const DIG_QUESTION = "Would winter ridership fill a second ferry pier?";
const PICKS = Object.freeze(["Does winter ridership fall?", "I think tourists keep the ferries full all year."]);
const Q1 = "winter ferry ridership harbour statistics";
const Q2 = "tourist ferry passengers all year survey";
const DIG_PLAN = JSON.stringify({ searches: [{ pick_id: "k1", pace: "normal", query: Q1 }, { pick_id: "k2", pace: "normal", query: Q2 }] });
/** The dig's own paths (its map's answers): the pack is kept under b1, and b2 reads it too. */
const DIG_PATHS: readonly WebStepPath[] = Object.freeze([
  Object.freeze({ pathRef: "b1", answer: "Yes: winter crossings stay steady.", forPoints: [], againstPoints: [] }),
  Object.freeze({ pathRef: "b2", answer: "No: the ferries are empty in winter.", forPoints: [], againstPoints: [] })
]);
/** The address the first debate's search for QUERIES.a1for found first (web-step-world's Perplexity). */
const READ_BEFORE_URL = `https://${QUERIES.a1for.replace(/[^a-z]+/gu, "-")}-1.example/page`;
const digPageText = (query: string, rank: number): string =>
  `The ${query} page ${String(rank)} counts ${String(rank * 3)} thousand winter riders.\nIt was found by the dig. Line ${String(rank)}.`;

/** Perplexity for a dig: as many results as asked, each its own site; Q1's first result is the page the first debate read. */
function digPerplexity() {
  const queries: string[] = [];
  const fetchStub = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; max_results: number };
    queries.push(body.query);
    const slug = body.query.replace(/[^a-z]+/gu, "-");
    const results = Array.from({ length: body.max_results }, (_, at) => ({ title: `${body.query} ${String(at + 1)}`,
      url: body.query === Q1 && at === 0 ? READ_BEFORE_URL : `https://${slug}-${String(at + 1)}.example/page`,
      snippet: digPageText(body.query, at + 1), date: "2026-03-01", last_updated: null }));
    return new Response(JSON.stringify({ id: `search-${String(queries.length)}`, results }), { status: 200 });
  }) as typeof fetch;
  const port = createPerplexitySearchPort({ fetch: fetchStub, selectPages: (pages) => selectPathPages(pages, new Set()), timeLimitMs: 50 });
  return { port, queries };
}

const settingsOf = (search: WebStepRunnerSettings["search"], money = searchMoney()): WebStepRunnerSettings => Object.freeze({
  switchedOn: true, search, searchSubject: {} as never, searchSeamOf: () => money.seam(), readRunPlan: async () => "PLUS" as const });

/** The runner's one call, on the runner's login: its readers, store, key and decision recorder are the real ones. */
function runnerStep(input: Readonly<{ runId: string; question: string; paths: readonly WebStepPath[]; members: ReturnType<typeof membersOf>;
  settings: WebStepRunnerSettings; abandon?: (error: unknown) => boolean }>): Promise<WebStepResult> {
  return runRunnerWebStep({
    pool: runner, settings: input.settings, lane: null, runId: input.runId, subjectItemId: `work-${input.runId}`, mode: "quick",
    question: input.question, questionLanguage: null, placeCountry: null, asOf: new Date("2026-10-31T09:00:00Z"),
    siteLanguage: { code: "en", name: "English" }, paths: input.paths, members: input.members, contractHash: "seal-engine",
    bound: { maxAttempts: 2, tokenCeiling: 4_096, deadlineMs: 60_000 },
    ...(input.abandon === undefined ? {} : { abandon: input.abandon })
  });
}

/** A first debate whose web step read its pages (reader 1 READ each), then settled. */
async function firstDebate(): Promise<string> {
  const parent = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  const result = await runnerStep({ runId: parent, question: QUESTION, paths: PATHS, members: membersOf(team().all),
    settings: settingsOf(perplexity().port) });
  expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
  await persistTerminalRun({ pool: database.pool, runId: parent, fixtureKey: randomUUID(), factBundle: FACTS });
  return parent;
}

/** A dig of the parent, joined at start with its two picks kept (the asks route's two steps, on the API's login). */
async function digOf(parent: string): Promise<Readonly<{ dig: string; investigationId: string }>> {
  const dig = await createEncryptedStoryRun(database.pool, owner, DIG_QUESTION);
  const position = randomUUID();
  const joined = await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: parent, childRunId: dig,
    places: [`path:${position}`], mode: "quick" });
  expect(joined).toMatchObject({ outcome: "JOINED", digLevel: 1 });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: parent, positionRef: position,
    picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: `path:${position}`, author: "AI_SUGGESTION", text: PICKS[0]! },
      { kind: "OWN_VIEW", suggestionId: null, place: `path:${position}`, author: "PERSON_OWN_VIEW", text: PICKS[1]! }] })).toBe("RECORDED");
  return { dig, investigationId: joined.investigationId! };
}

/* ----------------------------------------------------------------- what the store and the prompts hold */

const contractOf = (body: string): string => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages }).contractId;
const fieldOf = (body: string, name: string): string => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages })
  .fields.find((field) => field.name === name)?.content ?? "[]";
const readAllPageIds = (ais: Team): string[] => ais.haiku.bodies.filter((body) => contractOf(body).startsWith("web.read-all"))
  .flatMap((body) => (JSON.parse(fieldOf(body, "pages")) as { page_id: string }[]).map((page) => page.page_id));
const sentBodies = (ais: Team): number => ais.all.reduce((sum, vendor) => sum + vendor.bodies.length, 0);

/** Each stored row's path, per table (the superuser reads the tables; no request role does). */
async function pathsKept(runId: string): Promise<Readonly<{ searches: string[]; pages: string[]; extracts: string[]; picks: string[];
  packs: string[] }>> {
  const of = async (sql: string) => (await database.pool.query<{ path_ref: string }>(sql, [runId])).rows.map((row) => row.path_ref);
  return {
    searches: await of("SELECT path_ref FROM identity.web_search WHERE run_id = $1 ORDER BY search_id"),
    pages: await of(`SELECT search.path_ref FROM identity.web_page AS page JOIN identity.web_search AS search ON search.search_id = page.search_id
      WHERE page.run_id = $1 ORDER BY page.page_id`),
    extracts: await of("SELECT path_ref FROM identity.web_extract WHERE run_id = $1 ORDER BY label"),
    picks: await of("SELECT DISTINCT path_ref FROM identity.web_pick WHERE run_id = $1"),
    packs: await of("SELECT path_ref FROM identity.web_pack WHERE run_id = $1")
  };
}

/** The legs of each dig path, as the arguing calls frame them: contract and material, field by field. */
function legsOf(packs: DebateWebPacks | null): Record<string, string> {
  const legs: readonly Readonly<{ name: string; leg: JudgeLeg; rival?: string }>[] = [
    { name: "case", leg: { kind: "assigned-root", assignedAnswer: "Yes.", mapPoints: JSON.stringify({ for: [], against: [] }),
      engine: { pointsRaised: "[]", assumptions: "[]" } } },
    { name: "defender", leg: { kind: "support", positionUnderDebate: "Winter crossings stay steady." } },
    { name: "critic", leg: { kind: "attack", positionUnderDebate: "Winter crossings stay steady." } },
    { name: "cross", leg: { kind: "cross-root", ownPosition: "Yes.", otherMakersPosition: "No." }, rival: "b1" }
  ];
  return Object.fromEntries(DIG_PATHS.flatMap((path) => legs.map(({ name, leg, rival }) => {
    const frame = readPromptFrame(framedJudgePromptForTest(legWithWebSources(leg, packs, { own: path.pathRef, rival: rival ?? null }),
      DIG_QUESTION, "English", "resolved", null, GUIDE).packet);
    return [`${path.pathRef}:${name}`, JSON.stringify({ contractId: frame.contractId, fields: frame.fields })];
  })));
}
const sourcesIn = (frame: string): string | undefined =>
  (JSON.parse(frame) as { fields: { name: string; content: string }[] }).fields.find((field) => field.name === "sources")?.content;

describe("W4-7 a dig's web step and its reuse, on real PostgreSQL", () => {
  it("one pack under the first path, read by every dig path; a read page reused; claimed again, the same prompts", async () => {
    const parent = await firstDebate();
    const { dig } = await digOf(parent);

    // The first copy loses its claim once readers 2 and 3 are asked: the searches, pages and reader 1 are kept.
    class Killed extends Error {}
    const first = team({ haiku: { planner: DIG_PLAN } });
    const killed = (gateway: ProviderGateway): ProviderGateway => ({ call: async (request) => {
      if (request.callSiteKey.startsWith("WEB:read-top:")) throw new Killed("the claim was lost");
      return gateway.call(request);
    } });
    const firstSearch = digPerplexity();
    await expect(runnerStep({ runId: dig, question: DIG_QUESTION, paths: DIG_PATHS, members: membersOf(first.all, killed),
      settings: settingsOf(firstSearch.port), abandon: (error) => error instanceof Killed })).rejects.toBeInstanceOf(Killed);
    expect(contractOf(first.haiku.bodies[0]!)).toBe(WEB_DIG_PLANNER_CONTRACT_ID);
    expect(JSON.parse(fieldOf(first.haiku.bodies[0]!, "picks"))).toEqual([{ pick_id: "k1", text: PICKS[0] }, { pick_id: "k2", text: PICKS[1] }]);
    expect([...firstSearch.queries].sort()).toEqual([Q1, Q2].sort());

    // The copy that claims it again: every call the first made is answered by the replay book, so its prompts are the
    // same bytes (the book answers only a byte-identical prompt); only readers 2 and 3 are paid now. No search again.
    const replaying = (book: ReturnType<typeof createReplayBook>, asked: ProviderCallRequest[]) => (gateway: ProviderGateway): ProviderGateway => {
      const inner = replayingGateway(book, gateway);
      return { call: async (request) => { asked.push(request); return inner.call(request); } };
    };
    const second = team({ haiku: { planner: DIG_PLAN } });
    const secondAsked: ProviderCallRequest[] = [];
    const secondSearch = digPerplexity();
    const money = searchMoney();
    const result = await runnerStep({ runId: dig, question: DIG_QUESTION, paths: DIG_PATHS, settings: settingsOf(secondSearch.port, money),
      members: membersOf(second.all, replaying(createReplayBook({ calls: recordedCalls(recorded(first.all)), earlierNodes: [] }), secondAsked)) });
    expect(secondSearch.queries).toEqual([]);
    expect(money.charged).toEqual([]);
    expect(second.haiku.bodies).toHaveLength(0);
    expect(secondAsked.filter((request) => request.providerRef === "ref-haiku")).toHaveLength(first.haiku.requests.length);
    expect(second.deepseek.bodies.length + second.glm.bodies.length).toBe(2);

    // Stored under the dig's first path: every search, page, extract, pick and its one pack.
    const kept = await pathsKept(dig);
    expect(kept.searches).toEqual(["b1", "b1"]);
    expect(kept.pages).toHaveLength(10);
    expect(new Set([...kept.pages, ...kept.extracts, ...kept.picks, ...kept.packs])).toEqual(new Set(["b1"]));
    expect(kept.packs).toEqual(["b1"]);
    expect((await database.pool.query("SELECT side FROM identity.web_search WHERE run_id = $1", [dig])).rows.map((row) => row.side))
      .toEqual(["dig", "dig"]);
    // Every dig path's outcome names that one pack.
    expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual([["b1", "SEARCHED"], ["b2", "SEARCHED"]]);
    expect(result.paths[1]!.packId).toBe(result.paths[0]!.packId);
    expect(result.paths[0]!.packId).toBe((await database.pool.query("SELECT pack_id::text FROM identity.web_pack WHERE run_id = $1", [dig])).rows[0].pack_id);

    // The page the first debate read is reused: reader 1 was sent the other 9 only, and its reading carries where it was read.
    expect(result.dig!.reusedPageIds).toHaveLength(1);
    expect(result.dig!.refetchedPageIds).toEqual([]);
    const reusedId = result.dig!.reusedPageIds[0]!;
    expect(readAllPageIds(first)).toHaveLength(9);
    expect(readAllPageIds(first)).not.toContain(reusedId);
    const ports = await postgresWebStepPorts(runner, dig);
    try {
      const evidence = (await ports.store.read(dig))!;
      const reading = evidence.readings.find((entry) => entry.page_id === reusedId && entry.reader === 1)!;
      expect(reading.outcome).toBe("READ");
      const opened = ports.cipher.open(WEB_EVIDENCE_CARRIERS.reading, reading.reading_id, reading.content!) as { reused: { run_id: string } };
      expect(opened.reused.run_id).toBe(parent);
    } finally {
      await ports.close();
    }

    // Every dig path's legs read the one pack, the same bytes for b2 as for b1; W4-1's reading alone left b2 without it.
    const packs = await readDebateWebPacks({ pool: runner, runId: dig, paths: result.paths });
    const legs = legsOf(packs);
    for (const name of ["case", "defender", "critic"]) {
      expect(sourcesIn(legs[`b1:${name}`]!)).toBeDefined();
      expect(sourcesIn(legs[`b2:${name}`]!)).toBe(sourcesIn(legs[`b1:${name}`]!));
    }
    expect((JSON.parse(sourcesIn(legs["b2:case"]!)!) as { extracts: { id: string }[] }[])[0]!.extracts.map((extract) => extract.id))
      .toEqual(result.paths[0]!.extractLabels);
    expect(JSON.parse(sourcesIn(legs["b2:cross"]!)!).map((entry: { for: string }) => entry.for)).toEqual(["own_position", "other_makers_position"]);
    expect((await readDebateWebPacks({ pool: runner, runId: dig }))!.packOf("b2")).toBeUndefined();

    // Claimed once more after it finished: nothing is sent, searched or charged, and the legs read the same bytes.
    const third = team({ haiku: { planner: DIG_PLAN } });
    const thirdAsked: ProviderCallRequest[] = [];
    const thirdSearch = digPerplexity();
    const thirdMoney = searchMoney();
    const again = await runnerStep({ runId: dig, question: DIG_QUESTION, paths: DIG_PATHS, settings: settingsOf(thirdSearch.port, thirdMoney),
      members: membersOf(third.all, replaying(createReplayBook({ calls: recordedCalls(recorded([...first.all, ...second.all])), earlierNodes: [] }),
        thirdAsked)) });
    expect({ sent: sentBodies(third), searched: thirdSearch.queries.length, charged: thirdMoney.charged.length }).toEqual({ sent: 0, searched: 0, charged: 0 });
    expect(thirdAsked.length).toBeGreaterThan(0);
    expect(again.paths).toEqual(result.paths);
    expect(legsOf(await readDebateWebPacks({ pool: runner, runId: dig, paths: again.paths }))).toEqual(legs);
    expect((await pathsKept(dig)).packs).toEqual(["b1"]);
  });

  it("once the investigation's texts are wiped, a dig's own search fetches the page again for its 0.1 cent: no reader paid", async () => {
    const parent = await firstDebate();
    const { dig, investigationId } = await digOf(parent);
    const wiped = (await database.pool.query<{ wiped: number }>("SELECT identity.wipe_investigation_page_text($1) AS wiped", [investigationId])).rows[0]!;
    expect(wiped.wiped).toBeGreaterThan(0);

    const ais = team({ haiku: { planner: DIG_PLAN } });
    const money = searchMoney();
    const result = await runnerStep({ runId: dig, question: DIG_QUESTION, paths: DIG_PATHS, members: membersOf(ais.all),
      settings: settingsOf(digPerplexity().port, money) });
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(result.dig!.refetchedPageIds).toHaveLength(1);
    const pageId = result.dig!.refetchedPageIds[0]!;
    expect(result.dig!.reusedPageIds).toEqual([pageId]);
    // Reader 1 is not paid for it again; the fetch again is the search itself: one charge per answered search.
    expect(readAllPageIds(ais)).toHaveLength(9);
    expect(readAllPageIds(ais)).not.toContain(pageId);
    expect(money.charged).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect((await database.pool.query("SELECT charge_micros FROM identity.web_search WHERE run_id = $1", [dig])).rows
      .map((row) => Number(row.charge_micros))).toEqual([PERPLEXITY_SEARCH_CHARGE_MICROS, PERPLEXITY_SEARCH_CHARGE_MICROS]);
    expect(PERPLEXITY_SEARCH_CHARGE_MICROS).toBe(1_000);
    // The dig keeps the text its own search brought back, sealed under its key.
    const ports = await postgresWebStepPorts(runner, dig);
    try {
      const [kept] = await ports.store.readPageTexts(dig, [pageId]);
      expect(ports.cipher.open(WEB_EVIDENCE_CARRIERS.pageText, pageId, kept!.envelope)).toBe(digPageText(Q1, 1));
    } finally {
      await ports.close();
    }
    // Its one pack is still kept under the first path and read by both paths.
    expect((await pathsKept(dig)).packs).toEqual(["b1"]);
    const packs = await readDebateWebPacks({ pool: runner, runId: dig, paths: result.paths });
    expect(packs!.packOf("b2")).toBe(packs!.packOf("b1"));
  });
});
