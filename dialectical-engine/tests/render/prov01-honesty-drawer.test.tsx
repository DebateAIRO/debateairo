import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const noop = () => {};

describe("PROV-01 rendered honesty provenance", () => {
  it("renders the machine-default source in plain words with its provenance ref", () => {
    const answer = buildFairShapedAnswer({
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor"
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
        answerExport={{
          available: false,
          reason: "LEDGER_DIGEST_PENDING",
          message: "Test-layer export pending."
        }}
        token={null}
        onClose={noop}
      />
    );

    expect(html).toContain(
      "Risk tier standard · machine default from the deployment floor · machine:deployment-floor"
    );
    expect(html).not.toContain("Risk tier standard · MACHINE_DEFAULT");
  });
});
