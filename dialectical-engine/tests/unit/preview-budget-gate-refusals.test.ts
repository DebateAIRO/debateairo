// Step 1 (owner, 2026-10-08): the v2 spending gate answers a refusal with HTTP 409 and a
// JSON body {"error": CODE}. The application side reads that body over the real local
// socket protocol: the team's day being used up becomes the product's own daily code
// (DAILY_COST_ENVELOPE_REACHED, a run-level spend stop with its own "wait for tomorrow"
// lift); too many calls in flight is a transient provider failure (PROVIDER_CALL_FAILED, the
// runner cools down and retries), never a money stop, and by owner ruling R4 (2026-10-11) an
// unbilled one (one resend after the cooldown, a REFUSED row); every other refusal, and any body
// it cannot read, keeps today's behaviour. The counting gateway in front of the native one (the
// runner's ledger allowance) is proved on embedded PostgreSQL in
// tests/integration/preview-unbilled-retry-ledger.test.ts: this file wraps a bare gateway.
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isRunLevelSpendStop } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  schemaFailureLocator,
  type ProviderCallRequest,
  createPreviewBudgetRpcPort,
  createPreviewGuardedFetch,
  OpenAICompatibleProviderGateway,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  PROVIDER_COST_ENVELOPE_REFUSAL_CODES,
  providerTargetGatewayControls,
  previewTargetGatewayControls,
  withPreviewProviderCallPolicy,
  createPreviewBusyCoordinator,
  PreviewChargeBookedMax,
  PreviewGateUnavailable,
  PreviewGateUnsent,
  PreviewModelCooling,
  PreviewModelNotServed,
  PreviewUnbilledRefusal,
  PreviewVendorRefusedUnbilled,
  providerCallEndedVendorRefusedUnbilled,
  providerCallGateUnavailable,
  providerCallGateUnsent,
  ProviderUnbilledRefusal,
  type PreviewBudgetPort,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig,
  type ProviderLedgerInput
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

type Reply = Readonly<{ status: number; body: string }>;
/** Owner ruling 5's cooldown before the one retry of an unbilled call (preview-test.ts): one minute. */
const COOLDOWN_MS = 60_000;
const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A stand-in gate on a real unix socket; it records each request it receives. */
async function gate(reply: Reply): Promise<Readonly<{ port: ReturnType<typeof createPreviewBudgetRpcPort>; received: string[] }>> {
  return answering((response) => {
    response.writeHead(reply.status, { "content-type": "application/json" });
    response.end(reply.body);
  });
}

