import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { projectedCallCeilingMicros, type ProviderTargetPrice } from "@debateai/budget";
import { RUN_LEVEL_SPEND_STOP_CODES, TypedDomainError } from "@debateai/kernel";
import {
  lengthRetryTokenCeiling,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderDiscoveryTarget,
  type ProviderGateway
} from "@debateai/providers";
import {
  ROUND_KEEPING_TECHNICAL_FAILURES,
  SYNTHESIS_OBJECTION_STANDING_MARK,
  buildFactBundle,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  keepsCompleteSynthesisRounds,
  runServeGateChain,
  runSynthesisLoop,
  type ComposedSegment,
  type DigestSourceNode,
  type EvaluatorVerdict,
  type ServeGateDependencies,
  type SynthesisDigest
} from "@debateai/serve";
import {
  ENVELOPE_STOP_REASONS,
  buildProviderPriceMap,
  buildServeDisclosureRecord,
  buildSynthesizerPromptPacket,
  callServeRoleWithFallback,
  fallbackContentRefusal,
  serveDisclosureBodyFacts,
  servePhaseFallbackOrder,
  serveLoopStopOf,
  servePhaseStopDisclosure,
  type ServeRoleMaker
} from "../../apps/runner/src/index.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.2 and §14.4.5), TASK M3.
 *
 * The owner's rule: "No debate ends without a final verdict unless there is a
 * technical problem; money is never the reason." Before M3 an answer-writing
 * call refused for money took the components-only envelope terminal at once,
 * and a round-2 failure threw away the round the checker had already read.
 * Now:
 *
 *  · a MONEY refusal of the writer or the checker is retried at the SAME call
 *    site with the SAME framed prompt on the run's other claim-eligible makers,
 *    cheapest first by the runner's price map; the seam decides what fits;
 *  · the checker prefers a maker other than the one that wrote the draft it
 *    checks, and takes the same one only when nothing else fits;
 *  · once one round is COMPLETE (a draft and its checker's verdict), a later
 *    spend stop or dead transport keeps that round instead of discarding it;
 *  · every answer gets one owner-side, content-free disclosure row.
 *
 * What only a run through the real pool can show — the sealed persist taking a
 * fallback's artifact, the row landing — is in
 * `tests/integration/database.test.ts` ("Engine money rule M3 …").
 */

const MONEY = "RUN_COST_ENVELOPE_MONEY_REACHED";

function digestNode(nodeId: string, statement: string): DigestSourceNode {
  return Object.freeze({
    nodeId,
    statement,
    finalStrength: 0.5,
    wayOfKnowing: "REASONING" as const,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze([]),
    isPosition: true,
    isSurvivingObjection: false
  });
}

function digestOf(statement: string): SynthesisDigest {
  const built = buildSynthesisDigest({
    nodes: [digestNode("root:A", statement)],
    servedRootNodeId: "root:A",
    budgetBound: Number.MAX_SAFE_INTEGER
  });
  if (built.kind !== "DIGEST") throw new Error("fixture digest cannot exist");
  return built.digest;
}

const CONTROLS = Object.freeze({
  synthesizerRoleRef: "provider:planned",
  evaluatorRoleRef: "provider:planned",
  evaluatorLoopMaxRounds: 3
});

const CODE_LABEL = Object.freeze({
  verdictLabel: "CONTESTED",
  servedNodeId: "root:A",
  servedStrength: 0.61,
  margin: null,
  registerVersion: 1
});

/** A REAL framed synthesizer request, as the runner builds it. */
function synthesizerCall(statement: string, providerRef = "provider:planned"): ProviderCallRequest {
  const request = buildSynthesizerRequest({
    controls: CONTROLS, round: 1, digest: digestOf(statement), codeLabel: CODE_LABEL, prior: null
  });
  return Object.freeze({
    runId: "run:m3",
    subjectItemId: "work:m3",
    callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1",
    role: "SYNTHESIZER" as const,
    lane: "served" as const,
    bound: Object.freeze({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 }),
    contractHash: "c".repeat(64),
    providerRef,
    packet: buildSynthesizerPromptPacket(request, "English")
  });
}

/** What the seam measures before sending — minus the target's own model name. */
function projectionOf(request: ProviderCallRequest, price: ProviderTargetPrice): number {
  const completionTokenCeiling = lengthRetryTokenCeiling(request.bound.tokenCeiling, 0);
  return projectedCallCeilingMicros(price, {
    requestBytes: Buffer.byteLength(JSON.stringify({
      max_tokens: completionTokenCeiling,
      messages: request.packet.messages
    }), "utf8"),
    completionTokenCeiling
  });
}

type Recorded = { readonly providerRef: string; readonly request: ProviderCallRequest };

/**
 * A maker whose gateway either answers or refuses the way the money seam does:
 * with `RUN_COST_ENVELOPE_MONEY_REACHED`, before anything is sent.
 */
function maker(providerRef: string, behaviour: "ANSWERS" | "REFUSES_MONEY" | Error, calls: Recorded[]): ServeRoleMaker {
  const provider: ProviderGateway = {
    call: async (request) => {
      calls.push({ providerRef, request });
      if (behaviour === "REFUSES_MONEY") {
        throw new TypedDomainError(MONEY, `test-layer: ${providerRef} does not fit`);
      }
      if (behaviour instanceof Error) throw behaviour;
      return { rawArtifactRef: `artifact:${providerRef}`, content: "{}" } as unknown as ProviderCallResult;
    }
  };
  return Object.freeze({ provider, providerRef });
}

const call = (target: ServeRoleMaker, request: ProviderCallRequest) => target.provider.call(request);

const PRICE_CHEAP_INPUT: ProviderTargetPrice = Object.freeze({
  inputMicrosPerMillionTokens: 100_000,
  outputMicrosPerMillionTokens: 10_000_000
});
const PRICE_CHEAP_OUTPUT: ProviderTargetPrice = Object.freeze({
  inputMicrosPerMillionTokens: 10_000_000,
  outputMicrosPerMillionTokens: 100_000
});
const PRICE_MIDDLING: ProviderTargetPrice = Object.freeze({
  inputMicrosPerMillionTokens: 3_000_000,
  outputMicrosPerMillionTokens: 3_000_000
});

function target(providerRef: string, price: ProviderTargetPrice | null): ProviderDiscoveryTarget {
  return Object.freeze({
    providerRef,
    maker: `maker:${providerRef}`,
    baseUrl: "https://vendor.invalid/v1",
    model: `model:${providerRef}`,
    ...(price === null ? {} : {
      inputPriceMicrosPerMillionTokens: price.inputMicrosPerMillionTokens,
      outputPriceMicrosPerMillionTokens: price.outputMicrosPerMillionTokens
    })
  });
}

describe("M3 · the runner's price map (hosted only; never sealed)", () => {
  it("is built from the provider targets' prices in hosted mode, through the one reader", () => {
    const prices = buildProviderPriceMap([
      target("provider:a", PRICE_CHEAP_INPUT),
      target("provider:b", PRICE_CHEAP_OUTPUT)
    ], "hosted");
    expect([...prices.keys()]).toEqual(["provider:a", "provider:b"]);
    expect(prices.get("provider:a")).toEqual(PRICE_CHEAP_INPUT);
    expect(prices.get("provider:b")).toEqual(PRICE_CHEAP_OUTPUT);
    expect(Object.isFrozen(prices)).toBe(true);
    expect(Object.isFrozen(prices.get("provider:a"))).toBe(true);
  });

  it("is EMPTY in local mode, even when a target declares a price", () => {
    const prices = buildProviderPriceMap([target("provider:a", PRICE_CHEAP_INPUT)], "local");
    expect(prices.size).toBe(0);
  });

  it("leaves a target without a price out rather than inventing one", () => {
    const prices = buildProviderPriceMap([
      target("provider:a", PRICE_CHEAP_INPUT),
      target("provider:unpriced", null)
    ], "hosted");
    expect([...prices.keys()]).toEqual(["provider:a"]);
  });

  it("is handed to the shipped runner from the deployment's own targets and mode", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const settings = main.slice(main.indexOf("new WalkingSkeletonRunner("));
    expect(settings).toContain("providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),");
  });
});

