// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { AnswerSchema, type Answer, type AnswerPathRewrites, type PathRewrite } from "../../packages/contract/src/index.js";
import { DIG_ANSWERS, DIG_RUNS } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  advance, buttonNamed, CATALOG, harness, mountMap, page, resetHarness, seededAnswer, settle, unmountMap, type MapWidth
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit round 4 (2026-11-12), B1: on every layout, the phone's included, the changes tour keeps focus on its own
 * Next while it steps, and puts it on Done at the last stop (V4TourBar's promise). Before, the phone layout's `select`
 * still asked for the panel heading's focus, and that request ran after the tour bar's own focus().
 */

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

async function press(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.focus();
    button.click();
  });
  await settle();
}

const DIG_A = "d9000000-0000-4000-8000-000000000006";
const DIG_B = "d9000000-0000-4000-8000-000000000016";
const LATER = "2026-10-31T09:00:00.000Z";
const writingBy = (digRunId: string, id: string): PathRewrite => ({ rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "WRITING" });
const readyBy = (digRunId: string, id: string, line: string): PathRewrite => ({
  rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "READY", rewritten_at: "2026-10-31T09:06:00.000Z",
  changed: true, text: { line, summary: "In short.", fate: "PARTLY_HELD" }, what_changed: ["What the dig found."], fate_before: "PARTLY_HELD",
  view: null, dig_paths: []
});
const answerWith = (runId: string, rewrites: AnswerPathRewrites): Answer => {
  const answer = AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
  if (answer.web === undefined) return answer;
  return { ...answer, web: { ...answer.web, paths: answer.web.paths.map((path) => ({ ...path,
    other_pages: path.other_pages.filter((other) => other.researched?.state !== "READING") })) } };
};
const doneDig = (link: DigLink, rewrite: PathRewrite): DigView => {
  const own = buildV4Map({ runId: link.childRunId, answer: seededAnswer(link.childRunId, { dig: DIG_ANSWERS[DIG_RUNS.ownView] }), story: null });
  return { link, state: "DONE", headline: null, counts: own.counts, rewrite, points: own.points };
};

async function twoDigsFinish(width: MapWidth): Promise<void> {
  const runId = crypto.randomUUID();
  const [writingA, writingB] = [writingBy(DIG_A, "rw-a"), writingBy(DIG_B, "rw-b")];
  harness.answer = answerWith(runId, {
    paths: [{ position_ref: "n-renew", current: null, history: [writingA] }, { position_ref: "n-smr", current: null, history: [writingB] }],
    changed_since: { count: 0, since_report_version: null }
  });
  harness.records = {
    parent: null,
    children: [DIG_A, DIG_B].map((child, at) => ({
      parent_run_id: runId, child_run_id: child, places: [at === 0 ? "path:n-renew" : "path:n-smr"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z"
    }))
  };
  harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? writingA : writingB);
  await mountMap(width, runId);
  const [readyA, readyB] = [readyBy(DIG_A, "rw-a", "Renewables: partly held."), readyBy(DIG_B, "rw-b", "Small reactors: partly held.")];
  const text = (rewrite: PathRewrite) => (rewrite as Extract<PathRewrite, { state: "READY" }>).text;
  harness.fresh = answerWith(runId, {
    paths: [
      { position_ref: "n-renew", current: text(readyA), history: [readyA] },
      { position_ref: "n-smr", current: text(readyB), history: [readyB] }
    ],
    changed_since: { count: 2, since_report_version: null }
  });
  harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? readyA : readyB);
  await advance(15_100);
  await settle(200);
}

const tourNext = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4TourBar .v4TourNext");
const tourDone = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4TourBar .v4TourDone");

describe.each([375, 800, 1600] as const)("B1 at %ipx: the changes tour keeps focus on its own buttons", (width) => {
  it("Show me leaves focus on Next; Next leaves it on Done at the last stop", async () => {
    await twoDigsFinish(width);
    const note = page().querySelector<HTMLElement>(".v4ReadyNote");
    expect(note).not.toBeNull();
    await press(buttonNamed(CATALOG["v4.ready.showMe"]!, note!));
    expect(tourNext()).not.toBeNull();
    expect(document.activeElement).toBe(tourNext());
    await press(tourNext()!);
    expect(tourNext()).toBeNull();
    expect(document.activeElement).toBe(tourDone());
  });
});
