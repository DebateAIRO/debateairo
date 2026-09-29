import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFramedPrompt, CONTENT_RULE_TEXT } from "@debateai/providers";
import { renderPromptTranscript } from "./relay-core.js";
import { renderCodexPrompt } from "./model-shim.js";

const packet = buildFramedPrompt({
  contract: { contractId: "hs.relay.v1", instruction: "Answer the question.", answerForm: "Return JSON." },
  material: [{ name: "question_line", content: "Should the proposal stand?" }]
}).packet;

describe("S01 CLI relay content rule", () => {
  // Property: transcript serialization preserves the system rule exactly once.
  it("R5-a preserves the rule in the shared CLI transcript", () => {
    const transcript = JSON.parse(renderPromptTranscript(packet.messages));
    expect(transcript.messages[0].content.split(CONTENT_RULE_TEXT)).toHaveLength(2);
    expect(transcript.messages).toEqual(packet.messages);
  });
  // Property: Codex consumes the same complete transcript as the shared core.
  it("R5-b renders the identical Codex transcript", () => {
    expect(renderCodexPrompt(packet.messages)).toBe(renderPromptTranscript(packet.messages));
  });
  // Property: every dev relay delegates to the one core that renders parsed messages.
  it("R5-c routes all four relays through the shared renderer", () => {
    expect(readFileSync("acceptance/relay-core.ts", "utf8").split("const prompt = renderPromptTranscript(parsed.messages);")).toHaveLength(2);
    for (const file of ["claude-relay.ts", "grok-relay.ts", "hermes-relay.ts", "model-shim.ts"]) {
      expect(readFileSync(`acceptance/${file}`, "utf8").split("startCliRelayServer(")).toHaveLength(2);
    }
  });
});