describe("M3 · the fallback order: cheapest first by THIS request's projection", () => {
  const smallRequest = synthesizerCall("Short.");
  const largeRequest = synthesizerCall("A long statement. ".repeat(2_000));

  it("orders by the seam's own projection, so the order follows the request's size", () => {
    const calls: Recorded[] = [];
    const claimEligible = [
      maker("provider:planned", "ANSWERS", calls),
      maker("provider:cheap-input", "ANSWERS", calls),
      maker("provider:cheap-output", "ANSWERS", calls)
    ];
    const prices = new Map([
      ["provider:planned", PRICE_MIDDLING],
      ["provider:cheap-input", PRICE_CHEAP_INPUT],
      ["provider:cheap-output", PRICE_CHEAP_OUTPUT]
    ]);
    const orderFor = (request: ProviderCallRequest) => servePhaseFallbackOrder({
      planned: "provider:planned", claimEligible, prices, request, preferNot: null
    }).map((entry) => entry.providerRef);
    // The oracle is the seam's own function, not a copy of it.
    const expectedFor = (request: ProviderCallRequest) => ["provider:cheap-input", "provider:cheap-output"]
      .sort((left, right) => projectionOf(request, prices.get(left)!) - projectionOf(request, prices.get(right)!));

    expect(orderFor(smallRequest)).toEqual(expectedFor(smallRequest));
    expect(orderFor(largeRequest)).toEqual(expectedFor(largeRequest));
    // A plain price comparison could not do this: the same two makers swap
    // places, because a short prompt is dominated by max_tokens × output and a
    // long one by bytes/2 × input.
    expect(orderFor(smallRequest)).toEqual(["provider:cheap-output", "provider:cheap-input"]);
    expect(orderFor(largeRequest)).toEqual(["provider:cheap-input", "provider:cheap-output"]);
  });

  it("never offers the refused maker again, and offers each other maker once", () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "ANSWERS", calls);
    const other = maker("provider:other", "ANSWERS", calls);
    const order = servePhaseFallbackOrder({
      planned: "provider:planned",
      claimEligible: [planned, other, planned, other],
      prices: new Map(),
      request: smallRequest,
      preferNot: null
    });
    expect(order.map((entry) => entry.providerRef)).toEqual(["provider:other"]);
  });

  it("falls back to the roster order when the map is empty (local mode has no money ceiling)", () => {
    const calls: Recorded[] = [];
    const order = servePhaseFallbackOrder({
      planned: "provider:b",
      claimEligible: ["provider:a", "provider:b", "provider:c", "provider:d"].map((ref) => maker(ref, "ANSWERS", calls)),
      prices: new Map(),
      request: largeRequest,
      preferNot: null
    });
    expect(order.map((entry) => entry.providerRef)).toEqual(["provider:a", "provider:c", "provider:d"]);
  });

  it("puts a maker with no price after every priced one, in roster order", () => {
    const calls: Recorded[] = [];
    const order = servePhaseFallbackOrder({
      planned: "provider:planned",
      claimEligible: ["provider:planned", "provider:unpriced", "provider:priced"].map((ref) => maker(ref, "ANSWERS", calls)),
      prices: new Map([["provider:priced", PRICE_MIDDLING]]),
      request: smallRequest,
      preferNot: null
    });
    expect(order.map((entry) => entry.providerRef)).toEqual(["provider:priced", "provider:unpriced"]);
  });

  it("ranks a maker whose price the projection cannot use as unpriced, instead of failing the search", () => {
    const calls: Recorded[] = [];
    const order = servePhaseFallbackOrder({
      planned: "provider:planned",
      claimEligible: ["provider:planned", "provider:malformed", "provider:priced"].map((ref) => maker(ref, "ANSWERS", calls)),
      prices: new Map([
        ["provider:malformed", Object.freeze({ inputMicrosPerMillionTokens: -1, outputMicrosPerMillionTokens: 1 })],
        ["provider:priced", PRICE_MIDDLING]
      ]),
      request: smallRequest,
      preferNot: null
    });
    expect(order.map((entry) => entry.providerRef)).toEqual(["provider:priced", "provider:malformed"]);
  });

  it("lets the checker prefer every other maker before the one that wrote the draft", () => {
    const calls: Recorded[] = [];
    const order = servePhaseFallbackOrder({
      planned: "provider:planned",
      claimEligible: ["provider:planned", "provider:writer", "provider:dear"].map((ref) => maker(ref, "ANSWERS", calls)),
      // The writer is the CHEAPER maker, and still comes second.
      prices: new Map([
        ["provider:writer", PRICE_CHEAP_INPUT],
        ["provider:dear", Object.freeze({ inputMicrosPerMillionTokens: 90_000_000, outputMicrosPerMillionTokens: 90_000_000 })]
      ]),
      request: smallRequest,
      preferNot: "provider:writer"
    });
    expect(order.map((entry) => entry.providerRef)).toEqual(["provider:dear", "provider:writer"]);
  });
});

