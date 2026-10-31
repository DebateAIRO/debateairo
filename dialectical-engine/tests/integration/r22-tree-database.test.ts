// tests/integration/r22-tree-database.test.ts
// R22 tree lane (plan 2026-10-31-r22-owner-changes, decisions 1, 2, 3, 5, 23), on real PostgreSQL through the REAL gateway with
// scripted vendors on a fake fetch: every call is in the ledger, every text sealed under its run's key, and the database's own
// definers answer. A chain of digs is built the way the site builds it: each dig joined at start with its picks kept, then settled, and
// its rewrite run by the runner's composition on the runner's own login. Data is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import { AnswerSchema, StoryBodySchema, type Answer } from "@debateai/contract";
import {
  MAIN_ANSWER_UPDATE_CARRIER, configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun, migrate,
  PostgresDigPicksRepository, PostgresInvestigationRepository, PostgresTreeUpdateRunnerRepository, withRunContentLease,
  type Pool
} from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { createPostgresProviderGateway } from "@debateai/runner";
import { StoryRepository, type StoryWriteInput } from "@debateai/story";
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
import {
  PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL, composePathRewrite
} from "../../apps/runner/src/path-rewrite-composition.js";
import { postgresPurposeLines } from "../../apps/api/src/purpose-lines.js";
import { advanceTree, pathUpdateIdOf, sweepTreeUpdates } from "../../apps/runner/src/path-climb.js";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import { sweepPathRewrites } from "../../apps/runner/src/path-rewrite-sweep.js";
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
let erasure: Pool;
let owner: StoryEncryptedOwner;
const LINEAGE = { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" };
const UPDATE_BY_STRANGER = "99999999-0000-4000-8000-000000000001";

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
  erasure = createPool(logins.url("ERASURE_DATABASE_URL"));
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), erasure?.end()]);
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

const contractOf = (packet: PromptPacket): string => readPromptFrame({ messages: packet.messages.slice(0, 2) }).contractId;
let texts = 0;
/** A rewrite in new words each time: every level it reaches really changes. */
const freshRewrite = (packet: PromptPacket) => fittingRewrite(packet, { line: `Partly: draft ${String(++texts)} of what the pier does for the town.` });
/** A rewrite that says what the path already says: it changes nothing. */
function sameRewrite(packet: PromptPacket): string {
  const path = JSON.parse(fieldsOf(packet).get("path")!) as { line: string; summary?: string; fate: string };
  return fittingRewrite(packet, { line: path.line, summary: path.summary ?? "The same text as before.", fate: path.fate });
}

