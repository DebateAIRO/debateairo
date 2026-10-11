// Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (d); rulings R-a, R-b):
// the per-run sit-out book, driven alone. The whole run is driven through the REAL runner by
// tests/integration/preview-busy-model-run.test.ts (T1, T2); this file pins the book's own rules: a call ending in
// gate-proven unbilled refusals makes the MODEL sit out on every ref, an unavailable gate makes every member behind it
// sit out, a member that sits out is refused before anything is sent, and nothing else changes the book.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  PROVIDER_GATE_UNAVAILABLE,
  ProviderCallFailedError,
  PreviewUnbilledRefusal,
  previewRunResilience,
  type PreviewProviderTestConfig,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  MAKER_SAT_OUT,
  createRunSitOutBook,
  runPanelRevisedReason,
  runSitOutHaltsAtOnce
} from "../../apps/runner/src/run-sit-out.js";
import {
  buildMakerPositionDisclosure,
  callServeRoleWithFallback,
  servePhaseFallbackOrder,
  withCooldownRetry,
  type HoldProgressEvent,
  type ServeRoleMaker
} from "../../apps/runner/src/index.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM_A = "preview:fixture-a";
const GLM_B = "preview:fixture-b";
const QWEN = "preview:qwen-3-8-flash";
const DEEPSEEK = "preview:deepseek-v4-1-flash";
const HAIKU = "preview:claude-haiku-5-5";
/** The preview's own facts about the reviewed refs (main.ts composes the book from the same helper). */
const SETTINGS = previewRunResilience({ deployment: "v3-preview" } as unknown as PreviewProviderTestConfig)!;

const request = { callSiteKey: "JUDGE" } as unknown as ProviderCallRequest;
const answered = { content: "{}" } as unknown as ProviderCallResult;
/** A failure as the counting gateway throws it: PROVIDER_CALL_FAILED with the last attempt's error as its cause. */
const failed = (cause: unknown, ledgerEntryRef = "ledger:failure"): ProviderCallFailedError =>
  new ProviderCallFailedError(cause, 1, "FAILED", ledgerEntryRef);
const unbilled = (ref = "ledger:refused") => failed(new PreviewUnbilledRefusal(), ref);
const gateClosed = (ref = "ledger:gate") => failed(new TypedDomainError(PROVIDER_GATE_UNAVAILABLE, "halted"), ref);
const billed = () => failed(new Error("connection reset"));

/** A gateway that answers `outcomes` in turn (an Error is thrown) and counts the calls it was asked. */
function scripted(outcomes: Array<Error | "OK">): ProviderGateway & { calls: number } {
  const gateway = {
    calls: 0,
    call: async () => {
      gateway.calls += 1;
      const next = outcomes.shift() ?? "OK";
      if (next instanceof Error) throw next;
      return answered;
    }
  };
  return gateway;
}

