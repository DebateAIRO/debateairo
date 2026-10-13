import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * Story enrichment (fix 2026-10-12, practice debate 2): the judge's best case and
 * strongest objection are read from the judge's OWN raw artifact, and the gateway
 * stores that artifact as the vendor's WHOLE HTTP reply (`raw_artifact.raw_text`,
 * packages/providers/src/index.ts `persistRawArtifact({ rawText })`). The model's
 * reply sits INSIDE it: `choices[0].message.content` on the OpenAI-compatible wire,
 * the `text` blocks on the Anthropic Messages wire. The reader parsed the envelope
 * itself, found no `steelman`/`critic` on it, and gave every node nulls, so no point
 * ever carried a best case and every objection came from the fallback.
 *
 * These cases store bodies of the shape the practice transcript recorded (keys and
 * nesting only; the texts are invented). The lease and decrypt are the real ones'
 * plain-text path: no envelope at rest, so `decryptLeasedContentForRun` hands back
 * the row's own text.
 */

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  prepareLeasedContentEncryptionForRun: async () => ({
    prepared: null,
    lease: { runIds: [] },
    assertLive: async () => {},
    close: async () => {}
  })
}));

import type { Pool } from "@debateai/db";
import { readStoryEnrichment } from "@debateai/story";

const CODE_FENCE = "```";

function judgeReply(bestCase: string, objection: string): string {
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
  }, null, 2);
}

/** An OpenAI-compatible vendor body (the DeepInfra shape: reasoning beside the content). */
function openAiCompatibleBody(content: string | null): string {
  return JSON.stringify({
    service_tier: "default",
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_760_000_000,
    model: "vendor/judge-model",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content,
        // Thinking text with braces of its own, before nothing: it must never be read as the judgement.
        reasoning_content: "I weigh { the steelman } against { the critic } first.",
        name: null,
        tool_calls: null
      },
      finish_reason: "stop",
      logprobs: null
    }],
    usage: { prompt_tokens: 10, total_tokens: 20, completion_tokens: 10 }
  });
}

/** An Anthropic Messages vendor body: a thinking block, then the answer split over two text blocks. */
function anthropicBody(text: string): string {
  const cut = Math.floor(text.length / 2);
  return JSON.stringify({
    model: "claude-test",
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [
      { type: "thinking", thinking: "", signature: "signature-test" },
      { type: "text", text: text.slice(0, cut) },
      { type: "text", text: text.slice(cut) }
    ],
    container: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 }
  });
}

/** A pool that answers the artifact query from `stored` and every other query with no rows. */
function poolStoring(stored: ReadonlyMap<string, string>): Pool {
  return {
    query: async (sql: string, params: readonly unknown[]) => {
      if (!sql.includes("ledger.raw_artifact")) return { rows: [] };
      const wanted = params[1] as readonly string[];
      return {
        rows: [...stored]
          .filter(([id]) => wanted.includes(id))
          .map(([id, rawText]) => ({ raw_artifact_id: id, raw_text: rawText, content_ciphertext: null }))
      };
    }
  } as unknown as Pool;
}

async function enrichmentOf(rawText: string) {
  const artifactId = randomUUID();
  const nodeId = randomUUID();
  const result = await readStoryEnrichment(poolStoring(new Map([[artifactId, rawText]])), {
    runId: randomUUID(),
    nodes: [{ nodeId, judgeArtifactRef: artifactId }]
  });
  return result.get(nodeId)!;
}

describe("readStoryEnrichment — the judge's texts inside the stored vendor reply", () => {
  it("reads the best case and objection out of an OpenAI-compatible body's message content", async () => {
    const enriched = await enrichmentOf(openAiCompatibleBody(judgeReply("BEST CASE OPENAI", "OBJECTION OPENAI")));
    expect(enriched.judgeBestCase).toBe("BEST CASE OPENAI");
    expect(enriched.judgeObjection).toBe("OBJECTION OPENAI");
  });

  it("reads a fenced judgement inside the message content", async () => {
    const fenced = `${CODE_FENCE}json\n${judgeReply("BEST CASE FENCED", "OBJECTION FENCED")}\n${CODE_FENCE}`;
    const enriched = await enrichmentOf(openAiCompatibleBody(fenced));
    expect(enriched.judgeBestCase).toBe("BEST CASE FENCED");
    expect(enriched.judgeObjection).toBe("OBJECTION FENCED");
  });

  it("reads the joined text blocks of an Anthropic Messages body, skipping thinking", async () => {
    const enriched = await enrichmentOf(anthropicBody(judgeReply("BEST CASE ANTHROPIC", "OBJECTION ANTHROPIC")));
    expect(enriched.judgeBestCase).toBe("BEST CASE ANTHROPIC");
    expect(enriched.judgeObjection).toBe("OBJECTION ANTHROPIC");
  });

  it("still reads a stored reply that is the judgement itself (no vendor envelope)", async () => {
    const enriched = await enrichmentOf(judgeReply("BEST CASE BARE", "OBJECTION BARE"));
    expect(enriched.judgeBestCase).toBe("BEST CASE BARE");
    expect(enriched.judgeObjection).toBe("OBJECTION BARE");
  });

  it("gives nulls, never a throw, when the vendor body carries no usable reply", async () => {
    for (const rawText of [
      openAiCompatibleBody(null),
      openAiCompatibleBody("I cannot answer in JSON today."),
      anthropicBody("Plain words, no judgement object."),
      "not json at all"
    ]) {
      const enriched = await enrichmentOf(rawText);
      expect(enriched.judgeBestCase).toBeNull();
      expect(enriched.judgeObjection).toBeNull();
    }
  });
});
