import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BudgetRepository, PostgresModelSpendStore } from "@debateai/budget";
import { migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { createPostgresProviderGateway } from "@debateai/runner";
import { framedFixturePacket } from "../support/framed-packet.js";
import { createLegacyStoryRun } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 7 — the database half of the story's own allowance: the
 * run's attempt count and money skip the story, the day does not, and a story
 * call passes a run whose attempt ceiling is spent.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
});

async function appendModelCall(runId: string, callSiteKey: string): Promise<void> {
  await new LedgerRepository(database.pool).append({
    runId,
    attemptId: randomUUID(),
    actionKind: "MODEL_CALL",
    callSiteKey,
    subjectItemId: `work:${runId}`,
    stanceAtAction: "UNASSIGNED",
    outcome: "OK",
    actorRef: "provider:test-layer",
    inputHash: "1".repeat(64),
    contractHash: "contract:story-budget",
    startedAt: new Date(),
    finishedAt: new Date()
  });
}

function requestedModel(body: string): string | undefined {
  try {
    const model = (JSON.parse(body) as { readonly model?: unknown }).model;
    return typeof model === "string" ? model : undefined;
  } catch {
    return undefined;
  }
}

async function startOkProvider(): Promise<{ readonly endpoint: string; stop(): Promise<void> }> {
  let served = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      served += 1;
      const body = Buffer.concat(chunks).toString("utf8");
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `story-budget-${served}`, model: requestedModel(body), choices: [{ message: { content: "{\"ok\":true}" } }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("STORY_BUDGET_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    async stop() { server.close(); await once(server, "close"); }
  };
}

describe("the story's allowance, on the database", () => {
  it("counts a run's model attempts without its STORY: call sites", async () => {
    const runId = await createLegacyStoryRun(database.pool, `story budget count ${randomUUID()}`, `asker:${randomUUID()}`);
    await appendModelCall(runId, "JUDGE");
    await appendModelCall(runId, "STORY:STORYTELLER:1");
    await appendModelCall(runId, "STORY:CHECKER:1");
    expect(await new BudgetRepository(database.pool).countRunModelAttempts(runId)).toBe(1);
  });

  it("sums a run's debate spend and its story spend apart; the day sees both", async () => {
    const runId = await createLegacyStoryRun(database.pool, `story budget spend ${randomUUID()}`, `asker:${randomUUID()}`);
    const store = new PostgresModelSpendStore(database.pool);
    const day = "2026-04-04";
    await store.recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId, providerRef: "provider-1",
      chargedOn: day, chargeMicros: 700, inputTokens: 1, outputTokens: 1
    });
    await store.recordSpend({
      spendId: randomUUID(), spendSource: "STORY", runId, providerRef: "provider-1",
      chargedOn: day, chargeMicros: 40, inputTokens: 1, outputTokens: 1
    });
    expect(await store.readRunSpentMicros(runId)).toBe(700);
    expect(await store.readRunStorySpentMicros(runId)).toBe(40);
    expect(await store.readDaySpentMicros(day)).toBe(740);
  });

  it("lets a story call through a run whose attempt ceiling is spent, and still stops a debate call", async () => {
    const runId = await createLegacyStoryRun(
      database.pool, `story budget ceiling ${randomUUID()}`, `asker:${randomUUID()}`, 1
    );
    await appendModelCall(runId, "JUDGE");
    const provider = await startOkProvider();
    try {
      const gateway = createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/story-model", maker: "test-layer"
      });
      const shared = {
        runId,
        subjectItemId: `work:${runId}`,
        bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
        contractHash: "contract:story-budget",
        providerRef: "provider:test-layer",
        packet: framedFixturePacket("story budget")
      } as const;
      await expect(gateway.call({
        ...shared, callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER", lane: "story"
      })).resolves.toMatchObject({ content: "{\"ok\":true}" });
      await expect(gateway.call({
        ...shared, callSiteKey: "JUDGE:after-story", role: "JUDGE", lane: "served"
      })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
      expect(await new BudgetRepository(database.pool).countRunModelAttempts(runId)).toBe(1);
      const story = await database.pool.query<{ outcome: string }>(
        `SELECT outcome FROM ledger.ledger_entry
         WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key = 'STORY:STORYTELLER:1'`,
        [runId]
      );
      expect(story.rows).toEqual([{ outcome: "OK" }]);
    } finally {
      await provider.stop();
    }
  });
});
