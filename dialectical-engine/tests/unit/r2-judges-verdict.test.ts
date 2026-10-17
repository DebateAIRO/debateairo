import { describe, expect, it } from "vitest";
import { comparingJudgeReplyIssues } from "@debateai/judgement";
import { ENGINE_VERDICT_TRIGGERS, deriveJudgesVerdict, type ComparingJudgeVote, type JudgesVerdictInput } from "@debateai/serve";

/**
 * Engine redesign R2b, Task B2 (spec 2026-10-15 §4.4 label table, §4.7 every fallback; INTERFACE §9.4): code counts the
 * comparing judges' votes, picks the winner and the label. The judges decide; code only counts.
 */
const ROOT = Object.freeze({ A: "00000000-0000-4000-8000-0000000000a1", B: "00000000-0000-4000-8000-0000000000b1",
  C: "00000000-0000-4000-8000-0000000000c1" });
const ANSWERS = Object.freeze([
  { letter: "A", rootNodeId: ROOT.A, arguedByMaker: "deepseek" },
  { letter: "B", rootNodeId: ROOT.B, arguedByMaker: "zhipu" },
  { letter: "C", rootNodeId: ROOT.C, arguedByMaker: "moonshot" }
] as const);
const STRENGTH = new Map([[ROOT.A, 0.5], [ROOT.B, 0.6], [ROOT.C, 0.4]]);
const LABEL = Object.freeze({ clearAgreeing: 3, closeCallAgreeing: 2 });
type Letter = "A" | "B" | "C" | "D";

const vote = (seat: number, maker: string, best: Letter | null, extra: Readonly<{
  conditional?: boolean; sameAs?: readonly (readonly Letter[])[]; kind?: "general" | "health" | "legal";
}> = {}): ComparingJudgeVote => Object.freeze({
  seat, maker,
  reply: best === null ? null : Object.freeze({
    best: best as "A", conditional: extra.conditional ?? false,
    sameAs: (extra.sameAs ?? []) as readonly (readonly "A"[])[], questionKind: extra.kind ?? "general"
  })
});
/** Three judges of makers that argued no answer. */
const judges = (a: Letter | null, b: Letter | null, c: Letter | null) =>
  [vote(1, "anthropic", a), vote(2, "xiaomi", b), vote(3, "qwen", c)];
const derive = (votes: readonly ComparingJudgeVote[], over: Partial<JudgesVerdictInput> = {}) =>
  deriveJudgesVerdict({ votes, answers: ANSWERS, honestFinalStrength: STRENGTH, label: LABEL, ...over });

