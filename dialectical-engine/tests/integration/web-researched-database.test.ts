// tests/integration/web-researched-database.test.ts
// W4-4 "Add to researched" on real PostgreSQL (dig-model revision; owner Q7, Q-D9; plan 2026-10-31 decision 7), on the API's and the runner's own
// logins, with the real store, key and gateway, the real money seams, and scripted vendors that read what they were sent. Pinned: readers 2 and 3
// read the page; its note and quote show on the answer and survive the wipe; the text, the passage and the replies go; a later AI reads the note and
// the quote, and no passage; a stranger is refused; the calls are charged once on the run, a retry paying nothing more; 30 days later the page is
// fetched again, or the page says it could not be read; a page that adds nothing and a failed reading are told apart. Every page is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import {
  CONTENT_CIPHERTEXT_SENTINEL, PostgresInvestigationRepository, PostgresInvestigationRunnerRepository, PostgresPassageRetentionRepository, PostgresWebEvidenceRepository,
  PostgresWebResearchedRepository, WEB_EVIDENCE_CARRIERS, configureContentEncryption, contentCipherFor, createPool, decryptContentForRun,
  migrate, webReplyTextIdOf, withRunContentLease, type Pool
} from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { MapChoiceRepository } from "@debateai/map";
import {
  createPerplexitySearchPort, readPromptFrame, type PromptPacket
} from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { createPostgresProviderGateway } from "../../apps/runner/src/index.js";
import { readAlreadyInvestigated } from "../../apps/runner/src/investigation-digest.js";
import { webResearchedSubjectOf, sweepWebResearched, type WebResearchedSettings } from "../../apps/runner/src/web-researched.js";
import { runWebPageTextDigest } from "../../apps/runner/src/web-page-text-gateway.js";
import { postgresWebStepPorts, webStepRowId, type WebStepMember } from "../../apps/runner/src/web-step.js";
import { selectPathPages } from "../../packages/evidence/src/host-filter.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { searchMoney } from "../support/web-step-world.js";

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
const QUESTION = "Should Harbour Town build a second ferry pier?";
const PASSAGE = "The harbour survey counted queues that doubled in the two years after the bridge opened, and it found that rents along the quay rose by a third, which no earlier study had looked at in any detail.";
const PAGE_TEXT = `A short start of the page.\n${PASSAGE}\nAnd a long ending that nobody needs to quote, about the weather on the quay in spring.`;
const NOTE = "It is a town survey. It found longer queues and higher rents. It leaves out winter crossings.";
const OTHER_URL = "https://harbour-survey.example/queues";
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });

