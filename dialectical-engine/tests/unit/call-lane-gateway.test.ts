// Parallel AI calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.2, §3.4) — Task 9: every
// model call of a debate goes through its lane of the runner's call scheduler. The lane gateway hands the scheduler the
// call's kind (from its call-site key), keeps a gate's health (one call in flight after the gate could not reach its
// vendor, all slots again after an answer), passes every result and error through unchanged, and runs the call in the
// caller's own async context however late its slot frees (the keep-alive and the content lease are read from it).
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  PreviewGateUnsent,
  PreviewUnbilledRefusal,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  applyPreviewGateCapacities,
  laneGateway,
  previewCallSubjects,
  previewGateNames,
  targetCallSubjects
} from "../../apps/runner/src/call-lane-gateway.js";
import {
  createCallScheduler,
  type CallScheduler,
  type CallTicket,
  type DebateCallLane
} from "../../apps/runner/src/call-scheduler.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const request = (callSiteKey: string): ProviderCallRequest => ({ callSiteKey, providerRef: "ref:a" }) as unknown as ProviderCallRequest;
const answer = (content: string): ProviderCallResult => ({ content }) as unknown as ProviderCallResult;
const SERIAL = Object.freeze({ perDebate: 1, perModelPerDebate: 1, perModelPerRunner: Object.freeze({ default: 1000 }) });
const WIDE = Object.freeze({ perDebate: 10, perModelPerDebate: 10, perModelPerRunner: Object.freeze({ default: 10 }) });

/** A lane that records each ticket and runs the call at once. */
function recordingLane(): DebateCallLane & { tickets: CallTicket[] } {
  const tickets: CallTicket[] = [];
  return Object.assign({
    run: <T>(ticket: CallTicket, call: () => Promise<T>) => { tickets.push(ticket); return call(); },
    stop: () => undefined, drained: async () => undefined, close: () => undefined,
    stats: () => ({ peakInFlight: 0, peakByModel: {}, waitedMsByModel: {}, calls: 0 })
  }, { tickets });
}

function recordingScheduler(): CallScheduler & { marks: string[] } {
  const marks: string[] = [];
  return Object.assign({
    openLane: () => { throw new Error("not used"); },
    setGateCapacity: (gate: string, slots: number) => { marks.push(`capacity:${gate}:${String(slots)}`); },
    markGateUnhealthy: (gate: string) => { marks.push(`unhealthy:${gate}`); },
    markGateHealthy: (gate: string) => { marks.push(`healthy:${gate}`); },
    stats: () => ({ peakByGate: {}, peakByModel: {} })
  }, { marks });
}

const SUBJECT = Object.freeze({ model: "m", vendor: "deepinfra", gate: "deepinfra" });

describe("laneGateway: the call's kind reaches the scheduler", () => {
  it("maps each call-site key to its priority, with the maker's subject", async () => {
    const lane = recordingLane();
    const provider: ProviderGateway = { call: async (req) => answer(req.callSiteKey) };
    const gateway = laneGateway({ lane, scheduler: recordingScheduler(), subject: SUBJECT, provider });
    for (const key of ["JUDGE", "JUDGE:position:1", "PANEL:node-1", "JUDGE:review:node-2", "SYNTHESIZER:round:1", "STORY:teller"]) {
      await gateway.call(request(key));
    }
    expect(lane.tickets.map((ticket) => ticket.priority)).toEqual(["AUTHOR", "AUTHOR", "PANEL", "REVIEW", "OTHER", "OTHER"]);
    for (const ticket of lane.tickets) expect({ model: ticket.model, vendor: ticket.vendor, gate: ticket.gate }).toEqual(SUBJECT);
  });

  it("hands the provider the request unchanged and returns its result unchanged", async () => {
    const seen: ProviderCallRequest[] = [];
    const result = answer("the answer");
    const provider: ProviderGateway = { call: async (req) => { seen.push(req); return result; } };
    const sent = request("JUDGE");
    expect(await laneGateway({ lane: recordingLane(), scheduler: recordingScheduler(), subject: SUBJECT, provider }).call(sent)).toBe(result);
    expect(seen).toEqual([sent]);
    expect(seen[0]).toBe(sent);
  });
});

