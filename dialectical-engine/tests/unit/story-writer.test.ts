import { describe, expect, it } from "vitest";
import type { Pool } from "@debateai/db";
import {
  READER_SENTENCE_STORY_CHECKER, READER_SENTENCE_WRITING, READER_SENTENCES, TEXT_NOT_IN_QUESTION_LANGUAGE, TypedDomainError,
  argumentLanguageDirective, proseWordCount, questionLanguageSentence
} from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  readPromptFrame,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import {
  engineSettingsOf,
  engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues,
  resolveLengthGuidance,
  type StoryPolicy
} from "@debateai/register";
import {
  STORY_ANSWERS_NOTE_ANSWERS_FILLED,
  STORY_BACKUP_UNAVAILABLE,
  STORY_BACKUP_USED,
  STORY_CHECKER_CONTRACT_ID,
  STORY_CHECKER_V4_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  STORYTELLER_V4_CONTRACT_ID,
  StoryWriter,
  buildStoryCheckerContract,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyCheckerLengthField,
  storyContractForReader,
  storyContractHash,
  storyContractInArgumentLanguage,
  storyGuidedBound,
  storyGuidedWords,
  storyLengthField,
  type StoryBackupCandidate,
  type StoryCostFallback,
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
  perStoryOverrunBasisPoints: 0,
  registerVersion: 7
});

const SNAPSHOT: StoryWriteInput = Object.freeze<StoryWriteInput>({
  runId: "33333333-3333-4333-8333-333333333333",
  workItemId: "44444444-4444-4444-8444-444444444444",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  questionLine: "Should the team adopt a four-day week?",
  argumentLanguage: { tag: "ro", name: "Romanian" },
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
      confidence: "Fairly sure, as long as payroll costs stay flat.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Adopting it held up.", node_refs: ["P1", "P2"] }],
      change: paragraph("Payroll figures showing a rise would change the answer.")
    },
    why: { reasons: [{ text: "The cost objection (P2) gave no figures.", node_refs: ["P2"] }] },
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
    goal_marked_as_reading: true, speaks_to_the_person: true
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
    // Role rotation (spec Part 3): no storyteller ever replied, so the repair count is unknown, not zero.
    expect(inserted[0]?.storytellerRepairs).toBeNull();
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
      rounds: 1, artifactRefs: ["artifact:1", "artifact:2"], reservation: null, verdictBasis: SNAPSHOT.verdictBasis,
      // Role rotation (spec Part 3): the storyteller's reply was accepted as first asked.
      storytellerRepairs: 0
    });
    // The model wrote P1/P2; the STORED body names the real nodes (restoreStoryRefs),
    // and the same numbering is stored as the story's point numbers.
    expect(inserted[0]?.body?.short.paths[0]).toMatchObject({ position_ref: ROOT, node_refs: [ROOT, ATTACK] });
    expect(inserted[0]?.body?.short.change.node_refs).toEqual([ROOT]);
    expect(inserted[0]?.body?.why.reasons[0]?.node_refs).toEqual([ATTACK]);
    expect(inserted[0]?.body?.short.confidence).toBe("Fairly sure, as long as payroll costs stay flat.");
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
    // The hash is of the contract actually sent: the pack plus the question's language.
    expect(calls[0]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK), "Romanian"))
    );
    expect(calls[1]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStoryCheckerContract(PACK), "Romanian"))
    );
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
    goal_marked_as_reading: true, speaks_to_the_person: true
  }
});

const isStoryteller = (request: ProviderCallRequest): boolean =>
  readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID;

describe("StoryWriter — the question's language (R1)", () => {
  const systemOf = (packet: ProviderCallRequest["packet"]): string[] =>
    packet.messages.filter((message) => message.role === "system").map((message) => message.content);

  it("writes both prompts in the question's language: dev's directive in the one system message, repairs included", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(systemOf(call.packet)).toHaveLength(1);
      expect(call.packet.messages[0]?.role).toBe("system");
      expect(call.packet.messages[0]?.content).toContain(argumentLanguageDirective("Romanian"));
      const repaired = call.buildRepairPacket?.({
        rawText: "{}", parseStatus: "SCHEMA_FAILED",
        parseError: JSON.stringify([{ path: ["short"], message: "STORY_TEXT_SCORE_VALUE" }])
      });
      if (repaired === undefined) throw new Error("STORY_WRITER_TEST_NO_REPAIR_PACKET");
      expect(systemOf(repaired)).toHaveLength(1);
      expect(systemOf(repaired)[0]).toContain(argumentLanguageDirective("Romanian"));
    }
  });

  it("stores the question's language tag with the story, and with a readiness refusal", async () => {
    const { provider } = scripted(byContract);
    const ready = harness(providing(provider));
    await ready.writer.writeAfterSettle(SNAPSHOT);
    expect(ready.inserted[0]).toMatchObject({ outcome: "READY", languageTag: "ro" });
    const refused = harness({ policy: null });
    await refused.writer.writeAfterSettle(SNAPSHOT);
    expect(refused.inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_NOT_CONFIGURED", languageTag: "ro" });
  });

  it("with no language on record, sends dev's own fallback directive and stores no tag", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, argumentLanguage: null });
    expect(inserted[0]).toMatchObject({ outcome: "READY", languageTag: null });
    for (const call of calls) {
      expect(call.packet.messages[0]?.content).toContain(argumentLanguageDirective(""));
      expect(call.packet.messages[0]?.content).toContain("the same language as the question");
    }
  });

  it("keeps und, the tag for a language that could not be told", async () => {
    const { provider } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({
      ...SNAPSHOT, argumentLanguage: { tag: "und", name: "the same language as the question" }
    });
    expect(inserted[0]).toMatchObject({ outcome: "READY", languageTag: "und" });
  });

  it("never loses a story over a tag the contract cannot carry: it stores none", async () => {
    const { provider } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, argumentLanguage: { tag: "x".repeat(36), name: "Romanian" } });
    expect(inserted[0]).toMatchObject({ outcome: "READY", languageTag: null });
  });
});

