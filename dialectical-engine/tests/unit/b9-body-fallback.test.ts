import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ProviderTargetPrice } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { runJudgePanel, type JudgeAssessment } from "@debateai/judgement";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  bodyCallMayMove,
  bodyCostFallbackGateway,
  bodyRefusedForMoney,
  callBodyRoleWithFallback,
  substitutionReason,
  type BodyCostSubstitutionEvent,
  type ServeRoleMaker
} from "../../apps/runner/src/index.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * B9c (budget spec §2.9) — THE BODY'S TWIN OF THE ANSWER-WRITER'S COST FALLBACK. A call made while arguing that
 * is refused for money — the run's own ceiling, the site's day or the owner's window at a finish edge — is
 * retried at the SAME call site with the SAME framed prompt on the run's other claim-eligible makers, cheapest
 * first; the seam decides what fits. A cheaper maker that cannot serve (its transport died, or its content was
 * refused after its repairs) hands the search on; when nobody serves, the PLANNED refusal travels, a clean money
 * stop — except on the first position's own call, where a cheaper maker whose transport died hands its
 * ProviderCallFailedError back, so root 0's cooldown holds and retries (RUN_CEILING_BELOW_FIRST_CALL only when every
 * maker refused). Panel seats never move: a seat refused for money is left out, as a failed seat is. The attempt ceiling
 * and a vendor with no usage never move a call either. The production-runner half is in
 * tests/integration/database.test.ts ("B9c …").
 */

type Recorded = { readonly providerRef: string; readonly request: ProviderCallRequest };
type Behaviour = "ANSWERS" | Error;

function maker(providerRef: string, behaviour: Behaviour, calls: Recorded[]): ServeRoleMaker & { readonly maker: string } {
  const provider: ProviderGateway = {
    call: async (request) => {
      calls.push({ providerRef, request });
      if (behaviour instanceof Error) throw behaviour;
      return { rawArtifactRef: `artifact:${providerRef}`, content: "{}" } as unknown as ProviderCallResult;
    }
  };
  return Object.freeze({ provider, providerRef, maker: `maker:${providerRef}` });
}

const money = (code = "RUN_COST_ENVELOPE_MONEY_REACHED") => new TypedDomainError(code, "test-layer: does not fit");

function judgeCall(callSiteKey: string, providerRef = "provider:planned"): ProviderCallRequest {
  return Object.freeze({
    runId: "run:b9c", subjectItemId: "work:b9c", callSiteKey,
    role: "JUDGE" as const, lane: "served" as const,
    bound: Object.freeze({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 }),
    contractHash: "c".repeat(64), providerRef,
    packet: framedFixturePacket("Judge the question")
  });
}

const CHEAP = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
const MIDDLING = Object.freeze({ inputMicrosPerMillionTokens: 3_000_000, outputMicrosPerMillionTokens: 3_000_000 });
const DEAR = Object.freeze({ inputMicrosPerMillionTokens: 9_000_000, outputMicrosPerMillionTokens: 9_000_000 });

