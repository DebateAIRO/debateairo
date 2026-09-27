import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { resolveClaudeBinary } from "./claude-relay.js";
import { resolveGrokBinary } from "./grok-relay.js";
import { resolveHermesBinary } from "./hermes-relay.js";
import { resolveCodexBinary } from "./model-shim.js";
import { afterEach, describe, expect, it } from "vitest";
import { estimateWindowTokens } from "@debateai/providers";
import {
  CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES,
  CLI_RELAY_STDOUT_MAX_BYTES,
  CLI_RELAY_USAGE_CAP_CODE_TOKEN,
  RELAY_MESSAGE_MAX_UTF8_BYTES,
  RELAY_REQUEST_MAX_BYTES,
  RELAY_REQUEST_MAX_MESSAGES,
  buildCliUsage,
  invokeCli,
  renderPromptTranscript,
  resolveConfiguredBinary,
  startCliRelayServer,
  type CliFailureEvidence,
  type CliRelayAdapter,
  type CliRelayHandle
} from "./relay-core.js";

const handles: CliRelayHandle[] = [];
const temporaryDirectories: string[] = [];

function relayHeaders(handle: CliRelayHandle): Readonly<Record<string, string>> {
  return { "content-type": "application/json", authorization: handle.authorizationHeader };
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("P4-05 relay message validation", () => {
  it("rejects oversized, excessive, and control-byte messages before spawning a child", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "relay-validation-"));
    temporaryDirectories.push(temporaryDirectory);
    const spawnMarker = join(temporaryDirectory, "spawned");
    const adapter: CliRelayAdapter = {
      maker: "validation-fixture",
      authEnvironmentKeys: [],
      testEnvironmentKeys: [],
      failureCode: "FIXTURE_FAILED",
      timeoutCode: "FIXTURE_TIMEOUT",
      buildArguments: () => [],
      parseCompletion: () => ({ content: "OK", model: "fixture-model", usage: null })
    };
    const handle = await startCliRelayServer({
      port: 0,
      timeoutMs: 1_000,
      command: {
        binary: process.execPath,
        prefixArguments: [
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(spawnMarker)}, "spawned")`
        ]
      },
      adapter
    });
    handles.push(handle);

    const post = (messages: readonly { readonly role: "user"; readonly content: string }[]) =>
      fetch(`${handle.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: relayHeaders(handle),
        body: JSON.stringify({ model: "fixture-model", messages })
      });

    const oversized = await post([{
      role: "user",
      content: "a".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES + 1)
    }]);
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(existsSync(spawnMarker)).toBe(false);

    const oversizedUtf8 = await post([{
      role: "user",
      content: "é".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES / 2 + 1)
    }]);
    expect(oversizedUtf8.status).toBe(400);
    expect(await oversizedUtf8.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(existsSync(spawnMarker)).toBe(false);

    for (const forbidden of ["\u0000", "\r", "\u001f", "\u007f"]) {
      const controlByte = await post([{ role: "user", content: `safe${forbidden}unsafe` }]);
      expect(controlByte.status).toBe(400);
      expect(await controlByte.json()).toEqual({ error: "MALFORMED_REQUEST" });
      expect(existsSync(spawnMarker)).toBe(false);
    }

    const excessive = await post(Array.from(
      { length: RELAY_REQUEST_MAX_MESSAGES + 1 },
      () => ({ role: "user" as const, content: "bounded" })
    ));
    expect(excessive.status).toBe(400);
    expect(await excessive.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(existsSync(spawnMarker)).toBe(false);

    const boundary = await post([{
      role: "user",
      content: `\t\n${"a".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES - 2)}`
    }]);
    expect(boundary.status).toBe(200);
    expect(existsSync(spawnMarker)).toBe(true);
  });
});

describe("P4-07 relay timeout escalation", () => {
  it("SIGKILLs a child that ignores SIGTERM and reaps its scratch directory", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "relay-timeout-escalation-"));
    temporaryDirectories.push(temporaryDirectory);
    const scratchMarker = join(temporaryDirectory, "scratch-directory");
    const signalMarker = join(temporaryDirectory, "signals");
    const heartbeatMarker = join(temporaryDirectory, "heartbeat");
    const adapter: CliRelayAdapter = {
      maker: "timeout-fixture",
      authEnvironmentKeys: [],
      testEnvironmentKeys: [],
      failureCode: "FIXTURE_FAILED",
      timeoutCode: "FIXTURE_TIMEOUT",
      buildArguments: () => [],
      parseCompletion: () => ({ content: "UNREACHABLE", model: "fixture-model", usage: null })
    };
    const fixtureScript = [
      'const { appendFileSync, writeFileSync } = require("node:fs");',
      `writeFileSync(${JSON.stringify(scratchMarker)}, process.cwd());`,
      `writeFileSync(${JSON.stringify(heartbeatMarker)}, "alive");`,
      `setInterval(() => appendFileSync(${JSON.stringify(heartbeatMarker)}, "."), 50);`,
      `process.on("SIGTERM", () => appendFileSync(${JSON.stringify(signalMarker)}, "SIGTERM\\n"));`,
      "setTimeout(() => process.exit(0), 2_000);"
    ].join("");
    const handle = await startCliRelayServer({
      port: 0,
      timeoutMs: 500,
      command: {
        binary: process.execPath,
        prefixArguments: ["-e", fixtureScript]
      },
      adapter
    });
    handles.push(handle);

    const startedAt = performance.now();
    const response = await fetch(`${handle.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: relayHeaders(handle),
      body: JSON.stringify({
        model: "fixture-model",
        messages: [{ role: "user", content: "Ignore SIGTERM." }]
      })
    });
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "FIXTURE_TIMEOUT" });
    expect(await readFile(signalMarker, "utf8")).toBe("SIGTERM\n");
    const scratchDirectory = await readFile(scratchMarker, "utf8");
    await expect.poll(() => existsSync(scratchDirectory)).toBe(false);
    const heartbeatAfterResponse = await readFile(heartbeatMarker, "utf8");
    await delay(350);
    expect(await readFile(heartbeatMarker, "utf8")).toBe(heartbeatAfterResponse);
    expect(elapsedMs).toBeGreaterThanOrEqual(500);
    expect(elapsedMs).toBeLessThan(1_500);
  });
});

describe("P4-08 relay stdout ceiling", () => {
  it("accepts the exact byte boundary and loudly terminates max plus one before parsing", async () => {
    let parseCalls = 0;
    const adapter: CliRelayAdapter = {
      maker: "stdout-fixture",
      authEnvironmentKeys: [],
      testEnvironmentKeys: [],
      failureCode: "FIXTURE_FAILED",
      timeoutCode: "FIXTURE_TIMEOUT",
      buildArguments: () => [],
      parseCompletion: (stdout) => {
        parseCalls += 1;
        return { content: String(Buffer.byteLength(stdout, "utf8")), model: "fixture-model", usage: null };
      }
    };
    const fixtureScript = [
      "const size = Number(process.argv[1]);",
      "const lifetime = Number(process.argv[2]);",
      "process.stdout.write(Buffer.alloc(size, 0x61), () => {",
      "  setTimeout(() => process.exit(0), lifetime);",
      "});"
    ].join("");
    const start = async (stdoutBytes: number, lifetimeMs: number) => {
      const handle = await startCliRelayServer({
        port: 0,
        timeoutMs: 5_000,
        command: {
          binary: process.execPath,
          prefixArguments: ["-e", fixtureScript, String(stdoutBytes), String(lifetimeMs)]
        },
        adapter
      });
      handles.push(handle);
      return handle;
    };
    const post = (handle: CliRelayHandle) => fetch(`${handle.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: relayHeaders(handle),
      body: JSON.stringify({ model: "fixture-model", messages: [{ role: "user", content: "Bound stdout." }] })
    });

    const boundaryHandle = await start(CLI_RELAY_STDOUT_MAX_BYTES, 0);
    const boundary = await post(boundaryHandle);
    expect(boundary.status).toBe(200);
    const boundaryBody = await boundary.json() as {
      choices: readonly { readonly message: { readonly content: string } }[];
    };
    expect(boundaryBody.choices[0]?.message.content).toBe(String(CLI_RELAY_STDOUT_MAX_BYTES));
    expect(parseCalls).toBe(1);

    const overLimitHandle = await start(CLI_RELAY_STDOUT_MAX_BYTES + 1, 1_500);
    const overLimitStartedAt = performance.now();
    const overLimit = await post(overLimitHandle);
    const overLimitElapsedMs = performance.now() - overLimitStartedAt;
    expect(overLimit.status).toBe(502);
    expect(await overLimit.json()).toEqual({ error: "CLI_RELAY_STDOUT_LIMIT" });
    expect(parseCalls).toBe(1);
    expect(overLimitElapsedMs).toBeLessThan(1_000);
  });
});

