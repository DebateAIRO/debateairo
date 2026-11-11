import { START_SEAT_REUSE_SUFFIX, START_STEP_HAIKU_MODEL, type MapSeat } from "@debateai/map";
import type { ProviderDiscoveryTarget } from "@debateai/providers";

/**
 * V4 start step, Task 27 (spec 2026-11-03 §4.1 "Which AIs", S5; plan Review Focus 3): THE LIST SEATS. A seat's `aiRef` is
 * its MODEL id (the roster names models), with START_SEAT_REUSE_SUFFIX ("#2") on a company's second seat of the same
 * model; the transport strips the mark before anything is sent (`startModelOfSeat`), so a gate, a ledger row and a charge
 * only ever see the model.
 *
 * The order the seats are taken in, fastest first: the order measured on real AIs (plan Task 91 Step 4, the sitting of
 * 9 Nov 2026, 48 cards; set by the owner's card "Apply measured order"). Typical list times: Haiku 4.8 s, DeepSeek 5.0 s,
 * Qwen 5.8 s, GLM 8.2 s, MiMo 16 s. (Before it: the earlier single-call speeds of plan Task 87, Haiku, GLM, Qwen, DeepSeek,
 * MiMo.) So Free's two list seats are Haiku and DeepSeek. Reordered only by a new measurement with the owner's yes, so a
 * reorder is a visible pin change.
 */
export const START_SEAT_SPEED_ORDER: readonly string[] = Object.freeze([
  "claude-haiku-5-5", "deepseek-ai/DeepSeek-V4.1-Flash", "Qwen/Qwen3.8-Flash", "zai-org/GLM-5.3-Flash", "XiaomiMiMo/MiMo-V2.6-Pro"
]);

/** Models the vendor refused as busy (unbilled), sitting out for a while; one book per API process. */
export type StartBusyBook = Readonly<{ mark(model: string): void; busy(): ReadonlySet<string> }>;

/** A busy model sits out `busyMs` (two minutes: about two pre-Start steps) from its last refusal, then comes back. */
export function createStartBusyBook(input: Readonly<{ now?: () => number; busyMs?: number }> = {}): StartBusyBook {
  const now = input.now ?? Date.now;
  const busyMs = input.busyMs ?? 120_000;
  const until = new Map<string, number>();
  return Object.freeze({
    mark(model: string): void { until.set(model, now() + busyMs); },
    busy(): ReadonlySet<string> {
      const at = now();
      for (const [model, end] of until) if (at >= end) until.delete(model);
      return new Set(until.keys());
    }
  });
}

/**
 * The list seats: the roster's models that have a declared target and are not busy, in the speed order (a roster model
 * the order does not name comes after, in roster order). One seat per company first; then each company, in the same
 * order, a second seat: its other model when the roster has one, else the same model marked "#2". Never more than two
 * seats a company, and never more than `count` (the plan's mapAIs), so `min(count, 2 x companies)`. `haiku` is the
 * merge's seat: the Haiku model when a target declares it, whatever the roster (the merge and the combine are Haiku's on
 * every plan) and whether or not it is busy (a refused merge costs nothing and falls back to the code menu).
 */
export function startSeatsFor(input: Readonly<{
  roster: readonly string[]; targetOf(model: string): ProviderDiscoveryTarget | null; count: number; busy: ReadonlySet<string>;
}>): Readonly<{ seats: readonly MapSeat[]; haiku: MapSeat | null }> {
  const ordered = [...new Set([...START_SEAT_SPEED_ORDER.filter((model) => input.roster.includes(model)), ...input.roster])];
  const usable = ordered.flatMap((model) => {
    const target = input.busy.has(model) ? null : input.targetOf(model);
    return target === null ? [] : [Object.freeze({ model, maker: target.maker })];
  });
  const seats: MapSeat[] = [];
  const modelsOf = new Map<string, string[]>();
  for (const one of usable) {
    if (seats.length >= input.count) break;
    if (modelsOf.has(one.maker)) continue;
    modelsOf.set(one.maker, [one.model]);
    seats.push(Object.freeze({ aiRef: one.model, maker: one.maker }));
  }
  for (const first of [...seats]) {
    if (seats.length >= input.count) break;
    const taken = modelsOf.get(first.maker)!;
    const other = usable.find((one) => one.maker === first.maker && !taken.includes(one.model));
    seats.push(Object.freeze({ aiRef: other?.model ?? `${first.aiRef}${START_SEAT_REUSE_SUFFIX}`, maker: first.maker }));
  }
  const haiku = input.targetOf(START_STEP_HAIKU_MODEL);
  return Object.freeze({ seats: Object.freeze(seats),
    haiku: haiku === null ? null : Object.freeze({ aiRef: START_STEP_HAIKU_MODEL, maker: haiku.maker }) });
}

/** A seat's model: its aiRef without the second seat's mark. */
export function startModelOfSeat(aiRef: string): string {
  return aiRef.endsWith(START_SEAT_REUSE_SUFFIX) ? aiRef.slice(0, -START_SEAT_REUSE_SUFFIX.length) : aiRef;
}
