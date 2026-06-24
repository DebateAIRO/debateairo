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
