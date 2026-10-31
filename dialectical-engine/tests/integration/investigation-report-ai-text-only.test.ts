// tests/integration/investigation-report-ai-text-only.test.ts
// R22 decisions 5 and 6 on real PostgreSQL, the closing's sources over a real debate: a first debate and a dig, each with a real
// web step whose passage carries words past its shown quote, and 0135's stored paths carrying those words too. Pinned: no call
// of the report (nor the version it stores) holds those words, while the shown quote, the page note and the address are there;
// every point on the dig's path is there; the wipe of the passages changes the material by not one byte; the purpose lines and a
// climb's newest text are read. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema, cutQuoteAtWordEdge, type StoryFate } from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PATH_UPDATE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRepository, PostgresDigPicksRunnerRepository,
  PostgresInvestigationRepository, PostgresPassageRetentionRepository, PostgresTreeUpdateRepository, PostgresTreeUpdateRunnerRepository,
  PostgresWebEvidenceRepository, RUN_PURPOSE_LINES_CARRIER, WEB_EVIDENCE_CARRIERS, WEB_SHOWN_QUOTE_CARRIER, configureContentEncryption, contentCipherFor,
  createPool, decryptContentForRun, encryptAttestedContentForRun, migrate, withRunContentLease, type Pool
} from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { StoryRepository } from "@debateai/story";
import { postgresInvestigationCloseSources } from "../../apps/runner/src/investigation-close-sources.js";
import { buildInvestigationDossier, type Dossier } from "../../apps/runner/src/investigation-dossier.js";
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

const FACTS = { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "none",
  buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } as const;
const LINEAGE = Object.freeze({ maker: "fixture-maker", model_id: "fixture-model" });
const QUEUES = "The queues reach forty minutes at the morning peak on most working days of the year, the counts say,";
const PAST_THE_QUOTE = "WORDS_PAST_THE_SHOWN_QUOTE";
const passage = (who: string): string => `${who} ${QUEUES} and ${PAST_THE_QUOTE} ${who} go on for a page.`;
const NOTE = "The port's own counts: what they cover, what they found, what they leave out.";

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

async function storyOn(runId: string, answerId: string, position: string, line: string, nodeRefs: readonly string[]): Promise<void> {
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

async function point(runId: string, label: string, locator: string | null): Promise<string> {
  const author = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({ artifactId: author, attemptId: randomUUID(), runId, providerRef: "provider:a", provider: "test-layer",
    model: "model:a", maker: "house-a", modelVersion: "model:a", rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64) });
  return new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const added = await writer.addNode({ runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active",
      explorationDecision: "continue", wayOfKnowing: locator === null ? "REASONING" : "LOOKED_UP", locator, valueLaden: false, statementText: label,
      parentNodeId: null, childKind: null, siblingOrdinal: 0, provenanceRef: author });
    await writer.addStrangerRestatement({ nodeId: added, text: `${label} restated`, checkStatus: "PASS" });
    return added;
  });
}

/** The web step as it stores it: a page, reader 1's note, one extract with its whole passage, and its shown quote beside it. */
async function webStep(runId: string, who: string): Promise<string> {
  const ports = await postgresWebStepPorts(database.pool, runId);
  const extractId = webStepRowId(runId, "extract", "S1-1");
  try {
    const { store, cipher } = ports;
    const searchId = webStepRowId(runId, "search", "fixture", "for");
    expect(await store.recordSearch({ runId, searchId, pathRef: "fixture", side: "for", languageKind: "english", language: "en", country: null,
      lookBack: "3y", outcome: "FOUND", chargeMicros: 1_000, resultCount: 1, words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "pier queues" }) })).toBe("RECORDED");
    const pageId = webStepRowId(runId, "page", "fixture");
    expect(await store.recordPage({ runId, pageId, searchId, rank: 1, readDepth: "whole", text: null,
      about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: `https://${who}.example.org/queues`, site: `${who}.example.org`, title: "Pier queues", date: "2026-09-30" }) })).toBe("RECORDED");
    const readingId = randomUUID();
    expect(await store.recordReading({ runId, readingId, pageId, reader: 1, maker: "anthropic", outcome: "READ", grade: 3,
      line: cipher.seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { line: NOTE, language: "en" }) })).toBe("RECORDED");
    expect(await store.recordExtract({ runId, extractId, pageId, label: "S1-1", foundBy: [1],
      quote: cipher.seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: passage(who) }) })).toBe("RECORDED");
    const shown = await withRunContentLease(runner, [runId], () => encryptAttestedContentForRun(runner, runId, WEB_SHOWN_QUOTE_CARRIER, extractId, { quote: cutQuoteAtWordEdge(passage(who)) }));
    expect(await new PostgresPassageRetentionRepository(runner).recordShownQuote(runId, extractId, shown!)).toBe("RECORDED");
  } finally {
    await ports.close();
  }
  return extractId;
}

