/**
 * S1a — B9's money rules on an ASSIGNED run (silent conflict 6): the first
 * position's own call stays exempt from the shared wall, and a moved first call is
 * named as one, under either seat marker; an assigned seat's judge goes through
 * the cheaper-model-while-arguing gateway, built over the STAMPED seat provider;
 * and a panel seat B9c left out for money is disclosed by the scorecard's
 * `panelDegradationOf` exactly as B9c's inline reduction disclosed it.
 */
import { describe, expect, it, vi } from "vitest";
import { Judge } from "@debateai/judgement";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import {
  FIRST_POSITION_CALL_SITE_KEY,
  PANEL_DEGRADED_SINGLE_VOICE_MARK,
  PANEL_PARTIAL_MARK,
  buildAssignedRunSeatBook,
  panelDegradationOf,
  providerCallSharedWall,
  substitutionReason,
  type ConfiguredSeatMaker,
  type RouteHealth
} from "@debateai/runner";

/** A gateway that records every request it is handed, and answers "{}" (a judge refuses that AFTER the call). */
function gateway(label: string, log: ProviderCallRequest[] = []): ProviderGateway {
  return {
    call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
      log.push(request);
      return {
        rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content: "{}",
        provider: "openai-compatible-http", model: `model:${label}`, maker: `maker:${label}`, modelVersion: `model:${label}`
      };
    }
  };
}

/** Each configured route's RAW provider log: a judge built over the raw or the stamped provider writes here. */
const RAW_LOGS = new Map<string, ProviderCallRequest[]>();

function configured(label: string): ConfiguredSeatMaker {
  const log: ProviderCallRequest[] = [];
  RAW_LOGS.set(`provider:${label}`, log);
  const provider = gateway(label, log);
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
}

