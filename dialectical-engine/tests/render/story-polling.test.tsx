// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type AnswerStory } from "@debateai/contract";
import { STORY_POLLING, nextStoryPollDelay, unreadableStory, useAnswerStory, type StoryReader } from "../../apps/ui/lib/v3/useAnswerStory.js";
import { STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * The owner page's story poll (spec 2026-09-26 §10): at once, then 5 s, 10 s,
 * 20 s and 30 s from then on while the story is being written; it stops on a
 * final status and when the page goes away.
 */

function Probe({ client, answerId }: { client: StoryReader; answerId: string | null }) {
  const story = useAnswerStory(answerId, { answerVersion: 1, client });
  return (
    <p
      data-testid="probe"
      data-status={story?.status ?? "none"}
      data-reason={story?.unavailable_reason ?? ""}
      data-answer={story?.answer_id ?? ""}
    />
  );
}

let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

async function mount(client: StoryReader, answerId: string | null = STORY_FIXTURE_DEBATE_ID): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe client={client} answerId={answerId} />));
  await flush();
  return container.querySelector('[data-testid="probe"]')!;
}

async function rerender(client: StoryReader, answerId: string | null): Promise<void> {
  await act(async () => root!.render(<Probe client={client} answerId={answerId} />));
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

function reader(...replies: Array<AnswerStory | Error>): StoryReader & { calls: () => number } {
  const readAnswerStory = vi.fn(async () => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { readAnswerStory, calls: () => readAnswerStory.mock.calls.length };
}

/** The server's answer when it could not read the stored story (Task 10): possibly a passing database hiccup. */
function unreadable(): AnswerStory {
  return { ...storyFixture("UNAVAILABLE"), unavailable_reason: "STORY_UNREADABLE" };
}

function serverFailure(): ContractHttpError {
  return new ContractHttpError("SERVER_FAILURE", 500, "boom");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAnswerStory polling (spec §10)", () => {
  it("polls while WRITING and stops once the story is READY", async () => {
    const client = reader(storyFixture("WRITING"), storyFixture("READY"));
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("WRITING");
    expect(client.calls()).toBe(1);
    await advance(4_999);
    expect(client.calls()).toBe(1);
    await advance(1);
    expect(client.calls()).toBe(2);
    expect(probe.dataset.status).toBe("READY");
    await advance(10 * 60_000);
    expect(client.calls()).toBe(2);
  });

  it("backs off from 5 s to 30 s while the story is being written", async () => {
    const client = reader(storyFixture("WRITING"));
    await mount(client);
    const expected: Array<[number, number]> = [[5_000, 2], [10_000, 3], [20_000, 4], [30_000, 5], [30_000, 6]];
    for (const [step, calls] of expected) {
      await advance(step - 1);
      expect(client.calls()).toBe(calls - 1);
      await advance(1);
      expect(client.calls()).toBe(calls);
    }
  });

  it("names its backoff and its limits in one frozen record", () => {
    expect(STORY_POLLING).toEqual({ firstDelayMs: 5_000, maxDelayMs: 30_000, readFailureLimit: 4 });
    expect(Object.isFrozen(STORY_POLLING)).toBe(true);
    expect([null, 5_000, 10_000, 20_000, 30_000].map(nextStoryPollDelay)).toEqual([5_000, 10_000, 20_000, 30_000, 30_000]);
    expect(unreadableStory("answer:1", 3, "STORY_READ_FAILED")).toMatchObject({
      answer_id: "answer:1",
      answer_version: 3,
      status: "UNAVAILABLE",
      unavailable_reason: "STORY_READ_FAILED",
      language: null,
      story: null
    });
  });

  it("stops at UNAVAILABLE (the runner died and the window passed)", async () => {
    const client = reader(storyFixture("WRITING"), storyFixture("UNAVAILABLE"));
    const probe = await mount(client);
    await advance(5_000);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_WINDOW_PASSED");
    await advance(60 * 60_000);
    expect(client.calls()).toBe(2);
  });

  it("treats NOT_FOUND as UNAVAILABLE at once, with no retry", async () => {
    const client = reader(new ContractHttpError("NOT_FOUND", 404, "STORY_NOT_FOUND", "STORY_NOT_FOUND"));
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_NOT_FOUND");
    await advance(5 * 60_000);
    expect(client.calls()).toBe(1);
  });

  it.each([
    ["SESSION_REQUIRED", 401, "STORY_SESSION_REQUIRED"],
    ["FORBIDDEN", 403, "STORY_FORBIDDEN"]
  ] as const)("treats %s as UNAVAILABLE at once, with no retry", async (code, status, reason) => {
    const client = reader(new ContractHttpError(code, status, code));
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe(reason);
    await advance(5 * 60_000);
    expect(client.calls()).toBe(1);
  });

  it("retries other failures on the same backoff, then gives up as UNAVAILABLE", async () => {
    const client = reader(serverFailure());
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("none");
    await advance(5_000);
    await advance(10_000);
    expect(probe.dataset.status).toBe("none");
    await advance(20_000);
    expect(client.calls()).toBe(4);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_READ_FAILED");
    await advance(10 * 60_000);
    expect(client.calls()).toBe(4);
  });

  it("stops polling when the page goes away", async () => {
    const client = reader(storyFixture("WRITING"));
    await mount(client);
    await act(async () => root!.unmount());
    root = null;
    await advance(60_000);
    expect(client.calls()).toBe(1);
  });

  it("reads nothing without an answer", async () => {
    const client = reader(storyFixture("READY"));
    const probe = await mount(client, null);
    expect(probe.dataset.status).toBe("none");
    await advance(60_000);
    expect(client.calls()).toBe(0);
  });
});

describe("STORY_UNREADABLE may pass (Task 10: a database hiccup)", () => {
  it("counts it as a failed read: the panel keeps what it showed, and the next read on the backoff can recover", async () => {
    const client = reader(storyFixture("WRITING"), unreadable(), storyFixture("READY"));
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("WRITING");
    await advance(5_000);
    expect(client.calls()).toBe(2);
    expect(probe.dataset.status).toBe("WRITING");
    await advance(9_999);
    expect(client.calls()).toBe(2);
    await advance(1);
    expect(client.calls()).toBe(3);
    expect(probe.dataset.status).toBe("READY");
    await advance(10 * 60_000);
    expect(client.calls()).toBe(3);
  });

  it("gives up after four failures in a row, of any kind, and then shows the server's own STORY_UNREADABLE answer", async () => {
    const client = reader(serverFailure(), unreadable(), serverFailure(), unreadable());
    const probe = await mount(client);
    await advance(5_000);
    await advance(10_000);
    expect(client.calls()).toBe(3);
    expect(probe.dataset.status).toBe("none");
    await advance(20_000);
    expect(client.calls()).toBe(4);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_UNREADABLE");
    await advance(10 * 60_000);
    expect(client.calls()).toBe(4);
  });

  it("ends a streak that closes on a thrown failure as STORY_READ_FAILED", async () => {
    const client = reader(unreadable(), unreadable(), unreadable(), serverFailure());
    const probe = await mount(client);
    await advance(5_000);
    await advance(10_000);
    await advance(20_000);
    expect(client.calls()).toBe(4);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_READ_FAILED");
  });

  it("starts the count again after a readable reply", async () => {
    const client = reader(
      unreadable(), unreadable(), unreadable(), storyFixture("WRITING"),
      unreadable(), unreadable(), unreadable(), storyFixture("READY")
    );
    const probe = await mount(client);
    for (const step of [5_000, 10_000, 20_000, 30_000, 30_000, 30_000]) await advance(step);
    expect(client.calls()).toBe(7);
    // Six unreadable replies, but never four in a row: the WRITING read reset the count.
    expect(probe.dataset.status).toBe("WRITING");
    await advance(30_000);
    expect(client.calls()).toBe(8);
    expect(probe.dataset.status).toBe("READY");
  });

  it("treats every other UNAVAILABLE reason as final at once", async () => {
    const client = reader({ ...storyFixture("UNAVAILABLE"), unavailable_reason: "STORY_ENVELOPE_EXHAUSTED" });
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("UNAVAILABLE");
    expect(probe.dataset.reason).toBe("STORY_ENVELOPE_EXHAUSTED");
    await advance(10 * 60_000);
    expect(client.calls()).toBe(1);
  });
});

describe("a new answer restarts the poll (a re-run)", () => {
  const NEW_ANSWER = "answer:after-rerun";

  function byAnswer(stories: Readonly<Record<string, () => Promise<AnswerStory>>>): StoryReader & { callsFor: (id: string) => number } {
    const readAnswerStory = vi.fn(async (answerId: string) => stories[answerId]!());
    return {
      readAnswerStory,
      callsFor: (id: string) => readAnswerStory.mock.calls.filter(([answerId]) => answerId === id).length
    };
  }

  it("drops the old story, cancels the old timer and reads the new answer at once", async () => {
    let answerFirstNewRead: (story: AnswerStory) => void = () => {};
    const newReads: Array<() => Promise<AnswerStory>> = [
      () => new Promise<AnswerStory>((resolve) => { answerFirstNewRead = resolve; }),
      async () => ({ ...storyFixture("READY"), answer_id: NEW_ANSWER })
    ];
    const client = byAnswer({
      [STORY_FIXTURE_DEBATE_ID]: async () => storyFixture("WRITING"),
      [NEW_ANSWER]: () => (newReads.length > 1 ? newReads.shift()! : newReads[0]!)()
    });
    const probe = await mount(client);
    expect(probe.dataset.answer).toBe(STORY_FIXTURE_DEBATE_ID);
    expect(probe.dataset.status).toBe("WRITING");
    await advance(3_000);
    await rerender(client, NEW_ANSWER);
    await flush();
    expect(client.callsFor(NEW_ANSWER)).toBe(1);
    // The old answer's story is gone while the new answer's first read is still out.
    expect(probe.dataset.status).toBe("none");
    await act(async () => answerFirstNewRead({ ...storyFixture("WRITING"), answer_id: NEW_ANSWER }));
    await flush();
    expect(probe.dataset.answer).toBe(NEW_ANSWER);
    expect(probe.dataset.status).toBe("WRITING");
    // The old answer's 5 s timer would have fired here; it was cancelled.
    await advance(2_000);
    expect(client.callsFor(STORY_FIXTURE_DEBATE_ID)).toBe(1);
    // The new answer runs its own backoff from its own first reply (at 3 s).
    await advance(2_999);
    expect(client.callsFor(NEW_ANSWER)).toBe(1);
    await advance(1);
    expect(client.callsFor(NEW_ANSWER)).toBe(2);
    expect(probe.dataset.status).toBe("READY");
    expect(client.callsFor(STORY_FIXTURE_DEBATE_ID)).toBe(1);
  });

  it("never lets a late reply for the old answer land", async () => {
    let answerOld: (story: AnswerStory) => void = () => {};
    const client = byAnswer({
      [STORY_FIXTURE_DEBATE_ID]: () => new Promise<AnswerStory>((resolve) => { answerOld = resolve; }),
      [NEW_ANSWER]: async () => ({ ...storyFixture("WRITING"), answer_id: NEW_ANSWER })
    });
    const probe = await mount(client);
    expect(probe.dataset.status).toBe("none");
    await rerender(client, NEW_ANSWER);
    await flush();
    expect(probe.dataset.status).toBe("WRITING");
    answerOld(storyFixture("READY"));
    await flush();
    expect(probe.dataset.answer).toBe(NEW_ANSWER);
    expect(probe.dataset.status).toBe("WRITING");
  });
});
