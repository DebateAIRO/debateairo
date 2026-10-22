// @vitest-environment jsdom

import { act, createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnswerSchema, type Node as ContractNode, type NodeReview } from "@debateai/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import type { DebateNode, NodeScoringPayload } from "../../apps/ui/lib/types.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const debateNode: DebateNode = {
  id: "node:position",
  debate_id: "debate:t5-drawer",
  parent_id: "node:root",
  node_type: "PRO",
  label: null,
  lens: null,
  depth: 1,
  position: 0,
  claim: "The position claim under test.",
  status: "complete",
  materialized_path: "0.0",
  active_generation_id: "generation:t5-drawer",
  active_generation: {
    model_id: "gpt-5.6-sol",
    maker: "OpenAI",
    argument: "The full argument remains visible behind the structured drawer record."
  },
  maker: "OpenAI",
  children: []
};

let root: Root | null = null;

function scoredNode(outcome: NodeReview["outcome"] | null = "agree"): ContractNode {
  const answer = buildFairShapedAnswer();
  const source = answer.nodes[0]!;
  const review = outcome === null ? null : { ...source.review!, outcome };
  return AnswerSchema.parse({
    ...answer,
    nodes: [
      {
        ...source,
        review,
        condition_marks: [
          "UNFALSIFIED-AFTER-ROTATION",
          "SINGLE-LINEAGE",
          "UNDER-EXPLORED"
        ]
      },
      ...answer.nodes.slice(1)
    ]
  }).nodes[0]!;
}

async function render(element: ReactElement): Promise<HTMLDivElement> {
  if (root !== null) await act(async () => root!.unmount());
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

async function renderDrawer(v3: ContractNode): Promise<HTMLDivElement> {
  return render(
    <NodeDetailDrawer
      node={debateNode}
      v3={v3}
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
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Turn 5 reference drawer", () => {
  it("says an argument is absent instead of leaving the prose area blank", async () => {
    // PROPERTY (typed absence, DR-115's rule applied to prose): a node whose
    // generation carries no argument text must SAY so. The drawer's other
    // absences already do — "REVIEW N/A", "House unavailable", "SCORING N/A",
    // "No scoring recommendation is available for this argument." — and a
    // silent blank is the one form of absence this product does not allow.
    //
    // This guard did not exist when 1c1039d5 discarded the line that produced
    // the text, which is why the loss went unnoticed for three weeks.
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await render(
      <NodeDetailDrawer
        node={{ ...debateNode, active_generation: { ...debateNode.active_generation!, argument: "" } }}
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

    expect(container.textContent).toContain(debateNode.claim);
    expect(container.textContent).toContain("No argument text yet.");
    // The select-to-challenge hint belongs to prose that exists; absence must
    // not invite the reader to select text that is not there.
    expect(container.textContent).not.toContain("Select any sentence above");
  });

  it("renders the elevated panel, scrim, claim, way of knowing, and binding section copy", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await renderDrawer(scoredNode());

    expect(container.querySelector('[role="dialog"][aria-label="Argument detail"][data-drawer-panel]')).not.toBeNull();
    expect(container.querySelector("[data-drawer-scrim]")).not.toBeNull();
    expect(container.textContent).toContain(debateNode.claim);
    expect(container.textContent).toContain("WAY OF KNOWING · REASONING");
  });

  it.each([
    ["agree", "REVIEW AGREED BY:"],
    ["dispute", "REVIEW DISPUTED BY:"]
  ] as const)("renders the full %s review line with the recorded reviewer", async (outcome, label) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await renderDrawer(scoredNode(outcome));
    const reviewLine = container.querySelector(`[data-node-review="${outcome}"]`);

    expect(reviewLine).not.toBeNull();
    expect(reviewLine!.textContent).toContain(label);
    expect(reviewLine!.querySelector('[data-maker="Reviewer-B"]')).not.toBeNull();
  });

  it("keeps typed review absence without fabricating a full review line", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await renderDrawer(scoredNode(null));

    expect(container.querySelector('[data-node-review="absent"]')).not.toBeNull();
    expect(container.textContent).not.toContain("REVIEW AGREED BY:");
    expect(container.textContent).not.toContain("REVIEW DISPUTED BY:");
  });

  it("renders exactly six positional key/value rows with non-empty live values", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await renderDrawer(scoredNode());
    const rows = [...container.querySelectorAll<HTMLElement>("[data-drawer-section-row]")];
    const expectedKeys = [
      "BASE SCORE",
      "FINAL STRENGTH",
      "REPLAY",
      "RESTATEMENT",
      "DEFEATERS",
      "JUDGE DISAGREEMENT"
    ];

    expect(rows).toHaveLength(6);
    expectedKeys.forEach((expectedKey, index) => {
      const key = rows[index]!.querySelector<HTMLElement>("[data-drawer-section-key]");
      const value = rows[index]!.querySelector<HTMLElement>("[data-drawer-section-value]");
      expect(key?.textContent?.trim()).toBe(expectedKey);
      expect(value?.textContent?.trim()).not.toBe("");
    });
  });

  it("distinguishes agree, dispute, and gold condition pills", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await renderDrawer(scoredNode());
    const pills = [...container.querySelectorAll<HTMLElement>("[data-condition-pill]")];

    expect(pills.map((pill) => pill.textContent?.trim())).toEqual([
      "Not falsified after model rotation",
      "Single model lineage",
      "Under-explored"
    ]);
    expect(pills.map((pill) => pill.dataset.mark)).toEqual(["agree", "dispute", "gold"]);
    expect(new Set(pills.map((pill) => pill.dataset.mark))).toHaveLength(3);
  });
});

