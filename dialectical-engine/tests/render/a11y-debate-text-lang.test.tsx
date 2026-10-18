// @vitest-environment jsdom
/*
 * a11y repair (2026-10-17): a debate's own text (topic, claims, arguments) is tagged with the
 * language it was argued in, so a screen reader reads it in that language's voice while the
 * controls around it stay in the interface's. Outside a debate page nothing is tagged.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { DebateMap } from "../../apps/ui/components/DebateMap.js";
import { DebateSplit } from "../../apps/ui/components/DebateSplit.js";
import { DebateTextLocaleProvider, useDebateTextLang } from "../../apps/ui/components/debateTextLang.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { SynthesisPanel } from "../../apps/ui/components/SynthesisPanel.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import miscEnglish from "../../apps/ui/messages/en/misc.json" with { type: "json" };
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { mount, unmount } from "./task11-harness.js";

function Claim() {
  const textLang = useDebateTextLang();
  return (
    <div>
      <p id="claim" {...textLang}>Munca de acasă este mai productivă.</p>
      <button type="button" id="details">Details</button>
    </div>
  );
}

let mounted: Awaited<ReturnType<typeof mount>> | null = null;
afterEach(async () => {
  if (mounted) await unmount(mounted.root, mounted.host);
  mounted = null;
});

describe("useDebateTextLang", () => {
  it("tags debate text with the debate's language and leaves the controls alone", async () => {
    mounted = await mount(<DebateTextLocaleProvider value="ro"><Claim /></DebateTextLocaleProvider>);
    const claim = document.getElementById("claim")!;
    expect(claim.getAttribute("lang")).toBe("ro");
    expect(claim.getAttribute("dir")).toBe("ltr");
    expect(document.getElementById("details")!.hasAttribute("lang")).toBe(false);
  });

  it("gives a right-to-left language its direction", async () => {
    mounted = await mount(<DebateTextLocaleProvider value="ar"><Claim /></DebateTextLocaleProvider>);
    expect(document.getElementById("claim")!.getAttribute("lang")).toBe("ar");
    expect(document.getElementById("claim")!.getAttribute("dir")).toBe("rtl");
  });

  it("tags nothing outside a debate page", async () => {
    mounted = await mount(<Claim />);
    const claim = document.getElementById("claim")!;
    expect(claim.hasAttribute("lang")).toBe(false);
    expect(claim.hasAttribute("dir")).toBe(false);
  });
});

/*
 * The second pass (2026-10-18), from walking a finished Romanian debate: the synthesis, Split's
 * rebuttal lines, the Map's readout and the drawers' model sentences were still read in the
 * interface's voice. A claim whose text has not arrived yet is read as "Loading…", untagged.
 */
const noop = () => undefined;
const LOADING = debateChromeEnglish["debateChrome.loading"];

function inRomanian(element: ReactElement): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(<DebateTextLocaleProvider value="ro">{element}</DebateTextLocaleProvider>),
    "text/html"
  );
}

function argument(id: string, claim: string, nodeType: string, children: DebateNode[] = []): DebateNode {
  return {
    id, debate_id: "debate:lang", parent_id: "node:root", node_type: nodeType, depth: 1, position: 0, claim,
    status: claim === "" ? "pending" : "complete", materialized_path: `0.${id}`,
    active_generation_id: claim === "" ? null : `generation:${id}`,
    active_generation: claim === "" ? null : { model_id: "gpt-5.6-sol", maker: "OpenAI", argument: `${claim} Pe larg.` },
    maker: "OpenAI", children
  };
}

const ROOT: DebateNode = {
  ...argument("node:root", "Ar trebui orașele să interzică mașinile?", "ROOT_CLAIM", [
    argument("node:pro", "Aerul din centre devine mai curat.", "PRO", [
      argument("node:rebuttal", "Comercianții pierd clienți.", "CON"),
      argument("node:pending", "", "CON")
    ])
  ]),
  parent_id: null,
  depth: 0,
  materialized_path: "0"
};

