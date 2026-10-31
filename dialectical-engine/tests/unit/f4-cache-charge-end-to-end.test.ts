import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  projectedCallCeilingMicros,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  OpenAICompatibleProviderGateway,
  previewTargetChargePrice,
  type ProviderCostEnvelopeSeam,
  type PromptPacket
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Owner answer F4 (2026-10-30): "we need to test it, to see that it really works as we intend."
 *
 * The whole road of one Claude Haiku 5.5 call, on a scripted vendor: the real gateway on the Anthropic wire reads the
 * reply, the real budget seam prices it with the price the runner builds (`previewTargetChargePrice`), and the charge
 * lands in the ledger row. Nothing between the reply and the row is faked.
 *
 * Every expected figure is worked out here BY HAND from the vendor's list prices, on purpose not read from the code:
 * platform.claude.com/docs/en/about-claude/pricing, read 2026-10-31, per million tokens:
 *  | Claude Haiku 5.5            | input | 5m write | 1h write | cache hit | output |
 *  | prompt up to 100,000 tokens | 0.10  | 0.125    | 0.20     | 0.01      | 0.50   |
 *  | prompt over 100,000 tokens  | 0.50  | 0.625    | 1.00     | 0.05      | 2.50   |
 * One micro-unit is a millionth of a dollar, so a price per million tokens is also micro-units per token: 40,000 tokens
 * at 0.125 are 5,000 micro-units. Each kind of token is rounded up on its own.
 *
 * The ceilings below are made-up test numbers, far above these charges: no limit is what is under test.
 */
const BASE_URL = "https://api.anthropic.com/v1";
const MODEL = "claude-haiku-5-5";
const DECLARED = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 });
const REAL = previewTargetChargePrice(true, { baseUrl: BASE_URL, model: MODEL }, DECLARED)!;
const NOW = new Date("2026-10-31T11:00:00.000Z");
const RUN = "run-f4-end-to-end";
const PACKET = framedFixturePacket("f4");

type VendorUsage = Readonly<Record<string, unknown>>;

function fakeStore(): { store: ModelSpendStore; written: ModelSpendEntry[] } {
  const written: ModelSpendEntry[] = [];
  const sum = (source: string) => async (): Promise<number> => written
    .filter((entry) => entry.spendSource === source).reduce((total, entry) => total + entry.chargeMicros, 0);
  return {
    written,
    store: {
      recordSpend: async (entry) => { written.push(entry); },
      readRunSpentMicros: sum("RUN"),
      readRunStorySpentMicros: sum("STORY"),
      readRunPathRewriteSpentMicros: sum("PATH_REWRITE"),
      readRunInvestigationReportSpentMicros: sum("INVESTIGATION_REPORT"),
      readDaySpentMicros: async () => 0,
      admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
    }
  };
}

function guardOver(store: ModelSpendStore): CostEnvelopeGuard {
  return new CostEnvelopeGuard({ store, clock: () => NOW,
    policy: { perRunCeilingMicros: 50_000_000, dailyCeilingMicros: 900_000_000, perStoryCeilingMicros: 50_000_000 } });
}

/** The real gateway on the Anthropic wire, the vendor scripted one reply per POST. */
function haikuGateway(script: readonly VendorUsage[]): { gateway: OpenAICompatibleProviderGateway; bodies: string[] } {
  const bodies: string[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
    endpoint: BASE_URL, model: MODEL, maker: "Anthropic",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      const usage = script[bodies.length - 1];
      return new Response(JSON.stringify({
        id: `msg_${bodies.length}`, type: "message", role: "assistant", model: MODEL,
        content: [{ type: "text", text: "{\"ok\":true}" }], stop_reason: "end_turn", stop_sequence: null, usage
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => artifact.artifactId,
    appendLedgerEntry: async () => "ledger:1",
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, bodies };
}

function call(costEnvelope: ProviderCostEnvelopeSeam, packet: PromptPacket = PACKET) {
  return {
    runId: RUN, subjectItemId: "node:f4", callSiteKey: "JUDGE", role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 1, tokenCeiling: 4_096, deadlineMs: 5_000 },
    contractHash: "contract:f4", providerRef: "preview:claude-haiku-5-5", packet, costEnvelope
  };
}

async function chargesOf(script: readonly VendorUsage[]): Promise<readonly number[]> {
  const { store, written } = fakeStore();
  const { gateway } = haikuGateway(script);
  const seam = guardOver(store).providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "BODY" });
  for (const _reply of script) await gateway.call(call(seam));
  return written.map((entry) => entry.chargeMicros);
}

