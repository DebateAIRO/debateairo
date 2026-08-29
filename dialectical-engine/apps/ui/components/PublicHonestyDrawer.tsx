"use client";

import type { PublicDebate } from "@debateai/contract";

export function PublicHonestyDrawer({
  answer,
  onClose
}: {
  answer: PublicDebate["answer"];
  onClose: () => void;
}) {
  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Public answer honesty">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">Published snapshot</div>
            <h2>Answer honesty</h2>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <div className="drawerBody">
          <section className="wsSection" aria-label="Answer state">
            <h3>Answer state</h3>
            <p>Terminal state: {answer.terminal}</p>
            <p>Evidence as of {new Date(answer.as_of).toLocaleString()}.</p>
          </section>
          <section className="wsSection" aria-label="Verdict">
            <h3>Verdict</h3>
            <p>{answer.verdict_available ? (answer.verdict ?? "Verdict unavailable") : "Verdict unavailable"}</p>
            {answer.confidence_band ? <p>Confidence: {answer.confidence_band}</p> : null}
          </section>
          {answer.badges.length > 0 ? (
            <section className="wsSection" aria-label="Badges">
              <h3>Badges</h3>
              <p>{answer.badges.join(" · ")}</p>
            </section>
          ) : null}
          {answer.residual_objections.length > 0 ? (
            <section className="wsSection" aria-label="Residual objections">
              <h3>Residual objections</h3>
              {answer.residual_objections.map((objection, index) => <p key={index}>{objection}</p>)}
            </section>
          ) : null}
          <section className="wsSection" aria-label="What could reverse this">
            <h3>What could reverse this</h3>
            <p>{answer.reversal_point}</p>
          </section>
          <section className="wsSection" aria-label="Public snapshot limits">
            <h3>Not in this snapshot</h3>
            <p>Risk tier: not included in this public snapshot.</p>
            <p>Cost envelope: not included in this public snapshot.</p>
            <p>Memory disclosure: not applicable to public snapshots.</p>
            <p>Execution ledger digest: not included in this public snapshot — see Export for what is included.</p>
            <p>Authorized inspection: owner-only, not available on the public page.</p>
          </section>
        </div>
      </aside>
    </>
  );
}
