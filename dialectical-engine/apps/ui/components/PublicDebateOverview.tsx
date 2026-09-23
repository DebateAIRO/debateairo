"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicDebate } from "@debateai/contract";
import { modelMeta } from "@/lib/models";
import {
  buildPublicDebatePresentation,
  type PublicArgumentPresentation
} from "@/lib/publicDebatePresentation";
import { v3ScorePercentage } from "@/lib/v3/adapter";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

function verdictLabel(
  verdict: PublicDebate["answer"]["verdict"],
  catalog: MessageCatalog
): string {
  return verdict ?? t(catalog, "public.overview.verdictUnavailable");
}

function ArgumentCard({
  argument,
  catalog,
  side,
  onRead
}: {
  argument: PublicArgumentPresentation | null;
  catalog: MessageCatalog;
  side: "pro" | "con";
  onRead: (nodeId: string) => void;
}) {
  const label = side === "pro"
    ? t(catalog, "public.overview.proLabel")
    : t(catalog, "public.overview.conLabel");
  const sideName = side === "pro"
    ? t(catalog, "public.overview.proSideName")
    : t(catalog, "public.overview.conSideName");
  const arrow = side === "pro" ? "↑" : "↓";
  if (argument === null) {
    return (
      <article className="publicArgumentCard publicArgumentEmpty" data-side={side}>
        <div className="publicArgumentCore">
          <span className="publicArgumentAccent" aria-hidden />
          <span className="publicStancePill">{arrow} {label}</span>
          <p>{t(catalog, "public.overview.noPublishedArgument", { side: sideName })}</p>
        </div>
      </article>
    );
  }

  const base = v3ScorePercentage(argument.baseScore.value);
  const final = argument.finalScore === null ? null : v3ScorePercentage(argument.finalScore.value);
  const lineage = argument.makerLineage;
  const model = lineage === null ? null : modelMeta(lineage.model_id);

  return (
    <article className="publicArgumentCard" data-side={side} data-ai-generated="true">
      <div className="publicArgumentCore">
        <span className="publicArgumentAccent" aria-hidden />
        <div className="publicArgumentTop">
          <span className="publicStancePill">{arrow} {label}</span>
          <span
            className="publicArgumentScore"
            aria-label={final
              ? t(catalog, "public.overview.baseAndFinalAria", { base: base.text, final: final.text })
              : t(catalog, "public.overview.baseAndWithheldAria", { base: base.text })}
          >
            {base.text} → {final?.text ?? t(catalog, "public.overview.withheld")}
          </span>
          <span className="publicArgumentSpacer" />
          {lineage === null || model === null ? (
            <span className="publicModelPill publicModelMissing">{t(catalog, "public.overview.modelLineageUnavailable")}</span>
          ) : (
            <span
              className="publicModelPill"
              style={{ "--model-dot": model.dot } as CSSProperties}
            >
              <span className="publicModelDot" aria-hidden />
              {lineage.maker} · {model.name} · {lineage.model_id}
            </span>
          )}
        </div>
        <p className="publicArgumentClaim">{argument.claim}</p>
        <div className="publicArgumentFoot">
          <button type="button" className="publicLockedAction" disabled aria-label={t(catalog, "public.overview.challengeLockedAria")}>
            🔒 {t(catalog, "public.overview.challenge")}
          </button>
          <button type="button" className="publicReadAction" onClick={() => onRead(argument.nodeId)}>
            {t(catalog, "public.overview.read")} <span aria-hidden>▾</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function PublicDebateOverview({
  debate,
  catalog,
  onDetails,
  onRead
}: {
  debate: PublicDebate;
  catalog: MessageCatalog;
  onDetails: () => void;
  onRead: (nodeId: string) => void;
}) {
  const presentation = buildPublicDebatePresentation(debate, catalog);
  const returnPath = `/public/debate/${encodeURIComponent(debate.public_ref)}`;
  const signInHref = `/login?next=${encodeURIComponent(returnPath)}`;

  return (
    <main className="publicOverviewScroll scroll" data-design-turn="3b">
      <div className="publicOverview">
        <div className="publicOverviewInner">
        <section className="publicVerdictShell" aria-labelledby="public-verdict-label" data-ai-generated="true">
          <div className="publicVerdictCore">
            <span className="publicVerdictTab" aria-hidden />
            <div className="publicVerdictHead">
              <span
                id="public-verdict-label"
                className="publicVerdictPill"
                data-verdict={presentation.verdict?.toLowerCase() ?? "unavailable"}
              >
                {verdictLabel(presentation.verdict, catalog)}
              </span>
              {presentation.confidenceBand ? (
                <span className="publicThresholdLabel">{t(catalog, "public.overview.confidence", { confidence: presentation.confidenceBand.toLowerCase() })}</span>
              ) : null}
              <button type="button" className="publicDetailsAction" onClick={onDetails}>
                {t(catalog, "public.overview.details")} <span aria-hidden>▾</span>
              </button>
            </div>
            <div className="publicVerdictText">
              {presentation.summary.length > 0
                ? presentation.summary.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                : <p>{t(catalog, "public.overview.composedVerdictUnavailable")}</p>}
            </div>
            <p className="publicVerdictCaveat"><span aria-hidden>⚠</span> {t(catalog, "public.overview.caveat", { caveat: presentation.caveat })}</p>
            <div className="publicMetricRow">
              <span>{t(catalog, "public.overview.dialecticalSupport", { support: presentation.metrics.support })}</span>
              <span>{t(catalog, "public.overview.verification", { reviewed: presentation.metrics.reviewed })}</span>
              <span>{t(catalog, "public.overview.judgeCoverage", { judged: presentation.metrics.judged })}</span>
              <span>{t(catalog, "public.overview.convergence", { convergence: presentation.metrics.convergence })}</span>
            </div>
          </div>
        </section>

        <section className="publicSupport" aria-labelledby="public-support-title">
          <div className="publicSupportRow">
            <span className="publicSupportPro">{t(catalog, "public.overview.caseFor", { count: presentation.proCount })}</span>
            <div
              className="publicSupportMeter"
              data-measured={presentation.supportMeasured ? "true" : "false"}
              style={{ "--pro-pct": `${presentation.proPercent}%` } as CSSProperties}
              aria-label={presentation.supportMeasured
                ? t(catalog, "public.overview.supportPercentAria", { percent: presentation.proPercent })
                : t(catalog, "public.overview.supportUnavailableAria")}
            />
            <span className="publicSupportCon">{t(catalog, "public.overview.caseAgainst", { count: presentation.conCount })}</span>
          </div>
          <p id="public-support-title">{t(catalog, "public.overview.strongestSurviving")}</p>
        </section>

        <section className="publicArgumentGrid" aria-label={t(catalog, "public.overview.strongestArgumentsAria")}>
          <ArgumentCard argument={presentation.strongestPro} catalog={catalog} side="pro" onRead={onRead} />
          <ArgumentCard argument={presentation.strongestCon} catalog={catalog} side="con" onRead={onRead} />
        </section>

        <p className="publicUnlockNote">
          <span aria-hidden>🔒</span> {t(catalog, "public.overview.publicViewingNotice")} {" "}
          <Link href={signInHref}>{t(catalog, "public.overview.unlockActions")} <span aria-hidden>→</span></Link>
        </p>
        </div>
      </div>
    </main>
  );
}