describe("B9c · which refusals move a call, and which calls may move", () => {
  it("moves on money only: the run's ceiling, the site's day and a person's window", () => {
    expect(bodyRefusedForMoney(money())).toBe("MONEY");
    expect(bodyRefusedForMoney(money("DAILY_COST_ENVELOPE_REACHED"))).toBe("DAILY");
    expect(bodyRefusedForMoney(money("PERSON_ALLOWANCE_REACHED"))).toBe("ALLOWANCE");
    for (const code of ["RUN_COST_ENVELOPE_EXHAUSTED", "PROVIDER_USAGE_UNREPORTED", "PROVIDER_CALL_FAILED"]) {
      expect(bodyRefusedForMoney(new TypedDomainError(code, "x")), code).toBeNull();
    }
    expect(bodyRefusedForMoney(new TypeError("boom"))).toBeNull();
  });

  it.each([
    ["JUDGE", "JUDGE", "served", true],
    ["JUDGE:root:secondary", "JUDGE", "served", true],
    ["JUDGE:defender:root0:r1:p0", "JUDGE", "served", true],
    ["JUDGE:cross-root:0->1", "JUDGE", "served", true],
    ["JUDGE:review:node-1", "JUDGE", "served", true],
    ["PANEL:root:provider:b", "JUDGE", "served", false],
    ["PANEL:JUDGE:root:secondary:provider:a", "JUDGE", "served", false],
    ["COMPOSER:SYNTHESIZER:INITIAL:1", "SYNTHESIZER", "served", false],
    ["STORY:STORYTELLER:1", "SYNTHESIZER", "story", false]
  ] as const)("%s may move: %s", (callSiteKey, role, lane, expected) => {
    expect(bodyCallMayMove({ callSiteKey, role, lane })).toBe(expected);
  });

  it("records why the planned maker could not be paid", () => {
    expect(substitutionReason("MONEY", "JUDGE")).toBe("RUN_FIRST_CALL");
    expect(substitutionReason("MONEY", "JUDGE:root:secondary")).toBe("RUN_ARGUING");
    expect(substitutionReason("DAILY", "JUDGE:review:node-1")).toBe("SITE_DAY");
    expect(substitutionReason("ALLOWANCE", "JUDGE:critic:root0:r1:p0")).toBe("PERSON");
  });
});

