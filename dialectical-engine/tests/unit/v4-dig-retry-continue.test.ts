// V4 start step, Task 57i (the owner's answer of 7 Nov afternoon, his card "Continue the same dig (Recommended)": "what the first try
// finished is kept, the person pays only for what never ran, and anything we must redo is on us"): a failed dig whose own run read says
// `continuable` is tried again by continuing THAT dig (POST /v1/runs/{digRunId}/continue), never by a new dig. These are the pure rules:
// the dig's read carries the server's `continuable`, and the panel's offer says the press continues the dig. Where the dig is not
// continuable, today's fresh "Try this dig again" stays exactly as it was. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stopIsOurs } from "../../apps/api/src/run-continue.js";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { digTargetQuestions } from "../../apps/ui/lib/v4/askText.js";
import { digRetryOf } from "../../apps/ui/lib/v4/digRetry.js";
import { loadDigView } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { openPick, placesOf } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigLink, DigTarget, DigView } from "../../apps/ui/lib/v4/types.js";
import type { Answer, RunProjection } from "../../packages/contract/src/index.js";
import { FAILED_DIGS, mockContinueStep } from "../../tools/v4-mock-api/failed-seed.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

const seed = createSeed(fixture);
const RUN = "57157157-1111-4111-8111-111111111111";
const answer = seed.answer({
  answerId: "aaaa5715-1111-4111-8111-111111111111", runRef: RUN,
  question: "Should a small coastal town build a sea wall, or move its houses further inland?",
  askedAt: "2026-11-07T09:00:00.000Z", servedAt: "2026-11-07T09:30:00.000Z", web: "PAID"
}) as Answer;
const map = buildV4Map({ runId: RUN, answer, story: seed.story("aaaa5715-1111-4111-8111-111111111111", "READY", "2026-11-07T09:31:00.000Z") });
const path = map.paths.find((candidate) => candidate.open.length > 0)!;
const target: DigTarget = { kind: "picks", path, picks: [openPick(path.open[0]!)] };

function linkOf(childRunId: string, mode: DigLink["mode"] = "thorough"): DigLink {
  return { parentRunId: RUN, childRunId, openQuestionIds: placesOf(target), questions: digTargetQuestions(target), mode, startedAt: null };
}

function failed(childRunId: string, extra: Partial<DigView> = {}): DigView {
  return { link: linkOf(childRunId), state: "FAILED", headline: null, counts: null, terminalReason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", ...extra };
}

describe("a failed dig's read says whether it can continue where it stopped (Task 57i)", () => {
  const run = (extra: Record<string, unknown> = {}): RunProjection => ({
    run_ref: "d1d1d1d1-0000-4000-8000-000000000001", question_line: "Does a sea wall hold for fifty years?", state: "FAILED",
    terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null, ...extra
  }) as RunProjection;
  const client = (reply: RunProjection) => ({
    readRun: async () => reply,
    readRunAnswer: async () => { throw new Error("UNEXPECTED_CALL"); },
    readAnswerStory: async () => { throw new Error("UNEXPECTED_CALL"); }
  });

  it("carries the server's `continuable` on a FAILED dig, and nothing when the server does not say it", async () => {
    const link = linkOf("d1d1d1d1-0000-4000-8000-000000000001");
    expect(await loadDigView(link, client(run({ continuable: true })))).toMatchObject({ state: "FAILED", continuable: true });
    expect(await loadDigView(link, client(run()))).not.toHaveProperty("continuable");
  });
});

describe("the panel's offer for a failed dig that can continue (Task 57i)", () => {
  it("continues the same dig: offered with `continues`, as sent in this visit or rebuilt from its link", () => {
    const dig = failed("c-57i-1", { continuable: true });
    // Sent in this visit: exactly as sent, and the press continues it.
    expect(digRetryOf(dig, [dig], map, { target, mode: "thorough" }, () => false)).toEqual({ kind: "OFFER", target, mode: "thorough", continues: true });
    // Rebuilt from its link: continuing asks nothing again, so it is offered even when a fresh dig would not ask exactly the same.
    const rebuilt = digRetryOf(dig, [dig], map, null, () => false);
    expect(rebuilt).toMatchObject({ kind: "OFFER", mode: "thorough", continues: true });
  });

  it("is today's fresh offer, unchanged, when the dig cannot continue", () => {
    const dig = failed("c-57i-2");
    expect(digRetryOf(dig, [dig], map, { target, mode: "thorough" }, () => false)).toEqual({ kind: "OFFER", target, mode: "thorough" });
    expect(digRetryOf(dig, [dig], map, null, () => false)).toEqual({ kind: "NONE" });
  });

  it("a later try of the same dig, or two failures of it, still win over continuing", () => {
    const first = failed("c-57i-3", { continuable: true });
    const later = { ...failed("c-57i-4"), state: "RUNNING" as const };
    expect(digRetryOf(first, [first, later], map, null, () => true)).toEqual({ kind: "RETRIED" });
    const laterFailed = failed("c-57i-4", { continuable: true });
    expect(digRetryOf(first, [first, laterFailed], map, null, () => true)).toEqual({ kind: "KEEPS_FAILING" });
  });
});

describe("the stand-in's failed digs read `continuable` as the API's rule does, and continue in place (Task 57i)", () => {
  const SERVER = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");

  it("exactly the failed digs whose stop is ours can continue; their Continue continues them; failed=RESET seeds them again", () => {
    // Task 57m: but for the dig that keeps failing after two continues (ours, never continued again).
    for (const dig of FAILED_DIGS) expect(dig.continuable === true, dig.kind).toBe(stopIsOurs(dig.reason) && dig.keepsFailing !== true);
    expect(FAILED_DIGS.filter((dig) => dig.continuable === true).map((dig) => dig.kind)).toEqual(["NOT_STARTED", "MODELS_UNAVAILABLE"]);
    expect(mockContinueStep({ failed: true, running: false, continuable: true, continued: false })).toBe("CONTINUE");
    expect(SERVER).toContain("...(dig.continuable === true ? { continuable: true as const } : {})");
    expect(SERVER).toMatch(/=== "RESET"\) \{\s*seedFailed\(\);\s*seedFailedSome\(\);\s*seedFailedDigs\(\);/u);
    // A dig continued in place stays in its debate's investigation; only a question opens its own.
    expect(SERVER).toContain("if (!dig && investigationOf(run.runRef) === undefined) openInvestigation(run.runRef);");
  });
});
