import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_CIPHERTEXT_SENTINEL, withRunContentLease } from "@debateai/db";
import {
  buildFramedPrompt,
  type ContentClassification,
  type PromptContract,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { createPostgresProviderGateway } from "../../apps/runner/src/index.js";
import { readReplayBook, replayingGateway } from "../../apps/runner/src/run-replay.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

/**
 * RECLAIM RESUME (docs/superpowers/specs/2026-10-14-reclaim-resume-design.md): the replay book is read from what the
 * recording gateway really wrote — the ledger row, the attempt's prompt (`ledger.call_prompt`) and the vendor's reply
 * (`ledger.raw_artifact`) — sealed on an encrypted run and in the clear on a legacy one. A later copy's request for the
 * same step (a new frame: its own fence and canary) is answered from the record without reaching the vendor.
 */
let fixture: ContentRunFixture;
const db = () => fixture.database.pool;

beforeAll(async () => {
  fixture = await startContentRunFixture("reclaim-replay-book");
}, 180_000);
afterAll(async () => { await fixture?.stop(); });

const CONTRACT: PromptContract = Object.freeze({
  contractId: "test.reclaim.v1",
  instruction: "Judge the statement on its merits.",
  answerForm: 'Return only one JSON object {"verdict": "yes" | "no", "value_laden": boolean}.'
});
const ANSWER = '{"verdict":"yes","value_laden":false}';
const classify = (content: string): ContentClassification => {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    return (value.verdict === "yes" || value.verdict === "no") && typeof value.value_laden === "boolean"
      ? { parseStatus: "PARSED", parseError: null }
      : { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify([{ path: ["verdict"], message: "Invalid" }]) };
  } catch {
    return { parseStatus: "PARSE_FAILED", parseError: "not JSON" };
  }
};
const request = (runId: string, question: string): ProviderCallRequest => ({
  runId, subjectItemId: "work-item:reclaim", callSiteKey: "JUDGE:seat:main", role: "JUDGE", lane: "served",
  bound: { maxAttempts: 2, tokenCeiling: 400, deadlineMs: 5_000 }, contractHash: "contract:reclaim",
  providerRef: "vendor:ref",
  packet: buildFramedPrompt({ contract: CONTRACT, material: [{ name: "question_line", content: question }] }).packet,
  classifyContent: classify
});
const vendorReply = (content: string) => new Response(JSON.stringify({
  id: "chatcmpl-reclaim", model: "vendor/model-1",
  usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }]
}), { status: 200, headers: { "content-type": "application/json" } });

async function recordOneCall(runId: string, question: string): Promise<string> {
  let sent = 0;
  const gateway = createPostgresProviderGateway(db(), {
    endpoint: "http://127.0.0.1:9/v1", model: "vendor/model-1", maker: "vendor",
    fetchImplementation: async () => { sent += 1; return vendorReply(ANSWER); }
  });
  const result = await withRunContentLease(db(), [runId], () => gateway.call(request(runId, question)));
  expect(sent).toBe(1);
  return result.rawArtifactRef;
}

describe("the replay book reads what the recording gateway wrote", () => {
  for (const kind of ["encrypted", "legacy"] as const) {
    it(`a ${kind} run's recorded call answers a later copy's request for the same step, and the vendor is not asked`, async () => {
      const question = `Should buses be free? (${kind})`;
      const runId = kind === "encrypted" ? await fixture.createEncryptedRun(question) : await fixture.createLegacyRun(question);
      const rawArtifactRef = await recordOneCall(runId, question);
      const sealed = await db().query<{ prompt_text: string }>(`SELECT prompt_text FROM ledger.call_prompt WHERE run_id=$1`, [runId]);
      expect(sealed.rows.map((row) => row.prompt_text === CONTENT_CIPHERTEXT_SENTINEL)).toEqual([kind === "encrypted"]);

      const book = await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, "work-item:reclaim"));
      expect(book.pending).toBe(1);
      let asked = 0;
      const vendor: ProviderGateway = { call: async () => { asked += 1; throw new Error("the vendor must not be asked"); } };
      const replayed = await replayingGateway(book, vendor).call(request(runId, question));
      expect(asked).toBe(0);
      expect(replayed).toMatchObject({ rawArtifactRef, content: ANSWER, maker: "vendor", model: "vendor/model-1", repairAttempts: 0 });
      expect(book.pending).toBe(0);
    }, 60_000);
  }

  it("another work item's calls, and a different question, are not in the book's reach", async () => {
    const question = "Should trams be free?";
    const runId = await fixture.createEncryptedRun(question);
    await recordOneCall(runId, question);
    expect((await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, "work-item:other"))).pending).toBe(0);
    const book = await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, "work-item:reclaim"));
    let asked = 0;
    const vendor: ProviderGateway = {
      call: async () => { asked += 1; return { rawArtifactRef: "fresh", ledgerEntryRef: "fresh", content: ANSWER,
        provider: "openai-compatible-http", model: "vendor/model-1", maker: "vendor", modelVersion: "vendor/model-1" }; }
    };
    expect((await replayingGateway(book, vendor).call(request(runId, "Should ferries be free?"))).rawArtifactRef).toBe("fresh");
    expect(asked).toBe(1);
  }, 60_000);
});
