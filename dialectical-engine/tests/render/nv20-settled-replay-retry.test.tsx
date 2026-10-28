// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Security fixes run 3 (NV-20): the settled debate page's one recorded-event replay shares the live stream's route,
 * and so its per-session and per-account stream cap. A 429 there means the cap is full, not that the debate is broken:
 * the page waits the server's Retry-After and reads again, at most 3 reads in all, and stops when it unmounts. Before
 * the fix the first 429 showed "Recorded event replay unavailable: RATE_LIMITED" and never retried. Every other
 * failure keeps its line. Harness copied from side-by-side-old-page-reread.test.tsx.
 */
const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readDeployment: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn()
}));

/**
 * The browser client of lib/api.ts, wrapped by the same copy of lib/v3/releaseWatch the page loads. Mocked with
 * vi.doMock per page (after vi.resetModules), because a vi.mock factory's module is kept across resetModules.
 */
const mockApi = async (importOriginal: <T>() => Promise<T>) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const { withNewerVersionWatch } = await import("../../apps/ui/lib/v3/releaseWatch.js");
  const readClient = withNewerVersionWatch({
    readRun: mocks.readRun, readRunAnswer: mocks.readRunAnswer, readAnswer: mocks.readAnswer
  });
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: withNewerVersionWatch({
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "44444444-4444-4444-8444-444444444444",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readDeployment: mocks.readDeployment,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    }),
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
};

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Contract = typeof import("@debateai/contract");

const answer = buildFairShapedAnswer();
const REPLAY_UNAVAILABLE = "Recorded event replay unavailable";

let root: Root | null = null;

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

/** A real-timer wait the page's retry can run inside. */
async function wait(ms: number): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  await settle();
}

/**
 * A fresh settled page. `arrange` runs after vi.resetModules, so every error it builds comes from the copy of the
 * contract that the freshly loaded lib/v3/liveEvents checks with instanceof.
 */
async function openSettledPage(arrange: (contract: Contract) => void): Promise<HTMLElement> {
  vi.resetModules();
  vi.doMock("@/lib/api", mockApi);
  const contract = await import("@debateai/contract");
  const { default: DebatePageClient } = await import("../../apps/ui/app/debate/[id]/DebatePageClient.js");
  arrange(contract);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={answer.run_ref}
        initialDebate={debateDetailFromAnswer(answer)}
        initialAnswer={answer}
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
  });
  await settle();
  return container;
}

/** Opens the honesty drawer, where the replay's failure line is shown. */
async function openHonesty(container: HTMLElement): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${chromeEnglish["chrome.honesty"]}"]`);
  expect(button).not.toBeNull();
  await act(async () => { button!.click(); });
  await settle();
}

describe("NV-20: the settled page's recorded-event replay retries a full stream cap", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.readRun.mockReset().mockResolvedValue({
      run_ref: answer.run_ref, question_line: answer.question_line, state: "SETTLED", terminal_reason: null,
      hold_until: null
    });
    mocks.readRunAnswer.mockReset().mockResolvedValue(answer);
    mocks.readAnswer.mockReset();
    mocks.readEvents.mockReset().mockResolvedValue([]);
    mocks.readDeployment.mockReset().mockRejectedValue(new Error("not needed by this render test"));
    mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
    mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
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

  it("a 429 waits the server's Retry-After and reads again; the replay then succeeds with no failure line", async () => {
    const page = await openSettledPage((contract) => {
      mocks.readEvents.mockReset()
        .mockRejectedValueOnce(new contract.ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 50))
        .mockResolvedValueOnce([]);
    });
    await wait(150);
    expect(mocks.readEvents).toHaveBeenCalledTimes(2);
    await openHonesty(page);
    expect(page.textContent).not.toContain(REPLAY_UNAVAILABLE);
  });

  it("a third 429 shows the existing replay line", async () => {
    const page = await openSettledPage((contract) => {
      const refused = () => new contract.ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 50);
      mocks.readEvents.mockReset()
        .mockRejectedValueOnce(refused())
        .mockRejectedValueOnce(refused())
        .mockRejectedValueOnce(refused());
    });
    await wait(300);
    expect(mocks.readEvents).toHaveBeenCalledTimes(3);
    await openHonesty(page);
    expect(page.textContent).toContain(`${REPLAY_UNAVAILABLE}: RATE_LIMITED`);
  });

  it("any other failure is read once and shows its line, as before", async () => {
    const page = await openSettledPage((contract) => {
      mocks.readEvents.mockReset().mockRejectedValueOnce(new contract.ContractHttpError("SERVER_FAILURE", 503, "x"));
    });
    await wait(150);
    expect(mocks.readEvents).toHaveBeenCalledTimes(1);
    await openHonesty(page);
    expect(page.textContent).toContain(`${REPLAY_UNAVAILABLE}: SERVER_FAILURE`);
  });

  it("leaving the page during the wait stops the retry", async () => {
    await openSettledPage((contract) => {
      mocks.readEvents.mockReset()
        .mockRejectedValueOnce(new contract.ContractHttpError("RATE_LIMITED", 429, "x", null, null, null, 1_000))
        .mockResolvedValueOnce([]);
    });
    expect(mocks.readEvents).toHaveBeenCalledTimes(1);
    await act(async () => root!.unmount());
    root = null;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_300)); });
    expect(mocks.readEvents).toHaveBeenCalledTimes(1);
  });
});
