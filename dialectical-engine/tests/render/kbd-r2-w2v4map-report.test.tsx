// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";
import type { ReopenResult, WriteReportResult } from "../../apps/ui/lib/v4/load.js";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness.js";
import { CATALOG, resetHarness, settle } from "./v4-debate-harness.js";

// The stand-ins of tests/render/v4-report-versions.test.tsx (the reads of the report page), cut to what these presses need.
const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  reopen: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  /** A read of the debate that fails, in place of the harness's. */
  fail: null as Error | null
}));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => <span className="v4HdrAccount" /> }));
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => {
  const base = (await import("./v4-debate-harness.js")).loadMock(await original());
  return {
    ...base,
    loadV4: async (id: string) => {
      if (reports.fail !== null) throw reports.fail;
      return base.loadV4(id);
    },
    loadInvestigation: (runId: string) => reports.load(runId),
    writeReport: (runId: string) => reports.write(runId),
    reopenInvestigation: (runId: string) => reports.reopen(runId)
  };
});
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit 2026-11-12, wave 2 (W2-V4MAP): the report page's presses that take or switch off the focused control (V4C-6 to
 * V4C-10), with the site's focus guard running (tests/render/kbd-guard-harness.ts). The page is the real one, with the stand-ins of
 * v4-report-versions.test.tsx; the host stands for the layout's main area. Made-up texts only.
 */

const finished = (version: number, written: string): InvestigationReportVersion => ({
  report_version: version, closed_at: "2026-10-30T09:00:00.000Z", state: "READY", written_at: written,
  answer: { segments: [`The made-up answer of version ${version}.`, "What evidence would decide it."] }, story: null, sources: [], shortened: false
} as InvestigationReportVersion);
const writing = (version: number, waiting: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-10-31T09:00:00.000Z", state: "WRITING", waiting_for_digs: waiting });
function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 1): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY").at(-1)?.report_version ?? null;
  return InvestigationReportsSchema.parse({ investigation_id: "55555555-5555-4555-8555-555555555555", root_run_id: runId, state, digs, versions, current });
}
const noInvestigation = (runId: string): InvestigationReports =>
  InvestigationReportsSchema.parse({ investigation_id: null, root_run_id: runId, state: "OPEN", digs: 0, versions: [], current: null });

let root: Root | null = null;
let host: HTMLElement | null = null;
let stopGuard: () => void = () => undefined;

async function mountReport(runId: string): Promise<HTMLElement> {
  const { V4ReportClient } = await import("../../apps/ui/components/v4/V4ReportClient.js");
  host = document.createElement("main");
  host.id = "main-content";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<V4ReportClient id={runId} locale="en" initialLevel="background" catalog={CATALOG} newDebateCatalog={{}} />));
  await settle();
  return host;
}

/** A keyboard press, then the page's reads and the guard's wait. */
async function press(button: HTMLElement): Promise<void> {
  pressByKeyboard(button);
  await settle();
  await guardWait();
}
async function guardWait(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
  });
  await settle();
}
const buttonOf = (node: ParentNode, name: string): HTMLButtonElement | null =>
  [...node.querySelectorAll("button")].find((button) => button.textContent?.trim() === name) ?? null;
/** A read that waits until the test answers it. */
function held<T>(): { promise: Promise<T>; answer: (value: T) => void } {
  let answer: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => { answer = resolve; });
  return { promise, answer };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.load = async () => null;
  reports.write = async () => ({ kind: "FAILED" });
  reports.reopen = async () => ({ kind: "FAILED" });
  reports.fail = null;
  window.history.replaceState(null, "", "/");
  stopGuard = startFocusGuard();
});
afterEach(async () => {
  stopGuard();
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("V4C-6: \"Check again\" on a version that takes long", () => {
  it("the version is written: the slow part goes; focus is held on the status box, right above the version", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:16:00.000Z"));
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 0)], 0));
    reports.load = load;
    const node = await mountReport(runId);
    load.mockImplementation(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-31T09:17:00.000Z")], 0));
    await press(buttonOf(node, CATALOG["v4.investigation.checkAgain"]!)!);
    expect(buttonOf(node, CATALOG["v4.investigation.checkAgain"]!)).toBeNull();
    const box = node.querySelector<HTMLElement>(".v4RepStatusBox")!;
    expect(document.activeElement).toBe(box);
    expect(box.nextElementSibling?.querySelector(".v4RepVersionAnswer, h2, h3, p")).not.toBeNull();
  });
});

