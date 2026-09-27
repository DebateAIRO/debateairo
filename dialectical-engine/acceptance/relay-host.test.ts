import { chmodSync, existsSync, readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  main,
  parseRelayHostArguments,
  RELAY_HOST_DEFAULT_ENDPOINTS_PATH,
  serveRelayHost,
  type RelayHostEndpoint,
  type RelayHostHandle,
  type RelayHostSeams
} from "./relay-host.js";

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./test-fixtures/${name}`, import.meta.url));
const nodeCommand = (name: string) => ({ binary: process.execPath, prefixArguments: [fixture(name)] });
const SEAMS: RelayHostSeams = Object.freeze({
  commands: Object.freeze({
    claude: nodeCommand("fake-claude-cli.mjs"),
    codex: nodeCommand("fake-codex-cli.mjs"),
    grok: nodeCommand("fake-grok-cli.mjs"),
    agy: nodeCommand("fake-agy-cli.mjs"),
    pi: nodeCommand("fake-pi-cli.mjs")
  }),
  codexSessionsRoot: fileURLToPath(new URL("./test-fixtures/codex-sessions", import.meta.url))
});
const LOCAL = Object.freeze({ NODE_ENV: "test" });
const PI_CANDIDATE = Object.freeze({
  providerRef: "local:pi-glm", tool: "pi", modelId: "glm-5.3-flash", thinkingLevels: ["low", "high"]
});
const ALL_FIVE = Object.freeze([
  { providerRef: "local:claude", tool: "claude", modelId: "claude-fake-cli-model", thinkingLevels: ["high"] },
  { providerRef: "local:codex", tool: "codex", modelId: "gpt-5.6-sol", thinkingLevels: ["low", "high"] },
  { providerRef: "local:grok", tool: "grok", modelId: "grok-fake-cli-model", thinkingLevels: [] },
  { providerRef: "local:agy", tool: "agy", modelId: "gemini-3.8-flash", thinkingLevels: ["low", "high"] },
  PI_CANDIDATE
]);

const hosts: RelayHostHandle[] = [];
const temporaryDirectories: string[] = [];

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "relay-host-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function candidatesFile(directory: string, candidates: readonly unknown[]): Promise<string> {
  const path = join(directory, "candidates.json");
  await writeFile(path, JSON.stringify({ candidates }), "utf8");
  return path;
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function hostBinary(directory: string, name: string, fixturePath: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(
    path,
    `#!/bin/sh\nexec ${posixQuote(process.execPath)} ${posixQuote(fixturePath)} "$@"\n`,
    { mode: 0o755 }
  );
  return path;
}

/**
 * Loopback servers this process is listening on: every started relay is one. A
 * closed server's handle leaves this list one loop turn after its `close` event,
 * so callers poll it.
 */
function listeningServers(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === "TCPServerWrap").length;
}

/** Child processes this process has running: a relay spawns one CLI per call. */
function childProcesses(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === "ProcessWrap").length;
}

