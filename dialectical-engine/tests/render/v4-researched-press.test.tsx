// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSchema, type Answer } from "../../packages/contract/src/index.js";
import { CATALOG, advance, click, harness, mountMap, page, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * W4-4 on the V4 debate page: the map hands the panel "Add to researched" on a paid plan; a press says so at once, then READING, and the answer is read
 * again until it has the outcome; a refusal says what happened; Free and a quota waiting for its reset offer no button. The mock's seeded debate: the
 * nuclear path has an other page nobody added.
 */
const PATH = "n-nuclear";
const panelText = (): string => (page().querySelector(".v4DebPanelCol")?.textContent ?? "");
const addButton = (): HTMLButtonElement | null => page().querySelector<HTMLButtonElement>(".v4DebPanelCol .v4OtherPageAdd");
const addedOutcome = (runId: string, state: object): Answer => {
  const answer = seededAnswer(runId);
  // The seeded debate has another page still being read on another path: it settles too.
  return AnswerSchema.parse({ ...answer, web: { paths: answer.web!.paths.map((path) => ({ ...path, other_pages: path.other_pages.map((other) =>
    path.position_ref === PATH || other.researched?.state === "READING" ? { ...other, researched: state } : other) })) } });
};

beforeEach(() => { vi.useFakeTimers(); resetHarness(); });
afterEach(async () => { await unmountMap(); vi.useRealTimers(); });

describe("Add to researched on the debate page", () => {
  it("a press names the path and the page, says READING, and the answer read again shows the outcome", async () => {
    const runId = await mountMap(1600, crypto.randomUUID(), PATH);
    expect(panelText()).toContain(CATALOG["v4.web.addResearchedHint"]);
    const pageRef = seededAnswer(runId).web!.paths.find((path) => path.position_ref === PATH)!.other_pages[0]!.page_ref;
    await click(addButton()!);
    expect(harness.addToResearched).toHaveBeenCalledExactlyOnceWith(runId, PATH, pageRef);
    expect(panelText()).toContain(CATALOG["v4.web.researched.READING"]);
    expect(addButton()).toBeNull();

    harness.loadAnswer.mockClear();
    harness.fresh = addedOutcome(runId, { state: "ADDS_NOTHING" });
    await advance(5_000);
    await advance(1);
    expect(harness.loadAnswer).toHaveBeenCalled();
    expect(panelText()).toContain(CATALOG["v4.web.researched.ADDS_NOTHING"]);
    // It has its outcome: no more reads.
    harness.loadAnswer.mockClear();
    await advance(20_000);
    expect(harness.loadAnswer).not.toHaveBeenCalled();
  });

  it("a press that does not take says so and offers the button again; a full quota says when", async () => {
    harness.addToResearched = vi.fn(async () => "TRY_AGAIN" as const);
    await mountMap(1600, crypto.randomUUID(), PATH);
    await click(addButton()!);
    expect(panelText()).toContain(CATALOG["v4.web.researched.tryAgain"]);
    expect(addButton()!.disabled).toBe(false);
    harness.addToResearched = vi.fn(async () => "WAITS_FOR_RESET" as const);
    await click(addButton()!);
    expect(panelText()).toContain(CATALOG["v4.web.researched.waitsForReset"]);
    expect(addButton()).toBeNull();
  });

  it("Free offers no button, and neither does a quota waiting for its reset; the pages still show", async () => {
    harness.planTier = "free";
    await mountMap(1600, crypto.randomUUID(), PATH);
    expect(panelText()).toContain(CATALOG["v4.web.otherPages"]);
    expect(addButton()).toBeNull();
    expect(panelText()).not.toContain(CATALOG["v4.web.addResearchedHint"]);
    await unmountMap();
    harness.planTier = "premium";
    harness.room = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-01T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS", new_starts: "BLOCKED_UNTIL_RESET" } as never;
    await mountMap(1600, crypto.randomUUID(), PATH);
    expect(panelText()).toContain(CATALOG["v4.web.otherPages"]);
    expect(addButton()).toBeNull();
  });
});
