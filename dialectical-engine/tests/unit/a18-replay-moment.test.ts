import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DebateRole } from "@debateai/kernel";
import { estimatePromptTokens, estimateWindowTokens } from "@debateai/providers";
import {
  MomentFileSchema,
  ReplayResultSchema,
  canonicalPromptFingerprint,
  momentIdFor,
  type MomentBuilder,
  type MomentFile
} from "@debateai/scorecard";
import {
  assertMomentOutputPathUntracked,
  captureMomentPacket,
  currentContractHash,
  parseMomentBuilder
} from "../../acceptance/moment-tools.js";
import {
  main,
  parseReplayArguments,
  readMomentFile,
  replayMoment,
  replayMoments,
  type ReplayEndpoint
} from "../../acceptance/replay-moment.js";

/**
 * Model scorecard A18 — replay-moment against the REAL gateway, with the
 * network replaced by a fetch double: every outcome of the replay-result
 * vocabulary, resumability, and the file and runtime refusals.
 */
const QUESTION = "Should the city build the new bridge?";
const MODEL = "relay-model";
const BEARER = "b".repeat(43);
const BOUND = Object.freeze({ maxAttempts: 2, tokenCeiling: 512, deadlineMs: 5_000 });
const ASSESS: MomentBuilder = { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "Build it." } };
const ASSESSMENT = {
  steelman: { summary: "The strongest case for building.", fidelity: 0.8 },
  critic: { summary: "Repair may be cheaper.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.7 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
};
const ENDPOINT: ReplayEndpoint = {
  providerRef: "relay:a", maker: "Maker A", tool: "claude", modelId: MODEL,
  baseUrl: "http://127.0.0.1:8791/v1", bearerToken: BEARER, thinkingLevels: ["low", "high"], contextWindowTokens: null
};

async function assessMoment(overrides: { contractHash?: string; recordedFingerprint?: string | null } = {}): Promise<MomentFile> {
  const contractHash = overrides.contractHash ?? currentContractHash("JUDGE_ASSESS");
  const packet = await captureMomentPacket(parseMomentBuilder(ASSESS));
  const fingerprint = overrides.recordedFingerprint === undefined
    ? canonicalPromptFingerprint(packet.messages)
    : overrides.recordedFingerprint;
  return MomentFileSchema.parse({
    kind: "DEBATEAI_MOMENT", formatVersion: 1,
    momentId: momentIdFor({ role: "JUDGE", contractHash, builder: ASSESS }),
    role: "JUDGE", language: null, contractHash, builder: ASSESS,
    graderContext: { question: QUESTION, excerpts: [{ label: "statement", text: "Build it." }] },
    recorded: fingerprint === null ? null : {
      providerRef: "provider:a", maker: "Maker A", modelId: "model-a", thinkingLevel: null,
      replyText: JSON.stringify(ASSESSMENT), promptFingerprint: fingerprint
    },
    source: { runId: "11111111-1111-4111-8111-111111111111", callSiteKey: "PANEL:root:provider:a", exportedAt: "2026-09-26T12:00:00.000Z", engineCommit: null }
  });
}

/**
 * A18 carries 3 and 8 (pre-flight E11) — a moment file whose role and builder
 * disagree. It is a VALID file by the schema (its id is computed from the role
 * it claims), so only the role check can refuse it.
 */
function momentFiledAs(role: DebateRole, builder: MomentBuilder): MomentFile {
  const contractHash = currentContractHash(builder.family);
  return MomentFileSchema.parse({
    kind: "DEBATEAI_MOMENT", formatVersion: 1,
    momentId: momentIdFor({ role, contractHash, builder }),
    role, language: null, contractHash, builder,
    graderContext: { question: QUESTION, excerpts: [] },
    recorded: null,
    source: { runId: "11111111-1111-4111-8111-111111111111", callSiteKey: "PANEL:root:provider:a", exportedAt: "2026-09-26T12:00:00.000Z", engineCommit: null }
  });
}
const SUPPORT_LEG: MomentBuilder = {
  family: "JUDGE_JUDGE",
  inputs: { questionLine: QUESTION, leg: { kind: "support", positionUnderDebate: "Build it." } }
};

interface FetchLog { readonly urls: string[]; readonly bodies: Record<string, unknown>[]; readonly authorizations: (string | null)[] }

/** A18 carry 2: the parsed request body is handed to `respond`, so a relay double can echo the level it was sent. */
function fetchDouble(respond: (body: Record<string, unknown>) => Response | Promise<Response>): { readonly log: FetchLog; readonly fetchImplementation: typeof fetch } {
  const log: FetchLog = { urls: [], bodies: [], authorizations: [] };
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    log.urls.push(String(input));
    log.bodies.push(body);
    log.authorizations.push(new Headers(init?.headers).get("authorization"));
    return respond(body);
  }) as typeof fetch;
  return { log, fetchImplementation };
}