function candidate(label: string): SeatCandidate {
  return {
    candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`,
    modelId: `model:${label}`, thinkingLevel: "DEFAULT_ONLY"
  };
}

function seat(seatIndex: number, main: string, runnerUp: string | null = null): RoleSeat {
  return {
    seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp),
    diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD"
  };
}

const ASSIGNMENT: RoleAssignment = {
  scorecardVersion: 7,
  strength: "BALANCED",
  roles: {
    POSITION: [seat(0, "a", "c"), seat(1, "b")], SUPPORT_ATTACK: [seat(0, "c")], CROSS_EXCHANGE: [],
    JUDGE: [seat(0, "c")], REVIEWER: [seat(0, "c"), seat(1, "a")],
    ANSWER_WRITER: [seat(0, "a")], ANSWER_CHECKER: [seat(0, "b")]
  }
};
const ROUTES = new Map<string, ConfiguredSeatMaker>(["a", "b", "c"].map((label) => [`provider:${label}`, configured(label)]));
const HEALTHY = new Map<string, RouteHealth>(["a", "b", "c"].map((label) => [`provider:${label}`, { state: "HEALTHY" }]));
const arguing = (callSiteKey: string): Pick<ProviderCallRequest, "role" | "lane" | "callSiteKey"> =>
  Object.freeze({ role: "JUDGE", lane: "served", callSiteKey });

describe("S1a · B9's first-call rules read the key without its seat marker", () => {
  it("keeps the first position's own call exempt from the shared wall on an assigned run", () => {
    expect(FIRST_POSITION_CALL_SITE_KEY).toBe("JUDGE");
    for (const key of ["JUDGE", "JUDGE:seat:main", "JUDGE:seat:runnerUp"]) {
      expect(providerCallSharedWall(arguing(key)), key).toBe("EXEMPT");
    }
    expect(providerCallSharedWall(arguing("JUDGE:root:secondary:seat:main"))).toBe("APPLY");
  });

  it("names a moved first call RUN_FIRST_CALL under either seat marker, and any other moved call RUN_ARGUING", () => {
    expect(substitutionReason("MONEY", "JUDGE:seat:main")).toBe("RUN_FIRST_CALL");
    expect(substitutionReason("MONEY", "JUDGE:seat:runnerUp")).toBe("RUN_FIRST_CALL");
    expect(substitutionReason("MONEY", "JUDGE:root:secondary:seat:main")).toBe("RUN_ARGUING");
    expect(substitutionReason("ALLOWANCE", "JUDGE:seat:main")).toBe("PERSON");
  });
});

describe("S1a · an assigned seat's judge goes through the cheaper-model gateway (B9c)", () => {
  it("builds every member's judge over the gateway `judgeGatewayFor` returns for the STAMPED provider", async () => {
    // One wrapped log per member, keyed by the member's own stamped provider (a route can
    // sit in several roles, so keying by provider ref would overwrite a member's log).
    const wrappedLogs = new Map<ProviderGateway, ProviderCallRequest[]>();
    const judgeGatewayFor = vi.fn((planned: ConfiguredSeatMaker, stamped: ProviderGateway): ProviderGateway => {
      const log: ProviderCallRequest[] = [];
      wrappedLogs.set(stamped, log);
      return gateway(`wrapped:${planned.providerRef}`, log);
    });
    for (const log of RAW_LOGS.values()) log.length = 0;
    const { book } = buildAssignedRunSeatBook({ assignment: ASSIGNMENT, configured: ROUTES, routeHealth: HEALTHY, judgeGatewayFor });
    const members = [book.position[0]!.main, book.position[0]!.runnerUp!, book.position[1]!.main];
    for (const member of members) {
      expect(judgeGatewayFor).toHaveBeenCalledWith(ROUTES.get(member.providerRef), member.provider);
      // The member keeps its stamped provider: the seat caller's switches and the ledger's candidate record are unchanged.
      expect(member.provider).not.toBe(ROUTES.get(member.providerRef)!.provider);
      const log = wrappedLogs.get(member.provider)!;
      const before = log.length;
      // "{}" is refused after the call; only where the call went matters here.
      await member.judge.judge({
        runId: null, subjectItemId: "node:s1a", callSiteKey: "JUDGE:seat:main", questionLine: "S1a question",
        leg: { kind: "primary-root" }, providerRef: member.providerRef, contractHash: "c".repeat(64),
        bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 }
      }).catch(() => undefined);
      expect(log.length, member.providerRef).toBe(before + 1);
    }
    // A memberOf that drops the returned gateway (a judge over the raw or the stamped provider) writes here instead.
    expect([...RAW_LOGS.values()].map((log) => log.length)).toEqual([0, 0, 0]);
  });

  it("without it builds exactly the book the scorecard built", () => {
    const { book } = buildAssignedRunSeatBook({ assignment: ASSIGNMENT, configured: ROUTES, routeHealth: HEALTHY });
    expect(book.position.map((entry) => [entry.main.providerRef, entry.runnerUp?.providerRef ?? null]))
      .toEqual([["provider:a", "provider:c"], ["provider:b", null]]);
  });
});

type PanelNotes = Parameters<typeof panelDegradationOf>[1];
/** B9c's note for a seat left out for money: MEMBER_FAILED, SPEND_REFUSED, the stop's code as the reason. */
const leftOut = (memberRole: string, reason: string) => ({
  memberRole, contractHash: "contract:s1a", kind: "MEMBER_FAILED", failureKind: "SPEND_REFUSED", reason
} as const);
const timedOut = { memberRole: "maker:b", contractHash: "contract:s1a", kind: "MEMBER_FAILED", failureKind: "TIMEOUT", reason: "TIMEOUT" } as const;
const answeredByAuthor = {
  memberRole: "maker:d", answeringMemberRole: "maker:a", contractHash: "contract:s1a",
  kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6"
} as const;

describe("S1a · a panel seat left out for money is disclosed as B9c words it (budget spec §2.9, the Panel seats row)", () => {
  it("names every other lost seat as the scorecard does, then the stop's code once, then the panel's own stop", () => {
    const notes = [
      leftOut("maker:a", "DAILY_COST_ENVELOPE_REACHED"), timedOut, answeredByAuthor, leftOut("maker:c", "DAILY_COST_ENVELOPE_REACHED")
    ] satisfies PanelNotes;
    expect(panelDegradationOf(1, notes)).toEqual({
      marks: [PANEL_PARTIAL_MARK],
      panelFailureReason: "maker:b: TIMEOUT; maker:d: PRODUCER_GRADING_FORBIDDEN (answered by maker:a); DAILY_COST_ENVELOPE_REACHED"
    });
    expect(panelDegradationOf(1, notes, "ATTEMPTS").panelFailureReason)
      .toBe("maker:b: TIMEOUT; maker:d: PRODUCER_GRADING_FORBIDDEN (answered by maker:a); DAILY_COST_ENVELOPE_REACHED; RUN_COST_ENVELOPE_EXHAUSTED");
  });

  it("never writes a seat left out for money as a member's own failure (`<maker>: SPEND_REFUSED`)", () => {
    const reason = panelDegradationOf(1, [leftOut("maker:a", "PERSON_ALLOWANCE_REACHED")] satisfies PanelNotes).panelFailureReason;
    expect(reason).toBe("PERSON_ALLOWANCE_REACHED");
    expect(reason).not.toContain("SPEND_REFUSED");
  });

  it("counts a seat left out for money as a lost voice: PANEL-PARTIAL with a voice heard, the single-voice mark without", () => {
    const notes = [leftOut("maker:a", "RUN_COST_ENVELOPE_MONEY_REACHED")] satisfies PanelNotes;
    expect(panelDegradationOf(1, notes).marks).toEqual([PANEL_PARTIAL_MARK]);
    expect(panelDegradationOf(0, notes).marks).toEqual([PANEL_DEGRADED_SINGLE_VOICE_MARK]);
  });
});
