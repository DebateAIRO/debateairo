import { describe, expect, it } from "vitest";

const labels = [
  "OWN_CRISIS", "METHODS_OR_ENCOURAGEMENT", "HARM_TO_OTHERS", "WEAPONS_DRUGS_TERRORISM",
  "HATE_SPEECH", "RELIGIOUS_INSULT", "SENSITIVE_TOPIC", "ORDINARY"
] as const;

const instructionModule = () => import("../../apps/api/src/question-check/instruction.js");

describe("S04 question-check instruction", () => {
  // Property: each outcome available to the parser is named for the model.
  it.each(labels)("names the label %s", async (label) => {
    const { questionCheckContract } = await instructionModule();
    expect(questionCheckContract().instruction).toContain(label);
  });

  // Property: the instruction carries V's two extra refusal categories.
  it("names V's words 'hate speech' and 'religious insult'", async () => {
    const { questionCheckContract } = await instructionModule();
    expect(questionCheckContract().instruction).toContain("hate speech");
    expect(questionCheckContract().instruction).toContain("religious insult");
  });

  // Property: indirect wording is judged by the same rules as explicit wording.
  it("states that indirect wording counts", async () => {
    const { questionCheckContract } = await instructionModule();
    expect(questionCheckContract().instruction).toMatch(/explicit or indirect/u);
  });

  // Property: the political-question edge is the full approved SPEC rule, including the V-78 stop.
  it("carries row 3's text from history to political aim exactly", async () => {
    const { QUESTION_CHECK_ROW_3_TEXT, questionCheckContract } = await instructionModule();
    const specSpan = "a question about violence as a subject of history, law or ethics that asks no one whether or how to harm a person is not this label, and neither is a question about violence as a subject of politics, current affairs or public policy, including whether a state, an army or the police should use force, such as \"Should NATO strike Russian bases?\", \"Should police use rubber bullets?\" or \"Should Iranian protesters take up arms against the regime?\"; a question that asks how to hurt someone, that threatens or plans an attack, or that asks whether anyone other than a state, an army or the police should kill or attack a named or identifiable person or unarmed people, is this label whatever its political aim";
    expect(QUESTION_CHECK_ROW_3_TEXT).toBe(specSpan);
    expect(questionCheckContract().instruction).toContain(QUESTION_CHECK_ROW_3_TEXT);
  });

  // Property: the first applicable label wins in the SPEC's priority order.
  it("lists the eight codes in the SPEC's order", async () => {
    const { questionCheckContract } = await instructionModule();
    const text = questionCheckContract().instruction;
    const locations = labels.map((label) => text.indexOf(label));
    expect(locations.every((at, index) => at >= 0 && (index === 0 || at > locations[index - 1]!))).toBe(true);
  });

  // Property: no interface metadata is requested as model material.
  it("holds no interface language, country or account placeholder", async () => {
    const { questionCheckContract } = await instructionModule();
    const contract = questionCheckContract();
    expect(contract.instruction).not.toMatch(/\{[^}]+\}/u);
    expect(contract.answerForm).toContain('{"call":');
  });
});
