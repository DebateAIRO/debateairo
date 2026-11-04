// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { CATALOG, harness, resetHarness, settle } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Owner review 3 Nov 2026 (map-f30): the report page of a debate that did not finish has no map to go back to. It says
 * there is no report and links back to the debate's own page ("Back to your question"), where "Ask this again" is; the
 * header's back link says the same. A debate still running keeps "Back to the map".
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mountReport(runId: string): Promise<HTMLDivElement> {
  const { V4ReportClient } = await import("../../apps/ui/components/v4/V4ReportClient.js");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<V4ReportClient id={runId} locale="en" initialLevel="background" catalog={CATALOG} newDebateCatalog={{}} />));
  await settle();
  return host;
}

function links(name: string): string[] {
  return [...(host?.querySelectorAll("a") ?? [])].filter((link) => link.textContent?.trim() === name).map((link) => link.getAttribute("href") ?? "");
}

function run(runId: string, state: RunProjection["state"]): RunProjection {
  return { run_ref: runId, question_line: "Will AI tutors replace homework help?", state,
    terminal_reason: state === "FAILED" ? "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM" : null, hold_until: null };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("the report page of a debate that did not finish (map-f30)", () => {
  it("links back to the debate's own page, in the header and under the line", async () => {
    const runId = crypto.randomUUID();
    harness.run = run(runId, "FAILED");
    await mountReport(runId);
    expect(host!.textContent).toContain(CATALOG["v4.report.failed"]);
    expect(links(CATALOG["v4.report.backToQuestion"]!)).toEqual([`/v4/debate/${runId}?level=background`, `/v4/debate/${runId}?level=background`]);
    expect(links(CATALOG["v4.report.backToMap"]!)).toEqual([]);
    // report-f10 (t4 report track): Ask a new question, and the classic view only as the small link under it.
    expect(links(CATALOG["v4.debate.askNew"]!)).toEqual(["/v4?level=background"]);
    expect(links(CATALOG["v4.common.classicView"]!)).toEqual([`/debate/${runId}`]);
  });

  it("a debate still running keeps 'Back to the map'", async () => {
    const runId = crypto.randomUUID();
    harness.run = run(runId, "RUNNING");
    await mountReport(runId);
    expect(host!.textContent).toContain(CATALOG["v4.report.notReady"]);
    expect(links(CATALOG["v4.report.backToMap"]!).length).toBe(2);
    expect(links(CATALOG["v4.report.backToQuestion"]!)).toEqual([]);
  });
});
