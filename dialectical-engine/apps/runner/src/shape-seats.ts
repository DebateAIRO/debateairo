/**
 * Debate shape (spec §3.3 steps 2–3) — who writes what. Positions go to DIFFERENT makers, the opener-rotation seat
 * first; a position whose maker sits out goes to a maker without one, else to one that already argues one. A point,
 * reply or defence is written by a maker other than the one it answers, rotating.
 */
export function shapeSeatOrder<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const seat of seats) {
    if (seen.has(seat.main.maker)) rest.push(seat); else { seen.add(seat.main.maker); first.push(seat); }
  }
  return Object.freeze([...first, ...rest]);
}

export type ShapeHandOver = Readonly<{ kind: "SWAP" | "SHARE"; withIndex: number }> | Readonly<{ kind: "NONE" }>;

export function shapeHandOverRoot(input: Readonly<{ makers: readonly string[]; rootCount: number; rootIndex: number; sitsOut: (index: number) => boolean }>): ShapeHandOver {
  const arguing = new Set(input.makers.slice(0, input.rootCount).filter((_maker, index) => index !== input.rootIndex && !input.sitsOut(index)));
  for (let index = input.rootCount; index < input.makers.length; index += 1) {
    if (!input.sitsOut(index) && !arguing.has(input.makers[index]!)) return Object.freeze({ kind: "SWAP", withIndex: index });
  }
  for (let step = 1; step < input.rootCount; step += 1) {
    const index = (input.rootIndex + step) % input.rootCount;
    if (!input.sitsOut(index)) return Object.freeze({ kind: "SHARE", withIndex: index });
  }
  return Object.freeze({ kind: "NONE" });
}

export function shapeWriterSeat(input: Readonly<{ seatMakers: readonly string[]; avoidMakers: readonly string[];
  preferMaker: string | null; offset: number; sitsOut: (index: number) => boolean }>): number | null {
  const count = input.seatMakers.length;
  const open = (index: number): boolean => !input.sitsOut(index) && !input.avoidMakers.includes(input.seatMakers[index]!);
  const at = (step: number): number => (((input.offset + step) % count) + count) % count;
  if (input.preferMaker !== null) {
    for (let step = 0; step < count; step += 1) {
      const index = at(step);
      if (open(index) && input.seatMakers[index] === input.preferMaker) return index;
    }
  }
  for (let step = 0; step < count; step += 1) {
    const index = at(step);
    if (open(index)) return index;
  }
  return null;
}