/** A stand-in work tree (it holds `.git`) with the engine one level down, as in this repository. */
async function workTree(): Promise<{ readonly tree: string; readonly engine: string }> {
  const tree = await workspace();
  await mkdir(join(tree, ".git"));
  const engine = join(tree, "engine");
  await mkdir(engine);
  return { tree, engine };
}

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("relays:serve — the local relay host for step replay (§2.9/§2.10)", () => {
  it("refuses in the HOSTED deployment, and in a production that names none, before reading a file", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const absentCandidates = join(directory, "absent-candidates.json");

    await expect(serveRelayHost({
      candidatesPath: absentCandidates,
      endpointsPath,
      environment: { DEBATEAI_DEPLOYMENT_MODE: "hosted" },
      seams: SEAMS
    })).rejects.toThrow("RELAY_HOST_REFUSED_IN_HOSTED");
    await expect(serveRelayHost({
      candidatesPath: absentCandidates,
      endpointsPath,
      environment: { NODE_ENV: "production" },
      seams: SEAMS
    })).rejects.toThrow("DEPLOYMENT_MODE_UNRESOLVED");
    // Fix round 1: a mode the engine does not know is refused too, never read as local.
    await expect(serveRelayHost({
      candidatesPath: absentCandidates,
      endpointsPath,
      environment: { DEBATEAI_DEPLOYMENT_MODE: "staging", NODE_ENV: "development" },
      seams: SEAMS
    })).rejects.toThrow("DEPLOYMENT_MODE_INVALID");
    expect(existsSync(endpointsPath)).toBe(false);
  });

  it("starts one relay per candidate and writes a 0600 endpoints file the replay tool can use as is", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const emitted: string[] = [];

    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, ALL_FIVE),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      timeoutMs: 5_000,
      emit: (line) => { emitted.push(line); }
    });
    hosts.push(host);

    expect(((await stat(endpointsPath)).mode & 0o777).toString(8)).toBe("600");
    const written = JSON.parse(await readFile(endpointsPath, "utf8")) as { relays: RelayHostEndpoint[] };
    expect(written.relays).toEqual(host.endpoints);
    expect(written.relays.map(({ providerRef, maker, tool, modelId, thinkingLevels, contextWindowTokens }) => ({
      providerRef, maker, tool, modelId, thinkingLevels, contextWindowTokens
    }))).toEqual([
      { providerRef: "local:claude", maker: "Anthropic", tool: "claude", modelId: "claude-fake-cli-model", thinkingLevels: ["high"], contextWindowTokens: null },
      { providerRef: "local:codex", maker: "OpenAI", tool: "codex", modelId: "gpt-5.6-sol", thinkingLevels: ["low", "high"], contextWindowTokens: null },
      { providerRef: "local:grok", maker: "xAI", tool: "grok", modelId: "grok-fake-cli-model", thinkingLevels: [], contextWindowTokens: null },
      { providerRef: "local:agy", maker: "Google", tool: "agy", modelId: "gemini-3.8-flash", thinkingLevels: ["low", "high"], contextWindowTokens: null },
      { providerRef: "local:pi-glm", maker: "Z.AI", tool: "pi", modelId: "glm-5.3-flash", thinkingLevels: ["low", "high"], contextWindowTokens: 1_000_000 }
    ]);
    for (const relay of written.relays) {
      expect(relay.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:[0-9]+\/v1$/u);
      expect(relay.bearerToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    }
    expect(new Set(written.relays.map(({ baseUrl }) => baseUrl)).size).toBe(5);
    expect(emitted.at(-1)).toBe(`RELAYS SERVING 5 ${endpointsPath}`);
    // F37: one overhead line per relay, attributed to its candidate, in candidate order.
    expect(emitted.slice(0, -1).map((line) => line.split(" ").slice(0, 4).join(" "))).toEqual([
      "RELAY OVERHEAD Anthropic local:claude",
      "RELAY OVERHEAD OpenAI local:codex",
      "RELAY OVERHEAD xAI local:grok",
      "RELAY OVERHEAD Google local:agy",
      "RELAY OVERHEAD Z.AI local:pi-glm"
    ]);

    const pi = written.relays.find(({ tool }) => tool === "pi")!;
    const response = await fetch(`${pi.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pi.bearerToken}` },
      body: JSON.stringify({
        model: pi.modelId,
        x_thinking_level: "low",
        messages: [{ role: "user", content: "Replay probe." }]
      })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ model: "glm-5.3-flash", maker: "Z.AI", x_thinking_level: "low" });
  });

  it("stops every relay and removes the endpoints file", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: () => undefined
    });
    const { baseUrl } = host.endpoints[0]!;

    const stopping = host.stop();
    // Fix round 1: the bearers go first — gone on the call, before any relay close is awaited.
    expect(existsSync(endpointsPath)).toBe(false);
    await stopping;

    expect(existsSync(endpointsPath)).toBe(false);
    await expect(fetch(`${baseUrl}/chat/completions`, { method: "POST" })).rejects.toThrow();
  });

  it("closes every started relay when emit throws on a RELAY ABSENT line", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const before = listeningServers();

    await expect(serveRelayHost({
      candidatesPath: await candidatesFile(directory, [
        { providerRef: "local:claude", tool: "claude", modelId: "claude-other-model", thinkingLevels: [] },
        PI_CANDIDATE
      ]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: (line) => { if (line.startsWith("RELAY ABSENT")) throw new Error("EMIT_BROKEN"); }
    })).rejects.toThrow("EMIT_BROKEN");

    // pi had started before the line was emitted; it is closed, not stranded.
    await expect.poll(() => listeningServers()).toBe(before);
    expect(existsSync(endpointsPath)).toBe(false);
  });

  it("removes the endpoints file and closes every relay when emit throws on RELAYS SERVING", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const before = listeningServers();
    let served: RelayHostEndpoint[] = [];

    await expect(serveRelayHost({
      candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: (line) => {
        // D8 (Task A12b): the informational overhead lines come first; this case is about RELAYS SERVING.
        if (line.startsWith("RELAY OVERHEAD ")) return;
        served = (JSON.parse(readFileSync(endpointsPath, "utf8")) as { relays: RelayHostEndpoint[] }).relays;
        throw new Error(`EMIT_BROKEN ${line.split(" ")[0]}`);
      }
    })).rejects.toThrow("EMIT_BROKEN RELAYS");

    expect(served).toHaveLength(1);
    expect(existsSync(endpointsPath)).toBe(false);
    await expect.poll(() => listeningServers()).toBe(before);
    await expect(fetch(`${served[0]!.baseUrl}/chat/completions`, { method: "POST" })).rejects.toThrow();
  });

  it("rejects stop() with RELAY_HOST_ENDPOINTS_REMOVE_FAILED when the file cannot go, and still closes every relay", async () => {
    const directory = await workspace();
    const endpointsDirectory = join(directory, "endpoints");
    await mkdir(endpointsDirectory);
    const endpointsPath = join(endpointsDirectory, "endpoints.json");
    const before = listeningServers();
    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: () => undefined
    });
    const { baseUrl } = host.endpoints[0]!;
    await chmod(endpointsDirectory, 0o500);
    try {
      // A12 review carry-over (Task A12b): the code first, then the path, so the operator can delete it.
      await expect(host.stop()).rejects.toThrow(`RELAY_HOST_ENDPOINTS_REMOVE_FAILED ${endpointsPath}`);

      expect(existsSync(endpointsPath)).toBe(true);
      await expect.poll(() => listeningServers()).toBe(before);
      await expect(fetch(`${baseUrl}/chat/completions`, { method: "POST" })).rejects.toThrow();
    } finally {
      await chmod(endpointsDirectory, 0o700);
    }
  });

  it("names a start-up deletion that failed, and still throws the original error", async () => {
    const directory = await workspace();
    const before = listeningServers();
    const locked: string[] = [];
    /** Serves pi, then fails its RELAYS SERVING emit with the file written and undeletable. */
    const attempt = async (name: string, emitAlwaysFails: boolean) => {
      const endpointsDirectory = join(directory, name);
      await mkdir(endpointsDirectory);
      const endpointsPath = join(endpointsDirectory, "endpoints.json");
      const lines: string[] = [];
      const failure = await serveRelayHost({
        candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
        endpointsPath,
        environment: LOCAL,
        seams: SEAMS,
        emit: (line) => {
          // D8 (Task A12b): the informational overhead lines come first; this case is about the lines after them.
          if (line.startsWith("RELAY OVERHEAD ")) return;
          lines.push(line);
          if (line.startsWith("RELAYS SERVING")) {
            // The file is written; from here on the cleanup cannot delete it.
            chmodSync(endpointsDirectory, 0o500);
            locked.push(endpointsDirectory);
            throw new Error("EMIT_BROKEN RELAYS SERVING");
          }
          if (emitAlwaysFails) throw new Error("EMIT_BROKEN AGAIN");
        }
      }).then(() => null, (error: unknown) => error);
      return { endpointsPath, lines, failure };
    };
    try {
      const reported = await attempt("reported", false);
      expect(reported.failure).toEqual(new Error("EMIT_BROKEN RELAYS SERVING"));
      expect(reported.lines).toEqual([
        `RELAYS SERVING 1 ${reported.endpointsPath}`,
        `RELAY_HOST_ENDPOINTS_REMOVE_FAILED ${reported.endpointsPath}`
      ]);
      expect(existsSync(reported.endpointsPath)).toBe(true);
      await expect.poll(() => listeningServers()).toBe(before);

      // An emit that fails on that line too cannot replace the original error.
      const unreported = await attempt("unreported", true);
      expect(unreported.failure).toEqual(new Error("EMIT_BROKEN RELAYS SERVING"));
      expect(unreported.lines).toEqual([
        `RELAYS SERVING 1 ${unreported.endpointsPath}`,
        `RELAY_HOST_ENDPOINTS_REMOVE_FAILED ${unreported.endpointsPath}`
      ]);
      await expect.poll(() => listeningServers()).toBe(before);
    } finally {
      for (const lockedDirectory of locked) await chmod(lockedDirectory, 0o700);
    }
  });

  it("serves the candidates that started and names each one that did not", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const emitted: string[] = [];

    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [
        { providerRef: "local:claude", tool: "claude", modelId: "claude-other-model", thinkingLevels: [] },
        { providerRef: "local:grok", tool: "grok", modelId: "grok-fake-cli-model", thinkingLevels: ["max"] },
        PI_CANDIDATE
      ]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: (line) => { emitted.push(line); }
    });
    hosts.push(host);

    expect(emitted.filter((line) => !line.startsWith("RELAY OVERHEAD "))).toEqual([
      "RELAY ABSENT local:claude RELAY_HOST_MODEL_MISMATCH",
      "RELAY ABSENT local:grok RELAY_HOST_THINKING_LEVEL_UNSUPPORTED",
      `RELAYS SERVING 1 ${endpointsPath}`
    ]);
    expect(emitted.filter((line) => line.startsWith("RELAY OVERHEAD ")).map((line) => line.split(" ").slice(0, 4).join(" ")))
      .toEqual(["RELAY OVERHEAD Z.AI local:pi-glm"]);
    expect(host.endpoints.map(({ providerRef }) => providerRef)).toEqual(["local:pi-glm"]);
  });

  it("refuses when no candidate starts, and writes no endpoints file", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");

    await expect(serveRelayHost({
      candidatesPath: await candidatesFile(directory, [
        { providerRef: "local:claude", tool: "claude", modelId: "claude-other-model", thinkingLevels: [] }
      ]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: () => undefined
    })).rejects.toThrow("RELAY_HOST_NO_RELAY_STARTED");
    expect(existsSync(endpointsPath)).toBe(false);
  });

  it("refuses a malformed candidates file before starting anything", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const refused = async (content: unknown, code: string): Promise<void> => {
      const path = join(directory, "candidates.json");
      await writeFile(path, JSON.stringify(content), "utf8");
      await expect(serveRelayHost({
        candidatesPath: path, endpointsPath, environment: LOCAL, seams: SEAMS, emit: () => undefined
      }), JSON.stringify(content)).rejects.toThrow(code);
    };

    await refused({ candidates: [] }, "RELAY_HOST_CANDIDATES_INVALID");
    await refused({ candidates: [{ ...PI_CANDIDATE, extra: true }] }, "RELAY_HOST_CANDIDATES_INVALID");
    await refused({ candidates: [PI_CANDIDATE, PI_CANDIDATE] }, "RELAY_HOST_CANDIDATES_INVALID");
    await refused({ candidates: [{ ...PI_CANDIDATE, tool: "gemini" }] }, "RELAY_HOST_CANDIDATES_INVALID");
    await refused({ candidates: [{ ...PI_CANDIDATE, thinkingLevels: ["--effort"] }] }, "RELAY_HOST_CANDIDATES_INVALID");
    await refused({ candidates: [{ ...PI_CANDIDATE, thinkingLevels: ["low", "low"] }] }, "RELAY_HOST_CANDIDATES_INVALID");
    // agy's level IS its id suffix, so an agy candidate must name at least one.
    await refused(
      { candidates: [{ providerRef: "local:agy", tool: "agy", modelId: "gemini-3.8-flash", thinkingLevels: [] }] },
      "RELAY_HOST_CANDIDATES_INVALID"
    );
    await expect(serveRelayHost({
      candidatesPath: join(directory, "absent.json"), endpointsPath, environment: LOCAL, seams: SEAMS
    })).rejects.toThrow("RELAY_HOST_CANDIDATES_UNREADABLE");
    expect(existsSync(endpointsPath)).toBe(false);
  });

  it("parses its command line, tolerating the -- that pnpm forwards", () => {
    expect(parseRelayHostArguments(["--candidates", "c.json", "--endpoints", "e.json"]))
      .toEqual({ candidatesPath: "c.json", endpointsPath: "e.json" });
    // Fix round 1: --endpoints is optional; the host then uses its .local/ default.
    expect(parseRelayHostArguments(["--candidates", "c.json"])).toEqual({ candidatesPath: "c.json" });
    expect(parseRelayHostArguments([
      "--", "--candidates", "c.json", "--endpoints", "e.json", "--timeout-ms", "90000"
    ])).toEqual({ candidatesPath: "c.json", endpointsPath: "e.json", timeoutMs: 90_000 });
    for (const argv of [
      [],
      ["--endpoints", "e.json"],
      ["--candidates", "c.json", "--endpoints"],
      ["--candidates", "c.json", "--endpoints", "e.json", "--port", "1"],
      ["--candidates", "c.json", "--candidates", "d.json", "--endpoints", "e.json"],
      ["--candidates", "c.json", "--endpoints", "e.json", "--timeout-ms", "0"],
      ["--candidates", "--endpoints", "e.json"]
    ]) {
      expect(() => parseRelayHostArguments(argv), argv.join(" ")).toThrow("RELAY_HOST_ARGUMENTS_INVALID");
    }
  });

  it("runs until SIGTERM, then closes its relays and removes the endpoints file (the CLI path)", async () => {
    const directory = await workspace();
    const wrapper = await hostBinary(directory, "pi", fixture("fake-pi-cli.mjs"));
    const candidatesPath = await candidatesFile(directory, [PI_CANDIDATE]);
    const endpointsPath = join(directory, "endpoints.json");
    const previous = process.env.ACCEPTANCE_PI_BINARY;
    process.env.ACCEPTANCE_PI_BINARY = wrapper;
    const signals = new EventEmitter();
    try {
      // No seams: main is the production entry. The pi key points at the fake,
      // so the DEFAULT command path is exercised without a live call.
      const running = main(
        ["--candidates", candidatesPath, "--endpoints", endpointsPath, "--timeout-ms", "10000"],
        signals,
        LOCAL
      );
      await expect.poll(() => existsSync(endpointsPath), { timeout: 15_000 }).toBe(true);
      const written = JSON.parse(await readFile(endpointsPath, "utf8")) as { relays: RelayHostEndpoint[] };
      expect(written.relays.map(({ modelId }) => modelId)).toEqual(["glm-5.3-flash"]);

      signals.emit("SIGTERM");
      await running;

      expect(existsSync(endpointsPath)).toBe(false);
      await expect(fetch(`${written.relays[0]!.baseUrl}/chat/completions`, { method: "POST" })).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_PI_BINARY;
      else process.env.ACCEPTANCE_PI_BINARY = previous;
    }
  });

  it("writes to the .local/ default when no endpoints path is given", async () => {
    const { tree, engine } = await workTree();
    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(tree, [PI_CANDIDATE]),
      environment: LOCAL,
      seams: { ...SEAMS, repositoryRoot: engine },
      emit: () => undefined
    });
    hosts.push(host);
    const endpointsPath = join(engine, RELAY_HOST_DEFAULT_ENDPOINTS_PATH);

    expect(RELAY_HOST_DEFAULT_ENDPOINTS_PATH).toBe(".local/relays/endpoints.json");
    expect(((await stat(endpointsPath)).mode & 0o777).toString(8)).toBe("600");
    expect(((await stat(join(engine, ".local", "relays"))).mode & 0o777).toString(8)).toBe("700");
    await host.stop();
    expect(existsSync(endpointsPath)).toBe(false);
  });

  it("refuses an endpoints path in the tracked tree, before it reads a file or starts a CLI", async () => {
    const { tree, engine } = await workTree();
    const absentCandidates = join(tree, "absent-candidates.json");
    const outsideLink = join(await workspace(), "into-the-tree");
    await symlink(tree, outsideLink);
    const refused = async (endpointsPath: string): Promise<void> => {
      await expect(serveRelayHost({
        candidatesPath: absentCandidates,
        endpointsPath,
        environment: LOCAL,
        seams: { ...SEAMS, repositoryRoot: engine },
        emit: () => undefined
      }), endpointsPath).rejects.toThrow("RELAY_HOST_ENDPOINTS_PATH_REFUSED");
    };

    await refused(join(engine, "endpoints.json"));
    await refused(join(engine, "nested", "endpoints.json"));
    // The boundary is the WORK TREE (it holds .git), not only the engine directory.
    await refused(join(tree, "endpoints.json"));
    await refused(join(tree, ".local"));
    await refused(join(outsideLink, "engine", "endpoints.json"));
    expect(existsSync(join(engine, "nested"))).toBe(false);
    // Anywhere under a .local/ directory is git-ignored, and so admitted: the
    // refusal it meets is the absent candidates file, one step later.
    await expect(serveRelayHost({
      candidatesPath: absentCandidates,
      endpointsPath: join(engine, "deep", ".local", "endpoints.json"),
      environment: LOCAL,
      seams: { ...SEAMS, repositoryRoot: engine }
    })).rejects.toThrow("RELAY_HOST_CANDIDATES_UNREADABLE");
  });

  it("refuses a tracked path spelled in another letter case, on a case-insensitive volume", async (context) => {
    // Fix round 2: a folder ABOVE the work tree spelled in another case used to
    // compare as "outside" the tree and be admitted, bearers and all.
    const outer = join(await workspace(), "CaseFold");
    const tree = join(outer, "Tree");
    const engine = join(tree, "engine");
    await mkdir(join(tree, ".git"), { recursive: true });
    await mkdir(engine);
    const flippedOuter = join(dirname(outer), "cASEfOLD");
    // The probe: on a case-sensitive volume the flipped spelling names no folder at all.
    if (!existsSync(flippedOuter)) {
      context.skip("the temporary volume is case-sensitive: there a flipped-case path is a different path");
    }
    const refused = async (endpointsPath: string): Promise<void> => {
      await expect(serveRelayHost({
        candidatesPath: join(tree, "absent-candidates.json"),
        endpointsPath,
        environment: LOCAL,
        seams: { ...SEAMS, repositoryRoot: engine },
        emit: () => undefined
      }), endpointsPath).rejects.toThrow("RELAY_HOST_ENDPOINTS_PATH_REFUSED");
    };

    await refused(join(flippedOuter, "Tree", "engine", "endpoints.json"));
    await refused(join(outer, "tREE", "engine", "endpoints.json"));
    await refused(join(outer, "Tree", "ENGINE", "endpoints.json"));
  });

  it("refuses a bare endpoints file name, which would resolve into this repository's tracked tree", async () => {
    // No repositoryRoot seam: the module's OWN engine root and work tree decide.
    // Relative paths resolve from the cwd, which is the engine root here, as under `pnpm run`.
    await expect(serveRelayHost({
      candidatesPath: join(await workspace(), "absent-candidates.json"),
      endpointsPath: "relay-endpoints-must-not-exist.json",
      environment: LOCAL,
      seams: SEAMS
    })).rejects.toThrow("RELAY_HOST_ENDPOINTS_PATH_REFUSED");
    expect(existsSync("relay-endpoints-must-not-exist.json")).toBe(false);
  });

  it("refuses the repository-root seam outside NODE_ENV=test", async () => {
    const { engine } = await workTree();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await expect(serveRelayHost({
        candidatesPath: join(engine, "absent.json"),
        environment: { NODE_ENV: "development" },
        seams: { repositoryRoot: engine }
      })).rejects.toThrow("RELAY_HOST_TEST_ONLY_REPOSITORY_ROOT_FORBIDDEN");
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("cleans up after a SIGINT that arrives during start-up (the CLI path)", async () => {
    const directory = await workspace();
    const wrapper = await hostBinary(directory, "pi", fixture("fake-pi-cli.mjs"));
    const candidatesPath = await candidatesFile(directory, [PI_CANDIDATE]);
    const endpointsPath = join(directory, "endpoints.json");
    const previous = process.env.ACCEPTANCE_PI_BINARY;
    process.env.ACCEPTANCE_PI_BINARY = wrapper;
    const signals = new EventEmitter();
    const before = listeningServers();
    try {
      const running = main(
        ["--candidates", candidatesPath, "--endpoints", endpointsPath, "--timeout-ms", "10000"],
        signals,
        LOCAL
      );
      // The handshake with the fake pi has not even been spawned yet.
      expect(signals.listenerCount("SIGINT")).toBe(1);
      signals.emit("SIGINT");
      await running;

      expect(existsSync(endpointsPath)).toBe(false);
      await expect.poll(() => listeningServers()).toBe(before);
      expect(signals.listenerCount("SIGINT") + signals.listenerCount("SIGTERM")).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_PI_BINARY;
      else process.env.ACCEPTANCE_PI_BINARY = previous;
    }
  });

  it("keeps its handlers through the stop, so a second SIGINT cannot skip the deletion (the CLI path)", async () => {
    const directory = await workspace();
    const wrapper = await hostBinary(directory, "pi", fixture("fake-pi-cli.mjs"));
    const candidatesPath = await candidatesFile(directory, [PI_CANDIDATE]);
    const endpointsPath = join(directory, "endpoints.json");
    const previous = process.env.ACCEPTANCE_PI_BINARY;
    process.env.ACCEPTANCE_PI_BINARY = wrapper;
    const signals = new EventEmitter();
    try {
      const running = main(
        ["--candidates", candidatesPath, "--endpoints", endpointsPath, "--timeout-ms", "10000"],
        signals,
        LOCAL
      );
      await expect.poll(() => existsSync(endpointsPath), { timeout: 15_000 }).toBe(true);
      const written = JSON.parse(await readFile(endpointsPath, "utf8")) as { relays: RelayHostEndpoint[] };
      const pi = written.relays[0]!;
      // Fix round 2: a call the fake pi answers only after 2 s. While it is in
      // flight the relay cannot finish closing, so the stop is held OPEN and its
      // inside can be looked at.
      const spawnedBefore = childProcesses();
      let callSettled = false;
      const inFlight = fetch(`${pi.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${pi.bearerToken}` },
        body: JSON.stringify({
          model: pi.modelId,
          messages: [{ role: "user", content: "TIMEOUT_CLI — hold the stop open." }]
        })
      }).finally(() => { callSettled = true; });
      await expect.poll(() => childProcesses()).toBeGreaterThan(spawnedBefore);

      signals.emit("SIGINT");
      // The stop has BEGUN — it deletes the file first — and has not ended.
      await expect.poll(() => existsSync(endpointsPath)).toBe(false);
      expect(callSettled).toBe(false);
      // Still handled while the stop runs: with no handler, a real second Ctrl-C
      // would reach Node's default and exit before the relays were closed.
      expect(signals.listenerCount("SIGINT")).toBe(1);
      expect(signals.listenerCount("SIGTERM")).toBe(1);
      signals.emit("SIGINT");
      expect((await inFlight).status).toBe(200);
      await running;

      expect(existsSync(endpointsPath)).toBe(false);
      await expect(fetch(`${written.relays[0]!.baseUrl}/chat/completions`, { method: "POST" })).rejects.toThrow();
      expect(signals.listenerCount("SIGINT") + signals.listenerCount("SIGTERM")).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.ACCEPTANCE_PI_BINARY;
      else process.env.ACCEPTANCE_PI_BINARY = previous;
    }
  });
});

