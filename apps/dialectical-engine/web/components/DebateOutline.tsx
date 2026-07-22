"use client";

import type { CSSProperties } from "react";
import type { DebateNode, NodeScoringError, NodeScoringPayload } from "@/lib/types";
import { ROLE_PALETTES, flattenOutline, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { modelMeta } from "@/lib/models";
import { formatScoreBadgeLabel, formatScorePercent, formatUncertaintyPill } from "@/lib/scoringFormat";

type DebateOutlineProps = {
  root: DebateNode;
  selectedNodeId?: string | null;
  selectedPathNodeIds?: Set<string>;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
  scoringErrorsByNodeId?: Map<string, NodeScoringError>;
};

export function DebateOutline({
  root,
  selectedNodeId = null,
  selectedPathNodeIds,
  scoringByNodeId,
  scoringErrorsByNodeId
}: DebateOutlineProps) {
  const rows = flattenOutline(root);

  return (
    <div className="outline scroll">
      <div className="outlineInner">
        <div className="nodeEyebrow">Root claim</div>
        <h1 className="outlineRoot">{root.claim}</h1>
        {rows.map(({ node, depth }) => {
          const role = roleOf(node);
          const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
          const empty = renderStateOf(node) === "empty";
          const generation = node.active_generation;
          const model = generation ? modelMeta(generation.model_id) : null;
          const scoring = scoringByNodeId?.get(node.id);
          const scoringError = scoringErrorsByNodeId?.get(node.id);
          const selected = selectedNodeId === node.id;
          const inSelectedPath = selectedPathNodeIds?.has(node.id) ?? false;
          const rowStyle: CSSProperties = {
            marginLeft: depth * 26,
            borderLeftColor: empty ? "oklch(0.85 0.006 80)" : pal.line,
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
                  {pal.arrow} {roleLabel(node)}
                </span>
                {model ? (
                  <span className="metaLine">
                    <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                    {model.name}
                  </span>
                ) : null}
                <OutlineScoringMetadata scoring={scoring} scoringError={scoringError} nodeClaim={node.claim} />
              </div>
              <div className="outlineClaim">{empty ? "No strong argument found." : node.claim}</div>
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
  nodeClaim
}: {
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  nodeClaim: string;
}) {
  if (scoring) {
    const strength = formatScorePercent(scoring.scores.strength);
    const uncertainty = formatScorePercent(scoring.scores.uncertainty);
    const issueCount = scoring.holes.length + scoring.fatal_flags.length;
    const uncertaintyPill = formatUncertaintyPill(scoring.uncertainty_drivers, scoring.uncertainty_source, uncertainty);

    return (
      <span className="scoreBadgeButton" aria-label={`Scoring summary for ${nodeClaim}`}>
        <span className="scoreBadge strength" aria-label={formatScoreBadgeLabel("Strength", scoring.labels.strength_label, strength)}>
          STR {strength.value}
        </span>
        <span
          className="scoreBadge uncertainty"
          aria-label={formatScoreBadgeLabel("Uncertainty", scoring.labels.uncertainty_label, uncertainty)}
          title={uncertaintyPill.title}
        >
          {uncertaintyPill.pillText}
        </span>
        <span className="scoreBadge impact" aria-label={`${issueCount} unresolved scoring holes or fatal flags`}>
          HOLES {issueCount}
        </span>
      </span>
    );
  }

  if (scoringError) {
    return (
      <span className="scoreBadge unavailable" aria-label={`Scoring unavailable: ${scoringError.reason}`}>
        Scoring unavailable
      </span>
    );
  }

  return null;
}
