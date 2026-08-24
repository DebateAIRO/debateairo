// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer, debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  emit: null as null | ((event: RunEvent) => void),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readDeployment: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn()
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const readClient = {
    readRun: mocks.readRun,
    readRunAnswer: mocks.readRunAnswer,
    readAnswer: mocks.readAnswer
  };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
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

const answer = buildFairShapedAnswer();
const runningRun = {
  run_ref: "run:fair-test",
  question_line: answer.question_line,
  state: "RUNNING" as const,
  terminal_reason: null,
  hold_until: null
};

let root: Root | null = null;

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(initialAnswer: Answer | null = null): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={runningRun.run_ref}
        initialDebate={initialAnswer
          ? debateDetailFromAnswer(initialAnswer)
          : debateDetailFromRunProjection(runningRun)}
        initialAnswer={initialAnswer}
        initialPending={initialAnswer === null}
      />
    );
  });
  await settleEffects();
}

function terminalEvent(): RunEvent {
  return {
    event_id: "event:terminal",
    event_type: "run.terminal",
    run_ref: runningRun.run_ref,
    at_sequence: 1,
    payload: { state: "SERVED" }
  };
}

describe("BUG-02 rendered refresh behaviour", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.emit = null;
    mocks.readRun.mockReset().mockResolvedValue(runningRun);
    mocks.readRunAnswer.mockReset().mockResolvedValue(answer);
    mocks.readAnswer.mockReset();
    mocks.readEvents.mockReset().mockResolvedValue([]);
    mocks.readDeployment.mockReset().mockResolvedValue({
      register: {
        register_version: 1,
        rows: [{
          row_key: "hiddenNodeScoreThreshold",
          value: 0.35,
          source_ref: "acceptance:DR-176:V-approved"
        }]
      },
      scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    });
    mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
    mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
    mocks.streamEvents.mockReset().mockImplementation(async (_runRef, _token, emit: (event: RunEvent) => void) => {
      mocks.emit = emit;
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

  it("renders loading, then a served answer after terminal SSE without manual refresh", async () => {
    await mount();
    expect(document.querySelector(".progressFillIndeterminate")).not.toBeNull();
    expect(document.body.textContent).not.toContain("The position claim under test.");
    expect(mocks.emit).toBeTypeOf("function");

    await act(async () => {
      mocks.emit!(terminalEvent());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("The position claim under test.");
    expect(document.querySelector(".progressFillIndeterminate")).toBeNull();
    expect(mocks.readRunAnswer).toHaveBeenCalledTimes(1);
    // MUT-BUG02-B1-DISABLE-SSE-REFRESH: disable consumer refresh wiring -> RED.
  });

  it("keeps a server-rendered answer authoritative over a lagging RUNNING projection", async () => {
    await mount(answer);
    expect(document.body.textContent).toContain("The position claim under test.");
    expect(document.querySelector(".progressFillIndeterminate")).toBeNull();
    // MUT-BUG02-ANSWER-AUTHORITY: clear a held answer on a loading refresh -> RED.
  });

  it("renders the client FAILED projection as a failure banner instead of a spinner", async () => {
    mocks.readRun.mockResolvedValue({
      ...runningRun,
      state: "FAILED",
      terminal_reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED",
      hold_until: null
    });
    await mount();
    expect(document.body.textContent).toContain("Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED");
    expect(document.querySelector(".progressFillIndeterminate")).toBeNull();
    // MUT-BUG02-B4-DELETE-CLIENT-FAILED: treat FAILED as loading -> RED.
  });

  it("preserves an SSE-built tree when a loading projection refresh completes", async () => {
    await mount();
    expect(mocks.emit).toBeTypeOf("function");
    await act(async () => {
      mocks.emit!({
        event_id: "event:spawn",
        event_type: "node.spawned",
        run_ref: runningRun.run_ref,
        subject_ref: "node:streamed",
        at_sequence: 2,
        payload: {}
      });
      mocks.emit!({
        event_id: "event:text",
        event_type: "node.text_delta",
        run_ref: runningRun.run_ref,
        subject_ref: "node:streamed",
        at_sequence: 3,
        payload: { delta: "Streamed claim survives refresh" }
      });
      mocks.emit!({
        event_id: "event:complete",
        event_type: "node.complete",
        run_ref: runningRun.run_ref,
        subject_ref: "node:streamed",
        at_sequence: 4,
        payload: {}
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Streamed claim survives refresh");
    // MUT-BUG02-L9-CLOBBER-SSE-TREE: replace the held tree with projection detail -> RED.
  });
});
