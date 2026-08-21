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
    const memberships = [
      node.review !== null,
      derivedStanding.has(node.node_id),
      setAside.has(node.node_id)
    ];
    if (memberships.filter(Boolean).length !== 1) {
      throw new TypedDomainError(
        "CENSUS_PARTITION_INVALID",
        `Node ${node.node_id} must belong to exactly one of judged, derived-standing, or set-aside`
      );
    }
    if (memberships[0]) judgedCount += 1;
    else if (memberships[1]) derivedStandingCount += 1;
    else setAsideCount += 1;
  }
  return {
    claims: answer.nodes.length,
    judged: judgedCount,
    derivedStanding: derivedStandingCount,
    setAside: setAsideCount
  };
}
