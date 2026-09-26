import { describe, expect, it } from "vitest";
import type { Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  readPromptFrame,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import type { StoryPolicy } from "@debateai/register";
import {
  STORY_CHECKER_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  StoryWriter,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyContractHash,
  type StoryNodeEnrichment,
  type StoryRecordInput,
  type StoryStepLease,
  type StoryWriteInput,
  type StoryWriterDependencies
} from "@debateai/story";

/**
 * Verdict story, Task 9 — StoryWriter.writeAfterSettle. Readiness is checked
 * in order and each failure is ONE FAILED row with its own code; the loop runs
 * on the story lane and STORY: call sites; and nothing — a provider, the
 * repository, the logger — can make it reject.
 */

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const ROOT = "11111111-1111-4111-8111-111111111111";
const ATTACK = "22222222-2222-4222-8222-222222222222";

const POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: "provider:storyteller",
  storyCheckerRoleRef: "provider:checker",
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 }),
  checkerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: null,
  registerVersion: 7
});

const SNAPSHOT: StoryWriteInput = Object.freeze<StoryWriteInput>({
  runId: "33333333-3333-4333-8333-333333333333",
  workItemId: "44444444-4444-4444-8444-444444444444",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  questionLine: "Should the team adopt a four-day week?",
  compositionBudgetTier: "low",
  verdictBasis: {
    label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
    winner_node_id: ROOT, winner_strength: 0.61,
    runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
    thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
    confidence_band: "FULL", marks: ["LABEL-BASIS-INCOMPLETE"]
  },
  servedStatement: ["The four-day week holds up, with the cost objection unresolved."],
  nodes: [
    {
      nodeId: ROOT, claim: "Adopt the four-day week.", isPosition: true, wayOfKnowing: "REASONING",
      baseScore: 0.7, finalStrength: 0.61, excludedReason: null, authorModel: "maker-a",
      panelDispersion: null, criticSummary: "Costs may rise."
    },
    {
      nodeId: ATTACK, claim: "Payroll costs rise.", isPosition: false, wayOfKnowing: "REASONING",
      baseScore: 0.4, finalStrength: 0.4, excludedReason: null, authorModel: "maker-a",
      panelDispersion: null, criticSummary: "No figures given."
    }
  ],
  arrows: [{ sourceNodeId: ATTACK, targetNodeId: ROOT, polarity: "attack" }],
  sensitivity: [{ removedNodeId: ROOT, leverage: 0.61 }, { removedNodeId: ATTACK, leverage: 0.09 }],
  setAside: [],
  judgeArtifactRefs: new Map([[ROOT, "66666666-6666-4666-8666-666666666666"]])
});

/**
 * The storyteller only ever sees SHORT refs (skeleton: positions first, then
 * depth-first in arrow order), so this answer cites `P1` (ROOT, the one
 * position) and `P2` (ATTACK). The writer must restore them to node ids and
 * store the same numbering as the story's point numbers.
 */
function story(): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: "The four-day week held up, with one open question.",
      summary: "You asked whether to adopt a four-day week; the debate says yes, with costs unresolved.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Adopting it held up.", node_refs: ["P1", "P2"] }],
      change: paragraph("Payroll figures showing a rise would change the answer.")
    },
    long: {
      sections: ["Our reading", "The verdict", "What would change it"].map((title) => ({
        title, paragraphs: [paragraph(`${title}.`)]
      }))
    },
    reviewer_note: null
  });
}

const CHECKER_SATISFIED = JSON.stringify({
  satisfied: true,
  objection: null,
  criteria: {
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
    no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true
  }
});

/** A provider double that applies the call's own content classifier, as the gateway does. */
function scripted(answer: (request: ProviderCallRequest) => string | Error) {
  const calls: ProviderCallRequest[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      calls.push(request);
      const content = answer(request);
      if (content instanceof Error) throw content;
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(
          1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected"
        );
      }
      return {
        rawArtifactRef: `artifact:${String(calls.length)}`,
        ledgerEntryRef: `ledger:${String(calls.length)}`,
        content,
        provider: "openai-compatible-http",
        model: "unit/model",
        maker: "unit-maker",
        modelVersion: "unit/model"
      };
    }
  };
  return { provider, calls };
}

