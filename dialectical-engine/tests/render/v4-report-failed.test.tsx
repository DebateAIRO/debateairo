// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { CATALOG, harness, resetHarness, settle } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
// ask-d6 A: the report row's account button reads the session; its own test is v4-header-account. Here it shows the
// classic view the report hands it (owner 5 Nov, question 12 B).
vi.mock("@/components/v4/V4AccountMenu", () => ({
  V4AccountMenu: ({ classicHref }: { classicHref: string | null }) => <span className="v4HdrAccount" data-classic={classicHref ?? "none"} />
}));
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
 * Owner 5 Nov: the classic view is in the account menu only (question 12 B). The level ruling: until the server's run read
 * names the debate's own level, the way back to this debate keeps the level the report was opened at (?level=), so the map
 * and its report agree both ways; "Ask a new question" carries none (a new question picks its own level).
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

/** The report's own header (t4 report track): its back link's words and address. */
function headerBack(): { text: string; href: string } | null {
  const back = host?.querySelector<HTMLAnchorElement>("a.v4RepHdrBack");
  return back === null || back === undefined ? null
    : { text: back.querySelector(".v4RepHdrBackText")?.textContent ?? "", href: back.getAttribute("href") ?? "" };
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
    // Under the line, and in the report's own header (t4: V4ReportHeader's arrow link).
    expect(links(CATALOG["v4.report.backToQuestion"]!)).toEqual([`/v4/debate/${runId}?level=background`]);
    expect(headerBack()).toEqual({ text: CATALOG["v4.report.backToQuestion"], href: `/v4/debate/${runId}?level=background` });
    expect(links(CATALOG["v4.report.backToMap"]!)).toEqual([]);
    // report-f10 (t4 report track): Ask a new question; the classic view only in the account menu.
    expect(links(CATALOG["v4.debate.askNew"]!)).toEqual(["/v4"]);
    expect(links(CATALOG["v4.common.classicView"]!)).toEqual([]);
    expect(host!.querySelector(".v4HdrAccount")!.getAttribute("data-classic")).toBe(`/debate/${runId}`);
  });

  it("a debate still running keeps 'Back to the map'", async () => {
    const runId = crypto.randomUUID();
    harness.run = run(runId, "RUNNING");
    await mountReport(runId);
    expect(host!.textContent).toContain(CATALOG["v4.report.notReady"]);
    expect(links(CATALOG["v4.report.backToMap"]!)).toEqual([`/v4/debate/${runId}?level=background`]);
    expect(headerBack()?.text).toBe(CATALOG["v4.report.backToMap"]);
    expect(links(CATALOG["v4.report.backToQuestion"]!)).toEqual([]);
    // Question 12 B: no foot link under the line any more; the account menu holds the classic view.
    expect(links(CATALOG["v4.common.classicView"]!)).toEqual([]);
    expect(host!.querySelector(".v4RepFoot")).toBeNull();
    expect(host!.querySelector(".v4HdrAccount")!.getAttribute("data-classic")).toBe(`/debate/${runId}`);
  });
});
