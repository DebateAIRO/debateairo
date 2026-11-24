// tests/unit/content-checks-preview-route.test.ts
// On a site with the preview gate the API holds no vendor key and its egress proxy lets only the payment hosts through, so the
// publication judge (a finished Free debate, an owner's Publish, the Report button, contributions and AI-written reports) and
// the end-of-debate synthesis check go to Claude Haiku 5.5 through the Anthropic gate (publication-check/gate-transport.ts).
// Each test runs the shipped check over the real guarded fetch and the real gate ports, which half-close on an abort, against a
// stand-in for the gate on a unix socket (no network). Every request the stand-in receives is also put through the real gate's
// own validation (packages/providers/ops/preview_budget_authority.py, offline). Data is made up.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicDebate } from "@debateai/contract";
import {
  createPreviewBudgetRpcPorts, createPreviewGuardedFetch, PREVIEW_GATE_SLOT_WAIT_MS, previewModelRow, type PreviewProviderTestConfig
} from "@debateai/providers";
import { createPublicationContentCheck, type PublicationCheckRecord, type PublicationContentCheck } from "../../apps/api/src/publication-check/check.js";
import {
  contentCheckBackgroundDeadlineMs, contentCheckCallsAtOnce, contentCheckRouteFor, createPreviewPublicationJudgeTransport
} from "../../apps/api/src/publication-check/gate-transport.js";
import { pressPublicFlag, type PublicFlagPorts } from "../../apps/api/src/public-flag.js";
import { runSynthesisCheck, type SynthesisCheckDeps } from "../../apps/api/src/synthesis-check/check.js";
import { createSynthesisPublishGate } from "../../apps/api/src/synthesis-check/publish-gate.js";
import { createPreviewSynthesisCheckTransport } from "../../apps/api/src/synthesis-check/transport.js";
import { SynthesisCheckWorker } from "../../apps/api/src/synthesis-check/worker.js";

const MARKER = /DEBATEAI-FENCE-([0-9a-f]{32})/u;
const QUOTE = "Queues at the pier run long at rush hour.";
/** Four part kinds, so four judge calls: the question, the summary, the arguments and the story. */
const SNAPSHOT = {
  question: "Should Harbour Town build a second ferry pier?",
  answer: { summary_segments: [{ text: "Yes, on balance." }], nodes: [{ claim: QUOTE }] },
  story_short: { headline: "A second pier", summary: "It shortens the queues." }
} as unknown as PublicDebate;
const RUN = "11111111-1111-4111-8111-111111111111";

type Envelope = Readonly<{ scope_id: string; operationId: string; requestBody: string; requestSha256: string; reservedUsd: string }>;
type Behaviour = Readonly<{
  /** The gate's own refusal word, answered as the gate answers it: HTTP 409 {"error": word}, nothing reserved. */
  refuse?: string;
  /** How long the call waits in the gate's queue for a slot before the gate sends it. */
  queueMs?: number;
  /** How long the vendor takes once the call is sent. */
  vendorMs?: number;
  /** The vendor's reply as the gate passes it on. */
  vendor?: (requestBody: string) => Readonly<{ status: number; body: string }>;
  /** How many calls the gate sends at once (its GO's max_concurrent_calls); the others wait in its queue, in turn. None: no limit. */
  slots?: number;
}>;

/** A message reply in Anthropic's shape, as the gate passes it on. */
function message(text: string, options: Readonly<{ stop?: string }> = {}): string {
  return JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: options.stop ?? "end_turn",
    content: [{ type: "text", text }], usage: { input_tokens: 900, output_tokens: 40 } });
}
/** The judge's ALLOW for the call the body carries (it echoes the call's one-time value). */
const allow = (body: string) => ({ status: 200, body: message(JSON.stringify({ call: MARKER.exec(body)![1], verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false })) });
const agree = () => ({ status: 200, body: message(JSON.stringify({ verdict: "AGREE", reason: "PERSONAL", quote: QUOTE })) });
const clear = (body: string) => ({ status: 200, body: message(JSON.stringify({ call: MARKER.exec(body)![1], TERRORISM: 0, HATE_SPEECH: 0,
  SUICIDE_OR_HARM_TO_OTHERS: 0, WEAPONS_OR_DRUGS: 0 })) });

const servers: Server[] = [];
const connections: Socket[] = [];
const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/**
 * The Anthropic gate on a unix socket, as the real one behaves on its IPC: it reads the whole request, refuses by word, or
 * waits for a slot, then, as the real gate's pre-dispatch check does, sends nothing when the caller has closed its side;
 * else it "sends" the call and writes the vendor's reply. A reply it cannot write is a lost paid reply: the real gate halts.
 */