describe("StoryWriter — the locked language on a shape run (question-language spec 2026-10-13)", () => {
  const RO_LOCK = Object.freeze({ code: "ro", name: "Romanian" });
  // Plain Romanian without diacritics: the lock, never a re-guess of this line, decides the reply's language.
  const LOCKED: StoryWriteInput = Object.freeze<StoryWriteInput>({
    ...SNAPSHOT,
    questionLine: "Ar trebui echipa sa adopte saptamana de lucru de patru zile?",
    argumentLanguage: { tag: "ro", name: "Romanian" },
    languageLocked: true
  });
  const systemOf = (packet: ProviderCallRequest["packet"]): string[] =>
    packet.messages.filter((message) => message.role === "system").map((message) => message.content);

  interface StoryTexts {
    readonly headline: string; readonly summary: string; readonly confidence: string; readonly line: string;
    readonly change: string; readonly reason: string; readonly titles: readonly string[]; readonly paragraph: string;
  }
  const storyIn = (texts: StoryTexts): string => JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: texts.headline,
      summary: texts.summary,
      confidence: texts.confidence,
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: texts.line, node_refs: ["P1", "P2"] }],
      change: { text: texts.change, node_refs: ["P1"] }
    },
    why: { reasons: [{ text: texts.reason, node_refs: ["P2"] }] },
    long: { sections: texts.titles.map((title) => ({ title, paragraphs: [{ text: texts.paragraph, node_refs: ["P1"] }] })) },
    reviewer_note: null
  });
  const ROMANIAN_STORY = storyIn({
    headline: "Săptămâna de patru zile a rezistat, cu o singură întrebare deschisă.",
    summary: "Ai întrebat dacă echipa ar trebui să adopte săptămâna de patru zile; dezbaterea spune că da, dar costurile nu sunt încă lămurite.",
    confidence: "Destul de siguri, atâta timp cât costurile cu salariile rămân la fel.",
    line: "Adoptarea ei a rezistat în fața obiecțiilor și a rămas cea mai bună cale.",
    change: "Cifre care arată o creștere a costurilor cu salariile ar schimba răspunsul.",
    reason: "Obiecția despre costuri (P2) nu a adus nicio cifră și nu a fost susținută de nimeni.",
    titles: ["Cum am citit întrebarea", "Ce spune dezbaterea", "Ce ar schimba răspunsul"],
    paragraph: "Dezbaterea a arătat că săptămâna de patru zile este o idee bună pentru echipă și că nu are costuri mari."
  });
  const FRENCH_STORY = storyIn({
    headline: "La semaine de quatre jours a tenu, avec une seule question ouverte.",
    summary: "Vous avez demandé si l'équipe devait adopter la semaine de quatre jours ; le débat dit oui, mais les coûts ne sont pas encore clairs.",
    confidence: "Assez sûrs, tant que les coûts de la paie restent les mêmes.",
    line: "Son adoption a tenu face aux objections et reste la meilleure voie.",
    change: "Des chiffres montrant une hausse des coûts de la paie changeraient la réponse.",
    reason: "L'objection sur les coûts (P2) n'a donné aucun chiffre et n'a été soutenue par personne.",
    titles: ["Notre lecture de la question", "Ce que dit le débat", "Ce qui changerait la réponse"],
    paragraph: "Le débat a montré que la semaine de quatre jours est une bonne idée pour l'équipe et qu'elle ne coûte pas cher."
  });
  const FRENCH_OBJECTION = JSON.stringify({
    ...(JSON.parse(CHECKER_OBJECTS) as Record<string, unknown>),
    objection: "Le résumé exagère la conclusion du débat et ne dit pas que les coûts de la paie restent une question ouverte; voir P2."
  });
  const lockedByContract = (request: ProviderCallRequest): string => isStoryteller(request) ? ROMANIAN_STORY : CHECKER_SATISFIED;

  it("sends the one named sentence in the one system message and question_language as the last material field", async () => {
    const { provider, calls } = scripted(lockedByContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(LOCKED);
    expect(inserted[0]).toMatchObject({ outcome: "READY", languageTag: "ro" });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(systemOf(call.packet)).toHaveLength(1);
      expect(call.packet.messages[0]?.content).toContain(questionLanguageSentence(RO_LOCK));
      expect(call.packet.messages[0]?.content).not.toContain(argumentLanguageDirective("Romanian"));
      const fields = readPromptFrame(call.packet).fields;
      expect(fields.at(-1)).toEqual({ name: "question_language", content: JSON.stringify(RO_LOCK) });
      expect(fields.filter((field) => field.name === "question_language")).toHaveLength(1);
    }
    expect(readPromptFrame(calls[0]!.packet).contractId).toBe(STORYTELLER_CONTRACT_ID);
    // The per-call hash is of the contract actually sent, the named sentence included (recorded, not sealed).
    expect(calls[0]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK), "Romanian", RO_LOCK))
    );
    expect(calls[1]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStoryCheckerContract(PACK), "Romanian", RO_LOCK))
    );
  });

  it("refuses a French story and a French objection under TEXT_NOT_IN_QUESTION_LANGUAGE, against the lock", async () => {
    const { provider, calls } = scripted(lockedByContract);
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle(LOCKED);
    const storyteller = calls[0]!.classifyContent!(FRENCH_STORY);
    expect(storyteller.parseStatus).toBe("SCHEMA_FAILED");
    expect(storyteller.parseError).toContain(TEXT_NOT_IN_QUESTION_LANGUAGE);
    expect(calls[0]!.classifyContent!(ROMANIAN_STORY).parseStatus).toBe("PARSED");
    const checker = calls[1]!.classifyContent!(FRENCH_OBJECTION);
    expect(checker.parseStatus).toBe("SCHEMA_FAILED");
    expect(checker.parseError).toContain(TEXT_NOT_IN_QUESTION_LANGUAGE);
  });

  it("a storyteller that only ever answers in French ends FAILED/STORY_WRITE_REJECTED", async () => {
    const { provider } = scripted((request) => isStoryteller(request) ? FRENCH_STORY : CHECKER_SATISFIED);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(LOCKED);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", languageTag: "ro" });
  });

  it("control: the same run without the lock keeps today's directive, today's material and today's hash", async () => {
    const { provider, calls } = scripted(lockedByContract);
    const { writer } = harness(providing(provider));
    const { languageLocked: _dropped, ...unlocked } = LOCKED;
    await writer.writeAfterSettle(unlocked);
    for (const call of calls) {
      expect(call.packet.messages[0]?.content).toContain(argumentLanguageDirective("Romanian"));
      expect(call.packet.messages[0]?.content).not.toContain(questionLanguageSentence(RO_LOCK));
      expect(readPromptFrame(call.packet).fields.map((field) => field.name)).not.toContain("question_language");
    }
    expect(calls[0]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK), "Romanian"))
    );
  });
});

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
    expect(events).toEqual(["STORY_POLICY_NOT_PASSED", "STORY_WRITE_FAILED", "STORY_FAILURE_NOT_RECORDED"]);
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
      body: null, reservation: null, rounds: 0, artifactRefs: [], languageTag: null
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
    expect(events).toEqual(["STORY_POLICY_NOT_PASSED", "STORY_STORED"]);
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
    expect(events).toEqual(["STORY_POLICY_NOT_PASSED", "STORY_STORED"]);
    expect(details.at(-1)).toMatchObject({ stored: "RUN_ERASED" });
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

/**
 * Part 4, P4-D (P3-N1; the controller's ruling of 3 October 2026): on a debate
 * whose models the scorecard picked, the story is written and checked by that
 * debate's OWN answer writer and answer checker. The runner hands them over as
 * per-run role makers; each one present REPLACES the policy's ref for that run,
 * and a role left null keeps the policy's ref, resolved exactly as before.
 */
describe("StoryWriter — per-run role makers (P4-D, P3-N1)", () => {
  const SEAT_WRITER = "provider:seat-writer";
  const SEAT_CHECKER = "provider:seat-checker";

  it("writes a story whose policy refs nobody can answer on the run's role makers, and the calls and the record name them", async () => {
    const writerDouble = scripted(byContract);
    const checkerDouble = scripted(byContract);
    // Neither the boot resolver nor the run's own resolver can answer the policy's refs.
    const { writer, inserted } = harness({ resolveProvider: () => null });
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      resolveProvider: () => null,
      roleMakers: {
        storyteller: { provider: writerDouble.provider, providerRef: SEAT_WRITER },
        checker: { provider: checkerDouble.provider, providerRef: SEAT_CHECKER }
      }
    });
    expect(inserted).toEqual([expect.objectContaining({ outcome: "READY", failureCode: null, rounds: 1 })]);
    expect(writerDouble.calls.map((call) => [call.callSiteKey, call.lane, call.providerRef]))
      .toEqual([["STORY:STORYTELLER:1", "story", SEAT_WRITER]]);
    expect(checkerDouble.calls.map((call) => [call.callSiteKey, call.lane, call.providerRef]))
      .toEqual([["STORY:CHECKER:1", "story", SEAT_CHECKER]]);
    // The stored story names who wrote it and who checked it.
    expect(inserted[0]?.storytellerLineage).toMatchObject({ provider_ref: SEAT_WRITER });
    expect(inserted[0]?.checkerLineage).toMatchObject({ provider_ref: SEAT_CHECKER });
  });

  it("control: without them, the same story is FAILED/STORY_ROLE_UNAVAILABLE and nothing is called", async () => {
    const writerDouble = scripted(byContract);
    const { writer, inserted } = harness({ resolveProvider: () => null });
    await writer.writeAfterSettle({ ...SNAPSHOT, resolveProvider: () => null });
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_ROLE_UNAVAILABLE", rounds: 0 })]);
    expect(writerDouble.calls).toEqual([]);
  });

  it("a role left null keeps the policy's ref, resolved by the run's own resolver; unresolvable, the story is refused", async () => {
    const seat = scripted(byContract);
    const sealed = scripted(byContract);
    const { writer, inserted } = harness();
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      resolveProvider: (roleRef) => (roleRef === POLICY.storyCheckerRoleRef ? { provider: sealed.provider, providerRef: roleRef } : null),
      roleMakers: { storyteller: { provider: seat.provider, providerRef: SEAT_WRITER }, checker: null }
    });
    expect(inserted[0]).toMatchObject({
      outcome: "READY",
      storytellerLineage: { provider_ref: SEAT_WRITER },
      checkerLineage: { provider_ref: POLICY.storyCheckerRoleRef }
    });
    expect(seat.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1"]);
    expect(sealed.calls.map((call) => call.callSiteKey)).toEqual(["STORY:CHECKER:1"]);

    const refused = harness();
    await refused.writer.writeAfterSettle({
      ...SNAPSHOT,
      resolveProvider: () => null,
      roleMakers: { storyteller: { provider: seat.provider, providerRef: SEAT_WRITER }, checker: null }
    });
    expect(refused.inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_ROLE_UNAVAILABLE" });
    expect(seat.calls).toHaveLength(1);
  });

  it("a story call refused for money on a role maker goes to the run's cost fallback with that maker planned", async () => {
    // C-17: the seat's makers really refuse for money (the story seam's STORY_COST_ENVELOPE_REACHED, raised before
    // sending), so the story is READY only if each refusal reaches the run's fallback, named as money, and the
    // fallback's cheaper maker serves it and is named on the record.
    const seat = scripted(() => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"));
    const cheaper = scripted(byContract);
    const CHEAPER = "provider:cheaper";
    const planned: string[] = [];
    const refusedForMoneyOn: string[] = [];
    const { writer, inserted } = harness();
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      resolveProvider: () => null,
      roleMakers: {
        storyteller: { provider: seat.provider, providerRef: SEAT_WRITER },
        checker: { provider: seat.provider, providerRef: SEAT_CHECKER }
      },
      // As the runner's fallback does: the planned maker first; only a refusal the writer names as money moves the
      // same request to another maker.
      costFallback: async ({ planned: maker, request, refusedForMoney, call }) => {
        planned.push(maker.providerRef);
        try {
          return { result: await call(maker, request), servedBy: maker };
        } catch (error) {
          if (!refusedForMoney(error)) throw error;
          refusedForMoneyOn.push(maker.providerRef);
          const fallback = { provider: cheaper.provider, providerRef: CHEAPER };
          return { result: await call(fallback, request), servedBy: fallback };
        }
      }
    });
    expect(planned).toEqual([SEAT_WRITER, SEAT_CHECKER]);
    expect(refusedForMoneyOn).toEqual([SEAT_WRITER, SEAT_CHECKER]);
    expect(seat.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(cheaper.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(inserted[0]).toMatchObject({
      outcome: "READY", storytellerLineage: { provider_ref: CHEAPER }, checkerLineage: { provider_ref: CHEAPER }
    });
  });
});