type Tree = Readonly<{ root: string; position: string; dig: string; digPath: string; rewriteId: string; digPoints: readonly string[]; investigationId: string }>;

async function debateWithDig(): Promise<Tree> {
  const root = await createEncryptedStoryRun(database.pool, owner, "Should Harbour Town build a second ferry pier?");
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId: root, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = await point(root, "Yes, a second pier.", null);
  const queues = await point(root, "Queues run long at the morning peak.", "S1-1");
  await webStep(root, "root");
  await storyOn(root, answerId, position, "Yes: a second pier would cut the queues.", [position, queues]);

  const dig = await createEncryptedStoryRun(database.pool, owner, "Does winter ridership fall?");
  const joined = await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: root, childRunId: dig, places: [`path:${position}`], mode: "quick" });
  expect(joined).toMatchObject({ outcome: "JOINED", digLevel: 1 });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: root, positionRef: position,
    picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: `path:${position}`, author: "AI_SUGGESTION", text: "Does winter ridership fall?" }] })).toBe("RECORDED");
  const { workItemId } = await persistTerminalRun({ pool: database.pool, runId: dig, fixtureKey: randomUUID(), factBundle: FACTS });
  const digPath = await point(dig, "Winter ridership falls.", null);
  const looked = await point(dig, "Winter boats leave half empty.", "S1-1");
  const reasoned = await point(dig, "A pier stands idle for five months.", null);
  await webStep(dig, "dig");
  // 0135's stored paths, holding the extract's whole words as if a row kept them: no report may read them from here.
  expect(await new PostgresDigPicksRunnerRepository(runner).recordInput(dig, workItemId, { v: 2, dig_paths: [{ positionRef: digPath, statement: "Winter ridership falls.",
    points: [{ id: looked, text: "Winter boats leave half empty.", onId: null, side: "for", trust: "SURE", disputed: false },
      { id: reasoned, text: "A pier stands idle for five months.", onId: null, side: "against", trust: null, disputed: true }],
    extracts: [{ pointId: looked, label: "S1-1", site: "dig.example.org", title: "Pier queues", quote: passage("dig") }] }] })).toBe("RECORDED");

  const store = new PostgresDigModelRunnerRepository(runner);
  expect((await store.takeRewriteTurn(dig, root, position)).outcome).toBe("TAKEN");
  const rewriteId = randomUUID();
  const fateAfter: StoryFate = "PARTLY_HELD";
  const content = await withRunContentLease(runner, [dig], () => encryptAttestedContentForRun(runner, dig, PATH_REWRITE_CARRIER, rewriteId, {
    text: { line: "Partly: a second pier helps, not in winter.", summary: "Winter halves the queues.", fate: fateAfter },
    what_changed: ["The dig weakened the year-round case."], view_reason: null,
    dig_paths: [{ position_ref: digPath, line: "Winter ridership falls.", fate: "HELD_UP" }] }));
  expect(await store.recordRewrite({ rewriteId, digRunId: dig, parentAnswerVersion: 1, basedOnRewriteId: null, outcome: "READY", failureCode: null,
    fateBefore: "HELD_UP", fateAfter, verdict: null, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [randomUUID()], content })).toBe("RECORDED");
  return { root, position, dig, digPath, rewriteId, digPoints: [looked, reasoned], investigationId: joined.investigationId! };
}

const closingOf = (tree: Tree) => ({ investigationId: tree.investigationId, reportVersion: 1, rootRunId: tree.root, closedAt: "2026-10-31T13:00:00.000Z" });

async function dossierOf(tree: Tree): Promise<Dossier> {
  const read = await postgresInvestigationCloseSources(runner).inputOf(closingOf(tree), null);
  expect(read).not.toBeNull();
  const dossier = buildInvestigationDossier(read!.input);
  if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
  return dossier;
}

/** Every field of every call of a report, and what the version stores. */
function everything(dossier: Dossier): string {
  const answer = { segments: [{ text: "x", rests_on: [] }] };
  const story = { short_answer: "x", what_would_change: "x", how_it_went: [], still_open: [] };
  return JSON.stringify([dossier.material.answerWriter, dossier.material.answerCheckerOf(answer), dossier.material.storyWriterOf(answer),
    dossier.material.storyCheckerOf(answer, story), dossier.sources, dossier.paths]);
}