/** One rooted path with a top page and one other page, on a settled debate, as the web step keeps them (the other page read by reader 1, or not). */
async function settledDebate(options: Readonly<{ readerOne?: "READ" | "FAILED" }> = {}): Promise<Readonly<{ runId: string; pageId: string; position: string }>> {
  const runId = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId, attemptId: randomUUID(), runId, providerRef: "provider:house-a", provider: "test-layer", model: "model:house-a",
    maker: "house-a", modelVersion: "model:house-a", rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
  });
  const position = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const added = await writer.addNode({ runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
      wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: "A second pier would cut the queues.", parentNodeId: null,
      childKind: null, siblingOrdinal: 0, provenanceRef: artifactId });
    await writer.addStrangerRestatement({ nodeId: added, text: "A second pier cuts queues.", checkStatus: "PASS" });
    return added;
  });
  await database.pool.query(`INSERT INTO ledger.reduced_judgement (run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref, producer, replay_handle,
      way_of_knowing, at_seq) VALUES ($1,$2,$3::uuid,0.5,'confidence',$4,'house-a',$5,'REASONING',ledger.allocate_sequence())`,
  [runId, position, artifactId, `artifact:${artifactId}`, `judgement:${randomUUID()}`]);
  expect(await new MapChoiceRepository(database.pool).writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: position, maker: "maker-0" })).toBe("INSERTED");
  const ports = await postgresWebStepPorts(runner, runId);
  const pageId = webStepRowId(runId, "page", "other");
  try {
    const { store, cipher, retention } = ports;
    const searchId = webStepRowId(runId, "search", "a1", "for");
    expect(await store.recordSearch({ runId, searchId, pathRef: "a1", side: "for", languageKind: "english", language: "en", country: null, lookBack: "3y",
      outcome: "FOUND", chargeMicros: 1_000, resultCount: 2, words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "harbour queues" }) })).toBe("RECORDED");
    const topId = webStepRowId(runId, "page", "top");
    for (const [rank, id] of [topId, pageId].entries()) {
      const text = id === pageId ? PAGE_TEXT : "The top page's text.";
      expect(await store.recordPage({ runId, pageId: id, searchId, rank: rank + 1, readDepth: "whole",
        about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, id, { url: id === pageId ? OTHER_URL : "https://top.example/page", site: id === pageId ? "harbour-survey.example" : "top.example",
          title: id === pageId ? "Harbour survey" : "Top page", date: "2026-09-30" }),
        text: { chars: text.length, digest: runWebPageTextDigest(cipher.lease, id, text), sealed: cipher.seal(WEB_EVIDENCE_CARRIERS.pageText, id, text) } })).toBe("RECORDED");
    }
    const readingId = webStepRowId(runId, "reading", pageId, "1");
    const read = (options.readerOne ?? "READ") === "READ";
    expect(await store.recordReading({ runId, readingId, pageId, reader: 1, maker: "anthropic", outcome: read ? "READ" : "FAILED", grade: read ? 1 : null,
      line: read ? cipher.seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { line: "A town survey of queues.", language: "en", note: NOTE }) : null })).toBe("RECORDED");
    expect(await store.recordPicks(runId, "a1", [topId])).toBe("RECORDED");
    expect(retention).toBeDefined();
  } finally {
    await ports.close();
  }
  answers.set(runId, (await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(), factBundle: FACTS })).answerId);
  return { runId, pageId, position };
}

type Script = Readonly<{ grade?: number; fail?: boolean; copy?: string; note?: string; die?: () => boolean }>;
class Killed extends Error {}

/** The three readers through the REAL gateway on the runner's login, metered on the climb's seam as main.ts builds it. */
function readers(script: Readonly<Partial<Record<"haiku" | "deepseek" | "glm", Script>>> = {}) {
  const sent = { haiku: [] as string[], deepseek: [] as string[], glm: [] as string[] };
  const guard = () => new CostEnvelopeGuard({ store: new PostgresModelSpendStore(runner),
    policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 100_000 } });
  const member = (name: "haiku" | "deepseek" | "glm", model: string, maker: string): WebStepMember => {
    const gateway = createPostgresProviderGateway(runner, { endpoint: "http://fixture/v1", model, maker,
      buildPathClimbCostEnvelopeSeam: (runId: string) => guard().pathClimbSeam({ runId, price: PRICE, requireReportedUsage: true }),
      fetchImplementation: async (_url, init) => {
        const body = String(init?.body);
        const behaviour = script[name] ?? {};
        sent[name].push(body);
        if (behaviour.fail === true) return new Response("{}", { status: 400 });
        const packet: PromptPacket = { messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages };
        const frame = readPromptFrame(packet);
        const pages = JSON.parse(frame.fields.find((field) => field.name === "pages")!.content) as { page_id: string }[];
        const copy = behaviour.copy ?? PASSAGE;
        const content = frame.contractId.startsWith("web.read-all")
          ? JSON.stringify({ pages: pages.map((page) => ({ page_id: page.page_id, grade: behaviour.grade ?? 2, adds: "It counts queues.", note: behaviour.note ?? NOTE, extracts: [copy] })) })
          : JSON.stringify({ pages: pages.map((page) => ({ page_id: page.page_id, grade: behaviour.grade ?? 3, extracts: [copy] })), worth_looking_into: ["Winter crossings."] });
        return new Response(JSON.stringify({ id: `${name}-${String(sent[name].length)}`, model, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] }), { status: 200, headers: { "content-type": "application/json" } });
      } });
    return Object.freeze({ model, maker, providerRef: `ref-${name}`, provider: { call: async (request) => {
      // Stops a moment later, so the other reader's answer is on record first.
      if (script[name]?.die?.() === true) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        throw new Killed("the runner stopped");
      }
      return gateway.call(request);
    } } });
  };
  const members = [member("haiku", "claude-haiku-5-5", "Anthropic"), member("deepseek", "deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek"), member("glm", "zai-org/GLM-5.3-Flash", "Z.AI")];
  return { sent, members, calls: () => sent.haiku.length + sent.deepseek.length + sent.glm.length };
}

