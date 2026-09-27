import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_MESSAGE_MAX_UTF8_BYTES, renderPromptTranscript } from "./relay-core.js";
import {
  ACCEPTANCE_PI_BINARY,
  PI_BINARY_NAME,
  PI_GLM_CONTEXT_WINDOW_TOKENS,
  PI_RELAY_SYSTEM_PROMPT,
  ZAI_MAKER,
  keepPiStdoutLine,
  parsePiEvents,
  piArguments,
  resolvePiBinary,
  startPiRelay,
  type PiRelayHandle,
  type PiRelayOptions
} from "./pi-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-pi-cli.mjs", import.meta.url));
const handles: PiRelayHandle[] = [];
const temporaryDirectories: string[] = [];

interface PiCompletion {
  readonly model: string;
  readonly maker: string;
  readonly x_thinking_level: string;
  readonly usage: unknown;
  readonly choices: readonly { readonly message: { readonly content: string } }[];
}

interface PiEcho {
  readonly prompt: string;
  readonly promptFile: string;
  readonly promptFileMode: string;
  readonly cwdEntries: readonly string[];
  readonly argumentList: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly environmentKeyNames: readonly string[];
}

const echoOf = (completion: PiCompletion): PiEcho =>
  JSON.parse(completion.choices[0]!.message.content) as PiEcho;

/** W6/F4: restated rather than imported, so a broken producer helper cannot be agreed with. */
function digestOf(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function temporaryDirectory(prefix = "relay-pi-binary-"): Promise<string> {
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

async function start(options: Partial<PiRelayOptions> = {}, timeoutMs = 2_000): Promise<PiRelayHandle> {
  const handle = await startPiRelay({
    port: 0,
    timeoutMs,
    testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] },
    ...options
  });
  handles.push(handle);
  return handle;
}

