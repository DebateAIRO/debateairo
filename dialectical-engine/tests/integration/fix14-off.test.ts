import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { repin } from "../../tools/obs-listener/policy/custodian.js";
import { loadBundle } from "../../tools/obs-listener/policy/loader.js";
import { presentFix } from "../../tools/obs-listener/src/landing/present.js";
import { routeApprovedQuick } from "../../tools/obs-listener/src/landing/quick-route.js";
import { createProofWorktree } from "../../tools/obs-listener/src/landing/worktree.js";
import { createMutationArm } from "../../tools/obs-listener/src/obsctl/arm.js";
import { parseObsctl } from "../../tools/obs-listener/src/obsctl/cli.js";
import { renderFallbackStatus } from "../../tools/obs-listener/src/obsctl/status.js";

const run = promisify(execFile);
const BUNDLE_PATH = resolve(
  import.meta.dirname,
  "../../tools/obs-listener/policy/bundle.json",
);

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", args, { cwd, encoding: "utf8" })).stdout;
}

async function repositoryFixture() {
  const repository = await mkdtemp(join(tmpdir(), "fix14-off-repo-"));
  await git(repository, "init", "-b", "dev");
  await mkdir(join(repository, "apps", "fixture", "src"), { recursive: true });
  await writeFile(
    join(repository, "apps", "fixture", "src", "result.mjs"),
    "export const result = false;\n",
  );
  await git(repository, "add", "apps/fixture/src/result.mjs");
  await git(
    repository,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture base",
  );
  await git(repository, "branch", "main");
  return {
    repository,
    baseSha: (await git(repository, "rev-parse", "HEAD")).trim(),
  };
}

describe("FIX-14 QUICK OFF boundary", () => {
  it("shows the configured default OFF in status", () => {
    expect(renderFallbackStatus("ON", 1_000).quick_arm).toEqual({
      configured: "OFF",
      effective: "OFF",
      reason: "FIX14_POLICY_DEFAULT_OFF",
    });
  });

  it("allows neither ordinary arm, mutation arm, restart, nor an unauthenticated re-pin to change quick_arm", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const mutation = createMutationArm({
      custodianToken: "custodian-token-14",
      quickArm: bundle.quick_arm,
    });
    expect(mutation.arm("custodian-token-14")).toEqual({ ok: true, mutation: "ON" });
    expect(mutation.state()).toEqual({ mutation: "ON", quickArm: "OFF" });
    expect(createMutationArm({
      custodianToken: "custodian-token-14",
      quickArm: bundle.quick_arm,
    }).state()).toEqual({ mutation: "OFF", quickArm: "OFF" });
    expect(() => repin(bundle, {
      token: "wrong-token",
      next_bundle: { ...bundle, quick_arm: "ON" },
    }, {
      OBS_POLICY_CUSTODIAN_TOKEN: "custodian-token-14",
    })).toThrowError("REPIN_REFUSED");
    expect(bundle.quick_arm).toBe("OFF");
    expect(() => parseObsctl([
      "quick-arm",
      "on",
      "--custodian-token",
      "fixture",
    ])).toThrowError("FIX10_CLI_USAGE");
  });

  it("records the OFF denial and presents a QUICK-labelled proposal without changing dev or main", async () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const fixture = await repositoryFixture();
    const prepared = await createProofWorktree({
      repository: fixture.repository,
      baseSha: fixture.baseSha,
      parentDirectory: await mkdtemp(join(tmpdir(), "fix14-off-parent-")),
    });
    await writeFile(
      join(prepared.path, "apps", "fixture", "src", "result.mjs"),
      "export const result = true;\n",
    );
    const quickActions: unknown[] = [];
    const presentationActions: unknown[] = [];
    const comments: string[] = [];

    const result = await routeApprovedQuick({
      bundle,
      proposalId: "proposal-14",
      incidentId: "10000000-0000-4000-8000-000000000014",
      actions: { append: async (value: unknown) => { quickActions.push(value); } },
      presentApprovalFirst: async () => presentFix({
        prepared,
        incidentHash: "d".repeat(64),
        incidentId: "10000000-0000-4000-8000-000000000014",
        fingerprint: "e".repeat(64),
        root: "apps/fixture/src/result.mjs:result",
        rootVerdict: "CODE_ROOT",
        evidenceIds: ["20000000-0000-4000-8000-000000000014"],
        causalPath: ["OBS_FIXTURE_FAILED", "OBS_FIXTURE_ROOT"],
        redCommand: "node --test tests/unit/fixture-return.test.mjs",
        red: { outcome: "TEST_FAILURE", exitCode: 1, stdout: "raw fixture failure", stderr: "" },
        green: { outcome: "PASS", exitCode: 0, stdout: "raw fixture pass", stderr: "" },
        gates: [{ outcome: "PASS", exitCode: 0, stdout: "gate pass", stderr: "" }],
        touchedPaths: ["apps/fixture/src/result.mjs"],
        blastRadius: 1,
        sizeLabel: "QUICK",
        notChanged: ["NO_DEPENDENCIES", "NO_MIGRATIONS"],
        spendUnits: 5,
        ticketId: "ticket-14",
        ticket: { comment: async (_ticketId, value) => { comments.push(value); } },
        actions: { append: async (value) => { presentationActions.push(value); } },
        incidents: { setState: async () => undefined },
      }),
    });

    expect(result.route).toBe("APPROVAL_FIRST");
    expect(result.reason).toBe("QUICK_ARM_OFF");
    expect(result.presentation.branch).toBe(`fixagent/${"d".repeat(64)}`);
    expect(quickActions).toEqual([{
      action_kind: "QUICK_ROUTE_REFUSED",
      proposal_id: "proposal-14",
      incident_id: "10000000-0000-4000-8000-000000000014",
      configured: "OFF",
      effective: "OFF",
      route: "APPROVAL_FIRST",
      reason: "QUICK_ARM_OFF",
    }]);
    expect(presentationActions).toMatchObject([{ kind: "PR_PRESENTED" }]);
    expect(comments).toHaveLength(1);
    expect((await git(fixture.repository, "rev-parse", "dev")).trim()).toBe(fixture.baseSha);
    expect((await git(fixture.repository, "rev-parse", "main")).trim()).toBe(fixture.baseSha);
    expect((await git(fixture.repository, "branch", "--list", `fixagent/${"d".repeat(64)}`)).trim()).not.toBe("");
  });
});
