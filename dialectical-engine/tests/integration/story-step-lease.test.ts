import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoryVerdictBasis } from "@debateai/contract";
import { migrate } from "@debateai/db";
import { MemoryRepository } from "@debateai/memory";
import {
  ProviderContentUnacceptedError,
  readPromptFrame,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import type { StoryPolicy } from "@debateai/register";
import {
  STORYTELLER_CONTRACT_ID,
  StoryRepository,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir,
  type StoryStepLease,
  type StoryWriteInput
} from "@debateai/story";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 9 fix round 1 (spec §3, amended): the story runs AFTER
 * the run's content lease, and each step — the enrichment read, each provider
 * call, the insert — takes the runner's disclosure lease afresh, briefly. On an
 * ENCRYPTED run, with the erasure's own exclusive lock: an erasure that arrives
 * while a step holds the lease waits for THAT STEP only, lands before the next
 * one, and the story then ends benignly (no row, no throw) instead of the
 * erasure waiting for the whole story.
 *
 * The runner's end-to-end suite uses legacy runs, which an erasure cannot
 * reach, so this is proven here at the writer, with the runner's real step
 * lease (`MemoryRepository.withDisclosureContentLease`) on one pool.
 */

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
/** The erasure side of the lease: the key `packages/db/src/account-erasure.ts` locks exclusively. */
const CONTENT_LEASE_NAMESPACE = "debateai:run-content-lease:v1:";

const POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: "provider:step-lease",
  storyCheckerRoleRef: "provider:step-lease",
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 1, tokenCeiling: 4_096, deadlineMs: 5_000 }),
  checkerBound: Object.freeze({ maxAttempts: 1, tokenCeiling: 1_024, deadlineMs: 5_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: null,
  registerVersion: 1
});

const CHECKER_SATISFIED = JSON.stringify({
  satisfied: true, objection: null,
  criteria: {
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
    no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true, speaks_to_the_person: true
  }
});

function oneNodeStory(): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: "The one position held up under review.",
      summary: "The debate examined one position, and it held up against its strongest objection.",
      confidence: "Fairly sure, until a sourced objection turns up.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1"] }],
      change: paragraph("A stronger, sourced objection would change the answer.")
    },
    why: { reasons: [paragraph("The one position held up against its strongest objection.")] },
    long: {
      sections: ["What you are deciding", "The verdict", "What would change it"].map((title) => ({
        title, paragraphs: [paragraph(`${title}, in the debate's own terms.`)]
      }))
    },
    reviewer_note: null
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("STORY_STEP_LEASE_OWNER_UNPROVISIONED");
  return owner;
}

/** An in-process gateway that applies each call's own content classifier, as the real one does. */
function inProcessGateway(onStoryteller: () => Promise<void>): { readonly provider: ProviderGateway; readonly calls: string[] } {
  const calls: string[] = [];
  const provider: ProviderGateway = {
    async call(request: ProviderCallRequest) {
      calls.push(request.callSiteKey);
      const storyteller = readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID;
      if (storyteller) await onStoryteller();
      const content = storyteller ? oneNodeStory() : CHECKER_SATISFIED;
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:x", "ledger:x");
      }
      return {
        rawArtifactRef: `artifact:${String(calls.length)}`, ledgerEntryRef: `ledger:${String(calls.length)}`, content,
        provider: "openai-compatible-http", model: "step-lease/model", maker: "step-lease", modelVersion: "step-lease/model"
      };
    }
  };
  return { provider, calls };
}

function snapshotFor(runId: string, answerId: string, stepLease: StoryStepLease): StoryWriteInput {
  const nodeId = randomUUID();
  const verdictBasis: StoryVerdictBasis = {
    label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
    winner_node_id: nodeId, winner_strength: 0.6,
    runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
    thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
    confidence_band: null, marks: ["LABEL-BASIS-INCOMPLETE"]
  };
  return {
    runId, workItemId: `work:${runId}`, answerId, answerVersion: 1,
    questionLine: "Should the step lease hold up?", argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low", verdictBasis,
    servedStatement: ["It holds up."],
    nodes: [{
      nodeId, claim: "It holds up.", isPosition: true, wayOfKnowing: "REASONING", baseScore: 0.6, finalStrength: 0.6,
      excludedReason: null, authorModel: "step-lease", panelDispersion: null, criticSummary: "It might not."
    }],
    arrows: [], sensitivity: [], setAside: [],
    judgeArtifactRefs: new Map(),
    stepLease
  };
}

