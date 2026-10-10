// Step 1 (owner, 2026-10-08): the v2 spending gate answers a refusal with HTTP 409 and a
// JSON body {"error": CODE}. The application side reads that body over the real local
// socket protocol: the team's day being used up becomes the product's own daily code
// (DAILY_COST_ENVELOPE_REACHED, a run-level spend stop with its own "wait for tomorrow"
// lift); too many calls in flight is a transient provider failure (PROVIDER_CALL_FAILED, the
// runner cools down and retries), never a money stop; every other refusal, and any body it
// cannot read, keeps today's behaviour.
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isRunLevelSpendStop } from "@debateai/kernel";
import {
  createPreviewBudgetRpcPort,
  createPreviewGuardedFetch,
  OpenAICompatibleProviderGateway,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  PROVIDER_COST_ENVELOPE_REFUSAL_CODES,
  providerTargetGatewayControls,
  withPreviewProviderCallPolicy,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

type Reply = Readonly<{ status: number; body: string }>;
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

  it.each(["PREVIEW_TEST_AUTHORITY_STOPPED", "SOMETHING_NEW"])(
    "%s keeps today's per-run money refusal",
    async (code) => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    }
  );

  it.each([
    ["an array", "[\"TEAM_DAILY_BUDGET_REACHED\"]"],
    ["a non-string code", "{\"error\":7}"],
    ["null", "null"],
    ["a padded code", "{\"error\":\" TEAM_DAILY_BUDGET_REACHED\"}"]
  ])("a 409 body that is %s is not read as the daily code", async (_name, body) => {
    const { port } = await gate({ status: 409, body });
    await expect(port.execute(execution)).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it.each(["PROVIDER_NOT_REACHED", "PROVIDER_REFUSED_UNBILLED"])(
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
    expect(isRunLevelSpendStop(refusal)).toBe(false);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).not.toContain((refusal as { code: string }).code);
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
    const call = async (code: string): Promise<unknown> => {
      const { port } = await gate({ status: 409, body: JSON.stringify({ error: code }) });
      const gateway = withPreviewProviderCallPolicy(new OpenAICompatibleProviderGateway({
        endpoint: target.baseUrl, model: target.model, maker: target.maker, ...providerTargetGatewayControls(target),
        fetchImplementation: createPreviewGuardedFetch(port),
        persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
        assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined
      }), preview, target);
      return gateway.call({
        runId: "run:synthetic", subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:test", providerRef: REF,
        packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
      }).then(() => null, (error: unknown) => error);
    };
    const busy = await call("CONCURRENCY_LIMIT_REACHED");
    expect(busy).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(isRunLevelSpendStop(busy)).toBe(false);
    for (const unsent of ["PROVIDER_NOT_REACHED", "PROVIDER_REFUSED_UNBILLED"]) {
      const refusal = await call(unsent);
      expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(isRunLevelSpendStop(refusal)).toBe(false);
    }
    await expect(call("PREVIEW_TEST_AUTHORITY_STOPPED")).resolves.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
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