/** The same socket and protocol, with the answer written by `answer` once the request is read. */
async function answering(
  answer: (response: ServerResponse) => void
): Promise<Readonly<{ port: ReturnType<typeof createPreviewBudgetRpcPort>; received: string[] }>> {
  const directory = await mkdtemp(join(tmpdir(), "pvg-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const received: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString("utf8")}`);
      answer(response);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  // The socket path pattern is enforced by the env parser; this port is built directly.
  const config = Object.freeze({
    deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
    budget_socket: socket, scope_id: "fixture-scope"
  }) as unknown as PreviewProviderTestConfig;
  return Object.freeze({ port: createPreviewBudgetRpcPort(config), received });
}

const execution = Object.freeze({
  operationId: "00000000-0000-4000-8000-000000000001",
  requestBody: "{\"model\":\"zai-org/GLM-5.3-Flash\"}",
  requestSha256: "a".repeat(64),
  reservedUsd: "0.080000000"
});

describe("the preview spending gate's 409 refusal body", () => {
  it.each(["TEAM_DAILY_BUDGET_REACHED", "DAILY_CALL_LIMIT_REACHED"])(
    "%s becomes the product's daily code, not the per-run money code",
    async (code) => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      await expect(port.execute(execution)).rejects.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    }
  );

  it("SOMETHING_NEW (a code the app does not know) keeps today's per-run money refusal", async () => {
    const { port, received } = await gate({ status: 409, body: JSON.stringify({ error: "SOMETHING_NEW" }) });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });

  it("PREVIEW_TEST_AUTHORITY_STOPPED whose /remaining read fails keeps today's per-run money refusal", async () => {
    // Run resilience (c): STOPPED asks /remaining; this stand-in answers every path with the same 409, so the read
    // fails and the mapping falls back to today's money code. A halted /remaining is pinned in the describe below.
    const { port, received } = await gate({ status: 409, body: JSON.stringify({ error: "PREVIEW_TEST_AUTHORITY_STOPPED" }) });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete", "/remaining"]);
  });

  it.each([
    ["an array", "[\"TEAM_DAILY_BUDGET_REACHED\"]"],
    ["a non-string code", "{\"error\":7}"],
    ["null", "null"],
    ["a padded code", "{\"error\":\" TEAM_DAILY_BUDGET_REACHED\"}"]
  ])("a 409 body that is %s is not read as the daily code", async (_name, body) => {
    const { port } = await gate({ status: 409, body });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it.each(["PROVIDER_NOT_REACHED", "PROVIDER_REFUSED_UNBILLED", "PROVIDER_ERROR_UNBILLED"])(
    "owner ruling 5: %s (a provably unbilled call, hold released) is the transient retry path, never a money stop",
    async (code) => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(isRunLevelSpendStop(refusal)).toBe(false);
      expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
    }
  );

  it("CONCURRENCY_LIMIT_REACHED is a transient provider failure: never a money stop, never a run-level spend stop", async () => {
    // Too many GLM calls in flight is the gate's own 429: nothing was reserved or spent, and
    // the same call fits once one in flight settles. It is the transport failure every vendor
    // 429 already is (PROVIDER_CALL_FAILED), so the runner cools down and retries instead of
    // recording the debate's money ceiling as reached.
    const { port } = await gate({ status: 409, body: JSON.stringify({ error: "CONCURRENCY_LIMIT_REACHED" }) });
    const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    // Owner ruling R4 (2026-10-11): nothing was reserved or sent, so it is an unbilled refusal too.
    expect(refusal).toBeInstanceOf(PreviewUnbilledRefusal);
    expect(refusal).toBeInstanceOf(ProviderUnbilledRefusal);
    // Review amendment R-d (2026-10-12): the gate's OWN refusal says nothing about the model, so it is never the
    // vendor's unbilled refusal that makes a model sit out the rest of a run.
    expect(refusal).not.toBeInstanceOf(PreviewVendorRefusedUnbilled);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
  });

  it.each(["PROVIDER_NOT_REACHED", "PROVIDER_ERROR_UNBILLED"])(
    "parallel calls §3.4: %s is PreviewGateUnsent, still an unbilled refusal and never the model being busy",
    async (code) => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
      expect(refusal).toBeInstanceOf(PreviewGateUnsent);
      expect(refusal).toBeInstanceOf(PreviewUnbilledRefusal);
      expect(refusal).toBeInstanceOf(ProviderUnbilledRefusal);
      expect(refusal).not.toBeInstanceOf(PreviewVendorRefusedUnbilled);
      expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(providerCallGateUnsent(refusal)).toBe(true);
      expect(providerCallEndedVendorRefusedUnbilled(refusal)).toBe(false);
    }
  );

  it.each([
    ["CONCURRENCY_LIMIT_REACHED", { error: "CONCURRENCY_LIMIT_REACHED" }],
    ["PROVIDER_REFUSED_UNBILLED", { error: "PROVIDER_REFUSED_UNBILLED" }],
    ["MODEL_COOLING", { error: "MODEL_COOLING", retry_after: 60 }]
  ] as const)("parallel calls §3.4: %s is not gate-unsent", async (_code, body) => {
    const { port } = await gate({ status: 409, body: JSON.stringify(body) });
    const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PreviewUnbilledRefusal);
    expect(refusal).not.toBeInstanceOf(PreviewGateUnsent);
    expect(providerCallGateUnsent(refusal)).toBe(false);
  });

  it("providerCallGateUnsent reads only PreviewGateUnsent, bare or as a PROVIDER_CALL_FAILED's cause", () => {
    const wrapped = (cause: unknown) => Object.assign(new PreviewUnbilledRefusal("wrapper"), { cause });
    expect(providerCallGateUnsent(new PreviewGateUnsent())).toBe(true);
    expect(providerCallGateUnsent(wrapped(new PreviewGateUnsent()))).toBe(true);
    expect(providerCallGateUnsent(wrapped(new PreviewVendorRefusedUnbilled()))).toBe(false);
    expect(providerCallGateUnsent(wrapped(new PreviewModelCooling(60)))).toBe(false);
    expect(providerCallGateUnsent(new PreviewUnbilledRefusal())).toBe(false);
    expect(providerCallGateUnsent({ code: "PROVIDER_CALL_FAILED", cause: new PreviewGateUnsent() })).toBe(false);
    expect(providerCallGateUnsent(undefined)).toBe(false);
  });

  it("through the native gateway, CONCURRENCY_LIMIT_REACHED leaves as PROVIDER_CALL_FAILED, the money refusal as itself", async () => {
    const MODEL = "zai-org/GLM-5.3-Flash";
    const REF = "preview:fixture-a";
    const target = parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: REF, base_url: "https://api.deepinfra.com/v1/openai", model: MODEL,
      input_price_micros_per_million: 150000, output_price_micros_per_million: 500000,
      thinking_parameter: "reasoning_effort", thinking_levels: ["high"], context_window_tokens: 1048576
    }]), [{ providerRef: REF, maker: "Z.AI" }])[0]!;
    const preview = parsePreviewProviderTestConfig(JSON.stringify({
      deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture-scope"
    }))!;
    const slept: number[] = [];
    const call = async (code: string): Promise<unknown> => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      const gateway = withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
        endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
        fetchImplementation: createPreviewGuardedFetch(port),
        persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
        assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
      }), preview, target, { sleep: async (milliseconds) => { slept.push(milliseconds); } });
      return gateway.call({
        runId: "run:synthetic", subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:test", providerRef: REF,
        packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
      }).then(() => null, (error: unknown) => error);
    };
    const busy = await call("CONCURRENCY_LIMIT_REACHED");
    expect(busy).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(isRunLevelSpendStop(busy)).toBe(false);
    // Owner ruling R4 (2026-10-11): a busy gate is unbilled, so it gets the one resend after the cooldown.
    expect(slept).toEqual([COOLDOWN_MS]);
    // Review amendment R-d (2026-10-12): only the vendor's unbilled refusal ends a call as "the model is busy".
    expect(providerCallEndedVendorRefusedUnbilled(busy)).toBe(false);
    expect(busy).toMatchObject({ cause: expect.any(PreviewUnbilledRefusal) });
    // Parallel calls §3.4: the gate's own slot refusal says nothing about reaching the vendor.
    expect(providerCallGateUnsent(busy)).toBe(false);
    // Review 2026-10-12: PROVIDER_ERROR_UNBILLED (a vendor error that bills nothing but is not "busy", e.g.
    // Anthropic's 400/404/413/500) is the plain unbilled refusal, as before gate v4: the model never sits out for it.
    for (const [unsent, vendorBusy] of [["PROVIDER_NOT_REACHED", false], ["PROVIDER_REFUSED_UNBILLED", true],
      ["PROVIDER_ERROR_UNBILLED", false]] as const) {
      const refusal = await call(unsent);
      expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: expect.any(PreviewUnbilledRefusal) });
      expect(isRunLevelSpendStop(refusal)).toBe(false);
      expect(providerCallEndedVendorRefusedUnbilled(refusal), unsent).toBe(vendorBusy);
      expect((refusal as { cause: unknown }).cause instanceof PreviewVendorRefusedUnbilled, unsent).toBe(vendorBusy);
      // Parallel calls §3.4: the two "could not get an answer out of the vendor" refusals are named gate-unsent.
      expect(providerCallGateUnsent(refusal), unsent).toBe(!vendorBusy);
    }
    // Owner ruling 5: each unbilled refusal is sent once more after the cooldown, and only once.
    expect(slept).toEqual([COOLDOWN_MS, COOLDOWN_MS, COOLDOWN_MS, COOLDOWN_MS]);
    await expect(call("PREVIEW_TEST_AUTHORITY_STOPPED")).resolves.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(slept).toHaveLength(4);
  });

  describe("owner ruling 5: one retry after the cooldown, only for a call the gate proved unbilled", () => {
    const MODEL = "zai-org/GLM-5.3-Flash";
    const REF = "preview:fixture-a";
    const preview = parsePreviewProviderTestConfig(JSON.stringify({
      deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture-scope"
    }))!;
    const usage = { prompt_tokens: 10, completion_tokens: 20 };
    const choices = [{ message: { content: "{}" }, finish_reason: "stop" }];
    const answer = JSON.stringify({ status: 200, body: JSON.stringify({ id: "synthetic", model: MODEL, choices, usage }) });
    /** A port that answers each execution from `script`: an Error is thrown, a string is the gate's reply. */
    const scripted = (script: Array<Error | string>) => {
      const sent: string[] = [];
      const port: PreviewBudgetPort = { execute: async (input) => {
        sent.push(input.requestBody);
        const next = script.shift() ?? new Error("script exhausted");
        if (next instanceof Error) throw next;
        const reply = JSON.parse(next) as { status: number; body: string };
        return reply;
      } };
      return { sent, port };
    };
    const gatewayFor = (port: PreviewBudgetPort, slept: number[], ledger: ProviderLedgerInput[] = [],
      options: Readonly<{ busy?: ReturnType<typeof createPreviewBusyCoordinator>; sleep?: (milliseconds: number) => Promise<void>; onGateUnsent?: (gate: string) => void }> = {}) => {
      const thinking = { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] };
      const target = parseProviderDiscoveryTargets(JSON.stringify([{
        provider_ref: REF, base_url: "https://api.deepinfra.com/v1/openai", model: MODEL,
        input_price_micros_per_million: 150000, output_price_micros_per_million: 500000,
        ...thinking, context_window_tokens: 1048576
      }]), [{ providerRef: REF, maker: "Z.AI" }])[0]!;
      return withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
        endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
        fetchImplementation: createPreviewGuardedFetch(port),
        persistRawArtifact: async (artifact) => artifact.artifactId,
        appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
        assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
      }), preview, target, { sleep: async (milliseconds) => { slept.push(milliseconds); await options.sleep?.(milliseconds); },
        ...(options.busy === undefined ? {} : { busy: options.busy }),
        ...(options.onGateUnsent === undefined ? {} : { onGateUnsent: options.onGateUnsent }) });
    };
    const site = "fixture:judge";
    const contract = "contract:test";
    const bound = { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 };
    const request = {
      runId: "run:synthetic", subjectItemId: "node:test", role: "JUDGE" as const, lane: "served" as const,
      callSiteKey: site,
      bound, contractHash: contract, providerRef: REF,
      packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
    };

    it("an unbilled refusal then an answer: the call succeeds on its one retry, after the cooldown", async () => {
      const slept: number[] = [];
      const { sent, port } = scripted([new PreviewUnbilledRefusal(), answer]);
      await expect(gatewayFor(port, slept).call(request)).resolves.toBeDefined();
      expect(sent).toHaveLength(2);
      expect(sent[1]).toBe(sent[0]);
      expect(slept).toEqual([COOLDOWN_MS]);
    });

    // Preview retry fix, option B (spec 2026-10-11 §1.1): the step's bound (3 here) is its lifetime
    // allowance; each send inside one call is ONE POST, so "never a second retry" is per call.
    it("never a second retry inside one call, never for any other failure, one POST per send", async () => {
      const twice: number[] = [];
      const again = scripted([new PreviewUnbilledRefusal(), new PreviewUnbilledRefusal(), answer]);
      await expect(gatewayFor(again.port, twice).call(request)).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(again.sent).toHaveLength(2);
      expect(twice).toHaveLength(1);
      const other: number[] = [];
      const failed = scripted([new Error("connection reset"), answer]);
      await expect(gatewayFor(failed.port, other).call(request)).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(failed.sent).toHaveLength(1);
      expect(other).toEqual([]);
    });

    /**
     * Parallel calls §3.3 (owner ruling O4): three calls of one model in flight, all refused busy by the vendor. With a
     * busy coordinator exactly ONE of them (the probe) waits and resends; the other two wait for its outcome.
     */
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      return { promise, resolve };
    };
    /** A port answering execution N with `script(N)`: a thrown Error, a gate reply, or a reply held until `hold` resolves. */
    const sequenced = (script: (index: number) => Error | string | Promise<string>) => {
      const sent: string[] = [];
      const port: PreviewBudgetPort = { execute: async (input) => {
        sent.push(input.requestBody);
        const next = await script(sent.length);
        if (next instanceof Error) throw next;
        return JSON.parse(next) as { status: number; body: string };
      } };
      return { sent, port };
    };
    const threeCalls = (gateway: ReturnType<typeof gatewayFor>) => ["a", "b", "c"].map((suffix) =>
      gateway.call({ ...request, callSiteKey: `${site}:${suffix}`, subjectItemId: `node:${suffix}` })
        .then(() => "ANSWERED", (error: unknown) => error));

    it("busy coordinator: three calls refused busy → ONE probe resend; probe answered → the other two resend once each", async () => {
      const slept: number[] = [];
      const cooled = deferred();
      const probeHeld = deferred();
      const { sent, port } = sequenced((index) => index <= 3 ? new PreviewVendorRefusedUnbilled()
        : index === 4 ? probeHeld.promise.then(() => answer) : answer);
      const gateway = gatewayFor(port, slept, [], { busy: createPreviewBusyCoordinator(), sleep: () => cooled.promise });
      const results = threeCalls(gateway);
      await vi.waitFor(() => { expect(sent).toHaveLength(3); expect(slept).toEqual([COOLDOWN_MS]); });
      // Only the probe waits the cooldown; the other two are parked on the coordinator, not sleeping.
      cooled.resolve();
      await vi.waitFor(() => { expect(sent).toHaveLength(4); });
      await new Promise((done) => setTimeout(done, 20));
      // Exactly one resend POST before the probe's outcome.
      expect(sent).toHaveLength(4);
      probeHeld.resolve();
      await expect(Promise.all(results)).resolves.toEqual(["ANSWERED", "ANSWERED", "ANSWERED"]);
      expect(sent).toHaveLength(6);
      expect(slept).toEqual([COOLDOWN_MS]);
    });

    it("busy coordinator: the probe refused busy again → the other two end now with their own busy refusal, no second POST", async () => {
      const slept: number[] = [];
      const ledger: ProviderLedgerInput[] = [];
      const { sent, port } = sequenced(() => new PreviewVendorRefusedUnbilled());
      const gateway = gatewayFor(port, slept, ledger, { busy: createPreviewBusyCoordinator() });
      const results = await Promise.all(threeCalls(gateway));
      for (const refusal of results) {
        expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: expect.any(PreviewVendorRefusedUnbilled) });
        expect(providerCallEndedVendorRefusedUnbilled(refusal)).toBe(true);
      }
      expect(sent).toHaveLength(4);
      expect(slept).toEqual([COOLDOWN_MS]);
      expect(ledger.map((entry) => entry.outcome)).toEqual(["REFUSED", "REFUSED", "REFUSED", "REFUSED"]);
    });

    it("busy coordinator: the probe ends another way → the other two still get their one resend", async () => {
      const slept: number[] = [];
      const { sent, port } = sequenced((index) => index <= 3 ? new PreviewVendorRefusedUnbilled()
        : index === 4 ? new Error("connection reset") : answer);
      const gateway = gatewayFor(port, slept, [], { busy: createPreviewBusyCoordinator() });
      const results = await Promise.all(threeCalls(gateway));
      expect(results.filter((result) => result === "ANSWERED")).toHaveLength(2);
      expect(results.filter((result) => result !== "ANSWERED")).toEqual([expect.objectContaining({ code: "PROVIDER_CALL_FAILED" })]);
      expect(sent).toHaveLength(6);
      expect(slept).toEqual([COOLDOWN_MS]);
    });

    it("busy coordinator: a probe whose wait throws still releases the waiters (no hang), who resend once", async () => {
      const slept: number[] = [];
      const { sent, port } = sequenced((index) => index <= 3 ? new PreviewVendorRefusedUnbilled() : answer);
      const gateway = gatewayFor(port, slept, [], { busy: createPreviewBusyCoordinator(),
        sleep: () => Promise.reject(new Error("aborted while waiting")) });
      const results = await Promise.all(threeCalls(gateway));
      expect(results.filter((result) => result === "ANSWERED")).toHaveLength(2);
      expect(results.filter((result) => result !== "ANSWERED")).toEqual([expect.objectContaining({ message: "aborted while waiting" })]);
      expect(sent).toHaveLength(5);
    });

    it("busy coordinator: the probe waits the gate's longer cool-off; the gate's own refusals keep today's path", async () => {
      const slept: number[] = [];
      const cooling = sequenced((index) => index === 1 ? new PreviewModelCooling(120) : answer);
      await expect(gatewayFor(cooling.port, slept, [], { busy: createPreviewBusyCoordinator() }).call(request)).resolves.toBeDefined();
      expect(slept).toEqual([120_000]);
      const unsent: number[] = [];
      const busy = createPreviewBusyCoordinator();
      const gateUnsent = sequenced((index) => index <= 2 ? new PreviewGateUnsent() : answer);
      await expect(gatewayFor(gateUnsent.port, unsent, [], { busy }).call(request)).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(unsent).toEqual([COOLDOWN_MS]);
      expect(gateUnsent.sent).toHaveLength(2);
      // A gate-unsent refusal never opens the model: the next call is admitted and its busy refusal is a fresh probe.
      await expect(busy.refusedBusy(MODEL, undefined)).resolves.toBe("PROBE");
    });

    /**
     * Spec §3.4 (final review, minor 6): the gate is marked unhealthy on the FIRST PreviewGateUnsent, before the
     * policy's 60 s resend wait — not only when the call finally fails at the lane — so the gate admits one call in
     * flight during that minute. Never for the gate's own slots refusal or a busy model.
     */
    it("onGateUnsent: told of the gate on the first gate-unsent refusal, before the resend wait; never for other refusals", async () => {
      const events: string[] = [];
      const record = (milliseconds: number) => { events.push(`sleep:${String(milliseconds)}`); return Promise.resolve(); };
      const onGateUnsent = (gate: string) => { events.push(`unsent:${gate}`); };
      const unsent = sequenced((index) => index === 1 ? new PreviewGateUnsent() : answer);
      await expect(gatewayFor(unsent.port, [], [], { sleep: record, onGateUnsent }).call(request)).resolves.toBeDefined();
      expect(events).toEqual(["unsent:deepinfra", `sleep:${String(COOLDOWN_MS)}`]);
      events.length = 0;
      const slots = sequenced((index) => index === 1 ? new PreviewUnbilledRefusal() : answer);
      await expect(gatewayFor(slots.port, [], [], { sleep: record, onGateUnsent }).call(request)).resolves.toBeDefined();
      const busyModel = sequenced((index) => index === 1 ? new PreviewVendorRefusedUnbilled() : answer);
      await expect(gatewayFor(busyModel.port, [], [], { sleep: record, onGateUnsent }).call(request)).resolves.toBeDefined();
      expect(events).toEqual([`sleep:${String(COOLDOWN_MS)}`, `sleep:${String(COOLDOWN_MS)}`]);
    });

    it("onGateUnsent that throws never changes the call: it still waits and resends once", async () => {
      const slept: number[] = [];
      const unsent = sequenced((index) => index === 1 ? new PreviewGateUnsent() : answer);
      await expect(gatewayFor(unsent.port, slept, [], { onGateUnsent: () => { throw new Error("test-layer hook"); } }).call(request))
        .resolves.toBeDefined();
      expect(slept).toEqual([COOLDOWN_MS]);
      expect(unsent.sent).toHaveLength(2);
    });

    it("an unbilled attempt is recorded REFUSED, a billed failure FAILED; the thrown error keeps FAILED", async () => {
      const ledger: ProviderLedgerInput[] = [];
      const refused = scripted([new PreviewUnbilledRefusal(), new PreviewUnbilledRefusal()]);
      await expect(gatewayFor(refused.port, [], ledger).call(request))
        .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED", lastOutcome: "FAILED" });
      expect(ledger.map((entry) => entry.outcome)).toEqual(["REFUSED", "REFUSED"]);
      const billed: ProviderLedgerInput[] = [];
      const reset = scripted([new Error("connection reset")]);
      await expect(gatewayFor(reset.port, [], billed).call(request)).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(billed.map((entry) => entry.outcome)).toEqual(["FAILED"]);
    });
  });

  it("an unreadable 409 body keeps today's answer and throws nothing else", async () => {
    const { port } = await gate({ status: 409, body: "<html>not json" });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
  });

  it("the daily code is read only from a refusal: another status carrying it keeps today's answer", async () => {
    const { port } = await gate({ status: 500, body: JSON.stringify({ error: "TEAM_DAILY_BUDGET_REACHED" }) });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it("a 200 answer still resolves the upstream reply, over the unchanged request protocol", async () => {
    const { port, received } = await gate({ status: 200, body: JSON.stringify({ status: 200, body: "{\"ok\":true}" }) });
    await expect(port.execute(execution)).resolves.toEqual({ status: 200, body: "{\"ok\":true}" });
    expect(received).toEqual([`POST /complete ${JSON.stringify({ scope_id: "fixture-scope", ...execution })}`]);
  });
});