describe("the run's sit-out book (fix (d), R-a)", () => {
  it("knows the preview's gates and models", () => {
    expect(SETTINGS.gateOf(GLM_A)).toBe("deepinfra");
    expect(SETTINGS.gateOf(HAIKU)).toBe("anthropic");
    expect(SETTINGS.modelOf(GLM_A)).toBe(SETTINGS.modelOf(GLM_B));
    expect(previewRunResilience(undefined)).toBeUndefined();
  });

  it("one call ending in unbilled refusals makes the MODEL sit out, on every ref that serves it", async () => {
    const book = createRunSitOutBook(SETTINGS);
    const glm = scripted([unbilled()]);
    await expect(book.gateway(GLM_A, glm).call(request)).rejects.toBeInstanceOf(ProviderCallFailedError);
    expect(book.sitsOut(GLM_A)).toBe(true);
    expect(book.sitsOut(GLM_B)).toBe(true);
    expect(book.reasonOf(GLM_A)).toBe("PROVIDER_BUSY");
    // Another model behind the same gate is still asked.
    expect(book.sitsOut(QWEN)).toBe(false);
    expect(book.reasonOf(QWEN)).toBeNull();
  });

  it("a member that sits out is refused before anything is sent, citing the row that made it sit out", async () => {
    const book = createRunSitOutBook(SETTINGS);
    await book.gateway(GLM_A, scripted([unbilled("ledger:glm-refused")])).call(request).catch(() => undefined);
    const second = scripted(["OK"]);
    const refusal: unknown = await book.gateway(GLM_B, second).call(request).then(() => null, (error: unknown) => error);
    expect(second.calls).toBe(0);
    expect(refusal).toBeInstanceOf(ProviderCallFailedError);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", attempts: 0, lastOutcome: "FAILED",
      lastLedgerEntryRef: "ledger:glm-refused", cause: { code: MAKER_SAT_OUT } });
    expect(runSitOutHaltsAtOnce(refusal)).toBe(true);
  });

  it("an unavailable gate makes every member behind it sit out, and only those", async () => {
    const book = createRunSitOutBook(SETTINGS);
    await book.gateway(DEEPSEEK, scripted([gateClosed()])).call(request).catch(() => undefined);
    for (const ref of [GLM_A, GLM_B, QWEN, DEEPSEEK]) {
      expect(book.sitsOut(ref)).toBe(true);
      expect(book.reasonOf(ref)).toBe("PROVIDER_GATE_UNAVAILABLE");
    }
    expect(book.sitsOut(HAIKU)).toBe(false);
  });

  it("a member's reason is the first that applied to it", async () => {
    const book = createRunSitOutBook(SETTINGS);
    await book.gateway(GLM_A, scripted([unbilled()])).call(request).catch(() => undefined);
    await book.gateway(QWEN, scripted([gateClosed()])).call(request).catch(() => undefined);
    expect(book.reasonOf(GLM_A)).toBe("PROVIDER_BUSY");
    expect(book.reasonOf(QWEN)).toBe("PROVIDER_GATE_UNAVAILABLE");
    expect(runPanelRevisedReason(book, [DEEPSEEK, GLM_A, HAIKU, QWEN, GLM_A]))
      .toBe(`RUN_PANEL_REVISED:${DEEPSEEK}=PROVIDER_GATE_UNAVAILABLE,${GLM_A}=PROVIDER_BUSY,${QWEN}=PROVIDER_GATE_UNAVAILABLE`);
  });

  it("a billed failure, an answer, or a refusal that is not the transport's leaves the book as it was", async () => {
    const book = createRunSitOutBook(SETTINGS);
    await book.gateway(GLM_A, scripted([billed()])).call(request).catch(() => undefined);
    await book.gateway(GLM_A, scripted(["OK"])).call(request);
    // A bare unbilled refusal (never what the counting gateway throws) cites no ledger row, so it marks nothing.
    await book.gateway(GLM_A, scripted([new PreviewUnbilledRefusal()])).call(request).catch(() => undefined);
    await book.gateway(GLM_A, scripted([new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money")])).call(request)
      .catch(() => undefined);
    expect(book.sitsOut(GLM_A)).toBe(false);
    expect(runPanelRevisedReason(book, [GLM_A, QWEN])).toBeNull();
    expect(runPanelRevisedReason(null, [GLM_A])).toBeNull();
  });

  it("the cooldown halts at once only for the failures that make a member sit out", () => {
    expect(runSitOutHaltsAtOnce(unbilled())).toBe(true);
    expect(runSitOutHaltsAtOnce(gateClosed())).toBe(true);
    expect(runSitOutHaltsAtOnce(billed())).toBe(false);
    expect(runSitOutHaltsAtOnce(new TypedDomainError(MAKER_SAT_OUT, "bare"))).toBe(false);
  });
});

/** Serve-role makers for the fallback, in claim-eligible (local: roster) order; each records whether it was asked. */
function makers(refs: readonly string[], book: ReturnType<typeof createRunSitOutBook>, script: Record<string, Error>) {
  const asked: string[] = [];
  const list: ServeRoleMaker[] = refs.map((providerRef) => ({
    providerRef,
    provider: book.gateway(providerRef, { call: async () => {
      asked.push(providerRef);
      const failure = script[providerRef];
      if (failure !== undefined) throw failure;
      return answered;
    } })
  }));
  return { list, asked };
}
const serveRequest = {
  runId: "run:synthetic", subjectItemId: "item:synthetic", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1",
  role: "SYNTHESIZER", lane: "served", bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 },
  contractHash: "contract:synthetic", providerRef: GLM_A, packet: framedFixturePacket("Synthetic question; no personal data.")
} as unknown as ProviderCallRequest;
const MIMO = "preview:mimo-v2-6-pro";

