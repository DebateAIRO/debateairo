import { fileURLToPath } from "node:url";
import { isAbsolute, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startGrokRelay, type GrokRelayHandle } from "./grok-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-grok-cli.mjs", import.meta.url));
const handles: GrokRelayHandle[] = [];

async function start(timeoutMs = 1_000): Promise<GrokRelayHandle> {
  const handle = await startGrokRelay({
    port: 0,
    timeoutMs,
    testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
  });
  handles.push(handle);
  return handle;
}

async function postCompletion(handle: GrokRelayHandle, content: string): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "ignored", messages: [{ role: "user", content }] })
  });
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe("GROK-01 Grok Build CLI relay", () => {
  it("spawns the Grok transport from a fresh empty scratch directory outside the project", async () => {
    const probeScript = [
      'const { readdirSync } = require("node:fs");',
      'const text = JSON.stringify({ cwd: process.cwd(), pwd: process.env.PWD, oldpwd: process.env.OLDPWD, entries: readdirSync(process.cwd()) });',
      'console.log(JSON.stringify({ text, stopReason: "end_turn", modelUsage: { "grok-probe-model": {} } }));'
    ].join("");
    const relay = await startGrokRelay({
      port: 0,
      timeoutMs: 1_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", probeScript, "--"] }
    });
    handles.push(relay);

    const response = await postCompletion(relay, "Probe cwd.");
    const completion = await response.json() as { choices: readonly { message: { content: string } }[] };
    const probe = JSON.parse(completion.choices[0]!.message.content) as {
      cwd: string;
      pwd: string;
      oldpwd: string;
      entries: readonly string[];
    };
    const fromProject = relative(process.cwd(), probe.cwd);

    expect(probe.cwd).toMatch(/[/\\]relay-xai-[^/\\]+$/);
    expect(fromProject === "" || (!fromProject.startsWith("..") && !isAbsolute(fromProject))).toBe(false);
    expect(probe.pwd).toBe(probe.cwd);
    expect(probe.oldpwd).toBe(probe.cwd);
    expect(probe.entries).toEqual([]);
  });

  it("keeps serving observed token usage when the CLI envelope omits cost", async () => {
    process.env.FAKE_GROK_COST_ABSENT = "1";
    try {
      const relay = await start();
      const response = await postCompletion(relay, "Cost absent.");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "grok-fake-cli-model",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });
    } finally {
      delete process.env.FAKE_GROK_COST_ABSENT;
    }
  });

  it("degrades to usage null when cost is absent and modelUsage is non-object", async () => {
    process.env.FAKE_GROK_COST_ABSENT = "1";
    process.env.FAKE_GROK_MODEL_USAGE_NON_OBJECT = "1";
    try {
      const relay = await start();
      const response = await postCompletion(relay, "Telemetry unavailable.");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "grok-fake-cli-model",
        usage: null
      });
    } finally {
      delete process.env.FAKE_GROK_COST_ABSENT;
      delete process.env.FAKE_GROK_MODEL_USAGE_NON_OBJECT;
    }
  });
  it("replays the redacted real Grok Build 1.0.0 text/modelUsage envelope", async () => {
    process.env.FAKE_GROK_CAPTURED_ENVELOPE = "1";
    try {
      const relay = await start();
      expect(relay.model).toBe("grok-4.6-build");
      expect(relay.handshakeCostUsd).toBe(0.00001);
      const response = await postCompletion(relay, "Captured-envelope replay");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "grok-4.6-build",
        maker: "xAI",
        choices: [{ message: { content: "OK" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, x_cost_usd: 0.00001 }
      });
    } finally {
      delete process.env.FAKE_GROK_CAPTURED_ENVELOPE;
    }
  });

  it("handshakes before serving and exposes xAI plus the CLI-reported model verbatim", async () => {
    const relay = await start();
    expect(relay.maker).toBe("xAI");
    expect(relay.model).toBe("grok-fake-cli-model");
  });

  it("maps the OpenAI-compatible transcript to a single, verbatim, tool-less Grok call", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "Assess this claim.");
    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string; maker: string; choices: readonly { message: { content: string } }[];
    };
    expect(completion).toMatchObject({ model: "grok-fake-cli-model", maker: "xAI" });
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      prompt: string; argumentList: readonly string[];
    };
    expect(relayed.prompt).toContain("[user]\nAssess this claim.");
    expect(relayed.argumentList).toContain("--single");
    expect(relayed.argumentList).toContain("--output-format");
    expect(relayed.argumentList).toContain("json");
    expect(relayed.argumentList).toContain("--verbatim");
    expect(relayed.argumentList).toContain("--tools");
  });

  it("refuses boot on a dead or unauthenticated CLI and never fabricates lineage", async () => {
    process.env.FAKE_GROK_ALWAYS_FAIL = "1";
    try {
      await expect(start()).rejects.toThrow("GROK_CLI_FAILED");
    } finally {
      delete process.env.FAKE_GROK_ALWAYS_FAIL;
    }
    const relay = await start();
    await expect(postCompletion(relay, "NO_MODEL_CLI").then((response) => response.json()))
      .resolves.toEqual({ error: "GROK_CLI_MODEL_UNRESOLVED" });
  });

  it("keeps the process-double seam test-only", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(startGrokRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_GROK_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
