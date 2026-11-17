// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 (2026-11-12): facts a sighted keyboard user never saw, because they lived only in a
 * `title` tooltip (a keyboard never opens one).
 * - DEB1-11: the Tree's score pills (strength kind, uncertainty drivers, V3's exact percentage, the no-score reason) and
 *   the debate page's cut completion reason. The argument's drawer now says each pill's sentence, in the same words.
 * - CSS-7: the synthesis lean's source, and the reason on the drawer's two switched-off feedback buttons.
 * - CHR1-6: the model names on a library row's dots.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Node as ContractNode } from "@debateai/contract";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { SynthesisPanel } from "../../apps/ui/components/SynthesisPanel.js";
import { DebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import type { DebateNode, DebateSummary, NodeScoringPayload } from "../../apps/ui/lib/types.js";
import { formatScorePercent, formatStrengthPill } from "../../apps/ui/lib/scoringFormat.js";
import { v3ScorePercentage } from "../../apps/ui/lib/v3/adapter.js";
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };
import debateDrawersEnglish from "../../apps/ui/messages/en/debateDrawers.json" with { type: "json" };
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const COMPOSE = composeEnglish as Readonly<Record<string, string>>;
const DRAWERS = debateDrawersEnglish as Readonly<Record<string, string>>;

const argumentNode: DebateNode = {
  id: "node:k1b", debate_id: "debate:k1b", parent_id: "node:root", node_type: "PRO", label: null, lens: null, depth: 1, position: 0,
  claim: "The claim under test.", status: "complete", materialized_path: "0.0", active_generation_id: "generation:k1b",
  active_generation: { model_id: "gpt-5.6-sol", maker: "OpenAI", argument: "The argument." }, maker: "OpenAI", children: []
};
const rootNode: DebateNode = { ...argumentNode, id: "node:root", parent_id: null, node_type: "ROOT_CLAIM", depth: 0 };

// Only the fields the drawer and the card pills read.
const scoring = {
  node_id: argumentNode.id,
  scores: { strength: 0.72, uncertainty: 0.48, impact: 0.5 },
  labels: { strength_label: "strong", uncertainty_label: "medium", impact_label: "medium" },
  uncertainty_drivers: [{ code: "no_evidence_refs", label: "no external evidence" }, { code: "ambiguity", label: "ambiguous wording" }],
  uncertainty_source: "heuristic",
  strength_kind: "argument_only",
  rationale: { short: "" },
  holes: [],
  fatal_flags: [],
  recommended_investigations: []
} as unknown as NodeScoringPayload;

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
function drawer(extra: Partial<Parameters<typeof NodeDetailDrawer>[0]> = {}): ReactElement {
  return (
    <NodeDetailDrawer
      node={argumentNode}
      token={null}
      onClose={() => undefined}
      onFocusRecommendationNode={() => false}
      canFocusRecommendationNode={() => false}
      onQueued={() => undefined}
      onError={() => undefined}
      onAuthRejected={() => undefined}
      {...extra}
    />
  );
}
/** Text a sighted reader sees: not inside a `title`, an `aria-label` or a visually hidden span. */
const visibleText = (container: HTMLElement): string => {
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".srOnly").forEach((element) => element.remove());
  return copy.textContent ?? "";
};

describe("DEB1-11: the drawer says what the Tree's score pills say only in their tooltip", () => {
  // Fix round (B1): the facts, in plain words. The uncertainty pill's "(UNC 48 · heuristic)" suffix is an abbreviation
  // and a raw source name, so the drawer says the drivers only.
  it("V2 scores: the strength kind's sentence and the uncertainty's drivers, without the abbreviation or the source", async () => {
    const strengthTitle = formatStrengthPill("argument_only", formatScorePercent(0.72)).title!;
    const container = await render(drawer({ scoring }));
    const rationale = `.drawerScoringRationale[aria-label="${DRAWERS["debateDrawers.node.scoringRationale"]}"]`;
    const lines = [...container.querySelectorAll(`${rationale} p`)].map((line) => line.textContent);
    expect(lines).toEqual([strengthTitle, "no external evidence; ambiguous wording"]);
    expect(visibleText(container)).not.toContain("UNC");
    expect(visibleText(container)).not.toContain("heuristic");
  });

  it("V2 scores with no drivers and a plain strength: no line is added", async () => {
    const plain = { ...scoring, uncertainty_drivers: [], strength_kind: "evidence_weighted" } as unknown as NodeScoringPayload;
    const container = await render(drawer({ scoring: plain }));
    expect(container.querySelector(`.drawerScoringRationale[aria-label="${DRAWERS["debateDrawers.node.scoringRationale"]}"]`)).toBeNull();
  });

  // Fix round (B1): the honesty table already shows both percentages with a plain source label; the only tooltip fact
  // left is how a ROUNDED percentage was rounded, said under the table. The pills' whole sentences carried the raw
  // source id, kind and replay handle, so they are no longer shown.
  it("V3 scores: a rounded percentage's detail shows; the pills' sentences with ids and kinds do not", async () => {
    const base = buildFairShapedAnswer().nodes[0]! as ContractNode;
    const v3: ContractNode = { ...base, base_score: { ...base.base_score, value: 0.6234917 } };
    const container = await render(drawer({ v3 }));
    expect(visibleText(container)).toContain(v3ScorePercentage(0.6234917).detail);
    expect(visibleText(container)).not.toContain(v3ScorePercentage(v3.final_strength!.value).detail);
    expect(visibleText(container)).not.toContain(base.base_score.replay_handle);
    expect(visibleText(container)).not.toContain(base.base_score.source);
    expect(container.querySelector("[data-v3-score-detail]")).toBeNull();
  });

  it("no score: the question line's reason, in plain words", async () => {
    const question = await render(drawer({ node: rootNode }));
    expect(visibleText(question)).toContain(DRAWERS["debateDrawers.node.noScore.question"]);
    expect(visibleText(question)).not.toContain(COMPOSE["compose.v3.score.questionHasNoScore"]);
  });
});

