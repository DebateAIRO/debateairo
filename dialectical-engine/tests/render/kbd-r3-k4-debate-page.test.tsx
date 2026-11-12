// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import debateViewsEnglish from "../../apps/ui/messages/en/debateViews.json" with { type: "json" };

/**
 * Keyboard audit round 3 (2026-11-12), K4 / CSS-12: two round-1 fixes on the classic debate page (PR #204, items 4
 * and 14) that only a component test or one of the panel's two forms pinned. Mounted as kbd-r2-deb-page mounts it
 * (that file's mocks, copied).
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
  takeRemovalNotice: vi.fn()
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

vi.mock("@/lib/debateHeaderOverflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/debateHeaderOverflow.js")>();
  return { ...actual, measureDebateHeaderCollapse: () => ({ collapse: false }) };
});

vi.mock("@/components/PublicationControl", () => ({ PublicationControl: () => <div /> }));

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

async function openThread(page: HTMLElement): Promise<void> {
  const button = [...page.querySelectorAll<HTMLElement>('.segment[aria-label="View"] button')].find((b) => b.textContent === "Thread")!;
  await act(async () => button.click());
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

describe("PR #204 item 4: on the owner's debate page, every Thread row has its Challenge button", () => {
  it("each row, at every depth, offers one Tab-reachable Challenge named with its own claim, and a keyboard press opens the challenge", async () => {
    const page = await mountSettled();
    await openThread(page);
    const rows = [...page.querySelectorAll<HTMLElement>(".threadRow")];
    // The fixture's tree has a claim below the root's child too, so a row deeper than the first level is checked
    // (a row draws one lane per ancestor above its parent).
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.some((row) => row.querySelectorAll(".threadLane").length > 0)).toBe(true);
    for (const row of rows) {
      const challenges = row.querySelectorAll<HTMLButtonElement>("button.nodeCtrl.challenge");
      expect(challenges, "one Challenge per row").toHaveLength(1);
      const button = challenges[0]!;
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBe(0);
      expect(button.closest("[inert]")).toBeNull();
      const [own, claim] = button.getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id));
      expect(own).toBe(button);
      expect(own!.textContent).toContain(debateViewsEnglish["debateViews.challenge"]);
      // The second half of the name is this row's own claim, not the root's or a neighbour's.
      expect(row.contains(claim!)).toBe(true);
      expect(claim!.textContent?.trim()).not.toBe("");
    }

    const button = rows.at(-1)!.querySelector<HTMLButtonElement>("button.nodeCtrl.challenge")!;
    expect(document.querySelector(".popCard")).toBeNull();
    await act(async () => {
      button.focus();
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      button.click();
    });
    await settle();
    expect(document.querySelector(".popCard")).not.toBeNull();
  });
});

describe("PR #204 item 14: the clipped scoring-insights panel holds no invisible Tab stop", () => {
  // The page draws the compact form today: `getDebateScoring` (lib/api.ts) always answers "unavailable", so the
  // expandable `<details>` form cannot render until scoring is served (and that form carries `inert` in the source).
  it("the panel a settled debate draws is inert, so its contents are no Tab stops", async () => {
    const page = await mountSettled();
    const panels = [...page.querySelectorAll<HTMLElement>(".scoringInsightsPanel")];
    expect(panels).toHaveLength(1);
    expect(panels[0]!.hasAttribute("inert")).toBe(true);
  });
});
