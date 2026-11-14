// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Keyboard audit round 4 (2026-11-12), C1: the debate header's actions exist twice (inline, and in the "⋯" menu) and
 * CSS shows one copy. A dialog opened from a header action returns focus to its opener on close; when the header
 * refitted while the dialog was open, that opener is the copy now hidden, which a browser will not focus. Focus must
 * go to the copy that is shown. Mounted as kbd-r2-deb-page mounts the page.
 */
const RUN = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readDeployment: vi.fn(),
  readLedgerDigest: vi.fn(),
  readPublicationReview: vi.fn(),
  readRunVisibility: vi.fn(),
  takeRemovalNotice: vi.fn(),
  collapse: false
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const readClient = { readRun: mocks.readRun, readRunAnswer: mocks.readRunAnswer, readAnswer: mocks.readAnswer };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "44444444-4444-4444-8444-444444444444",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readDeployment: mocks.readDeployment,
      readLedgerDigest: mocks.readLedgerDigest,
      readPublicationReview: mocks.readPublicationReview,
      readRunVisibility: mocks.readRunVisibility,
      takeRemovalNotice: mocks.takeRemovalNotice
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});

// The header's fit is measured from layout jsdom does not do; the test decides it.
vi.mock("@/lib/debateHeaderOverflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/debateHeaderOverflow.js")>();
  return { ...actual, measureDebateHeaderCollapse: () => ({ collapse: mocks.collapse }) };
});

vi.mock("@/components/PublicationControl", () => ({ PublicationControl: () => null }));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const run = {
  run_ref: RUN,
  question_line: "Should cities make public transport free at the point of use?",
  state: "QUEUED" as const,
  terminal_reason: null,
  hold_until: null
};

let root: Root | null = null;

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

async function mount(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={RUN}
        initialDebate={debateDetailFromRunProjection(run)}
        initialAnswer={null}
        initialPending
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
  });
  await settle();
  return container;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
}

async function resize(collapse: boolean): Promise<void> {
  mocks.collapse = collapse;
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
}

async function escape(): Promise<void> {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
  await settle();
}

const inline = (page: HTMLElement) => page.querySelector<HTMLElement>(".debateUtilityActions")!;
const overflow = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>("details.debateUtilityOverflow")!;
const summary = (page: HTMLElement) => overflow(page).querySelector<HTMLElement>("summary")!;
const action = (scope: HTMLElement, label: string) => scope.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

/**
 * Chrome will not focus an element under `visibility: hidden` or `display: none` (`focus()` is a no-op); jsdom does
 * not paint and focuses it. globals.css hides the inline copy while `data-actions-collapsed="true"`, and the "⋯"
 * menu otherwise (`display: none`). This models that rule; `realFocus` is put back after each test.
 */
const realFocus = HTMLElement.prototype.focus;
function refuseFocusOnTheHiddenCopy(): void {
  HTMLElement.prototype.focus = function focus(this: HTMLElement, options?: FocusOptions) {
    const view = this.closest(".debateView");
    if (view !== null) {
      const collapsed = view.getAttribute("data-actions-collapsed") === "true";
      if (this.closest(collapsed ? ".debateUtilityActions" : ".debateUtilityOverflow") !== null) return;
    }
    realFocus.call(this, options);
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.collapse = false;
  mocks.readRun.mockReset().mockResolvedValue(run);
  mocks.readRunAnswer.mockReset();
  mocks.readAnswer.mockReset();
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readDeployment.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
  mocks.readPublicationReview.mockReset().mockResolvedValue({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null });
  mocks.takeRemovalNotice.mockReset().mockRejectedValue(new Error("offline"));
  mocks.streamEvents.mockReset().mockImplementation(async (_runRef: string, _emit: (event: RunEvent) => void) => {
    await new Promise<void>(() => {});
  });
});

afterEach(async () => {
  HTMLElement.prototype.focus = realFocus;
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("C1: a dialog opened from a header action returns focus to the copy of the header that is shown", () => {
  it.each([
    ["a browser that will not focus the hidden copy", true],
    ["a browser that focuses it anyway", false]
  ])("the header collapses while How it works is open: Escape lands on the ⋯ summary (%s)", async (_case, chrome) => {
    if (chrome) refuseFocusOnTheHiddenCopy();
    const page = await mount();
    const guide = action(inline(page), "How it works");
    guide.focus();
    await click(guide);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await resize(true);
    expect(page.querySelector(".debateView")!.getAttribute("data-actions-collapsed")).toBe("true");
    await escape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(summary(page));
    expect(overflow(page).open).toBe(false);
  });

  it.each([
    ["a browser that will not focus the hidden copy", true],
    ["a browser that focuses it anyway", false]
  ])("the header widens while it is open from the ⋯ menu: Escape lands on the same action inline (%s)", async (_case, chrome) => {
    if (chrome) refuseFocusOnTheHiddenCopy();
    const page = await mount();
    await resize(true);
    overflow(page).open = true;
    const guide = action(overflow(page), "How it works");
    guide.focus();
    await click(guide);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await resize(false);
    await escape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(action(inline(page), "How it works"));
    expect(overflow(page).open).toBe(false);
  });

  it("with no refit, focus goes back to the opener as before", async () => {
    refuseFocusOnTheHiddenCopy();
    const page = await mount();
    const guide = action(inline(page), "How it works");
    guide.focus();
    await click(guide);
    await escape();
    expect(document.activeElement).toBe(guide);
  });

  it("a dialog that put focus somewhere real on close keeps it there", async () => {
    refuseFocusOnTheHiddenCopy();
    const page = await mount();
    const guide = action(inline(page), "How it works");
    guide.focus();
    await click(guide);
    await resize(true);
    const elsewhere = page.querySelector<HTMLElement>(".debateScoringPill")!;
    // The guide's own close button, pressed after focus was moved elsewhere by a script, is out of scope; what is
    // pinned is that the page never takes focus from a control that holds it.
    await act(async () => {
      document.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
      realFocus.call(elsewhere);
    });
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });
});