const byContract = (request: ProviderCallRequest): string =>
  readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID ? story() : CHECKER_SATISFIED;

function harness(overrides: Partial<StoryWriterDependencies> = {}) {
  const inserted: StoryRecordInput[] = [];
  const events: string[] = [];
  const details: Record<string, unknown>[] = [];
  const base: StoryWriterDependencies = {
    pool: {} as Pool,
    pack: PACK,
    policy: POLICY,
    hosted: false,
    resolveProvider: () => null,
    log: (event, detail) => { events.push(event); details.push({ event, ...detail }); },
    repository: { insert: async (record) => { inserted.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map()
  };
  return { writer: new StoryWriter({ ...base, ...overrides }), inserted, events, details };
}

function providing(provider: ProviderGateway): Pick<StoryWriterDependencies, "resolveProvider"> {
  return { resolveProvider: (roleRef) => ({ provider, providerRef: roleRef }) };
}

describe("StoryWriter — readiness, in order, each a FAILED row with its own code", () => {
  it("an invalid pack writes STORY_PACK_INVALID and names no pack", async () => {
    const { writer, inserted } = harness({ pack: { error: "STORY_PACK_INVALID: sections: 2" } });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({
      outcome: "FAILED", failureCode: "STORY_PACK_INVALID", packVersion: null, packFingerprint: null,
      shapeId: null, body: null, rounds: 0, artifactRefs: [], pointNumbers: null,
      runId: SNAPSHOT.runId, answerId: SNAPSHOT.answerId, answerVersion: 1, verdictBasis: SNAPSHOT.verdictBasis
    })]);
  });

  it("no story rows writes STORY_NOT_CONFIGURED, stamped with the pack that would have written it", async () => {
    const { writer, inserted } = harness({ policy: null });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({
      outcome: "FAILED", failureCode: "STORY_NOT_CONFIGURED", packVersion: PACK.version, packFingerprint: PACK.fingerprint
    })]);
  });

  it("hosted without the story's money row writes STORY_ENVELOPE_MISSING; local does not need it", async () => {
    const hosted = harness({ hosted: true });
    await hosted.writer.writeAfterSettle(SNAPSHOT);
    expect(hosted.inserted[0]?.failureCode).toBe("STORY_ENVELOPE_MISSING");
    const local = harness({ hosted: false });
    await local.writer.writeAfterSettle(SNAPSHOT);
    expect(local.inserted[0]?.failureCode).toBe("STORY_ROLE_UNAVAILABLE");
  });

  it("hosted without the money row refuses at readiness, before any call, even with both roles resolvable", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness({ ...providing(provider), hosted: true });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({
      outcome: "FAILED", failureCode: "STORY_ENVELOPE_MISSING", rounds: 0, artifactRefs: [], pointNumbers: null
    })]);
    expect(calls).toEqual([]);
    // With the sealed story ceiling, hosted runs the loop.
    const metered = harness({ ...providing(provider), hosted: true, policy: { ...POLICY, perStoryCeilingMicros: 50_000 } });
    await metered.writer.writeAfterSettle(SNAPSHOT);
    expect(metered.inserted[0]?.outcome).toBe("READY");
  });

  it("an unresolvable role writes STORY_ROLE_UNAVAILABLE; the run's own resolver outranks the boot one", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, resolveProvider: () => null });
    expect(inserted[0]?.failureCode).toBe("STORY_ROLE_UNAVAILABLE");
    expect(calls).toEqual([]);
  });

  it("material that cannot fit writes STORY_MATERIAL_TOO_LARGE before any model call", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness({
      ...providing(provider),
      policy: { ...POLICY, materialBudget: { low: 1, medium: 1, high: 1 } }
    });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.failureCode).toBe("STORY_MATERIAL_TOO_LARGE");
    expect(inserted[0]?.pointNumbers).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("StoryWriter — the write-and-check loop, on the story lane", () => {
  it("writes READY with both lineages, on STORY: call sites, the story lane and the run's work item", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      outcome: "READY", failureCode: null, shapeId: PACK.defaultShape,
      packVersion: PACK.version, packFingerprint: PACK.fingerprint,
      storytellerLineage: {
        maker: "unit-maker", model_id: "unit/model", transport: "openai-compatible-http", provider_ref: "provider:storyteller"
      },
      checkerLineage: {
        maker: "unit-maker", model_id: "unit/model", transport: "openai-compatible-http", provider_ref: "provider:checker"
      },
      rounds: 1, artifactRefs: ["artifact:1", "artifact:2"], reservation: null, verdictBasis: SNAPSHOT.verdictBasis
    });
    // The model wrote P1/P2; the STORED body names the real nodes (restoreStoryRefs),
    // and the same numbering is stored as the story's point numbers.
    expect(inserted[0]?.body?.short.paths[0]).toMatchObject({ position_ref: ROOT, node_refs: [ROOT, ATTACK] });
    expect(inserted[0]?.body?.short.change.node_refs).toEqual([ROOT]);
    expect(JSON.stringify(inserted[0]?.body)).not.toMatch(/"P[0-9]+"/u);
    expect(inserted[0]?.pointNumbers).toEqual({ [ROOT]: "P1", [ATTACK]: "P2" });
    expect(calls.map((call) => ({
      callSiteKey: call.callSiteKey, lane: call.lane, role: call.role,
      subjectItemId: call.subjectItemId, runId: call.runId, providerRef: call.providerRef
    }))).toEqual([
      {
        callSiteKey: "STORY:STORYTELLER:1", lane: "story", role: "SYNTHESIZER",
        subjectItemId: SNAPSHOT.workItemId, runId: SNAPSHOT.runId, providerRef: "provider:storyteller"
      },
      {
        callSiteKey: "STORY:CHECKER:1", lane: "story", role: "EVALUATOR",
        subjectItemId: SNAPSHOT.workItemId, runId: SNAPSHOT.runId, providerRef: "provider:checker"
      }
    ]);
    // ONE request builder for both roles: the two requests carry the same members.
    expect(Object.keys(calls[0]!).sort()).toEqual(Object.keys(calls[1]!).sort());
    expect(calls[0]?.bound).toEqual(POLICY.storytellerBound);
    expect(calls[1]?.bound).toEqual(POLICY.checkerBound);
    expect(calls[0]?.contractHash).toBe(storyContractHash(buildStorytellerContract(PACK)));
    expect(readPromptFrame(calls[1]!.packet).contractId).toBe(STORY_CHECKER_CONTRACT_ID);
    // The checker judges the candidate in the SAME short refs as its material.
    const candidate = readPromptFrame(calls[1]!.packet).fields.find((field) => field.name === "candidate_story");
    expect(candidate?.content).toContain("\"P1\"");
    expect(candidate?.content).not.toContain(ROOT);
  });

  it("a storyteller whose content never passes the checks ends FAILED/STORY_WRITE_REJECTED", async () => {
    const { provider } = scripted((request) =>
      readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID ? "not a story" : CHECKER_SATISFIED);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", body: null, shapeId: null });
    // Material was built, so the point numbers are known even for a failed story.
    expect(inserted[0]?.pointNumbers).toEqual({ [ROOT]: "P1", [ATTACK]: "P2" });
  });

  it("a provider that throws still ends in a FAILED row, never a rejection", async () => {
    const { provider } = scripted(() => new Error("transport down"));
    const { writer, inserted } = harness(providing(provider));
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR" });
  });

  it("names the story seam's refusal STORY_ENVELOPE_EXHAUSTED", async () => {
    const { provider } = scripted(() => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "spent"));
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED" });
  });
});

