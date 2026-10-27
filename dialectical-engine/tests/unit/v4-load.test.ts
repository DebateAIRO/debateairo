import { describe, expect, it } from "vitest";
import { ContractHttpError, type Answer, type AnswerStory, type RunProjection } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { loadDigView, loadStory, loadV4, storyReadFailed, unreadableStory } from "../../apps/ui/lib/v4/load.js";
import type { DigLink } from "../../apps/ui/lib/v4/types.js";

/** V4 initial (2026-10-28): every branch of the V4 reads, over a small fake client. */

const RUN_ID = "run-1";
const ANSWER: Answer = { ...STORY_FIXTURE_ANSWER, run_ref: RUN_ID };

function notFound(): ContractHttpError {
  return new ContractHttpError("NOT_FOUND", 404, "not found");
}

function run(state: RunProjection["state"]): RunProjection {
  return {
    run_ref: RUN_ID,
    question_line: ANSWER.question_line,
    state,
    terminal_reason: state === "FAILED" ? "RUNNER_FAILED" : null,
    hold_until: state === "HOLDING" ? "2026-10-28T02:00:00.000Z" : null,
    waits_until: state === "WAITING" ? "2026-10-28T02:00:00.000Z" : null
  };
}

type Reply<T> = T | Error;

function fakeClient(replies: Readonly<{
  run?: Reply<RunProjection>;
  runAnswer?: Reply<Answer>;
  answer?: Reply<Answer>;
  story?: Reply<AnswerStory>;
}>) {
  const calls: string[] = [];
  const answerOr = <T>(name: string, reply: Reply<T> | undefined): Promise<T> => {
    if (reply === undefined) return Promise.reject(new Error(`UNEXPECTED_CALL: ${name}`));
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  };
  return {
    calls,
    readRun: (id: string) => { calls.push(`readRun:${id}`); return answerOr("readRun", replies.run); },
    readRunAnswer: (id: string) => { calls.push(`readRunAnswer:${id}`); return answerOr("readRunAnswer", replies.runAnswer); },
    readAnswer: (id: string) => { calls.push(`readAnswer:${id}`); return answerOr("readAnswer", replies.answer); },
    readAnswerStory: (id: string) => { calls.push(`readAnswerStory:${id}`); return answerOr("readAnswerStory", replies.story); }
  };
}

describe("loadStory", () => {
  it("returns the story as read", async () => {
    const story = storyFixture("READY");
    expect(await loadStory("a", fakeClient({ story }))).toBe(story);
  });

  it("turns 404, SESSION_REQUIRED and FORBIDDEN into V3's final UNAVAILABLE record, never null (DATA-3)", async () => {
    const cases = [
      [notFound(), "STORY_NOT_FOUND"],
      [new ContractHttpError("SESSION_REQUIRED", 401, "sign in"), "STORY_SESSION_REQUIRED"],
      [new ContractHttpError("FORBIDDEN", 403, "no"), "STORY_FORBIDDEN"]
    ] as const;
    for (const [failure, reason] of cases) {
      const story = await loadStory("a", fakeClient({ story: failure }), 3);
      expect(story).toEqual(unreadableStory("a", 3, reason));
      expect(storyReadFailed(story)).toBe(false);
    }
  });

  it("turns any other failure into a passing STORY_READ_FAILED record the page tries again (DATA-10)", async () => {
    for (const failure of [new ContractHttpError("SERVER_FAILURE", 500, "boom"), new Error("offline")]) {
      const story = await loadStory("a", fakeClient({ story: failure }));
      expect(story).toEqual(unreadableStory("a", 1, "STORY_READ_FAILED"));
      expect(storyReadFailed(story)).toBe(true);
    }
    const throwsAtOnce = { readAnswerStory: (): Promise<AnswerStory> => { throw new Error("sync"); } };
    expect((await loadStory("a", throwsAtOnce)).unavailable_reason).toBe("STORY_READ_FAILED");
  });

  it("counts the server's own STORY_UNREADABLE answer as a failed read", async () => {
    const server = unreadableStory("a", 1, "STORY_UNREADABLE");
    expect(storyReadFailed(await loadStory("a", fakeClient({ story: server })))).toBe(true);
  });
});