/** Haiku and GLM through the REAL gateway on the runner's login, each vendor a scripted fetch that reads what it was sent. */
type Behaviour = Readonly<{ writeSame?: (packet: PromptPacket) => boolean; failWriterWhen?: (packet: PromptPacket) => boolean; metered?: boolean }>;
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** The money seams as main.ts builds them, on the ledger, with made-up ceilings. */
function meteredSeams() {
  const guard = () => new CostEnvelopeGuard({ store: new PostgresModelSpendStore(runner),
    policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 100_000 } });
  return {
    buildPathRewriteCostEnvelopeSeam: (runId: string) => guard().pathRewriteSeam({ runId, price: PRICE, requireReportedUsage: true }),
    buildPathClimbCostEnvelopeSeam: (runId: string) => guard().pathClimbSeam({ runId, price: PRICE, requireReportedUsage: true }),
    buildAnswerUpdateCostEnvelopeSeam: (runId: string) => guard().answerUpdateSeam({ runId, price: PRICE, requireReportedUsage: true })
  };
}
function vendors(behaviour: Behaviour = {}) {
  const sent = { haiku: [] as PromptPacket[], glm: [] as PromptPacket[] };
  const gateway = (name: "haiku" | "glm", model: string, maker: string) => createPostgresProviderGateway(runner, {
    endpoint: "http://fixture/v1", model, maker, ...(behaviour.metered === true ? meteredSeams() : {}),
    fetchImplementation: async (_url, init) => {
      const packet = { messages: (JSON.parse(String(init?.body)) as { messages: PromptPacket["messages"] }).messages };
      sent[name].push(packet);
      if (behaviour.failWriterWhen?.(packet) === true) return new Response("{}", { status: 400 });
      const content = contractOf(packet).includes("check") || isChecker(packet) ? SATISFIED
        : contractOf(packet).startsWith("report.") ? JSON.stringify({ segments: [{ text: `The whole debate now points to version ${String(++texts)}.`, rests_on: [] }] })
          : behaviour.writeSame?.(packet) === true ? sameRewrite(packet) : freshRewrite(packet);
      return new Response(JSON.stringify({ id: `${name}-${String(sent[name].length)}`, model,
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    }
  });
  const members = [{ provider: gateway("haiku", PATH_REWRITE_WRITER_MODEL, "Anthropic"), providerRef: "ref-haiku", maker: "Anthropic" },
    { provider: gateway("glm", PATH_REWRITE_CHECKER_MODEL, "Z.AI"), providerRef: "ref-glm", maker: "Z.AI" }];
  return { sent, members };
}

function composed(members: ReturnType<typeof vendors>["members"], logged: string[] = []) {
  const rewrite = composePathRewrite({ pool: runner, members, log: (event) => { logged.push(event); },
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
    const one = vendors();
    const rewrite = composed(one.members);
    const first = await settledDig(root, position, 1);
    expect(await runDigPathRewrite(rewrite.settings, snapshotOf(first.dig, first.workItemId, one.members))).toBe(true);
    expect(await rowOf(first.dig)).toMatchObject([{ outcome: "READY", failure_code: null, fate_before: "HELD_UP" }]);

    // `fittingRewrite` writes the level-1 dig's own paths: "No" (first, HELD_UP) and "Yes" (second, FELL).
    const two = vendors();
    const second = await settledDig(first.dig, nodesOf(first.dig).yes, 2);
    expect(await runDigPathRewrite(composed(two.members).settings, snapshotOf(second.dig, second.workItemId, two.members))).toBe(true);
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
    let parent = root;
    let dugPath = position;
    const levels: string[] = [];
    for (const level of [1, 2, 3]) {
      const team = vendors();
      const settled = await settledDig(parent, dugPath, level);
      expect(await runDigPathRewrite(composed(team.members).settings, snapshotOf(settled.dig, settled.workItemId, team.members))).toBe(true);
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
    const first = await settledDig(root, position, 1);
    const rewrite = composed(vendors().members);
    // No member answers: the level-1 dig's rewrite ends FAILED with its own paths stored.
    expect(await runDigPathRewrite(rewrite.settings, ownNodes(digSnapshot(first.dig, { resolve: () => null, backups: [] }, { workItemId: first.workItemId }), first.dig))).toBe(true);
    expect(await rowOf(first.dig)).toMatchObject([{ outcome: "FAILED" }]);

    const team = vendors();
    const second = await settledDig(first.dig, nodesOf(first.dig).no, 2);
    await runDigPathRewrite(composed(team.members).settings, snapshotOf(second.dig, second.workItemId, team.members));
    expect(await rowOf(second.dig)).toMatchObject([{ outcome: "READY", failure_code: null }]);
    expect(JSON.parse(firstWriterField(team.sent.haiku, "path")!)).toMatchObject({ line: "No: winter ridership falls by half." });
  }, 120_000);
});

const updatesOf = async (dig: string) => (await database.pool.query<{ update_id: string; climb_step: number; parent_run_id: string; position_ref: string; outcome: string | null;
  changed: boolean | null; failure_code: string | null; fate_before: string | null }>(
  `SELECT turn.update_id, turn.climb_step, turn.parent_run_id, turn.position_ref, row_found.outcome, row_found.changed, row_found.failure_code, row_found.fate_before
     FROM identity.path_update_turn AS turn LEFT JOIN identity.path_update AS row_found ON row_found.update_id = turn.update_id
    WHERE turn.run_id = $1 ORDER BY turn.climb_step`, [dig])).rows;
const versionsOf = async (root: string) => (await database.pool.query<{ answer_seq: number; trigger_kind: string; trigger_run_id: string; paid_by_owner_ref: string | null;
  outcome: string; content_ciphertext: unknown }>(
  "SELECT answer_seq, trigger_kind, trigger_run_id, paid_by_owner_ref, outcome, content_ciphertext FROM identity.main_answer_update WHERE run_id = $1 ORDER BY answer_seq", [root])).rows;
const callSitesOf = async (run: string) => (await database.pool.query<{ call_site_key: string }>(
  `SELECT call_site_key FROM ledger.ledger_entry WHERE run_id = $1 AND action_kind = 'MODEL_CALL' ORDER BY sequence`, [run])).rows.map((row) => row.call_site_key);

/** Digs stacked on one path, each settling and rewriting with its own vendors. */
async function chain(root: string, position: string, depth: number, behaviourOf: (level: number) => Behaviour = () => ({})) {
  const digs: string[] = [];
  const teams: Array<ReturnType<typeof vendors>> = [];
  let parent = root;
  let dugPath = position;
  for (let level = 1; level <= depth; level += 1) {
    const team = vendors(behaviourOf(level));
    const settled = await settledDig(parent, dugPath, level);
    await runDigPathRewrite(composed(team.members).settings, snapshotOf(settled.dig, settled.workItemId, team.members));
    digs.push(settled.dig);
    teams.push(team);
    parent = settled.dig;
    dugPath = nodesOf(settled.dig).no;
  }
  return { digs, teams };
}

describe("decision 2: a rewrite that really changed a path rewrites the path above, to the first debate", () => {
  it("a level-3 dig climbs two levels, each on the current text, paid on the dig's own run, and the main answer follows", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one, two, three], teams } = await chain(root, position, 3);
    const team = teams[2]!;
    const updates = await updatesOf(three!);
    expect(updates).toMatchObject([
      { climb_step: 1, parent_run_id: one, position_ref: nodesOf(one!).no, outcome: "READY", changed: true, failure_code: null },
      { climb_step: 2, parent_run_id: root, position_ref: position, outcome: "READY", changed: true, failure_code: null }
    ]);
    expect(await updatesOf(one!)).toEqual([]);
    expect(await updatesOf(two!)).toMatchObject([{ climb_step: 1, parent_run_id: root, changed: true }]);
    // Every call is the dig's own run's, at the climb's own sites; the debates it rewrote are charged nothing.
    expect(await callSitesOf(three!)).toEqual(["PATH_REWRITE:WRITER:1", "PATH_REWRITE:CHECKER:1", "PATH_CLIMB:WRITER:1", "PATH_CLIMB:CHECKER:1",
      "PATH_CLIMB:WRITER:1", "PATH_CLIMB:CHECKER:1", "ANSWER_UPDATE:ANSWER:1", "ANSWER_UPDATE:ANSWER_CHECK:1"].map((key) => key));
    // The level above is written on the same prompts, its follow-up's changed path at its new text.
    const climbs = team.sent.haiku.filter((packet) => contractOf(packet) === "path-rewrite.writer.v1");
    expect(climbs).toHaveLength(3);
    const below = JSON.parse(fieldsOf(climbs[1]!).get("dig_paths")!) as Array<{ statement: string }>;
    const newText = JSON.parse(fieldsOf(climbs[2]!).get("dig_paths")!) as Array<{ statement: string }>;
    expect(below.map((path) => path.statement).join(" ")).toMatch(/^Partly: draft \d+/u);
    expect(newText.map((path) => path.statement).join(" ")).toMatch(/^Partly: draft \d+/u);
    expect(fieldsOf(climbs[2]!).get("question")).toBe(QUESTION);
    // The main answer: one version per trigger, each naming who paid, numbered on the root.
    const versions = await versionsOf(root);
    expect(versions.map((row) => [row.answer_seq, row.trigger_kind, row.trigger_run_id, row.paid_by_owner_ref, row.outcome])).toEqual([
      [1, "PATH_REWRITE", one, owner.ownerRef, "READY"], [2, "PATH_UPDATE", two, owner.ownerRef, "READY"], [3, "PATH_UPDATE", three, owner.ownerRef, "READY"]]);
    // The report's own prompts: the first update reads no earlier answer, a later one reads the version before.
    const answers = team.sent.haiku.filter((packet) => contractOf(packet).startsWith("report."));
    // Its material is the tree as it stands: the first debate's path at the climb's own text, which no dig's card holds.
    const climbedLine = (JSON.parse(fieldsOf(team.sent.glm.filter(isChecker).at(-1)!).get("rewrite")!) as { line: string }).line;
    expect((JSON.parse(fieldsOf(answers[0]!).get("first_debate")!) as { paths: Array<{ line: string; story_line?: string }> }).paths[0]).toMatchObject({ line: climbedLine, story_line: PATH_LINE });
    expect((JSON.parse(fieldsOf(teams[0]!.sent.haiku.find((packet) => contractOf(packet).startsWith("report."))!).get("first_debate")!) as { paths: Array<{ line: string }> }).paths[0]!.line).toMatch(/^Partly: draft/u);
    expect(answers.map(contractOf)).toEqual(["report.answer.later.v2"]);
    expect(team.sent.glm.at(-1)!.messages[0]!.content).toContain("report.answer-check.v2");
    expect(JSON.parse(fieldsOf(answers[0]!).get("earlier_report") ?? "null")).not.toBeNull();
  }, 180_000);

  it("the money: the climb and the answer update are charged on the dig's run, each under its own source, and the first debate pays nothing", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one, two] } = await chain(root, position, 2, () => ({ metered: true }));
    const spend = async (run: string) => (await database.pool.query<{ spend_source: string; calls: string }>(
      "SELECT spend_source, count(*)::text AS calls FROM ledger.model_spend WHERE run_id = $1 GROUP BY spend_source ORDER BY spend_source", [run])).rows;
    expect(await spend(two!)).toEqual([{ spend_source: "ANSWER_UPDATE", calls: "2" }, { spend_source: "PATH_CLIMB", calls: "2" }, { spend_source: "PATH_REWRITE", calls: "2" }]);
    expect(await spend(one!)).toEqual([{ spend_source: "ANSWER_UPDATE", calls: "2" }, { spend_source: "PATH_REWRITE", calls: "2" }]);
    expect(await spend(root)).toEqual([]);
    const [version] = (await versionsOf(root)).slice(-1);
    expect(version!.trigger_run_id).toBe(two);
    const spent = (await database.pool.query<{ spent_micros: string }>("SELECT spent_micros::text FROM identity.main_answer_update WHERE run_id = $1 ORDER BY answer_seq DESC LIMIT 1", [root])).rows[0]!;
    expect(Number(spent.spent_micros)).toBeGreaterThan(0);
  }, 180_000);

  it("one place after each climb's rewrite is recorded: it is told the path and how the level came out", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    const team = vendors();
    const rewrite = composed(team.members);
    const levels: unknown[] = [];
    const settled = await settledDig(one!, nodesOf(one!).no, 2);
    const { afterStored: _unused, ...withoutClimb } = rewrite.settings;
    await runDigPathRewrite(withoutClimb, snapshotOf(settled.dig, settled.workItemId, team.members));
    expect(await advanceTree({ ...rewrite.treeSweep.tree, afterLevel: (level) => { levels.push(level); } }, settled.dig)).toBe("ANSWER_UPDATED");
    expect(levels).toEqual([{ digRunId: settled.dig, parentRunId: root, positionRef: position, updateId: pathUpdateIdOf(settled.dig, 1), outcome: "CHANGED" }]);
  }, 120_000);

  it("stops as soon as a level comes out unchanged: nothing above is written and the answer stays", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    expect(await versionsOf(root)).toHaveLength(1);
    const logged: string[] = [];
    // The level-2 dig really changes the path it dug; the first debate's path above comes out the same.
    const team = vendors({ writeSame: (packet) => (JSON.parse(fieldsOf(packet).get("path")!) as { line: string }).line.startsWith("Partly") });
    const settled = await settledDig(one!, nodesOf(one!).no, 2);
    await runDigPathRewrite(composed(team.members, logged).settings, snapshotOf(settled.dig, settled.workItemId, team.members));
    expect(await updatesOf(settled.dig)).toMatchObject([{ climb_step: 1, parent_run_id: root, outcome: "READY", changed: false }]);
    expect(await versionsOf(root)).toHaveLength(1);
    expect((await callSitesOf(settled.dig)).filter((key) => key.startsWith("ANSWER_UPDATE:"))).toEqual([]);
  }, 120_000);

  it("a dig that changes nothing takes no turn above and pays for nothing more", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1, () => ({ writeSame: () => true }));
    expect(await rowOf(one!)).toMatchObject([{ outcome: "READY" }]);
    expect(await updatesOf(one!)).toEqual([]);
    expect(await versionsOf(root)).toEqual([]);
    expect(await callSitesOf(one!)).toEqual(["PATH_REWRITE:WRITER:1", "PATH_REWRITE:CHECKER:1"]);
  }, 60_000);

  it("a level every writer failed ends in a FAILED row, keeps the path's text, and the climb stops", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    const team = vendors({ failWriterWhen: (packet) => contractOf(packet) === "path-rewrite.writer.v1"
      && (JSON.parse(fieldsOf(packet).get("path")!) as { line: string }).line.startsWith("Partly") });
    const settled = await settledDig(one!, nodesOf(one!).no, 2);
    await runDigPathRewrite(composed(team.members).settings, snapshotOf(settled.dig, settled.workItemId, team.members));
    expect(await rowOf(settled.dig)).toMatchObject([{ outcome: "READY" }]);
    const [update] = await updatesOf(settled.dig);
    expect(update).toMatchObject({ climb_step: 1, parent_run_id: root, outcome: "FAILED", changed: null });
    expect(update!.failure_code).toMatch(/^PATH_REWRITE_/u);
    expect(await versionsOf(root)).toHaveLength(1);
  }, 120_000);

  it("a climb killed after its writer answered goes on from the sweep: the writer is replayed, nothing is paid twice", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    const settled = await settledDig(one!, nodesOf(one!).no, 2);
    const first = vendors();
    const writers = () => first.sent.haiku.filter((packet) => contractOf(packet) === "path-rewrite.writer.v1").length;
    let climbWriterAnswered = false;
    // The first runner dies once the climb's writer has answered: nothing it does after that returns.
    void runDigPathRewrite(composed(first.members).settings, { ...snapshotOf(settled.dig, settled.workItemId, first.members),
      stepLease: <T>(use: () => Promise<T>) => (climbWriterAnswered ? new Promise<T>(() => undefined) : use().then((value) => {
        if (writers() >= 2) climbWriterAnswered = true;
        return value;
      })) });
    for (let at = 0; at < 2_000 && !climbWriterAnswered; at += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(climbWriterAnswered).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await updatesOf(settled.dig)).toMatchObject([{ climb_step: 1, outcome: null }]);
    expect((await callSitesOf(settled.dig)).filter((key) => key === "PATH_CLIMB:WRITER:1")).toHaveLength(1);

    // A new runner process: its own composition and members; the sweep finds the dig once it stood still.
    const again = vendors();
    const fresh = composed(again.members);
    const later = () => new Date(Date.now() + 60 * 60_000);
    const pass = await sweepTreeUpdates({ ...fresh.treeSweep, now: later });
    expect(pass.advanced).toBeGreaterThanOrEqual(1);
    expect(await updatesOf(settled.dig)).toMatchObject([{ climb_step: 1, outcome: "READY", changed: true }]);
    // The writer's answer came from the record: this runner bought only the checker, then the answer update.
    expect(again.sent.haiku.filter((packet) => contractOf(packet) === "path-rewrite.writer.v1")).toHaveLength(0);
    expect(again.sent.glm.filter(isChecker)).toHaveLength(1);
    expect((await callSitesOf(settled.dig)).filter((key) => key === "PATH_CLIMB:WRITER:1")).toHaveLength(1);
    expect((await versionsOf(root)).map((row) => row.trigger_run_id)).toEqual([one, settled.dig]);
    // Run again: every row is there, so nothing is written or bought.
    const sentBefore = again.sent.haiku.length + again.sent.glm.length;
    const repeat = await sweepTreeUpdates({ ...fresh.treeSweep, now: later });
    expect(repeat.listed).toBeGreaterThanOrEqual(1);
    expect(again.sent.haiku.length + again.sent.glm.length).toBe(sentBefore);
    expect(await versionsOf(root)).toHaveLength(2);
  }, 180_000);

  it("a runner that stopped right after a dig's row: the sweep starts the climb that nothing else knew was owed", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    const settled = await settledDig(one!, nodesOf(one!).no, 2);
    const first = vendors();
    const stopped = composed(first.members);
    const { afterStored: _dropped, ...withoutClimb } = stopped.settings;
    await runDigPathRewrite(withoutClimb, snapshotOf(settled.dig, settled.workItemId, first.members));
    expect(await rowOf(settled.dig)).toMatchObject([{ outcome: "READY" }]);
    expect(await updatesOf(settled.dig)).toEqual([]);
    const again = vendors();
    await sweepTreeUpdates({ ...composed(again.members).treeSweep, now: () => new Date(Date.now() + 60 * 60_000) });
    expect(await updatesOf(settled.dig)).toMatchObject([{ climb_step: 1, parent_run_id: root, outcome: "READY", changed: true }]);
    expect((await versionsOf(root)).map((row) => row.trigger_kind)).toEqual(["PATH_REWRITE", "PATH_UPDATE"]);
  }, 120_000);

  it("rewrites of one path stay in order: a dig behind an unfinished climb waits, then writes on the climb's text", async () => {
    const { root, position } = await firstDebate();
    const { digs: [one] } = await chain(root, position, 1);
    // The level-2 dig's climb on the first debate's path dies before it writes: its turn holds the path.
    const climbing = await settledDig(one!, nodesOf(one!).no, 2);
    const first = vendors();
    let held = false;
    void runDigPathRewrite(composed(first.members).settings, { ...snapshotOf(climbing.dig, climbing.workItemId, first.members),
      stepLease: <T>(use: () => Promise<T>) => (held ? new Promise<T>(() => undefined) : use().then((value) => {
        if (first.sent.haiku.filter((packet) => contractOf(packet) === "path-rewrite.writer.v1").length >= 2) held = true;
        return value;
      })) });
    for (let at = 0; at < 2_000 && !held; at += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await updatesOf(climbing.dig)).toMatchObject([{ parent_run_id: root, outcome: null }]);

    // A second dig of the first debate's path settles now: its turn is behind the climb's, so it writes nothing yet.
    const behind = await settledDig(root, position, 1);
    const waiting = vendors();
    const short = composed(waiting.members);
    await runDigPathRewrite({ ...short.settings, wait: { pollMs: 1, maxWaitMs: 20 } }, snapshotOf(behind.dig, behind.workItemId, waiting.members));
    expect(await rowOf(behind.dig)).toEqual([]);
    expect(waiting.sent.haiku).toEqual([]);

    // The sweeps: the climb ends, and the waiting dig writes on the climb's text.
    const again = vendors();
    const fresh = composed(again.members);
    const later = () => new Date(Date.now() + 60 * 60_000);
    await sweepTreeUpdates({ ...fresh.treeSweep, now: later });
    expect(await updatesOf(climbing.dig)).toMatchObject([{ outcome: "READY", changed: true }]);
    await sweepPathRewrites({ ...fresh.sweep, now: later });
    expect(await rowOf(behind.dig)).toMatchObject([{ outcome: "READY" }]);
    const line = (await new PostgresTreeUpdateRunnerRepository(runner).readLine(root))!.filter((entry) => entry.position_ref === position);
    expect(line.map((entry) => [entry.source, entry.run_id])).toEqual([["PATH_REWRITE", one], ["PATH_UPDATE", climbing.dig], ["PATH_REWRITE", behind.dig]]);
    const writer = again.sent.haiku.find((packet) => contractOf(packet) === "path-rewrite.writer.v1"
      && fieldsOf(packet).get("picks") !== undefined && (JSON.parse(fieldsOf(packet).get("dig_paths")!) as Array<{ statement: string }>)[0]!.statement.startsWith("No:"));
    expect(writer).toBeDefined();
    // A story's line has no summary: only the rows written since carry one, so this text is the climb's.
    expect(JSON.parse(fieldsOf(writer!).get("path")!)).toMatchObject({ line: expect.stringMatching(/^Partly: draft/u), summary: expect.any(String) });
  }, 180_000);
});

