import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const installControl = vi.hoisted(() => ({
  transfer: undefined as Promise<void> | undefined,
  flush: undefined as Promise<Readonly<{
    dequeued: number;
    persisted: number;
    spooled: number;
    lost: number;
  }>> | undefined,
  drain: undefined as Promise<void> | undefined,
  drainCalls: 0,
}));

vi.mock("../../packages/obs-capture/src/emit.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../packages/obs-capture/src/emit.js")
  >();
  return {
    ...original,
    installCaptureEmitter(...args: Parameters<typeof original.installCaptureEmitter>) {
      const originalTransfer = original.installCaptureEmitter(...args);
      void originalTransfer?.catch(() => undefined);
      return installControl.transfer ?? originalTransfer;
    },
  };
});

vi.mock("../../packages/obs-capture/src/flusher.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../packages/obs-capture/src/flusher.js")
  >();
  return {
    ...original,
    createCaptureFlusher(...args: Parameters<typeof original.createCaptureFlusher>) {
      const flusher = original.createCaptureFlusher(...args);
      return Object.freeze({
        async flushOnce() {
          return installControl.flush ?? flusher.flushOnce();
        },
      });
    },
  };
});

vi.mock("../../packages/obs-capture/src/runtime/drain.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../packages/obs-capture/src/runtime/drain.js")
  >();
  return {
    ...original,
    drainDeadSpoolFiles(...args: Parameters<typeof original.drainDeadSpoolFiles>) {
      installControl.drainCalls += 1;
      return installControl.drain ?? original.drainDeadSpoolFiles(...args);
    },
  };
});

import {
  startCaptureRuntime,
  stopCaptureRuntime,
  waitForCaptureEmitterInstalled,
  type CaptureEmitterInstallOutcome,
} from "@debateai/obs-capture/runtime";

const paths: string[] = [];

afterEach(async () => {
  installControl.transfer = undefined;
  installControl.flush = undefined;
  installControl.drain = undefined;
  installControl.drainCalls = 0;
  await stopCaptureRuntime({ deadlineMs: 20 });
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("FIX-01 C5 capture-emitter readiness", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "turns invalid deadline %s into timed_out",
    async (deadlineMs) => {
      await expect(waitForCaptureEmitterInstalled({ deadlineMs })).resolves.toBe(
        "timed_out",
      );
    },
  );

  it("lets an idle waiter target the next failed start generation", async () => {
    const waiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });

    await expect(startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: -1,
      installExitSink() {},
    })).rejects.toThrow("SPOOL_FD_INVALID");

    await expect(waiter).resolves.toBe("start_failed");
  });

  it("signals installed before a post-swap startup failure settles", async () => {
    let rejectTransfer: ((reason: Error) => void) | undefined;
    installControl.transfer = new Promise<void>((_resolve, reject) => {
      rejectTransfer = reject;
    });
    const before = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    let settled = false;
    const starting = startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    }).finally(() => {
      settled = true;
    });

    await expect(before).resolves.toBe("installed");
    await expect(waitForCaptureEmitterInstalled({ deadlineMs: 1_000 })).resolves.toBe(
      "installed",
    );
    expect(settled).toBe(false);
    rejectTransfer?.(new Error("PLANTED_POST_SWAP_FAILURE"));
    await expect(starting).rejects.toThrow("PLANTED_POST_SWAP_FAILURE");
  });

  it("signals installed before the first flush settles", async () => {
    let releaseFlush: ((result: Readonly<{
      dequeued: number;
      persisted: number;
      spooled: number;
      lost: number;
    }>) => void) | undefined;
    installControl.flush = new Promise((resolve) => {
      releaseFlush = resolve;
    });
    const waiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    let started = false;
    const starting = startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    }).then(() => {
      started = true;
    });

    await expect(waiter).resolves.toBe("installed");
    expect(started).toBe(false);
    releaseFlush?.(Object.freeze({ dequeued: 0, persisted: 0, spooled: 0, lost: 0 }));
    await starting;
  });

  it("keeps an in-flight start bound to its state after stop clears the active runtime", async () => {
    let releaseTransfer: (() => void) | undefined;
    installControl.transfer = new Promise<void>((resolve) => {
      releaseTransfer = resolve;
    });
    const starting = startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });

    await expect(waitForCaptureEmitterInstalled({ deadlineMs: 1_000 })).resolves.toBe(
      "installed",
    );
    await stopCaptureRuntime({ deadlineMs: 0 });

    releaseTransfer?.();
    await expect(starting).resolves.toBeUndefined();
  });

  it("keeps a stopped in-flight generation inert after a restart", async () => {
    let releaseTransfer: (() => void) | undefined;
    installControl.transfer = new Promise<void>((resolve) => {
      releaseTransfer = resolve;
    });
    const starting = startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });

    await expect(waitForCaptureEmitterInstalled({ deadlineMs: 1_000 })).resolves.toBe(
      "installed",
    );
    await stopCaptureRuntime({ deadlineMs: 0 });

    installControl.transfer = Promise.resolve();
    const restartedReady = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    const restarted = startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await expect(restartedReady).resolves.toBe("installed");
    await restarted;
    expect(installControl.drainCalls).toBe(1);

    releaseTransfer?.();
    await expect(starting).resolves.toBeUndefined();
    expect(installControl.drainCalls).toBe(1);
  });

  it("keeps installed settled while the initial drain is blocked", async () => {
    let releaseDrain: (() => void) | undefined;
    installControl.drain = new Promise((resolve) => {
      releaseDrain = resolve;
    });
    const waiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });

    await startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });

    await expect(waiter).resolves.toBe("installed");
    expect(installControl.drainCalls).toBe(1);
    releaseDrain?.();
  });

  it("lets a waiter created during start follow the current generation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fix01-readiness-during-start-"));
    paths.push(directory);
    const fd = openSync(join(directory, "runtime.spool"), "a+");
    let waiter: Promise<CaptureEmitterInstallOutcome> | undefined;
    try {
      await startCaptureRuntime({
        runtime: "scheduler",
        spoolFd: fd,
        installExitSink() {
          waiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
        },
      });
      await expect(waiter).resolves.toBe("installed");
    } finally {
      closeSync(fd);
    }
  });

  it("settles a pre-swap waiter as stopped and does not leak it into a restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fix01-readiness-"));
    paths.push(directory);
    const fd = openSync(join(directory, "runtime.spool"), "a+");
    let firstWaiter: Promise<CaptureEmitterInstallOutcome> | undefined;
    let stopping: Promise<void> | undefined;

    try {
      await startCaptureRuntime({
        runtime: "scheduler",
        spoolFd: fd,
        installExitSink() {
          firstWaiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
          stopping = stopCaptureRuntime({ deadlineMs: 20 });
        },
      });
      await stopping;
      await expect(firstWaiter).resolves.toBe("stopped");
    } finally {
      closeSync(fd);
    }

    const secondWaiter = waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    await startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await expect(secondWaiter).resolves.toBe("installed");
  });

  it("times out once when no generation starts", async () => {
    const outcomes: CaptureEmitterInstallOutcome[] = [];
    const outcome = await waitForCaptureEmitterInstalled({ deadlineMs: 1 });
    outcomes.push(outcome);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(outcomes).toEqual(["timed_out"]);
  });
});
