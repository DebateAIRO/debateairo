// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { InvestigationReportsSchema, type InvestigationReports } from "../../packages/contract/src/index.js";
import { buttonNamed, CATALOG, harness, mountMap, page, resetHarness, seededAnswer, seededStory, settle, unmountMap } from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  /** Every run id a report was asked for. */
  written: [] as string[]
}));
/** The reads the pages make through the site's one contract client: the debate's visibility, the report page's room, the public page's press. */
const api = vi.hoisted(() => ({
  visibility: { state: "PRIVATE", public_ref: null } as Record<string, unknown>,
  room: null as unknown,
  roomReads: 0,
  writePublicReport: (async () => ({ state: "WRITING", report_version: 2 })) as (ref: string) => Promise<unknown>,
  publicPresses: [] as string[]
}));

vi.mock("@/lib/api", async (original) => {
  const real = await original<Record<string, unknown> & { contractClient: Record<string, unknown> }>();
  return {
    ...real,
    validateSession: async () => undefined,
    contractClient: {
      ...real.contractClient,
      readRunVisibility: async () => api.visibility,
      getAskRoom: async () => {
        api.roomReads += 1;
        if (api.room === null) throw new Error("no room read");
        return api.room;
      },
      writePublicReport: (ref: string) => {
        api.publicPresses.push(ref);
        return api.writePublicReport(ref);
      }
    }
  };
});
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await import("./v4-debate-harness.js")).loadMock(await original()),
  loadInvestigation: (runId: string) => reports.load(runId),
  writeReport: (runId: string) => {
    reports.written.push(runId);
    return reports.write(runId);
  }
}));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit round 4 (2026-11-12), B4: on a phone, "Write my report" in the slim "Good time to write your report" line
 * opens the report's strip in the pinned bar (the line steps aside while it is open). "Not yet" and Escape give focus back
 * to that same button, drawn again, never to the pinned bar's dig button, and never to nothing. Made-up data only (the
 * recipe of v4-report-wait.test.tsx).
 */

const INVESTIGATION_ID = "4e000000-0000-4000-8000-0000000000c5";
const PUBLIC_REF = "f1000000-0000-4000-8000-0000000000c5";

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}
function investigation(runId: string, digs: number): InvestigationReports {
  return InvestigationReportsSchema.parse({
    investigation_id: INVESTIGATION_ID, root_run_id: runId, state: "OPEN", digs, versions: [], current: null, first_closing_left: true
  });
}
/**
 * dig-f29's good time with one question left open (the star looked into, no "would change" question left), on a path that
 * stays open in the panel, so the pinned bar's job stays that path's dig. Returns the path's id.
 */
function digAllButOne(runId: string): string {
  const map = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() });
  const left = map.paths.flatMap((path) => path.open.map((question) => ({ path, question })))
    .find(({ question }) => !question.star && question.kind !== "WOULD_CHANGE");
  if (left === undefined) throw new Error("the seed has no question to leave open");
  const all = [...new Set([...map.open, ...map.paths.flatMap((path) => path.open)].map((question) => question.id))]
    .filter((id) => id !== left.question.id);
  harness.records = {
    parent: null,
    children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: all, mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
  };
  harness.digView = (link: DigLink): DigView => ({
    link, state: "DONE", headline: null, counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, rewrite: null,
    points: [{ id: "d1", text: "Checked.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }]
  });
  return left.path.id;
}

const strip = (): HTMLElement | null => page().querySelector<HTMLElement>("[data-report-strip]");
const goodWrite = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4StackGoodTime .v4StackGoodReport");

async function press(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.focus();
    button.click();
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.written = [];
  reports.write = async () => ({ kind: "FAILED" });
  api.visibility = { state: "PRIVATE", public_ref: null };
  void PUBLIC_REF;
});
afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

async function openFromGoodTime(): Promise<void> {
  const runId = crypto.randomUUID();
  const path = digAllButOne(runId);
  harness.room = room();
  reports.load = async () => investigation(runId, 1);
  await mountMap(375, runId, path);
  await settle(200);
  const opener = goodWrite();
  expect(opener, "the Good time line offers its own Write my report").not.toBeNull();
  await press(opener!);
  expect(strip(), "the strip opens in the pinned bar").not.toBeNull();
  expect(goodWrite(), "the Good time line steps aside while the strip is open").toBeNull();
}

describe("B4: the report strip opened from the Good time line's own button", () => {
  it("Not yet gives focus back to that button", async () => {
    await openFromGoodTime();
    await press(buttonNamed(CATALOG["v4.reportStrip.notYet"]!, strip()!));
    expect(strip()).toBeNull();
    expect(goodWrite()).not.toBeNull();
    expect(document.activeElement?.className, "focus is on the Good time line's button").toContain("v4StackGoodReport");
    expect(document.activeElement).toBe(goodWrite());
  });

  it("Escape gives focus back to that button", async () => {
    await openFromGoodTime();
    const inside = buttonNamed(CATALOG["v4.reportStrip.notYet"]!, strip()!);
    await act(async () => {
      inside.focus();
      inside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(strip()).toBeNull();
    expect(document.activeElement?.className, "focus is on the Good time line's button").toContain("v4StackGoodReport");
    expect(document.activeElement).toBe(goodWrite());
  });
});