/** A provider double whose every answer names its own call, so each round's lineage is told apart. */
function numbered(answer: (request: ProviderCallRequest, call: number) => string | Error) {
  const calls: ProviderCallRequest[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      calls.push(request);
      const call = calls.length;
      const content = answer(request, call);
      if (content instanceof Error) throw content;
      return {
        rawArtifactRef: `artifact:${String(call)}`,
        ledgerEntryRef: `ledger:${String(call)}`,
        content,
        provider: "openai-compatible-http",
        model: `unit/model-${String(call)}`,
        maker: `unit-maker-${String(call)}`,
        modelVersion: `unit/model-${String(call)}`
      };
    }
  };
  return { provider, calls };
}

const CHECKER_OBJECTS = JSON.stringify({
  satisfied: false,
  objection: "The summary overstates the verdict; see P2.",
  criteria: {
    faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: true,
    no_overstatement: false, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true
  }
});

const isStoryteller = (request: ProviderCallRequest): boolean =>
  readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID;

describe("StoryWriter — the served round's lineage, and every loop failure logged", () => {
  it("keeps round 1's draft with round 1's storyteller AND checker when round 2's checker fails", async () => {
    const { provider, calls } = numbered((request, call) => {
      if (isStoryteller(request)) return story();
      return call === 2
        ? CHECKER_OBJECTS
        : new ProviderCallFailedError(new Error("socket hang up"), 2, "TIMED_OUT", "ledger:dead");
    });
    const { writer, inserted, details } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(calls.map((call) => call.callSiteKey)).toEqual([
      "STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:STORYTELLER:2", "STORY:CHECKER:2"
    ]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      outcome: "READY_WITH_RESERVATION",
      failureCode: null,
      reservation: "The summary overstates the verdict; see P2.",
      // The SERVED round's models: round 1 wrote it (call 1) and judged it (call 2),
      // never round 2's storyteller (call 3) and never a null checker.
      storytellerLineage: { maker: "unit-maker-1", model_id: "unit/model-1", provider_ref: "provider:storyteller" },
      checkerLineage: { maker: "unit-maker-2", model_id: "unit/model-2", provider_ref: "provider:checker" },
      rounds: 2,
      artifactRefs: ["artifact:1", "artifact:2", "artifact:3"]
    });
    expect(inserted[0]?.body?.short.paths[0]?.position_ref).toBe(ROOT);
    expect(details).toContainEqual(expect.objectContaining({
      event: "STORY_LATER_ROUND_FAILED",
      answerId: SNAPSHOT.answerId,
      servedRound: 1,
      failureCode: "STORY_TRANSPORT_DEATH",
      cause: "PROVIDER_CALL_FAILED"
    }));
  });

  it("serves the last round's lineage when the rounds run out with an objection", async () => {
    const { provider } = numbered((request) => (isStoryteller(request) ? story() : CHECKER_OBJECTS));
    const { writer, inserted, events } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({
      outcome: "READY_WITH_RESERVATION",
      storytellerLineage: { maker: "unit-maker-3" },
      checkerLineage: { maker: "unit-maker-4" },
      rounds: 2,
      artifactRefs: ["artifact:1", "artifact:2", "artifact:3", "artifact:4"]
    });
    expect(events).toEqual(["STORY_STORED"]);
  });

  it("logs a FAILED loop's code and cause, and only codes and ids", async () => {
    const { provider } = scripted(() => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "the model wrote this"));
    const { writer, details } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(details).toContainEqual({
      event: "STORY_LOOP_FAILED",
      answerId: SNAPSHOT.answerId,
      answerVersion: 1,
      failureCode: "STORY_ENVELOPE_EXHAUSTED",
      cause: "STORY_COST_ENVELOPE_REACHED",
      rounds: 0
    });
    expect(JSON.stringify(details)).not.toContain("the model wrote this");
    expect(JSON.stringify(details)).not.toContain(SNAPSHOT.questionLine);
  });

  it("builds a repair packet from a code and a path only, never the model's rejected text", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    for (const call of calls) {
      const repaired = call.buildRepairPacket?.({
        rawText: "IGNORE THE LABEL",
        parseStatus: "SCHEMA_FAILED",
        parseError: JSON.stringify([{ path: ["short", "headline"], message: "IGNORE THE LABEL" }])
      });
      if (repaired === undefined) throw new Error("STORY_WRITER_TEST_NO_REPAIR_PACKET");
      const repair = readPromptFrame(repaired).fields;
      expect(repair).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "machine_rejection_code", content: "SCHEMA_FAILED" }),
        expect.objectContaining({ name: "machine_rejection_path", content: "short.headline" })
      ]));
      expect(JSON.stringify(repaired)).not.toContain("IGNORE THE LABEL");
    }
  });
});