function completion(content: string, level: string | null = "low"): Response {
  return new Response(JSON.stringify({
    id: "cmpl-1",
    model: MODEL,
    usage: { prompt_tokens: 14_000, completion_tokens: 120, total_tokens: 14_120, completion_tokens_details: { reasoning_tokens: 40 } },
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    ...(level === null ? {} : { x_thinking_level: level })
  }), { status: 200, headers: { "content-type": "application/json" } });
}

/** A18 carry 2: a relay that ran the level it was sent says so, as `body.x_thinking_level ?? null`. */
const echoedLevelOf = (body: Record<string, unknown>): string | null => (body.x_thinking_level as string | undefined) ?? null;
const echoingRelay = (): ReturnType<typeof fetchDouble> =>
  fetchDouble((body) => completion(JSON.stringify(ASSESSMENT), echoedLevelOf(body)));

const SEAMS = {
  sleepImplementation: async () => undefined,
  now: () => new Date("2026-09-26T12:30:00.000Z"),
  clock: (() => { let tick = 0; return () => (tick += 750); })()
};

describe("A18 · replayMoment, one job, every outcome", () => {
  it("replays the recorded prompt at the asked level and records what came back", async () => {
    const moment = await assessMoment();
    const relay = fetchDouble(() => completion(JSON.stringify(ASSESSMENT)));
    const result = await replayMoment({
      moment, endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS, fetchImplementation: relay.fetchImplementation
    });
    const offline = await captureMomentPacket(parseMomentBuilder(ASSESS));
    expect(ReplayResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      kind: "DEBATEAI_REPLAY_RESULT",
      momentId: moment.momentId,
      candidate: { providerRef: "relay:a", maker: "Maker A", modelId: MODEL, thinkingLevel: "low" },
      outcome: "OK",
      replyText: JSON.stringify(ASSESSMENT),
      parsed: { assessment: ASSESSMENT },
      usage: { reportedInputTokens: 14_000, outputTokens: 120, thinkingTokens: 40 },
      promptTokensEstimate: estimatePromptTokens(offline.messages),
      promptFingerprint: canonicalPromptFingerprint(offline.messages),
      fingerprintMatchesRecorded: true,
      contractHashMatches: true,
      startedAt: "2026-09-26T12:30:00.000Z"
    });
    expect(result.seconds).toBeGreaterThan(0);
    expect(relay.log.urls).toEqual(["http://127.0.0.1:8791/v1/chat/completions"]);
    expect(relay.log.authorizations).toEqual([`Bearer ${BEARER}`]);
    expect(relay.log.bodies[0]).toMatchObject({ model: MODEL, max_tokens: 512, x_thinking_level: "low" });
  });

  it("says when the prompt or the contract differs from the recorded one, and null when nothing was recorded", async () => {
    const run = async (moment: MomentFile) => replayMoment({
      moment, endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS,
      fetchImplementation: fetchDouble(() => completion(JSON.stringify(ASSESSMENT))).fetchImplementation
    });
    expect((await run(await assessMoment({ recordedFingerprint: "a".repeat(64) }))).fingerprintMatchesRecorded).toBe(false);
    expect((await run(await assessMoment({ recordedFingerprint: null }))).fingerprintMatchesRecorded).toBeNull();
    expect((await run(await assessMoment({ contractHash: "contract:judge:test-layer" }))).contractHashMatches).toBe(false);
  });

  it.each([
    ["USAGE_CAP", () => new Response(JSON.stringify({ error: "CLI_RELAY_USAGE_CAP", x_cli_relay_error: "CLI_RELAY_USAGE_CAP" }), { status: 429 }), 1],
    ["FAILED", () => new Response(JSON.stringify({ error: "CLI_RELAY_FAILED" }), { status: 502 }), 2],
    ["TIMED_OUT", () => { throw new DOMException("the relay did not answer", "TimeoutError"); }, 2],
    ["REFUSED", () => completion("Prose, not the answer form."), 2]
  ] as const)("writes %s when the relay does", async (outcome, respond, calls) => {
    const relay = fetchDouble(respond);
    const result = await replayMoment({
      moment: await assessMoment(), endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS,
      fetchImplementation: relay.fetchImplementation
    });
    expect(result.outcome).toBe(outcome);
    expect(result.parsed).toBeNull();
    expect(result.fingerprintMatchesRecorded).toBe(true);
    expect(relay.log.urls).toHaveLength(calls);
    if (outcome === "REFUSED") expect(result.replyText).toBe("Prose, not the answer form.");
    // A18 carry 6 (pre-flight R4): only the model's own answer is a reply; a vendor's error body never is.
    else expect(result.replyText).toBeNull();
  });

  it("fails a relay that does not echo the level it was sent, and keeps its answer out of the result (carries 2 and 6)", async () => {
    // Shipped gateway behaviour (task review fix round 1, finding 2): a level sent as
    // `x_thinking_level` must come back verbatim, else PROVIDER_THINKING_LEVEL_CHANGED,
    // a short-circuit: one call, never retried or repaired.
    const relay = fetchDouble(() => completion(JSON.stringify(ASSESSMENT), null));
    const result = await replayMoment({
      moment: await assessMoment(), endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS,
      fetchImplementation: relay.fetchImplementation
    });
    expect(result).toMatchObject({ outcome: "FAILED", parsed: null, replyText: null, fingerprintMatchesRecorded: true });
    expect(relay.log.urls).toHaveLength(1);
    expect(relay.log.bodies[0]).toMatchObject({ x_thinking_level: "low" });
    // The echoing relay is what a batch test answers with: the same job is then OK.
    const echoing = echoingRelay();
    await expect(replayMoment({
      moment: await assessMoment(), endpoint: ENDPOINT, thinkingLevel: "high", bound: BOUND, ...SEAMS,
      fetchImplementation: echoing.fetchImplementation
    })).resolves.toMatchObject({ outcome: "OK", candidate: { thinkingLevel: "high" } });
  });

  it("skips a prompt the endpoint's window cannot hold, before sending anything", async () => {
    const relay = fetchDouble(() => completion(JSON.stringify(ASSESSMENT)));
    const result = await replayMoment({
      moment: await assessMoment(), endpoint: { ...ENDPOINT, contextWindowTokens: 600 }, thinkingLevel: "low",
      bound: BOUND, ...SEAMS, fetchImplementation: relay.fetchImplementation
    });
    expect(result).toMatchObject({ outcome: "CONTEXT_TOO_LARGE", replyText: null, seconds: 0 });
    expect(relay.log.urls).toEqual([]);
  });

  it("walls the window where the gateway does: UTF-8 bytes / 2 plus the bound, and an exact fit is sent (fix round 1, Minor 2)", async () => {
    const messages = (await captureMomentPacket(parseMomentBuilder(ASSESS))).messages;
    const wall = estimateWindowTokens(messages);
    const thumb = estimatePromptTokens(messages);
    // The windows below sit BETWEEN the two estimates: the rule of thumb (characters / 4)
    // would admit every one of them, and the wall (R1) refuses all but the exact fit.
    expect(thumb).toBeLessThan(wall);
    const replayAt = async (contextWindowTokens: number) => {
      const relay = echoingRelay();
      const result = await replayMoment({
        moment: await assessMoment(), endpoint: { ...ENDPOINT, contextWindowTokens }, thinkingLevel: "low",
        bound: BOUND, ...SEAMS, fetchImplementation: relay.fetchImplementation
      });
      return { result, calls: relay.log.urls.length };
    };
    for (const window of [thumb + BOUND.tokenCeiling, wall + BOUND.tokenCeiling - 1]) {
      // Refused by the replay's own check (0 seconds), before the gateway is even built.
      const refused = await replayAt(window);
      expect(refused.result).toMatchObject({ outcome: "CONTEXT_TOO_LARGE", replyText: null, seconds: 0 });
      expect(refused.calls).toBe(0);
    }
    const fits = await replayAt(wall + BOUND.tokenCeiling);
    expect(fits.result.outcome).toBe("OK");
    expect(fits.calls).toBe(1);
  });

  it("fails a level the endpoint does not declare, without sending (R7)", async () => {
    const relay = fetchDouble(() => completion(JSON.stringify(ASSESSMENT)));
    const result = await replayMoment({
      moment: await assessMoment(), endpoint: ENDPOINT, thinkingLevel: "max", bound: BOUND, ...SEAMS,
      fetchImplementation: relay.fetchImplementation
    });
    expect(result.outcome).toBe("FAILED");
    expect(result.replyText).toBeNull();
    expect(relay.log.urls).toEqual([]);
  });

  it("refuses a moment whose role and builder disagree, before sending anything (carries 3 and 8)", async () => {
    const relay = echoingRelay();
    // The family: a REVIEWER moment built by the JUDGE's assessment builder.
    await expect(replayMoment({
      moment: momentFiledAs("REVIEWER", ASSESS), endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS,
      fetchImplementation: relay.fetchImplementation
    })).rejects.toMatchObject({ code: "MOMENT_FILE_INVALID" });
    // The leg: a POSITION moment whose leg does the SUPPORT_ATTACK job.
    await expect(replayMoment({
      moment: momentFiledAs("POSITION", SUPPORT_LEG), endpoint: ENDPOINT, thinkingLevel: "low", bound: BOUND, ...SEAMS,
      fetchImplementation: relay.fetchImplementation
    })).rejects.toMatchObject({ code: "MOMENT_FILE_INVALID" });
    expect(relay.log.urls).toEqual([]);
  });
});

