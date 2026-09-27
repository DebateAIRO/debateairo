import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCliRelayServer, type CliRelayAdapter, type CliRelayHandle } from "./relay-core.js";

/**
 * Task A8 fix round 2. Under EMFILE or ENFILE, Node's `spawn` neither throws nor
 * hands back a usable child: it schedules an `error` event for the next tick and
 * returns a ChildProcess whose stdin, stdout and stderr were never set up
 * (`undefined`). Exhausting this host's real descriptors to provoke that is not an
 * option, so `spawn` is replaced — in THIS file only — by a double that behaves
 * exactly so. Nothing is ever executed here: the double records the binary it
 * was handed and starts nothing, and that binary does not exist either.
 */
const { spawnCalls } = vi.hoisted(() => ({ spawnCalls: [] as string[] }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const spawn = (binary: string) => {
    spawnCalls.push(binary);
    const child = Object.assign(new EventEmitter(), {
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      pid: undefined,
      exitCode: null,
      signalCode: null,
      kill: (): boolean => false
    });
    process.nextTick(() => child.emit("error", Object.assign(new Error("spawn EMFILE"), {
      code: "EMFILE",
      errno: -24,
      syscall: "spawn"
    })));
    return child;
  };
  return { ...actual, default: { ...actual, spawn }, spawn };
});

const handles: CliRelayHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function relayLeftovers(maker: string): Promise<string[]> {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith(`relay-${maker}-`));
}

describe("fix round 2: EMFILE/ENFILE — spawn returns a child without stdio and a scheduled error", () => {
  it("answers 502 with the adapter's failure code, reaps every directory, and raises nothing uncaught", async () => {
    const uncaught: unknown[] = [];
    const record = (error: unknown): void => {
      uncaught.push(error);
    };
    process.on("uncaughtException", record);
    const observed: unknown[] = [];
    const expected: unknown[] = [];
    try {
      for (const transport of ["argv", "stdin", "file"] as const) {
        const maker = `emfile-${transport}-fixture`;
        const binary = join(tmpdir(), `${maker}-never-run`);
        const seen: string[] = [];
        const adapter: CliRelayAdapter = {
          maker,
          authEnvironmentKeys: [],
          testEnvironmentKeys: [],
          failureCode: "FIXTURE_FAILED",
          timeoutCode: "FIXTURE_TIMEOUT",
          promptTransport: transport,
          buildArguments: (_prompt, invocation) => {
            if (invocation?.promptFile !== undefined) seen.push(invocation.promptFile);
            return invocation?.promptFile === undefined ? [] : ["--attach", invocation.promptFile];
          },
          parseCompletion: (stdout: string) => ({ content: stdout, model: "fixture-model", usage: null })
        };
        const handle = await startCliRelayServer({
          port: 0,
          timeoutMs: 5_000,
          command: { binary, prefixArguments: [] },
          adapter
        });
        handles.push(handle);

        const response = await fetch(`${handle.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: handle.authorizationHeader },
          body: JSON.stringify({ model: "fixture-model", messages: [{ role: "user", content: "Descriptor probe." }] })
        });

        observed.push({
          transport,
          status: response.status,
          body: await response.json() as unknown,
          // The double, not a real spawn, answered: a real ENOENT would also be a 502.
          spawned: spawnCalls.at(-1),
          promptFiles: seen.length,
          promptDirectoryLeft: seen.some((promptFile) => existsSync(dirname(promptFile))),
          leftovers: await relayLeftovers(maker)
        });
        expected.push({
          transport,
          status: 502,
          body: { error: "FIXTURE_FAILED" },
          spawned: binary,
          promptFiles: transport === "file" ? 1 : 0,
          promptDirectoryLeft: false,
          leftovers: []
        });
      }
      // The scheduled `error` fires on the next tick; give it time to surface.
      await delay(50);
    } finally {
      process.off("uncaughtException", record);
    }

    expect({
      observed,
      uncaught: uncaught.map((error) => error instanceof Error ? error.message : String(error))
    }).toEqual({ observed: expected, uncaught: [] });
  });
});
