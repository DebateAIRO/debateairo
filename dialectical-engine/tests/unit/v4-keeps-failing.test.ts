// V4 start step, Task 57m (the owner's 8 Nov words: "if it keeps failing we shouldn't tell the user that it can continue, because he clearly
// cannot. We should stop after 2 continues that fail, and say that we're investigating this and a future fix will solve this. Of course we
// should let him Write the report if he wants"; "Yes, same rule" for a whole debate; "Use these drafts"). The pure rules: a failed dig's read
// carries the server's `keeps_failing`, and its panel then offers nothing more (no Continue, no fresh dig: he clearly cannot), only the
// line and the report. The stand-in seeds one debate and one dig in this state for the click-test. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { failedRunContinuable, failedRunKeepsFailing, stopIsOurs } from "../../apps/api/src/run-continue.js";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { runFailureKind } from "../../apps/ui/lib/v3/runFailure.js";
import { digTargetQuestions } from "../../apps/ui/lib/v4/askText.js";
import { digRetryOf } from "../../apps/ui/lib/v4/digRetry.js";
import { loadDigView } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { openPick, placesOf } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigLink, DigTarget, DigView } from "../../apps/ui/lib/v4/types.js";
import { RunProjectionSchema, type Answer, type RunProjection } from "../../packages/contract/src/index.js";
import { FAILED_DIGS, mockContinueStep, RUN_FAILED_KEEPS_FAILING } from "../../tools/v4-mock-api/failed-seed.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";
import { stripRun } from "../../tools/v4-mock-api/web-draft.js";

const seed = createSeed(fixture);
const RUN = "57d57d57-1111-4111-8111-111111111111";
const answer = seed.answer({
  answerId: "aaaa57d0-1111-4111-8111-111111111111", runRef: RUN,
  question: "Should a river town raise its flood banks, or let the meadows flood on purpose?",
  askedAt: "2026-11-08T09:00:00.000Z", servedAt: "2026-11-08T09:30:00.000Z", web: "PAID"
}) as Answer;
const map = buildV4Map({ runId: RUN, answer, story: seed.story("aaaa57d0-1111-4111-8111-111111111111", "READY", "2026-11-08T09:31:00.000Z") });
const path = map.paths.find((candidate) => candidate.open.length > 0)!;
const target: DigTarget = { kind: "picks", path, picks: [openPick(path.open[0]!)] };

function linkOf(childRunId: string): DigLink {
  return { parentRunId: RUN, childRunId, openQuestionIds: placesOf(target), questions: digTargetQuestions(target), mode: "thorough", startedAt: null };
}