async function standInGate(behaviour: Behaviour) {
  const folder = mkdtempSync(join(tmpdir(), "ccg-"));
  folders.push(folder);
  const socket = join(folder, "anthropic.sock");
  const state = { envelopes: [] as Envelope[], sent: 0, cancelledBeforeSending: 0, lostReplies: 0, delivered: 0,
    /** Calls at the gate at once (queued or sent, not yet answered), and the most there were. */
    open: 0, peakOpen: 0,
    /** How long each call waited in the queue for a slot, by its request body. */
    slotWaits: [] as { requestBody: string; waitedMs: number }[] };
  const replied: Promise<void>[] = [];
  let sending = 0;
  const queue: (() => void)[] = [];
  /** A slot, as the real gate's CallSlots.acquire gives one: at once when one is free, else in turn. */
  const slot = () => new Promise<void>((done) => {
    if (behaviour.slots === undefined || sending < behaviour.slots) { sending += 1; done(); } else queue.push(() => { sending += 1; done(); });
  });
  const freeSlot = () => { sending -= 1; queue.shift()?.(); };
  const server = createServer({ allowHalfOpen: true }, (connection) => {
    connections.push(connection);
    let buffered = Buffer.alloc(0);
    let callerClosed = false;
    let full = false;
    connection.on("error", () => undefined);
    connection.on("end", () => { callerClosed = true; });
    connection.on("data", (chunk: Buffer) => {
      if (full) return;
      buffered = Buffer.concat([buffered, chunk]);
      const headerEnd = buffered.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const head = buffered.subarray(0, headerEnd).toString("latin1");
      const length = Number(/content-length:\s*(\d+)/iu.exec(head)?.[1]);
      if (!Number.isSafeInteger(length) || buffered.length < headerEnd + 4 + length) return;
      full = true;
      const write = (status: number, payload: string) => new Promise<boolean>((done) => {
        if (connection.destroyed) { done(false); return; }
        connection.write(`HTTP/1.1 ${String(status)} X\r\nContent-Type: application/json\r\nContent-Length: ${String(Buffer.byteLength(payload))}\r\nConnection: close\r\n\r\n${payload}`,
          (error) => { done(error === undefined || error === null); connection.end(); });
      });
      if (!head.startsWith("POST /complete ")) { void write(409, JSON.stringify({ error: "PREVIEW_TEST_AUTHORITY_STOPPED" })); return; }
      const envelope = JSON.parse(buffered.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8")) as Envelope;
      state.envelopes.push(envelope);
      if (behaviour.refuse !== undefined) { void write(409, JSON.stringify({ error: behaviour.refuse })); return; }
      state.open += 1;
      state.peakOpen = Math.max(state.peakOpen, state.open);
      replied.push((async () => {
        const arrived = Date.now();
        await slot();
        state.slotWaits.push({ requestBody: envelope.requestBody, waitedMs: Date.now() - arrived });
        try {
          await new Promise((done) => setTimeout(done, behaviour.queueMs ?? 0));
          if (callerClosed || connection.destroyed) {
            state.cancelledBeforeSending += 1;
            await write(409, JSON.stringify({ error: "PREVIEW_TEST_AUTHORITY_STOPPED" }));
            return;
          }
          state.sent += 1;
          await new Promise((done) => setTimeout(done, behaviour.vendorMs ?? 0));
          const reply = (behaviour.vendor ?? allow)(envelope.requestBody);
          if (await write(200, JSON.stringify(reply))) state.delivered += 1;
          else state.lostReplies += 1;
        } finally {
          state.open -= 1;
          freeSlot();
        }
      })());
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  const config = Object.freeze({ deployment: "v3-preview", requested_thinking_level: "high", budget_socket: join(folder, "deepinfra.sock"),
    anthropic_budget_socket: socket, scope_id: "fixture-scope", free_model_ids: ["zai-org/GLM-5.3-Flash"] }) as unknown as PreviewProviderTestConfig;
  const headers: Headers[] = [];
  /** The guarded fetch main.ts hands the content checks: over ports that half-close on an abort. */
  const guarded = createPreviewGuardedFetch(createPreviewBudgetRpcPorts(config, { onAbort: "HALF_CLOSE" }));
  const fetch = (async (url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    headers.push(new Headers(init?.headers));
    return guarded(url, init);
  }) as typeof globalThis.fetch;
  return { state, headers, fetch, config, settled: async () => { await Promise.all(replied); } };
}

/** The real gate's own validation of each request, offline: its body rules, its model menu and its reservation, to the digit. */
function realGateVerdicts(envelopes: readonly Envelope[]): readonly Readonly<{ accepted: boolean; model?: string; refusal?: string }>[] {
  const program = [
    "import json, shutil, sys",
    "sys.dont_write_bytecode = True",
    "sys.path.insert(0, sys.argv[1])",
    "from preview_budget_authority_fixture import SCOPE, Gate, load_bridge",
    "bridge = load_bridge()",
    "gate = Gate(bridge, provider='anthropic', enabled_models=['claude-haiku-5-5'], max_concurrent_calls=2)",
    "try:",
    "    go = bridge.read_go(gate.go_path)",
    "    out = []",
    "    for envelope in json.load(sys.stdin):",
    "        try:",
    "            _, _, row, _ = bridge.validate_request(dict(envelope, scope_id=SCOPE), go)",
    "            out.append({'accepted': True, 'model': row.model})",
    "        except Exception as error:",
    "            out.append({'accepted': False, 'refusal': str(error)})",
    "    print(json.dumps(out))",
    "finally:",
    "    shutil.rmtree(gate.root, ignore_errors=True)"
  ].join("\n");
  const result = spawnSync("/usr/bin/python3", ["-I", "-c", program, resolve("tests/unit")], {
    input: JSON.stringify(envelopes), encoding: "utf8", timeout: 30_000, env: { PATH: "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE: "1" } });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as readonly Readonly<{ accepted: boolean; model?: string; refusal?: string }>[];
}

/** The shipped publication check over the gate's judge, with a record kept in memory, and how many calls it sends at once. */
function publicationCheck(fetch: typeof globalThis.fetch, deadlineMs: number, atOnce: Readonly<{ maxConcurrentCalls?: number }> = {}) {
  const records: PublicationCheckRecord[] = [];
  const diagnostics: string[] = [];
  const judge = createPreviewPublicationJudgeTransport({ fetch, reportDiagnostic: ({ code }) => { diagnostics.push(code); } });
  const check: PublicationContentCheck = createPublicationContentCheck({ judge: () => judge, recorder: { record: async (row) => { records.push(row); } },
    clock: () => new Date(), deadlineMs, ...atOnce });
  return { check, records, judge, diagnostics };
}

/** The Report button's shipped check, with the database's ports stood in: the settlement says what the report became. */
async function report(judge: ReturnType<typeof createPreviewPublicationJudgeTransport>) {
  const settled: Record<string, unknown>[] = [];
  const ports = {
    repository: { readTarget: async () => RUN, open: async () => "CHECK" },
    settlement: { settle: async (row: Record<string, unknown>) => {
      settled.push(row);
      return row.verdict === "AGREE" ? "HIDDEN" : row.verdict === "NOT_FOUND" ? "NOT_FOUND" : "QUEUED";
    } },
    judge: () => judge,
    seal: async () => ({}),
    readPublicDebate: async () => SNAPSHOT,
    limits: { personHour: 1, debateDay: 1, siteDay: 1 }
  } as unknown as PublicFlagPorts;
  const answer = await pressPublicFlag({ ownerRef: RUN, publicationRef: RUN, flagId: RUN, where: "The first path", claim: "It names a private person." }, ports);
  return { answer, settled };
}

describe("the content checks' route on a site with the preview gate", () => {
  it("is the gate exactly when the guarded fetch and the Anthropic gate's socket exist; a preview without them has no judge; no preview keeps the support target", () => {
    const fetch = (async () => new Response("{}")) as typeof globalThis.fetch;
    expect(contentCheckRouteFor({ fetch, anthropicSocket: "/run/debateai-v3-preview/anthropic-budget-v1.sock" })).toEqual({ kind: "GATE", fetch });
    expect(contentCheckRouteFor({ fetch, anthropicSocket: undefined })).toEqual({ kind: "OFF" });
    expect(contentCheckRouteFor({ fetch: undefined, anthropicSocket: "/run/debateai-v3-preview/anthropic-budget-v1.sock" })).toEqual({ kind: "OFF" });
    expect(contentCheckRouteFor(null)).toEqual({ kind: "SUPPORT_TARGET" });
  });

  it("a background check waits out the gate's slot queue on top of D; with no gate it keeps D", () => {
    const fetch = (async () => new Response("{}")) as typeof globalThis.fetch;
    expect(contentCheckBackgroundDeadlineMs({ kind: "GATE", fetch }, 60_000)).toBe(60_000 + PREVIEW_GATE_SLOT_WAIT_MS);
    expect(contentCheckBackgroundDeadlineMs({ kind: "OFF" }, 60_000)).toBe(60_000);
    expect(contentCheckBackgroundDeadlineMs({ kind: "SUPPORT_TARGET" }, 45_000)).toBe(45_000);
    // The wait added is the gate's own (preview_budget_authority.py SLOT_WAIT_SECONDS).
    const gateSource = readFileSync("packages/providers/ops/preview_budget_authority.py", "utf8");
    expect(Number(gateSource.match(/^SLOT_WAIT_SECONDS = (\d+)$/mu)![1]) * 1000).toBe(PREVIEW_GATE_SLOT_WAIT_MS);
  });
});

describe("the publication check through the Anthropic gate", () => {
  it("allows through calls the real gate accepts: Claude Haiku 5.5 at the gate's lowest level, no key, a standard call each", async () => {
    const gate = await standInGate({});
    const { check, records, diagnostics } = publicationCheck(gate.fetch, 5_000);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "ALLOW" });
    await gate.settled();
    expect(gate.state.envelopes).toHaveLength(4);
    for (const envelope of gate.state.envelopes) {
      const body = JSON.parse(envelope.requestBody) as Record<string, unknown>;
      expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 16_000, output_config: { effort: "low" } });
      expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
      expect(envelope.requestBody).not.toMatch(/sk-ant-|x-api-key/u);
      expect(Object.keys(envelope).sort()).toEqual(["operationId", "requestBody", "requestSha256", "reservedUsd", "scope_id"]);
    }
    for (const sent of gate.headers) expect([...sent.keys()].filter((name) => ["authorization", "x-api-key"].includes(name))).toEqual([]);
    expect(realGateVerdicts(gate.state.envelopes)).toEqual(gate.state.envelopes.map(() => ({ accepted: true, model: "claude-haiku-5-5" })));
    expect(records).toEqual([expect.objectContaining({ outcome: "ALLOW", judge_provider_ref: "anthropic", judge_model_id: "claude-haiku-5-5", judge_call_count: 4 })]);
    expect(diagnostics).toEqual([]);
  });

  it("the Report button's check goes the same way: an AGREE whose words are on the page hides, with the vendor's token counts", async () => {
    const gate = await standInGate({ vendor: agree });
    const { judge } = publicationCheck(gate.fetch, 5_000);
    const { answer, settled } = await report(judge);
    expect(answer).toBe("HIDDEN");
    expect(settled).toEqual([expect.objectContaining({ verdict: "AGREE", reason: "PERSONAL", providerRef: "anthropic", modelId: "claude-haiku-5-5",
      inputTokens: 900, outputTokens: 40, costUsd: null })]);
    await gate.settled();
    expect(realGateVerdicts(gate.state.envelopes)).toEqual([{ accepted: true, model: "claude-haiku-5-5" }]);
  });

  // Fail closed, as on every other route: nothing is published, nothing is hidden, the report goes to a person.
  it.each([
    ["the day's pot used up", { refuse: "TEAM_DAILY_BUDGET_REACHED" }, "JUDGE_TRANSPORT_FAILED"],
    ["the day's calls used up", { refuse: "DAILY_CALL_LIMIT_REACHED" }, "JUDGE_TRANSPORT_FAILED"],
    ["a halted gate", { refuse: "AUTHORITY_HALTED" }, "JUDGE_TRANSPORT_FAILED"],
    ["a gate whose slots stayed full", { refuse: "CONCURRENCY_LIMIT_REACHED" }, "JUDGE_TRANSPORT_FAILED"],
    ["a model the gate does not serve", { refuse: "MODEL_NOT_ALLOWED" }, "JUDGE_TRANSPORT_FAILED"],
    ["a call the gate booked at its maximum", { refuse: "PROVIDER_CHARGE_BOOKED_MAX" }, "JUDGE_TRANSPORT_FAILED"],
    ["a vendor status passed on", { vendor: () => ({ status: 529, body: "{}" }) }, "JUDGE_HTTP_STATUS"],
    ["an answer that is not a message", { vendor: () => ({ status: 200, body: "not json" }) }, "JUDGE_TRANSPORT_FAILED"],
    ["an answer the vendor declined", { vendor: () => ({ status: 200, body: message("no", { stop: "refusal" }) }) }, "JUDGE_TRANSPORT_FAILED"],
    ["an answer cut off at its bound", { vendor: () => ({ status: 200, body: message("{\"call\":", { stop: "max_tokens" }) }) }, "JUDGE_ANSWER_NOT_JSON"]
  ] as const)("%s is UNAVAILABLE: nothing published, a report to a person", async (_name, behaviour, cause) => {
    const gate = await standInGate(behaviour);
    const { check, judge } = publicationCheck(gate.fetch, 5_000);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "UNAVAILABLE", cause });
    const { answer, settled } = await report(judge);
    expect(answer).toBe("WITH_A_PERSON");
    expect(settled).toEqual([expect.objectContaining({ verdict: "UNAVAILABLE" })]);
    await gate.settled();
  });
});

describe("time on the gate: its queue, the check's deadline and an abort", () => {
  it("a call still in the gate's queue when the check's time runs out is UNAVAILABLE at once, and the gate sends nothing for it", async () => {
    const gate = await standInGate({ queueMs: 600 });
    const { check } = publicationCheck(gate.fetch, 150);
    const started = Date.now();
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" });
    expect(Date.now() - started).toBeLessThan(550);
    await gate.settled();
    // The gate's pre-dispatch check read each caller's half-close: nothing sent, nothing paid, no reply lost.
    expect(gate.state).toMatchObject({ sent: 0, cancelledBeforeSending: 4, lostReplies: 0 });
  });

  it("a call the gate already sent when time runs out is dropped, never cut off: the gate still delivers its paid reply", async () => {
    const gate = await standInGate({ vendorMs: 500 });
    const { check } = publicationCheck(gate.fetch, 150);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" });
    await gate.settled();
    expect(gate.state).toMatchObject({ sent: 4, delivered: 4, lostReplies: 0 });
  });

  it("the same abort over the ordinary fetch would cut the gate's line: why the content checks take the half-closing one", async () => {
    const gate = await standInGate({ vendorMs: 500 });
    const ordinary = createPreviewGuardedFetch(createPreviewBudgetRpcPorts(gate.config));
    const { check } = publicationCheck(ordinary, 150);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" });
    await gate.settled();
    expect(gate.state.lostReplies).toBe(4);
  });

  it("a check given the gate's queue on top of its time waits for a slot and answers", async () => {
    const gate = await standInGate({ queueMs: 300 });
    const { check } = publicationCheck(gate.fetch, 1_500);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "ALLOW" });
    await gate.settled();
    expect(gate.state).toMatchObject({ sent: 4, delivered: 4, cancelledBeforeSending: 0 });
  });

  it("the Report button keeps its 20 s: a gate that holds the call past it sends the report to a person, and sends nothing", async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    const asked: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => { asked.push(ms); return real(ms === 20_000 ? 150 : ms); });
    const gate = await standInGate({ queueMs: 600, vendor: agree });
    const { judge } = publicationCheck(gate.fetch, 5_000);
    const { answer, settled } = await report(judge);
    expect(asked).toContain(20_000);
    expect(answer).toBe("WITH_A_PERSON");
    expect(settled).toEqual([expect.objectContaining({ verdict: "UNAVAILABLE" })]);
    await gate.settled();
    expect(gate.state).toMatchObject({ sent: 0, cancelledBeforeSending: 1, lostReplies: 0 });
  });
});

