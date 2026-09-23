import { createHash } from "node:crypto";
import { lstat,mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach,describe,expect,it } from "vitest";
import { CliRelayFailure } from "./relay-core.js";
import {
  HERMES_BINARY_NAME,
  HERMES_GLM_MODEL,
  HERMES_SUPPORT_PROVIDER_REF,
  resolveHermesBinary,
  startHermesSupportRelay,
  type HermesSupportRelayHandle
} from "./hermes-relay.js";

const fakeCli = fileURLToPath(new URL("./test-fixtures/fake-hermes-cli.mjs",import.meta.url));
const handles: HermesSupportRelayHandle[] = [];
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(),"relay-hermes-path-"));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * W6 fix round 1 / F4: a credential-shaped key's VALUE is never echoed by the
 * fixture — it emits this one-way digest instead. Rule in
 * `test-fixtures/fake-claude-cli.mjs:44-58`; restated rather than imported so a
 * broken producer helper cannot be agreed with (TOOLING-TRAPS `:1320`).
 */
function digestOf(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0,16)}`;
}

async function start(
  developmentStackProfile?: "support-preview"
): Promise<HermesSupportRelayHandle> {
  const handle = await startHermesSupportRelay({
    port: 0,
    timeoutMs: 1_000,
    ...(developmentStackProfile === undefined ? {} : { developmentStackProfile }),
    testOnlyCommand: { binary: process.execPath,prefixArguments: [fakeCli] },
    testOnlyGlmApiKey: "zai-test-only"
  });
  handles.push(handle);
  return handle;
}

afterEach(async () => {
  delete process.env.FAKE_HERMES_FAIL;
  delete process.env.FAKE_HERMES_BAD_HANDSHAKE;
  delete process.env.ACCEPTANCE_HERMES_BINARY;
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path,{ recursive: true,force: true })
  ));
});

describe("Support-only Hermes GLM relay",() => {
  it("pins direct Z.AI GLM 5.3 Flash with no tools, user config, rules, or persistent home",async () => {
    process.env.DATABASE_URL = "postgresql://must-not-reach-hermes";
    process.env.ANTHROPIC_API_KEY = "must-not-reach-hermes";
    const relay = await start();
    const response = await fetch(`${relay.baseUrl}/v1/chat/completions`,{
      method: "POST",
      headers: { "content-type": "application/json",authorization: relay.authorizationHeader },
      body: JSON.stringify({ model: HERMES_GLM_MODEL,messages: [{ role: "user",content: "Help me" }] })
    });
    expect(response.status).toBe(200);
    const completion = await response.json() as {
      model: string;
      maker: string;
      choices: readonly { message: { content: string } }[];
    };
    expect(completion.model).toBe(HERMES_GLM_MODEL);
    expect(completion.maker).toBe("Z.AI");
    const observed = JSON.parse(completion.choices[0]!.message.content) as {
      prompt: string;
      argumentList: readonly string[];
      environment: Readonly<Record<string,string>>;
      environmentKeyNames: readonly string[];
    };
    expect(observed.argumentList).toEqual([
      "--provider","zai",
      "--model","glm-5.3-flash",
      "--toolsets","context_engine",
      "--ignore-user-config",
      "--ignore-rules",
      "-z",observed.prompt
    ]);
    expect(JSON.parse(observed.prompt)).toEqual({
      format: "debateai.relay-messages.v1",
      messages: [{ role: "user",content: "Help me" }]
    });
    // W6/F4: `GLM_API_KEY` is credential-shaped, so the fixture emits a digest
    // of the key the relay injected rather than the key. This still proves the
    // relay passed THE configured GLM credential and nothing else. `HERMES_HOME`
    // and `HOME` below are paths, match no credential segment, and stay in clear
    // — the `lstat` on the next-but-four line depends on that.
    expect(observed.environment.GLM_API_KEY).toBe(digestOf("zai-test-only"));
    expect(observed.environment.OPENROUTER_API_KEY).toBeUndefined();
    expect(observed.environment.HERMES_HOME).toMatch(/[/\\]relay-z-ai-[^/\\]+$/u);
    expect(observed.environment.HOME).toBe(observed.environment.HERMES_HOME);
    expect(observed.environment.PWD).toBe(observed.environment.HERMES_HOME);
    expect(observed.environment.DATABASE_URL).toBeUndefined();
    expect(observed.environment.ANTHROPIC_API_KEY).toBeUndefined();
    await expect(lstat(observed.environment.HERMES_HOME!)).rejects.toMatchObject({ code: "ENOENT" });
    // W6 fix round 1 / F3. The assertions above read the fixture's allow-listed
    // PROJECTION, so alone they can only see keys the fixture NAMES. The fixture
    // also emits the full key-NAME list — names are not credentials — and this
    // assertion refuses any key the relay admits beyond the permitted set.
    // Unlike the claude, grok and corpus cases this suite does not OWN the
    // parent environment: `HOME`, `PATH`, `TMPDIR` and `LANG` are copied from
    // the operator's shell when present (`acceptance/relay-core.ts:69`), so an
    // exact-set assertion here would pass or fail on the host rather than on the
    // relay. Refusing the complement is host-independent and still catches a
    // leak, which an exact set pinned to a superset would not.
    expect(observed.environmentKeyNames.filter((key) => ![
      "GLM_API_KEY","HERMES_HOME","HOME","LANG","OLDPWD","PATH","PWD","TMPDIR",
      "FAKE_HERMES_FAIL","FAKE_HERMES_BAD_HANDSHAKE","__CF_USER_TEXT_ENCODING"
    ].includes(key))).toEqual([]);
  });

  it("exposes one support-only identity without joining the debate provider roster",async () => {
    const relay = await start();
    expect(relay).toMatchObject({
      providerRef: HERMES_SUPPORT_PROVIDER_REF,
      model: HERMES_GLM_MODEL,
      maker: "Z.AI"
    });
    expect(JSON.parse(relay.targetJson)).toEqual({
      provider_ref: HERMES_SUPPORT_PROVIDER_REF,
      base_url: `${relay.baseUrl}/v1`,
      model: HERMES_GLM_MODEL,
      authorization_header: relay.authorizationHeader
    });
  });

  it("marks only the selected support-preview target",async () => {
    const relay = await start("support-preview");
    expect(JSON.parse(relay.targetJson)).toEqual({
      provider_ref: HERMES_SUPPORT_PROVIDER_REF,
      base_url: `${relay.baseUrl}/v1`,
      model: HERMES_GLM_MODEL,
      authorization_header: relay.authorizationHeader,
      development_stack_profile: "support-preview"
    });
  });

  it("fails closed when Hermes fails or does not answer the exact handshake",async () => {
    process.env.FAKE_HERMES_FAIL = "1";
    await expect(start()).rejects.toThrow("HERMES_CLI_FAILED");
    delete process.env.FAKE_HERMES_FAIL;
    process.env.FAKE_HERMES_BAD_HANDSHAKE = "1";
    await expect(start()).rejects.toThrow("HERMES_CLI_HANDSHAKE_INVALID");
  });
});

/**
 * D10, 2026-09-17. Hermes was the ONE maker with no resolver at all: its binary
 * was `join(homedir(),".local","bin","hermes")`, computed once at module load
 * and handed to `resolveTestGuardedCommand` EAGERLY. It now goes through the
 * same resolver as the other three — by NAME over the PATH it is handed, with
 * the operator's key ahead of that. Resolution only: nothing below runs a
 * candidate, and the refusals are read off the thrown code.
 */
describe("D10 Hermes support relay binary resolution",() => {
  it("carries no compiled-in path: this maker is found by the NAME `hermes`",() => {
    expect(HERMES_BINARY_NAME).toBe("hermes");
    expect(() => resolveHermesBinary({}))
      .toThrow("HERMES_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:hermes");
  });

  it("discovers `hermes` on the PATH it is handed, and refuses a corrupted launcher there",async () => {
    const directory = await temporaryDirectory();
    const program = join(directory,"hermes");
    await writeFile(program,"#!/bin/sh\nexit 0\n",{ mode: 0o755 });

    expect(resolveHermesBinary({ PATH: directory })).toBe(program);

    await writeFile(program,"hermes\nupdate interrupted\nretry the install\n");
    expect(() => resolveHermesBinary({ PATH: directory }))
      .toThrow(`HERMES_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:${program}`);
  });

  it("resolves this host's binary from ACCEPTANCE_HERMES_BINARY, ahead of PATH",async () => {
    const onPath = await temporaryDirectory();
    await writeFile(join(onPath,"hermes"),"#!/bin/sh\nexit 0\n",{ mode: 0o755 });
    const chosen = join(await temporaryDirectory(),"hermes-host");
    await writeFile(chosen,"#!/bin/sh\nexit 0\n",{ mode: 0o755 });

    expect(resolveHermesBinary({ PATH: onPath,ACCEPTANCE_HERMES_BINARY: chosen })).toBe(chosen);
  });

  it("fails loudly with the bare typed code when ACCEPTANCE_HERMES_BINARY is present but blank",() => {
    expect(() => resolveHermesBinary({ ACCEPTANCE_HERMES_BINARY: "  " }))
      .toThrow(/^HERMES_CLI_BINARY_UNRESOLVED$/u);
  });

  /**
   * The default command must become LAZY with this change. A resolver that can
   * throw, evaluated eagerly, would let a blank key — or simply a host with no
   * `hermes` — pre-empt `resolveTestGuardedCommand`'s own authority over the
   * test seam; that function's own doc block states the rule for every maker.
   */
  it("keeps the NODE_ENV=test command seam ahead of a blank override",async () => {
    process.env.ACCEPTANCE_HERMES_BINARY = "  ";

    const relay = await start();

    expect(relay.model).toBe(HERMES_GLM_MODEL);
  });

  /**
   * This maker's START path has a caller outside `acceptance/` —
   * `startSupportModelRelay` in the dev auth stack — which supplies no test seam,
   * so the default thunk runs there. Before the resolver could refuse at all, an
   * unresolvable hermes reached `spawn` and failed as
   * `CliRelayFailure("FAILED", HERMES_CLI_FAILED)`. `discovery.ts`'s probe
   * RE-THROWS anything that is not a `CliRelayFailure` instead of recording an
   * ABSENT probe, so changing the failure CLASS here would turn a graceful
   * degradation into an unhandled error on a host with no hermes installed. The
   * class is preserved; the typed resolver message rides inside it, so the reason
   * and the path still reach the log.
   */
  it("refuses the START path as a CliRelayFailure carrying the typed resolver message",async () => {
    delete process.env.ACCEPTANCE_HERMES_BINARY;
    const empty = await temporaryDirectory();
    const previousPath = process.env.PATH;
    process.env.PATH = empty;
    try {
      const rejection: unknown = await startHermesSupportRelay({
        port: 0,
        timeoutMs: 1_000,
        testOnlyGlmApiKey: "zai-test-only"
      }).then(() => null,(error: unknown) => error);

      expect(rejection).toBeInstanceOf(CliRelayFailure);
      expect((rejection as CliRelayFailure).kind).toBe("FAILED");
      expect((rejection as Error).message)
        .toBe("HERMES_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:hermes");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });
});
