import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { Judge } from "@debateai/judgement";
import { TEXT_NOT_IN_QUESTION_LANGUAGE, argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { readPromptFrame, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, lengthGuidancePolicyStartValues, resolveDebateShape, resolveLengthGuidance
} from "@debateai/register";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";
import {
  guidedCallBound, runQuestionLanguageLock, runReviewCatchUp, type ReviewCatchUpDependencies
} from "../../apps/runner/src/index.js";

// Pre-flight PF-L51 (BLOCKER): the strip pattern is the WHOLE directive in each form, both sentences, because the second
// sentence names "fatalFlags[].type" and would send every review and checker call to PANEL if it stayed. So the inputs
// are the real directives, never hand-written first sentences.
describe("the test doubles read all three language forms", () => {
  it("strips today's named form, today's fallback form, and the locked sentence, whole", () => {
    for (const text of [argumentLanguageDirective("English"), argumentLanguageDirective("Romanian"), argumentLanguageDirective(""),
      questionLanguageSentence({ code: "en", name: "English" }),
      questionLanguageSentence({ code: "sr-Latn", name: "Serbian (Latin script)" })]) {
      const stripped = stripLanguageDirectiveForTest(`Instruction. ${text}`);
      expect(stripped.trim()).toBe("Instruction.");
      expect(stripped).not.toContain("fatalFlags");
    }
  });
});

/**
 * P2L Task 17 — THE RUNNER'S WIRING, read off its source (CI skips the integration suites that argue a shaped run, so
 * this is the gate that sees a call site lose the lock). Binding note 3: root 0's room gets the lock in the SAME change
 * as the judge inputs (else the room under-counts every attempt by the sentence and the field).
 */
describe("the runner passes a shaped run's lock to every call site", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
  const declared = source.indexOf("const shapeLanguage: QuestionLanguage | null = runQuestionLanguageLock(shapeShape, run);");

  it("decides the lock by the shape receipt, before the map stage sizes root 0's room", () => {
    // Final review I2 (ruling L-SHAPED-ONLY): the RECEIPT decides, not `shapeRun` (which is null for one maker at claim).
    expect(declared).toBeGreaterThan(source.indexOf("const shapeShape = envelopeBasis.shape ?? null;"));
    expect(declared).toBeGreaterThan(source.indexOf("const shapeRun = "));
    const room = source.indexOf("rootZeroKeepRoomMicros({ prices: rootZeroPrices, ...rootZeroRoomAttempts({");
    expect(room).toBeGreaterThan(declared);
    expect(source.slice(room, source.indexOf("}) });", room))).toContain("questionLanguage: shapeLanguage");
  });

  it("every judge input (panel, root, child leg, review) and root 0's room carry it, in one change", () => {
    const sites = [...source.matchAll(/argumentLanguageName: run\.argumentLanguageName,(\s*\.\.\.shapeLanguageInput,| questionLanguage: shapeLanguage,)?/gu)]
      .filter((match) => match.index > declared);
    // Five judge inputs, and (engine redesign R2a A14) the investigator's and (R2b B5) the comparing judges': each one
    // carries the lock.
    expect(sites).toHaveLength(7);
    for (const site of sites) expect(site[1]).toBeDefined();
  });

  it("the writer, the checker, both readings and the story carry it", () => {
    // V4 reading level (owner N6, 2026-10-29): the run's level follows the lock as the sixth argument.
    expect(source).toContain("buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, synthesisLength,\n          shapeLanguage, readingLevel);");
    expect(source).toContain("buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, checkerLength, shapeLanguage,\n          readingLevel);");
    expect(source).toContain("const readingLevel: ReadingLevel | null = readingLevelOf(run.depthParams);");
    expect(source).toContain("languageLocked: shapeLanguage !== null,\n              // V4 reading level (owner N6): the story is written for the person's level; null, today's story.\n              readingLevel,");
    expect(source).toContain("questionLine: run.questionLine,\n          ...shapeLanguageInput\n        }, reply));");
    expect(source).toContain("classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage)");
    expect(source).toContain("languageLocked: shapeLanguage !== null,");
  });
});

/**
 * Final review I2, ruling L-SHAPED-ONLY: the runner reads the lock whenever the run's RECEIPT has a shape — so a shaped
 * receipt left with one maker at claim (no `shapeRun`, today's single-position path) keeps its lock and is told and
 * checked in ONE language — and never for a receipt with no shape, whatever pair it stored.
 */
