import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, withRunContentLease, withWriteTransaction, type Pool } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository, insertPreparedNodeReview } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { readStoryEnrichment } from "@debateai/story";
import { FileRunContentKeyStore } from "../../packages/crypto/src/index.js";
import {
  createEncryptedStoryRun,
  createLegacyStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 8 — what the story reads from the database inside the
 * run's lease: the judge's best case and strongest objection (from the judge's
 * own raw artifact, parsed LENIENTLY), the review outcome and its decrypted
 * reasons, and the recorded panel dispersion. A node whose material is absent
 * or unreadable gets nulls and an empty list, never a throw.
 */

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

const CODE_FENCE = "```";

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
  if (owner === undefined) throw new Error("STORY_TEST_OWNER_UNPROVISIONED");
  return owner;
}

function judgement(bestCase: string, objection: string): string {
  return JSON.stringify({
    statement: "A judged position.",
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: "A judged position.",
    restatement_status: "PASS",
    value_laden: false,
    steelman: { summary: bestCase, fidelity: 0.72 },
    critic: { summary: objection, counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 },
    context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}

async function artifact(runId: string, maker: string, rawText: string): Promise<string> {
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId, attemptId: randomUUID(), runId, providerRef: `provider:${maker}`, provider: "test",
    model: `model/${maker}`, maker, modelVersion: "v1", rawText, metadata: {}, parseStatus: "PARSED",
    inputHash: "1".repeat(64), contractHash: "2".repeat(64), contentHash: "3".repeat(64)
  });
  return artifactId;
}

async function node(
  runId: string,
  statement: string,
  provenanceRef: string,
  parent: { readonly nodeId: string; readonly ordinal: number } | null
): Promise<string> {
  return new GraphRepository(database.pool).withGraphWrite(runId, (writer) => writer.addNode({
    runId, statementText: statement, claimType: "comparative",
    parentNodeId: parent?.nodeId ?? null, childKind: parent === null ? null : "attack",
    siblingOrdinal: parent?.ordinal ?? 0,
    generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
    provenanceRef, wayOfKnowing: "REASONING", locator: null, valueLaden: false
  }));
}

async function review(
  runId: string,
  nodeId: string,
  authorArtifact: string,
  outcome: "agree" | "dispute" | "cannot-assess",
  reasons: readonly string[]
): Promise<void> {
  const reviewArtifact = await artifact(runId, "reviewer-maker", JSON.stringify({ outcome, reasons }));
  const prepared = await new JudgementRepository(database.pool).prepareNodeReview({
    runId, nodeId, authorRawArtifactRef: authorArtifact, reviewRawArtifactRef: reviewArtifact, outcome, reasons
  });
  await withWriteTransaction(database.pool, (client) => insertPreparedNodeReview(client, prepared));
}

async function dispersion(runId: string, nodeId: string, artifactId: string, value: number): Promise<void> {
  await new JudgementRepository(database.pool).recordReduced({
    runId, nodeId, rawArtifactRef: artifactId, tau: 0.6, numberKind: "base-probability",
    producer: "judgement:story-test", wayOfKnowing: "REASONING", uncertaintyLadderPosition: "TEST",
    uncertaintyDrivers: [], scoreCaps: [], holes: [], branchIdentifier: "EVIDENCE_AWARE",
    reducerVersion: "test:reducer", judgeWeightVersion: "test:weight", selectedJudgementRef: artifactId,
    dispersion: value, panelContractHashes: [], disagreement: { kind: "MEASURED", value }
  });
}