describe("P4-09 relay HTTP request-body ceiling", () => {
  it("rejects max plus one while streaming before spawn and accepts the exact boundary", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "relay-request-ceiling-"));
    temporaryDirectories.push(temporaryDirectory);
    const spawnMarker = join(temporaryDirectory, "spawned");
    const adapter: CliRelayAdapter = {
      maker: "request-fixture",
      authEnvironmentKeys: [],
      testEnvironmentKeys: [],
      failureCode: "FIXTURE_FAILED",
      timeoutCode: "FIXTURE_TIMEOUT",
      buildArguments: () => [],
      parseCompletion: () => ({ content: "OK", model: "fixture-model", usage: null })
    };
    const handle = await startCliRelayServer({
      port: 0,
      timeoutMs: 1_000,
      command: {
        binary: process.execPath,
        prefixArguments: [
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(spawnMarker)}, "spawned"); process.stdout.write("OK")`
        ]
      },
      adapter
    });
    handles.push(handle);

    const bodyAtBytes = (targetBytes: number): string => {
      const empty = JSON.stringify({
        model: "fixture-model",
        messages: [{ role: "user", content: "bounded" }],
        padding: ""
      });
      const paddingLength = targetBytes - Buffer.byteLength(empty, "utf8");
      expect(paddingLength).toBeGreaterThanOrEqual(0);
      return empty.replace('"padding":""', `"padding":"${"a".repeat(paddingLength)}"`);
    };
    const postRaw = (body: string) => fetch(`${handle.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: relayHeaders(handle),
      body
    });

    const overLimitBody = bodyAtBytes(RELAY_REQUEST_MAX_BYTES + 1);
    expect(Buffer.byteLength(overLimitBody, "utf8")).toBe(RELAY_REQUEST_MAX_BYTES + 1);
    const overLimit = await postRaw(overLimitBody);
    expect(overLimit.status).toBe(400);
    expect(await overLimit.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(existsSync(spawnMarker)).toBe(false);

    const boundaryBody = bodyAtBytes(RELAY_REQUEST_MAX_BYTES);
    expect(Buffer.byteLength(boundaryBody, "utf8")).toBe(RELAY_REQUEST_MAX_BYTES);
    const boundary = await postRaw(boundaryBody);
    expect(boundary.status).toBe(200);
    expect(existsSync(spawnMarker)).toBe(true);
  });
});

