import { describe, expect, it, vi } from "vitest";
import {
  Judge,
  PANEL_MEMBER_FAILURE_KINDS,
  PanelMemberFailure,
  runJudgePanel,
  type JudgeAssessment
} from "@debateai/judgement";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderGateway
} from "@debateai/providers";

/**
 * T3 / S2-2 — the panel member call.
 *
 * `Judge.assess` is the node-local panel leg: a member is asked for the SAME
 * scored assessment the author produced about itself, so `measureDispersion`
 * compares like with like. It is deliberately not `Judge.review` (S4-1).
 *
 * Every failure mode a member can take is raised as a typed
 * `PanelMemberFailure`, because `runJudgePanel` records WHICH way a member fell
 * over; an untyped throw would collapse to PROVIDER_ERROR and lose the reason.
 */

const assessmentContent: JudgeAssessment = {
  steelman: { summary: "The strongest reading of the node.", fidelity: 0.6 },
  critic: { summary: "A plausible counter.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.55, relevance: 0.65 },
  context: { fit: 0.7, ambiguityFlags: [] },
  fallacy: { severity: 0.2, fatalFlags: [] }
};

const panelCall = {
  runId: "run:panel",
  subjectItemId: "work:panel",
  callSiteKey: "JUDGE:panel:root:provider:b",
  questionLine: "Should the proposal stand?",
  statement: "The proposal should stand.",
  authorMaker: "house-a",
  providerRef: "provider:b",
  contractHash: "b".repeat(64),
  bound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 }
} as const;

function gatewayReturning(content: string): ProviderGateway {
  return {
    call: vi.fn(async () => ({
      rawArtifactRef: "artifact:panel-member",
      ledgerEntryRef: "ledger:panel-member",
      content,
      provider: "test",
      model: "model-b",
      maker: "house-b",
      modelVersion: "model-b"
    }))
  } as unknown as ProviderGateway;
}

function gatewayThrowing(error: unknown): ProviderGateway {
  return { call: vi.fn(async () => { throw error; }) } as unknown as ProviderGateway;
}

describe("T3 / S2-2 — the judge panel member call", () => {
  it("asks a member to assess the supplied node and returns its own artifact lineage", async () => {
    const gateway = gatewayReturning(JSON.stringify(assessmentContent));
    const member = new Judge(gateway);

    await expect(member.assess(panelCall)).resolves.toMatchObject({
      judgementRef: "artifact:panel-member",
      assessment: assessmentContent,
      providerLedgerRef: "ledger:panel-member"
    });

    // The member is asked to ASSESS, never to re-author: the packet carries the
    // author's statement and never asks for a statement back.
    const packet = (gateway.call as ReturnType<typeof vi.fn>).mock.calls[0]![0].packet as {
      readonly messages: readonly { readonly role: string; readonly content: string }[];
    };
    const system = packet.messages.find((message) => message.role === "system")!.content;
    // W7 / V-BLIND-CONTEXT (2026-09-03): the foreign-text framing stays, the
    // author's identity goes. "another maker" also asserts a maker-level
    // difference V-S11-GRADER no longer guarantees, so the wording is
    // "another participant". `tests/unit/prompt-surface-guard.test.ts` owns the
    // withholding property for the whole prompt surface.
    expect(system).toContain("Assess an existing debate node authored by another participant");
    expect(system).not.toContain("restatement_text");
    expect(packet.messages.find((message) => message.role === "user")!.content)
      .toContain("The proposal should stand.");
  });

  it("raises a TIMEOUT member failure when the member's provider timed out", async () => {
    const member = new Judge(gatewayThrowing(
      new ProviderCallFailedError(new Error("deadline"), 1, "TIMED_OUT", "ledger:timeout")
    ));
    await expect(member.assess(panelCall)).rejects.toMatchObject({
      name: "PanelMemberFailure",
      failureKind: "TIMEOUT"
    });
  });

  it("distinguishes a transport failure from a timeout instead of flattening both", async () => {
    const member = new Judge(gatewayThrowing(
      new ProviderCallFailedError(new Error("socket"), 1, "FAILED", "ledger:failed")
    ));
    await expect(member.assess(panelCall)).rejects.toMatchObject({ failureKind: "PROVIDER_ERROR" });
  });

  it("raises a PARSE_FAILURE member failure when the member returned no JSON object", async () => {
    const member = new Judge(gatewayReturning("I decline to answer in JSON."));
    await expect(member.assess(panelCall)).rejects.toMatchObject({ failureKind: "PARSE_FAILURE" });
  });

  it("raises a SCHEMA_FAILURE member failure when the member returned the wrong shape", async () => {
    const member = new Judge(gatewayReturning(JSON.stringify({ steelman: { summary: "only this" } })));
    await expect(member.assess(panelCall)).rejects.toMatchObject({ failureKind: "SCHEMA_FAILURE" });
  });

  it("carries the repair-loop's own parse verdict through as the member's failure kind", async () => {
    const parseRejected = new Judge(gatewayThrowing(
      new ProviderContentUnacceptedError(2, "PARSE_FAILED", "no JSON", "artifact:x", "ledger:x")
    ));
    await expect(parseRejected.assess(panelCall)).rejects.toMatchObject({ failureKind: "PARSE_FAILURE" });

    const schemaRejected = new Judge(gatewayThrowing(
      new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "bad shape", "artifact:y", "ledger:y")
    ));
    await expect(schemaRejected.assess(panelCall)).rejects.toMatchObject({ failureKind: "SCHEMA_FAILURE" });
  });

  it("declares every failure kind it can raise inside the closed panel vocabulary", () => {
    for (const kind of ["TIMEOUT", "PROVIDER_ERROR", "PARSE_FAILURE", "SCHEMA_FAILURE"]) {
      expect(PANEL_MEMBER_FAILURE_KINDS).toContain(kind);
    }
  });
});