describe("M3 · the answer-writer and checker adapters: a money refusal tries the cheaper makers", () => {
  it("makes no fallback when the planned maker's call goes through", async () => {
    const calls: Recorded[] = [];
    const outcome = await callServeRoleWithFallback({
      planned: maker("provider:planned", "ANSWERS", calls),
      claimEligible: [maker("provider:other", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    });
    expect(outcome.servedBy.providerRef).toBe("provider:planned");
    expect(outcome.fallback).toBe(false);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned"]);
  });

  it("tries cheapest first, skips a maker the seam refuses, and serves on the first that fits", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const outcome = await callServeRoleWithFallback({
      planned,
      claimEligible: [
        planned,
        maker("provider:dear", "ANSWERS", calls),
        maker("provider:cheapest", "REFUSES_MONEY", calls),
        maker("provider:cheap", "ANSWERS", calls)
      ],
      prices: new Map([
        ["provider:planned", PRICE_MIDDLING],
        ["provider:cheapest", Object.freeze({ inputMicrosPerMillionTokens: 1, outputMicrosPerMillionTokens: 1 })],
        ["provider:cheap", Object.freeze({ inputMicrosPerMillionTokens: 10, outputMicrosPerMillionTokens: 10 })],
        ["provider:dear", PRICE_MIDDLING]
      ]),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:cheapest", "provider:cheap"]);
    expect(outcome.servedBy.providerRef).toBe("provider:cheap");
    expect(outcome.fallback).toBe(true);
  });

  it("sends the SAME call site and the SAME framed prompt bytes to every maker it tries", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const request = synthesizerCall("The framed prompt a fallback must not rewrite.");
    await callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:refuses", "REFUSES_MONEY", calls), maker("provider:fits", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request,
      call
    });
    expect(calls).toHaveLength(3);
    for (const recorded of calls) {
      const { providerRef, ...rest } = recorded.request;
      const { providerRef: _planned, ...expected } = request;
      // The provider is the ONLY thing a fallback changes...
      expect(providerRef).toBe(recorded.providerRef);
      expect(rest).toEqual(expected);
      expect(recorded.request.callSiteKey).toBe("COMPOSER:SYNTHESIZER:INITIAL:1");
      expect(recorded.request.role).toBe("SYNTHESIZER");
      expect(recorded.request.lane).toBe("served");
      // ...and the prompt is byte-for-byte the one the planned maker was offered.
      expect(JSON.stringify(recorded.request.packet)).toBe(JSON.stringify(request.packet));
      expect(recorded.request.packet).toBe(request.packet);
    }
  });

  it("lets the checker check with the draft's own writer only when no other maker fits", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const outcome = await callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:writer", "ANSWERS", calls), maker("provider:other", "REFUSES_MONEY", calls)],
      prices: new Map([
        ["provider:writer", PRICE_CHEAP_INPUT],
        ["provider:other", PRICE_MIDDLING]
      ]),
      preferNot: "provider:writer",
      request: synthesizerCall("Short."),
      call
    });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:other", "provider:writer"]);
    expect(outcome.servedBy.providerRef).toBe("provider:writer");
  });

  it("prefers a different checker when one fits, even if the writer is cheaper", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const outcome = await callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:writer", "ANSWERS", calls), maker("provider:other", "ANSWERS", calls)],
      prices: new Map([
        ["provider:writer", PRICE_CHEAP_INPUT],
        ["provider:other", PRICE_MIDDLING]
      ]),
      preferNot: "provider:writer",
      request: synthesizerCall("Short."),
      call
    });
    expect(outcome.servedBy.providerRef).toBe("provider:other");
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:other"]);
  });

  it("rethrows the planned call's own money refusal when no maker fits", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:a", "REFUSES_MONEY", calls), maker("provider:b", "REFUSES_MONEY", calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    })).rejects.toMatchObject({ code: MONEY, message: "test-layer: provider:planned does not fit" });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:a", "provider:b"]);
  });

  /**
   * J24, AMENDED (spec §14.4.2): a sealed identity is substituted for COST, and
   * disclosed. For any other reason the refusal stands exactly as before.
   */
  it.each([
    ["the attempt ceiling", new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts")],
    ["a vendor that reports no usage", new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "usage")],
    ["a spent day", new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "day")],
    ["a dead transport", new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "dead")],
    ["a vanished role provider", new TypedDomainError("SYNTHESIS_ROLE_PROVIDER_UNRESOLVED", "gone")],
    ["a contract error", new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "content")],
    ["the per-site attempt budget", new TypedDomainError("CALL_BUDGET_EXHAUSTED", "site")],
    ["an untyped failure", new Error("boom")]
  ])("never substitutes a maker for %s", async (_name, failure) => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", failure, calls);
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:healthy", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    })).rejects.toBe(failure);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned"]);
  });

  it("stops at the first fallback that fails for any reason but money", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const death = new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "dead");
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:dies", death, calls), maker("provider:fits", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    })).rejects.toBe(death);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:dies"]);
  });

  /**
   * FINAL REVIEW, Important 1 (spec §14.4.2, §14.4.9). A cheaper maker is only
   * ever asked because the planned one could not be paid. When its draft or
   * verdict is then refused for its CONTENT after its own repairs, it has left
   * nothing the engine may serve: SYNTHESIS_NO_ARTIFACT, the sealed chain's own
   * class. Round 1 then ends components-only and the floor answers; a later
   * round keeps the complete round before it. Before this, the contract error
   * travelled as itself, the run ended FAILED, and a complete round 1 was lost.
   */
  it.each([
    ["the writer's contract error", "COMPOSITION_CONTRACT_ERROR"],
    ["the checker's contract error", "EVALUATOR_CONTRACT_ERROR"],
    ["an incoherent verdict", "EVALUATOR_VERDICT_INCOHERENT"],
    ["a verdict with no objection", "EVALUATOR_OBJECTION_MISSING"]
  ] as const)("turns %s from a FALLBACK into SYNTHESIS_NO_ARTIFACT, which keeps a round and names NO_ARTIFACT (final review I-1)", async (_name, code) => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const refused = new TypedDomainError(code, "test-layer: the fallback's content");
    const request = synthesizerCall("Short.");
    const failure = await callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:refused", refused, calls), maker("provider:fits", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request,
      call,
      onFallbackFailure: fallbackContentRefusal
    }).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(TypedDomainError);
    expect((failure as TypedDomainError).code).toBe("SYNTHESIS_NO_ARTIFACT");
    // Codes and call sites only: never the model's words.
    expect((failure as TypedDomainError).message).toBe(
      `The cost fallback's SYNTHESIZER at ${request.callSiteKey} left nothing to serve: ${code}`
    );
    expect((failure as TypedDomainError).cause).toBe(refused);
    // The search still ends at that maker: no third maker is asked.
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:refused"]);
    // It is a failure the loop keeps a complete round for, and the owner's row names it.
    expect(keepsCompleteSynthesisRounds(failure)).toBe(true);
    expect(serveLoopStopOf(failure)).toBe("NO_ARTIFACT");
  });

  it("leaves the PLANNED maker's own contract error as it is, even with the mapping wired (an owner question)", async () => {
    const calls: Recorded[] = [];
    const contract = new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "test-layer: the planned maker's content");
    const planned = maker("provider:planned", contract, calls);
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:healthy", "ANSWERS", calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call,
      onFallbackFailure: fallbackContentRefusal
    })).rejects.toBe(contract);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned"]);
  });

  it.each([
    ["a dead transport", new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "dead")],
    ["the attempt ceiling", new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts")],
    ["an untyped failure", new Error("boom")],
    ["a code-shaped object", { code: "COMPOSITION_CONTRACT_ERROR" }]
  ])("lets %s from a fallback travel as itself: only a content refusal is mapped", async (_name, failure) => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const fallback: ServeRoleMaker = Object.freeze({
      providerRef: "provider:fails",
      provider: { call: async (request: ProviderCallRequest) => { calls.push({ providerRef: "provider:fails", request }); throw failure; } }
    });
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, fallback],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call,
      onFallbackFailure: fallbackContentRefusal
    })).rejects.toBe(failure);
  });

  it("maps nothing when the caller names no mapping (the story's own fallback)", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", "REFUSES_MONEY", calls);
    const contract = new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "test-layer: content");
    await expect(callServeRoleWithFallback({
      planned,
      claimEligible: [planned, maker("provider:refused", contract, calls)],
      prices: new Map(),
      preferNot: null,
      request: synthesizerCall("Short."),
      call
    })).rejects.toBe(contract);
  });

  it("is wired into BOTH answer-writing adapters of the shipped runner, with each draft and verdict read inside the try", async () => {
    const runner = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(runner.split("onFallbackFailure: fallbackContentRefusal").length - 1).toBe(2);
    // The draft and the verdict are parsed inside the call a fallback makes, so
    // a fallback's content that fails the engine's own reading is mapped too.
    expect(runner).toContain("return Object.freeze({ response, composedSegments: composedSegmentsOf(response.content) });");
    expect(runner).toContain("return Object.freeze({ response, verdict: evaluatorVerdictOf(response.content) });");
  });
});

