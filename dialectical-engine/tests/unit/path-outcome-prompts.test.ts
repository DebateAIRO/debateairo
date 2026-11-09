// tests/unit/path-outcome-prompts.test.ts
// V4 start step, Task 49 (spec 2026-11-03 §4.3, §6 item 6): each path's answer so far, written as soon as its own checks end.
// Pinned here: the two drafted contracts (awaiting the owners' wording, unsealed), their call sites and roles, code's checks of a
// reply, and the money rule: a PATH_OUTCOME: call draws on the debate's (BODY) attempts, so the answer's reserve stays whole, and it
// is never walled (answer writing). The reserve is proved through the runner's gateway over a pool double, as
// money-serve-reserve's `gatewayOver` builds it (copied here: that file stays unmodified). Data is made up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { attemptCeilingForPhase, parseCostEnvelopeBasis, type CostEnvelopePhase } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCostEnvelopeSeam } from "@debateai/providers";
import {
  PATH_OUTCOME_CALL_SITE, PATH_OUTCOME_CALL_SITE_PREFIX, PATH_OUTCOME_CHECKER_CONTRACT_ID, PATH_OUTCOME_DRAFT_CONTRACTS, PATH_OUTCOME_REPLY_ISSUES,
  PATH_OUTCOME_WRITER_CONTRACT_ID, PathOutcomeCheckerReplySchema, PathOutcomeReplySchema, pathOutcomeCallSiteKey, pathOutcomeCallSiteRole,
  pathOutcomeReplyIssues, pathRewriteCallSiteKey, type PathOutcomeDraft
} from "@debateai/story";
import { createPostgresProviderGateway, providerCallCostEnvelopePhase, providerCallSharedWall } from "@debateai/runner";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/* ----------------------------------------------------------------- the drafts */

describe("the two drafted contracts", () => {
  it("are path.outcome.v1 and path.outcome-check.v1, in seal order, and neither is sealed yet", () => {
    expect([PATH_OUTCOME_WRITER_CONTRACT_ID, PATH_OUTCOME_CHECKER_CONTRACT_ID]).toEqual(["path.outcome.v1", "path.outcome-check.v1"]);
    expect(PATH_OUTCOME_DRAFT_CONTRACTS.map((contract) => contract.contractId)).toEqual([PATH_OUTCOME_WRITER_CONTRACT_ID, PATH_OUTCOME_CHECKER_CONTRACT_ID]);
    expect(Object.isFrozen(PATH_OUTCOME_DRAFT_CONTRACTS)).toBe(true);
    const sealed = engineSealedContracts().map((contract) => contract.contractId);
    for (const contract of PATH_OUTCOME_DRAFT_CONTRACTS) expect(sealed, contract.contractId).not.toContain(contract.contractId);
  });

  it("await the owners' wording; no instruction names a field and no form shows an id a model could copy", () => {
    expect(readFileSync(join(process.cwd(), "packages/story/src/path-outcome.ts"), "utf8").split("// OWNER WORDING — approve before switch-on").length - 1)
      .toBe(2);
    for (const contract of PATH_OUTCOME_DRAFT_CONTRACTS) {
      expect(contract.instruction, contract.contractId).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
      for (const name of ["own_words", "question_language", "answer_so_far", "what_changed", "rests_on"]) {
        expect(contract.instruction, `${contract.contractId} ${name}`).not.toContain(name);
      }
      for (const text of [contract.instruction, contract.answerForm]) {
        expect(text, contract.contractId).not.toMatch(/\b(P[1-9][0-9]*|W[1-9][0-9]*|b[1-8]|pt[1-9][1-6]|kp\d{2}|cd[1-3]|n\d+)\b/u);
      }
      expect(contract.answerForm.startsWith("Return only one JSON object with exactly this schema and no additional keys:"), contract.contractId)
        .toBe(true);
      // The reader sentence and the language line are code's, added per call: never in the draft itself.
      expect(contract.instruction, contract.contractId).not.toContain("Write for the reader described in reader.");
      expect(contract.instruction, contract.contractId).not.toContain("Write every natural-language field in");
    }
  });

  it("the writer's form names every member of the reply and asks for refs from the points only", () => {
    const [writer, checker] = PATH_OUTCOME_DRAFT_CONTRACTS;
    for (const member of ["line", "summary", "fate", "what_changed", "text", "rests_on", "view", "outcome", "scope", "reason", "revision_problems"]) {
      expect(writer!.answerForm, member).toContain(`${member}`);
    }
    expect(writer!.answerForm).toContain("copied exactly from the ref of a point in the points field");
    expect(writer!.answerForm).toContain("exactly when the material gives the person's own words");
    for (const member of ["satisfied", "problem", "part"]) expect(checker!.answerForm, member).toContain(`"${member}"`);
  });
});

