import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import {
  JUDGE_LEG_KINDS,
  Judge,
  judgeLegModelRole,
  type JudgeLeg,
  type JudgeLegKind
} from "@debateai/judgement";
import {
  ProviderContentUnacceptedError,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";

/**
 * Model scorecard A13 (spec §2.1) — the debate job is a FIELD on every call,
 * never a parse of `call_site_key`. The judgement family derives it from what
 * it is asked to do; the runner names the two synthesis roles itself.
 */
const BOUND = { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 } as const;
const QUESTION = "Should the proposal stand?";
const STATEMENT = "The proposal should stand.";

const LEGS: Readonly<Record<JudgeLegKind, JudgeLeg>> = {
  "primary-root": { kind: "primary-root" },
  "independent-root": { kind: "independent-root" },
  support: { kind: "support", positionUnderDebate: STATEMENT },
  attack: { kind: "attack", positionUnderDebate: STATEMENT },
  "cross-root": { kind: "cross-root", ownPosition: STATEMENT, otherMakersPosition: "The proposal fails on cost." }
};

const EXPECTED_LEG_ROLE: Readonly<Record<JudgeLegKind, DebateRole>> = {
  "primary-root": "POSITION",
  "independent-root": "POSITION",
  support: "SUPPORT_ATTACK",
  attack: "SUPPORT_ATTACK",
  "cross-root": "CROSS_EXCHANGE"
};

function capturing(requests: ProviderCallRequest[]): ProviderGateway {
  return {
    call: async (request) => {
      requests.push(request);
      throw new ProviderContentUnacceptedError(1, "SCHEMA_FAILED", "a13 probe", "artifact:a13", "ledger:a13");
    }
  };
}

const SUBJECT = {
  runId: null,
  subjectItemId: "work:a13",
  callSiteKey: "A13:probe",
  questionLine: QUESTION,
  statement: STATEMENT,
  authorMaker: "maker:a13",
  providerRef: "provider:a13",
  contractHash: "c".repeat(64),
  bound: BOUND
} as const;

describe("A13 · every judgement-family call names its debate role", () => {
  it.each(JUDGE_LEG_KINDS)("Judge.judge sends the %s leg under its role", async (kind) => {
    const requests: ProviderCallRequest[] = [];
    await expect(new Judge(capturing(requests)).judge({
      runId: null,
      subjectItemId: SUBJECT.subjectItemId,
      callSiteKey: SUBJECT.callSiteKey,
      questionLine: QUESTION,
      leg: LEGS[kind],
      providerRef: SUBJECT.providerRef,
      contractHash: SUBJECT.contractHash,
      bound: BOUND
    })).rejects.toBeDefined();
    expect(requests.map((request) => request.modelRole)).toEqual([EXPECTED_LEG_ROLE[kind]]);
    expect(judgeLegModelRole(LEGS[kind])).toBe(EXPECTED_LEG_ROLE[kind]);
  });

  it("sends Judge.review as the REVIEWER and Judge.assess as the JUDGE", async () => {
    const reviews: ProviderCallRequest[] = [];
    await expect(new Judge(capturing(reviews)).review({
      ...SUBJECT,
      edges: [{ edgeId: "edge:a13", targetStatement: "The proposal fails on cost.", polarity: "attack" }]
    })).rejects.toBeDefined();
    const assessments: ProviderCallRequest[] = [];
    await expect(new Judge(capturing(assessments)).assess({ ...SUBJECT })).rejects.toBeDefined();
    expect(reviews.map((request) => request.modelRole)).toEqual(["REVIEWER"]);
    expect(assessments.map((request) => request.modelRole)).toEqual(["JUDGE"]);
  });

  it("keeps the T9 provider identity untouched: every judgement call is still role JUDGE", async () => {
    const requests: ProviderCallRequest[] = [];
    await expect(new Judge(capturing(requests)).assess({ ...SUBJECT })).rejects.toBeDefined();
    expect(requests.map((request) => request.role)).toEqual(["JUDGE"]);
  });

  it("covers the five judgement roles, leaving exactly the two synthesis roles to the runner", () => {
    const judgementRoles = new Set<DebateRole>([...Object.values(EXPECTED_LEG_ROLE), "JUDGE", "REVIEWER"]);
    expect(DEBATE_ROLES.filter((role) => !judgementRoles.has(role))).toEqual(["ANSWER_WRITER", "ANSWER_CHECKER"]);
  });
});

describe("A13 · no served-lane call site can omit the role", () => {
  it.each([
    ["packages/judgement/src/index.ts", 3],
    ["apps/runner/src/index.ts", 2]
  ] as const)("%s names modelRole on the line after every served lane", (path, expected) => {
    const lines = readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8").split("\n");
    const served = lines.flatMap((line, index) => line.trim() === "lane: \"served\"," ? [index] : []);
    expect(served).toHaveLength(expected);
    for (const index of served) expect(lines[index + 1]?.trim() ?? "").toMatch(/^modelRole: /u);
  });
});
