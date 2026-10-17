// tests/integration/r2-engine-repository.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_CIPHERTEXT_SENTINEL, CONTENT_JSON_SENTINEL, encryptAttestedContentForRun, migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import {
  PointInvestigationRepository, VerdictVoteRepository, type PointInvestigationRecord, type VerdictVoteRecord
} from "@debateai/judgement";
import {
  createEncryptedStoryRun, createLegacyStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Engine redesign R2, Task A10: the investigation and vote repositories over migration 0121, and the database-level
 * behaviour of the two tables: sealed rows round-trip, plaintext on an encrypted run is refused, an envelope cannot
 * move to another row, nothing is updated, deleted or truncated, a re-write changes nothing, an erased run takes no new
 * row, a set-aside node's investigation is not read back, and a malformed record is refused typed before anything is
 * stored. A whitespace-only `found` counts as blank, as A13's reader counts it, and an UNAVAILABLE row names its planned
 * investigator even with no call (pre-flight PF-R2a6.1, PF-R2a8.1). Run alone.
 */
let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

// The story suite's fixtures, as tests/integration/map-choice-repository.test.ts uses them: ONE encrypted owner
// provisioned once (it configures the pool's content cipher), runs made by createEncryptedStoryRun / createLegacyStoryRun.
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("R2_TEST_OWNER_UNPROVISIONED");
  return owner;
}

type Mode = "legacy" | "encrypted";
const marker = (): string => `R2MARK${randomUUID().replaceAll("-", "")}`;

function newRun(mode: Mode): Promise<string> {
  return mode === "encrypted"
    ? createEncryptedStoryRun(database.pool, theOwner(), `engine repository ${marker()}`)
    : createLegacyStoryRun(database.pool, `engine repository ${marker()}`, `asker:${marker()}`);
}

/** As map-choice-repository.test.ts: the run's key cleanup intent makes core.run_private_content_is_live false. */
async function eraseRun(runId: string): Promise<void> {
  await database.pool.query(
    `INSERT INTO serve.private_run_key_cleanup_intent (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
     VALUES ($1,$2,$3,now(),'{}')`, [randomUUID(), theOwner().userId, runId]);
}

/** A node of the run: in the clear on a legacy run, sealed as core.node's carrier on an encrypted one. */
async function node(runId: string, mode: Mode): Promise<string> {
  const nodeId = randomUUID();
  if (mode === "legacy") {
    await database.pool.query(`
      INSERT INTO core.node (
        node_id, run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
        materialized_path, generation_status, path_status, exploration_decision,
        way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
      ) VALUES ($1,$2,'an engine point','unknown',NULL,NULL,0,0,'0','complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())`,
      [nodeId, runId]);
    return nodeId;
  }
  const sealed = await encryptAttestedContentForRun(database.pool, runId, "core.node", nodeId, { claimText: "an engine point" });
  if (sealed === null) throw new Error("R2_TEST_CIPHER_UNCONFIGURED");
  await database.pool.query(`
    INSERT INTO core.node (
      node_id, run_id, claim_text, claim_type, depth, sibling_ordinal, materialized_path,
      generation_status, path_status, exploration_decision, way_of_knowing,
      value_laden, is_folder, created_at_seq, relevant_as_of, content_ciphertext, content_attestation
    ) VALUES ($1,$2,$3,'unknown',0,0,'0','complete','active','continue','REASONING',false,false,ledger.allocate_sequence(),clock_timestamp(),$4::jsonb,$5)`,
    [nodeId, runId, CONTENT_CIPHERTEXT_SENTINEL, JSON.stringify(sealed.envelope), sealed.attestation]);
  return nodeId;
}

/** A model attempt's artifact on the run (the ledger seals it on an encrypted run). */
function artifact(runId: string): Promise<string> {
  return new LedgerRepository(database.pool).appendRawArtifact({
    artifactId: randomUUID(), attemptId: randomUUID(), runId, providerRef: "deepinfra:engine-r2", provider: "openai-compatible-http",
    model: "vendor/engine-r2", maker: "maker-r2", modelVersion: "v1", rawText: "{\"best\":\"A\"}", metadata: {}, parseStatus: "PARSED",
    inputHash: "4".repeat(64), contractHash: "5".repeat(64), contentHash: "6".repeat(64)
  });
}

