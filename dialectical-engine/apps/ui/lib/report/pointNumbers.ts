import type { Answer, AnswerStory } from "@debateai/contract";
import type { DebateNode } from "../types.js";
import { debateDetailFromAnswer } from "../v3/adapter.js";

/**
 * P1…Pn for the PDF (spec 2026-09-26 §10). A stored story always carries its
 * own canonical numbers (`point_numbers`, node id to "Pn", from the story
 * material): the story text and the checker's reservation may say "P3", so the
 * appendix uses exactly those numbers. The fallback, only for an answer without
 * them, is the site tree's order: the positions (the top of the tree,
 * debateDetailFromAnswer) first, then every other point depth-first. A node the
 * story's map misses (it should not happen) gets the next free number after the
 * highest number in the map. The points come back sorted by number.
 */
export interface NumberedPoint {
  readonly number: string;
  readonly node: DebateNode;
  readonly parentNumber: string | null;
}

function positionsFirstOrder(answer: Answer): readonly DebateNode[] {
  const positions = debateDetailFromAnswer(answer).tree?.children ?? [];
  const rest: DebateNode[] = [];
  const visit = (node: DebateNode): void => {
    for (const child of node.children) {
      rest.push(child);
      visit(child);
    }
  };
  for (const position of positions) visit(position);
  return [...positions, ...rest];
}

function pointValue(label: string): number {
  return Number(label.slice(1));
}

export function orderedPoints(answer: Answer, story: AnswerStory | null): readonly NumberedPoint[] {
  const nodes = positionsFirstOrder(answer);
  const canonical = story === null ? null : story.point_numbers;
  const numbers = new Map<string, string>();
  const used = new Set<string>();
  if (canonical !== null) {
    for (const node of nodes) {
      const label = canonical[node.id];
      if (label === undefined || used.has(label)) continue;
      numbers.set(node.id, label);
      used.add(label);
    }
  }
  let next = canonical === null ? 0 : Math.max(0, ...Object.values(canonical).map(pointValue));
  for (const node of nodes) {
    if (numbers.has(node.id)) continue;
    next += 1;
    numbers.set(node.id, `P${next}`);
  }
  return nodes
    .map((node) => ({
      number: numbers.get(node.id) ?? "P0",
      node,
      parentNumber: node.parent_id === null ? null : numbers.get(node.parent_id) ?? null
    }))
    .sort((left, right) => pointValue(left.number) - pointValue(right.number));
}

export function numberPoints(answer: Answer, story: AnswerStory | null): ReadonlyMap<string, string> {
  return new Map(orderedPoints(answer, story).map((point) => [point.node.id, point.number]));
}