/** The vendor's own usage shape (prompt-caching page), with the write split into its two lifetimes. */
function usage(counts: Readonly<{ input: number; write?: number; read?: number; output: number }>): VendorUsage {
  const write = counts.write ?? 0;
  return { input_tokens: counts.input, output_tokens: counts.output, cache_creation_input_tokens: write,
    cache_read_input_tokens: counts.read ?? 0, cache_creation: { ephemeral_5m_input_tokens: write, ephemeral_1h_input_tokens: 0 },
    service_tier: "standard" };
}

describe("F4 end to end · a write, then a read of the same tokens, then a prompt over the step", () => {
  it("charges a cache write, then a cache read of the same tokens, at exactly the vendor's list prices", async () => {
    const charges = await chargesOf([
      usage({ input: 1_200, write: 40_000, output: 3_000 }),
      usage({ input: 900, read: 40_000, output: 2_000 })
    ]);
    // First call:  1,200 x 0.10 =  120 | 40,000 x 0.125 = 5,000 | 3,000 x 0.50 = 1,500 -> 6,620.
    // Second call:   900 x 0.10 =   90 | 40,000 x 0.01  =   400 | 2,000 x 0.50 = 1,000 -> 1,490.
    expect(charges).toEqual([6_620, 1_490]);
    // The same two calls with every input token at the plain price: 41,200 x 0.10 + 1,500 = 5,620 and
    // 40,900 x 0.10 + 1,000 = 5,090. The figures above are not these: the seam reads the cache split.
    expect(charges).not.toEqual([5_620, 5_090]);
  });

  it("over the step: reads count toward the 100,000 tokens, and every token of that request pays the higher prices", async () => {
    const charges = await chargesOf([
      // 3,000 + 98,000 = 101,000 tokens: 3,000 x 0.50 = 1,500 | 98,000 x 0.05 = 4,900 | 1,000 x 2.50 = 2,500.
      usage({ input: 3_000, read: 98_000, output: 1_000 }),
      // A write over the step: 1 + 100,000 = 100,001 tokens: 1 x 0.50 rounds up to 1 | 100,000 x 0.625 = 62,500 | 10 x 2.50 = 25.
      usage({ input: 1, write: 100_000, output: 10 }),
      // Exactly 100,000 tokens is not over: 5,000 x 0.10 = 500 | 95,000 x 0.01 = 950 | 1,000 x 0.50 = 500.
      usage({ input: 5_000, read: 95_000, output: 1_000 }),
      // "Each request is priced on its own": back under the line, the next call is at the lower prices again.
      usage({ input: 100, read: 1_000, output: 100 })
    ]);
    expect(charges).toEqual([8_900, 62_526, 1_950, 10 + 10 + 50]);
  });

  it("the lifetime is the vendor's fact: an entry that expired comes back as a write and is charged as one", async () => {
    // Nothing in the charge keeps a clock. Same prompt, three times: written; read inside the 5 minutes; then, past
    // them, the vendor says write again. The third pays the write price again, as the vendor bills it.
    const charges = await chargesOf([
      usage({ input: 100, write: 10_000, output: 100 }),
      usage({ input: 100, read: 10_000, output: 100 }),
      usage({ input: 100, write: 10_000, output: 100 })
    ]);
    // 100 x 0.10 = 10 | 10,000 x 0.125 = 1,250 | 100 x 0.50 = 50 -> 1,310; the read: 10 + 100 + 50 -> 160.
    expect(charges).toEqual([1_310, 160, 1_310]);
  });

  it("a read costs a tenth of plain input and a 5-minute write a quarter more, as the page's multipliers say", async () => {
    const [plain, write, read] = await chargesOf([
      usage({ input: 10_000, output: 0 }),
      usage({ input: 0, write: 10_000, output: 0 }),
      usage({ input: 0, read: 10_000, output: 0 })
    ]);
    expect([plain, write, read]).toEqual([1_000, 1_250, 100]);
  });

  it("every call the gateway sends carries only the 5-minute mark (no ttl), the price the charge assumes for a split-less read", async () => {
    const { gateway, bodies } = haikuGateway([usage({ input: 1, output: 1 })]);
    const { store } = fakeStore();
    await gateway.call(call(guardOver(store).providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "BODY" })));
    const system = (JSON.parse(bodies[0]!) as { system: readonly Readonly<Record<string, unknown>>[] }).system;
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(bodies[0]).not.toContain("\"ttl\"");
  });
});