/* ----------------------------------------------------------------- the call sites */

describe("the call sites and their roles", () => {
  it("PATH_OUTCOME:<WRITER|CHECKER>:<path 1-8>:<round 1-2>, the writer a SYNTHESIZER call and the checker an EVALUATOR call", () => {
    expect(PATH_OUTCOME_CALL_SITE_PREFIX).toBe("PATH_OUTCOME:");
    expect(pathOutcomeCallSiteKey("WRITER", 2, 1)).toBe("PATH_OUTCOME:WRITER:2:1");
    expect(pathOutcomeCallSiteKey("CHECKER", 8, 2)).toBe("PATH_OUTCOME:CHECKER:8:2");
    expect(pathOutcomeCallSiteRole("PATH_OUTCOME:WRITER:2:1")).toBe("SYNTHESIZER");
    expect(pathOutcomeCallSiteRole("PATH_OUTCOME:CHECKER:3:2")).toBe("EVALUATOR");
    for (const key of ["PATH_OUTCOME:WRITER:9:1", "PATH_OUTCOME:WRITER:1:3", "PATH_OUTCOME:WRITER:0:1", "PATH_OUTCOME:STORY:1:1",
      "PATH_OUTCOME:WRITER:1", pathRewriteCallSiteKey("WRITER", 1), "COMPOSER:SYNTHESIZER:INITIAL:1"]) {
      expect(PATH_OUTCOME_CALL_SITE.test(key), key).toBe(false);
      expect(pathOutcomeCallSiteRole(key), key).toBeNull();
    }
  });

  it("refuses a path or a round out of range", () => {
    for (const [pathNo, round] of [[0, 1], [9, 1], [1.5, 1], [1, 3], [1, 0]] as const) {
      expect(() => pathOutcomeCallSiteKey("WRITER", pathNo, round as 1 | 2), `${String(pathNo)}:${String(round)}`)
        .toThrowError(expect.objectContaining({ code: "PATH_OUTCOME_CALL_SITE_INVALID" }));
    }
  });
});

/* ----------------------------------------------------------------- the reply */

const draft = (over: Partial<PathOutcomeDraft> = {}): PathOutcomeDraft => ({
  line: "The pier pays for itself only in the summer months.",
  summary: "Rush-hour queues are real, but winter ridership falls by half, so the second pier earns its keep in summer alone.",
  fate: "PARTLY_HELD",
  what_changed: [{ text: "The arguing weakened the year-round case: winter ridership falls.", rests_on: ["P1", "P2"] }],
  view: null,
  ...over
});
const VIEW = { outcome: "DID_NOT_HELP" as const, scope: "PATH" as const, reason: "The points showed the ferries run half empty in winter." };