const SATISFIED: EvaluatorVerdict = Object.freeze({
  satisfied: true,
  objection: null,
  criteria: Object.freeze({
    fairnessToLosers: true,
    statementLabelAgreement: true,
    noOverstatement: true,
    restatement: true,
    citationTracing: true
  })
});

function objecting(objection: string): EvaluatorVerdict {
  return Object.freeze({
    satisfied: false,
    objection,
    criteria: Object.freeze({ ...SATISFIED.criteria, fairnessToLosers: false })
  });
}

function segments(text: string): readonly ComposedSegment[] {
  return Object.freeze([
    Object.freeze({
      segmentId: "s1", text, loadBearing: false,
      assertedNodeRefs: Object.freeze(["root:A"]), servedNumberRefs: Object.freeze(["number:final-strength"])
    }),
    Object.freeze({
      segmentId: "s2", text: `${text} Research plan.`, loadBearing: false,
      assertedNodeRefs: Object.freeze(["root:A"]), servedNumberRefs: Object.freeze([])
    })
  ]);
}

/**
 * A scripted loop: each round's writer and checker either answer or throw.
 * `failAt` names the call that fails, and with what.
 */
function scriptedLoop(input: Readonly<{
  failAt: Readonly<{ round: number; role: "SYNTHESIZER" | "EVALUATOR"; error: unknown }>;
  verdicts?: readonly EvaluatorVerdict[];
}>) {
  const verdicts = input.verdicts ?? [objecting("Round one is unfair to the losing side."), objecting("Still unfair."), SATISFIED];
  const seen: string[] = [];
  const dependencies: ServeGateDependencies = {
    synthesize: async (request) => {
      seen.push(`SYNTHESIZER:${request.round}`);
      if (input.failAt.role === "SYNTHESIZER" && input.failAt.round === request.round) throw input.failAt.error;
      return {
        candidate: segments(`Draft ${request.round}.`),
        candidateRef: `artifact:draft:${request.round}`,
        candidateCallSiteKey: `COMPOSER:SYNTHESIZER:${request.stage}:${request.round}`
      };
    },
    evaluate: async (request) => {
      seen.push(`EVALUATOR:${request.round}`);
      if (input.failAt.role === "EVALUATOR" && input.failAt.round === request.round) throw input.failAt.error;
      return {
        verdict: verdicts[request.round - 1]!,
        verdictRef: `artifact:verdict:${request.round}`,
        verdictCallSiteKey: `POST_COMPOSE_R9:EVALUATOR:${request.round}`
      };
    },
    applyBandCeiling: ({ basis, candidateConfidenceBand }) => ({
      kind: "NOT_CAPPED",
      confidenceBand: candidateConfidenceBand,
      ceiling: {
        label: "TEST_CEILING", basis, registerRowKey: "test-layer:ceiling", registerVersion: 1,
        sourceRef: "test-layer:M3", liftPath: "test-layer:lift"
      }
    })
  };
  return { dependencies, seen };
}