describe("the gate's few slots: a check never queues a string of calls ahead of anyone else's", () => {
  const route = (fetch: typeof globalThis.fetch) => contentCheckRouteFor({ fetch, anthropicSocket: "/run/debateai-v3-preview/anthropic-budget-v1.sock" });

  it("on the gate a check nobody waits on has one call there at a time, and an owner's Publish two; other routes keep the check's own bound", async () => {
    for (const [who, most] of [["BACKGROUND", 1], ["PUBLISH", 2]] as const) {
      const gate = await standInGate({ vendorMs: 40 });
      const { check, records } = publicationCheck(gate.fetch, 5_000, contentCheckCallsAtOnce(route(gate.fetch), who));
      expect(await check.check({ runId: RUN, snapshot: SNAPSHOT }), who).toEqual({ outcome: "ALLOW" });
      await gate.settled();
      expect(gate.state.peakOpen, who).toBe(most);
      expect(records, who).toEqual([expect.objectContaining({ outcome: "ALLOW", judge_call_count: 4 })]);
    }
    // The check's own bound sends all four calls at once.
    const gate = await standInGate({ vendorMs: 40 });
    const { check } = publicationCheck(gate.fetch, 5_000);
    expect(await check.check({ runId: RUN, snapshot: SNAPSHOT })).toEqual({ outcome: "ALLOW" });
    await gate.settled();
    expect(gate.state.peakOpen).toBe(4);
    for (const who of ["BACKGROUND", "PUBLISH"] as const) {
      expect(contentCheckCallsAtOnce({ kind: "SUPPORT_TARGET" }, who)).toEqual({});
      expect(contentCheckCallsAtOnce({ kind: "OFF" }, who)).toEqual({});
    }
  });

  it("a call that comes while a background check runs on a gate of two slots finds one free, where the check's own bound queued it behind the check's calls", async () => {
    const CLAIM = "It names a private person.";
    const otherCall = async (fetch: typeof globalThis.fetch) => {
      await new Promise((done) => setTimeout(done, 50));
      await report(createPreviewPublicationJudgeTransport({ fetch }));
    };
    const waitOfOtherCall = (gate: Awaited<ReturnType<typeof standInGate>>) => gate.state.slotWaits.find((entry) => entry.requestBody.includes(CLAIM))!.waitedMs;
    const vendor = (body: string) => body.includes(CLAIM) ? agree() : allow(body);

    const before = await standInGate({ slots: 2, vendorMs: 250, vendor });
    const own = publicationCheck(before.fetch, 5_000);
    await Promise.all([own.check.check({ runId: RUN, snapshot: SNAPSHOT }), otherCall(before.fetch)]);
    await before.settled();
    // Two of the check's calls held the slots and two more were queued first: the other call waited for both rounds.
    expect(waitOfOtherCall(before)).toBeGreaterThanOrEqual(300);

    const after = await standInGate({ slots: 2, vendorMs: 250, vendor });
    const background = publicationCheck(after.fetch, 5_000, contentCheckCallsAtOnce(route(after.fetch), "BACKGROUND"));
    await Promise.all([background.check.check({ runId: RUN, snapshot: SNAPSHOT }), otherCall(after.fetch)]);
    await after.settled();
    expect(waitOfOtherCall(after)).toBeLessThan(150);
    expect(after.state.sent).toBe(5);
  });

  it("the end-of-debate check's worker checks one finished debate at a time on the gate, so a call that comes finds a slot free; with no gate four at once, as before", async () => {
    const CLAIM = "It names a private person.";
    const vendor = (body: string) => body.includes(CLAIM) ? agree() : clear(body);
    /** One tick of the shipped worker over five finished debates, the database stood in for, its checks through the gate; and, if asked, a Report press 50 ms in. */
    const tick = async (atOnce: (fetch: typeof globalThis.fetch) => Readonly<{ maxConcurrentCalls?: number }>, other: boolean) => {
      const gate = await standInGate({ slots: 2, vendorMs: 250, vendor });
      const port = createPreviewSynthesisCheckTransport({ fetch: gate.fetch });
      const waiting = Array.from({ length: 5 }, (_, index) => `${String(index + 1)}1111111-1111-4111-8111-111111111111`);
      const limits: number[] = [];
      const checked: string[] = [];
      const repository = {
        claimNextRequests: async (limit: number) => {
          limits.push(limit);
          return waiting.splice(0, limit).map((id) => ({ attemptId: id, requestId: id, runId: id, answerId: id, answerVersion: 1, startedAt: new Date(), requestedAt: new Date() }));
        },
        ownerRefOfRun: async () => "owner", readRecords: async () => [], readFinalResultId: async () => null,
        insertResult: async (input: Readonly<{ answerId: string }>) => { checked.push(input.answerId); return "INSERTED" as const; },
        purgeExpiredRemovalNotices: async () => 0
      };
      const worker = new SynthesisCheckWorker({
        repository: repository as never, erasure: { reconcile: async () => [] }, withContentLease: (_runId, use) => use(),
        readAnswer: async (_runId, _answerId, version) => version === 1 ? { serve_state: "COMPOSED", composed_text: [{ text: "The town should build the pier." }] } as never : null,
        check: { port: () => port, deadlineMs: 5_000, recordSpend: async () => undefined, priceOf: (model) => previewModelRow(model) ?? null, clock: () => new Date(), log: () => undefined },
        deadlineMs: 5_000, log: () => undefined, ...atOnce(gate.fetch)
      });
      await Promise.all([worker.runOnce(), other ? (async () => {
        await new Promise((done) => setTimeout(done, 50));
        await report(createPreviewPublicationJudgeTransport({ fetch: gate.fetch }));
      })() : Promise.resolve()]);
      await gate.settled();
      return { limits, checked, left: waiting.length, peak: gate.state.peakOpen,
        otherWaited: other ? gate.state.slotWaits.find((entry) => entry.requestBody.includes(CLAIM))!.waitedMs : null };
    };
    const onGate = (fetch: typeof globalThis.fetch) => contentCheckCallsAtOnce(route(fetch), "BACKGROUND");
    const noGate = () => contentCheckCallsAtOnce({ kind: "SUPPORT_TARGET" }, "BACKGROUND");

    // On the gate: four rounds of one, each claimed when the one before has answered; never two of its calls at the gate.
    const alone = await tick(onGate, false);
    expect(alone).toMatchObject({ limits: [1, 1, 1, 1], left: 1, peak: 1 });
    expect(alone.checked).toHaveLength(4);
    const beside = await tick(onGate, true);
    expect(beside.checked).toHaveLength(4);
    expect(beside.otherWaited).toBeLessThan(150);

    // With no gate: one claim of four, checked together, as before; on a gate of two slots that queued the other call.
    const before = await tick(noGate, true);
    expect(before).toMatchObject({ limits: [4], left: 1 });
    expect(before.checked).toHaveLength(4);
    expect(before.peak).toBe(5);
    expect(before.otherWaited).toBeGreaterThanOrEqual(300);
  });
});

