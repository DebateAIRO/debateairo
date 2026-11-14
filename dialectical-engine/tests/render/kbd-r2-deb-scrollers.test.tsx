// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { DebateThread } from "../../apps/ui/components/DebateThread.js";
import { DebateWorkspaceDrawer } from "../../apps/ui/components/DebateWorkspaceDrawer.js";
import { InvestigationDrawer } from "../../apps/ui/components/InvestigationDrawer.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { StoryPanel } from "../../apps/ui/components/StoryPanel.js";
import { SynthesisPanel } from "../../apps/ui/components/SynthesisPanel.js";
import { ScoringDiagnosticsDrawer } from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { toStoryView } from "../../apps/ui/lib/v3/storyView.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/*
 * Keyboard audit round 2 (2026-11-12), DEB2-1/2/3/16, DEB1-10, CSS-3: a box that scrolls but holds
 * no control cannot be scrolled from the keyboard in Safari (and, inside a modal whose trap moves
 * focus only between Tab stops, in no browser). Each such box is a named Tab stop itself, as the
 * cookie card's list and the policy body are since round 1.
 */
const noop = () => undefined;
const detail = debateDetailFromRunProjection({
  run_ref: "run:scrollers", question_line: "A question under test?", state: "QUEUED", terminal_reason: null, hold_until: null
});
const node: DebateNode = {
  id: "node:position", debate_id: "debate:scrollers", parent_id: "node:root", node_type: "PRO", label: null, lens: null,
  depth: 1, position: 0, claim: "The position claim under test.", status: "complete", materialized_path: "0.0",
  active_generation_id: "generation:scrollers",
  active_generation: { model_id: "gpt-5.6-sol", maker: "OpenAI", argument: "The argument." },
  maker: "OpenAI", children: []
};

let root: Root | null = null;

async function mount(element: ReactElement): Promise<HTMLElement> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function pressTab(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
}

function expectNamedTabStop(element: Element | null, name: string): void {
  expect(element, "the scroller is rendered").not.toBeNull();
  expect(element!.getAttribute("tabindex")).toBe("0");
  expect(element!.getAttribute("aria-label")).toBe(name);
}

const drawers: ReadonlyArray<readonly [string, () => ReactElement, string]> = [
  ["Workspace", () => <DebateWorkspaceDrawer debate={detail} singleShot={null} onClose={noop} />, "Workspace artifacts"],
  [
    "Honesty",
    () => (
      <AnswerHonestyDrawer
        answer={buildFairShapedAnswer()} live={createLiveRunState()} ledgerDigest={null} ledgerError={null}
        inspection={null} inspectionError={null} onShowInspection={noop} onUnlinkMemory={noop} actionState={null}
        investigationInput={{}} onInvestigationInput={noop} onRecordInvestigation={noop}
        answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Pending." }} token={null} onClose={noop}
      />
    ),
    "Honesty & provenance"
  ],
  [
    "Argument detail",
    () => (
      <NodeDetailDrawer
        node={node} token={null} onClose={noop} onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false} onQueued={noop} onError={noop} onAuthRejected={noop}
      />
    ),
    "Argument detail"
  ],
  ["Investigation", () => <InvestigationDrawer node={node} status="working" onClose={noop} onResolve={noop} onClear={noop} />, "Investigation"],
  [
    "Scoring diagnostics",
    () => (
      <ScoringDiagnosticsDrawer
        scoringState={{ status: "idle", data: null, error: null }}
        refreshState={{ status: "idle", jobId: null, error: null }}
        onClose={noop}
      />
    ),
    "Scoring diagnostics"
  ]
];

describe("every debate drawer's scrolling body is a Tab stop the modal trap reaches", () => {
  it.each(drawers)("%s", async (_name, element, label) => {
    const host = await mount(element());
    const body = host.querySelector(".drawerBody");
    expectNamedTabStop(body, label);
    expect(body!.getAttribute("role")).toBe("region");
    const stops: Element[] = [];
    await act(async () => {
      for (let step = 0; step < 40 && !stops.includes(document.activeElement!); step += 1) {
        stops.push(document.activeElement!);
        pressTab();
      }
    });
    expect(stops).toContain(body);
  });
});

describe("the page's own scroll boxes are named Tab stops", () => {
  it("the Synthesis panel", () => {
    const html = renderToStaticMarkup(
      <SynthesisPanel ready={false} pending streaming={false} structured={false} proClaim="" conClaim="" verdict="" meta="" />
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    expectNamedTabStop(host.querySelector("aside.synthPanel"), "Synthesis");
  });

  it.each(["WRITING", "UNAVAILABLE", "READY"] as const)("the story strip's body while %s", (status) => {
    const html = renderToStaticMarkup(
      <StoryPanel view={toStoryView(STORY_FIXTURE_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, "en")} catalog={publicEnglish} locale="en" />
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const body = host.querySelector(".storyPanelBody");
    expectNamedTabStop(body, (publicEnglish as Record<string, string>)["public.story.panelTitle"]!);
    expect(body!.getAttribute("role")).toBe("region");
  });

  it("the Thread view", async () => {
    const host = await mount(
      <DebateThread
        root={{ ...node, id: "node:root", parent_id: null, node_type: "ROOT", depth: 0, children: [] }}
        expanded={new Set()} collapsed={new Set()} meta={{ nodes: 1, depth: 0 }}
        onOpenNode={noop} onToggleExpand={noop} onToggleCollapse={noop}
      />
    );
    const thread = host.querySelector(".thread");
    expectNamedTabStop(thread, "Thread");
    expect(thread!.getAttribute("role")).toBe("region");
  });

  it("the single-shot result (rendered only for a V2 single-shot run, so read from the source)", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/ui/app/debate/[id]/DebatePageClient.tsx"), "utf8");
    expect(source).toContain('<div className="singleShot scroll" tabIndex={0} role="region" aria-label={t(catalog, "debateChrome.singleShot.result")}>');
  });
});

describe("DEB2-15: \"Open target\" reads the new argument from the top of the drawer's body", () => {
  it("resets the body's scroll, not the panel's", async () => {
    const host = await mount(
      <NodeDetailDrawer
        node={node} token={null} onClose={noop} onFocusRecommendationNode={() => true}
        canFocusRecommendationNode={() => true} onQueued={noop} onError={noop} onAuthRejected={noop}
      />
    );
    const body = host.querySelector<HTMLElement>(".drawerBody")!;
    body.scrollTop = 300;
    expect(body.scrollTop).toBe(300);
    await act(async () =>
      root!.render(
        <NodeDetailDrawer
          node={{ ...node, id: "node:target", claim: "The target claim." }} token={null} onClose={noop}
          onFocusRecommendationNode={() => true} canFocusRecommendationNode={() => true} onQueued={noop}
          onError={noop} onAuthRejected={noop}
        />
      )
    );
    expect(body.textContent).toContain("The target claim.");
    expect(body.scrollTop).toBe(0);
  });
});

describe("DEB2-11: the investigation drawer returns focus to returnFocusRef when its opener is gone", () => {
  it("falls back to the named control", async () => {
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.append(opener, fallback);
    opener.focus();
    const returnFocusRef = { current: null as HTMLElement | null };
    await mount(<InvestigationDrawer node={node} status="working" onClose={noop} onResolve={noop} onClear={noop} returnFocusRef={returnFocusRef} />);
    opener.remove();
    returnFocusRef.current = fallback;
    await act(async () => root!.render(<></>));
    expect(document.activeElement).toBe(fallback);
  });
});
