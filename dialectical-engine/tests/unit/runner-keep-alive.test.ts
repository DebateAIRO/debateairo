import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { ClaimRenewal } from "@debateai/battery";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";
import {
  RUNNER_PROGRESS_CEILING_MS,
  keepAliveProviderGateway,
  runKeepAliveScope,
  startRunKeepAlive,
  type RunKeepAlive,
  type RunnerTaskControl
} from "../../apps/runner/src/run-keep-alive.js";
import { endsThisCopy } from "../../apps/runner/src/engine-judging.js";

/**
 * L4-F9 repair (owner ruling 2026-10-11, options 1 + 3). A debate is ONE work
 * item, claimed once for a window sized to one model call, and ONE Hatchet task
 * with a 60-minute limit whose cancel the debate never read. So a debate past
 * either window was re-claimed by the retry Hatchet sends, and ran twice.
 *
 * The keep-alive is what a running debate now does about both windows:
 *  · it renews its claim while it runs, fenced on the deadline it last saw, so a
 *    second dispatch finds the item taken and stands down;
 *  · it tells Hatchet "still working" after a model call finishes, so the limit
 *    means 60 minutes without one, never past the six-hour ceiling;
 *  · when Hatchet gives up, or the claim is somebody else's, it refuses every
 *    further model call, so nothing more is spent.
 */

const MINUTE = 60_000;
const LIMIT_MS = 60 * MINUTE;
const T0 = Date.UTC(2026, 9, 11, 9, 0, 0);

function manualClock(start = T0) {
  let now = start;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle: unknown) => { timers.delete(handle as number); },
    pending: () => timers.size,
    /** Moves the clock, firing every timer that falls due on the way, in order. */
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        // Let the renewal the timer started settle before the next one is due.
        for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
      }
      now = target;
    }
  };
}

function stopCode(keepAlive: RunKeepAlive): string | null {
  try {
    keepAlive.assertMayCall();
    return null;
  } catch (error) {
    return error instanceof TypedDomainError ? error.code : "UNTYPED";
  }
}

function hatchetTask(input: { readonly signal?: AbortSignal } = {}) {
  const refreshes: string[] = [];
  const task: RunnerTaskControl = {
    executionLimitMs: LIMIT_MS,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    refreshTimeout: async (incrementBy) => { refreshes.push(incrementBy); }
  };
  return { task, refreshes };
}

describe("L4-F9 — a running debate keeps its claim", () => {
  it("renews before the claim lapses, fencing each renewal on the deadline it last saw", async () => {
    const clock = manualClock();
    const seen: number[] = [];
    let deadline = T0 + 30 * MINUTE;
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(deadline),
      renewEveryMs: 10 * MINUTE,
      renew: async (heldUntil): Promise<ClaimRenewal> => {
        seen.push(heldUntil.getTime());
        deadline = clock.now() + 30 * MINUTE;
        return { kind: "RENEWED", claimDeadline: new Date(deadline) };
      },
      clock
    });
    await clock.advance(9 * MINUTE);
    expect(seen).toEqual([]);
    await clock.advance(MINUTE);
    expect(seen).toEqual([T0 + 30 * MINUTE]);
    await clock.advance(10 * MINUTE);
    expect(seen).toEqual([T0 + 30 * MINUTE, T0 + 40 * MINUTE]);
    expect(stopCode(keepAlive)).toBeNull();
    keepAlive.stop();
  });

  it("tells the deadline it holds: the claim's, then each renewal's (the fence of the reclaim resume's set-aside)", async () => {
    const clock = manualClock();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE),
      renewEveryMs: 10 * MINUTE,
      renew: async (): Promise<ClaimRenewal> => ({ kind: "RENEWED", claimDeadline: new Date(clock.now() + 30 * MINUTE) }),
      clock
    });
    expect(keepAlive.heldUntil().getTime()).toBe(T0 + 30 * MINUTE);
    await clock.advance(10 * MINUTE);
    expect(keepAlive.heldUntil().getTime()).toBe(T0 + 40 * MINUTE);
    keepAlive.stop();
  });

  it("stops every further model call once another copy holds the claim", async () => {
    const clock = manualClock();
    let renewals = 0;
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE),
      renewEveryMs: 10 * MINUTE,
      renew: async (): Promise<ClaimRenewal> => { renewals += 1; return { kind: "LOST" }; },
      clock
    });
    expect(stopCode(keepAlive)).toBeNull();
    await clock.advance(10 * MINUTE);
    expect(stopCode(keepAlive)).toBe("RUNNER_CLAIM_LOST");
    await clock.advance(60 * MINUTE);
    expect(renewals).toBe(1);
  });

  it("ends its renewals quietly when the job is already settled", async () => {
    const clock = manualClock();
    let renewals = 0;
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE),
      renewEveryMs: 10 * MINUTE,
      renew: async (): Promise<ClaimRenewal> => { renewals += 1; return { kind: "FINISHED" }; },
      clock
    });
    await clock.advance(60 * MINUTE);
    expect(renewals).toBe(1);
    expect(stopCode(keepAlive)).toBeNull();
  });

  it("tries again on the next beat when a renewal fails, still fenced on the old deadline", async () => {
    const clock = manualClock();
    const seen: number[] = [];
    const lines: Readonly<Record<string, string>>[] = [];
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE),
      renewEveryMs: 10 * MINUTE,
      renew: async (heldUntil): Promise<ClaimRenewal> => {
        seen.push(heldUntil.getTime());
        throw Object.assign(new Error("connection terminated: secret-host"), { code: "57P01" });
      },
      clock,
      log: (line) => lines.push(line)
    });
    await clock.advance(20 * MINUTE);
    expect(seen).toEqual([T0 + 30 * MINUTE, T0 + 30 * MINUTE]);
    expect(stopCode(keepAlive)).toBeNull();
    expect(lines[0]?.kind).toBe("RUNNER_CLAIM_RENEWAL_FAILED");
    expect(JSON.stringify(lines)).not.toContain("secret-host");
    keepAlive.stop();
  });

  it("stops renewing when the debate ends", async () => {
    const clock = manualClock();
    let renewals = 0;
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE),
      renewEveryMs: 10 * MINUTE,
      renew: async (): Promise<ClaimRenewal> => {
        renewals += 1;
        return { kind: "RENEWED", claimDeadline: new Date(clock.now() + 30 * MINUTE) };
      },
      clock
    });
    keepAlive.stop();
    expect(clock.pending()).toBe(0);
    await clock.advance(60 * MINUTE);
    expect(renewals).toBe(0);
  });
});