describe("F4 end to end · every seam a Haiku call can be charged on, the same bill", () => {
  const seams = [
    ["the debate's", "RUN", (guard: CostEnvelopeGuard) => guard.providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "BODY" })],
    ["the answer's", "RUN", (guard: CostEnvelopeGuard) => guard.providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "SERVE" })],
    ["the story's", "STORY", (guard: CostEnvelopeGuard) => guard.storySeam({ runId: RUN, price: REAL, requireReportedUsage: true })],
    ["the path rewrite's", "PATH_REWRITE", (guard: CostEnvelopeGuard) => guard.pathRewriteSeam({ runId: RUN, price: REAL, requireReportedUsage: true })],
    ["the final report's", "INVESTIGATION_REPORT", (guard: CostEnvelopeGuard) => guard.investigationReportSeam({ runId: RUN, price: REAL, requireReportedUsage: true })]
  ] as const;

  for (const [name, source, build] of seams) {
    it(`${name} seam`, async () => {
      const { store, written } = fakeStore();
      const { gateway } = haikuGateway([usage({ input: 1_200, write: 40_000, output: 3_000 })]);
      await gateway.call(call(build(guardOver(store))));
      expect(written).toHaveLength(1);
      // The ledger keeps the whole prompt as its token count and the real bill as its charge.
      expect(written[0]).toMatchObject({ spendSource: source, chargeMicros: 6_620, inputTokens: 41_200, outputTokens: 3_000 });
    });
  }

  it("the runner and the practice runner hand all four builders the same `price`, the one built with the vendor's prices", () => {
    for (const path of ["../../apps/runner/src/main.ts", "../../tools/preview-practice/practice-runner-composition.ts"]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).toContain("const price = previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target));");
      for (const seam of ["providerSeam", "storySeam", "pathRewriteSeam", "investigationReportSeam"]) {
        expect(source, `${path} ${seam}`).toContain(`.${seam}({ runId, price, requireReportedUsage: true`);
      }
    }
  });
});

describe("F4 · hosted without the preview's gate: the vendor bills the same, so the charge is the same", () => {
  it("the wire marks the instruction part off the preview too, so cache writes and reads happen there", async () => {
    // haikuGateway has none of the preview's controls, and the framed system prompt still goes out marked.
    const { gateway, bodies } = haikuGateway([usage({ input: 1, output: 1 })]);
    const { store } = fakeStore();
    await gateway.call(call(guardOver(store).providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "BODY" })));
    expect(JSON.stringify((JSON.parse(bodies[0]!) as { system: unknown }).system)).toContain("\"cache_control\"");
  });

  it("off the preview a reviewed Haiku target is charged the same bill, write, read and step", async () => {
    const { store, written } = fakeStore();
    const price = previewTargetChargePrice(false, { baseUrl: BASE_URL, model: MODEL }, DECLARED)!;
    const { gateway } = haikuGateway([
      usage({ input: 1_200, write: 40_000, output: 3_000 }),
      usage({ input: 3_000, read: 98_000, output: 1_000 })
    ]);
    const seam = guardOver(store).providerSeam({ runId: RUN, price, requireReportedUsage: true, phase: "BODY" });
    await gateway.call(call(seam));
    await gateway.call(call(seam));
    expect(written.map((entry) => entry.chargeMicros)).toEqual([6_620, 8_900]);
  });

  it("a target that is not a reviewed row keeps its declared price, on or off the preview", () => {
    for (const previewOn of [true, false]) {
      expect(previewTargetChargePrice(previewOn, { baseUrl: "https://api.deepinfra.com/v1/openai", model: "zai-org/GLM-5.3-Flash" }, DECLARED)).toBe(DECLARED);
      expect(previewTargetChargePrice(previewOn, { baseUrl: "https://relay.example.test/v1", model: MODEL }, DECLARED)).toBe(DECLARED);
    }
    expect(previewTargetChargePrice(false, { baseUrl: BASE_URL, model: MODEL }, null)).toBeNull();
  });
});