describe("A18 · replayMoments, a batch from files", () => {
  let scratch = "";
  beforeEach(async () => { scratch = await mkdtemp(join(tmpdir(), "a18-replay-")); });
  afterEach(async () => { await rm(scratch, { recursive: true, force: true }); });

  async function lay(endpoints: readonly ReplayEndpoint[], jobs: readonly object[]) {
    const moment = await assessMoment();
    await writeFile(join(scratch, "one.moment.json"), JSON.stringify(moment), { mode: 0o600 });
    await writeFile(join(scratch, "endpoints.json"), JSON.stringify({ relays: endpoints }));
    // Explicit, because an earlier case in this directory may have widened it.
    await chmod(join(scratch, "endpoints.json"), 0o600);
    await writeFile(join(scratch, "jobs.jsonl"), jobs.map((job) => JSON.stringify(job)).join("\n"));
    return {
      moment,
      options: (fetchImplementation: typeof fetch) => ({
        endpointsPath: join(scratch, "endpoints.json"), jobsPath: join(scratch, "jobs.jsonl"),
        outPath: join(scratch, "results.jsonl"), bound: BOUND, environment: {}, emit: () => undefined,
        ...SEAMS, fetchImplementation
      })
    };
  }
  const JOBS = [
    { momentFile: "one.moment.json", providerRef: "relay:a", thinkingLevel: "low" },
    { momentFile: "one.moment.json", providerRef: "relay:a", thinkingLevel: "high" }
  ];
  const results = async () => (await readFile(join(scratch, "results.jsonl"), "utf8"))
    .split("\n").filter((line) => line !== "").map((line) => ReplayResultSchema.parse(JSON.parse(line)));

  it("appends one result per job, then resumes without repeating a job, even after a torn line", async () => {
    const laid = await lay([ENDPOINT], JOBS);
    const relay = echoingRelay();
    await expect(replayMoments(laid.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
    expect((await results()).map((result) => [result.momentId, result.candidate.thinkingLevel, result.outcome]))
      .toEqual([[laid.moment.momentId, "low", "OK"], [laid.moment.momentId, "high", "OK"]]);
    expect((await stat(join(scratch, "results.jsonl"))).mode & 0o777).toBe(0o600);
    await appendFile(join(scratch, "results.jsonl"), '{"kind":"DEBATEAI_REPL');
    await expect(replayMoments(laid.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 0, alreadyDone: 2 });
    expect(relay.log.urls).toHaveLength(2);
    expect(await results()).toHaveLength(2);
  });

  it("stops the batch at a usage cap, and a resumed batch asks a capped job again (F25)", async () => {
    const laid = await lay([ENDPOINT], JOBS);
    const capped = fetchDouble(() => new Response(
      JSON.stringify({ error: "CLI_RELAY_USAGE_CAP", x_cli_relay_error: "CLI_RELAY_USAGE_CAP" }), { status: 429 }
    ));
    await expect(replayMoments(laid.options(capped.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_REPLAY_USAGE_CAP" });
    // The capped job's result is written; the second job was never asked.
    expect((await results()).map((result) => [result.candidate.thinkingLevel, result.outcome])).toEqual([["low", "USAGE_CAP"]]);
    expect(capped.log.urls).toHaveLength(1);
    // A cap is not an answer: the rerun asks the capped job again, then the rest.
    const relay = echoingRelay();
    await expect(replayMoments(laid.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
    expect((await results()).map((result) => [result.candidate.thinkingLevel, result.outcome]))
      .toEqual([["low", "USAGE_CAP"], ["low", "OK"], ["high", "OK"]]);
  });

  it("writes a time-out without stopping the batch, and a resumed batch asks that job again (F25, fix round 1, Minor 1)", async () => {
    const laid = await lay([ENDPOINT], JOBS);
    const levelsAsked = (log: FetchLog) => log.bodies.map((body) => body.x_thinking_level);
    const flaky = fetchDouble((body) => {
      if (body.x_thinking_level === "low") throw new DOMException("the relay did not answer", "TimeoutError");
      return completion(JSON.stringify(ASSESSMENT), echoedLevelOf(body));
    });
    await expect(replayMoments(laid.options(flaky.fetchImplementation))).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
    // Both attempts of the timed-out job, then the next job: a time-out does not stop the batch.
    expect(levelsAsked(flaky.log)).toEqual(["low", "low", "high"]);
    expect((await results()).map((result) => [result.candidate.thinkingLevel, result.outcome]))
      .toEqual([["low", "TIMED_OUT"], ["high", "OK"]]);
    // A time-out is not an answer: the rerun asks that job again, and only that job.
    const relay = echoingRelay();
    await expect(replayMoments(laid.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 1, alreadyDone: 1 });
    expect(levelsAsked(relay.log)).toEqual(["low"]);
    expect((await results()).map((result) => [result.candidate.thinkingLevel, result.outcome]))
      .toEqual([["low", "TIMED_OUT"], ["high", "OK"], ["low", "OK"]]);
  });

  it("cuts a torn tail at the last newline BYTE, even one torn inside a character (fix round 1, Minor 3)", async () => {
    const laid = await lay([ENDPOINT], JOBS);
    const relay = echoingRelay();
    await replayMoments(laid.options(relay.fetchImplementation));
    const whole = await readFile(join(scratch, "results.jsonl"));
    // Every line opens with the result's kind (the schema's first member): that is how a torn tail is recognised.
    for (const line of whole.toString("utf8").split("\n").filter((entry) => entry !== "")) {
      expect(line.startsWith('{"kind":"DEBATEAI_REPLAY_RESULT"')).toBe(true);
    }
    // A crash mid-append: the tail stops inside "Ă" (two bytes in UTF-8), after its first byte.
    const torn = Buffer.from('{"kind":"DEBATEAI_REPLAY_RESULT","formatVersion":1,"replyText":"Ă', "utf8");
    await appendFile(join(scratch, "results.jsonl"), torn.subarray(0, torn.length - 1));
    await expect(replayMoments(laid.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 0, alreadyDone: 2 });
    expect((await readFile(join(scratch, "results.jsonl"))).equals(whole)).toBe(true);
    expect(relay.log.urls).toHaveLength(2);
  });

  it("refuses an --out that is not a results file, or a damaged one, and leaves it byte for byte (fix round 1, Minor 3)", async () => {
    const laid = await lay([ENDPOINT], JOBS);
    const relay = echoingRelay();
    const out = join(scratch, "results.jsonl");
    const refusedUnchanged = async (bytes: Buffer): Promise<void> => {
      await writeFile(out, bytes, { mode: 0o600 });
      await chmod(out, 0o600);
      await expect(replayMoments(laid.options(relay.fetchImplementation)))
        .rejects.toMatchObject({ code: "MOMENT_REPLAY_RESULTS_UNREADABLE" });
      expect((await readFile(out)).equals(bytes)).toBe(true);
    };
    // Another owner-only file named by mistake, with no final newline: a jobs file of two lines...
    await refusedUnchanged(await readFile(join(scratch, "jobs.jsonl")));
    // ...and one of a single line, which holds no newline at all.
    await refusedUnchanged(Buffer.from(JSON.stringify(JOBS[0]), "utf8"));
    expect(relay.log.urls).toEqual([]);
    // A real results file with one invalid byte inside a COMPLETE line, then a torn tail. Decoded
    // leniently, that byte grows into three and the cut lands inside the tail.
    await rm(out);
    await replayMoments(laid.options(relay.fetchImplementation));
    const written = await readFile(out);
    const at = written.indexOf('"replyText":"') + '"replyText":"'.length;
    const calls = relay.log.urls.length;
    await refusedUnchanged(Buffer.concat([
      written.subarray(0, at), Buffer.from([0xff]), written.subarray(at), Buffer.from('{"kind":"DEBATEAI_REPL', "utf8")
    ]));
    expect(relay.log.urls).toHaveLength(calls);
  });

  it("refuses an endpoint window the gateway would refuse, before any call, and admits the largest it takes (fix round 1, Minor 5)", async () => {
    const relay = echoingRelay();
    const tooLarge = await lay([{ ...ENDPOINT, contextWindowTokens: 2 ** 31 }], JOBS);
    await expect(replayMoments(tooLarge.options(relay.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_REPLAY_ENDPOINTS_INVALID" });
    expect(relay.log.urls).toEqual([]);
    const largest = await lay([{ ...ENDPOINT, contextWindowTokens: 2 ** 31 - 1 }], JOBS);
    await expect(replayMoments(largest.options(relay.fetchImplementation))).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
  });

  it("refuses an exposed endpoints file, an unknown route and a remote plain-http endpoint before any call", async () => {
    const relay = fetchDouble(() => completion(JSON.stringify(ASSESSMENT)));
    const exposed = await lay([ENDPOINT], JOBS);
    await chmod(join(scratch, "endpoints.json"), 0o644);
    await expect(replayMoments(exposed.options(relay.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_REPLAY_ENDPOINTS_EXPOSED" });
    const unknown = await lay([ENDPOINT], [...JOBS, { momentFile: "one.moment.json", providerRef: "relay:b", thinkingLevel: "low" }]);
    await expect(replayMoments(unknown.options(relay.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_REPLAY_ENDPOINT_UNKNOWN" });
    const remote = await lay([{ ...ENDPOINT, baseUrl: "http://relay.example.net:8791/v1" }], JOBS);
    await expect(replayMoments(remote.options(relay.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_REPLAY_ENDPOINTS_INVALID" });
    expect(relay.log.urls).toEqual([]);
  });

  it("refuses a moment file whose role and builder disagree, before any call (carries 3 and 8)", async () => {
    const relay = echoingRelay();
    const laid = await lay([ENDPOINT], JOBS);
    // A valid file for its role is read back whole (the positive control)...
    await expect(readMomentFile(join(scratch, "one.moment.json"))).resolves.toEqual(laid.moment);
    await writeFile(join(scratch, "support.moment.json"), JSON.stringify(momentFiledAs("SUPPORT_ATTACK", SUPPORT_LEG)));
    await expect(readMomentFile(join(scratch, "support.moment.json"))).resolves.toMatchObject({ role: "SUPPORT_ATTACK" });
    // ...and one whose role names another family, or another leg, is not a moment file.
    await writeFile(join(scratch, "family.moment.json"), JSON.stringify(momentFiledAs("REVIEWER", ASSESS)));
    await writeFile(join(scratch, "leg.moment.json"), JSON.stringify(momentFiledAs("POSITION", SUPPORT_LEG)));
    for (const name of ["family.moment.json", "leg.moment.json"]) {
      await expect(readMomentFile(join(scratch, name))).rejects.toMatchObject({ code: "MOMENT_FILE_INVALID" });
    }
    // In a batch the refusal comes before the first call, even when the bad file is the LAST job's.
    await writeFile(join(scratch, "jobs.jsonl"), [
      ...JOBS, { momentFile: "family.moment.json", providerRef: "relay:a", thinkingLevel: "low" }
    ].map((job) => JSON.stringify(job)).join("\n"));
    await expect(replayMoments(laid.options(relay.fetchImplementation)))
      .rejects.toMatchObject({ code: "MOMENT_FILE_INVALID" });
    expect(relay.log.urls).toEqual([]);
    expect(existsSync(join(scratch, "results.jsonl"))).toBe(false);
  });

  it("refuses a hosted deployment before it reads a file", async () => {
    await expect(replayMoments({
      endpointsPath: join(scratch, "absent.json"), jobsPath: join(scratch, "absent.jsonl"),
      outPath: join(scratch, "absent-results.jsonl"), bound: BOUND, environment: { DEBATEAI_DEPLOYMENT_MODE: "hosted" }
    })).rejects.toMatchObject({ code: "MOMENT_TOOL_REFUSED_IN_HOSTED" });
  });
});

/**
 * A18 carries 4 and 7 (pre-flight R6) — A REPLAY RESULT NEVER LANDS IN THE
 * TRACKED TREE, AND IT LANDS WHERE IT WAS JUDGED. The RAW `--out` is judged
 * before the endpoints file is read and before any call, then read, created,
 * appended to and truncated at `absolutePathOf(raw)`: `resolve` folds `..` by
 * string rules before a link is read, so a write could land somewhere other
 * than the judged place.
 */
describe("A18 · moment:replay writes only where the path was judged (carries 4 and 7)", () => {
  /** This engine's root, from this file's own address — never a spelled-out path. */
  const ENGINE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const workspaces: string[] = [];
  const workspace = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "a18-replay-out-"));
    workspaces.push(created);
    return created;
  };
  /** A throwaway work tree: `.git` at its top, the engine one folder down. */
  const workTree = async (): Promise<{ tree: string; engine: string }> => {
    const tree = join(await workspace(), "tree");
    const engine = join(tree, "engine");
    await mkdir(join(tree, ".git"), { recursive: true });
    await mkdir(engine);
    return { tree, engine };
  };
  /** Joined as a STRING, so `..` stays for the kernel: `join` would fold it away before any link is read. */
  const unresolved = (...segments: string[]): string => segments.join(sep);
  /** The batch's inputs, in a folder of their own (inputs may sit anywhere). */
  const inputs = async (): Promise<{ endpointsPath: string; jobsPath: string }> => {
    const folder = await workspace();
    await writeFile(join(folder, "one.moment.json"), JSON.stringify(await assessMoment()), { mode: 0o600 });
    await writeFile(join(folder, "endpoints.json"), JSON.stringify({ relays: [ENDPOINT] }), { mode: 0o600 });
    await writeFile(join(folder, "jobs.jsonl"), [
      { momentFile: "one.moment.json", providerRef: "relay:a", thinkingLevel: "low" },
      { momentFile: "one.moment.json", providerRef: "relay:a", thinkingLevel: "high" }
    ].map((job) => JSON.stringify(job)).join("\n"));
    return { endpointsPath: join(folder, "endpoints.json"), jobsPath: join(folder, "jobs.jsonl") };
  };
  const linesOf = async (path: string) => (await readFile(path, "utf8"))
    .split("\n").filter((line) => line !== "").map((line) => ReplayResultSchema.parse(JSON.parse(line)));

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("refuses a tracked --out before it reads the endpoints file or calls anyone", async () => {
    const { tree, engine } = await workTree();
    const relay = echoingRelay();
    const lines: string[] = [];
    // The endpoints file does not exist: a check that ran after reading it would fail as ENDPOINTS_INVALID.
    const absent = await workspace();
    for (const outPath of [join(engine, "results.jsonl"), join(tree, "replay", "results.jsonl")]) {
      await expect(replayMoments({
        endpointsPath: join(absent, "endpoints.json"), jobsPath: join(absent, "jobs.jsonl"), outPath,
        bound: BOUND, environment: {}, emit: (line) => { lines.push(line); }, ...SEAMS,
        fetchImplementation: relay.fetchImplementation, repositoryRoot: engine
      })).rejects.toMatchObject({ code: "MOMENT_OUTPUT_PATH_REFUSED" });
    }
    expect(relay.log.urls).toEqual([]);
    expect(lines).toEqual([]);
    expect(existsSync(join(engine, "results.jsonl"))).toBe(false);
    expect(existsSync(join(tree, "replay"))).toBe(false);
    // With no seam the command judges from its own engine root, absolute or relative, before any read.
    const argv = (out: string): string[] => [
      "--endpoints", join(absent, "endpoints.json"), "--jobs", join(absent, "jobs.jsonl"), "--out", out, "--bound", "1,512,5000"
    ];
    for (const out of [
      join(ENGINE_ROOT, "a18-replay-refused.jsonl"),
      relative(process.cwd(), join(ENGINE_ROOT, "a18-replay-refused", "results.jsonl"))
    ]) {
      await expect(main(argv(out), {})).rejects.toMatchObject({ code: "MOMENT_OUTPUT_PATH_REFUSED" });
    }
    expect(existsSync(join(ENGINE_ROOT, "a18-replay-refused.jsonl"))).toBe(false);
    expect(existsSync(join(ENGINE_ROOT, "a18-replay-refused"))).toBe(false);
  });

  it("appends under .local/, creating its folder owner-only, and prints no debate text", async () => {
    const { engine } = await workTree();
    const outPath = join(engine, ".local", "replay", "results.jsonl");
    const relay = echoingRelay();
    const lines: string[] = [];
    await expect(replayMoments({
      ...await inputs(), outPath, bound: BOUND, environment: {}, emit: (line) => { lines.push(line); }, ...SEAMS,
      fetchImplementation: relay.fetchImplementation, repositoryRoot: engine
    })).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
    expect((await linesOf(outPath)).map((result) => [result.candidate.thinkingLevel, result.outcome])).toEqual([["low", "OK"], ["high", "OK"]]);
    expect((await stat(outPath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(engine, ".local", "replay"))).mode & 0o777).toBe(0o700);
    expect(lines.at(-1)).toBe("REPLAY DONE replayed=2 already=0");
    // The relay's bearer reaches neither the results file nor the screen (pre-flight R4).
    expect(await readFile(outPath, "utf8")).not.toContain(BEARER);
    for (const line of lines) {
      expect(line).not.toContain(QUESTION);
      expect(line).not.toContain("Build it.");
      expect(line).not.toContain(BEARER);
    }
  });

  it("writes tree/lnkout/../results.jsonl outside the tree, where the kernel puts it, and resumes there (carry 7, the reverse case)", async () => {
    const { tree, engine } = await workTree();
    const outside = await workspace();
    await mkdir(join(outside, "sub"));
    await symlink(join(outside, "sub"), join(tree, "lnkout"));
    const raw = unresolved(tree, "lnkout", "..", "results.jsonl");
    // Judged where the kernel puts it — outside — so admitted.
    expect(() => assertMomentOutputPathUntracked(raw, "file", engine)).not.toThrow();
    const relay = echoingRelay();
    const options = {
      ...await inputs(), outPath: raw, bound: BOUND, environment: {}, emit: () => undefined, ...SEAMS,
      fetchImplementation: relay.fetchImplementation, repositoryRoot: engine
    };
    await expect(replayMoments(options)).resolves.toEqual({ replayed: 2, alreadyDone: 0 });
    // `resolve` would have folded `lnkout/..` into the tree, next to the link.
    expect(existsSync(join(tree, "results.jsonl"))).toBe(false);
    const landed = join(outside, "results.jsonl");
    expect((await stat(landed)).mode & 0o777).toBe(0o600);
    expect(await linesOf(landed)).toHaveLength(2);
    // The resume reads the SAME place it appended to: nothing is asked again.
    await expect(replayMoments(options)).resolves.toEqual({ replayed: 0, alreadyDone: 2 });
    expect(relay.log.urls).toHaveLength(2);
    expect(existsSync(join(tree, "results.jsonl"))).toBe(false);
  });
});

describe("A18 · the moment:replay command line and its boundaries", () => {
  it("reads four flags, the bound as three positive integers", () => {
    expect(parseReplayArguments(["--", "--endpoints", "e.json", "--jobs", "j.jsonl", "--out", "r.jsonl", "--bound", "3,2048,180000"]))
      .toEqual({ endpointsPath: "e.json", jobsPath: "j.jsonl", outPath: "r.jsonl", bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180_000 } });
    for (const argv of [
      ["--endpoints", "e.json", "--jobs", "j.jsonl", "--out", "r.jsonl"],
      ["--endpoints", "e.json", "--jobs", "j.jsonl", "--out", "r.jsonl", "--bound", "0,2048,180000"],
      ["--endpoints", "e.json", "--jobs", "j.jsonl", "--out", "r.jsonl", "--bound", "3,2048"]
    ]) {
      expect(() => parseReplayArguments(argv)).toThrowError(expect.objectContaining({ code: "MOMENT_USAGE" }));
    }
  });

  it("touches no database: neither tool module opens one", async () => {
    for (const file of ["../../acceptance/replay-moment.ts", "../../acceptance/moment-tools.ts"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/from "@debateai\/db"|from "pg"|createPool|DATABASE_URL/u);
    }
  });
});
