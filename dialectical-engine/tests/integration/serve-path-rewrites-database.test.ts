// tests/integration/serve-path-rewrites-database.test.ts
// W4-5 (dig-model revision 2026-10-30): the rewrites served, on real PostgreSQL. Three digs stacked under a first debate,
// each joined and its picks kept at start through the API's login (0133, 0135), each turn and rewrite stored through the
// runner's login and repositories (0134), each text sealed under its dig's own key; the answers read back through
// ServeRepository on the API's login and on the runner's. Pinned: the first debate's path with its history, current text,
// the verdict beside the person's own words, "changed further down" three levels up and the "changed since" count before
// and after a report; a dig's own answer (what it dug, who wrote each pick, its level, its rewrite with its own paths'
// lines); a FAILED rewrite leaving the text; nothing for a stranger; an answer no dig touched unchanged. Data is made up.
// W4-8 (owner Q-D3): the points a rewrite rests on, kept in its sealed text, and the rewritten path's trust words worked
// out by code over the path's own points and those dig points, each "Sure" only by a checked extract of its own debate.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnswerSchema, StoryBodySchema, type Answer, type StoryFate } from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRepository, PostgresInvestigationRepository,
  PostgresInvestigationRunnerRepository, WEB_EVIDENCE_CARRIERS, configureContentEncryption, contentCipherFor, createPool,
  encryptAttestedContentForRun, migrate, withRunContentLease, type DigPickInput, type Pool
} from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository, insertPreparedNodeReview } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { ServeRepository } from "@debateai/serve";
import { StoryRepository } from "@debateai/story";
import { postgresWebStepPorts, webStepRowId } from "../../apps/runner/src/web-step.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let api: Pool;
let runner: Pool;
let owner: StoryEncryptedOwner;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const PATH_LINE = "Yes: a second pier would cut the queues.";
const OWN_WORDS = "I think tourists keep the ferries full all year.";
const SUGGESTED = "Does winter ridership fall?";
const LINEAGE = Object.freeze({ maker: "W45_ENGINE_MAKER", model_id: "W45_ENGINE_MODEL" });

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
const OWNERSHIP = () => ({ ownerRef: owner.ownerRef, legacyAskerId: null });

/** The debate's story: one path on `position` with `line`, naming `nodeRefs` on it (only the position by default). */
async function storyOn(runId: string, answerId: string, position: string, line: string, nodeRefs: readonly string[] = [position]): Promise<void> {
  const paragraph = { text: "A paragraph.", node_refs: [position] };
  const body = StoryBodySchema.parse({ shape_id: "general",
    short: { headline: "Headline.", summary: "Summary.", confidence: "Fairly sure.",
      paths: [{ position_ref: position, fate: "HELD_UP", line, node_refs: [...nodeRefs] }], change: paragraph },
    why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null });
  expect(await new StoryRepository(database.pool).insert({ runId, answerId, answerVersion: 1, outcome: "READY", failureCode: null,
    shapeId: "general", packVersion: "2026-09-26.1", packFingerprint: "f".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 1, artifactRefs: [randomUUID()], body, reservation: null, verdictBasis: null, pointNumbers: null, languageTag: "en",
    storytellerRepairs: 0 })).toBe("INSERTED");
}

type Debate = Readonly<{ runId: string; answerId: string; position: string }>;

/** A settled debate with its answer and a story whose one path is `position`. */
async function debate(question: string, line: string): Promise<Debate> {
  const runId = await createEncryptedStoryRun(database.pool, owner, question);
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = randomUUID();
  await storyOn(runId, answerId, position, line);
  return { runId, answerId, position };
}

/** A dig of `parent`'s path, joined and its picks kept at start (the asks route's two steps, API login), then settled. */
async function dig(parent: Debate, level: number, picks: readonly Omit<DigPickInput, "place">[]): Promise<Debate & { investigationId: string }> {
  const runId = await createEncryptedStoryRun(database.pool, owner, `A follow-up at level ${String(level)}?`);
  const joined = await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: parent.runId, childRunId: runId,
    places: [`path:${parent.position}`], mode: "quick" });
  expect(joined).toMatchObject({ outcome: "JOINED", digLevel: level });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId, parentRunId: parent.runId,
    positionRef: parent.position, picks: picks.map((pick) => ({ ...pick, place: `path:${parent.position}` })) })).toBe("RECORDED");
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = randomUUID();
  await storyOn(runId, answerId, position, `The dig's path at level ${String(level)}.`);
  return { runId, answerId, position, investigationId: joined.investigationId! };
}

