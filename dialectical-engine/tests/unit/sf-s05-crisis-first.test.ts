import { describe, expect, it } from "vitest";
import { recognisedSupportCrisis } from "../../apps/api/src/support/crisis-first.js";

describe("support crisis recognition", () => {
  it.each([
    ["Ich will nicht mehr leben", "PHRASE_CHECK"],
    ["I want to hurt myself", "SUPPORT_PATTERN"],
    ["I want to die", "PHRASE_CHECK"],
    ["delete my account, I keep hurting myself", "SUPPORT_PATTERN"],
    ["I don't see the point of going on anymore", null],
    ["how do I publish a debate?", null]
  ] as const)("recognises %s as %s", (message, expected) => {
    expect(recognisedSupportCrisis(message)).toBe(expected);
  });
});
