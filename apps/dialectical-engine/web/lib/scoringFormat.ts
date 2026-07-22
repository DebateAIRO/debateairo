import type { UncertaintyDriver, UncertaintySource } from "./types";

export type FormattedScorePercent = {
  value: number;
  label: string;
};

export function formatScorePercent(score: number): FormattedScorePercent {
  const normalized = Number.isFinite(score) ? score : 0;
  const value = Math.round(Math.min(1, Math.max(0, normalized)) * 100);
  return { value, label: `${value} out of 100` };
}

export function formatScoreBadgeLabel(title: string, bandLabel: string, score: FormattedScorePercent): string {
  return `${title} ${bandLabel}, ${score.label}`;
}

export type UncertaintyPillContent = {
  /** Short pill text: the first labeled driver, or an honest fallback. */
  pillText: string;
  /** Full explanation for the title attribute: every driver plus the numeric value and its source. */
  title: string;
};

// Task 4 (docs/improvement-plan-2026-07-22.md Sec P2.1): the uncertainty
// pill is driver-first -- it shows *why* a claim is uncertain ("no
// external evidence") rather than a bare, unexplained "UNC 48". The
// numeric value and its source (measured judge-panel dispersion vs the
// heuristic checklist fallback) remain available via the title attribute
// (and as the pill text itself when there are no labeled drivers to show).
//
// Reviewer follow-up (controller design decision): when uncertainty_source
// is "dispersion", app.scoring.service._attach_plural_judge_provenance
// always prepends a judge_dispersion driver ("judges disagree (spread
// N.NN)") explaining that number, so drivers is empty here only for the
// honest heuristic "nothing fired" case in practice -- the
// source === "dispersion" branch below is a defensive fallback for that
// combination, kept consistent with the has-drivers branch's parenthesized
// title form rather than a special-cased shorter one.
export function formatUncertaintyPill(
  drivers: UncertaintyDriver[] | null | undefined,
  source: UncertaintySource | null | undefined,
  uncertaintyPercent: FormattedScorePercent
): UncertaintyPillContent {
  const safeDrivers = drivers ?? [];
  const safeSource: UncertaintySource = source ?? "heuristic";
  const numericSuffix = `UNC ${uncertaintyPercent.value} · ${safeSource}`;

  const pillText =
    safeDrivers.length > 0
      ? safeDrivers[0].label
      : safeSource === "heuristic"
        ? "uncertainty unmeasured"
        : numericSuffix;
  const driverText = safeDrivers.length > 0 ? safeDrivers.map((driver) => driver.label).join("; ") : pillText;

  return {
    pillText,
    title: `${driverText} (${numericSuffix})`,
  };
}
