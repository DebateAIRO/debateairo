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
  it("preserves observed usage in raw artifact metadata and uses null when absent", async () => {
    const artifacts: Record<string, unknown>[] = [];
    let responseUsage: unknown = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, x_cost_usd: 0.01 };
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1", model: "fixture", maker: "fixture",
      fetchImplementation: async () => new Response(JSON.stringify({
        id: "call", model: "fixture", choices: [{ message: { content: "ok" } }], usage: responseUsage
      })),
      persistRawArtifact: async (artifact) => { artifacts.push(artifact.metadata); return artifact.artifactId; },
      appendLedgerEntry: async () => "ledger:test",
      assertNoOpenWriteTransaction: () => undefined
    });
    const request = {
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture", role: "JUDGE" as const,
      lane: "served" as const, bound: { maxAttempts: 1, tokenCeiling: 8, deadlineMs: 1000 },
      contractHash: "contract", providerRef: "provider", packet: { messages: [{ role: "user" as const, content: "x" }] }
    };
    await gateway.call(request);
    responseUsage = null;
    await gateway.call(request);
    expect(artifacts.map((metadata) => metadata.usage)).toEqual([
      { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, x_cost_usd: 0.01 },
      null
    ]);
  });

  it("preserves observed usage even when the completion response schema is rejected", async () => {
    const metadata: Record<string, unknown>[] = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1", model: "fixture", maker: "fixture",
      fetchImplementation: async () => new Response(JSON.stringify({
        id: "call", model: "fixture", choices: [],
        usage: { prompt_tokens: 7, completion_tokens: 1, total_tokens: 8 }
      })),
      persistRawArtifact: async (artifact) => { metadata.push(artifact.metadata); return artifact.artifactId; },
      appendLedgerEntry: async () => "ledger:test",
      assertNoOpenWriteTransaction: () => undefined
    });
    await expect(gateway.call({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture", role: "JUDGE",
      lane: "served", bound: { maxAttempts: 1, tokenCeiling: 8, deadlineMs: 1000 },
      contractHash: "contract", providerRef: "provider",
      packet: { messages: [{ role: "user", content: "x" }] }
    })).rejects.toThrow("PROVIDER_CALL_FAILED");
    expect(metadata[0]?.usage).toEqual({ prompt_tokens: 7, completion_tokens: 1, total_tokens: 8 });
  });
  it("FX-LG-16 persists the contract classifier's parse-vs-schema outcome on the unconditional artifact", async () => {
    let attempt = 0;
    const server = createServer((_request, response) => response.end(JSON.stringify({
      id: "fixture-classified", model: "fixture/model",
      choices: [{ message: { content: ++attempt === 1 ? "valid-json-wrong-schema" : "accepted-json" } }]
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
    const result = await gateway.call({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:test",
      providerRef: "provider:test", packet: { messages: [{ role: "user", content: "fixture" }] },
      classifyContent: (content) => content === "accepted-json"
        ? { parseStatus: "PARSED", parseError: null }
        : { parseStatus: "SCHEMA_FAILED", parseError: "test-layer schema mismatch" }
    });
    expect(result.content).toBe("accepted-json");
    expect(recorded).toEqual([
      expect.objectContaining({ parseStatus: "SCHEMA_FAILED", parseError: "test-layer schema mismatch" }),
      expect.objectContaining({ parseStatus: "PARSED", parseError: null })
    ]);
  });

  it("BUG-01 T1/T2 retries declared schema rejection and ledgers FAILED before OK with artifact links", async () => {
    let attempt = 0;
    const server = createServer((_request, response) => response.end(JSON.stringify({
      id: `fixture-${attempt + 1}`, model: "fixture/model",
      choices: [{ message: { content: ++attempt === 1 ? "rejected" : "accepted" } }]
    })));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const artifacts: Array<{ parseStatus: string; parseError?: string | null; artifactId: string }> = [];
    const ledger: Array<{ outcome: string; rawArtifactRef: string | null }> = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`, model: "fixture/model", maker: "fixture",
      persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
      appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
      assertNoOpenWriteTransaction: () => undefined
    });
    const result = await gateway.call({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:test",
      providerRef: "provider:test", packet: { messages: [{ role: "user", content: "fixture" }] },
      classifyContent: (content) => content === "accepted"
        ? { parseStatus: "PARSED", parseError: null }
        : { parseStatus: "SCHEMA_FAILED", parseError: "first schema error" }
    });
    expect(result.content).toBe("accepted");
    expect(artifacts.map(({ parseStatus, parseError }) => ({ parseStatus, parseError }))).toEqual([
      { parseStatus: "SCHEMA_FAILED", parseError: "first schema error" },
      { parseStatus: "PARSED", parseError: null }
    ]);
    expect(ledger).toEqual([
      expect.objectContaining({ outcome: "FAILED", rawArtifactRef: artifacts[0]!.artifactId }),
      expect.objectContaining({ outcome: "OK", rawArtifactRef: artifacts[1]!.artifactId })
    ]);
  });

  it("BUG-01 T3 exhausts the declared content bound with the last structured parse error", async () => {
    let attempt = 0;
    const server = createServer((_request, response) => response.end(JSON.stringify({
      id: `fixture-${attempt + 1}`, model: "fixture/model",
      choices: [{ message: { content: `rejected-${++attempt}` } }]
    })));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`, model: "fixture/model", maker: "fixture",
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => `ledger:${entry.attemptId}`,
      assertNoOpenWriteTransaction: () => undefined
    });
    await expect(gateway.call({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:test",
      providerRef: "provider:test", packet: { messages: [{ role: "user", content: "fixture" }] },
      classifyContent: (content) => ({ parseStatus: "SCHEMA_FAILED", parseError: `error:${content}` })
    })).rejects.toMatchObject({
      code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2, lastParseStatus: "SCHEMA_FAILED",
      lastParseError: "error:rejected-2"
    });
  });

  it("BUG-01 T5/T6 hashes each repair packet but preserves contract identity and resends identically without a builder", async () => {
    const runCase = async (withBuilder: boolean) => {
      let attempt = 0;
      const bodies: string[] = [];
      const ledger: Array<{ inputHash: string; contractHash: string }> = [];
      const server = createServer((request, response) => {
        let body = "";
        request.on("data", (chunk) => { body += String(chunk); });
        request.on("end", () => {
          bodies.push(body);
          response.end(JSON.stringify({
            id: `fixture-${attempt + 1}`, model: "fixture/model",
            choices: [{ message: { content: ++attempt === 1 ? "rejected" : "accepted" } }]
          }));
        });
      });
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind");
      const gateway = new OpenAICompatibleProviderGateway({
        endpoint: `http://127.0.0.1:${address.port}/v1`, model: "fixture/model", maker: "fixture",
        persistRawArtifact: async (artifact) => artifact.artifactId,
        appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
        assertNoOpenWriteTransaction: () => undefined
      });
      await gateway.call({
        runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:fixed",
        providerRef: "provider:test", packet: { messages: [{ role: "user", content: "base" }] },
        classifyContent: (content) => content === "accepted"
          ? { parseStatus: "PARSED", parseError: null }
          : { parseStatus: "SCHEMA_FAILED", parseError: "machine-only-error" },
        ...(withBuilder ? {
          buildRepairPacket: ({ parseError }: { parseError: string }) => ({
            messages: [{ role: "user" as const, content: `base\nSchema error: ${parseError}` }]
          })
        } : {})
      });
      return { bodies, ledger };
    };
    const repaired = await runCase(true);
    expect(repaired.ledger[0]!.inputHash).not.toBe(repaired.ledger[1]!.inputHash);
    expect(repaired.ledger.map((entry) => entry.contractHash)).toEqual(["contract:fixed", "contract:fixed"]);
    const resent = await runCase(false);
    expect(resent.bodies[1]).toBe(resent.bodies[0]);
    expect(resent.ledger[1]!.inputHash).toBe(resent.ledger[0]!.inputHash);
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
      bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 },
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