describe("the label table (spec §4.4)", () => {
  it("3 of 3 agreeing, none conditional: Clear answer (SUPPORTED, JUDGES_UNANIMOUS)", () => {
    expect(derive(judges("A", "A", "A"))).toMatchObject({
      winnerRootNodeId: ROOT.A, label: "SUPPORTED", trigger: "JUDGES_UNANIMOUS", judgesSeated: 3, judgesAnswered: 3,
      winnerVotes: 3, marks: [], groups: []
    });
  });

  it("3 of 3 agreeing, one says conditional: Close call (CONTESTED, JUDGES_CONDITIONAL; G6)", () => {
    const votes = [vote(1, "anthropic", "A"), vote(2, "xiaomi", "A", { conditional: true }), vote(3, "qwen", "A")];
    expect(derive(votes)).toMatchObject({ winnerRootNodeId: ROOT.A, label: "CONTESTED", trigger: "JUDGES_CONDITIONAL" });
  });

  it("2 of 3: Close call (CONTESTED, JUDGES_MAJORITY)", () => {
    expect(derive(judges("A", "A", "B"))).toMatchObject({ winnerRootNodeId: ROOT.A, label: "CONTESTED",
      trigger: "JUDGES_MAJORITY", winnerVotes: 2 });
  });

  it("no majority: Contested (SPLIT, JUDGES_NO_MAJORITY), the tie broken by the honest final strength", () => {
    expect(derive(judges("A", "B", "C"))).toMatchObject({ winnerRootNodeId: ROOT.B, label: "SPLIT",
      trigger: "JUDGES_NO_MAJORITY", winnerVotes: 1 });
  });

  it("all seated judges agreeing but fewer than clearAgreeing seated: Close call, never Clear", () => {
    expect(derive([vote(1, "anthropic", "A"), vote(2, "xiaomi", "A")])).toMatchObject({ label: "CONTESTED",
      trigger: "JUDGES_MAJORITY", judgesSeated: 2, winnerVotes: 2 });
  });

  // pre-flight PF-R2b2.2 (Ruling option (a)): "Close call" also needs more than half of the seated judges (E8).
  it("four or five judges: a tie at the top, or two of five, is no majority (E8), three of five is a Close call", () => {
    const four = [vote(1, "anthropic", "A"), vote(2, "xiaomi", "A"), vote(3, "qwen", "B"), vote(4, "mistral", "B")];
    expect(derive(four, { label: { clearAgreeing: 4, closeCallAgreeing: 2 } })).toMatchObject({ label: "SPLIT", trigger: "JUDGES_NO_MAJORITY" });
    const five = (e: Letter) => [vote(1, "anthropic", "A"), vote(2, "xiaomi", "A"), vote(3, "qwen", "B"), vote(4, "mistral", "B"), vote(5, "google", e)];
    expect(derive(five("C"), { label: { clearAgreeing: 5, closeCallAgreeing: 2 } })).toMatchObject({ label: "SPLIT" });
    expect(derive(five("A"), { label: { clearAgreeing: 5, closeCallAgreeing: 2 } })).toMatchObject({ label: "CONTESTED", trigger: "JUDGES_MAJORITY", winnerVotes: 3 });
  });
});

describe("every fallback (spec §4.7, CT1)", () => {
  it("a judge failed: its vote is missing, VERDICT-JUDGE-MISSING, and Clear answer is impossible", () => {
    const verdict = derive(judges("A", "A", null));
    expect(verdict).toMatchObject({ label: "CONTESTED", trigger: "JUDGES_MAJORITY", judgesSeated: 3, judgesAnswered: 2,
      marks: ["VERDICT-JUDGE-MISSING"] });
    expect(verdict.counted).toEqual([
      { seat: 1, counted: true, notCountedReason: null }, { seat: 2, counted: true, notCountedReason: null },
      { seat: 3, counted: false, notCountedReason: "JUDGE_FAILED" }
    ]);
  });

  it("every judge failed: winner by honest final strength, at most Close call, VERDICT-JUDGES-UNAVAILABLE alone", () => {
    expect(derive(judges(null, null, null))).toMatchObject({ winnerRootNodeId: ROOT.B, label: "CONTESTED",
      trigger: "JUDGES_UNAVAILABLE", judgesAnswered: 0, winnerVotes: 0, marks: ["VERDICT-JUDGES-UNAVAILABLE"] });
  });

  it("no judge seated (one maker, or a money stop): the same", () => {
    expect(derive([])).toMatchObject({ winnerRootNodeId: ROOT.B, label: "CONTESTED", trigger: "JUDGES_UNAVAILABLE",
      judgesSeated: 0, judgesAnswered: 0, counted: [], marks: ["VERDICT-JUDGES-UNAVAILABLE"], questionKinds: [] });
  });

  it("every vote for the judge's own maker's answer: ignored, winner by strength, Contested, VERDICT-VOTES-IGNORED", () => {
    const verdict = derive([vote(1, "deepseek", "A"), vote(2, "zhipu", "B"), vote(3, "moonshot", "C")]);
    expect(verdict).toMatchObject({ winnerRootNodeId: ROOT.B, label: "SPLIT", trigger: "JUDGES_VOTES_IGNORED",
      winnerVotes: 0, marks: ["VERDICT-VOTES-IGNORED"] });
    expect(verdict.counted.map((entry) => entry.notCountedReason)).toEqual(["OWN_MAKER", "OWN_MAKER", "OWN_MAKER"]);
  });

  it("one own-maker vote ignored: two others agreeing are a Close call, never Clear", () => {
    expect(derive([vote(1, "deepseek", "A"), vote(2, "xiaomi", "A"), vote(3, "qwen", "A")])).toMatchObject({
      winnerRootNodeId: ROOT.A, label: "CONTESTED", trigger: "JUDGES_MAJORITY", winnerVotes: 2, marks: [] });
  });

  it("a reply naming a letter that is no answer, or an invalid group, is a failed judge", () => {
    expect(derive(judges("A", "A", "D")).counted[2]).toEqual({ seat: 3, counted: false, notCountedReason: "JUDGE_FAILED" });
    for (const sameAs of [[["A"]], [["A", "A"]], [["A", "B"], ["B", "C"]], [["A", "D"]]] as const) {
      const verdict = derive([vote(1, "anthropic", "A", { sameAs }), vote(2, "xiaomi", "A"), vote(3, "qwen", "A")]);
      expect(verdict).toMatchObject({ judgesAnswered: 2, marks: ["VERDICT-JUDGE-MISSING"], label: "CONTESTED" });
    }
  });

  // pre-flight PF-R2b2.5: deviation 26 ("fewer than two answers: no judging") holds in the counter itself.
  it("one answer: never judged, whatever the votes a resumed copy hands in", () => {
    expect(derive(judges("A", "A", "A"), { answers: [ANSWERS[0]], honestFinalStrength: new Map([[ROOT.A, 0.5]]) }))
      .toMatchObject({ winnerRootNodeId: ROOT.A, label: "CONTESTED", trigger: "JUDGES_UNAVAILABLE", winnerVotes: 0,
        marks: ["VERDICT-JUDGES-UNAVAILABLE"] });
  });
});