function failed(childRunId: string, extra: Partial<DigView> = {}): DigView {
  return { link: linkOf(childRunId), state: "FAILED", headline: null, counts: null, terminalReason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", ...extra };
}

describe("a failed dig's read says it keeps failing (Task 57m)", () => {
  const run = (extra: Record<string, unknown> = {}): RunProjection => ({
    run_ref: "d2d2d2d2-0000-4000-8000-000000000001", question_line: "Do flood meadows protect the old bridge?", state: "FAILED",
    terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null, ...extra
  }) as RunProjection;
  const client = (reply: RunProjection) => ({
    readRun: async () => reply,
    readRunAnswer: async () => { throw new Error("UNEXPECTED_CALL"); },
    readAnswerStory: async () => { throw new Error("UNEXPECTED_CALL"); }
  });

  it("carries the server's `keeps_failing` on a FAILED dig (never `continuable` beside it), and nothing when the server does not say it", async () => {
    const link = linkOf("d2d2d2d2-0000-4000-8000-000000000001");
    const marked = await loadDigView(link, client(run({ keeps_failing: true })));
    expect(marked).toMatchObject({ state: "FAILED", keepsFailing: true });
    expect(marked).not.toHaveProperty("continuable");
    expect(await loadDigView(link, client(run()))).not.toHaveProperty("keepsFailing");
    expect(await loadDigView(link, client(run({ continuable: true })))).not.toHaveProperty("keepsFailing");
  });
});

describe("the panel of a dig that keeps failing after two continues (Task 57m)", () => {
  it("offers nothing more: KEEPS_FAILING after continues, whether sent in this visit or rebuilt from its link", () => {
    const dig = failed("c-57m-1", { keepsFailing: true });
    expect(digRetryOf(dig, [dig], map, { target, mode: "thorough" }, () => true)).toEqual({ kind: "KEEPS_FAILING", afterContinues: true });
    expect(digRetryOf(dig, [dig], map, null, () => true)).toEqual({ kind: "KEEPS_FAILING", afterContinues: true });
  });

  it("a later try of the same dig still wins; the states before it are unchanged", () => {
    const first = failed("c-57m-2", { keepsFailing: true });
    const later = { ...failed("c-57m-3"), state: "RUNNING" as const };
    expect(digRetryOf(first, [first, later], map, null, () => true)).toEqual({ kind: "RETRIED" });
    // Two separate failed runs of the same dig: today's KEEPS_FAILING, with no mark.
    const a = failed("c-57m-4");
    const b = failed("c-57m-5");
    expect(digRetryOf(a, [a, b], map, null, () => true)).toEqual({ kind: "KEEPS_FAILING" });
    // Continuable, or a fresh dig: as before.
    const continuable = failed("c-57m-6", { continuable: true });
    expect(digRetryOf(continuable, [continuable], map, { target, mode: "thorough" }, () => true))
      .toEqual({ kind: "OFFER", target, mode: "thorough", continues: true });
    const fresh = failed("c-57m-7");
    expect(digRetryOf(fresh, [fresh], map, { target, mode: "thorough" }, () => true)).toEqual({ kind: "OFFER", target, mode: "thorough" });
  });
});

describe("the stand-in's debate and dig that keep failing (Task 57m)", () => {
  const SERVER = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
  const facts = (reason: string) => Object.freeze({ state: "FAILED" as const, terminal_reason: reason, content_live: true, waived: false, settled: false,
    paused: false, reopened: true, failed_continues: 2 });

  it("one question and one dig, each a stop of ours continued twice, read `keeps_failing` exactly as the API's rule would", () => {
    expect(failedRunKeepsFailing(facts(RUN_FAILED_KEEPS_FAILING.reason))).toBe(true);
    expect(failedRunContinuable(facts(RUN_FAILED_KEEPS_FAILING.reason))).toBe(false);
    expect(runFailureKind(RUN_FAILED_KEEPS_FAILING.reason)).toBe("STOPPED");
    const marked = FAILED_DIGS.filter((dig) => dig.keepsFailing === true);
    expect(marked.map((dig) => dig.kind)).toEqual(["STOPPED"]);
    for (const dig of marked) {
      expect(failedRunKeepsFailing(facts(dig.reason)), dig.kind).toBe(true);
      expect(dig.continuable, dig.kind).toBeUndefined();
    }
    // Every other seeded dig reads `continuable` exactly where the API's rule would.
    for (const dig of FAILED_DIGS) expect(dig.continuable === true, dig.kind).toBe(stopIsOurs(dig.reason) && dig.keepsFailing !== true);
    expect(SERVER).toContain("...(state === \"FAILED\" && run.keepsFailing === true ? { keeps_failing: true } : {})");
    expect(SERVER).toContain("seedFailedKeepsFailing();");
  });

  it("their Continue is refused as the API refuses it; the read passes the contract, and today's view drops the mark", () => {
    expect(mockContinueStep({ failed: true, running: false, continuable: false, continued: false })).toBe("NOT_CONTINUABLE");
    const read = { run_ref: RUN_FAILED_KEEPS_FAILING.runRef, question_line: RUN_FAILED_KEEPS_FAILING.question, state: "FAILED",
      terminal_reason: RUN_FAILED_KEEPS_FAILING.reason, hold_until: null, quota_used: RUN_FAILED_KEEPS_FAILING.quotaUsed, keeps_failing: true };
    expect(RunProjectionSchema.safeParse(read).success).toBe(true);
    expect(stripRun(read)).not.toHaveProperty("keeps_failing");
  });
});
