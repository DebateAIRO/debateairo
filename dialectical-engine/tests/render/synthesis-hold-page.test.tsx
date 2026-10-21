// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient";
import DebatePage from "../../apps/ui/app/debate/[id]/page";
import * as api from "../../apps/ui/lib/api";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter";
import home from "../../apps/ui/messages/en/home.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import time from "../../apps/ui/messages/en/time.json";

const { takeNotice, serverRead } = vi.hoisted(() => ({ takeNotice: vi.fn(), serverRead: vi.fn() }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original() as Record<string, unknown>;
  return { ...actual, contractClient: { ...(actual.contractClient as object), takeRemovalNotice: takeNotice } };
});
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: home }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/navigation", async (original) => ({ ...(await original() as object),
  notFound: () => { throw new Error("NEXT_NOT_FOUND_TEST"); } }));
vi.mock("@/lib/serverApi", async (original) => ({ ...(await original() as object),
  readSessionCookie: () => "test-session", readTrustedClientIp: () => null,
  getDebateServer: serverRead, questionLanguageTagOf: () => null,
  createServerContractClient: () => ({ takeRemovalNotice: takeNotice }) }));
vi.mock("@/lib/i18n/server", () => ({ loadNamespace: async (_locale: string, namespace: string) =>
  namespace === "home" ? home : namespace === "public" ? publicCatalog : {} }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); takeNotice.mockReset(); serverRead.mockReset(); document.body.innerHTML = ""; });

const held = debateDetailFromRunProjection({
  run_ref: "run-1", question_line: "Should the city change its plan?", state: "SETTLED",
  hold_until: null, waits_until: null, waits_for: null, synthesis_check: "CHECKING"
} as never);

describe("S01 held debate page", () => {
  it("shows only the question and checking notice on the first held server render", () => {
    const html = renderToStaticMarkup(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />);
    expect(html).toContain("Should the city change its plan?");
    expect(html).toContain('class="checkingNotice"');
    expect(html).toContain("Checking the debate…");
    expect(html).not.toContain("Publication controls");
    expect(html).not.toContain("The full story");
  });

  it("does not open events while held and reads the run every five seconds", async () => {
    vi.useFakeTimers();
    const read = vi.spyOn(api, "getDebateBundle").mockResolvedValue({
      kind: "loading", detail: held, run: { state: "SETTLED", synthesis_check: "CHECKING" }, questionLanguage: null
    } as never);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    expect(node.querySelector(".checkingNotice")).not.toBeNull();
    expect(node.textContent).not.toContain("Recorded replay unavailable");
    const calls = read.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(read.mock.calls.length).toBeGreaterThan(calls);
    act(() => root.unmount());
    node.remove();
  });

  it("shows the finished view when the next run read clears the hold", async () => {
    vi.useFakeTimers();
    const finished = { ...held, status: "complete", synthesis_check: undefined };
    vi.spyOn(api, "getDebateBundle")
      .mockResolvedValueOnce({ kind: "loading", detail: held,
        run: { state: "SETTLED", synthesis_check: "CHECKING" }, questionLanguage: null } as never)
      .mockResolvedValueOnce({ kind: "loading", detail: finished,
        run: { state: "SETTLED" }, questionLanguage: null } as never);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    expect(node.querySelector(".checkingNotice")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(node.querySelector(".checkingNotice")).toBeNull();
    expect(node.textContent).toContain("Should the city change its plan?");
    act(() => root.unmount());
    node.remove();
  });

  it("takes a removal notice after NOT_FOUND and removes the question behind it", async () => {
    const missing = Object.assign(Object.create(ContractHttpError.prototype), {
      code: "NOT_FOUND", serverCode: "NOT_FOUND", status: 404
    });
    vi.spyOn(api, "getDebateBundle").mockRejectedValue(missing);
    takeNotice.mockResolvedValue({ notice: true });
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    expect(node.querySelector('[data-dialog="removal-notice"]')).not.toBeNull();
    expect(node.querySelector(".debateTopClaim")).toBeNull();
    expect(node.textContent).not.toContain("Should the city change its plan?");
    expect(takeNotice).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    node.remove();
  });

  it("keeps the removal notice until Close and stops held refreshes", async () => {
    vi.useFakeTimers();
    const missing = Object.assign(Object.create(ContractHttpError.prototype), {
      code: "NOT_FOUND", serverCode: "NOT_FOUND", status: 404
    });
    const read = vi.spyOn(api, "getDebateBundle").mockRejectedValue(missing);
    takeNotice.mockResolvedValueOnce({ notice: true }).mockResolvedValue({ notice: false });
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={held} initialPending
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    const reads = read.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(read).toHaveBeenCalledTimes(reads);
    expect(takeNotice).toHaveBeenCalledTimes(1);
    expect(node.querySelector('[data-dialog="removal-notice"]')).not.toBeNull();
    act(() => root.unmount());
    node.remove();
  });

  it("clears a previously visible tree when the next read enters the hold", async () => {
    const tree = held.tree!;
    const previous = { ...held, status: "complete", run_state: "SETTLED" as const,
      synthesis_check: undefined, tree: { ...tree, children: [{ ...tree, id: "draft", claim: "Sensitive draft", children: [] }] } };
    vi.spyOn(api, "getDebateBundle").mockResolvedValue({ kind: "loading", detail: held,
      run: { state: "SETTLED", synthesis_check: "CHECKING" }, questionLanguage: null } as never);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => { root.render(<DebatePageClient id="run-1" initialDebate={previous} initialPending={false}
      timeCatalog={time} publicCatalog={publicCatalog} homeCatalog={home}
      storyLocale="en" storyCatalog={publicCatalog} />); });
    expect(node.querySelector(".checkingNotice")).not.toBeNull();
    expect(node.textContent).not.toContain("Sensitive draft");
    act(() => root.unmount());
    node.remove();
  });

  it("serves the once-only notice at a removed debate address and otherwise returns 404", async () => {
    serverRead.mockResolvedValue({ ok: false, kind: "not_found" });
    takeNotice.mockResolvedValueOnce({ notice: true }).mockResolvedValueOnce({ notice: false });
    const shown = await DebatePage({ params: Promise.resolve({ id: "run-1" }) });
    expect(renderToStaticMarkup(shown)).toContain("We deleted this debate");
    await expect(DebatePage({ params: Promise.resolve({ id: "run-1" }) })).rejects.toThrow("NEXT_NOT_FOUND_TEST");
    expect(takeNotice).toHaveBeenCalledTimes(2);
  });
});
