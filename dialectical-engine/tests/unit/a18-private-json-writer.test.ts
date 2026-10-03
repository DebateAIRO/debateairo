import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writePrivateJsonFile } from "../../acceptance/moment-tools.js";

/**
 * Model scorecard A18a, fix round 1 (review Minor 4) — THE PRIVATE WRITER. A
 * moment file and a replay result carry decrypted debate text: written whole or
 * not at all, owner-only, and a failed write names ITS OWN error, even when the
 * cleanup after it fails too.
 *
 * `rm` is wrapped, not replaced: it runs the real removal unless a test asks the
 * temporary-file cleanup to fail. That is the only way to reach the cleanup's
 * own failure, because the temporary file's name is random.
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

describe("A18 · writePrivateJsonFile", () => {
  const workspaces: string[] = [];
  const workspace = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "a18-private-writer-"));
    workspaces.push(created);
    return created;
  };

  afterEach(async () => {
    cleanup.fail = false;
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("writes the value whole and owner-only (0600), and leaves no temporary file", async () => {
    const directory = await workspace();
    const path = join(directory, "m.json");
    await writePrivateJsonFile(path, { kind: "DEBATEAI_MOMENT", text: "private" });
    expect(await readFile(path, "utf8")).toBe(`${JSON.stringify({ kind: "DEBATEAI_MOMENT", text: "private" }, null, 2)}\n`);
    expect(((await stat(path)).mode & 0o777).toString(8)).toBe("600");
    expect(await readdir(directory)).toEqual(["m.json"]);
  });

  it("replaces an existing file with an owner-only one", async () => {
    const directory = await workspace();
    const path = join(directory, "m.json");
    await writeFile(path, "old\n", { mode: 0o644 });
    await writePrivateJsonFile(path, { replaced: true });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ replaced: true });
    expect(((await stat(path)).mode & 0o777).toString(8)).toBe("600");
    expect(await readdir(directory)).toEqual(["m.json"]);
  });

  it("leaves no temporary file behind when the write fails, and throws the write's own error", async () => {
    const directory = await workspace();
    // A folder holds the name: the rename over it fails after the temporary file exists.
    await mkdir(join(directory, "taken"));
    await expect(writePrivateJsonFile(join(directory, "taken"), { lost: true }))
      .rejects.toThrowError(expect.objectContaining({ code: "EISDIR" }));
    expect(await readdir(directory)).toEqual(["taken"]);
  });

  it("never lets a failed cleanup replace the write's own error", async () => {
    const directory = await workspace();
    await mkdir(join(directory, "taken"));
    cleanup.fail = true;
    await expect(writePrivateJsonFile(join(directory, "taken"), { lost: true }))
      .rejects.toThrowError(expect.objectContaining({ code: "EISDIR" }));
  });
});
