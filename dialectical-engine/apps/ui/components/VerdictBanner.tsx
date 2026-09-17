"use client";

import { formatDialecticalSupport } from "@/lib/debatePresentation";
import type { LiveVerdictState, VerdictSummary } from "@/lib/types";

const BAND_LABELS: Record<VerdictSummary["verdictBand"], string> = {
  supported: "Strongly supported",
  contested: "Contested",
  unsupported: "Weakly supported",
  unavailable: "Analysis unavailable",
  insufficient_scoring: "Not enough judge scoring",
  suppressed: "Verdict withheld"
};

/**
 * What each verdict state means, in one sentence that is true of EVERY way the
 * engine can reach that state (V's ruling D77 of 2026-09-18, confirm-item 4).
 *
 * - "contested" is reached three ways: the comparison was missing a limb, the
 *   positions were within the tie margin OR the judges disagreed at the
 *   threshold, or the winner sat in the middle band. The sentence names all of
 *   them as alternatives, because the summary does not carry which one fired.
 * - "unsupported" is reached exactly one way: the winning position's propagated
 *   strength fell below the low cut. It is a weak case, NOT a refuted one, and
 *   NOT a statement about whether evidence was looked up -- the sentence this
 *   replaced said exactly that, and it was false.
 * - "supported" needs no sentence: the band label already says it.
 *
 * A state with no entry renders no sentence rather than a fabricated one.
 */
const STATE_SENTENCES: Record<LiveVerdictState, string | null> = {
  supported: null,
  contested:
    "The run did not settle this either way: the leading position was not strong enough, the positions were too close, the judges disagreed, or part of the comparison was missing.",
  unsupported:
    "Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one."
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
  const stateSentence = verdict.verdictState ? STATE_SENTENCES[verdict.verdictState] : null;

  return (
    <section
      className="verdictBanner"
      aria-label="Verdict"
      data-verdict-band={verdict.verdictBand}
      data-verdict-state={verdict.verdictState}
    >
      <div className="verdictBannerHead">
        <span className="verdictBadge" data-verdict-band={verdict.verdictBand}>
          {bandLabel}
        </span>
        <span className="verdictThresholdsVersion">{verdict.verdictThresholdsVersion}</span>
      </div>
      <p className="verdictClaimLanguage">{verdict.claimLanguage}</p>
      {stateSentence ? <p className="verdictCaveat">{stateSentence}</p> : null}
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
