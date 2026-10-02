import { readFile } from "node:fs/promises";
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
  STORYTELLER_CONTRACT_ID,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir,
  type StoryRecordInput,
  type StoryStepLease,
  type StoryWriteInput
} from "@debateai/story";
import { storyCostFallback, type ProviderPriceMap } from "@debateai/runner";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.6 and §14.4.2), TASK M7 — A
 * CHEAPER MODEL FOR THE STORY WHEN ITS PLANNED ONE CANNOT BE PAID.
 *
 * When the story's own money seam refuses a call before sending
 * (STORY_COST_ENVELOPE_REACHED), the writer offers the SAME request — the same
 * call site `STORY:STORYTELLER:{round}` / `STORY:CHECKER:{round}`, the same
 * framed prompt — to the run's other claim-eligible makers, cheapest first by
 * the runner's price map, through the runner's own fallback (Task M3's
 * `callServeRoleWithFallback`, its order and its projection: reused, not
 * copied). The checker prefers a maker other than the one that wrote the draft.
 * Only when every maker is refused does the loop see the refusal, and it then
 * ends exactly as today: STORY_ENVELOPE_EXHAUSTED, keeping an earlier checked
 * draft when there is one. An ABSENT role is still STORY_ROLE_UNAVAILABLE:
 * the fallback is for money only (J24's one exception).
 *
 * What only the real gateway and the real ledger can show — the refused try
 * writing no ledger row and no spend — is in
 * `tests/integration/story-end-to-end.test.ts` ("… Task M7").
 */

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const ROOT = "11111111-1111-4111-8111-111111111111";
const ATTACK = "22222222-2222-4222-8222-222222222222";
const A = "provider:a";
const B = "provider:b";
const C = "provider:c";
const D = "provider:d";

/** A plans the story, D checks it. */
const POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: A,
  storyCheckerRoleRef: D,
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 }),
  checkerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: 50_000,
  perStoryOverrunBasisPoints: 2_000,
  registerVersion: 7
});

const SNAPSHOT: StoryWriteInput = Object.freeze<StoryWriteInput>({
  runId: "33333333-3333-4333-8333-333333333333",
  workItemId: "44444444-4444-4444-8444-444444444444",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  questionLine: "Should the team adopt a four-day week?",
  argumentLanguage: { tag: "en", name: "English" },
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

const CRITERIA = {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
  no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
  goal_marked_as_reading: true, speaks_to_the_person: true
};
const CHECKER_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: CRITERIA });
const CHECKER_OBJECTS = JSON.stringify({
  satisfied: false, objection: "The summary overstates the answer (P1).",
  criteria: { ...CRITERIA, no_overstatement: false }
});

const isStoryteller = (request: ProviderCallRequest): boolean =>
  readPromptFrame(request.packet).contractId === STORYTELLER_CONTRACT_ID;

/** The story seam's refusal, raised before anything is sent. */
const storyMoney = (): Error => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope");

type Answer = (request: ProviderCallRequest) => string | Error;
const satisfied: Answer = (request) => (isStoryteller(request) ? story() : CHECKER_SATISFIED);
const refusesEverything: Answer = () => storyMoney();

/**
 * One claim-eligible maker's gateway. It applies the call's own content
 * classifier, as the real gateway does, and keeps a ledger of what it SENT: a
 * refusal is raised before sending, so a refused try leaves nothing there.
 */
function makerDouble(providerRef: string, answer: Answer) {
  const tried: ProviderCallRequest[] = [];
  const sent: string[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      tried.push(request);
      const content = answer(request);
      if (content instanceof Error) throw content;
      sent.push(request.callSiteKey);
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(
          1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected"
        );
      }
      return {
        rawArtifactRef: `artifact:${providerRef}:${String(sent.length)}`,
        ledgerEntryRef: `ledger:${providerRef}:${String(sent.length)}`,
        content,
        provider: "openai-compatible-http",
        model: `${providerRef}/model`,
        maker: `maker of ${providerRef}`,
        modelVersion: `${providerRef}/model`
      };
    }
  };
  return { providerRef, provider, tried, sent };
}