async function withLines(root: string, lines: Readonly<Record<string, string>>): Promise<void> {
  // The ask's own port, on the API's login.
  expect(await postgresPurposeLines(api).record(owner.ownerRef, root, lines)).toBe("RECORDED");
}

describe("decision 5: the purpose lines reach every rewrite and answer update", () => {
  it("are read from the first debate at every level; an old debate simply has none", async () => {
    const { root, position } = await firstDebate();
    await withLines(root, { place: "Harbour Town", time: "Before next spring", purpose: "A council vote" });
    const { teams } = await chain(root, position, 2);
    for (const team of teams) {
      for (const packet of team.sent.haiku) {
        const fields = fieldsOf(packet);
        expect([fields.get("place"), fields.get("time"), fields.get("purpose")]).toEqual(["Harbour Town", "Before next spring", "A council vote"]);
      }
    }
    expect(teams[1]!.sent.haiku.map(contractOf)).toEqual(["path-rewrite.writer.v1", "path-rewrite.writer.v1", "report.answer.later.v2"]);

    const old = await firstDebate();
    const { teams: [oldTeam] } = await chain(old.root, old.position, 1);
    for (const packet of oldTeam!.sent.haiku) for (const name of ["place", "time", "purpose"]) expect(fieldsOf(packet).has(name)).toBe(false);
  }, 180_000);
});