describe("R22 decision 6: a report reads AI text only", () => {
  it("no call holds a passage's words past the shown quote; the wipe changes the material by not one byte", async () => {
    const tree = await debateWithDig();
    // The fixture is real: the store does hold those words, in the extract and in 0135's stored paths.
    const evidence = (await new PostgresWebEvidenceRepository(runner).read(tree.dig))!;
    expect(evidence.extracts).toHaveLength(1);
    const opened = await withRunContentLease(runner, [tree.dig], () => decryptContentForRun<{ quote: string } | null>(runner, tree.dig, WEB_EVIDENCE_CARRIERS.extract,
      evidence.extracts[0]!.extract_id, evidence.extracts[0]!.content, null));
    expect(opened!.quote).toContain(PAST_THE_QUOTE);
    expect(JSON.stringify((await new PostgresDigPicksRunnerRepository(runner).read(tree.dig))!.input!.value)).toContain(PAST_THE_QUOTE);

    const before = await dossierOf(tree);
    const text = everything(before);
    expect(text).not.toContain(PAST_THE_QUOTE);
    // What the AIs wrote is all there: every point of both debates, reader 1's note, the shown quote and the page's address.
    for (const words of ["Queues run long at the morning peak.", "Winter boats leave half empty.", "A pier stands idle for five months.", NOTE,
      cutQuoteAtWordEdge(passage("root")), cutQuoteAtWordEdge(passage("dig")), "https://dig.example.org/queues"]) expect(text).toContain(words);
    expect(before.sources.map((source) => source.link)).toEqual(["https://root.example.org/queues", "https://dig.example.org/queues"]);
    for (const source of before.sources) expect(Array.from(source.quote).length).toBeLessThanOrEqual(120);
    expect(before.paths.map((path) => [path.level, path.line])).toEqual([[0, "Partly: a second pier helps, not in winter."], [1, "Winter ridership falls."]]);

    // Decision 7's wipe, on both debates: the material is the same, to the byte, and the version would store the same sources.
    const retention = new PostgresPassageRetentionRepository(runner);
    for (const run of [tree.root, tree.dig]) expect((await retention.wipe(run, "REPORT_WRITTEN")).outcome).toBe("WIPED");
    expect((await new PostgresWebEvidenceRepository(runner).read(tree.dig))!.extracts).toEqual([]);
    const after = await dossierOf(tree);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.sources).toEqual(before.sources);
  }, 180_000);

  it("a debate a stopped runner left with no shown quote gets it first: the source is listed, and nothing past the quote reaches a call", async () => {
    const root = await createEncryptedStoryRun(database.pool, owner, "Should Harbour Town widen the quay?");
    const { answerId } = await persistTerminalRun({ pool: database.pool, runId: root, fixtureKey: randomUUID(), factBundle: FACTS });
    const position = await point(root, "Yes, widen it.", null);
    const looked = await point(root, "The quay is narrow.", "S1-1");
    await storyOn(root, answerId, position, "Yes: widen the quay.", [position, looked]);
    const ports = await postgresWebStepPorts(database.pool, root);
    try {
      const { store, cipher } = ports;
      const searchId = webStepRowId(root, "search", "fixture", "for");
      await store.recordSearch({ runId: root, searchId, pathRef: "fixture", side: "for", languageKind: "english", language: "en", country: null,
        lookBack: "3y", outcome: "FOUND", chargeMicros: 1_000, resultCount: 1, words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "quay" }) });
      const pageId = webStepRowId(root, "page", "fixture");
      await store.recordPage({ runId: root, pageId, searchId, rank: 1, readDepth: "whole", text: null,
        about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: "https://old.example.org/quay", site: "old.example.org", title: null, date: null }) });
      const extractId = webStepRowId(root, "extract", "S1-1");
      await store.recordExtract({ runId: root, extractId, pageId, label: "S1-1", foundBy: [1], quote: cipher.seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: passage("old") }) });
    } finally {
      await ports.close();
    }
    const investigationId = (await new PostgresInvestigationRepository(api).open(owner.ownerRef, root))!;
    const read = await postgresInvestigationCloseSources(runner).inputOf({ investigationId, reportVersion: 1, rootRunId: root, closedAt: "2026-10-31T13:00:00.000Z" }, null);
    const dossier = buildInvestigationDossier(read!.input);
    if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
    expect(dossier.sources.map((source) => [source.link, source.quote])).toEqual([["https://old.example.org/quay", cutQuoteAtWordEdge(passage("old"))]]);
    expect(everything(dossier)).not.toContain(PAST_THE_QUOTE);
    expect(everything(dossier)).toContain("The quay is narrow.");
  }, 120_000);
});

