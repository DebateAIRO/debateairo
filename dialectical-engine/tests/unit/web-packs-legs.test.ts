// Web search (plan 2026-10-30 task W4-1; design PERPLEXITY-DESIGN.md v2 §3.5; owner answers 2026-10-29/30, item 7):
// who reads which pack. A path's case writer, defender and critic read its pack; a reply to a rival reads its own pack
// and the rival's; the reviewer, the comparing judges and the answer writer see only the one extract a point cites. Each
// pack is cut to the plan's ~3,000 tokens by one code rule (the pick's rank, then the extract order). A debate with no
// packs sends today's prompts, byte for byte. W4-7: the answer checker reads the extracts the writer read.
import { describe, expect, it } from "vitest";
import {
  LENGTH_GUIDANCE_START, engineMaterialOf, type EngineMaterialSource, type LengthGuide
} from "@debateai/kernel";
import {
  COMPARING_JUDGE_SOURCES_CONTRACT_ID, Judge, REVIEW_SOURCES_MATERIAL_FIELDS, askComparingJudge, comparingJudgeMaterialFields,
  framedJudgePromptForTest, judgeSourcesMaterialFields, rootPositionRequestBytesBound, type JudgeLeg
} from "@debateai/judgement";
import { readPromptFrame, type PromptPacket, type ProviderGateway } from "@debateai/providers";
import {
  SYNTHESIZER_LENGTH_SOURCES_CONTRACT_ID, buildEvaluatorRequest, buildSynthesisDigest, buildSynthesizerRequest, type DigestSourceNode,
  type SynthesisDigest
} from "@debateai/serve";
import { buildSynthesisRolePrompt } from "@debateai/runner";
import {
  WEB_PACK_LIMITS, WEB_ROOT_SOURCES_MAX_BYTES, debateWebPacks, engineSourceWithCitedExtracts, legWithWebSources, webCitedExtractsOf, webPackOf, webPackShown,
  webReviewInput, type WebPack
} from "../../apps/runner/src/web-packs.js";

