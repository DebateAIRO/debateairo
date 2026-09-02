import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError } from "@debateai/providers";

const MODEL = "configured/model";

function gatewayWith(
  fetchImplementation: typeof fetch,
  sleeps: number[]
) {
  const ledger: Array<{ outcome: string }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation,
    sleepImplementation: async (milliseconds) => { sleeps.push(milliseconds); },
    persistRawArtifact: async (artifact) => artifact.artifactId,
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, ledger };
}

function callRequest(maxAttempts: number, extra: Record<string, unknown> = {}) {
  return {
    runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE" as const,
    lane: "served" as const, bound: { maxAttempts, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "provider:test",
    packet: { messages: [{ role: "user" as const, content: "q" }] },
    ...extra
  };
}

const failing: typeof fetch = async () => new Response("nope", { status: 503 });

describe("L4-F8 — bounded backoff between HTTP attempts", () => {
  it("sleeps 250 / 500 / 1000 ms between four attempts and never before the first", async () => {
    const sleeps: number[] = [];
    const { gateway } = gatewayWith(failing, sleeps);

    await expect(gateway.call(callRequest(4))).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(sleeps).toEqual([250, 500, 1_000]);
  });

  it("caps the backoff at 4 s however many attempts the bound allows", async () => {
    const sleeps: number[] = [];
    const { gateway } = gatewayWith(failing, sleeps);

    await expect(gateway.call(callRequest(7))).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(sleeps).toEqual([250, 500, 1_000, 2_000, 4_000, 4_000]);
  });

  it("does not sleep at all when the bound allows a single attempt", async () => {
    const sleeps: number[] = [];
    const { gateway } = gatewayWith(failing, sleeps);

    await expect(gateway.call(callRequest(1))).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(sleeps).toEqual([]);
  });
});

describe("L4-F8 — per-attempt ceiling hook", () => {
  it("evaluates the hook before every attempt, including the first", async () => {
    const sleeps: number[] = [];
    let checks = 0;
    const { gateway } = gatewayWith(failing, sleeps);

    await expect(gateway.call(callRequest(3, {
      assertAttemptAllowed: () => { checks += 1; }
    }))).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(checks).toBe(3);
  });

  it("stops the loop when the hook throws on attempt 2: one attempt recorded, refusal propagates untouched", async () => {
    const sleeps: number[] = [];
    let fetchCalls = 0;
    const { gateway, ledger } = gatewayWith(async () => { fetchCalls += 1; return new Response("nope", { status: 503 }); }, sleeps);
    let checks = 0;

    const failure = await gateway.call(callRequest(3, {
      assertAttemptAllowed: () => {
        checks += 1;
        if (checks === 2) throw new TypeError("RUN_COST_ENVELOPE_EXHAUSTED");
      }
    })).catch((error: unknown) => error);

    // The caller's refusal is not wrapped in ProviderCallFailedError.
    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect(fetchCalls).toBe(1);
    expect(ledger).toHaveLength(1);
  });

  it("defaults to a no-op hook so an unchanged caller keeps every attempt of its bound", async () => {
    const sleeps: number[] = [];
    let fetchCalls = 0;
    const { gateway, ledger } = gatewayWith(async () => { fetchCalls += 1; return new Response("nope", { status: 503 }); }, sleeps);

    const failure = await gateway.call(callRequest(3)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderCallFailedError);
    expect(failure).toMatchObject({ attempts: 3 });
    expect(fetchCalls).toBe(3);
    expect(ledger).toHaveLength(3);
  });
});
