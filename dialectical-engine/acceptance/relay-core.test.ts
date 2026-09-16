import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLI_RELAY_STDOUT_MAX_BYTES,
  RELAY_MESSAGE_MAX_UTF8_BYTES,
  RELAY_REQUEST_MAX_BYTES,
  RELAY_REQUEST_MAX_MESSAGES,
  resolveConfiguredBinary,
  startCliRelayServer,
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

describe("D10 maker CLI binary resolution", () => {
  const DEFAULT = "/compiled/in/default/fixture-cli";
  const KEY = "ACCEPTANCE_FIXTURE_BINARY";
  const CODE = "FIXTURE_CLI_BINARY_UNRESOLVED";

  it("returns the compiled-in default when the maker's key is absent", () => {
    expect(resolveConfiguredBinary(DEFAULT, KEY, CODE, {})).toBe(DEFAULT);
  });

  it("returns the host binary named by the maker's key, surrounding whitespace removed", () => {
    expect(resolveConfiguredBinary(DEFAULT, KEY, CODE, {
      [KEY]: "  /host/bin/fixture-cli\n"
    })).toBe("/host/bin/fixture-cli");
  });

  it("fails loudly on a present-but-blank key instead of falling back to another machine's path", () => {
    expect(() => resolveConfiguredBinary(DEFAULT, KEY, CODE, { [KEY]: "" })).toThrow(CODE);
    expect(() => resolveConfiguredBinary(DEFAULT, KEY, CODE, { [KEY]: " \t " })).toThrow(CODE);
  });

  it("reads only its own maker's key", () => {
    expect(resolveConfiguredBinary(DEFAULT, KEY, CODE, {
      ACCEPTANCE_OTHER_BINARY: "/host/bin/other-cli"
    })).toBe(DEFAULT);
  });
});
