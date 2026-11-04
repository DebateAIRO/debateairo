// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSchema, type Answer, type MainAnswerVersion } from "../../packages/contract/src/index.js";
import { answerVersions } from "../../apps/ui/components/v4/V4AnswerCard.js";
import { CATALOG, click, harness, mountMap, openPath, page, PATHS, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Decision 3 of 31 Oct: on the V4 debate page, the latest version of the main answer, why it changed, and the earlier ones
 * readable. V4 screen review (3 Nov): map-d1 A puts that answer in one card across the top, folded to one line while another
 * question is open; map-f2: only the newest answer is called current, the others (the first answer included) are under
 * "Earlier versions of the answer", with their dates, and the panel of "Your question" shows the evidence, not a second copy.
 */
const version = (at: number, text: string, more: Partial<MainAnswerVersion> = {}): MainAnswerVersion => ({
  version: at, updated_at: `2026-10-0${String(at)}T10:00:00.000Z`, trigger: "PATH_REWRITE", position_ref: "n-smr", segments: [{ text }], ...more });
const card = (): HTMLElement => page().querySelector<HTMLElement>(".v4AnswerCard")!;
const answerWith = (runId: string, main: Answer["main_answer"]): Answer => AnswerSchema.parse(seededAnswer(runId, { main_answer: main }));
const FIRST_WORDS = "Our answer: put most new money into renewables and storage";

beforeEach(() => { vi.useFakeTimers(); resetHarness(); });
afterEach(async () => { await unmountMap(); vi.useRealTimers(); });

describe("the answer card on the debate page", () => {
  it("before any change: the first answer is the current one, with how sure, and no earlier versions", async () => {
    const runId = crypto.randomUUID();
    harness.answer = AnswerSchema.parse(seededAnswer(runId, {}));
    await mountMap(1600, runId);
    expect(card().classList.contains("v4AnswerCardFolded")).toBe(false);
    expect(card().querySelector(".v4Eyebrow")!.textContent).toBe(CATALOG["v4.panel.answerRoot"]);
    expect(card().querySelector(".v4AnswerHeadline")!.textContent).toContain(FIRST_WORDS);
    expect(card().querySelector(".v4AnswerSure .v4BarCounts")!.textContent).toContain(CATALOG["v4.panel.confidence"]);
    expect(card().querySelector(".v4AnswerEarlier")).toBeNull();
    // The panel of "Your question" shows the evidence, not a second copy of the answer.
    expect(page().querySelector(".v4Panel")!.textContent).not.toContain(FIRST_WORDS);
  });

  it("shows the newest version and why, with the earlier ones under it, newest first, the first answer last", async () => {
    const runId = crypto.randomUUID();
    const history = [version(1, "CHECK-first answer."), version(2, "CHECK-second answer."), version(3, "CHECK-third answer.", { trigger: "CHILD_PATH" })];
    harness.answer = answerWith(runId, { current: history[2]!, history });
    await mountMap(1600, runId);
    expect(card().querySelector(".v4AnswerHeadline")!.textContent).toBe("CHECK-third answer.");
    // Why it changed, naming the path (AI text, marked as such).
    const note = [...card().querySelectorAll(".v4AnswerNote")].find((line) => line.querySelector("[data-ai-generated]") !== null)!;
    expect(note.textContent).toContain("because a dig further down changed");
    const earlier = card().querySelector<HTMLDetailsElement>("details.v4AnswerEarlier")!;
    expect(earlier.open).toBe(false);
    expect(earlier.querySelector("summary")!.textContent).toBe(CATALOG["v4.mainAnswer.earlier"]);
    const bodies = [...earlier.querySelectorAll(".v4AnswerVersion")].map((item) => item.textContent ?? "");
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain("CHECK-second answer.");
    expect(bodies[1]).toContain("CHECK-first answer.");
    expect(bodies[2]).toContain(FIRST_WORDS);
    // Only one answer is ever called current.
    expect(page().textContent).not.toContain(CATALOG["v4.mainAnswer.title"]);
  });

  it("says when a change is being written, and marks a reservation", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { current: null, history: [], writing: true });
    await mountMap(1600, runId);
    expect(card().querySelector("[role=status]")!.textContent).toBe(CATALOG["v4.mainAnswer.writing"]);
    await unmountMap();
    const other = crypto.randomUUID();
    const only = version(1, "CHECK-answer.", { with_reservation: true });
    harness.answer = answerWith(other, { current: only, history: [only] });
    await mountMap(1600, other);
    expect(card().textContent).toContain(CATALOG["v4.mainAnswer.reservation"]);
    // The first answer is now an earlier version.
    expect(card().querySelector("details.v4AnswerEarlier")!.textContent).toContain(FIRST_WORDS);
  });

  it("folds into one line when another question is open, and unfolds in place when that line is pressed", async () => {
    const runId = crypto.randomUUID();
    harness.answer = AnswerSchema.parse(seededAnswer(runId, {}));
    await mountMap(1600, runId);
    await openPath(PATHS.mix);
    expect(card().classList.contains("v4AnswerCardFolded")).toBe(true);
    const line = card().querySelector<HTMLButtonElement>(".v4AnswerFoldLine")!;
    expect(line.hidden).toBe(false);
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(line.textContent).toContain(CATALOG["v4.answerCard.folded"]);
    expect(card().querySelector(".v4AnswerFold")!.hasAttribute("inert")).toBe(true);
    await click(line);
    expect(card().classList.contains("v4AnswerCardFolded")).toBe(false);
    // The path stays open in the panel.
    expect(page().querySelector(".v4Panel-path")).not.toBeNull();
  });

  it("on a phone, the folded line goes back to \"Your question\"", async () => {
    const runId = crypto.randomUUID();
    harness.answer = AnswerSchema.parse(seededAnswer(runId, {}));
    await mountMap(375, runId);
    await click(page().querySelector<HTMLButtonElement>(".v4PathListRow")!);
    expect(page().querySelector(".v4Panel-path")).not.toBeNull();
    await click(card().querySelector<HTMLButtonElement>(".v4AnswerFoldLine")!);
    expect(page().querySelector(".v4Panel-root")).not.toBeNull();
    expect(card().classList.contains("v4AnswerCardFolded")).toBe(false);
  });
});

describe("which answer is current (map-f2)", () => {
  const main = (at: string, text: string): MainAnswerVersion => ({ ...version(1, text), updated_at: at });
  it("the newest of a rewrite and a report's answer; the first answer always last", () => {
    const rewrite = main("2026-10-30T10:00:00.000Z", "Rewritten.");
    const kinds = (report: string | null) => answerVersions({
      mainAnswer: { current: rewrite, history: [rewrite] },
      reportAnswer: { version: 1, segments: ["Report."], writtenAt: report },
      answeredAt: "2026-11-02T10:00:00.000Z"
    }).map((entry) => entry.kind);
    expect(kinds("2026-10-31T10:00:00.000Z")).toEqual(["REPORT", "MAIN", "FIRST"]);
    expect(kinds("2026-10-29T10:00:00.000Z")).toEqual(["MAIN", "REPORT", "FIRST"]);
    expect(kinds(null)).toEqual(["MAIN", "REPORT", "FIRST"]);
    expect(answerVersions({ mainAnswer: null, reportAnswer: null, answeredAt: null }).map((entry) => entry.kind)).toEqual(["FIRST"]);
  });
});
