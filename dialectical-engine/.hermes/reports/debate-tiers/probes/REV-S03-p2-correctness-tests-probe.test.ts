// REV-S03-p2-correctness-tests — reviewer probe, built from SPEC-v3 R18's CLAIM.
// Head: d35a9634 (integration/all). TEMPORARY: deleted before handoff.
// Every model id is read from the committed config/models.yaml, never written as a literal,
// so the probe cannot pass by agreeing with the same constant the product hard-codes.
import { afterEach, describe, expect, it } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import { startClaudeRelay, type ClaudeRelayHandle } from "../../acceptance/claude-relay.js";
import { startGrokRelay, type GrokRelayHandle } from "../../acceptance/grok-relay.js";

const ROOT = process.cwd();
const handles: (ClaudeRelayHandle | GrokRelayHandle)[] = [];

function slotModel(cli: string): string {
  const config = loadModelConfig(ROOT);
  for (const tier of ["free", "premium"] as const) {
    for (const entry of config[tier]) {
      if (entry.transport === "cli" && entry.cli === cli) return entry.model;
    }
  }
  throw new Error(`NO_CLI_ENTRY:${cli}`);
}

const captureArgvScript = (modelUsage: string): string => [
  'console.log(JSON.stringify({',
  '  is_error: false, result: JSON.stringify({ argumentList: process.argv }),',
  `  modelUsage: ${modelUsage}`,
  '}));'
].join("");

const grokCaptureArgvScript = (modelUsage: string): string => [
  'console.log(JSON.stringify({',
  '  text: JSON.stringify({ argumentList: process.argv }),',
  '  stopReason: "end_turn",',
  `  modelUsage: ${modelUsage}`,
  '}));'
].join("");