describe("P4-10 loopback relay authentication", () => {
  it("rejects missing, wrong, alternate-shape, and cross-relay credentials before spawn", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "relay-authentication-"));
    temporaryDirectories.push(temporaryDirectory);
    const adapter: CliRelayAdapter = {
      maker: "authentication-fixture",
      authEnvironmentKeys: [],
      testEnvironmentKeys: [],
      failureCode: "FIXTURE_FAILED",
      timeoutCode: "FIXTURE_TIMEOUT",
      buildArguments: () => [],
      parseCompletion: () => ({ content: "OK", model: "fixture-model", usage: null })
    };
    const start = async (label: string) => {
      const childObservation = join(temporaryDirectory, `${label}-child.json`);
      // W6 (SECURITY), fix round 1 / F2: the observation's `environment` is a
      // PROJECTION over an explicit allow-list, never `process.env`. This member
      // writes to a FILE rather than into model content, so it never reaches
      // `ledger.raw_artifact` — but it is the same shape and it wrote every
      // variable the relay admits, in clear, to disk.
      // Its own assertions (`:371-373`) name no individual key: they assert the
      // file lacks the relay's Bearer credential. The allow-list is therefore
      // derived from what the PRODUCT admits for this adapter — the four common
      // keys (`acceptance/relay-core.ts:69`) plus the two fixed ones (`:93-94`),
      // with `authEnvironmentKeys` and `testEnvironmentKeys` both empty above —
      // so the exact-set the emission can carry is fully covered and anything
      // unnamed, the W6 canary included, is dropped.
      const script = [
        'const { writeFileSync } = require("node:fs");',
        "const echoedEnvironmentKeys = ['HOME','LANG','OLDPWD','PATH','PWD','TMPDIR'];",
        // F4 — the CREDENTIAL-SHAPE rule, carried identically by all six members
        // of the class: a credential-shaped key's VALUE is never emitted, only a
        // truncated one-way digest of it. None of the six keys this member may
        // echo matches the pattern, so the rule never fires here TODAY — it is
        // present so that widening the allow-list above cannot reintroduce the
        // leak silently. Full reasoning in `test-fixtures/fake-claude-cli.mjs:44-58`.
        "const { createHash } = require('node:crypto');",
        "const credentialShapedName = /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|OAUTH|AUTH|CREDENTIAL|CREDENTIALS|URL|URI|DSN)(?:_|$)/u;",
        "const echoedValue = (key, value) => credentialShapedName.test(key) ? 'sha256:' + createHash('sha256').update(value).digest('hex').slice(0, 16) : value;",
        'const environment = {};',
        "for (const key of echoedEnvironmentKeys) { if (process.env[key] !== undefined) environment[key] = echoedValue(key, process.env[key]); }",
        // F3: this member's assertions name no key, so the allow-list alone left
        // nothing able to see a wrongly admitted one. The key NAMES restore that
        // at zero risk — a name is not a credential, a value is. Read by `:392-394`.
        "const environmentKeyNames = Object.keys(process.env).sort();",
        `writeFileSync(${JSON.stringify(childObservation)}, JSON.stringify({ argv: process.argv, environment, environmentKeyNames }));`,
        'process.stdout.write("OK");'
      ].join("");
      const handle = await startCliRelayServer({
        port: 0,
        timeoutMs: 1_000,
        command: { binary: process.execPath, prefixArguments: ["-e", script] },
        adapter
      }) as CliRelayHandle & { readonly authorizationHeader: string };
      handles.push(handle);
      return { handle, childObservation };
    };
    const primary = await start("primary");
    const secondary = await start("secondary");
    const post = (handle: CliRelayHandle, headers: Readonly<Record<string, string>>, bodyExtra = {}) =>
      fetch(`${handle.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          model: "fixture-model",
          messages: [{ role: "user", content: "Authenticate." }],
          ...bodyExtra
        })
      });
    const expectUnauthorized = async (response: Response, childObservation: string) => {
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: "UNAUTHORIZED" });
      expect(JSON.stringify(body)).not.toContain("Bearer ");
      expect(existsSync(childObservation)).toBe(false);
    };

    await expectUnauthorized(await post(primary.handle, {}), primary.childObservation);
    await expectUnauthorized(
      await post(primary.handle, { authorization: "Bearer wrong" }),
      primary.childObservation
    );
    await expectUnauthorized(await post(primary.handle, {
      "x-relay-authorization": primary.handle.authorizationHeader
    }, {
      authorization: primary.handle.authorizationHeader
    }), primary.childObservation);
    await expectUnauthorized(await post(secondary.handle, {
      authorization: primary.handle.authorizationHeader
    }), secondary.childObservation);

    expect(primary.handle.authorizationHeader).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    expect(secondary.handle.authorizationHeader).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    expect(secondary.handle.authorizationHeader).not.toBe(primary.handle.authorizationHeader);
    const authorized = await post(primary.handle, {
      authorization: primary.handle.authorizationHeader
    });
    expect(authorized.status).toBe(200);
    const observedChild = await readFile(primary.childObservation, "utf8");
    expect(observedChild).not.toContain(primary.handle.authorizationHeader);
    expect(observedChild).not.toContain(primary.handle.authorizationHeader.slice("Bearer ".length));
    // W6 fix round 1 / F3. The two assertions above search the written text for
    // the relay's own Bearer credential. Once the fixture projected over an
    // allow-list they could no longer see a credential admitted under a key the
    // allow-list omits — its value would simply not be written. The fixture also
    // emits the full key-NAME list, and this assertion refuses any key beyond
    // what the product admits for an adapter with empty auth and test key lists
    // (`acceptance/relay-core.ts:69` plus the two fixed keys at `:93-94`), so a
    // leak is caught by NAME even when no value is echoed.
    // This suite does not own the parent environment, so the complement is
    // refused rather than an exact set pinned — the same reasoning as the DB-01
    // LANG note in `adversarial-corpus.test.ts`, from the other direction.
    const observedChildEnvironment = JSON.parse(observedChild) as {
      readonly environmentKeyNames: readonly string[];
    };
    expect(observedChildEnvironment.environmentKeyNames.filter((key) => ![
      "HOME", "LANG", "OLDPWD", "PATH", "PWD", "TMPDIR", "__CF_USER_TEXT_ENCODING"
    ].includes(key))).toEqual([]);
  });
});

/**
 * D10, rewritten 2026-09-17. WHICH executable a maker relay spawns is a HOST
 * fact that must be DEDUCED, never written into the source. The compiled-in
 * defaults these assertions used to pin — one developer's home directory, one
 * installed app bundle — are gone; the resolver now searches the PATH of the
 * environment it is HANDED, so every assertion here builds its own PATH out of
 * temporary directories and none of them can read this machine's real one.
 *
 * NOTHING HERE EVER RUNS A CANDIDATE. Each refusal is proven by the resolver's
 * return value or by the code it throws. That rule is the whole point of the
 * ticket: on 2026-09-17 a `codex` launcher whose contents had been overwritten
 * with four lines of plain text was handed to a shell, which — unable to
 * execute it — re-read it as a script and re-entered itself until this Mac's
 * process table was full. The NOT_A_PROGRAM arm below has the same SHAPE as that
 * file (this suite never opened the host's own copy). It is read four bytes deep
 * and never executed.
 */
const NAME = "fixture-cli";
const KEY = "ACCEPTANCE_FIXTURE_BINARY";
const CODE = "FIXTURE_CLI_BINARY_UNRESOLVED";
const SHEBANG = "#!/bin/sh\nexit 0\n";
/** The same shape as the launcher that had been overwritten with plain text. */
const CORRUPTED_LAUNCHER = "codex\nupdate interrupted\nretry the install\nnot a program\n";

async function pathDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "relay-path-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** `mode` is applied with an explicit chmod so no ambient umask can move it. */
async function place(
  directory: string,
  contents: string | Uint8Array,
  mode = 0o755,
  name = NAME
): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, contents);
  await chmod(path, mode);
  return path;
}

describe("D10 maker CLI binary resolution", () => {

  it("finds the maker's CLI by NAME in the PATH of the environment it is handed", async () => {
    const directory = await pathDirectory();
    const program = await place(directory, SHEBANG);

    expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory })).toBe(program);
  });

  it("takes the first PATH directory that carries the name, in PATH order", async () => {
    const first = await pathDirectory();
    const second = await pathDirectory();
    const firstProgram = await place(first, SHEBANG);
    const secondProgram = await place(second, SHEBANG);

    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: [first, second].join(delimiter)
    })).toBe(firstProgram);
    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: [second, first].join(delimiter)
    })).toBe(secondProgram);
  });

  it("refuses with NOT_ON_PATH when nothing on PATH carries the name, and when there is no PATH", async () => {
    const empty = await pathDirectory();

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: empty }))
      .toThrow(`${CODE}:NOT_ON_PATH:${NAME}`);
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, {}))
      .toThrow(`${CODE}:NOT_ON_PATH:${NAME}`);
  });

  it("refuses with NOT_FOUND when the name on PATH is a dangling symlink", async () => {
    const directory = await pathDirectory();
    const path = join(directory, NAME);
    await symlink(join(directory, "gone"), path);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_FOUND:${path}`);
  });

  it("refuses with EMPTY for the 0-byte launcher an interrupted update leaves behind", async () => {
    const directory = await pathDirectory();
    const path = await place(directory, "");

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:EMPTY:${path}`);
  });

  /**
   * A LIVE symlink whose TARGET is the broken thing. This is the shape of nearly
   * every real launcher — Homebrew's `bin`, npm global bins, and the
   * `~/.local/bin/claude` of 2026-09-17 that pointed at a 0-byte
   * `…/versions/2.1.274`. A gate that stopped at the link would refuse every
   * symlinked install on the machine, or admit every broken one.
   */
  it("follows a live symlink into an EMPTY target", async () => {
    const directory = await pathDirectory();
    await place(directory, "", 0o755, "target");
    const link = join(directory, NAME);
    await symlink(join(directory, "target"), link);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:EMPTY:${link}`);
  });

  it("follows a live symlink into a target that is not a program", async () => {
    const directory = await pathDirectory();
    await place(directory, CORRUPTED_LAUNCHER, 0o755, "target");
    const link = join(directory, NAME);
    await symlink(join(directory, "target"), link);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_A_PROGRAM:${link}`);
  });

  it("admits a live symlink to a good program and keeps the LINK as the resolved path", async () => {
    const directory = await pathDirectory();
    await place(directory, SHEBANG, 0o755, "target");
    const link = join(directory, NAME);
    await symlink(join(directory, "target"), link);

    // The link, not the target: the launcher's own name is the argv[0] the CLI
    // sees and the path the operator installed. Resolving through to
    // `…/versions/<v>` would spawn a path nobody configured and would change
    // what the relay reports it ran, for no gain — the target's own defects are
    // already caught above, because the checks follow the link.
    expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory })).toBe(link);
  });

  it("refuses with NOT_EXECUTABLE when the resolved file cannot be executed by this user", async () => {
    const directory = await pathDirectory();
    const path = await place(directory, SHEBANG, 0o644);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_EXECUTABLE:${path}`);
  });

  it("refuses with NOT_A_PROGRAM when the executable bit sits on plain text", async () => {
    const directory = await pathDirectory();
    const path = await place(directory, CORRUPTED_LAUNCHER);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_A_PROGRAM:${path}`);
  });

  it("refuses a DIRECTORY carrying the maker's name, which command -v would have skipped", async () => {
    const directory = await pathDirectory();
    const path = join(directory, NAME);
    await mkdir(path);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_A_PROGRAM:${path}`);
  });

  /**
   * An execute-only program IS a program. Saying "not a program" about a file
   * this user may run, but may not read, sends an operator hunting for a
   * corruption that is not there; the two facts get two reasons.
   * Skipped as root, for whom `open(2)` succeeds regardless of the mode.
   */
  it.skipIf(process.getuid?.() === 0)(
    "says the header could not be READ, not that the file is not a program",
    async () => {
      const directory = await pathDirectory();
      const path = await place(directory, SHEBANG, 0o111);

      expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
        .toThrow(`${CODE}:UNREADABLE:${path}`);
    }
  );

  it("reads only the FIRST bytes: a shebang further down the file is not a program header", async () => {
    const directory = await pathDirectory();
    const path = await place(directory, `not a launcher\n${SHEBANG}`);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory }))
      .toThrow(`${CODE}:NOT_A_PROGRAM:${path}`);
  });

  it("accepts a Mach-O, universal or ELF executable, not only a shebang script", async () => {
    for (const magic of [
      [0xcf, 0xfa, 0xed, 0xfe], [0xce, 0xfa, 0xed, 0xfe],
      [0xfe, 0xed, 0xfa, 0xcf], [0xfe, 0xed, 0xfa, 0xce],
      [0xca, 0xfe, 0xba, 0xbe], [0xbe, 0xba, 0xfe, 0xca],
      // ELF. This harness is meant to run on more than one computer, and a
      // resolver that refused every Linux binary would say NOT_A_PROGRAM about
      // a file that is perfectly fine — the most misleading refusal available.
      [0x7f, 0x45, 0x4c, 0x46]
    ]) {
      const directory = await pathDirectory();
      const path = await place(directory, Uint8Array.from([...magic, 0x0c, 0x00, 0x00, 0x01]));

      expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory })).toBe(path);
    }
  });

  it("lets the operator's key win over a PATH that carries the same name", async () => {
    const onPath = await pathDirectory();
    const chosen = await pathDirectory();
    await place(onPath, SHEBANG);
    const program = await place(chosen, SHEBANG);

    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: onPath,
      [KEY]: `  ${program}\n`
    })).toBe(program);
  });

  it("looks a BARE name in the operator's key up on PATH", async () => {
    const directory = await pathDirectory();
    const program = await place(directory, SHEBANG, 0o755, "other-cli");

    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: directory,
      [KEY]: "other-cli"
    })).toBe(program);
  });

  it("holds the key's own path to the same program check as a discovered one", async () => {
    const directory = await pathDirectory();
    const text = await place(directory, CORRUPTED_LAUNCHER, 0o755, "corrupt-cli");
    const missing = join(directory, "absent-cli");

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { [KEY]: text }))
      .toThrow(`${CODE}:NOT_A_PROGRAM:${text}`);
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { [KEY]: missing }))
      .toThrow(`${CODE}:NOT_FOUND:${missing}`);
  });

  it("fails loudly with the BARE code on a present-but-blank key, never discovering instead", async () => {
    const directory = await pathDirectory();
    await place(directory, SHEBANG);

    // Anchored: a blank key is a configuration failure with no path to name, and
    // `run-acceptance` records this message verbatim as the probe's failureCode.
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory, [KEY]: "" }))
      .toThrow(new RegExp(`^${CODE}$`, "u"));
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory, [KEY]: " \t " }))
      .toThrow(new RegExp(`^${CODE}$`, "u"));
  });

  it("reads only its own maker's key", async () => {
    const directory = await pathDirectory();
    const program = await place(directory, SHEBANG);

    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: directory,
      ACCEPTANCE_OTHER_BINARY: "/host/bin/other-cli"
    })).toBe(program);
  });

  /**
   * C-1. The path that is ADMITTED must be the path that is SPAWNED, and only an
   * absolute one can be. `invokeCli` spawns with `cwd` pointed at a fresh empty
   * scratch directory and a child env carrying PATH, so a relative candidate
   * would be re-resolved against a directory that holds nothing, and a candidate
   * that `join(".", name)` had collapsed to a BARE name would re-enter a PATH
   * search inside the child — landing on a file this gate never saw, which on
   * macOS an ENOEXEC retry can then feed to a command interpreter. That is the
   * 2026-09-17 path exactly.
   */
  it("resolves a relative value in the operator's key to an absolute path", async () => {
    const directory = await pathDirectory();
    const program = await place(directory, SHEBANG);
    const relativeToCwd = relative(process.cwd(), program);

    expect(isAbsolute(relativeToCwd)).toBe(false);
    expect(resolveConfiguredBinary(NAME, KEY, CODE, { [KEY]: relativeToCwd })).toBe(program);
  });

  it("names the ABSOLUTE path when it refuses a relative value in the key", async () => {
    // Nothing is created: `./probe-cli` does not exist under this process's cwd,
    // and the refusal must still say WHICH file it looked for.
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { [KEY]: "./probe-cli" }))
      .toThrow(`${CODE}:NOT_FOUND:${join(process.cwd(), "probe-cli")}`);
  });

  it("skips a relative PATH entry exactly as it skips an empty one", async () => {
    const directory = await pathDirectory();
    const program = await place(directory, SHEBANG);
    const relativeDirectory = relative(process.cwd(), directory);

    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: "." }))
      .toThrow(`${CODE}:NOT_ON_PATH:${NAME}`);
    expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: relativeDirectory }))
      .toThrow(`${CODE}:NOT_ON_PATH:${NAME}`);
    // …and an absolute entry standing behind a relative one is still searched.
    expect(resolveConfiguredBinary(NAME, KEY, CODE, {
      PATH: [".", "", directory].join(delimiter)
    })).toBe(program);
  });

  it("resolves a program WITHOUT running it", async () => {
    const directory = await pathDirectory();
    const marker = join(directory, "ran");
    const program = await place(directory, `#!/bin/sh\n: > ${JSON.stringify(marker)}\n`);

    expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory })).toBe(program);
    expect(existsSync(marker)).toBe(false);
  });

  it("never routes a candidate binary through a shell anywhere in acceptance/", async () => {
    const root = fileURLToPath(new URL(".", import.meta.url));
    // RECURSIVE, and every file kind, so the name of this test is the truth:
    // fixtures and subdirectories are scanned too. Only `*.test.ts` is excluded,
    // because a suite must be able to WRITE a shebang fixture and to name the
    // patterns it forbids.
    const sources = (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".test.ts"))
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .sort();
    // A shell that cannot EXECUTE a file re-reads it as a script; that is how a
    // corrupted launcher became a fork bomb on 2026-09-17. The relays spawn the
    // resolved program directly and nothing in this directory may undo that.
    const forbidden = [
      "shell: true", "shell:true", "sh -c", "execSync", "spawnSync", "execFile",
      "/bin/sh", "/bin/bash", "/bin/zsh"
    ];
    const offenders: string[] = [];
    for (const source of sources) {
      const text = await readFile(join(root, source), "utf8");
      for (const pattern of forbidden) {
        if (text.includes(pattern)) offenders.push(`${source}: ${pattern}`);
      }
    }

    expect(sources).toContain("relay-core.ts");
    expect(sources).toContain(join("test-fixtures", "evaluator-double.ts"));
    expect(sources).toContain(join("test-fixtures", "fake-claude-cli.mjs"));
    expect(offenders).toEqual([]);
  });
});