describe("code's checks of a reply", () => {
  const index = { refs: new Set(["P1", "P2", "P3"]), hasOwnWords: false };

  it("a reply resting on the material's points, with no view and no own words, passes", () => {
    expect(PathOutcomeReplySchema.safeParse(draft()).success).toBe(true);
    expect(pathOutcomeReplyIssues(draft(), index)).toEqual([]);
    expect(pathOutcomeReplyIssues(draft({ view: VIEW }), { ...index, hasOwnWords: true })).toEqual([]);
  });

  it("names an unexpected view, a missing view and a ref the material does not give, each by its code and place", () => {
    expect(PATH_OUTCOME_REPLY_ISSUES).toEqual({ unknownRef: "PATH_OUTCOME_REF_NOT_IN_THE_MATERIAL", viewMissing: "PATH_OUTCOME_VIEW_MISSING",
      viewUnexpected: "PATH_OUTCOME_VIEW_UNEXPECTED", refInProse: "PATH_OUTCOME_REF_IN_PROSE" });
    expect(Object.isFrozen(PATH_OUTCOME_REPLY_ISSUES)).toBe(true);
    expect(pathOutcomeReplyIssues(draft({ view: VIEW }), index).map((issue) => [issue.message, issue.path]))
      .toEqual([[PATH_OUTCOME_REPLY_ISSUES.viewUnexpected, ["view"]]]);
    expect(pathOutcomeReplyIssues(draft(), { ...index, hasOwnWords: true }).map((issue) => [issue.message, issue.path]))
      .toEqual([[PATH_OUTCOME_REPLY_ISSUES.viewMissing, ["view"]]]);
    expect(pathOutcomeReplyIssues(draft({ what_changed: [{ text: "A sentence about the winter.", rests_on: ["P1", "P9"] }] }), index)
      .map((issue) => [issue.message, issue.path])).toEqual([[PATH_OUTCOME_REPLY_ISSUES.unknownRef, ["what_changed", 0, "rests_on", 1]]]);
  });

  // Task 49 review: as the dig rewrite's PATH_REWRITE_REF_IN_PROSE (owner 2026-09-26: a text the person reads never shows a point's
  // or a page's ref). A ref-shaped word the material's own texts use is an ordinary word, and one the material does not give is left alone.
  it("names a point's or a page's ref written in a text the person reads, at its place; an ordinary word shaped like one is left alone", () => {
    const named = { refs: new Set(["P1", "P2"]), hasOwnWords: true, sourceRefs: new Set(["W1"]), ordinaryRefWords: new Set(["P2"]) };
    const issues = pathOutcomeReplyIssues(draft({
      line: "P1 holds up.", summary: "The pages (W1) agree.",
      what_changed: [{ text: "As P1 shows, the year-round case fell.", rests_on: ["P1"] },
        { text: "Vitamin P2 costs little, and a P9 rating is no ref.", rests_on: [] }],
      view: { ...VIEW, reason: "W1 says so." }
    }), named);
    expect(issues.map((issue) => [issue.message, issue.path])).toEqual([
      [PATH_OUTCOME_REPLY_ISSUES.refInProse, ["line"]], [PATH_OUTCOME_REPLY_ISSUES.refInProse, ["summary"]],
      [PATH_OUTCOME_REPLY_ISSUES.refInProse, ["what_changed", 0, "text"]], [PATH_OUTCOME_REPLY_ISSUES.refInProse, ["view", "reason"]]]);
    // A ref inside a longer word or number is no ref; the brief's index (refs and own words only) still checks the points' refs.
    expect(pathOutcomeReplyIssues(draft({ summary: "SP1 and P12 are model names; W10 too." }), { ...named, hasOwnWords: false, ordinaryRefWords: new Set() }))
      .toEqual([]);
    expect(pathOutcomeReplyIssues(draft({ line: "As P2 shows." }), { refs: new Set(["P1", "P2"]), hasOwnWords: false })
      .map((issue) => [issue.message, issue.path])).toEqual([[PATH_OUTCOME_REPLY_ISSUES.refInProse, ["line"]]]);
  });

  it("the form's limits: 1 to 3 sentences, at most 40 refs each, a fate of the four, no trust word and no other member", () => {
    const sentence = { text: "A sentence about the winter.", rests_on: ["P1"] };
    expect(PathOutcomeReplySchema.safeParse(draft({ what_changed: [] })).success).toBe(false);
    expect(PathOutcomeReplySchema.safeParse(draft({ what_changed: [sentence, sentence, sentence, sentence] })).success).toBe(false);
    expect(PathOutcomeReplySchema.safeParse(draft({ what_changed: [{ text: "Fine.", rests_on: Array.from({ length: 41 }, (_, at) => `P${String(at + 1)}`) }] }))
      .success).toBe(false);
    expect(PathOutcomeReplySchema.safeParse(draft({ what_changed: [{ text: "Rests on nothing named.", rests_on: [] }] })).success).toBe(true);
    expect(PathOutcomeReplySchema.safeParse({ ...draft(), fate: "WON" }).success).toBe(false);
    expect(PathOutcomeReplySchema.safeParse({ ...draft(), trust: "SURE" }).success).toBe(false);
  });

  it("the checker is satisfied with no problem, or names one problem and its part", () => {
    expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: true, problem: null, part: null }).success).toBe(true);
    expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: false, problem: "It calls a disputed point settled.", part: "summary" }).success).toBe(true);
    for (const part of ["line", "summary", "fate", "what_changed", "view"]) {
      expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: false, problem: "A problem.", part }).success, part).toBe(true);
    }
    expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: false, problem: null, part: "summary" }).success).toBe(false);
    expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: true, problem: "A problem.", part: null }).success).toBe(false);
    expect(PathOutcomeCheckerReplySchema.safeParse({ satisfied: false, problem: "A problem.", part: "dig_paths" }).success).toBe(false);
  });
});

