import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildFramedPrompt, readPromptFrame, promptContractFingerprintText } from "@debateai/providers";
import {
  JUDGE_CONSIDERATION_SENTENCE, JUDGE_LEG_KINDS, JUDGE_LEG_MATERIAL_FIELDS, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2, judgeConsiderationPromptContract, judgeLegModelRole, judgePromptContract,
  framedJudgePromptForTest, type JudgeLeg
} from "@debateai/judgement";
import { builderFromRecordedPacket, captureMomentPacket, graderContextOf, parseMomentBuilder } from "../../acceptance/moment-tools.js";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** Today's sealed judge hash (register v11+): the V1 text must still produce it, byte for byte. */
const TODAY_JUDGE_HASH = "e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365";

describe("judge legs for the debate shape", () => {
  it("today's five legs, review and panel are byte-identical: the V1 fingerprint is today's sealed hash", () => {
    expect(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1)).toBe(TODAY_JUDGE_HASH);
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.startsWith(`${JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1}\n---\n`)).toBe(true);
  });

  it("appends exactly the six new contracts to the fingerprint", () => {
    // Length guidance (LG-C2 Task 11) froze the shape's text as V2 and appends its 18 variants after it
    // (tests/unit/length-guidance-judge.test.ts); the six shape contracts are V2's tail after V1.
    const tail = JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2.slice(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1.length + 5);
    expect(tail).toBe([
      promptContractFingerprintText(judgePromptContract("assigned-root", "unknown")),
      promptContractFingerprintText(judgePromptContract("assigned-root", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "resolved"))
    ].join("\n---\n"));
  });

  it("assigned-root sends question_line, assigned_answer, map_points, and is a POSITION job", () => {
    expect(JUDGE_LEG_KINDS).toContain("assigned-root");
    expect(JUDGE_LEG_MATERIAL_FIELDS["assigned-root"]).toEqual(["question_line", "assigned_answer", "map_points"]);
    const leg: JudgeLeg = { kind: "assigned-root", assignedAnswer: "Yes, with conditions.", mapPoints: "{\"for\":[],\"against\":[]}" };
    const frame = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "English", "unknown").packet);
    expect(frame.contractId).toBe("judge.assigned-root.unknown.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "assigned_answer", "map_points"]);
    expect(judgeLegModelRole(leg)).toBe("POSITION");
  });

  it("a support leg WITHOUT a consideration frames exactly as today; WITH one it uses the variant", () => {
    const plain = readPromptFrame(framedJudgePromptForTest({ kind: "support", positionUnderDebate: "P" }, "Q?", "English", "unknown").packet);
    expect(plain.contractId).toBe("judge.support.unknown.v1");
    expect(plain.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate"]);
    const withPoint = readPromptFrame(framedJudgePromptForTest({ kind: "attack", positionUnderDebate: "P", consideration: "Cost" }, "Q?", "English", "unknown").packet);
    expect(withPoint.contractId).toBe("judge.attack.consideration.unknown.v1");
    expect(withPoint.fields.map((field) => [field.name, field.content])).toEqual([["question_line", "Q?"], ["position_under_debate", "P"], ["consideration", "Cost"]]);
    expect(judgeConsiderationPromptContract("attack", "unknown").instruction).toContain(JUDGE_CONSIDERATION_SENTENCE);
  });

  it("the moment replay rebuilds both new shapes from a recorded packet, and the grader sees their material", async () => {
    const cases = [
      ["POSITION", "JUDGE:root:1", { kind: "assigned-root", assignedAnswer: "Yes, with conditions.", mapPoints: "{\"for\":[],\"against\":[]}" }],
      ["SUPPORT_ATTACK", "JUDGE:critic:root0:r1:p2", { kind: "attack", positionUnderDebate: "P", consideration: "Cost" }],
      ["SUPPORT_ATTACK", "JUDGE:defender:root0:r1:p1", { kind: "support", positionUnderDebate: "P" }]
    ] as const;
    for (const [role, key, leg] of cases) {
      const typed = parseMomentBuilder({ family: "JUDGE_JUDGE", inputs: { questionLine: "Q?", leg } });
      expect(builderFromRecordedPacket(role, key, await captureMomentPacket(typed))).toEqual(typed);
    }
    expect(graderContextOf("Q?", parseMomentBuilder({ family: "JUDGE_JUDGE", inputs: { questionLine: "Q?", leg: cases[0][2] } })).excerpts)
      .toEqual([{ label: "assigned_answer", text: "Yes, with conditions." }, { label: "map_points", text: "{\"for\":[],\"against\":[]}" }]);
    expect(graderContextOf("Q?", parseMomentBuilder({ family: "JUDGE_JUDGE", inputs: { questionLine: "Q?", leg: cases[1][2] } })).excerpts)
      .toEqual([{ label: "position_under_debate", text: "P" }, { label: "consideration", text: "Cost" }]);
  });

  it("the moment replay refuses a consideration contract without its field, and the field without its contract", () => {
    const question = { name: "question_line", content: "Q?" };
    const position = { name: "position_under_debate", content: "P" };
    const variantWithoutField = buildFramedPrompt({
      contract: judgeConsiderationPromptContract("attack", "unknown"), material: [question, position]
    }).packet;
    const fieldWithoutVariant = buildFramedPrompt({
      contract: judgePromptContract("attack", "unknown"), material: [question, position, { name: "consideration", content: "Cost" }]
    }).packet;
    for (const packet of [variantWithoutField, fieldWithoutVariant]) {
      expect(() => builderFromRecordedPacket("SUPPORT_ATTACK", "JUDGE:critic:root0:r1:p2", packet))
        .toThrowError(expect.objectContaining({ code: "MOMENT_CONTRACT_MISMATCH" }));
    }
  });
});
