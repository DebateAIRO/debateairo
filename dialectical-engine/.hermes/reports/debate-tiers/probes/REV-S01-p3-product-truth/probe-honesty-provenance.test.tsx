/* REV(S01) p3 product-truth — what the honesty drawer SAYS about a premium ask.
   Not a re-run of the author's test: it renders the drawer with the value the REAL page
   put on the wire (observed in the browser at 9ddbb1ef: a premium ask with an unedited
   risk tier posts tier_provenance_ref="machine:plan-tier-free") and prints the sentence
   the user reads. The base literal is rendered beside it for contrast. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const W = process.env.WORKTREE!;
const { AnswerHonestyDrawer } = await import(`${W}/apps/ui/components/AnswerHonestyDrawer.tsx`);
const { createLiveRunState } = await import(`${W}/apps/ui/lib/v3/liveEvents.ts`);
const { buildFairShapedAnswer } = await import(`${W}/tests/support/v2uiFixtures.ts`);

const noop = () => {};

function sentenceFor(ref: string): string {
  const answer = buildFairShapedAnswer({
    risk_tier: "standard",
    tier_source: "MACHINE_DEFAULT",
    tier_provenance_ref: ref
  });
  const html = renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={answer}
      live={createLiveRunState()}
      ledgerDigest={null}
      ledgerError={null}
      inspection={null}
      inspectionError={null}
      onShowInspection={noop}
      onUnlinkMemory={noop}
      actionState={null}
      investigationInput={{}}
      onInvestigationInput={noop}
      onRecordInvestigation={noop}
      answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Probe." }}
      token={null}
      onClose={noop}
    />
  );
  const m = html.match(/Risk tier [^<]*/);
  if (!m) throw new Error("provenance sentence not found in rendered drawer");
  return m[0].replace(/&#x27;/g, "'").replace(/&middot;/g, "·");
}

describe("REV(S01) p3 product-truth · the honesty drawer's provenance sentence", () => {
  it("prints what a PREMIUM ask records after S01", () => {
    const shipped = sentenceFor("machine:plan-tier-free");
    const base = sentenceFor("machine:deployment-floor");
    console.log("\n  AT 9ddbb1ef (premium ask, unedited risk tier):\n    " + shipped);
    console.log("  AT BASE 7f89f7b7 (same ask):\n    " + base + "\n");
    // The label half is fixed by labels.ts:6 and says "deployment floor" in both.
    expect(shipped).toContain("machine default from the deployment floor");
    // ...while the ref half now names the FREE PLAN TIER, on a premium ask.
    expect(shipped).toContain("machine:plan-tier-free");
    // At base the two halves agreed; after S01 they contradict each other.
    expect(base).toContain("machine:deployment-floor");
  });
});