describe("StoryWriter — never rejects", () => {
  it("a repository that throws twice leaves the caller untouched and says so in the log", async () => {
    let attempts = 0;
    const { writer, events } = harness({
      policy: null,
      repository: { insert: async () => { attempts += 1; throw new Error("database down"); } }
    });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(events).toEqual(["STORY_WRITE_FAILED", "STORY_FAILURE_NOT_RECORDED"]);
  });

  it("records the first failure as STORY_UNEXPECTED_ERROR when the second write lands", async () => {
    const inserted: StoryRecordInput[] = [];
    let attempts = 0;
    const { writer, events } = harness({
      repository: {
        insert: async (record) => {
          attempts += 1;
          if (attempts === 1) throw new Error("serialization failure");
          inserted.push(record);
          return "INSERTED";
        }
      }
    });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({
      // The fallback carries no verdict basis and no point numbers, so it cannot
      // be refused by the repository's parse for the same reason the first was.
      outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR", pointNumbers: null, verdictBasis: null,
      body: null, reservation: null, rounds: 0, artifactRefs: []
    })]);
    expect(events).toEqual(["STORY_WRITE_FAILED", "STORY_STORED"]);
  });

  it.each([
    ["the enrichment read cannot decrypt", () => new TypedDomainError("CONTENT_CIPHER_UNAVAILABLE", "no key store")],
    ["the run was erased under the enrichment read", () => new TypedDomainError("PRIVATE_CONTENT_ERASED", "gone")],
    ["the enrichment read hits a database error", () => Object.assign(new Error("tamper"), { code: "XX001" })]
  ])("%s: a FAILED/STORY_UNEXPECTED_ERROR row, never a rejection", async (_name, failure) => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted, events } = harness({
      ...providing(provider),
      readEnrichment: async () => { throw failure(); }
    });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR" })]);
    expect(calls).toEqual([]);
    expect(events).toEqual(["STORY_WRITE_FAILED", "STORY_STORED"]);
  });

  it("a role resolver that throws is a FAILED row, never a rejection", async () => {
    const { writer, inserted } = harness({ resolveProvider: () => { throw new Error("resolver bug"); } });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR" })]);
  });

  it("a repository that refuses the first record still gets the fallback, and the answer's basis is not what broke it", async () => {
    const inserted: StoryRecordInput[] = [];
    const { writer } = harness({
      policy: null,
      repository: {
        insert: async (record) => {
          if (record.verdictBasis !== null) throw new TypedDomainError("STORY_RECORD_INVALID", "verdictBasis");
          inserted.push(record);
          return "INSERTED";
        }
      }
    });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({ failureCode: "STORY_UNEXPECTED_ERROR", verdictBasis: null })]);
  });

  it("a throwing logger cannot make it reject either", async () => {
    const { writer } = harness({
      policy: null,
      log: () => { throw new Error("log sink down"); },
      repository: { insert: async () => { throw new Error("database down"); } }
    });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
  });

  it("an erased run is logged, never thrown", async () => {
    const { writer, events } = harness({ policy: null, repository: { insert: async () => "RUN_ERASED" as const } });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(events).toEqual(["STORY_STORED"]);
  });
});

