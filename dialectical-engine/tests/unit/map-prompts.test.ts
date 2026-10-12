import { describe, expect, it } from "vitest";
import { argumentLanguageDirective } from "@debateai/kernel";
import { buildFramedPrompt, promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  MAP_ANSWER_FORMS,
  MAP_CONTRACT_IDS,
  MAP_CONTRACT_NAMES,
  MAP_DEFAULT_INSTRUCTIONS,
  mapContractInLanguage,
  mapPromptContractHash,
  mapPromptContracts,
  mapPromptFingerprintText
} from "@debateai/map";

describe("map prompts: seven contracts, owner text and code forms", () => {
  it("names the seven steps with stable contract ids", () => {
    expect([...MAP_CONTRACT_NAMES]).toEqual(["angles", "listAngle", "listOpen", "listSnowball", "merge", "gap", "choose"]);
    expect(Object.values(MAP_CONTRACT_IDS)).toEqual(["map.angles.v1", "map.list.angle.v1", "map.list.open.v1",
      "map.list.snowball.v1", "map.merge.v1", "map.gap.v1", "map.choose.v1"]);
  });

  it("builds every contract through the one frame builder, and the door reads it back", () => {
    const contracts = mapPromptContracts();
    for (const name of MAP_CONTRACT_NAMES) {
      const framed = buildFramedPrompt({ contract: contracts[name], material: [{ name: "question_line", content: "Should X?" }] });
      expect(readPromptFrame(framed.packet).contractId).toBe(MAP_CONTRACT_IDS[name]);
      expect(contracts[name].instruction).toBe(MAP_DEFAULT_INSTRUCTIONS[name]);
      expect(contracts[name].answerForm).toBe(MAP_ANSWER_FORMS[name]);
    }
  });

  it("states the spec's limits in the answer forms", () => {
    expect(MAP_ANSWER_FORMS.angles).toContain("OPPOSITE_CASE");
    expect(MAP_ANSWER_FORMS.angles).toContain("4 to 7 entries");
    expect(MAP_ANSWER_FORMS.listAngle).toContain("at most 240 characters");
    expect(MAP_ANSWER_FORMS.listAngle).toContain("3 to 8 entries");
    expect(MAP_ANSWER_FORMS.gap).toContain("0 to 3 entries");
    expect(MAP_ANSWER_FORMS.choose).toContain("strongest_rival");
  });

  it("appends the argument-language directive to the instruction, never to the material", () => {
    const contract = mapContractInLanguage(mapPromptContracts().listOpen, "Romanian");
    expect(contract.instruction.endsWith(argumentLanguageDirective("Romanian"))).toBe(true);
    expect(contract.answerForm).toBe(MAP_ANSWER_FORMS.listOpen);
  });

  it("fingerprints all seven, and an owner's edit is a new fingerprint", () => {
    const text = mapPromptFingerprintText();
    for (const name of MAP_CONTRACT_NAMES) expect(text).toContain(promptContractFingerprintText(mapPromptContracts()[name]));
    expect(mapPromptContractHash()).toMatch(/^[0-9a-f]{64}$/u);
    expect(mapPromptContractHash()).toBe(mapPromptContractHash());
    const edited = mapPromptContracts({ ...MAP_DEFAULT_INSTRUCTIONS, gap: `${MAP_DEFAULT_INSTRUCTIONS.gap} Be brief.` });
    expect(mapPromptContractHash(edited)).not.toBe(mapPromptContractHash());
  });

  it("never asks a merging or gap AI about authors or counts", () => {
    for (const name of ["merge", "gap"] as const) {
      expect(MAP_DEFAULT_INSTRUCTIONS[name]).not.toMatch(/raised_by|maker|author/iu);
    }
  });
});
