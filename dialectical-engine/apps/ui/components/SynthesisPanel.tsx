"use client";

import type { Synthesis } from "@/lib/types";

export type SynthesisView = {
  ready: boolean;
  pending: boolean;
  streaming: boolean;
  /** V2 structured synthesis: lead with the verdict + sections, no pro/con cards. */
  structured: boolean;
  proClaim: string;
  conClaim: string;
  verdict: string;
  verdictGate?: Synthesis["verdict_gate"];
  meta: string;
  lean?: { pct: number; label: string; source: "dialectical" | "structural" } | null;
  sections?: { title: string; items: string[] }[];
};

const LEAN_SOURCE_TITLE: Record<"dialectical" | "structural", string> = {
  dialectical: "Derived from propagated dialectical (DF-QuAD) strength of the surviving pro vs con arguments.",
  structural: "Structural: based on surviving argument counts, not dialectical strength."
};

export function SynthesisPanel(view: SynthesisView) {
  const verdictBody =
    view.verdictGate?.state === "suppressed_no_evidence"
      ? "Endorsed verdict withheld — no evidence in this run."
      : view.verdict || "Pending";

  return (
    <aside className="synthPanel scroll" aria-label="Synthesis">
      <div className="synthInner">
        <div className="synthTitle">
          <span className="synthDiamond" aria-hidden />
          <span>Synthesis</span>
        </div>
        <div className="synthSubtitle">The strongest case on each side, plus a verdict.</div>

        {view.pending && !view.streaming ? (
          <div className="synthSkeletons">
            <div className="skel" style={{ height: 96, borderRadius: 12 }} />
            <div className="skel" style={{ height: 96, borderRadius: 12 }} />
            <div className="skel" style={{ height: 120, borderRadius: 12 }} />
            <div className="synthPendingNote">Synthesis runs once the tree completes…</div>
          </div>
        ) : (
          <div className="synthCards">
            {view.structured ? null : (
              <>
                <section className="synthCard synthPro">
                  <div className="synthCardHead">
                    <span className="synthCardLabel pro">↑ STRONGEST PRO</span>
                  </div>
                  <div className={`synthCardClaim${view.streaming ? " cursor" : ""}`}>{view.proClaim || "Pending"}</div>
                </section>

                <section className="synthCard synthCon">
                  <div className="synthCardHead">
                    <span className="synthCardLabel con">↓ STRONGEST CON</span>
                  </div>
                  <div className={`synthCardClaim${view.streaming ? " cursor" : ""}`}>{view.conClaim || "Pending"}</div>
                </section>
              </>
            )}

            <section className="synthCard synthVerdict">
              <div className="synthCardHead">
                <span className="synthCardLabel verdict">VERDICT</span>
                {view.meta ? <span className="synthVerdictMeta">{view.meta}</span> : null}
              </div>
              <div className={`synthVerdictBody${view.streaming ? " cursor" : ""}`}>{verdictBody}</div>
              {view.lean ? (
                <div className="synthLean" title={LEAN_SOURCE_TITLE[view.lean.source]}>
                  <span className="synthLeanLabel">Leans</span>
                  <div
                    className="synthLeanBar"
                    style={{
                      background: `linear-gradient(90deg, var(--pro) ${view.lean.pct}%, var(--con) ${view.lean.pct}%)`
                    }}
                  />
                  <span className="synthLeanValue">{view.lean.label}</span>
                </div>
              ) : null}
            </section>

            {view.sections && view.sections.length > 0 ? (
              <div className="synthSections">
                {view.sections.map((section) => (
                  <section key={section.title} className="synthSection">
                    <div className="synthSectionTitle">{section.title}</div>
                    <ul className="synthSectionList">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
