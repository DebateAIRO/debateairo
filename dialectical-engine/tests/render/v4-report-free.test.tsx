// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";
import { CATALOG, harness, resetHarness, seededAnswer, settle } from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  /** What the question's visibility read says (null: it cannot be read). */
  published: false as boolean | null,
  visibilityReads: [] as string[]
}));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await import("./v4-debate-harness.js")).loadMock(await original()),
  loadInvestigation: (runId: string) => reports.load(runId)
}));
vi.mock("@/lib/v4/reportWriting", async (original) => ({
  ...(await original()),
  loadRunPublished: async (runId: string) => {
    reports.visibilityReads.push(runId);
    return reports.published;
  }
}));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 screen review (owner picks 3 Nov 2026), report-f15 on the report page (V4ReportClient): on Free, before writing, "This
 * question is public, so your report will be public too." (unless the question's check kept it private: its visibility
 * read then says PRIVATE), and "How this was checked" explains only the trust words that can appear on Free (Free never
 * looks anything up, so its best word is "Sure, for the case named"). Made-up texts only.
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
const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();

/** The seeded answer as a Free debate ran it: no path searched the web. */
function freeAnswer(runId: string): typeof harness.answer {
  const answer = seededAnswer(runId);
  return { ...answer, web: { ...answer.web!, paths: answer.web!.paths.map((path) => ({ ...path, search: { status: "NOT_ON_PLAN" }, other_pages: [] })) } } as typeof answer;
}
function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[]): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY").at(-1)?.report_version ?? null;
  return InvestigationReportsSchema.parse({
    investigation_id: versions.length === 0 ? null : "55555555-5555-4555-8555-5555555555aa", root_run_id: runId, state, digs: 0, versions, current
  });
}
const failed = (version: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-11-04T10:00:00.000Z", state: "FAILED", written_at: "2026-11-04T10:20:00.000Z" });
const finished = (version: number): InvestigationReportVersion => ({
  report_version: version, closed_at: "2026-11-04T10:00:00.000Z", state: "READY", written_at: "2026-11-04T10:08:00.000Z",
  answer: { segments: ["A made-up report answer."] }, story: null, sources: [], shortened: false
} as InvestigationReportVersion);

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.published = false;
  reports.visibilityReads = [];
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("report-f15 on the report page", () => {
  it("on Free, how it was checked explains only the words that can appear there; a paid debate keeps all four", async () => {
    const paid = crypto.randomUUID();
    reports.load = async () => investigation(paid, "OPEN", []);
    const paidPage = await mountReport(paid);
    const words = (node: ParentNode) => [...node.querySelectorAll(".v4RepWords .v4RepWord b")].map((word) => word.textContent);
    expect(words(paidPage)).toEqual(["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"].map((key) => CATALOG[`v4.trust.${key}`]));
    expect(flat(paidPage)).toContain(CATALOG["v4.report.checkedWordsIntro"]);
    // A paid question never reads its visibility for this line.
    expect(reports.visibilityReads).toEqual([]);
    await act(async () => root?.unmount());
    host?.remove();

    const runId = crypto.randomUUID();
    harness.answer = freeAnswer(runId);
    reports.load = async () => investigation(runId, "OPEN", []);
    const node = await mountReport(runId);
    expect(words(node)).toEqual(["SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"].map((key) => CATALOG[`v4.trust.${key}`]));
    expect(flat(node.querySelector(".v4RepWords")?.parentElement ?? null)).toContain(CATALOG["v4.report.checkedWordsIntroFree"]);
    expect(flat(node)).not.toContain(CATALOG["v4.report.checkedWordsIntro"]);
  });

  it("on Free, before writing, the report will be public too, said right above the button; not when the check kept it private", async () => {
    const runId = crypto.randomUUID();
    harness.answer = freeAnswer(runId);
    reports.published = true;
    reports.load = async () => investigation(runId, "OPEN", []);
    const node = await mountReport(runId);
    expect(reports.visibilityReads).toEqual([runId]);
    const line = node.querySelector<HTMLElement>("[data-report-public]")!;
    expect(flat(line)).toBe(CATALOG["v4.report.publicToo"]);
    // Above Write my report, in the "isn't written yet" card, and never on paper.
    const card = line.closest(".v4RepCard")!;
    expect(flat(card)).toContain(CATALOG["v4.report.notWrittenYet"]);
    const write = card.querySelector<HTMLButtonElement>("button.v4RepWrite")!;
    expect(line.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.classList.contains("v4RepNoPrint")).toBe(true);
    await act(async () => root?.unmount());
    host?.remove();

    const kept = crypto.randomUUID();
    harness.answer = freeAnswer(kept);
    reports.published = false;
    reports.load = async () => investigation(kept, "OPEN", []);
    const private_ = await mountReport(kept);
    expect(private_.querySelector("[data-report-public]")).toBeNull();
    expect(private_.querySelector("button.v4RepWrite")).not.toBeNull();
  });

  it("is said again before \"Write it again\", and not once a report stands", async () => {
    const runId = crypto.randomUUID();
    harness.answer = freeAnswer(runId);
    reports.published = true;
    reports.load = async () => investigation(runId, "CLOSED", [failed(1)]);
    const node = await mountReport(runId);
    const again = [...node.querySelectorAll<HTMLButtonElement>("button.v4RepWrite")].find((button) => button.textContent === CATALOG["v4.investigation.writeAgain"]);
    expect(again).toBeDefined();
    expect(node.querySelector("[data-report-public]")).not.toBeNull();
    await act(async () => root?.unmount());
    host?.remove();

    const done = crypto.randomUUID();
    harness.answer = freeAnswer(done);
    reports.load = async () => investigation(done, "CLOSED", [finished(1)]);
    const standing = await mountReport(done);
    expect(standing.querySelector("[data-report-public]")).toBeNull();
  });
});
