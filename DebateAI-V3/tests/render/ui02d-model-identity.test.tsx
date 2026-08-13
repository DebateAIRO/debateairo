import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebateMap } from "../../apps/v2-ui/components/DebateMap.js";
import { DebateOutline } from "../../apps/v2-ui/components/DebateOutline.js";
import { DebateSplit } from "../../apps/v2-ui/components/DebateSplit.js";
import { DebateThread } from "../../apps/v2-ui/components/DebateThread.js";
import { DebateTree } from "../../apps/v2-ui/components/DebateTree.js";
import { ModelBadge, ModelMetaLine } from "../../apps/v2-ui/components/ModelPresentation.js";
import { NodeDetailDrawer } from "../../apps/v2-ui/components/NodeDetailDrawer.js";
import type { DebateNode } from "../../apps/v2-ui/lib/types.js";

const noop = () => {};
const MODEL_ID = "gpt-5.6-sol";
const IDENTITY = `OpenAI · GPT · ${MODEL_ID}`;

const makerNode: DebateNode = {
  id: "node:maker",
  debate_id: "debate:UI-02d",
  parent_id: "node:root",
  node_type: "PRO",
  depth: 1,
  position: 0,
  claim: "The recorded maker authored this argument.",
  status: "complete",
  materialized_path: "0.0",
  active_generation_id: "generation:maker",
  active_generation: {
    model_id: MODEL_ID,
    maker: "OpenAI",
    argument: "A rendered argument whose identity must remain visible."
  },
  maker: "OpenAI",
  children: []
};

const root: DebateNode = {
  ...makerNode,
  id: "node:root",
  parent_id: null,
  node_type: "ROOT_CLAIM",
  depth: 0,
  claim: "Root claim",
  materialized_path: "0",
  children: [makerNode]
};

function expectRecordedIdentity(html: string): void {
  expect(html).toContain(IDENTITY);
  expect(html).toContain(`data-maker="OpenAI"`);
}

describe("UI-02d renders recorded house, family, and exact model id", () => {
  it("pins the tree maker prop through the rendered card", () => {
    expectRecordedIdentity(renderToStaticMarkup(
      <DebateTree node={root} token={null} onError={noop} />
    ));
  });

  it("pins the thread maker prop through the rendered card", () => {
    expectRecordedIdentity(renderToStaticMarkup(
      <DebateThread
        root={root}
        expanded={new Set()}
        collapsed={new Set()}
        meta={{ nodes: 2, depth: 1 }}
        onOpenNode={noop}
        onChallengeNode={noop}
        onToggleExpand={noop}
        onToggleCollapse={noop}
      />
    ));
  });

  it("pins the outline maker prop through the rendered card", () => {
    expectRecordedIdentity(renderToStaticMarkup(<DebateOutline root={root} />));
  });

  it("pins the split maker prop through the rendered focused card", () => {
    const html = renderToStaticMarkup(
      <DebateSplit
        root={root}
        focusNodeId={makerNode.id}
        expanded={new Set()}
        onFocus={noop}
        onOpenNode={noop}
        onChallengeNode={noop}
        onToggleExpand={noop}
      />
    );
    expectRecordedIdentity(html);
  });

  it("pins the map maker prop through the rendered readout", () => {
    expectRecordedIdentity(renderToStaticMarkup(<DebateMap root={root} onOpenSplit={noop} />));
  });

  it("pins the drawer maker prop through the rendered identity line", () => {
    const html = renderToStaticMarkup(
      <NodeDetailDrawer
        node={makerNode}
        token={null}
        onClose={noop}
        onChallenge={noop}
        onFocusRecommendationNode={() => true}
        canFocusRecommendationNode={() => true}
        onQueued={noop}
        onError={noop}
        onAuthRejected={noop}
      />
    );
    expectRecordedIdentity(html);
  });

  it("keeps typed absence visible and gives both shared pills an accessible name", () => {
    const html = renderToStaticMarkup(
      <>
        <ModelMetaLine modelId={null} maker={null} />
        <ModelBadge modelId={null} maker={null} />
      </>
    );
    expect(html.match(/>House unavailable<\/span>/g)).toHaveLength(2);
    expect(html.match(/aria-label="No recorded house is available for this argument\."/g)).toHaveLength(2);
    expect(html).not.toContain("modelDot");
  });
});