const projection = async (answerId: string): Promise<Answer> => {
  const answer = await new ServeRepository(api).readAnswerProjection(answerId, { ownerRef: owner.ownerRef, legacyAskerId: null });
  return AnswerSchema.parse(answer);
};

describe("decision 3: the main answer on the debate's answer", () => {
  it("serves the current version and its history, and the climbed text on the path; never who paid", async () => {
    const { root, position } = await firstDebate();
    const answerId = (await database.pool.query<{ answer_id: string }>("SELECT answer_id FROM serve.answer WHERE run_id = $1", [root])).rows[0]!.answer_id;
    expect((await projection(answerId)).main_answer).toBeUndefined();
    await withLines(root, { purpose: "A council vote" });
    const { digs: [one, two] } = await chain(root, position, 2);
    const answer = await projection(answerId);
    const main = answer.main_answer!;
    expect(main.history.map((version) => [version.version, version.trigger, version.position_ref])).toEqual([[1, "PATH_REWRITE", position], [2, "CHILD_PATH", position]]);
    expect(main.current).toEqual(main.history[1]);
    expect(main.current!.segments[0]!.text).toMatch(/^The whole debate now points to version/u);
    expect(answer.purpose_lines).toEqual({ purpose: "A council vote" });
    // The path's history is the whole line: the dig's own rewrite, then the row the deeper dig's change climbed up.
    const path = answer.path_rewrites!.paths.find((candidate) => candidate.position_ref === position)!;
    expect(path.history.map((rewrite) => [rewrite.dig_run_id, rewrite.cause ?? "DIG"])).toEqual([[one, "DIG"], [two, "CHILD_PATH"]]);
    const newest = path.history[1]!;
    expect(newest.state).toBe("READY");
    expect(path.current).toEqual("text" in newest ? newest.text : null);
    expect(answer.path_rewrites!.changed_since.count).toBe(1);
    const served = JSON.stringify(answer.main_answer);
    expect(served).not.toContain(owner.ownerRef);
    expect(served).not.toContain(one!);
  }, 180_000);
});

