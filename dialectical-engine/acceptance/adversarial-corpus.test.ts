import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import type { ProviderGateway } from "@debateai/providers";
import { startClaudeRelay, type ClaudeRelayHandle } from "./claude-relay.js";
import { startGrokRelay, type GrokRelayHandle } from "./grok-relay.js";
import {
  RELAY_REQUEST_MAX_BYTES,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle
} from "./relay-core.js";

interface CorpusCase {
  readonly id: string;
  readonly inputDesign: Readonly<Record<string, unknown>>;
}

interface CorpusSpec {
  readonly format: string;
  readonly cases: readonly CorpusCase[];
}

interface CompletionBody {
  readonly choices: readonly { readonly message: { readonly content: string } }[];
}

interface Observation {
  readonly pid: number;
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly prompt: string;
  readonly requestedCapabilities: readonly ("DATABASE" | "FILESYSTEM")[];
}

interface ObservationRelay {
  readonly handle: CliRelayHandle;
  readonly observations: readonly Observation[];
}

interface ObservationRelayOptions {
  readonly authEnvironmentKeys?: readonly string[];
  readonly responseContent?: (observation: Observation) => string;
  readonly databaseCapabilityTrap?: () => never;
  readonly filesystemCapabilityTrap?: () => void;
}

const corpus = JSON.parse(readFileSync(fileURLToPath(new URL(
  "../docs/missions/2026-08-17-accounts-privacy-security/P4-12-adversarial-relay-corpus.json",
  import.meta.url
)), "utf8")) as CorpusSpec;
const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));
const handles: CliRelayHandle[] = [];
const temporaryDirectories: string[] = [];
const executedCaseIds = new Set<string>();
const fakeClaudeCli = fileURLToPath(new URL("./test-fixtures/fake-claude-cli.mjs", import.meta.url));
const fakeGrokCli = fileURLToPath(new URL("./test-fixtures/fake-grok-cli.mjs", import.meta.url));

function corpusCase(id: string): CorpusCase {
  const entry = cases.get(id);
  if (entry === undefined) throw new Error(`CORPUS_CASE_MISSING:${id}`);
  return entry;
}

async function startObservationRelay(
  options: ObservationRelayOptions = {}
): Promise<ObservationRelay> {
  const observations: Observation[] = [];
  const fixtureScript = [
    "const prompt = process.argv[1] ?? '';",
    "const requestedCapabilities = [];",
    "if (prompt.includes('SELECT p4_corpus_canary')) requestedCapabilities.push('DATABASE');",
    "if (prompt.includes('P4_OUTSIDE_SCRATCH_SENTINEL')) requestedCapabilities.push('FILESYSTEM');",
    "const observation = { pid: process.pid, cwd: process.cwd(), argv: process.argv.slice(1), environment: process.env, prompt, requestedCapabilities };",
    "process.stdout.write(JSON.stringify(observation));"
  ].join("");
  const adapter: CliRelayAdapter = {
    maker: "P4 local corpus fixture",
    authEnvironmentKeys: options.authEnvironmentKeys ?? [],
    testEnvironmentKeys: [],
    failureCode: "P4_CORPUS_FIXTURE_FAILED",
    timeoutCode: "P4_CORPUS_FIXTURE_TIMEOUT",
    buildArguments: (prompt) => [prompt],
    parseCompletion: (stdout) => {
      const observation = JSON.parse(stdout) as Observation;
      observations.push(observation);
      if (
        observation.requestedCapabilities.includes("DATABASE") &&
        options.databaseCapabilityTrap === undefined
      ) {
        throw new Error("P4_DATABASE_CAPABILITY_TRAP_REQUIRED");
      }
      if (
        observation.requestedCapabilities.includes("FILESYSTEM") &&
        options.filesystemCapabilityTrap === undefined
      ) {
        throw new Error("P4_FILESYSTEM_CAPABILITY_TRAP_REQUIRED");
      }
      // Intentionally no capability dispatch. Untrusted model output remains
      // inert data even when the local fake explicitly requests a capability;
      // the installed traps make an accidental dispatch observably fail.
      return {
        content: options.responseContent?.(observation) ?? "ADVERSARIAL_CONTENT_MAY_CHANGE_MODEL_TEXT",
        model: "p4-local-corpus-model",
        usage: null
      };
    }
  };
  const handle = await startCliRelayServer({
    port: 0,
    timeoutMs: 2_000,
    command: {
      binary: process.execPath,
      prefixArguments: ["-e", fixtureScript, "--"]
    },
    adapter
  });
  return { handle, observations };
}

