import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GROK_BINARY_NAME,
  GROK_SANDBOX_PROFILE,
  SANDBOX_PROFILE_UNAVAILABLE,
  resolveGrokBinary,
  startGrokRelay,
  type GrokRelayHandle
} from "./grok-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-grok-cli.mjs", import.meta.url));
const handles: GrokRelayHandle[] = [];
const temporaryDirectories: string[] = [];

/**
 * W6 fix round 1 / F4: a credential-shaped key's VALUE is never echoed by the
 * fixture — it emits this one-way digest instead. Rule in
 * `test-fixtures/fake-claude-cli.mjs:44-58`; restated rather than imported so a
 * broken producer helper cannot be agreed with (TOOLING-TRAPS `:1320`).
 */
function digestOf(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function temporaryDirectory(prefix = "relay-host-binary-"): Promise<string> {
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
    headers: { "content-type": "application/json", authorization: handle.authorizationHeader },
    body: JSON.stringify({ model: "ignored", messages: [{ role: "user", content }] })
  });
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
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
    const environmentKeys = [
      "HOME", "PATH", "TMPDIR", "LANG", "XAI_API_KEY",
      "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
      "DATABASE_URL", "SSH_AUTH_SOCK", "UNRELATED_SECRET",
      "FAKE_GROK_ALWAYS_FAIL", "FAKE_GROK_CAPTURED_ENVELOPE",
      "FAKE_GROK_COST_ABSENT", "FAKE_GROK_MODEL_USAGE_NON_OBJECT"
    ] as const;
    const previousEnvironment = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, {
      HOME: "/tmp/relay-home-sentinel",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      XAI_API_KEY: "xai-test-sentinel",
      OPENAI_API_KEY: "openai-test-sentinel",
      ANTHROPIC_API_KEY: "anthropic-test-sentinel",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-oauth-test-sentinel",
      DATABASE_URL: "postgresql://secret:test@localhost/debateai",
      SSH_AUTH_SOCK: "/tmp/private-agent.sock",
      UNRELATED_SECRET: "must-not-reach-child"
    });
    delete process.env.FAKE_GROK_ALWAYS_FAIL;
    delete process.env.FAKE_GROK_CAPTURED_ENVELOPE;
    delete process.env.FAKE_GROK_COST_ABSENT;
    delete process.env.FAKE_GROK_MODEL_USAGE_NON_OBJECT;
    try {
      const relay = await start();
      const response = await postCompletion(relay, "Assess this claim.");
      expect(response.status).toBe(200);
      const completion = await response.json() as {
        model: string; maker: string; choices: readonly { message: { content: string } }[];
      };
      expect(completion).toMatchObject({ model: "grok-fake-cli-model", maker: "xAI" });
      const relayed = JSON.parse(completion.choices[0]!.message.content) as {
        prompt: string;
        argumentList: readonly string[];
        environment: Readonly<Record<string, string>>;
        environmentKeyNames: readonly string[];
      };
      expect(JSON.parse(relayed.prompt)).toEqual({
        format: "debateai.relay-messages.v1",
        messages: [{ role: "user", content: "Assess this claim." }]
      });
      expect(relayed.argumentList).toEqual([
        "--single", relayed.prompt,
        "--output-format", "json",
        "--verbatim",
        "--sandbox", "read-only",
        "--no-memory",
        "--no-subagents",
        "--disable-web-search",
        "--tools", ""
      ]);
      expect(Object.fromEntries(Object.entries(relayed.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        HOME: "/tmp/relay-home-sentinel",
        LANG: "C.UTF-8",
        OLDPWD: expect.stringMatching(/[/\\]relay-xai-[^/\\]+$/),
        PATH: "/usr/bin:/bin",
        PWD: expect.stringMatching(/[/\\]relay-xai-[^/\\]+$/),
        TMPDIR: "/tmp",
        // W6/F4: credential-shaped, so the fixture emits a digest of the
        // sentinel rather than the sentinel. Still fails if the relay passes a
        // different value or none.
        XAI_API_KEY: digestOf("xai-test-sentinel")
      });
      for (const key of [
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
        "DATABASE_URL", "SSH_AUTH_SOCK", "UNRELATED_SECRET"
      ]) {
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
        .toEqual(["HOME", "LANG", "OLDPWD", "PATH", "PWD", "TMPDIR", "XAI_API_KEY"]);
    } finally {
      for (const key of environmentKeys) {
        const value = previousEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("uses the shared SIGKILL escalation when the Grok child ignores SIGTERM", async () => {
    const relay = await start(500);
    const startedAt = performance.now();
    const response = await postCompletion(relay, "IGNORE_SIGTERM_CLI");
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "GROK_CLI_TIMEOUT" });
    expect(elapsedMs).toBeGreaterThanOrEqual(650);
    expect(elapsedMs).toBeLessThan(1_500);
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

describe("D10 Grok relay binary resolution", () => {
  it("carries no compiled-in path: this maker is found by the NAME `grok`", () => {
    // REPEALS the 2026-08 pin on "/Users/vladmihaimiron/.grok/bin/grok" —
    // see claude-relay.test.ts for the rule this states once.
    expect(GROK_BINARY_NAME).toBe("grok");
    expect(() => resolveGrokBinary({}))
      .toThrow("GROK_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:grok");
  });

  it("discovers `grok` on the PATH it is handed, and refuses a corrupted launcher there", async () => {
    const directory = await temporaryDirectory("relay-grok-path-");
    const program = join(directory, "grok");
    await writeFile(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(resolveGrokBinary({ PATH: directory })).toBe(program);

    await writeFile(program, "grok\nupdate interrupted\nretry the install\n");
    expect(() => resolveGrokBinary({ PATH: directory }))
      .toThrow(`GROK_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:${program}`);
  });

  it("resolves this host's binary from ACCEPTANCE_GROK_BINARY, ahead of PATH", async () => {
    const onPath = await temporaryDirectory("relay-grok-path-");
    await writeFile(join(onPath, "grok"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const chosen = await hostBinary("grok", fakeCli);

    expect(resolveGrokBinary({ PATH: onPath, ACCEPTANCE_GROK_BINARY: chosen }))
      .toBe(chosen);
  });

  it("fails loudly with a typed code when ACCEPTANCE_GROK_BINARY is present but blank", () => {
    expect(() => resolveGrokBinary({ ACCEPTANCE_GROK_BINARY: "  " }))
      .toThrow("GROK_CLI_BINARY_UNRESOLVED");
  });

  it("keeps the NODE_ENV=test command seam ahead of the environment override", async () => {
    const previous = process.env.ACCEPTANCE_GROK_BINARY;
    process.env.ACCEPTANCE_GROK_BINARY = "/nonexistent/host/grok";
    try {
      const relay = await start();
      expect(relay.model).toBe("grok-fake-cli-model");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_GROK_BINARY;
      else process.env.ACCEPTANCE_GROK_BINARY = previous;
    }
  });

  // r2 regression arms (codex r1 B1) — see claude-relay.test.ts for the rule.
  it("selects the test command seam when the override is blank, instead of throwing the override's code", async () => {
    const previous = process.env.ACCEPTANCE_GROK_BINARY;
    process.env.ACCEPTANCE_GROK_BINARY = "  ";
    try {
      const relay = await start();
      expect(relay.model).toBe("grok-fake-cli-model");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_GROK_BINARY;
      else process.env.ACCEPTANCE_GROK_BINARY = previous;
    }
  });

  it("still rejects the seam outside NODE_ENV=test with TEST_ONLY_GROK_COMMAND_FORBIDDEN when the override is blank", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previous = process.env.ACCEPTANCE_GROK_BINARY;
    process.env.NODE_ENV = "production";
    process.env.ACCEPTANCE_GROK_BINARY = "  ";
    try {
      await expect(startGrokRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeCli] }
      })).rejects.toThrow("TEST_ONLY_GROK_COMMAND_FORBIDDEN");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previous === undefined) delete process.env.ACCEPTANCE_GROK_BINARY;
      else process.env.ACCEPTANCE_GROK_BINARY = previous;
    }
  });

  it("spawns the binary named by ACCEPTANCE_GROK_BINARY rather than anything found on PATH", async () => {
    const binary = await hostBinary("grok", fakeCli);
    const previous = process.env.ACCEPTANCE_GROK_BINARY;
    process.env.ACCEPTANCE_GROK_BINARY = binary;
    try {
      // No testOnlyCommand: the DEFAULT command path, the one the ceremony
      // takes. A relay that ignored the key would discover this machine's own
      // `grok` on PATH and make a LIVE call, so the fake model id below is the
      // proof that the key, not PATH, decided.
      const relay = await startGrokRelay({ port: 0, timeoutMs: 10_000 });
      handles.push(relay);

      expect(relay.model).toBe("grok-fake-cli-model");
      expect(relay.maker).toBe("xAI");
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_GROK_BINARY;
      else process.env.ACCEPTANCE_GROK_BINARY = previous;
    }
  });
});

/**
 * F-GROK-SANDBOX-PROFILE outcome (2). grok 1.0.13 refused the relay's
 * compiled-in `--sandbox read-only` on the closing-run host because that
 * profile could not resolve `/var/run/docker.sock` (a dangling symlink while
 * Docker Desktop is not running), and the maker was dropped from the ceremony.
 *
 * `relay-core.ts` DISCARDS the child's stderr (`child.stderr.resume()`, read-only
 * per this ticket), so nothing downstream can key on the vendor's error text.
 * The classifier is therefore DIFFERENTIAL, not textual: the same handshake is
 * re-run WITHOUT the profile, and only a handshake that succeeds without it and
 * failed with it is evidence that the PROFILE is what this host cannot apply.
 * The doubles below still emit the real 1.0.13 text so the transcript shows the
 * failure the ticket reproduced.
 */
describe("F-GROK-SANDBOX-PROFILE the sandbox profile is probed, never assumed", () => {
  /**
   * A Grok double whose only variable is how it treats the sandbox flag. It
   * echoes the argument list it was actually spawned with, which is what makes
   * "the flag was dropped" / "the flag was kept" observable rather than argued.
   */
  function sandboxDouble(options: {
    readonly rejectsSandbox: boolean;
    /** How the SAME binary behaves once the profile is gone: serve, exit 1, or hang past the deadline. */
    readonly withoutSandbox: "serves" | "fails" | "hangs";
    /**
     * F1. One line per invocation — `S` when the child was spawned WITH the
     * profile, `U` when it was not — so the number and the ORDER of the calls
     * the probe spends is measured rather than argued. Every invocation is its
     * own process, so a file is the only place that count can live.
     */
    readonly attemptLogPath?: string;
    /**
     * F1. Makes the sandboxed refusal TRANSIENT: only the first N SANDBOXED
     * invocations refuse and every later one serves — a rate limit or a 5xx,
     * not a host that cannot apply the profile. Counted from the attempt log,
     * so it requires `attemptLogPath`.
     */
    readonly sandboxFailuresBeforeSuccess?: number;
  }): readonly string[] {
    const script = [
      'const argumentList = process.argv.slice(1);',
      'const sandboxed = argumentList.includes("--sandbox");',
      `const rejectsSandbox = ${String(options.rejectsSandbox)};`,
      `const withoutSandbox = ${JSON.stringify(options.withoutSandbox)};`,
      `const attemptLogPath = ${JSON.stringify(options.attemptLogPath ?? null)};`,
      `const failuresBeforeSuccess = ${JSON.stringify(options.sandboxFailuresBeforeSuccess ?? null)};`,
      'let sandboxedBefore = 0;',
      'if (attemptLogPath !== null) {',
      '  const fs = require("node:fs");',
      '  let log = "";',
      '  try { log = fs.readFileSync(attemptLogPath, "utf8"); } catch { log = ""; }',
      '  sandboxedBefore = log.split("\\n").filter((line) => line === "S").length;',
      '  fs.appendFileSync(attemptLogPath, (sandboxed ? "S" : "U") + "\\n");',
      '}',
      'const refusesThisCall = rejectsSandbox',
      '  && (failuresBeforeSuccess === null || sandboxedBefore < failuresBeforeSuccess);',
      'if (sandboxed && refusesThisCall) {',
      '  process.stderr.write("warning: sandbox could not be applied: runtime-socket deny resolution failed: could not resolve runtime-socket deny path /var/run/docker.sock: endpoint is a symlink\\n");',
      '  process.stderr.write("error: could not apply the \'read-only\' sandbox profile. Refusing to start with its protections missing.\\n");',
      '  process.exit(1);',
      '}',
      'if (!sandboxed && withoutSandbox === "fails") {',
      '  process.stderr.write("error: unauthenticated\\n");',
      '  process.exit(1);',
      '}',
      'if (!sandboxed && withoutSandbox === "hangs") {',
      '  setTimeout(() => process.exit(0), 10000);',
      '} else {',
      '  const promptIndex = argumentList.indexOf("--single") + 1;',
      '  console.log(JSON.stringify({',
      '    text: JSON.stringify({ prompt: argumentList[promptIndex], argumentList }),',
      '    stopReason: "end_turn",',
      '    modelUsage: { "grok-4.6-build": { input_tokens: 1, output_tokens: 1 } }',
      '  }));',
      '}'
    ].join("\n");
    return ["-e", script, "--"];
  }

  /** Captures the process's REAL stdout, so the loud line is pinned where it is printed. */
  async function capturingStdout<T>(run: () => Promise<T>): Promise<readonly [T, string]> {
    const original = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = function patched(chunk: unknown, ...rest: readonly unknown[]): boolean {
      written.push(typeof chunk === "string" ? chunk : String(chunk));
      return (original as (...args: readonly unknown[]) => boolean).call(process.stdout, chunk, ...rest);
    } as typeof process.stdout.write;
    try {
      return [await run(), written.join("")] as const;
    } finally {
      process.stdout.write = original;
    }
  }

  /** F1. A fresh attempt-log path in a scratch directory the suite already cleans up. */
  async function newAttemptLogPath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "grok-sandbox-attempts-"));
    temporaryDirectories.push(directory);
    return join(directory, "attempts");
  }

  /** F1. The invocations the double actually saw, in order: `S` sandboxed, `U` not. */
  async function attemptLog(path: string): Promise<readonly string[]> {
    return (await readFile(path, "utf8")).split("\n").filter((line) => line !== "");
  }

  async function relayArgumentList(relay: GrokRelayHandle): Promise<readonly string[]> {
    const response = await postCompletion(relay, "Assess this claim.");
    expect(response.status).toBe(200);
    const completion = await response.json() as { choices: readonly { message: { content: string } }[] };
    return (JSON.parse(completion.choices[0]!.message.content) as {
      readonly argumentList: readonly string[];
    }).argumentList;
  }

  it("keeps the profile and records no degradation when the host can apply it (admitted)", async () => {
    const [relay, stdout] = await capturingStdout(() => startGrokRelay({
      port: 0,
      timeoutMs: 2_000,
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: sandboxDouble({ rejectsSandbox: false, withoutSandbox: "serves" })
      }
    }));
    handles.push(relay);

    expect(
      relay.sandboxProfile,
      "a host that CAN apply the profile keeps it, and the relay says which profile it applied"
    ).toBe(GROK_SANDBOX_PROFILE);
    expect(
      relay.degradation,
      "nothing is degraded on the admitted path, so the run carries no degradation record"
    ).toBeNull();
    expect(stdout).not.toContain(SANDBOX_PROFILE_UNAVAILABLE);
    expect(await relayArgumentList(relay)).toContain("--sandbox");
  });

  it("drops the profile and records the degradation LOUDLY when the host refuses it (rejected)", async () => {
    const [relay, stdout] = await capturingStdout(() => startGrokRelay({
      port: 0,
      timeoutMs: 2_000,
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: sandboxDouble({ rejectsSandbox: true, withoutSandbox: "serves" })
      }
    }));
    handles.push(relay);

    expect(relay.sandboxProfile).toBeNull();
    expect(relay.degradation).toBe(SANDBOX_PROFILE_UNAVAILABLE);
    expect(relay.maker).toBe("xAI");
    expect(stdout).toContain("RELAY DEGRADED xAI SANDBOX-PROFILE-UNAVAILABLE GROK_CLI_FAILED\n");
    // Every SERVED call also drops the flag — the degradation is the relay's
    // standing configuration, not a one-off retry inside the handshake.
    const argumentList = await relayArgumentList(relay);
    expect(argumentList).not.toContain("--sandbox");
    expect(argumentList).not.toContain(GROK_SANDBOX_PROFILE);
    expect(argumentList.filter((argument) => argument.startsWith("--"))).toEqual([
      "--single", "--output-format", "--verbatim",
      "--no-memory", "--no-subagents", "--disable-web-search", "--tools"
    ]);
  });

  it("keeps the profile when ONE sandboxed handshake fails and the retry succeeds (transient)", async () => {
    // F1. A vendor rate limit, a 5xx or a GROK_CLI_TIMEOUT fails the sandboxed
    // handshake while saying nothing about the PROFILE, and the relay cannot
    // read the vendor's reason (`relay-core.ts` drains stderr). One failure is
    // therefore not evidence: the SANDBOXED handshake is re-run first, and only
    // a REPRODUCIBLE sandboxed failure is allowed to reach the unsandboxed probe.
    const logPath = await newAttemptLogPath();
    const [relay, stdout] = await capturingStdout(() => startGrokRelay({
      port: 0,
      timeoutMs: 2_000,
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: sandboxDouble({
          rejectsSandbox: true,
          withoutSandbox: "serves",
          attemptLogPath: logPath,
          sandboxFailuresBeforeSuccess: 1
        })
      }
    }));
    handles.push(relay);

    expect(
      await attemptLog(logPath),
      "the retry is SANDBOXED, and a transient failure never reaches the unsandboxed probe"
    ).toEqual(["S", "S"]);
    expect(
      relay.sandboxProfile,
      "one unlucky attempt is not a host that cannot apply the profile, so the profile is kept"
    ).toBe(GROK_SANDBOX_PROFILE);
    expect(relay.degradation).toBeNull();
    expect(stdout).not.toContain(SANDBOX_PROFILE_UNAVAILABLE);
    expect(await relayArgumentList(relay)).toContain("--sandbox");
  });

  it("spends THREE CLI invocations on the degraded path — two sandboxed, then the probe", async () => {
    // F1, the price of the retry, measured instead of claimed in prose: only a
    // host that refuses the profile TWICE pays for the third invocation.
    const logPath = await newAttemptLogPath();
    const [relay] = await capturingStdout(() => startGrokRelay({
      port: 0,
      timeoutMs: 2_000,
      testOnlyCommand: {
        binary: process.execPath,
        prefixArguments: sandboxDouble({
          rejectsSandbox: true,
          withoutSandbox: "serves",
          attemptLogPath: logPath
        })
      }
    }));
    handles.push(relay);

    expect(await attemptLog(logPath)).toEqual(["S", "S", "U"]);
    expect(relay.degradation).toBe(SANDBOX_PROFILE_UNAVAILABLE);
    expect(relay.sandboxProfile).toBeNull();
  });

  it("re-throws the ORIGINAL failure rather than trading an absent maker for an unprotected one", async () => {
    const [failure, stdout] = await capturingStdout(async () =>
      startGrokRelay({
        port: 0,
        timeoutMs: 2_000,
        testOnlyCommand: {
          binary: process.execPath,
          prefixArguments: sandboxDouble({ rejectsSandbox: true, withoutSandbox: "fails" })
        }
      }).then(
        (relay) => { handles.push(relay); return null; },
        (error: unknown) => error
      )
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("GROK_CLI_FAILED");
    // A handshake that fails BOTH ways is not evidence about the PROFILE, so no
    // degradation is invented and the ceremony's MAKER ABSENT line owns it.
    expect(stdout).not.toContain(SANDBOX_PROFILE_UNAVAILABLE);
  });

  it("reports the SANDBOXED failure, not the probe's own, when the probe fails differently", async () => {
    // Both failures are GROK_CLI_FAILED when the double exits 1 either way, so
    // that pair cannot tell "re-threw the original" from "threw the second".
    // Here the profile-less probe HANGS instead: its code is GROK_CLI_TIMEOUT,
    // and only the original failure can still be named GROK_CLI_FAILED.
    const [failure, stdout] = await capturingStdout(async () =>
      startGrokRelay({
        port: 0,
        timeoutMs: 400,
        testOnlyCommand: {
          binary: process.execPath,
          prefixArguments: sandboxDouble({ rejectsSandbox: true, withoutSandbox: "hangs" })
        }
      }).then(
        (relay) => { handles.push(relay); return null; },
        (error: unknown) => error
      )
    );

    expect((failure as Error | null)?.message).toBe("GROK_CLI_FAILED");
    expect((failure as Error | null)?.message).not.toBe("GROK_CLI_TIMEOUT");
    expect(stdout).not.toContain(SANDBOX_PROFILE_UNAVAILABLE);
  });

  it("names the degradation with the acceptance-harness code, which is NOT a kernel condition mark", async () => {
    const kernel = await import("@debateai/kernel") as { readonly CONDITION_MARKS: readonly string[] };
    expect(SANDBOX_PROFILE_UNAVAILABLE).toBe("SANDBOX-PROFILE-UNAVAILABLE");
    expect(kernel.CONDITION_MARKS).not.toContain(SANDBOX_PROFILE_UNAVAILABLE);
    expect(kernel.CONDITION_MARKS).toHaveLength(37);
  });
});