async function argvOf(relay: ClaudeRelayHandle | GrokRelayHandle): Promise<readonly string[]> {
  const response = await fetch(`${relay.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: relay.authorizationHeader },
    body: JSON.stringify({ model: "ignored-by-relay", messages: [{ role: "user", content: "Assess." }] })
  });
  expect(response.status).toBe(200);
  const completion = await response.json() as { choices: readonly { message: { content: string } }[] };
  return (JSON.parse(completion.choices[0]!.message.content) as { argumentList: readonly string[] })
    .argumentList;
}

function modelFlagValue(argv: readonly string[]): string | undefined {
  const at = argv.indexOf("--model");
  return at === -1 ? undefined : argv[at + 1];
}

async function startError(start: Promise<unknown>): Promise<string> {
  return start.then(() => "NO_THROW", (error: unknown) => String(error));
}

describe("REV-S03-p2 correctness probe — R18: every CLI pin is the file's full model id", () => {
  afterEach(async () => {
    while (handles.length > 0) await handles.pop()!.close();
  });

  // PROBE 1 — the Claude CLI is asked for the FILE's id, and never for the alias R18 forbids.
  it("P1 asks the Claude CLI for the configured full id, not `opus`", async () => {
    const configured = slotModel("claude");
    const relay = await startClaudeRelay({
      port: 0, timeoutMs: 2_000, model: configured,
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: ["-e", captureArgvScript(`{ ${JSON.stringify(configured)}: {} }`), "--"]
      }
    });
    handles.push(relay);
    const argv = await argvOf(relay);
    expect(modelFlagValue(argv)).toBe(configured);
    expect(modelFlagValue(argv)).not.toBe("opus");
    expect(argv.filter((token) => token === "--model")).toHaveLength(1);
  });

  // PROBE 2 — the alias path is UNCHANGED: a hyphenated alias is still refused.
  it("P2 still refuses a hyphenated value on the alias path", async () => {
    const configured = slotModel("claude");
    const result = await startError(startClaudeRelay({
      port: 0, timeoutMs: 2_000, modelAlias: configured,
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", captureArgvScript('{ "x": {} }'), "--"] }
    }));
    expect(result).toContain("CLAUDE_CLI_MODEL_ALIAS_INVALID");
  });

  // PROBE 3 — a full id never reaches the alias pattern; the model path has its own refusal.
  it("P3 refuses a bare alias and a foreign id on the model path, with the model-path code", async () => {
    for (const bad of ["opus", "gpt-5.6-sol", "claude-OPUS-5", "Claude-opus-5"]) {
      const result = await startError(startClaudeRelay({
        port: 0, timeoutMs: 2_000, model: bad,
        testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", captureArgvScript('{ "x": {} }'), "--"] }
      }));
      expect(result, bad).toContain("CLAUDE_CLI_MODEL_INVALID");
      expect(result, bad).not.toContain("CLAUDE_CLI_MODEL_ALIAS_INVALID");
    }
  });

  // PROBE 4 — precedence: `modelAlias` beside `model` loses to `model`, in the ARGV.
  it("P4 gives the full id precedence over an alias, measured on the argv", async () => {
    const configured = slotModel("claude");
    const relay = await startClaudeRelay({
      port: 0, timeoutMs: 2_000, model: configured, modelAlias: "sonnet",
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: ["-e", captureArgvScript(
          `{ "claude-sonnet-5": { canonicalModel: "claude-sonnet-5" }, ${JSON.stringify(configured)}: { canonicalModel: ${JSON.stringify(configured)} } }`
        ), "--"]
      }
    });
    handles.push(relay);
    expect(modelFlagValue(await argvOf(relay))).toBe(configured);
    expect(relay.model).toBe(configured);
  });

  // PROBE 5 — the Grok CLI is asked at all, and only when a model is supplied.
  it("P5 puts `--model <file id>` on the Grok argv, and no --model when none is given", async () => {
    const configured = slotModel("grok");
    const withModel = await startGrokRelay({
      port: 0, timeoutMs: 2_000, model: configured, sandboxProfile: "none",
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: ["-e", grokCaptureArgvScript(`{ ${JSON.stringify(configured)}: {} }`), "--"]
      }
    });
    handles.push(withModel);
    expect(modelFlagValue(await argvOf(withModel))).toBe(configured);

    const withoutModel = await startGrokRelay({
      port: 0, timeoutMs: 2_000, sandboxProfile: "none",
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: ["-e", grokCaptureArgvScript('{ "grok-fallback": {} }'), "--"]
      }
    });
    handles.push(withoutModel);
    expect(modelFlagValue(await argvOf(withoutModel))).toBeUndefined();
  });

  // PROBE 6 — REFUTATION, exceeding the authors' parameters. The repo's own captured envelope
  // (claude-relay.test.ts:111-112) shows Claude reporting DATED keys for helper models. If the
  // primary key is dated and carries no canonicalModel, the alias path resolved it and the new
  // model path cannot: exact equality has no tokenizer.
  it("P6 the full-id path loses a dated primary key that the alias path resolved", async () => {
    const configured = slotModel("claude");                  // claude-opus-5
    const datedPrimary = `${configured}-20260501`;           // what a real CLI reports
    const usage = `{ "claude-haiku-4-5-20251001": { inputTokens: 9 }, ${JSON.stringify(datedPrimary)}: { inputTokens: 2 } }`;

    const aliasPath = await startClaudeRelay({
      port: 0, timeoutMs: 2_000, modelAlias: "opus",
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", captureArgvScript(usage), "--"] }
    }).then((relay) => { handles.push(relay); return relay.model; }, (error: unknown) => String(error));

    const modelPath = await startClaudeRelay({
      port: 0, timeoutMs: 2_000, model: configured,
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", captureArgvScript(usage), "--"] }
    }).then((relay) => { handles.push(relay); return relay.model; }, (error: unknown) => String(error));

    expect(aliasPath).toBe(datedPrimary);                     // the old path resolved it
    expect(modelPath).toContain("CLAUDE_CLI_MODEL_UNRESOLVED"); // the new path refuses to start
  });

  // PROBE 7 — the same dated key WITH canonicalModel is resolved: the narrowing is exactly
  // "dated key and no canonicalModel", not "dated key".
  it("P7 resolves a dated primary key when the CLI also reports canonicalModel", async () => {
    const configured = slotModel("claude");
    const usage = `{ "claude-haiku-4-5-20251001": { inputTokens: 9 }, ${JSON.stringify(`${configured}-20260501`)}: { canonicalModel: ${JSON.stringify(configured)} } }`;
    const relay = await startClaudeRelay({
      port: 0, timeoutMs: 2_000, model: configured,
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", captureArgvScript(usage), "--"] }
    });
    handles.push(relay);
    expect(relay.model).toBe(`${configured}-20260501`);
  });

  // PROBE 8 — the third transport. Codex honours the file through -c model="…".
  it("P8 the codex entry's id is the one the shim pins", async () => {
    const configured = slotModel("codex");
    expect(configured).toMatch(/^gpt-/u);
    expect(slotModel("claude")).toMatch(/^claude-/u);
    expect(slotModel("grok")).toMatch(/^grok-/u);
  });
});
