// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Keyboard audit round 4 (2026-11-12), C2: at 640px and below the Tree / Map / Split / Thread switch is drawn on its
 * own row under the header's other controls (globals.css: `.debateTopBar .segment { order: 10 }`), so Tab must reach
 * it after them, not between the scoring pill and the account menu. On a computer it keeps its place in the row.
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
  collapse: false,
  phone: false
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

type Listener = (event: { matches: boolean }) => void;
const listeners = new Set<Listener>();
function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query === "(max-width: 640px)" ? mocks.phone : false; },
    media: query,
    addEventListener: (_type: string, listener: Listener) => { if (query === "(max-width: 640px)") listeners.add(listener); },
    removeEventListener: (_type: string, listener: Listener) => { listeners.delete(listener); },
    addListener: () => undefined,
    removeListener: () => undefined
  }));
}
async function setPhone(phone: boolean): Promise<void> {
  await act(async () => {
    mocks.phone = phone;
    for (const listener of [...listeners]) listener({ matches: phone });
  });
  await settle();
}

const viewSwitch = (page: HTMLElement) => page.querySelector<HTMLElement>('.debateTopBar .segment[aria-label="View"]')!;
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listeners.clear();
  stubMatchMedia();
  mocks.collapse = false;
  mocks.phone = false;
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

describe("C2: Tab reaches the view switch where it is drawn", () => {
  it("on a computer the switch sits between the scoring pill and the account menu, as drawn", async () => {
    const page = await mount();
    const pill = page.querySelector(".debateScoringPill")!;
    expect(before(pill, viewSwitch(page))).toBe(true);
    expect(before(viewSwitch(page), summary(page))).toBe(true);
    expect(before(viewSwitch(page), inline(page))).toBe(true);
  });

  it("on a phone it comes after every control of the row above it, the ⋯ menu included", async () => {
    mocks.phone = true;
    const page = await mount();
    const row = page.querySelector(".debateTopControlRow")!;
    const stops = [...row.querySelectorAll<HTMLElement>("a[href], button, summary, select, [tabindex]")]
      .filter((element) => element.closest(".debateUtilityActions, .debateOverflowMenu") === null);
    const firstSwitchButton = viewSwitch(page).querySelector("button")!;
    expect(stops.at(-viewSwitch(page).querySelectorAll("button").length)).toBe(firstSwitchButton);
    expect(before(summary(page), viewSwitch(page))).toBe(true);
  });

  it.each([[false, true], [true, false]])("crossing the phone width (phone %s -> %s) keeps focus on the same view button", async (from, to) => {
    mocks.phone = from;
    const page = await mount();
    const tree = [...viewSwitch(page).querySelectorAll<HTMLElement>("button")].find((button) => button.textContent === "Tree")!;
    act(() => tree.focus());
    await setPhone(to);
    expect(before(summary(page), viewSwitch(page))).toBe(to);
    expect(document.activeElement?.textContent).toBe("Tree");
    expect(viewSwitch(page).contains(document.activeElement)).toBe(true);
  });

  it("the stylesheet still draws the switch on its own row at 640px and below (so the first paint matches)", () => {
    const css = readFileSync(`${process.cwd()}/apps/ui/app/globals.css`, "utf8");
    expect(css).toMatch(/\.debateTopBar \.segment \{\s*order: 10;\s*flex: 1 1 100%;/);
  });
});
