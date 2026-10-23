/**
 * Final fix wave S1 (FINAL-FIX 6): the runner's gateway builds a call's money seam BEFORE the try that captures a failed
 * provider call as PROVIDER_EXHAUSTED. A seam that cannot be built — the run's version unknown to this process
 * (RUN_SETTINGS_VERSION_UNKNOWN, `runCostEnvelopeGuardOf`) or a version without a story ceiling (STORY_ENVELOPE_MISSING,
 * the guard's `storySeam`) — is a settings refusal, not a vendor that ran out: it still ends the call before anything is
 * sent, with its own code, and is never captured as PROVIDER_EXHAUSTED.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { installCaptureEmitter } from "@debateai/obs-capture";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCallRequest } from "@debateai/providers";
import { createPostgresProviderGateway } from "@debateai/runner";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const captured: unknown[] = [];
installCaptureEmitter({ emit: (envelope) => { captured.push(envelope); }, captureHandled: () => undefined });
afterEach(() => { captured.splice(0); });

/** A pool that admits the call: a roomy attempt ceiling, one attempt used, the run's content live. */
function admittingPool(): Pool {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: fixtureStructuralCeiling(50) }] };
      if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "1" }] };
      throw new Error(`UNEXPECTED_QUERY:${sql}`);
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("run_private_content_is_live")) return {
          rows: [{ run_id: String((values?.[0] as readonly string[])[0]), live: true }]
        };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
        throw new Error(`UNEXPECTED_CLIENT_QUERY:${sql}`);
      }),
      release: vi.fn()
    }))
  } as unknown as Pool;
}

function request(overrides: Partial<ProviderCallRequest>): ProviderCallRequest {
  return {
    runId: "run:seam-capture",
    subjectItemId: "work:seam-capture",
    callSiteKey: "JUDGE",
    role: "JUDGE",
    lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
    contractHash: "a".repeat(64),
    providerRef: "provider:test",
    packet: framedFixturePacket("seam capture"),
    ...overrides
  };
}

const providerExhausted = () => captured.filter((envelope) =>
  (envelope as { taxonomy_class?: unknown }).taxonomy_class === "PROVIDER_EXHAUSTED");

describe("final fix wave S1: a money seam that cannot be built is never captured as PROVIDER_EXHAUSTED", () => {
  it("RUN_SETTINGS_VERSION_UNKNOWN from the run's seam ends the call with its own code, uncaptured", async () => {
    const fetchImplementation = vi.fn(async () => { throw new Error("NO_REQUEST_EXPECTED"); });
    const gateway = createPostgresProviderGateway(admittingPool(), {
      endpoint: "http://127.0.0.1:1", model: "test/model", maker: "test-maker", fetchImplementation,
      buildCostEnvelopeSeam: () => { throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", "RUN_SETTINGS_VERSION_UNKNOWN:UNMAPPED"); },
      buildStoryCostEnvelopeSeam: () => { throw new Error("NOT_A_STORY_CALL"); }
    } as never);
    await expect(gateway.call(request({}))).rejects.toMatchObject({ code: "RUN_SETTINGS_VERSION_UNKNOWN" });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(providerExhausted()).toEqual([]);
  });

  it("STORY_ENVELOPE_MISSING from the story's seam ends the story call with its own code, uncaptured", async () => {
    const fetchImplementation = vi.fn(async () => { throw new Error("NO_REQUEST_EXPECTED"); });
    const gateway = createPostgresProviderGateway(admittingPool(), {
      endpoint: "http://127.0.0.1:1", model: "test/model", maker: "test-maker", fetchImplementation,
      buildCostEnvelopeSeam: () => { throw new Error("NOT_A_DEBATE_CALL"); },
      buildStoryCostEnvelopeSeam: () => { throw new TypedDomainError("STORY_ENVELOPE_MISSING", "fixture"); }
    } as never);
    await expect(gateway.call(request({ callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER", lane: "story" })))
      .rejects.toMatchObject({ code: "STORY_ENVELOPE_MISSING" });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(providerExhausted()).toEqual([]);
  });

  it("control: a call that really failed at the vendor is still captured as PROVIDER_EXHAUSTED", async () => {
    const fetchImplementation = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const seam = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
    const gateway = createPostgresProviderGateway(admittingPool(), {
      endpoint: "http://127.0.0.1:1", model: "test/model", maker: "test-maker", fetchImplementation,
      buildCostEnvelopeSeam: () => seam, buildStoryCostEnvelopeSeam: () => seam
    } as never);
    await expect(gateway.call(request({}))).rejects.toBeDefined();
    expect(providerExhausted().length).toBeGreaterThan(0);
  });
});