describe("R22 decisions 2 and 5: what else the report reads", () => {
  it("the debate's place, time and purpose lines, opened under its key; an old debate has none", async () => {
    const tree = await debateWithDig();
    expect((await postgresInvestigationCloseSources(runner).inputOf(closingOf(tree), null))!.input.question).toMatchObject({ place: null, time: null, purpose: null });
    const sealed = await withRunContentLease(api, [tree.root], () => encryptAttestedContentForRun(api, tree.root, RUN_PURPOSE_LINES_CARRIER, tree.root,
      { place: "In Harbour Town", purpose: "To vote at the council" }));
    expect(await new PostgresTreeUpdateRepository(api).recordPurposeLines(owner.ownerRef, tree.root, sealed!)).toBe("RECORDED");
    const read = (await postgresInvestigationCloseSources(runner).inputOf(closingOf(tree), null))!;
    expect(read.input.question).toMatchObject({ place: "In Harbour Town", time: null, purpose: "To vote at the council" });
    const dossier = buildInvestigationDossier(read.input);
    if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
    expect(dossier.material.answerWriter.map((field) => field.name).slice(0, 3)).toEqual(["question", "place", "purpose"]);
  }, 120_000);

  it("a path's newest text when a climb wrote it", async () => {
    const tree = await debateWithDig();
    // A deeper dig of the dig's path, whose change climbs to the first debate's path.
    const deep = await createEncryptedStoryRun(database.pool, owner, "Does the summer peak last?");
    expect(await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: tree.dig, childRunId: deep, places: [`path:${tree.digPath}`], mode: "quick" }))
      .toMatchObject({ outcome: "JOINED", digLevel: 2 });
    expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: deep, parentRunId: tree.dig, positionRef: tree.digPath,
      picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-2", place: `path:${tree.digPath}`, author: "AI_SUGGESTION", text: "Does the summer peak last?" }] })).toBe("RECORDED");
    await persistTerminalRun({ pool: database.pool, runId: deep, fixtureKey: randomUUID(), factBundle: FACTS });
    const store = new PostgresDigModelRunnerRepository(runner);
    expect((await store.takeRewriteTurn(deep, tree.dig, tree.digPath)).outcome).toBe("TAKEN");
    const deepRewrite = randomUUID();
    const content = await withRunContentLease(runner, [deep], () => encryptAttestedContentForRun(runner, deep, PATH_REWRITE_CARRIER, deepRewrite, {
      text: { line: "Winter ridership falls; summer grows.", summary: "The summer peak lasts.", fate: "HELD_UP" }, what_changed: ["It added summer."], view_reason: null, dig_paths: [] }));
    expect(await store.recordRewrite({ rewriteId: deepRewrite, digRunId: deep, parentAnswerVersion: 1, basedOnRewriteId: null, outcome: "READY", failureCode: null,
      fateBefore: "HELD_UP", fateAfter: "HELD_UP", verdict: null, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [randomUUID()], content })).toBe("RECORDED");

    const climbs = new PostgresTreeUpdateRunnerRepository(runner);
    const updateId = randomUUID();
    expect(await climbs.takeTurn({ updateId, runId: deep, parentRunId: tree.root, positionRef: tree.position, kind: "CLIMB", climbStep: 1, causeKind: "PATH_REWRITE", causeId: deepRewrite })).toBe("TAKEN");
    const sealed = await withRunContentLease(runner, [deep], () => encryptAttestedContentForRun(runner, deep, PATH_UPDATE_CARRIER, updateId,
      { text: { line: "Yes in summer, no in winter: the climb's newest line.", summary: "It climbed.", fate: "PARTLY_HELD" } }));
    expect(await climbs.record({ updateId, basedOn: { kind: "PATH_REWRITE", id: tree.rewriteId }, outcome: "READY", failureCode: null, changed: true, fateBefore: "PARTLY_HELD", fateAfter: "PARTLY_HELD",
      writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [], content: sealed })).toBe("RECORDED");

    const read = (await postgresInvestigationCloseSources(runner).inputOf(closingOf(tree), null))!;
    expect(read.input.first.paths[0]!.current).toEqual({ line: "Yes in summer, no in winter: the climb's newest line.", summary: "It climbed.", fate: "PARTLY_HELD" });
    expect(read.input.digs.map((dig) => dig.runId).sort()).toEqual([tree.dig, deep].sort());
    const dossier = buildInvestigationDossier(read.input);
    if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
    expect(dossier.paths[0]!.line).toBe("Yes in summer, no in winter: the climb's newest line.");
  }, 180_000);
});
