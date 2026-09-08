import type { TraceOccurrence } from "./walk.js";

export const NO_CAUSE = "NO_CAUSE" as const;
export const CAUSE_NOT_CAPTURED = "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED" as const;
export const REPLAY_REQUIRED = "REPLAY_REQUIRED" as const;

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isOccurrenceReference(value: string): boolean {
  return CANONICAL_UUID.test(value);
}

export function lineageIsCorrupt(
  child: TraceOccurrence,
  parent: TraceOccurrence,
): boolean {
  return parent.runRef !== child.runRef
    || parent.buildRef !== child.buildRef
    || parent.occSeq >= child.occSeq;
}
