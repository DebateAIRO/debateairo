import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDualMakerProof } from "../../acceptance/dual-maker-proof.js";
import { main as startAcceptanceBoot } from "../../acceptance/main.js";
import {
  invokeCli,
  startCliRelayServer,
  type CliRelayAdapter,
  type CommandSpec
} from "../../acceptance/relay-core.js";
import { assertRelayRuntime, relayRuntimeRefusalCode } from "../../acceptance/relay-deployment-guard.js";
import { serveRelayHost } from "../../acceptance/relay-host.js";
import { runAcceptanceCeremony, type AcceptanceArguments } from "../../acceptance/run-acceptance.js";
import {
  DEVELOPMENT_CLI_PROVIDER_ROSTER,
  startDevelopmentCliProviderPanel,
  type DevelopmentCliProviderPanelOperations,
  type DevelopmentCliRelay
} from "../../apps/runner/src/dev-cli-provider-panel.js";

/**
 * V-9(c): the command-line relays ARE the local mode, and the hosted site never
 * runs them. Every entry point that starts a relay is held to one refusal, with
 * one set of codes, before it reads a file or starts a CLI; the relay core holds
 * its two doors to the same refusal as a backstop. A new entry point that starts
 * a relay gets its own case here.
 *
 * No case here can start a real CLI or the real development stack, with or
 * without the guard: the panel gets recording stand-ins, the relay core gets a
 * stand-in program, the acceptance entries are handed settings that stop them at
 * their own first check, and `dev:auth:up` runs with a stack profile its settings
 * check refuses before anything is read.
 */

type Environment = Readonly<Record<string, string | undefined>>;

