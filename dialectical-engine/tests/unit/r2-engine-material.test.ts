import { describe, expect, it } from "vitest";
import {
  engineAnswersForWriter, engineMaterialOf, enginePointPlacement, engineVerdictMaterialOf, pointInvestigationMaterialOf,
  type EngineMaterialSource
} from "@debateai/kernel";

/**
 * Engine 2 (spec 2026-10-15 §4.3, §4.2b; INTERFACE §11.2-§11.3): one source, two answers. A has a support (p1), an
 * objection (p2, disputed by its review) and a reply that attacks the objection (p3, so it counts FOR A). B has a
 * support (p4, disputed because its investigation found it fails) and the cross-reply A made against it (x1, cannot be
 * assessed, investigated to a dead end).
 */
const SOURCE: EngineMaterialSource = {
  question: "Should the city build a new tram line?",
  answers: [
    { letter: "A", rootNodeId: "root-a", words: "Yes, build the tram line.", caseText: "A tram line moves more people for the same street space.", assumptions: [] },
    { letter: "B", rootNodeId: "root-b", words: "No, improve the buses instead.", caseText: null, assumptions: [] }
  ],
  points: [
    { nodeId: "p1", text: "A tram carries more people per hour than a bus.", relation: "SUPPORTS", targetRef: "root-a",
      answerLetter: "A", fromRivalReply: null, restsOn: null, status: "AGREE", reviewerReasons: [],
      honestFinalStrength: 0.7, investigation: null },
    { nodeId: "p2", text: "The line costs too much for the city budget.", relation: "ATTACKS", targetRef: "root-a",
      answerLetter: "A", fromRivalReply: null, restsOn: null, status: "DISPUTE",
      reviewerReasons: ["The cost figure is not given anywhere."], honestFinalStrength: 0.5, investigation: null },
    { nodeId: "p3", text: "The cost is spread over thirty years of use.", relation: "ATTACKS", targetRef: "p2",
      answerLetter: "A", fromRivalReply: null, restsOn: null, status: "NONE", reviewerReasons: [],
      honestFinalStrength: 0.6, investigation: null },
    { nodeId: "x1", text: "Buses cannot match a tram at rush hour.", relation: "ATTACKS", targetRef: "root-b",
      answerLetter: "B", fromRivalReply: "A", restsOn: null, status: "CANNOT_ASSESS",
      reviewerReasons: ["No ridership numbers are given."], honestFinalStrength: 0.4,
      investigation: { missing: "Rush-hour ridership on the route.", found: "", basis: "none", outcome: "dead_end",
        reason: "A count of rush-hour riders on the planned route would decide it." } },
    { nodeId: "p4", text: "New buses can start running within a year.", relation: "SUPPORTS", targetRef: "root-b",
      answerLetter: "B", fromRivalReply: null, restsOn: null, status: "DISPUTE", reviewerReasons: ["The reviewer could not tell."],
      honestFinalStrength: 0.9,
      investigation: { missing: "How long buying buses takes.", found: "Public bus orders usually take two to three years.",
        basis: "assumption", outcome: "fails", reason: "Delivery alone usually takes longer than a year." } }
  ]
};

