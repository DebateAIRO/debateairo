// V4 start step, Task 57e (the owner's 6 Nov rule: "we should re-use what we already paid for"; confirmed plan, card "Build this
// (Recommended)"), against the REAL API of tests/support/r22-world.ts with the step before Start switched on, on the product's own logins:
// "ASK THIS AGAIN" ON THE PERSON'S OWN FAILED QUESTION, END TO END. The unit and route tests fake the application's read of what a failed
// question kept (PostgresAskApplication.readAskAgain) and `submit`; here the real read opens the debate's stored ask, purpose lines and
// paths, the FAILED run read says `reusable`, and POST /v1/asks with `again_of` starts a new debate that stores the same line, depth,
// purpose lines and paths, with no call before Start, no new charge and no try linked, while the failed debate keeps the charges that
// bought those paths (0164). Added by the independent review of wave 15 (the end-to-end case of the brief's Step 1). No vendor is
// contacted (scripted gates, the search stand-in); every name, question and figure is made up. Integration suites are skipped by the CI
// gate: run this file by hand, alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AskRequestSchema, StartPathsSchema, type PurposeLines } from "@debateai/contract";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresStartPathsStore, RunRepository } from "@debateai/db";
import { readPurposeLinesOf } from "../../apps/api/src/purpose-lines.js";
import { COOKIE_SESSION_MARKER, createDebate } from "../../apps/ui/lib/api.js";
import { PREMIUM, newDebateCatalog, panelAgrees } from "../support/r22-pages.js";
import { driveStartStep, topPathsChoice } from "../support/start-step-cases.js";
import { startR22World, type R22World } from "../support/r22-world.js";

// The page's ask settings (r22-pages.ts reads them the same way): the website's own "@/" module, loaded by name, typed here.
const websiteModule = async <T>(path: string): Promise<T> => import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<T>;
const { v4AskConfig } = await websiteModule<{ v4AskConfig: (mode: "quick" | "thorough", level: "plain", settings: typeof PREMIUM, at: Date,
  catalog: Record<string, string>) => Record<string, unknown> }>("../../apps/ui/lib/v4/askConfig.ts");

let world: R22World;
beforeAll(async () => {
  world = await startR22World({ startStep: "ON" });
  world.setScript(panelAgrees);
}, 900_000);
afterAll(async () => { await world?.stop(); });

const READING = "plain" as const;
/** The person's words, then the clarifying answer the page wrote into the line (made up). */
const LINE = "Should Harbour Town build a second ferry pier?\n\nLooking at Harbour Town.";
const LINES: PurposeLines = Object.freeze({ answers: [{ question: "Which town is this about?", answer: "Harbour Town" }] });
const count = async (sql: string, values: readonly unknown[]): Promise<number> =>
  Number((await world.database.pool.query<{ n: string }>(sql, [...values])).rows[0]!.n);

