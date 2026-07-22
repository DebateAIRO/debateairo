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
export function formatUncertaintyPill(
  drivers: UncertaintyDriver[] | null | undefined,
  source: UncertaintySource | null | undefined,
  uncertaintyPercent: FormattedScorePercent
): UncertaintyPillContent {
  const safeDrivers = drivers ?? [];
  const safeSource: UncertaintySource = source ?? "heuristic";
  const numericSuffix = `UNC ${uncertaintyPercent.value} · ${safeSource}`;

  if (safeDrivers.length === 0) {
    return {
      pillText: safeSource === "heuristic" ? "uncertainty unmeasured" : numericSuffix,
      title: numericSuffix,
    };
  }

  return {
    pillText: safeDrivers[0].label,
    title: `${safeDrivers.map((driver) => driver.label).join("; ")} (${numericSuffix})`,
  };
}