function loopOver(dependencies: ServeGateDependencies) {
  return runSynthesisLoop<readonly ComposedSegment[]>({
    controls: CONTROLS, digest: digestOf("A position."), codeLabel: CODE_LABEL
  }, {
    synthesize: dependencies.synthesize,
    evaluate: dependencies.evaluate,
    readCandidateStatement: (candidate) => candidate.map((segment) => segment.text).join("\n")
  });
}

describe("M3 · keep the best complete round (R4): a later failure keeps what the checker already read", () => {
  it("names the failures that keep a complete round: every run-level spend stop, a dead transport, and no artifact", () => {
    for (const code of [
      "RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_EXHAUSTED", "PROVIDER_USAGE_UNREPORTED",
      "DAILY_COST_ENVELOPE_REACHED", "SYNTHESIS_TRANSPORT_DEATH", "SYNTHESIS_NO_ARTIFACT"
    ]) {
      expect(keepsCompleteSynthesisRounds(new TypedDomainError(code, "x")), code).toBe(true);
    }
    for (const code of [
      "COMPOSITION_CONTRACT_ERROR", "EVALUATOR_CONTRACT_ERROR",
      "EVALUATOR_VERDICT_INCOHERENT", "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED", "CALL_BUDGET_EXHAUSTED"
    ]) {
      expect(keepsCompleteSynthesisRounds(new TypedDomainError(code, "x")), code).toBe(false);
    }
    // A code-shaped object that is not a typed error is not trusted.
    expect(keepsCompleteSynthesisRounds({ code: MONEY })).toBe(false);
  });

  it("round 2's writer refused for money after round 1 completed: round 1 is what the loop returns", async () => {
    const { dependencies, seen } = scriptedLoop({
      failAt: { round: 2, role: "SYNTHESIZER", error: new TypedDomainError(MONEY, "no maker fits") }
    });
    const outcome = await loopOver(dependencies);
    expect(seen).toEqual(["SYNTHESIZER:1", "EVALUATOR:1", "SYNTHESIZER:2"]);
    expect(outcome.rounds.map((round) => round.round)).toEqual([1]);
    expect(outcome.candidateStatement).toBe("Draft 1.\nDraft 1. Research plan.");
    expect(outcome.candidate).toEqual(segments("Draft 1."));
    // The checker's verdict is round 1's own — nothing is invented.
    expect(outcome.rounds.at(-1)?.verdictRef).toBe("artifact:verdict:1");
    expect(outcome.standingObjection).toBe("Round one is unfair to the losing side.");
    expect(outcome.marks).toEqual([SYNTHESIS_OBJECTION_STANDING_MARK]);
    expect(outcome.endedEarlyBy).toBe(MONEY);
  });

  it("round 2's checker refused after round 2's draft was written: round 1's draft is kept, not round 2's", async () => {
    const { dependencies } = scriptedLoop({
      failAt: { round: 2, role: "EVALUATOR", error: new TypedDomainError(MONEY, "no checker fits") }
    });
    const outcome = await loopOver(dependencies);
    expect(outcome.rounds.map((round) => round.candidateRef)).toEqual(["artifact:draft:1"]);
    expect(outcome.candidate).toEqual(segments("Draft 1."));
    expect(outcome.candidateStatement).toBe("Draft 1.\nDraft 1. Research plan.");
  });

  it("a dead transport in round 3 keeps rounds 1 and 2, and serves round 2", async () => {
    const { dependencies } = scriptedLoop({
      failAt: { round: 3, role: "SYNTHESIZER", error: new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "dead") }
    });
    const outcome = await loopOver(dependencies);
    expect(outcome.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(outcome.candidate).toEqual(segments("Draft 2."));
    expect(outcome.standingObjection).toBe("Still unfair.");
    expect(outcome.endedEarlyBy).toBe("SYNTHESIS_TRANSPORT_DEATH");
  });

  it("a later round that produced no artifact keeps round 1 too: a technical failure of that round, not of round 1", async () => {
    const { dependencies } = scriptedLoop({
      failAt: { round: 2, role: "SYNTHESIZER", error: new TypedDomainError("SYNTHESIS_NO_ARTIFACT", "nothing to serve") }
    });
    const outcome = await loopOver(dependencies);
    expect(outcome.rounds.map((round) => round.round)).toEqual([1]);
    expect(outcome.candidate).toEqual(segments("Draft 1."));
    expect(outcome.endedEarlyBy).toBe("SYNTHESIS_NO_ARTIFACT");
  });

  it("a finished loop says it was not cut short", async () => {
    const { dependencies } = scriptedLoop({
      failAt: { round: 99, role: "SYNTHESIZER", error: new Error("never") },
      verdicts: [SATISFIED]
    });
    const outcome = await loopOver(dependencies);
    expect(outcome.endedEarlyBy).toBeNull();
  });

  it.each([
    ["the writer", "SYNTHESIZER" as const],
    ["the checker", "EVALUATOR" as const]
  ])("a round-1 refusal of %s still throws: there is no checked round to keep", async (_name, role) => {
    const refusal = new TypedDomainError(MONEY, "round one");
    const { dependencies } = scriptedLoop({ failAt: { round: 1, role, error: refusal } });
    await expect(loopOver(dependencies)).rejects.toBe(refusal);
  });

  it.each([
    "COMPOSITION_CONTRACT_ERROR",
    "EVALUATOR_CONTRACT_ERROR"
  ])("a %s in round 2 keeps today's handling: it is not money", async (code) => {
    const failure = new TypedDomainError(code, "content");
    const { dependencies } = scriptedLoop({ failAt: { round: 2, role: "EVALUATOR", error: failure } });
    await expect(loopOver(dependencies)).rejects.toBe(failure);
  });

  it("through the SEALED chain: round 2 refused → round 1 is served, as a finished loop's last round would be", async () => {
    const { dependencies } = scriptedLoop({
      failAt: { round: 2, role: "SYNTHESIZER", error: new TypedDomainError(MONEY, "no maker fits") }
    });
    const result = await runServeGateChain({
      nodes: [{
        nodeId: "root:A", text: "A position.", wayOfKnowing: "REASONING", provenanceRef: "artifact:root:A",
        locator: null, restatementStatus: "PASS", loadBearing: true
      }],
      factBundle: buildFactBundle({
        facts: ["A position."], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "A contrary measurement would reverse this.",
        buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
      }),
      compositionBudget: {
        tier: "low", bound: 200_000, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "test-layer:M3"
      },
      candidateConfidenceBand: "medium",
      digestNodes: [digestNode("root:A", "A position.")],
      servedRootNodeId: "root:A",
      codeLabel: CODE_LABEL,
      synthesisRoleControls: CONTROLS
    }, dependencies);
    expect(["SERVED", "DOWNGRADED"]).toContain(result.terminal);
    expect(result.crashClass).toBeNull();
    expect(result.segments.map((segment) => segment.text)).toEqual(["Draft 1.", "Draft 1. Research plan."]);
    expect(result.loopRounds.map((round) => round.round)).toEqual([1]);
    expect(result.standingObjection).toBe("Round one is unfair to the losing side.");
    expect(result.conditionMarks).toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
    expect(result.gateTrace).toEqual(expect.arrayContaining(["COMPOSED", "SYNTHESIS_LOOP_EXHAUSTED"]));
    expect(result.gateTrace).not.toContain("RECOMPOSED_ONCE");
  });
});

