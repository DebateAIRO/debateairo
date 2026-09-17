// TEMPORARY probe by REV-S01-p1-correctness-tests. Copied into the worktree, run, deleted.
// Probe 5 (the tier-less production path) and probe 1 (the modelIdentity / modelMeta fold).
import { describe, expect, it, vi } from "vitest";
import { createDebate } from "../../apps/ui/lib/api";
import { modelColor } from "../../apps/ui/components/ModelPresentation";
import { modelMeta } from "../../apps/ui/lib/models";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";

const client = { submitAsk: vi.fn().mockResolvedValue({ run_ref: "run:probe", status: "QUEUED" as const }) } as never;

// the local adapter, copied verbatim from apps/ui/app/new/page.tsx:65-70
function modelIdentity(modelId: string): string {
  if (modelId.startsWith("gpt-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("grok-")) return "xai";
  return modelId;
}

async function refusal(config: Record<string, unknown>): Promise<string> {
  try { await createDebate("A claim worth debating", config, "token", client); return "NO REFUSAL"; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}

const COMPLETE = {
  risk_tier: "standard", plan_tier: "free", tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free", composition_budget_tier: "low",
  depth: 2, decision_scope: "probe", as_of: "2026-09-10T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
};

describe("REV probe", () => {
  it("probe 5 — what the guard does to each production config shape", async () => {
    const results = {
      // LibraryComposer.tsx:29-37 verbatim config
      libraryComposer: await refusal({ max_depth: 3, branching: 2, max_tokens: 800 }),
      // a config complete EXCEPT plan_tier — proves the plan_tier guard is reachable at all
      completeMinusPlanTier: await refusal(Object.fromEntries(Object.entries(COMPLETE).filter(([k]) => k !== "plan_tier"))),
      unknownTier: await refusal({ ...COMPLETE, plan_tier: "gold" }),
      // a client simply asserting premium — is the tier forgeable at this layer?
      forgedPremium: await refusal({ ...COMPLETE, plan_tier: "premium" })
    };
    // eslint-disable-next-line no-console
    console.log("PROBE5 " + JSON.stringify(results, null, 2));
    expect(results).toBeTruthy();
  });

  it("probe 1 — does the local modelIdentity adapter duplicate modelMeta().dot?", () => {
    const ids = [...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium];
    const table = ids.map((id) => ({ id, viaPage: modelColor(modelIdentity(id)), viaModelMeta: modelMeta(id).dot,
                                     same: modelColor(modelIdentity(id)) === modelMeta(id).dot }));
    // where the two DISAGREE — ids the page would colour differently from every other surface
    const divergent = ["openai-o3", "sol-gpt-5", "GPT-5.6-SOL", "claude_opus", "grok/4.6", "gemini-3"]
      .map((id) => ({ id, viaPage: modelColor(modelIdentity(id)), viaModelMeta: modelMeta(id).dot }))
      .filter((r) => r.viaPage !== r.viaModelMeta);
    // eslint-disable-next-line no-console
    console.log("PROBE1 rostered=" + JSON.stringify(table) + "\nPROBE1 divergent=" + JSON.stringify(divergent, null, 2));
    expect(table.every((r) => r.same)).toBe(true);
  });
});
