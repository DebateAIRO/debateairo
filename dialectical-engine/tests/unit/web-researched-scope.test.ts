import { describe, expect, it } from "vitest";
import { webResearchedCallSiteRole, webResearchedReadAllCallSiteKey, webResearchedReadTopCallSiteKey } from "@debateai/judgement";
import { previewThinkingStepOf } from "@debateai/providers";
import { storyCallScopeAgrees } from "../../apps/runner/src/index.js";

/* W4-4: "Add to researched"'s readers run on the story lane with their one role, at the web readers' low thinking steps. A web reader's site on another lane is refused. */
describe("the readers' sites of Add to researched", () => {
  const top = webResearchedReadTopCallSiteKey(2);
  const one = webResearchedReadAllCallSiteKey();
  it("the story lane takes them, as a judge's calls, and no other lane or role", () => {
    for (const key of [top, webResearchedReadTopCallSiteKey(3), one]) {
      expect(webResearchedCallSiteRole(key)).toBe("JUDGE");
      expect(storyCallScopeAgrees({ lane: "story", callSiteKey: key, role: "JUDGE" })).toBe(true);
      expect(storyCallScopeAgrees({ lane: "served", callSiteKey: key, role: "JUDGE" })).toBe(false);
      expect(storyCallScopeAgrees({ lane: "story", callSiteKey: key, role: "SYNTHESIZER" })).toBe(false);
    }
    expect(webResearchedCallSiteRole("WEB_RESEARCHED:read-top:4")).toBeNull();
    expect(webResearchedCallSiteRole("WEB:read-top:0:2")).toBeNull();
  });
  it("they think at the web readers' steps", () => {
    expect(previewThinkingStepOf({ callSiteKey: top, lane: "story" })).toBe("web_reader_top");
    expect(previewThinkingStepOf({ callSiteKey: one, lane: "story" })).toBe("web_reader");
  });
});