describe("same-answer groups (E9): counted together only when a majority of the seated judges named them", () => {
  it("a pair named by 2 of 3 seated judges counts together; the letter inside goes by direct votes, then strength", () => {
    const verdict = derive([vote(1, "anthropic", "A", { sameAs: [["A", "B"]] }), vote(2, "xiaomi", "B", { sameAs: [["A", "B"]] }),
      vote(3, "qwen", "C")]);
    expect(verdict).toMatchObject({ groups: [["A", "B"]], winnerVotes: 2, winnerRootNodeId: ROOT.B, label: "CONTESTED",
      trigger: "JUDGES_MAJORITY" });
  });

  it("a pair named by 1 of 3 does not: three single votes stay a split", () => {
    const verdict = derive([vote(1, "anthropic", "A", { sameAs: [["A", "B"]] }), vote(2, "xiaomi", "B"), vote(3, "qwen", "C")]);
    expect(verdict).toMatchObject({ groups: [], label: "SPLIT", trigger: "JUDGES_NO_MAJORITY" });
  });

  it("merges majority pairs transitively, and counts a group named by an ignored own-maker voter", () => {
    const verdict = derive([vote(1, "deepseek", "A", { sameAs: [["A", "B", "C"]] }), vote(2, "xiaomi", "C", { sameAs: [["B", "C"]] }),
      vote(3, "qwen", "A", { sameAs: [["A", "B"]] })]);
    expect(verdict.groups).toEqual([["A", "B", "C"]]);
    expect(verdict).toMatchObject({ winnerVotes: 2, label: "CONTESTED", trigger: "JUDGES_MAJORITY" });
  });
});

describe("ties and the honest strength", () => {
  it("equal votes and equal strength: today's lexicographic node-id tie-break", () => {
    const even = new Map([[ROOT.A, 0.5], [ROOT.B, 0.5], [ROOT.C, 0.4]]);
    expect(derive(judges("B", "A", null), { honestFinalStrength: even }).winnerRootNodeId).toBe(ROOT.A);
  });

  it("never labels UNSUPPORTED, whatever the votes", () => {
    const options: readonly (Letter | null)[] = ["A", "B", "C", null];
    for (const a of options) for (const b of options) for (const c of options) for (const conditional of [false, true]) {
      const votes = [vote(1, "anthropic", a, { conditional }), vote(2, "xiaomi", b), vote(3, "deepseek", c)];
      expect(["SUPPORTED", "CONTESTED", "SPLIT"]).toContain(derive(votes).label);
    }
  });
});

