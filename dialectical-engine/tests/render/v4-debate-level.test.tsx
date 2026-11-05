// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Answer, AnswerStory, ContractClient, RunProjection } from "../../packages/contract/src/index.js";
import { harness, mountMap, page, resetHarness, seededAnswer, settle, unmountMap } from "./v4-debate-harness.js";

/*
 * V4 start step, Task 75c (owner answer Q15 of 5 Nov: the level "should propagate throughout the whole debate and shouldn't be
 * changed"): the map page shows a debate at the level it was asked at, as its run read says, whatever the address's `?level=`
 * or the account's saved level say; it offers no level change; a dig from it is asked at that level. A debate asked without
 * one reads as the default level, as today. The page's reads are the harness's; the header and the ask hook are stood in here
 * so the test sees what the page hands them.
 */
const seen = vi.hoisted(() => ({
  header: [] as Array<Readonly<Record<string, unknown>>>,
  askLevels: [] as unknown[]
}));

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", () => ({
  V4Header: (props: Readonly<Record<string, unknown> & { children?: ReactNode; after?: ReactNode }>) => {
    seen.header.push(props);
    return <header className="v4StandInHeader">{props.children}{props.after}</header>;
  }
}));
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => {
  const { useV4AskMock } = await import("./v4-debate-harness.js");
  return {
    useV4Ask: (input: { readingLevel?: unknown; dig?: unknown }) => {
      seen.askLevels.push(input.readingLevel);
      return useV4AskMock.useV4Ask(input);
    }
  };
});
// The run read of this debate names its level (the served answer carries it on, as loadV4 does): the harness's `level`.
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  seen.header = [];
  seen.askLevels = [];
  harness.level = "expert";
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

const lastHeader = (): Readonly<Record<string, unknown>> => seen.header.at(-1)!;

describe("the map page shows the debate at its own level", () => {
  it("asked at Expert: Expert, even with ?level=plain in the address and Plain words saved in the account", async () => {
    harness.search = "?level=plain";
    harness.accountLevel = Promise.resolve("plain");
    await mountMap(1600, crypto.randomUUID(), null, "plain");
    await settle();
    expect(page().querySelector(".v4MapBranch")).not.toBeNull();
    expect(lastHeader().readingLevel).toBe("expert");
  });

  it("its header leads to the next question with no level: step 1 offers the account's level, never this debate's", async () => {
    // Review of Task 75c: the header's brand link goes to the ask page and its account menu to "All my maps" (whose "Ask"
    // goes there too); a level in those links would ask the next question at this debate's level with no choice shown.
    harness.search = "?level=plain";
    harness.accountLevel = Promise.resolve("plain");
    await mountMap(1600, crypto.randomUUID(), null, "plain");
    await settle();
    expect(page().querySelector(".v4MapBranch")).not.toBeNull();
    expect(lastHeader().readingLevel).toBe("expert");
    expect(seen.header.map((props) => props.linkLevel ?? null)).not.toContain("expert");
    expect(lastHeader().linkLevel).toBeNull();
  });

  it("offers no level change", async () => {
    await mountMap(1600, crypto.randomUUID(), null, "plain");
    await settle();
    expect(seen.header.length).toBeGreaterThan(0);
    expect(seen.header.every((props) => props.onReadingLevel === undefined)).toBe(true);
  });

  it("a dig from it is asked at the debate's level", async () => {
    harness.search = "?level=plain";
    await mountMap(1600, crypto.randomUUID(), null, "plain");
    await settle();
    expect(seen.askLevels.at(-1)).toBe("expert");
  });

  // Task 75d (owner, 5 Nov): an old debate with no stored level reads as Plain words, the level every question starts on, and
  // a dig from it is asked (and priced) at Plain words, as the server prices it.
  it("a debate asked without a level reads as Plain words", async () => {
    harness.level = null;
    harness.search = "?level=expert";
    harness.accountLevel = Promise.resolve("expert");
    await mountMap(1600, crypto.randomUUID(), null, "expert");
    await settle();
    expect(lastHeader().readingLevel).toBe("plain");
    expect(seen.askLevels.at(-1)).toBe("plain");
    expect(lastHeader().linkLevel).toBeNull();
  });
});

describe("loadV4 carries the run read's level to the served answer", () => {
  it("a settled debate's level comes with its answer; none when the run read names none", async () => {
    const { loadV4 } = await vi.importActual<typeof import("../../apps/ui/lib/v4/load.js")>("../../apps/ui/lib/v4/load.js");
    const runId = crypto.randomUUID();
    const answer = seededAnswer(runId) as Answer;
    const story = { answer_id: answer.answer_id, status: "UNAVAILABLE" } as unknown as AnswerStory;
    const clientOf = (run: Partial<RunProjection>) => ({
      readRun: async () => ({ run_ref: runId, question_line: answer.question_line, state: "SETTLED", terminal_reason: null, hold_until: null, ...run }),
      readRunAnswer: async () => answer,
      readAnswer: async () => answer,
      readAnswerStory: async () => story
    }) as unknown as Pick<ContractClient, "readRun" | "readRunAnswer" | "readAnswer" | "readAnswerStory">;
    expect(await loadV4(runId, clientOf({ reading_level: "expert" }))).toMatchObject({ kind: "SERVED", level: "expert" });
    expect(await loadV4(runId, clientOf({}))).not.toHaveProperty("level");
  });
});