describe("V4C-7: the versions read's \"Try again\"", () => {
  it("the card stays while the read is asked again (focus on Try again), then focus goes to the versions' status", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => null;
    const node = await mountReport(runId);
    const again = held<InvestigationReports>();
    reports.load = () => again.promise;
    await press(buttonOf(node.querySelector(".v4RepCard")!, CATALOG["v4.common.retry"]!)!);
    // Nothing is swapped for the page's loading placeholder meanwhile.
    expect(node.querySelector(".v4RepLoading")).toBeNull();
    const retry = buttonOf(node.querySelector(".v4RepCard")!, CATALOG["v4.common.retry"]!)!;
    expect(document.activeElement).toBe(retry);
    // The button says the read is on its way, and a second press sends no second read (review, 12 Nov).
    expect(retry.getAttribute("aria-busy")).toBe("true");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    let reads = 0;
    reports.load = () => { reads += 1; return again.promise; };
    await press(retry);
    expect(reads).toBe(0);
    await act(async () => again.answer(investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")])));
    await settle();
    await guardWait();
    expect(node.querySelector(".v4RepInvestigation")).not.toBeNull();
    expect(document.activeElement).toBe(node.querySelector(".v4RepStatusBox"));
  });
});

describe("V4C-8: the PDF's \"Try again\"", () => {
  it("the line says it is making the PDF; focus is held on that line, and stays in the status line when it fails again", async () => {
    let get: () => Promise<Response> = async () => new Response("busy", { status: 429, headers: { "content-type": "text/plain" } });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "HEAD" ? new Response(null, { status: 200 }) : get())));
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]);
    const node = await mountReport(runId);
    await press(node.querySelector<HTMLButtonElement>(".v4RepShare .v4RepMenuButton")!);
    await press(node.querySelector<HTMLButtonElement>(".v4RepShare .v4RepMenuItem[data-share='pdf']")!);
    const status = node.querySelector<HTMLElement>(".v4RepHdrStatus")!;
    expect(status.textContent).toContain(CATALOG["v4.report.pdfFailed"]);
    const making = held<Response>();
    get = () => making.promise;
    await press(buttonOf(status, CATALOG["v4.common.retry"]!)!);
    expect(status.textContent).toBe(CATALOG["v4.report.pdfMaking"]);
    expect(document.activeElement).toBe(status.querySelector(".v4RepHdrStatusLine"));
    await act(async () => making.answer(new Response("busy", { status: 429, headers: { "content-type": "text/plain" } })));
    await settle();
    await guardWait();
    expect(status.contains(document.activeElement)).toBe(true);
    expect(buttonOf(status, CATALOG["v4.common.retry"]!)).not.toBeNull();
  });
});

describe("V4C-9: the page's load-failed \"Try again\"", () => {
  it("the page loads; focus goes to the report's title, not the whole page", async () => {
    reports.fail = new ContractHttpError("SERVER_FAILURE", 500, "boom");
    const runId = crypto.randomUUID();
    reports.load = async () => noInvestigation(runId);
    const node = await mountReport(runId);
    reports.fail = null;
    await press(buttonOf(node, CATALOG["v4.common.retry"]!)!);
    expect(node.querySelector("#v4-report-title")).not.toBeNull();
    expect(document.activeElement).toBe(node.querySelector("#v4-report-title"));
  });

  it("a read that fails again: focus is held in the page's state, right before its Try again", async () => {
    reports.fail = new ContractHttpError("SERVER_FAILURE", 500, "boom");
    const node = await mountReport(crypto.randomUUID());
    await press(buttonOf(node, CATALOG["v4.common.retry"]!)!);
    const state = node.querySelector<HTMLElement>(".v4RepState")!;
    expect(document.activeElement).toBe(state);
    expect(buttonOf(state, CATALOG["v4.common.retry"]!)).not.toBeNull();
  });
});

describe("V4C-10: Write my report, Write it again, Keep digging and the note's Try again stay focusable for the whole press", () => {
  it("Write my report: focus stays on it, busy, while the press runs; then it goes to the status box", async () => {
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => noInvestigation(runId));
    reports.load = load;
    const sent = held<WriteReportResult>();
    reports.write = vi.fn(() => sent.promise);
    const node = await mountReport(runId);
    const write = buttonOf(node, CATALOG["v4.rail.writeReport"]!)!;
    await press(write);
    expect(document.activeElement).toBe(write);
    expect(write.disabled).toBe(false);
    expect(write.getAttribute("aria-busy")).toBe("true");
    expect(write.getAttribute("aria-disabled")).toBe("true");
    // A second press meanwhile sends nothing.
    await press(write);
    expect(reports.write).toHaveBeenCalledTimes(1);
    load.mockImplementation(async () => investigation(runId, "CLOSED", [writing(1, 0)]));
    await act(async () => sent.answer({ kind: "WRITING", reportVersion: 1, waitingForDigs: 0 }));
    await settle();
    await guardWait();
    expect(document.activeElement).toBe(node.querySelector(".v4RepStatusBox"));
  });

  it("Keep digging keeps focus while its press runs; the note's Try again goes with its note, and focus is held on the status box", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]);
    const first = held<ReopenResult>();
    reports.reopen = vi.fn(() => first.promise);
    const node = await mountReport(runId);
    const keep = buttonOf(node, CATALOG["v4.investigation.keepDigging"]!)!;
    await press(keep);
    expect(document.activeElement).toBe(keep);
    expect(keep.getAttribute("aria-busy")).toBe("true");
    await act(async () => first.answer({ kind: "FAILED" }));
    await settle();
    await guardWait();
    const retry = buttonOf(node, CATALOG["v4.common.retry"]!)!;
    expect(retry).not.toBeNull();
    const second = held<ReopenResult>();
    reports.reopen = vi.fn(() => second.promise);
    // The note's Try again goes with its note as the press starts (the note is cleared for the new try): the guard holds focus
    // on the status box the note was in, where the press's outcome is said, and the press ends there too.
    await press(retry);
    expect(node.querySelector(".v4RepPressNote")).toBeNull();
    expect(document.activeElement).toBe(node.querySelector(".v4RepStatusBox"));
    await act(async () => second.answer({ kind: "FAILED" }));
    await settle();
    await guardWait();
    expect(document.activeElement).toBe(node.querySelector(".v4RepStatusBox"));
  });
});
