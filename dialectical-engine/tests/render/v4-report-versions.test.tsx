// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";
import type { ReopenResult, WriteReportResult } from "../../apps/ui/lib/v4/load.js";
import { CATALOG, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  reopen: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>
}));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await import("./v4-debate-harness.js")).loadMock(await original()),
  loadInvestigation: (runId: string) => reports.load(runId),
  writeReport: (runId: string) => reports.write(runId),
  reopenInvestigation: (runId: string) => reports.reopen(runId)
}));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * R22 W5-1 — THE FINAL REPORT OVER AN INVESTIGATION, on the report page and at the top of the map (owner Q-D11).
 *  - the versions newest first, "Version {n} · {date}" with "(current)" on the newest finished one (drafts, owner Q20);
 *  - a finished version under the approved section headings (W0-1 §2.6), with its sources; the approved F13 line when the
 *    dossier was shortened, the approved N14 line when no story could be written;
 *  - while the newest is being written: the writing line and, while digs are still running, the wait line (read again on
 *    the story poll's chained timer); a FAILED version's line with "Write my report" again; "Keep digging" once a finished
 *    version stands;
 *  - the map's answer is the current version's, the first debate's one click away.
 * Made-up texts only.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const DIG = "22222222-2222-4222-8222-222222222222";
const date = (iso: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso));

const STORY = {
  short_answer: "A made-up short answer over the whole investigation.",
  what_would_change: "A made-up line on what would change it.",
  how_it_went: [{ dig_run_id: DIG, paragraph: "The made-up dig found the costs were lower than first said." }],
  still_open: ["A made-up open question."]
};
const SOURCE = { site: "grid-costs.example", title: "A made-up report", quote: "A made-up quote from the page.", line: "Reader one says why it matters." };

function finished(version: number, written: string, extra: Partial<Record<string, unknown>> = {}): InvestigationReportVersion {
  return { report_version: version, closed_at: "2026-10-30T09:00:00.000Z", state: "READY", written_at: written,
    answer: { segments: [`The made-up answer of version ${version}.`, "What evidence would decide it."] }, story: STORY, sources: [SOURCE],
    shortened: false, ...extra } as InvestigationReportVersion;
}
const writing = (version: number, waiting: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-10-31T09:00:00.000Z", state: "WRITING", waiting_for_digs: waiting });
const failed = (version: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-10-31T09:00:00.000Z", state: "FAILED", written_at: "2026-10-31T09:20:00.000Z" });

function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[]): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY" || version.state === "READY_WITH_RESERVATION").at(-1)?.report_version ?? null;
  return InvestigationReportsSchema.parse({ investigation_id: "55555555-5555-4555-8555-555555555555", root_run_id: runId, state, digs: 1, versions, current });
}

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
async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
  await settle();
}
const buttonOf = (node: ParentNode, name: string) =>
  [...node.querySelectorAll("button")].find((button) => button.textContent?.trim() === name) ?? null;
const versionSection = (node: ParentNode) => node.querySelector<HTMLElement>(".v4RepInvestigation");

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  await unmountMap().catch(() => undefined);
  vi.useRealTimers();
});

