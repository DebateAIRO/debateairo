// tests/unit/preview-gate-stubs-chat-body.test.ts
// V4 start step, Task 54d (follow-up to Tasks 54c and 58b): the gate stand-in (tests/support/preview-gate-stubs.ts) reads an
// Anthropic request as the packet the app built, a repair turn's block included. The Anthropic wire joins consecutive user
// messages into one turn (packages/providers/src/anthropic-messages.ts), so a repair packet's rejection block travels in the same
// turn as the material: after the material's text block (LG-B), or inside the step's own block when the closing's fields are
// cache-split (F5, the dossier first). Before Task 54d the stand-in read such a turn as one block: a path root's full re-ask was an
// UNKNOWN request (a billed 500, so the flaky "refused after every repair" case of tests/integration/v2-paths-run.test.ts), and a
// cache-split story's repair threw inside the gate's request handler, which then never answered. Every text here is made up.
import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { judgePathRootPromptContract } from "@debateai/judgement";
import {
  anthropicMessagesRequestBody, buildFramedPrompt, buildFramedRepairPrompt, readPromptFrame, type FramedMaterialField, type PromptPacket
} from "@debateai/providers";
import { STORY_PATHS_CONTRACT_ID, STORY_PATHS_PROMPT_CONTRACT } from "@debateai/story";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { classifyGateRequest, startPreviewGateStubs, stubChatBody, type PreviewGateStubs } from "../support/preview-gate-stubs.js";

const HAIKU = "claude-haiku-5-5";
/** What the gate makes of a request it reads: its kind, or UNKNOWN when it cannot read it (the gate's own catch). */
const kindAtGate = (chat: string): string => { try { return classifyGateRequest(chat); } catch { return "UNKNOWN"; } };
/** A path root's material (judge.path-root.*): path b2's title and question. */
const ROOT_MATERIAL: readonly FramedMaterialField[] = Object.freeze([
  { name: "question_line", content: "Should the town build a tram line?" },
  { name: "path_title", content: "T2" },
  { name: "path_question", content: "Q2?" },
  { name: "viewpoints", content: JSON.stringify([{ title: "T2", question: "Q2?" }]) },
  { name: "points_raised", content: "[]" }
]);
/** A path story's material (story.paths.v5): its five shared fields (no length table), then one of its own. */
const SHARED = 5;
const STORY_MATERIAL: readonly FramedMaterialField[] = Object.freeze([
  { name: "question_line", content: "Should the town build a tram line?" },
  { name: "main_answer", content: JSON.stringify({ segments: ["Build it."], trust: null }) },
  { name: "paths", content: JSON.stringify([{ id: "b1", fate: "HELD_UP" }, { id: "b2", fate: "HELD_UP" }]) },
  { name: "points", content: JSON.stringify([{ ref: "P1", text: "The costs fit the budget." }, { ref: "P2", text: "Riders would come." }]) },
  { name: "also_raised", content: "[]" },
  { name: "reader", content: "standard" }
]);
/** The format repair after a reply that failed its schema: the first packet, then one fenced block naming the refusal. */
const repairOf = (packet: ReturnType<typeof buildFramedPrompt>): PromptPacket =>
  buildFramedRepairPrompt(packet, { code: "SCHEMA_INVALID", path: "statement" });
/** The body the Anthropic wire sends for a packet, as the gate receives it. */
const anthropicBody = (packet: PromptPacket, form: Readonly<{ marked: boolean; sharedFirstFieldCount?: number }>): Record<string, unknown> =>
  JSON.parse(anthropicMessagesRequestBody({ model: HAIKU, maxTokens: 64, thinkingLevel: "high", messages: packet.messages,
    cacheFirstUserTurn: form.marked, ...(form.sharedFirstFieldCount === undefined ? {} : { sharedFirstFieldCount: form.sharedFirstFieldCount }) })) as
    Record<string, unknown>;