/**
 * Fix round 1 (spec §3, amended): the story runs AFTER the run's lease, and each
 * step — the enrichment read, each provider call, the insert — takes its own
 * short lease. `erasedFrom` makes the lease refuse from its Nth entry on, as the
 * real lease does once an erasure has landed between two steps.
 */
function steppedLease(erasedFrom: number | null = null) {
  let entries = 0;
  let held = false;
  const lease: StoryStepLease = async (use) => {
    entries += 1;
    if (erasedFrom !== null && entries >= erasedFrom) {
      throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
    }
    held = true;
    try {
      return await use();
    } finally {
      held = false;
    }
  };
  return { lease, entries: () => entries, held: () => held };
}

describe("StoryWriter — one short lease per step, never the whole story", () => {
  it("runs the enrichment read, each provider call and the insert each inside its own lease", async () => {
    const stepped = steppedLease();
    const outside: string[] = [];
    const { provider, calls } = scripted((request) => {
      if (!stepped.held()) outside.push(request.callSiteKey);
      return byContract(request);
    });
    const inserted: StoryRecordInput[] = [];
    const { writer } = harness({
      ...providing(provider),
      readEnrichment: async () => {
        if (!stepped.held()) outside.push("enrichment");
        return new Map();
      },
      repository: {
        insert: async (record) => {
          if (!stepped.held()) outside.push("insert");
          inserted.push(record);
          return "INSERTED";
        }
      }
    });
    await writer.writeAfterSettle({ ...SNAPSHOT, stepLease: stepped.lease });
    expect(inserted[0]?.outcome).toBe("READY");
    expect(calls).toHaveLength(2);
    expect(outside).toEqual([]);
    // enrichment + storyteller + checker + insert: four short leases, none spanning two steps.
    expect(stepped.entries()).toBe(4);
  });

  it.each([
    ["before the enrichment read", 1, 0, ["STORY_WRITE_FAILED", "STORY_STORED"]],
    ["before the storyteller's call", 2, 0, ["STORY_LOOP_FAILED", "STORY_STORED"]],
    ["between the storyteller's call and the checker's", 3, 1, ["STORY_LOOP_FAILED", "STORY_STORED"]],
    ["before the insert", 4, 2, ["STORY_STORED"]]
  ])("an erasure %s ends the story benignly: no row, no throw, nothing more called", async (_name, erasedFrom, callCount, eventNames) => {
    const stepped = steppedLease(erasedFrom);
    const { provider, calls } = scripted(byContract);
    const inserted: StoryRecordInput[] = [];
    const { writer, events, details } = harness({
      ...providing(provider),
      repository: { insert: async (record) => { inserted.push(record); return "INSERTED"; } }
    });
    await expect(writer.writeAfterSettle({ ...SNAPSHOT, stepLease: stepped.lease })).resolves.toBeUndefined();
    expect(calls).toHaveLength(callCount);
    expect(inserted).toEqual([]);
    expect(events).toEqual(eventNames);
    expect(details.at(-1)).toMatchObject({ event: "STORY_STORED", stored: "RUN_ERASED" });
    expect(events).not.toContain("STORY_FAILURE_NOT_RECORDED");
  });

  it("names the erasure as the loop's cause when it lands between two calls", async () => {
    const { provider } = scripted(byContract);
    const { writer, details } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, stepLease: steppedLease(3).lease });
    expect(details).toContainEqual(expect.objectContaining({
      // Round 1's storyteller ran; its checker's lease was refused.
      event: "STORY_LOOP_FAILED", failureCode: "STORY_UNEXPECTED_ERROR", cause: "PRIVATE_CONTENT_ERASED", rounds: 1
    }));
  });

  it("reads the database's erasure refusal at the insert as RUN_ERASED too", async () => {
    const erased = Object.assign(new Error("PRIVATE_CONTENT_ERASED"), { code: "55000" });
    const { writer, events, details } = harness({
      policy: null,
      repository: { insert: async () => "INSERTED" as const }
    });
    await writer.writeAfterSettle({ ...SNAPSHOT, stepLease: async () => { throw erased; } });
    expect(events).toEqual(["STORY_STORED"]);
    expect(details[0]).toMatchObject({ stored: "RUN_ERASED" });
  });

  it("with no step lease, runs each step bare (each store and gateway still takes its own)", async () => {
    const { provider } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.outcome).toBe("READY");
  });
});

