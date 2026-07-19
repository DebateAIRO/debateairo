"use client";

import { formatDialecticalSupport } from "@/lib/debatePresentation";
import type { VerdictSummary } from "@/lib/types";

const BAND_LABELS: Record<VerdictSummary["verdictBand"], string> = {
  supported: "Strongly supported",
  contested: "Contested",
  unsupported: "Weakly supported",
  unavailable: "Analysis unavailable",
  insufficient_scoring: "Not enough judge scoring",
  suppressed: "Verdict withheld"
};

const EVIDENCE_UNVERIFIED_CAVEAT =
  "Caveat — evidence unverified: extracted evidence has no resolved external source.";
const CLAIM_TYPE_UNKNOWN_CAVEAT =
  "Caveat — claim type unestablished: this claim's type could not be determined from stored analysis, so the evidence gate was not applied.";

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

  // Unknown/future bands must never crash the banner: fall back to rendering
  // the raw band value verbatim (honest, never a fabricated label).
  const bandLabel = BAND_LABELS[verdict.verdictBand] ?? verdict.verdictBand;
  const suppressed = verdict.verdictState === "suppressed_no_evidence";

  return (
    <section className="verdictBanner" aria-label="Verdict" data-verdict-band={verdict.verdictBand}>
      <div className="verdictBannerHead">
        <span className="verdictBadge" data-verdict-band={verdict.verdictBand}>
          {bandLabel}
        </span>
        <span className="verdictThresholdsVersion">{verdict.verdictThresholdsVersion}</span>
      </div>
      <p className="verdictClaimLanguage">
        {suppressed ? (
          <>
            No evidence was available in this run, so no endorsed verdict is shown for this empirical claim (claim type: {
              verdict.suppressionReason?.claimType ?? "not available"
            }). The analysis map below remains available.
          </>
        ) : (
          verdict.claimLanguage
        )}
      </p>
      {suppressed ? (
        <p className="verdictUnlockHint">
          To unlock an endorsed verdict: {verdict.suppressionReason?.unlock?.[0] ?? "not available"}.
        </p>
      ) : null}
      {verdict.caveats?.map((caveat) => {
        if (caveat.code === "evidence_unverified") {
          return (
            <p key={caveat.code} className="verdictCaveat">
              {EVIDENCE_UNVERIFIED_CAVEAT}
            </p>
          );
        }
        if (caveat.code === "claim_type_unknown") {
          return (
            <p key={caveat.code} className="verdictCaveat">
              {CLAIM_TYPE_UNKNOWN_CAVEAT}
            </p>
          );
        }
        return null;
      })}
      <details className="verdictDetails">
        <summary>Details</summary>
        <span className="verdictDetailRow">
          {typeof verdict.basis.dialecticalStrength === "number" && verdict.basis.semanticsVersion
            ? formatDialecticalSupport(verdict.basis.dialecticalStrength, verdict.basis.semanticsVersion)
            : "not available"}
        </span>
        <span className="verdictDetailRow">
          verification status: {verdict.basis.verificationStatus ?? "not available"}
        </span>
        <span className="verdictDetailRow">
          judge-score coverage:{" "}
          {typeof verdict.basis.tauCoverage === "number" ? verdict.basis.tauCoverage : "not available"}
        </span>
        <span className="verdictDetailRow">
          convergence (dialectical, semantics version {verdict.basis.semanticsVersion ?? "not available"}):{" "}
          {formatConvergence(verdict.basis.convergence)}
        </span>
      </details>
    </section>
  );
}