/* ----------------------------------------------------------------- the money: phase and wall */

/** Every outcome call site of five paths: writer and checker, rounds 1 and 2 (20 keys). */
const OUTCOME_KEYS = (["WRITER", "CHECKER"] as const).flatMap((site) => [1, 2, 3, 4, 5].flatMap((n) => ([1, 2] as const)
  .map((round) => pathOutcomeCallSiteKey(site, n, round))));

describe("a PATH_OUTCOME: call is booked on the debate's attempts (BODY) and never walled", () => {
  it("is BODY on the served lane, while the answer's own keys stay SERVE and a call without a key keeps today's answer", () => {
    expect(providerCallCostEnvelopePhase({ role: "SYNTHESIZER", lane: "served", callSiteKey: "PATH_OUTCOME:WRITER:1:1" })).toBe("BODY");
    expect(providerCallCostEnvelopePhase({ role: "SYNTHESIZER", lane: "served", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" })).toBe("SERVE");
    expect(providerCallCostEnvelopePhase({ role: "EVALUATOR", lane: "served", callSiteKey: "POST_COMPOSE_R9:EVALUATOR:1" })).toBe("SERVE");
    expect(providerCallCostEnvelopePhase({ role: "SYNTHESIZER", lane: "served" })).toBe("SERVE");
    expect(providerCallCostEnvelopePhase({ role: "JUDGE", lane: "served" })).toBe("BODY");
    expect(OUTCOME_KEYS).toHaveLength(20);
    for (const key of OUTCOME_KEYS) {
      expect(providerCallCostEnvelopePhase({ role: pathOutcomeCallSiteRole(key)!, lane: "served", callSiteKey: key }), key).toBe("BODY");
    }
    // LG-A: a structure repair of an outcome call is the call it repairs.
    expect(providerCallCostEnvelopePhase({ role: "SYNTHESIZER", lane: "served", callSiteKey: "REPAIR:STRUCTURE:PATH_OUTCOME:WRITER:1:1" })).toBe("BODY");
  });

  it("is exempt from the shared wall (the person's month, the day), as answer writing is; the debate's arguing stays walled", () => {
    expect(providerCallSharedWall({ role: "SYNTHESIZER", lane: "served", callSiteKey: "PATH_OUTCOME:WRITER:1:1" })).toBe("EXEMPT");
    expect(providerCallSharedWall({ role: "EVALUATOR", lane: "served", callSiteKey: "PATH_OUTCOME:CHECKER:3:2" })).toBe("EXEMPT");
    expect(providerCallSharedWall({ role: "SYNTHESIZER", lane: "served", callSiteKey: "REPAIR:STRUCTURE:PATH_OUTCOME:WRITER:2:1" })).toBe("EXEMPT");
    for (const key of OUTCOME_KEYS) {
      expect(providerCallSharedWall({ role: pathOutcomeCallSiteRole(key)!, lane: "served", callSiteKey: key }), key).toBe("EXEMPT");
    }
    expect(providerCallSharedWall({ role: "JUDGE", lane: "served", callSiteKey: "JUDGE:critic:root0:r1:p1" })).toBe("APPLY");
    expect(providerCallSharedWall({ role: "SYNTHESIZER", lane: "served", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" })).toBe("EXEMPT");
  });
});

/**
 * The runner's gateway over a pool double (money-serve-reserve's `gatewayOver`, copied as it stands). The pinned basis and the run's
 * attempt count are the double's; the money seam records the phase it was built for and then refuses before anything is sent.
 */
const SENT_NOTHING = "M1_TEST_SEAM_REFUSED_BEFORE_SENDING";

function gatewayOver(input: {
  readonly basis: unknown;
  readonly runAttempts: number;
  readonly phases: CostEnvelopePhase[];
}) {
  const pool = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: input.basis }] };
      if (sql.includes("SELECT count(*)::text") && sql.includes("NOT LIKE 'STORY:%'")) {
        return { rows: [{ count: String(input.runAttempts) }] };
      }
      if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "0" }] };
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
  const refusing: ProviderCostEnvelopeSeam = {
    assertCallAllowed: () => { throw new TypedDomainError(SENT_NOTHING, "refused before sending"); },
    recordCall: () => undefined,
    assertUsageReported: () => undefined
  };
  return createPostgresProviderGateway(pool, {
    endpoint: "http://127.0.0.1:1",
    model: "test/model",
    maker: "test-maker",
    buildCostEnvelopeSeam: (_runId: string, phase: CostEnvelopePhase) => {
      input.phases.push(phase);
      return refusing;
    }
  });
}