describe("Task 57e on the real API: Ask this again re-uses what the failed question kept", () => {
  it("the FAILED read says reusable; again_of starts the same question on the same paths, with nothing before Start called or charged", async () => {
    const ana = await world.account("again-reuse", "MAX");
    // The first question, as the page starts it: the lists read at Next, three of the AIs' top paths chosen from the menu, the lines.
    const drive = await driveStartStep(ana.client, { questionLine: LINE, siteLanguage: "en", readingLevel: READING });
    if (drive.check === null || drive.menu === null) throw new Error("ASK_AGAIN_TEST_NO_MENU");
    const top = topPathsChoice(drive, 3);
    if (top === null || top.paths.length < 3) throw new Error("ASK_AGAIN_TEST_MENU_TOO_SMALL");
    const paths = StartPathsSchema.parse(top);
    const { id: failedRun } = await createDebate(LINE, v4AskConfig("quick", READING, PREMIUM, new Date(), newDebateCatalog), COOKIE_SESSION_MARKER,
      ana.client, undefined, undefined, LINES, undefined, { startCheck: { ref: drive.check.check_ref }, startPaths: paths });
    // It fails on our side after its one retry: taken out of the line and recorded FAILED, as the runner's task records it.
    const at = world.queue.findIndex((job) => job.runId === failedRun);
    const [job] = world.queue.splice(at, 1);
    const releaseKey = (await world.database.pool.query<{ key: string }>("SELECT identity.run_release_now($1) AS key", [failedRun])).rows[0]!.key;
    expect(await new WorkItemRepository(world.runnerPool, { releaseKey })
      .recordTerminalFailure({ runId: failedRun, workItemId: job!.workItemId, reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED" })).toBe(true);

    // The FAILED read: the list's charge is kept (the paths it bought are), and what ran is kept for the next try.
    const failed = await ana.client.readRun(failedRun);
    expect(failed).toMatchObject({ state: "FAILED", quota_used: "SOME", reusable: true });
    const charges = await count("SELECT count(*) AS n FROM identity.pre_start_charge WHERE owner_ref=$1", [ana.ownerRef]);
    const clarifies = await count("SELECT count(*) AS n FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef]);
    expect(charges).toBeGreaterThan(0);

    // "Ask this again": the line as the read gave it, another depth and level on the request (the stored ones win), and the link.
    const config = v4AskConfig("quick", READING, PREMIUM, new Date(), newDebateCatalog);
    const accepted = await ana.client.submitAsk(AskRequestSchema.parse({
      question_line: failed.question_line, plan_tier: config.plan_tier, risk_tier: config.risk_tier, tier_source: config.tier_source,
      tier_provenance_ref: config.tier_provenance_ref, composition_budget_tier: config.composition_budget_tier,
      depth_params: { depth: 2, readingLevel: "expert" }, decision_scope: config.decision_scope, as_of: new Date().toISOString(),
      steering_presets: [], steering_annotations: [], again_of: failedRun }));
    const againRun = accepted.run_ref;
    expect(againRun).not.toBe(failedRun);

    // The new debate stores what the failed one stored: the whole line, its depth and level, its purpose lines and its paths.
    const runs = new RunRepository(world.fixtureSuperuserPool);
    const [before, after] = [await runs.readStoredAsk(failedRun), await runs.readStoredAsk(againRun)];
    expect(after?.questionLine).toBe(before?.questionLine);
    expect(after?.depthParams).toEqual(before?.depthParams);
    expect(after?.depthParams).toMatchObject({ readingLevel: READING });
    const store = new PostgresStartPathsStore(world.runtimePool);
    const [kept, reused] = [await store.readStartPaths(failedRun), await store.readStartPaths(againRun)];
    expect(kept?.source).toBe("MENU");
    expect(reused).toEqual({ ...kept, runId: againRun });
    expect(await readPurposeLinesOf(world.runtimePool, ana.ownerRef, failedRun)).toEqual(LINES);
    expect(await readPurposeLinesOf(world.runtimePool, ana.ownerRef, againRun)).toEqual(LINES);
    // Nothing before Start ran or was charged again, no clarifying call, and no try was given to the new debate.
    expect(await count("SELECT count(*) AS n FROM identity.pre_start_charge WHERE owner_ref=$1", [ana.ownerRef])).toBe(charges);
    expect(await count("SELECT count(*) AS n FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef])).toBe(clarifies);
    expect(await count("SELECT count(*) AS n FROM identity.pre_start_try WHERE run_id=$1", [againRun])).toBe(0);
    // The failed debate keeps its charges (the paths are re-used); only the debate itself runs again, and it finishes.
    expect((await ana.client.readRun(failedRun)).quota_used).toBe("SOME");
    const done = await world.settle();
    expect(done.filter((one) => one.runId === againRun).map((one) => (one.result as { kind?: unknown } | null)?.kind)).toEqual(["COMPLETED"]);
  }, 900_000);
});