/**
 * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (c), test T4). On
 * 2026-10-11 the DeepInfra gate reached its daily unbilled ceiling and halted; the resend that followed was refused
 * PREVIEW_TEST_AUTHORITY_STOPPED, which the app read as the run's money ceiling (preview-test.ts previewAuthorityRefusal)
 * although the preview has no run money seam. A STOPPED refusal now asks the same gate's read-only `/remaining`: a gate
 * that is not active, or whose window is shut, is UNAVAILABLE (a non-money PROVIDER_GATE_UNAVAILABLE, never resent);
 * any other answer, and any failure to read one, keeps today's mapping.
 */
describe("run resilience (c): a halted gate is unavailable, not money", () => {
  type Remaining = Readonly<{ state: "active" | "initialized" | "halted"; window_open: boolean }>;
  /** The /remaining reply of Contract A §5, with the given state and window. */
  const remainingReply = (remaining: Remaining): string => JSON.stringify({
    enabled_models: ["zai-org/GLM-5.3-Flash"], largest_reservation_usd: "0.080000000", max_concurrent_calls: 10,
    remaining_calls: 1980, remaining_usd: "9.500000000", state: remaining.state, window_open: remaining.window_open
  });
  /** One gate socket: /complete refuses STOPPED, /remaining answers `remaining` (a status and body). */
  async function stoppedGate(remaining: Reply) {
    return answeringByPath((path, response) => {
      if (path === "/remaining") {
        response.writeHead(remaining.status, { "content-type": "application/json" });
        response.end(remaining.body);
        return;
      }
      response.writeHead(409, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "PREVIEW_TEST_AUTHORITY_STOPPED" }));
    });
  }

  it.each([
    ["halted", { state: "halted", window_open: true }],
    ["initialized", { state: "initialized", window_open: true }],
    ["active but with its window shut", { state: "active", window_open: false }]
  ] as const)("STOPPED from a gate that reads %s is PROVIDER_GATE_UNAVAILABLE, never a spend stop", async (_name, state) => {
    const { port, received } = await stoppedGate({ status: 200, body: remainingReply(state) });
    const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
    expect(refusal).toMatchObject({ code: "PROVIDER_GATE_UNAVAILABLE" });
    expect(providerCallGateUnavailable(refusal)).toBe(true);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
    // One /complete, then one read-only /remaining on the same socket with the scope only.
    expect(received).toEqual([
      `POST /complete ${JSON.stringify({ scope_id: "fixture-scope", ...execution })}`,
      `POST /remaining ${JSON.stringify({ scope_id: "fixture-scope" })}`
    ]);
  });

  it("STOPPED from a gate that still reads active and open keeps today's money mapping", async () => {
    const { port } = await stoppedGate({ status: 200, body: remainingReply({ state: "active", window_open: true }) });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it.each([
    ["a refusal", { status: 409, body: JSON.stringify({ error: "PREVIEW_TEST_AUTHORITY_STOPPED" }) }],
    ["a reply of another shape", { status: 200, body: JSON.stringify({ state: "halted" }) }]
  ])("STOPPED with /remaining answering %s keeps today's money mapping", async (_name, reply) => {
    const { port } = await stoppedGate(reply);
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it("only STOPPED asks /remaining: every other refusal keeps its own mapping and reads nothing more", async () => {
    for (const code of ["TEAM_DAILY_BUDGET_REACHED", "PROVIDER_REFUSED_UNBILLED", "SOMETHING_NEW"]) {
      const { port, received } = await answeringByPath((_path, response) => {
        response.writeHead(409, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: code }));
      });
      await port.execute(execution).catch(() => undefined);
      expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
    }
  });

  it("through the native gateway: one POST, no resend, a FAILED row, and PROVIDER_CALL_FAILED caused by the unavailable gate", async () => {
    const MODEL = "zai-org/GLM-5.3-Flash";
    const REF = "preview:fixture-a";
    const target = parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: REF, base_url: "https://api.deepinfra.com/v1/openai", model: MODEL,
      input_price_micros_per_million: 150000, output_price_micros_per_million: 500000,
      thinking_parameter: "reasoning_effort", thinking_levels: ["high"], context_window_tokens: 1048576
    }]), [{ providerRef: REF, maker: "Z.AI" }])[0]!;
    const preview = parsePreviewProviderTestConfig(JSON.stringify({
      deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture-scope"
    }))!;
    const { port, received } = await stoppedGate({ status: 200, body: remainingReply({ state: "halted", window_open: true }) });
    const slept: number[] = [];
    const ledger: ProviderLedgerInput[] = [];
    const gateway = withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
      endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
      fetchImplementation: createPreviewGuardedFetch(port),
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
    }), preview, target, { sleep: async (milliseconds) => { slept.push(milliseconds); } });
    const refusal: unknown = await gateway.call({
      runId: "run:synthetic", subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:test", providerRef: REF,
      packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
    }).then(() => null, (error: unknown) => error);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_GATE_UNAVAILABLE" } });
    expect(providerCallGateUnavailable(refusal)).toBe(true);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    // Never resent: the 60-second resend is for unbilled refusals only, and a halted gate stays halted.
    expect(slept).toEqual([]);
    expect(received.filter((line) => line.startsWith("POST /complete"))).toHaveLength(1);
    // The FAILED row is kept (a counted attempt of THIS maker only, fix (b)).
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });
});

