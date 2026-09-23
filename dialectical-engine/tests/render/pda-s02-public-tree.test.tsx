// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { DebateThread } from "../../apps/ui/components/DebateThread.js";
import { DebateSplit } from "../../apps/ui/components/DebateSplit.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import debateViewsEnglish from "../../apps/ui/messages/en/debateViews.json" with { type: "json" };
import debateDrawersEnglish from "../../apps/ui/messages/en/debateDrawers.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const PUBLIC_PAGE_I18N = {
  locale: "en" as const,
  publicCatalog: publicEnglish,
  timeCatalog: timeEnglish,
  debateChromeCatalog: debateChromeEnglish
};

function labeledNumber(value: number) {
  return {
    value,
    kind: "probability",
    source: "published source",
    producer: "published producer",
    provenance_ref: "REDACTED_OWNER_ONLY",
    replay_handle: "REDACTED_OWNER_ONLY"
  } as const;
}

function publicNode(nodeId: string, claim: string, value: number) {
  return {
    node_id: nodeId,
    claim,
    way_of_knowing: "REASONING" as const,
    base_score: labeledNumber(value),
    final_strength: labeledNumber(value),
    provenance_ref: "REDACTED_OWNER_ONLY",
    maker_lineage: null,
    review: null,
    locator: null,
    stranger_restatement: { check_status: "NOT_SAMPLED" as const },
    defeater_refs: [],
    defeater_exhaustion_marked: true,
    disagreement: null,
    condition_marks: [],
    abstention: null,
    staleness_state: "FRESH" as const,
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

const publicTreeDebate = PublicDebateSchema.parse({
  public_ref: "55555555-5555-4555-8555-555555555555",
  author_pseudonym: "Public Tree Author",
  question: "Does the public tree preserve every reading mode?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "The public graph remains readable." }],
    badges: [],
    residual_objections: [],
    reversal_point: "A contrary public graph.",
    as_of: "2026-08-24T00:00:00.000Z",
    nodes: [
      publicNode("node:public-parent", "The public parent claim.", 0.8),
      publicNode("node:public-support", "A public supporting claim.", 0.7),
      publicNode("node:public-counter", "A public counterclaim.", 0.4)
    ],
    edges: [
      {
        edge_id: "edge:public-support",
        from_node_ref: "node:public-support",
        target_kind: "NODE",
        target_ref: "node:public-parent",
        relation: "support",
        strength: { status: "PRESENT", number: labeledNumber(0.7) },
        provenance_ref: "REDACTED_OWNER_ONLY",
        placeholder: false
      },
      {
        edge_id: "edge:public-counter",
        from_node_ref: "node:public-counter",
        target_kind: "NODE",
        target_ref: "node:public-parent",
        relation: "attack",
        strength: { status: "PRESENT", number: labeledNumber(0.4) },
        provenance_ref: "REDACTED_OWNER_ONLY",
        placeholder: false
      }
    ],
    tree_included: true
  }
});

const child: DebateNode = {
  id: "node:public-child",
  debate_id: "public:fixture",
  parent_id: "public:fixture",
  node_type: "PRO",
  label: null,
  lens: null,
  depth: 1,
  position: 0,
  claim: "A public child argument.",
  status: "complete",
  materialized_path: "0.0",
  active_generation_id: null,
  active_generation: null,
  maker: null,
  children: []
};

const rootNode: DebateNode = {
  id: "public:fixture",
  debate_id: "public:fixture",
  parent_id: null,
  node_type: "ROOT_CLAIM",
  label: null,
  lens: null,
  depth: 0,
  position: 0,
  claim: "The public root claim.",
  status: "complete",
  materialized_path: "0",
  active_generation_id: null,
  active_generation: null,
  maker: null,
  children: [child]
};

let root: Root | null = null;

async function render(element: ReactElement): Promise<HTMLDivElement> {
  if (root !== null) await act(async () => root!.unmount());
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("S02 shared tree leaves in public read-only mode", () => {
  it("omits every challenge trigger when the caller supplies no challenge callback", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const noOp = () => undefined;

    const thread = await render(
      <DebateThread
        root={rootNode}
        expanded={new Set()}
        collapsed={new Set()}
        meta={{ nodes: 1, depth: 1 }}
        onOpenNode={noOp}
        onToggleExpand={noOp}
        onToggleCollapse={noOp}
      />
    );
    expect(thread.textContent).not.toContain("⚐ Challenge");

    const split = await render(
      <DebateSplit
        root={rootNode}
        focusNodeId={child.id}
        expanded={new Set()}
        onFocus={noOp}
        onOpenNode={noOp}
        onToggleExpand={noOp}
      />
    );
    expect(split.textContent).not.toContain("⚐ Challenge");
    expect(split.textContent).not.toContain("challenge it to spawn a rebuttal");

    const splitRoot = await render(
      <DebateSplit
        root={rootNode}
        focusNodeId={null}
        expanded={new Set()}
        onFocus={noOp}
        onOpenNode={noOp}
        onToggleExpand={noOp}
      />
    );
    expect(splitRoot.textContent).not.toContain("⚐ Challenge");

    const canvas = await render(
      <DebateCanvas
        root={rootNode}
        expanded={new Set()}
        selectedNodeId={null}
        meta={{ claims: 1, depth: 1, judged: 0, derivedStanding: 0, setAside: 0 }}
        onOpenNode={noOp}
        onToggleExpand={noOp}
      />
    );
    expect(canvas.textContent).not.toContain("⚐ Challenge");

    const drawer = await render(
      <NodeDetailDrawer
        node={child}
        token={null}
        onClose={noOp}
        onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false}
        onQueued={noOp}
        onError={noOp}
        onAuthRejected={noOp}
      />
    );
    expect(drawer.textContent).not.toContain("⚐ Challenge");
  });

  it("preserves the owner challenge trigger when a callback is supplied", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const split = await render(
      <DebateSplit
        root={rootNode}
        focusNodeId={child.id}
        expanded={new Set()}
        onFocus={() => undefined}
        onOpenNode={() => undefined}
        onChallengeNode={() => undefined}
        onToggleExpand={() => undefined}
      />
    );
    expect(split.textContent).toContain(`⚐ ${debateViewsEnglish["debateViews.challenge"]}`);
    expect(split.textContent).toContain(debateViewsEnglish["debateViews.leafWithChallenge"]);

    const drawer = await render(
      <NodeDetailDrawer
        node={child}
        token={null}
        onClose={() => undefined}
        onChallenge={() => undefined}
        onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false}
        onQueued={() => undefined}
        onError={() => undefined}
        onAuthRejected={() => undefined}
      />
    );
    expect(drawer.textContent).toContain(
      `⚐ ${debateDrawersEnglish["debateDrawers.node.challenge"]}`
    );
  });
});

