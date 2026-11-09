/**
 * V4 start step, Task 5 (spec 2026-11-03 §5, the "one debate fits each pot" guard): the gate's read-only `/remaining`
 * answer may carry the day's pot (`daily_pot_usd`), and only when the app asked for it. The answer keeps exactly one
 * of four member sets: today's seven, the final-writer room's nine, and each of those plus the pot. The pot is read as
 * exact nano-USD and anything else is refused, like the other money figures.
 */
import { describe, expect, it } from "vitest";
import { parsePreviewGateRemaining } from "@debateai/providers";

const BASE = Object.freeze({ state: "active", window_open: true, remaining_usd: "2.00", remaining_calls: 10, max_concurrent_calls: 2,
  largest_reservation_usd: "0.24704", enabled_models: ["claude-haiku-5-5"] });
const FW = Object.freeze({ largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 1 });

describe("the gate's answer may carry the day's pot", () => {
  it("has no pot when the answer names none", () => {
    expect(parsePreviewGateRemaining(BASE)).not.toHaveProperty("dailyPotNanoUsd");
    expect(parsePreviewGateRemaining({ ...BASE, ...FW })).not.toHaveProperty("dailyPotNanoUsd");
  });

  it("reads the pot as exact nano-USD, with or without the final-writer room", () => {
    expect(parsePreviewGateRemaining({ ...BASE, daily_pot_usd: "7.25" })?.dailyPotNanoUsd).toBe(7_250_000_000n);
    expect(parsePreviewGateRemaining({ ...BASE, ...FW, daily_pot_usd: "7.25" })).toMatchObject({ finalWriterMaxInFlight: 1, dailyPotNanoUsd: 7_250_000_000n });
  });

  it("refuses a pot that is not an exact decimal string, and any other eighth member", () => {
    for (const bad of [7.25, "-1", "7.2500000001", "", null]) expect(parsePreviewGateRemaining({ ...BASE, daily_pot_usd: bad })).toBeUndefined();
    expect(parsePreviewGateRemaining({ ...BASE, pot: "7.25" })).toBeUndefined();
    expect(parsePreviewGateRemaining({ ...BASE, ...FW, pot: "7.25" })).toBeUndefined();
  });
});
