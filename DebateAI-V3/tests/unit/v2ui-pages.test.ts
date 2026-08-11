import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

/** Every field apps/v2-ui/lib/api.ts::createDebate demands from the asker. */
const REQUIRED_ASK_FIELDS = [
  { config: "risk_tier", state: "riskTier", setter: "setRiskTier" },
  { config: "composition_budget_tier", state: "budgetTier", setter: "setBudgetTier" },
  { config: "agent_count", state: "agentCount", setter: "setAgentCount" },
  { config: "decision_owner", state: "decisionOwner", setter: "setDecisionOwner" },
  { config: "action_owner", state: "actionOwner", setter: "setActionOwner" },
  { config: "decision_scope", state: "decisionScope", setter: "setDecisionScope" },
  { config: "as_of", state: "asOf", setter: "setAsOf" }
] as const;

describe("v2-ui /new collects every value the V3 ask requires", () => {
  const newPage = source("app/new/page.tsx");

  it.each(REQUIRED_ASK_FIELDS)("binds a control the asker can actually fill for $config", (field) => {
    // A controlled input: the state is rendered as a value AND an onChange
    // writes it back. State that is only declared can never be supplied.
    expect(newPage).toMatch(new RegExp(`value=\\{${field.state}\\}`));
    expect(newPage).toMatch(new RegExp(`${field.setter}\\(event\\.target\\.value`));
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
    expect(newPage).toContain("getRunCostEnvelope");
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

  it("never rescales, rounds or clamps a V3 number on the card (AC-76/DR-039)", () => {
    const badges = canvas.slice(canvas.indexOf("function V3ScoreBadges"), canvas.indexOf("function summarizeCardScoringIssues"));
    for (const transform of ["formatScorePercent", "toFixed", "Math.round", "* 100"]) {
      expect(badges).not.toContain(transform);
    }
  });

  it("keeps the fuller record — label and producer — in the drawer", () => {
    expect(drawer).toContain("base score ({v3.base_score.kind})");
    expect(drawer).toContain("final strength ({v3.final_strength.kind})");
    expect(drawer).toContain("produced by {v3.base_score.producer}");
    expect(drawer).toContain("produced by {v3.final_strength.producer}");
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