describe("decision 23: erasing a dig leaves the answer version it made as written, and the name goes", () => {
  it("the version stays and opens under the first debate's key; what the dig caused on the tree goes; the payer's name goes with the account", async () => {
    const { root, position } = await firstDebate();
    const answerId = (await database.pool.query<{ answer_id: string }>("SELECT answer_id FROM serve.answer WHERE run_id = $1", [root])).rows[0]!.answer_id;
    const { digs: [one, two] } = await chain(root, position, 2);
    const before = (await projection(answerId)).main_answer!;
    expect(before.history).toHaveLength(2);

    // The level-2 dig is erased: its key is gone, its rows on the tree with it.
    await database.pool.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [two]);
    await erasure.query("SELECT identity.forget_erased_debate_tree_updates($1)", [two]);
    await erasure.query("SELECT identity.forget_erased_debate_dig_model($1)", [two]);
    expect(await updatesOf(two!)).toEqual([]);

    // The version it made stays as written.
    const versions = await versionsOf(root);
    expect(versions.map((row) => row.trigger_run_id)).toEqual([one, two]);
    const after = (await projection(answerId)).main_answer!;
    expect(after.history).toEqual(before.history);
    expect(after.current).toEqual(before.current);

    // The account that paid goes: the row loses its name and the text stays. The account here is another person's (a public debate's digger).
    const diggerId = randomUUID();
    await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [diggerId, createHash("sha256").update(diggerId).digest(), `tree-${diggerId}`]);
    const digger = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [diggerId])).rows[0]!;
    const tree = new PostgresTreeUpdateRunnerRepository(runner);
    const sealed = await withRunContentLease(runner, [root], () => encryptAttestedContentForRun(runner, root, MAIN_ANSWER_UPDATE_CARRIER, UPDATE_BY_STRANGER,
      { v: 1, segments: ["A text a stranger's dig made."], position_ref: position, trigger: "PATH_REWRITE" }));
    const newest = (await tree.readMainAnswers(root))!.at(-1)!;
    expect((await tree.recordMainAnswer({ updateId: UPDATE_BY_STRANGER, rootRunId: root, basedOnUpdateId: newest.update_id, triggerKind: "PATH_UPDATE", triggerId: randomUUID(),
      triggerRunId: two!, paidByOwnerRef: digger.owner_ref, outcome: "READY", failureCode: null, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1,
      artifactRefs: [], spentMicros: 5, content: sealed })).outcome).toBe("RECORDED");
    await database.pool.query('DELETE FROM identity."user" WHERE owner_ref = $1', [digger.owner_ref]);
    const byStranger = (await versionsOf(root)).at(-1)!;
    expect(byStranger).toMatchObject({ paid_by_owner_ref: null, outcome: "READY" });
    expect((await projection(answerId)).main_answer!.current!.segments[0]!.text).toBe("A text a stranger's dig made.");
    expect(JSON.stringify((await projection(answerId)).main_answer)).not.toContain(digger.owner_ref);
  }, 180_000);
});
