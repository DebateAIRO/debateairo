// tests/unit/engine-map-v2-contracts.test.ts
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, LENGTH_SENTENCE_PARTS } from "@debateai/kernel";
import {
  MAP_CONTRACT_IDS, MAP_ENGINE_ANSWER_FORMS, MAP_ENGINE_CONTRACT_IDS, MAP_ENGINE_CONTRACT_NAMES, MAP_ENGINE_INSTRUCTIONS,
  MAP_ENGINE_INTERNAL_FIELD_NAMES, MAP_INTERNAL_FIELD_NAMES, MAP_LIMITS, mapContractNameOf, mapEngineContractNameOf,
  mapEngineGuidedWords, mapEngineLargestReplyWordsCeiling, mapEngineLengthField, mapEnginePromptContracts,
  mapEngineReplyWordsCeiling, mapLargestReplyWordsCeiling, mapNamesInternalWord, mapPromptFingerprintText, type MapLength
} from "@debateai/map";

const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
/** Every material field name a map call's packet can carry (specs.ts and the check): none may appear in a v2 instruction. */
const MATERIAL_FIELDS = ["question_line", "angle_label", "angle_focus", "points_so_far", "points", "candidate_answers", "key_points",
  "answers", "framing_challenges", "length", "question_language"];

describe("engine 2: the map's contracts (spec §5.6, §9)", () => {
  it("are eight, with their sealed ids, in this order", () => {
    expect(MAP_ENGINE_CONTRACT_NAMES).toEqual(["angles", "listAngle", "listOpen", "listSnowball", "merge", "gap", "choose", "check"]);
    expect(Object.values(MAP_ENGINE_CONTRACT_IDS)).toEqual(["map.angles.v2", "map.list.angle.v2", "map.list.open.v2",
      "map.list.snowball.v2", "map.merge.v2", "map.gap.v2", "map.choose.v2", "map.check.v1"]);
    for (const name of MAP_ENGINE_CONTRACT_NAMES) {
      const contract = mapEnginePromptContracts()[name];
      expect(contract.contractId).toBe(MAP_ENGINE_CONTRACT_IDS[name]);
      expect(contract.instruction).toBe(`${MAP_ENGINE_INSTRUCTIONS[name]} ${LENGTH_SENTENCE_PARTS}`);
      expect(contract.answerForm).toBe(MAP_ENGINE_ANSWER_FORMS[name]);
      expect(mapEngineContractNameOf(contract.contractId)).toBe(name);
    }
    expect(mapEngineContractNameOf(MAP_CONTRACT_IDS.choose)).toBeNull();
    expect(mapContractNameOf(MAP_ENGINE_CONTRACT_IDS.choose)).toBeNull();
  });

  it("never enter the map's own seal (engine 1's map stays byte for byte)", () => {
    for (const id of Object.values(MAP_ENGINE_CONTRACT_IDS)) expect(mapPromptFingerprintText()).not.toContain(id);
  });

  it("P2.7: no instruction names a field or a code value; every text form asks for words, never a character count", () => {
    for (const name of MAP_ENGINE_CONTRACT_NAMES) {
      const text = MAP_ENGINE_INSTRUCTIONS[name];
      expect(text, name).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
      // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) the check's stored outcomes ADDED_FACT and NO_COST are code values too.
      for (const code of ["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC", "GENERAL", "PASSED", "NOT_AN_ANSWER", "ADDED_FACT", "NO_COST"]) {
        expect(text, `${name}:${code}`).not.toContain(code);
      }
      for (const field of MATERIAL_FIELDS.filter((entry) => entry.includes("_"))) expect(text, `${name}:${field}`).not.toContain(field);
      for (const limit of [MAP_LIMITS.claimMaxChars, MAP_LIMITS.candidateAnswerMaxChars, MAP_LIMITS.angleLabelMaxChars]) {
        expect(MAP_ENGINE_ANSWER_FORMS[name], name).not.toContain(`at most ${String(limit)} characters`);
      }
    }
    expect(MAP_ENGINE_ANSWER_FORMS.listOpen).toContain(`"rests_on": "question" (a fact the question gives) | "assumption"`);
    expect(MAP_ENGINE_ANSWER_FORMS.merge).toContain(`"rests_on"`);
    expect(MAP_ENGINE_ANSWER_FORMS.choose).toContain(`"reserve_answers"`);
    expect(MAP_ENGINE_ANSWER_FORMS.check).toContain(`"adds_unstated_fact": true | false`);
    // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) D4b's third question: one REQUIRED nullable member.
    expect(MAP_ENGINE_ANSWER_FORMS.check).toContain(`"cost_can_be_named": true | false | null (null only for an answer that challenges the question's premise)`);
    expect(MAP_ENGINE_ANSWER_FORMS.check).toContain("reason is required when answers_question is false, adds_unstated_fact is true or cost_can_be_named is false.");
  });

  // (pre-flight PF-R3-2.1, PF-R3-2.4) spec §5.6 as edited 2026-10-16 (D4, D5), word for word.
  it("OWNER WORDING — approve before switch-on (option 1): the check's instruction is the spec's draft (D4)", () => {
    expect(MAP_ENGINE_INSTRUCTIONS.check).toBe("Check each answer below against the question before it is debated. For each, say three "
      + "things. First: does it answer the question as asked? A conditional answer that says which way it goes in which case "
      + "answers it, and so does an answer that challenges the question's premise; an answer that only says it depends, that "
      + "it is undetermined or that more information is needed does not, and neither does one whose condition only restates a "
      + "preference for it, such as A if you prefer A. Second: does it state, as a fact about the person or their situation, "
      + "something the question does not give? A condition stated as a condition is fine. Third, unless the answer challenges "
      + "the question's premise: if this answer were followed with no regard for the other answers' concerns, what would go "
      + "wrong? If nothing can be named, it is not a real answer. Give one short reason for each answer that fails. Do not "
      + "judge which answer is right.");
  });

  // (pre-flight PF-R3-2.1) D5: the texts that WRITE answers quote no hedge; only the check, which judges, names the failing forms.
  it("D5: the instructions that write answers describe only the committed form; only the check names the failing forms", () => {
    for (const name of ["listAngle", "listOpen", "listSnowball", "choose"] as const) {
      for (const hedge of ["it depends", "undetermined", "still open", "if you prefer", "more information is needed"]) {
        expect(MAP_ENGINE_INSTRUCTIONS[name].toLowerCase(), `${name}:${hedge}`).not.toContain(hedge);
      }
    }
    for (const named of ["only says it depends", "undetermined", "more information is needed", "A if you prefer A"]) {
      expect(MAP_ENGINE_INSTRUCTIONS.check).toContain(named);
    }
  });

  // (pre-flight PF-R3-2.1) D4 (a), (b), (c).
  it("D4: choose prefers answers people actually hold; a condition is a checkable fact or a real trade-off; the check asks a third question", () => {
    expect(MAP_ENGINE_INSTRUCTIONS.choose).toContain("prefer answers that people actually hold");
    for (const name of ["listAngle", "listOpen", "listSnowball", "choose"] as const) {
      expect(MAP_ENGINE_INSTRUCTIONS[name], name).toContain("a real trade-off they can weigh");
    }
    expect(MAP_ENGINE_INSTRUCTIONS.check).toContain("Third, unless the answer challenges the question's premise");
  });

  it("engine 2's internal words add the v2 keys; prose that merely says 'rests on' is never caught", () => {
    for (const name of MAP_INTERNAL_FIELD_NAMES) expect(MAP_ENGINE_INTERNAL_FIELD_NAMES).toContain(name);
    // (pre-flight PF-R3-2.2) cost_can_be_named comes from the check's form by itself.
    for (const name of ["rests_on", "reserve_answers", "check_id", "answers_question", "adds_unstated_fact", "cost_can_be_named", "framing_challenges"]) {
      expect(MAP_ENGINE_INTERNAL_FIELD_NAMES).toContain(name);
    }
    expect(mapNamesInternalWord("The claim's rests_on is wrong.", MAP_ENGINE_INTERNAL_FIELD_NAMES)).toBe(true);
    expect(mapNamesInternalWord("The claim's rests_on is wrong.")).toBe(false);
    expect(mapNamesInternalWord("It rests on a fact the question gives.", MAP_ENGINE_INTERNAL_FIELD_NAMES)).toBe(false);
    expect(mapNamesInternalWord("See angle_focus here.", MAP_ENGINE_INTERNAL_FIELD_NAMES)).toBe(true);
  });

  it("the check's reason and choose's assumptions are told in words; the largest reply ceiling covers the check", () => {
    expect(mapEngineLengthField("check", LENGTH, "en")).toEqual({ name: "length", content: "reason: about 40 words" });
    expect(mapEngineGuidedWords("check", LENGTH)).toBe(40);
    expect(mapEngineReplyWordsCeiling("check", LENGTH)).toBe(8 * 40);
    expect(mapEngineLengthField("choose", LENGTH, "en").content).toBe("statement: about 35 words\nassumptions: about 35 words");
    expect(mapEngineReplyWordsCeiling("choose", LENGTH)).toBeNull();
    expect(mapEngineLargestReplyWordsCeiling(LENGTH)).toBe(Math.max(mapLargestReplyWordsCeiling(LENGTH), 320));
    const raised: MapLength = { ...LENGTH, targets: { ...LENGTH.targets, checkReason: 5000 } };
    expect(mapEngineLargestReplyWordsCeiling(raised)).toBe(8 * 5000);
  });
});
