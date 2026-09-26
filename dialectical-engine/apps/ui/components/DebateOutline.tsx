"use client";

import type { CSSProperties } from "react";
import type { DebateNode, NodeScoringError, NodeScoringPayload } from "@/lib/types";
import { ROLE_PALETTES, flattenOutline, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { ModelMetaLine } from "@/components/ModelPresentation";
import { formatScoreBadgeLabel, formatScorePercent, formatStrengthPill, formatUncertaintyPill } from "@/lib/scoringFormat";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";

function localizedRoleLabel(node: DebateNode, catalog: MessageCatalog, debateChromeCatalog: MessageCatalog): string {
  const role = roleOf(node);
  if (role === "root") return t(catalog, "debateViews.rootClaim");
  if (role === "pro") return t(catalog, "debateViews.pro");
  if (role === "con") return t(catalog, "debateViews.con");
  return roleLabel(node, debateChromeCatalog);
}

type DebateOutlineProps = {
  root: DebateNode;
  selectedNodeId?: string | null;
  selectedPathNodeIds?: Set<string>;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
  scoringErrorsByNodeId?: Map<string, NodeScoringError>;
  /** The interface locale's `misc` catalogue, for the model identity lines. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: role labels and score pills. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: model family names. */
  composeCatalog?: MessageCatalog;
};

export function DebateOutline({
  root,
  selectedNodeId = null,
  selectedPathNodeIds,
  scoringByNodeId,
  scoringErrorsByNodeId,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish
}: DebateOutlineProps) {
  const { catalog, locale } = useChromeI18n();
  const rows = flattenOutline(root);

  return (
    <div className="outline scroll">
      <div className="outlineInner">
        <div className="nodeEyebrow">{t(catalog, "debateViews.rootClaim")}</div>
        <h1 className="outlineRoot">{root.claim}</h1>
        {rows.map(({ node, depth }) => {
          const role = roleOf(node);
          const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
          const empty = renderStateOf(node) === "empty";
          const generation = node.active_generation;
          const scoring = scoringByNodeId?.get(node.id);
          const scoringError = scoringErrorsByNodeId?.get(node.id);
          const selected = selectedNodeId === node.id;
          const inSelectedPath = selectedPathNodeIds?.has(node.id) ?? false;
          const rowStyle: CSSProperties = {
            marginLeft: depth * 26,
            borderLeftColor: empty ? "var(--line-2)" : pal.line,
            background: empty ? "var(--surface-sunken)" : pal.bg,
            boxShadow: selected
              ? `0 0 0 2px ${pal.text}, var(--shadow-card)`
              : inSelectedPath
                ? `inset 0 0 0 1px ${pal.border}`
                : undefined
          };
          return (
            <div
              key={node.id}
              className={`outlineRow${selected ? " selected" : ""}${inSelectedPath ? " inSelectedPath" : ""}`}
              style={rowStyle}
              data-selected={selected ? "true" : undefined}
              data-selected-path={inSelectedPath ? "true" : undefined}
            >
              <div className="outlineRowHead">
                <span className="outlineRole" style={{ color: pal.text }}>
                  {pal.arrow} {localizedRoleLabel(node, catalog, debateChromeCatalog)}
                </span>
                {generation || node.maker !== undefined ? (
                  <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} catalog={miscCatalog} composeCatalog={composeCatalog} />
                ) : null}
                <OutlineScoringMetadata scoring={scoring} scoringError={scoringError} nodeClaim={node.claim} catalog={catalog} debateChromeCatalog={debateChromeCatalog} locale={locale} />
              </div>
              <div className="outlineClaim">{empty ? t(catalog, "debateViews.noStrongArgument") : node.claim}</div>
              {!empty && generation?.argument ? <div className="outlineBody">{generation.argument}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutlineScoringMetadata({
  scoring,
  scoringError,
  nodeClaim,
  catalog,
  debateChromeCatalog,
  locale
}: {
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  nodeClaim: string;
  catalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  locale: string;
}) {
  if (scoring) {
    const strength = formatScorePercent(scoring.scores.strength, debateChromeCatalog);
    const uncertainty = formatScorePercent(scoring.scores.uncertainty, debateChromeCatalog);
    const issueCount = scoring.holes.length + scoring.fatal_flags.length;
    const uncertaintyPill = formatUncertaintyPill(scoring.uncertainty_drivers, scoring.uncertainty_source, uncertainty, debateChromeCatalog);
    const strengthPill = formatStrengthPill(scoring.strength_kind, strength, debateChromeCatalog);

    return (
      <span className="scoreBadgeButton" aria-label={t(catalog, "debateViews.scoringSummaryFor", { claim: nodeClaim })}>
        <span
          className="scoreBadge strength"
          aria-label={formatScoreBadgeLabel(t(catalog, "debateViews.strength"), scoring.labels.strength_label, strength, debateChromeCatalog)}
          title={strengthPill.title}
        >
          {strengthPill.pillText}
        </span>
        <span
          className="scoreBadge uncertainty"
          aria-label={formatScoreBadgeLabel(t(catalog, "debateViews.uncertainty"), scoring.labels.uncertainty_label, uncertainty, debateChromeCatalog)}
          title={uncertaintyPill.title}
        >
          {uncertaintyPill.pillText}
        </span>
        <span className="scoreBadge impact" aria-label={tPlural(catalog, "debateViews.unresolvedScoringIssueCount", issueCount, locale)}>
          {t(catalog, "debateViews.holesBadge", { count: issueCount })}
        </span>
      </span>
    );
  }

  if (scoringError) {
    return (
      <span className="scoreBadge unavailable" aria-label={t(catalog, "debateViews.scoringUnavailableReason", { reason: scoringError.reason })}>
        {t(catalog, "debateViews.scoringUnavailable")}
      </span>
    );
  }

  return null;
}
