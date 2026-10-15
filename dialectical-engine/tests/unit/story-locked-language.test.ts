import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { storyContractInArgumentLanguage, storyContractHash } from "@debateai/story";

const CONTRACT = Object.freeze({ contractId: "story.test.v1", instruction: "Tell the story.", answerForm: "Return JSON." });
const RO = { code: "ro", name: "Romanian" };

describe("the story in the locked language (question-language spec 2026-10-13)", () => {
  it("without a lock: today's contract and today's per-call hash, byte for byte", () => {
    const today = storyContractInArgumentLanguage(CONTRACT, "Romanian");
    expect(today).toEqual({ ...CONTRACT, instruction: `Tell the story.\n\n${argumentLanguageDirective("Romanian")}` });
    expect(storyContractInArgumentLanguage(CONTRACT, "Romanian", null)).toEqual(today);
    expect(storyContractHash(storyContractInArgumentLanguage(CONTRACT, "Romanian", null))).toBe(storyContractHash(today));
  });

  it("with a lock: the one named sentence after a blank line; the per-call hash follows it (recorded, not sealed)", () => {
    const locked = storyContractInArgumentLanguage(CONTRACT, "Romanian", RO);
    expect(locked.instruction).toBe(`Tell the story.\n\n${questionLanguageSentence(RO)}`);
    expect(storyContractHash(locked)).not.toBe(storyContractHash(storyContractInArgumentLanguage(CONTRACT, "Romanian")));
  });
});
