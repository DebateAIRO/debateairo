// PREVIEW_ASKS_OPEN_TO at the runner's start. The runner's start-up gate fails every open job no team member owns; with
// asks open the API admits every signed-in account, so the runner fails only a job no account owns (a legacy asker's,
// as the API's waker does) and does not refuse to start for an empty team. Prepare-only and start both parse the runner
// file with the API's same parser, so both agree with the API in either open value; the launcher still requires the
// preview configuration.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork } from "../../apps/runner/src/runner-preview-team-gate.js";
import { PREVIEW_ACCOUNT_RUNS_SQL, PREVIEW_TEAM_RUNS_SQL } from "../../packages/providers/src/preview-test.js";
import * as runtime from "../../packages/register/src/runtime-environment.js";
import { validRunnerEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

const LAUNCHER = readFileSync(resolve("deploy/preview-auth-dev/v1/launch-runner.mjs"), "utf8");
const RUNNER_MAIN = readFileSync(resolve("apps/runner/src/main.ts"), "utf8");
/** Today's condition, unchanged: it now applies when asks are not open. */
const TEAM_REQUIRED_CONDITION = "parsed.PREVIEW_GATE_SETTINGS===undefined||!Array.isArray(parsed.PREVIEW_TEAM_USER_IDS)||parsed.PREVIEW_TEAM_USER_IDS.length===0";
const OPEN_CHECK = "if(parsed.PREVIEW_ASKS_OPEN!==undefined){if(parsed.PREVIEW_GATE_SETTINGS===undefined)refuse('PREVIEW_RUNNER_TEAM_REQUIRED');}";
const GATE = JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/team-budget-v2.sock",
  scope_id: "preview-team-v2-20261009" });
const TEAM = '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]';

describe("the runner launcher's start rule", () => {
  it("open asks skip the team requirement and keep the preview requirement; otherwise today's rule, before any connection", () => {
    const start = LAUNCHER.slice(LAUNCHER.indexOf("export async function launchRunner"));
    expect(start).toContain(`${OPEN_CHECK}\n else if(${TEAM_REQUIRED_CONDITION})refuse('PREVIEW_RUNNER_TEAM_REQUIRED');`);
    expect(start.indexOf(OPEN_CHECK)).toBeGreaterThan(start.indexOf("const parsed=runtime.parseRunnerEnvironment(configured);"));
    expect(start.indexOf(OPEN_CHECK)).toBeLessThan(start.indexOf("assertSelectedRunnerConnection"));
    // Prepare-only checks no team: the narrowed environment's parse is where both modes refuse a bad value.
    const prepare = LAUNCHER.slice(LAUNCHER.indexOf("export async function prepareRunner"), LAUNCHER.indexOf("export async function launchRunner"));
    expect(prepare).not.toContain("PREVIEW_RUNNER_TEAM_REQUIRED");
    expect(prepare).toContain("narrowEnvironment('runner',configured,runtime,plan.publication,plan);");
  });

  it("the rule as written, run on parsed runner environments of both modes", () => {
    // The two pinned statements, evaluated as written (true = refuse).
    const refuses = new Function("parsed", `let refused=false;const refuse=()=>{refused=true;};${OPEN_CHECK}\n else if(${TEAM_REQUIRED_CONDITION})refuse('PREVIEW_RUNNER_TEAM_REQUIRED');return refused;`) as (parsed: unknown) => boolean;
    const parse = (extra: Record<string, string>) => runtime.parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), DEBATEAI_DEPLOYMENT_MODE: "hosted", ...extra });
    // Absent: today's answers.
    expect(refuses(parse({}))).toBe(true);
    expect(refuses(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE }))).toBe(true);
    expect(refuses(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, PREVIEW_TEAM_USER_IDS_JSON: "[]" }))).toBe(true);
    expect(refuses(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, PREVIEW_TEAM_USER_IDS_JSON: TEAM }))).toBe(false);
    // Open, in either value: no team, and the start goes on.
    for (const value of ["everyone", "everyone-with-test-payments"]) {
      expect(refuses(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, PREVIEW_ASKS_OPEN_TO: value })), value).toBe(false);
    }
    // Open without the preview configuration never parses; the launcher's own check is the second line of the same rule.
    expect(() => parse({ PREVIEW_ASKS_OPEN_TO: "everyone" })).toThrow("PREVIEW_ASKS_OPEN_TO_WITHOUT_PREVIEW");
    expect(refuses({ PREVIEW_ASKS_OPEN: "everyone", PREVIEW_GATE_SETTINGS: undefined })).toBe(true);
  });
});

