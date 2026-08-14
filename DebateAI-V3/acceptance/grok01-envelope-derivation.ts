export interface MakerEnvelopeProposalRow {
  readonly depth: number;
  readonly makerCount: number;
  readonly treeAuthoringCalls: number;
  readonly crossRootAuthoringCalls: number;
  readonly authoredNodeCalls: number;
  readonly crossReviewCalls: number;
  readonly healthyFixedCalls: number;
  readonly healthyModelCalls: number;
  readonly setAThreeTimesHeadroom: number;
}

/**
 * GROK-01 proposal arithmetic only. Nothing returned here is a runtime member
 * or a seeded ceiling; V ratification and a later seed are still required.
 */
export function deriveMakerEnvelopeProposal(
  makerCount: number,
  depths: readonly number[] = [1, 2, 3, 4, 5]
): readonly MakerEnvelopeProposalRow[] {
  if (!Number.isInteger(makerCount) || makerCount < 2) {
    throw new TypeError("ENVELOPE_PROPOSAL_REQUIRES_MULTIPLE_MAKERS");
  }
  return Object.freeze(depths.map((depth) => {
    if (!Number.isInteger(depth) || depth < 1) throw new TypeError("ENVELOPE_PROPOSAL_DEPTH_INVALID");
    const treeAuthoringCalls = makerCount * (2 ** (depth + 1) - 1);
    const crossRootAuthoringCalls = makerCount * (makerCount - 1);
    const authoredNodeCalls = treeAuthoringCalls + crossRootAuthoringCalls;
    const crossReviewCalls = authoredNodeCalls;
    // XREV-01's audited healthy path carries four fixed judge/serve calls in
    // addition to authored nodes and their total cross-maker review coverage.
    const healthyFixedCalls = 4;
    const healthyModelCalls = authoredNodeCalls + crossReviewCalls + healthyFixedCalls;
    return Object.freeze({
      depth,
      makerCount,
      treeAuthoringCalls,
      crossRootAuthoringCalls,
      authoredNodeCalls,
      crossReviewCalls,
      healthyFixedCalls,
      healthyModelCalls,
      setAThreeTimesHeadroom: healthyModelCalls * 3
    });
  }));
}