describe("the stand-in reads an Anthropic request as the packet the app built (Task 54d)", () => {
  it("a path root's full re-ask, marked or not: the judge call it is, with its title and its rejection block", () => {
    const root = buildFramedPrompt({ contract: judgePathRootPromptContract("unknown"), material: ROOT_MATERIAL });
    const reAsk = repairOf(root);
    for (const marked of [true, false]) {
      const chat = stubChatBody("anthropic", anthropicBody(reAsk, { marked }));
      expect(kindAtGate(chat)).toBe("JUDGE");
      // Every block of the packet, the rejection's included, read as the gateway's own door reads the packet it sent.
      expect(readFramedMaterial(wirePacket(chat))).toEqual(readFramedMaterial(reAsk));
      expect(readFramedMaterial(wirePacket(chat)).fields.find((field) => field.name === "path_title")?.content).toBe("T2");
    }
    // DeepInfra's body carries the packet's own messages: the same reading.
    expect(readFramedMaterial(wirePacket(stubChatBody("deepinfra", { model: "made-up", messages: reAsk.messages }))))
      .toEqual(readFramedMaterial(reAsk));
  });

  it("a request of one block per turn reads exactly as before: the packet's own messages", () => {
    const root = buildFramedPrompt({ contract: judgePathRootPromptContract("unknown"), material: ROOT_MATERIAL });
    for (const marked of [true, false]) {
      expect(stubChatBody("anthropic", anthropicBody(root.packet, { marked }))).toBe(JSON.stringify({ messages: root.packet.messages }));
    }
  });

  it("a cache-split v5 story's format repair answers instead of throwing: the story call, its fields whole, then the rejection", () => {
    const story = buildFramedPrompt({ contract: STORY_PATHS_PROMPT_CONTRACT, material: STORY_MATERIAL });
    const sharedFirstFieldCount = SHARED;
    // The wire really did split it: the shared fields first, under the cache mark (F5).
    const first = (anthropicBody(story.packet, { marked: true, sharedFirstFieldCount }).messages as { content: unknown[] }[])[0]!;
    expect(first.content).toHaveLength(3);
    const repair = repairOf(story);
    const body = anthropicBody(repair, { marked: true, sharedFirstFieldCount });
    expect(() => stubChatBody("anthropic", body)).not.toThrow();
    const chat = stubChatBody("anthropic", body);
    expect(kindAtGate(chat)).toBe("STORY_PATHS");
    expect(readFramedMaterial(wirePacket(chat))).toEqual(readFramedMaterial(repair));
    expect(readFramedMaterial(wirePacket(chat)).contractId).toBe(STORY_PATHS_CONTRACT_ID);
    expect(readPromptFrame(repair).fields.slice(-2).map((field) => field.name)).toEqual(["machine_rejection_code", "machine_rejection_path"]);
    // Without a repair the split story still reads as one block, as before.
    expect(readFramedMaterial(wirePacket(stubChatBody("anthropic", anthropicBody(story.packet, { marked: true, sharedFirstFieldCount })))))
      .toEqual(readFramedMaterial(story.packet));
  });
});

describe("over its socket, the stand-in answers a cache-split story's repair (Task 54d)", () => {
  let gates: PreviewGateStubs | null = null;
  afterEach(async () => { await gates?.close(); gates = null; });

  /** One POST /complete over the Anthropic gate's socket, as the app sends it; the gate's answer. */
  const complete = (socketPath: string, requestBody: string): Promise<Readonly<{ status: number; json: { status?: number; body?: string } }>> => {
    const data = JSON.stringify({ requestBody });
    return new Promise((resolve, reject) => {
      const sent = request({ socketPath, path: "/complete", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as { status?: number } }));
      });
      sent.on("error", reject);
      sent.end(data);
    });
  };

  // A short limit of its own: before Task 54d the stand-in threw in its request handler and this request was never answered.
  it("answers it as the story call it is, with a story", async () => {
    gates = await startPreviewGateStubs({ storyDefaultShape: "made-up-shape" });
    const repair = repairOf(buildFramedPrompt({ contract: STORY_PATHS_PROMPT_CONTRACT, material: STORY_MATERIAL }));
    const body = JSON.stringify(anthropicBody(repair, { marked: true, sharedFirstFieldCount: SHARED }));
    const answered = await complete(gates.sockets.anthropic, body);
    expect([answered.status, answered.json.status]).toEqual([200, 200]);
    expect(gates.requests.map((record) => [record.kind, record.answer])).toEqual([["STORY_PATHS", "OK"]]);
    const story = JSON.parse((JSON.parse(answered.json.body!) as { content: { text: string }[] }).content[0]!.text) as { short: { paths: { position_ref: string }[] } };
    expect(story.short.paths.map((path) => path.position_ref)).toEqual(["b1", "b2"]);
  }, 10_000);
});