describe("D8 / A20b: a grok candidate may name the id grok's -m selects (Task A12b)", () => {
  it("passes modelSelection to grok as -m and still holds the reported id to modelId", async () => {
    const directory = await workspace();
    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [{
        providerRef: "local:grok",
        tool: "grok",
        modelId: "grok-fake-cli-model",
        modelSelection: "grok-4.7",
        thinkingLevels: []
      }]),
      endpointsPath: join(directory, "endpoints.json"),
      environment: LOCAL,
      seams: SEAMS,
      emit: () => undefined
    });
    hosts.push(host);
    const grok = host.endpoints[0]!;
    expect(grok.modelId).toBe("grok-fake-cli-model");

    const response = await fetch(`${grok.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${grok.bearerToken}` },
      body: JSON.stringify({ model: grok.modelId, messages: [{ role: "user", content: "Selection probe." }] })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { choices: readonly { message: { content: string } }[] };
    const argumentList = (JSON.parse(body.choices[0]!.message.content) as { argumentList: readonly string[] })
      .argumentList;
    expect(argumentList[argumentList.indexOf("-m") + 1]).toBe("grok-4.7");
  });

  it("refuses modelSelection on any other tool", async () => {
    const directory = await workspace();

    await expect(serveRelayHost({
      candidatesPath: await candidatesFile(directory, [{ ...PI_CANDIDATE, modelSelection: "glm-5.3-flash" }]),
      endpointsPath: join(directory, "endpoints.json"),
      environment: LOCAL,
      seams: SEAMS,
      emit: () => undefined
    })).rejects.toThrow("RELAY_HOST_CANDIDATES_INVALID");
  });
});