describe("the record it returns", () => {
  it("lists the question kinds of every judge whose reply stands, in seat order", () => {
    const verdict = derive([vote(2, "xiaomi", "A", { kind: "health" }), vote(1, "deepseek", "A", { kind: "legal" }),
      vote(3, "qwen", null)]);
    expect(verdict.questionKinds).toEqual(["legal", "health"]);
    expect(verdict.counted.map((entry) => entry.seat)).toEqual([1, 2, 3]);
  });

  it("is frozen, and names the six triggers once", () => {
    const verdict = derive(judges("A", "A", "B"));
    expect(Object.isFrozen(verdict)).toBe(true);
    expect(Object.isFrozen(verdict.counted)).toBe(true);
    expect(ENGINE_VERDICT_TRIGGERS).toEqual(["JUDGES_UNANIMOUS", "JUDGES_CONDITIONAL", "JUDGES_MAJORITY",
      "JUDGES_NO_MAJORITY", "JUDGES_UNAVAILABLE", "JUDGES_VOTES_IGNORED"]);
  });

  it("refuses a malformed input, never a judge's reply", () => {
    const refused = expect.objectContaining({ code: "JUDGES_VERDICT_INPUT_INVALID" });
    expect(() => derive(judges("A", "A", "A"), { answers: [] })).toThrowError(refused);
    expect(() => derive(judges("A", "A", "A"), { answers: [ANSWERS[0], { ...ANSWERS[1], letter: "A" }] })).toThrowError(refused);
    expect(() => derive(judges("A", "A", "A"), { honestFinalStrength: new Map([[ROOT.A, 0.5]]) })).toThrowError(refused);
    expect(() => derive([vote(1, "anthropic", "A"), vote(1, "xiaomi", "A")])).toThrowError(refused);
    expect(() => derive(judges("A", "A", "A"), { label: { clearAgreeing: 0, closeCallAgreeing: 2 } })).toThrowError(refused);
  });
});

// pre-flight PF-R2b2.6 (carried item 5, PF-R2a5.9): if the two checks drifted, B5 would record a letter beside
// JUDGE_FAILED and A9's verdict_vote_reply_whole CHECK would refuse the insert inside the judging step.
describe("B1's reader and this count accept the same replies (A9's verdict_vote_reply_whole; pre-flight PF-R2b2.6)", () => {
  it("a reply stands in the count exactly when B1's content checks find no issue", () => {
    const shown = ["A", "B", "C"] as const;
    const cases: readonly Readonly<{ best: Letter; sameAs: readonly (readonly Letter[])[] }>[] = [
      { best: "A", sameAs: [] }, { best: "D", sameAs: [] }, { best: "A", sameAs: [["A"]] }, { best: "A", sameAs: [["A", "A"]] },
      { best: "A", sameAs: [["A", "B"], ["B", "C"]] }, { best: "A", sameAs: [["A", "D"]] }, { best: "B", sameAs: [["A", "C"]] },
      { best: "C", sameAs: [["A", "B", "C"]] }
    ];
    for (const reply of cases) {
      const accepted = comparingJudgeReplyIssues({ best: reply.best, conditional: false, same_as: reply.sameAs.map((group) => [...group]),
        reasons: "r", question_kind: "general" }, shown).length === 0;
      const counted = derive([vote(1, "anthropic", reply.best, { sameAs: reply.sameAs })]).counted[0]!;
      expect(counted.notCountedReason === "JUDGE_FAILED", JSON.stringify(reply)).toBe(!accepted);
    }
  });
});