/**
 * C-1. `invokeCli` spawns `command.binary` from a scratch `cwd` with a child env
 * that carries PATH, so anything short of an absolute path is re-resolved
 * somewhere else — and the file that runs need not be the file that was
 * admitted. Each maker's CommandSpec takes its `binary` straight from the
 * resolver below (`() => ({ binary: resolve*Binary(), … })` in each start
 * function), so pinning the resolvers pins every CommandSpec the harness builds.
 */
describe("D10 every maker resolves to an ABSOLUTE path", () => {
  const makers = [
    { name: "claude", key: "ACCEPTANCE_CLAUDE_BINARY", resolve: resolveClaudeBinary },
    { name: "grok", key: "ACCEPTANCE_GROK_BINARY", resolve: resolveGrokBinary },
    { name: "codex", key: "ACCEPTANCE_CODEX_BINARY", resolve: resolveCodexBinary },
    { name: "hermes", key: "ACCEPTANCE_HERMES_BINARY", resolve: resolveHermesBinary }
  ] as const;

  it("from PATH discovery and from a relative key alike, for all four", async () => {
    for (const maker of makers) {
      const directory = await pathDirectory();
      const program = await place(directory, SHEBANG, 0o755, maker.name);

      const discovered = maker.resolve({ PATH: directory });
      expect(isAbsolute(discovered), `${maker.name} via PATH`).toBe(true);
      expect(discovered).toBe(program);

      const viaKey = maker.resolve({ [maker.key]: relative(process.cwd(), program) });
      expect(isAbsolute(viaKey), `${maker.name} via a relative key`).toBe(true);
      expect(viaKey).toBe(program);
    }
  });
});