describe("laneGateway: a gate's health", () => {
  it("an answer marks the gate healthy; a gate-unsent failure marks it unhealthy; other failures leave it", async () => {
    const scheduler = recordingScheduler();
    const outcomes: Array<() => Promise<ProviderCallResult>> = [
      async () => answer("ok"),
      async () => { throw new PreviewGateUnsent(); },
      async () => { throw Object.assign(new TypedDomainError("PROVIDER_CALL_FAILED", "failed"), { cause: new PreviewGateUnsent() }); },
      async () => { throw new PreviewUnbilledRefusal(); },
      async () => { throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money"); }
    ];
    const provider: ProviderGateway = { call: () => outcomes.shift()!() };
    const gateway = laneGateway({ lane: recordingLane(), scheduler, subject: SUBJECT, provider });
    await gateway.call(request("JUDGE"));
    for (let index = 0; index < 4; index += 1) await gateway.call(request("JUDGE")).catch(() => undefined);
    expect(scheduler.marks).toEqual(["healthy:deepinfra", "unhealthy:deepinfra", "unhealthy:deepinfra"]);
  });

  it("a subject with no gate marks nothing", async () => {
    const scheduler = recordingScheduler();
    const outcomes: Array<() => Promise<ProviderCallResult>> = [async () => answer("ok"), async () => { throw new PreviewGateUnsent(); }];
    const gateway = laneGateway({
      lane: recordingLane(), scheduler, subject: { model: "m", vendor: "default", gate: null },
      provider: { call: () => outcomes.shift()!() }
    });
    await gateway.call(request("JUDGE"));
    await gateway.call(request("JUDGE")).catch(() => undefined);
    expect(scheduler.marks).toEqual([]);
  });

  it("errors pass through unchanged (the same object)", async () => {
    const errors = [new PreviewGateUnsent(), new TypedDomainError("PROVIDER_CALL_FAILED", "x"), new TypeError("plain")];
    for (const error of errors) {
      const gateway = laneGateway({
        lane: recordingLane(), scheduler: recordingScheduler(), subject: SUBJECT,
        provider: { call: async () => { throw error; } }
      });
      await expect(gateway.call(request("JUDGE"))).rejects.toBe(error);
    }
  });

  it("the gate is unhealthy before the failed call's slot frees, so a waiting call cannot slip past it", async () => {
    // Real scheduler: the gate admits 3. Three calls are in flight; the first fails gate-unsent. Two more wait (debate
    // limit 3). From the moment of that failure the gate admits ONE call in flight, so neither waiting call may start
    // while the other two are still in flight.
    const scheduler = createCallScheduler({ policy: { perDebate: 3, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    scheduler.setGateCapacity("deepinfra", 3);
    const lane = scheduler.openLane("debate-1");
    const answers = Array.from({ length: 5 }, () => deferred<ProviderCallResult>());
    let next = 0;
    const started: number[] = [];
    const gateway = laneGateway({
      lane, scheduler, subject: SUBJECT,
      provider: { call: () => { const index = next; next += 1; started.push(index); return answers[index]!.promise; } }
    });
    const calls = Array.from({ length: 5 }, () => gateway.call(request("JUDGE")).catch((error: unknown) => error));
    await flush();
    expect(started).toEqual([0, 1, 2]);
    answers[0]!.reject(new PreviewGateUnsent());
    await flush();
    // Two still in flight on an unhealthy gate: nothing more may start.
    expect(started).toEqual([0, 1, 2]);
    answers[1]!.resolve(answer("ok"));
    await flush();
    // An answer heals the gate: both waiting calls start (gate 3, debate 3: 2 + 1 in flight).
    expect(started).toEqual([0, 1, 2, 3, 4]);
    for (const each of answers.slice(2)) each.resolve(answer("ok"));
    await Promise.all(calls);
    lane.close();
  });
});

describe("laneGateway: the call runs in its caller's async context", () => {
  it("a call whose slot is freed by ANOTHER debate's call still sees its own debate's context", async () => {
    // One model slot across the runner: debate B's call waits for debate A's. When A's call settles, the scheduler
    // starts B's call from inside A's settling; the keep-alive and the content lease B's gateway reads must be B's.
    const store = new AsyncLocalStorage<string>();
    const scheduler = createCallScheduler({ policy: { perDebate: 1, perModelPerDebate: 1, perModelPerRunner: { default: 1 } } });
    const laneA = scheduler.openLane("debate-a");
    const laneB = scheduler.openLane("debate-b");
    const first = deferred<ProviderCallResult>();
    const seen: Array<string | undefined> = [];
    const provider: ProviderGateway = {
      call: (req) => { seen.push(store.getStore()); return req.callSiteKey === "JUDGE:a" ? first.promise : Promise.resolve(answer("b")); }
    };
    const subject = { model: "shared", vendor: "default", gate: null };
    const a = store.run("A", () => laneGateway({ lane: laneA, scheduler, subject, provider }).call(request("JUDGE:a")));
    const b = store.run("B", () => laneGateway({ lane: laneB, scheduler, subject, provider }).call(request("JUDGE:b")));
    await flush();
    expect(seen).toEqual(["A"]);
    store.run("A", () => { first.resolve(answer("a")); });
    await Promise.all([a, b]);
    expect(seen).toEqual(["A", "B"]);
    laneA.close(); laneB.close();
  });

  it("the absent row is one call at a time per debate, in arrival order within a kind", async () => {
    const scheduler = createCallScheduler({ policy: SERIAL });
    const lane = scheduler.openLane("debate-1");
    const order: string[] = [];
    let inFlight = 0; let peak = 0;
    const provider: ProviderGateway = {
      call: async (req) => {
        inFlight += 1; peak = Math.max(peak, inFlight); order.push(req.callSiteKey);
        await flush(); inFlight -= 1; return answer(req.callSiteKey);
      }
    };
    const gateway = laneGateway({ lane, scheduler, subject: { model: "m", vendor: "default", gate: null }, provider });
    await Promise.all(["JUDGE:1", "JUDGE:2", "JUDGE:3"].map((key) => gateway.call(request(key))));
    expect(peak).toBe(1);
    expect(order).toEqual(["JUDGE:1", "JUDGE:2", "JUDGE:3"]);
    lane.close();
  });

  it("a call queued when the lane closes is refused CALL_LANE_STOPPED and never sent", async () => {
    const scheduler = createCallScheduler({ policy: SERIAL });
    const lane = scheduler.openLane("debate-1");
    const first = deferred<ProviderCallResult>();
    const sent: string[] = [];
    const gateway = laneGateway({
      lane, scheduler, subject: { model: "m", vendor: "default", gate: null },
      provider: { call: (req) => { sent.push(req.callSiteKey); return first.promise; } }
    });
    const a = gateway.call(request("JUDGE:1"));
    const b = gateway.call(request("JUDGE:2"));
    lane.close();
    await expect(b).rejects.toMatchObject({ code: "CALL_LANE_STOPPED" });
    first.resolve(answer("ok"));
    await expect(a).resolves.toBeDefined();
    expect(sent).toEqual(["JUDGE:1"]);
  });
});

const PREVIEW: PreviewProviderTestConfig = Object.freeze({
  deployment: "v3-preview", free_model_ids: Object.freeze(["deepseek-ai/DeepSeek-V4.1-Flash"]),
  premium_model_ids: Object.freeze(["deepseek-ai/DeepSeek-V4.1-Flash", "claude-haiku-5-5"]),
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra.sock", scope_id: "scope-1",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic.sock"
});

describe("call subjects", () => {
  it("on the preview: the reviewed row's model, and its provider as both vendor and gate", () => {
    const subjects = previewCallSubjects(PREVIEW);
    expect(subjects.subjectOf("preview:deepseek-v4-1-flash"))
      .toEqual({ model: "deepseek-ai/DeepSeek-V4.1-Flash", vendor: "deepinfra", gate: "deepinfra" });
    expect(subjects.subjectOf("preview:claude-haiku-5-5")).toEqual({ model: "claude-haiku-5-5", vendor: "anthropic", gate: "anthropic" });
    // Two refs of one model share the model's slots.
    expect(subjects.subjectOf("preview:fixture-a").model).toBe(subjects.subjectOf("preview:fixture-b").model);
    // A ref with no reviewed row (never configured on the preview) is its own model, behind no gate.
    expect(subjects.subjectOf("unknown:ref")).toEqual({ model: "unknown:ref", vendor: "default", gate: null });
  });

  it("the gate names are exactly the gates the preview subjects report", () => {
    expect(previewGateNames(PREVIEW)).toEqual(["deepinfra", "anthropic"]);
    const { anthropic_budget_socket: _ignored, ...deepinfraOnly } = PREVIEW;
    expect(previewGateNames(deepinfraOnly as PreviewProviderTestConfig)).toEqual(["deepinfra"]);
    const subjects = previewCallSubjects(PREVIEW);
    expect(new Set(["preview:deepseek-v4-1-flash", "preview:claude-haiku-5-5"].map((ref) => subjects.subjectOf(ref).gate)))
      .toEqual(new Set(previewGateNames(PREVIEW)));
  });

  it("off the preview: the target's model, the vendor from its host, no gate", () => {
    const subjects = targetCallSubjects([
      { providerRef: "a", model: "glm", baseUrl: "https://api.deepinfra.com/v1/openai" },
      { providerRef: "b", model: "haiku", baseUrl: "https://api.anthropic.com/v1" },
      { providerRef: "c", model: "local", baseUrl: "http://127.0.0.1:8080/v1" },
      { providerRef: "d", model: "lookalike", baseUrl: "https://notdeepinfra.com.example/v1" },
      { providerRef: "e", model: "broken", baseUrl: "not a url" }
    ]);
    expect(subjects.subjectOf("a")).toEqual({ model: "glm", vendor: "deepinfra", gate: null });
    expect(subjects.subjectOf("b")).toEqual({ model: "haiku", vendor: "anthropic", gate: null });
    expect(subjects.subjectOf("c")).toEqual({ model: "local", vendor: "default", gate: null });
    expect(subjects.subjectOf("d")).toEqual({ model: "lookalike", vendor: "default", gate: null });
    expect(subjects.subjectOf("e")).toEqual({ model: "broken", vendor: "default", gate: null });
    expect(subjects.subjectOf("missing")).toEqual({ model: "missing", vendor: "default", gate: null });
  });
});

const remaining = (maxConcurrentCalls: number): PreviewGateRemaining => Object.freeze({
  state: "active", windowOpen: true, remainingNanoUsd: 1n, remainingCalls: 1, maxConcurrentCalls,
  largestReservationNanoUsd: 1n, enabledModels: Object.freeze([])
});

describe("each preview gate's slots, read once at boot", () => {
  it("sets each gate's capacity from its /remaining; a failed read sets 1 and logs one content-free line", async () => {
    const scheduler = recordingScheduler();
    const lines: string[] = [];
    await applyPreviewGateCapacities({
      scheduler,
      gates: [
        { gate: "deepinfra", remaining: async () => remaining(6) },
        { gate: "anthropic", remaining: async () => { throw new TypedDomainError("PREVIEW_GATE_UNREACHABLE", "socket /run/secret said no"); } }
      ],
      log: (line) => { lines.push(line); }
    });
    expect([...scheduler.marks].sort()).toEqual(["capacity:anthropic:1", "capacity:deepinfra:6"]);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ kind: "DEBATEAI_CALL_SCHEDULER", event: "GATE_CAPACITY_UNREAD", gate: "anthropic" });
  });

  it("a gate that announces fewer slots queues the rest instead of letting the gate refuse them", async () => {
    const scheduler = createCallScheduler({ policy: WIDE });
    await applyPreviewGateCapacities({ scheduler, gates: [{ gate: "deepinfra", remaining: async () => remaining(2) }], log: () => undefined });
    const lane = scheduler.openLane("debate-1");
    const answers = Array.from({ length: 3 }, () => deferred<ProviderCallResult>());
    let next = 0;
    const gateway = laneGateway({
      lane, scheduler, subject: SUBJECT,
      provider: { call: () => { const index = next; next += 1; return answers[index]!.promise; } }
    });
    const calls = Array.from({ length: 3 }, () => gateway.call(request("PANEL:x")));
    await flush();
    expect(next).toBe(2);
    answers[0]!.resolve(answer("ok"));
    await flush();
    expect(next).toBe(3);
    for (const each of answers) each.resolve(answer("ok"));
    await Promise.all(calls);
    lane.close();
  });
});

describe("the runner's wiring (source pins)", () => {
  const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
  const RUNNER = read("apps/runner/src/index.ts");
  const MAIN = read("apps/runner/src/main.ts");

  it("execute opens the debate's lane after the claim and closes it in the outermost finally", () => {
    const execute = RUNNER.slice(RUNNER.indexOf("private async execute("), RUNNER.indexOf("export type RunnerExecutionResult ="));
    const claim = execute.indexOf("if (claimed === null) return { kind: \"NO_WORK\" };");
    const open = execute.indexOf("callScheduler.openLane(claimedRunId)");
    expect(claim).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(claim);
    // The outermost finally: it ends the method (then the class), after the story ran inside the try.
    expect(execute).toMatch(/\} finally \{\s*callLane\?\.close\(\);\s*keepAlive\.stop\(\);\s*\}\s*\}\s*\}\s*$/u);
    expect(execute.indexOf("await storyWriter.writeAfterSettle(")).toBeLessThan(execute.lastIndexOf("callLane?.close();"));
    expect(execute.match(/callLane\?\.close\(\)/gu) ?? []).toHaveLength(1);
  });

  it("claim renewals use the keep-alive repository when one is given", () => {
    expect(RUNNER).toContain("renew: (heldUntil) => (this.settings.renewals ?? this.#work).renewClaim(");
  });

  it("main.ts builds one scheduler, one busy coordinator and two separate in-flight counters", () => {
    expect(MAIN.match(/createCallScheduler\(/gu) ?? []).toHaveLength(1);
    expect(MAIN.match(/createPreviewBusyCoordinator\(\)/gu) ?? []).toHaveLength(1);
    expect(MAIN.match(/createRunInFlight\(\)/gu) ?? []).toHaveLength(2);
    expect(MAIN).toContain("withPreviewProviderCallPolicy(gateway, previewConfig, target, { busy: previewBusy })");
    expect(MAIN).toContain("inFlight: gatewayInFlight");
    expect(MAIN).toContain("inFlight: moneyInFlight");
    expect(MAIN).toContain("createPool(environment.DATABASE_URL, RUNNER_DATABASE_POOLS.keepAlive)");
  });
});