describe("the serve fallback with the sit-out book (fix (a))", () => {
  it("a planned member that sits out moves on (ROLE_UNAVAILABLE), skipping members that sit out, another gate first", async () => {
    const book = createRunSitOutBook(SETTINGS);
    const { list, asked } = makers([GLM_A, DEEPSEEK, MIMO, QWEN, HAIKU], book, { [GLM_A]: unbilled(), [QWEN]: unbilled() });
    await list[3]!.provider.call(request).catch(() => undefined); // Qwen sat out earlier in the run.
    asked.length = 0;
    const outcome = await callServeRoleWithFallback({
      planned: list[0]!, claimEligible: list, prices: new Map(), preferNot: DEEPSEEK, request: serveRequest, sitOut: book,
      call: (maker, sent) => maker.provider.call(sent)
    });
    // GLM was asked once and is now busy; Haiku (another gate) serves before DeepSeek and MiMo; Qwen never asked.
    expect(asked).toEqual([GLM_A, HAIKU]);
    expect(outcome).toMatchObject({ fallback: true, movedFor: "ROLE_UNAVAILABLE" });
    expect(outcome.servedBy.providerRef).toBe(HAIKU);
  });

  it("a gate that halts mid-search: every member behind it is skipped, and nobody left sends the planned refusal back", async () => {
    const book = createRunSitOutBook(SETTINGS);
    const { list, asked } = makers([GLM_A, DEEPSEEK, MIMO], book, { [GLM_A]: unbilled(), [DEEPSEEK]: gateClosed() });
    const refusal: unknown = await callServeRoleWithFallback({
      planned: list[0]!, claimEligible: list, prices: new Map(), preferNot: null, request: serveRequest, sitOut: book,
      call: (maker, sent) => maker.provider.call(sent)
    }).then(() => null, (error: unknown) => error);
    expect(asked).toEqual([GLM_A, DEEPSEEK]);
    expect(refusal).toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: expect.any(PreviewUnbilledRefusal) });
    // Never CALL_BUDGET_EXHAUSTED: the search ended because nobody was left, not because an allowance was spent.
  });

  it("T5: without the book, and with the book but nobody sitting out, the order and the outcome are today's", async () => {
    const book = createRunSitOutBook(SETTINGS);
    const { list } = makers([GLM_A, DEEPSEEK, MIMO, HAIKU], book, {});
    const today = servePhaseFallbackOrder({ planned: GLM_A, claimEligible: list, prices: new Map(), request: serveRequest, preferNot: DEEPSEEK });
    expect(today.map((maker) => maker.providerRef)).toEqual([MIMO, HAIKU, DEEPSEEK]);
    expect(servePhaseFallbackOrder({
      planned: GLM_A, claimEligible: list, prices: new Map(), request: serveRequest, preferNot: DEEPSEEK, sitOut: book, avoidGate: null
    })).toEqual(today);
    const billedFailure = billed();
    const { list: failing } = makers([GLM_A, DEEPSEEK], book, { [GLM_A]: billedFailure });
    // A billed failure of the planned member is not money and nobody sits out: it travels, exactly as today.
    await expect(callServeRoleWithFallback({
      planned: failing[0]!, claimEligible: failing, prices: new Map(), preferNot: null, request: serveRequest, sitOut: book,
      call: (maker, sent) => maker.provider.call(sent)
    })).rejects.toBe(billedFailure);
    const served = await callServeRoleWithFallback({
      planned: list[1]!, claimEligible: list, prices: new Map(), preferNot: null, request: serveRequest,
      call: (maker, sent) => maker.provider.call(sent)
    });
    expect(served).toMatchObject({ fallback: false, movedFor: null });
  });
});

