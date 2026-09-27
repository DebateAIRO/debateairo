import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { renderPromptTranscript } from "./relay-core.js";
import {
  ACCEPTANCE_AGY_BINARY,
  AGY_BINARY_NAME,
  AGY_STDIN_FORMAT,
  agyArguments,
  agyStdinPayload,
  parseAgyOutput,
  resolveAgyBinary,
  startAgyRelay,
  type AgyRelayHandle,
  type AgyRelayOptions
} from "./agy-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-agy-cli.mjs", import.meta.url));
const handles: AgyRelayHandle[] = [];
const temporaryDirectories: string[] = [];

/** The measured agy-ok capture (M4, 2026-09-26), conversation id replaced. */
const MEASURED_OK = Object.freeze({
  conversation_id: "00000000-0000-0000-0000-000000000000",
  status: "SUCCESS",
  response: "ok\n",
  duration_seconds: 3.865148,
  num_turns: 1,
  usage: { input_tokens: 13977, output_tokens: 437, thinking_tokens: 436, cache_read_tokens: 0, total_tokens: 14414 }
});
/** The measured agy-tools capture: SUCCESS, an empty response, a denied tool. */
const MEASURED_TOOLS = Object.freeze({
  conversation_id: "00000000-0000-0000-0000-000000000000",
  status: "SUCCESS",
  response: "",
  duration_seconds: 3.459518,
  num_turns: 1,
  usage: { input_tokens: 13999, output_tokens: 781, thinking_tokens: 662, cache_read_tokens: 0, total_tokens: 14780 },
  denied_actions: [{ action: "command", display_name: "RunCommand" }]
});

interface AgyCompletion {
  readonly model: string;
  readonly maker: string;
  readonly x_thinking_level: string;
  readonly usage: unknown;
  readonly choices: readonly { readonly message: { readonly content: string } }[];
}

interface AgyEcho {
  readonly prompt: string;
  readonly stdinText: string;
  readonly argumentList: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly environmentKeyNames: readonly string[];
}

const echoOf = (completion: AgyCompletion): AgyEcho =>
  JSON.parse(completion.choices[0]!.message.content) as AgyEcho;

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function temporaryDirectory(prefix = "relay-agy-binary-"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

/** A real executable at a path this test chooses (see claude-relay.test.ts). */
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

async function start(
  options: Partial<AgyRelayOptions> = {},
  timeoutMs = 2_000
): Promise<AgyRelayHandle> {
  const handle = await startAgyRelay({
    port: 0,
    timeoutMs,
    testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] },
    ...options
  });
  handles.push(handle);
  return handle;
}

