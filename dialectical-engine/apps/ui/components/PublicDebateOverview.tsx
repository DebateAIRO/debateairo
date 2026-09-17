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

function verdictLabel(verdict: PublicDebate["answer"]["verdict"]): string {
  return verdict ?? "VERDICT UNAVAILABLE";
}

function ArgumentCard({
  argument,
  side,
  onRead
}: {
  argument: PublicArgumentPresentation | null;
  side: "pro" | "con";
  onRead: (nodeId: string) => void;
}) {
  const label = side === "pro" ? "PRO" : "CON";
  const arrow = side === "pro" ? "↑" : "↓";
  if (argument === null) {
    return (
      <article className="publicArgumentCard publicArgumentEmpty" data-side={side}>
        <div className="publicArgumentCore">
          <span className="publicArgumentAccent" aria-hidden />
          <span className="publicStancePill">{arrow} {label}</span>
          <p>No published {label.toLowerCase()} argument is available.</p>
        </div>
      </article>
    );
  }

  const base = v3ScorePercentage(argument.baseScore.value);
  const final = argument.finalScore === null ? null : v3ScorePercentage(argument.finalScore.value);
  const lineage = argument.makerLineage;
  const model = lineage === null ? null : modelMeta(lineage.model_id);

  return (
    <article className="publicArgumentCard" data-side={side}>
      <div className="publicArgumentCore">
        <span className="publicArgumentAccent" aria-hidden />
        <div className="publicArgumentTop">
          <span className="publicStancePill">{arrow} {label}</span>
          <span
            className="publicArgumentScore"
            aria-label={`Base ${base.text}; ${final ? `final ${final.text}` : "final strength withheld"}`}
          >
            {base.text} → {final?.text ?? "WITHHELD"}
          </span>
          <span className="publicArgumentSpacer" />
          {lineage === null || model === null ? (
            <span className="publicModelPill publicModelMissing">Model lineage unavailable</span>
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
          <button type="button" className="publicLockedAction" disabled aria-label="Challenge locked in public view">
            🔒 Challenge
          </button>
          <button type="button" className="publicReadAction" onClick={() => onRead(argument.nodeId)}>
            Read <span aria-hidden>▾</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function PublicDebateOverview({
  debate,
  onDetails,
  onRead
}: {
  debate: PublicDebate;
  onDetails: () => void;
  onRead: (nodeId: string) => void;
}) {
  const presentation = buildPublicDebatePresentation(debate);
  const returnPath = `/public/debate/${encodeURIComponent(debate.public_ref)}`;
  const signInHref = `/login?next=${encodeURIComponent(returnPath)}`;

  return (
    <main className="publicOverviewScroll scroll" data-design-turn="3b">
      <div className="publicOverview">
        <div className="publicOverviewInner">
        <section className="publicVerdictShell" aria-labelledby="public-verdict-label">
          <div className="publicVerdictCore">
            <span className="publicVerdictTab" aria-hidden />
            <div className="publicVerdictHead">
              <span
                id="public-verdict-label"
                className="publicVerdictPill"
                data-verdict={presentation.verdict?.toLowerCase() ?? "unavailable"}
              >
                {verdictLabel(presentation.verdict)}
              </span>
              {presentation.confidenceBand ? (
                <span className="publicThresholdLabel">confidence · {presentation.confidenceBand.toLowerCase()}</span>
              ) : null}
              <button type="button" className="publicDetailsAction" onClick={onDetails}>
                Details <span aria-hidden>▾</span>
              </button>
            </div>
            <div className="publicVerdictText">
              {presentation.summary.length > 0
                ? presentation.summary.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                : <p>Composed verdict prose was not included in this published snapshot.</p>}
            </div>
            <p className="publicVerdictCaveat"><span aria-hidden>⚠</span> Caveat — {presentation.caveat}</p>
            <div className="publicMetricRow">
              <span>DIALECTICAL SUPPORT {presentation.metrics.support}</span>
              <span>VERIFICATION {presentation.metrics.reviewed} REVIEWED</span>
              <span>JUDGE COVERAGE {presentation.metrics.judged} SCORED</span>
              <span>CONVERGENCE {presentation.metrics.convergence}</span>
            </div>
          </div>
        </section>

        <section className="publicSupport" aria-labelledby="public-support-title">
          <div className="publicSupportRow">
            <span className="publicSupportPro">↑ THE CASE FOR · {presentation.proCount}</span>
            <div
              className="publicSupportMeter"
              data-measured={presentation.supportMeasured ? "true" : "false"}
              style={{ "--pro-pct": `${presentation.proPercent}%` } as CSSProperties}
              aria-label={presentation.supportMeasured
                ? `${presentation.proPercent}% of recorded side strength supports the claim`
                : "No classified side strength is available"}
            />
            <span className="publicSupportCon">{presentation.conCount} · THE CASE AGAINST ↓</span>
          </div>
          <p id="public-support-title">The strongest surviving argument on each side</p>
        </section>

        <section className="publicArgumentGrid" aria-label="Strongest published arguments">
          <ArgumentCard argument={presentation.strongestPro} side="pro" onRead={onRead} />
          <ArgumentCard argument={presentation.strongestCon} side="con" onRead={onRead} />
        </section>

        <p className="publicUnlockNote">
          <span aria-hidden>🔒</span> Viewing publicly — sign in to challenge, regenerate, or flag claims. {" "}
          <Link href={signInHref}>Unlock actions <span aria-hidden>→</span></Link>
        </p>
        </div>
      </div>
    </main>
  );
}
