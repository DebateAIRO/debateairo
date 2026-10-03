import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnswerIndex } from "@debateai/contract";
import { DebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import { debateSummariesFromIndex } from "../../apps/ui/lib/v3/adapter.js";
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };

/**
 * Budget spec 2026-09-28 §2.11: the wording branch's group 4 ("Today's limit
 * for debates ran out…") is retired. A debate cannot end FAILED on the site's
 * day any more, and a stray code of that family is told as group 5, "stopped
 * partway". A question the day holds back waits instead, with sentence C.
 */
function failedWith(reason: string): AnswerIndex {
  return {
    items: [],
    open_runs: [{
      run_ref: "run:day-stop", question_line: "Should the city ban cars downtown?", state: "FAILED",
      terminal_reason: reason, created_at_sequence: 1
    }],
    limit: 50,
    offset: 0,
    total: 1
  };
}

describe("a FAILED run whose reason is the site's day reads as stopped partway (B10b)", () => {
  for (const reason of [
    "RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED",
    "DAILY_COST_ENVELOPE_REACHED",
    "DAILY_LIMIT_REACHED",
    "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED"
  ]) {
    it(`renders ${reason} as the group-5 sentence`, () => {
      const html = renderToStaticMarkup(
        <DebatesBuffer debates={debateSummariesFromIndex(failedWith(reason))} catalog={homeEnglish} timeCatalog={timeEnglish} locale="en" />
      );
      expect(html).toContain(homeEnglish["runFailure.STOPPED"]);
      expect(html).not.toContain("limit for debates ran out");
      expect(html).not.toContain("DAILY");
      expect(html).not.toContain("ALLOWANCE");
    });
  }

  it("no longer carries the group-4 sentence in the English catalogue", () => {
    expect(Object.keys(homeEnglish).filter((key) => key.startsWith("runFailure.")).sort())
      .toEqual([
        "runFailure.MODELS_UNAVAILABLE", "runFailure.NOT_STARTED", "runFailure.PLAN_ENDED", "runFailure.RUN_LIMIT_REACHED",
        "runFailure.STOPPED"
      ]);
  });
});

/**
 * Part 3's final review, P3-M18: the scorecard's claim-time refusal (the
 * runner, claiming the debate, found the role assignment pinned at the ask
 * corrupt or unable to seat a debate, before any model was asked) reads as
 * "something went wrong on our side before this debate began", in both the
 * form the runner writes and the form its job catch overwrites it with.
 */
describe("a FAILED run whose pinned role assignment the runner refused at claim reads as not started (P3-M18)", () => {
  for (const reason of ["RUN_ROLE_ASSIGNMENT_INVALID", "RUNNER_EXECUTION_FAILED:RUN_ROLE_ASSIGNMENT_INVALID"]) {
    it(`renders ${reason} as the not-started sentence`, () => {
      const html = renderToStaticMarkup(
        <DebatesBuffer debates={debateSummariesFromIndex(failedWith(reason))} catalog={homeEnglish} timeCatalog={timeEnglish} locale="en" />
      );
      expect(html).toContain(homeEnglish["runFailure.NOT_STARTED"]);
      expect(html).not.toContain(homeEnglish["runFailure.MODELS_UNAVAILABLE"]);
      expect(html).not.toContain(homeEnglish["runFailure.STOPPED"]);
      expect(html).not.toContain("ASSIGNMENT");
    });
  }
});

/**
 * Part 4 (part4-scope.md §4.1), the owner's ruling of 3 October 2026: a
 * premium question that waited in line while its owner's paid plan ended, was
 * withdrawn or erased, or was paused by a dispute is recorded
 * RUN_SETUP_FAILED:PLAN_CHANGED. Its row says the plan changed, not that
 * something went wrong on the site's side.
 */
describe("a FAILED run whose paid plan ended while it waited reads as the plan's sentence (Part 4)", () => {
  it("renders RUN_SETUP_FAILED:PLAN_CHANGED as the plan-ended sentence", () => {
    const html = renderToStaticMarkup(
      <DebatesBuffer
        debates={debateSummariesFromIndex(failedWith("RUN_SETUP_FAILED:PLAN_CHANGED"))}
        catalog={homeEnglish}
        timeCatalog={timeEnglish}
        locale="en"
      />
    );
    expect(html).toContain(homeEnglish["runFailure.PLAN_ENDED"].replace("'", "&#x27;"));
    expect(html).not.toContain(homeEnglish["runFailure.NOT_STARTED"]);
    expect(html).not.toContain("PLAN_CHANGED");
    expect(html).not.toContain("RUN_SETUP_FAILED");
  });
});