/**
 * Model scorecard (2026-09-26): the shared core's new laws — prompt transport
 * (§2.10), thinking level (§2.2), declared context window (§2.10), reasoning
 * tokens (§2.3) and usage caps (R4) — each proven on a fixture adapter so no
 * maker's parser is involved. W6: none of these probes echoes the environment;
 * they report argv, stdin, a file's mode and a directory listing only.
 */
interface RelayBody {
  readonly x_thinking_level?: string;
  readonly usage?: unknown;
  readonly choices: readonly { readonly message: { readonly content: string } }[];
}

function fixtureAdapter(maker: string, overrides: Partial<CliRelayAdapter> = {}): CliRelayAdapter {
  return {
    maker,
    authEnvironmentKeys: [],
    testEnvironmentKeys: [],
    failureCode: "FIXTURE_FAILED",
    timeoutCode: "FIXTURE_TIMEOUT",
    buildArguments: () => [],
    parseCompletion: (stdout: string) => ({ content: stdout, model: "fixture-model", usage: null }),
    ...overrides
  };
}

async function startFixtureRelay(
  adapter: CliRelayAdapter,
  probe: string,
  timeoutMs = 5_000
): Promise<CliRelayHandle> {
  const handle = await startCliRelayServer({
    port: 0,
    timeoutMs,
    command: { binary: process.execPath, prefixArguments: ["-e", probe, "--"] },
    adapter
  });
  handles.push(handle);
  return handle;
}

function postRelay(handle: CliRelayHandle, body: Readonly<Record<string, unknown>>): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: relayHeaders(handle),
    body: JSON.stringify(body)
  });
}

function userTurn(
  content: string,
  extra: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return { model: "fixture-model", messages: [{ role: "user", content }], ...extra };
}

async function spawnMarker(): Promise<{ readonly marker: string; readonly probe: string }> {
  const marker = join(await pathDirectory(), "spawned");
  return {
    marker,
    probe: `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "spawned"); process.stdout.write("OK");`
  };
}

// Read as a stream to EOF (not readFileSync(0), which can hit EAGAIN on a
// non-blocking pipe): the probe answers only once the relay has CLOSED stdin.
const STDIN_PROBE = [
  'let stdin = "";',
  'process.stdin.setEncoding("utf8");',
  'process.stdin.on("data", (chunk) => { stdin += chunk; });',
  'process.stdin.on("end", () => process.stdout.write(JSON.stringify({ argv: process.argv.slice(1), stdin })));'
].join("");

const FILE_PROBE = [
  'const { readFileSync, readdirSync, statSync } = require("node:fs");',
  "const promptFile = process.argv[process.argv.length - 1];",
  "process.stdout.write(JSON.stringify({",
  "  argv: process.argv.slice(1),",
  "  promptFile,",
  "  mode: (statSync(promptFile).mode & 0o777).toString(8),",
  '  prompt: readFileSync(promptFile, "utf8"),',
  "  cwd: process.cwd(),",
  "  cwdEntries: readdirSync(process.cwd())",
  "}));"
].join("");

const ARGV_PROBE = "process.stdout.write(JSON.stringify(process.argv.slice(1)));";

describe("§2.10 prompt transport", () => {
  it("stdin: delivers the transcript on stdin, closes it, and keeps it off argv", async () => {
    const handle = await startFixtureRelay(fixtureAdapter("stdin-fixture", {
      promptTransport: "stdin",
      buildArguments: () => ["--fixture-flag"]
    }), STDIN_PROBE);

    const response = await postRelay(handle, userTurn("Transport canary 41c7."));

    expect(response.status).toBe(200);
    const body = await response.json() as RelayBody;
    const observed = JSON.parse(body.choices[0]!.message.content) as { argv: string[]; stdin: string };
    expect(observed.stdin).toBe(renderPromptTranscript([{ role: "user", content: "Transport canary 41c7." }]));
    expect(observed.argv).toEqual(["--fixture-flag"]);
    expect(JSON.stringify(observed.argv)).not.toContain("Transport canary 41c7.");
  });

  it("stdin: writes the adapter's own framing when it declares one", async () => {
    const handle = await startFixtureRelay(fixtureAdapter("stdin-framing-fixture", {
      promptTransport: "stdin",
      stdinPayload: (prompt) => `${JSON.stringify({ type: "user", text: prompt })}\n`
    }), STDIN_PROBE);

    const body = await (await postRelay(handle, userTurn("Framed canary 9b20."))).json() as RelayBody;

    const observed = JSON.parse(body.choices[0]!.message.content) as { stdin: string };
    expect(observed.stdin).toBe(`${JSON.stringify({
      type: "user",
      text: renderPromptTranscript([{ role: "user", content: "Framed canary 9b20." }])
    })}\n`);
  });

  it("file: a 0600 prompt file outside the child's empty cwd, only its path on argv, reaped after the call", async () => {
    const handle = await startFixtureRelay(fixtureAdapter("file-fixture", {
      promptTransport: "file",
      buildArguments: (_prompt, invocation) => {
        if (invocation?.promptFile === undefined) throw new Error("FIXTURE_PROMPT_FILE_MISSING");
        return ["--attach", invocation.promptFile];
      }
    }), FILE_PROBE);

    const response = await postRelay(handle, userTurn("File canary 77ad."));

    expect(response.status).toBe(200);
    const body = await response.json() as RelayBody;
    const observed = JSON.parse(body.choices[0]!.message.content) as {
      argv: string[];
      promptFile: string;
      mode: string;
      prompt: string;
      cwd: string;
      cwdEntries: string[];
    };
    expect(isAbsolute(observed.promptFile)).toBe(true);
    expect(observed.argv).toEqual(["--attach", observed.promptFile]);
    expect(observed.mode).toBe("600");
    expect(observed.prompt).toBe(renderPromptTranscript([{ role: "user", content: "File canary 77ad." }]));
    expect(observed.cwdEntries).toEqual([]);
    expect(dirname(observed.promptFile)).not.toBe(observed.cwd);
    expect(basename(dirname(observed.promptFile))).toMatch(/^relay-file-fixture-prompt-/u);
    expect(existsSync(observed.promptFile)).toBe(false);
    expect(existsSync(dirname(observed.promptFile))).toBe(false);
  });

  it("stdin: an adapter framing that throws is refused before any child exists, and its scratch is reaped", async () => {
    const { marker, probe } = await spawnMarker();
    const handle = await startFixtureRelay(fixtureAdapter("stdin-throwing-fixture", {
      promptTransport: "stdin",
      stdinPayload: () => {
        throw new Error("FIXTURE_FRAMING_FAILED");
      }
    }), probe);

    const response = await postRelay(handle, userTurn("Framing canary 5e3a."));

    // The same answer a throwing argument builder has always had.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "MALFORMED_REQUEST" });
    // The refusal does not wait on a child, so give a wrongly spawned one time to show itself.
    await delay(500);
    expect(existsSync(marker)).toBe(false);
    expect((await readdir(tmpdir())).filter((entry) => entry.startsWith("relay-stdin-throwing-fixture-")))
      .toEqual([]);
  });
});

