import { describe, expect, it } from "vitest";
import { deriveMakerEnvelopeProposal } from "./grok01-envelope-derivation.js";

describe("GROK-01 unratified M=3 envelope derivation", () => {
  it("recomputes depths 1..5 from topology and XREV healthy spend without seeding a ceiling", () => {
    expect(deriveMakerEnvelopeProposal(3)).toEqual([
      { depth: 1, makerCount: 3, treeAuthoringCalls: 9, crossRootAuthoringCalls: 6, authoredNodeCalls: 15, crossReviewCalls: 15, healthyFixedCalls: 4, healthyModelCalls: 34, setAThreeTimesHeadroom: 102 },
      { depth: 2, makerCount: 3, treeAuthoringCalls: 21, crossRootAuthoringCalls: 6, authoredNodeCalls: 27, crossReviewCalls: 27, healthyFixedCalls: 4, healthyModelCalls: 58, setAThreeTimesHeadroom: 174 },
      { depth: 3, makerCount: 3, treeAuthoringCalls: 45, crossRootAuthoringCalls: 6, authoredNodeCalls: 51, crossReviewCalls: 51, healthyFixedCalls: 4, healthyModelCalls: 106, setAThreeTimesHeadroom: 318 },
      { depth: 4, makerCount: 3, treeAuthoringCalls: 93, crossRootAuthoringCalls: 6, authoredNodeCalls: 99, crossReviewCalls: 99, healthyFixedCalls: 4, healthyModelCalls: 202, setAThreeTimesHeadroom: 606 },
      { depth: 5, makerCount: 3, treeAuthoringCalls: 189, crossRootAuthoringCalls: 6, authoredNodeCalls: 195, crossReviewCalls: 195, healthyFixedCalls: 4, healthyModelCalls: 394, setAThreeTimesHeadroom: 1_182 }
    ]);
  });
});