/**
 * Role rotation (spec 2026-10-11 Part 3): `serve.answer_story.storyteller_repairs`
 * counts the story's ROUNDS whose storyteller reply was accepted only after the
 * format repair try (`ProviderCallResult.repairAttempts` above zero), never the
 * repair packets themselves; NULL when no storyteller ever replied.
 */
function storytellerRepairing(inner: ProviderGateway, repairsByRound: ReadonlyMap<number, number>): ProviderGateway {
  return {
    async call(request) {
      const result = await inner.call(request);
      if (!isStoryteller(request)) return result;
      const round = Number(request.callSiteKey.split(":").at(-1));
      const repairAttempts = repairsByRound.get(round);
      return repairAttempts === undefined ? result : { ...result, repairAttempts };
    }
  };
}

describe("StoryWriter — the storyteller's repair count (role rotation)", () => {
  it("a storyteller reply accepted after a repair counts its round once", async () => {
    const { provider } = scripted(byContract);
    const { writer, inserted } = harness(providing(storytellerRepairing(provider, new Map([[1, 1]]))));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY", rounds: 1, storytellerRepairs: 1 });
  });

  it("counts rounds, not repair packets: two packets in round 1 and a clean round 2 are one", async () => {
    const { provider } = numbered((request) => (isStoryteller(request) ? story() : CHECKER_OBJECTS));
    const { writer, inserted } = harness(providing(storytellerRepairing(provider, new Map([[1, 2], [2, 0]]))));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", rounds: 2, storytellerRepairs: 1 });
  });

  it("two rounds that each needed the repair count two", async () => {
    const { provider } = numbered((request) => (isStoryteller(request) ? story() : CHECKER_OBJECTS));
    const { writer, inserted } = harness(providing(storytellerRepairing(provider, new Map([[1, 1], [2, 1]]))));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", rounds: 2, storytellerRepairs: 2 });
  });

  it("a FAILED story keeps the count of the storyteller replies it did get", async () => {
    const { provider } = numbered((request) => (isStoryteller(request)
      ? story()
      : new ProviderCallFailedError(new Error("socket hang up"), 2, "TIMED_OUT", "ledger:dead")));
    const { writer, inserted } = harness(providing(storytellerRepairing(provider, new Map([[1, 1]]))));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", rounds: 1, storytellerRepairs: 1 });
  });

  it("a story that failed before any storyteller reply stores no count", async () => {
    const { provider } = scripted((request) => (isStoryteller(request) ? "not a story" : CHECKER_SATISFIED));
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", rounds: 0, storytellerRepairs: null });
  });
});

/**
 * Story format robustness (2026-10-12): a reply the tolerant decode had to repair is accepted as it arrived and
 * the repair is counted in the log, by its code only, so the owners can see how often each one is needed.
 */
describe("StoryWriter — a repaired reply is logged by its repair code", () => {
  function finishingNormally(answer: (request: ProviderCallRequest) => string): ProviderGateway {
    let calls = 0;
    return {
      async call(request) {
        calls += 1;
        const content = answer(request);
        const classified = request.classifyContent?.(content, { finishReason: "stop" });
        if (classified !== undefined && classified.parseStatus !== "PARSED") {
          throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected");
        }
        return { rawArtifactRef: `artifact:${String(calls)}`, ledgerEntryRef: `ledger:${String(calls)}`, content,
          provider: "openai-compatible-http", model: "unit/model", maker: "unit-maker", modelVersion: "unit/model" };
      }
    };
  }

  it("logs the storyteller's closing brace and the checker's prose, and stores the story", async () => {
    const provider = finishingNormally((request) => (isStoryteller(request)
      ? story().slice(0, -1)
      : `I checked the story against the material. ${CHECKER_SATISFIED}`));
    const { writer, inserted, details } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY", rounds: 1 });
    expect(details.filter((detail) => detail.event === "STORY_REPLY_REPAIRED")).toEqual([
      { event: "STORY_REPLY_REPAIRED", answerId: SNAPSHOT.answerId, answerVersion: 1, round: 1, site: "STORYTELLER", repair: "CLOSING_BRACKETS" },
      { event: "STORY_REPLY_REPAIRED", answerId: SNAPSHOT.answerId, answerVersion: 1, round: 1, site: "CHECKER", repair: "OUTERMOST_OBJECT" }
    ]);
  });

  it("logs every repair of a reply that needed two or more, in the lists' fixed order, the first as the headline (LG-A, L34)", async () => {
    const strayKey = JSON.stringify({ ...(JSON.parse(story()) as Record<string, unknown>), notes: "drafted twice" });
    const checked = JSON.parse(CHECKER_SATISFIED) as { criteria: Record<string, unknown> } & Record<string, unknown>;
    const strayCriterion = JSON.stringify({ ...checked, criteria: { ...checked.criteria, tone_ok: "yes" } });
    const provider = finishingNormally((request) => (isStoryteller(request)
      ? strayKey.slice(0, -1)
      : `I checked the story against the material. ${strayCriterion}`));
    const { writer, inserted, details } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY", rounds: 1 });
    expect(details.filter((detail) => detail.event === "STORY_REPLY_REPAIRED")).toEqual([
      { event: "STORY_REPLY_REPAIRED", answerId: SNAPSHOT.answerId, answerVersion: 1, round: 1, site: "STORYTELLER",
        repair: "CLOSING_BRACKETS", repairs: ["CLOSING_BRACKETS", "UNASKED_KEYS"] },
      { event: "STORY_REPLY_REPAIRED", answerId: SNAPSHOT.answerId, answerVersion: 1, round: 1, site: "CHECKER",
        repair: "OUTERMOST_OBJECT", repairs: ["OUTERMOST_OBJECT", "INNER_UNASKED_KEYS"] }
    ]);
  });

  it("logs nothing for strict replies", async () => {
    const { writer, inserted, events } = harness(providing(finishingNormally(byContract)));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]).toMatchObject({ outcome: "READY" });
    expect(events).not.toContain("STORY_REPLY_REPAIRED");
  });
});

describe("StoryWriter — the debate shape's map fields (debate shape P2c)", () => {
  it("hands the snapshot's also-raised points and answers note to both prompts, and none without them", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      alsoRaised: [{ claim: "Ask the school about a mid-year move.", raisedBy: 2 }],
      answersNote: "ANSWERS_FILLED"
    });
    expect(inserted[0]?.outcome).toBe("READY");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const fields = readPromptFrame(call.packet).fields;
      expect(fields.find((field) => field.name === "also_raised")?.content)
        .toBe(JSON.stringify([{ claim: "Ask the school about a mid-year move." }]));
      expect(fields.find((field) => field.name === "answers_note")?.content)
        .toBe(JSON.stringify(STORY_ANSWERS_NOTE_ANSWERS_FILLED));
      const names = fields.map((field) => field.name);
      expect(names.indexOf("answers_note")).toBe(names.indexOf("also_raised") + 1);
    }
    // Ruling W-STORY: with a map field in the material, both prompts carry the pack's map passages.
    expect(calls[0]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK, true), "Romanian"))
    );
    expect(calls[1]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStoryCheckerContract(PACK, true), "Romanian"))
    );
    expect(calls[0]?.packet.messages[0]?.content).toContain(PACK.commonMap);
    expect(calls[1]?.packet.messages[0]?.content).toContain(PACK.checkerMap);
    const plain = scripted(byContract);
    await harness(providing(plain.provider)).writer.writeAfterSettle(SNAPSHOT);
    expect(plain.calls).toHaveLength(2);
    for (const call of plain.calls) {
      const names = readPromptFrame(call.packet).fields.map((field) => field.name);
      expect(names).not.toContain("also_raised");
      expect(names).not.toContain("answers_note");
      // Ruling W-STORY: and neither prompt says a word about them (today's instructions, byte for byte).
      expect(call.packet.messages[0]?.content).not.toContain("also_raised");
      expect(call.packet.messages[0]?.content).not.toContain("answers_note");
    }
    expect(plain.calls[0]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK), "Romanian"))
    );
    expect(plain.calls[1]?.contractHash).toBe(
      storyContractHash(storyContractInArgumentLanguage(buildStoryCheckerContract(PACK), "Romanian"))
    );
  });

  // Task 15 review (b): the writer's own pass-through, lengthGuidance -> alsoRaisedWhole, seen in the sent material.
  it("length guidance (L19): on a lengthed run a 600-character also-raised claim reaches the storyteller whole; without it, today's clip", async () => {
    const claim = `${"Ask the school whether a mid-year move would upset the class and the timetable. ".repeat(8)}`.slice(0, 600).trim();
    expect(Array.from(claim).length).toBeGreaterThan(240);
    const sentClaim = async (extra: Readonly<Record<string, unknown>>): Promise<string> => {
      const { provider, calls } = scripted(byContract);
      await harness(providing(provider)).writer.writeAfterSettle({ ...SNAPSHOT, alsoRaised: [{ claim, raisedBy: 2 }], ...extra });
      const field = readPromptFrame(calls[0]!.packet).fields.find((entry) => entry.name === "also_raised");
      return (JSON.parse(field!.content) as { claim: string }[])[0]!.claim;
    };
    const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "standard" });
    expect(await sentClaim({ lengthGuidance: guidance })).toBe(claim);
    expect(Array.from(await sentClaim({})).length).toBeLessThanOrEqual(240);
  });
});