describe("withCooldownRetry's haltsAtOnce (ruling R-a)", () => {
  const policy = Object.freeze({ cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 });
  const recorder = () => {
    const events: HoldProgressEvent[] = [];
    const waits: number[] = [];
    return { events, waits, hold: {
      countCooldownHolds: async () => events.filter((event) => event.state === "COOLDOWN_HOLD").length,
      record: async (event: HoldProgressEvent) => { events.push(event); },
      wait: async (milliseconds: number) => { waits.push(milliseconds); }
    } };
  };
  const site = { runId: "run:synthetic", callSiteKey: "JUDGE:root:4", parentNodeId: null, plannedLegCount: 1,
    baseMaxAttempts: 3, failureScope: "MAKER_POSITION" as const, policy };

  it("an unbilled-only failure halts at once: no ten-minute hold, no final retry", async () => {
    const { events, waits, hold } = recorder();
    let attempts = 0;
    const result = await withCooldownRetry({ ...site, hold, haltsAtOnce: runSitOutHaltsAtOnce,
      attempt: async () => { attempts += 1; throw unbilled("ledger:busy"); } });
    expect(result).toMatchObject({ kind: "HALTED", record: { lastLedgerEntryRef: "ledger:busy", terminalTransportOutcome: "FAILED" } });
    expect(attempts).toBe(1);
    expect(waits).toEqual([]);
    expect(events.map((event) => event.state)).toEqual(["MAKER_POSITION_HALTED"]);
  });

  it("a billed failure keeps the hold and the final retry; so does every failure without the option", async () => {
    for (const [failure, haltsAtOnce] of [[billed(), runSitOutHaltsAtOnce], [unbilled(), undefined]] as const) {
      const { events, waits, hold } = recorder();
      let attempts = 0;
      const result = await withCooldownRetry({ ...site, hold, ...(haltsAtOnce === undefined ? {} : { haltsAtOnce }),
        attempt: async () => { attempts += 1; if (attempts === 1) throw failure; return "authored"; } });
      expect(result).toEqual({ kind: "AUTHORED", value: "authored" });
      expect(waits).toEqual([policy.cooldownMs]);
      expect(events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    }
  });
});

describe("the answer's disclosure when too few members were left to argue (fix (d), R-b)", () => {
  const root = Object.freeze({ nodeId: "node:root-0", maker: "DeepSeek" });
  const base = { effectiveMakerCount: 5, runBodyBudgetStop: null, authoredMakerPositions: [root], servedRoot: root,
    monoMakerConditionMarks: [], monoMakerRecords: [] };
  it("one authored root: SINGLE-LINEAGE naming the members that sat out, never money", () => {
    const reason = `RUN_PANEL_REVISED:${GLM_A}=PROVIDER_BUSY,${QWEN}=PROVIDER_GATE_UNAVAILABLE`;
    expect(buildMakerPositionDisclosure({ ...base, membersSatOut: reason })).toEqual({
      conditionMarks: ["SINGLE-LINEAGE"],
      records: [{ mark: "SINGLE-LINEAGE", scope: "answer", subjectRef: root.nodeId, reason,
        liftPath: "RESTORE_PINNED_PROVIDER_AND_RUN_AGAIN", servedRootRule: null, affectedNodeIds: [root.nodeId] }]
    });
  });
  it("T5: without it the state is still refused as unreachable, exactly as before", () => {
    expect(() => buildMakerPositionDisclosure(base)).toThrow(expect.objectContaining({ code: "MAKER_POSITION_DISCLOSURE_UNRESOLVED" }));
  });
});
