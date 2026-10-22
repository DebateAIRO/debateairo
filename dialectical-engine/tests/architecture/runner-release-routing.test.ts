import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Side-by-side spec §2: two releases live at once must never share a Hatchet task. With one shared name, either
 * release's worker could pick up the other's debates and their retries would flip between the two codes. So the runner
 * registers, and its start-up and five-minute lapsed-claim re-sends dispatch, under
 * `releaseTaskName(HATCHET_WORKFLOW_NAME, RELEASE_KEY)`: the base name plus its own release key (`legacy` keeps the bare
 * base name, today's single task).
 */

const RUNNER_SOURCE = "apps/runner/src";
const RUNNER_MAIN = join(RUNNER_SOURCE, "main.ts");
const TASK_NAME = "const taskName = releaseTaskName(environment.HATCHET_WORKFLOW_NAME, environment.RELEASE_KEY);";

const occurrences = (source: string, needle: string): number => source.split(needle).length - 1;

describe("the runner registers and re-sends under its release's own task name (side-by-side §2)", () => {
  it("derives the task name once, from the base name and the release key", async () => {
    const main = await readFile(RUNNER_MAIN, "utf8");
    expect(occurrences(main, TASK_NAME)).toBe(1);
  });

  it("registers the task and re-sends open work under that name", async () => {
    const main = await readFile(RUNNER_MAIN, "utf8");
    expect(main).toContain("workflowName: taskName");
    // Two senders, both under the release's task name: the start-up re-send and the five-minute lapsed-claim re-send.
    expect(occurrences(main, "runNoWait(")).toBe(2);
    expect(occurrences(main, "hatchet.runNoWait(taskName, { runId, workItemId }")).toBe(2);
    expect(occurrences(main, 'dispatchSource: "runner-startup-reconciliation"')).toBe(1);
    expect(occurrences(main, 'dispatchSource: "runner-lapsed-resend"')).toBe(1);
    expect(main.indexOf(TASK_NAME)).toBeLessThan(main.indexOf("declareHatchetWalkingSkeletonTask("));
  });

  it("never registers or sends under the bare base name", async () => {
    const main = await readFile(RUNNER_MAIN, "utf8");
    expect(main).not.toContain("runNoWait(environment.HATCHET_WORKFLOW_NAME");
    expect(main).not.toContain("workflowName: environment.HATCHET_WORKFLOW_NAME");
  });

  it("main.ts fences every work repository and hands the runner its release", async () => {
    // Side-by-side spec §3: the runner claims, renews, sweeps and fails only its own release's work items. Every
    // repository main.ts builds is fenced by RELEASE_KEY and this worker's id; none serves the `legacy` default.
    const main = await readFile(RUNNER_MAIN, "utf8");
    expect(main).toContain("const workFence = Object.freeze({ releaseKey: environment.RELEASE_KEY, workerId: environment.RUNNER_WORKER_ID });");
    const runnerSettings = main.slice(
      main.indexOf("const runner = new WalkingSkeletonRunner("),
      main.indexOf("const taskName = releaseTaskName(")
    );
    expect(runnerSettings).toContain("releaseKey: environment.RELEASE_KEY,");
    expect(main).toContain("new WorkItemRepository(keepAlivePool, workFence)");
    expect(main).toContain("failures: new WorkItemRepository(pool, workFence)");
    expect(main).toContain("work: new WorkItemRepository(pool, workFence)");
    expect(main).not.toContain("new WorkItemRepository(pool)");
    expect(main).not.toContain("new WorkItemRepository(keepAlivePool)");
    // Every repository, each with the fence as its second argument (the retirement store below also takes it).
    expect(main.match(/new WorkItemRepository\(\w+, workFence\)/gu)?.length).toBe(occurrences(main, "new WorkItemRepository("));
    // Side-by-side spec §4: the retirement store is built with the same fence (plan B Task B11's set-aside writes under it).
    expect(main).toContain("store: postgresRunnerRetirementStore(pool, workFence),");
  });

  it("main.ts never refuses boot over funding: no pointer read, the funding source built whenever plans are (spec §9)", async () => {
    // Side-by-side spec §9: a grant is checked against the policy of the version it was issued with, so the runner
    // needs no funding selection at boot, and a selection made after boot works without a restart.
    const main = await readFile(RUNNER_MAIN, "utf8");
    expect(main).not.toContain("allowances.readPolicy()");
    expect(main).not.toContain('"INTERNAL_FUNDING_UNAVAILABLE"');
    expect(main).toContain(
      "const fundingAllowance = billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({"
    );
  });

  it("sends to Hatchet only from main.ts, where the release's task name lives", async () => {
    // Every file under the runner's source, subfolders included: a sender added in a new folder is caught too.
    const files = (await readdir(RUNNER_SOURCE, { recursive: true })).filter((name) => name.endsWith(".ts")).sort();
    const senders: string[] = [];
    for (const name of files) {
      if ((await readFile(join(RUNNER_SOURCE, name), "utf8")).includes("runNoWait(")) senders.push(name);
    }
    expect(senders).toEqual(["main.ts"]);
  });
});
