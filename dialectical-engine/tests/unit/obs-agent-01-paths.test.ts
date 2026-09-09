import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  observationRepoRoot,
  resolveRepoPath
} from "../../apps/observation-agent/src/core/paths.js";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function repoFixture(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "obs-01-paths-"));
  scratchDirectories.push(repoRoot);
  await Promise.all([
    mkdir(join(repoRoot, "apps/observation-agent"), { recursive: true }),
    mkdir(join(repoRoot, ".local/dev-auth/tls"), { recursive: true }),
    mkdir(join(repoRoot, "deploy/dev-auth"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(join(repoRoot, ".local/dev-auth/tls/localhost.pem"), "certificate"),
    writeFile(join(repoRoot, "deploy/dev-auth/sendmail-capture.mjs"), "capture")
  ]);
  return repoRoot;
}

describe("OBS-01 repo-owned paths", () => {
  it("derives the repository root from the shipped module URL", () => {
    expect(observationRepoRoot()).toBe(resolve(import.meta.dirname, "../.."));
  });

  it("resolves configured children beneath the explicit repo root without consulting cwd", async () => {
    const repoRoot = await repoFixture();
    const originalCwd = process.cwd();
    try {
      process.chdir(join(repoRoot, "apps/observation-agent"));
      expect(resolveRepoPath(repoRoot, ".local/dev-auth/tls/localhost.pem"))
        .toBe(join(repoRoot, ".local/dev-auth/tls/localhost.pem"));
      expect(resolveRepoPath(repoRoot, "deploy/dev-auth/sendmail-capture.mjs"))
        .toBe(join(repoRoot, "deploy/dev-auth/sendmail-capture.mjs"));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it.each(["../escape", "/absolute", "", "bad\0path"])(
    "rejects invalid configured repo path %j",
    async (configuredPath) => {
      const repoRoot = await repoFixture();
      expect(() => resolveRepoPath(repoRoot, configuredPath))
        .toThrow("OBSERVATION_REPO_PATH_INVALID");
    }
  );
});
