"use client";

import type { PublicDebate } from "@debateai/contract";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";

export function PublicHonestyDrawer({
  answer,
  catalog,
  locale,
  onClose
}: {
  answer: PublicDebate["answer"];
  catalog: MessageCatalog;
  locale: LocaleCode;
  onClose: () => void;
}) {
  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label={t(catalog, "public.honesty.dialogAria")}>
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">{t(catalog, "public.honesty.publishedSnapshot")}</div>
            <h2>{t(catalog, "public.honesty.answerHonesty")}</h2>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "public.honesty.close")}>
            x
          </button>
        </div>
        <div className="drawerBody">
          <section className="wsSection" aria-label={t(catalog, "public.honesty.answerState")}>
            <h3>{t(catalog, "public.honesty.answerState")}</h3>
            <p>{t(catalog, "public.honesty.terminalState", { state: answer.terminal })}</p>
            <p>{t(catalog, "public.disclosure.evidenceAsOf", {
              date: formatDate(locale, answer.as_of, { dateStyle: "short", timeStyle: "short" })
            })}</p>
          </section>
          <section className="wsSection" aria-label={t(catalog, "public.honesty.verdict")}>
            <h3>{t(catalog, "public.honesty.verdict")}</h3>
            <p data-ai-generated={answer.verdict_available && answer.verdict !== null ? "true" : undefined}>{answer.verdict_available ? (answer.verdict ?? t(catalog, "public.honesty.verdictUnavailable")) : t(catalog, "public.honesty.verdictUnavailable")}</p>
            {answer.confidence_band ? <p data-ai-generated="true">{t(catalog, "public.honesty.confidence", { confidence: answer.confidence_band })}</p> : null}
          </section>
          {answer.badges.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "public.badges.heading")}>
              <h3>{t(catalog, "public.badges.heading")}</h3>
              <p>{answer.badges.join(" · ")}</p>
            </section>
          ) : null}
          {answer.residual_objections.length > 0 ? (
            <section className="wsSection" aria-label={t(catalog, "public.residualObjections.heading")}>
              <h3>{t(catalog, "public.residualObjections.heading")}</h3>
              {answer.residual_objections.map((objection, index) => <p key={index} data-ai-generated="true">{objection}</p>)}
            </section>
          ) : null}
          <section className="wsSection" aria-label={t(catalog, "public.honesty.reversalPoint")}>
            <h3>{t(catalog, "public.honesty.reversalPoint")}</h3>
            <p data-ai-generated="true">{answer.reversal_point}</p>
          </section>
          <section className="wsSection" aria-label={t(catalog, "public.honesty.publicSnapshotLimits")}>
            <h3>{t(catalog, "public.honesty.notInSnapshot")}</h3>
            <p>{t(catalog, "public.honesty.riskTierUnavailable")}</p>
            <p>{t(catalog, "public.honesty.costEnvelopeUnavailable")}</p>
            <p>{t(catalog, "public.honesty.memoryDisclosureNotApplicable")}</p>
            <p>{t(catalog, "public.honesty.executionLedgerUnavailable")}</p>
            <p>{t(catalog, "public.honesty.inspectionUnavailable")}</p>
          </section>
        </div>
      </aside>
    </>
  );
}
