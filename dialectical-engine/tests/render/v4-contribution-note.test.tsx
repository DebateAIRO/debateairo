// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "../../packages/contract/src/index.js";
import { CATALOG, advance, digPart, harness, mountMap, page, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Decision 13, the digger's view: on the V4 page of a dig made on a public debate, what became of it. No reason shown; only ON_THE_PAGE links to the public page;
 * while the check runs the answer is read again, until it says.
 */
const PUBLIC_REF = "f1000000-0000-4000-8000-000000000001";
const RUN = "c1000000-0000-4000-8000-000000000009";
const dig = (state: "CHECKING" | "ON_THE_PAGE" | "KEPT_PRIVATE"): Answer => {
  const answer = seededAnswer(RUN, { dig: digPart("11111111-1111-4111-8111-111111111111", 1), contribution: { public_ref: PUBLIC_REF, state } } as never);
  // The seeded debate has a page still being read, which reads the answer again for its own reason: settled here, so a read below is the check's.
  return { ...answer, web: { paths: answer.web!.paths.map((path) => ({ ...path, other_pages: path.other_pages.map((other) =>
    other.researched?.state === "READING" ? { ...other, researched: { state: "ADDS_NOTHING" as const } } : other) })) } };
};
const note = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ContributionNote");

beforeEach(() => { vi.useFakeTimers(); resetHarness(); });
afterEach(async () => { await unmountMap(); vi.useRealTimers(); });

describe("the digger's view of a dig on a public debate", () => {
  it("CHECKING says the check is on and reads the answer again; once it passed, it says so with a link to the public page", async () => {
    harness.answer = dig("CHECKING");
    await mountMap(1280, RUN);
    expect(note()!.textContent).toBe("An AI is checking this before it can change the public page.");
    expect(note()!.querySelector("a")).toBeNull();

    harness.loadAnswer.mockClear();
    harness.fresh = dig("ON_THE_PAGE");
    await advance(15_000);
    await advance(1);
    expect(harness.loadAnswer).toHaveBeenCalled();
    expect(note()!.textContent).toContain("This changed the public page.");
    expect(note()!.querySelector("a")!.getAttribute("href")).toBe(`/public/debate/${PUBLIC_REF}`);
    // It has its outcome: no more reads for it.
    harness.loadAnswer.mockClear();
    await advance(60_000);
    expect(harness.loadAnswer).not.toHaveBeenCalled();
  });

  it("KEPT_PRIVATE says it stayed private and only they see it, with no reason and no link", async () => {
    harness.answer = dig("KEPT_PRIVATE");
    await mountMap(1280, RUN);
    expect(note()!.textContent).toBe("This stayed private: it did not pass the check, so the public page is unchanged. Only you can see it.");
    expect(note()!.querySelector("a")).toBeNull();
    expect(CATALOG["v4.contribution.KEPT_PRIVATE"]).toBe(note()!.textContent);
  });

  it("a debate that is no dig on a public page shows nothing", async () => {
    await mountMap(1280, RUN);
    expect(note()).toBeNull();
  });
});
