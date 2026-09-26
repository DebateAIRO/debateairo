"use client";

import type { Synthesis } from "@/lib/types";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";

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

const LEAN_SOURCE_TITLE_KEYS: Record<"dialectical" | "structural", string> = {
  dialectical: "debateDrawers.synthesis.leanDialecticalTitle",
  structural: "debateDrawers.synthesis.leanStructuralTitle"
};

export function SynthesisPanel({
  catalog = debateDrawersEnglish,
  ...view
}: SynthesisView & { catalog?: MessageCatalog }) {
  const verdictBody =
    view.verdictGate?.state === "suppressed_no_evidence"
      ? t(catalog, "debateDrawers.synthesis.verdictWithheldNoEvidence")
      : view.verdict || t(catalog, "debateDrawers.common.pending");

  return (
    <aside className="synthPanel scroll" aria-label={t(catalog, "debateDrawers.synthesis.title")}>
      <div className="synthInner">
        <div className="synthTitle">
          <span className="synthDiamond" aria-hidden />
          <span>{t(catalog, "debateDrawers.synthesis.title")}</span>
        </div>
        <div className="synthSubtitle">{t(catalog, "debateDrawers.synthesis.subtitle")}</div>

        {view.pending && !view.streaming ? (
          <div className="synthSkeletons">
            <div className="skel" style={{ height: 96, borderRadius: 12 }} />
            <div className="skel" style={{ height: 96, borderRadius: 12 }} />
            <div className="skel" style={{ height: 120, borderRadius: 12 }} />
            <div className="synthPendingNote">{t(catalog, "debateDrawers.synthesis.pendingNote")}</div>
          </div>
        ) : (
          <div className="synthCards" data-ai-generated="true">
            {view.structured ? null : (
              <>
                <section className="synthCard synthPro">
                  <div className="synthCardHead">
                    <span className="synthCardLabel pro">↑ {t(catalog, "debateDrawers.synthesis.strongestPro")}</span>
                  </div>
                  <div className={`synthCardClaim${view.streaming ? " cursor" : ""}`}>{view.proClaim || t(catalog, "debateDrawers.common.pending")}</div>
                </section>

                <section className="synthCard synthCon">
                  <div className="synthCardHead">
                    <span className="synthCardLabel con">↓ {t(catalog, "debateDrawers.synthesis.strongestCon")}</span>
                  </div>
                  <div className={`synthCardClaim${view.streaming ? " cursor" : ""}`}>{view.conClaim || t(catalog, "debateDrawers.common.pending")}</div>
                </section>
              </>
            )}

            <section className="synthCard synthVerdict">
              <div className="synthCardHead">
                <span className="synthCardLabel verdict">{t(catalog, "debateDrawers.synthesis.verdict")}</span>
                {view.meta ? <span className="synthVerdictMeta">{view.meta}</span> : null}
              </div>
              <div className={`synthVerdictBody${view.streaming ? " cursor" : ""}`}>{verdictBody}</div>
              {view.lean ? (
                <div className="synthLean" title={t(catalog, LEAN_SOURCE_TITLE_KEYS[view.lean.source])}>
                  <span className="synthLeanLabel">{t(catalog, "debateDrawers.synthesis.leans")}</span>
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