/**
 * Engine redesign R1d (spec 2026-10-15 §7; INTERFACE §5; R1d decisions 1-5; absorbs LG-D Task 4). The story is told v4
 * exactly when the run's receipt carries engine 2 AND its length table: contracts v4, one shape set by code, a `length`
 * field after the material and before the language field, allowances and guided words from the table, round 2 only for
 * a misleading problem and as a revision of its own draft, and a backup storyteller on four signals. The engine alone
 * keeps today's v3 story; the length table alone keeps v3 except that also-raised claims are sent whole (LG-C2, L19).
 */
describe("StoryWriter — story v4 under engine 2 (engine redesign R1d)", () => {
  const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
  const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: false });
  const V4: StoryWriteInput = Object.freeze<StoryWriteInput>({ ...SNAPSHOT, engine: ENGINE, lengthGuidance: GUIDANCE });
  const CRITERIA = Object.freeze({
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
    no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true, speaks_to_the_person: true
  });
  const CHECKER_V4_SATISFIED = JSON.stringify({ satisfied: true, misleading: false, objection: null, criteria: CRITERIA });
  const WORDING_NOTE = "The headline could name the open cost question more plainly.";
  const CHECKER_V4_WORDING = JSON.stringify({ satisfied: false, misleading: false, objection: WORDING_NOTE, criteria: CRITERIA });
  const MISLEADING = "The summary presents the disputed cost point (P2) as settled.";
  const CHECKER_V4_MISLEADING = JSON.stringify({
    satisfied: false, misleading: true, objection: MISLEADING,
    criteria: { ...CRITERIA, faithful_to_material: false, no_overstatement: false }
  });
  const contractOf = (request: ProviderCallRequest): string => readPromptFrame(request.packet).contractId;
  /** The v4 storyteller writes no shape_id (decision 2): code sets it on the decoded body. */
  const storyV4 = (): string => {
    const parsed = JSON.parse(story()) as Record<string, unknown>;
    delete parsed.shape_id;
    return JSON.stringify(parsed);
  };
  /** v3 calls get today's replies; v4 calls get v4 replies, the checker's as given. */
  const answering = (checkerReply: string) => (request: ProviderCallRequest): string => {
    const contract = contractOf(request);
    if (contract === STORYTELLER_V4_CONTRACT_ID) return storyV4();
    if (contract === STORYTELLER_CONTRACT_ID) return story();
    return contract === STORY_CHECKER_V4_CONTRACT_ID ? checkerReply : CHECKER_SATISFIED;
  };
  const names = (request: ProviderCallRequest): string[] => readPromptFrame(request.packet).fields.map((field) => field.name);
  const fieldOf = (request: ProviderCallRequest, name: string): string | undefined =>
    readPromptFrame(request.packet).fields.find((field) => field.name === name)?.content;
  const systemOf = (request: ProviderCallRequest): string => request.packet.messages[0]!.content;

  it("row absent: today's contracts, no length field, the policy's own bound objects, no guided or actual words", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.outcome).toBe("READY");
    const [teller, checker] = calls;
    expect(contractOf(teller!)).toBe(STORYTELLER_CONTRACT_ID);
    expect(contractOf(checker!)).toBe(STORY_CHECKER_CONTRACT_ID);
    for (const request of calls) {
      expect(names(request)).not.toContain("length");
      expect(Object.hasOwn(request, "guidedWords")).toBe(false);
      expect(Object.hasOwn(request, "actualWordsOf")).toBe(false);
    }
    expect(teller!.bound).toBe(POLICY.storytellerBound);
    expect(checker!.bound).toBe(POLICY.checkerBound);
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
  });

  // Pre-flight PF-D6.3 (controller ruling): the snapshot carries an also-raised claim longer than today's 240-character
  // clip, so the case really checks the one difference the length row makes to a v3 story (LG-C2 Task 15, ruling L19).
  const LONG_RAISED = "A payroll pilot in one office found costs flat for a full year, and the staff survey backed it. ".repeat(7).trim();
  const RAISED: StoryWriteInput = Object.freeze<StoryWriteInput>({
    ...SNAPSHOT, alsoRaised: Object.freeze([Object.freeze({ claim: LONG_RAISED, raisedBy: 1 })])
  });
  const raisedClaims = (request: ProviderCallRequest): string[] =>
    (JSON.parse(fieldOf(request, "also_raised") ?? "[]") as { claim: string }[]).map((item) => item.claim);
  const withoutRaised = (request: ProviderCallRequest) =>
    readPromptFrame(request.packet).fields.filter((field) => field.name !== "also_raised");

  it("the engine alone keeps the v3 story; the length table alone keeps v3 except that also-raised claims are sent whole", async () => {
    expect(Array.from(LONG_RAISED).length).toBeGreaterThan(240);
    const today = scripted(answering(CHECKER_V4_SATISFIED));
    await harness(providing(today.provider)).writer.writeAfterSettle(RAISED);
    // Without the row: today's 240-character clip, in both calls.
    for (const before of today.calls) {
      expect(raisedClaims(before)).toHaveLength(1);
      expect(Array.from(raisedClaims(before)[0]!).length).toBeLessThanOrEqual(240);
    }
    for (const [lonely, whole] of [[{ ...RAISED, lengthGuidance: GUIDANCE }, true], [{ ...RAISED, engine: ENGINE }, false]] as const) {
      const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
      const { writer, inserted } = harness(providing(provider));
      await writer.writeAfterSettle(lonely);
      expect(inserted[0]?.outcome).toBe("READY");
      expect(calls.map(contractOf)).toEqual([STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID]);
      calls.forEach((request, index) => {
        const before = today.calls[index]!;
        // Every other field as today, in today's order; the also-raised claim whole with the row, clipped without it.
        expect(withoutRaised(request)).toEqual(withoutRaised(before));
        expect(names(request)).toEqual(names(before));
        expect(raisedClaims(request)).toEqual(whole ? [LONG_RAISED] : raisedClaims(before));
        expect(request.contractHash).toBe(before.contractHash);
        expect(names(request)).not.toContain("length");
        expect(Object.hasOwn(request, "guidedWords")).toBe(false);
        expect(Object.hasOwn(request, "actualWordsOf")).toBe(false);
      });
      expect(calls[0]!.bound).toBe(POLICY.storytellerBound);
      expect(calls[1]!.bound).toBe(POLICY.checkerBound);
    }
  });

  it("engine 2 with the table: contracts v4, the length field last, no shape_id asked, the shape stored by code", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer, inserted, events } = harness(providing(provider));
    await writer.writeAfterSettle(V4);
    expect(calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    const [teller, checker] = calls;
    expect(contractOf(teller!)).toBe(STORYTELLER_V4_CONTRACT_ID);
    expect(contractOf(checker!)).toBe(STORY_CHECKER_V4_CONTRACT_ID);
    expect(names(teller!).at(-1)).toBe("length");
    expect(names(checker!).slice(-2)).toEqual(["candidate_story", "length"]);
    // The writer passes the run's language tag (L2): "ro" counts in words.
    expect(fieldOf(teller!, "length")).toBe(storyLengthField(GUIDANCE.story, "ro", GUIDANCE.charactersPerWord).content);
    expect(fieldOf(checker!, "length")).toBe(
      storyCheckerLengthField(GUIDANCE.story, GUIDANCE.steps.story_checker, "ro", GUIDANCE.charactersPerWord).content);
    // One shape by code (decision 2): the v4 form's empty template, and nothing asks the model for a shape id.
    expect(systemOf(teller!)).toContain('{"short"');
    expect(systemOf(teller!)).not.toContain("shape_id");
    // Tries stay 2 (ruling L35); only the token ceiling moves, as Task 11's function computes it.
    expect(teller!.bound).toEqual(storyGuidedBound(POLICY.storytellerBound, "STORYTELLER", GUIDANCE));
    expect(checker!.bound).toEqual(storyGuidedBound(POLICY.checkerBound, "CHECKER", GUIDANCE));
    expect(teller!.bound.maxAttempts).toBe(2);
    expect(teller!.guidedWords).toBe(storyGuidedWords(GUIDANCE.story));
    expect(checker!.guidedWords).toBe(GUIDANCE.steps.story_checker);
    expect(Object.hasOwn(checker!, "actualWordsOf")).toBe(false);
    expect(inserted[0]).toMatchObject({ outcome: "READY", rounds: 1, reservation: null, shapeId: "general" });
    expect(PACK.defaultShape).toBe("general");
    expect(inserted[0]?.body?.shape_id).toBe("general");
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(events).not.toContain("STORY_WORDING_NOTE_ONLY");
  });

  // R2 B9 fix round 1 (Minor 3): the comparing judges' question kinds pick the one v4 shape (`storyV4ShapeId`); this case
  // fails if the writer went back to R1d's `storyShapeOf({ questionKinds: [], pack })` (the pack default, "general").
  it("engine 2: the judges' question kinds pick the one v4 shape (a majority of health: the health shape)", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({ ...V4, questionKinds: ["health", "health"] });
    expect(contractOf(calls[0]!)).toBe(STORYTELLER_V4_CONTRACT_ID);
    expect(PACK.defaultShape).not.toBe("health");
    expect(inserted[0]).toMatchObject({ outcome: "READY", shapeId: "health" });
    expect(inserted[0]?.body?.shape_id).toBe("health");
  });

  it("the writer passes the run's language tag to the length field: a Chinese run is told characters", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle({ ...V4, argumentLanguage: { tag: "zh", name: "Chinese" } });
    expect(fieldOf(calls[0]!, "length")).toBe(storyLengthField(GUIDANCE.story, "zh", GUIDANCE.charactersPerWord).content);
    expect(fieldOf(calls[0]!, "length")).toContain("characters");
  });

  it("a locked run: length, then question_language last", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle({ ...V4, questionLine: "Ar trebui echipa sa adopte saptamana de lucru de patru zile?",
      argumentLanguage: { tag: "ro", name: "Romanian" }, languageLocked: true });
    expect(names(calls[0]!).slice(-2)).toEqual(["length", "question_language"]);
  });

  it("counts the storyteller's actual words over its short version and its reasons, never the long version", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    const { writer } = harness(providing(provider));
    await writer.writeAfterSettle(V4);
    const count = calls[0]!.actualWordsOf!;
    const parsed = JSON.parse(storyV4()) as { short: unknown; why: unknown };
    expect(count(storyV4())).toBe(proseWordCount({ short: parsed.short, why: parsed.why }, GUIDANCE.charactersPerWord));
    expect(count(storyV4())!).toBeGreaterThan(0);
    expect(count(storyV4())!).toBeLessThan(proseWordCount(parsed, GUIDANCE.charactersPerWord));
    expect(count("not json at all")).toBeNull();
  });

  it("a wording note only: READY after one round, no reservation, logged by code and round alone", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_WORDING));
    const { writer, inserted, details } = harness(providing(provider));
    await writer.writeAfterSettle(V4);
    expect(calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(inserted[0]).toMatchObject({ outcome: "READY", failureCode: null, rounds: 1, reservation: null });
    expect(details.filter((detail) => detail.event === "STORY_WORDING_NOTE_ONLY")).toEqual([{
      event: "STORY_WORDING_NOTE_ONLY", answerId: SNAPSHOT.answerId, answerVersion: 1, round: 1
    }]);
    expect(JSON.stringify(details)).not.toContain(WORDING_NOTE);
  });

  it("a misleading problem: round 2 is a fresh call that revises its own draft, with no prior_objection field", async () => {
    const { provider, calls } = scripted((request) => contractOf(request) === STORY_CHECKER_V4_CONTRACT_ID
      ? (request.callSiteKey === "STORY:CHECKER:1" ? CHECKER_V4_MISLEADING : CHECKER_V4_SATISFIED)
      : storyV4());
    const { writer, inserted, events } = harness(providing(provider));
    await writer.writeAfterSettle(V4);
    expect(calls.map((call) => call.callSiteKey))
      .toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:STORYTELLER:2", "STORY:CHECKER:2"]);
    const first = calls[0]!;
    const second = calls[2]!;
    expect(contractOf(second)).toBe(STORYTELLER_V4_CONTRACT_ID);
    // The round-1 material unchanged (it caches), then exactly the revision block's fields.
    expect(names(second)).toEqual([...names(first), "revision_problems", "machine_reply_form"]);
    expect(readPromptFrame(second.packet).fields.slice(0, names(first).length)).toEqual(readPromptFrame(first.packet).fields);
    expect(names(second)).not.toContain("prior_objection");
    expect(fieldOf(second, "revision_problems")).toContain(MISLEADING);
    expect(fieldOf(second, "machine_reply_form")).toBe("REVISION");
    // The accepted round-1 draft as the model's own turn: v4 member order, no shape_id.
    const own = second.packet.messages.filter((message) => message.role === "assistant");
    expect(own).toHaveLength(1);
    const draft = JSON.parse(own[0]!.content) as Record<string, unknown>;
    expect(Object.keys(draft)).toEqual(["short", "why", "reviewer_note", "long"]);
    expect(draft.short).toEqual((JSON.parse(storyV4()) as { short: unknown }).short);
    // A fresh fence, as every new call has (owner answer Q3 of the length plans).
    expect(readPromptFrame(second.packet).fence).not.toBe(readPromptFrame(first.packet).fence);
    expect(inserted[0]).toMatchObject({ outcome: "READY", failureCode: null, rounds: 2, reservation: null });
    expect(events).not.toContain("STORY_WORDING_NOTE_ONLY");
  });

  const FIRST = POLICY.storytellerRoleRef;
  const CHECKER = POLICY.storyCheckerRoleRef;
  const TWIN = "provider:twin";
  const BACKUP = "provider:backup";
  /**
   * The first storyteller (maker-a), the checker (maker-b), a second ref of the first storyteller's maker (never picked),
   * and the backup (maker-c), handed over in that order as the runner hands its panel.
   */
  function backupWorld(input: Readonly<{
    first: (request: ProviderCallRequest) => string | Error;
    backup?: (request: ProviderCallRequest) => string | Error;
    checkerReply?: string;
  }>) {
    const first = scripted(input.first);
    const checker = scripted(answering(input.checkerReply ?? CHECKER_V4_SATISFIED));
    const twin = scripted(answering(CHECKER_V4_SATISFIED));
    const backup = scripted(input.backup ?? answering(CHECKER_V4_SATISFIED));
    const candidates: readonly StoryBackupCandidate[] = Object.freeze([
      Object.freeze({ provider: first.provider, providerRef: FIRST, maker: "maker-a" }),
      Object.freeze({ provider: checker.provider, providerRef: CHECKER, maker: "maker-b" }),
      Object.freeze({ provider: twin.provider, providerRef: TWIN, maker: "maker-a" }),
      Object.freeze({ provider: backup.provider, providerRef: BACKUP, maker: "maker-c" })
    ]);
    const resolveProvider = (roleRef: string) => (roleRef === FIRST ? { provider: first.provider, providerRef: roleRef }
      : roleRef === CHECKER ? { provider: checker.provider, providerRef: roleRef } : null);
    return { first, checker, twin, backup, candidates, resolveProvider };
  }

  it.each([
    ["UNREACHABLE", () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead")],
    ["TOO_SLOW", () => new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow")],
    // Pre-flight PF-D6.5: out of room is two cut-offs, the last at the lowest level (the gateway's facts).
    ["OUT_OF_ROOM", () => new ProviderContentUnacceptedError(2, "LENGTH_EXCEEDED", "cut off at the token ceiling", "artifact:cut", "ledger:cut",
      { cutOffs: 2, lastAtLowestLevel: true })],
    ["UNUSABLE", () => new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "[]", "artifact:bad", "ledger:bad")]
  ] as const)("signal %s: one backup storyteller of another maker writes on STORY:STORYTELLER:3, and the record says so", async (signal, failure) => {
    const world = backupWorld({ first: () => failure() });
    const { writer, inserted, events, details } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1"]);
    expect(world.backup.calls.map((call) => [call.callSiteKey, call.providerRef])).toEqual([["STORY:STORYTELLER:3", BACKUP]]);
    expect(contractOf(world.backup.calls[0]!)).toBe(STORYTELLER_V4_CONTRACT_ID);
    // Its own tries (spec §7.2 item 11): the same bound as the first storyteller's.
    expect(world.backup.calls[0]!.bound).toEqual(storyGuidedBound(POLICY.storytellerBound, "STORYTELLER", GUIDANCE));
    expect(world.checker.calls.map((call) => call.callSiteKey)).toEqual(["STORY:CHECKER:3"]);
    expect(world.twin.calls).toEqual([]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      outcome: "READY", failureCode: null, rounds: 1, shapeId: "general",
      storytellerLineage: { provider_ref: BACKUP }, checkerLineage: { provider_ref: CHECKER },
      backup: { code: STORY_BACKUP_USED, signal, firstModel: FIRST }
    });
    expect(events).toEqual(expect.arrayContaining(["STORY_LOOP_FAILED", "STORY_BACKUP_USED", "STORY_STORED"]));
    expect(details.find((detail) => detail.event === "STORY_BACKUP_USED")).toEqual({
      event: "STORY_BACKUP_USED", answerId: SNAPSHOT.answerId, answerVersion: 1, signal, firstModel: FIRST, backupModel: BACKUP
    });
  });

  it("a backup that fails too: the story is FAILED and still records the backup; no third storyteller is asked", async () => {
    const world = backupWorld({
      first: () => new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow"),
      backup: () => new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "[]", "artifact:bad", "ledger:bad")
    });
    const { writer, inserted, events } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(world.backup.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:3"]);
    expect(world.twin.calls).toEqual([]);
    expect(world.checker.calls).toEqual([]);
    expect(inserted[0]).toMatchObject({
      outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", rounds: 0,
      backup: { code: STORY_BACKUP_USED, signal: "TOO_SLOW", firstModel: FIRST }
    });
    expect(events.filter((event) => event === "STORY_LOOP_FAILED")).toHaveLength(2);
  });

  it("never backs up on a money refusal", async () => {
    const world = backupWorld({ first: () => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story's ceiling is reached") });
    const { writer, inserted, events } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED" });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(world.backup.calls).toEqual([]);
    expect(events.filter((event) => event.startsWith("STORY_BACKUP"))).toEqual([]);
  });

  it("a single cut-off is no signal: no backup, today's FAILED record (pre-flight PF-D6.5)", async () => {
    const world = backupWorld({ first: () => new ProviderContentUnacceptedError(1, "LENGTH_EXCEEDED", "cut off at the token ceiling",
      "artifact:cut", "ledger:cut", { cutOffs: 1, lastAtLowestLevel: false }) });
    const { writer, inserted, events } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1"]);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", rounds: 0 });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(world.backup.calls).toEqual([]);
    expect(events.filter((event) => event.startsWith("STORY_BACKUP"))).toEqual([]);
  });

  /**
   * Pre-flight PF-D6.2 (controller ruling "cost fallback note"): the backup storyteller and a v4 revision keep their
   * maker. This double is today's M7 move — the planned maker first; on a money refusal, the run's other makers (here the
   * first storyteller's twin, then the checker) — and records every call handed to it.
   */
  function movingFallback(world: ReturnType<typeof backupWorld>, handed: string[]): StoryCostFallback {
    const others = [world.candidates[2]!, world.candidates[1]!];
    return async ({ planned, request, refusedForMoney, call }) => {
      handed.push(`${request.callSiteKey}@${planned.providerRef}`);
      try {
        return { result: await call(planned, request), servedBy: planned };
      } catch (refusal) {
        if (!refusedForMoney(refusal)) throw refusal;
        for (const other of others) {
          try {
            return { result: await call(other, request), servedBy: other };
          } catch (moveError) {
            if (!refusedForMoney(moveError)) throw moveError;
          }
        }
        throw refusal;
      }
    };
  }
  const MONEY = () => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story's ceiling is reached");

  it("a backup refused for money is never moved to the first storyteller's or the checker's maker: FAILED with its record", async () => {
    const world = backupWorld({
      first: () => new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow"),
      backup: () => MONEY()
    });
    const handed: string[] = [];
    const { writer, inserted } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates, costFallback: movingFallback(world, handed) });
    // Only the first storyteller's round 1 goes through the cost fallback; the backup's call goes straight to the backup.
    expect(handed).toEqual([`STORY:STORYTELLER:1@${FIRST}`]);
    expect(world.backup.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:3"]);
    expect(world.twin.calls).toEqual([]);
    expect(world.checker.calls).toEqual([]);
    expect(inserted[0]).toMatchObject({
      outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", rounds: 0,
      backup: { code: STORY_BACKUP_USED, signal: "TOO_SLOW", firstModel: FIRST }
    });
  });

  it("a v4 revision refused for money keeps its maker: round 1's draft is served with its problem, no other maker revises it", async () => {
    const world = backupWorld({
      first: (request) => (request.callSiteKey === "STORY:STORYTELLER:2" ? MONEY() : storyV4()),
      checkerReply: CHECKER_V4_MISLEADING
    });
    const handed: string[] = [];
    const { writer, inserted } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates, costFallback: movingFallback(world, handed) });
    expect(handed).toEqual([`STORY:STORYTELLER:1@${FIRST}`, `STORY:CHECKER:1@${CHECKER}`]);
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:STORYTELLER:2"]);
    expect(world.twin.calls).toEqual([]);
    expect(world.checker.calls.map((call) => call.callSiteKey)).toEqual(["STORY:CHECKER:1"]);
    expect(world.backup.calls).toEqual([]);
    expect(inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", reservation: MISLEADING, rounds: 1 });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
  });

  it("a v4 revision goes to the maker that wrote the draft, even when the cost fallback served round 1", async () => {
    const world = backupWorld({
      first: (request) => (request.callSiteKey === "STORY:STORYTELLER:1" ? MONEY() : storyV4()),
      checkerReply: CHECKER_V4_MISLEADING
    });
    const handed: string[] = [];
    const { writer, inserted } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates, costFallback: movingFallback(world, handed) });
    // Round 1 was moved to the twin (money); round 2 revises the twin's own draft, sent straight to the twin.
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1"]);
    expect(world.twin.calls.map((call) => [call.callSiteKey, call.providerRef])).toEqual([
      ["STORY:STORYTELLER:1", FIRST], ["STORY:STORYTELLER:2", TWIN]
    ]);
    expect(handed).toEqual([`STORY:STORYTELLER:1@${FIRST}`, `STORY:CHECKER:1@${CHECKER}`, `STORY:CHECKER:2@${CHECKER}`]);
    expect(inserted[0]).toMatchObject({
      outcome: "READY_WITH_RESERVATION", rounds: 2, storytellerLineage: { provider_ref: TWIN }
    });
  });

  it("never backs up when round 2's write fails: round 1 produced a draft", async () => {
    const world = backupWorld({
      first: (request) => (request.callSiteKey === "STORY:STORYTELLER:2"
        ? new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow")
        : storyV4()),
      checkerReply: CHECKER_V4_MISLEADING
    });
    const { writer, inserted, events } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:STORYTELLER:2"]);
    expect(world.backup.calls).toEqual([]);
    // The earlier checked draft is served with its misleading problem as the reservation (the loop's spec §6 rule).
    expect(inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", reservation: MISLEADING, rounds: 1 });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(events.filter((event) => event.startsWith("STORY_BACKUP"))).toEqual([]);
  });

  it("no candidate of another maker: today's FAILED record, and STORY_BACKUP_UNAVAILABLE logged by code", async () => {
    expect(STORY_BACKUP_UNAVAILABLE).toBe("STORY_BACKUP_UNAVAILABLE");
    for (const candidates of [undefined, "same makers only"] as const) {
      const world = backupWorld({ first: () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead") });
      const { writer, inserted, details } = harness({ resolveProvider: world.resolveProvider });
      await writer.writeAfterSettle(candidates === undefined ? V4 : { ...V4, backupCandidates: world.candidates.slice(0, 3) });
      expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_TRANSPORT_DEATH", rounds: 0 });
      expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
      expect(world.twin.calls).toEqual([]);
      expect(world.backup.calls).toEqual([]);
      expect(details.filter((detail) => detail.event === STORY_BACKUP_UNAVAILABLE)).toEqual([{
        event: STORY_BACKUP_UNAVAILABLE, answerId: SNAPSHOT.answerId, answerVersion: 1, signal: "UNREACHABLE", reason: "NO_CANDIDATE"
      }]);
    }
  });

  // Task 17 review 3 (final wave B11): with five rounds the backup would need rounds 6..10, past the story gateway's 8.
  it("no round left for a backup loop (five rounds): today's FAILED record, and STORY_BACKUP_UNAVAILABLE NO_ROUND_LEFT", async () => {
    const world = backupWorld({ first: () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead") });
    const { writer, inserted, details } = harness({ resolveProvider: world.resolveProvider, policy: { ...POLICY, loopMaxRounds: 5 } });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(world.first.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1"]);
    expect(world.backup.calls).toEqual([]);
    expect(world.twin.calls).toEqual([]);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_TRANSPORT_DEATH", rounds: 0 });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(details.filter((detail) => detail.event === STORY_BACKUP_UNAVAILABLE)).toEqual([{
      event: STORY_BACKUP_UNAVAILABLE, answerId: SNAPSHOT.answerId, answerVersion: 1, signal: "UNREACHABLE", reason: "NO_ROUND_LEFT"
    }]);
    // Four rounds still fit (rounds 5..8): the backup is asked.
    const fits = backupWorld({ first: () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead") });
    const four = harness({ resolveProvider: fits.resolveProvider, policy: { ...POLICY, loopMaxRounds: 4 } });
    await four.writer.writeAfterSettle({ ...V4, backupCandidates: fits.candidates });
    expect(fits.backup.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:5"]);
  });

  it("the first storyteller benched: its maker's second ref is never the backup (whole-branch Minor 1, ruling W1)", async () => {
    // The runner leaves the benched first storyteller out of the candidates (the sit-out filter) but hands every
    // claim-eligible member's maker over unfiltered (`backupMakers`), so maker-a stays excluded: TWIN is never asked.
    const world = backupWorld({ first: () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead") });
    const { writer, inserted } = harness({ resolveProvider: world.resolveProvider });
    const benchedOut = world.candidates.filter((candidate) => candidate.providerRef !== FIRST);
    const makers = world.candidates.map((candidate) => Object.freeze({ providerRef: candidate.providerRef, maker: candidate.maker }));
    await writer.writeAfterSettle({ ...V4, backupCandidates: benchedOut, backupMakers: makers });
    expect(world.twin.calls).toEqual([]);
    expect(world.backup.calls.map((call) => [call.callSiteKey, call.providerRef])).toEqual([["STORY:STORYTELLER:3", BACKUP]]);
    expect(inserted[0]).toMatchObject({ outcome: "READY", backup: { code: STORY_BACKUP_USED, signal: "UNREACHABLE", firstModel: FIRST } });
  });

  it("v3 never backs up, even with the length table and candidates", async () => {
    const world = backupWorld({ first: () => new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow") });
    const { writer, inserted, events } = harness({ resolveProvider: world.resolveProvider });
    await writer.writeAfterSettle({ ...SNAPSHOT, lengthGuidance: GUIDANCE, backupCandidates: world.candidates });
    expect(contractOf(world.first.calls[0]!)).toBe(STORYTELLER_CONTRACT_ID);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_TRANSPORT_DEATH" });
    expect(Object.hasOwn(inserted[0]!, "backup")).toBe(false);
    expect(world.backup.calls).toEqual([]);
    expect(events.filter((event) => event.startsWith("STORY_BACKUP"))).toEqual([]);
  });

  /**
   * Carried review check 1: the loop's `v4` and the checker reader's `v4` are ONE engine fact. A v4 loop fed a verdict
   * read in the v3 form (no `misleading`) would take every objection for a wording note and serve every unsatisfied
   * draft READY; a v3 loop fed the v4 reader would refuse every v3 reply. Each half is driven here by its own reply form.
   */
  it("wiring: the loop and the checker's reader take v4 from the same engine fact", async () => {
    const V3_FORM_OBJECTION = JSON.stringify({
      satisfied: false, objection: MISLEADING, criteria: { ...CRITERIA, faithful_to_material: false }
    });
    // Engine 2 with the table: a v3-form objection is refused by the v4 reader, never served READY as a wording note.
    const v4Run = scripted((request) => (contractOf(request) === STORY_CHECKER_V4_CONTRACT_ID ? V3_FORM_OBJECTION : storyV4()));
    const v4Story = harness(providing(v4Run.provider));
    await v4Story.writer.writeAfterSettle(V4);
    expect(v4Run.calls.map(contractOf)).toEqual([STORYTELLER_V4_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID]);
    expect(v4Story.inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_CHECK_UNAVAILABLE", rounds: 1 });
    // ... and a v4 misleading verdict is read as misleading by the loop: round 2 runs, the last problem is the reservation.
    const misled = scripted((request) => (contractOf(request) === STORY_CHECKER_V4_CONTRACT_ID ? CHECKER_V4_MISLEADING : storyV4()));
    const misledStory = harness(providing(misled.provider));
    await misledStory.writer.writeAfterSettle(V4);
    expect(misled.calls.map((call) => call.callSiteKey))
      .toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:STORYTELLER:2", "STORY:CHECKER:2"]);
    expect(misledStory.inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", reservation: MISLEADING, rounds: 2 });
    // No engine: the v3 reader keeps no `misleading` (LG-A's fixer drops the unasked key), so the v4 form is a plain v3
    // objection and the v3 loop runs every round on it, with today's prior_objection field and no revision turn.
    const v3Read = scripted((request) => (contractOf(request) === STORY_CHECKER_CONTRACT_ID ? CHECKER_V4_MISLEADING : story()));
    const v3ReadStory = harness(providing(v3Read.provider));
    await v3ReadStory.writer.writeAfterSettle({ ...SNAPSHOT, lengthGuidance: GUIDANCE });
    expect(v3Read.calls.map(contractOf)).toEqual([
      STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID, STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID
    ]);
    expect(names(v3Read.calls[2]!)).toContain("prior_objection");
    expect(v3Read.calls[2]!.packet.messages.some((message) => message.role === "assistant")).toBe(false);
    expect(v3ReadStory.inserted[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", reservation: MISLEADING, rounds: 2 });
    const v3Run = scripted((request) => (contractOf(request) === STORY_CHECKER_CONTRACT_ID
      ? (request.callSiteKey === "STORY:CHECKER:1" ? V3_FORM_OBJECTION : CHECKER_SATISFIED)
      : story()));
    const v3Story = harness(providing(v3Run.provider));
    await v3Story.writer.writeAfterSettle({ ...SNAPSHOT, engine: ENGINE });
    expect(v3Run.calls.map(contractOf)).toEqual([
      STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID, STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID
    ]);
    expect(names(v3Run.calls[2]!)).toContain("prior_objection");
    expect(v3Story.inserted[0]).toMatchObject({ outcome: "READY", rounds: 2 });
    expect(v3Story.events).not.toContain("STORY_WORDING_NOTE_ONLY");
  });

  /**
   * Carried review check 4: the unfinished-run story hold (the preview estimate's `NOT EXISTS serve.answer_story` and its
   * last-call window) lasts while no story row exists, so the first storyteller's failure writes no row before the backup
   * runs: one row only, stored after every backup call.
   */
  it("writes no story row while the backup runs: the one row is stored after the backup's calls", async () => {
    const rows: StoryRecordInput[] = [];
    const rowsWhenAsked: number[] = [];
    const world = backupWorld({
      first: () => new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead"),
      backup: (request) => {
        rowsWhenAsked.push(rows.length);
        return answering(CHECKER_V4_SATISFIED)(request);
      },
      checkerReply: CHECKER_V4_SATISFIED
    });
    const { writer, events } = harness({
      resolveProvider: world.resolveProvider,
      repository: { insert: async (record) => { rows.push(record); return "INSERTED" as const; } }
    });
    await writer.writeAfterSettle({ ...V4, backupCandidates: world.candidates });
    expect(rowsWhenAsked).toEqual([0]);
    expect(world.checker.calls.map((call) => call.callSiteKey)).toEqual(["STORY:CHECKER:3"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "READY", backup: { code: STORY_BACKUP_USED, signal: "UNREACHABLE" } });
    expect(events.filter((event) => event === "STORY_STORED")).toHaveLength(1);
    expect(events.indexOf("STORY_STORED")).toBeGreaterThan(events.indexOf(STORY_BACKUP_USED));
    expect(events.indexOf(STORY_BACKUP_USED)).toBeGreaterThan(events.indexOf("STORY_LOOP_FAILED"));
  });

  // Carried review check 5: the gateway records what the counter returns (null = unknown, never a made-up count).
  it("the actual-words counter: 0 for a decodable array, null for a scalar or null", async () => {
    const { provider, calls } = scripted(answering(CHECKER_V4_SATISFIED));
    await harness(providing(provider)).writer.writeAfterSettle(V4);
    const count = calls[0]!.actualWordsOf!;
    expect(count("[]")).toBe(0);
    expect(count("{}")).toBe(0);
    for (const scalar of ["42", "null", "true", JSON.stringify("a sentence of prose")]) expect(count(scalar)).toBeNull();
  });
});

/**
 * Side-by-side spec §13 runner point 6: the story runs after DONE, so the policy travels with the write, never with the
 * writer. A write that carries a policy uses that policy and no other; a write that carries none uses the construction
 * policy; with neither, the story is STORY_NOT_CONFIGURED and the missing policy is logged once, by code.
 */
describe("StoryWriter — the story policy travels with each write (side-by-side §13)", () => {
  /** Every field a write can change, each different from POLICY, so a read of the construction value shows up. */
  const POLICY_B: StoryPolicy = Object.freeze({
    ...POLICY,
    storytellerRoleRef: "provider:settings-b-storyteller",
    storyCheckerRoleRef: "provider:settings-b-checker",
    loopMaxRounds: 1,
    storytellerBound: Object.freeze({ maxAttempts: 1, tokenCeiling: 11000, deadlineMs: 240000 }),
    checkerBound: Object.freeze({ maxAttempts: 1, tokenCeiling: 1500, deadlineMs: 150000 }),
    registerVersion: 8
  });

  it("a write's policy supplies its role refs, call bounds and loop rounds, not the writer's", async () => {
    // The checker objects in every round, so the loop's round count decides how many calls are made: A allows two rounds.
    const { provider, calls } = numbered((request) => (isStoryteller(request) ? story() : CHECKER_OBJECTS));
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, policy: POLICY_B });
    expect(calls.map((call) => ({
      callSiteKey: call.callSiteKey, providerRef: call.providerRef, bound: call.bound
    }))).toEqual([
      { callSiteKey: "STORY:STORYTELLER:1", providerRef: POLICY_B.storytellerRoleRef, bound: POLICY_B.storytellerBound },
      { callSiteKey: "STORY:CHECKER:1", providerRef: POLICY_B.storyCheckerRoleRef, bound: POLICY_B.checkerBound }
    ]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      outcome: "READY_WITH_RESERVATION",
      rounds: 1,
      storytellerLineage: { provider_ref: POLICY_B.storytellerRoleRef },
      checkerLineage: { provider_ref: POLICY_B.storyCheckerRoleRef }
    });
  });

  it("a write's policy supplies its material budget, whichever budget the writer was built with", async () => {
    const TIGHT: StoryPolicy = Object.freeze({ ...POLICY, materialBudget: Object.freeze({ low: 1, medium: 1, high: 1 }) });
    const { provider, calls } = scripted(byContract);
    const refused = harness(providing(provider));
    await refused.writer.writeAfterSettle({ ...SNAPSHOT, policy: TIGHT });
    expect(refused.inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_MATERIAL_TOO_LARGE" });
    expect(calls).toEqual([]);
    // The reverse: a writer built with the tight budget serves a write that carries the generous one.
    const served = harness({ ...providing(provider), policy: TIGHT });
    await served.writer.writeAfterSettle({ ...SNAPSHOT, policy: POLICY });
    expect(served.inserted[0]?.outcome).toBe("READY");
    expect(calls).toHaveLength(2);
  });

  it("a write whose policy is null stores STORY_NOT_CONFIGURED, even though the writer was built with one", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted, events } = harness(providing(provider));
    await writer.writeAfterSettle({ ...SNAPSHOT, policy: null });
    expect(inserted).toEqual([expect.objectContaining({
      outcome: "FAILED", failureCode: "STORY_NOT_CONFIGURED", rounds: 0, artifactRefs: [], body: null
    })]);
    expect(calls).toEqual([]);
    // A null policy WAS passed (as off), so nothing is logged as not passed.
    expect(events).not.toContain("STORY_POLICY_NOT_PASSED");
  });

  it("hosted, a write whose policy has no story ceiling stores STORY_ENVELOPE_MISSING before any call, whatever the writer has", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness({
      ...providing(provider), hosted: true, policy: { ...POLICY, perStoryCeilingMicros: 50000 }
    });
    // POLICY carries no ceiling (null); the writer's own policy does.
    await writer.writeAfterSettle({ ...SNAPSHOT, policy: POLICY });
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_MISSING", rounds: 0 })]);
    expect(calls).toEqual([]);
    // A write whose own policy has the ceiling runs the loop on the same writer.
    await writer.writeAfterSettle({ ...SNAPSHOT, policy: { ...POLICY, perStoryCeilingMicros: 50000 } });
    expect(inserted[1]?.outcome).toBe("READY");
  });

  it("a writer built without a policy, given a write without one, stores STORY_NOT_CONFIGURED and logs STORY_POLICY_NOT_PASSED once, by code and ids", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted, events, details } = harness({ ...providing(provider), policy: null });
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_NOT_CONFIGURED" })]);
    expect(calls).toEqual([]);
    expect(events.filter((event) => event === "STORY_POLICY_NOT_PASSED")).toHaveLength(1);
    expect(details).toContainEqual({ event: "STORY_POLICY_NOT_PASSED", answerId: SNAPSHOT.answerId, answerVersion: 1 });
    expect(JSON.stringify(details)).not.toContain(SNAPSHOT.questionLine);
  });

  it("a writer built without a policy runs a write that carries one, and logs nothing as not passed", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted, events } = harness({ ...providing(provider), policy: null });
    await writer.writeAfterSettle({ ...SNAPSHOT, policy: POLICY });
    expect(inserted[0]).toMatchObject({ outcome: "READY", failureCode: null });
    expect(calls).toHaveLength(2);
    expect(events).not.toContain("STORY_POLICY_NOT_PASSED");
  });
});

/**
 * V4 reading level reaches the writers (owner ruling N6, 2026-10-29): with the run's level, the storyteller's and the
 * checker's material end with a `reader` field (before `question_language`) and each instruction gains its one reader
 * sentence after the pack's text, before the language line. Without a level, today's bytes and today's contract hash.
 * OWNER WORDING — pending approval.
 */
describe("StoryWriter — the person's reading level (V4, owner N6)", () => {
  const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
  const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: false });
  const V4: StoryWriteInput = Object.freeze<StoryWriteInput>({ ...SNAPSHOT, engine: ENGINE, lengthGuidance: GUIDANCE });
  const CHECKER_V4_SATISFIED = JSON.stringify({ satisfied: true, misleading: false, objection: null,
    criteria: JSON.parse(CHECKER_SATISFIED).criteria });
  const storyV4 = (): string => {
    const parsed = JSON.parse(story()) as Record<string, unknown>;
    delete parsed.shape_id;
    return JSON.stringify(parsed);
  };
  const answering = (request: ProviderCallRequest): string => {
    const contract = readPromptFrame(request.packet).contractId;
    if (contract === STORYTELLER_V4_CONTRACT_ID) return storyV4();
    if (contract === STORYTELLER_CONTRACT_ID) return story();
    return contract === STORY_CHECKER_V4_CONTRACT_ID ? CHECKER_V4_SATISFIED : CHECKER_SATISFIED;
  };
  const names = (request: ProviderCallRequest): string[] => readPromptFrame(request.packet).fields.map((field) => field.name);
  const run = async (input: StoryWriteInput, ready = true): Promise<ProviderCallRequest[]> => {
    const { provider, calls } = scripted(answering);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle(input);
    if (ready) expect(inserted[0]?.outcome).toBe("READY");
    return calls;
  };

  it("storyContractForReader: the same contract with no level; else the role's sentence after a blank line", () => {
    const teller = buildStorytellerContract(PACK);
    const checker = buildStoryCheckerContract(PACK);
    expect(storyContractForReader(teller, null, "STORYTELLER")).toBe(teller);
    expect(storyContractForReader(teller, "plain", "STORYTELLER"))
      .toEqual({ ...teller, instruction: `${teller.instruction}\n\n${READER_SENTENCE_WRITING}` });
    expect(storyContractForReader(checker, "expert", "CHECKER"))
      .toEqual({ ...checker, instruction: `${checker.instruction}\n\n${READER_SENTENCE_STORY_CHECKER}` });
  });

  it("without a level: no reader field, no reader sentence, today's contract hash (v3 and v4)", async () => {
    for (const input of [SNAPSHOT, V4]) {
      const calls = await run(input);
      for (const call of calls) {
        expect(names(call)).not.toContain("reader");
        expect(call.packet.messages[0]!.content).not.toContain("the reader described in reader");
      }
    }
    const [teller, checker] = await run(SNAPSHOT);
    expect(teller!.contractHash).toBe(storyContractHash(storyContractInArgumentLanguage(buildStorytellerContract(PACK), "Romanian")));
    expect(checker!.contractHash).toBe(storyContractHash(storyContractInArgumentLanguage(buildStoryCheckerContract(PACK), "Romanian")));
  });

  it.each(["plain", "background", "expert"] as const)("with %s: reader last in both materials, each role's sentence before the language line", async (level) => {
    const [teller, checker] = await run({ ...SNAPSHOT, readingLevel: level });
    for (const call of [teller!, checker!]) {
      expect(names(call).at(-1)).toBe("reader");
      expect(readPromptFrame(call.packet).fields.at(-1)?.content).toBe(READER_SENTENCES[level]);
    }
    expect(teller!.packet.messages[0]!.content).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n${argumentLanguageDirective("Romanian")}`);
    expect(checker!.packet.messages[0]!.content).toContain(`\n\n${READER_SENTENCE_STORY_CHECKER}\n\n${argumentLanguageDirective("Romanian")}`);
    expect(teller!.contractHash).toBe(storyContractHash(storyContractInArgumentLanguage(
      storyContractForReader(buildStorytellerContract(PACK), level, "STORYTELLER"), "Romanian")));
    expect(checker!.contractHash).toBe(storyContractHash(storyContractInArgumentLanguage(
      storyContractForReader(buildStoryCheckerContract(PACK), level, "CHECKER"), "Romanian")));
  });

  it("story v4: length then reader; on a locked run, question_language still last", async () => {
    const [teller, checker] = await run({ ...V4, readingLevel: "plain" });
    expect(names(teller!).slice(-2)).toEqual(["length", "reader"]);
    expect(names(checker!).slice(-2)).toEqual(["length", "reader"]);
    // The English test story is refused under the Romanian lock; the storyteller's request is what is read here.
    const [locked] = await run({ ...V4, readingLevel: "plain",
      questionLine: "Ar trebui echipa sa adopte saptamana de lucru de patru zile?", argumentLanguage: { tag: "ro", name: "Romanian" },
      languageLocked: true }, false);
    expect(names(locked!).slice(-3)).toEqual(["length", "reader", "question_language"]);
  });
});
