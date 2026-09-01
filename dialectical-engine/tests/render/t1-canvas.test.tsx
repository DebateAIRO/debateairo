// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer, debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const mocks = vi.hoisted(() => ({
  getDebateBundle: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn()
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: mocks.getDebateBundle
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
  run_ref: "run:t1-canvas",
  question_line: answer.question_line,
  state: "RUNNING" as const,
  terminal_reason: null,
  hold_until: null
};
const treeLessDebate = {
  ...debateDetailFromRunProjection(runningRun),
  root_node_id: null,
  tree: null
};

let root: Root | null = null;

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountDebate(initialAnswer: Answer | null): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={runningRun.run_ref}
        initialDebate={initialAnswer
          ? debateDetailFromAnswer(initialAnswer)
          : treeLessDebate}
        initialAnswer={initialAnswer}
        initialPending={initialAnswer === null}
      />
    );
  });
  await settleEffects();
  return container;
}

describe("chrome and views", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    document.documentElement.removeAttribute("data-mode");
    localStorage.clear();
    mocks.getDebateBundle.mockReset().mockImplementation(async (
      _id: string,
      _token: string,
      _client: unknown,
      options?: { currentAnswer?: Answer | null }
    ) => options?.currentAnswer
      ? { kind: "served", answer: options.currentAnswer, detail: debateDetailFromAnswer(options.currentAnswer), run: null }
      : { kind: "loading", answer: null, detail: treeLessDebate, run: runningRun });
    mocks.readEvents.mockReset().mockResolvedValue([]);
    mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by T1 chrome tests"));
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
    document.documentElement.removeAttribute("data-mode");
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the four existing view labels on the owner debate canvas", async () => {
    // PROPERTY (T1-C1-1): the owner debate's view group exposes the four
    // frozen reading-mode labels in contract order.
    const container = await mountDebate(answer);
    const labels = [...container.querySelectorAll<HTMLButtonElement>(".debateTopControlRow .segment button")]
      .map((button) => button.textContent?.trim());

    expect(labels).toEqual(["Thread", "Split", "Tree", "Map"]);
  });

  it("moves aria-pressed across all four view controls", async () => {
    // PROPERTY (T1-C1-2): activating a reading mode moves the existing
    // aria-pressed marker exclusively to that control.
    const container = await mountDebate(answer);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(
      ".debateTopControlRow .segment button"
    )];

    expect(buttons).toHaveLength(4);
    for (const selected of buttons) {
      await act(async () => selected.click());
      for (const candidate of buttons) {
        expect(candidate.getAttribute("aria-pressed"), candidate.textContent ?? "view control")
          .toBe(candidate === selected ? "true" : "false");
      }
    }
  });

  it("mounts a working mode toggle on debate chrome", async () => {
    // PROPERTY (T1-C1-3): debate chrome owns the real mode control and its
    // click flips the document marker from Terracotta to Chamber.
    const container = await mountDebate(answer);
    const toggle = container.querySelector<HTMLButtonElement>(
      ".debateTopControlRow [data-mode-toggle]"
    );

    expect(toggle, "debate chrome mode toggle").not.toBeNull();
    await act(async () => toggle!.click());
    expect(document.documentElement.dataset.mode).toBe("chamber");
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the mode toggle present before a tree exists", async () => {
    // PROPERTY (mount contract): the toggle is a sibling of the hasTree
    // conditional, so a still-generating debate retains its mode control.
    const container = await mountDebate(null);

    expect(container.querySelector(".debateTopControlRow .segment")).toBeNull();
    expect(container.querySelector(".debateTopControlRow [data-mode-toggle]")).not.toBeNull();
  });
});

describe("card anatomy", () => {
  it.todo("reserved for T1-C2");
});

describe("set-aside and synthesis", () => {
  it.todo("reserved for T1-C3");
});