describe("debate text the first pass missed", () => {
  it("tags the synthesis' own words and leaves its placeholders alone", () => {
    const view = { ready: true, pending: false, streaming: false, structured: false, meta: "" };
    const page = inRomanian(
      <SynthesisPanel {...view} proClaim="Aer mai curat." conClaim="Comerț mai slab." verdict="Interdicția parțială câștigă."
        sections={[{ title: "Key takeaways", items: ["Excepțiile contează."] }]} />
    );
    expect([...page.querySelectorAll(".synthCardClaim")].map((e) => e.getAttribute("lang"))).toEqual(["ro", "ro"]);
    expect(page.querySelector(".synthVerdictBody")?.getAttribute("lang")).toBe("ro");
    expect(page.querySelector(".synthSectionList li")?.getAttribute("lang")).toBe("ro");
    expect(page.querySelector(".synthSectionTitle")?.hasAttribute("lang")).toBe(false);

    const waiting = inRomanian(<SynthesisPanel {...view} proClaim="" conClaim="" verdict="" />);
    expect(waiting.querySelector(".synthVerdictBody")?.hasAttribute("lang")).toBe(false);
    expect(waiting.querySelector(".synthCardClaim")?.hasAttribute("lang")).toBe(false);
  });

  it("tags Split's rebuttal lines and reads a claim not yet arrived as loading", () => {
    const page = inRomanian(
      <DebateSplit root={ROOT} focusNodeId={ROOT.id} expanded={new Set()} onFocus={noop} onOpenNode={noop} onChallengeNode={noop} onToggleExpand={noop} />
    );
    const [said, pending] = [...page.querySelectorAll(".splitRebuttalClaim")];
    expect(said?.textContent?.trim()).toBe("Comercianții pierd clienți.");
    expect(said?.getAttribute("lang")).toBe("ro");
    expect(pending?.textContent?.trim()).toBe(LOADING);
    expect(pending?.hasAttribute("lang")).toBe(false);
  });

  it("names a focused claim not yet arrived as loading in Split", () => {
    const page = inRomanian(
      <DebateSplit root={ROOT} focusNodeId="node:pending" expanded={new Set()} onFocus={noop} onOpenNode={noop} onChallengeNode={noop} onToggleExpand={noop} />
    );
    const heading = page.querySelector(".splitFocusClaim");
    expect(heading?.textContent).toBe(LOADING);
    expect(heading?.getAttribute("aria-label")).toMatch(new RegExp(`: ${LOADING}$`, "u"));
    expect(heading?.hasAttribute("lang")).toBe(false);
  });

  it("tags the Map's readout", () => {
    const page = inRomanian(<DebateMap root={ROOT} onOpenSplit={noop} />);
    expect(page.querySelector(".mapReadoutClaim")?.getAttribute("lang")).toBe("ro");
  });

  it("tags the drawers' model sentences", () => {
    const answer = buildFairShapedAnswer();
    const reviewed = answer.nodes.find((node) => node.review !== null)!;
    const detail = debateDetailFromAnswer(answer);
    const node = detail.tree!.children.find((child) => child.id === reviewed.node_id) ?? detail.tree!.children[0]!;
    const nodeDrawer = inRomanian(
      <NodeDetailDrawer node={node} v3={reviewed} token={null} onClose={noop} onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false} onQueued={noop} onError={noop} onAuthRejected={noop} debateChromeCatalog={debateChromeEnglish} />
    );
    const reasons = [...nodeDrawer.querySelectorAll(".drawerFindingText")].find((e) => e.textContent === reviewed.review!.reasons.join(" "));
    expect(reasons?.getAttribute("lang")).toBe("ro");

    const answerDrawer = inRomanian(
      <AnswerHonestyDrawer answer={answer} live={createLiveRunState()} ledgerDigest={null} ledgerError={null} inspection={null}
        inspectionError={null} onShowInspection={noop} onUnlinkMemory={noop} actionState={null} investigationInput={{}}
        onInvestigationInput={noop} onRecordInvestigation={noop} token={null} onClose={noop}
        answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Pending." }}
        catalog={miscEnglish} debateChromeCatalog={debateChromeEnglish} />
    );
    const said = (text: string) => [...answerDrawer.querySelectorAll(".drawerFindingText")].find((e) => e.textContent === text);
    expect(said(answer.residual_objections[0]!)?.getAttribute("lang")).toBe("ro");
    expect(said(answer.reversal_point!)?.getAttribute("lang")).toBe("ro");
  });
});
