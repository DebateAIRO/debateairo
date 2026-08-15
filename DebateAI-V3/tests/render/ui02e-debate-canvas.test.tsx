import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebateCanvas } from "../../apps/v2-ui/components/DebateCanvas.js";
import {
  contractNodesById,
  debateDetailFromAnswer
} from "../../apps/v2-ui/lib/v3/adapter.js";
import type { DebateNode } from "../../apps/v2-ui/lib/types.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const noop = () => {};
const IDENTITY = "OpenAI · GPT · gpt-5";

function renderedCanvas(): string {
  const answer = buildFairShapedAnswer();
  const projected = debateDetailFromAnswer(answer);
  const scored = projected.tree!.children[0]!;
  const empty: DebateNode = {
    ...scored,
    id: "node:empty",
    claim: "",
    active_generation_id: "generation:empty",
    active_generation: {
      model_id: "gpt-5",
      maker: "OpenAI",
      argument: ""
    },
    maker: "OpenAI",
    children: []
  };
  const typedAbsence: DebateNode = {
    ...scored,
    id: "node:typed-absence",
    claim: "A claim whose maker and score records are absent.",
    active_generation_id: null,
    active_generation: null,
    maker: null,
    children: []
  };
  const root: DebateNode = {
    ...projected.tree!,
    children: [scored, empty, typedAbsence]
  };

  return renderToStaticMarkup(
    <DebateCanvas
      root={root}
      expanded={new Set()}
      selectedNodeId={null}
      v3NodesById={contractNodesById(answer)}
      meta={{ claims: 3, depth: 1, judged: 1, derivedStanding: 1, setAside: 1 }}
      onOpenNode={noop}
      onChallengeNode={noop}
      onToggleExpand={noop}
    />
  );
}

function renderedCard(html: string, nodeId: string): string {
  const start = html.indexOf(`data-node-id="${nodeId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextCard = html.indexOf('data-node-id="', start + 1);
  const canvasControls = html.indexOf('class="canvasZoomCluster"', start + 1);
  const end = nextCard >= 0 ? nextCard : canvasControls;
  return html.slice(start, end >= 0 ? end : undefined);
}

describe("UI-02e renders the real DebateCanvas gate surface", () => {
  it("DR-184 T28 renders the immutable four-term standing census in the sticky control", () => {
    const html = renderedCanvas();
    expect(html).toContain("3 claims across 1 levels · 1 judged · 1 standing on their arguments · 1 set aside");
  });
  it("pins maker identity at both the empty-state and contentful-card call sites", () => {
    const html = renderedCanvas();

    expect(html.match(new RegExp(IDENTITY, "g"))).toHaveLength(2);
    expect(html.match(/data-maker="OpenAI"/g)).toHaveLength(2);
    expect(html).toContain("No strong argument found.");
    expect(html).toContain("The position claim under test.");
  });

  it("pins V3 score badges as rendered percentage text", () => {
    const html = renderedCanvas();

    expect(html).toContain("BASE 62%");
    expect(html).toContain("FINAL 41%");
    expect(html).toContain('data-v3-score="base_score"');
    expect(html).toContain('data-v3-score="final_strength"');
  });

  it("keeps typed maker and score absence visible instead of collapsing to silence", () => {
    const card = renderedCard(renderedCanvas(), "node:typed-absence");

    expect(card.match(/>House unavailable<\/span>/g)).toHaveLength(2);
    expect(card).toContain('aria-label="No recorded house is available for this argument."');
    expect(card).toContain("NO SCORE");
    expect(card).toContain("V3 has no recorded score for it.");
  });
});
