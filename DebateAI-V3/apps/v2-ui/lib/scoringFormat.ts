import type { EvidenceIndependence, EvidenceIndependencePair, StrengthKind, UncertaintyDriver, UncertaintySource } from "./types";

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

export type StrengthPillContent = {
  /** Pill text: unchanged "STR {value}" unless strength_kind is argument_only. */
  pillText: string;
  /** Full explanation for the title attribute; omitted (no attribute rendered) unless strength_kind is argument_only. */
  title?: string;
};

// Task 5 (docs/improvement-plan-2026-07-22.md Sec P2.4): the strength pill
// stays exactly the pre-Task-5 "STR {value}" (no title attribute) for the
// default evidence_weighted case -- including older payloads that omit
// strength_kind entirely -- so nothing changes for the vast majority of
// claims. Only when strength_kind is "argument_only" (claim types that can
// never carry external evidence, e.g. normative/definitional) does the
// pill gain a compact "· argument-only" suffix plus a title explaining why
// evidence isn't weighted into that number, per the same driver-first/
// title-carries-detail convention formatUncertaintyPill established above.
export function formatStrengthPill(
  strengthKind: StrengthKind | null | undefined,
  strengthPercent: FormattedScorePercent
): StrengthPillContent {
  if (strengthKind !== "argument_only") {
    return { pillText: `STR ${strengthPercent.value}` };
  }
  return {
    pillText: `STR ${strengthPercent.value} · argument-only`,
    title: `Argument-only strength — evidence not weighted for this claim type (${strengthPercent.label})`,
  };
}

export type IndependencePillContent = {
  /** Short pill text: how many distinct (domain, method) sources this claim's evidence cites. */
  pillText: string;
  /** Full explanation for the title attribute: every pair, plus what the number does and does not mean. */
  title: string;
};

// Task 13 (docs/improvement-plan-2026-07-22.md Sec P1.5): "cheap first
// version" sourcing-breadth bookkeeping over a claim's EVIDENCE children --
// counts distinct (source_domain, method) pairs
// (coordinator/app/evidence/independence.py). This is deliberately NOT
// named/worded as "independent sources" anywhere visible: the brief is
// explicit that the label must say what it measures (distinct
// source-domain/method pairs) and must never read as a claim about
// verified accuracy or training-corpus independence, so both the pill text
// and the title spell that out rather than using the ambiguous word
// "independent".
const INDEPENDENCE_METHOD_LABELS: Record<string, string> = {
  retrieval: "retrieved",
  "model-claim": "model claim",
};

function formatIndependencePair([domain, method]: EvidenceIndependencePair): string {
  const domainText = domain ?? "no domain";
  const methodText = (method && INDEPENDENCE_METHOD_LABELS[method]) || method || "unknown method";
  return `${domainText} (${methodText})`;
}

export function formatIndependencePill(
  independence: EvidenceIndependence | null | undefined
): IndependencePillContent | null {
  if (!independence || independence.distinct_source_count <= 0) {
    return null;
  }
  const count = independence.distinct_source_count;
  const pairText = independence.pairs.map(formatIndependencePair).join("; ");
  const title =
    `${count} distinct source-domain/method pair${count === 1 ? "" : "s"}` +
    (pairText ? ` (${pairText})` : "") +
    " — measures sourcing breadth (where evidence claims to come from), not verified accuracy or training-corpus independence.";
  return {
    pillText: `sources: ${count} distinct`,
    title,
  };
}
