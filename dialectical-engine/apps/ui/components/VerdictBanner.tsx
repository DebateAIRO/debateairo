"use client";

import { formatDialecticalSupport } from "@/lib/debatePresentation";
import type { LiveVerdictState, VerdictSummary } from "@/lib/types";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";

const BAND_LABEL_KEYS: Record<VerdictSummary["verdictBand"], string> = {
  supported: "debateDrawers.verdict.stronglySupported",
  contested: "debateDrawers.verdict.contested",
  unsupported: "debateDrawers.verdict.weaklySupported",
  unavailable: "debateDrawers.verdict.analysisUnavailable",
  insufficient_scoring: "debateDrawers.verdict.insufficientScoring",
  suppressed: "debateDrawers.verdict.withheld"
};

/**
 * What each verdict state means, in one sentence that is true of EVERY way the
 * engine can reach that state (V's ruling D77 of 2026-09-18, confirm-item 4).
 *
 * - "contested" is reached three ways: the comparison was missing a limb, the
 *   positions were within the tie margin OR the judges disagreed at the
 *   threshold, or the winner sat in the middle band. The sentence names all of
 *   them as alternatives, because the summary does not carry which one fired.
 *   Their ORDER is deliberate: the tie-adjacent case is tested before the high
 *   cut is, so a winner far above the high cut still prints "contested" when
 *   its margin is narrow -- the run of 2026-09-17 is exactly that. "Not strong
 *   enough" would be false for that reader, so it does not lead.
 * - "unsupported" is reached exactly one way: the winning position's propagated
 *   strength fell below the low cut. It is a weak case, NOT a refuted one, and
 *   NOT a statement about whether evidence was looked up -- the sentence this
 *   replaced said exactly that, and it was false.
 * - "supported" needs no sentence: the band label already says it.
 *
 * The record is total over the union, so every state the mapping can produce
 * has an entry. A value from OUTSIDE the union -- a retired word arriving in an
 * older stored payload -- renders no sentence rather than a fabricated one.
 */
const STATE_SENTENCE_KEYS: Record<LiveVerdictState, string | null> = {
  supported: null,
  contested: "debateDrawers.verdict.contestedExplanation",
  unsupported: "debateDrawers.verdict.unsupportedExplanation"
};

function formatConvergence(
  catalog: MessageCatalog,
  convergence: VerdictSummary["basis"]["convergence"]
): string {
  if (!convergence) return t(catalog, "debateDrawers.common.notAvailable");
  const converged = convergence["converged"];
  const reason = convergence["reason"];
  const convergedLabel = converged === true
    ? t(catalog, "debateDrawers.common.true")
    : converged === false
      ? t(catalog, "debateDrawers.common.false")
      : t(catalog, "debateDrawers.common.notAvailable");
  const reasonLabel = typeof reason === "string" && reason.trim().length > 0
    ? reason
    : t(catalog, "debateDrawers.common.notAvailable");
  return t(catalog, "debateDrawers.verdict.convergenceSummary", {
    converged: convergedLabel,
    reason: reasonLabel
  });
}

export function VerdictBanner({
  verdict,
  catalog = debateDrawersEnglish
}: {
  verdict: VerdictSummary | undefined;
  catalog?: MessageCatalog;
}) {
  if (!verdict) return null;

  // Unknown/future bands must never crash the banner: fall back to rendering
  // the raw band value verbatim (honest, never a fabricated label).
  const bandLabelKey = BAND_LABEL_KEYS[verdict.verdictBand];
  const bandLabel = bandLabelKey ? t(catalog, bandLabelKey) : verdict.verdictBand;
  const stateSentenceKey = verdict.verdictState ? STATE_SENTENCE_KEYS[verdict.verdictState] : null;
  const stateSentence = stateSentenceKey ? t(catalog, stateSentenceKey) : null;

  return (
    <section
      className="verdictBanner"
      aria-label={t(catalog, "debateDrawers.verdict.title")}
      data-verdict-band={verdict.verdictBand}
      data-verdict-state={verdict.verdictState}
      data-ai-generated="true"
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
              {t(catalog, "debateDrawers.verdict.evidenceUnverifiedCaveat")}
            </p>
          );
        }
        if (caveat.code === "claim_type_unknown") {
          return (
            <p key={caveat.code} className="verdictCaveat">
              {t(catalog, "debateDrawers.verdict.claimTypeUnknownCaveat")}
            </p>
          );
        }
        return null;
      })}
      <details className="verdictDetails">
        <summary>{t(catalog, "debateDrawers.verdict.details")}</summary>
        <span className="verdictDetailRow">
          {typeof verdict.basis.dialecticalStrength === "number" && verdict.basis.semanticsVersion
            ? formatDialecticalSupport(verdict.basis.dialecticalStrength, verdict.basis.semanticsVersion)
            : t(catalog, "debateDrawers.common.notAvailable")}
        </span>
        <span className="verdictDetailRow">
          {t(catalog, "debateDrawers.verdict.verificationStatus", {
            status: verdict.basis.verificationStatus ?? t(catalog, "debateDrawers.common.notAvailable")
          })}
        </span>
        <span className="verdictDetailRow">
          {t(catalog, "debateDrawers.verdict.judgeScoreCoverage", {
            coverage: typeof verdict.basis.tauCoverage === "number"
              ? verdict.basis.tauCoverage
              : t(catalog, "debateDrawers.common.notAvailable")
          })}
        </span>
        <span className="verdictDetailRow">
          {t(catalog, "debateDrawers.verdict.convergence", {
            version: verdict.basis.semanticsVersion ?? t(catalog, "debateDrawers.common.notAvailable"),
            convergence: formatConvergence(catalog, verdict.basis.convergence)
          })}
        </span>
      </details>
    </section>
  );
}
