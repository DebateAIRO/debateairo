import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import {
  contractNodesById,
  debateDetailFromAnswer
} from "../../apps/ui/lib/v3/adapter.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import debateViewsEnglish from "../../apps/ui/messages/en/debateViews.json" with { type: "json" };
import { tPlural } from "../../apps/ui/lib/i18n/translate.js";

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

function renderedCanvasWithIndependence(): string {
  const answer = buildFairShapedAnswer();
  const projected = debateDetailFromAnswer(answer);
  const scored = projected.tree!.children[0]!;
  const sourced: DebateNode = {
    ...scored,
    id: "node:sourced",
    evidence_independence: {
      distinct_source_count: 2,
      pairs: [["nature.com", "LOOKED_UP"], ["replication.org", "RAN"]]
    },
    children: []
  };
  // A node that carries an independence RECORD whose count is zero. This is
  // the boundary the helper guards, and it is distinct from a node with no
  // record at all — only this fixture can prove the `<= 0` arm.
  const zeroSourced: DebateNode = {
    ...scored,
    id: "node:zero-sourced",
    evidence_independence: { distinct_source_count: 0, pairs: [] },
    children: []
  };

  return renderToStaticMarkup(
    <DebateCanvas
      root={{ ...projected.tree!, children: [sourced, zeroSourced] }}
      expanded={new Set()}
      selectedNodeId={null}
      v3NodesById={contractNodesById(answer)}
      meta={{ claims: 2, depth: 1, judged: 1, derivedStanding: 0, setAside: 0 }}
      onOpenNode={noop}
      onChallengeNode={noop}
      onToggleExpand={noop}
    />
  );
}

describe("UI-02e renders the real DebateCanvas gate surface", () => {
  it("shows recorded evidence sourcing breadth on the card, and nothing when there is none", () => {
    // PROPERTY: when a node records distinct evidence source-domain/method
    // pairs, the card says how many, and the accessible name carries the
    // honest caveat that this measures sourcing BREADTH and not accuracy.
    // 2b670d30 deleted this render site outright; the helper
    // (lib/scoringFormat.ts:120 formatIndependencePill), the node field and
    // the wording all survived, so nothing named the loss and nothing failed.
    const html = renderedCanvasWithIndependence();

    expect(html).toContain("sources: 2 distinct");
    expect(html).toContain("2 distinct source-domain/method pairs");
    expect(html).toContain("not verified accuracy or training-corpus independence");
    // Exactly one card shows a pill: the zero-count node carries a record but
    // no sources, and must stay silent rather than print "sources: 0 distinct".
    expect(html.match(/sources: \d+ distinct/g)).toHaveLength(1);
    expect(html).not.toContain("sources: 0");
    // A card with no independence record at all is silent too.
    expect(renderedCanvas()).not.toContain("sources:");
  });


  it("DR-184 T28 renders the immutable four-term standing census in the sticky control", () => {
    const html = renderedCanvas();
    expect(html).toContain([
      tPlural(debateViewsEnglish, "debateViews.claimCount", 3, "en", { count: 3 }),
      debateViewsEnglish["debateViews.across"],
      tPlural(debateViewsEnglish, "debateViews.levelCount", 1, "en", { count: 1 }),
      "·",
      tPlural(debateViewsEnglish, "debateViews.judgedCount", 1, "en", { count: 1 }),
      "·",
      tPlural(debateViewsEnglish, "debateViews.standingCount", 1, "en", { count: 1 }),
      "·",
      tPlural(debateViewsEnglish, "debateViews.setAsideCount", 1, "en", { count: 1 })
    ].join(" "));
  });
  it("pins maker identity at both the empty-state and contentful-card call sites", () => {
    const html = renderedCanvas();

    expect(html.match(new RegExp(IDENTITY, "g"))).toHaveLength(2);
    expect(html.match(/data-maker="OpenAI"/g)).toHaveLength(2);
    expect(html).toContain(debateViewsEnglish["debateViews.noStrongArgument"]);
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
