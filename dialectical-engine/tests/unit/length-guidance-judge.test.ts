import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, LENGTH_SENTENCE_WRITING, type LengthGuide } from "@debateai/kernel";
import {
  JUDGE_LEG_KINDS, JUDGE_LEG_LENGTH_MATERIAL_FIELDS, JUDGE_LEG_MATERIAL_FIELDS, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2, Judge, PANEL_LENGTH_PROMPT_CONTRACT, PANEL_PROMPT_CONTRACT,
  firstPositionCallProjections, framedJudgePromptForTest, judgeConsiderationPromptContract, judgePromptContract,
  reviewPromptContract, type JudgeLeg
} from "@debateai/judgement";
import {
  promptContractFingerprintText, readPromptFrame, type ProviderCallRequest, type ProviderDiscoveryTarget, type ProviderGateway
} from "@debateai/providers";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** Today's judge seal with the debate shape (tests/unit/hs-s01-seal.test.ts): the V2 text must still produce it. */
const TODAY_SHAPE_JUDGE_HASH = "aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612";
const GUIDE: LengthGuide = { words: 250, languageCode: "ro", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const CLAIMS = ["unknown", "resolved"] as const;

describe("the judge variants (spec §3.2, rulings L7, L21)", () => {
  it("today's contracts keep their bytes; V2 is today's sealed text", () => {
    expect(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2)).toBe(TODAY_SHAPE_JUDGE_HASH);
    for (const leg of JUDGE_LEG_KINDS) for (const claim of CLAIMS) {
      expect(judgePromptContract(leg, claim, false)).toEqual(judgePromptContract(leg, claim));
      expect(judgePromptContract(leg, claim).contractId).toBe(`judge.${leg}.${claim}.v1`);
    }
    expect(reviewPromptContract(2).contractId).toBe("judge.review.v1");
    expect(PANEL_PROMPT_CONTRACT.contractId).toBe("judge.panel.v1");
  });

  it("each variant is its contract plus the one sentence, under its own id; the answer form is the same", () => {
    for (const leg of JUDGE_LEG_KINDS) for (const claim of CLAIMS) {
      const lengthed = judgePromptContract(leg, claim, true);
      expect(lengthed.contractId).toBe(`judge.${leg}.${claim}.length.v1`);
      expect(lengthed.instruction).toBe(`${judgePromptContract(leg, claim).instruction} ${LENGTH_SENTENCE_WRITING}`);
      expect(lengthed.answerForm).toBe(judgePromptContract(leg, claim).answerForm);
      expect(JUDGE_LEG_LENGTH_MATERIAL_FIELDS[leg]).toEqual([...JUDGE_LEG_MATERIAL_FIELDS[leg], "length"]);
    }
    expect(judgeConsiderationPromptContract("attack", "resolved", true).contractId).toBe("judge.attack.consideration.resolved.length.v1");
    expect(reviewPromptContract(0, true)).toEqual({ contractId: "judge.review.length.v1",
      instruction: `${reviewPromptContract(0).instruction} ${LENGTH_SENTENCE_WRITING}`, answerForm: reviewPromptContract(0).answerForm });
    expect(PANEL_LENGTH_PROMPT_CONTRACT).toEqual({ contractId: "judge.panel.length.v1",
      instruction: `${PANEL_PROMPT_CONTRACT.instruction} ${LENGTH_SENTENCE_WRITING}`, answerForm: PANEL_PROMPT_CONTRACT.answerForm });
  });

  it("the fingerprint is V2, then the 18 variants in the binding order", () => {
    const tail = [
      ...JUDGE_LEG_KINDS.flatMap((leg) => CLAIMS.map((claim) => promptContractFingerprintText(judgePromptContract(leg, claim, true)))),
      ...(["support", "attack"] as const).flatMap((leg) => CLAIMS.map((claim) =>
        promptContractFingerprintText(judgeConsiderationPromptContract(leg, claim, true)))),
      promptContractFingerprintText(PANEL_LENGTH_PROMPT_CONTRACT),
      promptContractFingerprintText(reviewPromptContract(0, true))
    ];
    expect(tail).toHaveLength(18);
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).toBe([JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2, ...tail].join("\n---\n"));
  });
});

describe("a lengthed judge call (spec §3.2)", () => {
  it("frames the variant with length before question_language, and records the guided words", async () => {
    const leg: JudgeLeg = { kind: "attack", positionUnderDebate: "Cities should price congestion." };
    const frame = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "Romanian", "resolved", { code: "ro", name: "Romanian" }, GUIDE).packet);
    expect(frame.contractId).toBe("judge.attack.resolved.length.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate", "length", "question_language"]);
    expect(frame.fields[2]!.content).toBe("about 250 words");
    const unlengthed = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "Romanian", "resolved").packet);
    expect(unlengthed.contractId).toBe("judge.attack.resolved.v1");
  });

  it("sends guidedWords only with a target", async () => {
    const seen: ProviderCallRequest[] = [];
    const provider: ProviderGateway = { call: async (request) => { seen.push(request); throw new Error("captured"); } };
    const base = { runId: null, subjectItemId: "s", callSiteKey: "JUDGE:review:x", questionLine: "Q?", statement: "S.",
      authorMaker: "m", providerRef: "p", contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1000 }, edges: [] };
    await new Judge(provider).review({ ...base, length: GUIDE }).catch(() => undefined);
    await new Judge(provider).review(base).catch(() => undefined);
    expect(seen.map((request) => request.guidedWords)).toEqual([250, undefined]);
    expect(seen.map((request) => readPromptFrame(request.packet).contractId)).toEqual(["judge.review.length.v1", "judge.review.v1"]);
  });

  it("the first-call bound frames the lengthed variant too, so it is never below a lengthed first call", () => {
    const target: ProviderDiscoveryTarget = Object.freeze({ providerRef: "provider:a", maker: "maker:a", baseUrl: "https://vendor.invalid/v1",
      model: "vendor/model-a", inputPriceMicrosPerMillionTokens: 3000000, outputPriceMicrosPerMillionTokens: 15000000 });
    const [today] = firstPositionCallProjections({ targets: [target], judgeTokenCeiling: 8192, questionMaxBytes: 100 });
    const [lengthed] = firstPositionCallProjections({ targets: [target], judgeTokenCeiling: 8192, questionMaxBytes: 100, lengthed: true });
    expect(today).toBeDefined();
    expect(lengthed!.requestBytes).toBeGreaterThan(today!.requestBytes);
    expect(lengthed!.completionTokenCeiling).toBe(today!.completionTokenCeiling);
  });
});
