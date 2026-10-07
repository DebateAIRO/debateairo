// Step 1 (owner, 2026-10-08): the v2 spending gate answers a refusal with HTTP 409 and a
// JSON body {"error": CODE}. The application side reads that body over the real local
// socket protocol: the team's day being used up becomes the product's own daily code
// (DAILY_COST_ENVELOPE_REACHED, a run-level spend stop with its own "wait for tomorrow"
// lift); every other refusal, and any body it cannot read, keeps today's behaviour.
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPreviewBudgetRpcPort, type PreviewProviderTestConfig } from "@debateai/providers";

type Reply = Readonly<{ status: number; body: string }>;
const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A stand-in gate on a real unix socket; it records each request it receives. */
async function gate(reply: Reply): Promise<Readonly<{ port: ReturnType<typeof createPreviewBudgetRpcPort>; received: string[] }>> {
  const directory = await mkdtemp(join(tmpdir(), "pvg-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const received: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString("utf8")}`);
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(reply.body);
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

  it.each(["CONCURRENCY_LIMIT_REACHED", "PREVIEW_TEST_AUTHORITY_STOPPED", "SOMETHING_NEW"])(
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