describe("B9c · one call while arguing, with the cost fallback", () => {
  it("sends the SAME request to the cheapest maker that fits; only the provider changes", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", money(), calls);
    const dear = maker("provider:dear", "ANSWERS", calls);
    const cheap = maker("provider:cheap", "ANSWERS", calls);
    const request = judgeCall("JUDGE:root:secondary");
    const outcome = await callBodyRoleWithFallback({
      planned, eligible: [planned, dear, cheap],
      prices: new Map<string, ProviderTargetPrice>([["provider:planned", MIDDLING], ["provider:dear", DEAR], ["provider:cheap", CHEAP]]),
      request
    });
    expect(outcome.servedBy).toBe(cheap);
    expect(outcome.substitution).toEqual({ plannedProviderRef: "provider:planned", reason: "RUN_ARGUING" });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:cheap"]);
    const moved = calls[1]!.request;
    expect(moved.providerRef).toBe("provider:cheap");
    expect(moved.packet).toBe(request.packet);
    expect(moved.callSiteKey).toBe(request.callSiteKey);
    expect(moved.bound).toBe(request.bound);
    expect(moved.contractHash).toBe(request.contractHash);
  });

  it("skips every maker that is refused for money too, and raises the planned refusal when none fits", async () => {
    const calls: Recorded[] = [];
    const refusal = money("DAILY_COST_ENVELOPE_REACHED");
    const planned = maker("provider:planned", refusal, calls);
    const others = [maker("provider:a", money("DAILY_COST_ENVELOPE_REACHED"), calls), maker("provider:b", money(), calls)];
    await expect(callBodyRoleWithFallback({
      planned, eligible: [planned, ...others], prices: new Map(), request: judgeCall("JUDGE:review:node-1")
    })).rejects.toBe(refusal);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:a", "provider:b"]);
  });

  it("never moves a call the attempt ceiling or an unbillable vendor refused", async () => {
    for (const code of ["RUN_COST_ENVELOPE_EXHAUSTED", "PROVIDER_USAGE_UNREPORTED"]) {
      const calls: Recorded[] = [];
      const planned = maker("provider:planned", new TypedDomainError(code, "x"), calls);
      const other = maker("provider:other", "ANSWERS", calls);
      await expect(callBodyRoleWithFallback({
        planned, eligible: [planned, other], prices: new Map(), request: judgeCall("JUDGE:root:secondary")
      })).rejects.toMatchObject({ code });
      expect(calls.map((entry) => entry.providerRef), code).toEqual(["provider:planned"]);
    }
  });

  // The body's version of the serve twin's FINAL REVIEW, Important 1: a cheaper maker asked only because the
  // planned one could not be paid, and that could not serve either, is skipped; a clean money stop stays one.
  const deadTransport = () => new ProviderCallFailedError(new Error("test-layer transport down"), 1, "FAILED", "ledger:b9c:dead");
  const refusedContent = () => new ProviderContentUnacceptedError(1, "SCHEMA_FAILED", "test-layer bad shape", "artifact:b9c", "ledger:b9c:bad");

  it("passes over a cheaper maker whose transport died, and the next one serves", async () => {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", money(), calls);
    const broken = maker("provider:broken", deadTransport(), calls);
    const last = maker("provider:last", "ANSWERS", calls);
    const outcome = await callBodyRoleWithFallback({
      planned, eligible: [planned, broken, last], prices: new Map(), request: judgeCall("JUDGE:root:secondary")
    });
    expect(outcome.servedBy).toBe(last);
    expect(outcome.substitution).toEqual({ plannedProviderRef: "provider:planned", reason: "RUN_ARGUING" });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:broken", "provider:last"]);
  });

  it("raises the PLANNED refusal when every cheaper maker could not serve (dead transport, refused content)", async () => {
    const calls: Recorded[] = [];
    const refusal = money("PERSON_ALLOWANCE_REACHED");
    const planned = maker("provider:planned", refusal, calls);
    const others = [maker("provider:dead", deadTransport(), calls), maker("provider:garbled", refusedContent(), calls)];
    await expect(callBodyRoleWithFallback({
      planned, eligible: [planned, ...others], prices: new Map(), request: judgeCall("JUDGE:review:node-1")
    })).rejects.toBe(refusal);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:dead", "provider:garbled"]);
  });

  // Budget spec §2.9 ("The first call"): RUN_CEILING_BELOW_FIRST_CALL is raised only after every maker REFUSED. A
  // cheaper maker whose transport died did not refuse, so on the first position's own call its transport failure
  // travels instead of the planned refusal, and root 0's cooldown (MAKER_POSITION) holds and retries it.
  it("hands back a cheaper maker's dead transport on the first position's own call, so the cooldown can retry", async () => {
    const calls: Recorded[] = [];
    const refusal = money();
    const died = deadTransport();
    const planned = maker("provider:planned", refusal, calls);
    const broken = maker("provider:broken", died, calls);
    await expect(callBodyRoleWithFallback({
      planned, eligible: [planned, broken], prices: new Map(), request: judgeCall("JUDGE")
    })).rejects.toBe(died);
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:broken"]);
    // Anywhere else the same two failures keep the clean money stop.
    await expect(callBodyRoleWithFallback({
      planned, eligible: [planned, broken], prices: new Map(), request: judgeCall("JUDGE:root:secondary")
    })).rejects.toBe(refusal);
  });

  it("keeps searching past that dead transport on the first call, and keeps the planned refusal when the rest refused", async () => {
    const calls: Recorded[] = [];
    const refusal = money();
    const planned = maker("provider:planned", refusal, calls);
    const broken = maker("provider:broken", deadTransport(), calls);
    const last = maker("provider:last", "ANSWERS", calls);
    const outcome = await callBodyRoleWithFallback({
      planned, eligible: [planned, broken, last], prices: new Map(), request: judgeCall("JUDGE")
    });
    expect(outcome.servedBy).toBe(last);
    expect(outcome.substitution).toEqual({ plannedProviderRef: "provider:planned", reason: "RUN_FIRST_CALL" });
    // Every other maker refused for money or had its content refused: nobody's transport died, so the planned
    // refusal travels and root 0 turns it into RUN_CEILING_BELOW_FIRST_CALL.
    const refusedAll = [maker("provider:poor", money("DAILY_COST_ENVELOPE_REACHED"), calls), maker("provider:garbled", refusedContent(), calls)];
    await expect(callBodyRoleWithFallback({
      planned, eligible: [planned, ...refusedAll], prices: new Map(), request: judgeCall("JUDGE")
    })).rejects.toBe(refusal);
  });

  it("lets any other failure of a cheaper maker travel unchanged, and stops the search there (J24)", async () => {
    for (const failure of [new TypeError("boom"), new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x")]) {
      const calls: Recorded[] = [];
      const planned = maker("provider:planned", money(), calls);
      const odd = maker("provider:odd", failure, calls);
      const last = maker("provider:last", "ANSWERS", calls);
      await expect(callBodyRoleWithFallback({
        planned, eligible: [planned, odd, last], prices: new Map(), request: judgeCall("JUDGE:root:secondary")
      }), failure.message).rejects.toBe(failure);
      expect(calls.map((entry) => entry.providerRef), failure.message).toEqual(["provider:planned", "provider:odd"]);
    }
  });
});

