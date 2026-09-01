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
  function answerWithProAndCon(): Answer {
    const position = answer.nodes[0]!;
    const attack = answer.edges[0]!;
    return {
      ...answer,
      nodes: [
        ...answer.nodes,
        {
          ...position,
          node_id: "node:supporter",
          claim: "The supporting claim under test.",
          provenance_ref: "prov:node:supporter",
          defeater_refs: []
        }
      ],
      edges: [
        ...answer.edges,
        {
          ...attack,
          edge_id: "edge:support:1",
          from_node_ref: "node:supporter",
          relation: "support",
          provenance_ref: "prov:edge:support:1"
        }
      ]
    };
  }

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
    mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by T1 card-anatomy tests"));
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

  it("renders nested shell/core bezels and token-typed stance tabs for PRO and CON cards", async () => {
    // PROPERTY (T1-C2-1): every PRO/CON canvas card exposes two distinct
    // bezel layers and a top tab whose stance selects that role's line token.
    const container = await mountDebate(answerWithProAndCon());

    for (const stance of ["pro", "con"] as const) {
      const shell = container.querySelector<HTMLElement>(
        `[data-bezel="shell"][data-stance="${stance}"]`
      );
      const core = shell?.querySelector<HTMLElement>(':scope > [data-bezel="core"]');
      const tab = core?.querySelector<HTMLElement>(`.nodeStanceTab[data-stance="${stance}"]`);

      expect(shell, `${stance} shell`).not.toBeNull();
      expect(shell?.style.background).toBe("var(--shell)");
      expect(shell?.style.borderRadius).toBe("var(--r-card)");
      expect(shell?.style.boxShadow).toBe("var(--shadow-card)");
      expect(core, `${stance} core`).not.toBeNull();
      expect(core?.style.background).toBe("var(--core)");
      expect(core?.style.borderRadius).toBe("var(--r-card)");
      expect(tab, `${stance} stance tab`).not.toBeNull();
      expect(tab?.style.position).toBe("absolute");
      expect(tab?.style.top).toBe("0px");
      expect(tab?.style.left).toBe("0px");
      expect(tab?.style.height).toBe("3px");
      expect(tab?.style.borderRadius).toBe("var(--r-tab)");
      expect(tab?.style.background).toBe(`var(--${stance}-line)`);
    }

    const reasoningTab = container.querySelector<HTMLElement>(
      '[data-bezel="shell"][data-stance="reasoning"] .nodeStanceTab[data-stance="reasoning"]'
    );
    expect(reasoningTab, "reasoning stance tab").not.toBeNull();
    expect(reasoningTab?.style.background).toBe("var(--reasoning-line)");
    expect(reasoningTab?.style.background).not.toBe("var(--gold)");
  });

  it("keeps BASE, FINAL, and an accessible Details control on one card", async () => {
    // PROPERTY (T1-C2-2): score anatomy and the Details action coexist on a
    // single argument card; the decorative chevron is not its accessible name.
    const container = await mountDebate(answerWithProAndCon());
    const card = [...container.querySelectorAll<HTMLElement>(".nodeWrap")]
      .find((candidate) => candidate.textContent?.includes("BASE") && candidate.textContent?.includes("FINAL"));
    expect(card, "one scored argument card").toBeDefined();
    const details = card!.querySelector<HTMLButtonElement>('button[aria-label="Details"]');

    expect(card!.textContent).toContain("BASE");
    expect(card!.textContent).toContain("FINAL");
    expect(details).not.toBeNull();
    expect(details?.querySelector('[aria-hidden="true"]')?.textContent).toBe("▸");
    const review = card!.querySelector<HTMLElement>('[data-review="agreed"]');
    expect(review, "compact agreed review mark").not.toBeNull();
    expect(review?.querySelector<HTMLElement>(".nodeReviewDot")?.style.background)
      .toBe("var(--agree-text)");
  });

  it("keeps Regenerate on the owner canvas argument card", async () => {
    // PROPERTY (T1-C2-3): the owner card retains its truthful Regenerate
    // control after the card anatomy is rebuilt.
    const container = await mountDebate(answerWithProAndCon());
    const card = container.querySelector<HTMLElement>('[data-bezel="shell"][data-stance="pro"]');
    const regenerate = [...(card?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((button) => button.textContent?.includes("↻ Regenerate"));

    expect(regenerate).toBeDefined();
    expect(regenerate?.hidden).toBe(false);
  });

  it("emits distinct stance attributes and line tokens on PRO and CON connectors", async () => {
    // PROPERTY (T1-C2-4): rendered connector markup carries its semantic
    // stance, and PRO/CON cannot collapse onto the same line token.
    const container = await mountDebate(answerWithProAndCon());
    const pro = container.querySelector<SVGPathElement>(
      '.canvasLinks path[data-connector-stance="pro"]'
    );
    const con = container.querySelector<SVGPathElement>(
      '.canvasLinks path[data-connector-stance="con"]'
    );

    expect(pro?.getAttribute("stroke")).toBe("var(--pro-line)");
    expect(con?.getAttribute("stroke")).toBe("var(--con-line)");
    expect(pro?.getAttribute("stroke")).not.toBe(con?.getAttribute("stroke"));
    expect(container.innerHTML).toContain('data-connector-stance="pro"');
    expect(container.innerHTML).toContain('data-connector-stance="con"');
  });
});

describe("set-aside and synthesis", () => {
  it.todo("reserved for T1-C3");
});
