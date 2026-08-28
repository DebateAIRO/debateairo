import type { Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";

export type CanvasCensus = Readonly<{
  claims: number;
  judged: number;
  derivedStanding: number;
  setAside: number;
}>;

export function projectCanvasCensus(answer: Answer): CanvasCensus {
  const setAside = new Set(answer.condition_mark_records
    .filter((record) => record.mark === "HIDDEN-UNJUDGEABLE")
    .flatMap((record) => record.affected_node_ids));
  const derivedStanding = new Set(answer.condition_mark_records
    .filter((record) => record.mark === "DERIVED-STANDING-UNREVIEWED")
    .flatMap((record) => record.affected_node_ids));
  let judgedCount = 0;
  let derivedStandingCount = 0;
  let setAsideCount = 0;
  for (const node of answer.nodes) {
    const isSetAside = setAside.has(node.node_id);
    const isDerivedStanding = derivedStanding.has(node.node_id);
    if (isSetAside && (isDerivedStanding || node.final_strength !== null)) {
      throw new TypedDomainError(
        "CENSUS_PARTITION_INVALID",
        `Node ${node.node_id} must belong to exactly one of judged, derived-standing, or set-aside`
      );
    }
    if (isSetAside) setAsideCount += 1;
    else if (isDerivedStanding) derivedStandingCount += 1;
    else if (node.final_strength !== null) judgedCount += 1;
    else {
      throw new TypedDomainError(
        "CENSUS_PARTITION_INVALID",
        `Node ${node.node_id} must belong to exactly one of judged, derived-standing, or set-aside`
      );
    }
  }
  return {
    claims: answer.nodes.length,
    judged: judgedCount,
    derivedStanding: derivedStandingCount,
    setAside: setAsideCount
  };
}