const PICK_SUGGESTED = { kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", author: "AI_SUGGESTION", text: SUGGESTED } as const;
const PICK_OWN = { kind: "OWN_VIEW", suggestionId: null, author: "PERSON_OWN_VIEW", text: OWN_WORDS } as const;

/** The dig's turn and its rewrite, through the runner's repository; a finished one's text sealed under the dig's key. */
async function rewrite(digged: Debate, parent: Debate, input: Readonly<{ outcome: "READY" | "FAILED"; basedOn?: string | null;
  fateBefore: StoryFate; fateAfter?: StoryFate; line?: string; verdict?: boolean; digPathLine?: string; restsOn?: readonly string[] }>): Promise<string> {
  const store = new PostgresDigModelRunnerRepository(runner);
  expect((await store.takeRewriteTurn(digged.runId, parent.runId, parent.position)).outcome).toBe("TAKEN");
  const rewriteId = randomUUID();
  const ready = input.outcome === "READY";
  const content = ready ? await withRunContentLease(runner, [digged.runId], () => encryptAttestedContentForRun(runner, digged.runId,
    PATH_REWRITE_CARRIER, rewriteId, {
      text: { line: input.line!, summary: `${input.line!} In short.`, fate: input.fateAfter! },
      what_changed: [`W45 what the dig at ${digged.runId.slice(0, 4)} changed.`],
      view_reason: input.verdict === true ? "W45 your view held up against the counts." : null,
      dig_paths: [{ position_ref: digged.position, line: input.digPathLine ?? "W45 the dig's own path.", fate: "FELL" }],
      // W4-8: a text sealed before W4-8 has no `rests_on` (the W4-5 case below keeps it so).
      ...(input.restsOn === undefined ? {} : { rests_on: [...input.restsOn] })
    })) : null;
  expect(await store.recordRewrite({ rewriteId, digRunId: digged.runId, parentAnswerVersion: 1, basedOnRewriteId: input.basedOn ?? null,
    outcome: input.outcome, failureCode: ready ? null : "PATH_REWRITE_ALL_WRITERS_FAILED", fateBefore: input.fateBefore,
    fateAfter: ready ? input.fateAfter! : null, verdict: input.verdict === true ? { outcome: "HELPED", scope: "MAIN_QUESTION" } : null,
    writerLineage: ready ? LINEAGE : null, checkerLineage: ready ? LINEAGE : null, rounds: ready ? 2 : 0,
    artifactRefs: [randomUUID()], content })).toBe("RECORDED");
  return rewriteId;
}

/** W4-8: one point of `runId`, a root with its judgement, its restatement and the second AI's review (another maker). */
async function point(runId: string, label: string, input: Readonly<{ wayOfKnowing: "REASONING" | "LOOKED_UP"; locator: string | null;
  review: "agree" | "dispute" }>): Promise<string> {
  const ledger = new LedgerRepository(database.pool);
  const author = randomUUID();
  const reviewer = randomUUID();
  for (const [artifactId, maker] of [[author, "w48-house-a"], [reviewer, "w48-house-b"]] as const) {
    await ledger.appendRawArtifact({ artifactId, attemptId: randomUUID(), runId, providerRef: `provider:${maker}`, provider: "test-layer",
      model: `model:${maker}`, maker, modelVersion: `model:${maker}`, rawText: "{}", metadata: {}, parseStatus: "PARSED",
      inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64) });
  }
  const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const added = await writer.addNode({ runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active",
      explorationDecision: "continue", wayOfKnowing: input.wayOfKnowing, locator: input.locator, valueLaden: false, statementText: label,
      parentNodeId: null, childKind: null, siblingOrdinal: 0, provenanceRef: author });
    await writer.addStrangerRestatement({ nodeId: added, text: `${label} restated`, checkStatus: "PASS" });
    return added;
  });
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref, producer, replay_handle,
      way_of_knowing, at_seq)
    VALUES ($1,$2,$3::uuid,0.5,'confidence',$4,'w48-house-a',$5,$6,ledger.allocate_sequence())`,
  [runId, nodeId, author, `artifact:${author}`, `judgement:${randomUUID()}`, input.wayOfKnowing]);
  const prepared = await withRunContentLease(database.pool, [runId], () => new JudgementRepository(database.pool).prepareNodeReview({
    runId, nodeId, authorRawArtifactRef: author, reviewRawArtifactRef: reviewer, outcome: input.review, reasons: [`W48 ${label} reviewed.`] }));
  const client = await database.pool.connect();
  try {
    await insertPreparedNodeReview(client, prepared);
  } finally {
    client.release();
  }
  return nodeId;
}

/** W4-8: `runId`'s web step kept one page with these checked extracts (W3-1's rows, sealed under the run's key). */
async function checkedExtracts(runId: string, labels: readonly string[]): Promise<void> {
  const ports = await postgresWebStepPorts(database.pool, runId);
  try {
    const { store, cipher } = ports;
    const searchId = webStepRowId(runId, "search", "w48", "for");
    expect(await store.recordSearch({ runId, searchId, pathRef: "w48", side: "for", languageKind: "english", language: "en", country: null,
      lookBack: "3y", outcome: "FOUND", chargeMicros: 1_000, resultCount: 1,
      words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "harbour town pier queues" }) })).toBe("RECORDED");
    const pageId = webStepRowId(runId, "page", "w48");
    expect(await store.recordPage({ runId, pageId, searchId, rank: 1, readDepth: "whole", text: null,
      about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: "https://news.example.org/w48-queues", site: "news.example.org",
        title: "Pier queues", date: "2026-09-30" }) })).toBe("RECORDED");
    for (const label of labels) {
      const extractId = webStepRowId(runId, "extract", label);
      expect(await store.recordExtract({ runId, extractId, pageId, label, foundBy: [1],
        quote: cipher.seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: `W48 the queues reach forty minutes (${label}).` }) })).toBe("RECORDED");
    }
  } finally {
    await ports.close();
  }
}

const read = async (pool: Pool, answerId: string): Promise<Answer> => {
  const answer = await new ServeRepository(pool).readAnswerProjection(answerId, OWNERSHIP());
  expect(answer).not.toBeNull();
  AnswerSchema.parse(answer);
  return answer!;
};

describe("W4-5 the rewrites served from the real store", () => {
  it("serves each path's history and current text, the dig's own answer, changed-below three levels up and the count around a report", async () => {
    const root = await debate(QUESTION, PATH_LINE);
    // Level 1 dug the first debate's path with an AI suggestion and the person's own view: READY, with the verdict.
    const one = await dig(root, 1, [PICK_SUGGESTED, PICK_OWN]);
    const firstRewrite = await rewrite(one, root, { outcome: "READY", fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD", verdict: true,
      line: "W45_FIRST_LINE yes, but winter halves the queues.", digPathLine: "W45 tourists fill the summer ferries." });
    // Level 2 dug level 1's path with the person's own view: its rewrite FAILED. Level 3 dug level 2's path: READY.
    const two = await dig(one, 2, [PICK_OWN]);
    await rewrite(two, one, { outcome: "FAILED", fateBefore: "HELD_UP" });
    const three = await dig(two, 3, [PICK_SUGGESTED]);
    await rewrite(three, two, { outcome: "READY", fateBefore: "HELD_UP", fateAfter: "FELL", line: "W45_THIRD_LINE the pier fell." });

    // The text is kept sealed: the row holds an envelope, never the line.
    const sealed = (await database.pool.query<{ sealed: string }>("SELECT content_ciphertext::text AS sealed FROM identity.path_rewrite WHERE run_id = $1",
      [one.runId])).rows[0]!.sealed;
    expect(sealed).not.toContain("W45_FIRST_LINE");

    // The first debate: its path rewritten once by level 1, marked as changed further down (level 3, two levels below it).
    const rootAnswer = await read(api, root.answerId);
    expect(rootAnswer).not.toHaveProperty("dig");
    const firstText = { line: "W45_FIRST_LINE yes, but winter halves the queues.", summary: "W45_FIRST_LINE yes, but winter halves the queues. In short.",
      fate: "PARTLY_HELD" };
    expect(rootAnswer.path_rewrites).toEqual({
      paths: [{ position_ref: root.position, current: firstText, changed_below: true, history: [{
        rewrite_id: firstRewrite, dig_run_id: one.runId, dig_level: 1, dig_finished_at: expect.any(String), state: "READY",
        rewritten_at: expect.any(String), changed: true, text: firstText, what_changed: [expect.stringContaining("W45 what the dig")],
        fate_before: "HELD_UP",
        view: { outcome: "HELPED", scope: "MAIN_QUESTION", reason: "W45 your view held up against the counts.", own_words: [OWN_WORDS] },
        dig_paths: [{ position_ref: one.position, line: "W45 tourists fill the summer ferries.", fate: "FELL" }],
        // W4-8: a text sealed before W4-8 rests on no point; the path's story names no point of the debate here.
        rests_on: [], trust: []
      }] }],
      changed_since: { count: 1, since_report_version: null }
    });
    // No engine number reaches the answer.
    expect(JSON.stringify(rootAnswer.path_rewrites)).not.toMatch(/W45_ENGINE|PATH_REWRITE_ALL_WRITERS_FAILED|lineage|rounds/u);
    // The runner's login reads the same answer (the runtime role's readers): the review catch-up and the tests keep working.
    expect((await read(runner, root.answerId)).path_rewrites).toEqual(rootAnswer.path_rewrites);

    // Level 1's own answer: what it dug and its rewrite as the first debate serves it; its path's FAILED rewrite keeps the text.
    const oneAnswer = await read(api, one.answerId);
    expect(oneAnswer.dig).toEqual({ parent_run_id: root.runId, position_ref: root.position, places: [`path:${root.position}`], level: 1,
      picks: [{ kind: "NEEDS_MORE_WEB", place: `path:${root.position}`, text: SUGGESTED, by: "AI_SUGGESTION" },
        { kind: "OWN_VIEW", place: `path:${root.position}`, text: OWN_WORDS, by: "PERSON_OWN_VIEW" }],
      rewrite: rootAnswer.path_rewrites!.paths[0]!.history[0] });
    expect(oneAnswer.path_rewrites!.paths).toEqual([{ position_ref: one.position, current: null, changed_below: true,
      history: [{ rewrite_id: expect.any(String), dig_run_id: two.runId, dig_level: 2, dig_finished_at: expect.any(String),
        state: "FAILED", failed_at: expect.any(String) }] }]);
    expect(oneAnswer.path_rewrites!.changed_since).toEqual({ count: 0, since_report_version: null });
    // Its points and answer text serve as usual (Q-D13).
    expect(oneAnswer.reversal_point).toBe("none");

    // Level 3: an AI suggestion only, so no verdict; its own path no dig touched.
    const threeAnswer = await read(api, three.answerId);
    expect(threeAnswer.dig).toMatchObject({ level: 3, position_ref: two.position, rewrite: { state: "READY", view: null,
      text: { line: "W45_THIRD_LINE the pier fell.", fate: "FELL" } } });
    expect(threeAnswer).not.toHaveProperty("path_rewrites");

    // Nothing for anyone but the owner.
    expect(await new ServeRepository(api).readAnswerProjection(root.answerId, { ownerRef: randomUUID(), legacyAskerId: null })).toBeNull();

    // "Write my report": the investigation closes as version 1 and its report is stored; nothing changed since it.
    const closed = await new PostgresInvestigationRepository(api).close(owner.ownerRef, one.investigationId);
    expect(closed).toMatchObject({ outcome: "CLOSED", reportVersion: 1 });
    expect(await new PostgresInvestigationRunnerRepository(runner).recordReport(one.investigationId, 1, randomUUID())).toBe("RECORDED");
    expect((await read(api, root.answerId)).path_rewrites!.changed_since).toEqual({ count: 0, since_report_version: 1 });

    // Reopened, a later dig rewrites the same path on the first rewrite's text: the path counts again, since version 1.
    expect(await new PostgresInvestigationRepository(api).reopen(owner.ownerRef, one.investigationId)).toBe("REOPENED");
    const four = await dig(root, 1, [PICK_OWN]);
    const fourthRewrite = await rewrite(four, root, { outcome: "READY", basedOn: firstRewrite, fateBefore: "PARTLY_HELD", fateAfter: "PARTLY_HELD",
      verdict: true, line: "W45_FOURTH_LINE yes, with a smaller pier." });
    const after = (await read(api, root.answerId)).path_rewrites!;
    expect(after.paths[0]!.history.map((entry) => [entry.rewrite_id, entry.state])).toEqual([[firstRewrite, "READY"], [fourthRewrite, "READY"]]);
    expect(after.paths[0]!.current!.line).toBe("W45_FOURTH_LINE yes, with a smaller pier.");
    expect(after.changed_since).toEqual({ count: 1, since_report_version: 1 });
  });

  it("W4-8: keeps the points a rewrite rests on, and counts the path's own points and those dig points, each by its own debate's checks", async () => {
    // The first debate: its path's position (argued, agreed) and a looked-up point resting on its own checked extract S1-1.
    const rootRun = await createEncryptedStoryRun(database.pool, owner, "Should Harbour Town build a third ferry pier?");
    const { answerId } = await persistTerminalRun({ pool: database.pool, runId: rootRun, fixtureKey: randomUUID(), factBundle: FACTS });
    const position = await point(rootRun, "W48 yes, a third pier", { wayOfKnowing: "REASONING", locator: null, review: "agree" });
    const queues = await point(rootRun, "W48 queues run long", { wayOfKnowing: "LOOKED_UP", locator: "S1-1", review: "agree" });
    const cost = await point(rootRun, "W48 a pier costs more", { wayOfKnowing: "REASONING", locator: null, review: "dispute" });
    await checkedExtracts(rootRun, ["S1-1", "S1-2"]);
    await storyOn(rootRun, answerId, position, PATH_LINE, [position, queues, cost]);
    const root: Debate = { runId: rootRun, answerId, position };

    // The dig: one point on its own checked extract S1-1; one naming S1-2, which only the first debate checked; one not rested on.
    const one = await dig(root, 1, [PICK_SUGGESTED]);
    const winter = await point(one.runId, "W48 winter ridership falls", { wayOfKnowing: "LOOKED_UP", locator: "S1-1", review: "agree" });
    const borrowed = await point(one.runId, "W48 the bridge takes traffic", { wayOfKnowing: "LOOKED_UP", locator: "S1-2", review: "agree" });
    const unused = await point(one.runId, "W48 buses carry commuters", { wayOfKnowing: "LOOKED_UP", locator: "S1-1", review: "agree" });
    await checkedExtracts(one.runId, ["S1-1"]);
    const restsOn = [queues, winter, borrowed];
    await rewrite(one, root, { outcome: "READY", fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD", line: "W48_LINE partly: winter halves it.", restsOn });

    // Kept sealed: the row holds an envelope, never the ids it rests on.
    const sealed = (await database.pool.query<{ sealed: string }>("SELECT content_ciphertext::text AS sealed FROM identity.path_rewrite WHERE run_id = $1",
      [one.runId])).rows[0]!.sealed;
    expect(sealed).not.toContain(winter);

    const served = (await read(api, root.answerId)).path_rewrites!.paths[0]!.history[0]!;
    expect(served).toMatchObject({ state: "READY", rests_on: restsOn, trust: [
      { node_id: position, word: "SURE_FOR_CASE" },
      { node_id: queues, word: "SURE" },
      { node_id: cost, word: "STILL_ARGUED" },
      // The dig's point on its own checked extract is "Sure"; the one naming an extract only the first debate checked is not.
      { node_id: winter, word: "SURE" },
      { node_id: borrowed, word: "SURE_FOR_CASE" }
    ] });
    expect(JSON.stringify(served)).not.toContain(unused);
    // The dig's own answer serves its rewrite with the same words; the runner's login reads the same.
    expect((await read(api, one.answerId)).dig!.rewrite).toEqual(served);
    expect((await read(runner, root.answerId)).path_rewrites!.paths[0]!.history[0]).toEqual(served);
  });

  it("serves an answer no dig touched exactly as before", async () => {
    const alone = await debate("Should Harbour Town paint the old pier?", "Yes: the paint protects the wood.");
    const answer = await read(api, alone.answerId);
    expect(answer).not.toHaveProperty("path_rewrites");
    expect(answer).not.toHaveProperty("dig");
  });
});