describe("Owner ruling 2026-10-11 — 60 minutes means 60 minutes without a finished model call", () => {
  const renewed = (clock: ReturnType<typeof manualClock>) => async (): Promise<ClaimRenewal> =>
    ({ kind: "RENEWED", claimDeadline: new Date(clock.now() + 30 * MINUTE) });

  it("stops every further model call once Hatchet gives up on the debate", async () => {
    const clock = manualClock();
    const controller = new AbortController();
    const { task } = hatchetTask({ signal: controller.signal });
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock
    });
    expect(stopCode(keepAlive)).toBeNull();
    controller.abort();
    expect(stopCode(keepAlive)).toBe("RUNNER_TIME_LIMIT_REACHED");
    keepAlive.stop();
  });

  it("stops at the limit on its own when Hatchet's cancel never arrives", async () => {
    const clock = manualClock();
    const { task } = hatchetTask();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock
    });
    await clock.advance(LIMIT_MS - 1);
    expect(stopCode(keepAlive)).toBeNull();
    await clock.advance(1);
    expect(stopCode(keepAlive)).toBe("RUNNER_TIME_LIMIT_REACHED");
    keepAlive.stop();
  });

  it("tells Hatchet the debate is still working after a finished call, and moves the limit with it", async () => {
    const clock = manualClock();
    const { task, refreshes } = hatchetTask();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock
    });
    await clock.advance(10 * MINUTE);
    keepAlive.progressed();
    // Hatchet adds the increment to its own deadline: 60 minutes from the call.
    expect(refreshes).toEqual(["600s"]);
    await clock.advance(LIMIT_MS - 1);
    expect(stopCode(keepAlive)).toBeNull();
    await clock.advance(1);
    expect(stopCode(keepAlive)).toBe("RUNNER_TIME_LIMIT_REACHED");
    keepAlive.stop();
  });

  it("tells Hatchet at most once a minute", async () => {
    const clock = manualClock();
    const { task, refreshes } = hatchetTask();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock
    });
    await clock.advance(30_000);
    keepAlive.progressed();
    expect(refreshes).toEqual([]);
    await clock.advance(60_000);
    keepAlive.progressed();
    keepAlive.progressed();
    expect(refreshes).toEqual(["90s"]);
    keepAlive.stop();
  });

  it("stops telling Hatchet after six hours, so the debate ends at most an hour later", async () => {
    expect(RUNNER_PROGRESS_CEILING_MS).toBe(6 * 60 * MINUTE);
    const clock = manualClock();
    const { task, refreshes } = hatchetTask();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock
    });
    for (let minute = 10; minute < 360; minute += 10) {
      await clock.advance(10 * MINUTE);
      keepAlive.progressed();
    }
    expect(refreshes).toHaveLength(35);
    // Minute 360: the ceiling. A call that finishes now is not reported.
    await clock.advance(10 * MINUTE);
    keepAlive.progressed();
    expect(refreshes).toHaveLength(35);
    // The last report was at minute 350, so the limit falls at minute 410.
    await clock.advance(50 * MINUTE - 1);
    expect(stopCode(keepAlive)).toBeNull();
    await clock.advance(1);
    expect(stopCode(keepAlive)).toBe("RUNNER_TIME_LIMIT_REACHED");
    keepAlive.stop();
  });

  it("never lets a failed report reach the debate", async () => {
    const clock = manualClock();
    const lines: Readonly<Record<string, string>>[] = [];
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), clock,
      log: (line) => lines.push(line),
      task: {
        executionLimitMs: LIMIT_MS,
        refreshTimeout: () => { throw new Error("dispatcher unreachable"); }
      }
    });
    await clock.advance(5 * MINUTE);
    expect(() => keepAlive.progressed()).not.toThrow();
    expect(lines.map((line) => line.kind)).toEqual(["RUNNER_TIMEOUT_REFRESH_FAILED"]);
    keepAlive.stop();
  });

  it("sets no time limit on a debate run outside Hatchet", async () => {
    const clock = manualClock();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), clock
    });
    await clock.advance(10 * LIMIT_MS);
    expect(stopCode(keepAlive)).toBeNull();
    keepAlive.stop();
  });
});

