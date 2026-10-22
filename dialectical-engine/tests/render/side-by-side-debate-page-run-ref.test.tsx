// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C9, controller ruling (h) on its review) — A PAGE OPENED FROM AN
 * OLD LINK ACTS ON THE NEWEST RUN. A debate re-admitted from the waiting line gets a new run; GET /v1/runs/OLD answers
 * with the new run's projection, whose `run_ref` is NEW. A step-up grant stays bound to the id the page sends (the API no
 * longer rewrites it), so the page must send NEW everywhere it acts: PublicationControl (publish, unpublish, delete and
 * their step-up target) and the run stream take the projection's `run_ref`, or the answer's, never the URL's id.
 */
const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";

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
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** GET /v1/runs/OLD after the re-admission: the NEW run's projection. */
const readmittedRun = {
  run_ref: NEW,
  question_line: "Should cities make public transport free at the point of use?",
  state: "QUEUED" as const,
  terminal_reason: null,
  hold_until: null
};

let root: Root | null = null;

async function mountAt(urlId: string): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={urlId}
        initialDebate={debateDetailFromRunProjection({ ...readmittedRun, run_ref: urlId })}
        initialAnswer={null}
        initialPending
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
  });
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

describe("side-by-side C9 (ruling h): the debate page acts on the projection's run_ref, not the URL's id", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.readRun.mockReset().mockResolvedValue(readmittedRun);
    mocks.readRunAnswer.mockReset();
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

  it("an old link reads the run under the URL's id, then PublicationControl and the stream name the NEW run", async () => {
    await mountAt(OLD);
    expect(mocks.readRun).toHaveBeenCalledWith(OLD);
    expect(mocks.readRunVisibility).toHaveBeenLastCalledWith(NEW);
    expect(mocks.streamEvents.mock.calls.at(-1)?.[0]).toBe(NEW);
  });

  it("a served answer's run_ref wins over the URL's id too", async () => {
    const answer = { ...buildFairShapedAnswer(), run_ref: NEW };
    mocks.readRun.mockResolvedValue({ ...readmittedRun, state: "SETTLED" as const });
    mocks.readRunAnswer.mockResolvedValue(answer);
    await mountAt(OLD);
    expect(mocks.readRunVisibility).toHaveBeenLastCalledWith(NEW);
  });

  it("a link to the newest run itself acts on that run, and the stream is opened once", async () => {
    mocks.readRun.mockResolvedValue({ ...readmittedRun, run_ref: OLD });
    await mountAt(OLD);
    expect(mocks.readRunVisibility).toHaveBeenLastCalledWith(OLD);
    expect(mocks.streamEvents).toHaveBeenCalledTimes(1);
    expect(mocks.streamEvents.mock.calls[0]?.[0]).toBe(OLD);
  });
});