describe("§2.2 thinking level at the relay", () => {
  const levelled = (maker: string, overrides: Partial<CliRelayAdapter> = {}): CliRelayAdapter =>
    fixtureAdapter(maker, {
      thinkingLevels: ["low", "high"],
      buildArguments: (_prompt, invocation) =>
        invocation?.thinkingLevel === undefined ? [] : ["--level", invocation.thinkingLevel],
      ...overrides
    });

  it("passes a declared level to the argument builder and echoes it as x_thinking_level", async () => {
    const handle = await startFixtureRelay(levelled("level-fixture"), ARGV_PROBE);

    const response = await postRelay(handle, userTurn("Level probe.", { x_thinking_level: "high" }));

    expect(response.status).toBe(200);
    const body = await response.json() as RelayBody;
    expect(JSON.parse(body.choices[0]!.message.content)).toEqual(["--level", "high"]);
    expect(body.x_thinking_level).toBe("high");
  });

  it("puts no level on argv and echoes DEFAULT_ONLY when none is asked and none is the default", async () => {
    const handle = await startFixtureRelay(levelled("unasked-level-fixture"), ARGV_PROBE);

    const body = await (await postRelay(handle, userTurn("Level probe."))).json() as RelayBody;

    expect(JSON.parse(body.choices[0]!.message.content)).toEqual([]);
    expect(body.x_thinking_level).toBe("DEFAULT_ONLY");
  });

  it("runs an unasked call at the adapter's explicit default and still records DEFAULT_ONLY", async () => {
    const handle = await startFixtureRelay(
      levelled("default-level-fixture", { defaultThinkingLevel: "low" }),
      ARGV_PROBE
    );

    const body = await (await postRelay(handle, userTurn("Level probe."))).json() as RelayBody;

    expect(JSON.parse(body.choices[0]!.message.content)).toEqual(["--level", "low"]);
    // DEFAULT_ONLY = "no level was asked; the connection ran at its own
    // default" — exactly what the gateway sent. Only an ASKED level is echoed.
    expect(body.x_thinking_level).toBe("DEFAULT_ONLY");
  });

  it("refuses an undeclared level with 400 before any child exists", async () => {
    const { marker, probe } = await spawnMarker();
    const declared = await startFixtureRelay(levelled("refusing-level-fixture"), probe);
    const undeclared = await startFixtureRelay(fixtureAdapter("no-level-fixture"), probe);

    for (const [handle, level] of [[declared, "medium"], [undeclared, "low"]] as const) {
      const response = await postRelay(handle, userTurn("Level probe.", { x_thinking_level: level }));
      expect(response.status, level).toBe(400);
      expect(await response.json()).toEqual({
        error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED",
        x_cli_relay_error: "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED"
      });
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses a level that is not one lower-case token as a malformed request, before spawn", async () => {
    const { marker, probe } = await spawnMarker();
    const handle = await startFixtureRelay(levelled("token-level-fixture"), probe);

    for (const level of ["HIGH", "--effort", "high low", "DEFAULT_ONLY", ""]) {
      const response = await postRelay(handle, userTurn("Level probe.", { x_thinking_level: level }));
      expect(response.status, level).toBe(400);
      expect(await response.json()).toEqual({ error: "MALFORMED_REQUEST" });
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses to start an adapter whose own declarations are inconsistent", async () => {
    for (const overrides of [
      { defaultThinkingLevel: "medium" },
      { thinkingLevels: ["High"] },
      { thinkingLevels: ["low", "low"] },
      { contextWindowTokens: 0 }
    ] satisfies readonly Partial<CliRelayAdapter>[]) {
      await expect(startCliRelayServer({
        port: 0,
        timeoutMs: 1_000,
        command: { binary: process.execPath, prefixArguments: [] },
        adapter: levelled("inconsistent-fixture", overrides)
      })).rejects.toThrow("CLI_RELAY_ADAPTER_DECLARATION_INVALID");
    }
  });
});

describe("pre-flight fix F37: a CLI's own length stop reaches the gateway as a truncation", () => {
  it("answers 200 with finish_reason \"length\" when the adapter reports it, and \"stop\" otherwise", async () => {
    for (const [finishReason, expected] of [["length", "length"], [undefined, "stop"]] as const) {
      const handle = await startFixtureRelay(fixtureAdapter(`finish-${expected}-fixture`, {
        parseCompletion: (stdout: string) => ({
          content: stdout,
          model: "fixture-model",
          usage: null,
          ...(finishReason === undefined ? {} : { finishReason })
        })
      }), 'process.stdout.write("OK");');
      const response = await postRelay(handle, userTurn("Finish probe."));
      expect(response.status).toBe(200);
      const body = await response.json() as { readonly choices: readonly { readonly finish_reason: string }[] };
      expect(body.choices[0]?.finish_reason).toBe(expected);
    }
  });
});

describe("§2.10 declared context window at the relay", () => {
  const WINDOW = 1_000;
  const MAX_TOKENS = 100;
  // ceil(content bytes / 2) + max_tokens <= window  ⇔  content bytes <= 2 × (window − max_tokens).
  // R1 (pre-flight fix F1): the message CONTENT is counted, exactly as the gateway counts it.
  const fitting = (): string => "a".repeat(2 * (WINDOW - MAX_TOKENS));

  it("answers 413 before spawning when the prompt plus the output bound cannot fit, and admits the exact boundary", async () => {
    const { marker, probe } = await spawnMarker();
    const handle = await startFixtureRelay(
      fixtureAdapter("window-fixture", { contextWindowTokens: WINDOW }),
      probe
    );

    const over = await postRelay(handle, userTurn(`${fitting()}a`, { max_tokens: MAX_TOKENS }));
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({
      error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED",
      x_cli_relay_error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED"
    });
    expect(existsSync(marker)).toBe(false);

    const boundary = await postRelay(handle, userTurn(fitting(), { max_tokens: MAX_TOKENS }));
    expect(boundary.status).toBe(200);
    expect(existsSync(marker)).toBe(true);
  });

  it("agrees with the gateway's wall to the token on a Romanian, quote- and newline-heavy packet (R1)", async () => {
    const handle = await startFixtureRelay(
      fixtureAdapter("window-agreement-fixture", { contextWindowTokens: WINDOW }),
      'process.stdout.write("OK");'
    );
    // Each line is 22 content bytes, and far more once escaped into the JSON transcript
    // (two quotes, a backslash and a newline each gain a byte, plus the envelope): a relay
    // that counted the transcript would refuse what the gateway sends.
    const line = 'Țară "ăîșțâ"\\n\n';
    const messages = [
      { role: "system", content: line.repeat(20) },
      { role: "user", content: line.repeat(20) }
    ] as const;
    expect(estimateWindowTokens(messages)).toBe(440);
    const gatewayBound = WINDOW - estimateWindowTokens(messages);
    const post = (maxTokens: number): Promise<Response> =>
      postRelay(handle, { model: "fixture-model", messages, max_tokens: maxTokens });

    // The largest bound the gateway sends is admitted; one more token is refused by both.
    expect((await post(gatewayBound)).status).toBe(200);
    const over = await post(gatewayBound + 1);
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({
      error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED",
      x_cli_relay_error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED"
    });
  });

  it("halves the SUM of the content bytes once, as the gateway does, on messages of odd byte counts (R1)", async () => {
    const handle = await startFixtureRelay(
      fixtureAdapter("window-odd-fixture", { contextWindowTokens: WINDOW }),
      'process.stdout.write("OK");'
    );
    // "Țara" is 5 UTF-8 bytes (Ț is 2) and "ăîșa" is 7. Halving the sum gives 6 tokens;
    // halving each message and adding gives 3 + 4 = 7. Only the first is the gateway's count,
    // and the even-sized packet above cannot tell the two apart.
    const messages = [
      { role: "system", content: "Țara" },
      { role: "user", content: "ăîșa" }
    ] as const;
    expect(messages.map((message) => Buffer.byteLength(message.content, "utf8"))).toEqual([5, 7]);
    expect(estimateWindowTokens(messages)).toBe(6);
    const gatewayBound = WINDOW - estimateWindowTokens(messages);
    const post = (maxTokens: number): Promise<Response> =>
      postRelay(handle, { model: "fixture-model", messages, max_tokens: maxTokens });

    expect((await post(gatewayBound)).status).toBe(200);
    const over = await post(gatewayBound + 1);
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({
      error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED",
      x_cli_relay_error: "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED"
    });
  });

  it("counts max_tokens only when it is a positive integer", async () => {
    const handle = await startFixtureRelay(
      fixtureAdapter("window-bound-fixture", { contextWindowTokens: WINDOW }),
      'process.stdout.write("OK");'
    );

    for (const extra of [{}, { max_tokens: "100" }, { max_tokens: -5 }, { max_tokens: 1.5 }]) {
      const response = await postRelay(handle, userTurn(`${fitting()}a`, extra));
      expect(response.status, JSON.stringify(extra)).toBe(200);
    }
  });

  it("never checks a window an adapter does not declare", async () => {
    const handle = await startFixtureRelay(fixtureAdapter("windowless-fixture"), 'process.stdout.write("OK");');

    const response = await postRelay(
      handle,
      userTurn("a".repeat(RELAY_MESSAGE_MAX_UTF8_BYTES), { max_tokens: 1_000_000 })
    );

    expect(response.status).toBe(200);
  });
});

describe("§2.3 reasoning tokens at the relay", () => {
  it("echoes completion_tokens_details.reasoning_tokens only when the CLI reported thinking tokens", async () => {
    const reporting = await startFixtureRelay(fixtureAdapter("reasoning-fixture", {
      parseCompletion: () => ({
        content: "OK",
        model: "fixture-model",
        usage: buildCliUsage({ promptTokens: 10, completionTokens: 4, reasoningTokens: 3 })
      })
    }), 'process.stdout.write("OK");');
    const silent = await startFixtureRelay(fixtureAdapter("silent-reasoning-fixture", {
      parseCompletion: () => ({
        content: "OK",
        model: "fixture-model",
        usage: buildCliUsage({ promptTokens: 10, completionTokens: 4 })
      })
    }), 'process.stdout.write("OK");');

    const reported = await (await postRelay(reporting, userTurn("Usage probe."))).json() as RelayBody;
    expect(reported.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 4,
      total_tokens: 14,
      completion_tokens_details: { reasoning_tokens: 3 }
    });
    const unreported = await (await postRelay(silent, userTurn("Usage probe."))).json() as RelayBody;
    expect(unreported.usage).toEqual({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
    expect(unreported.usage).not.toHaveProperty("completion_tokens_details");
  });

  it("builds usage only from the counters a CLI printed, and never invents a zero", () => {
    expect(buildCliUsage({})).toBeNull();
    expect(buildCliUsage({ promptTokens: 5 })).toEqual({ promptTokens: 5 });
    expect(buildCliUsage({ promptTokens: 5, completionTokens: 2 }))
      .toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });
    expect(buildCliUsage({ promptTokens: 5, completionTokens: 2, totalTokens: 9 }))
      .toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 9 });
    expect(buildCliUsage({ reasoningTokens: 0 })).toEqual({ reasoningTokens: 0 });
  });
});

