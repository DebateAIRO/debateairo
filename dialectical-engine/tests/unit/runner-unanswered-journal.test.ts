/**
 * NV-50 (security audit run 3): the runner wraps a money seam's `recordUnanswered` so a charge that could not be written
 * leaves one content-free `DEBATEAI_SPEND` line (ids and codes only) before the failure goes back to the gateway, which
 * then stops the call. A log line never costs the call, and a seam without the member comes back as it was.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";
import { withUnansweredWriteJournal } from "@debateai/runner";

const OBSERVED = Object.freeze({
  providerRef: "provider:test", usage: undefined, attemptId: "attempt-1",
  projection: Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 })
});

function seamWith(recordUnanswered?: ProviderCostEnvelopeSeam["recordUnanswered"]): ProviderCostEnvelopeSeam {
  return {
    assertCallAllowed: () => undefined,
    recordCall: () => undefined,
    assertUsageReported: () => undefined,
    ...(recordUnanswered === undefined ? {} : { recordUnanswered })
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("NV-50 the runner's journal line for an unanswered charge it could not write", () => {
  it("rethrows the same error after one DEBATEAI_SPEND line with its code, ids and no text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = new TypedDomainError("X_CODE", "the store refused");
    const wrapped = withUnansweredWriteJournal(seamWith(async () => { throw failure; }), "run-1", "fixture:judge");

    await expect(wrapped!.recordUnanswered!(OBSERVED)).rejects.toBe(failure);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toEqual({
      kind: "DEBATEAI_SPEND", event: "UNANSWERED_CHARGE_WRITE_FAILED", code: "X_CODE", sqlState: null,
      runId: "run-1", callSiteKey: "fixture:judge", attemptId: "attempt-1"
    });
  });

  it("names an untyped database failure UNTYPED with its SQLSTATE", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("connection lost"), { code: "08006" });
    const wrapped = withUnansweredWriteJournal(seamWith(async () => { throw failure; }), "run-1", "fixture:judge");

    await expect(wrapped!.recordUnanswered!(OBSERVED)).rejects.toBe(failure);

    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({ code: "UNTYPED", sqlState: "08006" });
  });

  it("writes no line when the charge is written, and passes the observation through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seen: unknown[] = [];
    const wrapped = withUnansweredWriteJournal(seamWith(async (observed) => { seen.push(observed); }), "run-1", "fixture:judge");

    await expect(wrapped!.recordUnanswered!(OBSERVED)).resolves.toBeUndefined();

    expect(seen).toEqual([OBSERVED]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("still rethrows the charge's failure when the journal line itself throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("log down"); });
    const failure = new TypedDomainError("X_CODE", "the store refused");
    const wrapped = withUnansweredWriteJournal(seamWith(async () => { throw failure; }), "run-1", "fixture:judge");

    await expect(wrapped!.recordUnanswered!(OBSERVED)).rejects.toBe(failure);
  });

  it("returns a seam without recordUnanswered, and no seam, as they are", () => {
    const plain = seamWith();
    expect(withUnansweredWriteJournal(plain, "run-1", "fixture:judge")).toBe(plain);
    expect(withUnansweredWriteJournal(undefined, "run-1", "fixture:judge")).toBeUndefined();
  });
});