describe("runQuestionLanguageLock: the receipt's shape decides the lock", () => {
  const SHAPE = Object.freeze({ plan: "free", answers: 2 });
  const stored = { argumentLanguageTag: "sr-Latn", argumentLanguageName: "Serbian (Latin script)" };

  it("a shaped receipt reads the stored pair back as the lock, whatever the maker count at claim", () => {
    expect(runQuestionLanguageLock(SHAPE, stored)).toEqual({ code: "sr-Latn", name: "Serbian (Latin script)" });
  });

  it("a receipt with no shape is never locked, even with a lock-looking stored pair", () => {
    expect(runQuestionLanguageLock(null, stored)).toBeNull();
    expect(runQuestionLanguageLock(undefined, stored)).toBeNull();
  });

  it("a shaped receipt with a stored pair that cannot be a lock (\"und\", the fallback name) is not locked", () => {
    expect(runQuestionLanguageLock(SHAPE, { argumentLanguageTag: "und", argumentLanguageName: "" })).toBeNull();
  });

  it("the call sites read the receipt's shape, not the claim's shape context", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    // P2d Task 7c (controller ruling D-CATCHUP): the definition, the run's own call, and the review catch-up's.
    expect(source.match(/runQuestionLanguageLock\(/gu)).toHaveLength(3);
    expect(source).toContain("const shapeLanguage: QuestionLanguage | null = runQuestionLanguageLock(shapeShape, run);");
    expect(source).toContain("runQuestionLanguageLock(parseCostEnvelopeBasis(input.envelopeBasis).shape ?? null, {");
    expect(source).not.toContain("shapeRun === null ? null\n      : questionLanguageFromRun(");
  });
});

/**
 * P2d Task 7c (controller ruling D-CATCHUP; P2L final review M15) — THE REVIEW CATCH-UP TAKES THE RUN'S LOCK. The
 * operator's catch-up (`job:review-catch-up`) reviews the nodes a run left unreviewed. It reads the lock off the run's
 * receipt exactly as the runner's own reviews do (`runQuestionLanguageLock`, ruling L-SHAPED-ONLY): a shaped receipt
 * locks the review to the stored pair; a receipt with no shape, a shaped one whose stored pair cannot be a lock, or no
 * receipt at all keeps today's review input, byte for byte.
 */