async function counts(runId: string): Promise<Readonly<{ investigations: number; votes: number }>> {
  return (await database.pool.query<{ investigations: number; votes: number }>(
    `SELECT (SELECT count(*)::int FROM ledger.point_investigation WHERE run_id = $1) AS investigations,
            (SELECT count(*)::int FROM ledger.verdict_vote WHERE run_id = $1) AS votes`, [runId])).rows[0]!;
}

const INVESTIGATOR = Object.freeze({ maker: "maker-c", providerRef: "deepinfra:investigator-c", modelId: "vendor/investigator-c" });
const judge = (seat: number) => Object.freeze({ maker: `maker-${String(seat)}`, providerRef: `deepinfra:judge-${String(seat)}`, modelId: `vendor/judge-${String(seat)}` });
const HOLDS_CONTENT = Object.freeze({ missing: "The bus fare per ride.", found: "About two euros per ride.", reason: "With the fare known, the saving holds." });

function holds(runId: string, nodeId: string, rawArtifactRef: string, rootA: string, rootB: string): PointInvestigationRecord {
  return { runId, nodeId, investigationOrder: 1, result: "HOLDS", basis: "established", investigator: INVESTIGATOR, rawArtifactRef,
    standings: { leaderWithoutRootNodeId: rootB, leaderWithRootNodeId: rootA, moved: true }, content: HOLDS_CONTENT };
}
function capped(runId: string, nodeId: string): PointInvestigationRecord {
  return { runId, nodeId, investigationOrder: 3, result: "INVESTIGATION_CAPPED", basis: null, investigator: null, rawArtifactRef: null,
    standings: null, content: null };
}
/** A point met after a money stop (pre-flight PF-R2a8.1): no call, no reply, yet it names the investigator planned for it. */
function moneyStopped(runId: string, nodeId: string, investigationOrder: number): PointInvestigationRecord {
  return { runId, nodeId, investigationOrder, result: "INVESTIGATION_UNAVAILABLE", basis: null, investigator: INVESTIGATOR,
    rawArtifactRef: null, standings: null, content: null };
}
function countedVote(runId: string, rootA: string, rawArtifactRef: string): VerdictVoteRecord {
  return { runId, judgeSeat: 1, judge: judge(1), rawArtifactRef, counted: true, notCountedReason: null,
    choice: { letter: "A", rootNodeId: rootA, conditional: false, questionKind: "money-decision", sameAs: [["A", "C"]],
      reasons: "Answer A survives its strongest objection: the cost is paid back within a year." } };
}
function ownMakerVote(runId: string, rootB: string, rawArtifactRef: string): VerdictVoteRecord {
  return { runId, judgeSeat: 2, judge: judge(2), rawArtifactRef, counted: false, notCountedReason: "OWN_MAKER",
    choice: { letter: "B", rootNodeId: rootB, conditional: true, questionKind: "general", sameAs: [], reasons: "Answer B holds when rides are rare." } };
}
function failedVote(runId: string): VerdictVoteRecord {
  return { runId, judgeSeat: 3, judge: judge(3), rawArtifactRef: null, counted: false, notCountedReason: "JUDGE_FAILED", choice: null };
}

