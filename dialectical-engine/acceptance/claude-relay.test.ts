import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_BINARY_NAME,
  preflightClaudeCli,
  resolveClaudeBinary,
  startClaudeRelay,
  type ClaudeRelayHandle
} from "./claude-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));
const handles: ClaudeRelayHandle[] = [];
const temporaryDirectories: string[] = [];

/**
 * W6 fix round 1 / F4: a credential-shaped key's VALUE is never echoed by the
 * fixture — it emits this one-way digest instead, so an assertion can still pin
 * WHICH value the relay passed without the value itself reaching model content
 * or `ledger.raw_artifact`. The rule for which names count is stated once in
 * `test-fixtures/fake-claude-cli.mjs:44-58`.
 * Restated here rather than imported from the fixture on purpose: an assertion
 * computed with the producer's own helper would agree with a broken one
 * (TOOLING-TRAPS `:1320`).
 */
function digestOf(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * A real executable at a path this test chooses, so the environment override
 * can be observed the only honest way there is: by which binary is spawned.
 * The relay takes no argument seam for the default command, so the fixture has
 * to arrive as an executable file rather than as `node <fixture>`.
 */
async function temporaryDirectory(prefix = "relay-host-binary-"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function hostBinary(name: string, fixture: string): Promise<string> {
  const directory = await temporaryDirectory();
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

  it("asks the CLI for the caller's model alias and selects that lineage among helper-model usage", async () => {
    const capturedEnvelopeScript = [
      'console.log(JSON.stringify({',
      '  is_error: false, result: JSON.stringify({ argumentList: process.argv }), total_cost_usd: 0.01,',
      '  modelUsage: {',
      '    "claude-haiku-4-5-20251001": { inputTokens: 910, outputTokens: 17, canonicalModel: "claude-haiku-4-5" },',
      '    "claude-sonnet-5": { inputTokens: 2, outputTokens: 4, canonicalModel: "claude-sonnet-5" }',
      '  }',
      '}));'
    ].join("");
    const relay = await startClaudeRelay({
      port: 0,
      timeoutMs: 1_000,
      modelAlias: "sonnet",
      testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", capturedEnvelopeScript, "--"] }
    });
    handles.push(relay);
    expect(relay.model).toBe("claude-sonnet-5");
    const response = await postCompletion(relay, "Assess this claim.");
    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string; choices: readonly { message: { content: string } }[];
    };
    expect(completion.model).toBe("claude-sonnet-5");
    const relayed = JSON.parse(completion.choices[0]!.message.content) as { argumentList: readonly string[] };
    expect(relayed.argumentList[relayed.argumentList.indexOf("--model") + 1]).toBe("sonnet");
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
        environmentKeyNames: readonly string[];
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
        // D18: "user", not "" — "" severed the CLI's keychain login.
        // --safe-mode restores the isolation "" provided, without the auth cost.
        "--setting-sources", "user",
        "--safe-mode",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--tools", "",
        "--model", "opus"
      ]);
      expect(Object.fromEntries(Object.entries(relayed.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        // W6/F4: these two are credential-shaped, so the fixture emits a digest
        // of the sentinel rather than the sentinel. The assertion is as strong as
        // before — it still fails if the relay passes a different value or none —
        // and the F26 parity case below, which sets no sentinels, can no longer
        // write an operator's real key into the persisted content.
        ANTHROPIC_API_KEY: digestOf("anthropic-test-sentinel"),
        CLAUDE_CODE_OAUTH_TOKEN: digestOf("claude-oauth-test-sentinel"),
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
      // W6 fix round 1 / F3. The exact-set assertion above reads the fixture's
      // allow-listed PROJECTION, so on its own it can only catch a wrongly
      // admitted key the FIXTURE happens to name. The fixture also emits the
      // full key-NAME list of the child environment — names are not credentials
      // — and this assertion holds `buildCliChildEnvironment` to the exact set
      // again, for every key, whether or not the allow-list carries it.
      // `__CF_USER_TEXT_ENCODING` is injected into every macOS child regardless
      // of the env passed (measured), so it is filtered here exactly as above.
      expect(relayed.environmentKeyNames.filter((key) => key !== "__CF_USER_TEXT_ENCODING"))
        .toEqual([
          "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "HOME", "LANG", "LOGNAME",
          "OLDPWD", "PATH", "PWD", "TMPDIR", "USER"
        ]);
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
  it("carries no compiled-in path: this maker is found by the NAME `claude`", () => {
    // REPEALS the 2026-08 pin on "/Users/vladmihaimiron/.local/bin/claude".
    // Owner's rule, 2026-09-17: a host fact is DEDUCED, never set in stone.
    // What is pinned now is the name searched for and the typed code an absent
    // CLI refuses with; there is no path left to fall back to.
    expect(CLAUDE_BINARY_NAME).toBe("claude");
    expect(() => resolveClaudeBinary({}))
      .toThrow("CLAUDE_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:claude");
  });

  it("discovers `claude` on the PATH it is handed, and refuses a corrupted launcher there", async () => {
    const directory = await temporaryDirectory("relay-claude-path-");
    const program = join(directory, "claude");
    await writeFile(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(resolveClaudeBinary({ PATH: directory })).toBe(program);

    // The refusal is read off the resolver's thrown code. This file is never
    // run — that is the whole point of the check (2026-09-17 fork bomb).
    await writeFile(program, "claude\nupdate interrupted\nretry the install\n");
    expect(() => resolveClaudeBinary({ PATH: directory }))
      .toThrow(`CLAUDE_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:${program}`);
  });

  it("resolves this host's binary from ACCEPTANCE_CLAUDE_BINARY, ahead of PATH", async () => {
    const onPath = await temporaryDirectory("relay-claude-path-");
    await writeFile(join(onPath, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const chosen = await hostBinary("claude", fakeCli);

    expect(resolveClaudeBinary({ PATH: onPath, ACCEPTANCE_CLAUDE_BINARY: chosen }))
      .toBe(chosen);
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

  it("spawns the binary named by ACCEPTANCE_CLAUDE_BINARY rather than anything found on PATH", async () => {
    const binary = await hostBinary("claude", fakeCli);
    const previous = process.env.ACCEPTANCE_CLAUDE_BINARY;
    process.env.ACCEPTANCE_CLAUDE_BINARY = binary;
    try {
      // No testOnlyCommand: this is the DEFAULT command path, the one the
      // ceremony takes. A relay that ignored the key would discover this
      // machine's own `claude` on PATH and make a LIVE call, so the fake
      // model id below is the proof that the key, not PATH, decided.
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

/**
 * Replaces the prompt payload with a placeholder so two argument vectors built
 * for different prompts can be compared for SHAPE.
 */
function argumentShape(argumentList: readonly string[]): readonly string[] {
  const index = argumentList.indexOf("-p");
  return index < 0
    ? argumentList
    : [...argumentList.slice(0, index + 1), "<prompt>", ...argumentList.slice(index + 2)];
}

describe("D18 Claude relay keychain-login visibility", () => {
  it("loads the user setting source so the CLI can see its own keychain login", async () => {
    // Measured on claude 2.1.247 (logs/trel2/probe-0{2,3,4}): with
    // `--setting-sources ""` the CLI answers `Not logged in · Please run
    // /login` (is_error true, zero cost); with `user` it answers normally;
    // with `project,local` — every source EXCEPT user — it fails again. The
    // login is carried by the user source and by nothing else.
    const relay = await start();
    const response = await postCompletion(relay, "Auth visibility.");
    const completion = await response.json() as {
      choices: readonly { message: { content: string } }[];
    };
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      argumentList: readonly string[];
    };
    const index = relayed.argumentList.indexOf("--setting-sources");

    expect(index).toBeGreaterThanOrEqual(0);
    expect(relayed.argumentList[index + 1]).toBe("user");
  });

  it("keeps project and local settings out of the relayed call", async () => {
    const relay = await start();
    const response = await postCompletion(relay, "Isolation retained.");
    const completion = await response.json() as {
      choices: readonly { message: { content: string } }[];
    };
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      argumentList: readonly string[];
    };
    const sources = relayed.argumentList[relayed.argumentList.indexOf("--setting-sources") + 1] ?? "";

    expect(sources.split(",").map((source) => source.trim())).not.toContain("project");
    expect(sources.split(",").map((source) => source.trim())).not.toContain("local");
  });
});

describe("F26 ceremony preflight parity", () => {
  it("builds the preflight command from the relay's own adapter, so preflight cannot drift", async () => {
    const preflight = await preflightClaudeCli({
      timeoutMs: 10_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
    });
    const preflightEcho = JSON.parse(preflight.handshake.content) as {
      argumentList: readonly string[];
      environment: Readonly<Record<string, string>>;
      environmentKeyNames: readonly string[];
    };

    const relay = await start();
    const response = await postCompletion(relay, "Parity.");
    const completion = await response.json() as {
      choices: readonly { message: { content: string } }[];
    };
    const relayedEcho = JSON.parse(completion.choices[0]!.message.content) as {
      argumentList: readonly string[];
      environment: Readonly<Record<string, string>>;
      environmentKeyNames: readonly string[];
    };

    // The three divergences F26 names, each asserted: same binary, same
    // argument shape, same child-environment key set.
    expect(preflight.command.binary).toBe(process.execPath);
    expect(argumentShape(preflightEcho.argumentList)).toEqual(argumentShape(relayedEcho.argumentList));
    expect(Object.keys(preflightEcho.environment).sort())
      .toEqual(Object.keys(relayedEcho.environment).sort());
  });

  it("reports the CLI-reported model from the preflight handshake, never a guessed literal", async () => {
    const preflight = await preflightClaudeCli({
      timeoutMs: 10_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
    });

    expect(preflight.handshake.model).toBe("claude-fake-cli-model");
  });
});

describe("D18 r2 — CLI customizations excluded from relayed calls", () => {
  it("passes --safe-mode so user memory, hooks and plugins cannot enter a relayed call", async () => {
    // Measured on claude 2.1.247 (logs/trel2/probe-05, probe-06), identical
    // prompt, only --safe-mode differing:
    //   --setting-sources user              -> model answers YES (user CLAUDE.md in context), 5423 ctx tokens
    //   --setting-sources user --safe-mode  -> model answers NO,                              2717 ctx tokens
    // Both authenticate (is_error false, exactly one reported model), so the
    // isolation is free of any auth cost.
    const relay = await start();
    const response = await postCompletion(relay, "Customizations disabled.");
    const completion = await response.json() as {
      choices: readonly { message: { content: string } }[];
    };
    const relayed = JSON.parse(completion.choices[0]!.message.content) as {
      argumentList: readonly string[];
    };

    expect(relayed.argumentList).toContain("--safe-mode");
  });
});
