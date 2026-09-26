import composeEnglish from "../messages/en/compose.json" with { type: "json" };
import { t, type MessageCatalog } from "./i18n/translate.js";

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

export type ScrutinyDepthOption = {
  value: ScrutinyDepth;
  label: string;
  hint: string;
};

export function scrutinyDepthOptions(catalog: MessageCatalog = composeEnglish): ScrutinyDepthOption[] {
  return [
    {
      value: "standard",
      label: t(catalog, "compose.scrutinyDepth.standard.label"),
      hint: t(catalog, "compose.scrutinyDepth.standard.hint")
    },
    {
      value: "deep",
      label: t(catalog, "compose.scrutinyDepth.deep.label"),
      hint: t(catalog, "compose.scrutinyDepth.deep.hint")
    },
    {
      value: "exhaustive",
      label: t(catalog, "compose.scrutinyDepth.exhaustive.label"),
      hint: t(catalog, "compose.scrutinyDepth.exhaustive.hint")
    }
  ];
}

/** The presets in display order. Catalogue-free: every renderer labels them in its own locale. */
export const SCRUTINY_DEPTHS: readonly ScrutinyDepth[] = Object.freeze(["standard", "deep", "exhaustive"]);

export function adaptiveExpansionBudgetsFor(depth: ScrutinyDepth): AdaptiveExpansionBudgets | null {
  if (depth === "standard") {
    return null;
  }
  if (depth === "deep") {
    return { max_rounds: 4, max_per_node: 3, max_per_debate: 14 };
  }
  return { max_rounds: 8, max_per_node: 5, max_per_debate: 30 };
}