describe("M3 polish · what ended the answer-writing loop early, for the owner's record (serve_stop)", () => {
  it.each([
    ["RUN_COST_ENVELOPE_MONEY_REACHED", "MONEY"],
    ["RUN_COST_ENVELOPE_EXHAUSTED", "ATTEMPTS"],
    ["PROVIDER_USAGE_UNREPORTED", "USAGE"],
    ["DAILY_COST_ENVELOPE_REACHED", "DAILY"],
    ["SYNTHESIS_TRANSPORT_DEATH", "TRANSPORT_DEATH"],
    ["SYNTHESIS_NO_ARTIFACT", "NO_ARTIFACT"]
  ] as const)("names %s as %s", (code, stop) => {
    expect(serveLoopStopOf(new TypedDomainError(code, "x"))).toBe(stop);
  });

  /**
   * M3 review carry (Task M4): the loop keeps a round for every run-level spend
   * stop and for each code on its exported technical list. Each of those ends
   * the loop early, so each must name a `serve_stop` — a code added to either
   * list later fails here instead of silently recording NULL on the owner's row.
   */
  it("names a stop for every code the answer-writing loop keeps a round for", () => {
    const kept = [...RUN_LEVEL_SPEND_STOP_CODES, ...ROUND_KEEPING_TECHNICAL_FAILURES];
    for (const code of kept) {
      const failure = new TypedDomainError(code, "x");
      expect(keepsCompleteSynthesisRounds(failure), code).toBe(true);
      expect(serveLoopStopOf(failure), code).not.toBeNull();
    }
    // Today's list, so a change to it is seen here too.
    expect(ROUND_KEEPING_TECHNICAL_FAILURES).toEqual(["SYNTHESIS_TRANSPORT_DEATH", "SYNTHESIS_NO_ARTIFACT"]);
  });

  it("names nothing for no failure, a failure that ends no loop early, or a code-shaped object", () => {
    expect(serveLoopStopOf(null)).toBeNull();
    expect(serveLoopStopOf(new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "x"))).toBeNull();
    expect(serveLoopStopOf(new Error("boom"))).toBeNull();
    expect(serveLoopStopOf({ code: "SYNTHESIS_TRANSPORT_DEATH" })).toBeNull();
  });
});

