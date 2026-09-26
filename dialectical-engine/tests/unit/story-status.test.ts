import { describe, expect, it } from "vitest";
import { AnswerStorySchema } from "@debateai/contract";
import { buildStoryRegisterRows, readStoryPolicy } from "../../packages/register/src/index.js";
import {
  STORY_STATUS_LIMITS,
  STORY_UNREADABLE,
  STORY_WAITING_WINDOW_MS,
  buildAnswerStory,
  deriveStoryStatus,
  storyShapeTitle
} from "../../packages/story/src/status.js";
import {
  STORY_TEST_ANSWER_ID,
  STORY_TEST_BODY,
  storedStoryRecord
} from "../support/storyApiFixtures.js";

const CREATED = new Date("2026-09-26T10:00:00.000Z");
const minutesAfter = (minutes: number) => new Date(CREATED.getTime() + minutes * 60_000);

/**
 * The worst case of the SEALED story bounds (spec §7): every round spends every
 * storyteller attempt and every checker attempt to its deadline. Read from the
 * rows the register actually seals, never restated here, so a later change to
 * the provisional values moves this number with it.
 */
function sealedWorstCaseMs(hosted: boolean): number {
  const policy = readStoryPolicy(buildStoryRegisterRows({
    synthesizerRoleRef: "a", evaluatorRoleRef: "b", sourceRef: "t", hosted
  }), 1);
  if (policy === null) throw new Error("STORY_TEST_POLICY_ABSENT");
  return policy.loopMaxRounds * (
    policy.storytellerBound.maxAttempts * policy.storytellerBound.deadlineMs
    + policy.checkerBound.maxAttempts * policy.checkerBound.deadlineMs
  );
}