describe("B9c · a panel seat refused for money is left out, as a failed seat is (budget spec, the Panel seats row)", () => {
  const assessment: JudgeAssessment = Object.freeze({
    steelman: { summary: "The strongest test-layer version.", fidelity: 0.8 },
    critic: { summary: "The strongest test-layer objection.", counterargumentStrength: 0.2, basis: "REAL_ATTACK" as const },
    evidence: { quality: 0.7, relevance: 0.9 },
    context: { fit: 0.75, ambiguityFlags: [] },
    fallacy: { severity: 0.1, fatalFlags: [] }
  });
  const panel = (
    firstSeat: Error,
    options: Readonly<{ leaveOutMoneyRefusedSeats?: boolean; onRunLevelSpendStop?: "RETHROW" | "RETURN_HEARD" }>
  ) => runJudgePanel({
    artifactProducerRef: "actor:author",
    primary: { judgementRef: "judgement:author", assessment, memberRole: "author" },
    members: [
      { memberRole: "refused", actorRef: "actor:refused", contractHash: "contract:b9c", judge: async () => { throw firstSeat; } },
      { memberRole: "heard", actorRef: "actor:heard", contractHash: "contract:b9c", judge: async () => ({ judgementRef: "judgement:heard", assessment }) }
    ],
    ...options
  });

  it("notes each money refusal under its own code, never as a vendor fault, and asks the next seat", async () => {
    for (const code of ["RUN_COST_ENVELOPE_MONEY_REACHED", "DAILY_COST_ENVELOPE_REACHED", "PERSON_ALLOWANCE_REACHED"]) {
      const result = await panel(new TypedDomainError(code, "test-layer: does not fit"), { leaveOutMoneyRefusedSeats: true });
      expect(result.notes, code).toEqual([{
        memberRole: "refused", contractHash: "contract:b9c", kind: "MEMBER_FAILED", failureKind: "SPEND_REFUSED", reason: code
      }]);
      expect(result.judgements.map((entry) => entry.judgementRef), code).toEqual(["judgement:author", "judgement:heard"]);
      expect(Object.hasOwn(result, "stoppedBy"), code).toBe(false);
    }
  });

  it("keeps today's rule for the attempt ceiling and a vendor with no usage", async () => {
    for (const code of ["RUN_COST_ENVELOPE_EXHAUSTED", "PROVIDER_USAGE_UNREPORTED"]) {
      const stop = new TypedDomainError(code, "x");
      await expect(panel(stop, { leaveOutMoneyRefusedSeats: true }), code).rejects.toBe(stop);
      const heard = await panel(stop, { leaveOutMoneyRefusedSeats: true, onRunLevelSpendStop: "RETURN_HEARD" });
      expect(heard.stoppedBy, code).toBe(stop);
      expect(heard.judgements.map((entry) => entry.judgementRef), code).toEqual(["judgement:author"]);
    }
  });

  it("changes nothing without the setting: a money refusal still leaves the panel as it arrived", async () => {
    const stop = new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "x");
    await expect(panel(stop, {})).rejects.toBe(stop);
    expect((await panel(stop, { onRunLevelSpendStop: "RETURN_HEARD" })).stoppedBy).toBe(stop);
  });
});