const settingsOf = (members: readonly WebStepMember[], extra: Partial<WebResearchedSettings> = {}): WebResearchedSettings =>
  Object.freeze({ pool: runner, members, search: null, searchSeamOf: null, log: () => undefined, abandon: (error: unknown) => error instanceof Killed, ...extra });
const press = (runId: string, pageId: string, ownerRef: string = owner.ownerRef) => new PostgresWebResearchedRepository(api).record(ownerRef, runId, pageId);
/** Each debate's answer, as persistTerminalRun made it. */
const answers = new Map<string, string>();
const served = async (runId: string, answerId?: string) => {
  const id = answerId ?? answers.get(runId)!;
  return new ServeRepository(database.pool).readAnswerProjection(id, { ownerRef: owner.ownerRef, legacyAskerId: null });
};
const servedPage = async (runId: string, pageId: string) => (await served(runId))!.web!.paths.flatMap((path) => path.other_pages).find((page) => page.page_ref === pageId)!;
const counts = async (runId: string, pageId: string) => {
  const one = async (sql: string, ...more: unknown[]) => Number((await database.pool.query<{ n: string }>(sql, [runId, ...more])).rows[0]!.n);
  return { text: await one("SELECT count(*)::text AS n FROM identity.web_page_text WHERE run_id=$1 AND page_id=$2", pageId),
    extracts: await one("SELECT count(*)::text AS n FROM identity.web_extract WHERE run_id=$1"),
    replies: await one("SELECT count(*)::text AS n FROM identity.web_reply_text WHERE run_id=$1"),
    quotes: await one("SELECT count(*)::text AS n FROM identity.web_shown_quote WHERE run_id=$1 AND page_id=$2", pageId) };
};
const spend = async (runId: string) => (await database.pool.query<{ spend_source: string; calls: string }>(
  "SELECT spend_source, count(*)::text AS calls FROM ledger.model_spend WHERE run_id=$1 AND charge_micros > 0 AND spend_source <> 'RUN' GROUP BY spend_source ORDER BY spend_source", [runId])).rows;