async function post(
  handle: PiRelayHandle,
  content: string,
  extra: Readonly<Record<string, unknown>> = {}
): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: handle.authorizationHeader },
    body: JSON.stringify({
      model: "ignored-by-relay",
      messages: [
        { role: "system", content: "Return strict JSON." },
        { role: "user", content }
      ],
      ...extra
    })
  });
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("PI-01 Z.AI GLM relay through pi (model scorecard §2.10)", () => {
  it("handshakes before serving and reports the Z.AI maker, the pinned model and the 1M window", async () => {
    const relay = await start();

    expect(relay.maker).toBe(ZAI_MAKER);
    expect(relay.maker).toBe("Z.AI");
    expect(relay.model).toBe("glm-5.3-flash");
    expect(relay.thinkingLevels).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
    // pi's catalog (M5): glm-5.3-flash has a 1M-token context window, 131.1K max output.
    expect(relay.contextWindowTokens).toBe(1_000_000);
    expect(PI_GLM_CONTEXT_WINDOW_TOKENS).toBe(1_000_000);
  });

  it("passes the transcript through a 0600 @file that is gone after the call, never on argv", async () => {
    const relay = await start();

    const response = await post(relay, "Assess this claim.");

    expect(response.status).toBe(200);
    const completion = await response.json() as PiCompletion;
    expect(completion).toMatchObject({ model: "glm-5.3-flash", maker: "Z.AI", x_thinking_level: "DEFAULT_ONLY" });
    const echo = echoOf(completion);
    expect(echo.prompt).toBe(renderPromptTranscript([
      { role: "system", content: "Return strict JSON." },
      { role: "user", content: "Assess this claim." }
    ]));
    expect(echo.promptFileMode).toBe("600");
    expect(echo.cwdEntries).toEqual([]);
    // Unasked: pi still runs at the relay's explicit default, "high".
    expect(echo.argumentList).toEqual(piArguments("glm-5.3-flash", "high", echo.promptFile));
    expect(echo.argumentList.some((argument) => argument.includes("Assess this claim."))).toBe(false);
    expect(existsSync(echo.promptFile)).toBe(false);
    expect(existsSync(dirname(echo.promptFile))).toBe(false);
  });

  it("replaces pi's coding-assistant prompt with fixed engine text and keeps every tool off", async () => {
    const relay = await start();

    const echo = echoOf(await (await post(relay, "Assess this claim.")).json() as PiCompletion);

    expect(echo.argumentList[echo.argumentList.indexOf("--system-prompt") + 1]).toBe(PI_RELAY_SYSTEM_PROMPT);
    expect(PI_RELAY_SYSTEM_PROMPT).not.toMatch(/coding/iu);
    expect(echo.argumentList).toEqual(expect.arrayContaining([
      "--no-tools", "--no-session", "--no-extensions", "--no-skills", "--no-context-files"
    ]));
  });

  it("maps the measured assistant usage: input, output, total, reasoning and cost", async () => {
    const relay = await start();

    const completion = await (await post(relay, "Assess this claim.")).json() as PiCompletion;

    expect(completion.usage).toEqual({
      prompt_tokens: 480,
      completion_tokens: 3,
      total_tokens: 483,
      x_cost_usd: 0.0006852,
      completion_tokens_details: { reasoning_tokens: 0 }
    });
  });

  it("runs an asked --thinking level and echoes it; refuses one pi has no value for", async () => {
    const relay = await start();

    for (const level of ["low", "off", "max"]) {
      const completion = await (await post(relay, "Assess this claim.", { x_thinking_level: level }))
        .json() as PiCompletion;
      expect(completion.x_thinking_level).toBe(level);
      const echo = echoOf(completion);
      expect(echo.argumentList).toEqual(piArguments("glm-5.3-flash", level, echo.promptFile));
    }
    const refused = await post(relay, "Assess this claim.", { x_thinking_level: "ultra" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED",
      x_cli_relay_error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED"
    });
  });

  it("refuses with 413 a prompt that the 1M window cannot hold together with the output bound", async () => {
    const relay = await start();
    // 30 messages of up to 64 KiB ≈ 983 500 tokens at 2 bytes per token: they
    // fit alone, and do not fit once pi's 131 072-token output ceiling is added.
    // The last message carries the fake's handshake marker, so the ADMITTED call
    // answers a short "OK" instead of echoing two megabytes in its answer.
    // A11 fix round 1: pi still repeats the whole prompt in its own events (the
    // user message_start and message_end, and agent_end) — about 6 MB of stdout,
    // six times the relay's 1 MiB bound. The ADMITTED call answers 200 only
    // because the relay keeps nothing but the assistant message_end.
    const chunk = "a".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES);
    const messages = [
      ...Array.from({ length: 29 }, () => ({ role: "user", content: chunk })),
      { role: "user", content: `${"a".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES - 64)} acceptance transport handshake` }
    ];
    const send = (extra: Readonly<Record<string, unknown>>): Promise<Response> =>
      fetch(`${relay.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: relay.authorizationHeader },
        body: JSON.stringify({ model: "ignored-by-relay", messages, ...extra })
      });

    const fits = await send({});
    expect(fits.status).toBe(200);

    const over = await send({ max_tokens: 131_072 });
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({
      error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED",
      x_cli_relay_error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED"
    });
  });

  it("relays pi's length stop as a truncation: 200, finish_reason \"length\", the partial text (F37)", async () => {
    const relay = await start();

    const response = await post(relay, "LENGTH_STOP_CLI");
    expect(response.status).toBe(200);
    const body = await response.json() as {
      readonly choices: readonly { readonly message: { readonly content: string }; readonly finish_reason: string }[];
    };
    expect(body.choices[0]?.finish_reason).toBe("length");
    expect(body.choices[0]?.message.content).toBe("a partial answer");
  });

  it("answers a long answer that pi streams as ~8 MiB of growing partial messages (A11 fix round 1)", async () => {
    const relay = await start();

    const response = await post(relay, "LONG_ANSWER_CLI");

    expect(response.status).toBe(200);
    const completion = await response.json() as PiCompletion;
    expect(completion.choices[0]?.message.content).toBe("0123456789abcdef".repeat(8_192));
  });

  it("still bounds the one line it keeps: an assistant answer past 1 MiB is CLI_RELAY_STDOUT_LIMIT", async () => {
    const relay = await start();

    const response = await post(relay, "OVERSIZED_ANSWER_CLI");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "CLI_RELAY_STDOUT_LIMIT" });
  });

  it("refuses an answer from another model, a non-stop ending, unparseable output and a CLI failure", async () => {
    const relay = await start();

    for (const [marker, code] of [
      ["WRONG_MODEL_CLI", "PI_CLI_MODEL_MISMATCH"],
      // A11 fix round 1: the pinned model id from another provider is another lineage.
      ["WRONG_PROVIDER_CLI", "PI_CLI_MODEL_MISMATCH"],
      ["STOP_ERROR_CLI", "PI_CLI_STOP_REASON_REFUSED"],
      ["NON_JSON_CLI", "PI_CLI_OUTPUT_INVALID"],
      ["FAIL_CLI", "PI_CLI_FAILED"]
    ] as const) {
      const response = await post(relay, marker);
      expect(response.status, marker).toBe(502);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toEqual({ error: code });
      expect(body).not.toHaveProperty("choices");
    }
  });

  it("admits pi's locators and PI_TELEMETRY=0, never ZAI_API_KEY (pi reads its own stored key), and nothing else", async () => {
    const environmentKeys = [
      "HOME", "PATH", "TMPDIR", "LANG", "USER", "LOGNAME", "ZAI_API_KEY", "PI_CODING_AGENT_DIR",
      "GLM_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "UNRELATED_SECRET",
      "FAKE_PI_ALWAYS_FAIL", "FAKE_PI_WRONG_MODEL", "FAKE_PI_IGNORE_PROMPT_FILE"
    ] as const;
    const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      HOME: "/tmp/relay-home-sentinel",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      USER: "pi-login-user",
      LOGNAME: "pi-login-user",
      ZAI_API_KEY: "zai-test-sentinel",
      GLM_API_KEY: "glm-test-sentinel",
      OPENAI_API_KEY: "openai-test-sentinel",
      DATABASE_URL: "postgresql://secret:test@localhost/debateai",
      UNRELATED_SECRET: "must-not-reach-child"
    });
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.FAKE_PI_ALWAYS_FAIL;
    delete process.env.FAKE_PI_WRONG_MODEL;
    delete process.env.FAKE_PI_IGNORE_PROMPT_FILE;
    try {
      const relay = await start();
      const echo = echoOf(await (await post(relay, "Assess this claim.")).json() as PiCompletion);

      expect(Object.fromEntries(Object.entries(echo.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        HOME: "/tmp/relay-home-sentinel",
        LANG: "C.UTF-8",
        LOGNAME: "pi-login-user",
        OLDPWD: expect.stringMatching(/[/\\]relay-z-ai-[^/\\]+$/u),
        PATH: "/usr/bin:/bin",
        PI_TELEMETRY: "0",
        PWD: expect.stringMatching(/[/\\]relay-z-ai-[^/\\]+$/u),
        TMPDIR: "/tmp",
        USER: "pi-login-user"
      });
      for (const key of ["GLM_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "UNRELATED_SECRET", "ZAI_API_KEY"]) {
        expect(echo.environment[key]).toBeUndefined();
      }
      expect(echo.environmentKeyNames.filter((key) => key !== "__CF_USER_TEXT_ENCODING")).toEqual([
        "HOME", "LANG", "LOGNAME", "OLDPWD", "PATH", "PI_TELEMETRY", "PWD", "TMPDIR", "USER"
      ]);
    } finally {
      for (const key of environmentKeys) {
        const value = previousEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("passes a moved agent directory through: PI_CODING_AGENT_DIR reaches pi when the relay has it", async () => {
    const environmentKeys = ["PI_CODING_AGENT_DIR", "FAKE_PI_IGNORE_PROMPT_FILE"] as const;
    const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    process.env.PI_CODING_AGENT_DIR = "/tmp/relay-pi-agent-dir-sentinel";
    delete process.env.FAKE_PI_IGNORE_PROMPT_FILE;
    try {
      const relay = await start();
      const echo = echoOf(await (await post(relay, "Assess this claim.")).json() as PiCompletion);

      expect(echo.environment.PI_CODING_AGENT_DIR).toBe("/tmp/relay-pi-agent-dir-sentinel");
      expect(echo.environmentKeyNames).toContain("PI_CODING_AGENT_DIR");
    } finally {
      for (const key of environmentKeys) {
        const value = previousEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("uses the shared SIGKILL escalation when the pi child ignores SIGTERM", async () => {
    const relay = await start({}, 500);
    const startedAt = performance.now();

    const response = await post(relay, "IGNORE_SIGTERM_CLI");
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "PI_CLI_TIMEOUT" });
    expect(elapsedMs).toBeGreaterThanOrEqual(650);
    expect(elapsedMs).toBeLessThan(1_500);
  });

  it("refuses to start on a dead CLI, another model at handshake, or an invalid pin or default", async () => {
    process.env.FAKE_PI_ALWAYS_FAIL = "1";
    try {
      await expect(start()).rejects.toThrow("PI_CLI_FAILED");
    } finally {
      delete process.env.FAKE_PI_ALWAYS_FAIL;
    }
    process.env.FAKE_PI_WRONG_MODEL = "1";
    try {
      await expect(start()).rejects.toThrow("PI_CLI_MODEL_MISMATCH");
    } finally {
      delete process.env.FAKE_PI_WRONG_MODEL;
    }
    await expect(start({ model: "zai/glm-5.3-flash" })).rejects.toThrow("PI_CLI_MODEL_PIN_INVALID");
    await expect(start({ defaultThinkingLevel: "ultra" })).rejects.toThrow("PI_CLI_THINKING_LEVEL_INVALID");
  });

  it("refuses to start when the handshake reply is not ok — a pi that ignored the @file and answered generically", async () => {
    process.env.FAKE_PI_IGNORE_PROMPT_FILE = "1";
    try {
      await expect(start()).rejects.toThrow("PI_CLI_HANDSHAKE_MISMATCH");
    } finally {
      delete process.env.FAKE_PI_IGNORE_PROMPT_FILE;
    }
  });

  it("keeps the process-double seam test-only", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(startPiRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_PI_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("keeps the Support relay's credential custody out of this module", async () => {
    const source = await readFile(new URL("./pi-relay.ts", import.meta.url), "utf8");

    expect(source).not.toContain("hermes-relay");
    expect(source).not.toContain("auth.json");
  });
});

describe("PI-01 the measured pi 0.87.1 event stream", () => {
  const assistantMessage = Object.freeze({
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    api: "openai-completions",
    provider: "zai",
    model: "glm-5.3-flash",
    usage: {
      input: 480, output: 3, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 483,
      cost: { input: 0.000672, output: 0.0000132, cacheRead: 0, cacheWrite: 0, total: 0.0006852 }
    },
    stopReason: "stop",
    timestamp: 0,
    responseId: "redacted",
    rawStopReason: "stop"
  });
  const streamOf = (message: Readonly<Record<string, unknown>>): string => [
    { type: "session", version: 3, id: "redacted", timestamp: "2026-09-26T00:00:00.000Z", cwd: "redacted" },
    { type: "agent_start" },
    { type: "turn_start" },
    { type: "message_start", message: { role: "system", content: "", sections: { preamble: "redacted" } } },
    { type: "message_end", message: { role: "system", content: "", sections: { preamble: "redacted" } } },
    { type: "message_start", message: { role: "user", content: [{ type: "text", text: "redacted" }], timestamp: 0 } },
    { type: "message_end", message: { role: "user", content: [{ type: "text", text: "redacted" }], timestamp: 0 } },
    { type: "message_start", message: { ...message, stopReason: "pending" } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "ok" } },
    { type: "message_end", message },
    { type: "turn_end", message, toolResults: [] },
    { type: "agent_end", messages: [message] },
    { type: "agent_settled" }
  ].map((event) => JSON.stringify(event)).join("\n");

  it("takes the answer, lineage and usage from the assistant message_end", () => {
    expect(parsePiEvents(streamOf(assistantMessage), "glm-5.3-flash")).toEqual({
      content: "ok",
      model: "glm-5.3-flash",
      usage: { promptTokens: 480, completionTokens: 3, totalTokens: 483, costUsd: 0.0006852, reasoningTokens: 0 }
    });
  });

  it("reads text parts only, so a thinking part never becomes the answer", () => {
    const withThinking = { ...assistantMessage, content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "ok" }] };

    expect(parsePiEvents(streamOf(withThinking), "glm-5.3-flash").content).toBe("ok");
  });

  it("holds every answer to the pinned model", () => {
    // pi's own default model answers as glm-5.3 (M4): never the pinned glm-5.3-flash.
    expect(() => parsePiEvents(streamOf(assistantMessage), "glm-5.3")).toThrow("PI_CLI_MODEL_MISMATCH");
  });

  it("holds every answer to the zai provider too: the pinned model id from another provider is refused", () => {
    expect(() => parsePiEvents(streamOf({ ...assistantMessage, provider: "openrouter" }), "glm-5.3-flash"))
      .toThrow("PI_CLI_MODEL_MISMATCH");
  });
});

/** Every stdout line the relay's filter would keep, decided from the line's start as relay-core does. */
function keptLines(stream: string): string {
  return stream.split("\n").filter((line) => keepPiStdoutLine(line.slice(0, 4_096))).join("\n");
}

describe("PI-01 A11 fix round 1: the relay keeps only the line its parser reads", () => {
  const prompt = renderPromptTranscript([{ role: "user", content: "Prompt canary 5e2d." }]);
  const answer = Object.freeze({
    role: "assistant",
    content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "ok" }],
    api: "openai-completions",
    provider: "zai",
    model: "glm-5.3-flash",
    usage: { input: 480, output: 3, reasoning: 0, totalTokens: 483, cost: { total: 0.0006852 } },
    stopReason: "stop",
    rawStopReason: "stop"
  });
  const system = { role: "system", content: "", sections: { preamble: "redacted" } };
  const user = { role: "user", content: [{ type: "text", text: prompt }], timestamp: 0 };
  // The superset of both shapes: the measured delta-only message_update beside the
  // partial-message one, and agent_end with the whole message list, user prompt included.
  const superset = [
    { type: "session", version: 3, id: "redacted", timestamp: "2026-09-26T00:00:00.000Z", cwd: "redacted" },
    { type: "agent_start" },
    { type: "turn_start" },
    { type: "message_start", message: system },
    { type: "message_end", message: system },
    { type: "message_start", message: user },
    { type: "message_end", message: user },
    { type: "message_start", message: { ...answer, content: [], stopReason: "pending" } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "o" } },
    {
      type: "message_update",
      message: { ...answer, content: [{ type: "text", text: "ok" }], stopReason: "pending" },
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "k" }
    },
    { type: "message_end", message: answer },
    { type: "turn_end", message: answer, toolResults: [] },
    { type: "agent_end", messages: [system, user, answer] },
    { type: "agent_settled" }
  ].map((event) => JSON.stringify(event)).join("\n");

  it("parses the superset stream to the same answer whole and filtered, and the filter drops every copy of the prompt", () => {
    const expected = {
      content: "ok",
      model: "glm-5.3-flash",
      usage: { promptTokens: 480, completionTokens: 3, totalTokens: 483, costUsd: 0.0006852, reasoningTokens: 0 }
    };

    expect(superset.split("\n").filter((line) => line.includes("Prompt canary 5e2d."))).toHaveLength(3);
    expect(parsePiEvents(superset, "glm-5.3-flash")).toEqual(expected);
    const kept = keptLines(superset);
    expect(kept).toBe(JSON.stringify({ type: "message_end", message: answer }));
    expect(kept).not.toContain("Prompt canary 5e2d.");
    expect(parsePiEvents(kept, "glm-5.3-flash")).toEqual(expected);
  });

  it("keeps what it cannot classify, so the parser still refuses what it cannot read", () => {
    expect(keepPiStdoutLine("not json")).toBe(true);
    expect(keepPiStdoutLine("")).toBe(true);
    expect(keepPiStdoutLine('{"error":"redacted"}')).toBe(true);
    // A message_end whose role is not its message's first member (not the measured
    // shape) is kept: at worst the stdout bound refuses it loudly.
    expect(keepPiStdoutLine('{"type":"message_end","message":{"content":[],"role":"user"}}')).toBe(true);
    expect(keepPiStdoutLine('{"message":{"role":"user"},"type":"message_end"}')).toBe(true);
    expect(keepPiStdoutLine('{"type":"message_end","message":{"role":"assistant","content":[]}}')).toBe(true);
  });

  it("drops every event type the parser never reads, and the user and system message_end", () => {
    for (const type of [
      "session", "agent_start", "turn_start", "message_start", "message_update", "turn_end", "agent_end",
      "agent_settled", "error"
    ]) {
      expect(keepPiStdoutLine(`{"type":"${type}","message":{"role":"assistant"}}`), type).toBe(false);
    }
    for (const role of ["user", "system", "toolResult"]) {
      expect(keepPiStdoutLine(`{"type":"message_end","message":{"role":"${role}","content":[]}}`), role).toBe(false);
    }
  });
});

describe("D10 pi relay binary resolution", () => {
  it("carries no compiled-in path: this maker is found by the NAME `pi`", () => {
    expect(PI_BINARY_NAME).toBe("pi");
    expect(ACCEPTANCE_PI_BINARY).toBe("ACCEPTANCE_PI_BINARY");
    expect(() => resolvePiBinary({})).toThrow("PI_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:pi");
  });

  it("discovers `pi` on the PATH it is handed, and refuses a corrupted launcher there", async () => {
    const directory = await temporaryDirectory("relay-pi-path-");
    const program = join(directory, "pi");
    await writeFile(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(resolvePiBinary({ PATH: directory })).toBe(program);

    await writeFile(program, "pi\nupdate interrupted\nretry the install\n");
    expect(() => resolvePiBinary({ PATH: directory }))
      .toThrow(`PI_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:${program}`);
  });

  it("fails loudly with a typed code when ACCEPTANCE_PI_BINARY is present but blank", () => {
    expect(() => resolvePiBinary({ ACCEPTANCE_PI_BINARY: "  " })).toThrow("PI_CLI_BINARY_UNRESOLVED");
  });

  it("spawns the binary named by ACCEPTANCE_PI_BINARY rather than anything found on PATH", async () => {
    const binary = await hostBinary("pi", fakeCli);
    const previous = process.env.ACCEPTANCE_PI_BINARY;
    process.env.ACCEPTANCE_PI_BINARY = binary;
    try {
      // No testOnlyCommand: the DEFAULT command path. Answering through the
      // fake is the proof the key, not this machine's PATH, decided.
      const relay = await startPiRelay({ port: 0, timeoutMs: 10_000 });
      handles.push(relay);

      expect(relay.maker).toBe("Z.AI");
      expect(relay.model).toBe("glm-5.3-flash");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_PI_BINARY;
      else process.env.ACCEPTANCE_PI_BINARY = previous;
    }
  });
});