describe("D8: the attributed overhead lines are informational, never a gate (Task A12b)", () => {
  it("still starts, and still says RELAYS SERVING, when emit throws on a RELAY OVERHEAD line: that line is dropped", async () => {
    const directory = await workspace();
    const endpointsPath = join(directory, "endpoints.json");
    const seen: string[] = [];

    const outcome = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
      endpointsPath,
      environment: LOCAL,
      seams: SEAMS,
      emit: (line) => {
        seen.push(line);
        if (line.startsWith("RELAY OVERHEAD ")) throw new Error("EMIT_BROKEN OVERHEAD");
      }
    }).then((host) => {
      hosts.push(host);
      return host;
    }, (error: unknown) => error);

    // D8 (brief: "nothing about it can refuse a start"): the start is not failed by the line.
    expect(outcome instanceof Error ? outcome.message : null).toBeNull();
    expect(seen.map((line) => line.split(" ").slice(0, 4).join(" "))).toEqual([
      "RELAY OVERHEAD Z.AI local:pi-glm",
      `RELAYS SERVING 1 ${endpointsPath}`
    ]);
    expect(existsSync(endpointsPath)).toBe(true);
    const [pi] = (outcome as RelayHostHandle).endpoints;
    const response = await fetch(`${pi!.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pi!.bearerToken}` },
      body: JSON.stringify({ model: pi!.modelId, messages: [{ role: "user", content: "Serving probe." }] })
    });
    expect(response.status).toBe(200);
  });

  it("prints the candidate's figures after the maker: reported, own and overhead, as the relay measured them", async () => {
    const directory = await workspace();
    const emitted: string[] = [];
    const host = await serveRelayHost({
      candidatesPath: await candidatesFile(directory, [PI_CANDIDATE]),
      endpointsPath: join(directory, "endpoints.json"),
      environment: LOCAL,
      seams: SEAMS,
      emit: (line) => { emitted.push(line); }
    });
    hosts.push(host);

    // The fake pi reports M4's default-profile 480 input tokens for the handshake.
    expect(emitted.filter((line) => line.startsWith("RELAY OVERHEAD ")))
      .toEqual([expect.stringMatching(/^RELAY OVERHEAD Z\.AI local:pi-glm reported=480 own=[0-9]+ overhead=-?[0-9]+$/u)]);
  });
});