describe("F4 · a reply whose counts cannot be read", () => {
  /** A packet padded to about `paddingBytes`; the projection is read from what the gateway really told the seam. */
  async function chargeFor(vendor: VendorUsage, paddingBytes: number) {
    const { store, written } = fakeStore();
    const seen: Array<Readonly<{ requestBytes: number; completionTokenCeiling: number }>> = [];
    const seam = guardOver(store).providerSeam({ runId: RUN, price: REAL, requireReportedUsage: true, phase: "BODY" });
    const spy: ProviderCostEnvelopeSeam = { ...seam, assertCallAllowed: (projection) => { seen.push(projection); return seam.assertCallAllowed(projection); } };
    const { gateway } = haikuGateway([vendor]);
    let failure: unknown = null;
    // The gateway's largest packet allowance (1 MiB, what a final writer's tier may ask): only such a call can be this big.
    await gateway.call({ ...call(spy, framedFixturePacket("a".repeat(paddingBytes))), packetByteCap: 1_048_576 }).catch((error: unknown) => { failure = error; });
    expect(written, String(failure)).toHaveLength(1);
    expect(seen).toHaveLength(1);
    return { charge: written[0]!.chargeMicros, admitted: projectedCallCeilingMicros(REAL, seen[0]!), projectedPrompt: Math.ceil(seen[0]!.requestBytes / 2) };
  }

  it("input_tokens absent, cache counts present, a small prompt: the charge is the projection the call was admitted at", async () => {
    const { charge, admitted } = await chargeFor({ output_tokens: 4_096, cache_read_input_tokens: 500 }, 4_000);
    expect(charge).toBe(admitted);
  });

  it("no counts at all on a big request: the fallback never passes what the call was admitted at (the 5x step does not apply to a guess)", async () => {
    // The projected prompt passes 100,000 "tokens" only because it is bytes / 2; the vendor's real count is unknown.
    const { charge, admitted, projectedPrompt } = await chargeFor({ note: "no counters" }, 300_000);
    expect(projectedPrompt).toBeGreaterThan(100_000);
    expect(charge).toBe(admitted);
  });

  it("a malformed prompt count on a big request, with the output readable: still within what was admitted", async () => {
    const { charge, admitted, projectedPrompt } = await chargeFor({ input_tokens: "many", output_tokens: 10 }, 300_000);
    expect(projectedPrompt).toBeGreaterThan(100_000);
    expect(charge).toBeLessThanOrEqual(admitted);
    // The output at the lower price (10 x 0.50 = 5), the prompt at its plain price: never the upper step on a guess.
    expect(charge).toBe(Math.ceil(projectedPrompt * 0.1) + 5);
  });

  it("a write with no 5-minute/1-hour split is charged at the 1-hour price, as the charge claims", async () => {
    const charges = await chargesOf([{ input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 1_000 }]);
    // 100 x 0.10 = 10 | 1,000 x 0.20 = 200.
    expect(charges).toEqual([210]);
  });

  it("a read count alone, with no split object at all, is priced as a read", async () => {
    const charges = await chargesOf([{ input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 1_000 }]);
    // 100 x 0.10 = 10 | 1,000 x 0.01 = 10.
    expect(charges).toEqual([20]);
  });

  it("null cache members read as none", async () => {
    const charges = await chargesOf([{ input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: null, cache_read_input_tokens: null, cache_creation: null }]);
    expect(charges).toEqual([10 + 50]);
  });
});