describe("DEB1-11: a card with no score says why in its drawer, not only in the pill's tooltip", () => {
  // The page knows which of the two it is (lib/v3/adapter.ts v3NodeScoreState) and hands the drawer the reason.
  // Fix round (B1): the reason in plain words of the drawer's own catalog, not the pill tooltip's ("V3", "served answer").
  it.each([
    ["NO_SERVED_ANSWER", "debateDrawers.node.noScore.notYet", "compose.v3.score.answerHasNoScoreYet"],
    ["NODE_ABSENT_FROM_SERVED_ANSWER", "debateDrawers.node.noScore.notInAnswer", "compose.v3.score.cardHasNoScore"]
  ] as const)("%s: the reason shows in the drawer in plain words", async (reason, key, tooltipKey) => {
    const container = await render(drawer({ scoreAbsence: reason }));
    const lines = [...container.querySelectorAll(".drawerFindingText")].map((line) => line.textContent);
    expect(lines).toContain(DRAWERS[key]);
    expect(visibleText(container)).not.toContain(COMPOSE[tooltipKey]);
    expect(visibleText(container)).not.toContain("V3");
  });

  it("no reason handed over and not the question card: nothing is claimed", async () => {
    const container = await render(drawer());
    const text = container.textContent ?? "";
    for (const key of ["debateDrawers.node.noScore.notYet", "debateDrawers.node.noScore.notInAnswer", "debateDrawers.node.noScore.question"]) {
      expect(text).not.toContain(DRAWERS[key]);
    }
  });

  it("the debate page hands the drawer the same state the Tree's card shows", () => {
    const page = readFileSync(resolve(process.cwd(), "apps/ui/app/debate/[id]/DebatePageClient.tsx"), "utf8");
    expect(page).toMatch(/scoreAbsence=\{v3ScoreAbsenceOf\(v3NodeScoreState\(detailNode, v3NodeById\)\)\}/);
  });
});

describe("CSS-7: the drawer's switched-off feedback buttons are described by their visible reason", () => {
  it("both buttons point at the line that says why", async () => {
    const container = await render(drawer({ scoring }));
    const reason = DRAWERS["debateDrawers.node.scoringFeedbackUnavailable"];
    const group = container.querySelector<HTMLElement>('[data-scoring-feedback="user-feedback"]')!;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      const ids = (button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      expect(ids).toHaveLength(1);
      const line = document.getElementById(ids[0]!);
      expect(line?.textContent).toBe(reason);
      expect(line?.classList.contains("srOnly")).toBe(false);
    }
  });
});

describe("CSS-7: the synthesis lean's source is said, not only hovered", () => {
  const view = {
    ready: true, pending: false, streaming: false, structured: false, proClaim: "Pro.", conClaim: "Con.", verdict: "Verdict.", meta: "",
    lean: { pct: 60, label: "Pro", source: "structural" as const }
  };
  // Fix round (B5): the lean is a plain div with no role, so `aria-describedby` on it is ignored by most readers and
  // doubles the sentence where honoured (the line is read anyway). The line stands alone.
  it("a line after the lean bar carries the tooltip's sentence, and the lean does not point at it", () => {
    const html = renderToStaticMarkup(<SynthesisPanel {...view} />);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    const line = host.querySelector<HTMLElement>(".synthLeanSource")!;
    expect(line).not.toBeNull();
    expect(line.textContent).toBe(DRAWERS["debateDrawers.synthesis.leanStructuralTitle"]);
    const lean = host.querySelector<HTMLElement>(".synthLean")!;
    expect(lean.hasAttribute("aria-describedby")).toBe(false);
    expect(lean.getAttribute("title")).toBe(line.textContent);
  });
});

describe("CHR1-6: a library row names its models where a keyboard reaches them", () => {
  it("the row's link carries the model names, not only the dots' tooltips", () => {
    const debate = {
      id: "run:k1b", topic: "A library question", status: "complete", created_at: "2026-11-12T10:00:00.000Z", completed_at: null,
      models: ["claude-sonnet-4", "gpt-5.6-sol"]
    } as DebateSummary;
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <>{DebatesBuffer({ debates: [debate], catalog: homeEnglish, timeCatalog: timeEnglish, locale: "en", checkingLabel: "Checking" })}</>
    );
    const link = host.querySelector<HTMLAnchorElement>("a.libRow")!;
    const names = link.querySelector<HTMLElement>(".libRowModels")!;
    expect(names).not.toBeNull();
    expect(names.closest(".libRowMeta")).not.toBeNull();
    expect(names.textContent).toContain("Claude");
    expect(names.textContent).toContain("GPT");
    expect(link.querySelector(".libDots")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the CSS that shows these lines to a keyboard user", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: RegExp): string => {
    const match = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`));
    expect(match, String(selector)).not.toBeNull();
    return match![1]!;
  };
  it("the completion reason in the debate header wraps instead of being cut to one line", () => {
    const body = rule(/\.debateTopClaim \.topSwitchStatus/);
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/-webkit-line-clamp:\s*4/);
  });
  it("the lean's source and a row's model names stay hidden until a keyboard ring is on their panel or row", () => {
    expect(rule(/\.synthPanel:not\(:focus-visible\) \.synthLeanSource/)).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    expect(rule(/\.libRow:not\(:focus-visible\) \.libRowModels/)).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });
});