describe("W4-4 Add to researched", () => {
  it("readers 2 and 3 read the page; its note and quote show and survive the wipe; a later AI reads them, and no passage; the call records hold none", async () => {
    const { runId, pageId, position } = await settledDebate();
    expect((await servedPage(runId, pageId)).researched).toBeUndefined();
    expect(await press(runId, pageId)).toBe("RECORDED");
    expect((await servedPage(runId, pageId)).researched).toEqual({ state: "READING" });
    // While it waits its debate holds on to the text: the passage sweep leaves it alone.
    expect((await new PostgresPassageRetentionRepository(runner).wipe(runId, "NOTHING_RUNS")).outcome).toBe("STILL_RUNNING");

    const ais = readers();
    expect(await sweepWebResearched(settingsOf(ais.members))).toMatchObject({ listed: 1, settled: 1, skipped: 0 });
    // Reader 1 read it when the debate ran: it is not bought again. Readers 2 and 3 were sent the whole text.
    expect(ais.sent.haiku).toEqual([]);
    expect(ais.sent.deepseek).toHaveLength(1);
    expect(ais.sent.glm).toHaveLength(1);
    expect(ais.sent.deepseek[0]).toContain("A short start of the page.");

    const page = await servedPage(runId, pageId);
    expect(page.researched).toMatchObject({ state: "ADDS" });
    const source = page.researched!.state === "ADDS" ? page.researched!.sources[0]! : null;
    expect(source!.quote.length).toBeLessThanOrEqual(120);
    expect(PASSAGE.startsWith(source!.quote.replace(/…$/u, ""))).toBe(true);
    expect(source!.quote).not.toBe(PASSAGE);
    expect(source!.explanation?.text).toBe(NOTE);
    expect(source!.fewer_readers).toBeUndefined();
    // The page's own path holds it, by its root.
    expect((await served(runId))!.web!.paths[0]!.position_ref).toBe(position.toLowerCase());

    // The wipe has run: the page's text, the passage and the replies are gone; the quote and note stay, and serve the same.
    expect(await counts(runId, pageId)).toEqual({ text: 0, extracts: 0, replies: 0, quotes: 1 });
    expect((await servedPage(runId, pageId)).researched).toEqual(page.researched);

    // The call records never held the page's text or the passage: a reference stood there, and the reply was stored apart.
    const rows = (await database.pool.query<{ attempt_id: string; content_ciphertext: never }>("SELECT attempt_id, content_ciphertext FROM ledger.call_prompt WHERE run_id=$1", [runId])).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const prompt = await withRunContentLease(database.pool, [runId], () => decryptContentForRun<{ promptText: string }>(database.pool, runId, "ledger.call_prompt", row.attempt_id, row.content_ciphertext, { promptText: CONTENT_CIPHERTEXT_SENTINEL }));
      expect(prompt.promptText).toContain("web-page-text:");
      expect(prompt.promptText).not.toContain("A short start of the page.");
      expect(prompt.promptText).not.toContain("queues that doubled");
    }
    const artifacts = (await database.pool.query<{ raw_artifact_id: string; content_ciphertext: never }>("SELECT raw_artifact_id, content_ciphertext FROM ledger.raw_artifact WHERE run_id=$1 AND provider <> 'test-layer'", [runId])).rows;
    expect(artifacts.length).toBeGreaterThanOrEqual(2);
    for (const artifact of artifacts) {
      const opened = await withRunContentLease(database.pool, [runId], () => decryptContentForRun<{ rawText: string }>(database.pool, runId, "ledger.raw_artifact", artifact.raw_artifact_id, artifact.content_ciphertext, { rawText: CONTENT_CIPHERTEXT_SENTINEL }));
      expect(webReplyTextIdOf(opened.rawText)).toBe(artifact.raw_artifact_id);
    }

    // A later AI: a dig's planners read the note and the quote, never the passage or the page's text.
    const dig = await createEncryptedStoryRun(database.pool, owner, "Would winter riders fill it?");
    const joined = await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: runId, childRunId: dig, places: [`path:${position}`], mode: "quick" });
    expect(joined.outcome).toBe("JOINED");
    const digest = await readAlreadyInvestigated(runner, dig, new Date(Date.now() + 60_000).toISOString());
    const added = (JSON.parse(digest) as { added?: { site: string; note: string; quotes: string[] }[] }[]).flatMap((debate) => debate.added ?? []);
    expect(added).toEqual([{ site: "harbour-survey.example", title: "Harbour survey", note: NOTE, quotes: [source!.quote] }]);
    expect(digest).not.toContain(PASSAGE);
    expect(digest).not.toContain("And a long ending");

    // Nothing is waiting, and the path was not rewritten: no rewrite row for it.
    expect((await sweepWebResearched(settingsOf(ais.members))).listed).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM identity.path_rewrite WHERE parent_run_id=$1", [runId])).rowCount).toBe(0);
  }, 120_000);

  it("charges the two readers once, on the run, never walled; a second press starts nothing", async () => {
    const { runId, pageId } = await settledDebate();
    expect(await press(runId, pageId)).toBe("RECORDED");
    const ais = readers();
    await sweepWebResearched(settingsOf(ais.members));
    expect(await spend(runId)).toEqual([{ spend_source: "PATH_CLIMB", calls: "2" }]);
    expect(await press(runId, pageId)).toBe("ALREADY");
    expect((await sweepWebResearched(settingsOf(ais.members))).listed).toBe(0);
    expect(ais.calls()).toBe(2);
    expect(await spend(runId)).toEqual([{ spend_source: "PATH_CLIMB", calls: "2" }]);
    // The ledger's calls are under the page's own subject, so a retry finds them.
    expect((await database.pool.query("SELECT DISTINCT subject_item_id FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'", [runId])).rows)
      .toEqual([{ subject_item_id: webResearchedSubjectOf(runId, pageId) }]);
  }, 120_000);

  it("a runner that stops after one reader answered goes on: that call replayed free, the other bought once", async () => {
    const { runId, pageId } = await settledDebate();
    expect(await press(runId, pageId)).toBe("RECORDED");
    let dying = true;
    const first = readers({ glm: { die: () => dying } });
    await expect(sweepWebResearched(settingsOf(first.members))).rejects.toBeInstanceOf(Killed);
    dying = false;
    expect(first.sent.deepseek).toHaveLength(1);
    const before = await spend(runId);
    expect(before).toEqual([{ spend_source: "PATH_CLIMB", calls: "1" }]);
    expect((await servedPage(runId, pageId)).researched).toEqual({ state: "READING" });

    const second = readers();
    await sweepWebResearched(settingsOf(second.members));
    expect(second.sent.deepseek).toEqual([]);
    expect(second.sent.glm).toHaveLength(1);
    expect(await spend(runId)).toEqual([{ spend_source: "PATH_CLIMB", calls: "2" }]);
    expect((await servedPage(runId, pageId)).researched).toMatchObject({ state: "ADDS" });
  }, 120_000);

  it("refuses a stranger and a page that is not an other page", async () => {
    const { runId, pageId } = await settledDebate();
    expect(await press(runId, pageId, randomUUID())).toBe("NOT_OWNED");
    expect(await press(runId, webStepRowId(runId, "page", "top"))).toBe("NOT_OTHER_PAGE");
    expect((await new PostgresWebEvidenceRepository(runner).read(runId))!.researched).toEqual([]);
  }, 120_000);

  it("a page that adds nothing says so and keeps no quote; a failed reading says so; its text goes either way", async () => {
    const nothing = await settledDebate();
    expect(await press(nothing.runId, nothing.pageId)).toBe("RECORDED");
    await sweepWebResearched(settingsOf(readers({ deepseek: { grade: 0 }, glm: { grade: 0 } }).members));
    expect((await servedPage(nothing.runId, nothing.pageId)).researched).toEqual({ state: "ADDS_NOTHING" });
    expect(await counts(nothing.runId, nothing.pageId)).toEqual({ text: 0, extracts: 0, replies: 0, quotes: 0 });

    // A copy the page does not hold word for word is dropped by code, so it adds nothing either.
    const invented = await settledDebate();
    expect(await press(invented.runId, invented.pageId)).toBe("RECORDED");
    await sweepWebResearched(settingsOf(readers({ deepseek: { copy: "Words the page never wrote." }, glm: { copy: "Words the page never wrote." } }).members));
    expect((await servedPage(invented.runId, invented.pageId)).researched).toEqual({ state: "ADDS_NOTHING" });

    const failed = await settledDebate();
    expect(await press(failed.runId, failed.pageId)).toBe("RECORDED");
    const dead = readers({ deepseek: { fail: true }, glm: { fail: true } });
    await sweepWebResearched(settingsOf(dead.members));
    expect((await servedPage(failed.runId, failed.pageId)).researched).toEqual({ state: "FAILED" });
    expect((await counts(failed.runId, failed.pageId)).text).toBe(0);
    expect((await spend(failed.runId))).toEqual([]);
  }, 180_000);

  it("reader 1 could not read the page when the debate ran: it reads it now, and its note shows with the quote and reaches later AIs", async () => {
    const { runId, pageId, position } = await settledDebate({ readerOne: "FAILED" });
    expect(await press(runId, pageId)).toBe("RECORDED");
    const late = "Written late: a town survey that leaves out winter.";
    const ais = readers({ haiku: { note: late } });
    await sweepWebResearched(settingsOf(ais.members));
    expect(ais.sent.haiku).toHaveLength(1);
    expect(readPromptFrame({ messages: (JSON.parse(ais.sent.haiku[0]!) as { messages: PromptPacket["messages"] }).messages }).contractId).toBe("web.read-all.v2");
    const page = await servedPage(runId, pageId);
    expect(page.researched!.state === "ADDS" ? page.researched!.sources[0]!.explanation?.text : null).toBe(late);
    expect(await spend(runId)).toEqual([{ spend_source: "PATH_CLIMB", calls: "3" }]);
    const dig = await createEncryptedStoryRun(database.pool, owner, "A dig.");
    await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: runId, childRunId: dig, places: [`path:${position}`], mode: "quick" });
    expect(await readAlreadyInvestigated(runner, dig, new Date(Date.now() + 60_000).toISOString())).toContain(late);
  }, 120_000);

  describe("30 days after the last activity", () => {
    /** The debate left for 31 days: the sweep takes its other page's text; the link, the note and the row stay. */
    async function leftForAMonth() {
      const debate = await settledDebate();
      await new PostgresInvestigationRepository(api).open(owner.ownerRef, debate.runId);
      await database.pool.query(`UPDATE identity.investigation SET last_activity_at = clock_timestamp() - interval '31 days'
        WHERE investigation_id = (SELECT investigation_id FROM identity.investigation_member WHERE run_id=$1)`, [debate.runId]);
      expect(await new PostgresInvestigationRunnerRepository(runner).wipeInactivePageText(500)).toBeGreaterThanOrEqual(1);
      expect((await counts(debate.runId, debate.pageId)).text).toBe(0);
      expect((await servedPage(debate.runId, debate.pageId)).link).toBe(OTHER_URL);
      return debate;
    }
    function searchFinding(url: string, text: string) {
      const queries: string[] = [];
      const money = searchMoney();
      const port = createPerplexitySearchPort({ selectPages: (pages) => selectPathPages(pages, new Set()), timeLimitMs: 50, fetch: (async (_url: unknown, init?: RequestInit) => {
        queries.push((JSON.parse(String(init?.body)) as { query: string }).query);
        return new Response(JSON.stringify({ id: "search-1", results: [{ title: "Harbour survey", url, snippet: text, date: "2026-03-01", last_updated: null }] }), { status: 200 });
      }) as typeof fetch });
      return { port, queries, money };
    }

    it("the page's own search brings it back for this reading, once, and the text is not stored again", async () => {
      const { runId, pageId } = await leftForAMonth();
      expect(await press(runId, pageId)).toBe("RECORDED");
      const search = searchFinding(OTHER_URL, PAGE_TEXT);
      const ais = readers();
      await sweepWebResearched(settingsOf(ais.members, { search: search.port, searchSeamOf: () => search.money.seam() }));
      expect(search.queries).toEqual(["Harbour survey"]);
      expect(search.money.charged).toEqual(["SUCCEEDED"]);
      expect(ais.sent.deepseek[0]).toContain("A short start of the page.");
      expect((await servedPage(runId, pageId)).researched).toMatchObject({ state: "ADDS" });
      expect(await counts(runId, pageId)).toEqual({ text: 0, extracts: 0, replies: 0, quotes: 1 });
    }, 120_000);

    it("a page the search no longer finds says it could not be read; no reader is paid", async () => {
      const { runId, pageId } = await leftForAMonth();
      expect(await press(runId, pageId)).toBe("RECORDED");
      const search = searchFinding("https://another-site.example/other", "Something else.");
      const ais = readers();
      await sweepWebResearched(settingsOf(ais.members, { search: search.port, searchSeamOf: () => search.money.seam() }));
      expect(ais.calls()).toBe(0);
      expect((await servedPage(runId, pageId)).researched).toEqual({ state: "FAILED" });
    }, 120_000);

    it("with no search on this server the page says the same", async () => {
      const { runId, pageId } = await leftForAMonth();
      expect(await press(runId, pageId)).toBe("RECORDED");
      const ais = readers();
      await sweepWebResearched(settingsOf(ais.members));
      expect(ais.calls()).toBe(0);
      expect((await servedPage(runId, pageId)).researched).toEqual({ state: "FAILED" });
    }, 120_000);
  });
});
