import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError } from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

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
    packet: framedFixturePacket("q"),
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

/**
 * DL4-F3 — THE OTHER HALF, added at INT2 (2026-09-22) after the SYNC2 review
 * found it missing.
 *
 * Every case above hands the hook to `OpenAICompatibleProviderGateway` itself,
 * so they prove the gateway HONOURS a hook and prove nothing about whether the
 * product supplies one. `createPostgresProviderGateway` — what the runner
 * actually builds — is where the pinned run ceiling is wired in, and SYNC2 had
 * to re-seat that wiring by hand inside `dev`'s restored `execute` closure.
 * Had the re-seat been dropped there, the whole suite would have stayed green
 * and the run ceiling would silently have gone back to being consulted once per
 * CALL instead of once per ATTEMPT: a refused run could keep retrying inside a
 * single call, which is precisely the spend DL4-F3 exists to bound.
 *
 * The factory opens a `Pool`, a lease and a ledger before it reaches the hook,
 * and no pool-free harness for it exists anywhere in the repository, so this is
 * a source-structure pin rather than a driven one. It is written so it cannot
 * be vacuous: it locates the factory, proves the anchor it measures against is
 * really there, and proves its own failability against the mutation it exists
 * to catch.
 */
describe("DL4-F3 — the runner's gateway factory supplies the per-attempt hook", () => {
  const HOOK = "assertAttemptAllowed: () => budget.assertModelAttemptAllowed(leasedRunId)";

  function factoryBody(source: string): string {
    const start = source.indexOf("export function createPostgresProviderGateway");
    expect(start, "createPostgresProviderGateway is declared").toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  }

  it("wires the pinned run ceiling into the call it delegates to", async () => {
    const body = factoryBody(await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8"
    ));

    // The anchors: this really is the factory, and it really is the delegating
    // call whose retry loop the hook has to reach.
    expect(body).toContain("new OpenAICompatibleProviderGateway({");
    expect(body).toContain("http.call({");
    // The hook itself — and closing over the LEASED run id, not a re-read of
    // `request.runId`, so it names the same run the content lease holds.
    expect(body).toContain(HOOK);
    expect(body).toContain("const leasedRunId = request.runId");
  });

  it("fails on the mutation it exists to catch", async () => {
    const body = factoryBody(await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8"
    ));
    // Drop the hook and nothing else: the pin above must not survive it.
    expect(body.replace(HOOK, "")).not.toContain(HOOK);
    expect(body.split(HOOK)).toHaveLength(2);
  });
});
