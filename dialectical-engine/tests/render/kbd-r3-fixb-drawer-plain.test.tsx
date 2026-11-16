// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 fix round (2026-11-12), B1: the node drawer shows, as visible text, what the Tree's
 * score pills say only in a tooltip; it must not show the ids, enum names and jargon those tooltips carry
 * (no ids, UUIDs, enum names or "V3" in visible text).
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Node as ContractNode } from "@debateai/contract";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { v3ScorePercentage } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const argumentNode: DebateNode = {
  id: "node:position", debate_id: "debate:fixb", parent_id: "node:root", node_type: "PRO", label: null, lens: null, depth: 1,
  position: 0, claim: "The claim under test.", status: "complete", materialized_path: "0.0", active_generation_id: "generation:fixb",
  active_generation: { model_id: "gpt-5.6-sol", maker: "OpenAI", argument: "The argument." }, maker: "OpenAI", children: []
};

let root: Root | null = null;
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
async function render(element: ReactElement): Promise<HTMLDivElement> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}
function drawer(v3: ContractNode): ReactElement {
  return (
    <NodeDetailDrawer
      node={argumentNode}
      v3={v3}
      token={null}
      onClose={() => undefined}
      onFocusRecommendationNode={() => false}
      canFocusRecommendationNode={() => false}
      onQueued={() => undefined}
      onError={() => undefined}
      onAuthRejected={() => undefined}
    />
  );
}
const visibleText = (container: HTMLElement): string => {
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".srOnly").forEach((element) => element.remove());
  return copy.textContent ?? "";
};

describe("B1: the drawer's score lines carry no ids, enum names or jargon", () => {
  it("a UUID source, an enum kind and a replay handle never reach the visible text, nor does V3", async () => {
    const uuid = "6f1c2a7e-93b4-4d0a-8e55-0b7d4c9e21aa";
    const base = buildFairShapedAnswer().nodes[0]! as ContractNode;
    const v3: ContractNode = {
      ...base,
      base_score: { ...base.base_score, value: 0.6234917, source: uuid, kind: "JUDGE_PANEL_MEAN", replay_handle: "replay:h-77f3" },
      final_strength: { ...base.final_strength!, source: uuid, kind: "PROPAGATED_STRENGTH", replay_handle: "replay:h-9a01" }
    };
    const text = visibleText(await render(drawer(v3)));
    for (const leak of [uuid, "replay:h-77f3", "replay:h-9a01", "JUDGE_PANEL_MEAN", "PROPAGATED_STRENGTH", "V3"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("a rounded percentage: its detail sentence shows under the table; an exact one adds nothing", async () => {
    const base = buildFairShapedAnswer().nodes[0]! as ContractNode;
    const v3: ContractNode = { ...base, base_score: { ...base.base_score, value: 0.6234917 } };
    const container = await render(drawer(v3));
    const rounded = v3ScorePercentage(0.6234917).detail;
    const exact = v3ScorePercentage(v3.final_strength!.value).detail;
    const table = container.querySelector("[data-drawer-section-table]")!;
    const lines = [...container.querySelectorAll(".drawerFindingText")].filter((line) => !table.contains(line));
    expect(lines.map((line) => line.textContent)).toContain(rounded);
    expect(visibleText(container)).not.toContain(exact);
    // The line explains the base-score cell, which carries the AI mark; so does the line.
    const line = lines.find((candidate) => candidate.textContent === rounded)!;
    expect(line.getAttribute("data-ai-generated")).toBe("true");
  });

  it("two exact percentages: no line under the table at all", async () => {
    const v3 = buildFairShapedAnswer().nodes[0]! as ContractNode;
    const container = await render(drawer(v3));
    expect(container.querySelector("[data-v3-score-detail]")).toBeNull();
    expect(visibleText(container)).not.toContain(v3ScorePercentage(v3.base_score.value).detail);
  });
});
