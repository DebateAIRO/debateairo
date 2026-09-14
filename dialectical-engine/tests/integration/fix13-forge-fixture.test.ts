import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyArmed } from "../../tools/obs-listener/src/obsctl/armed-token.js";
import { mintArmed } from "../../tools/obs-listener/src/obsctl/armed-token.js";
import {
  buildFixWorkerProfile,
  evaluateFixWorkerCapability,
  fixWorkerForbiddenPaths,
} from "../../tools/obs-listener/src/worker-fix/profile.js";
import {
  parsePatchOnlyOutput,
  planFixWorkerInvocation,
} from "../../tools/obs-listener/src/worker-fix/spawn.js";

describe("FIX-13 IC-3 forge fixture", () => {
  it("generates a deny-default profile with no network and explicit control/credential denials", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "fix13-forge-"));
    const worktree = join(fixture, "worktree");
    const scratch = join(fixture, "scratch");
    const controlRoot = join(fixture, "control");
    const workerHome = join(fixture, "worker-home");
    await Promise.all([mkdir(worktree), mkdir(scratch), mkdir(controlRoot), mkdir(workerHome)]);
    const forbidden = fixWorkerForbiddenPaths({ controlRoot, workerHome, bundlePath: join(fixture, "bundle.json") });
    const profile = buildFixWorkerProfile({ worktree, scratchDirectory: scratch, forbiddenPaths: forbidden });

    expect(profile).toContain("(deny default)");
    expect(profile).toContain("(deny network*)");
    for (const path of forbidden) expect(profile).toContain(`(literal \"${path}\")`);
    expect(profile).toContain(`(allow file-read* (subpath \"${worktree}\"))`);
    expect(profile).toContain(`(allow file-write* (subpath \"${scratch}\"))`);
  });

  it("classifies every forge attempt as contained and rejects forged authority artifacts", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "fix13-contained-"));
    const worktree = join(fixture, "worktree");
    const scratch = join(fixture, "scratch");
    const controlRoot = join(fixture, "control");
    const workerHome = join(fixture, "worker-home");
    await Promise.all([mkdir(worktree), mkdir(scratch), mkdir(controlRoot), mkdir(workerHome)]);
    const planted = join(controlRoot, "KILL");
    await writeFile(planted, "PLANTED-FORGE-13", { mode: 0o600 });
    const attempts = [
      { operation: "stat" as const, path: planted },
      { operation: "read" as const, path: planted },
      { operation: "write" as const, path: join(controlRoot, "ARMED") },
      { operation: "write" as const, path: join(controlRoot, "proof", "planted.json") },
      { operation: "write" as const, path: join(fixture, "bundle.json") },
      { operation: "write" as const, path: join(workerHome, ".gitconfig") },
      { operation: "write" as const, path: join(workerHome, ".ssh", "id_ed25519") },
      { operation: "network" as const },
    ];
    expect(attempts.map((attempt) => evaluateFixWorkerCapability({
      worktree,
      scratchDirectory: scratch,
      forbiddenPaths: fixWorkerForbiddenPaths({ controlRoot, workerHome, bundlePath: join(fixture, "bundle.json") }),
      attempt,
    }))).toEqual(attempts.map(() => "CONTAINED"));

    const genuineKey = Buffer.alloc(32, 1);
    const forgedKey = Buffer.alloc(32, 2);
    const artifact = mintArmed({ issuedAtMs: 100, stalenessMs: 100, nonce: Buffer.alloc(16, 3) }, forgedKey);
    expect(() => verifyArmed(artifact.bytes, genuineKey, 101, 100)).toThrow("FIX10_ARMED_MAC");
  });

  it("requires a distinct worker uid, scrubs credentials, closes stdin, and accepts only a patch", () => {
    expect(() => planFixWorkerInvocation({
      workerUsername: "fixworker",
      workerUid: 501,
      daemonUid: 501,
      profilePath: "/tmp/fix13.sb",
      worktree: "/tmp/fix13-worktree",
      pinnedBaseSha: "a".repeat(40),
      prompt: "closed-input",
      environment: { PATH: "/usr/bin:/bin", HOME: "/secret", GH_TOKEN: "secret" },
    })).toThrow("FIX13_WORKER_NOT_SEPARATE");

    const planned = planFixWorkerInvocation({
      workerUsername: "fixworker",
      workerUid: 502,
      daemonUid: 501,
      profilePath: "/tmp/fix13.sb",
      worktree: "/tmp/fix13-worktree",
      pinnedBaseSha: "a".repeat(40),
      prompt: "closed-input",
      environment: { PATH: "/usr/bin:/bin", HOME: "/secret", GH_TOKEN: "secret", LANG: "C" },
    });
    expect(planned.binary).toBe("/usr/bin/sudo");
    expect(planned.arguments).toEqual(expect.arrayContaining([
      "-n", "-u", "fixworker", "/usr/bin/sandbox-exec", "-f", "/tmp/fix13.sb", "codex", "exec",
    ]));
    expect(planned.spawnOptions).toMatchObject({ cwd: "/tmp/fix13-worktree", stdio: ["ignore", "pipe", "pipe"], detached: true });
    expect(Object.keys(planned.spawnOptions.env).sort()).toEqual(["LANG", "PATH", "PWD"]);

    const patch = "diff --git a/apps/scheduler/src/index.ts b/apps/scheduler/src/index.ts\n--- a/apps/scheduler/src/index.ts\n+++ b/apps/scheduler/src/index.ts\n@@ -1 +1 @@\n-old\n+new\n";
    expect(parsePatchOnlyOutput(patch)).toBe(patch);
    expect(() => parsePatchOnlyOutput("commentary\n" + patch)).toThrow("FIX13_WORKER_OUTPUT_NOT_PATCH");
  });
});