describe("apps/runner/src/main.ts", () => {
  it("keeps today's gate line and hands the open rule as its own line, naming the mode in one start line first", () => {
    const call = RUNNER_MAIN.slice(RUNNER_MAIN.indexOf("await refusePreviewOutsiderWork("), RUNNER_MAIN.indexOf("log: (line) => console.warn(JSON.stringify(line))"));
    expect(call).toContain("  previewConfigured: previewGate !== undefined,\n");
    expect(call).toContain("  ...(environment.PREVIEW_ASKS_OPEN === undefined ? {} : { asksOpen: true as const }),\n");
    expect(call).toContain("  teamUserIds: environment.PREVIEW_TEAM_USER_IDS,\n");
    expect(call).toContain("  ...postgresRunnerPreviewTeamGateStore(pool, environment.RELEASE_KEY),\n");
    expect(RUNNER_MAIN).toContain('console.warn(JSON.stringify({ kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_ASKS_OPEN", to: environment.PREVIEW_ASKS_OPEN }));');
    expect(RUNNER_MAIN.indexOf("event: \"PREVIEW_ASKS_OPEN\"")).toBeLessThan(RUNNER_MAIN.indexOf("await refusePreviewOutsiderWork("));
  });
});

const run = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const job = (n: number) => `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function harness(open: ReadonlyArray<{ runId: string; workItemId: string; claimLive?: boolean }>, accountOwned: readonly string[], unrecorded = false) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const lines: unknown[] = [];
  const work = {
    listOpenRunWork: async (limit: number) => { calls.push(`list:${limit}`); return open.map((item) => ({ claimLive: false, ...item })); },
    failClaimable: async (failure: unknown) => { calls.push("fail"); failures.push(failure); return !unrecorded; }
  };
  return {
    calls, failures, lines,
    input: (teamUserIds: readonly string[] | undefined, withAccountRead = true) => ({
      previewConfigured: true, asksOpen: true as const, teamUserIds, work,
      teamRuns: async () => { calls.push("team"); return new Set<string>(); },
      ...(withAccountRead ? { accountRuns: async (runIds: readonly string[]) => { calls.push(`account:${runIds.length}`); return new Set(accountOwned); } } : {}),
      log: (line: unknown) => { lines.push(line); }
    })
  };
}

describe("the runner's start-up gate with asks open", () => {
  it("fails only the jobs no account owns, with the API's code, and never reads the team, empty or not", async () => {
    const open = [{ runId: run(1), workItemId: job(1) }, { runId: run(2), workItemId: job(2) }, { runId: run(2), workItemId: job(3) }, { runId: run(3), workItemId: job(4) }];
    for (const team of [undefined, []] as const) {
      const h = harness(open, [run(1), run(3)]);
      expect(await refusePreviewOutsiderWork(h.input(team))).toEqual({ checked: 4, refused: 2 });
      expect(h.calls).toEqual(["list:101", "account:3", "fail", "fail"]);
      expect(h.failures).toEqual([
        { runId: run(2), workItemId: job(2), reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" },
        { runId: run(2), workItemId: job(3), reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" }
      ]);
      expect(h.lines).toEqual([
        { kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_ONLY", runId: run(2) },
        { kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_ONLY", runId: run(2) }
      ]);
    }
  });

  it("every job owned by some account: nothing is failed", async () => {
    const h = harness([{ runId: run(1), workItemId: job(1) }, { runId: run(2), workItemId: job(2) }], [run(1), run(2)]);
    expect(await refusePreviewOutsiderWork(h.input([]))).toEqual({ checked: 2, refused: 0 });
    expect(h.calls).toEqual(["list:101", "account:2"]);
  });

  it("keeps today's other refusals: a live claim on a job no account owns, a backlog past 100, an unrecorded refusal", async () => {
    const live = harness([{ runId: run(1), workItemId: job(1), claimLive: true }, { runId: run(2), workItemId: job(2) }], []);
    await expect(refusePreviewOutsiderWork(live.input([]))).rejects.toMatchObject({ code: "RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE" });
    expect(live.calls).toEqual(["list:101", "account:2"]);
    const full = harness(Array.from({ length: 101 }, (_, n) => ({ runId: run(n), workItemId: job(n) })), []);
    await expect(refusePreviewOutsiderWork(full.input([]))).rejects.toMatchObject({ code: "RUNNER_STARTUP_BACKLOG_SATURATED" });
    expect(full.calls).toEqual(["list:101"]);
    const lost = harness([{ runId: run(9), workItemId: job(9) }], [], true);
    await expect(refusePreviewOutsiderWork(lost.input([]))).rejects.toMatchObject({ code: "RUNNER_PREVIEW_TEAM_REFUSAL_UNRECORDED" });
  });

  it("open without the account read refuses the start before reading anything, never runs with no rule", async () => {
    const h = harness([{ runId: run(1), workItemId: job(1) }], []);
    await expect(refusePreviewOutsiderWork(h.input([], false))).rejects.toMatchObject({ code: "RUNNER_PREVIEW_ACCOUNT_RULE_UNSET" });
    expect(h.calls).toEqual([]);
    expect(h.lines).toEqual([{ kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_GATE_REFUSED", code: "RUNNER_PREVIEW_ACCOUNT_RULE_UNSET" }]);
  });

  it("off the preview the open setting changes nothing: no read, no failure", async () => {
    const h = harness([{ runId: run(1), workItemId: job(1) }], []);
    expect(await refusePreviewOutsiderWork({ ...h.input([]), previewConfigured: false })).toEqual({ checked: 0, refused: 0 });
    expect(h.calls).toEqual([]);
  });

  it("the store's account read is the shared query, with the run ids as one uuid array", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const pool = { query: async (text: string, values: unknown[]) => { queries.push({ text, values }); return { rows: [{ run_id: run(1) }] }; } };
    const store = postgresRunnerPreviewTeamGateStore(pool as never, ["r1", "aaaaaaaaaaaa"].join("-"));
    expect([...await store.accountRuns([run(1), run(2)])]).toEqual([run(1)]);
    expect(queries).toEqual([{ text: PREVIEW_ACCOUNT_RUNS_SQL, values: [[run(1), run(2)]] }]);
  });
});

describe("PREVIEW_ACCOUNT_RUNS_SQL", () => {
  it("is the team query's owner rule without the team list, reading an owner: asker id only in its exact lower-case form", () => {
    const flat = (sql: string) => sql.replace(/\s+/gu, " ");
    // The same run and latest-ownership read as the team query.
    const head = flat(PREVIEW_TEAM_RUNS_SQL).slice(0, flat(PREVIEW_TEAM_RUNS_SQL).indexOf(" JOIN identity.\"user\""));
    expect(flat(PREVIEW_ACCOUNT_RUNS_SQL).startsWith(head)).toBe(true);
    expect(flat(PREVIEW_ACCOUNT_RUNS_SQL)).toContain("WHERE run.run_id = ANY($1::uuid[]) AND EXISTS ( SELECT 1 FROM identity.\"user\" AS account WHERE account.owner_ref = COALESCE(latest.owner_ref, CASE");
    expect(PREVIEW_ACCOUNT_RUNS_SQL).not.toContain("$2");
    // The guard admits exactly what 'owner:' || owner_ref::text can write, so the uuid cast never fails.
    const guard = new RegExp(/run\.asker_id ~ '([^']+)'/u.exec(PREVIEW_ACCOUNT_RUNS_SQL)![1]!, "u");
    const ref = "0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
    expect(guard.test(`owner:${ref}`)).toBe(true);
    for (const other of [`owner:${ref.toUpperCase()}`, `owner:${ref} `, `owner:{${ref}}`, `owner:${ref.split("-").join("")}`, "owner:", `legacy:${ref}`, `xowner:${ref}`]) {
      expect(guard.test(other), other).toBe(false);
    }
    expect(PREVIEW_ACCOUNT_RUNS_SQL).toContain("THEN substr(run.asker_id, 7)::uuid END))");
  });
});