/**
 * J13(b) / B6 — the panel's disclosure marks are CANONICAL vocabulary members.
 *
 * A mark that lives only as a runner-local constant written into untyped ledger JSON is
 * not a disclosure: `ConditionMarkSchema.parse` REJECTS it, so the projection that is
 * supposed to surface it throws instead. Minted under T4's discipline — mid-list, so the
 * DR-176 positional tail is preserved.
 */
describe("J13(b) — PANEL-PARTIAL and its sibling are minted in the canonical vocabulary", () => {
  it("admits both panel disclosure marks through the kernel vocabulary and the contract schema", async () => {
    const [kernel, contract, runner] = await Promise.all([
      import("@debateai/kernel"),
      import("@debateai/contract"),
      import("@debateai/runner")
    ]);

    // The runner's constants ARE the canonical members — not lookalike strings.
    expect(kernel.CONDITION_MARKS).toContain(runner.PANEL_PARTIAL_MARK);
    expect(kernel.CONDITION_MARKS).toContain(runner.PANEL_DEGRADED_SINGLE_VOICE_MARK);
    expect(contract.ConditionMarkSchema.parse("PANEL-PARTIAL")).toBe("PANEL-PARTIAL");
    expect(contract.ConditionMarkSchema.parse("PANEL-DEGRADED-SINGLE-VOICE"))
      .toBe("PANEL-DEGRADED-SINGLE-VOICE");
  });

  it("keeps the DR-176 positional tail intact — the new members are mid-list, never appended", async () => {
    const kernel = await import("@debateai/kernel");
    // Read positionally by `CONDITION_MARKS.slice(-4)` in the runner's required-record
    // gate and its two test consumers. Appending a member here silently redefines the
    // DR-176 hidden-material set.
    expect(kernel.CONDITION_MARKS.slice(-4)).toEqual([
      "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
    ]);
  });
});

describe("T3 / S2-2 — author != judge, through the panel the runner calls", () => {
  const primary = {
    judgementRef: "artifact:author",
    assessment: assessmentContent,
    memberRole: "house-a"
  };

  it("refuses the producer its own panel seat and records why, while other makers judge", async () => {
    const result = await runJudgePanel({
      artifactProducerRef: "provider:a",
      primary,
      members: [
        {
          memberRole: "house-a",
          actorRef: "provider:a",
          contractHash: "a".repeat(64),
          judge: async () => { throw new Error("THE_AUTHOR_MUST_NOT_BE_CALLED"); }
        },
        {
          memberRole: "house-b",
          actorRef: "provider:b",
          contractHash: "b".repeat(64),
          judge: async () => ({ judgementRef: "artifact:b", assessment: assessmentContent })
        }
      ]
    });

    expect(result.judgements.map((entry) => entry.judgementRef)).toEqual(["artifact:author", "artifact:b"]);
    expect(result.notes).toEqual([expect.objectContaining({
      memberRole: "house-a",
      kind: "PRODUCER_GRADING_FORBIDDEN",
      failureKind: "PRODUCER_GRADING_FORBIDDEN"
    })]);
  });

  it("leaves exactly one voice — the author's — when every other member fails, and names each failure", async () => {
    const result = await runJudgePanel({
      artifactProducerRef: "provider:a",
      primary,
      members: [
        {
          memberRole: "house-b",
          actorRef: "provider:b",
          contractHash: "b".repeat(64),
          judge: async () => { throw new PanelMemberFailure("TIMEOUT", "member b timed out"); }
        },
        {
          memberRole: "house-c",
          actorRef: "provider:c",
          contractHash: "c".repeat(64),
          judge: async () => { throw new PanelMemberFailure("PARSE_FAILURE", "member c returned prose"); }
        }
      ]
    });

    // The degraded-single-voice condition the runner marks on: the author is
    // the only surviving voice.
    expect(result.judgements).toHaveLength(1);
    expect(result.notes.map((note) => note.failureKind)).toEqual(["TIMEOUT", "PARSE_FAILURE"]);
  });

  it("proceeds on the voices that parsed when only SOME members fail (partial panel)", async () => {
    const result = await runJudgePanel({
      artifactProducerRef: "provider:a",
      primary,
      members: [
        {
          memberRole: "house-b",
          actorRef: "provider:b",
          contractHash: "b".repeat(64),
          judge: async () => { throw new PanelMemberFailure("SCHEMA_FAILURE", "member b returned the wrong shape"); }
        },
        {
          memberRole: "house-c",
          actorRef: "provider:c",
          contractHash: "c".repeat(64),
          judge: async () => ({ judgementRef: "artifact:c", assessment: assessmentContent })
        }
      ]
    });

    expect(result.judgements).toHaveLength(2);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ memberRole: "house-b", failureKind: "SCHEMA_FAILURE" });
  });
});
