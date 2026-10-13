/**
 * Debate shape — the two choices the propagated numbers make (pure code; no model is asked):
 *  · adaptive deeper rounds (spec §3.3 step 5): at the round-1 boundary, per position, the `deeperTopPoints` chosen
 *    points with the highest ROOT leverage (resolveLeverage: the largest change in any root when the point is
 *    removed) keep their chains; a frozen (ε) or unscored point never does. Later rounds extend the same chains.
 *  · scrutiny (step 7): after the planned rounds, nodes ranked by need — a spread at or above the disagreement
 *    threshold, a reviewer dispute, or root leverage ≥ leverageMin with base strength < weakBelow — then leverage,
 *    then plan order; at most `pointsPerDebate`.
 */
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number> {
  const selected = new Set<number>();
  const bound = Math.max(0, input.perRoot);
  for (const chains of input.chainsByRoot.values()) {
    const scored = chains.flatMap((position) => {
      if (input.frozen.has(position)) return [];
      const leverage = input.leverageOf(position);
      return leverage === null ? [] : [{ position, leverage }];
    });
    scored.sort((left, right) => right.leverage - left.leverage || left.position - right.position);
    for (const entry of scored.slice(0, bound)) selected.add(entry.position);
  }
  return selected;
}

export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;

export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[] {
  const needs = (node: ScrutinyCandidate): number =>
    (node.dispersion !== null && node.dispersion >= input.disagreementThreshold ? 1 : 0)
    + (node.disputed ? 1 : 0)
    + (node.rootLeverage !== null && node.rootLeverage >= input.leverageMin && node.baseTau < input.weakBelow ? 1 : 0);
  const budget = Math.max(0, input.pointsPerDebate);
  return Object.freeze(input.candidates
    .map((node) => ({ node, needs: needs(node) }))
    .filter((entry) => entry.needs > 0)
    .sort((left, right) => right.needs - left.needs
      || (right.node.rootLeverage ?? -1) - (left.node.rootLeverage ?? -1)
      || left.node.position - right.node.position)
    .slice(0, budget)
    .map((entry) => entry.node));
}

/** Spec §3.3 step 6: a close call (measured spread ≥ the disagreement threshold) gains up to E graders. */
export function shapeCloseCallFires(dispersion: number | null, threshold: number, extra: number): boolean {
  return extra > 0 && dispersion !== null && dispersion >= threshold;
}

/**
 * The extra seats: not called yet, with a maker that is neither the author's nor already on the panel, at most one
 * per maker, in rotation from `offset`. Appended AFTER the panel's members, so the repeated-family discount never
 * re-weights a voice already heard: under the unchanged highest-voice rule an extra can only raise the selected score
 * or widen the spread (spec §6).
 */
export function shapeCloseCallExtraSeats(input: Readonly<{ seatMakers: readonly (string | null)[]; called: readonly boolean[];
  authorMaker: string; onPanelMakers: readonly string[]; extra: number; offset: number }>): readonly number[] {
  const count = input.seatMakers.length;
  const taken = new Set([input.authorMaker, ...input.onPanelMakers]);
  const chosen: number[] = [];
  for (let step = 0; step < count && chosen.length < input.extra; step += 1) {
    const index = (input.offset + step) % count;
    const maker = input.seatMakers[index];
    if (maker === null || maker === undefined || input.called[index] === true || taken.has(maker)) continue;
    taken.add(maker);
    chosen.push(index);
  }
  return Object.freeze(chosen);
}

/**
 * Pre-flight PF-B32 (law: always an answer) — the extension's outcome, folded EXACTLY as the base panel's. The
 * extension's author is judgements[0], as in the base run: kept once; its other voices come AFTER every voice already
 * heard. A run-level spend stop it handed back (root 0's panel asks `RETURN_HEARD`, as its base panel does) is kept
 * with the voices it heard when `stopOf` (the runner's `panelSpendStop(·, input.onSpendStop)`) classifies it, and
 * rethrown otherwise, as the base panel rethrows an unclassified one. Generic, so this file never imports ./index.js.
 */
export function shapeCloseCallFold<J, N, S>(input: Readonly<{ heard: readonly J[]; notes: readonly N[];
  extension: Readonly<{ judgements: readonly J[]; notes: readonly N[]; stoppedBy?: unknown }>;
  stopOf: (error: unknown) => S | null }>): Readonly<{ heard: readonly J[]; notes: readonly N[]; added: number; spendStop: S | null }> {
  let spendStop: S | null = null;
  if (Object.hasOwn(input.extension, "stoppedBy")) {
    spendStop = input.stopOf(input.extension.stoppedBy);
    if (spendStop === null) throw input.extension.stoppedBy;
  }
  const extras = input.extension.judgements.slice(1);
  return Object.freeze({
    heard: Object.freeze([...input.heard, ...extras]),
    notes: Object.freeze([...input.notes, ...input.extension.notes]),
    added: extras.length,
    spendStop
  });
}