describe("M3 · a round kept after a spend stop says so on the answer", () => {
  const base = { runId: "run:m3", servedRootNodeId: "root:A", resultConditionMarks: [] as readonly string[] };

  it.each([
    [MONEY, "MONEY"],
    ["RUN_COST_ENVELOPE_EXHAUSTED", "ATTEMPTS"],
    ["PROVIDER_USAGE_UNREPORTED", "USAGE"]
  ] as const)("records %s as the answer's envelope record when a round was kept", (code, kind) => {
    const record = servePhaseStopDisclosure({
      ...base, servePhaseFailure: new TypedDomainError(code, "stop"), keptRounds: 1
    });
    expect(record).toEqual({
      mark: "ENVELOPE_EXHAUSTED",
      scope: "answer",
      subjectRef: "run:m3",
      reason: ENVELOPE_STOP_REASONS[kind],
      liftPath: null,
      servedRootRule: null,
      affectedNodeIds: ["root:A"]
    });
  });

  it("adds nothing for a dead transport, for no failure, for no kept round, or beside the mark or DEFECT", () => {
    expect(servePhaseStopDisclosure({
      ...base, servePhaseFailure: new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "dead"), keptRounds: 1
    })).toBeNull();
    expect(servePhaseStopDisclosure({ ...base, servePhaseFailure: null, keptRounds: 1 })).toBeNull();
    expect(servePhaseStopDisclosure({
      ...base, servePhaseFailure: new TypedDomainError(MONEY, "stop"), keptRounds: 0
    })).toBeNull();
    expect(servePhaseStopDisclosure({
      ...base, servePhaseFailure: new TypedDomainError(MONEY, "stop"), keptRounds: 1,
      resultConditionMarks: ["ENVELOPE_EXHAUSTED"]
    })).toBeNull();
    expect(servePhaseStopDisclosure({
      ...base, servePhaseFailure: new TypedDomainError(MONEY, "stop"), keptRounds: 1,
      resultConditionMarks: ["DEFECT"]
    })).toBeNull();
  });
});