/**
 * Gate v4 (gate fix 2026-10-12, preview_budget_authority.py): the gate answers two new public refusals.
 * MODEL_COOLING (with retry_after whole seconds, 1..600): ONE model is cooling off after two or more vendor-unbilled
 * refusals in a row; the gate refused before reserving anything and never contacted the vendor. It is read exactly like
 * the vendor's own unbilled refusal (the model is busy): a REFUSED row, the one 60-second resend, and the model sits
 * out. AUTHORITY_HALTED: the gate was already halted when the call arrived (found before any reservation); it is the
 * unavailable gate of fix (c) straight away, with no /remaining read and no resend. STOPPED keeps its /remaining read.
 */
describe("gate v4: MODEL_COOLING is a busy model, AUTHORITY_HALTED is an unavailable gate", () => {
  const MODEL = "zai-org/GLM-5.3-Flash";
  const REF = "preview:fixture-a";
  /** One gate socket answering every /complete with `body` (a 409), and recording whether /remaining is ever asked. */
  const refusingGate = (body: string) => answeringByPath((_path, response) => {
    response.writeHead(409, { "content-type": "application/json" });
    response.end(body);
  });
  const refusalOf = (port: PreviewBudgetPort): Promise<unknown> => port.execute(execution).then(() => null, (error: unknown) => error);

  it.each([
    ["with retry_after", { error: "MODEL_COOLING", retry_after: 120 }, 120],
    ["without retry_after", { error: "MODEL_COOLING" }, undefined],
    ["with a retry_after over the 600 s ceiling", { error: "MODEL_COOLING", retry_after: 601 }, undefined],
    ["with a zero retry_after", { error: "MODEL_COOLING", retry_after: 0 }, undefined],
    ["with a fractional retry_after", { error: "MODEL_COOLING", retry_after: 1.5 }, undefined],
    ["with a text retry_after", { error: "MODEL_COOLING", retry_after: "60" }, undefined]
  ] as const)("MODEL_COOLING %s is the vendor's busy refusal, unbilled, never money", async (_name, body, retryAfter) => {
    const { port, received } = await refusingGate(JSON.stringify(body));
    const refusal = await refusalOf(port);
    expect(refusal).toBeInstanceOf(PreviewModelCooling);
    expect(refusal).toBeInstanceOf(PreviewVendorRefusedUnbilled);
    expect(refusal).toBeInstanceOf(PreviewUnbilledRefusal);
    expect(refusal).toBeInstanceOf(ProviderUnbilledRefusal);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect((refusal as PreviewModelCooling).retryAfterSeconds).toBe(retryAfter);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
    expect(providerCallGateUnavailable(refusal)).toBe(false);
    // Only STOPPED asks /remaining.
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });

  it("AUTHORITY_HALTED is PROVIDER_GATE_UNAVAILABLE at once: /remaining is never asked, never money", async () => {
    const { port, received } = await refusingGate(JSON.stringify({ error: "AUTHORITY_HALTED" }));
    const refusal = await refusalOf(port);
    expect(refusal).toBeInstanceOf(PreviewGateUnavailable);
    expect(refusal).toMatchObject({ code: "PROVIDER_GATE_UNAVAILABLE" });
    expect(refusal).not.toBeInstanceOf(ProviderUnbilledRefusal);
    expect(providerCallGateUnavailable(refusal)).toBe(true);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });

  /** A gate socket refusing every /complete with {"error": code}, its port built with a /remaining port that records each ask. */
  const withRecordedRemaining = async (code: string) => {
    const asked: string[] = [];
    const directory = await mkdtemp(join(tmpdir(), "pvg-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(409, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: code }));
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    const config = Object.freeze({
      deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high", budget_socket: socket, scope_id: "fixture-scope"
    }) as unknown as PreviewProviderTestConfig;
    const halted: PreviewGateRemaining = { state: "halted", windowOpen: true } as unknown as PreviewGateRemaining;
    const port = createPreviewBudgetRpcPort(config, socket, { remaining: async () => { asked.push("remaining"); return halted; } });
    return { port, asked };
  };

  it("AUTHORITY_HALTED never asks an injected /remaining port either", async () => {
    const { port, asked } = await withRecordedRemaining("AUTHORITY_HALTED");
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "PROVIDER_GATE_UNAVAILABLE" });
    expect(asked).toEqual([]);
  });

  it("STOPPED still asks the injected /remaining port, as before", async () => {
    const { port, asked } = await withRecordedRemaining("PREVIEW_TEST_AUTHORITY_STOPPED");
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "PROVIDER_GATE_UNAVAILABLE" });
    expect(asked).toEqual(["remaining"]);
  });

  it("through the native gateway: MODEL_COOLING gets the one resend and ends the call as the vendor's busy refusal", async () => {
    const target = parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: REF, base_url: "https://api.deepinfra.com/v1/openai", model: MODEL,
      input_price_micros_per_million: 150000, output_price_micros_per_million: 500000,
      thinking_parameter: "reasoning_effort", thinking_levels: ["high"], context_window_tokens: 1048576
    }]), [{ providerRef: REF, maker: "Z.AI" }])[0]!;
    const preview = parsePreviewProviderTestConfig(JSON.stringify({
      deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture-scope"
    }))!;
    const call = async (body: string) => {
      const { port, received } = await refusingGate(body);
      const slept: number[] = [];
      const ledger: ProviderLedgerInput[] = [];
      const gateway = withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
        endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
        fetchImplementation: createPreviewGuardedFetch(port),
        persistRawArtifact: async (artifact) => artifact.artifactId,
        appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
        assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
      }), preview, target, { sleep: async (milliseconds) => { slept.push(milliseconds); } });
      const refusal: unknown = await gateway.call({
        runId: "run:synthetic", subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:test", providerRef: REF,
        packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
      }).then(() => null, (error: unknown) => error);
      return { refusal, slept, ledger, received };
    };
    const cooling = await call(JSON.stringify({ error: "MODEL_COOLING", retry_after: 60 }));
    expect(cooling.refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: expect.any(PreviewModelCooling) });
    expect(providerCallEndedVendorRefusedUnbilled(cooling.refusal)).toBe(true);
    expect(providerCallGateUnavailable(cooling.refusal)).toBe(false);
    expect(isRunLevelSpendStop(cooling.refusal)).toBe(false);
    // The one resend after the cooldown, like PROVIDER_REFUSED_UNBILLED; two REFUSED rows, nothing counted.
    expect(cooling.slept).toEqual([COOLDOWN_MS]);
    expect(cooling.received.filter((line) => line.startsWith("POST /complete"))).toHaveLength(2);
    expect(cooling.ledger.map((entry) => entry.outcome)).toEqual(["REFUSED", "REFUSED"]);

    const halted = await call(JSON.stringify({ error: "AUTHORITY_HALTED" }));
    expect(halted.refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_GATE_UNAVAILABLE" } });
    expect(providerCallGateUnavailable(halted.refusal)).toBe(true);
    expect(providerCallEndedVendorRefusedUnbilled(halted.refusal)).toBe(false);
    expect(isRunLevelSpendStop(halted.refusal)).toBe(false);
    // Never resent, never a /remaining read; the FAILED row is kept (this maker's own, fix (b)).
    expect(halted.slept).toEqual([]);
    expect(halted.received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
    expect(halted.ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });
});

