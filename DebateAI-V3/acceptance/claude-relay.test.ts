import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { startClaudeRelay, type ClaudeRelayHandle } from "./claude-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));
const handles: ClaudeRelayHandle[] = [];

async function start(timeoutMs = 1_000): Promise<ClaudeRelayHandle> {
  const handle = await startClaudeRelay({
    port: 0,
    timeoutMs,
    testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
  });
  handles.push(handle);
  return handle;
}

async function postCompletion(handle: ClaudeRelayHandle, userContent: string): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "ignored-by-relay",
      messages: [
        { role: "system", content: "Return strict JSON." },
        { role: "user", content: userContent }
      ]
    })
  });
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe("FAIR-02 Claude Code CLI relay", () => {
  it("keeps serving observed token usage when the CLI envelope omits cost", async () => {
    process.env.FAKE_CLAUDE_COST_ABSENT = "1";
    try {
      const relay = await start();
      const response = await postCompletion(relay, "Cost absent.");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "claude-fake-cli-model",
        usage: { completion_tokens: 5 }
      });
    } finally {
      delete process.env.FAKE_CLAUDE_COST_ABSENT;
    }
  });

  it("degrades to usage null when cost is absent and modelUsage is non-object", async () => {
    process.env.FAKE_CLAUDE_COST_ABSENT = "1";
    process.env.FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT = "1";
    try {
      const relay = await start();
      const response = await postCompletion(relay, "Telemetry unavailable.");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "claude-fake-cli-model",
        usage: null
      });
    } finally {
      delete process.env.FAKE_CLAUDE_COST_ABSENT;
      delete process.env.FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT;
    }
  });
  it("performs a real startup handshake and exposes the CLI-reported model and the Anthropic maker", async () => {
    const relay = await start();
    // DR-115 lineage honesty: the model id comes from the CLI's own JSON
    // envelope (modelUsage key), never from a guessed literal.
    expect(relay.model).toBe("claude-fake-cli-model");
    expect(relay.maker).toBe("Anthropic");
  });

  it("maps an OpenAI request to claude -p --output-format json with closed stdin and reports true lineage", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "Assess this claim.");

    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string;
      maker: string;
      choices: readonly { message: { content: string } }[];
      usage: { completion_tokens: number; x_cost_usd: number };
    };
    expect(completion).toMatchObject({ model: "claude-fake-cli-model", maker: "Anthropic" });
    expect(completion.usage).toEqual({ completion_tokens: 5, x_cost_usd: 0 });
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      prompt: string;
      argumentList: readonly string[];
    };
    expect(relayed.prompt).toContain("[system]\nReturn strict JSON.");
    expect(relayed.prompt).toContain("[user]\nAssess this claim.");
    expect(relayed.argumentList).toContain("-p");
    expect(relayed.argumentList).toContain("--output-format");
    expect(relayed.argumentList).toContain("json");
  });

  it("propagates a nonzero CLI exit as HTTP 502 without fabricating choices", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "FAIL_CLI");

    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ error: "CLAUDE_CLI_FAILED" });
    expect(body).not.toHaveProperty("choices");
  });

  it("propagates a CLI deadline as HTTP 504 without fallback text", async () => {
    // 300ms: comfortably above fake-CLI process boot (the startup handshake
    // must pass) and far below the fixture's 2s TIMEOUT_CLI delay.
    const relay = await start(300);
    const response = await postCompletion(relay, "TIMEOUT_CLI");

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "CLAUDE_CLI_TIMEOUT" });
  });

  it("treats a CLI-declared error envelope (the observed expired-OAuth case) as a loud failure", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "IS_ERROR_CLI");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "CLAUDE_CLI_FAILED" });
  });

  it("refuses to guess between multiple CLI-reported models", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "MULTI_MODEL_CLI");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "CLAUDE_CLI_MODEL_UNRESOLVED" });
  });

  it("treats non-JSON stdout and blank results as loud failures, never fabricated completions", async () => {
    const relay = await start();
    const nonJson = await postCompletion(relay, "NON_JSON_CLI");
    expect(nonJson.status).toBe(502);
    expect(await nonJson.json()).toEqual({ error: "CLAUDE_CLI_OUTPUT_INVALID" });

    const blank = await postCompletion(relay, "EMPTY_RESULT_CLI");
    expect(blank.status).toBe(502);
    expect(await blank.json()).toEqual({ error: "CLAUDE_CLI_OUTPUT_INVALID" });
  });

  it("refuses to start when the CLI handshake fails, instead of serving a dead maker", async () => {
    process.env.FAKE_CLAUDE_ALWAYS_FAIL = "1";
    try {
      await expect(start()).rejects.toThrow("CLAUDE_CLI_FAILED");
    } finally {
      delete process.env.FAKE_CLAUDE_ALWAYS_FAIL;
    }
  });

  it("rejects the test-only command seam outside NODE_ENV=test", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(startClaudeRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
