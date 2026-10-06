import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serveRelayHost, type RelayHostSeams } from "./relay-host.js";

/**
 * A18a fix round 2 (re-review, out of scope 2) — THE ENDPOINTS WRITER NEVER
 * MASKS ITS OWN FAILURE. When the rename over the endpoints path fails, the
 * cleanup of the temporary file runs; if that cleanup fails too, the caller
 * must still see `RELAY_HOST_ENDPOINTS_WRITE_FAILED`, never the cleanup's error.
 *
 * `rm` is wrapped, not replaced: it runs the real removal unless a test asks
 * the temporary-file cleanup to fail. That is the only way to reach the
 * cleanup's own failure, because the temporary file's name is random. The mock
 * lives in its own file so relay-host.test.ts keeps the real module.
 */
const cleanup = vi.hoisted(() => ({ fail: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>): ReturnType<typeof actual.rm> => {
      if (cleanup.fail && String(args[0]).endsWith(".tmp")) {
        throw Object.assign(new Error("EPERM: the cleanup was refused"), { code: "EPERM" });
      }
      return actual.rm(...args);
    }
  };
});

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./test-fixtures/${name}`, import.meta.url));
const nodeCommand = (name: string) => ({ binary: process.execPath, prefixArguments: [fixture(name)] });
const SEAMS: RelayHostSeams = Object.freeze({
  commands: Object.freeze({
    claude: nodeCommand("fake-claude-cli.mjs"),
    codex: nodeCommand("fake-codex-cli.mjs"),
    grok: nodeCommand("fake-grok-cli.mjs"),
    agy: nodeCommand("fake-agy-cli.mjs"),
    pi: nodeCommand("fake-pi-cli.mjs")
  }),
  codexSessionsRoot: fileURLToPath(new URL("./test-fixtures/codex-sessions", import.meta.url))
});
const PI_CANDIDATE = Object.freeze({
  providerRef: "local:pi-glm", tool: "pi", modelId: "glm-5.3-flash", thinkingLevels: ["low", "high"]
});

describe("relays:serve — the endpoints writer (A18a fix round 2)", () => {
  const workspaces: string[] = [];
  const workspace = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "relay-host-write-"));
    workspaces.push(created);
    return created;
  };

  afterEach(async () => {
    cleanup.fail = false;
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  /** A relay starts, then the rename over the endpoints path fails: a folder already holds the name. */
  const serveOverAFolder = async (): Promise<{ directory: string; attempt: Promise<unknown> }> => {
    const directory = await workspace();
    const candidatesPath = join(directory, "candidates.json");
    await writeFile(candidatesPath, JSON.stringify({ candidates: [PI_CANDIDATE] }), "utf8");
    const endpointsPath = join(directory, "endpoints.json");
    await mkdir(endpointsPath);
    return {
      directory,
      attempt: serveRelayHost({
        candidatesPath,
        endpointsPath,
        environment: { NODE_ENV: "test" },
        seams: SEAMS,
        emit: () => undefined
      })
    };
  };

  it("names RELAY_HOST_ENDPOINTS_WRITE_FAILED and leaves no temporary file when the write fails", async () => {
    const { directory, attempt } = await serveOverAFolder();
    await expect(attempt).rejects.toThrow("RELAY_HOST_ENDPOINTS_WRITE_FAILED");
    expect((await readdir(directory)).sort()).toEqual(["candidates.json", "endpoints.json"]);
  });

  it("never lets a failed cleanup replace RELAY_HOST_ENDPOINTS_WRITE_FAILED", async () => {
    cleanup.fail = true;
    const { attempt } = await serveOverAFolder();
    await expect(attempt).rejects.toThrow("RELAY_HOST_ENDPOINTS_WRITE_FAILED");
  });
});
