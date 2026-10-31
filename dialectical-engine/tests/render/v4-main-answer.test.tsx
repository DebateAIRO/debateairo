// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSchema, type Answer, type MainAnswerVersion } from "../../packages/contract/src/index.js";
import { CATALOG, harness, mountMap, page, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/* Decision 3 of 31 Oct: on the V4 debate page, the latest version of the main answer, why it changed, and the earlier ones readable. */
const version = (at: number, text: string, more: Partial<MainAnswerVersion> = {}): MainAnswerVersion => ({
  version: at, updated_at: `2026-10-0${String(at)}T10:00:00.000Z`, trigger: "PATH_REWRITE", position_ref: "n-smr", segments: [{ text }], ...more });
const section = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4MainAnswer");
const answerWith = (runId: string, main: Answer["main_answer"]): Answer => AnswerSchema.parse(seededAnswer(runId, { main_answer: main }));

beforeEach(() => { vi.useFakeTimers(); resetHarness(); });
afterEach(async () => { await unmountMap(); vi.useRealTimers(); });

describe("the main answer on the debate page", () => {
  it("nothing until a path has changed it: the first answer stands as before", async () => {
    const runId = crypto.randomUUID();
    harness.answer = AnswerSchema.parse(seededAnswer(runId, {}));
    await mountMap(1280, runId);
    expect(section()).toBeNull();
  });

  it("shows the newest version and why, with the earlier ones under it, newest first", async () => {
    const runId = crypto.randomUUID();
    const history = [version(1, "CHECK-first answer."), version(2, "CHECK-second answer."), version(3, "CHECK-third answer.", { trigger: "CHILD_PATH" })];
    harness.answer = answerWith(runId, { current: history[2]!, history });
    await mountMap(1280, runId);
    const shown = section()!;
    expect(shown.querySelector(".v4MainAnswerText")!.textContent).toBe("CHECK-third answer.");
    expect(shown.textContent).toContain(CATALOG["v4.mainAnswer.trigger.CHILD_PATH"]);
    const earlier = shown.querySelector("details")!;
    expect(earlier.querySelector("summary")!.textContent).toBe(CATALOG["v4.mainAnswer.earlier"]);
    expect([...earlier.querySelectorAll(".v4MainAnswerText")].map((text) => text.textContent)).toEqual(["CHECK-second answer.", "CHECK-first answer."]);
  });

  it("says when a change is being written, and marks a reservation", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { current: null, history: [], writing: true });
    await mountMap(1280, runId);
    expect(section()!.textContent).toBe(CATALOG["v4.mainAnswer.writing"]);
    await unmountMap();
    const other = crypto.randomUUID();
    const only = version(1, "CHECK-answer.", { with_reservation: true });
    harness.answer = answerWith(other, { current: only, history: [only] });
    await mountMap(1280, other);
    expect(section()!.textContent).toContain(CATALOG["v4.mainAnswer.reservation"]);
    expect(section()!.querySelector("details")).toBeNull();
  });
});