async function post(handle: AgyRelayHandle, content: string, level?: string): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: handle.authorizationHeader },
    body: JSON.stringify({
      model: "ignored-by-relay",
      messages: [
        { role: "system", content: "Return strict JSON." },
        { role: "user", content }
      ],
      ...(level === undefined ? {} : { x_thinking_level: level })
    })
  });
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("AGY-01 Google agy relay (model scorecard §2.10)", () => {
  it("handshakes before serving and reports the Google maker with the PINNED base id as lineage", async () => {
    const relay = await start();

    expect(relay.maker).toBe("Google");
    expect(relay.model).toBe("gemini-3.8-flash");
    expect(relay.thinkingLevels).toEqual(["low", "medium", "high"]);
  });

  it("sends the transcript on stdin only, pins the model with the level suffix, and grants no tools", async () => {
    const relay = await start();

    const response = await post(relay, "Assess this claim.");

    expect(response.status).toBe(200);
    const completion = await response.json() as AgyCompletion;
    expect(completion).toMatchObject({ model: "gemini-3.8-flash", maker: "Google", x_thinking_level: "DEFAULT_ONLY" });
    const echo = echoOf(completion);
    const transcript = renderPromptTranscript([
      { role: "system", content: "Return strict JSON." },
      { role: "user", content: "Assess this claim." }
    ]);
    expect(echo.prompt).toBe(transcript);
    expect(echo.stdinText).toBe(agyStdinPayload(transcript, AGY_STDIN_FORMAT));
    // Unasked: the relay's explicit default level, "high", is the id suffix.
    expect(echo.argumentList).toEqual(agyArguments("gemini-3.8-flash-high", AGY_STDIN_FORMAT));
    expect(echo.argumentList).toEqual(expect.arrayContaining(["--mode", "plan", "--sandbox"]));
    expect(echo.argumentList.some((argument) => argument.includes("Assess this claim."))).toBe(false);
    expect(echo.argumentList.some((argument) => argument.includes("dangerously"))).toBe(false);
  });

  it("maps the measured usage block: input, output, total and thinking tokens", async () => {
    const relay = await start();

    const completion = await (await post(relay, "Assess this claim.")).json() as AgyCompletion;

    expect(completion.usage).toEqual({
      prompt_tokens: 13977,
      completion_tokens: 437,
      total_tokens: 14414,
      completion_tokens_details: { reasoning_tokens: 436 }
    });
  });

  it("runs an asked level as the id suffix and echoes it; refuses a level agy has no id for", async () => {
    const relay = await start();

    const low = await (await post(relay, "Assess this claim.", "low")).json() as AgyCompletion;
    expect(low.x_thinking_level).toBe("low");
    expect(echoOf(low).argumentList).toEqual(agyArguments("gemini-3.8-flash-low", AGY_STDIN_FORMAT));

    const max = await post(relay, "Assess this claim.", "max");
    expect(max.status).toBe(400);
    expect(await max.json()).toEqual({
      error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED",
      x_cli_relay_error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED"
    });
  });

  it("serves only the levels it was started with, defaulting to the first when high is not among them", async () => {
    const relay = await start({ model: "gemini-3.1-pro", thinkingLevels: ["low"] });
    expect(relay.thinkingLevels).toEqual(["low"]);

    const completion = await (await post(relay, "Assess this claim.")).json() as AgyCompletion;

    expect(echoOf(completion).argumentList).toEqual(agyArguments("gemini-3.1-pro-low", AGY_STDIN_FORMAT));
    expect((await post(relay, "Assess this claim.", "high")).status).toBe(400);
  });

  it("treats a tool attempt as a FAILED call even though agy said SUCCESS", async () => {
    const relay = await start();

    const response = await post(relay, "TOOLS_CLI create a file");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AGY_CLI_TOOL_DENIED" });
  });

  it("refuses a non-SUCCESS status, unparseable output and a CLI failure without fabricating choices", async () => {
    const relay = await start();

    for (const [marker, code] of [
      ["STATUS_ERROR_CLI", "AGY_CLI_FAILED"],
      ["NON_JSON_CLI", "AGY_CLI_OUTPUT_INVALID"],
      ["FAIL_CLI", "AGY_CLI_FAILED"]
    ] as const) {
      const response = await post(relay, marker);
      expect(response.status, marker).toBe(502);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toEqual({ error: code });
      expect(body).not.toHaveProperty("choices");
    }
  });

  it("admits only non-secret login locators — never an API key that could bill the owner", async () => {
    const environmentKeys = [
      "HOME", "PATH", "TMPDIR", "LANG", "USER", "LOGNAME",
      "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "UNRELATED_SECRET",
      "FAKE_AGY_ALWAYS_FAIL"
    ] as const;
    const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      HOME: "/tmp/relay-home-sentinel",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      USER: "agy-login-user",
      LOGNAME: "agy-login-user",
      GEMINI_API_KEY: "gemini-test-sentinel",
      GOOGLE_API_KEY: "google-test-sentinel",
      OPENAI_API_KEY: "openai-test-sentinel",
      DATABASE_URL: "postgresql://secret:test@localhost/debateai",
      UNRELATED_SECRET: "must-not-reach-child"
    });
    delete process.env.FAKE_AGY_ALWAYS_FAIL;
    try {
      const relay = await start();
      const echo = echoOf(await (await post(relay, "Assess this claim.")).json() as AgyCompletion);

      expect(Object.fromEntries(Object.entries(echo.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        HOME: "/tmp/relay-home-sentinel",
        LANG: "C.UTF-8",
        LOGNAME: "agy-login-user",
        OLDPWD: expect.stringMatching(/[/\\]relay-google-[^/\\]+$/u),
        PATH: "/usr/bin:/bin",
        PWD: expect.stringMatching(/[/\\]relay-google-[^/\\]+$/u),
        TMPDIR: "/tmp",
        USER: "agy-login-user"
      });
      for (const key of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "UNRELATED_SECRET"]) {
        expect(echo.environment[key]).toBeUndefined();
      }
      // W6/F3: the key NAMES hold buildCliChildEnvironment to the exact set.
      expect(echo.environmentKeyNames.filter((key) => key !== "__CF_USER_TEXT_ENCODING"))
        .toEqual(["HOME", "LANG", "LOGNAME", "OLDPWD", "PATH", "PWD", "TMPDIR", "USER"]);
    } finally {
      for (const key of environmentKeys) {
        const value = previousEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("uses the shared SIGKILL escalation when the agy child ignores SIGTERM", async () => {
    const relay = await start({}, 500);
    const startedAt = performance.now();

    const response = await post(relay, "IGNORE_SIGTERM_CLI");
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "AGY_CLI_TIMEOUT" });
    expect(elapsedMs).toBeGreaterThanOrEqual(650);
    expect(elapsedMs).toBeLessThan(1_500);
  });

  it("refuses to start on a dead CLI, a model pin that already carries a level, or levels agy has no id for", async () => {
    process.env.FAKE_AGY_ALWAYS_FAIL = "1";
    try {
      await expect(start()).rejects.toThrow("AGY_CLI_FAILED");
    } finally {
      delete process.env.FAKE_AGY_ALWAYS_FAIL;
    }
    await expect(start({ model: "gemini-3.8-flash-low" })).rejects.toThrow("AGY_CLI_MODEL_PIN_INVALID");
    await expect(start({ model: "gemini 3.8" })).rejects.toThrow("AGY_CLI_MODEL_PIN_INVALID");
    await expect(start({ thinkingLevels: ["max"] })).rejects.toThrow("AGY_CLI_THINKING_LEVELS_INVALID");
    await expect(start({ thinkingLevels: [] })).rejects.toThrow("AGY_CLI_THINKING_LEVELS_INVALID");
    await expect(start({ thinkingLevels: ["low"], defaultThinkingLevel: "medium" }))
      .rejects.toThrow("AGY_CLI_THINKING_LEVELS_INVALID");
  });

  it("keeps the process-double seam test-only", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(startAgyRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_AGY_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("names no permission-skipping flag anywhere in its source", async () => {
    const source = await readFile(new URL("./agy-relay.ts", import.meta.url), "utf8");

    expect(source).not.toContain("dangerously");
  });
});

describe("AGY-01 the two stdin forms (Task A10 Step 0 decides which one ships)", () => {
  it("text: the plain transcript in, --output-format json, the prompt never on argv", () => {
    expect(agyArguments("gemini-3.8-flash-high", "text")).toEqual([
      "--output-format", "json",
      "--mode", "plan",
      "--sandbox",
      "--model", "gemini-3.8-flash-high",
      "--print"
    ]);
    expect(agyStdinPayload("PROMPT", "text")).toBe("PROMPT");
  });

  it("stream-json: one NDJSON user message in, stream-json both ways", () => {
    expect(agyArguments("gemini-3.8-flash-high", "stream-json")).toEqual([
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--mode", "plan",
      "--sandbox",
      "--model", "gemini-3.8-flash-high",
      "--print"
    ]);
    expect(agyStdinPayload("PROMPT", "stream-json")).toBe(`${JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "PROMPT" }] }
    })}\n`);
  });

  it("parses the measured agy-ok object as text and as the last result line of stream-json", () => {
    const expected = {
      content: "ok",
      model: "gemini-3.8-flash",
      usage: { promptTokens: 13977, completionTokens: 437, totalTokens: 14414, reasoningTokens: 436 }
    };

    expect(parseAgyOutput(JSON.stringify(MEASURED_OK), "gemini-3.8-flash", "text")).toEqual(expected);
    expect(parseAgyOutput(
      `${JSON.stringify({ type: "init" })}\n${JSON.stringify(MEASURED_OK)}\n`,
      "gemini-3.8-flash",
      "stream-json"
    )).toEqual(expected);
  });

  it("refuses the measured agy-tools object in either form", () => {
    expect(() => parseAgyOutput(JSON.stringify(MEASURED_TOOLS), "gemini-3.8-flash", "text"))
      .toThrow("AGY_CLI_TOOL_DENIED");
    expect(() => parseAgyOutput(`${JSON.stringify(MEASURED_TOOLS)}\n`, "gemini-3.8-flash", "stream-json"))
      .toThrow("AGY_CLI_TOOL_DENIED");
  });
});

describe("D10 agy relay binary resolution", () => {
  it("carries no compiled-in path: this maker is found by the NAME `agy`", () => {
    expect(AGY_BINARY_NAME).toBe("agy");
    expect(ACCEPTANCE_AGY_BINARY).toBe("ACCEPTANCE_AGY_BINARY");
    expect(() => resolveAgyBinary({})).toThrow("AGY_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:agy");
  });

  it("discovers `agy` on the PATH it is handed, and refuses a corrupted launcher there", async () => {
    const directory = await temporaryDirectory("relay-agy-path-");
    const program = join(directory, "agy");
    await writeFile(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(resolveAgyBinary({ PATH: directory })).toBe(program);

    await writeFile(program, "agy\nupdate interrupted\nretry the install\n");
    expect(() => resolveAgyBinary({ PATH: directory }))
      .toThrow(`AGY_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:${program}`);
  });

  it("fails loudly with a typed code when ACCEPTANCE_AGY_BINARY is present but blank", () => {
    expect(() => resolveAgyBinary({ ACCEPTANCE_AGY_BINARY: "  " })).toThrow("AGY_CLI_BINARY_UNRESOLVED");
  });

  it("spawns the binary named by ACCEPTANCE_AGY_BINARY rather than anything found on PATH", async () => {
    const binary = await hostBinary("agy", fakeCli);
    const previous = process.env.ACCEPTANCE_AGY_BINARY;
    process.env.ACCEPTANCE_AGY_BINARY = binary;
    try {
      // No testOnlyCommand: the DEFAULT command path. A relay that ignored the
      // key would discover this machine's own `agy` on PATH and make a LIVE
      // call, so answering through the fake is the proof the key decided.
      const relay = await startAgyRelay({ port: 0, timeoutMs: 10_000 });
      handles.push(relay);

      expect(relay.maker).toBe("Google");
      expect(relay.model).toBe("gemini-3.8-flash");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_AGY_BINARY;
      else process.env.ACCEPTANCE_AGY_BINARY = previous;
    }
  });
});
