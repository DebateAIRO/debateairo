import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCallPrompt } from "@debateai/db";
import { createPostgresProviderGateway } from "@debateai/runner";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { framedFixturePacket } from "../support/framed-packet.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

// Model scorecard §2.3 through the SHIPPED composition: createPostgresProviderGateway
// writes the four call facts on ledger.ledger_entry, the thinking tokens on
// ledger.raw_artifact, and the prompt of the attempt on ledger.call_prompt with
// the scorecard's canonical fingerprint.

const MODEL = "test-layer/scorecard-model";
let fixture: ContentRunFixture;
let server: Server;
let endpoint: string;
const seenLevels: Array<string | null> = [];

beforeAll(async () => {
  fixture = await startContentRunFixture("model-scorecard-gateway");
  server = createServer((incoming, response) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const sent = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Readonly<Record<string, unknown>>;
      const level = typeof sent.x_thinking_level === "string" ? sent.x_thinking_level : null;
      seenLevels.push(level);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: `call-${randomUUID()}`,
        model: MODEL,
        ...(level === null ? {} : { x_thinking_level: level }),
        usage: {
          prompt_tokens: 11, completion_tokens: 3, total_tokens: 14,
          completion_tokens_details: { reasoning_tokens: 9 }
        },
        choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the stub provider did not bind");
  endpoint = `http://127.0.0.1:${address.port}/v1`;
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await fixture?.stop();
});

function call(runId: string, extra: Readonly<Record<string, unknown>>) {
  const packet = framedFixturePacket(`scorecard gateway records ${randomUUID()}`);
  const gateway = createPostgresProviderGateway(fixture.database.pool, {
    endpoint, model: MODEL, maker: "maker:1",
    thinking: { parameter: "x_thinking_level", levels: ["low", "high"] }
  });
  return {
    packet,
    result: gateway.call({
      runId, subjectItemId: "node:scorecard", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
      contractHash: "contract:scorecard", providerRef: "provider:test-layer", packet,
      ...extra
    })
  };
}

describe("model scorecard — the shipped gateway composition records every call", () => {
  it("writes the call facts, the thinking tokens and the prompt of the attempt", async () => {
    const runId = await fixture.createLegacyRun(`scorecard gateway ${randomUUID()}`);
    const { packet, result } = call(runId, {
      modelRole: "POSITION", thinkingLevel: "high",
      candidateId: "test-layer/scorecard-model@high", scorecardVersion: 2
    });
    const answer = await result;
    expect(answer).toMatchObject({ thinkingLevel: "high", reasoningTokens: 9 });
    expect(seenLevels.at(-1)).toBe("high");
    const entries = (await fixture.database.pool.query<{
      attempt_id: string; model_role: string | null; candidate_id: string | null;
      scorecard_version: number | null; thinking_level: string | null; raw_artifact_ref: string;
    }>(
      `SELECT attempt_id::text, model_role, candidate_id, scorecard_version, thinking_level,
              raw_artifact_ref::text
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'`,
      [runId]
    )).rows;
    expect(entries).toEqual([{
      attempt_id: expect.any(String), model_role: "POSITION",
      candidate_id: "test-layer/scorecard-model@high", scorecard_version: 2,
      thinking_level: "high", raw_artifact_ref: answer.rawArtifactRef
    }]);
    expect((await fixture.database.pool.query(
      "SELECT thinking_tokens FROM ledger.raw_artifact WHERE raw_artifact_id=$1", [answer.rawArtifactRef]
    )).rows).toEqual([{ thinking_tokens: 9 }]);
    await expect(readCallPrompt(fixture.database.pool, entries[0]!.attempt_id)).resolves.toEqual({
      runId,
      attemptId: entries[0]!.attempt_id,
      promptText: JSON.stringify(packet.messages),
      promptFingerprint: canonicalPromptFingerprint(packet.messages)
    });
  }, 180_000);

  it("a caller that names no facts leaves them NULL, records DEFAULT_ONLY, and still records its prompt", async () => {
    const runId = await fixture.createLegacyRun(`scorecard gateway bare ${randomUUID()}`);
    const { packet, result } = call(runId, {});
    await result;
    expect(seenLevels.at(-1)).toBeNull();
    const entries = (await fixture.database.pool.query<{
      attempt_id: string; model_role: null; candidate_id: null; scorecard_version: null; thinking_level: string;
    }>(
      `SELECT attempt_id::text, model_role, candidate_id, scorecard_version, thinking_level
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'`,
      [runId]
    )).rows;
    expect(entries).toEqual([{
      attempt_id: expect.any(String), model_role: null, candidate_id: null,
      scorecard_version: null, thinking_level: "DEFAULT_ONLY"
    }]);
    await expect(readCallPrompt(fixture.database.pool, entries[0]!.attempt_id))
      .resolves.toMatchObject({ promptText: JSON.stringify(packet.messages) });
  }, 180_000);
});