describe("the report page's versions", () => {
  it("lists two versions newest first, marks the current one, and shows it with the F13 and N14 lines when it says so", async () => {
    const runId = crypto.randomUUID();
    const read = investigation(runId, "CLOSED", [
      finished(1, "2026-10-29T10:00:00.000Z"),
      finished(2, "2026-10-31T10:00:00.000Z", { story: null, shortened: true })
    ]);
    reports.load = vi.fn(async () => read);
    const node = versionSection(await mountReport(runId))!;
    expect(node.querySelector("h2")!.textContent).toBe("Report versions");
    expect([...node.querySelectorAll(".v4RepVersion")].map((button) => button.textContent)).toEqual([
      word("v4.investigation.versionCurrent", { n: 2, date: date("2026-10-31T10:00:00.000Z") }),
      word("v4.investigation.version", { n: 1, date: date("2026-10-29T10:00:00.000Z") })
    ]);
    expect(node.querySelector(".v4RepVersion")!.textContent).toBe(`Version 2 · ${date("2026-10-31T10:00:00.000Z")} (current)`);
    expect(node.querySelector(".v4RepVersion")!.getAttribute("aria-pressed")).toBe("true");
    // Version 2: shortened, and no story (the approved lines, word for word); its answer stands in.
    expect(node.textContent).toContain("The investigation was very large, so the report was written from a shortened version of it.");
    expect(node.textContent).toContain("We couldn't write a short answer this time. The parts below show everything the AIs found.");
    expect(node.textContent).toContain("The made-up answer of version 2.");
    expect(node.textContent).not.toContain("How the investigation went");
    // A finished version stands: "Keep digging" is offered, not "Write my report".
    expect(buttonOf(node, "Keep digging")).not.toBeNull();
    expect(buttonOf(node, "Write my report")).toBeNull();
  });

  it("shows an earlier version under the approved section headings, with its sources", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"),
      finished(2, "2026-10-31T10:00:00.000Z", { story: null, shortened: true })]));
    const node = versionSection(await mountReport(runId))!;
    await press(node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")[1]!);
    expect(node.querySelectorAll(".v4RepVersion")[1]!.getAttribute("aria-pressed")).toBe("true");
    const body = node.querySelector(".v4RepVersionBody")!;
    expect([...body.querySelectorAll("h3")].map((heading) => heading.textContent))
      .toEqual(["The answer", "What would change it", "How the investigation went", "What is still open", "Sources"]);
    expect(body.textContent).toContain(STORY.short_answer);
    expect(body.textContent).toContain(STORY.how_it_went[0]!.paragraph);
    expect(body.textContent).not.toContain("shortened version");
    expect(body.textContent).not.toContain("We couldn't write a short answer");
    const source = body.querySelector(".v4RepSource")!;
    expect(source.querySelector(".v4RepSourceSite")!.textContent).toBe(SOURCE.site);
    expect(source.querySelector(".v4RepSourceTitle")!.textContent).toBe(SOURCE.title);
    expect(source.querySelector(".v4RepSourceLine")!.textContent).toBe(SOURCE.line);
    expect(source.querySelector("blockquote")!.textContent).toBe(SOURCE.quote);
  });

  it("while the newest is being written: the writing line and the wait line, read again until it is written", async () => {
    const runId = crypto.randomUUID();
    const before = investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"), writing(2, 2)]);
    const after = investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"), finished(2, "2026-10-31T10:05:00.000Z")]);
    const load = vi.fn(async () => before);
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    expect(node.textContent).toContain("Your report is being written. This takes about 5 to 10 minutes.");
    expect(node.textContent).toContain("Your report starts when the 2 digs in progress finish.");
    expect(buttonOf(node, "Write my report")).toBeNull();
    expect(buttonOf(node, "Keep digging")).toBeNull();
    const reads = load.mock.calls.length;
    load.mockImplementation(async () => after);
    await settle(10_000);
    expect(load.mock.calls.length).toBe(reads + 1);
    expect(node.textContent).not.toContain("Your report is being written.");
    expect(node.querySelector(".v4RepVersion")!.textContent).toContain("(current)");
    expect(node.textContent).toContain(STORY.short_answer);
  });

  it("one dig still running: the singular wait line", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 1)]));
    const node = versionSection(await mountReport(runId))!;
    expect(node.textContent).toContain("Your report starts when the dig in progress finishes.");
    expect(node.querySelector(".v4RepVersion")!.textContent).toBe(`Version 1 · ${date("2026-10-31T09:00:00.000Z")}`);
  });

  it("a FAILED version says so and offers \"Write my report\" again, which posts and reads the versions again", async () => {
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => investigation(runId, "CLOSED", [failed(1)]));
    const write = vi.fn(async (): Promise<WriteReportResult> => ({ kind: "WRITING", reportVersion: 2, waitingForDigs: 0 }));
    reports.load = load;
    reports.write = write;
    const node = versionSection(await mountReport(runId))!;
    expect(node.textContent).toContain("This report could not be written. You can write it again.");
    load.mockImplementation(async () => investigation(runId, "CLOSED", [failed(1), writing(2, 0)]));
    await press(buttonOf(node, "Write my report")!);
    expect(write).toHaveBeenCalledWith(runId);
    expect(node.textContent).toContain("Your report is being written. This takes about 5 to 10 minutes.");
    expect(node.textContent).not.toContain("Your report starts when");
  });

  it("\"Keep digging\" reopens the investigation; then \"Write my report\" is offered again", async () => {
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const reopen = vi.fn(async (): Promise<ReopenResult> => ({ kind: "OPEN" }));
    reports.load = load;
    reports.reopen = reopen;
    const node = versionSection(await mountReport(runId))!;
    load.mockImplementation(async () => investigation(runId, "OPEN", [finished(1, "2026-10-29T10:00:00.000Z")]));
    await press(buttonOf(node, "Keep digging")!);
    expect(reopen).toHaveBeenCalledWith(runId);
    expect(buttonOf(node, "Write my report")).not.toBeNull();
    expect(buttonOf(node, "Keep digging")).toBeNull();
  });

  it("a debate in no investigation shows only \"Write my report\"; the debate's own report stays", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => InvestigationReportsSchema.parse({ investigation_id: null, root_run_id: runId, state: "OPEN", digs: 0, versions: [], current: null }));
    const node = await mountReport(runId);
    expect(versionSection(node)).toBeNull();
    expect(buttonOf(node, "Write my report")).not.toBeNull();
    expect(node.querySelector(".v4RepDoc")).not.toBeNull();
    expect(node.textContent).toContain(CATALOG["v4.report.answerHeading"]);
  });

  it("a read that fails leaves the investigation out quietly", async () => {
    reports.load = vi.fn(async () => null);
    const node = await mountReport(crypto.randomUUID());
    expect(versionSection(node)).toBeNull();
    expect(buttonOf(node, "Write my report")).toBeNull();
    expect(node.querySelector(".v4RepDoc")).not.toBeNull();
  });
});

describe("the map's answer (owner Q-D11)", () => {
  it("shows the current version's answer, labelled with its version, and the first debate's answer one click away", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "OPEN", [finished(1, "2026-10-29T10:00:00.000Z"), finished(2, "2026-10-31T10:00:00.000Z")]));
    await mountMap(1280, runId);
    const section = page().querySelector<HTMLElement>(".v4PanelReportAnswer")!;
    expect(section.querySelector("h3")!.textContent).toBe("From your report, version 2");
    expect(section.textContent).toContain("The made-up answer of version 2.");
    const first = section.querySelector<HTMLDetailsElement>("details.v4PanelFirstAnswer")!;
    expect(first.open).toBe(false);
    expect(first.querySelector("summary")!.textContent).toBe("See the first debate's answer");
    expect(first.textContent).toContain("Our answer: put most new money into renewables and storage");
  });

  it("before any finished version the map shows the first debate's answer as before", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 0)]));
    await mountMap(1280, runId);
    expect(page().querySelector(".v4PanelReportAnswer")).toBeNull();
    expect(page().textContent).toContain(CATALOG["v4.panel.answerRoot"]);
  });
});