/** The runner's step lease, with a count of how many times a step took it. */
function runnerStepLease(runId: string): { readonly lease: StoryStepLease; entries(): number } {
  const memory = new MemoryRepository(database.pool);
  let entries = 0;
  return {
    lease: (use) => {
      entries += 1;
      return memory.withDisclosureContentLease([runId], use);
    },
    entries: () => entries
  };
}

function writerWith(provider: ProviderGateway, events: Record<string, unknown>[]): StoryWriter {
  return new StoryWriter({
    pool: database.pool, pack: PACK, policy: POLICY, hosted: false,
    resolveProvider: (roleRef) => ({ provider, providerRef: roleRef }),
    log: (event, detail) => { events.push({ event, ...detail }); }
  });
}

async function storyRows(runId: string): Promise<number> {
  const result = await database.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM serve.answer_story WHERE run_id = $1", [runId]
  );
  return result.rows[0]?.count ?? -1;
}

/**
 * An erasure as the erasure path takes it: the run's lease key EXCLUSIVELY (it
 * waits for any step holding the lease), then the run's key cleanup intent,
 * which makes `core.run_private_content_is_live` false. Resolves with the time
 * it finished.
 */
async function eraseUnderExclusiveLease(runId: string): Promise<number> {
  const client = await database.pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [`${CONTENT_LEASE_NAMESPACE}${runId}`]);
    try {
      await client.query(
        `INSERT INTO serve.private_run_key_cleanup_intent (
           request_ref,user_id,run_id,requested_at,cleanup_publication_refs
         ) VALUES ($1,$2,$3,now(),'{}')`,
        [randomUUID(), theOwner().userId, runId]
      );
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`${CONTENT_LEASE_NAMESPACE}${runId}`]);
    }
    return Date.now();
  } finally {
    client.release();
  }
}

/** Until the erasure's exclusive request is queued behind the step that holds the lease. */
async function untilErasureWaits(): Promise<void> {
  for (let poll = 0; poll < 500; poll += 1) {
    const waiting = await database.pool.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
    );
    if ((waiting.rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("STORY_STEP_LEASE_ERASURE_NEVER_WAITED");
}

describe("verdict story — one short lease per step, on an encrypted run", () => {
  it("writes a READY story with each step under its own disclosure lease", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story step lease ${randomUUID()}`);
    const { answerId } = await persistTerminalRun({
      pool: database.pool, runId, fixtureKey: `step-lease-${randomUUID()}`,
      factBundle: {
        facts: ["step-lease-fact"], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "step-lease-reversal", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
      }
    });
    const stepped = runnerStepLease(runId);
    const { provider, calls } = inProcessGateway(async () => undefined);
    const events: Record<string, unknown>[] = [];
    await writerWith(provider, events).writeAfterSettle(snapshotFor(runId, answerId, stepped.lease));
    expect(calls).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    // enrichment + storyteller + checker + insert.
    expect(stepped.entries()).toBe(4);
    await expect(new StoryRepository(database.pool).readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    })).resolves.toMatchObject({ outcome: "READY", rounds: 1 });
  });

  it("an erasure that arrives mid-step waits for that step only, lands, and the story ends without a row or a throw", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story step erasure ${randomUUID()}`);
    const stepped = runnerStepLease(runId);
    let erasure: Promise<number> | undefined;
    const { provider, calls } = inProcessGateway(async () => {
      // The storyteller's step holds the lease: the erasure queues behind it.
      erasure = eraseUnderExclusiveLease(runId);
      await untilErasureWaits();
    });
    const events: Record<string, unknown>[] = [];
    await expect(writerWith(provider, events).writeAfterSettle(snapshotFor(runId, randomUUID(), stepped.lease)))
      .resolves.toBeUndefined();
    const storyDone = Date.now();
    if (erasure === undefined) throw new Error("STORY_STEP_LEASE_ERASURE_NOT_STARTED");
    const erasedAt = await erasure;
    // The erasure finished while the story was still running: it waited for one
    // step, never for the story.
    expect(erasedAt).toBeLessThanOrEqual(storyDone);
    // The next step met the erasure: the checker was never called, and nothing was stored.
    expect(calls).toEqual(["STORY:STORYTELLER:1"]);
    expect(await storyRows(runId)).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({
      event: "STORY_LOOP_FAILED", failureCode: "STORY_UNEXPECTED_ERROR", cause: "PRIVATE_CONTENT_ERASED"
    }));
    expect(events.at(-1)).toMatchObject({ event: "STORY_STORED", stored: "RUN_ERASED" });
    // The enrichment read and the storyteller's call took the lease; the checker's
    // and the insert's were refused by the erasure.
    expect(stepped.entries()).toBe(4);
  });
});