describe("S02 public argument-tree projection", () => {
  it("renders every reading mode, real projected claims, and a read-only node drawer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await render(
      <PublicDebatePageClient debate={publicTreeDebate} {...PUBLIC_PAGE_I18N} />
    );
    const viewButtons = [...container.querySelectorAll<HTMLButtonElement>(
      `[role="group"][aria-label="${chromeEnglish["chrome.view"]}"] > button`
    )];
    expect(viewButtons.map((button) => button.textContent)).toEqual([
      chromeEnglish["chrome.overview"],
      chromeEnglish["chrome.thread"],
      chromeEnglish["chrome.split"],
      chromeEnglish["chrome.tree"],
      chromeEnglish["chrome.map"]
    ]);

    const clickView = async (label: string) => {
      const button = viewButtons.find((candidate) => candidate.textContent === label);
      expect(button).not.toBeUndefined();
      await act(async () => button!.click());
    };

    // V's ruling of 2026-09-20: a public visitor lands on the conclusion and
    // the argument tree is ONE CLICK AWAY. Until that ruling this row encoded
    // the older binary — public "Tree" both WAS the canvas and WAS the landing
    // view — and there was no way to have the summary and the tree at once.
    // What the row protects is unchanged and is all still asserted below: the
    // tree is genuinely reachable, it carries the real projected claims, and it
    // is read-only. Only the landing view moved, and that move is now pinned
    // rather than assumed — the overview must be what a stranger sees first.
    expect(container.querySelector('[data-design-turn="3b"]')).not.toBeNull();
    expect(container.querySelector(".canvasViewport")).toBeNull();

    await clickView("Tree");
    const reachableCanvas = container.querySelector<HTMLElement>(".canvasViewport");
    expect(reachableCanvas).not.toBeNull();
    expect(reachableCanvas!.textContent).not.toContain("⚐ Challenge");
    expect(container.textContent).toContain("A public supporting claim.");

    await clickView("Thread");
    expect(container.querySelector(".thread")).not.toBeNull();
    const supportCard = [...container.querySelectorAll<HTMLElement>(".threadCard")]
      .find((card) => card.textContent?.includes("A public supporting claim."));
    expect(supportCard).not.toBeUndefined();
    await act(async () => supportCard!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Unlock actions to view generation history.");
    expect(container.textContent).not.toContain("⚐ Challenge");
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => close!.click());

    await clickView("Split");
    expect(container.querySelector(".split")).not.toBeNull();
    await clickView("Map");
    expect(container.querySelector(".map")).not.toBeNull();
    await clickView("Tree");
    expect(container.querySelector(".canvasViewport")).not.toBeNull();
  });

  it("renders no tree controls for a legacy answer-only publication", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const legacyDebate = PublicDebateSchema.parse({
      ...publicTreeDebate,
      answer: {
        terminal: publicTreeDebate.answer.terminal,
        verdict: publicTreeDebate.answer.verdict,
        verdict_available: publicTreeDebate.answer.verdict_available,
        confidence_band: publicTreeDebate.answer.confidence_band,
        summary_segments: publicTreeDebate.answer.summary_segments,
        badges: publicTreeDebate.answer.badges,
        residual_objections: publicTreeDebate.answer.residual_objections,
        reversal_point: publicTreeDebate.answer.reversal_point,
        as_of: publicTreeDebate.answer.as_of
      }
    });
    const container = await render(
      <PublicDebatePageClient debate={legacyDebate} {...PUBLIC_PAGE_I18N} />
    );
    expect(container.querySelectorAll(
      `[role="group"][aria-label="${chromeEnglish["chrome.view"]}"] > button`
    )).toHaveLength(0);
    expect(container.querySelector(".canvasViewport, .thread, .split, .map")).toBeNull();
    expect(container.textContent).toContain(publicEnglish["public.disclosure.legacySummaryOnly"]);
  });
});
