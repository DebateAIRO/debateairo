// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { V4Rail } from "../../apps/ui/components/v4/V4Rail.js";
import { V4ReportHeader } from "../../apps/ui/components/v4/V4ReportHeader.js";
import { V4Steps, type V4StepId, type V4StepsShape } from "../../apps/ui/components/v4/V4Steps.js";
import { CATALOG, digPart, harness, mountMap, page, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

/*
 * V4 screen review (owner's picks, 3 Nov 2026, OWNER-PICKS-2026-11-03.md):
 *   journey-f18  one rail on every page: "Your question · What we'll look into · The map · Your report"; on a phone, small
 *                dots in the pinned top, next to the breadcrumb.
 *   read-f25     the same small four-step marker on every screen, the current step marked; dig pages show all four steps.
 *   ask-f6       "classic view" at most once on a V4 page (with journey-f19: the header's account menu, unless the page's
 *                own screen already shows it).
 */
const seen = vi.hoisted(() => ({ headerLinks: [] as Array<string | null> }));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", () => ({
  V4Header: ({ children, classicHref = null }: { children?: ReactNode; classicHref?: string | null }) => {
    seen.headerLinks.push(classicHref);
    return <header className="v4StandInHeader">{children}</header>;
  }
}));
// The account button is the header's own (tests/render/v4-header-account.test.tsx); here only its place in the row counts.
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => <span className="v4HdrAccount" /> }));
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

const NAMES = ["Your question", "What we'll look into", "The map", "Your report"];

function drawn(element: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}
const steps = (shape: V4StepsShape, current: V4StepId, hrefs?: Partial<Record<V4StepId, string>>) =>
  drawn(<V4Steps current={current} shape={shape} {...(hrefs === undefined ? {} : { hrefs })} catalog={CATALOG} />);

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  seen.headerLinks.length = 0;
});
afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the one step marker (V4Steps)", () => {
  it("names the same four steps in every shape, the record's words", () => {
    expect(CATALOG["v4.rail.stepRead"]).toBe("What we'll look into");
    for (const shape of ["line", "dots"] as const) {
      expect([...steps(shape, "map").querySelectorAll(".v4StepsName")].map((name) => name.textContent), shape).toEqual(NAMES);
    }
    expect([...steps("list", "map").querySelectorAll(".v4DebRailStep")].map((step) => step.textContent)).toEqual(
      ["✓Your question", "✓What we'll look into", `3The map${CATALOG["v4.rail.youAreHere"]}`, "4Your report"]);
  });

  it("marks the step the person is on, ticks the ones behind, and links only the steps it is given", () => {
    const report = steps("line", "report", { map: "/v4/debate/run-1" });
    const here = report.querySelectorAll("[aria-current=step]");
    expect(here).toHaveLength(1);
    expect(here[0]!.textContent).toBe("Your report");
    expect([...report.querySelectorAll(".v4StepsStep")].map((step) => step.className.split(" ")[1])).toEqual(
      ["v4StepsDone", "v4StepsDone", "v4StepsDone", "v4StepsHere"]);
    const links = [...report.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["The map", "/v4/debate/run-1"]]);
    // A step given a link while the person is on it stays plain.
    expect(steps("line", "map", { map: "/v4/debate/run-1" }).querySelector("a")).toBeNull();
    const first = steps("line", "question");
    expect(first.querySelector("[aria-current=step]")!.textContent).toBe("Your question");
    expect([...first.querySelectorAll(".v4StepsAhead")]).toHaveLength(3);
  });

  it("the line and the dots carry their own name; nothing in them moves", () => {
    for (const shape of ["line", "dots"] as const) {
      const nav = steps(shape, "question").querySelector("nav")!;
      expect(nav.getAttribute("aria-label")).toBe(CATALOG["v4.rail.label"]);
      expect(nav.className).toBe(`v4Steps v4Steps-${shape}`);
      expect(nav.querySelectorAll(".v4StepsDot[aria-hidden=true]")).toHaveLength(4);
    }
  });
});

