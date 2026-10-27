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

  // Property: wars and other force against people are refused at the start whoever would use it (V 2026-10-27,
  // replacing V-58's carve-out); history and defence policy that ask for no force still start.
  it("carries row 3's text on wars, history and defence policy exactly", async () => {
    const { QUESTION_CHECK_ROW_3_TEXT, questionCheckContract } = await instructionModule();
    const specSpan = "this includes a question that asks whether a state, an army, the police, an armed group or anyone else should go to war, invade, strike, bomb, shoot or otherwise use force or weapons against people, such as \"Should NATO strike Russian bases?\", \"Should police use rubber bullets?\" or \"Should Iranian protesters take up arms against the regime?\", whatever its political aim; a question about past violence as a subject of history, law or ethics that asks no one whether or how to harm anyone, such as \"Was the bombing of Hiroshima justified?\", is not this label, and neither is a question about defence, security or foreign policy that asks no one whether to use force against people, such as \"Should Romania raise defence spending?\"";
    expect(QUESTION_CHECK_ROW_3_TEXT).toBe(specSpan);
    expect(questionCheckContract().instruction).toContain(QUESTION_CHECK_ROW_3_TEXT);
    expect(questionCheckContract().instruction).not.toContain("is not this label, and neither is a question about violence as a subject of politics");
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
