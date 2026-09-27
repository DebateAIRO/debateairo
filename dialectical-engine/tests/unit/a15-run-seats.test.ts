import { describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import type { DebateRole } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import { framedFixturePacket } from "../support/framed-packet.js";
import {
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  legacySynthesisSeat,
  roleAssignmentSeatProblem,
  stampCandidateGateway,
  type ConfiguredSeatMaker,
  type RouteHealth,
  type SeatMember,
  type SeatPlanOptions
} from "@debateai/runner";

const BOUND = { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 } as const;

function recordingGateway(label: string, requests: ProviderCallRequest[] = []): ProviderGateway {
  return {
    call: async (request): Promise<ProviderCallResult> => {
      requests.push(request);
      return {
        rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content: "{}",
        provider: "openai-compatible-http", model: `model:${label}`, maker: `maker:${label}`, modelVersion: `model:${label}`
      };
    }
  };
}

function configured(label: string, requests: ProviderCallRequest[] = []): ConfiguredSeatMaker {
  const provider = recordingGateway(label, requests);
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
}

function candidate(label: string, thinkingLevel = "DEFAULT_ONLY"): SeatCandidate {
  return {
    candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`,
    modelId: `model:${label}`, thinkingLevel
  };
}

function seat(seatIndex: number, main: string, runnerUp: string | null = null): RoleSeat {
  return {
    seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp),
    // RoleAssignmentSchema's law: no runner-up, no share (pre-flight fix F2).
    diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD"
  };
}

function assignment(roles: Partial<Record<DebateRole, readonly RoleSeat[]>>): RoleAssignment {
  return {
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: {
      POSITION: [], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [], JUDGE: [], REVIEWER: [],
      ANSWER_WRITER: [seat(0, "a")], ANSWER_CHECKER: [seat(0, "b")],
      ...roles
    }
  };
}

function routes(...labels: string[]): ReadonlyMap<string, ConfiguredSeatMaker> {
  return new Map<string, ConfiguredSeatMaker>(labels.map((label) => [`provider:${label}`, configured(label)]));
}

function health(entries: Readonly<Record<string, string>>): ReadonlyMap<string, RouteHealth> {
  return new Map<string, RouteHealth>(Object.entries(entries).map(([label, state]) => [
    `provider:${label}`,
    state === "HEALTHY" ? { state: "HEALTHY" } : { state: "ABSENT", failureCode: state }
  ]));
}

describe("A15 · the legacy book is today's rule, byte for byte", () => {
  it("seats every debater in every multi-seat role, in pinned order, with no runner-up", () => {
    const book = buildLegacyRunSeatBook([configured("a"), configured("b")]);
    expect(book.assigned).toBe(false);
    for (const seats of [book.position, book.supportAttack, book.crossExchange, book.judge, book.reviewer]) {
      expect(seats.map((entry) => [entry.seatIndex, entry.main.providerRef, entry.runnerUp, entry.main.pinnedAs]))
        .toEqual([[0, "provider:a", null, "MAIN"], [1, "provider:b", null, "MAIN"]]);
    }
    expect(book.answerWriter).toBeNull();
    expect(book.answerChecker).toBeNull();
    expect(legacySynthesisSeat("ANSWER_WRITER", configured("a"))).toMatchObject({
      role: "ANSWER_WRITER", seatIndex: 0, runnerUp: null, main: { providerRef: "provider:a", candidate: null }
    });
  });
});

describe("A15 · an assigned book comes from the pinned assignment", () => {
  it("seats each role from its own seats and stamps every call with the candidate", async () => {
    const requests: ProviderCallRequest[] = [];
    const configuredRoutes = new Map<string, ConfiguredSeatMaker>([
      ["provider:a", configured("a", requests)], ["provider:b", configured("b")], ["provider:c", configured("c")]
    ]);
    const { book, claimSwitches, droppedPositionSeats, unavailableSynthesis } = buildAssignedRunSeatBook({
      assignment: assignment({
        POSITION: [{ ...seat(0, "a", "c"), main: candidate("a", "high") }, seat(1, "b")],
        SUPPORT_ATTACK: [seat(0, "c")],
        JUDGE: [seat(0, "c")],
        REVIEWER: [seat(0, "c"), seat(1, "a")]
      }),
      configured: configuredRoutes,
      routeHealth: health({ a: "HEALTHY", b: "HEALTHY", c: "HEALTHY" })
    });
    expect(book.assigned).toBe(true);
    expect(book.scorecardVersion).toBe(7);
    expect(book.position.map((entry) => [entry.main.providerRef, entry.runnerUp?.providerRef ?? null]))
      .toEqual([["provider:a", "provider:c"], ["provider:b", null]]);
    expect(book.supportAttack.map((entry) => entry.main.providerRef)).toEqual(["provider:c"]);
    expect(book.judge.map((entry) => entry.main.providerRef)).toEqual(["provider:c"]);
    expect(book.reviewer.map((entry) => entry.main.providerRef)).toEqual(["provider:c", "provider:a"]);
    expect(book.answerWriter?.main.providerRef).toBe("provider:a");
    expect(book.answerChecker?.main.providerRef).toBe("provider:b");
    expect([claimSwitches, droppedPositionSeats, unavailableSynthesis]).toEqual([[], [], []]);

    await book.position[0]!.main.provider.call({
      runId: null, subjectItemId: "work:a15", callSiteKey: "JUDGE:seat:main", role: "JUDGE", lane: "served",
      // A framed fixture packet, never a hand-built one (packet-read-through-the-frame; pre-flight fix F6).
      bound: BOUND, contractHash: "c".repeat(64), providerRef: "provider:a", packet: framedFixturePacket("a15")
    });
    expect(requests.map(({ thinkingLevel, candidateId, scorecardVersion }) => ({ thinkingLevel, candidateId, scorecardVersion })))
      .toEqual([{ thinkingLevel: "high", candidateId: "candidate:a", scorecardVersion: 7 }]);
  });

  it("promotes a runner-up when the main is absent at claim, and records the switch", () => {
    const { book, claimSwitches } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a", "c"), seat(1, "b")] }),
      configured: routes("a", "b", "c"),
      routeHealth: health({ a: "CLAIM_PROVIDER_ABSENT", b: "HEALTHY", c: "HEALTHY" })
    });
    expect(book.position.map((entry) => [entry.main.providerRef, entry.main.pinnedAs, entry.runnerUp]))
      .toEqual([["provider:c", "RUNNER_UP", null], ["provider:b", "MAIN", null]]);
    expect(claimSwitches).toEqual([{
      role: "POSITION", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
      toProviderRef: "provider:c", toCandidateId: "candidate:c", cause: "ABSENT_AT_CLAIM", callSiteKey: null
    }]);
  });

  it("drops and compacts a POSITION seat with neither candidate claim-eligible", () => {
    const { book, droppedPositionSeats } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a", "c"), seat(1, "b")] }),
      configured: routes("a", "b"),
      routeHealth: health({ a: "CLAIM_MODEL_IDENTITY_CHANGED", b: "HEALTHY" })
    });
    expect(book.position.map((entry) => [entry.seatIndex, entry.pinnedSeatIndex, entry.main.providerRef]))
      .toEqual([[0, 1, "provider:b"]]);
    expect(droppedPositionSeats).toEqual([{ candidate: candidate("a"), failureCode: "CLAIM_MODEL_IDENTITY_CHANGED" }]);
  });

  it("refuses to promote a runner-up whose maker another debater already has (R5)", () => {
    const { book, claimSwitches, droppedPositionSeats } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a", "b"), seat(1, "b")] }),
      configured: routes("a", "b"),
      routeHealth: health({ a: "CLAIM_PROVIDER_ABSENT", b: "HEALTHY" })
    });
    expect(book.position.map((entry) => entry.main.providerRef)).toEqual(["provider:b"]);
    expect(claimSwitches).toEqual([]);
    expect(droppedPositionSeats.map((entry) => entry.failureCode)).toEqual(["CLAIM_PROVIDER_ABSENT"]);
  });

  it("leaves a FALLBACK synthesis seat to the sealed register refs, as today (pre-flight ruling F18)", () => {
    // A FALLBACK seat names no candidate and no runner-up (RoleAssignmentSchema).
    const fallback = (label: string): RoleSeat => ({ ...seat(0, label), main: { ...candidate(label), candidateId: null }, source: "FALLBACK" });
    const { book, unavailableSynthesis } = buildAssignedRunSeatBook({
      assignment: assignment({
        POSITION: [seat(0, "a"), seat(1, "b")], ANSWER_WRITER: [fallback("a")], ANSWER_CHECKER: [fallback("x")]
      }),
      configured: routes("a", "b"),
      routeHealth: health({ a: "HEALTHY", b: "HEALTHY" })
    });
    // Null is the legacy book's value: the runner then resolves the sealed role ref (J8), as today.
    expect(book.answerWriter).toBeNull();
    expect(book.answerChecker).toBeNull();
    expect(unavailableSynthesis).toEqual([]);
  });

  it("keeps today's rule for a role the assignment left without a seat", () => {
    const { book } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a"), seat(1, "b")] }),
      configured: routes("a", "b"),
      routeHealth: health({ a: "HEALTHY", b: "HEALTHY" })
    });
    for (const [seats, role] of [
      [book.supportAttack, "SUPPORT_ATTACK"], [book.judge, "JUDGE"], [book.reviewer, "REVIEWER"]
    ] as const) {
      expect(seats.map((entry) => [entry.role, entry.main.providerRef])).toEqual([[role, "provider:a"], [role, "provider:b"]]);
    }
    expect(book.crossExchange).toEqual([]);
  });

  it("names an unconfigured route and an unprobed one as absent, and reports an unseatable synthesis role", () => {
    const { unavailableSynthesis } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a")], ANSWER_WRITER: [seat(0, "x")], ANSWER_CHECKER: [seat(0, "b")] }),
      configured: routes("a", "b"),
      routeHealth: health({ a: "HEALTHY" })
    });
    expect(unavailableSynthesis).toEqual([
      { role: "ANSWER_WRITER", candidate: candidate("x"), failureCode: "CLAIM_GATEWAY_UNRESOLVED" },
      { role: "ANSWER_CHECKER", candidate: candidate("b"), failureCode: "CLAIM_PROVIDER_ABSENT" }
    ]);
  });

  it("says why an assignment cannot seat a debate", () => {
    expect(roleAssignmentSeatProblem(assignment({ POSITION: [seat(0, "a")] }))).toBeNull();
    expect(roleAssignmentSeatProblem(assignment({}))).toBe("POSITION has no seat");
    expect(roleAssignmentSeatProblem(assignment({ POSITION: [seat(0, "a")], ANSWER_WRITER: [] })))
      .toBe("ANSWER_WRITER needs exactly one seat, not 0");
    expect(roleAssignmentSeatProblem(assignment({ POSITION: [seat(0, "a")], ANSWER_CHECKER: [seat(0, "b"), seat(1, "c")] })))
      .toBe("ANSWER_CHECKER needs exactly one seat, not 2");
  });
});

describe("A15 · the seat caller", () => {
  const assignedBook = () => buildAssignedRunSeatBook({
    assignment: assignment({ POSITION: [seat(0, "a", "c"), seat(1, "b")], JUDGE: [seat(0, "a", "c")] }),
    configured: routes("a", "b", "c"),
    routeHealth: health({ a: "HEALTHY", b: "HEALTHY", c: "HEALTHY" })
  }).book;

  it("marks an assigned run's keys with the seat that answered", async () => {
    const book = assignedBook();
    const caller = createSeatCaller({ assigned: true });
    const answer = await caller.callSeat({
      seat: book.position[0]!, callSiteKey: "JUDGE",
      call: async (member, callSiteKey) => `${member.providerRef}@${callSiteKey}`
    });
    expect(answer).toMatchObject({ value: "provider:a@JUDGE:seat:main", callSiteKey: "JUDGE:seat:main" });
    expect(caller.answered("POSITION")).toEqual(["provider:a"]);
  });

  it("lets a fairness rule hand the call to the runner-up, whose key says so", async () => {
    const book = assignedBook();
    const caller = createSeatCaller({ assigned: true });
    const notA = (member: { readonly providerRef: string }) => member.providerRef !== "provider:a";
    expect(caller.plan(book.judge[0]!, "PANEL:root", { eligible: notA })?.providerRef).toBe("provider:c");
    const answer = await caller.callSeat({
      seat: book.judge[0]!, callSiteKey: "PANEL:root", eligible: notA,
      keyFor: (member) => `PANEL:root:${member.providerRef}`,
      call: async (_member, callSiteKey) => callSiteKey
    });
    expect(answer.value).toBe("PANEL:root:provider:c:seat:runnerUp");
    expect(caller.plan(book.judge[0]!, "PANEL:root", { eligible: () => false })).toBeNull();
    await expect(caller.callSeat({
      seat: book.judge[0]!, callSiteKey: "PANEL:root", eligible: () => false, call: async () => "never"
    })).rejects.toMatchObject({ code: "DEBATE_MAKER_UNRESOLVED" });
  });

  it("records bare keys on the legacy book", async () => {
    const book = buildLegacyRunSeatBook([configured("a")]);
    const answer = await createSeatCaller({ assigned: false }).callSeat({
      seat: book.position[0]!, callSiteKey: "JUDGE", call: async (_member, callSiteKey) => callSiteKey
    });
    expect(answer.value).toBe("JUDGE");
  });
});

describe("A15 · controller rulings A13 and A14", () => {
  it("keeps the debate role, and every other field, on a stamped request (A13)", async () => {
    const requests: ProviderCallRequest[] = [];
    const stamped = stampCandidateGateway(recordingGateway("a", requests), candidate("a", "high"), 7);
    const request: ProviderCallRequest = {
      runId: "run:a15", subjectItemId: "work:a15", callSiteKey: "PANEL:root:seat:main", role: "JUDGE", lane: "served",
      bound: BOUND, contractHash: "c".repeat(64), providerRef: "provider:a", packet: framedFixturePacket("a15"),
      modelRole: "REVIEWER", thinkingLevel: "DEFAULT_ONLY", candidateId: "candidate:stale", scorecardVersion: 1
    };
    await stamped.call(request);
    // The candidate's three fields replace the caller's; nothing else moves, the debate role least of all.
    expect(requests).toEqual([{ ...request, thinkingLevel: "high", candidateId: "candidate:a", scorecardVersion: 7 }]);
    expect(requests[0]!.modelRole).toBe("REVIEWER");
  });

  it("chooses the member and the key from the call site alone, so a resumed pass repeats them (A14)", async () => {
    const { book } = buildAssignedRunSeatBook({
      assignment: assignment({ POSITION: [seat(0, "a", "c"), seat(1, "b")], JUDGE: [seat(0, "a", "c")] }),
      configured: routes("a", "b", "c"),
      routeHealth: health({ a: "HEALTHY", b: "HEALTHY", c: "HEALTHY" })
    });
    const judgeSeat = book.judge[0]!;
    const notA = (member: SeatMember): boolean => member.providerRef !== "provider:a";
    const sites = ["PANEL:root", "PANEL:n1", "PANEL:n2", "PANEL:n3", "PANEL:n4", "PANEL:n5"];
    // The first pass has already made calls on this seat, in one visit order...
    const firstPass = createSeatCaller({ assigned: true });
    for (const callSiteKey of sites) {
      await firstPass.callSeat({ seat: judgeSeat, callSiteKey, call: async () => null });
    }
    // ...and a resumed pass is a FRESH caller that visits the sites in another order.
    const resumed = createSeatCaller({ assigned: true });
    const keyed = async (caller: ReturnType<typeof createSeatCaller>, callSiteKey: string, options: SeatPlanOptions) =>
      (await caller.callSeat({
        seat: judgeSeat, callSiteKey, ...options, call: async (member, key) => `${member.providerRef}@${key}`
      })).value;
    for (const callSiteKey of [...sites].reverse()) {
      for (const options of [{}, { eligible: notA }] satisfies SeatPlanOptions[]) {
        expect(resumed.plan(judgeSeat, callSiteKey, options)).toBe(firstPass.plan(judgeSeat, callSiteKey, options));
        expect(await keyed(resumed, callSiteKey, options)).toBe(await keyed(firstPass, callSiteKey, options));
      }
      // No visit counter: however many calls came before, the main is asked first, the runner-up only when barred.
      expect(await keyed(resumed, callSiteKey, {})).toBe(`provider:a@${callSiteKey}:seat:main`);
      expect(await keyed(resumed, callSiteKey, { eligible: notA })).toBe(`provider:c@${callSiteKey}:seat:runnerUp`);
    }
  });
});
