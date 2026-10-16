import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, lengthGuideForBounds, type LengthGuide } from "@debateai/kernel";
import { Judge, rootPositionRepairRequestBytesBound, rootPositionRequestBytesBound } from "@debateai/judgement";
import { readPromptFrame, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { rootZeroRoomAttempts } from "../../apps/runner/src/map-stage.js";

const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");

describe("the runner tells every judge call its target (spec §3.2)", () => {
  it("each judge, panel and review call site spreads its step's guide", () => {
    expect(RUNNER.split("...lengthGuideOf(judgeLegLengthStep(leg))").length - 1).toBe(1);
    expect(RUNNER.split("...lengthGuideOf(judgeLegLengthStep(input.leg))").length - 1).toBe(1);
    expect(RUNNER.split("...lengthGuideOf(\"judge_panel\")").length - 1).toBe(1);
    expect(RUNNER.split("...lengthGuideOf(\"reviewer\")").length - 1).toBe(1);
    expect(RUNNER.split("...catchUpGuide").length - 1).toBe(1);
  });

  it("root 0's room frames the lengthed first call when the run has the row", () => {
    const question = { questionLine: "Should cities price congestion?", argumentLanguageName: "English", tokenCeiling: 8192 };
    const today = rootZeroRoomAttempts(question);
    const lengthed = rootZeroRoomAttempts({ ...question, lengthed: true });
    expect(lengthed.first.requestBytes).toBeGreaterThan(today.first.requestBytes);
    expect(lengthed.first.completionTokenCeiling).toBe(today.first.completionTokenCeiling);
    expect(rootZeroRoomAttempts({ ...question, lengthed: false })).toEqual(today);
  });
});

/** Carried from Task 11's review (Minors 1-3 and the bound case): the judge's own target paths. */
const GUIDE: LengthGuide = { words: 250, languageCode: "ro", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const RO = { code: "ro", name: "Romanian" };
const BOUND = { maxAttempts: 1, tokenCeiling: 1024, deadlineMs: 1000 };
const common = { runId: null, subjectItemId: "s", questionLine: "Q?", argumentLanguageName: "Romanian", providerRef: "p",
  contractHash: "h", bound: BOUND } as const;
const judgeInput = (extra: object) => ({ ...common, callSiteKey: "JUDGE", leg: { kind: "primary-root" }, ...extra }) as never;
const reviewInput = (extra: object) => ({ ...common, callSiteKey: "REVIEW:x", statement: "S", authorMaker: "a", edges: [],
  ...extra }) as never;
const panelInput = (extra: object) => ({ ...common, callSiteKey: "PANEL:x", statement: "S", authorMaker: "a", ...extra }) as never;

async function firstRequest(run: (gateway: ProviderGateway) => Promise<unknown>): Promise<ProviderCallRequest> {
  const seen: ProviderCallRequest[] = [];
  const gateway: ProviderGateway = { call: async (request) => { seen.push(request); throw new Error("captured"); } };
  await run(gateway).catch(() => undefined);
  expect(seen.length).toBeGreaterThan(0);
  return seen[0]!;
}

describe("a judge, panel or review call with and without a target (Task 11 review carry)", () => {
  it("Judge.judge and Judge.assess with a target send the .length.v1 contract, the length field and guidedWords", async () => {
    const judged = await firstRequest((gateway) => new Judge(gateway).judge(judgeInput({ length: GUIDE })));
    const judgedFrame = readPromptFrame(judged.packet);
    expect(judgedFrame.contractId).toMatch(/^judge\.primary-root\.(unknown|resolved)\.length\.v1$/);
    expect(judgedFrame.fields.map((field) => field.name)).toEqual(["question_line", "length"]);
    expect(judgedFrame.fields.at(-1)!.content).toBe("about 250 words");
    expect(judged.guidedWords).toBe(250);

    const assessed = await firstRequest((gateway) => new Judge(gateway).assess(panelInput({ length: GUIDE })));
    const assessedFrame = readPromptFrame(assessed.packet);
    expect(assessedFrame.contractId).toBe("judge.panel.length.v1");
    expect(assessedFrame.fields.map((field) => field.name)).toEqual(["question_line", "statement", "length"]);
    expect(assessedFrame.fields.at(-1)!.content).toBe("about 250 words");
    expect(assessed.guidedWords).toBe(250);
  });

  it("a locked and lengthed review and panel put length right before question_language, which stays last", async () => {
    const reviewed = readPromptFrame((await firstRequest((gateway) =>
      new Judge(gateway).review(reviewInput({ questionLanguage: RO, length: GUIDE })))).packet);
    expect(reviewed.contractId).toBe("judge.review.length.v1");
    expect(reviewed.fields.map((field) => field.name))
      .toEqual(["question_line", "statement", "edges_sourced_by_this_node", "length", "question_language"]);
    const assessed = readPromptFrame((await firstRequest((gateway) =>
      new Judge(gateway).assess(panelInput({ questionLanguage: RO, length: GUIDE })))).packet);
    expect(assessed.contractId).toBe("judge.panel.length.v1");
    expect(assessed.fields.map((field) => field.name)).toEqual(["question_line", "statement", "length", "question_language"]);
  });

  it("without a target no call carries a guidedWords key at all (absent, not undefined)", async () => {
    const requests = [
      await firstRequest((gateway) => new Judge(gateway).judge(judgeInput({}))),
      await firstRequest((gateway) => new Judge(gateway).review(reviewInput({}))),
      await firstRequest((gateway) => new Judge(gateway).assess(panelInput({})))
    ];
    for (const request of requests) {
      expect("guidedWords" in request).toBe(false);
      expect(readPromptFrame(request.packet).contractId).not.toContain(".length.");
      expect(readPromptFrame(request.packet).fields.map((field) => field.name)).not.toContain("length");
    }
  });

  it("root position bounds: a lengthed bound is larger than today's; a null target is today's", () => {
    const input = { questionLine: "Q?", argumentLanguageName: "Romanian", completionTokenCeiling: 1024,
      assignedMaterialChars: { answer: 480, points: 4624 } };
    const today = rootPositionRequestBytesBound(input);
    expect(rootPositionRequestBytesBound({ ...input, length: null })).toBe(today);
    expect(rootPositionRequestBytesBound({ ...input, length: lengthGuideForBounds() })).toBeGreaterThan(today);
    const repairToday = rootPositionRepairRequestBytesBound(input);
    expect(rootPositionRepairRequestBytesBound({ ...input, length: null })).toBe(repairToday);
    expect(rootPositionRepairRequestBytesBound({ ...input, length: lengthGuideForBounds() })).toBeGreaterThan(repairToday);
  });
});
