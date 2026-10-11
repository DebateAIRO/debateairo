/**
 * Spec 2026-10-11 busy model §2 (docs/superpowers/specs/2026-10-11-preview-busy-model-design.md): the preview's probe
 * of one target keeps a gate-proven unbilled refusal apart (PROVIDER_PROBE_UNBILLED_REFUSAL), resends it ONCE after
 * 60 seconds, never resends a billed failure, and the runner's claim-time probe keeps the last observation. Off the
 * preview the claim-time probe is one probe, exactly as before. The gate's refusal is the shipped PreviewUnbilledRefusal
 * the budget RPC port raises for its 409; the ask path end to end is tests/integration/preview-busy-model-ask.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  observeClaimTimeTarget,
  observePreviewProviderTarget,
  parseProviderDiscoveryTargets,
  previewProbeRoundBusy,
  previewTargetJsonRow,
  PreviewUnbilledRefusal,
  PROVIDER_PROBE_UNBILLED_REFUSAL
} from "@debateai/providers";

const DEEPSEEK_REF = "preview:deepseek-v4-1-flash";
const TARGET = parseProviderDiscoveryTargets(JSON.stringify([previewTargetJsonRow(DEEPSEEK_REF)]),
  [{ providerRef: DEEPSEEK_REF, maker: "DeepSeek" }])[0]!;

type Step = "UNBILLED" | "OK" | "BILLED";
/** A fetch answering each POST from `script`: the gate's unbilled refusal, the vendor's OK, or a billed 500. */
function scripted(script: readonly Step[]) {
  const steps = [...script];
  let posts = 0;
  const fetchImplementation: typeof fetch = async () => {
    posts += 1;
    const step = steps.shift() ?? "OK";
    if (step === "UNBILLED") throw new PreviewUnbilledRefusal();
    if (step === "BILLED") return new Response("{\"error\":\"internal\"}", { status: 500 });
    return new Response(JSON.stringify({ model: TARGET.model, choices: [{ message: { content: "OK" } }] }), { status: 200 });
  };
  return { fetchImplementation, posts: () => posts };
}
const probe = (fetchImplementation: typeof fetch, sleeps: number[]) => ({
  target: TARGET, timeoutMs: 1_000, fetchImplementation, clock: () => new Date("2026-10-11T19:30:00.000Z"),
  sleep: async (milliseconds: number) => { sleeps.push(milliseconds); }
});

describe("the preview probe of one target (spec 2026-10-11 busy model §2)", () => {
  it("keeps a gate-proven unbilled refusal apart, then resends it once after 60 s", async () => {
    const gate = scripted(["UNBILLED", "OK"]);
    const sleeps: number[] = [];
    const seen: string[] = [];
    const observations = await observePreviewProviderTarget({ ...probe(gate.fetchImplementation, sleeps),
      onUnbilled: async (first) => { seen.push(`${first.state}:${String(first.failureCode)}`); } });
    expect(observations.map((entry) => [entry.state, entry.failureCode])).toEqual([
      ["ABSENT", PROVIDER_PROBE_UNBILLED_REFUSAL], ["HEALTHY", null]]);
    // The refusal is handed over BEFORE the wait, so the API writes it before the resend.
    expect(seen).toEqual([`ABSENT:${PROVIDER_PROBE_UNBILLED_REFUSAL}`]);
    expect(sleeps).toEqual([60_000]);
    expect(gate.posts()).toBe(2);
    expect(previewProbeRoundBusy(observations)).toBe(false);
  });
  it("two unbilled refusals: busy, and never a third POST", async () => {
    const gate = scripted(["UNBILLED", "UNBILLED", "OK"]);
    const sleeps: number[] = [];
    const observations = await observePreviewProviderTarget(probe(gate.fetchImplementation, sleeps));
    expect(observations.map((entry) => entry.failureCode)).toEqual([PROVIDER_PROBE_UNBILLED_REFUSAL, PROVIDER_PROBE_UNBILLED_REFUSAL]);
    expect(previewProbeRoundBusy(observations)).toBe(true);
    expect(gate.posts()).toBe(2);
    expect(sleeps).toEqual([60_000]);
  });
  it("a billed failure is PROVIDER_PROBE_FAILED, gets no resend and is not busy", async () => {
    const gate = scripted(["BILLED", "OK"]);
    const sleeps: number[] = [];
    const observations = await observePreviewProviderTarget(probe(gate.fetchImplementation, sleeps));
    expect(observations.map((entry) => entry.failureCode)).toEqual(["PROVIDER_PROBE_FAILED"]);
    expect(previewProbeRoundBusy(observations)).toBe(false);
    expect(gate.posts()).toBe(1);
    expect(sleeps).toEqual([]);
  });
});

describe("the runner's claim-time probe (spec 2026-10-11 busy model §2)", () => {
  it("on the preview, [409, OK] keeps the member: the last observation is HEALTHY", async () => {
    const gate = scripted(["UNBILLED", "OK"]);
    const sleeps: number[] = [];
    const observation = await observeClaimTimeTarget({ ...probe(gate.fetchImplementation, sleeps), preview: true });
    expect(observation).toMatchObject({ state: "HEALTHY", modelId: TARGET.model, failureCode: null });
    expect(sleeps).toEqual([60_000]);
  });
  it("off the preview: one probe, no wait, exactly as before", async () => {
    const gate = scripted(["UNBILLED", "OK"]);
    const sleeps: number[] = [];
    const observation = await observeClaimTimeTarget({ ...probe(gate.fetchImplementation, sleeps), preview: false });
    expect(observation.state).toBe("ABSENT");
    expect(gate.posts()).toBe(1);
    expect(sleeps).toEqual([]);
  });
});