function relayHeaders(handle: CliRelayHandle): Readonly<Record<string, string>> {
  return { "content-type": "application/json", authorization: handle.authorizationHeader };
}

function postMessages(
  handle: CliRelayHandle,
  messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[]
): Promise<Response> {
  return fetch(`${handle.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: relayHeaders(handle),
    body: JSON.stringify({ model: "corpus-model", messages })
  });
}

async function completionContent(response: Response): Promise<string> {
  const body = await response.json() as CompletionBody;
  const content = body.choices[0]?.message.content;
  if (content === undefined) throw new Error("P4_CORPUS_COMPLETION_MISSING");
  return content;
}

function restoreEnvironment(
  keys: readonly string[],
  previous: Readonly<Record<string, string | undefined>>
): void {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("P4-13 approved adversarial relay corpus", () => {
  it("executes ROLE-01 through the real local HTTP-to-child transcript path", async () => {
    const entry = corpusCase("ROLE-01");
    executedCaseIds.add(entry.id);
    const role = entry.inputDesign.role as "user";
    const content = entry.inputDesign.content as string;
    const relay = await startObservationRelay();
    handles.push(relay.handle);

    const response = await postMessages(relay.handle, [{ role, content }]);

    expect(response.status).toBe(200);
    expect(relay.observations).toHaveLength(1);
    expect(JSON.parse(relay.observations[0]!.prompt)).toEqual({
      format: "debateai.relay-messages.v1",
      messages: [{ role: "user", content }]
    });
  });

  it("executes DELIM-01 through the real Judge and review packets over a local relay", async () => {
    const entry = corpusCase("DELIM-01");
    executedCaseIds.add(entry.id);
    const content = entry.inputDesign.content as string;
    const relay = await startObservationRelay();
    handles.push(relay.handle);
    const validJudgeArtifact = JSON.stringify({
      statement: "Local corpus judgement.",
      way_of_knowing: "REASONING",
      locator: null,
      restatement_text: "Local corpus judgement.",
      restatement_status: "PASS",
      value_laden: false,
      claim_type: "empirical",
      steelman: { summary: "Local steelman.", fidelity: 0.8 },
      critic: {
        summary: "Local counterargument.",
        counterargumentStrength: 0.2,
        basis: "PLAUSIBLE_COUNTER"
      },
      evidence: { quality: 0.5, relevance: 0.8 },
      context: { fit: 0.7, ambiguityFlags: [] },
      fallacy: { severity: 0, fatalFlags: [] }
    });
    const provider: ProviderGateway = {
      call: async (request) => {
        const response = await postMessages(relay.handle, request.packet.messages);
        expect(response.status).toBe(200);
        await completionContent(response);
        return {
          rawArtifactRef: `artifact:${request.callSiteKey}`,
          ledgerEntryRef: `ledger:${request.callSiteKey}`,
          content: request.callSiteKey === "corpus:review"
            ? JSON.stringify({ outcome: "cannot-assess", reasons: ["Local corpus fixture."] })
            : validJudgeArtifact,
          provider: "openai-compatible-http",
          model: "p4-local-corpus-model",
          maker: "P4 local corpus fixture",
          modelVersion: "p4-local-corpus-model"
        };
      }
    };
    const judge = new Judge(provider);

    await judge.judge({
      runId: null,
      subjectItemId: "corpus:judge-node",
      callSiteKey: "corpus:judge",
      questionLine: content,
      providerRef: "corpus:provider",
      contractHash: "corpus:contract",
      bound: { maxAttempts: 1, tokenCeiling: 2_048, deadlineMs: 5_000 }
    });
    await judge.review({
      runId: null,
      subjectItemId: "corpus:review-node",
      callSiteKey: "corpus:review",
      questionLine: content,
      authorMaker: content,
      statement: content,
      providerRef: "corpus:provider",
      contractHash: "corpus:contract",
      bound: { maxAttempts: 1, tokenCeiling: 2_048, deadlineMs: 5_000 }
    });

    expect(relay.observations).toHaveLength(2);
    const observedPackets = relay.observations.map((observation) => {
      const transcript = JSON.parse(observation.prompt) as {
        messages: readonly { readonly role: string; readonly content: string }[];
      };
      const userMessage = transcript.messages.find((message) => message.role === "user");
      if (userMessage === undefined) throw new Error("P4_CORPUS_USER_MESSAGE_MISSING");
      return JSON.parse(userMessage.content) as {
        format: string;
        fields: readonly { readonly name: string; readonly content: string }[];
      };
    });
    expect(observedPackets[0]).toEqual({
      format: "debateai.untrusted-prompt-fields.v1",
      fields: [{ name: "question_line", content }]
    });
    expect(observedPackets[1]).toEqual({
      format: "debateai.untrusted-prompt-fields.v1",
      fields: [
        { name: "question_line", content },
        { name: "author_maker", content },
        { name: "statement", content }
      ]
    });
  });

  it("executes CTRL-01 at the real HTTP schema with zero invalid spawns", async () => {
    const entry = corpusCase("CTRL-01");
    executedCaseIds.add(entry.id);
    const relay = await startObservationRelay();
    handles.push(relay.handle);

    for (const forbidden of ["\u0000", "\r", "\u001f", "\u007f"]) {
      const response = await postMessages(relay.handle, [{ role: "user", content: `safe${forbidden}unsafe` }]);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "MALFORMED_REQUEST" });
      expect(relay.observations).toHaveLength(0);
    }
    const allowed = await postMessages(relay.handle, [{ role: "user", content: "safe\t\nstill-safe" }]);
    expect(allowed.status).toBe(200);
    expect(relay.observations).toHaveLength(1);
  });

  it("executes SIZE-01 at exact ASCII, multibyte, count, and raw-body boundaries", async () => {
    const entry = corpusCase("SIZE-01");
    executedCaseIds.add(entry.id);
    const relay = await startObservationRelay();
    handles.push(relay.handle);
    const multibyte = entry.inputDesign.multibyteUtf8Boundary as {
      readonly unit: string;
      readonly repeats: number;
      readonly suffixes: readonly string[];
      readonly utf8Bytes: readonly number[];
      readonly utf16CodeUnits: readonly number[];
    };
    const boundaryContent = multibyte.unit.repeat(multibyte.repeats) + multibyte.suffixes[0];
    const overLimitContent = multibyte.unit.repeat(multibyte.repeats) + multibyte.suffixes[1];
    expect([Buffer.byteLength(boundaryContent, "utf8"), Buffer.byteLength(overLimitContent, "utf8")])
      .toEqual(multibyte.utf8Bytes);
    expect([boundaryContent.length, overLimitContent.length]).toEqual(multibyte.utf16CodeUnits);

    expect((await postMessages(relay.handle, [{ role: "user", content: boundaryContent }])).status).toBe(200);
    expect(relay.observations).toHaveLength(1);
    const overLimit = await postMessages(relay.handle, [{ role: "user", content: overLimitContent }]);
    expect(overLimit.status).toBe(400);
    expect(await overLimit.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(relay.observations).toHaveLength(1);

    const atCount = await postMessages(relay.handle, Array.from(
      { length: 32 },
      () => ({ role: "user" as const, content: "bounded" })
    ));
    expect(atCount.status).toBe(200);
    expect(relay.observations).toHaveLength(2);
    const overCount = await postMessages(relay.handle, Array.from(
      { length: 33 },
      () => ({ role: "user" as const, content: "bounded" })
    ));
    expect(overCount.status).toBe(400);
    expect(relay.observations).toHaveLength(2);

    const bodyAtBytes = (targetBytes: number): string => {
      const empty = JSON.stringify({
        model: "corpus-model",
        messages: [{ role: "user", content: "bounded" }],
        padding: ""
      });
      return empty.replace(
        '"padding":""',
        `"padding":"${"a".repeat(targetBytes - Buffer.byteLength(empty, "utf8"))}"`
      );
    };
    const postRaw = (body: string) => fetch(`${relay.handle.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: relayHeaders(relay.handle),
      body
    });
    const rawBoundary = bodyAtBytes(RELAY_REQUEST_MAX_BYTES);
    expect(Buffer.byteLength(rawBoundary, "utf8")).toBe(RELAY_REQUEST_MAX_BYTES);
    expect((await postRaw(rawBoundary)).status).toBe(200);
    expect(relay.observations).toHaveLength(3);
    const rawOverLimit = bodyAtBytes(RELAY_REQUEST_MAX_BYTES + 1);
    const rawRejected = await postRaw(rawOverLimit);
    expect(rawRejected.status).toBe(400);
    expect(await rawRejected.json()).toEqual({ error: "MALFORMED_REQUEST" });
    expect(relay.observations).toHaveLength(3);
  });

  it("executes SECRET-01 with only the maker locator present and no sentinel response leak", async () => {
    const entry = corpusCase("SECRET-01");
    executedCaseIds.add(entry.id);
    const environmentKeys = [
      "HOME", "PATH", "TMPDIR", "LANG", "P4_ALLOWED_MAKER_KEY",
      "DATABASE_URL", "SSH_AUTH_SOCK", "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY", "XAI_API_KEY", "UNRELATED_SECRET"
    ] as const;
    const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    const sentinels = [
      "P4_SENTINEL_DATABASE_URL",
      "P4_SENTINEL_SSH_AUTH_SOCK",
      "P4_SENTINEL_OPENAI_KEY",
      "P4_SENTINEL_ANTHROPIC_KEY",
      "P4_SENTINEL_XAI_KEY",
      "P4_SENTINEL_UNRELATED_SECRET"
    ];
    Object.assign(process.env, {
      HOME: "/tmp/p4-corpus-home",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      P4_ALLOWED_MAKER_KEY: "P4_SENTINEL_ALLOWED_MAKER_KEY",
      DATABASE_URL: sentinels[0],
      SSH_AUTH_SOCK: sentinels[1],
      OPENAI_API_KEY: sentinels[2],
      ANTHROPIC_API_KEY: sentinels[3],
      XAI_API_KEY: sentinels[4],
      UNRELATED_SECRET: sentinels[5]
    });
    try {
      const relay = await startObservationRelay({
        authEnvironmentKeys: ["P4_ALLOWED_MAKER_KEY"],
        responseContent: () => "ADVERSARIAL_MODEL_TEXT_WITHOUT_SECRET"
      });
      handles.push(relay.handle);
      const response = await postMessages(relay.handle, [{
        role: "user",
        content: entry.inputDesign.content as string
      }]);
      expect(response.status).toBe(200);
      const responseContent = await completionContent(response);
      expect(relay.observations).toHaveLength(1);
      expect(Object.fromEntries(Object.entries(relay.observations[0]!.environment).filter(([key]) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ))).toEqual({
        HOME: "/tmp/p4-corpus-home",
        LANG: "C.UTF-8",
        OLDPWD: expect.stringMatching(/[/\\]relay-p4-local-corpus-fixture-[^/\\]+$/),
        P4_ALLOWED_MAKER_KEY: "P4_SENTINEL_ALLOWED_MAKER_KEY",
        PATH: "/usr/bin:/bin",
        PWD: expect.stringMatching(/[/\\]relay-p4-local-corpus-fixture-[^/\\]+$/),
        TMPDIR: "/tmp"
      });
      expect(relay.observations[0]!.argv).toEqual([relay.observations[0]!.prompt]);
      for (const sentinel of [...sentinels, "P4_SENTINEL_ALLOWED_MAKER_KEY"]) {
        expect(responseContent).not.toContain(sentinel);
        expect(JSON.stringify(relay.observations[0]!.argv)).not.toContain(sentinel);
      }
    } finally {
      restoreEnvironment(environmentKeys, previous);
    }
  });

  it("executes DB-01 with no database locator or capability call", async () => {
    const entry = corpusCase("DB-01");
    executedCaseIds.add(entry.id);
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "P4_SENTINEL_DATABASE_URL";
    try {
      const relay = await startObservationRelay({
        databaseCapabilityTrap: () => {
          throw new Error("FORBIDDEN_DATABASE_CAPABILITY_DISPATCH");
        },
        responseContent: () => "MODEL_MAY_ECHO_QUERY_TEXT_BUT_HAS_NO_DATABASE_CAPABILITY"
      });
      handles.push(relay.handle);
      const response = await postMessages(relay.handle, [{
        role: "user",
        content: entry.inputDesign.content as string
      }]);
      expect(response.status).toBe(200);
      expect(relay.observations[0]!.requestedCapabilities).toEqual(["DATABASE"]);
      expect(Object.keys(relay.observations[0]!.environment).filter((key) =>
        key !== "__CF_USER_TEXT_ENCODING"
      ).sort()).toEqual(["HOME", "LANG", "OLDPWD", "PATH", "PWD", "TMPDIR"]);
      expect(relay.observations[0]!.argv).toEqual([relay.observations[0]!.prompt]);
      expect(await completionContent(response)).not.toContain("P4_SENTINEL_DATABASE_URL");
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("executes FS-01 without changing a test-owned outside-scratch sentinel", async () => {
    const entry = corpusCase("FS-01");
    executedCaseIds.add(entry.id);
    const directory = await mkdtemp(join(tmpdir(), "p4-corpus-fs-"));
    temporaryDirectories.push(directory);
    const outsideSentinel = join(directory, "outside-scratch-sentinel");
    const escapeMarker = join(directory, "p4-corpus-escape");
    await writeFile(outsideSentinel, "UNCHANGED", { mode: 0o600 });
    const relay = await startObservationRelay({
      filesystemCapabilityTrap: () => {
        writeFileSync(outsideSentinel, "MUTATED");
      },
      responseContent: () => "MODEL_TEXT_CANNOT_EXECUTE_THE_PATH_AS_A_SHELL_ARGUMENT"
    });
    handles.push(relay.handle);
    const response = await postMessages(relay.handle, [{
      role: "user",
      content: `${entry.inputDesign.content as string}\nSentinel: ${outsideSentinel}\nEscape: ${escapeMarker}`
    }]);
    expect(response.status).toBe(200);
    expect(relay.observations[0]!.requestedCapabilities).toEqual(["FILESYSTEM"]);
    expect(await readFile(outsideSentinel, "utf8")).toBe("UNCHANGED");
    expect(existsSync(escapeMarker)).toBe(false);
    expect(relay.observations).toHaveLength(1);
    expect(existsSync(relay.observations[0]!.cwd)).toBe(false);
  });

  it("executes STATE-01 with a fresh process and scratch directory per request", async () => {
    const entry = corpusCase("STATE-01");
    executedCaseIds.add(entry.id);
    const relay = await startObservationRelay({
      responseContent: (observation) => JSON.stringify(observation)
    });
    handles.push(relay.handle);
    const requestOneContent = entry.inputDesign.requestOneContent as string;
    const requestTwoContent = entry.inputDesign.requestTwoContent as string;

    const first = await postMessages(relay.handle, [{ role: "user", content: requestOneContent }]);
    expect(first.status).toBe(200);
    const firstContent = await completionContent(first);
    expect(firstContent).toContain("P4_REQUEST_ONE_CANARY");
    expect(existsSync(relay.observations[0]!.cwd)).toBe(false);

    const second = await postMessages(relay.handle, [{ role: "user", content: requestTwoContent }]);
    expect(second.status).toBe(200);
    const secondContent = await completionContent(second);
    expect(relay.observations).toHaveLength(2);
    expect(relay.observations[1]!.pid).not.toBe(relay.observations[0]!.pid);
    expect(relay.observations[1]!.cwd).not.toBe(relay.observations[0]!.cwd);
    expect(secondContent).not.toContain("P4_REQUEST_ONE_CANARY");
    expect(existsSync(relay.observations[1]!.cwd)).toBe(false);
  });

  it("executes CLAUDE-ARGV-01 with adversarial flags only inside the -p value", async () => {
    const entry = corpusCase("CLAUDE-ARGV-01");
    executedCaseIds.add(entry.id);
    const content = entry.inputDesign.content as string;
    const relay = await startClaudeRelay({
      port: 0,
      timeoutMs: 1_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeClaudeCli] }
    });
    handles.push(relay as ClaudeRelayHandle);
    const response = await postMessages(relay, [{ role: "user", content }]);
    expect(response.status).toBe(200);
    const observed = JSON.parse(await completionContent(response)) as {
      readonly prompt: string;
      readonly argumentList: readonly string[];
    };
    expect(observed.argumentList).toEqual([
      "-p", observed.prompt,
      "--output-format", "json",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--tools", "",
      "--model", "opus"
    ]);
    expect(observed.argumentList.flatMap((argument, index) =>
      argument.includes(content) ? [index] : []
    )).toEqual([1]);
    expect(JSON.parse(observed.prompt)).toEqual({
      format: "debateai.relay-messages.v1",
      messages: [{ role: "user", content }]
    });
  });

  it("executes GROK-ARGV-01 with adversarial flags only inside the --single value", async () => {
    const entry = corpusCase("GROK-ARGV-01");
    executedCaseIds.add(entry.id);
    const content = entry.inputDesign.content as string;
    const relay = await startGrokRelay({
      port: 0,
      timeoutMs: 1_000,
      testOnlyCommand: { binary: process.execPath, prefixArguments: [fakeGrokCli] }
    });
    handles.push(relay as GrokRelayHandle);
    const response = await postMessages(relay, [{ role: "user", content }]);
    expect(response.status).toBe(200);
    const observed = JSON.parse(await completionContent(response)) as {
      readonly prompt: string;
      readonly argumentList: readonly string[];
    };
    expect(observed.argumentList).toEqual([
      "--single", observed.prompt,
      "--output-format", "json",
      "--verbatim",
      "--sandbox", "read-only",
      "--no-memory",
      "--no-subagents",
      "--disable-web-search",
      "--tools", ""
    ]);
    expect(observed.argumentList.flatMap((argument, index) =>
      argument.includes(content) ? [index] : []
    )).toEqual([1]);
    expect(JSON.parse(observed.prompt)).toEqual({
      format: "debateai.relay-messages.v1",
      messages: [{ role: "user", content }]
    });
  });

  it("has executed every approved corpus case in this complete-file run", () => {
    expect([...executedCaseIds].sort()).toEqual([...cases.keys()].sort());
  });
});