function answerCall(overrides: Partial<ProviderCallRequest>): ProviderCallRequest {
  return {
    runId: "run:t49-reserve",
    subjectItemId: "work:t49-reserve",
    callSiteKey: "PATH_OUTCOME:WRITER:1:1",
    role: "SYNTHESIZER",
    lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
    contractHash: "a".repeat(64),
    providerRef: "provider:test",
    packet: framedFixturePacket("t49 reserve"),
    ...overrides
  };
}

async function outcomeOf(promise: Promise<unknown>): Promise<Readonly<{ code: string; message: string }>> {
  return promise.then(
    () => ({ code: "SENT", message: "" }),
    (error: unknown) => (error instanceof TypedDomainError ? { code: error.code, message: error.message } : { code: String(error), message: "" })
  );
}

describe("decision 2: the answer's reserve stays whole for the main answer", () => {
  it("an outcome call is refused at the BODY ceiling, while the main answer's writer still reaches the money seam as SERVE", async () => {
    const basis = { ...fixtureStructuralCeiling(20), serve_reserve_attempts: 6 };
    const parsed = parseCostEnvelopeBasis(basis);
    expect(attemptCeilingForPhase(parsed, "SERVE") - attemptCeilingForPhase(parsed, "BODY")).toBe(basis.serve_reserve_attempts);
    expect(attemptCeilingForPhase(parsed, "BODY")).toBe(14);
    const phases: CostEnvelopePhase[] = [];
    // The arguing's attempts already reach the BODY ceiling (14 = max_model_attempts - serve_reserve_attempts).
    const gateway = gatewayOver({ basis, runAttempts: 14, phases });

    const outcome = await outcomeOf(gateway.call(answerCall({})));
    expect(outcome.code).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect(outcome.message).toContain("a BODY ceiling of 14");
    const checker = await outcomeOf(gateway.call(answerCall({ role: "EVALUATOR", callSiteKey: "PATH_OUTCOME:CHECKER:1:1" })));
    expect(checker.code).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect((await outcomeOf(gateway.call(answerCall({ callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" })))).code).toBe(SENT_NOTHING);
    // The outcome calls were refused before any seam was built; the main answer's writer got a SERVE seam.
    expect(phases).toEqual(["SERVE"]);
  });
});