describe("PointInvestigationRepository and VerdictVoteRepository (0121)", () => {
  it.each(["legacy", "encrypted"] as const)("writes and reads back a %s run's investigations, once", async (mode) => {
    const runId = await newRun(mode);
    const [point, other, rootA, rootB] = [await node(runId, mode), await node(runId, mode), await node(runId, mode), await node(runId, mode)];
    const reply = await artifact(runId);
    const repository = new PointInvestigationRepository(database.pool);
    expect(await repository.recordPointInvestigation(holds(runId, point, reply, rootA, rootB))).toBe("INSERTED");
    expect(await repository.recordPointInvestigation(capped(runId, other))).toBe("INSERTED");
    // A second write of the same point (a retry) changes nothing, even with other words.
    expect(await repository.recordPointInvestigation({ ...holds(runId, point, reply, rootA, rootB),
      content: { ...HOLDS_CONTENT, reason: "Another reason." } })).toBe("ALREADY_PRESENT");
    expect(await repository.readPointInvestigationsForRun(runId)).toEqual([
      { ...holds(runId, point, reply, rootA, rootB), recordedAt: expect.any(String) },
      { ...capped(runId, other), recordedAt: expect.any(String) }
    ]);
    const raw = (await database.pool.query<{ content: unknown; sealed: boolean }>(
      `SELECT content, content_ciphertext IS NOT NULL AS sealed FROM ledger.point_investigation WHERE run_id = $1 ORDER BY investigation_order`, [runId])).rows;
    if (mode === "encrypted") {
      expect(raw).toEqual([{ content: CONTENT_JSON_SENTINEL, sealed: true }, { content: CONTENT_JSON_SENTINEL, sealed: true }]);
      const text = (await database.pool.query<{ row_text: string }>(
        `SELECT string_agg(to_jsonb(row_value)::text, ' ') AS row_text FROM ledger.point_investigation AS row_value WHERE run_id = $1`, [runId])).rows[0]!.row_text;
      for (const secret of ["bus fare", "two euros", "saving holds"]) expect(text).not.toContain(secret);
    } else {
      expect(raw).toEqual([{ content: HOLDS_CONTENT, sealed: false }, { content: {}, sealed: false }]);
    }
  });

  it.each(["legacy", "encrypted"] as const)("writes and reads back a %s run's votes, by seat, once", async (mode) => {
    const runId = await newRun(mode);
    const [rootA, rootB] = [await node(runId, mode), await node(runId, mode)];
    const [first, second] = [await artifact(runId), await artifact(runId)];
    const repository = new VerdictVoteRepository(database.pool);
    expect(await repository.recordVerdictVote(failedVote(runId))).toBe("INSERTED");
    expect(await repository.recordVerdictVote(ownMakerVote(runId, rootB, second))).toBe("INSERTED");
    expect(await repository.recordVerdictVote(countedVote(runId, rootA, first))).toBe("INSERTED");
    expect(await repository.recordVerdictVote(countedVote(runId, rootB, first))).toBe("ALREADY_PRESENT");
    expect(await repository.readVerdictVotesForRun(runId)).toEqual([
      { ...countedVote(runId, rootA, first), recordedAt: expect.any(String) },
      { ...ownMakerVote(runId, rootB, second), recordedAt: expect.any(String) },
      { ...failedVote(runId), recordedAt: expect.any(String) }
    ]);
    if (mode === "encrypted") {
      const text = (await database.pool.query<{ row_text: string }>(
        `SELECT string_agg(to_jsonb(row_value)::text, ' ') AS row_text FROM ledger.verdict_vote AS row_value WHERE run_id = $1`, [runId])).rows[0]!.row_text;
      for (const secret of ["strongest objection", "paid back", "rides are rare"]) expect(text).not.toContain(secret);
    }
  });

  // pre-flight PF-R2a6.1 and PF-R2a8.1: the two rows a real debate writes that the round trip above does not show.
  it("takes a whitespace-only found with basis none, and an UNAVAILABLE row that names its planned investigator with no reply", async () => {
    const runId = await newRun("legacy");
    const [deadEnd, stopped, rootA] = [await node(runId, "legacy"), await node(runId, "legacy"), await node(runId, "legacy")];
    const reply = await artifact(runId);
    const repository = new PointInvestigationRepository(database.pool);
    // Blank is judged as A13's reader judges it (found.trim() === ""): only spaces with basis "none" is a dead end, not a breach.
    const blank: PointInvestigationRecord = { runId, nodeId: deadEnd, investigationOrder: 1, result: "DEAD_END", basis: "none",
      investigator: INVESTIGATOR, rawArtifactRef: reply,
      standings: { leaderWithoutRootNodeId: rootA, leaderWithRootNodeId: rootA, moved: false },
      content: { missing: "The bus fare per ride.", found: "   ", reason: "Nothing settles the fare." } };
    expect(await repository.recordPointInvestigation(blank)).toBe("INSERTED");
    // After a money stop nothing is called, but the row still names the planned investigator (plan deviation 20).
    expect(await repository.recordPointInvestigation(moneyStopped(runId, stopped, 2))).toBe("INSERTED");
    expect(await repository.readPointInvestigationsForRun(runId)).toEqual([
      { ...blank, recordedAt: expect.any(String) },
      { ...moneyStopped(runId, stopped, 2), recordedAt: expect.any(String) }
    ]);
    expect(await counts(runId)).toEqual({ investigations: 2, votes: 0 });
  });

  // Task A9's review: every row shape a debate writes, on an encrypted run, sealed under the key 0121's guard rebuilds
  // (node_id::text, the lower-case canonical uuid): the repository lower-cases ids handed to it in upper case.
  it("seals and reads back FAILS, DEAD_END, UNAVAILABLE and SKIPPED on an encrypted run, keyed on the lower-case node id", async () => {
    const runId = await newRun("encrypted");
    const [fails, deadEnd, unavailable, skipped, rootA, rootB] = [await node(runId, "encrypted"), await node(runId, "encrypted"),
      await node(runId, "encrypted"), await node(runId, "encrypted"), await node(runId, "encrypted"), await node(runId, "encrypted")];
    const [failsReply, deadEndReply, failedReply] = [await artifact(runId), await artifact(runId), await artifact(runId)];
    const rows: readonly PointInvestigationRecord[] = [
      { runId, nodeId: fails, investigationOrder: 1, result: "FAILS", basis: "assumption", investigator: INVESTIGATOR,
        rawArtifactRef: failsReply, standings: { leaderWithoutRootNodeId: rootA, leaderWithRootNodeId: rootA, moved: false },
        content: { missing: "The bus fare per ride.", found: "Perhaps five euros per ride.", reason: "At that fare the saving fails." } },
      { runId, nodeId: deadEnd, investigationOrder: 2, result: "DEAD_END", basis: "none", investigator: INVESTIGATOR,
        rawArtifactRef: deadEndReply, standings: { leaderWithoutRootNodeId: rootA, leaderWithRootNodeId: rootB, moved: true },
        content: { missing: "The parking fee.", found: "", reason: "No source settles the fee." } },
      // A failed reply was recorded: UNAVAILABLE names its investigator and the artifact, nothing else.
      { runId, nodeId: unavailable, investigationOrder: 3, result: "INVESTIGATION_UNAVAILABLE", basis: null, investigator: INVESTIGATOR,
        rawArtifactRef: failedReply, standings: null, content: null },
      { runId, nodeId: skipped, investigationOrder: 4, result: "INVESTIGATION_SKIPPED", basis: null, investigator: null,
        rawArtifactRef: null, standings: null, content: null }
    ];
    const repository = new PointInvestigationRepository(database.pool);
    for (const row of rows) {
      expect(await repository.recordPointInvestigation({ ...row, runId: row.runId.toUpperCase(), nodeId: row.nodeId.toUpperCase(),
        rawArtifactRef: row.rawArtifactRef?.toUpperCase() ?? null })).toBe("INSERTED");
    }
    expect(await repository.readPointInvestigationsForRun(runId.toUpperCase()))
      .toEqual(rows.map((row) => ({ ...row, recordedAt: expect.any(String) })));
    const stored = (await database.pool.query<{ node_id: string; content: unknown; sealed: boolean; attested: boolean }>(
      `SELECT node_id::text AS node_id, content, content_ciphertext IS NOT NULL AS sealed, content_attestation IS NOT NULL AS attested
         FROM ledger.point_investigation WHERE run_id = $1 ORDER BY investigation_order`, [runId])).rows;
    expect(stored).toEqual(rows.map((row) => ({ node_id: row.nodeId, content: CONTENT_JSON_SENTINEL, sealed: true, attested: true })));
    const text = (await database.pool.query<{ row_text: string }>(
      `SELECT string_agg(to_jsonb(row_value)::text, ' ') AS row_text FROM ledger.point_investigation AS row_value WHERE run_id = $1`, [runId])).rows[0]!.row_text;
    for (const secret of ["five euros", "parking fee", "saving fails"]) expect(text).not.toContain(secret);
    // The guard rebuilds the key as node_id::text: an envelope attested to the upper-case spelling is refused.
    const extra = await node(runId, "encrypted");
    const insertCapped = (key: string) => encryptAttestedContentForRun(database.pool, runId, "ledger.point_investigation", key, {})
      .then((sealed) => {
        if (sealed === null) throw new Error("R2_TEST_CIPHER_UNCONFIGURED");
        return database.pool.query(
          `INSERT INTO ledger.point_investigation (run_id, node_id, investigation_order, result, content, content_ciphertext, content_attestation)
           VALUES ($1,$2,5,'INVESTIGATION_CAPPED',$3::jsonb,$4::jsonb,$5)`,
          [runId, extra, JSON.stringify(CONTENT_JSON_SENTINEL), JSON.stringify(sealed.envelope), Buffer.from(sealed.attestation)]);
      });
    await expect(insertCapped(extra.toUpperCase())).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    await expect(insertCapped(extra)).resolves.toMatchObject({ rowCount: 1 });
    expect(await counts(runId)).toEqual({ investigations: 5, votes: 0 });
  });

  it("does not read back an investigation whose node a later copy set aside (0119), and keeps a vote whose root was", async () => {
    const runId = await newRun("legacy");
    const [stalePoint, livePoint, rootA, rootB] = [await node(runId, "legacy"), await node(runId, "legacy"), await node(runId, "legacy"), await node(runId, "legacy")];
    const reply = await artifact(runId);
    const investigations = new PointInvestigationRepository(database.pool);
    await investigations.recordPointInvestigation(holds(runId, stalePoint, reply, rootA, rootB));
    await investigations.recordPointInvestigation({ ...capped(runId, livePoint), investigationOrder: 1 });
    await new VerdictVoteRepository(database.pool).recordVerdictVote(countedVote(runId, rootA, reply));
    await database.pool.query(`UPDATE core.node SET generation_status = 'stale' WHERE run_id = $1 AND node_id = ANY($2::uuid[])`, [runId, [stalePoint, rootA]]);
    expect((await investigations.readPointInvestigationsForRun(runId)).map((row) => row.nodeId)).toEqual([livePoint]);
    // The letter is fixed per debate: the vote stays readable, naming the root it named when it was written.
    expect((await new VerdictVoteRepository(database.pool).readVerdictVotesForRun(runId)).map((row) => row.choice?.letter)).toEqual(["A"]);
  });

  // R2a final wave, Ruling W4: the review catch-up's codes-only reader — node and result from plain columns, the same
  // stale join and order as the full reader, no lease and no decryption.
  it.each(["legacy", "encrypted"] as const)("reads a %s run's investigation results as codes only, in order, without set-aside nodes", async (mode) => {
    const runId = await newRun(mode);
    const [first, second, stalePoint, third, rootA, rootB] = [await node(runId, mode), await node(runId, mode),
      await node(runId, mode), await node(runId, mode), await node(runId, mode), await node(runId, mode)];
    const reply = await artifact(runId);
    const repository = new PointInvestigationRepository(database.pool);
    // Written out of order: the reader orders by investigation_order.
    await repository.recordPointInvestigation({ ...capped(runId, third), investigationOrder: 4 });
    await repository.recordPointInvestigation(holds(runId, first, reply, rootA, rootB));
    await repository.recordPointInvestigation({ ...moneyStopped(runId, second, 2) });
    await repository.recordPointInvestigation({ ...capped(runId, stalePoint), investigationOrder: 3 });
    await database.pool.query(`UPDATE core.node SET generation_status = 'stale' WHERE run_id = $1 AND node_id = $2`, [runId, stalePoint]);
    const codes = await repository.readPointInvestigationResultsForRun(runId.toUpperCase());
    expect(codes).toEqual([
      { nodeId: first, result: "HOLDS" },
      { nodeId: second, result: "INVESTIGATION_UNAVAILABLE" },
      { nodeId: third, result: "INVESTIGATION_CAPPED" }
    ]);
    // The same rows, in the same order, as the reader that decrypts the AI's words.
    expect((await repository.readPointInvestigationsForRun(runId)).map((row) => ({ nodeId: row.nodeId, result: row.result }))).toEqual(codes);
    // Codes only: nothing else is handed back.
    for (const row of codes) expect(Object.keys(row).sort()).toEqual(["nodeId", "result"]);
    // A result outside 0121's list cannot be stored (its CHECKs), so the reader's own refusal is a defence only.
    if (mode === "legacy") {
      await expect(database.pool.query(`INSERT INTO ledger.point_investigation (run_id, node_id, investigation_order, result, content)
         VALUES ($1,$2,9,'MAYBE','{}'::jsonb)`, [runId, rootA])).rejects.toThrowError(/violates check constraint "point_investigation_/u);
    }
  });

  // R2a final wave B7 (Ruling (A10 Minors) 1): a row the database admits but the repository's own rule does not (a letter
  // in two groups) is refused on read, typed, naming the seat and the field, never a value.
  it("refuses on read a stored vote whose same-as groups share a letter (ENGINE_ROW_INVALID)", async () => {
    const runId = await newRun("legacy");
    const rootA = await node(runId, "legacy");
    const reply = await artifact(runId);
    await database.pool.query(
      `INSERT INTO ledger.verdict_vote (run_id, judge_seat, maker, provider_ref, model_id, raw_artifact_ref, chosen_letter, chosen_root_node_id,
         conditional, counted, not_counted_reason, question_kind, same_as, content)
       VALUES ($1,2,'maker-8','deepinfra:judge-8','vendor/judge-8',$2,'A',$3,false,true,NULL,'general',$4::jsonb,$5::jsonb)`,
      [runId, reply, rootA, '[["A","B"],["B","C"]]', JSON.stringify({ reasons: "Answer A holds." })]);
    await expect(new VerdictVoteRepository(database.pool).readVerdictVotesForRun(runId)).rejects.toMatchObject({
      code: "ENGINE_ROW_INVALID", message: "ENGINE_ROW_INVALID: ledger.verdict_vote seat 2 choice.sameAs[1]"
    });
  });

  it("an erased run reads as empty and refuses new rows as RUN_ERASED", async () => {
    const runId = await newRun("encrypted");
    const [point, rootA, rootB] = [await node(runId, "encrypted"), await node(runId, "encrypted"), await node(runId, "encrypted")];
    const reply = await artifact(runId);
    const investigations = new PointInvestigationRepository(database.pool);
    const votes = new VerdictVoteRepository(database.pool);
    await investigations.recordPointInvestigation(holds(runId, point, reply, rootA, rootB));
    await votes.recordVerdictVote(countedVote(runId, rootA, reply));
    await eraseRun(runId);
    expect(await investigations.readPointInvestigationsForRun(runId)).toEqual([]);
    expect(await votes.readVerdictVotesForRun(runId)).toEqual([]);
    expect(await investigations.recordPointInvestigation(capped(runId, rootB))).toBe("RUN_ERASED");
    expect(await votes.recordVerdictVote(failedVote(runId))).toBe("RUN_ERASED");
    expect(await counts(runId)).toEqual({ investigations: 1, votes: 1 });
  });

  it("refuses a malformed record typed, before anything is sealed or stored, naming a field and no AI text", async () => {
    const runId = await newRun("legacy");
    const [point, rootA, rootB] = [await node(runId, "legacy"), await node(runId, "legacy"), await node(runId, "legacy")];
    const reply = await artifact(runId);
    const investigation = holds(runId, point, reply, rootA, rootB);
    const vote = countedVote(runId, rootA, reply);
    const investigations = new PointInvestigationRepository(database.pool);
    const votes = new VerdictVoteRepository(database.pool);
    for (const [field, record] of [
      ["investigationOrder", { ...investigation, investigationOrder: 0 }],
      ["result", { ...investigation, result: "MAYBE" }],
      ["basis", { ...investigation, basis: null }],
      ["content", { ...investigation, content: { ...HOLDS_CONTENT, found: "" } }],
      // pre-flight PF-R2a6.1: only whitespace is blank too, so with basis "established" it is refused.
      ["content", { ...investigation, content: { ...HOLDS_CONTENT, found: "   " } }],
      ["investigator", { ...capped(runId, point), investigator: INVESTIGATOR }],
      // pre-flight PF-R2a8.1: an UNAVAILABLE row must name its planned investigator; only SKIPPED / CAPPED name none.
      ["investigator", { ...moneyStopped(runId, point, 2), investigator: null }],
      ["investigator.maker", { ...investigation, investigator: { ...INVESTIGATOR, maker: "the bus fare" } }],
      ["standings.moved", { ...investigation, standings: { leaderWithoutRootNodeId: rootA, leaderWithRootNodeId: rootA, moved: true } }],
      ["standings", { ...capped(runId, point), standings: { leaderWithoutRootNodeId: rootA, leaderWithRootNodeId: rootB, moved: true } }]
    ] as const) {
      await expect(investigations.recordPointInvestigation(record as unknown as PointInvestigationRecord), field)
        .rejects.toMatchObject({ code: "ENGINE_RECORD_INVALID", message: `ENGINE_RECORD_INVALID: ${field}` });
    }
    for (const [field, record] of [
      ["judgeSeat", { ...vote, judgeSeat: 6 }],
      ["judge.providerRef", { ...vote, judge: { ...judge(1), providerRef: "a provider" } }],
      ["counted", { ...vote, notCountedReason: "OWN_MAKER" }],
      ["choice", { ...failedVote(runId), counted: false, notCountedReason: "OWN_MAKER" }],
      ["choice.letter", { ...vote, choice: { ...vote.choice!, letter: "I" } }],
      ["choice.sameAs[0]", { ...vote, choice: { ...vote.choice!, sameAs: [["A"]] } }],
      // Task A9's review: 0121's same-as CHECK admits these two, so the repository refuses them itself.
      ["choice.sameAs[0]", { ...vote, choice: { ...vote.choice!, sameAs: [["A", "A"]] } }],
      ["choice.sameAs[1]", { ...vote, choice: { ...vote.choice!, sameAs: [["A", "B"], ["C", "B"]] } }],
      ["choice.reasons", { ...vote, choice: { ...vote.choice!, reasons: " " } }],
      ["rawArtifactRef", { ...vote, rawArtifactRef: null }]
    ] as const) {
      await expect(votes.recordVerdictVote(record as unknown as VerdictVoteRecord), field)
        .rejects.toMatchObject({ code: "ENGINE_RECORD_INVALID", message: `ENGINE_RECORD_INVALID: ${field}` });
    }
    expect(await counts(runId)).toEqual({ investigations: 0, votes: 0 });
  });

  it("refuses plaintext on an encrypted run and an envelope moved to another seat, in the database", async () => {
    const runId = await newRun("encrypted");
    const insertVote = (seat: number, content: unknown, envelope: unknown, attestation: Buffer | null) => database.pool.query(
      `INSERT INTO ledger.verdict_vote (run_id, judge_seat, maker, provider_ref, model_id, counted, not_counted_reason, same_as,
         content, content_ciphertext, content_attestation)
       VALUES ($1,$2,'maker-9','deepinfra:judge-9','vendor/judge-9',false,'JUDGE_FAILED','[]'::jsonb,$3::jsonb,$4::jsonb,$5)`,
      [runId, seat, JSON.stringify(content), envelope === null ? null : JSON.stringify(envelope), attestation]);
    await expect(insertVote(1, {}, null, null)).rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger\.verdict_vote$/u);
    const sealed = await encryptAttestedContentForRun(database.pool, runId, "ledger.verdict_vote", "1", {});
    if (sealed === null) throw new Error("R2_TEST_CIPHER_UNCONFIGURED");
    await expect(insertVote(2, CONTENT_JSON_SENTINEL, sealed.envelope, Buffer.from(sealed.attestation)))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    await expect(insertVote(1, CONTENT_JSON_SENTINEL, sealed.envelope, randomBytes(32)))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    const point = await node(runId, "encrypted");
    await expect(database.pool.query(
      `INSERT INTO ledger.point_investigation (run_id, node_id, investigation_order, result, content)
       VALUES ($1,$2,1,'INVESTIGATION_CAPPED','{}'::jsonb)`, [runId, point]))
      .rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger\.point_investigation$/u);
    // Positive control: the genuine envelope on its own seat.
    await insertVote(1, CONTENT_JSON_SENTINEL, sealed.envelope, Buffer.from(sealed.attestation));
    expect(await counts(runId)).toEqual({ investigations: 0, votes: 1 });
  });

  it("is append-only and holds its shapes in the database: UPDATE, DELETE, TRUNCATE and malformed rows are refused", async () => {
    const runId = await newRun("legacy");
    const [point, rootA, rootB] = [await node(runId, "legacy"), await node(runId, "legacy"), await node(runId, "legacy")];
    const reply = await artifact(runId);
    await new PointInvestigationRepository(database.pool).recordPointInvestigation(holds(runId, point, reply, rootA, rootB));
    await new VerdictVoteRepository(database.pool).recordVerdictVote(countedVote(runId, rootA, reply));
    for (const table of ["ledger.point_investigation", "ledger.verdict_vote"]) {
      await expect(database.pool.query(`UPDATE ${table} SET recorded_at = recorded_at WHERE run_id = $1`, [runId])).rejects.toThrowError(/append-only/u);
      await expect(database.pool.query(`DELETE FROM ${table} WHERE run_id = $1`, [runId])).rejects.toThrowError(/append-only/u);
      await expect(database.pool.query(`TRUNCATE ${table}`)).rejects.toThrowError(/TRUNCATE_REJECTED/u);
    }
    const vote = (seat: number, letter: string | null, reason: string | null, counted: boolean, sameAs: string) => database.pool.query(
      `INSERT INTO ledger.verdict_vote (run_id, judge_seat, maker, provider_ref, model_id, raw_artifact_ref, chosen_letter, chosen_root_node_id,
         conditional, counted, not_counted_reason, question_kind, same_as, content)
       VALUES ($1,$2,'maker-8','deepinfra:judge-8','vendor/judge-8',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'{}'::jsonb)`,
      [runId, seat, letter === null ? null : reply, letter, letter === null ? null : rootA, letter === null ? null : false,
        counted, reason, letter === null ? null : "general", sameAs]);
    await expect(vote(2, "A", null, true, '[["A","Z"]]')).rejects.toThrowError(/verdict_vote_same_as_codes/u);
    await expect(vote(2, "A", null, true, '[["A"]]')).rejects.toThrowError(/verdict_vote_same_as_codes/u);
    await expect(vote(2, "A", null, true, '["A","B"]')).rejects.toThrowError(/verdict_vote_same_as_codes/u);
    await expect(vote(2, "a", null, true, "[]")).rejects.toThrowError(/verdict_vote_letter_shape/u);
    await expect(vote(2, "A", "OWN_MAKER", true, "[]")).rejects.toThrowError(/verdict_vote_counted_or_why/u);
    await expect(vote(2, null, "OWN_MAKER", false, "[]")).rejects.toThrowError(/verdict_vote_reply_whole/u);
    await expect(vote(6, null, "JUDGE_FAILED", false, "[]")).rejects.toThrowError(/verdict_vote_seat_range/u);
    await expect(vote(2, "A", null, true, '[["A","B"],["C","D"]]')).resolves.toMatchObject({ rowCount: 1 });
    expect(await counts(runId)).toEqual({ investigations: 1, votes: 2 });
  });
});