const REFUSED: readonly (readonly [label: string, environment: Environment, code: string])[] = [
  ["hosted", { DEBATEAI_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production" }, "RELAY_HOST_REFUSED_IN_HOSTED"],
  ["hosted outside production", { DEBATEAI_DEPLOYMENT_MODE: "hosted" }, "RELAY_HOST_REFUSED_IN_HOSTED"],
  ["production that names no deployment", { NODE_ENV: "production" }, "DEPLOYMENT_MODE_UNRESOLVED"],
  ["a mode the engine does not know", { DEBATEAI_DEPLOYMENT_MODE: "staging", NODE_ENV: "development" },
    "DEPLOYMENT_MODE_INVALID"]
];

const LOCAL: readonly (readonly [label: string, environment: Environment])[] = [
  ["no mode outside production", { NODE_ENV: "test" }],
  ["local named in production", { DEBATEAI_DEPLOYMENT_MODE: "local", NODE_ENV: "production" }]
];

const REFUSAL_CODES = /RELAY_HOST_REFUSED_IN_HOSTED|DEPLOYMENT_MODE_UNRESOLVED|DEPLOYMENT_MODE_INVALID/u;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("V-9(c) the one relay deployment guard", () => {
  it("names each of its three refusals by the error's class, never by a look-alike message", () => {
    for (const [label, environment, code] of REFUSED) {
      let refusal: unknown;
      try {
        assertRelayRuntime(environment);
      } catch (error) {
        refusal = error;
      }
      expect(relayRuntimeRefusalCode(refusal), label).toBe(code);
    }
    for (const [label, environment] of LOCAL) expect(() => assertRelayRuntime(environment), label).not.toThrow();
    expect(relayRuntimeRefusalCode(new TypeError("RELAY_HOST_REFUSED_IN_HOSTED"))).toBeNull();
    expect(relayRuntimeRefusalCode(new TypeError("DEPLOYMENT_MODE_UNRESOLVED"))).toBeNull();
    expect(relayRuntimeRefusalCode("RELAY_HOST_REFUSED_IN_HOSTED")).toBeNull();
    expect(relayRuntimeRefusalCode(undefined)).toBeNull();
  });
});

describe("V-9(c) the relay core refuses too, whichever entry point reached it", () => {
  // A stand-in CLI: this repository's own Node, writing a marker file. It is the
  // only program either door can reach here, so no vendor CLI ever runs.
  const standIn = async () => {
    const directory = await mkdtemp(join(tmpdir(), "v9c-relay-core-"));
    const marker = join(directory, "ran");
    const command: CommandSpec = Object.freeze({
      binary: process.execPath,
      prefixArguments: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")`]
    });
    return { directory, marker, command };
  };
  const adapter: CliRelayAdapter = Object.freeze({
    maker: "StandIn",
    authEnvironmentKeys: [],
    testEnvironmentKeys: [],
    failureCode: "STAND_IN_CLI_FAILED",
    timeoutCode: "STAND_IN_CLI_TIMEOUT",
    buildArguments: () => [],
    parseCompletion: () => ({ content: "ok", model: "stand-in-model", usage: null })
  });
  const listeningServers = () =>
    process.getActiveResourcesInfo().filter((resource) => resource === "TCPServerWrap").length;
  const stubProcessEnvironment = (environment: Environment) => {
    vi.stubEnv("DEBATEAI_DEPLOYMENT_MODE", environment.DEBATEAI_DEPLOYMENT_MODE);
    vi.stubEnv("NODE_ENV", environment.NODE_ENV);
  };

  it("never starts a CLI and never serves a relay in a hosted process; a local process does both", async () => {
    for (const [label, environment, code] of REFUSED) {
      const { directory, marker, command } = await standIn();
      const serversBefore = listeningServers();
      stubProcessEnvironment(environment);
      try {
        await expect(invokeCli(command, adapter, "prompt", 10_000), label)
          .rejects.toMatchObject({ code, message: code });
        await expect(startCliRelayServer({ port: 0, timeoutMs: 10_000, command, adapter }), label)
          .rejects.toMatchObject({ code, message: code });
      } finally {
        vi.unstubAllEnvs();
      }
      expect(existsSync(marker), label).toBe(false);
      expect(listeningServers(), label).toBe(serversBefore);
      await rm(directory, { recursive: true, force: true });
    }
    for (const [label, environment] of LOCAL) {
      const { directory, marker, command } = await standIn();
      stubProcessEnvironment(environment);
      try {
        await expect(invokeCli(command, adapter, "prompt", 10_000), label)
          .resolves.toMatchObject({ model: "stand-in-model" });
        const relay = await startCliRelayServer({ port: 0, timeoutMs: 10_000, command, adapter });
        await relay.close();
      } finally {
        vi.unstubAllEnvs();
      }
      expect(existsSync(marker), label).toBe(true);
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("V-9(c) every entry point that starts a relay refuses the hosted deployment first", () => {
  it("the development CLI panel refuses before it starts any relay, and a local panel starts all of them", async () => {
    const recordingOperations = () => {
      const starts = DEVELOPMENT_CLI_PROVIDER_ROSTER.map((provider) =>
        vi.fn(async (port: number): Promise<DevelopmentCliRelay> => Object.freeze({
          port,
          baseUrl: `http://127.0.0.1:${port}`,
          authorizationHeader: "Bearer stand-in",
          maker: provider.maker,
          model: "stand-in-model",
          close: async () => undefined
        })));
      return { starts, operations: Object.freeze({ starts }) as unknown as DevelopmentCliProviderPanelOperations };
    };

    for (const [label, environment, code] of REFUSED) {
      const { starts, operations } = recordingOperations();
      await expect(startDevelopmentCliProviderPanel(operations, undefined, environment), label)
        .rejects.toMatchObject({ code, message: code });
      for (const start of starts) expect(start, label).not.toHaveBeenCalled();
    }
    for (const [label, environment] of LOCAL) {
      const { starts, operations } = recordingOperations();
      const panel = await startDevelopmentCliProviderPanel(operations, undefined, environment);
      for (const start of starts) expect(start, label).toHaveBeenCalledTimes(1);
      await panel.stop();
    }
  });

  it("the acceptance boot (acceptance/main.ts) refuses before it reads its settings; local goes on to read them", async () => {
    // Belt and braces: should the boot ever read the real process environment
    // instead of the one it is handed, it still stops at its settings check.
    vi.stubEnv("DATABASE_URL", "");

    for (const [label, environment, code] of REFUSED) {
      await expect(startAcceptanceBoot(environment), label).rejects.toMatchObject({ code, message: code });
    }
    for (const [label, environment] of LOCAL) {
      const rejection = startAcceptanceBoot(environment);
      await expect(rejection, label).rejects.toThrow(/DATABASE_URL/u);
      await expect(rejection, label).rejects.not.toThrow(REFUSAL_CODES);
    }
  });

  it("the acceptance ceremony refuses before it reads its settings; local goes on to read them", async () => {
    // Built by hand, not by `parseAcceptanceArguments`: no case here reaches the
    // question, and the parser's own plan-tier red is not this test's subject.
    const parsed: AcceptanceArguments = Object.freeze({
      serviceCredential: "s".repeat(43),
      ask: {} as AcceptanceArguments["ask"],
      serve: false
    });

    for (const [label, environment, code] of REFUSED) {
      await expect(runAcceptanceCeremony(parsed, { ...environment }), label)
        .rejects.toMatchObject({ code, message: code });
    }
    for (const [label, environment] of LOCAL) {
      const rejection = runAcceptanceCeremony(parsed, { ...environment });
      await expect(rejection, label).rejects.toThrow(/ACCEPTANCE_DB_PORT/u);
      await expect(rejection, label).rejects.not.toThrow(REFUSAL_CODES);
    }
  });

  it("the relay host (`relays:serve`) refuses before it reads its candidates; local goes on to read them", async () => {
    // The candidates file does not exist, so a local host stops at its first read and serves nothing.
    const candidatesPath = join(tmpdir(), "v9c-relay-host-absent-candidates.json");
    for (const [label, environment, code] of REFUSED) {
      await expect(serveRelayHost({ candidatesPath, environment }), label).rejects.toMatchObject({ code, message: code });
    }
    for (const [label, environment] of LOCAL) {
      const rejection = serveRelayHost({ candidatesPath, environment });
      await expect(rejection, label).rejects.toThrow("RELAY_HOST_CANDIDATES_UNREADABLE");
      await expect(rejection, label).rejects.not.toThrow(REFUSAL_CODES);
    }
  });

  it("the dual-maker proof refuses before its first step; local goes on to it", async () => {
    // No pool and no database port: the proof's first step refuses that, so a
    // missing guard shows as the wrong refusal instead of a database starting.
    for (const [label, environment, code] of REFUSED) {
      await expect(runDualMakerProof({ environment }), label).rejects.toMatchObject({ code, message: code });
    }
    for (const [label, environment] of LOCAL) {
      await expect(runDualMakerProof({ environment }), label)
        .rejects.toThrow("DUAL_MAKER_PROOF_DATABASE_UNSPECIFIED");
    }
  });

  it("`dev:auth:up` refuses before anything else and prints the refusal's own code; local goes on to its settings", async () => {
    const cli = fileURLToPath(new URL("../../apps/runner/src/dev-auth-stack-cli.ts", import.meta.url));
    const engineRoot = fileURLToPath(new URL("../..", import.meta.url));
    const run = (environment: Environment) => new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
      (resolveRun, rejectRun) => {
        // No PATH and no HOME, and a stack profile the settings check refuses:
        // with or without the guard, this child can never start the real stack.
        const child = spawn(process.execPath, ["--import", "tsx", cli], {
          cwd: engineRoot,
          env: { DEBATEAI_DEV_AUTH_STACK_PROFILE: "not-a-profile", ...environment },
          stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
        child.once("error", rejectRun);
        child.once("close", (exitCode) => { resolveRun({ exitCode, stdout, stderr }); });
      }
    );
    const lastLine = (text: string) => text.trim().split("\n").at(-1);

    const refused = await Promise.all(REFUSED.map(([, environment]) => run(environment)));
    REFUSED.forEach(([label, , code], index) => {
      expect(refused[index]!.exitCode, label).toBe(1);
      expect(lastLine(refused[index]!.stderr), label).toBe(code);
      expect(refused[index]!.stdout, label).not.toContain("DEV_AUTH_STACK_READY");
    });
    const local = await Promise.all(LOCAL.map(([, environment]) => run(environment)));
    LOCAL.forEach(([label], index) => {
      expect(local[index]!.exitCode, label).toBe(1);
      expect(lastLine(local[index]!.stderr), label).toBe("DEV_AUTH_STACK_FAILED");
    });
  });
});
