import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GROK_HANDSHAKE_PROMPT, startGrokRelay } from "./grok-relay.js";
import { CLAUDE_HANDSHAKE_PROMPT } from "./claude-relay.js";
import { HERMES_HANDSHAKE_PROMPT } from "./hermes-relay.js";
import { CODEX_HANDSHAKE_PROMPT } from "./model-shim.js";

const GROK_LITERAL = "GROK-01 acceptance transport handshake. Reply with the single word: OK";

function isLiteral(prompt: string, literal: string): boolean {
  return prompt === literal && !prompt.includes("CONTENT RULE");
}

describe("S01 R6 unframed relay handshakes", () => {
  // Property: each engine handshake remains its exact one-word request,
  // without rule, debate or user text. Appending any byte must fail its pin.
  it("R6-b — pins the grok handshake", () => {
    expect(isLiteral(GROK_HANDSHAKE_PROMPT, GROK_LITERAL)).toBe(true);
  });
  it("R6-b-neg — rejects one appended character", () => {
    expect(isLiteral(GROK_LITERAL + "!", GROK_LITERAL)).toBe(false);
  });
  it("R6-b-claude — pins the claude handshake", () => {
    expect(isLiteral(CLAUDE_HANDSHAKE_PROMPT,
      "FAIR-02 acceptance transport handshake. Reply with the single word: OK")).toBe(true);
  });
  it("R6-b-hermes — pins the hermes handshake", () => {
    expect(isLiteral(HERMES_HANDSHAKE_PROMPT,
      "HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK")).toBe(true);
  });
  it("R6-b-codex — pins the codex handshake", () => {
    expect(isLiteral(CODEX_HANDSHAKE_PROMPT,
      "DR-181 acceptance transport handshake. Reply with the single word: OK")).toBe(true);
  });

  // Property: the FIRST real CLI invocation receives the exact grok literal;
  // changing the call site while leaving the exported constant intact fails.
  // The external CLI alone is fake, following grok-relay.test.ts's JSON echo.
  it("R6-b-run — sends the literal in the first CLI invocation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hs-s01-handshake-"));
    const invocationLog = join(directory, "invocations.jsonl");
    const fakeCli = [
      'const fs = require("node:fs");',
      'const argumentList = process.argv.slice(1);',
      'const prompt = argumentList[argumentList.indexOf("--single") + 1];',
      `fs.appendFileSync(${JSON.stringify(invocationLog)}, JSON.stringify({ prompt, argumentList }) + "\\n");`,
      'console.log(JSON.stringify({',
      '  text: JSON.stringify({ prompt, argumentList }), stopReason: "end_turn",',
      '  modelUsage: { "grok-4.6-build": { input_tokens: 1, output_tokens: 1 } }',
      '}));'
    ].join("\n");
    let relay: Awaited<ReturnType<typeof startGrokRelay>> | undefined;
    try {
      relay = await startGrokRelay({
        port: 0, timeoutMs: 2_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", fakeCli, "--"] }
      });
      const first = JSON.parse((await readFile(invocationLog, "utf8")).trim().split("\n")[0]!) as { prompt: string };
      expect(isLiteral(first.prompt, GROK_LITERAL)).toBe(true);
    } finally {
      await relay?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
