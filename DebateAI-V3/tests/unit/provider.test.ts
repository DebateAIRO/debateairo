import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway } from "@debateai/providers";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("FX-HR-H1 — one provider interface", () => {
  it("FX-LG-16 persists the contract classifier's parse-vs-schema outcome on the unconditional artifact", async () => {
    const server = createServer((_request, response) => response.end(JSON.stringify({
      id: "fixture-classified", model: "fixture/model",
      choices: [{ message: { content: "valid-json-wrong-schema" } }]
    })));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const recorded: unknown[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`, model: "fixture/model", maker: "fixture",
      persistRawArtifact: async (artifact) => { recorded.push(artifact); return "artifact:classified"; },
      appendLedgerEntry: async () => "ledger:classified", assertNoOpenWriteTransaction: () => undefined
    });
    await gateway.call({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:test",
      providerRef: "provider:test", packet: { messages: [{ role: "user", content: "fixture" }] },
      classifyContent: () => ({ parseStatus: "SCHEMA_FAILED", parseError: "test-layer schema mismatch" })
    });
    expect(recorded).toEqual([expect.objectContaining({
      parseStatus: "SCHEMA_FAILED", parseError: "test-layer schema mismatch"
    })]);
  });

  it("persists the raw real HTTP response unconditionally before ledgering the attempt", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: "fixture-response",
        model: "fixture-maker/fixture-model",
        choices: [{ message: { content: "not-json-on-purpose" } }]
      }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    const calls: string[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture-maker/fixture-model",
      maker: "fixture-maker",
      persistRawArtifact: async (artifact) => {
        calls.push(`artifact:${artifact.parseStatus}`);
        return "artifact:test";
      },
      appendLedgerEntry: async (entry) => {
        calls.push(`ledger:${entry.outcome}`);
        return "ledger:test";
      },
      assertNoOpenWriteTransaction: () => calls.push("outside-transaction")
    });

    const result = await gateway.call({
      runId: null,
      subjectItemId: "node:test",
      callSiteKey: "fixture:judge",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
      contractHash: "contract:test",
      providerRef: "provider:test",
      packet: { messages: [{ role: "user", content: "test fixture only" }] }
    });

    expect(result.rawArtifactRef).toBe("artifact:test");
    expect(result.content).toBe("not-json-on-purpose");
    expect(result.modelVersion).toBe("fixture-maker/fixture-model");
    expect(calls).toEqual(["outside-transaction", "artifact:UNPARSED", "ledger:OK"]);
  });

  it("persists even a malformed outer provider response before recording failure", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/plain");
      response.end("malformed-provider-response");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const calls: string[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture-maker/fixture-model",
      maker: "fixture-maker",
      persistRawArtifact: async (artifact) => {
        calls.push(`artifact:${artifact.rawText}:${artifact.modelVersion ?? "NULL"}`);
        return "artifact:malformed";
      },
      appendLedgerEntry: async (entry) => {
        calls.push(`ledger:${entry.outcome}:${entry.rawArtifactRef}`);
        return "ledger:failure";
      },
      assertNoOpenWriteTransaction: () => calls.push("outside-transaction")
    });
    await expect(gateway.call({
      runId: null,
      subjectItemId: "node:test",
      callSiteKey: "fixture:judge",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
      contractHash: "contract:test",
      providerRef: "provider:test",
      packet: { messages: [{ role: "user", content: "test fixture only" }] }
    })).rejects.toThrow("PROVIDER_CALL_FAILED");
    expect(calls).toEqual([
      "outside-transaction",
      "artifact:malformed-provider-response:NULL",
      "ledger:FAILED:artifact:malformed"
    ]);
  });

  it("gives every bounded HTTP attempt its own raw artifact and ledger row", async () => {
    const server = createServer((_request, response) => response.end("bad"));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const artifacts: string[] = [];
    const ledgerAttempts: string[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture/model",
      maker: "fixture",
      persistRawArtifact: async (artifact) => {
        artifacts.push(artifact.attemptId);
        return artifact.artifactId;
      },
      appendLedgerEntry: async (entry) => {
        ledgerAttempts.push(entry.attemptId);
        return `ledger:${entry.attemptId}`;
      },
      assertNoOpenWriteTransaction: () => undefined
    });
    await expect(gateway.call({
      runId: null,
      subjectItemId: "node:test",
      callSiteKey: "fixture:judge",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 },
      contractHash: "contract:test",
      providerRef: "provider:test",
      packet: { messages: [{ role: "user", content: "fixture" }] }
    })).rejects.toThrow("PROVIDER_CALL_FAILED");
    expect(artifacts).toHaveLength(2);
    expect(ledgerAttempts).toEqual(artifacts);
    expect(new Set(artifacts)).toHaveLength(2);
  });
});