/** Every number anywhere in a value, by path. */
function numbersIn(value: unknown, path = "$"): readonly string[] {
  if (typeof value === "number" || typeof value === "bigint") return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => numbersIn(item, `${path}[${String(index)}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => numbersIn(item, `${path}.${key}`));
  }
  return [];
}

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

describe("engine 2: the shared material core (INTERFACE §11.2)", () => {
  it("places each point on its answer, with its distance and its side", () => {
    expect(enginePointPlacement(SOURCE, "p1")).toEqual({ answerLetter: "A", distanceToAnswer: 1, side: "FOR" });
    expect(enginePointPlacement(SOURCE, "p2")).toEqual({ answerLetter: "A", distanceToAnswer: 1, side: "AGAINST" });
    expect(enginePointPlacement(SOURCE, "p3")).toEqual({ answerLetter: "A", distanceToAnswer: 2, side: "FOR" });
    expect(enginePointPlacement(SOURCE, "x1")).toEqual({ answerLetter: "B", distanceToAnswer: 1, side: "AGAINST" });
  });

  it("orders each answer's supports and objections strongest first, marks disputed and not-yet-checked points", () => {
    const material = engineMaterialOf(SOURCE);
    expect(material.question).toBe(SOURCE.question);
    expect(material.answers.map((answer) => answer.letter)).toEqual(["A", "B"]);
    const [a, b] = material.answers;
    expect(a!.supports.map((point) => point.pointRef)).toEqual(["p1", "p3"]);
    expect(a!.objections.map((point) => point.pointRef)).toEqual(["p2"]);
    expect(b!.supports.map((point) => point.pointRef)).toEqual(["p4"]);
    expect(b!.objections.map((point) => point.pointRef)).toEqual(["x1"]);
    expect(a!.objections[0]).toEqual({ pointRef: "p2", text: "The line costs too much for the city budget.",
      relation: "ATTACKS", targetRef: "root-a", fromRivalReply: null, restsOn: null, disputed: true, notYetChecked: false,
      investigation: null });
    expect(b!.objections[0]).toMatchObject({ pointRef: "x1", fromRivalReply: "A", disputed: false, notYetChecked: true,
      investigation: { outcome: "dead_end", reason: "A count of rush-hour riders on the planned route would decide it." } });
    expect(b!.supports[0]).toMatchObject({ pointRef: "p4", disputed: true, notYetChecked: false,
      investigation: { basis: "assumption", outcome: "fails" } });
    expect(a).toMatchObject({ words: "Yes, build the tram line.", caseText: "A tram line moves more people for the same street space." });
    expect(b).toMatchObject({ words: "No, improve the buses instead.", caseText: null, assumptions: [] });
  });

  it("lists every disputed point with its reasons: the review's, or the investigator's when it found the point fails", () => {
    expect(engineMaterialOf(SOURCE).disputed).toEqual([
      { letter: "A", pointRef: "p2", text: "The line costs too much for the city budget.",
        reviewerReasons: ["The cost figure is not given anywhere."] },
      { letter: "B", pointRef: "p4", text: "New buses can start running within a year.",
        reviewerReasons: ["Delivery alone usually takes longer than a year."] }
    ]);
  });

  it("hands out no number and nothing mutable (spec G1, INTERFACE §11.3)", () => {
    const material = engineMaterialOf(SOURCE);
    const verdict = engineVerdictMaterialOf(material, { label: "CONTESTED", winner: "A", conditional: true,
      judgesReasons: [{ chose: "A", reasons: "The tram carries more people." }] });
    const investigation = pointInvestigationMaterialOf(SOURCE, "x1");
    for (const output of [material, verdict, investigation, engineAnswersForWriter(verdict, ["B", "A"])]) {
      expect(numbersIn(output)).toEqual([]);
      expect(deepFrozen(output)).toBe(true);
    }
  });

  it("builds the investigator's material: the answer the point bears on, its target, the reviewer's reasons", () => {
    expect(pointInvestigationMaterialOf(SOURCE, "x1")).toEqual({
      question: "Should the city build a new tram line?",
      answer: "No, improve the buses instead.",
      point: "Buses cannot match a tram at rush hour.",
      targetPoint: "No, improve the buses instead.",
      targetRelation: "ATTACKS",
      restsOn: null,
      reviewerReason: "No ridership numbers are given."
    });
    expect(pointInvestigationMaterialOf(SOURCE, "p3")).toMatchObject({
      answer: "Yes, build the tram line.", targetPoint: "The line costs too much for the city budget.", targetRelation: "ATTACKS"
    });
    expect(pointInvestigationMaterialOf(SOURCE, "p1").targetPoint).toBe("A tram line moves more people for the same street space.");
    expect(() => pointInvestigationMaterialOf(SOURCE, "nope")).toThrow("ENGINE_MATERIAL_INVALID:points.nodeId");
  });

  it("adds the verdict block and puts the answers in the order the caller names", () => {
    const material = engineMaterialOf(SOURCE);
    const verdict = engineVerdictMaterialOf(material, { label: "SPLIT", winner: "B", conditional: false, judgesReasons: [] });
    expect(verdict.verdict).toEqual({ label: "SPLIT", winner: "B", conditional: false, judgesReasons: [] });
    expect(engineAnswersForWriter(verdict, ["B", "A"]).map((answer) => answer.letter)).toEqual(["B", "A"]);
    expect(() => engineVerdictMaterialOf(material, { label: "SPLIT", winner: "C", conditional: false, judgesReasons: [] }))
      .toThrow("ENGINE_MATERIAL_INVALID:verdict.winner");
    expect(() => engineAnswersForWriter(verdict, ["A"])).toThrow("ENGINE_MATERIAL_INVALID:order");
    expect(() => engineAnswersForWriter(verdict, ["A", "A"])).toThrow("ENGINE_MATERIAL_INVALID:order");
  });

  it.each([
    ["two answers with one letter", { ...SOURCE, answers: [SOURCE.answers[0]!, { ...SOURCE.answers[1]!, letter: "A" as const }] }, "answers.1.letter"],
    ["no answer", { ...SOURCE, answers: [], points: [] }, "answers"],
    ["a target nobody wrote", { ...SOURCE, points: [{ ...SOURCE.points[0]!, targetRef: "ghost" }] }, "points.0.targetRef"],
    ["a letter its chain does not reach", { ...SOURCE, points: [{ ...SOURCE.points[0]!, answerLetter: "B" as const }] }, "points.0.answerLetter"],
    ["a strength that is not a number", { ...SOURCE, points: [{ ...SOURCE.points[0]!, honestFinalStrength: Number.NaN }] }, "points.0.honestFinalStrength"],
    ["a loop", { ...SOURCE, points: [{ ...SOURCE.points[0]!, nodeId: "q1", targetRef: "q2" }, { ...SOURCE.points[0]!, nodeId: "q2", targetRef: "q1" }] }, "points.0.targetRef"]
  ] as const)("refuses %s", (_name, source, field) => {
    expect(() => engineMaterialOf(source)).toThrow(`ENGINE_MATERIAL_INVALID:${field}`);
  });
});

// R2a final wave, Ruling (A11 Minors) 1-3: the verdict material is rebuilt member by member, and an off-list label, a
// conditional that is not a boolean and a blank case are refused.
describe("engine 2: the verdict material refuses what code could not have built (R2a final wave A3)", () => {
  const VERDICT = { label: "SUPPORTED", winner: "A", conditional: false, judgesReasons: [] } as const;

  it("rebuilds the material member by member: a widened object's extra member (a number) never reaches the verdict material", () => {
    const widened = { ...engineMaterialOf(SOURCE), strength: 0.9, margin: 0.2 };
    const verdict = engineVerdictMaterialOf(widened, VERDICT);
    expect(Object.keys(verdict).sort()).toEqual(["answers", "disputed", "question", "verdict"]);
    expect(numbersIn(verdict)).toEqual([]);
    expect(deepFrozen(verdict)).toBe(true);
  });

  it.each([
    ["an off-list label", { ...VERDICT, label: "CLEAR" }, "verdict.label"],
    ["a conditional that is not a boolean", { ...VERDICT, conditional: "no" }, "verdict.conditional"]
  ] as const)("refuses %s", (_name, verdict, field) => {
    expect(() => engineVerdictMaterialOf(engineMaterialOf(SOURCE), verdict as unknown as Parameters<typeof engineVerdictMaterialOf>[1]))
      .toThrow(`ENGINE_MATERIAL_INVALID:${field}`);
  });

  it.each(["", "   "])("refuses a blank case (%j); a missing case (null) stays the answer's words", (caseText) => {
    const source = { ...SOURCE, answers: [SOURCE.answers[0]!, { ...SOURCE.answers[1]!, caseText }] };
    expect(() => engineMaterialOf(source)).toThrow("ENGINE_MATERIAL_INVALID:answers.1.caseText");
    expect(() => pointInvestigationMaterialOf(source, "x1")).toThrow("ENGINE_MATERIAL_INVALID:answers.1.caseText");
  });
});
