// tests/integration/path-rewrite-database.test.ts
// W3-7 (dig-model revision 2026-10-30): the path rewrite switched on, on real PostgreSQL. A dig's picks are stored at
// start through 0135 under the dig's run key (API login); when the dig settles, the runner's composition (the runner's
// login) reads them, the parent's story path and the main question, writes and checks through the REAL gateway (scripted
// vendors on a fake fetch, every call in the ledger) and stores 0134's row; a rewrite killed after its writer answered is
// picked up by the sweep, which replays the writer from the ledger and buys only the checker; a parent with no readable
// path ends the turn FAILED and the next dig of the path writes; the erasure forgets a dig's picks. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema } from "@debateai/contract";
import {
  configureContentEncryption, contentCipherFor, createPool, migrate, PostgresDigPicksRepository, PostgresDigPicksRunnerRepository,
  PostgresInvestigationRepository, type Pool
} from "@debateai/db";
import { createPostgresProviderGateway } from "@debateai/runner";
import { StoryRepository } from "@debateai/story";
import type { PromptPacket } from "@debateai/providers";
import {
  PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL, composePathRewrite
} from "../../apps/runner/src/path-rewrite-composition.js";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import { sweepPathRewrites } from "../../apps/runner/src/path-rewrite-sweep.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { SATISFIED, digSnapshot, fieldsOf, fittingRewrite, isChecker } from "../support/path-rewrite-world.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let api: Pool;
let runner: Pool;
let erasure: Pool;
let owner: StoryEncryptedOwner;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const OWN_WORDS = "I think tourists keep the ferries full all year.";
const SUGGESTED = "Does winter ridership fall?";
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

/** The parent's story: one path on `position`, with the line the rewrite starts from. */
async function storyOn(parent: string, answerId: string, position: string): Promise<void> {
  const paragraph = { text: "A paragraph.", node_refs: [position] };
  const body = StoryBodySchema.parse({ shape_id: "general",
    short: { headline: "Headline.", summary: "Summary.", confidence: "Fairly sure.",
      paths: [{ position_ref: position, fate: "HELD_UP", line: PATH_LINE, node_refs: [position] }], change: paragraph },
    why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null });
  expect(await new StoryRepository(database.pool).insert({ runId: parent, answerId, answerVersion: 1, outcome: "READY", failureCode: null,
    shapeId: "general", packVersion: "2026-09-26.1", packFingerprint: "f".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 1, artifactRefs: [randomUUID()], body, reservation: null, verdictBasis: null, pointNumbers: null, languageTag: "en",
    storytellerRepairs: 0 })).toBe("INSERTED");
}

/** A first debate (with its answer, and its story unless `story` is false) and the position its story path names. */
async function parentDebate(story = true): Promise<Readonly<{ parent: string; answerId: string; position: string }>> {
  const parent = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId: parent, fixtureKey: randomUUID(), factBundle: FACTS });
  const position = randomUUID();
  if (story) await storyOn(parent, answerId, position);
  return { parent, answerId, position };
}

/** A dig of the parent, joined at start with its picks kept (the asks route's two steps), then settled. */
async function settledDig(parent: string, position: string): Promise<Readonly<{ dig: string; workItemId: string }>> {
  const dig = await createEncryptedStoryRun(database.pool, owner, "Would winter ridership fill a second pier?");
  expect(await new PostgresInvestigationRepository(api).join({ ownerRef: owner.ownerRef, parentRunId: parent, childRunId: dig,
    places: [`path:${position}`], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: 1 });
  expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: parent, positionRef: position,
    picks: [{ kind: "NEEDS_MORE_WEB", suggestionId: "sg-1", place: `path:${position}`, author: "AI_SUGGESTION", text: SUGGESTED },
      { kind: "OWN_VIEW", suggestionId: null, place: `path:${position}`, author: "PERSON_OWN_VIEW", text: OWN_WORDS }] })).toBe("RECORDED");
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

function composed(members: ReturnType<typeof vendors>["members"], logged: string[] = []) {
  const rewrite = composePathRewrite({ pool: runner, members, log: (event) => { logged.push(event); },
    targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }] });
  expect(rewrite).toBeDefined();
  return rewrite!;
}

