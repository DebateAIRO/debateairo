// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DebatesBuffer, PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer";
import { SynthesisHoldRefresher } from "../../apps/ui/components/SynthesisHoldRefresher";
import DebatePage from "../../apps/ui/app/debate/[id]/page";
import { debateDetailFromRunProjection, debateSummariesFromIndex } from "../../apps/ui/lib/v3/adapter";
import home from "../../apps/ui/messages/en/home.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import time from "../../apps/ui/messages/en/time.json";
import type { DebateSummary } from "../../apps/ui/lib/types";

const { refresh, serverRead } = vi.hoisted(() => ({ refresh: vi.fn(), serverRead: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: home }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/serverApi", async (original) => ({ ...(await original() as object),
  readSessionCookie: () => "test-session", readTrustedClientIp: () => null,
  getDebateServer: serverRead, questionLanguageTagOf: () => null }));
vi.mock("@/lib/i18n/server", () => ({ loadNamespace: async (_locale: string, namespace: string) =>
  namespace === "home" ? home : namespace === "public" ? publicCatalog : namespace === "time" ? time : {} }));
afterEach(() => { vi.useRealTimers(); refresh.mockClear(); serverRead.mockReset(); });

const row: DebateSummary = {
  id: "run-1",
  topic: "Should the city change its plan?",
  status: "complete",
  created_at: "2026-10-20T12:00:00.000Z",
  completed_at: "2026-10-20T12:10:00.000Z",
  models: []
};

function ownerMarkup(debate: DebateSummary): string {
  return renderToStaticMarkup(
    <DebatesBuffer debates={[debate]} catalog={home} timeCatalog={time} locale="en" checkingLabel="Checking the debate…" />
  );
}

describe("S01 owner library card", () => {
  it("marks a flagged row inside the card above the claim without a category", () => {
    const html = ownerMarkup({ ...row, synthesis_flag: { verdict: "FLAGGED" } });
    expect(html).toContain('data-flagged="true"');
    expect(html).toContain('class="libFlagMark"');
    expect(html).toMatch(/class="libFlagLabel">FLAGGED<\/span><\/div><div class="libRowClaim">/);
    expect(html).not.toContain("SUICIDE_OR_HARM_TO_OTHERS");
  });

  it("keeps the exact unflagged markup for CLEAR, null and absent fields", () => {
    const original = ownerMarkup(row);
    expect(original).not.toContain('data-flagged="true"');
    expect(original).not.toContain('class="libFlagMark"');
    expect(original).not.toContain('>FLAGGED<');
    expect(ownerMarkup({ ...row, synthesis_flag: { verdict: "CLEAR" } as never })).toBe(original);
    expect(ownerMarkup({ ...row, synthesis_flag: null })).toBe(original);
  });

  it("shows the still checking state instead of the result", () => {
    const summaries = debateSummariesFromIndex({ items: [{ answer_id: "answer-1", run_ref: "run-1",
      question_line: row.topic, created_at_sequence: 1, synthesis_flag: { verdict: "FLAGGED" },
      synthesis_check: "CHECKING", models: [] }], open_runs: [], limit: 10, offset: 0, total: 1 } as never);
    const html = ownerMarkup(summaries[0]);
    expect(html).toContain("Checking the debate…");
    expect(html).toContain('href="/debate/run-1"');
    expect(html).toContain('data-state="generating"');
    expect(html).not.toContain('data-flagged="true"');
    expect(html).not.toContain('class="libFlagMark"');
  });

  it("refreshes every five seconds while held and clears the timer when inactive", () => {
    vi.useFakeTimers();
    const node = document.createElement("div");
    const root = createRoot(node);
    act(() => root.render(<SynthesisHoldRefresher active />));
    act(() => vi.advanceTimersByTime(10_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => root.render(<SynthesisHoldRefresher active={false} />));
    act(() => vi.advanceTimersByTime(10_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it("never marks public rows with the owner flag", () => {
    const html = renderToStaticMarkup(<PublicDebatesBuffer
      debates={[{ public_ref: "ref-1", question: "A question", author_pseudonym: "A", published_at: "2026-10-20T12:00:00.000Z", models: [], verdict: "SUPPORTED", synthesis_flag: { verdict: "FLAGGED" } } as never]}
      catalog={home} timeCatalog={time} locale="en" />);
    expect(html).not.toContain("data-flagged");
    expect(html).not.toContain("libFlagMark");
  });

  it("uses dispute and font tokens for the flag rules before the consent fence", () => {
    const css = readFileSync(`${process.cwd()}/apps/ui/app/globals.css`, "utf8");
    const start = css.indexOf('.libRow[data-flagged="true"] .libRowCore');
    const end = css.indexOf(".removalNoticeReasons", start);
    const rules = css.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(rules).toContain("border-color: var(--dispute)");
    expect(rules).toContain("box-shadow: 0 0 0 1px var(--dispute)");
    expect(rules).toContain("font-family: var(--font-mono)");
    expect(rules).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(/i);
    expect(start).toBeLessThan(css.indexOf("/* === consent-ui S01 === */"));
  });

  it("keeps the real owner debate page free of the library flag before Publish", async () => {
    const detail = debateDetailFromRunProjection({ run_ref: "run-1", question_line: row.topic,
      state: "SETTLED", hold_until: null, waits_until: null, waits_for: null } as never);
    serverRead.mockResolvedValue({ ok: true,
      debate: { ...detail, status: "complete", synthesis_flag: { verdict: "FLAGGED" } },
      answer: null, floor: null, mapView: null });
    const html = renderToStaticMarkup(await DebatePage({ params: Promise.resolve({ id: "run-1" }) }));
    expect(html).not.toContain("data-flagged");
    expect(html).not.toContain("libFlagMark");
    expect(html).not.toContain(">FLAGGED<");
  });
});