const GUIDE: LengthGuide = { words: 120, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const Q = "Should I move from Cluj to Munich as a nurse?";
const page = (pageId: string, rank: number, site: string) =>
  ({ pageId, rank, title: `Page ${pageId}`, site, date: "2026-01-15", readDepth: "whole" as const });

/** Path a1 (S1-*) and path a2 (S2-*) kept packs; path a3 kept none. */
const PACKS: readonly WebPack[] = [
  { pathRef: "a1", pages: [page("p11", 1, "pay.example.de"), page("p12", 2, "union.example.de")],
    extracts: [{ label: "S1-1", pageId: "p11", quote: "Starting pay is EUR 3,400 a month." },
      { label: "S1-2", pageId: "p12", quote: "Night shifts add a quarter." }] },
  { pathRef: "a2", pages: [page("p21", 1, "rent.example.de")],
    extracts: [{ label: "S2-1", pageId: "p21", quote: "A one-room flat costs EUR 1,250." }] }
];
const DEBATE = debateWebPacks(PACKS)!;

const engineRoot = (answer: string): JudgeLeg => ({ kind: "assigned-root", assignedAnswer: answer,
  mapPoints: JSON.stringify({ for: [{ text: "Higher pay.", rests_on: "question" }], against: [] }),
  engine: { pointsRaised: "[]", assumptions: "[]" } });
const frameOf = (leg: JudgeLeg) => readPromptFrame(framedJudgePromptForTest(leg, Q, "English", "resolved", null, GUIDE).packet);
const sourcesOf = (leg: JudgeLeg): readonly Readonly<{ for: string; extracts: readonly Readonly<{ id: string }>[] }>[] =>
  JSON.parse(frameOf(leg).fields.find((field) => field.name === "sources")!.content) as never;
const webSourcesTextOf = (pack: WebPack): string =>
  frameOf(legWithWebSources(engineRoot("Yes."), debateWebPacks([pack])!, { own: pack.pathRef })).fields
    .find((field) => field.name === "sources")!.content;
const idsOf = (leg: JudgeLeg) => sourcesOf(leg).flatMap((pack) => pack.extracts.map((extract) => extract.id));

describe("each leg reads exactly its packs", () => {
  it("the case writer reads its own path's pack, under its sources variant, before the length", () => {
    const leg = legWithWebSources(engineRoot("Yes, the pay is higher."), DEBATE, { own: "a1" });
    const frame = frameOf(leg);
    expect(frame.contractId).toBe("judge.assigned-root.resolved.sources.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(judgeSourcesMaterialFields("assigned-root"));
    expect(sourcesOf(leg).map((pack) => pack.for)).toEqual(["assigned_answer"]);
    expect(idsOf(leg)).toEqual(["S1-1", "S1-2"]);
    expect(idsOf(legWithWebSources(engineRoot("No, rent eats it."), DEBATE, { own: "a2" }))).toEqual(["S2-1"]);
  });

  it("a defender and a critic read the pack of the path their chain is under; with a consideration, its variant", () => {
    const defender = legWithWebSources({ kind: "support", positionUnderDebate: "The pay is higher.", consideration: "Night pay." },
      DEBATE, { own: "a2" });
    expect(frameOf(defender).contractId).toBe("judge.support.consideration.resolved.length.sources.v1");
    expect(frameOf(defender).fields.map((field) => field.name)).toEqual(judgeSourcesMaterialFields("support", true));
    expect(idsOf(defender)).toEqual(["S2-1"]);
    const critic = legWithWebSources({ kind: "attack", positionUnderDebate: "The pay is higher." }, DEBATE, { own: "a1" });
    expect(frameOf(critic).contractId).toBe("judge.attack.resolved.length.sources.v1");
    expect(sourcesOf(critic).map((pack) => pack.for)).toEqual(["position_under_debate"]);
    expect(idsOf(critic)).toEqual(["S1-1", "S1-2"]);
  });

  it("a reply to a rival reads its own path's pack, then the rival's", () => {
    const cross = legWithWebSources({ kind: "cross-root", ownPosition: "Yes.", otherMakersPosition: "No." }, DEBATE,
      { own: "a2", rival: "a1" });
    expect(frameOf(cross).contractId).toBe("judge.cross-root.resolved.length.sources.v1");
    expect(sourcesOf(cross).map((pack) => pack.for)).toEqual(["own_position", "other_makers_position"]);
    expect(idsOf(cross)).toEqual(["S2-1", "S1-1", "S1-2"]);
    // A rival with no pack: its own pack alone.
    expect(idsOf(legWithWebSources({ kind: "cross-root", ownPosition: "Yes.", otherMakersPosition: "No." }, DEBATE,
      { own: "a1", rival: "a3" }))).toEqual(["S1-1", "S1-2"]);
  });

  it("the sources text holds quotes, titles, sites, dates and ids: never a page's text, address or row id", () => {
    const text = frameOf(legWithWebSources(engineRoot("Yes."), DEBATE, { own: "a1" })).fields.find((field) => field.name === "sources")!.content;
    expect(JSON.parse(text)).toEqual([{ for: "assigned_answer",
      pages: [{ page: 1, title: "Page p11", site: "pay.example.de", date: "2026-01-15", read: "whole" },
        { page: 2, title: "Page p12", site: "union.example.de", date: "2026-01-15", read: "whole" }],
      extracts: [{ id: "S1-1", page: 1, quote: "Starting pay is EUR 3,400 a month." }, { id: "S1-2", page: 2, quote: "Night shifts add a quarter." }] }]);
    for (const absent of ["page_id", "pageId", "\"p11\"", "url", "https://"]) expect(text).not.toContain(absent);
  });

  it("the reviewer reads only the extract the point names, under its sources variant; an uncited point, today's review", async () => {
    const packets: PromptPacket[] = [];
    const capturing: ProviderGateway = { call: async (request) => { packets.push(request.packet); throw new Error("captured"); } };
    const review = (extra: Readonly<{ citedExtract?: string }>) => new Judge(capturing).review({
      runId: null, subjectItemId: "w", callSiteKey: "JUDGE:review:n1", questionLine: Q, length: GUIDE, statement: "Pay is EUR 3,400.",
      authorMaker: "maker-a", providerRef: "p", contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
      edges: [], ...extra
    }).catch(() => undefined);
    await review(webReviewInput(DEBATE, { nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" }, true));
    await review(webReviewInput(DEBATE, { nodeId: "n2", wayOfKnowing: "REASONING", locator: null }, true));
    await review({});
    const [cited, uncited, today] = packets.map((packet) => readPromptFrame(packet));
    expect(cited!.contractId).toBe("judge.review.length.sources.v1");
    expect(cited!.fields.map((field) => field.name)).toEqual(REVIEW_SOURCES_MATERIAL_FIELDS);
    expect(JSON.parse(cited!.fields.find((field) => field.name === "cited_extract")!.content)).toEqual({ id: "S1-1",
      quote: "Starting pay is EUR 3,400 a month.", title: "Page p11", site: "pay.example.de", date: "2026-01-15" });
    expect(uncited!.contractId).toBe("judge.review.length.v1");
    expect(today!.contractId).toBe("judge.review.length.v1");
    expect(uncited!.fields).toEqual(today!.fields);
  });

  it("the comparing judges read each cited extract on its point or case, under their sources variant; no extract, v1", async () => {
    const source: EngineMaterialSource = {
      question: Q,
      answers: [{ letter: "A", rootNodeId: "r0", words: "Yes.", caseText: "The pay is higher.", assumptions: [] },
        { letter: "B", rootNodeId: "r1", words: "No.", caseText: "Rent eats it.", assumptions: [] }],
      points: [{ nodeId: "n1", text: "Pay is EUR 3,400.", relation: "SUPPORTS", targetRef: "r0", answerLetter: "A", fromRivalReply: null,
        restsOn: "question", status: "AGREE", reviewerReasons: [], honestFinalStrength: 0.7, investigation: null },
      { nodeId: "n2", text: "Rent is high.", relation: "SUPPORTS", targetRef: "r1", answerLetter: "B", fromRivalReply: null,
        restsOn: "question", status: "AGREE", reviewerReasons: [], honestFinalStrength: 0.6, investigation: null }]
    };
    const cited = webCitedExtractsOf(DEBATE, [{ nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" },
      { nodeId: "r1", wayOfKnowing: "LOOKED_UP", locator: "S2-1" }, { nodeId: "n2", wayOfKnowing: "REASONING", locator: null }]);
    const withExtracts = engineMaterialOf(engineSourceWithCitedExtracts(source, cited));
    const answers = JSON.parse(comparingJudgeMaterialFields({ material: withExtracts, seat: 1, length: GUIDE })
      .find((field) => field.name === "answers")!.content) as readonly Record<string, unknown>[];
    expect((answers[0]!.supporting_points as Record<string, unknown>[])[0]!.extract).toEqual({ id: "S1-1",
      quote: "Starting pay is EUR 3,400 a month.", title: "Page p11", site: "pay.example.de", date: "2026-01-15" });
    expect(answers[0]).not.toHaveProperty("case_extract");
    expect((answers[1]!.case_extract as Record<string, unknown>).id).toBe("S2-1");
    expect((answers[1]!.supporting_points as Record<string, unknown>[])[0]).not.toHaveProperty("extract");
    const packets: PromptPacket[] = [];
    const capturing: ProviderGateway = { call: async (request) => { packets.push(request.packet); throw new Error("captured"); } };
    const ask = (material: typeof withExtracts) => askComparingJudge(capturing, { runId: null, subjectItemId: "w",
      callSiteKey: "VERDICT:judge:1", material, seat: 1, length: GUIDE, providerRef: "p", contractHash: "h",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 } }).catch(() => undefined);
    await ask(withExtracts);
    await ask(engineMaterialOf(engineSourceWithCitedExtracts(source, new Map())));
    expect(packets.map((packet) => readPromptFrame(packet).contractId)).toEqual([COMPARING_JUDGE_SOURCES_CONTRACT_ID, "verdict.judge.v1"]);
    expect(engineSourceWithCitedExtracts(source, new Map())).toBe(source);
  });

  it("the answer writer reads each cited extract on its node under its sources variant; the checker reads the same (W4-7)", () => {
    const nodes = (extract: boolean): DigestSourceNode[] => [{ nodeId: "r0", statement: "Yes, the pay is higher.", finalStrength: 0.6,
      wayOfKnowing: "LOOKED_UP", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false,
      ...(extract ? { citedExtract: DEBATE.citedExtract("S1-1")! } : {}) }];
    const digest = (extract: boolean): SynthesisDigest => {
      const outcome = buildSynthesisDigest({ nodes: nodes(extract), servedRootNodeId: "r0", budgetBound: 8_192 });
      if (outcome.kind !== "DIGEST") throw new Error("digest");
      return outcome.digest;
    };
    const controls = { synthesizerRoleRef: "w", evaluatorRoleRef: "c", evaluatorLoopMaxRounds: 3 };
    const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: "r0", servedStrength: 0.6, margin: 0.1, registerVersion: 5 };
    const length = { answerWords: 120, ownWords: 60, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
    const writer = (extract: boolean) => readPromptFrame(buildSynthesisRolePrompt(buildSynthesizerRequest({ controls, round: 1,
      digest: digest(extract), codeLabel, prior: null }), "English", undefined, length).packet);
    expect(writer(true).contractId).toBe(SYNTHESIZER_LENGTH_SOURCES_CONTRACT_ID);
    expect(writer(true).fields.find((field) => field.name === "digest")!.content).toContain("\"extract\":{\"id\":\"S1-1\"");
    expect(writer(false).contractId).toBe("serve.synthesizer.length.v3");
    const checker = readPromptFrame(buildSynthesisRolePrompt(buildEvaluatorRequest({ controls, round: 1, digest: digest(true), codeLabel,
      candidateStatement: "Yes." }), "English", undefined, length).packet);
    // W4-7: the checker reads the digest the writer read, extracts and all, under its own sources variant.
    expect(checker.contractId).toBe("serve.evaluator.length.sources.v1");
    expect(checker.fields.find((field) => field.name === "digest")!.content)
      .toBe(writer(true).fields.find((field) => field.name === "digest")!.content);
  });
});

describe("the pack-size cut: the plan's ~3,000 tokens, by the pick's rank then the extract order", () => {
  const quote = (n: number, chars: number) => `Quote ${String(n)} ${"w".repeat(chars)}`;
  /** A pack whose extracts are stored interleaved across pages (rank 2's first), far past the size. */
  const big: WebPack = {
    pathRef: "a1", pages: [page("top", 1, "one.example"), page("second", 2, "two.example")],
    extracts: Array.from({ length: 40 }, (_unused, at) => ({ label: `S1-${String(at + 1)}`, pageId: at % 2 === 0 ? "second" : "top",
      quote: quote(at + 1, 600) }))
  };

  it("keeps the pack within WEB_PACK_LIMITS.bytes (3,000 tokens at 4 bytes a token), rank 1's extracts first", () => {
    expect(WEB_PACK_LIMITS).toEqual({ tokens: 3000, bytesPerToken: 4, bytes: 12_000 });
    const shown = webPackShown(big);
    expect(Buffer.byteLength(JSON.stringify(shown), "utf8")).toBeLessThanOrEqual(12_000);
    expect(shown.extracts.length).toBeGreaterThan(0);
    expect(shown.extracts.length).toBeLessThan(40);
    // Rank 1 ("top": the even labels) in their own order, all of it before any of rank 2.
    expect(shown.extracts.map((extract) => extract.page)).toEqual([...shown.extracts.map((extract) => extract.page)].sort());
    expect(shown.extracts.filter((extract) => extract.page === 1).map((extract) => extract.id).slice(0, 3)).toEqual(["S1-2", "S1-4", "S1-6"]);
  });

  it("is the same bytes every time, and an extract that does not fit is skipped while a later shorter one still fits", () => {
    expect(JSON.stringify(webPackShown(big))).toBe(JSON.stringify(webPackShown({ ...big, extracts: [...big.extracts] })));
    const skipping: WebPack = { pathRef: "a1", pages: [page("top", 1, "one.example")], extracts: [
      { label: "S1-1", pageId: "top", quote: quote(1, 5_000) }, { label: "S1-2", pageId: "top", quote: quote(2, 9_000) },
      { label: "S1-3", pageId: "top", quote: quote(3, 200) }] };
    expect(webPackShown(skipping).extracts.map((extract) => extract.id)).toEqual(["S1-1", "S1-3"]);
  });

  it("never goes over the size, even when the pages' own titles would: a page that does not fit goes with its extracts", () => {
    const titled: WebPack = { pathRef: "a1", pages: [{ ...page("one", 1, "one.example"), title: "T".repeat(7_000) },
      { ...page("two", 2, "two.example"), title: "U".repeat(7_000) }, page("three", 3, "three.example")],
    extracts: [{ label: "S1-1", pageId: "two", quote: "From the second page." }, { label: "S1-2", pageId: "three", quote: "From the third." }] };
    const shown = webPackShown(titled);
    expect(shown.pages.map((entry) => entry.page)).toEqual([1, 3]);
    expect(shown.extracts.map((extract) => extract.id)).toEqual(["S1-2"]);
    expect(Buffer.byteLength(JSON.stringify(shown), "utf8")).toBeLessThanOrEqual(WEB_PACK_LIMITS.bytes);
  });

  it("root 0's room (kept by the web step) frames the case writer with a pack at its cut: never below a real sourced call", () => {
    const sources = webSourcesTextOf(big);
    expect(Buffer.byteLength(sources, "utf8")).toBeLessThanOrEqual(WEB_ROOT_SOURCES_MAX_BYTES);
    const chars = { answer: 400, points: 800, pointsRaised: 800, assumptions: 400 };
    const bound = (extra: Readonly<{ sources?: number }>) => rootPositionRequestBytesBound({ questionLine: Q,
      argumentLanguageName: "English", completionTokenCeiling: 1_000, assignedMaterialChars: { ...chars, ...extra }, length: GUIDE });
    expect(bound({ sources: WEB_ROOT_SOURCES_MAX_BYTES })).toBeGreaterThan(bound({}) + WEB_ROOT_SOURCES_MAX_BYTES);
    const real = legWithWebSources(engineRoot("Yes."), debateWebPacks([big])!, { own: "a1" });
    const realBytes = Buffer.byteLength(JSON.stringify({ model: "", max_tokens: 1_000,
      messages: framedJudgePromptForTest(real, Q, "English", "resolved", null, GUIDE).packet.messages }), "utf8");
    expect(realBytes).toBeLessThanOrEqual(bound({ sources: WEB_ROOT_SOURCES_MAX_BYTES }));
    expect(() => rootPositionRequestBytesBound({ questionLine: Q, argumentLanguageName: "English", completionTokenCeiling: 1_000,
      assignedMaterialChars: { answer: 400, points: 800, sources: 100 }, length: GUIDE })).toThrowError("ROOT_POSITION_BOUND_INPUT_INVALID");
  });

  it("reads the stored pack the web step seals, and leaves out what is not one", () => {
    const stored = { path_ref: "a1", pages: [{ page_id: "p1", rank: 1, title: null, site: "s.example", url: "https://s.example/x",
      date: null, read_depth: "preview" }], extracts: [{ label: "S1-1", page_id: "p1", quote: "Q.", found_by: [1, 2] },
      { label: "S1-2", page_id: "elsewhere", quote: "R.", found_by: [1] }], leads: ["Look at rents."] };
    expect(webPackOf(stored)).toEqual({ pathRef: "a1", pages: [{ pageId: "p1", rank: 1, title: null, site: "s.example", date: null,
      readDepth: "preview" }], extracts: [{ label: "S1-1", pageId: "p1", quote: "Q." }] });
    expect(webPackOf({ path_ref: "a1" })).toBeNull();
    expect(webPackOf({ ...stored, extracts: [{ label: "X-1", page_id: "p1", quote: "Q." }] })).toBeNull();
  });
});

describe("a debate with no packs sends today's prompts, byte for byte", () => {
  const legs: readonly JudgeLeg[] = [
    engineRoot("Yes."), { kind: "support", positionUnderDebate: "Yes.", consideration: "Pay." },
    { kind: "attack", positionUnderDebate: "Yes." }, { kind: "cross-root", ownPosition: "Yes.", otherMakersPosition: "No." },
    { kind: "primary-root" }
  ];
  it("every leg is the very same object, and frames to the same bytes", () => {
    for (const leg of legs) {
      expect(legWithWebSources(leg, null, { own: "a1", rival: "a2" })).toBe(leg);
      // A debate with packs, but none on this leg's paths: the same leg too.
      expect(legWithWebSources(leg, DEBATE, { own: "a3", rival: "a4" })).toBe(leg);
      expect(legWithWebSources(leg, DEBATE, { own: null })).toBe(leg);
      const today = framedJudgePromptForTest(leg, Q, "English", "resolved", null, GUIDE).packet;
      const after = framedJudgePromptForTest(legWithWebSources(leg, null, { own: "a1" }), Q, "English", "resolved", null, GUIDE).packet;
      expect(readPromptFrame(after).contractId).toBe(readPromptFrame(today).contractId);
      expect(readPromptFrame(after).fields).toEqual(readPromptFrame(today).fields);
    }
    expect(debateWebPacks([])).toBeNull();
    expect(webReviewInput(null, { nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" }, true)).toEqual({});
    expect(webReviewInput(DEBATE, { nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" }, false)).toEqual({});
    expect(webCitedExtractsOf(null, [{ nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" }]).size).toBe(0);
  });

  it("a leg that reads sources is always lengthed; only engine 2's case writer reads one", () => {
    const sourced = legWithWebSources({ kind: "attack", positionUnderDebate: "Yes." }, DEBATE, { own: "a1" });
    expect(() => framedJudgePromptForTest(sourced, Q, "English", "resolved", null, null))
      .toThrowError(expect.objectContaining({ code: "JUDGE_SOURCES_UNLENGTHED" }));
    const todaysRoot: JudgeLeg = { kind: "assigned-root", assignedAnswer: "Yes.", mapPoints: "{}" };
    expect(legWithWebSources(todaysRoot, DEBATE, { own: "a1" })).toBe(todaysRoot);
  });
});
