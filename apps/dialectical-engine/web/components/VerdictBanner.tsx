"use client";

import type { VerdictSummary } from "@/lib/types";

const BAND_LABELS: Record<VerdictSummary["verdictBand"], string> = {
  supported: "Strongly supported",
  contested: "Contested",
  unsupported: "Weakly supported",
  unavailable: "Analysis unavailable"
};

function formatConvergence(convergence: VerdictSummary["basis"]["convergence"]): string {
  if (!convergence) return "not available";
  const converged = convergence["converged"];
  const reason = convergence["reason"];
  const convergedLabel = converged === true ? "true" : converged === false ? "false" : "not available";
  const reasonLabel = typeof reason === "string" && reason.trim().length > 0 ? reason : "not available";
  return `converged: ${convergedLabel}, reason: ${reasonLabel}`;
}

export function VerdictBanner({ verdict }: { verdict: VerdictSummary | undefined }) {
  if (!verdict) return null;

  const bandLabel = BAND_LABELS[verdict.verdictBand];

  return (
    <section className="verdictBanner" aria-label="Verdict" data-verdict-band={verdict.verdictBand}>
      <div className="verdictBannerHead">
        <span className="verdictBadge" data-verdict-band={verdict.verdictBand}>
          {bandLabel}
        </span>
        <span className="verdictThresholdsVersion">{verdict.verdictThresholdsVersion}</span>
      </div>
      <p className="verdictClaimLanguage">{verdict.claimLanguage}</p>
      <details className="verdictDetails">
        <summary>Details</summary>
        <span className="verdictDetailRow">
          dialectical strength: {verdict.basis.dialecticalStrength ?? "not available"}
        </span>
        <span className="verdictDetailRow">
          verification status: {verdict.basis.verificationStatus ?? "not available"}
        </span>
        <span className="verdictDetailRow">convergence: {formatConvergence(verdict.basis.convergence)}</span>
      </details>
    </section>
  );
}