describe("loadV4", () => {
  it("returns the run while it is not settled (including FAILED)", async () => {
    for (const state of ["QUEUED", "WAITING", "CLAIMED", "RUNNING", "HOLDING", "FAILED"] as const) {
      const client = fakeClient({ run: run(state) });
      expect(await loadV4(RUN_ID, client)).toEqual({ kind: "RUN", runId: RUN_ID, run: run(state) });
      expect(client.calls).toEqual([`readRun:${RUN_ID}`]);
    }
  });

  it("serves a settled run with its answer and story", async () => {
    const story = storyFixture("READY");
    const client = fakeClient({ run: run("SETTLED"), runAnswer: ANSWER, story });
    expect(await loadV4(RUN_ID, client)).toEqual({ kind: "SERVED", runId: RUN_ID, answer: ANSWER, story });
    expect(client.calls).toEqual([`readRun:${RUN_ID}`, `readRunAnswer:${RUN_ID}`, `readAnswerStory:${ANSWER.answer_id}`]);
  });

  it("serves with V3's UNAVAILABLE record when the story read is 404, labelled with the answer's version", async () => {
    const answer: Answer = { ...ANSWER, answer_version: 2 };
    const loaded = await loadV4(RUN_ID, fakeClient({ run: run("SETTLED"), runAnswer: answer, story: notFound() }));
    expect(loaded).toEqual({ kind: "SERVED", runId: RUN_ID, answer, story: unreadableStory(answer.answer_id, 2, "STORY_NOT_FOUND") });
  });

  it("never hides an answer already read when the story read fails (DATA-10/TIME-5)", async () => {
    const boom = new ContractHttpError("SERVER_FAILURE", 500, "boom");
    const served = await loadV4(RUN_ID, fakeClient({ run: run("SETTLED"), runAnswer: ANSWER, story: boom }));
    expect(served).toMatchObject({ kind: "SERVED", answer: ANSWER, story: { status: "UNAVAILABLE", unavailable_reason: "STORY_READ_FAILED" } });
    const byAnswerId = await loadV4(ANSWER.answer_id, fakeClient({ run: notFound(), answer: ANSWER, story: boom }));
    expect(byAnswerId).toMatchObject({ kind: "SERVED", runId: RUN_ID, story: { unavailable_reason: "STORY_READ_FAILED" } });
  });

  it("treats a settled run without a readable answer as still finishing", async () => {
    expect(await loadV4(RUN_ID, fakeClient({ run: run("SETTLED"), runAnswer: notFound() })))
      .toEqual({ kind: "RUN", runId: RUN_ID, run: run("SETTLED") });
  });

  it("reads an unknown run id as an answer id and uses the answer's run", async () => {
    const story = storyFixture("WRITING");
    const client = fakeClient({ run: notFound(), answer: ANSWER, story });
    expect(await loadV4(ANSWER.answer_id, client)).toEqual({ kind: "SERVED", runId: RUN_ID, answer: ANSWER, story });
    expect(client.calls).toEqual([`readRun:${ANSWER.answer_id}`, `readAnswer:${ANSWER.answer_id}`, `readAnswerStory:${ANSWER.answer_id}`]);
  });

  it("throws other failures", async () => {
    await expect(loadV4(RUN_ID, fakeClient({ run: new Error("offline") }))).rejects.toThrow("offline");
    await expect(loadV4(RUN_ID, fakeClient({ run: notFound(), answer: notFound() }))).rejects.toBeInstanceOf(ContractHttpError);
    await expect(loadV4(RUN_ID, fakeClient({ run: run("SETTLED"), runAnswer: new Error("down") }))).rejects.toThrow("down");
  });
});

describe("loadDigView", () => {
  const link: DigLink = {
    parentRunId: "parent", childRunId: RUN_ID, openQuestionIds: ["w"], questions: ["What would change it?"],
    mode: "quick", startedAt: "2026-10-28T00:00:00.000Z"
  };

  it("maps every unfinished run state to its dig state", async () => {
    // RULES-4: only a real wait for a free spot says WAITING; a queued follow-up is starting.
    const expected = { QUEUED: "RUNNING", WAITING: "WAITING", CLAIMED: "RUNNING", RUNNING: "RUNNING", HOLDING: "RUNNING", FAILED: "FAILED" } as const;
    for (const [state, digState] of Object.entries(expected)) {
      const view = await loadDigView(link, fakeClient({ run: run(state as RunProjection["state"]) }));
      expect(view).toEqual({ link, state: digState, headline: null, counts: null });
    }
  });

  it("is FAILED when the follow-up run is gone", async () => {
    expect((await loadDigView(link, fakeClient({ run: notFound() }))).state).toBe("FAILED");
  });

  it("is still RUNNING when a settled follow-up has no readable answer yet", async () => {
    expect((await loadDigView(link, fakeClient({ run: run("SETTLED"), runAnswer: notFound() }))).state).toBe("RUNNING");
  });

  it("is DONE with the headline and counts once settled", async () => {
    const story = storyFixture("READY");
    const view = await loadDigView(link, fakeClient({ run: run("SETTLED"), runAnswer: ANSWER, story }));
    expect(view).toEqual({
      link, state: "DONE", headline: story.story!.short.headline,
      counts: { SURE: 2, SURE_FOR_CASE: 3, STILL_ARGUED: 1, DIDNT_HOLD: 1 }
    });
  });

  it("is DONE without a headline while the follow-up's story is not written or cannot be read", async () => {
    for (const story of [storyFixture("WRITING"), notFound(), new ContractHttpError("SERVER_FAILURE", 500, "boom")]) {
      const view = await loadDigView(link, fakeClient({ run: run("SETTLED"), runAnswer: ANSWER, story }));
      expect(view).toMatchObject({ state: "DONE", headline: null });
      expect(view.counts).not.toBeNull();
    }
  });

  it("works for a dig found again from the account list (mode and start unknown)", async () => {
    const found: DigLink = { ...link, mode: null, startedAt: null };
    expect(await loadDigView(found, fakeClient({ run: run("RUNNING") }))).toEqual({ link: found, state: "RUNNING", headline: null, counts: null });
  });

  it("throws failures other than 404", async () => {
    await expect(loadDigView(link, fakeClient({ run: new Error("offline") }))).rejects.toThrow("offline");
  });
});
