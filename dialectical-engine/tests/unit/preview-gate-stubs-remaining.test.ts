// tests/unit/preview-gate-stubs-remaining.test.ts
// V4 start step, Task 85 (plan Phase 14): the gate doubles behave like the real gates (packages/providers/ops/
// preview_budget_authority.py): /remaining answers the figures a test gives (the day's pot only when given and asked for, the
// final-writer room only as a pair), spending lowers what is left today as the gate's ledger does, and a call over the gate's
// calls in flight is refused CONCURRENCY_LIMIT_REACHED before the vendor is asked. Without the three new inputs the doubles
// answer exactly as before. Every figure here is made up (multiples of eleven).
import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createPreviewRemainingRpcPort } from "@debateai/providers";
import { startPreviewGateStubs, type GateProvider, type PreviewGateStubs, type StubRemainingFigures } from "../support/preview-gate-stubs.js";

const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const SHAPE = "made-up-shape";
const FIGURES: Readonly<Record<GateProvider, StubRemainingFigures>> = Object.freeze({
  anthropic: { usd: "2.2", calls: 22, maxConcurrentCalls: 2, largestReservationUsd: "0.11", finalWriterMaxInFlight: 1,
    largestFinalWriterReservationUsd: "0.33", dailyPotUsd: "4.4", enabledModels: [HAIKU] },
  deepinfra: { usd: "5.5", calls: 55, maxConcurrentCalls: 2, largestReservationUsd: "0.022" }
});

let open: PreviewGateStubs | null = null;
afterEach(async () => { await open?.close(); open = null; });
async function stubs(input: Omit<Parameters<typeof startPreviewGateStubs>[0], "storyDefaultShape">): Promise<PreviewGateStubs> {
  open = await startPreviewGateStubs({ storyDefaultShape: SHAPE, ...input });
  return open;
}

/** One POST over a gate's unix socket, as the app sends it; the JSON it answers. */
function post(socketPath: string, path: string, body: unknown): Promise<Readonly<{ status: number; json: unknown }>> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const sent = request({ socketPath, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown }));
      });
    sent.on("error", reject);
    sent.end(data);
  });
}
/** A probe call (the doubles answer it "OK"), as a standard call or a final writer's. */
const complete = (gates: PreviewGateStubs, provider: GateProvider, model: string, tier?: "FINAL_WRITER") => post(gates.sockets[provider], "/complete", {
  requestBody: JSON.stringify({ model, messages: [{ role: "user", content: "Reply exactly: OK" }] }), ...(tier === undefined ? {} : { callTier: tier }) });
const rawRemaining = (gates: PreviewGateStubs, provider: GateProvider) => post(gates.sockets[provider], "/remaining", { scope_id: "made-up-scope" });
/** What is left today, read through the app's own strict reader (contract A §5), asking for the pot or not. */
const remaining = (gates: PreviewGateStubs, provider: GateProvider, dailyPot: boolean) => createPreviewRemainingRpcPort(
  { budget_socket: gates.sockets[provider], scope_id: "made-up-scope" }, 10_000, dailyPot ? { dailyPot: true } : undefined).remaining();

describe("the gate doubles answer real figures", () => {
  it("answers the figures it is given; the pot only when given and asked for; the final-writer room as a pair", async () => {
    const gates = await stubs({ remaining: FIGURES });
    expect(await remaining(gates, "anthropic", true)).toEqual({ state: "active", windowOpen: true, remainingNanoUsd: 2_200_000_000n,
      remainingCalls: 22, maxConcurrentCalls: 2, largestReservationNanoUsd: 110_000_000n, largestFinalWriterReservationNanoUsd: 330_000_000n,
      finalWriterMaxInFlight: 1, dailyPotNanoUsd: 4_400_000_000n, enabledModels: [HAIKU] });
    // The real gate keeps the pot out of a plain request's answer.
    expect(await remaining(gates, "anthropic", false)).not.toHaveProperty("dailyPotNanoUsd");
    // No pot and no final-writer room given: neither is answered; the enabled models stay the doubles' own.
    const deepinfra = await remaining(gates, "deepinfra", true);
    expect(deepinfra).toMatchObject({ remainingNanoUsd: 5_500_000_000n, remainingCalls: 55, maxConcurrentCalls: 2, largestReservationNanoUsd: 22_000_000n,
      enabledModels: [GLM, "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", QWEN] });
    expect(Object.keys(deepinfra).sort()).toEqual(["enabledModels", "largestReservationNanoUsd", "maxConcurrentCalls", "remainingCalls",
      "remainingNanoUsd", "state", "windowOpen"]);
  });

  it("refuses half of the final-writer room before any gate opens", async () => {
    const base = { usd: "2.2", calls: 22, maxConcurrentCalls: 2, largestReservationUsd: "0.11" };
    for (const half of [{ ...base, finalWriterMaxInFlight: 1 }, { ...base, largestFinalWriterReservationUsd: "0.33" }]) {
      const started = startPreviewGateStubs({ storyDefaultShape: SHAPE, remaining: { anthropic: half } });
      try {
        await expect(started).rejects.toThrow("STUB_REMAINING_FINAL_WRITER_PAIR");
      } finally {
        await started.then((gates) => gates.close(), () => undefined);
      }
    }
  });
});

