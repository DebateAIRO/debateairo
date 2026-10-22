import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gatedInterval, gatedTrigger } from "../../apps/api/src/release-loops.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C7): every API background loop runs only while this process's
 * release is current. The tick of a gated loop keeps coming; the work behind it is asked only when the release
 * watcher's last read says this release is current, so a staged or retiring release beside the current one never
 * claims a background row.
 */
let current = false;
const gate = { ownIsCurrent: () => current };

beforeEach(() => {
  vi.useFakeTimers();
  current = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("side-by-side C7 gatedInterval", () => {
  it("never asks the work while the release is not current, then once per interval once it is", () => {
    const trigger = vi.fn();
    const timer = gatedInterval(gate, trigger, 30_000);
    try {
      vi.advanceTimersByTime(3 * 30_000);
      expect(trigger).not.toHaveBeenCalled();
      current = true;
      vi.advanceTimersByTime(30_000);
      expect(trigger).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2 * 30_000);
      expect(trigger).toHaveBeenCalledTimes(3);
      current = false;
      vi.advanceTimersByTime(2 * 30_000);
      expect(trigger).toHaveBeenCalledTimes(3);
    } finally {
      clearInterval(timer);
    }
  });

  it("never holds the process open (unref'd), and stops with clearInterval", () => {
    const trigger = vi.fn();
    const timer = gatedInterval(gate, trigger, 1_000);
    expect(timer.hasRef()).toBe(false);
    current = true;
    clearInterval(timer);
    vi.advanceTimersByTime(5_000);
    expect(trigger).not.toHaveBeenCalled();
  });
});

describe("side-by-side C7 gatedTrigger", () => {
  it("calls through only while the release is current, reading the gate at every call", () => {
    const trigger = vi.fn();
    const gated = gatedTrigger(gate, trigger);
    gated();
    expect(trigger).not.toHaveBeenCalled();
    current = true;
    gated();
    gated();
    expect(trigger).toHaveBeenCalledTimes(2);
    current = false;
    gated();
    expect(trigger).toHaveBeenCalledTimes(2);
  });
});
