import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(), spawn: transport.spawn
}));
import { SendmailEmailChangeMailSender, SendmailRecoveryEmailMailSender } from "../../apps/api/src/mail-channel.js";

const recipient = "candidate@example.test";
const token = "t".repeat(43);
const expiresAt = new Date("2026-10-05T12:00:00.000Z");
const options = { executable: "/controlled/sendmail", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 25 };
const senders = [
  {
    name: "email change", exitCode: "SENDMAIL_EXIT_42", signalCode: "SENDMAIL_SIGNAL_SIGTERM",
    send: (overrides: Partial<typeof options> = {}) => new SendmailEmailChangeMailSender({ ...options, ...overrides })
      .sendEmailChange({ kind: "confirmation", recipient, token, expiresAt })
  },
  {
    name: "recovery email", exitCode: "SENDMAIL_EXIT_FAILED", signalCode: "SENDMAIL_EXIT_FAILED",
    send: (overrides: Partial<typeof options> = {}) => new SendmailRecoveryEmailMailSender({ ...options, ...overrides })
      .sendRecoveryEmail({ kind: "confirmation", recipient, token, expiresAt })
  }
];

function controlledChild() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: null, stderr: null,
    pid: 12345, exitCode: null, signalCode: null, killed: false,
    kill: vi.fn((_signal: string) => true)
  });
  transport.spawn.mockReturnValue(child);
  return child;
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  transport.spawn.mockReset();
});

// These tests exercise the senders' real validation/rendering/transport path.
// Only the operating-system child boundary is controlled for exact event order.
describe.each(senders)("shared transport via $name", sender => {
  it("maps asynchronous exec failure and clears its deadline", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    const result = sender.send().catch(error => error);
    child.emit("error", new Error("controlled exec failure"));
    expect(await result).toMatchObject({ operatorCode: "SENDMAIL_EXEC_FAILED" });
    expect(vi.getTimerCount()).toBe(0);
    child.emit("exit", 0, null);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("maps synchronous spawn failure to the content-free exec code", async () => {
    vi.useFakeTimers();
    transport.spawn.mockImplementation(() => { throw new Error("controlled spawn failure"); });
    await expect(sender.send()).rejects.toMatchObject({ operatorCode: "SENDMAIL_EXEC_FAILED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps stdin stream failure and ignores a later process exit", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    const result = sender.send().catch(error => error);
    child.stdin.emit("error", new Error("controlled stdin failure"));
    expect(await result).toMatchObject({ operatorCode: "SENDMAIL_STDIN_FAILED" });
    expect(vi.getTimerCount()).toBe(0);
    child.emit("exit", 42, null);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("maps a synchronous stdin write failure and clears its deadline", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    vi.spyOn(child.stdin, "end").mockImplementation(() => { throw new Error("controlled write failure"); });
    await expect(sender.send()).rejects.toMatchObject({ operatorCode: "SENDMAIL_STDIN_FAILED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves its process signal diagnostic and clears the deadline", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    const result = sender.send().catch(error => error);
    child.emit("exit", null, "SIGTERM");
    expect(await result).toMatchObject({ operatorCode: sender.signalCode });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills on the exact deadline and keeps timeout authoritative over late events", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    // A controlled immediate exit also probes re-entrant settlement during kill.
    child.kill.mockImplementation(() => { child.emit("exit", 0, null); return true; });
    const result = sender.send().catch(error => error);
    await vi.advanceTimersByTimeAsync(24);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ operatorCode: "SENDMAIL_TIMEOUT" });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(vi.getTimerCount()).toBe(0);
    child.emit("error", new Error("controlled late error"));
  });

  it("settles successful delivery once and cancels its deadline", async () => {
    vi.useFakeTimers();
    const child = controlledChild();
    const result = sender.send();
    child.emit("exit", 0, null);
    await expect(result).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    child.emit("error", new Error("controlled late exec failure"));
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).not.toHaveBeenCalled();
    expect(transport.spawn).toHaveBeenCalledWith(options.executable, ["-i", "-t", "-f", options.from], {
      stdio: ["pipe", "ignore", "ignore"]
    });
  });

  it("preserves nonzero exit diagnostics through a real local process", async () => {
    const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    transport.spawn.mockImplementation(real.spawn);
    const directory = await mkdtemp(join(tmpdir(), "task3-exit-"));
    const executable = join(directory, "exit-mail");
    await writeFile(executable, "#!/bin/sh\ncat >/dev/null\nexit 42\n", { mode: 0o700 });
    try {
      await expect(sender.send({ executable, timeoutMs: 10_000 })).rejects.toMatchObject({ operatorCode: sender.exitCode });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("bounds a real local process that does not exit after stdin closes", async () => {
    const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    transport.spawn.mockImplementation(real.spawn);
    const directory = await mkdtemp(join(tmpdir(), "task3-timeout-"));
    const executable = join(directory, "stalled-mail");
    await writeFile(executable, "#!/usr/bin/env node\nprocess.stdin.resume();\nsetInterval(() => {}, 1000);\n", { mode: 0o700 });
    try {
      await expect(sender.send({ executable, timeoutMs: 250 })).rejects.toMatchObject({ operatorCode: "SENDMAIL_TIMEOUT" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