describe("R4 usage cap at the relay", () => {
  const CAP_PROBE = 'process.stderr.write("fixture: QUOTA-EXHAUSTED\\n"); process.exitCode = 3;';
  const capAdapter = (maker: string, seen: CliFailureEvidence[]): CliRelayAdapter => fixtureAdapter(maker, {
    classifyUsageCap: (evidence) => {
      seen.push(evidence);
      return evidence.exitCode === 3 && evidence.stderr.includes("QUOTA-EXHAUSTED")
        ? "FIXTURE_USAGE_CAP"
        : null;
    }
  });

  it("answers a recognised cap with 429 and the stable x_cli_relay_error, so the runner can switch at once", async () => {
    const seen: CliFailureEvidence[] = [];
    const handle = await startFixtureRelay(capAdapter("cap-fixture", seen), CAP_PROBE);

    const response = await postRelay(handle, userTurn("Cap probe."));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "FIXTURE_USAGE_CAP",
      x_cli_relay_error: "CLI_RELAY_USAGE_CAP"
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ exitCode: 3, stdout: "", stderr: "fixture: QUOTA-EXHAUSTED\n" });
  });

  it("keeps every unrecognised non-zero exit a plain FAILED — the conservative default", async () => {
    const seen: CliFailureEvidence[] = [];
    const other = await startFixtureRelay(
      capAdapter("other-failure-fixture", seen),
      'process.stderr.write("fixture: other\\n"); process.exitCode = 3;'
    );
    const unclassified = await startFixtureRelay(fixtureAdapter("no-classifier-fixture"), CAP_PROBE);

    for (const handle of [other, unclassified]) {
      const response = await postRelay(handle, userTurn("Cap probe."));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "FIXTURE_FAILED" });
    }
  });

  it("shows the classifier at most CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES of stderr", async () => {
    const seen: CliFailureEvidence[] = [];
    const flood = `process.stderr.write("x".repeat(${CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES}) + "QUOTA-EXHAUSTED\\n"); process.exitCode = 3;`;
    const handle = await startFixtureRelay(capAdapter("flood-fixture", seen), flood);

    const response = await postRelay(handle, userTurn("Cap probe."));

    expect(response.status).toBe(502);
    expect(seen[0]!.stderr).toHaveLength(CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES);
    expect(seen[0]!.stderr).not.toContain("QUOTA-EXHAUSTED");
  });

  it("never classifies a deadline kill: a timeout stays 504", async () => {
    const seen: CliFailureEvidence[] = [];
    const handle = await startFixtureRelay(
      capAdapter("deadline-fixture", seen),
      "setTimeout(() => undefined, 2_000);",
      300
    );

    const response = await postRelay(handle, userTurn("Cap probe."));

    expect(response.status).toBe(504);
    expect(seen).toEqual([]);
  });

  it("never lets a classifier carry evidence out: a code that is not one upper-case token stays FAILED", async () => {
    // The probe prints its last argument — the prompt, on argv — to stderr, and
    // the classifier hands the evidence straight back as its "code".
    const handle = await startFixtureRelay(fixtureAdapter("leaky-classifier-fixture", {
      buildArguments: (prompt) => [prompt],
      classifyUsageCap: (evidence) => evidence.stderr
    }), "process.stderr.write(process.argv[process.argv.length - 1]); process.exitCode = 3;");

    const response = await postRelay(handle, userTurn("Evidence canary 3f9d."));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "FIXTURE_FAILED" });
    expect(text).not.toContain("Evidence canary 3f9d.");
  });
});

describe("R1: the relay speaks the gateway's own markers", () => {
  it("every refusal marker, the level token and DEFAULT_ONLY are the gateway's exact values", async () => {
    const gateway = await import("@debateai/providers");
    const kernel = await import("@debateai/kernel");
    const relay = await import("./relay-core.js");

    expect(relay.CLI_RELAY_USAGE_CAP).toBe(gateway.CLI_RELAY_USAGE_CAP);
    expect(relay.CLI_RELAY_CONTEXT_WINDOW_EXCEEDED).toBe(gateway.CLI_RELAY_CONTEXT_WINDOW_EXCEEDED);
    expect(relay.CLI_RELAY_THINKING_LEVEL_UNSUPPORTED).toBe(gateway.CLI_RELAY_THINKING_LEVEL_UNSUPPORTED);
    expect(relay.CLI_RELAY_THINKING_LEVEL_TOKEN.source).toBe(gateway.THINKING_LEVEL_TOKEN.source);
    expect(relay.CLI_RELAY_THINKING_LEVEL_TOKEN.flags).toBe(gateway.THINKING_LEVEL_TOKEN.flags);
    expect(gateway.THINKING_PARAMETERS).toContain("x_thinking_level");
    expect(kernel.THINKING_LEVEL_DEFAULT_ONLY).toBe("DEFAULT_ONLY");
  });
});

/**
 * Task A8 fix round 1 (review of a9ec7b5d). Every relay directory this core
 * makes starts `relay-<maker slug>-`, the prompt directory included, so a
 * maker name no other test's name begins with makes "nothing left behind" one
 * exact listing. No probe here echoes the environment.
 */