describe("the argument drawer from the keyboard (2026-10-22 keyboard audit)", () => {
  // Only the fields the drawer reads: two usable recommendations, so one sits behind "1 more".
  const twoRecommendations = {
    rationale: { short: "" },
    holes: [],
    fatal_flags: [],
    recommended_investigations: [
      { action: "find_evidence", reason: "First, look this up.", priority: 1, target_node_id: "node:target" },
      { action: "challenge", reason: "Then test it.", priority: 2, target_node_id: "node:target" }
    ]
  } as unknown as NodeScoringPayload;

  function drawer(node: DebateNode, props: Partial<Parameters<typeof NodeDetailDrawer>[0]> = {}): ReactElement {
    return (
      <NodeDetailDrawer
        node={node}
        token={null}
        onClose={() => undefined}
        onFocusRecommendationNode={() => true}
        canFocusRecommendationNode={() => true}
        onQueued={() => undefined}
        onError={() => undefined}
        onAuthRejected={() => undefined}
        {...props}
      />
    );
  }

  function pressTab(): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  }

  it("Tab reaches the \"N more recommendations\" disclosure, and not the buttons it hides while closed", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await render(drawer(debateNode, { scoring: twoRecommendations }));
    const summary = container.querySelector<HTMLElement>("details > summary")!;
    expect(summary.textContent).toBe("1 more recommendation");

    const stops: Element[] = [];
    await act(async () => {
      for (let step = 0; step < 30 && !stops.includes(document.activeElement!); step += 1) {
        stops.push(document.activeElement!);
        pressTab();
      }
    });
    expect(stops).toContain(summary);
    const hidden = summary.parentElement!.querySelectorAll("button");
    expect(hidden.length).toBeGreaterThan(0);
    for (const button of hidden) expect(stops).not.toContain(button);
  });

  it("\"Open target\" keeps focus in the drawer, and closing falls back to the new view's control", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const target: DebateNode = { ...debateNode, id: "node:target", claim: "The target claim." };
    const returnFocusRef = createRef<HTMLElement | null>() as { current: HTMLElement | null };
    // The page this drawer opened over: the opener lives in a view that "Open target" replaces.
    document.body.replaceChildren();
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    const host = document.createElement("div");
    document.body.append(opener, fallback, host);
    root = createRoot(host);
    opener.focus();
    await act(async () => root!.render(drawer(debateNode, { scoring: twoRecommendations, returnFocusRef })));
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog);

    const openTarget = [...host.querySelectorAll("button")].find((button) => button.textContent === "Open target")!;
    openTarget.focus();
    opener.remove(); // the view switched underneath
    await act(async () => root!.render(drawer(target, { scoring: undefined, returnFocusRef })));
    expect(dialog.textContent).toContain("The target claim.");
    expect(document.activeElement).toBe(dialog);

    returnFocusRef.current = fallback;
    await act(async () => root!.render(<></>));
    expect(document.activeElement).toBe(fallback);
  });
});