describe("read-f25: the map's rail shows all four steps, a dig's page too", () => {
  it("whether or not a caller still says the dig skipped the second step", () => {
    for (const showReadStep of [undefined, true, false]) {
      const rail = drawn(<V4Rail runId="run-1" level={null} {...(showReadStep === undefined ? {} : { showReadStep })} openLeft={1}
        digs={{ running: 0, done: 0, failed: 0 }} variant="column" catalog={CATALOG} locale="en" />);
      const names = [...rail.querySelectorAll(".v4DebRailStep")].map((step) => step.textContent);
      expect(names, String(showReadStep)).toHaveLength(4);
      expect(names[1]).toBe("✓What we'll look into");
      expect(rail.querySelector("[aria-current=step]")!.textContent).toContain("The map");
      expect(rail.querySelector("a.v4Link")!.getAttribute("href")).toBe("/v4/debate/run-1/report");
    }
  });

  it("on a dig's own page the wide rail lists the four steps, the map marked", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), 2) });
    await mountMap(1600, runId);
    const rail = page().querySelector(".v4DebRail-column")!;
    expect([...rail.querySelectorAll(".v4DebRailStep")]).toHaveLength(4);
    expect(rail.querySelector("[aria-current=step]")!.textContent).toContain("The map");
  });

  it("the laptop's marks strip keeps its four marks and its report link", async () => {
    await mountMap(1280);
    const marks = page().querySelector(".v4DebRail-marks")!;
    expect(marks.querySelectorAll(".v4DebRailStep")).toHaveLength(4);
    expect(marks.querySelector("a.v4DebRailMarkLink .v4SrOnly")!.textContent).toBe("Your report");
  });
});

describe("journey-f18: on a phone, the steps are small dots in the pinned top, next to the breadcrumb", () => {
  it("sits at the end of the breadcrumb's line, the map marked, the report a link", async () => {
    const runId = await mountMap(375);
    const head = page().querySelector(".v4WhereBar .v4WhereHead")!;
    expect(head.firstElementChild!.className).toBe("v4WhereLine");
    const dots = head.querySelector("nav.v4Steps-dots")!;
    expect(head.lastElementChild).toBe(dots);
    expect(dots.querySelector("[aria-current=step]")!.textContent).toBe("The map");
    expect(dots.querySelector("a")!.getAttribute("href")).toMatch(new RegExp(`^/v4/debate/${runId}/report(?:\\?|$)`, "u"));
  });
});

describe("the screens before the map (waiting, paused, failed)", () => {
  const run = (runId: string, state: RunProjection["state"]): RunProjection => ({
    run_ref: runId, question_line: "Should countries build new nuclear power?", state,
    terminal_reason: state === "FAILED" ? "RUNNER_FAILED" : null, hold_until: null
  } as RunProjection);
  const classicLinks = (): Element[] => [...page().querySelectorAll("a")].filter((link) => link.textContent === CATALOG["v4.common.classicView"]);

  it("while the question waits, the four steps show at the top with the map marked", async () => {
    const runId = crypto.randomUUID();
    harness.run = run(runId, "RUNNING");
    await mountMap(1600, runId);
    const marker = page().querySelector(".v4StepsTop nav.v4Steps-line")!;
    expect(marker.querySelector("[aria-current=step]")!.textContent).toBe("The map");
    expect(marker.querySelector("a")).toBeNull();
  });

  it("ask-f6 / the owner's 5 Nov answer 12 B: a debate that did not finish shows no classic link on its screen", async () => {
    const runId = crypto.randomUUID();
    harness.run = run(runId, "FAILED");
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebFailed")).not.toBeNull();
    expect([...page().querySelectorAll(".v4DebFailed a")].filter((link) => link.textContent === CATALOG["v4.common.classicView"])).toEqual([]);
    expect(page().querySelector(".v4StepsTop nav.v4Steps-line")).not.toBeNull();
  });

  it("the map's header carries it (into the account menu) once nothing else on the page does", async () => {
    const runId = await mountMap(1600);
    expect(seen.headerLinks.at(-1)).toBe(`/debate/${runId}`);
    expect(classicLinks()).toHaveLength(0);
  });
});

describe("the report's one header row (report-f12) with the account button and the steps", () => {
  it("ends in the account button, and the four steps sit under the row with Your report marked and the map a link", async () => {
    vi.useRealTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <V4ReportHeader catalog={CATALOG} backHref="/v4/debate/run-1?level=plain" level="plain" onLevel={() => undefined} share={[]} status={null} />
    ));
    try {
      const row = host.querySelector(".v4RepHdr")!;
      expect(row.lastElementChild!.className).toBe("v4HdrAccount");
      const marker = host.querySelector(".v4RepChrome .v4StepsTop nav.v4Steps-line")!;
      expect(row.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(marker.querySelector("[aria-current=step]")!.textContent).toBe("Your report");
      expect([...marker.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
        [["The map", "/v4/debate/run-1?level=plain"]]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("a report with no map to go back to links no step", () => {
    const header = drawn(<V4ReportHeader catalog={CATALOG} backHref={null} level="plain" onLevel={() => undefined} share={[]} status={null} />);
    expect(header.querySelector(".v4StepsTop a")).toBeNull();
    expect(header.querySelector(".v4StepsTop [aria-current=step]")!.textContent).toBe("Your report");
  });
});