describe("readStoryEnrichment — the story's database material, inside the run's lease", () => {
  it("reads each node's best case, objection, review and dispersion on an encrypted run", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story enrichment ${randomUUID()}`);
    const rootArtifact = await artifact(runId, "author-maker", judgement("BEST CASE ROOT", "OBJECTION ROOT"));
    const rootId = await node(runId, "Adopt the plan.", rootArtifact, null);
    await review(runId, rootId, rootArtifact, "dispute", ["The cost figure is unsourced.", "The timeline is optimistic."]);
    await dispersion(runId, rootId, rootArtifact, 0.3);

    const fenced = `${CODE_FENCE}json\n${judgement("BEST CASE FENCED", "OBJECTION FENCED")}\n${CODE_FENCE}`;
    const childArtifact = await artifact(runId, "author-maker", fenced);
    const childId = await node(runId, "Costs rise.", childArtifact, { nodeId: rootId, ordinal: 1 });

    // Control: the material really is ciphertext at rest, so a pass below
    // proves the DECRYPT path, not the legacy plain-text fallback.
    const atRest = await database.pool.query<{ has_envelope: boolean; row_text: string }>(
      `SELECT artifact.content_ciphertext IS NOT NULL AS has_envelope, artifact.raw_text AS row_text
       FROM ledger.raw_artifact AS artifact WHERE artifact.raw_artifact_id = ANY($1::uuid[])
       UNION ALL
       SELECT review.content_ciphertext IS NOT NULL, review.reasons::text
       FROM ledger.node_review AS review WHERE review.node_id = $2`,
      [[rootArtifact, childArtifact], rootId]
    );
    expect(atRest.rows).toHaveLength(3);
    for (const row of atRest.rows) {
      expect(row.has_envelope).toBe(true);
      for (const plaintext of ["BEST CASE", "OBJECTION", "unsourced", "optimistic"]) {
        expect(row.row_text).not.toContain(plaintext);
      }
    }

    const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
      runId,
      nodes: [
        { nodeId: rootId, judgeArtifactRef: rootArtifact },
        { nodeId: childId, judgeArtifactRef: childArtifact }
      ]
    }));

    expect([...enrichment.keys()]).toEqual([rootId, childId]);
    expect(enrichment.get(rootId)).toEqual({
      judgeBestCase: "BEST CASE ROOT",
      judgeObjection: "OBJECTION ROOT",
      reviewOutcome: "dispute",
      reviewReasons: ["The cost figure is unsourced.", "The timeline is optimistic."],
      dispersion: 0.3
    });
    expect(enrichment.get(childId)).toEqual({
      judgeBestCase: "BEST CASE FENCED",
      judgeObjection: "OBJECTION FENCED",
      reviewOutcome: null,
      reviewReasons: [],
      dispersion: null
    });
  });

  it("gives an unparseable judge artifact and an unreviewed node nulls and an empty list, never a throw", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story unparseable ${randomUUID()}`);
    const brokenArtifact = await artifact(runId, "author-maker", "The judge answered in prose { and never closed it");
    const nodeId = await node(runId, "A claim with an unreadable judgement.", brokenArtifact, null);

    const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
      runId, nodes: [{ nodeId, judgeArtifactRef: brokenArtifact }]
    }));

    expect(enrichment.get(nodeId)).toEqual({
      judgeBestCase: null, judgeObjection: null, reviewOutcome: null, reviewReasons: [], dispersion: null
    });
  });

  it("gives nulls to a node with no judge artifact, a malformed ref, or another run's artifact", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story refs ${randomUUID()}`);
    const otherRunId = await createEncryptedStoryRun(database.pool, theOwner(), `story other ${randomUUID()}`);
    const ownArtifact = await artifact(runId, "author-maker", judgement("OWN", "OWN OBJECTION"));
    const foreignArtifact = await artifact(otherRunId, "author-maker", judgement("FOREIGN", "FOREIGN OBJECTION"));
    const rootId = await node(runId, "Root.", ownArtifact, null);
    const second = await node(runId, "Second.", ownArtifact, { nodeId: rootId, ordinal: 1 });
    const third = await node(runId, "Third.", ownArtifact, { nodeId: rootId, ordinal: 2 });

    const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
      runId,
      nodes: [
        { nodeId: rootId, judgeArtifactRef: null },
        { nodeId: second, judgeArtifactRef: "not-a-uuid" },
        { nodeId: third, judgeArtifactRef: foreignArtifact }
      ]
    }));

    for (const nodeId of [rootId, second, third]) {
      expect(enrichment.get(nodeId), nodeId).toMatchObject({ judgeBestCase: null, judgeObjection: null });
    }
  });

  it("keeps another run's review and dispersion out, even for a node id it is handed", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story own ${randomUUID()}`);
    // The foreign run is LEGACY on purpose: its reasons and dispersion sit in
    // plain columns, so a missing run filter would show here as leaked VALUES.
    const foreignRunId = await createLegacyStoryRun(database.pool, `story foreign ${randomUUID()}`, randomUUID());
    const ownArtifact = await artifact(runId, "author-maker", judgement("OWN", "OWN OBJECTION"));
    const ownId = await node(runId, "Own claim.", ownArtifact, null);
    await review(runId, ownId, ownArtifact, "agree", ["Own reason."]);
    await dispersion(runId, ownId, ownArtifact, 0.1);
    const foreignArtifact = await artifact(foreignRunId, "author-maker", judgement("FOREIGN", "FOREIGN OBJECTION"));
    const foreignId = await node(foreignRunId, "Foreign claim.", foreignArtifact, null);
    await review(foreignRunId, foreignId, foreignArtifact, "dispute", ["Foreign reason."]);
    await dispersion(foreignRunId, foreignId, foreignArtifact, 0.9);

    const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
      runId,
      nodes: [
        { nodeId: ownId, judgeArtifactRef: ownArtifact },
        { nodeId: foreignId, judgeArtifactRef: null }
      ]
    }));

    expect(enrichment.get(ownId)).toMatchObject({ reviewOutcome: "agree", reviewReasons: ["Own reason."], dispersion: 0.1 });
    expect(enrichment.get(foreignId)).toEqual({
      judgeBestCase: null, judgeObjection: null, reviewOutcome: null, reviewReasons: [], dispersion: null
    });
  });

  it("matches ids in any letter case and keeps the caller's own key", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story letter case ${randomUUID()}`);
    const judgeArtifact = await artifact(runId, "author-maker", judgement("UPPER", "UPPER OBJECTION"));
    const nodeId = await node(runId, "A claim asked for in capitals.", judgeArtifact, null);
    await review(runId, nodeId, judgeArtifact, "agree", ["Holds up."]);
    await dispersion(runId, nodeId, judgeArtifact, 0.2);
    const callerKey = nodeId.toUpperCase();
    expect(callerKey).not.toBe(nodeId);

    const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
      runId, nodes: [{ nodeId: callerKey, judgeArtifactRef: judgeArtifact.toUpperCase() }]
    }));

    expect([...enrichment.keys()]).toEqual([callerKey]);
    expect(enrichment.get(callerKey)).toEqual({
      judgeBestCase: "UPPER",
      judgeObjection: "UPPER OBJECTION",
      reviewOutcome: "agree",
      reviewReasons: ["Holds up."],
      dispersion: 0.2
    });
  });

  it("loads the run's key once for the whole read, not once per row", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story one key ${randomUUID()}`);
    const firstArtifact = await artifact(runId, "author-maker", judgement("FIRST", "FIRST OBJECTION"));
    const secondArtifact = await artifact(runId, "author-maker", judgement("SECOND", "SECOND OBJECTION"));
    const rootId = await node(runId, "Root.", firstArtifact, null);
    const childId = await node(runId, "Child.", secondArtifact, { nodeId: rootId, ordinal: 1 });
    await review(runId, rootId, firstArtifact, "agree", ["Sound."]);

    const load = vi.spyOn(FileRunContentKeyStore.prototype, "load");
    try {
      const enrichment = await withRunContentLease(database.pool, [runId], () => readStoryEnrichment(database.pool, {
        runId,
        nodes: [
          { nodeId: rootId, judgeArtifactRef: firstArtifact },
          { nodeId: childId, judgeArtifactRef: secondArtifact }
        ]
      }));
      // Three decrypts (two artifacts, one review), one key load.
      expect(enrichment.get(rootId)).toMatchObject({ judgeBestCase: "FIRST", reviewReasons: ["Sound."] });
      expect(enrichment.get(childId)).toMatchObject({ judgeBestCase: "SECOND" });
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      load.mockRestore();
    }
  });

  it("reads under the run's own lease: takes one when called alone, never widens another run's", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story own lease ${randomUUID()}`);
    const otherRunId = await createEncryptedStoryRun(database.pool, theOwner(), `story held lease ${randomUUID()}`);
    const judgeArtifact = await artifact(runId, "author-maker", judgement("ALONE", "ALONE OBJECTION"));
    const nodeId = await node(runId, "A claim read without a held lease.", judgeArtifact, null);
    await dispersion(runId, nodeId, judgeArtifact, 0.4);

    const alone = await readStoryEnrichment(database.pool, { runId, nodes: [{ nodeId, judgeArtifactRef: judgeArtifact }] });
    expect(alone.get(nodeId)).toMatchObject({ judgeBestCase: "ALONE", judgeObjection: "ALONE OBJECTION", dispersion: 0.4 });

    // Under ANOTHER run's lease nothing is read, not even the plain dispersion
    // column that needs no decrypt.
    await expect(withRunContentLease(database.pool, [otherRunId], () =>
      readStoryEnrichment(database.pool, { runId, nodes: [{ nodeId, judgeArtifactRef: null }] })
    )).rejects.toMatchObject({ code: "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN" });
  });

  it("answers an empty map for no nodes without touching the database", async () => {
    // Pre-flight ruling: prove no query ran. Every way into this pool throws
    // AND is a spy, so a stray read fails the call and the assertions below.
    const touched = (): never => {
      throw new Error("STORY_TEST_POOL_TOUCHED");
    };
    const query = vi.fn(touched);
    const connect = vi.fn(touched);
    const untouchable = { query, connect } as unknown as Pool;

    const enrichment = await readStoryEnrichment(untouchable, { runId: randomUUID(), nodes: [] });

    expect(enrichment.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
