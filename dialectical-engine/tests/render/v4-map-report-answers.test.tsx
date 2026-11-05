// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapReport, type MapReportInput } from "../../apps/ui/components/v4/useMapReport.js";
import { V4BottomStack, type V4BarJob } from "../../apps/ui/components/v4/V4BottomStack.js";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reads = vi.hoisted(() => ({ load: (async () => null) as (runId: string) => Promise<unknown> }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a>
}));
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadInvestigation: (runId: string) => reads.load(runId),
  writeReport: async () => ({ kind: "FAILED" })
}));
vi.mock("@/lib/v4/reportWriting", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadRunPublished: async () => false
}));

/*
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md, "Your answers"), the map's report through
 * components/v4/useMapReport.tsx and the phone's bottom stack, with the two new inputs the map page passes:
 *  - question 23 A: the report's wait line names the dig when ONE waits (report-f7's words, the dig's words marked as AI
 *    text), and says "Your report starts when the digs in progress finish." with no number when several wait;
 *  - question 18 A and its follow-up: on a phone the top bar drops its report button whenever the bottom bar shows "Write my
 *    report" (one on screen); a computer always keeps it. The bottom stack says when it shows it.
 * Made-up texts only.
 */
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RUN = "6a000000-0000-4000-8000-000000000001";
const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();

function investigation(state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 1): InvestigationReports {
  return InvestigationReportsSchema.parse({
    investigation_id: "6a000000-0000-4000-8000-0000000000aa", root_run_id: RUN, state, digs, versions,
    current: versions.filter((version) => version.state === "READY").at(-1)?.report_version ?? null
  });
}
const waiting = (digs: number): InvestigationReportVersion =>
  ({ report_version: 1, closed_at: "2026-11-05T10:00:00.000Z", state: "WRITING", waiting_for_digs: digs });

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function Probe(props: Readonly<{ input: Partial<MapReportInput> }>) {
  const barJobRef = useRef<HTMLElement | null>(null);
  const report = useMapReport({
    runId: RUN, servedRunId: RUN, isDig: false, answer: null, free: false, sharesShown: true, digsKey: "", level: null,
    onReady: () => undefined, barJobRef, catalog: CATALOG, locale: "en", ...props.input
  });
  return (
    <>
      <header className="probeHeader">{report.headerItem(false)}</header>
      {report.waitCard}
    </>
  );
}

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(host);
  await act(async () => { root!.render(node); });
  for (let round = 0; round < 4; round += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  return host;
}
const header = (): HTMLElement => host!.querySelector<HTMLElement>(".probeHeader")!;
const waitLine = (): HTMLElement | null => host!.querySelector<HTMLElement>("[data-report-wait] .v4DebReportWaitLine");

beforeEach(() => {
  vi.useFakeTimers();
  reads.load = async () => null;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

describe("question 23 A: the report's wait line on the map", () => {
  it("names the one dig it waits for, in report-f7's words, with the dig's words marked as AI text", async () => {
    reads.load = async () => investigation("CLOSED", [waiting(1)]);
    await mount(<Probe input={{ waitingDigQuestion: "Mostly renewables" }} />);
    expect(flat(waitLine())).toBe("Your report starts when your dig on “Mostly renewables” finishes.");
    const dig = waitLine()!.querySelector<HTMLElement>("[data-ai-generated]")!;
    expect(dig.textContent).toBe("Mostly renewables");
    expect(dig.getAttribute("dir")).toBe("auto");
  });

  it("several digs: the same line as the report page, with no number", async () => {
    reads.load = async () => investigation("CLOSED", [waiting(2)], 2);
    await mount(<Probe input={{ waitingDigQuestion: "Mostly renewables" }} />);
    expect(flat(waitLine())).toBe("Your report starts when the digs in progress finish.");
    expect(flat(waitLine())).not.toMatch(/\d/u);
  });

  it("without the dig's question (absent or null), and on a dig's own map, the line names no dig", async () => {
    reads.load = async () => investigation("CLOSED", [waiting(1)]);
    await mount(<Probe input={{}} />);
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
    await mount(<Probe input={{ waitingDigQuestion: null }} />);
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
    // A dig's own map reads the first question's investigation, whose digs it does not all know: it never names one.
    await mount(<Probe input={{ waitingDigQuestion: "Mostly renewables", isDig: true }} />);
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
    expect(waitLine()!.querySelector("[data-ai-generated]")).toBeNull();
  });
});

describe("question 18 A: one \"Write my report\" on a phone's screen", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-debate.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");

  it("while the bottom shows it, the header's report button is marked to step aside on a phone; absent or false, it is not", async () => {
    await mount(<Probe input={{}} />);
    const today = header().querySelector(".v4DebReportLink")!;
    expect(today.classList.contains("v4DebReportAtBottom")).toBe(false);
    await mount(<Probe input={{ bottomShowsReport: false }} />);
    expect(header().querySelector(".v4DebReportLink")!.classList.contains("v4DebReportAtBottom")).toBe(false);
    await mount(<Probe input={{ bottomShowsReport: true }} />);
    const link = header().querySelector(".v4DebReportLink")!;
    expect(link.classList.contains("v4DebReportAtBottom")).toBe(true);
    // Still in the page (a computer keeps it, and the money rule's link is there): only a phone's width hides it.
    expect(flat(link)).toBe(CATALOG["v4.rail.writeReport"]);
  });

  it("the CSS hides it below 768 px only; a computer always keeps it", () => {
    const phone = [...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/gu)].map((block) => block[1]!).join("\n");
    expect(phone).toMatch(/\.v4DebReportAtBottom[^{]*\{[^}]*display: none;[^}]*\}/u);
    const outside = css.replace(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/gu, "");
    expect(outside).not.toMatch(/v4DebReportAtBottom/u);
  });

  it("the bottom stack says whether it shows \"Write my report\": the bar's own button, the slim line, or the strip grown from the bar", async () => {
    const shown: boolean[] = [];
    const stack = (job: V4BarJob, extra: Partial<Parameters<typeof V4BottomStack>[0]> = {}) => (
      <V4BottomStack phone notes={null} tray={null} goodTime={false} reportHref="/v4/debate/r/report" job={job}
        onReportShown={(value) => shown.push(value)} catalog={CATALOG} {...extra} />
    );
    await mount(stack({ kind: "report", href: "/v4/debate/r/report" }));
    expect(shown.at(-1)).toBe(true);
    await mount(stack({ kind: "none" }));
    expect(shown.at(-1)).toBe(false);
    // dig-f17's slim line carries it, until the person closes it with ×.
    await mount(stack({ kind: "none" }, { goodTime: true }));
    expect(shown.at(-1)).toBe(true);
    await act(async () => host!.querySelector<HTMLButtonElement>(".v4StackGoodClose")!.click());
    expect(shown.at(-1)).toBe(false);
    // report-d1: the strip grown up from the bar (the report's write step is at the bottom).
    await mount(stack({ kind: "none" }, { strip: <div data-report-strip="bottom" /> }));
    expect(shown.at(-1)).toBe(true);
    // A computer has no pinned bar: it never shows it at the bottom.
    await mount(stack({ kind: "report", href: "/v4/debate/r/report" }, { phone: false }));
    expect(shown.at(-1)).toBe(false);
  });
});