type Maker = ReturnType<typeof makerDouble>;

/** Micro-units per million tokens, input and output alike. */
const price = (perToken: number) => Object.freeze({
  inputMicrosPerMillionTokens: perToken * 1_000_000, outputMicrosPerMillionTokens: perToken * 1_000_000
});

/**
 * Every price strictly different, so an order is never a tie broken by the
 * roster: D (the planned checker) is the cheapest, then C, then B; A (the
 * planned storyteller) is the dearest.
 */
const PRICES: ProviderPriceMap = new Map([[A, price(9)], [B, price(5)], [C, price(2)], [D, price(1)]]);

function run(makers: readonly Maker[], options: {
  readonly prices?: ProviderPriceMap;
  readonly wired?: boolean;
  readonly stepLease?: StoryStepLease;
} = {}) {
  const inserted: StoryRecordInput[] = [];
  const events: string[] = [];
  const writer = new StoryWriter({
    pool: {} as Pool,
    pack: PACK,
    policy: POLICY,
    hosted: true,
    resolveProvider: () => null,
    log: (event) => { events.push(event); },
    repository: { insert: async (record) => { inserted.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map()
  });
  const roster = makers.map((maker) => ({ provider: maker.provider, providerRef: maker.providerRef }));
  const input: StoryWriteInput = {
    ...SNAPSHOT,
    // The run's own claim-eligible makers, exactly as the runner hands them over.
    resolveProvider: (roleRef) => roster.find((maker) => maker.providerRef === roleRef) ?? null,
    ...(options.wired === false ? {} : { costFallback: storyCostFallback(roster, options.prices ?? PRICES) }),
    ...(options.stepLease === undefined ? {} : { stepLease: options.stepLease })
  };
  return { write: () => writer.writeAfterSettle(input), inserted, events };
}

function sites(maker: Maker): readonly string[] {
  return maker.tried.map((request) => request.callSiteKey);
}

describe("M7 · the story's cheaper model: a money refusal tries the run's other makers", () => {
  it("makes no fallback when the planned storyteller and checker go through", async () => {
    const [a, b, c, d] = [makerDouble(A, satisfied), makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    const { write, inserted } = run([a, b, c, d]);
    await write();
    expect(inserted[0]).toMatchObject({
      outcome: "READY",
      storytellerLineage: { provider_ref: A, maker: `maker of ${A}`, model_id: `${A}/model` },
      checkerLineage: { provider_ref: D, maker: `maker of ${D}`, model_id: `${D}/model` }
    });
    expect([sites(a), sites(b), sites(c), sites(d)]).toEqual([["STORY:STORYTELLER:1"], [], [], ["STORY:CHECKER:1"]]);
  });

  /**
   * M7 review ruling: the storyteller's fallback is STRICTLY cheapest first,
   * the planned checker's maker included. The storyteller and the checker
   * share ONE story total (60 000), so steering the storyteller to a dearer
   * maker can leave the checker unpaid and fail a story that cheapest-first
   * would have made READY. Diversity is preferred on the checker's side only,
   * and the lineage shows when one maker did both jobs.
   */
  it("tries the cheapest maker first, even the planned checker's, and the lineage names the maker that wrote", async () => {
    const a = makerDouble(A, refusesEverything);
    const [b, c, d] = [makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    const { write, inserted } = run([a, b, c, d]);
    await write();
    // A was asked first and refused before sending; D — the cheapest, and the
    // planned checker's maker — wrote; C and B, dearer, were never asked. The
    // planned checker is still asked first for the check, and D fits.
    expect(sites(a)).toEqual(["STORY:STORYTELLER:1"]);
    expect(a.sent).toEqual([]);
    expect(sites(d)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(sites(c)).toEqual([]);
    expect(sites(b)).toEqual([]);
    // The stored lineage is the model ACTUALLY used, so the PDF's "Written by"
    // names it — and shows that one maker did both jobs.
    expect(inserted[0]).toMatchObject({
      outcome: "READY",
      storytellerLineage: { provider_ref: D, maker: `maker of ${D}`, model_id: `${D}/model`, transport: "openai-compatible-http" },
      checkerLineage: { provider_ref: D, maker: `maker of ${D}` },
      artifactRefs: [`artifact:${D}:1`, `artifact:${D}:2`]
    });
  });

  it("follows the price map, not the roster order", async () => {
    const a = makerDouble(A, refusesEverything);
    const [b, c, d] = [makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    // Now B is the cheapest, listed after C.
    const { write, inserted } = run([a, c, b, d], { prices: new Map([[A, price(9)], [B, price(1)], [C, price(5)], [D, price(3)]]) });
    await write();
    expect(sites(b)).toEqual(["STORY:STORYTELLER:1"]);
    expect(sites(c)).toEqual([]);
    expect(inserted[0]?.storytellerLineage?.provider_ref).toBe(B);
  });

  it("sends the SAME call site and the SAME framed prompt bytes to every maker it tries", async () => {
    const a = makerDouble(A, refusesEverything);
    const b = makerDouble(B, refusesEverything);
    const [c, d] = [makerDouble(C, satisfied), makerDouble(D, satisfied)];
    // B, the cheapest fallback, is refused too, so C writes on the second try.
    const { write, inserted } = run([a, b, c, d], { prices: new Map([[A, price(9)], [B, price(1)], [C, price(5)], [D, price(7)]]) });
    await write();
    expect(inserted[0]?.storytellerLineage?.provider_ref).toBe(C);
    const planned = a.tried[0]!;
    const tries = [b.tried[0]!, c.tried[0]!];
    expect(tries.map((request) => request.providerRef)).toEqual([B, C]);
    for (const request of tries) {
      expect(request.callSiteKey).toBe("STORY:STORYTELLER:1");
      expect(request.lane).toBe("story");
      expect(request.role).toBe("SYNTHESIZER");
      expect(request.runId).toBe(planned.runId);
      expect(request.subjectItemId).toBe(planned.subjectItemId);
      expect(request.contractHash).toBe(planned.contractHash);
      expect(request.bound).toEqual(planned.bound);
      // The framed prompt is the planned call's own object: never rebuilt.
      expect(request.packet).toBe(planned.packet);
      expect(JSON.stringify(request.packet)).toBe(JSON.stringify(planned.packet));
    }
    // Only the provider changes.
    const { providerRef: _planned, ...plannedRest } = planned;
    const { providerRef: _served, ...servedRest } = c.tried[0]!;
    expect(Object.keys(servedRest).sort()).toEqual(Object.keys(plannedRest).sort());
  });

  it("lets the checker prefer a maker other than the one that wrote the draft, even when that one is cheaper", async () => {
    const a = makerDouble(A, refusesEverything);
    const d = makerDouble(D, refusesEverything);
    const [b, c] = [makerDouble(B, satisfied), makerDouble(C, satisfied)];
    const { write, inserted } = run([a, b, c, d]);
    await write();
    // D, the cheapest, was refused, so C wrote. D, the planned checker, was
    // refused again; C is cheaper than B but wrote the draft, so B checked it
    // (and A, dearer, was not asked).
    expect(sites(c)).toEqual(["STORY:STORYTELLER:1"]);
    expect(sites(d)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(sites(b)).toEqual(["STORY:CHECKER:1"]);
    expect(sites(a)).toEqual(["STORY:STORYTELLER:1"]);
    expect(inserted[0]).toMatchObject({
      outcome: "READY",
      storytellerLineage: { provider_ref: C },
      checkerLineage: { provider_ref: B, maker: `maker of ${B}`, model_id: `${B}/model` }
    });
    // Same call site, same framed prompt, for the checker too.
    const plannedCheck = d.tried.find((request) => request.callSiteKey === "STORY:CHECKER:1")!;
    expect(b.tried[0]!.packet).toBe(plannedCheck.packet);
    expect(b.tried[0]!.role).toBe("EVALUATOR");
  });

  it("lets the checker check with the draft's own writer only when no other maker fits", async () => {
    const a = makerDouble(A, refusesEverything);
    const d = makerDouble(D, refusesEverything);
    const b = makerDouble(B, refusesEverything);
    const c = makerDouble(C, satisfied);
    const { write, inserted } = run([a, b, c, d]);
    await write();
    // D refused, so C wrote. The check: D (planned) refused, then B and A
    // (cheapest first) refused, and only then C, the draft's own writer.
    expect(sites(c)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(sites(d)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(sites(b)).toEqual(["STORY:CHECKER:1"]);
    expect(sites(a)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(inserted[0]).toMatchObject({
      outcome: "READY", storytellerLineage: { provider_ref: C }, checkerLineage: { provider_ref: C }
    });
  });

  it("runs every try inside its own short step lease", async () => {
    let held = 0;
    let entries = 0;
    const outside: string[] = [];
    const stepLease: StoryStepLease = async (use) => {
      held += 1;
      entries += 1;
      try {
        return await use();
      } finally {
        held -= 1;
      }
    };
    const watched = (answer: Answer): Answer => (request) => {
      if (held === 0) outside.push(request.providerRef);
      return answer(request);
    };
    const a = makerDouble(A, watched(refusesEverything));
    const [b, c, d] = [makerDouble(B, watched(satisfied)), makerDouble(C, watched(satisfied)), makerDouble(D, watched(satisfied))];
    const { write, inserted } = run([a, b, c, d], { stepLease });
    await write();
    expect(inserted[0]?.outcome).toBe("READY");
    expect(outside).toEqual([]);
    // enrichment + A (refused) + D (wrote) + D (checked) + insert.
    expect(entries).toBe(5);
  });
});

describe("M7 · only after every maker is refused does the story end as it does today", () => {
  it("round 1 refused by every maker: FAILED/STORY_ENVELOPE_EXHAUSTED, the planned call's own refusal as cause", async () => {
    const makers = [A, B, C, D].map((ref) => makerDouble(ref, refusesEverything));
    const { write, inserted, events } = run(makers);
    await write();
    expect(inserted).toEqual([expect.objectContaining({
      outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", rounds: 0, artifactRefs: [],
      storytellerLineage: null, checkerLineage: null, body: null
    })]);
    expect(events).toContain("STORY_LOOP_FAILED");
    // Each maker was asked once, and none sent anything.
    for (const maker of makers) {
      expect(sites(maker), maker.providerRef).toEqual(["STORY:STORYTELLER:1"]);
      expect(maker.sent, maker.providerRef).toEqual([]);
    }
  });

  it("round 2 refused by every maker keeps round 1's checked draft and its objection (as today)", async () => {
    const answer = (round2Refused: boolean): Answer => (request) => {
      if (isStoryteller(request)) {
        return round2Refused && request.callSiteKey === "STORY:STORYTELLER:2" ? storyMoney() : story();
      }
      return CHECKER_OBJECTS;
    };
    const a = makerDouble(A, answer(true));
    const [b, c] = [makerDouble(B, answer(true)), makerDouble(C, answer(true))];
    const d = makerDouble(D, answer(true));
    const { write, inserted, events } = run([a, b, c, d]);
    await write();
    expect(inserted[0]).toMatchObject({
      outcome: "READY_WITH_RESERVATION",
      reservation: "The summary overstates the answer (P1).",
      storytellerLineage: { provider_ref: A },
      checkerLineage: { provider_ref: D },
      rounds: 1
    });
    expect(events).toContain("STORY_LATER_ROUND_FAILED");
    for (const maker of [a, b, c, d]) {
      expect(maker.tried.filter((request) => request.callSiteKey === "STORY:STORYTELLER:2"), maker.providerRef).toHaveLength(1);
    }
  });

  it("with no fallback handed over, a money refusal is today's STORY_ENVELOPE_EXHAUSTED at once", async () => {
    const a = makerDouble(A, refusesEverything);
    const [b, c, d] = [makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    const { write, inserted } = run([a, b, c, d], { wired: false });
    await write();
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED" });
    expect([sites(b), sites(c), sites(d)]).toEqual([[], [], []]);
  });
});

describe("M7 · the fallback is for the story's MONEY refusal only (J24's one exception)", () => {
  it.each([
    ["the attempt allowance", () => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "spent"), "STORY_ENVELOPE_EXHAUSTED"],
    ["the RUN's money refusal", () => new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "spent"), "STORY_ENVELOPE_EXHAUSTED"],
    ["a dead transport", () => new ProviderCallFailedError(new Error("socket hang up"), 2, "TIMED_OUT", "ledger:dead"), "STORY_TRANSPORT_DEATH"],
    ["a plain error", () => new Error("bug"), "STORY_UNEXPECTED_ERROR"]
  ])("never substitutes a maker for %s", async (_name, failure, failureCode) => {
    const a = makerDouble(A, () => failure());
    const [b, c, d] = [makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    const { write, inserted } = run([a, b, c, d]);
    await write();
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode });
    expect([sites(b), sites(c), sites(d)]).toEqual([[], [], []]);
  });

  it("stops at the first fallback that fails for any reason but money, with that failure", async () => {
    const a = makerDouble(A, refusesEverything);
    // D, the cheapest fallback, has a dead transport; C and B would have fit.
    const d = makerDouble(D, () => new ProviderCallFailedError(new Error("socket hang up"), 2, "TIMED_OUT", "ledger:dead"));
    const [b, c] = [makerDouble(B, satisfied), makerDouble(C, satisfied)];
    const { write, inserted } = run([a, b, c, d]);
    await write();
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_TRANSPORT_DEATH" });
    expect(sites(d)).toEqual(["STORY:STORYTELLER:1"]);
    expect(sites(c)).toEqual([]);
    expect(sites(b)).toEqual([]);
  });

  it("an ABSENT story role is still STORY_ROLE_UNAVAILABLE, with every other maker healthy and the fallback wired", async () => {
    const [b, c, d] = [makerDouble(B, satisfied), makerDouble(C, satisfied), makerDouble(D, satisfied)];
    // A, the planned storyteller, is not among the run's claim-eligible makers.
    const { write, inserted } = run([b, c, d]);
    await write();
    expect(inserted).toEqual([expect.objectContaining({ outcome: "FAILED", failureCode: "STORY_ROLE_UNAVAILABLE", rounds: 0 })]);
    expect([sites(b), sites(c), sites(d)]).toEqual([[], [], []]);
  });
});

describe("M7 · wired in the shipped runner, with Task M3's fallback reused", () => {
  it("hands every run's story the run's own claim-eligible makers and the runner's price map", async () => {
    const runner = await readFile("apps/runner/src/index.ts", "utf8");
    const snapshot = runner.slice(runner.indexOf("input: buildStoryRunSnapshot({"), runner.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };'));
    expect(snapshot).toContain("costFallback: storyCostFallback(synthesisMakers, servePrices)");
    // The story's fallback IS the answer-writer's: one function, not a copy.
    const helper = runner.slice(runner.indexOf("export function storyCostFallback("));
    expect(helper.slice(0, helper.indexOf("\n}\n"))).toContain("callServeRoleWithFallback({");
    expect(runner.split("export async function callServeRoleWithFallback<")).toHaveLength(2);
    expect(runner.split("export function servePhaseFallbackOrder(")).toHaveLength(2);
    // Still one framed-prompt builder in the runner (paid plans S1a: the scorecard's
    // `buildSynthesisRolePrompt` replaced dev's two): the story frames its own in packages/story.
    expect(runner.split(/\bbuildFramedPrompt\(/u).length - 1).toBe(1);
  });

  it("passes the fallback through the snapshot untouched", async () => {
    const snapshot = await readFile("apps/runner/src/story-snapshot.ts", "utf8");
    expect(snapshot).toContain("costFallback: source.costFallback");
  });

  it("keeps the story's money predicate in the story package, on its own seam's code", async () => {
    const writer = await readFile("packages/story/src/writer.ts", "utf8");
    expect(writer).toContain("refusedForMoney: isStoryMoneyRefusal");
    expect(writer).toMatch(/error\.code === STORY_COST_ENVELOPE_REACHED/u);
    // An absent role is refused before any call, fallback or not.
    expect(writer).toContain('return failedRecord(input, "STORY_ROLE_UNAVAILABLE", pack);');
  });
});