/**
 * Side-by-side spec §9 (decision D6): during an upload two releases share one gate, so the gate's GO can stop serving a
 * model (its row is gone: MODEL_NOT_ALLOWED) or a price (the release reserved a different amount: RESERVATION_MISMATCH)
 * that the older release's debates still ask for. Both are refused before anything is reserved or sent. The gate now
 * names them, and the app reads them as that one model sitting out (the busy model's unbilled refusal), never money.
 */
describe("side-by-side §9: a model or price this release's gate no longer serves sits out, never money", () => {
  it.each(["MODEL_NOT_ALLOWED", "RESERVATION_MISMATCH"])("%s is the busy model's unbilled refusal, not money", async (code) => {
    const { port, received } = await answeringByPath((_path, response) => {
      response.writeHead(409, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: code }));
    });
    const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PreviewModelNotServed);
    expect(refusal).toBeInstanceOf(PreviewVendorRefusedUnbilled);
    expect(refusal).toBeInstanceOf(PreviewUnbilledRefusal);
    expect(refusal).toBeInstanceOf(ProviderUnbilledRefusal);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
    expect(providerCallGateUnavailable(refusal)).toBe(false);
    // Only STOPPED asks /remaining.
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });
});

/** Like `answering`, with the request's path handed to `answer`, so /complete and /remaining can answer apart. */
async function answeringByPath(
  answer: (path: string, response: ServerResponse) => void
): Promise<Readonly<{ port: ReturnType<typeof createPreviewBudgetRpcPort>; received: string[] }>> {
  const directory = await mkdtemp(join(tmpdir(), "pvg-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const received: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString("utf8")}`);
      answer(request.url ?? "", response);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  const config = Object.freeze({
    deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
    budget_socket: socket, scope_id: "fixture-scope"
  }) as unknown as PreviewProviderTestConfig;
  return Object.freeze({ port: createPreviewBudgetRpcPort(config), received });
}

/** The port's promise, or a test failure if it has not settled within `ms`: a reply that never settles hangs a debate. */
function settledWithin<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`test: the gate reply never settled within ${String(ms)} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

describe("the preview spending gate's reply always settles", () => {
  it("a reply over 8 MB is refused and the call settles, instead of hanging", async () => {
    const { port } = await answering((response) => {
      response.on("error", () => undefined);
      response.writeHead(200, { "content-type": "application/json" });
      const megabyte = Buffer.alloc(1024 * 1024, 0x20);
      for (let index = 0; index < 9; index += 1) response.write(megabyte);
      response.end();
    });
    await expect(settledWithin(port.execute(execution), 5_000)).rejects.toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
  });

  it("a reply cut off before its end is refused and the call settles", async () => {
    const { port } = await answering((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write("{\"status\":200,\"bo");
      setTimeout(() => response.socket?.destroy(), 20);
    });
    await expect(settledWithin(port.execute(execution), 5_000)).rejects.toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
  });
});

/**
 * Slow answer (owner ruling 2026-10-12): the gate's new public refusal PROVIDER_CHARGE_BOOKED_MAX. The call was reserved
 * and SENT; the vendor connection then failed or ran past the gate's 1,200 s deadline; the gate booked the call's whole
 * reservation as its charge and stays active. Until now the gate answered such a call PREVIEW_TEST_AUTHORITY_STOPPED,
 * which the app read (after a /remaining read) as the run's money ceiling. It is the app's own sent-and-failed
 * transport failure: billed (never REFUSED, never the unbilled 60-second resend), never money, never "gate unavailable".
 */
describe("PROVIDER_CHARGE_BOOKED_MAX: a sent call the gate charged at its reservation is a billed transport failure", () => {
  const booked = { status: 409, body: JSON.stringify({ error: "PROVIDER_CHARGE_BOOKED_MAX" }) };

  it("the port reads it as a billed transport failure, without asking /remaining", async () => {
    const { port, received } = await gate(booked);
    const refusal: unknown = await port.execute(execution).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PreviewChargeBookedMax);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(refusal).not.toBeInstanceOf(ProviderUnbilledRefusal);
    expect(refusal).not.toBeInstanceOf(PreviewGateUnavailable);
    expect(providerCallGateUnavailable(refusal)).toBe(false);
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });

  const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
  const REF = "preview:mimo-v2-6-pro";
  const preview = parsePreviewProviderTestConfig(JSON.stringify({
    deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
    premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", MIMO], requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture-scope"
  }))!;
  const gatewayFor = (port: PreviewBudgetPort, slept: number[], ledger: ProviderLedgerInput[], sent: string[]) => {
    const target = parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: REF, base_url: "https://api.deepinfra.com/v1/openai", model: MIMO,
      input_price_micros_per_million: 430000, output_price_micros_per_million: 870000, context_window_tokens: 1048576
    }]), [{ providerRef: REF, maker: "Xiaomi" }])[0]!;
    const recording: PreviewBudgetPort = { execute: (input, signal) => { sent.push(input.requestBody); return port.execute(input, signal); } };
    return withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
      endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
      // As apps/runner/src/main.ts composes it: the preview's own controls after the target's (LG-B Task 3).
      ...previewTargetGatewayControls(preview, target),
      fetchImplementation: createPreviewGuardedFetch(recording),
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
    }), preview, target, { sleep: async (milliseconds) => { slept.push(milliseconds); } });
  };

  it("through the native gateway a debate call records ONE billed FAILED attempt, is not resent, and leaves as PROVIDER_CALL_FAILED", async () => {
    const { port, received } = await gate(booked);
    const slept: number[] = [];
    const ledger: ProviderLedgerInput[] = [];
    const sent: string[] = [];
    const failure: unknown = await gatewayFor(port, slept, ledger, sent).call({
      runId: "run:synthetic", subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:test", providerRef: REF,
      packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
    }).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "PROVIDER_CALL_FAILED", lastOutcome: "FAILED", cause: expect.any(PreviewChargeBookedMax) });
    expect(isRunLevelSpendStop(failure)).toBe(false);
    expect(providerCallGateUnavailable(failure)).toBe(false);
    expect(providerCallEndedVendorRefusedUnbilled(failure)).toBe(false);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
    expect(sent).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(received.map((line) => line.split(" ")[1])).toEqual(["/complete"]);
  });

  it("the storyteller's call uses its second POST at the same 16,384 allowance (MiMo), each a billed FAILED attempt", async () => {
    const { port } = await gate(booked);
    const slept: number[] = [];
    const ledger: ProviderLedgerInput[] = [];
    const sent: string[] = [];
    const framed = buildFramedPrompt({
      contract: { contractId: "story.storyteller.v3", instruction: "Do the synthetic story step.", answerForm: "Return one JSON object." },
      material: [{ name: "story_material", content: "One policy position, cited as P1." }]
    });
    const storyteller: ProviderCallRequest = {
      runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER", lane: "story",
      bound: { maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 }, contractHash: "contract:synthetic-STORYTELLER",
      providerRef: REF, packet: framed.packet, preferredResponseFormat: "json_object",
      classifyContent: () => ({ parseStatus: "PARSED", parseError: null }),
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
    };
    const failure: unknown = await gatewayFor(port, slept, ledger, sent).call(storyteller).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "PROVIDER_CALL_FAILED", lastOutcome: "FAILED", cause: expect.any(PreviewChargeBookedMax) });
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED"]);
    expect(sent.map((body) => JSON.parse(body).max_tokens)).toEqual([16_384, 16_384]);
    expect(slept).toEqual([]);
  });
});
