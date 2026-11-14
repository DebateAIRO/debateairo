// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient";
import * as api from "../../apps/ui/lib/api";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter";
import home from "../../apps/ui/messages/en/home.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import time from "../../apps/ui/messages/en/time.json";

/**
 * Keyboard audit round 4 (2026-11-12), C7: a held debate (the check still running) shows a short page; when the check
 * clears it, the full page replaces it. The two share their header controls (account menu, language, theme); a person
 * on one of them must still be on it afterwards, not parked with the next Tab starting at the brand link.
 * Mounted as synthesis-hold-page mounts the held page.
 */
const { stream, takeNotice } = vi.hoisted(() => ({ stream: vi.fn(), takeNotice: vi.fn() }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original() as Record<string, unknown>;
  return { ...actual, contractClient: { ...(actual.contractClient as object), takeRemovalNotice: takeNotice, streamEvents: stream } };
});
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: home }) }));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); stream.mockReset(); takeNotice.mockReset(); document.body.innerHTML = ""; });

const held = debateDetailFromRunProjection({
  run_ref: "run-1", question_line: "Should the city change its plan?", state: "SETTLED",
  hold_until: null, waits_until: null, waits_for: null, synthesis_check: "CHECKING"
} as never);

describe("C7: releasing a held debate keeps focus on the header control that had it", () => {
  it.each([0, 1, -1])("header control #%i of the held page is still focused, and the same element, on the full page", async (which) => {
    vi.useFakeTimers();
    stream.mockImplementation((_id: string, _emit: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })));
    const finished = { ...held, status: "complete", synthesis_check: undefined };
    vi.spyOn(api, "getDebateBundle")
      .mockResolvedValueOnce({ kind: "loading", detail: held, run: { state: "SETTLED", synthesis_check: "CHECKING" }, questionLanguage: null } as never)
      .mockResolvedValue({ kind: "loading", detail: finished, run: { state: "SETTLED" }, questionLanguage: null } as never);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    expect(node.querySelector(".checkingNotice")).not.toBeNull();
    const controls = [...node.querySelectorAll<HTMLElement>(".debateTopControlRow :is(a[href], button, summary, select)")];
    expect(controls.length).toBeGreaterThan(1);
    const control = controls.at(which)!;
    act(() => control.focus());
    expect(document.activeElement).toBe(control);
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(node.querySelector(".checkingNotice")).toBeNull();
    expect(node.querySelector(".debateUtilityActions")).not.toBeNull();
    expect(control.isConnected).toBe(true);
    expect(document.activeElement).toBe(control);
    act(() => root.unmount());
    node.remove();
  });
});
