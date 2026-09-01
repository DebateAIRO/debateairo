// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer, debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { DebateMap } from "../../apps/ui/components/DebateMap.js";
import { ModelMetaLine } from "../../apps/ui/components/ModelPresentation.js";
import { SynthesisPanel } from "../../apps/ui/components/SynthesisPanel.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";

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

async function mountElement(element: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
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

  function answerWithEveryReviewState(): Answer {
    const base = answerWithProAndCon();
    const position = base.nodes.find((node) => node.node_id === "node:position")!;
    const attack = base.edges[0]!;
    const unassessed = {
      ...position,
      node_id: "node:unassessed",
      claim: "The cannot-assess review state under test.",
      provenance_ref: "prov:node:unassessed",
      review: {
        ...position.review!,
        outcome: "cannot-assess" as const,
        reasons: ["The reviewer recorded that this claim could not be assessed."]
      },
      defeater_refs: []
    };
    const unreviewed = {
      ...position,
      node_id: "node:unreviewed",
      claim: "The absent review state under test.",
      provenance_ref: "prov:node:unreviewed",
      review: null,
      defeater_refs: []
    };
    return buildFairShapedAnswer({
      nodes: [...base.nodes, unassessed, unreviewed],
      edges: [
        ...base.edges,
        {
          ...attack,
          edge_id: "edge:support:unassessed",
          from_node_ref: unassessed.node_id,
          relation: "support",
          provenance_ref: "prov:edge:support:unassessed"
        },
        {
          ...attack,
          edge_id: "edge:support:unreviewed",
          from_node_ref: unreviewed.node_id,
          relation: "support",
          provenance_ref: "prov:edge:support:unreviewed"
        }
      ]
    });
  }

  function canvasTreeWithRenderStates(): DebateNode {
    const projected = debateDetailFromAnswer(answerWithProAndCon()).tree!;
    const seed = projected.children.find((node) => node.id === "node:position")!;
    const card = (id: string, status: string, claim: string): DebateNode => ({
      ...seed,
      id,
      parent_id: projected.id,
      node_type: "PRO",
      status,
      claim,
      active_generation_id: null,
      active_generation: null,
      maker: null,
      children: []
    });
    return {
      ...projected,
      children: [
        card("node:healthy", "complete", "A healthy completed argument."),
        card("node:empty", "complete", ""),
        card("node:abandoned", "abandoned", "An abandoned argument."),
        card("node:failed", "failed", "A failed argument.")
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
      expect(shell?.style.padding).toBe("4px");
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

    const rootTab = container.querySelector<HTMLElement>(
      '[data-bezel="shell"][data-stance="root"] .nodeStanceTab[data-stance="root"]'
    );
    expect(rootTab, "root stance tab").not.toBeNull();
    expect(rootTab?.style.background).toBe("var(--line-strong)");
    expect(rootTab?.style.background).not.toBe(reasoningTab?.style.background);
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
    const reviewDot = review?.querySelector<HTMLElement>(".nodeReviewDot");
    expect(reviewDot?.style.background).toBe("var(--agree-text)");
    // jsdom has no layout, so this pins the non-zero inline sizing mechanism;
    // rendered-size proof remains V browser QA on t_187bbd93.
    expect(reviewDot?.style.display).toBe("inline-block");
    expect(Number.parseFloat(reviewDot?.style.width ?? "0")).toBeGreaterThan(0);
    expect(Number.parseFloat(reviewDot?.style.height ?? "0")).toBeGreaterThan(0);
    expect(reviewDot?.style.borderRadius).toBe("var(--r-dot)");
  });

  it("maps all completed review outcomes and absence to four distinct compact states", async () => {
    // PROPERTY (T1-C2-5): data-review is a total, collision-free rendering of
    // agree, dispute, cannot-assess, and no review.
    const container = await mountDebate(answerWithEveryReviewState());
    const expected = [
      ["node:position", "agree", "agreed"],
      ["node:defeater", "dispute", "disputed"],
      ["node:unassessed", "cannot-assess", "unassessed"],
      ["node:unreviewed", "absent", "absent"]
    ] as const;
    const rendered: string[] = [];

    for (const [nodeId, raw, compact] of expected) {
      const mark = container.querySelector<HTMLElement>(
        `[data-node-id="${nodeId}"] .nodeReviewBadges`
      );
      expect(mark, `${nodeId} review mark`).not.toBeNull();
      expect(mark?.dataset.nodeReview).toBe(raw);
      expect(mark?.dataset.review).toBe(compact);
      rendered.push(mark!.dataset.review!);
    }

    expect(new Set(rendered).size).toBe(4);
  });

  it("binds rendered maker dots to maker-owned model tokens only", async () => {
    // PROPERTY (B3): a recorded maker selects its own --m-* identity token;
    // makers without a dedicated token share only the honest default.
    const expected = [
      ["Anthropic", "var(--m-claude)"],
      ["OpenAI", "var(--m-gpt)"],
      ["Google", "var(--m-gemini)"],
      ["xAI", "var(--m-grok)"],
      ["Alibaba", "var(--m-qwen)"],
      ["Meta", "var(--m-default)"],
      ["Mistral", "var(--m-default)"],
      ["Unknown House", "var(--m-default)"]
    ] as const;
    const container = await mountElement(
      <div>
        {expected.map(([maker]) => (
          <ModelMetaLine key={maker} maker={maker} modelId={`model:${maker}`} />
        ))}
      </div>
    );
    const rendered = expected.map(([maker, token]) => {
      const dot = container.querySelector<HTMLElement>(`[data-maker="${maker}"] .modelDot`);
      const renderedToken = dot?.style.getPropertyValue("--dot");
      expect(renderedToken, maker).toBe(token);
      return renderedToken;
    });

    expect(new Set(rendered).size).toBe(6);
    expect(rendered.every((token) => token?.startsWith("var(--m-"))).toBe(true);
  });

  it("keeps empty, abandoned, and failed cores sunken from a healthy core", async () => {
    // PROPERTY (N5): non-healthy card states retain the state surface inside
    // the core bezel instead of collapsing onto a healthy card's --core fill.
    const tree = canvasTreeWithRenderStates();
    const container = await mountElement(
      <DebateCanvas
        root={tree}
        expanded={new Set()}
        selectedNodeId={null}
        meta={{ claims: 4, depth: 1, judged: 0, derivedStanding: 0, setAside: 0 }}
        onOpenNode={() => {}}
        onToggleExpand={() => {}}
      />
    );
    const coreFill = (nodeId: string) => container.querySelector<HTMLElement>(
      `[data-node-id="${nodeId}"] > [data-bezel="core"]`
    )?.style.background;

    expect(coreFill("node:healthy")).toBe("var(--core)");
    for (const nodeId of ["node:empty", "node:abandoned", "node:failed"]) {
      expect(coreFill(nodeId), nodeId).toBe("var(--surface-sunken)");
      expect(coreFill(nodeId), nodeId).not.toBe(coreFill("node:healthy"));
    }
  });

  it("uses a structural line token for the DebateMap hub ring", async () => {
    // PROPERTY (N6): the decorative map hub ring uses a line-role token, not
    // pure strong text colour in Chamber mode.
    const container = await mountElement(
      <DebateMap root={canvasTreeWithRenderStates()} onOpenSplit={() => {}} />
    );
    const hub = container.querySelector<SVGCircleElement>('circle[r="44"]');

    expect(hub?.getAttribute("stroke")).toBe("var(--core)");
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

describe("T1-C3 synthesis fidelity", () => {
  function treeWithSetAsidePath(): DebateNode {
    const projected = debateDetailFromAnswer(answer).tree!;
    const seed = projected.children[0]!;
    const setAside: DebateNode = {
      ...seed,
      id: "node:set-aside",
      parent_id: projected.id,
      claim: "The set-aside path under test.",
      path_status: "abandoned",
      stopping_status: "abandoned",
      children: []
    };

    return { ...projected, children: [...projected.children, setAside] };
  }

  function synthesisView() {
    return (
      <SynthesisPanel
        ready
        pending={false}
        streaming={false}
        structured={false}
        proClaim="The strongest supporting case."
        conClaim="The strongest opposing case."
        verdict="The verdict under test."
        meta="Contested"
        lean={{ pct: 46, label: "Con 54", source: "dialectical" }}
      />
    );
  }

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("changes the visible set-aside card count when the toggle changes", async () => {
    // PROPERTY (T1-C3-1): a real set-aside path is excluded and included by
    // the shipped toggle, so its visible data-set-aside count must change.
    const container = await mountElement(
      <DebateCanvas
        root={treeWithSetAsidePath()}
        expanded={new Set()}
        selectedNodeId={null}
        meta={{ claims: 3, depth: 1, judged: 2, derivedStanding: 2, setAside: 1 }}
        onOpenNode={() => {}}
        onChallengeNode={() => {}}
        onToggleExpand={() => {}}
      />
    );
    const toggle = container.querySelector<HTMLInputElement>(
      '.canvasStickyToggle input[type="checkbox"]'
    );
    const countVisibleSetAside = () => container.querySelectorAll('[data-set-aside="true"]').length;
    const before = countVisibleSetAside();

    expect(toggle, "set-aside toggle").not.toBeNull();
    await act(async () => toggle!.click());

    expect(countVisibleSetAside()).not.toBe(before);
  });

  it("renders the binding synthesis labels and a two-token stance gradient", async () => {
    // PROPERTY (T1-C3-2/T1-C3-4): the synthesis rail exposes the three
    // binding uppercase labels and its lean is made only from PRO and CON.
    const container = await mountElement(synthesisView());
    const pro = container.querySelector<HTMLElement>(".synthCardLabel.pro");
    const con = container.querySelector<HTMLElement>(".synthCardLabel.con");
    const verdict = container.querySelector<HTMLElement>(".synthCardLabel.verdict");
    const bar = container.querySelector<HTMLElement>(".synthLeanBar");
    const tokenNames = [...(bar?.style.background ?? "").matchAll(/var\((--[^)]+)\)/g)]
      .map((match) => match[1]);
    const source = readFileSync(
      resolve(process.cwd(), "apps/ui/components/SynthesisPanel.tsx"),
      "utf8"
    );

    expect(pro?.textContent).toBe("↑ STRONGEST PRO");
    expect(con?.textContent).toBe("↓ STRONGEST CON");
    expect(verdict?.textContent).toBe("VERDICT");
    expect(source.match(/oklch\(/g) ?? []).toHaveLength(0);
    expect(new Set(tokenNames)).toEqual(new Set(["--pro", "--con"]));
  });

  it("renders a genuinely inactive public challenge lock and omits regenerate", async () => {
    // PROPERTY (T1-C3-3/T1-C3-7): undefined onChallengeNode is public mode;
    // Challenge stays visible as a semantic lock and Regenerate is absent.
    const container = await mountElement(
      <DebateCanvas
        root={treeWithSetAsidePath()}
        expanded={new Set()}
        selectedNodeId={null}
        meta={{ claims: 3, depth: 1, judged: 2, derivedStanding: 2, setAside: 1 }}
        onOpenNode={() => {}}
        onChallengeNode={undefined}
        onToggleExpand={() => {}}
      />
    );
    const lock = [...container.querySelectorAll<HTMLElement>(".nodeCtrl.challenge")]
      .find((control) => control.textContent?.includes("Challenge"));

    expect(lock, "public challenge lock").toBeDefined();
    expect(lock?.textContent).toContain("🔒");
    expect(lock?.getAttribute("aria-disabled")).toBe("true");
    expect(lock?.getAttribute("tabindex")).toBe("-1");
    expect(lock?.onclick).toBeNull();
    expect(container.textContent).not.toContain("↻ Regenerate");
  });

});
