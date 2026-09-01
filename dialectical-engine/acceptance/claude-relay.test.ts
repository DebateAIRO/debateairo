import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_BINARY,
  resolveClaudeBinary,
  startClaudeRelay,
  type ClaudeRelayHandle
} from "./claude-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));
const handles: ClaudeRelayHandle[] = [];
const temporaryDirectories: string[] = [];

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * A real executable at a path this test chooses, so the environment override
 * can be observed the only honest way there is: by which binary is spawned.
 * The relay takes no argument seam for the default command, so the fixture has
 * to arrive as an executable file rather than as `node <fixture>`.
 */
async function hostBinary(name: string, fixture: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "relay-host-binary-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(
    path,
    `#!/bin/sh\nexec ${posixQuote(process.execPath)} ${posixQuote(fixture)} "$@"\n`,
    { mode: 0o755 }
  );
  return path;
}

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
    headers: { "content-type": "application/json", authorization: handle.authorizationHeader },
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
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("FAIR-02 Claude Code CLI relay", () => {
  it("spawns the Claude transport from a fresh empty scratch directory outside the project", async () => {
    const probeScript = [
      'const { readdirSync } = require("node:fs");',
      'const result = JSON.stringify({ cwd: process.cwd(), pwd: process.env.PWD, oldpwd: process.env.OLDPWD, entries: readdirSync(process.cwd()) });',
      'console.log(JSON.stringify({ is_error: false, result, modelUsage: { "claude-probe-model": {} } }));'
    ].join("");
    const relay = await startClaudeRelay({
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

    expect(probe.cwd).toMatch(/[/\\]relay-anthropic-[^/\\]+$/);
    expect(fromProject === "" || (!fromProject.startsWith("..") && !isAbsolute(fromProject))).toBe(false);
    expect(probe.pwd).toBe(probe.cwd);
    expect(probe.oldpwd).toBe(probe.cwd);
    expect(probe.entries).toEqual([]);
  });

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

  it("selects the requested Opus lineage when Claude also reports helper-model usage", async () => {
    const capturedEnvelopeScript = [
      'console.log(JSON.stringify({',
      '  is_error: false, result: "OK", total_cost_usd: 0.056795,',
      '  modelUsage: {',
      '    "claude-haiku-4-5-20251001": { inputTokens: 910, outputTokens: 17, canonicalModel: "claude-haiku-4-5" },',
      '    "claude-opus-5": { inputTokens: 2, outputTokens: 4, canonicalModel: "claude-opus-5" }',
      '  }',
      '}));'
    ].join("");
    const relay = await startClaudeRelay({
      port: 0,
      timeoutMs: 1_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", capturedEnvelopeScript, "--"] }
    });
    handles.push(relay);

    expect(relay.model).toBe("claude-opus-5");
    expect(relay.maker).toBe("Anthropic");
  });

  it("maps an OpenAI request to claude -p --output-format json with closed stdin and reports true lineage", async () => {
    const environmentKeys = [
      "HOME", "PATH", "TMPDIR", "LANG", "USER", "LOGNAME",
      "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
      "OPENAI_API_KEY", "XAI_API_KEY", "DATABASE_URL", "SSH_AUTH_SOCK", "UNRELATED_SECRET",
      "FAKE_CLAUDE_ALWAYS_FAIL", "FAKE_CLAUDE_COST_ABSENT", "FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT"
    ] as const;
    const previousEnvironment = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, {
      HOME: "/tmp/relay-home-sentinel",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      USER: "claude-keychain-user",
      LOGNAME: "claude-keychain-user",
      ANTHROPIC_API_KEY: "anthropic-test-sentinel",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-oauth-test-sentinel",
      OPENAI_API_KEY: "openai-test-sentinel",
      XAI_API_KEY: "xai-test-sentinel",
      DATABASE_URL: "postgresql://secret:test@localhost/debateai",
      SSH_AUTH_SOCK: "/tmp/private-agent.sock",
      UNRELATED_SECRET: "must-not-reach-child"
    });
    delete process.env.FAKE_CLAUDE_ALWAYS_FAIL;
    delete process.env.FAKE_CLAUDE_COST_ABSENT;
    delete process.env.FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT;
    try {
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
        environment: Readonly<Record<string, string>>;
      };
      expect(JSON.parse(relayed.prompt)).toEqual({
        format: "debateai.relay-messages.v1",
        messages: [
          { role: "system", content: "Return strict JSON." },
          { role: "user", content: "Assess this claim." }
        ]
      });
      expect(relayed.argumentList).toEqual([
        "-p", relayed.prompt,
        "--output-format", "json",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--tools", "",
        "--model", "opus"
      ]);
      expect(Object.fromEntries(Object.entries(relayed.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        ANTHROPIC_API_KEY: "anthropic-test-sentinel",
        CLAUDE_CODE_OAUTH_TOKEN: "claude-oauth-test-sentinel",
        HOME: "/tmp/relay-home-sentinel",
        LANG: "C.UTF-8",
        LOGNAME: "claude-keychain-user",
        OLDPWD: expect.stringMatching(/[/\\]relay-anthropic-[^/\\]+$/),
        PATH: "/usr/bin:/bin",
        PWD: expect.stringMatching(/[/\\]relay-anthropic-[^/\\]+$/),
        TMPDIR: "/tmp",
        USER: "claude-keychain-user"
      });
      for (const key of ["OPENAI_API_KEY", "XAI_API_KEY", "DATABASE_URL", "SSH_AUTH_SOCK", "UNRELATED_SECRET"]) {
        expect(relayed.environment[key]).toBeUndefined();
      }
    } finally {
      for (const key of environmentKeys) {
        const value = previousEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("uses the shared SIGKILL escalation when the Claude child ignores SIGTERM", async () => {
    const relay = await start(500);
    const startedAt = performance.now();
    const response = await postCompletion(relay, "IGNORE_SIGTERM_CLI");
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "CLAUDE_CLI_TIMEOUT" });
    expect(elapsedMs).toBeGreaterThanOrEqual(650);
    expect(elapsedMs).toBeLessThan(1_500);
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

describe("D10 Claude relay binary resolution", () => {
  it("keeps the compiled-in default when ACCEPTANCE_CLAUDE_BINARY is absent", () => {
    // The literal is pinned here, not read from the constant, so that moving
    // the default is a deliberate edit to this expectation (D10: unset ⇒
    // byte-identical to the behavior before the override existed).
    expect(CLAUDE_BINARY).toBe("/Users/vladmihaimiron/.local/bin/claude");
    expect(resolveClaudeBinary({})).toBe("/Users/vladmihaimiron/.local/bin/claude");
  });

  it("resolves this host's binary from ACCEPTANCE_CLAUDE_BINARY", () => {
    expect(resolveClaudeBinary({ ACCEPTANCE_CLAUDE_BINARY: "/host/bin/claude" }))
      .toBe("/host/bin/claude");
  });

  it("fails loudly with a typed code when ACCEPTANCE_CLAUDE_BINARY is present but blank", () => {
    expect(() => resolveClaudeBinary({ ACCEPTANCE_CLAUDE_BINARY: "  " }))
      .toThrow("CLAUDE_CLI_BINARY_UNRESOLVED");
  });

  it("keeps the NODE_ENV=test command seam ahead of the environment override", async () => {
    const previous = process.env.ACCEPTANCE_CLAUDE_BINARY;
    process.env.ACCEPTANCE_CLAUDE_BINARY = "/nonexistent/host/claude";
    try {
      const relay = await start();
      expect(relay.model).toBe("claude-fake-cli-model");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_CLAUDE_BINARY;
      else process.env.ACCEPTANCE_CLAUDE_BINARY = previous;
    }
  });

  // r2 regression arms (codex r1 B1). A BLANK override must not reach the
  // test-seam path at all: the override is only consulted when no
  // testOnlyCommand is supplied, so resolveTestGuardedCommand stays the sole
  // authority for selecting the seam and for rejecting it outside test.
  it("selects the test command seam when the override is blank, instead of throwing the override's code", async () => {
    const previous = process.env.ACCEPTANCE_CLAUDE_BINARY;
    process.env.ACCEPTANCE_CLAUDE_BINARY = "  ";
    try {
      const relay = await start();
      expect(relay.model).toBe("claude-fake-cli-model");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_CLAUDE_BINARY;
      else process.env.ACCEPTANCE_CLAUDE_BINARY = previous;
    }
  });

  it("still rejects the seam outside NODE_ENV=test with TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN when the override is blank", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previous = process.env.ACCEPTANCE_CLAUDE_BINARY;
    process.env.NODE_ENV = "production";
    process.env.ACCEPTANCE_CLAUDE_BINARY = "  ";
    try {
      await expect(startClaudeRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previous === undefined) delete process.env.ACCEPTANCE_CLAUDE_BINARY;
      else process.env.ACCEPTANCE_CLAUDE_BINARY = previous;
    }
  });

  it("spawns the binary named by ACCEPTANCE_CLAUDE_BINARY rather than the compiled-in default", async () => {
    const binary = await hostBinary("claude", fakeCli);
    const previous = process.env.ACCEPTANCE_CLAUDE_BINARY;
    process.env.ACCEPTANCE_CLAUDE_BINARY = binary;
    try {
      // No testOnlyCommand: this is the DEFAULT command path, the one the
      // ceremony takes. The compiled-in default is another machine's home
      // directory, so a relay that ignores the override cannot hand back a
      // model id at all.
      const relay = await startClaudeRelay({ port: 0, timeoutMs: 10_000 });
      handles.push(relay);

      expect(relay.model).toBe("claude-fake-cli-model");
      expect(relay.maker).toBe("Anthropic");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_CLAUDE_BINARY;
      else process.env.ACCEPTANCE_CLAUDE_BINARY = previous;
    }
  });
});