describe("StoryWriter — fix round 1 minors", () => {
  const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

  it("clears node ids out of the judges' and reviewers' texts before any model reads them", async () => {
    const withIds: StoryNodeEnrichment = {
      judgeBestCase: `The best case, building on ${ATTACK}.`,
      judgeObjection: `The objection, citing ${ROOT.toUpperCase()}.`,
      reviewOutcome: "dispute",
      reviewReasons: [`It contradicts ${ATTACK}.`, "A reason with no id."],
      dispersion: null
    };
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness({
      ...providing(provider),
      readEnrichment: async () => new Map([[ROOT, withIds], [ATTACK, withIds]])
    });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.outcome).toBe("READY");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const material = readPromptFrame(call.packet).fields.map((field) => field.content);
      for (const content of material) expect(content).not.toMatch(UUID_SHAPED);
      expect(material.join("\n")).toContain("building on (a point).");
      expect(material.join("\n")).toContain("A reason with no id.");
    }
  });

  it("logs a snapshot the runner could not build, by code or error name, never by message", () => {
    const { writer, details } = harness();
    writer.reportSnapshotFailure({
      answerId: SNAPSHOT.answerId, answerVersion: 1, error: new TypeError("the model wrote this")
    });
    writer.reportSnapshotFailure({
      answerId: SNAPSHOT.answerId, answerVersion: 1, error: new TypedDomainError("SERVED_ROOT_UNRESOLVED", "x")
    });
    expect(details).toEqual([
      { event: "STORY_SNAPSHOT_FAILED", answerId: SNAPSHOT.answerId, answerVersion: 1, code: "TypeError" },
      { event: "STORY_SNAPSHOT_FAILED", answerId: SNAPSHOT.answerId, answerVersion: 1, code: "SERVED_ROOT_UNRESOLVED" }
    ]);
    expect(JSON.stringify(details)).not.toContain("the model wrote this");
    const throwing = harness({ log: () => { throw new Error("sink down"); } });
    expect(() => throwing.writer.reportSnapshotFailure({
      answerId: SNAPSHOT.answerId, answerVersion: 1, error: new Error("x")
    })).not.toThrow();
  });

  it("an async log sink that rejects never becomes an unhandled rejection", async () => {
    let rejected = 0;
    const onUnhandled = () => { rejected += 1; };
    process.on("unhandledRejection", onUnhandled);
    try {
      const { writer } = harness({
        policy: null,
        log: (async () => { throw new Error("async sink down"); }) as StoryWriterDependencies["log"],
        repository: { insert: async () => { throw new Error("database down"); } }
      });
      await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
      writer.reportSnapshotFailure({ answerId: SNAPSHOT.answerId, answerVersion: 1, error: new Error("x") });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rejected).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("an error whose code cannot even be read still ends in the fallback, never a rejection", async () => {
    const unreadable = new Error("x");
    Object.defineProperty(unreadable, "code", { get() { throw new Error("getter down"); } });
    let attempts = 0;
    const inserted: StoryRecordInput[] = [];
    const { writer } = harness({
      policy: null,
      repository: {
        insert: async (record) => {
          attempts += 1;
          if (attempts === 1) throw unreadable;
          inserted.push(record);
          return "INSERTED";
        }
      }
    });
    await expect(writer.writeAfterSettle(SNAPSHOT)).resolves.toBeUndefined();
    expect(inserted).toEqual([expect.objectContaining({ failureCode: "STORY_UNEXPECTED_ERROR" })]);
  });
});
