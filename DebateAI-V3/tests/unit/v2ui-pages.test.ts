import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  debateHeaderElementIntrinsicWidth,
  measureDebateHeaderCollapse,
  observeDebateHeaderFit,
  readDebateHeaderGeometry,
  shouldCollapseDebateHeaderActions
} from "../../apps/v2-ui/lib/debateHeaderOverflow.js";

/**
 * UI-01 page-wiring guards. The root suite has no DOM renderer, so these
 * assert on the page SOURCE — the same style V2 used for its own page
 * invariants (app/**\/*.source-test.mjs), but in the ENFORCED root vitest
 * suite (the rev-3 advisory: a node --test [...] glob silently runs zero
 * tests).
 *
 * What they protect: the V3 ask contract requires seven values the asker must
 * supply explicitly (S14 precedent, AC-76 — the UI invents none of them). A
 * form that carries the state but never binds an input, or a submit gate that
 * ignores them, ships a button whose only outcome is ASK_FIELD_REQUIRED.
 */

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../apps/v2-ui/${relativePath}`, import.meta.url)), "utf8");
}

function region(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  expect(startIndex, `missing region start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = text.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing region end: ${end}`).toBeGreaterThan(startIndex);
  return text.slice(startIndex, endIndex);
}

function buttonBlocksContaining(text: string, label: string): string[] {
  return [...text.matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .map(([block]) => block)
    .filter((block) => block.includes(label));
}

/** Every field apps/v2-ui/lib/api.ts::createDebate demands from the asker. */
const REQUIRED_ASK_FIELDS = [
  { config: "risk_tier", state: "riskTier", source: "page", write: "setRiskTier(event.target.value" },
  { config: "composition_budget_tier", state: "budgetTier", source: "page", write: "setBudgetTier(event.target.value" },
  { config: "agent_count", state: "agentCount", source: "defaults", write: "onAgentCountChange(event.target.value" },
  { config: "decision_owner", state: "decisionOwner", source: "defaults", write: "onDecisionOwnerChange(event.target.value" },
  { config: "action_owner", state: "actionOwner", source: "defaults", write: "onActionOwnerChange(event.target.value" },
  { config: "decision_scope", state: "decisionScope", source: "defaults", write: "onDecisionScopeChange(event.target.value" },
  { config: "as_of", state: "asOf", source: "defaults", write: "onAsOfChange(event.target.value" }
] as const;

describe("v2-ui /new collects every value the V3 ask requires", () => {
  const newPage = source("app/new/page.tsx");
  const defaults = source("app/new/defaults.tsx");

  it.each(REQUIRED_ASK_FIELDS)("binds a control the asker can actually fill for $config", (field) => {
    // A controlled input: the state is rendered as a value AND an onChange
    // writes it back. State that is only declared can never be supplied.
    const controlSource = field.source === "page" ? newPage : defaults;
    expect(controlSource).toMatch(new RegExp(`value=\\{${field.state}\\}`));
    expect(controlSource).toContain(field.write);
  });

  it("gates the submit button on every required ask field, not just the topic", () => {
    const readyLine = newPage.split("\n").find((line) => line.includes("const ready ="));
    expect(readyLine).toBeDefined();
    const readyBlock = newPage.slice(newPage.indexOf("const ready ="), newPage.indexOf("async function submit"));
    for (const field of REQUIRED_ASK_FIELDS) {
      expect(readyBlock).toContain(field.state);
    }
  });

  it("never silently posts V2 controls the V3 ask cannot carry", () => {
    // V2's branching / concurrency / max-token / role-override knobs have no
    // slot in the V3 ask. They may stay on screen (design authority) but must
    // not be packed into a config the ask builder will drop on the floor.
    const submitBlock = newPage.slice(newPage.indexOf("async function submit"), newPage.indexOf("return ("));
    for (const dropped of ["branching", "concurrency", "maxTokens", "role_overrides", "adaptive_expansion"]) {
      expect(submitBlock).not.toContain(dropped);
    }
  });

  it("derives allowed depths and attempt disclosure from the deployment register envelope", () => {
    expect(newPage).toContain("contractClient.readDeployment");
    expect(newPage).toContain("runCostEnvelopeFromDeployment");
    expect(newPage).toContain("selectRunCostEnvelopeMembers");
    expect(newPage).toContain("selectRunCostEnvelopeMember");
    expect(newPage).toContain("maxModelAttempts");
    expect(newPage).not.toContain("useState(1)");
    expect(newPage).not.toContain("up to 9 model attempts");
  });
});

describe("v2-ui export never claims a ledger it does not carry (S14 dual gate)", () => {
  const client = source("app/debate/[id]/DebatePageClient.tsx");
  const drawer = source("components/AnswerHonestyDrawer.tsx");

  it("builds the export through one decision that both surfaces share", () => {
    // S14 gated the export affordance on answer AND ledgerDigest
    // (web/app/debate/[id]/DebatePageClient.tsx:109). Restoring that gate in
    // two places by hand is how the toast and the drawer copy drifted apart
    // from the payload in the first place — so there is now ONE decision.
    expect(client).toContain("buildAnswerExport(");
    expect(drawer).toContain("answerExport");
  });

  it("hangs the top-bar Export affordance and its toast off that decision", () => {
    // RED evidence for this rework: the shipped code rendered the affordance
    // on `exportHref && answer` and hardcoded the toast string, so an answer
    // with no ledger digest still offered "Exported answer + honesty + ledger".
    expect(client).not.toContain('showToast("Exported answer + honesty + ledger")');
    expect(client).toMatch(/showToast\(answerExport\.toast\)/);
    expect(client).not.toMatch(/\{exportHref && answer \?/);
  });

  it("never hardcodes the '+ ledger' claim in either surface's label", () => {
    for (const [name, text] of [
      ["DebatePageClient", client],
      ["AnswerHonestyDrawer", drawer]
    ] as const) {
      const hardcoded = text.match(/(?:Export|Exported) answer \+ honesty \+ ledger/g) ?? [];
      expect(hardcoded, `${name} hardcodes the ledger claim`).toEqual([]);
    }
  });

  it("states WHY the export is missing instead of always blaming a pending load", () => {
    // "Export becomes available once the ledger digest loads" is false when the
    // digest read FAILED — it will never load. The reason must come from the
    // decision, not from a fixed string.
    expect(drawer).not.toContain("Export becomes available once the ledger digest loads.");
    expect(drawer).toMatch(/answerExport\.message/);
  });
});

describe("v2-ui scoring copy consults the V3 absence rule before crying failure", () => {
  const copy = source("lib/scoringStatusCopy.ts");

  it("asks the V3 layer for a label before falling through to V2's failure copy", () => {
    const unavailableBranch = copy.slice(
      copy.indexOf('if (input.scoringStatus === "unavailable")'),
      copy.indexOf('if (isStaleInputHashMismatch(input))')
    );
    expect(unavailableBranch).toContain("v3ScoringStatusLabel(input.reason)");
    // The V3 branch must come BEFORE the failure branch, or the label never wins.
    expect(unavailableBranch.indexOf("v3ScoringStatusLabel")).toBeLessThan(
      unavailableBranch.indexOf("Scoring check failed")
    );
  });

  // lib/scoringResponse.ts is V2-legacy and does not compile under the ROOT
  // program's stricter options, so the root suite cannot import it to exercise
  // formatScoringVisibilityState directly. The DECISION it makes is testable
  // though — v3ScoringStatusLabel lives in the adapter and is covered by
  // v2ui-data-layer.test.ts — so what is pinned here is that this file
  // consults that decision, uses it as the title, and reaches it first.
  it("titles the scoring-insights strip through the same V3 rule (UI-02a)", () => {
    const responseCopy = source("lib/scoringResponse.ts");
    expect(responseCopy).toContain('import { v3ScoringStatusLabel } from "./v3/adapter"');
    expect(responseCopy).toContain("const v3ScoringLabel = v3ScoringStatusLabel(reason);");
    expect(responseCopy).toContain("title: v3ScoringLabel,");
    // The V3 branch must be reached before BOTH V2 fall-throughs, or a reason
    // mentioning a model/provider or the generic failure title wins instead.
    expect(responseCopy.indexOf("v3ScoringStatusLabel(reason)")).toBeLessThan(
      responseCopy.indexOf("looksProviderOrTokenRequired(reason)")
    );
    expect(responseCopy.indexOf("v3ScoringStatusLabel(reason)")).toBeLessThan(
      responseCopy.indexOf('title: "Scoring unavailable"')
    );
    // V2's own copy for real failures survives untouched.
    expect(responseCopy).toContain('title: "Scoring unavailable"');
  });
});

describe("UI-02a: the node card shows V3's recorded numbers, in V2's own vocabulary", () => {
  const adapter = source("lib/v3/adapter.ts");
  const canvas = source("components/DebateCanvas.tsx");
  const debatePage = source("app/debate/[id]/DebatePageClient.tsx");
  const drawer = source("components/NodeDetailDrawer.tsx");

  it("passes the served answer's contract nodes into the canvas", () => {
    expect(debatePage).toContain("v3NodesById={v3NodeById}");
    // v3NodeById is null while no served answer exists — the canvas must be
    // able to tell "not served yet" from "no V3 data path at all".
    expect(debatePage).toContain("answer === null ? null : contractNodesById(answer)");
  });

  it("resolves each card through the adapter instead of reading fields inline", () => {
    expect(canvas).toContain("v3ScorePresentation(v3NodeScoreState(node, v3NodesById))");
    // No hand-rolled field access: the projection owns the absence rules.
    expect(canvas).not.toContain(".base_score.");
    expect(canvas).not.toContain(".final_strength.");
  });

  it("renders both numbers in V2's existing scoreBadge vocabulary, not a new widget", () => {
    const badges = canvas.slice(canvas.indexOf("function V3ScoreBadges"), canvas.indexOf("function summarizeCardScoringIssues"));
    expect(badges).toContain('className="scoreBadgeButton"');
    expect(badges).toContain("scoreBadge");
    expect(badges).toContain("{badge.pillText}");
    // The label/provenance travels with the number as title AND accessible name.
    expect(badges).toContain("aria-label={badge.title}");
    expect(badges).toContain("title={badge.title}");
  });

  it("renders the typed absence rather than a placeholder number (DR-115)", () => {
    const badges = canvas.slice(canvas.indexOf("function V3ScoreBadges"), canvas.indexOf("function summarizeCardScoringIssues"));
    expect(badges).toContain('presentation.status === "ABSENT"');
    expect(badges).toContain("{presentation.badge.pillText}");
    expect(badges).toContain('className="scoreBadge unavailable"');
    // No literal stand-in for a real number anywhere in the V3 badge block.
    expect(badges).not.toMatch(/>\s*(0|—|-{1,2}|N\/A)\s*</);
  });

  it("gets the ruled percentage from the adapter instead of formatting a V3 number on the card", () => {
    const badges = canvas.slice(canvas.indexOf("function V3ScoreBadges"), canvas.indexOf("function summarizeCardScoringIssues"));
    for (const transform of ["formatScorePercent", "toFixed", "Math.round", "* 100"]) {
      expect(badges).not.toContain(transform);
    }
    expect(badges).toContain("{badge.pillText}");
  });

  it("keeps the fuller record on the executable drawer projection and forbids raw-value JSX", () => {
    expect(drawer).toContain("v3NodeScoreDetails(v3)");
    expect(drawer).not.toContain("base_score");
    expect(drawer).not.toContain("final_strength");
  });

  it("keeps adapter source text-searchable while preserving escaped NUL delimiters", () => {
    expect(adapter).not.toContain("\u0000");
    expect(adapter).toContain("\\u0000");
  });
});

describe("v2-ui /admin/workers never states a count it could not read", () => {
  const workersPage = source("app/admin/workers/page.tsx");

  it("gates every fleet tally behind a read that actually succeeded (DR-115)", () => {
    // Found live: with fleet state UNAVAILABLE the page still printed
    // Online 0 / Degraded 0 / Offline 0 / "0 total" / "No workers registered."
    // — five assertions of fact next to a loud refusal to supply the fact.
    expect(workersPage).toContain("const fleetKnown =");
    for (const tally of ["online", "degraded", "offline", "capabilities"]) {
      expect(workersPage).toMatch(new RegExp(`value: count\\(${tally}\\)`));
    }
    expect(workersPage).toContain('fleetKnown ? `${workers.length} total` : "— total"');
    expect(workersPage).toContain("worker count is unknown");
  });
});

describe("v2-ui /settings reports the deployment without inventing money", () => {
  const settingsPage = source("app/settings/page.tsx");

  it("reads the deployment projection instead of a V2 settings resource", () => {
    expect(settingsPage).toContain("getSettingsView");
    expect(settingsPage).not.toContain("apiFetch");
  });

  it("renders no fabricated spend or cap number (DR-115)", () => {
    expect(settingsPage).not.toMatch(/toFixed\(/);
    expect(settingsPage).not.toMatch(/\$\{?[a-zA-Z_]*[Ss]pend/);
  });

  it("offers no write path, because deployment configuration is register-governed", () => {
    expect(settingsPage).not.toContain("saveSettings");
    expect(settingsPage).not.toMatch(/method:\s*"PUT"/);
  });
});

describe("UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps", () => {
  const client = source("app/debate/[id]/DebatePageClient.tsx");
  const canvas = source("components/DebateCanvas.tsx");
  const globals = source("app/globals.css");
  const drawer = source("components/NodeDetailDrawer.tsx");
  const thread = source("components/DebateThread.tsx");
  const tree = source("components/DebateTree.tsx");
  const settings = source("app/settings/page.tsx");

  it("ports CanvasViewport without dropping the approved V3 score and maker inputs", () => {
    expect(canvas).toContain('import { CanvasViewport } from "@/components/CanvasViewport"');
    expect(canvas).toContain("<CanvasViewport");
    expect(canvas).toContain("v3ScorePresentation(v3NodeScoreState(node, v3NodesById))");
    expect(canvas).toContain("function V3ScoreBadges");
    expect(canvas).toContain('<ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />');
    expect(client).toContain("v3NodesById={v3NodeById}");
  });

  it("kills MUT-A: deleting the V3ScoreBadges JSX render site", () => {
    const nodeHeader = region(canvas, '<div className="nodeHeader">', "{independencePill ? (");
    expect(nodeHeader).toContain("<V3ScoreBadges");
    expect(nodeHeader).toContain("presentation={v3Scores}");
  });

  it("kills MUT-C: deleting the maker meta line from the contentful node header", () => {
    const nodeHeader = region(canvas, '<div className="nodeHeader">', "<ScoringErrorBoundary>");
    expect(nodeHeader).toMatch(/\{generation \|\| node\.maker !== undefined \? \([\s\S]*?<ModelMetaLine[\s\S]*?maker=\{node\.maker\}[\s\S]*?\) : null\}/);
  });

  it("uses DR-160 content-aware overflow instead of a fixed collapse breakpoint", () => {
    expect(client).toContain('className="debateTopIdentityRow"');
    expect(client).toContain('className="debateTopControlRow"');
    expect(client).toContain('<details className="debateOverflow">');
    expect(client).toContain('aria-label="More debate actions"');
    expect(client).toContain("measureDebateHeaderCollapse");
    expect(client).toContain("readDebateHeaderGeometry");
    expect(client).toContain("observeDebateHeaderFit({");
    expect(client).toContain("targets: [header, titleMeasure, inlineActions]");
    // Kills B6-W1: replacing the live header width with availableWidth: 1e9.
    expect(client).toContain("readDebateHeaderGeometry({");
    // Kills B6-W2: multiplying the title mirror's intrinsic width by zero.
    expect(client).toContain("titleMeasure,");
    // Kills B6-W3: forcing setHeaderActionsCollapsed(false) at the call site.
    expect(client).toContain("setHeaderActionsCollapsed(fit.collapse);");
    const measurementEffect = region(client, "useLayoutEffect(() => {", "const detailNode =");
    expect(measurementEffect.match(/setHeaderActionsCollapsed\(/g)).toHaveLength(1);
    // Kills B6-W4: replacing the observer callback with measure: () => {}.
    expect(client).toContain("measure: measureHeaderFit");
    expect(client).toContain('data-actions-collapsed={headerActionsCollapsed ? "true" : "false"}');
    expect(globals).toMatch(/\[data-actions-collapsed="true"\][\s\S]*?\.debateInlineActions\s*\{[\s\S]*?visibility:\s*hidden;/);
    expect(globals).toMatch(/\[data-actions-collapsed="true"\][\s\S]*?\.debateOverflow\s*\{[\s\S]*?display:\s*block;/);
    expect(globals).toMatch(/@media \(max-width:\s*920px\)\s*\{[\s\S]*?\.debateTopBar\s*\{[\s\S]*?grid-template-rows:\s*auto auto;/);
    expect(globals).toMatch(/@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.debateInlineActions\s*\{[\s\S]*?display:\s*none;[\s\S]*?\.debateOverflow\s*\{[\s\S]*?display:\s*block;/);
  });

  it("keeps the ruled predicate boundary exact", () => {
    expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 34 })).toBe(true);
    expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 159 })).toBe(true);
    expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 526 })).toBe(false);
  });

  it("kills B4 shrunk-rect regression and MUT-E through synthetic intrinsic action-row arithmetic", () => {
    expect(
      debateHeaderElementIntrinsicWidth({
        scrollWidth: 252,
        getBoundingClientRect: () => ({ width: 44 })
      })
    ).toBe(252);

    const phone = measureDebateHeaderCollapse({
      availableWidth: 420,
      layout: "stacked",
      headerPaddingInline: 16,
      headerGap: 6,
      identityGap: 8,
      claimGap: 12,
      titleIntrinsicWidth: 193,
      claimFixedWidths: [60],
      identityFixedWidths: [44],
      controlGap: 8,
      controlIntrinsicWidths: [300, 44, 252]
    });

    expect(phone).toEqual({ neededWidth: 628, availableWidth: 420, collapse: true });
  });

  it("reads live header geometry behaviorally before applying the collapse predicate", () => {
    type StubElement = {
      name: string;
      clientWidth: number;
      scrollWidth: number;
      width: number;
      children: StubElement[];
      classes: string[];
      getBoundingClientRect(): { width: number };
      classList: { contains(name: string): boolean };
    };
    const element = (
      name: string,
      options: Partial<Pick<StubElement, "clientWidth" | "scrollWidth" | "width" | "children" | "classes">> = {}
    ): StubElement => {
      const stub: StubElement = {
        name,
        clientWidth: options.clientWidth ?? 0,
        scrollWidth: options.scrollWidth ?? 0,
        width: options.width ?? 0,
        children: options.children ?? [],
        classes: options.classes ?? [],
        getBoundingClientRect: () => ({ width: stub.width }),
        classList: { contains: (className) => stub.classes.includes(className) }
      };
      return stub;
    };
    const title = element("title", { scrollWidth: 193, width: 44, classes: ["debateTopTitleMeasure"] });
    const hiddenClaimAction = element("hidden-claim", { scrollWidth: 999 });
    const claim = element("claim", {
      children: [title, element("visible-claim", { scrollWidth: 60 }), hiddenClaimAction]
    });
    const identity = element("identity", { children: [claim, element("identity-action", { width: 44 })] });
    const overflow = element("overflow", { scrollWidth: 999, classes: ["debateOverflow"] });
    const controls = element("controls", {
      children: [element("control-a", { scrollWidth: 300 }), element("control-b", { width: 44 }), overflow]
    });
    const header = element("header", { clientWidth: 420 });
    const styles: Record<string, { display: string; paddingInlineStart: string; paddingInlineEnd: string; columnGap: string }> = {
      header: { display: "grid", paddingInlineStart: "8px", paddingInlineEnd: "8px", columnGap: "6px" },
      identity: { display: "flex", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "8px" },
      claim: { display: "flex", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "12px" },
      controls: { display: "flex", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "8px" },
      "hidden-claim": { display: "none", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      "visible-claim": { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      "identity-action": { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      "control-a": { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      "control-b": { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      overflow: { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" },
      title: { display: "block", paddingInlineStart: "0", paddingInlineEnd: "0", columnGap: "0" }
    };

    expect(readDebateHeaderGeometry({ header, identity, claim, titleMeasure: title, controls }, (node) => styles[node.name]!)).toEqual({
      availableWidth: 420,
      layout: "stacked",
      headerPaddingInline: 16,
      headerGap: 6,
      identityGap: 8,
      claimGap: 12,
      titleIntrinsicWidth: 193,
      claimFixedWidths: [60],
      identityFixedWidths: [44],
      controlGap: 8,
      controlIntrinsicWidths: [300, 44]
    });
  });

  it("kills MUT-G title width x0 and MUT-F always-collapse through the measurement path", () => {
    const common = {
      availableWidth: 1280,
      layout: "row" as const,
      headerPaddingInline: 44,
      headerGap: 18,
      identityGap: 18,
      claimGap: 12,
      claimFixedWidths: [60],
      identityFixedWidths: [100],
      controlGap: 8,
      controlIntrinsicWidths: [196, 98, 252]
    };

    expect(measureDebateHeaderCollapse({ ...common, titleIntrinsicWidth: 880 }).collapse).toBe(true);
    expect(measureDebateHeaderCollapse({ ...common, titleIntrinsicWidth: 193 }).collapse).toBe(false);
  });

  it("kills MUT-H observer and resize-listener removal through the observation seam", () => {
    const observed: string[] = [];
    const removed: string[] = [];
    let disconnected = false;
    let resizeListener: (() => void) | null = null;
    let measurements = 0;
    const cleanup = observeDebateHeaderFit({
      observer: {
        observe: (target: string) => observed.push(target),
        disconnect: () => {
          disconnected = true;
        }
      },
      targets: ["header", "title", "actions"],
      resizeTarget: {
        addEventListener: (type, listener) => {
          expect(type).toBe("resize");
          resizeListener = listener;
        },
        removeEventListener: (type) => removed.push(type)
      },
      measure: () => {
        measurements += 1;
      }
    });

    expect(observed).toEqual(["header", "title", "actions"]);
    expect(resizeListener).not.toBeNull();
    (resizeListener as unknown as () => void)();
    expect(measurements).toBe(1);
    cleanup();
    expect(disconnected).toBe(true);
    expect(removed).toEqual(["resize"]);
  });

  it("kills MUT-B: re-enabling Regenerate while retaining its truthful tooltip", () => {
    for (const [name, text] of [["canvas", canvas], ["thread", thread], ["tree", tree], ["drawer", drawer]] as const) {
      const buttons = buttonBlocksContaining(text, "Regenerate");
      expect(buttons.length, `${name} regenerate button count`).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button, `${name} regenerate disabled`).toMatch(/\bdisabled\b/);
        expect(button, `${name} regenerate aria-disabled`).toContain('aria-disabled="true"');
        expect(button, `${name} regenerate capability`).toContain("V3_MISSING_CAPABILITIES.nodeRegeneration");
        expect(button, `${name} regenerate has no click path`).not.toContain("onClick=");
      }
      expect(text, name).not.toContain("await regenerateNode(");
    }
  });

  it("keeps scoring feedback and adaptive-depth approval visible but disabled without refusal calls", () => {
    expect(drawer).toContain("V3_MISSING_CAPABILITIES.scoringFeedback");
    for (const label of ["{upLabel}", "{downLabel}"]) {
      const buttons = buttonBlocksContaining(drawer, label);
      expect(buttons, `${label} feedback control`).toHaveLength(1);
      expect(buttons[0]).toMatch(/\bdisabled\b/);
      expect(buttons[0]).toContain('aria-disabled="true"');
      expect(buttons[0]).toContain("V3_MISSING_CAPABILITIES.scoringFeedback");
      expect(buttons[0]).not.toContain("onClick=");
    }
    expect(drawer).not.toContain('onClick={() => onSubmit("up")}');
    expect(drawer).not.toContain('onClick={() => onSubmit("down")}');
    expect(client).toContain("V3_MISSING_CAPABILITIES.adaptiveDepthApproval");
    const compactScoring = region(client, 'data-scoring-insights-compact="true"', "</ScoringErrorBoundary>");
    expect(compactScoring).toContain("<AdaptiveDepthDryRunPanel");
    expect(compactScoring).toContain("enabled={true}");
    const adaptivePanel = region(client, "function AdaptiveDepthDryRunPanel", "function AdaptiveDepthDryRunChip");
    const unavailablePanel = region(adaptivePanel, 'if (state.status === "error" || state.status === "unavailable")', "  if (!state.data) return null;");
    const approveButtons = buttonBlocksContaining(unavailablePanel, "Approve selected expansions");
    expect(approveButtons).toHaveLength(1);
    expect(approveButtons[0]).toMatch(/\bdisabled\b/);
    expect(approveButtons[0]).toContain('aria-disabled="true"');
    expect(approveButtons[0]).toContain("V3_MISSING_CAPABILITIES.adaptiveDepthApproval");
    expect(unavailablePanel).toContain("adaptiveDepthActionMessage");
    expect(client).not.toContain("await approveDebateAdaptiveDepthExpansion(");
    expect(client).not.toContain("await submitScoringFeedback(");
    expect(globals).toMatch(/@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.scoringInsightsPanelCompact > \.progressStrip\s*\{[\s\S]*?height:\s*auto;[\s\S]*?flex-wrap:\s*wrap;/);
  });

  it("restores the V2 settings write affordance as disabled-not-hidden", () => {
    const saveButtons = buttonBlocksContaining(settings, "Save changes");
    expect(saveButtons).toHaveLength(1);
    expect(saveButtons[0]).toMatch(/\bdisabled\b/);
    expect(saveButtons[0]).toContain('aria-disabled="true"');
    expect(saveButtons[0]).toContain("V3_MISSING_CAPABILITIES.settingsWrite");
    expect(saveButtons[0]).not.toContain("onClick=");
    expect(settings).not.toContain("saveSettings(");
  });
});

describe("UI-02c B1 — both shared model renderers consume the tested house label", () => {
  const presentation = source("components/ModelPresentation.tsx");
  const globals = source("app/globals.css");

  it("routes ModelMetaLine and ModelBadge through makerIdentityLabel", () => {
    expect(presentation).toContain('import { makerIdentityLabel } from "@/lib/makerIdentity"');
    expect(presentation.match(/makerIdentityLabel\(\{ maker, modelId \}\)/g)).toHaveLength(2);
    const metaLine = region(presentation, "export function ModelMetaLine", "export function ModelBadge");
    const badge = presentation.slice(presentation.indexOf("export function ModelBadge"));
    for (const [name, renderer] of [["ModelMetaLine", metaLine], ["ModelBadge", badge]] as const) {
      expect(renderer.match(/makerIdentityLabel\(\{ maker, modelId \}\)/g), name).toHaveLength(1);
      expect(renderer.match(/\{label\.text\}/g), name).toHaveLength(1);
    }
  });

  it("styles typed absence like an unavailable pill and suppresses its identity dot", () => {
    expect(presentation).toContain('title={label.absence ? "No recorded house is available for this argument." : undefined}');
    expect(presentation).toContain('aria-label={label.absence ? "No recorded house is available for this argument." : undefined}');
    expect(presentation).toMatch(/\{label\.absence \? null : <span className="modelDot"/);
    expect(globals).toMatch(/\[data-maker-absence="true"\]\s*\{[\s\S]*?border:\s*1px solid var\(--line-strong\);[\s\S]*?background:\s*var\(--surface-sunken\);[\s\S]*?color:\s*var\(--muted\);/);
  });
});

describe("UI-02d — every non-canvas maker surface preserves its recorded maker prop", () => {
  it("pins tree, thread, outline, split, map, and drawer at all eight call sites", () => {
    const tree = source("components/DebateTree.tsx");
    const thread = source("components/DebateThread.tsx");
    const outline = source("components/DebateOutline.tsx");
    const split = source("components/DebateSplit.tsx");
    const map = source("components/DebateMap.tsx");
    const drawer = source("components/NodeDetailDrawer.tsx");

    expect(tree).toContain('<ModelBadge modelId={generation?.model_id ?? null} maker={node.maker} />');
    expect(thread).toContain('<ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />');
    expect(outline).toContain('<ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />');
    expect(split.match(/<ModelMetaLine modelId=\{(?:focus|node)\.active_generation\?\.model_id \?\? null\} maker=\{(?:focus|node)\.maker\} \/>/g)).toHaveLength(2);
    expect(map).toMatch(/<ModelMetaLine\s+modelId=\{readoutNode\.active_generation\?\.model_id \?\? null\}\s+maker=\{readoutNode\.maker\}\s+\/>/);
    expect(drawer.match(/<ModelMetaLine modelId=\{generation\?\.model_id \?\? null\} maker=\{node\.maker\} \/>/g)).toHaveLength(2);
  });
});

describe("XREV-01 — node review uses the existing V2 card and drawer vocabulary", () => {
  const canvas = source("components/DebateCanvas.tsx");
  const drawer = source("components/NodeDetailDrawer.tsx");

  it("shows typed review outcome and reviewer house on cards, including honest absence", () => {
    expect(canvas).toContain('data-node-review={v3Review?.outcome ?? "absent"}');
    expect(canvas).toContain("v3Review?.reviewer_lineage.maker ?? null");
    expect(canvas).toContain('"REVIEW N/A"');
    expect(canvas).toContain("v3Review.outcome.toUpperCase()");
  });

  it("shows reviewer lineage, reasons, and typed absence in the existing drawer", () => {
    expect(drawer).toContain('data-node-review={v3.review?.outcome ?? "absent"}');
    expect(drawer).toContain("v3.review?.reviewer_lineage.maker ?? null");
    expect(drawer).toContain("No completed second-maker review is recorded for this node.");
    expect(drawer).toContain('v3.review.reasons.join(" ")');
  });
});
