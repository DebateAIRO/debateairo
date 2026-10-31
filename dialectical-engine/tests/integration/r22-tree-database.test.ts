// tests/integration/r22-tree-database.test.ts
// R22 tree lane (plan 2026-10-31-r22-owner-changes, decisions 1, 2, 3, 5, 23), on real PostgreSQL through the REAL gateway with
// scripted vendors on a fake fetch: every call is in the ledger, every text sealed under its run's key, and the database's own
// definers answer. A chain of digs is built the way the site builds it: each dig joined at start with its picks kept, then settled, and
// its rewrite run by the runner's composition on the runner's own login. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema } from "@debateai/contract";
import {
  configureContentEncryption, contentCipherFor, createPool, migrate, PostgresDigPicksRepository, PostgresInvestigationRepository,
  type Pool
} from "@debateai/db";
import { createPostgresProviderGateway } from "@debateai/runner";
import { StoryRepository, type StoryWriteInput } from "@debateai/story";
import type { PromptPacket } from "@debateai/providers";
import {
  PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL, composePathRewrite
} from "../../apps/runner/src/path-rewrite-composition.js";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { DIG_NODES, SATISFIED, digSnapshot, fieldsOf, fittingRewrite, isChecker } from "../support/path-rewrite-world.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let api: Pool;
let runner: Pool;
let owner: StoryEncryptedOwner;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const PATH_LINE = "Yes: a second pier would cut the queues.";

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

async function firstDebate(): Promise<Readonly<{ root: string; position: string }>> {
  const root = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId: root, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = randomUUID();
  const paragraph = { text: "A paragraph.", node_refs: [position] };
  const body = StoryBodySchema.parse({ shape_id: "general",
    short: { headline: "Headline.", summary: "Summary.", confidence: "Fairly sure.",
      paths: [{ position_ref: position, fate: "HELD_UP", line: PATH_LINE, node_refs: [position] }], change: paragraph },
    why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null });
  expect(await new StoryRepository(database.pool).insert({ runId: root, answerId, answerVersion: 1, outcome: "READY", failureCode: null,
    shapeId: "general", packVersion: "2026-09-26.1", packFingerprint: "f".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 1, artifactRefs: [randomUUID()], body, reservation: null, verdictBasis: null, pointNumbers: null, languageTag: "en",
    storytellerRepairs: 0 })).toBe("INSERTED");
  return { root, position };
}

/** A dig of `parent`'s path, joined at start with its picks kept (the asks route's two steps), then settled. */
async function settledDig(parent: string, position: string, level: number): Promise<Readonly<{ dig: string; workItemId: string }>> {
  const dig = await createEncryptedStoryRun(database.pool, owner, `Level ${String(level)}: would winter ridership fill it?`);
  expect(await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: parent, childRunId: dig,
    places: [`path:${position}`], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: level });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: parent, positionRef: position,
    picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: `path:${position}`, author: "AI_SUGGESTION", text: "Does winter ridership fall?" }] })).toBe("RECORDED");
  const { workItemId } = await persistTerminalRun({ pool: database.pool, runId: dig, fixtureKey: randomUUID(), factBundle: FACTS });
  return { dig, workItemId };
}

