// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Side-by-side uploads spec 2026-10-21 §7 (final fix wave W1) — AN OLD OPEN PAGE LETS THE RELOAD NOTE SPEAK. When the
 * page's own re-read, or its recorded-event replay, is refused with an answer this build cannot read (INVALID_RESPONSE)
 * or one a newer release made (MADE_BY_NEWER_RELEASE), the page shows only the reload note: no "Loading this debate did
 * not complete" banner and no "Recorded event replay unavailable: INVALID_RESPONSE" line with a raw code in it. Every
 * other refusal keeps its banner. A page still waiting for its debate whose live stream meets such an answer hides its
 * stream line (W3): the stream is offline for good, and the note speaks. The browser client is wrapped by
 * withNewerVersionWatch, as lib/api.ts wraps it.
 */
const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readDeployment: vi.fn(),
  readLedgerDigest: vi.fn(),
  readPublicationReview: vi.fn(),
  readRunVisibility: vi.fn()
}));

/**
 * The browser client of lib/api.ts, wrapped by the same copy of lib/v3/releaseWatch the page and the note load. Mocked
 * with vi.doMock per page (after vi.resetModules), because a vi.mock factory's module is kept across resetModules and
 * would hold the first page's copy of the watch.
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
      readPublicationReview: mocks.readPublicationReview,
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
const DEBATE_READ_BANNER = debateChromeEnglish["requestFailure.subject.DEBATE_READ"];
const REPLAY_UNAVAILABLE = "Recorded event replay unavailable";
const NOTE = chromeEnglish["chrome.release.newerVersion"];
const MADE_BY_NEWER = chromeEnglish["chrome.release.madeByNewer"];
const CONNECTING = debateChromeEnglish["debateChrome.progress.connecting"];

let root: Root | null = null;

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

/**
 * A fresh page (the note's reason is page-wide state, held once per page load): the page and the note share one copy of
 * lib/v3/releaseWatch, and `failure` is built from the same copy of the contract the page checks with instanceof.
 */
async function openOldPage(
  failure: (contract: Contract) => unknown,
  refused: "reread" | "replay" | "pending"
): Promise<HTMLElement> {
  vi.resetModules();
  vi.doMock("@/lib/api", mockApi);
  const contract = await import("@debateai/contract");
  const { default: DebatePageClient } = await import("../../apps/ui/app/debate/[id]/DebatePageClient.js");
  const { NewVersionNote } = await import("../../apps/ui/components/NewVersionNote.js");
  if (refused === "replay") mocks.readEvents.mockRejectedValue(failure(contract));
  else mocks.readRun.mockRejectedValue(failure(contract));
  // "pending": a page whose first server read did not answer, so it holds no debate yet; its live stream is refused too.
  if (refused === "pending") mocks.streamEvents.mockRejectedValue(failure(contract));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <>
        <NewVersionNote />
        {refused === "pending" ? (
          <DebatePageClient
            id={answer.run_ref}
            initialDebate={null}
            initialAnswer={null}
            initialPending
            storyLocale="en"
            storyCatalog={publicEnglish}
          />
        ) : (
          <DebatePageClient
            id={answer.run_ref}
            initialDebate={debateDetailFromAnswer(answer)}
            initialAnswer={answer}
            storyLocale="en"
            storyCatalog={publicEnglish}
          />
        )}
      </>
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

describe("side-by-side W1: an old open page lets the reload note speak", () => {
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
    mocks.readPublicationReview.mockReset().mockResolvedValue({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null });
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

  it("a re-read this build cannot read shows only the note: no banner, no raw code", async () => {
    const page = await openOldPage(({ ContractHttpError }) => new ContractHttpError("INVALID_RESPONSE", 200, "x"), "reread");
    expect(mocks.readRun).toHaveBeenCalled();
    const text = page.textContent ?? "";
    expect(text).toContain(NOTE);
    expect(text).not.toContain(DEBATE_READ_BANNER);
    expect(text).not.toContain("INVALID_RESPONSE");
    expect(page.querySelector('[role="alert"]')).toBeNull();
    // The page keeps showing the debate it already holds.
    expect(text).toContain("The position claim under test.");
  });

  it("a re-read a newer release made shows only its note, no banner", async () => {
    const page = await openOldPage(
      // The client reads a 409 as SERVER_FAILURE and keeps the body's code (packages/contract codeForStatus).
      ({ ContractHttpError }) => new ContractHttpError("SERVER_FAILURE", 409, "x", "MADE_BY_NEWER_RELEASE"),
      "reread"
    );
    const text = page.textContent ?? "";
    expect(text).toContain(MADE_BY_NEWER);
    expect(text).not.toContain(DEBATE_READ_BANNER);
    expect(text).not.toContain("MADE_BY_NEWER_RELEASE");
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it("a replay this build cannot read leaves no 'replay unavailable: INVALID_RESPONSE' line, only the note", async () => {
    const page = await openOldPage(({ ContractHttpError }) => new ContractHttpError("INVALID_RESPONSE", 200, "x"), "replay");
    expect(mocks.readEvents).toHaveBeenCalled();
    await openHonesty(page);
    const text = page.textContent ?? "";
    expect(text).toContain(NOTE);
    expect(text).not.toContain(REPLAY_UNAVAILABLE);
    expect(text).not.toContain("INVALID_RESPONSE");
  });

  it("a page still waiting for its debate hides its stream line under the note: no 'Connecting…' left behind (W3)", async () => {
    const page = await openOldPage(({ ContractHttpError }) => new ContractHttpError("INVALID_RESPONSE", 200, "x"), "pending");
    expect(mocks.streamEvents).toHaveBeenCalledTimes(1);
    const text = page.textContent ?? "";
    expect(text).toContain(NOTE);
    expect(text).not.toContain(CONNECTING);
    expect(text).not.toContain(DEBATE_READ_BANNER);
    expect(text).not.toContain("INVALID_RESPONSE");
  });

  it("every other refusal keeps its banner and its replay line (no note)", async () => {
    const reread = await openOldPage(({ ContractHttpError }) => new ContractHttpError("SERVER_FAILURE", 503, "x"), "reread");
    expect(reread.textContent).toContain(DEBATE_READ_BANNER);
    expect(reread.textContent).not.toContain(NOTE);
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();

    const replay = await openOldPage(({ ContractHttpError }) => new ContractHttpError("SERVER_FAILURE", 503, "x"), "replay");
    await openHonesty(replay);
    expect(replay.textContent).toContain(`${REPLAY_UNAVAILABLE}: SERVER_FAILURE`);
    expect(replay.textContent).not.toContain(NOTE);
  });
});