describe("the review catch-up takes the run's lock exactly as the runner's own reviews do", () => {
  const RO = Object.freeze({ code: "ro", name: "Romanian" });
  const FALLBACK_NAME = "the same language as the question";
  // A question today's guesser cannot name ("und", as review I8's case), so only the lock can refuse a French reply.
  const QUESTION = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
  // The receipt test's own terms and shape (tests/unit/debate-shape-receipt.test.ts): a receipt admission really mints.
  const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
    maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
  const PANEL = 5;
  const CAP = 5;
  const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: PANEL,
    settings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } })!;
  const SHAPED: unknown = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, maxDepth: CAP, panelSize: PANEL,
    depth: 3, backupSequencesProvisioned: 0, shape: SHAPE })));
  const LEGACY: unknown = JSON.parse(JSON.stringify(fixtureStructuralCeiling(20)));
  const STOP = Object.freeze({ finishReason: "stop" });
  const FRENCH_REVIEW = JSON.stringify({ outcome: "dispute", reasons: [
    "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays.",
    "Les entreprises du pays perdraient leur protection si la banque centrale abandonnait la monnaie nationale."
  ], edge_bearings: [] });
  const systemOf = (packet: { messages: readonly { role: string; content: string }[] }) =>
    packet.messages.find((message) => message.role === "system")!.content;

  type CatchUpLanguage = Readonly<{ argumentLanguageName?: string; argumentLanguageTag?: string; envelopeBasis?: unknown }>;

  /** Runs the catch-up over one unreviewed node and returns the input its one review call was given. */
  async function catchUpReviewInput(language: CatchUpLanguage): Promise<Readonly<Record<string, unknown>>> {
    const seen: unknown[] = [];
    const node = Object.freeze({ nodeId: "node:1", statement: "A claim", authorMaker: "maker:a",
      authorRawArtifactRef: "artifact:author", sourcedEdges: Object.freeze([]) });
    const dependencies: ReviewCatchUpDependencies = {
      withContentLease: async (_runId, use) => use(),
      readPinnedReviewers: async () => null,
      probePinnedPanel: async () => [{
        maker: "maker:b", providerRef: "provider:b",
        review: async (input) => {
          seen.push(input);
          return { outcome: "agree", reasons: ["reviewed"], provenanceRef: "artifact:review", edgeMeasurements: [] };
        }
      }],
      readUnreviewedNodes: async () => [node],
      readDisclosedNodeIds: async () => [node.nodeId],
      readLatestReviewerMaker: async () => null,
      recordReviewWithMeasurements: async () => "review:1",
      countRunModelAttempts: async () => 0,
      readPinnedMaximumAttempts: async () => 10,
      prepareVersion: async () => ({
        terminalBefore: "SERVED", terminalAfter: "SERVED", numberBefore: 0.7, numberAfter: 0.7,
        floorBefore: null, floorAfter: null, nowVisible: 1, stillSetAside: 0,
        persist: async () => ({ answerVersion: 2 })
      })
    };
    await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:original", questionLine: QUESTION,
      ...language,
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 }, judgeContractHash: "contract:judge",
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies
    });
    expect(seen).toHaveLength(1);
    return seen[0] as Readonly<Record<string, unknown>>;
  }

  /** The request a real reviewer (`Judge.review`) hands its gateway for that input: the packet and its reply check. */
  async function requestOf(input: Readonly<Record<string, unknown>>): Promise<ProviderCallRequest> {
    let captured: ProviderCallRequest | undefined;
    const gateway = { call: async (request: ProviderCallRequest) => { captured = request; throw new Error("captured"); } } as unknown as ProviderGateway;
    await new Judge(gateway).review(input as never).catch(() => undefined);
    return captured!;
  }

  it("no receipt, or a receipt with no shape: today's review input, byte for byte, whatever pair it stored", async () => {
    expect(parseCostEnvelopeBasis(LEGACY).shape).toBeUndefined();   // control: this receipt really has no shape
    // The job's call before Task 7c: the stored name only.
    const today = await catchUpReviewInput({ argumentLanguageName: "Romanian" });
    expect(Object.keys(today).sort()).toEqual(["argumentLanguageName", "authorMaker", "bound", "callSiteKey", "contractHash",
      "edges", "providerRef", "questionLine", "runId", "statement", "subjectItemId"]);
    const variants: readonly CatchUpLanguage[] = [
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: LEGACY },
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro" }
    ];
    for (const variant of variants) {
      const input = await catchUpReviewInput(variant);
      expect(JSON.stringify(input)).toBe(JSON.stringify(today));
      expect("questionLanguage" in input).toBe(false);
    }
    // And the reviewer frames it as today: today's directive, today's three fields.
    const packet = (await requestOf(today)).packet;
    expect(systemOf(packet)).toContain(argumentLanguageDirective("Romanian"));
    expect(readPromptFrame(packet).fields.map((field) => field.name))
      .toEqual(["question_line", "statement", "edges_sourced_by_this_node"]);
  });

  it("a shaped receipt whose stored pair cannot be a lock (\"und\", the fallback name) keeps today's review input", async () => {
    const today = await catchUpReviewInput({ argumentLanguageName: FALLBACK_NAME });
    for (const tag of ["und", "ro"]) {
      const input = await catchUpReviewInput({ argumentLanguageName: FALLBACK_NAME, argumentLanguageTag: tag, envelopeBasis: SHAPED });
      expect(JSON.stringify(input)).toBe(JSON.stringify(today));
    }
  });

  it("a shaped receipt tells the review its locked language: the one sentence and the field last, never the vague form", async () => {
    expect(parseCostEnvelopeBasis(SHAPED).shape).toEqual(SHAPE);   // control: this receipt really has a shape
    const input = await catchUpReviewInput({ argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: SHAPED });
    expect(input.questionLanguage).toEqual(RO);
    // The same lock the runner's own reviews get for this receipt and pair: one helper, one rule.
    expect(input.questionLanguage).toEqual(runQuestionLanguageLock(parseCostEnvelopeBasis(SHAPED).shape,
      { argumentLanguageTag: "ro", argumentLanguageName: "Romanian" }));
    const packet = (await requestOf(input)).packet;
    expect(systemOf(packet)).toContain(questionLanguageSentence(RO));
    expect(systemOf(packet)).not.toContain(argumentLanguageDirective("Romanian"));
    expect(systemOf(packet)).not.toContain("the language of the question");
    expect(readPromptFrame(packet).fields.map((field) => field.name))
      .toEqual(["question_line", "statement", "edges_sourced_by_this_node", "question_language"]);
    expect(readPromptFrame(packet).fields.at(-1)!.content).toBe('{"code":"ro","name":"Romanian"}');
  });

  it("a shaped receipt's review is checked in the lock: a French reply is refused, and today's review lets it through", async () => {
    const locked = (await requestOf(await catchUpReviewInput(
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: SHAPED }))).classifyContent!(FRENCH_REVIEW, STOP);
    expect(locked.parseStatus).toBe("SCHEMA_FAILED");
    const issues = JSON.parse(locked.parseError!) as { code: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.code === TEXT_NOT_IN_QUESTION_LANGUAGE)).toBe(true);
    const today = (await requestOf(await catchUpReviewInput(
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: LEGACY }))).classifyContent!(FRENCH_REVIEW, STOP);
    expect(today.parseStatus).toBe("PARSED");
  });

  // Task 12 review 2-4 (R1c final wave A7, B9): a catch-up review is sized and told like the run's own reviews, from the
  // receipt's `length`, in the run's stored language tag (the one the lock reads), never a null tag.
  const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "standard" });
  const LENGTHED: unknown = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, maxDepth: CAP, panelSize: PANEL,
    depth: 3, backupSequencesProvisioned: 0, length: GUIDANCE })));
  const JUDGE_BOUND = { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 };

  it("a lengthed receipt: the reviewer's words, the guided bound and guidedWords; a zh run reads the characters form", async () => {
    const input = await catchUpReviewInput({ argumentLanguageName: "Chinese", argumentLanguageTag: "zh", envelopeBasis: LENGTHED });
    expect(input.length).toEqual({ words: GUIDANCE.steps.reviewer, languageCode: "zh", charactersPerWord: GUIDANCE.charactersPerWord });
    expect(input.bound).toEqual({ ...guidedCallBound(JUDGE_BOUND, "reviewer", GUIDANCE), maxAttempts: JUDGE_BOUND.maxAttempts });
    expect((input.bound as { tokenCeiling: number }).tokenCeiling).toBeGreaterThan(JUDGE_BOUND.tokenCeiling);
    const request = await requestOf(input);
    expect(request.guidedWords).toBe(GUIDANCE.steps.reviewer);
    const frame = readPromptFrame(request.packet);
    expect(frame.contractId).toBe("judge.review.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "length",
      content: `about ${String(Math.round(GUIDANCE.steps.reviewer * GUIDANCE.charactersPerWord.zh))} characters` });
  });

  it("a lengthed receipt with no stored tag uses the tag the lock reads (\"und\"), words form", async () => {
    const input = await catchUpReviewInput({ argumentLanguageName: "Romanian", envelopeBasis: LENGTHED });
    expect((input.length as { languageCode: unknown }).languageCode).toBe("und");
    const frame = readPromptFrame((await requestOf(input)).packet);
    expect(frame.fields.at(-1)).toEqual({ name: "length", content: `about ${String(GUIDANCE.steps.reviewer)} words` });
  });

  it("a receipt without length: no length key, today's bound", async () => {
    const input = await catchUpReviewInput({ argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: LEGACY });
    expect("length" in input).toBe(false);
    expect(input.bound).toEqual(JUDGE_BOUND);
  });
});

