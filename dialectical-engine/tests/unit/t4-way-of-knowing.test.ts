import { describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import type { ContentClassification, ProviderGateway } from "@debateai/providers";

/**
 * T4 (goal-v4 112-118, ruling S2-3). Two properties under test:
 *
 * P1  The judge OUTPUT SCHEMA admits exactly the ways of knowing the engine can
 *     honour — LOOKED_UP and REASONING — and REJECTS `RAN`, which was
 *     unreachable and invited a silent lie.
 * P2  When normalization resolves a way of knowing DIFFERENT from the one the
 *     judge claimed (the locator-less LOOKED_UP downgrade), the judged node
 *     carries a condition-mark record naming the node and the claimed value.
 *     When nothing is downgraded, no record is emitted.
 *
 * Symbols this change introduces are reached through a dynamic import so that a
 * missing export fails ONE assertion loudly instead of collapsing the file at
 * collection — the RED evidence has to name the behaviour, not the module.
 */

const BASE_ARTIFACT = Object.freeze({
  statement: "A test-layer judgement.",
  restatement_text: "A test-layer judgement.",
  restatement_status: "PASS",
  value_laden: false,
  steelman: { summary: "Strongest test-layer version.", fidelity: 0.8 },
  critic: { summary: "Plausible test-layer counter.", counterargumentStrength: 0.2, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.7, relevance: 0.9 },
  context: { fit: 0.8, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
});

function artifact(wayOfKnowing: string, locator: string | null): string {
  return JSON.stringify({ ...BASE_ARTIFACT, way_of_knowing: wayOfKnowing, locator });
}

interface Captured {
  systemPrompt: string;
  classifyContent: ((content: string) => ContentClassification) | undefined;
}

function capture(): Captured {
  return { systemPrompt: "", classifyContent: undefined };
}

function fixtureProvider(content: string, captured: Captured): ProviderGateway {
  return {
    call: async (request) => {
      captured.systemPrompt = request.packet.messages.find((message) => message.role === "system")?.content ?? "";
      captured.classifyContent = request.classifyContent;
      return {
        rawArtifactRef: "artifact:t4",
        ledgerEntryRef: "ledger:t4",
        content,
        provider: "openai-compatible-http",
        model: "fixture/model",
        maker: "fixture",
        modelVersion: "fixture-version"
      };
    }
  };
}

function judgeInput(subjectItemId: string) {
  return {
    runId: null,
    subjectItemId,
    callSiteKey: "fixture:t4-way-of-knowing",
    questionLine: "Test-layer question",
    providerRef: "provider:test",
    contractHash: "contract:test",
    bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
  } as const;
}

describe("T4 / S2-3 — RAN is not a way of knowing the judge may claim", () => {
  it("rejects a RAN artifact as a typed schema failure instead of silently relabelling it", async () => {
    const judge = new Judge(fixtureProvider(artifact("RAN", null), capture()));

    await expect(judge.judge(judgeInput("node:ran-claim"))).rejects.toMatchObject({
      name: "TypedDomainError",
      code: "JUDGE_SCHEMA_FAILURE"
    });
  });

  it("tells the provider gateway that RAN content is SCHEMA_FAILED, so the repair loop never accepts it", async () => {
    const captured = capture();
    await new Judge(fixtureProvider(artifact("REASONING", null), captured)).judge(judgeInput("node:classify-probe"));

    expect(captured.classifyContent).toBeTypeOf("function");
    expect(captured.classifyContent!(artifact("RAN", null)).parseStatus).toBe("SCHEMA_FAILED");
    expect(captured.classifyContent!(artifact("REASONING", null)).parseStatus).toBe("PARSED");
  });

  it("declares only the accepted ways of knowing in the prompt the provider is held to", async () => {
    const captured = capture();
    await new Judge(fixtureProvider(artifact("REASONING", null), captured)).judge(judgeInput("node:prompt-probe"));

    expect(captured.systemPrompt).toContain('"way_of_knowing": "LOOKED_UP" | "REASONING"');
    expect(captured.systemPrompt).not.toContain('"RAN"');
  });

  it("publishes the judge way-of-knowing vocabulary as the single source both change sites read", async () => {
    const judgement = await import("@debateai/judgement");

    expect(judgement.JUDGE_WAYS_OF_KNOWING).toEqual(["LOOKED_UP", "REASONING"]);
    expect(judgement.WAY_OF_KNOWING_DOWNGRADED).toBe("WAY-OF-KNOWING-DOWNGRADED");
  });
});

describe("T4 / S2-3 — a downgraded way of knowing is disclosed, never absorbed", () => {
  it("records WAY-OF-KNOWING-DOWNGRADED naming the node and the claimed value when LOOKED_UP has no locator", async () => {
    const judge = new Judge(fixtureProvider(artifact("LOOKED_UP", null), capture()));

    const result = await judge.judge(judgeInput("node:downgrade-subject"));

    expect(result.wayOfKnowing).toBe("REASONING");
    expect(result.locator).toBeNull();
    expect(result.wayOfKnowingDowngrade).toEqual({
      mark: "WAY-OF-KNOWING-DOWNGRADED",
      scope: "node",
      subjectRef: "node:downgrade-subject",
      claimedWayOfKnowing: "LOOKED_UP",
      resolvedWayOfKnowing: "REASONING",
      reason: expect.any(String)
    });
    // "naming node + claimed value" — the human-readable limb carries both too.
    expect(result.wayOfKnowingDowngrade!.reason).toContain("node:downgrade-subject");
    expect(result.wayOfKnowingDowngrade!.reason).toContain("LOOKED_UP");
  });

  it("emits no record when a locator-pinned LOOKED_UP survives normalization unchanged", async () => {
    const judge = new Judge(fixtureProvider(artifact("LOOKED_UP", "https://example.invalid/doc#p1"), capture()));

    const result = await judge.judge(judgeInput("node:pinned-lookup"));

    expect(result.wayOfKnowing).toBe("LOOKED_UP");
    expect(result.locator).toBe("https://example.invalid/doc#p1");
    expect(result.wayOfKnowingDowngrade).toBeNull();
  });

  it("emits no record when the judge claimed REASONING and REASONING is what it gets", async () => {
    const judge = new Judge(fixtureProvider(artifact("REASONING", null), capture()));

    const result = await judge.judge(judgeInput("node:honest-reasoning"));

    expect(result.wayOfKnowing).toBe("REASONING");
    expect(result.wayOfKnowingDowngrade).toBeNull();
  });

  it("keeps the downgrade record frozen so no consumer can rewrite the disclosure", async () => {
    const judge = new Judge(fixtureProvider(artifact("LOOKED_UP", null), capture()));

    const result = await judge.judge(judgeInput("node:frozen-record"));

    // Object.isFrozen(undefined) is true, so the record's EXISTENCE is asserted
    // first — otherwise this whole test passes vacuously on a build that emits
    // no record at all.
    expect(result.wayOfKnowingDowngrade).not.toBeNull();
    expect(typeof result.wayOfKnowingDowngrade).toBe("object");
    expect(Object.isFrozen(result.wayOfKnowingDowngrade)).toBe(true);
  });
});

describe("T4 / S2-3 — Q51's inputs keep their meaning", () => {
  it("still normalizes locator-less LOOKED_UP to REASONING, so Q51's locator block stays unreachable from the judge", async () => {
    const result = await new Judge(fixtureProvider(artifact("LOOKED_UP", null), capture()))
      .judge(judgeInput("node:q51-locator-block"));

    // Q51 (packages/serve/src/index.ts:528-531) blocks on
    // `wayOfKnowing === "LOOKED_UP" && locator === null`. The judge cannot
    // produce that pair — before this change or after it.
    expect(result.wayOfKnowing === "LOOKED_UP" && result.locator === null).toBe(false);
  });
});