describe("the synthesis check through the Anthropic gate", () => {
  function synthesis(fetch: typeof globalThis.fetch, deadlineMs = 5_000, spent = 0) {
    const records: Readonly<{ providerRef: string; inputTokens: number; outputTokens: number }>[] = [];
    const port = createPreviewSynthesisCheckTransport({ fetch });
    const run = () => runSynthesisCheck({
      port: () => port, deadlineMs, dayPot: { ceilingMicros: 1_000, spentMicros: async () => spent },
      recordSpend: async (entry) => { records.push(entry); },
      priceOf: (model) => previewModelRow(model) ?? null, clock: () => new Date(), log: () => undefined
    }, { runId: RUN, answerId: RUN, answerVersion: 1, synthesisText: "The town should build the pier.", deadlineAt: new Date(Date.now() + deadlineMs) });
    return { run, records };
  }

  it("checks through the gate, and records the call in the site's day as before: the vendor's input count and the check's fixed output size", async () => {
    const gate = await standInGate({ vendor: clear });
    const { run, records } = synthesis(gate.fetch);
    expect(await run()).toMatchObject({ outcome: { verdict: "CLEAR" }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5", callCount: 1 });
    // The vendor reported 40 output tokens; the record keeps the check's fixed size instead. The gate keeps its own exact count.
    expect(records).toEqual([expect.objectContaining({ providerRef: "anthropic", inputTokens: 900, outputTokens: 192 })]);
    await gate.settled();
    expect(realGateVerdicts(gate.state.envelopes)).toEqual([{ accepted: true, model: "claude-haiku-5-5" }]);
  });

  it("keeps its own day-pot check: a full site day asks nothing of the gate", async () => {
    const gate = await standInGate({ vendor: clear });
    const { run, records } = synthesis(gate.fetch, 5_000, 1_000);
    expect(await run()).toMatchObject({ outcome: { verdict: "UNAVAILABLE", failureCode: "MONEY_REFUSED" }, callCount: 0 });
    expect(gate.state.envelopes).toEqual([]);
    expect(records).toEqual([]);
  });

  it("records nothing for a refusal it can tell reserved nothing, and the estimate for one it cannot tell from a charged call", async () => {
    for (const refuse of ["TEAM_DAILY_BUDGET_REACHED", "CONCURRENCY_LIMIT_REACHED", "MODEL_COOLING", "MODEL_NOT_ALLOWED"]) {
      const gate = await standInGate({ refuse });
      const { run, records } = synthesis(gate.fetch);
      expect(await run(), refuse).toMatchObject({ outcome: { verdict: "UNAVAILABLE", failureCode: "TRANSPORT_FAILED" } });
      expect(records, refuse).toEqual([]);
    }
    // Booked at its maximum by the gate; and the gate's opaque stop and a halted gate, which the guarded fetch cannot tell
    // from a stop after a reservation: counted as possibly charged, at the check's estimate.
    for (const refuse of ["PROVIDER_CHARGE_BOOKED_MAX", "PREVIEW_TEST_AUTHORITY_STOPPED", "AUTHORITY_HALTED"]) {
      const gate = await standInGate({ refuse });
      const { run, records } = synthesis(gate.fetch);
      expect(await run(), refuse).toMatchObject({ outcome: { verdict: "UNAVAILABLE", failureCode: "TRANSPORT_FAILED" } });
      expect(records, refuse).toHaveLength(1);
    }
  });

  it("an owner's Publish waits for the worker's check that may still run on the gate past D, and does not call the model beside it", async () => {
    const D = 1_000;
    const gate = await standInGate({ vendor: clear });
    const port = createPreviewSynthesisCheckTransport({ fetch: gate.fetch });
    let now = 50_000;
    // The worker's attempt started D and 300 ms ago, and its time on the gate is D plus the slot wait: it is still running.
    const worker = { attemptId: "22222222-2222-4222-8222-222222222222", answerVersion: 1, startedAt: new Date(now - D - 300) };
    let workerDoneAt = now + 500;
    let ownAttempts = 0;
    const done = () => now >= workerDoneAt;
    const repository = {
      ownerRefOfRun: async () => "owner",
      readRecords: async () => done() ? [{ synthesisOriginVersion: 1, final: true, outcome: { verdict: "CLEAR", categories: [] }, checkedAt: new Date(workerDoneAt), answerVersion: 1 }] : [],
      // As its SQL reads: attempts younger than the window it is given, with no result yet.
      readInFlightAttempts: async (input: { deadlineMs: number }) => done() || worker.startedAt.getTime() <= now - input.deadlineMs ? [] : [worker],
      startPublishAttempt: async () => { ownAttempts += 1; return { attemptId: "33333333-3333-4333-8333-333333333333", startedAt: new Date(now) }; },
      insertResult: async () => "INSERTED" as const
    };
    const check: SynthesisCheckDeps = { port: () => port, deadlineMs: D, recordSpend: async () => undefined,
      priceOf: (model) => previewModelRow(model) ?? null, clock: () => new Date(now), log: () => undefined };
    const publish = createSynthesisPublishGate({
      repository: repository as never, readAnswerVersions: async () => new Map([[1, "The town should build the pier."]]),
      check, deadlineMs: D, inFlightWindowMs: contentCheckBackgroundDeadlineMs({ kind: "GATE", fetch: gate.fetch }, D),
      clock: () => new Date(now), sleep: async (ms) => { now += ms; }
    });
    const decide = () => publish.decide({ runId: RUN, answer: { answer_id: RUN, answer_version: 1 } as never,
      contentLease: { run: (use) => use(), readAnswer: async () => null }, startedAt: new Date(now) });
    expect(await decide()).toBe("PROCEED");
    expect(ownAttempts).toBe(0);
    expect(gate.state.envelopes).toEqual([]);
    // With its window at D alone the same Publish would not have seen the worker's check, and called the model itself.
    workerDoneAt = Number.POSITIVE_INFINITY;
    const alone = createSynthesisPublishGate({ repository: { ...repository, readRecords: async () => [] } as never,
      readAnswerVersions: async () => new Map([[1, "The town should build the pier."]]), check, deadlineMs: D,
      clock: () => new Date(now), sleep: async (ms) => { now += ms; } });
    worker.startedAt = new Date(now - D - 300);
    await alone.decide({ runId: RUN, answer: { answer_id: RUN, answer_version: 1 } as never,
      contentLease: { run: (use) => use(), readAnswer: async () => null }, startedAt: new Date(now) });
    expect(ownAttempts).toBe(1);
    await gate.settled();
    expect(gate.state.envelopes).toHaveLength(1);
  });

  it("the Free sweep's gate never waits for a check running elsewhere and never runs one beside it: that debate is decided on a later pass", async () => {
    let now = 50_000;
    let slept = 0;
    let ownAttempts = 0;
    let portReads = 0;
    // Another attempt (an owner's Publish, or one a restart left without an answer) started half a second ago.
    const running = { attemptId: "22222222-2222-4222-8222-222222222222", answerVersion: 1, startedAt: new Date(now - 500) };
    const repository = {
      ownerRefOfRun: async () => "owner", readRecords: async () => [],
      readInFlightAttempts: async () => [running],
      startPublishAttempt: async () => { ownAttempts += 1; return { attemptId: "33333333-3333-4333-8333-333333333333", startedAt: new Date(now) }; },
      insertResult: async () => "INSERTED" as const
    };
    const check: SynthesisCheckDeps = { port: () => { portReads += 1; return null; }, deadlineMs: 120_000, recordSpend: async () => undefined,
      priceOf: () => null, clock: () => new Date(now), log: () => undefined };
    const gateWith = (wait: Readonly<{ inFlightWaitMs?: number }>) => createSynthesisPublishGate({
      repository: repository as never, readAnswerVersions: async () => new Map([[1, "The town should build the pier."]]),
      check, deadlineMs: 120_000, inFlightWindowMs: 120_000, ...wait,
      clock: () => new Date(now), sleep: async (ms) => { slept += ms; now += ms; } });
    const decide = (gate: ReturnType<typeof gateWith>) => gate.decide({ runId: RUN, answer: { answer_id: RUN, answer_version: 1 } as never,
      contentLease: { run: (use) => use(), readAnswer: async () => null }, startedAt: new Date(now) });
    expect(await decide(gateWith({ inFlightWaitMs: 0 }))).toBe("UNAVAILABLE");
    expect({ slept, ownAttempts, portReads }).toEqual({ slept: 0, ownAttempts: 0, portReads: 0 });
    // Without it, as an owner's Publish, the gate waits for that check up to its own time, and still runs none beside it.
    expect(await decide(gateWith({}))).toBe("UNAVAILABLE");
    expect({ slept, ownAttempts, portReads }).toEqual({ slept: 120_000, ownAttempts: 0, portReads: 0 });
  });

  it("the Free sweep's gate starts its own check only in the debate's turn: not its turn, no attempt and no call; a stored decision is read without the turn", async () => {
    let ownAttempts = 0;
    let portReads = 0;
    const turnsAsked: string[] = [];
    let records: unknown[] = [];
    const repository = {
      ownerRefOfRun: async () => "owner", readRecords: async () => records, readInFlightAttempts: async () => [],
      startPublishAttempt: async () => { ownAttempts += 1; return { attemptId: "33333333-3333-4333-8333-333333333333", startedAt: new Date() }; },
      insertResult: async () => "INSERTED" as const
    };
    const check: SynthesisCheckDeps = { port: () => { portReads += 1; return null; }, deadlineMs: 120_000, recordSpend: async () => undefined,
      priceOf: () => null, clock: () => new Date(), log: () => undefined };
    const gate = createSynthesisPublishGate({
      repository: repository as never, readAnswerVersions: async () => new Map([[1, "The town should build the pier."]]),
      check, deadlineMs: 120_000, inFlightWindowMs: 120_000, inFlightWaitMs: 0,
      ownCheckInTurn: async (runId) => { turnsAsked.push(runId); return null; },
      clock: () => new Date(), sleep: async () => undefined });
    const decide = () => gate.decide({ runId: RUN, answer: { answer_id: RUN, answer_version: 1 } as never,
      contentLease: { run: (use) => use(), readAnswer: async () => null }, startedAt: new Date() });
    // No verdict stored: the gate would run its own check, but the debate's turn has not come.
    expect(await decide()).toBe("UNAVAILABLE");
    expect({ turnsAsked, ownAttempts, portReads }).toEqual({ turnsAsked: [RUN], ownAttempts: 0, portReads: 0 });
    // A verdict stored by the worker: read at once, with no turn asked.
    records = [{ resultId: "r", attemptId: "a", runId: RUN, answerId: RUN, answerVersion: 1, synthesisOriginVersion: 1, final: true,
      outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5", checkedAt: new Date() }];
    expect(await decide()).toBe("PROCEED");
    expect({ turnsAsked, ownAttempts, portReads }).toEqual({ turnsAsked: [RUN], ownAttempts: 0, portReads: 0 });
  });

  it("a call the gate holds past the check's time is a DEADLINE, cancelled before the gate sends it", async () => {
    const gate = await standInGate({ queueMs: 600, vendor: clear });
    const { run } = synthesis(gate.fetch, 150);
    expect(await run()).toMatchObject({ outcome: { verdict: "UNAVAILABLE", failureCode: "DEADLINE" } });
    await gate.settled();
    expect(gate.state).toMatchObject({ sent: 0, cancelledBeforeSending: 1, lostReplies: 0 });
  });
});