describe("verdict story status (spec §7)", () => {
  it("keeps the waiting window at least as long as the worst case of the sealed call bounds", () => {
    for (const hosted of [false, true]) {
      const worstCaseMs = sealedWorstCaseMs(hosted);
      // The derivation read real bounds: a zero here would make the check below vacuous.
      expect(worstCaseMs).toBeGreaterThan(0);
      expect(STORY_WAITING_WINDOW_MS).toBeGreaterThanOrEqual(worstCaseMs);
    }
    // The spec's value (§7), pinned so a change to it is a visible decision.
    expect(STORY_WAITING_WINDOW_MS).toBe(40 * 60_000);
    expect(STORY_STATUS_LIMITS.waitingWindowMs).toBe(STORY_WAITING_WINDOW_MS);
    expect(Object.isFrozen(STORY_STATUS_LIMITS)).toBe(true);
  });

  it("reports a stored READY or READY_WITH_RESERVATION row as its own outcome", () => {
    expect(deriveStoryStatus({
      stored: storedStoryRecord(), answerHasVerdict: true, answerCreatedAt: CREATED, now: minutesAfter(90)
    })).toEqual({ status: "READY", unavailableReason: null });
    expect(deriveStoryStatus({
      stored: storedStoryRecord({ outcome: "READY_WITH_RESERVATION", reservation: "The summary overstates the rent." }),
      answerHasVerdict: true, answerCreatedAt: CREATED, now: minutesAfter(90)
    })).toEqual({ status: "READY_WITH_RESERVATION", unavailableReason: null });
  });

  it("reports a stored FAILED row as UNAVAILABLE with its code, at once", () => {
    expect(deriveStoryStatus({
      stored: storedStoryRecord({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", body: null }),
      answerHasVerdict: true, answerCreatedAt: CREATED, now: minutesAfter(1)
    })).toEqual({ status: "UNAVAILABLE", unavailableReason: "STORY_ENVELOPE_EXHAUSTED" });
    expect(deriveStoryStatus({
      stored: storedStoryRecord({ outcome: "FAILED", failureCode: null, body: null }),
      answerHasVerdict: true, answerCreatedAt: CREATED, now: minutesAfter(1)
    })).toEqual({ status: "UNAVAILABLE", unavailableReason: "STORY_FAILED" });
  });

  it("never reports READY for a stored row without a body", () => {
    expect(deriveStoryStatus({
      stored: storedStoryRecord({ body: null }), answerHasVerdict: true, answerCreatedAt: CREATED, now: minutesAfter(1)
    })).toEqual({ status: "UNAVAILABLE", unavailableReason: "STORY_BODY_MISSING" });
  });

  it("says WRITING only while a verdict exists and the window is open", () => {
    const base = { stored: null, answerHasVerdict: true, answerCreatedAt: CREATED } as const;
    expect(deriveStoryStatus({ ...base, now: minutesAfter(0) }).status).toBe("WRITING");
    expect(deriveStoryStatus({ ...base, now: minutesAfter(39) }).status).toBe("WRITING");
    // A clock that runs behind the database still says WRITING rather than giving up early.
    expect(deriveStoryStatus({ ...base, now: minutesAfter(-2) }).status).toBe("WRITING");
    // The runner died mid-story: no row ever arrives, and the window closes.
    expect(deriveStoryStatus({ ...base, now: minutesAfter(40) }))
      .toEqual({ status: "UNAVAILABLE", unavailableReason: "STORY_WINDOW_PASSED" });
  });

  it("never waits for a story on an answer without a verdict", () => {
    expect(deriveStoryStatus({
      stored: null, answerHasVerdict: false, answerCreatedAt: CREATED, now: minutesAfter(1)
    })).toEqual({ status: "UNAVAILABLE", unavailableReason: "NO_VERDICT" });
  });

  it("refuses to guess when the answer time is unreadable", () => {
    expect(deriveStoryStatus({
      stored: null, answerHasVerdict: true, answerCreatedAt: new Date("not a date"), now: minutesAfter(1)
    })).toEqual({ status: "UNAVAILABLE", unavailableReason: "ANSWER_TIME_UNKNOWN" });
  });

  it("names an unreadable story by one fixed code, frozen", () => {
    expect(STORY_UNREADABLE).toEqual({ status: "UNAVAILABLE", unavailableReason: "STORY_UNREADABLE" });
    expect(Object.isFrozen(STORY_UNREADABLE)).toBe(true);
  });

  it("turns a shape id into a plain title", () => {
    expect(storyShapeTitle("money-decision")).toBe("Money decision");
    expect(storyShapeTitle("general")).toBe("General");
    expect(storyShapeTitle("personal-choice")).toBe("Personal choice");
  });

  it("builds a READY response that parses under the strict contract", () => {
    const stored = storedStoryRecord();
    const response = AnswerStorySchema.parse(buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, stored,
      derived: { status: "READY", unavailableReason: null }
    }));
    expect(response).toMatchObject({
      answer_id: STORY_TEST_ANSWER_ID,
      answer_version: 1,
      status: "READY",
      unavailable_reason: null,
      shape: { id: "money-decision", title: "Money decision" },
      pack: { version: "2026-09-26.1", fingerprint: stored.packFingerprint },
      written_at: "2026-09-26T10:04:00.000Z",
      rounds: 1,
      language: "en",
      reservation: null,
      point_numbers: { "node:position": "P1", "node:defeater": "P2" },
      story: STORY_TEST_BODY
    });
    expect(response.storyteller?.model_id).toBe("gpt-5.6-sol");
    expect(response.checker?.model_id).toBe("claude-opus-5");
    expect(response.verdict_basis?.trigger).toBe("MID_BAND");
  });

  it("names the question's language from the stored story (R1): a BCP-47 tag, und, or null when none was stored", () => {
    const build = (languageTag: string | null) => AnswerStorySchema.parse(buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, stored: storedStoryRecord({ languageTag }),
      derived: { status: "READY", unavailableReason: null }
    })).language;
    expect(build("ro")).toBe("ro");
    expect(build("und")).toBe("und");
    expect(build(null)).toBeNull();
    // The contract holds the tag to BCP-47's own length.
    const ready = buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, stored: storedStoryRecord(),
      derived: { status: "READY", unavailableReason: null }
    });
    expect(AnswerStorySchema.safeParse({ ...ready, language: "x".repeat(36) }).success).toBe(false);
    expect(AnswerStorySchema.safeParse({ ...ready, language: "" }).success).toBe(false);
  });

  it("carries the checker's reservation only with READY_WITH_RESERVATION", () => {
    const stored = storedStoryRecord({ outcome: "READY_WITH_RESERVATION", reservation: "The summary overstates the rent figure." });
    expect(buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, stored,
      derived: { status: "READY_WITH_RESERVATION", unavailableReason: null }
    }).reservation).toBe("The summary overstates the rent figure.");
    expect(buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, stored,
      derived: { status: "READY", unavailableReason: null }
    }).reservation).toBeNull();
  });

  it("exposes nothing from a row it does not report as ready", () => {
    const response = AnswerStorySchema.parse(buildAnswerStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 2,
      stored: storedStoryRecord({ outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", body: null }),
      derived: { status: "UNAVAILABLE", unavailableReason: "STORY_WRITE_REJECTED" }
    }));
    expect(response).toEqual({
      answer_id: STORY_TEST_ANSWER_ID, answer_version: 2, status: "UNAVAILABLE",
      unavailable_reason: "STORY_WRITE_REJECTED", shape: null, pack: null, written_at: null,
      storyteller: null, checker: null, rounds: null, language: null, reservation: null, verdict_basis: null,
      point_numbers: null, story: null
    });
  });
});