describe("M3 · the owner-side disclosure row (§14.4.5), built by code from facts the run holds", () => {
  const ids = Object.freeze({
    answerId: "00000000-0000-4000-8000-00000000a001",
    answerVersion: 1,
    runId: "00000000-0000-4000-8000-00000000b001"
  });

  it("an answer written and checked by the planned makers carries no fallback", () => {
    expect(buildServeDisclosureRecord({
      ...ids,
      planned: { writerRef: "provider:a", checkerRef: "provider:b" },
      served: { writerRef: "provider:a", checkerRef: "provider:b" },
      body: { bodyStop: null, pointsWithoutReview: null },
      serveStop: null,
      digest: null,
      floor: null
    })).toEqual({
      ...ids,
      writerPlannedRef: "provider:a",
      checkerPlannedRef: "provider:b",
      writerServedRef: "provider:a",
      checkerServedRef: "provider:b",
      writerFallback: false,
      checkerFallback: false,
      fallbackReason: null,
      checkerSameAsWriter: false,
      bodyStop: null,
      pointsWithoutReview: null,
      serveStop: null,
      digestRung: null,
      digestPointsOmitted: null,
      floorVerdictState: null,
      floorLeadingNodeId: null,
      floorReason: null
    });
  });

  it("a writer and checker served by a cheaper maker are both disclosed, for money, and the lost diversity too (R9)", () => {
    const record = buildServeDisclosureRecord({
      ...ids,
      planned: { writerRef: "provider:a", checkerRef: "provider:b" },
      served: { writerRef: "provider:c", checkerRef: "provider:c" },
      body: { bodyStop: "MONEY", pointsWithoutReview: 3 },
      serveStop: null,
      digest: null,
      floor: null
    });
    expect(record).toMatchObject({
      writerFallback: true,
      checkerFallback: true,
      fallbackReason: "MONEY",
      checkerSameAsWriter: true,
      bodyStop: "MONEY",
      pointsWithoutReview: 3
    });
  });

  it("a checker on the planned maker that the writer's fallback also landed on is the same maker, and no checker fallback", () => {
    const record = buildServeDisclosureRecord({
      ...ids,
      planned: { writerRef: "provider:a", checkerRef: "provider:b" },
      served: { writerRef: "provider:b", checkerRef: "provider:b" },
      body: { bodyStop: null, pointsWithoutReview: null },
      serveStop: null,
      digest: null,
      floor: null
    });
    expect(record).toMatchObject({ writerFallback: true, checkerFallback: false, fallbackReason: "MONEY", checkerSameAsWriter: true });
  });

  it("a components-only answer has no checked round: no served makers, no fallback", () => {
    const record = buildServeDisclosureRecord({
      ...ids,
      planned: { writerRef: "provider:a", checkerRef: "provider:a" },
      served: null,
      body: { bodyStop: "ATTEMPTS", pointsWithoutReview: 0 },
      serveStop: "MONEY",
      digest: null,
      floor: null
    });
    expect(record).toMatchObject({
      writerServedRef: null,
      checkerServedRef: null,
      writerFallback: false,
      checkerFallback: false,
      fallbackReason: null,
      checkerSameAsWriter: false,
      bodyStop: "ATTEMPTS",
      pointsWithoutReview: 0,
      serveStop: "MONEY"
    });
  });

  it("records what ended the loop early even when a round was kept, beside the stop while arguing", () => {
    const record = buildServeDisclosureRecord({
      ...ids,
      planned: { writerRef: "provider:a", checkerRef: "provider:a" },
      served: { writerRef: "provider:a", checkerRef: "provider:a" },
      body: { bodyStop: "MONEY", pointsWithoutReview: 1 },
      serveStop: "NO_ARTIFACT",
      digest: null,
      floor: null
    });
    expect(record).toMatchObject({ bodyStop: "MONEY", serveStop: "NO_ARTIFACT", writerServedRef: "provider:a" });
  });

  it("counts the points a stop left without a cross-review only on the spend-stopped footing", () => {
    const seeded = Object.freeze(["n1", "n2"]);
    expect(serveDisclosureBodyFacts({
      runBodyBudgetStop: "MONEY", decision: { footing: "SPEND_STOPPED", seededWithoutReview: seeded }
    })).toEqual({ bodyStop: "MONEY", pointsWithoutReview: 2 });
    // A mono-maker run never cross-reviews, stopped or not: nothing was LEFT unreviewed by the stop.
    expect(serveDisclosureBodyFacts({
      runBodyBudgetStop: "USAGE", decision: { footing: "MONO_MAKER", seededWithoutReview: [] }
    })).toEqual({ bodyStop: "USAGE", pointsWithoutReview: null });
    expect(serveDisclosureBodyFacts({
      runBodyBudgetStop: null, decision: { footing: "CROSS_REVIEWED", seededWithoutReview: [] }
    })).toEqual({ bodyStop: null, pointsWithoutReview: null });
  });
});
