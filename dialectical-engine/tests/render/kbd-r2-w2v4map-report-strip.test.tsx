// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportStart, V4ReportStrip } from "../../apps/ui/components/v4/V4ReportStrip.js";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness.js";
import { CATALOG } from "./v4-debate-harness.js";

/*
 * Keyboard audit 2026-11-12, wave 2 (W2-V4MAP), V4C-11: the map's report strip closes by itself when the report is asked for
 * from elsewhere (another tab, the carry-on) while focus is on its Write it. The strip and its hook are the real ones, in the
 * top bar's place (after the bar's report button, as V4Header draws `after`); the site's focus guard runs
 * (tests/render/kbd-guard-harness.ts). On the map the change comes with a read of the report versions; here `canAsk` is set.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Bar({ canAsk }: Readonly<{ canAsk: boolean }>) {
  const opener = useRef<HTMLButtonElement | null>(null);
  const start = useReportStart({
    watch: { rootRunId: null, notePress: () => undefined, reread: async () => null },
    runId: "7b000000-0000-4000-8000-000000000001",
    canAsk,
    focusOpener: () => opener.current?.focus()
  });
  return (
    <header className="v4Hdr">
      <a className="v4HdrBrand" href="/v4">Dialectical Engine</a>
      <div className="v4HdrRight">
        <button ref={opener} type="button" className="v4DebReportLink" onClick={() => start.open("top")}>{CATALOG["v4.rail.writeReport"]}</button>
      </div>
      {start.at === null ? null : (
        <V4ReportStrip id="v4-report-strip-top" place="top" hasDigs={false} sharePercent={null} publicLine={false}
          rootRunId="7b000000-0000-4000-8000-000000000001" busy={start.busy} note={start.note} onWrite={start.write}
          onNotYet={start.notYet} catalog={CATALOG} />
      )}
    </header>
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;
let stopGuard: () => void = () => undefined;
const render = (canAsk: boolean): void => act(() => root?.render(<Bar canAsk={canAsk} />));

beforeEach(() => {
  vi.useFakeTimers();
  stopGuard = startFocusGuard();
  host = document.createElement("main");
  host.id = "main-content";
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  stopGuard();
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe("V4C-11: the report strip closes under focus when the report is asked for from elsewhere", () => {
  it("focus goes back to the bar's report button, not to the top of the header", async () => {
    render(true);
    pressByKeyboard(host!.querySelector<HTMLButtonElement>(".v4DebReportLink")!);
    const write = [...host!.querySelectorAll<HTMLButtonElement>("[data-report-strip] button")].find((button) => button.textContent === CATALOG["v4.reportStrip.write"])!;
    expect(document.activeElement).toBe(write);
    render(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
    });
    expect(host!.querySelector("[data-report-strip]")).toBeNull();
    expect(document.activeElement).toBe(host!.querySelector(".v4DebReportLink"));
  });

  it("focus elsewhere stays where it is", async () => {
    render(true);
    pressByKeyboard(host!.querySelector<HTMLButtonElement>(".v4DebReportLink")!);
    const brand = host!.querySelector<HTMLElement>(".v4HdrBrand")!;
    act(() => brand.focus());
    render(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
    });
    expect(host!.querySelector("[data-report-strip]")).toBeNull();
    expect(document.activeElement).toBe(brand);
  });
});
