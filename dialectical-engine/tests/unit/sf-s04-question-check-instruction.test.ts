import { describe, expect, it } from "vitest";

const instructionModule = () => import("../../apps/api/src/question-check/instruction.js");
const subjectsModule = () => import("../../apps/api/src/question-check/subjects.js");

async function built() {
  const { questionCheckContract } = await instructionModule();
  const { readQuestionSubjects } = await subjectsModule();
  const subjects = readQuestionSubjects();
  return { subjects, contract: questionCheckContract(subjects) };
}

describe("S04 question-check instruction, built from the subjects file (V, 2026-10-28)", () => {
  // Property: the model sees every subject of the file, in the file's order (the first that applies wins).
  it("names every subject id in file order", async () => {
    const { subjects, contract } = await built();
    const at = subjects.map(subject => contract.instruction.indexOf(`\n${subject.id}: `));
    expect(at.every((value, index) => value >= 0 && (index === 0 || value > at[index - 1]!))).toBe(true);
  });

  // Property: what is and is not healthy within a subject reaches the model word for word, with its examples.
  it("carries each subject's not-healthy and healthy lines and its examples", async () => {
    const { subjects, contract } = await built();
    for (const subject of subjects) {
      expect(contract.instruction).toContain(subject.notHealthy);
      if (subject.healthy !== null) expect(contract.instruction).toContain(subject.healthy);
      for (const example of [...subject.examplesNotHealthy, ...subject.examplesHealthy]) expect(contract.instruction).toContain(example);
    }
  });

  // Property: V's MDMA pair is in front of the model on the sides V put it.
  it("shows V's MDMA examples on V's sides of the drugs line", async () => {
    const { contract } = await built();
    const drugsLine = contract.instruction.split("\n").find(line => line.startsWith("DRUGS: "))!;
    expect(drugsLine.indexOf("How do I make MDMA?")).toBeLessThan(drugsLine.indexOf("Still healthy:"));
    expect(drugsLine.indexOf("Should I take MDMA?")).toBeGreaterThan(drugsLine.indexOf("Still healthy:"));
  });

  // Property: a help-numbers subject offers the model no healthy part.
  it("gives a help-numbers subject no 'Still healthy' part", async () => {
    const { contract } = await built();
    for (const id of ["OWN_CRISIS", "SUICIDE_METHODS"]) {
      expect(contract.instruction.split("\n").find(line => line.startsWith(`${id}: `))).not.toContain("Still healthy:");
    }
  });

  // Property: indirect wording is judged by the same rules as explicit wording, and the order rule is stated.
  it("states that indirect wording counts and that the first applicable subject wins", async () => {
    const { contract } = await built();
    expect(contract.instruction).toMatch(/explicit or indirect/u);
    expect(contract.instruction).toMatch(/first .* whose 'Not healthy' line applies/u);
    expect(contract.instruction).toMatch(/NONE of these subjects is healthy/u);
  });

  // Property: the model answers with the subject (or NONE) and whether the question is healthy.
  it("asks for the subject, NONE and healthy in the answer form", async () => {
    const { contract } = await built();
    expect(contract.answerForm).toContain('"subject":');
    expect(contract.answerForm).toContain("NONE");
    expect(contract.answerForm).toContain('"healthy":true or false');
    expect(contract.answerForm).toContain('{"call":');
  });

  // Property: no interface metadata is requested as model material.
  it("holds no placeholder in the instruction", async () => {
    const { contract } = await built();
    expect(contract.instruction).not.toMatch(/\{[^}]+\}/u);
  });
});