/** Haiku and GLM through the REAL gateway on the runner's login, each vendor a scripted fetch that reads what it was sent. */
function vendors() {
  const sent = { haiku: [] as PromptPacket[], glm: [] as PromptPacket[] };
  const gateway = (name: "haiku" | "glm", model: string, maker: string) => createPostgresProviderGateway(runner, {
    endpoint: "http://fixture/v1", model, maker,
    fetchImplementation: async (_url, init) => {
      const packet = { messages: (JSON.parse(String(init?.body)) as { messages: PromptPacket["messages"] }).messages };
      sent[name].push(packet);
      return new Response(JSON.stringify({ id: `${name}-${String(sent[name].length)}`, model,
        choices: [{ message: { content: isChecker(packet) ? SATISFIED : fittingRewrite(packet) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    }
  });
  const members = [{ provider: gateway("haiku", PATH_REWRITE_WRITER_MODEL, "Anthropic"), providerRef: "ref-haiku", maker: "Anthropic" },
    { provider: gateway("glm", PATH_REWRITE_CHECKER_MODEL, "Z.AI"), providerRef: "ref-glm", maker: "Z.AI" }];
  return { sent, members };
}

function composed(members: ReturnType<typeof vendors>["members"]) {
  const rewrite = composePathRewrite({ pool: runner, members, log: () => undefined,
    targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }] });
  expect(rewrite).toBeDefined();
  return rewrite!;
}

/** Node ids are the debate's own: each dig's snapshot gets its own, as each settled run has. */
function nodesOf(dig: string) {
  const idOf = (name: string) => `${dig.slice(0, 8)}-0000-4000-8000-0000000000${name}`;
  return { yes: idOf("01"), no: idOf("02"), queues: idOf("03"), bridge: idOf("04"), buses: idOf("05") };
}
function ownNodes(snapshot: StoryWriteInput, dig: string) {
  const ids = nodesOf(dig);
  const to = new Map<string, string>(Object.entries(DIG_NODES).map(([name, id]) => [id, ids[name as keyof typeof ids]]));
  return { ...snapshot,
    nodes: snapshot.nodes.map((node) => ({ ...node, nodeId: to.get(node.nodeId)! })),
    arrows: snapshot.arrows.map((arrow) => ({ ...arrow, sourceNodeId: to.get(arrow.sourceNodeId)!, targetNodeId: to.get(arrow.targetNodeId!)! })),
    verdictBasis: { ...snapshot.verdictBasis, winner_node_id: ids.no, runner_up_node_id: ids.yes } } as StoryWriteInput;
}
const snapshotOf = (dig: string, workItemId: string, members: ReturnType<typeof vendors>["members"]) => ownNodes(digSnapshot(dig, {
  resolve: (ref: string) => { const member = members.find((entry) => entry.providerRef === ref);
    return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef }; },
  backups: members }, { workItemId }), dig);

const rowOf = async (dig: string) => (await database.pool.query<{ outcome: string; failure_code: string | null; fate_before: string }>(
  "SELECT outcome, failure_code, fate_before FROM identity.path_rewrite WHERE run_id = $1", [dig])).rows;

const firstWriterField = (sent: readonly PromptPacket[], name: string) => {
  const writer = sent.find((packet) => !isChecker(packet));
  return fieldsOf(writer!).get(name);
};

describe("decision 1: a dig below level 1 reads its parent path from the parent dig's rewrite", () => {
  it("a two-level chain: the level-2 dig rewrites the level-1 dig's path, on the text that dig's rewrite wrote", async () => {
    const { root, position } = await firstDebate();
    const rewrite = composed(vendors().members);

    const one = vendors();
    const first = await settledDig(root, position, 1);
    expect(await runDigPathRewrite(rewrite.settings, snapshotOf(first.dig, first.workItemId, one.members))).toBe(true);
    expect(await rowOf(first.dig)).toMatchObject([{ outcome: "READY", failure_code: null, fate_before: "HELD_UP" }]);

    // `fittingRewrite` writes the level-1 dig's own paths: "No" (first, HELD_UP) and "Yes" (second, FELL).
    const two = vendors();
    const second = await settledDig(first.dig, nodesOf(first.dig).yes, 2);
    expect(await runDigPathRewrite(rewrite.settings, snapshotOf(second.dig, second.workItemId, two.members))).toBe(true);
    expect(await rowOf(second.dig)).toMatchObject([{ outcome: "READY", failure_code: null, fate_before: "FELL" }]);
    const path = JSON.parse(firstWriterField(two.sent.haiku, "path")!) as { line: string; fate: string; points: Array<{ text: string }> };
    expect(path).toMatchObject({ line: "Winter crowds fill both piers.", fate: "FELL" });
    // Its points are the ones the level-1 dig argued on that path, as its settled run gave them.
    expect(path.points.map((point) => point.text)).toEqual(["Buses carry the winter commuters."]);
    // The main question is the first debate's, not the level-1 dig's.
    expect(firstWriterField(two.sent.haiku, "question")).toBe(QUESTION);
  }, 120_000);

  it("a three-level chain: each level reads the level above's rewrite, on the path it dug", async () => {
    const { root, position } = await firstDebate();
    const rewrite = composed(vendors().members);
    let parent = root;
    let dugPath = position;
    const levels: string[] = [];
    for (const level of [1, 2, 3]) {
      const team = vendors();
      const settled = await settledDig(parent, dugPath, level);
      expect(await runDigPathRewrite(rewrite.settings, snapshotOf(settled.dig, settled.workItemId, team.members))).toBe(true);
      expect(await rowOf(settled.dig)).toMatchObject([{ outcome: "READY", failure_code: null }]);
      if (level > 1) {
        expect(JSON.parse(firstWriterField(team.sent.haiku, "path")!)).toMatchObject({ line: "Winter ridership falls.", fate: "HELD_UP" });
      }
      levels.push(settled.dig);
      parent = settled.dig;
      dugPath = nodesOf(settled.dig).no;
    }
    expect(levels).toHaveLength(3);
  }, 180_000);

  it("a parent dig whose own rewrite failed: its path reads from what its settled run gave, and the turn still writes", async () => {
    const { root, position } = await firstDebate();
    const rewrite = composed(vendors().members);
    const first = await settledDig(root, position, 1);
    // No member answers: the level-1 dig's rewrite ends FAILED with its own paths stored.
    expect(await runDigPathRewrite(rewrite.settings, ownNodes(digSnapshot(first.dig, { resolve: () => null, backups: [] }, { workItemId: first.workItemId }), first.dig))).toBe(true);
    expect(await rowOf(first.dig)).toMatchObject([{ outcome: "FAILED" }]);

    const team = vendors();
    const second = await settledDig(first.dig, nodesOf(first.dig).no, 2);
    await runDigPathRewrite(rewrite.settings, snapshotOf(second.dig, second.workItemId, team.members));
    expect(await rowOf(second.dig)).toMatchObject([{ outcome: "READY", failure_code: null }]);
    expect(JSON.parse(firstWriterField(team.sent.haiku, "path")!)).toMatchObject({ line: "No: winter ridership falls by half." });
  }, 120_000);
});
