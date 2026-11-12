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
 * Keyboard audit 2026-11-12, wave 3 fix round (A10), on the stand-ins of kbd-r2-w2v4map-report.test.tsx: the rendered report
 * page has exactly one `#page-content` (the skip link's landing), focusable from script only, in each state the stand-ins
 * reach. Wave 2 (W2-V4MAP): the report page's presses that take or switch off the focused control (V4C-6 to
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

function oneMarkOn(node: ParentNode, where: string): HTMLElement {
  const all = [...node.querySelectorAll<HTMLElement>("#page-content")];
  expect(all, "one #page-content in the rendered page").toHaveLength(1);
  expect(all[0]!.getAttribute("tabindex")).toBe("-1");
  expect(all[0]!.matches(where), `the mark is on ${where}`).toBe(true);
  return all[0]!;
}

describe("the report page marks where its content starts, once (A10)", () => {
  it("the report itself: on its article", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]);
    const node = await mountReport(runId);
    oneMarkOn(node, "article.v4RepDoc");
  });

  it("no report yet (the versions read answers none): on its article", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => noInvestigation(runId);
    const node = await mountReport(runId);
    oneMarkOn(node, "article.v4RepDoc");
  });

  it("while the report's versions are read: on the loading box", async () => {
    const runId = crypto.randomUUID();
    const later = held<InvestigationReports>();
    reports.load = () => later.promise;
    const node = await mountReport(runId);
    expect(node.querySelector(".v4RepLoading")).not.toBeNull();
    oneMarkOn(node, "div.v4RepDoc");
    await act(async () => later.answer(investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")])));
    await settle();
    oneMarkOn(node, "article.v4RepDoc");
  });

  it("the debate could not be read: on the state box", async () => {
    reports.fail = new Error("made-up network fault");
    const node = await mountReport(crypto.randomUUID());
    expect(node.querySelector("[role='alert']")).not.toBeNull();
    oneMarkOn(node, ".v4RepState");
  });
});