const snapshotOf = (dig: string, workItemId: string, members: ReturnType<typeof vendors>["members"],
  overrides: Parameters<typeof digSnapshot>[2] = {}) => digSnapshot(dig, {
  resolve: (ref: string) => { const member = members.find((entry) => entry.providerRef === ref);
    return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef }; },
  backups: members }, { workItemId, ...overrides });

const rowOf = async (dig: string) => (await database.pool.query<{ outcome: string; failure_code: string | null; fate_before: string;
  based_on_rewrite_id: string | null; content_ciphertext: unknown }>(
  "SELECT outcome, failure_code, fate_before, based_on_rewrite_id, content_ciphertext FROM identity.path_rewrite WHERE run_id = $1", [dig])).rows;
const writerEntries = async (dig: string) => Number((await database.pool.query(
  `SELECT count(*) AS n FROM ledger.ledger_entry WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key LIKE 'PATH_REWRITE:WRITER:%'`,
  [dig])).rows[0].n);

describe("0135 a dig's picks, kept at start", () => {
  it("are stored once, their texts sealed under the dig's key, their codes in clear; the runner reads them back", async () => {
    const { parent, position } = await parentDebate();
    const { dig } = await settledDig(parent, position);
    const rows = (await database.pool.query<{ pick_no: number; kind: string; suggestion_id: string | null; author: string; content: unknown }>(
      "SELECT pick_no, kind, suggestion_id, author, content_ciphertext AS content FROM identity.dig_pick WHERE run_id = $1 ORDER BY pick_no", [dig])).rows;
    expect(rows.map(({ content: _content, ...codes }) => codes)).toEqual([
      { pick_no: 1, kind: "NEEDS_MORE_WEB", suggestion_id: "sg-1", author: "AI_SUGGESTION" },
      { pick_no: 2, kind: "OWN_VIEW", suggestion_id: null, author: "PERSON_OWN_VIEW" }]);
    for (const row of rows) expect(JSON.stringify(row.content)).not.toMatch(/winter|tourists/u);
    const read = await new PostgresDigPicksRunnerRepository(runner).read(dig);
    expect(read).toMatchObject({ parentRunId: parent, positionRef: position, input: null,
      picks: [{ pickNo: 1, text: SUGGESTED, author: "AI_SUGGESTION" }, { pickNo: 2, text: OWN_WORDS, author: "PERSON_OWN_VIEW" }] });
    // A second write changes nothing; a malformed payload is refused before any read.
    expect(await new PostgresDigPicksRepository(api).record({ ownerRef: owner.ownerRef, runId: dig, parentRunId: parent, positionRef: position,
      picks: [] })).toBe("ALREADY");
    await expect(api.query("SELECT identity.record_dig_picks($1,$2,$3,$4,'{}'::jsonb)", [owner.ownerRef, dig, parent, position]))
      .rejects.toMatchObject({ code: "22023" });
    // No request role reads the table.
    await expect(runner.query("SELECT count(*) FROM identity.dig_pick")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("W3-7 the path rewrite on the database", () => {
  it("a settled dig's rewrite reads its picks, the parent's path and the main question, and its row is stored", async () => {
    const { parent, position } = await parentDebate();
    const { dig, workItemId } = await settledDig(parent, position);
    const team = vendors();
    const rewrite = composed(team.members);
    expect(await runDigPathRewrite(rewrite.settings, snapshotOf(dig, workItemId, team.members))).toBe(true);
    expect((await rowOf(dig)).map((row) => [row.outcome, row.failure_code, row.fate_before])).toEqual([["READY", null, "HELD_UP"]]);
    const fields = fieldsOf(team.sent.haiku[0]!);
    expect(fields.get("question")).toBe(QUESTION);
    expect(JSON.parse(fields.get("path")!)).toMatchObject({ line: PATH_LINE, fate: "HELD_UP" });
    expect(JSON.parse(fields.get("picks")!)).toEqual([{ text: SUGGESTED, marked: "AI_SUGGESTION" }, { text: OWN_WORDS, marked: "PERSON_OWN_VIEW" }]);
    expect(team.sent.glm).toHaveLength(1);
    // The material was stored before the turn, and the sweep has nothing to do.
    expect((await new PostgresDigPicksRunnerRepository(runner).read(dig))?.input?.workItemId).toBe(workItemId);
    expect(await new PostgresDigPicksRunnerRepository(runner).readUnwritten(new Date(Date.now() + 3_600_000), 50)).toEqual([]);
  });

  it("a rewrite killed after its writer answered is picked up by the sweep, and nothing is paid twice", async () => {
    const { parent, position } = await parentDebate();
    const { dig, workItemId } = await settledDig(parent, position);
    const first = vendors();
    const killed = composed(first.members);
    let writerAnswered = false;
    void runDigPathRewrite(killed.settings, snapshotOf(dig, workItemId, first.members, {
      stepLease: <T>(use: () => Promise<T>) => (writerAnswered ? new Promise<T>(() => undefined) : use().then((value) => {
        if (first.sent.haiku.length > 0) writerAnswered = true;
        return value;
      }))
    }));
    for (let at = 0; at < 2_000 && !writerAnswered; at += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(writerAnswered).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await rowOf(dig)).toEqual([]);
    expect(first.sent.glm).toHaveLength(0);
    expect(await writerEntries(dig)).toBe(1);

    // A new runner process: its own composition and members; the sweep lists the dig once it stood still.
    const again = vendors();
    const fresh = composed(again.members);
    const later = () => new Date(Date.now() + 60 * 60_000);
    expect((await new PostgresDigPicksRunnerRepository(runner).readUnwritten(later(), 50)).map((open) => open.runId)).toContain(dig);
    const pass = await sweepPathRewrites({ ...fresh.sweep, now: later });
    expect(pass.rewritten).toBeGreaterThanOrEqual(1);
    expect((await rowOf(dig)).map((row) => row.outcome)).toEqual(["READY"]);
    expect(again.sent.haiku).toHaveLength(0);
    expect(again.sent.glm).toHaveLength(1);
    expect(first.sent.haiku).toHaveLength(1);
    expect(await writerEntries(dig)).toBe(1);
  });

  it("a parent path that cannot be read ends the turn FAILED, the path keeping its text, and the next dig writes", async () => {
    const { parent, answerId, position } = await parentDebate(false);
    const first = await settledDig(parent, position);
    const team = vendors();
    const rewrite = composed(team.members);
    await runDigPathRewrite(rewrite.settings, snapshotOf(first.dig, first.workItemId, team.members));
    expect((await rowOf(first.dig)).map((row) => [row.outcome, row.failure_code, row.content_ciphertext])).toEqual([
      ["FAILED", "PATH_REWRITE_PARENT_UNREAD", null]]);
    expect(team.sent.haiku).toHaveLength(0);
    // The parent's story arrives; the next dig of the path is at the front at once, on the story's line.
    await storyOn(parent, answerId, position);
    const second = await settledDig(parent, position);
    await runDigPathRewrite(rewrite.settings, snapshotOf(second.dig, second.workItemId, team.members));
    expect((await rowOf(second.dig)).map((row) => [row.outcome, row.based_on_rewrite_id])).toEqual([["READY", null]]);
    expect(JSON.parse(fieldsOf(team.sent.haiku[0]!).get("path")!)).toMatchObject({ line: PATH_LINE });
  });

  it("erasing a dig forgets its picks and its rewrite's material", async () => {
    const { parent, position } = await parentDebate();
    const { dig } = await settledDig(parent, position);
    await new PostgresDigPicksRunnerRepository(runner).recordInput(dig, randomUUID(), { v: 1, dig_paths: [] });
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
        VALUES ($1,clock_timestamp(),1,0)`, [dig]);
      await seed.query("COMMIT");
    } finally { seed.release(); }
    expect((await erasure.query<{ rows: number }>("SELECT identity.forget_erased_debate_dig_picks($1) AS rows", [dig])).rows[0]!.rows).toBe(4);
    expect((await erasure.query<{ rows: number }>("SELECT identity.forget_erased_debate_dig_picks($1) AS rows", [dig])).rows[0]!.rows).toBe(0);
    expect(Number((await database.pool.query("SELECT count(*) AS n FROM identity.dig_pick WHERE run_id = $1", [dig])).rows[0].n)).toBe(0);
  });
});
