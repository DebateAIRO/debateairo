// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnswerSchema, type Node as ContractNode, type NodeReview } from "@debateai/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
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