async function relayLeftovers(maker: string): Promise<string[]> {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith(`relay-${maker}-`));
}

describe("fix round 1: a spawn that throws synchronously is a CLI failure, and nothing is left behind", () => {
  it("answers 502 with the adapter's failure code and reaps the prompt directory (a NUL argument; nothing runs)", async () => {
    const seen: string[] = [];
    const handle = await startFixtureRelay(fixtureAdapter("nul-argument-fixture", {
      promptTransport: "file",
      buildArguments: (_prompt, invocation) => {
        const promptFile = invocation?.promptFile;
        if (promptFile === undefined) throw new Error("FIXTURE_PROMPT_FILE_MISSING");
        seen.push(promptFile);
        return ["--attach", promptFile, "bad\u0000argument"];
      }
    }), ARGV_PROBE);

    const response = await postRelay(handle, userTurn("Spawn canary 1d04."));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "FIXTURE_FAILED" });
    expect(seen).toHaveLength(1);
    expect(existsSync(dirname(seen[0]!))).toBe(false);
    expect(await relayLeftovers("nul-argument-fixture")).toEqual([]);
  });
});

describe("fix round 1: invokeCli checks an adapter's declarations itself", () => {
  it("refuses an inconsistent adapter before any directory or child exists, whoever calls it", async () => {
    const { marker, probe } = await spawnMarker();

    for (const overrides of [
      { thinkingLevels: ["low", "high"], defaultThinkingLevel: "medium" },
      { thinkingLevels: ["High"] },
      { thinkingLevels: ["low", "low"] },
      { contextWindowTokens: 0 }
    ] satisfies readonly Partial<CliRelayAdapter>[]) {
      await expect(invokeCli(
        { binary: process.execPath, prefixArguments: ["-e", probe, "--"] },
        fixtureAdapter("declaration-check-fixture", overrides),
        renderPromptTranscript([{ role: "user", content: "Declaration probe." }]),
        1_000
      ), JSON.stringify(overrides)).rejects.toThrow("CLI_RELAY_ADAPTER_DECLARATION_INVALID");
    }
    expect(existsSync(marker)).toBe(false);
    expect(await relayLeftovers("declaration-check-fixture")).toEqual([]);
  });
});

describe("fix round 1: the file transport's prompt directory is reaped on every failure path", () => {
  const recordingFileAdapter = (
    maker: string,
    seen: string[],
    overrides: Partial<CliRelayAdapter> = {}
  ): CliRelayAdapter => fixtureAdapter(maker, {
    promptTransport: "file",
    buildArguments: (_prompt, invocation) => {
      const promptFile = invocation?.promptFile;
      if (promptFile === undefined) throw new Error("FIXTURE_PROMPT_FILE_MISSING");
      seen.push(promptFile);
      return ["--attach", promptFile];
    },
    ...overrides
  });
  const expectReaped = async (maker: string, seen: readonly string[]): Promise<void> => {
    expect(seen).toHaveLength(1);
    expect(existsSync(seen[0]!)).toBe(false);
    expect(existsSync(dirname(seen[0]!))).toBe(false);
    expect(await relayLeftovers(maker)).toEqual([]);
  };

  it("after a deadline kill (504)", async () => {
    const seen: string[] = [];
    const handle = await startFixtureRelay(
      recordingFileAdapter("reap-timeout-fixture", seen),
      "setTimeout(() => undefined, 2_000);",
      300
    );

    const response = await postRelay(handle, userTurn("Reap probe."));

    expect(response.status).toBe(504);
    await expectReaped("reap-timeout-fixture", seen);
  });

  it("after a non-zero exit (502)", async () => {
    const seen: string[] = [];
    const handle = await startFixtureRelay(recordingFileAdapter("reap-exit-fixture", seen), "process.exitCode = 3;");

    const response = await postRelay(handle, userTurn("Reap probe."));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "FIXTURE_FAILED" });
    await expectReaped("reap-exit-fixture", seen);
  });

  it("after a spawn error for a program that does not exist (502; nothing runs)", async () => {
    const seen: string[] = [];
    const handle = await startCliRelayServer({
      port: 0,
      timeoutMs: 5_000,
      command: { binary: join(await pathDirectory(), "absent-cli"), prefixArguments: [] },
      adapter: recordingFileAdapter("reap-enoent-fixture", seen)
    });
    handles.push(handle);

    const response = await postRelay(handle, userTurn("Reap probe."));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "FIXTURE_FAILED" });
    await expectReaped("reap-enoent-fixture", seen);
  });

  it("after the argument builder throws (400, as a throwing builder has always answered)", async () => {
    const seen: string[] = [];
    const handle = await startFixtureRelay(recordingFileAdapter("reap-builder-fixture", seen, {
      buildArguments: (_prompt, invocation) => {
        if (invocation?.promptFile !== undefined) seen.push(invocation.promptFile);
        throw new Error("FIXTURE_ARGUMENTS_FAILED");
      }
    }), 'process.stdout.write("OK");');

    const response = await postRelay(handle, userTurn("Reap probe."));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "MALFORMED_REQUEST" });
    await expectReaped("reap-builder-fixture", seen);
  });
});

describe("fix round 1: the usage-cap code pattern is exported for adapter authors", () => {
  it("accepts one upper-case code token of at most 64 characters, and nothing else", () => {
    for (const code of ["FIXTURE_USAGE_CAP", "CLAUDE_CLI_USAGE_CAP", "A", `A${"B".repeat(63)}`]) {
      expect(CLI_RELAY_USAGE_CAP_CODE_TOKEN.test(code), code).toBe(true);
    }
    for (const code of [
      "", "fixture_usage_cap", "_USAGE_CAP", "1USAGE_CAP", "USAGE CAP", "USAGE-CAP", "USAGE_CAP\n", `A${"B".repeat(64)}`
    ]) {
      expect(CLI_RELAY_USAGE_CAP_CODE_TOKEN.test(code), JSON.stringify(code)).toBe(false);
    }
  });
});

describe("fix round 1: a stdin or file transport never puts the prompt on argv", () => {
  it("refuses, before spawning and with cleanup, an argument list that carries the prompt", async () => {
    for (const transport of ["stdin", "file"] as const) {
      const maker = `argv-law-${transport}-fixture`;
      const { marker, probe } = await spawnMarker();
      const seen: string[] = [];
      const handle = await startFixtureRelay(fixtureAdapter(maker, {
        promptTransport: transport,
        buildArguments: (prompt, invocation) => {
          if (invocation?.promptFile !== undefined) seen.push(invocation.promptFile);
          return [`--prompt=${prompt}`];
        }
      }), probe);

      const response = await postRelay(handle, userTurn("Argv canary 6c1e."));

      expect(response.status, transport).toBe(502);
      const text = await response.text();
      expect(JSON.parse(text), transport).toEqual({ error: "CLI_RELAY_PROMPT_ON_ARGV" });
      expect(text).not.toContain("Argv canary 6c1e.");
      expect(existsSync(marker), transport).toBe(false);
      expect(await relayLeftovers(maker), transport).toEqual([]);
      if (transport === "file") {
        expect(seen).toHaveLength(1);
        expect(existsSync(dirname(seen[0]!))).toBe(false);
      }
    }
  });

  it("leaves the argv transport (the four original makers) free to pass the prompt as an argument", async () => {
    const handle = await startFixtureRelay(fixtureAdapter("argv-law-argv-fixture", {
      buildArguments: (prompt) => [prompt]
    }), ARGV_PROBE);

    const response = await postRelay(handle, userTurn("Argv canary 6c1e."));

    expect(response.status).toBe(200);
    const body = await response.json() as RelayBody;
    expect(JSON.parse(body.choices[0]!.message.content))
      .toEqual([renderPromptTranscript([{ role: "user", content: "Argv canary 6c1e." }])]);
  });
});