describe("side-by-side spec §4 — a retiring release starts no new model call", () => {
  const renewed = (clock: ReturnType<typeof manualClock>) => async (): Promise<ClaimRenewal> =>
    ({ kind: "RENEWED", claimDeadline: new Date(clock.now() + 30 * MINUTE) });

  it("refuses the next model call with RUNNER_RETIRING once the release stops its calls", () => {
    const clock = manualClock();
    let stopped = false;
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), clock,
      stopCalls: () => stopped
    });
    expect(stopCode(keepAlive)).toBeNull();
    stopped = true;
    expect(stopCode(keepAlive)).toBe("RUNNER_RETIRING");
    keepAlive.stop();
  });

  it("names a lost claim first: another copy holds the debate, whatever this release is doing", async () => {
    const clock = manualClock();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE,
      renew: async (): Promise<ClaimRenewal> => ({ kind: "LOST" }), clock, stopCalls: () => true
    });
    expect(stopCode(keepAlive)).toBe("RUNNER_RETIRING");
    await clock.advance(10 * MINUTE);
    expect(stopCode(keepAlive)).toBe("RUNNER_CLAIM_LOST");
    keepAlive.stop();
  });

  it("names the retirement before the time limit", () => {
    const clock = manualClock();
    const controller = new AbortController();
    const { task } = hatchetTask({ signal: controller.signal });
    controller.abort();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), task, clock,
      stopCalls: () => true
    });
    expect(stopCode(keepAlive)).toBe("RUNNER_RETIRING");
    keepAlive.stop();
  });

  it("lets every call through while the release is not retiring", () => {
    const clock = manualClock();
    const keepAlive = startRunKeepAlive({
      claimDeadline: new Date(T0 + 30 * MINUTE), renewEveryMs: 10 * MINUTE, renew: renewed(clock), clock,
      stopCalls: () => false
    });
    expect(stopCode(keepAlive)).toBeNull();
    keepAlive.stop();
  });

  it("engine 2's judging step lets the refusal end this copy, as a lost claim does", () => {
    expect(endsThisCopy(new TypedDomainError("RUNNER_RETIRING", "x"))).toBe(true);
    expect(endsThisCopy(new TypedDomainError("RUNNER_CLAIM_LOST", "x"))).toBe(true);
  });
});

describe("the runner's model gateway obeys the keep-alive", () => {
  const request = { runId: "run:1", callSiteKey: "JUDGE" } as unknown as ProviderCallRequest;
  const answer = { content: "{}" } as unknown as ProviderCallResult;

  function recordingGateway(outcome: "answers" | "fails" = "answers") {
    const sent: ProviderCallRequest[] = [];
    const gateway: ProviderGateway = {
      call: async (sentRequest) => {
        sent.push(sentRequest);
        if (outcome === "fails") throw new Error("vendor 503");
        return answer;
      }
    };
    return { gateway, sent };
  }

  function keepAliveStub(stop: string | null) {
    const progress: number[] = [];
    const keepAlive: RunKeepAlive = {
      assertMayCall: () => { if (stop !== null) throw new TypedDomainError(stop, stop); },
      progressed: () => { progress.push(1); },
      heldUntil: () => new Date(0),
      stop: () => undefined
    };
    return { keepAlive, progress };
  }

  it("refuses a call before anything is sent once the debate must stop", async () => {
    const { gateway, sent } = recordingGateway();
    const { keepAlive, progress } = keepAliveStub("RUNNER_TIME_LIMIT_REACHED");
    await expect(runKeepAliveScope.run(keepAlive, () => keepAliveProviderGateway(gateway).call(request)))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(sent).toEqual([]);
    expect(progress).toEqual([]);
  });

  it("reports progress after every finished call, answered or failed", async () => {
    const answered = recordingGateway("answers");
    const failed = recordingGateway("fails");
    const { keepAlive, progress } = keepAliveStub(null);
    await expect(runKeepAliveScope.run(keepAlive, () => keepAliveProviderGateway(answered.gateway).call(request)))
      .resolves.toBe(answer);
    await expect(runKeepAliveScope.run(keepAlive, () => keepAliveProviderGateway(failed.gateway).call(request)))
      .rejects.toThrow("vendor 503");
    expect(progress).toEqual([1, 1]);
  });

  it("passes a call straight through outside a debate", async () => {
    const { gateway, sent } = recordingGateway();
    await expect(keepAliveProviderGateway(gateway).call(request)).resolves.toBe(answer);
    expect(sent).toEqual([request]);
  });
});