describe("B9c · the per-run gateway a maker's judge is given", () => {
  function harness(plannedBehaviour: Behaviour) {
    const calls: Recorded[] = [];
    const planned = maker("provider:planned", plannedBehaviour, calls);
    const author = maker("provider:author", "ANSWERS", calls);
    const other = maker("provider:other", "ANSWERS", calls);
    const served: string[] = [];
    const moved: BodyCostSubstitutionEvent[] = [];
    const gateway = bodyCostFallbackGateway({
      planned,
      prices: new Map<string, ProviderTargetPrice>([["provider:author", CHEAP], ["provider:other", DEAR]]),
      // What the runner does for a review: the node's actual author is never offered.
      eligibleFor: (request) => request.callSiteKey.startsWith("JUDGE:review:")
        ? [planned, other] : [planned, author, other],
      onServed: (callSiteKey, servedBy) => { served.push(`${callSiteKey}=${servedBy.providerRef}`); },
      onMoved: async (event) => { moved.push(event); }
    });
    return { gateway, calls, served, moved };
  }

  it("never moves a panel seat or an answer-writing call: they go to the planned maker alone", async () => {
    const { gateway, calls, moved } = harness(money());
    await expect(gateway.call(judgeCall("PANEL:root:provider:planned"))).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    await expect(gateway.call({ ...judgeCall("COMPOSER:SYNTHESIZER:INITIAL:1"), role: "SYNTHESIZER" }))
      .rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:planned"]);
    expect(moved).toEqual([]);
  });

  it("moves an authoring call to the cheapest maker and reports who wrote it", async () => {
    const { gateway, served, moved } = harness(money("PERSON_ALLOWANCE_REACHED"));
    await gateway.call(judgeCall("JUDGE:root:secondary"));
    expect(served).toEqual(["JUDGE:root:secondary=provider:author"]);
    expect(moved).toEqual([{
      callSiteKey: "JUDGE:root:secondary",
      plannedProviderRef: "provider:planned",
      usedProviderRef: "provider:author",
      reason: "PERSON"
    }]);
  });

  it("keeps a review off the node's actual author even when that author is the cheapest", async () => {
    const { gateway, calls, moved } = harness(money());
    await gateway.call(judgeCall("JUDGE:review:node-1"));
    expect(calls.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:other"]);
    expect(moved.map((event) => event.usedProviderRef)).toEqual(["provider:other"]);
  });

  it("reports the planned maker as the author when nothing had to move", async () => {
    const { gateway, served, moved } = harness("ANSWERS");
    await gateway.call(judgeCall("JUDGE"));
    expect(served).toEqual(["JUDGE=provider:planned"]);
    expect(moved).toEqual([]);
  });
});

describe("B9c · the shipped runner switches it on only with the new settings", () => {
  it("passes bodyCostFallback only with the band", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const runner = main.slice(main.indexOf("new WalkingSkeletonRunner("));
    expect(runner).toContain("bodyCostFallback: envelopeBand !== null,");
    // Never the wall's own switch, which is on whenever hosted (the person half needs no band).
    expect(runner).not.toContain("bodyCostFallback: sharedWallTerms");
  });

  it("leaves money-refused seats out on every panel, root 0's included, only under that setting", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const call = source.slice(source.indexOf("const panel = await runJudgePanel({"), source.indexOf("const spendStop = Object.hasOwn(panel, \"stoppedBy\")"));
    // M2's mapping for the other stops is untouched (tests/architecture/v28-serve-decision-wiring.test.ts pins it).
    expect(call).toContain("onRunLevelSpendStop: input.onSpendStop === \"AUTHOR_ONLY\" ? \"RETURN_HEARD\" : \"RETHROW\"");
    expect(call).toContain("leaveOutMoneyRefusedSeats: this.settings.bodyCostFallback === true");
  });
});
