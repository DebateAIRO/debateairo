// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Keyboard audit round 2 (2026-11-12), the debate page itself: the header's two copies of its
 * actions, the "⋯" menu, the whole-page swaps (deleted, fatal error) and a challenge chosen in a
 * drawer whose opener has gone. Mounted as side-by-side-debate-page-run-ref mounts it.
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

// The publication card's own flows are kbd-publication-control's; here it only reports a finished
// deletion or a removal by the check, the two ways it swaps the page.
vi.mock("@/components/PublicationControl", () => ({
  PublicationControl: ({ onPrivateDeletion, onRemovedByCheck }: { onPrivateDeletion: (status: "CLEANED" | "PENDING") => void; onRemovedByCheck: () => void }) => (
    <div>
      <button type="button" data-stub-delete onClick={() => onPrivateDeletion("CLEANED")}>Delete</button>
      <button type="button" data-stub-pending onClick={() => onPrivateDeletion("PENDING")}>Delete later</button>
      <button type="button" data-stub-removed onClick={onRemovedByCheck}>Removed</button>
    </div>
  )
}));

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

async function mountSettled(): Promise<HTMLElement> {
  mocks.readRun.mockResolvedValue({ ...run, state: "SETTLED" as const });
  mocks.readRunAnswer.mockResolvedValue({ ...buildFairShapedAnswer(), run_ref: RUN });
  return mount();
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

function key(target: Element, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

const inline = (page: HTMLElement) => page.querySelector<HTMLElement>(".debateUtilityActions")!;
const overflow = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>("details.debateUtilityOverflow")!;
const summary = (page: HTMLElement) => overflow(page).querySelector<HTMLElement>("summary")!;
const action = (scope: HTMLElement, label: string) => scope.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

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
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("DEB1-1: the header moves focus to the copy of its actions that is shown", () => {
  it("collapsing moves focus from an inline action to the ⋯ summary", async () => {
    const page = await mount();
    const replay = action(inline(page), "Replay");
    replay.focus();
    await resize(true);
    expect(page.querySelector(".debateView")!.getAttribute("data-actions-collapsed")).toBe("true");
    expect(document.activeElement).toBe(summary(page));
  });

  it("collapsing with the menu open moves focus to the same action inside it", async () => {
    const page = await mount();
    overflow(page).open = true;
    action(inline(page), "How it works").focus();
    await resize(true);
    expect(document.activeElement).toBe(action(overflow(page), "How it works"));
  });

  it("expanding moves focus from the menu to the same inline action, and closes the menu", async () => {
    const page = await mount();
    await resize(true);
    overflow(page).open = true;
    action(overflow(page), "Replay").focus();
    await resize(false);
    expect(document.activeElement).toBe(action(inline(page), "Replay"));
    expect(overflow(page).open).toBe(false);
  });

  it("expanding with focus on the summary lands on the first inline action", async () => {
    const page = await mount();
    await resize(true);
    summary(page).focus();
    await resize(false);
    expect(document.activeElement).toBe(inline(page).querySelector("a, button"));
  });

  it("leaves focus that is elsewhere alone", async () => {
    const page = await mount();
    const view = page.querySelector<HTMLElement>('.segment[aria-label="View"] button')!;
    view.focus();
    await resize(true);
    expect(document.activeElement).toBe(view);
  });
});

describe("DEB1-2: the ⋯ menu answers Escape, closes when focus leaves it and when an item is used", () => {
  it("Escape closes it and puts focus on its summary", async () => {
    const page = await mount();
    await resize(true);
    overflow(page).open = true;
    const item = action(overflow(page), "Replay");
    item.focus();
    key(item, { key: "Escape" });
    expect(overflow(page).open).toBe(false);
    expect(document.activeElement).toBe(summary(page));
  });

  it("closes when Tab takes focus out of it, and stays open while focus moves inside it", async () => {
    const page = await mount();
    await resize(true);
    overflow(page).open = true;
    const first = action(overflow(page), "Replay");
    first.focus();
    act(() => action(overflow(page), "How it works").focus());
    expect(overflow(page).open).toBe(true);
    const outside = page.querySelector<HTMLElement>('.segment[aria-label="View"] button')!;
    act(() => outside.focus());
    expect(overflow(page).open).toBe(false);
  });

  it("closes when an item is used, and the dialog it opens returns focus to the summary", async () => {
    const page = await mount();
    await resize(true);
    overflow(page).open = true;
    const guide = action(overflow(page), "How it works");
    guide.focus();
    await click(guide);
    expect(overflow(page).open).toBe(false);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    key(document.activeElement ?? document.body, { key: "Escape" });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(summary(page));
  });
});

describe("DEB1-4 / DEB2-4: deleting a private debate lands on the deleted screen's heading", () => {
  it.each([
    ["CLEANED", "[data-stub-delete]", "Private debate deleted"],
    ["PENDING", "[data-stub-pending]", null]
  ] as const)("%s", async (_status, trigger, heading) => {
    const page = await mount();
    const button = page.querySelector<HTMLElement>(trigger)!;
    button.focus();
    await click(button);
    const h1 = page.querySelector<HTMLElement>("h1")!;
    if (heading !== null) expect(h1.textContent).toBe(heading);
    expect(page.querySelector("[data-stub-delete]")).toBeNull();
    expect(document.activeElement).toBe(h1);
  });
});

describe("DEB1-5: a whole-page swap puts lost focus on the new screen's message", () => {
  it("the fatal error screen takes focus that fell to the body", async () => {
    const page = await mount();
    const button = page.querySelector<HTMLElement>("[data-stub-removed]")!;
    button.focus();
    await click(button);
    const alert = page.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert).not.toBeNull();
    expect(document.activeElement).toBe(alert);
  });

  it("never takes focus that is somewhere real", async () => {
    const page = await mount();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    await click(page.querySelector<HTMLElement>("[data-stub-removed]")!);
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("DEB2-11: a challenge chosen in a drawer whose opener has gone returns focus to the argument", () => {
  it("Escape on the investigation lands on the argument's control in the view now shown", async () => {
    const page = await mountSettled();
    await click([...page.querySelectorAll<HTMLElement>('.segment[aria-label="View"] button')].find((b) => b.textContent === "Thread")!);
    const details = page.querySelector<HTMLElement>('[id^="thread-details-"]')!;
    expect(details).not.toBeNull();
    const nodeId = details.id.slice("thread-details-".length);
    details.focus();
    await click(details);
    const drawer = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Argument detail"]')!;
    expect(drawer).not.toBeNull();
    // "Open target" switches the view under the open drawer; the Thread opener leaves the page.
    await click([...page.querySelectorAll<HTMLElement>('.segment[aria-label="View"] button')].find((b) => b.textContent === "Tree")!);
    expect(page.querySelector(`[id="thread-details-${nodeId}"]`)).toBeNull();
    const challenge = [...drawer.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes("Challenge"))!;
    challenge.focus();
    await click(challenge);
    const popover = document.querySelector<HTMLElement>(".popCard")!;
    expect(popover).not.toBeNull();
    const choice = popover.querySelector<HTMLElement>(".popAction")!;
    choice.focus();
    await click(choice);
    const investigation = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Investigation"]');
    expect(investigation).not.toBeNull();
    key(document.activeElement ?? document.body, { key: "Escape" });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(document.getElementById(`canvas-details-${nodeId}`));
  });
});
