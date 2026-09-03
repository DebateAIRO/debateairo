import type { Node as ContractNode } from "@debateai/contract";
import type { DebateNode } from "@/lib/types";
import { ModelMetaLine } from "@/components/ModelPresentation";
import { v3NodeScoreState, v3ScorePresentation } from "@/lib/v3/adapter";

export function ReferenceAuthorPill({ node }: { node: DebateNode }) {
  const generation = node.active_generation;
  if (!generation && node.maker === undefined) return null;
  return (
    <ModelMetaLine
      modelId={generation?.model_id ?? null}
      maker={node.maker}
      className="modelPill metaLine"
    />
  );
}

export function ReferenceScoreBadges({
  node,
  v3Node,
  onOpenNode,
  condensed = false
}: {
  node: DebateNode;
  v3Node?: ContractNode;
  onOpenNode: (nodeId: string) => void;
  condensed?: boolean;
}) {
  if (!v3Node) return null;
  const presentation = v3ScorePresentation(v3NodeScoreState(node, new Map([[node.id, v3Node]])));
  if (presentation.status === "ABSENT") {
    return (
      <span className="scoreBadge unavailable" title={presentation.badge.title}>
        {presentation.badge.pillText}
      </span>
    );
  }
  if (condensed) {
    return (
      <button
        type="button"
        className="scoreBadgeButton scoreTransition"
        aria-label={`Open the recorded V3 scores for ${node.claim}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenNode(node.id);
        }}
      >
        {presentation.badges.map((badge, index) => (
          <span key={badge.id} title={badge.title}>
            {index === 0 ? badge.pillText.replace(/^BASE\s+/, "") : `→ ${badge.pillText.replace(/^FINAL\s+/, "")}`}
          </span>
        ))}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="scoreBadgeButton"
      aria-label={`Open the recorded V3 scores for ${node.claim}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenNode(node.id);
      }}
    >
      {presentation.badges.map((badge) => (
        <span
          key={badge.id}
          className={`scoreBadge v3 ${badge.id}`}
          data-v3-score={badge.id}
          title={badge.title}
        >
          {badge.pillText}
        </span>
      ))}
    </button>
  );
}

export function ReferenceReviewLine({ review }: { review?: ContractNode["review"] }) {
  if (!review) return null;
  const disputed = review.outcome === "dispute";
  const label = review.outcome === "agree"
    ? "REVIEW AGREED BY:"
    : disputed
      ? "REVIEW DISPUTED BY:"
      : "REVIEW COULD NOT ASSESS:";
  return (
    <div className="nodeReviewLine" data-node-review={review.outcome}>
      <span className={`drawerReviewLabel ${disputed ? "dispute" : "agree"}`}>{label}</span>
      <ModelMetaLine
        modelId={review.reviewer_lineage.model_id}
        maker={review.reviewer_lineage.maker}
        className="modelPill reviewerPill metaLine"
      />
    </div>
  );
}