/**
 * P2L final review M15, moved by P2d Task 7c (controller ruling D-CATCHUP): the review catch-up has ONE caller, the
 * operator job, and it hands the catch-up the run's receipt and stored tag from the run's frozen head, so a shaped run's
 * catch-up reviews in its lock. The runner itself never calls it. A new caller must pass the same two fields, and this
 * pin moves with it.
 */
describe("the review catch-up's one caller hands it the receipt and the stored tag", () => {
  it("the operator job passes the run's envelope basis and tag; the runner only defines the catch-up", async () => {
    const { readFile } = await import("node:fs/promises");
    const runner = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const job = await readFile(new URL("../../acceptance/review-catch-up.ts", import.meta.url), "utf8");
    expect(runner.match(/runReviewCatchUp\(/gu)).toHaveLength(1);
    expect(runner).toContain("export async function runReviewCatchUp(input: {");
    expect(job.match(/runReviewCatchUp\(/gu)).toHaveLength(1);
    expect(job).toContain("new RunRepository(pool).readFrozenHead(runId)");
    const start = job.indexOf("await runReviewCatchUp({");
    const end = job.indexOf("dependencies\n    });", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const call = job.slice(start, end);
    expect(call).toContain("argumentLanguageName: run.argumentLanguageName,");
    expect(call).toContain("argumentLanguageTag: run.argumentLanguageTag,");
    expect(call).toContain("envelopeBasis: run.envelopeBasis,");
  });
});