describe("spending lowers what is left today", () => {
  it("each billed call takes one call and its usage at the model's list prices; an unbilled refusal takes nothing", async () => {
    const gates = await stubs({ remaining: FIGURES, spendLowersRemaining: true, usage: () => ({ input: 1_000, output: 500 }),
      override: (seen) => seen.model === GLM ? { unbilled: true } : null, refuseModels: [MIMO] });
    expect((await complete(gates, "anthropic", HAIKU)).status).toBe(200);
    // Haiku: 1,000 x 0.10 + 500 x 0.50 dollars a million tokens = 350,000 nano-USD.
    expect(await remaining(gates, "anthropic", true)).toMatchObject({ remainingNanoUsd: 2_199_650_000n, remainingCalls: 21, dailyPotNanoUsd: 4_400_000_000n });
    // The gate writes what is left as its nine-decimal text.
    expect((await rawRemaining(gates, "anthropic")).json).toMatchObject({ remaining_usd: "2.199650000", remaining_calls: 21 });
    expect(await complete(gates, "deepinfra", GLM)).toEqual({ status: 409, json: { error: "PROVIDER_REFUSED_UNBILLED" } });
    expect(await remaining(gates, "deepinfra", false)).toMatchObject({ remainingNanoUsd: 5_500_000_000n, remainingCalls: 55 });
    expect((await complete(gates, "deepinfra", QWEN)).status).toBe(200);
    // Qwen: 1,000 x 0.113 + 500 x 0.382 = 304,000 nano-USD.
    expect(await remaining(gates, "deepinfra", false)).toMatchObject({ remainingNanoUsd: 5_499_696_000n, remainingCalls: 54 });
    // A billed vendor error takes one call; it reports no usage, so no money moves.
    expect(await complete(gates, "deepinfra", MIMO)).toMatchObject({ status: 200, json: { status: 500 } });
    expect(await remaining(gates, "deepinfra", false)).toMatchObject({ remainingNanoUsd: 5_499_696_000n, remainingCalls: 53 });
    expect(gates.requests.map((one) => one.answer)).toEqual(["OK", "UNBILLED", "OK", "BILLED_500"]);
  });
});

describe("a call over the gate's calls in flight is refused, as the real gate refuses it", () => {
  it("refuses the third call at once with CONCURRENCY_LIMIT_REACHED, recorded GATE_REFUSED, and never holds it", async () => {
    const gates = await stubs({ remaining: FIGURES, refuseOverConcurrency: true, delayMs: () => 100 });
    const answers = await Promise.all([1, 2, 3].map(() => complete(gates, "deepinfra", GLM)));
    expect(answers.map((one) => one.status).sort()).toEqual([200, 200, 409]);
    expect(answers.find((one) => one.status === 409)!.json).toEqual({ error: "CONCURRENCY_LIMIT_REACHED" });
    expect(gates.requests.map((one) => one.answer)).toEqual(["GATE_REFUSED", "OK", "OK"]);
    expect(gates.concurrency.mostByProvider.deepinfra).toBe(2);
    // Once the calls in flight have settled, the next call fits again.
    expect((await complete(gates, "deepinfra", GLM)).status).toBe(200);
  });

  it("a final writer also needs one of the gate's final-writer slots", async () => {
    const gates = await stubs({ remaining: FIGURES, refuseOverConcurrency: true, delayMs: () => 100 });
    const writers = await Promise.all([1, 2].map(() => complete(gates, "anthropic", HAIKU, "FINAL_WRITER")));
    expect(writers.map((one) => one.status).sort()).toEqual([200, 409]);
    const mixed = await Promise.all([complete(gates, "anthropic", HAIKU, "FINAL_WRITER"), complete(gates, "anthropic", HAIKU)]);
    expect(mixed.map((one) => one.status)).toEqual([200, 200]);
  });
});

describe("without the new inputs the doubles answer as today", () => {
  it("the same /remaining answer, spending lowers nothing and calls in flight are never refused", async () => {
    const gates = await stubs({ usage: () => ({ input: 1_000, output: 500 }), delayMs: () => 50 });
    const today = {
      anthropic: { state: "active", window_open: true, remaining_usd: "9.500000000", remaining_calls: 1900, max_concurrent_calls: 2,
        largest_reservation_usd: "0.214016000", enabled_models: [HAIKU] },
      deepinfra: { state: "active", window_open: true, remaining_usd: "9.500000000", remaining_calls: 1900, max_concurrent_calls: 10,
        largest_reservation_usd: "0.214016000", enabled_models: [GLM, "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", QWEN] }
    };
    const answers = await Promise.all([1, 2, 3].map(() => complete(gates, "anthropic", HAIKU)));
    expect(answers.map((one) => one.status)).toEqual([200, 200, 200]);
    for (const provider of ["anthropic", "deepinfra"] as const) expect(await rawRemaining(gates, provider)).toEqual({ status: 200, json: today[provider] });
    expect(await remaining(gates, "anthropic", true)).not.toHaveProperty("dailyPotNanoUsd");
  });
});
