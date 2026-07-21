// Depth-of-scrutiny presets for the new-debate form (W7 budgeted adaptive
// expansion). Each preset maps to the coordinator's per-debate budget knobs
// (config.adaptive_expansion, sanitized server-side by merged_debate_config
// against expansion_dispatch.BUDGET_BOUNDS). "Standard" sends no key at all,
// so the site-wide env defaults apply unchanged.
//
// The budgets only take effect when the coordinator runs with
// DIALECTICAL_ADAPTIVE_EXPANSION enabled; without it they are inert config.

export type ScrutinyDepth = "standard" | "deep" | "exhaustive";

export interface AdaptiveExpansionBudgets {
  max_rounds: number;
  max_per_node: number;
  max_per_debate: number;
}

export const SCRUTINY_DEPTH_OPTIONS: Array<{
  value: ScrutinyDepth;
  label: string;
  hint: string;
}> = [
  {
    value: "standard",
    label: "Standard",
    hint: "Site default expansion budget"
  },
  {
    value: "deep",
    label: "Deep",
    hint: "More follow-up rounds on weak points"
  },
  {
    value: "exhaustive",
    label: "Exhaustive",
    hint: "Agents keep digging until the tree goes quiet"
  }
];

export function adaptiveExpansionBudgetsFor(depth: ScrutinyDepth): AdaptiveExpansionBudgets | null {
  if (depth === "standard") {
    return null;
  }
  if (depth === "deep") {
    return { max_rounds: 4, max_per_node: 3, max_per_debate: 14 };
  }
  return { max_rounds: 8, max_per_node: 5, max_per_debate: 30 };
}
