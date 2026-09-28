import { PLAN_TIER_ROSTERS } from "@debateai/contract";

/**
 * Tiers S02 — the acceptance provider doubles' half of the plan-tier admission,
 * in ONE place.
 *
 * An ask names its plan (`plan_tier`, required since 7658e997, 2026-09-10), and
 * admission keeps only that plan roster's model ids: every one of them must be
 * discovered healthy, or the ask is refused naming the missing one
 * (ASK_PLAN_TIER_MODEL_UNAVAILABLE, 86bfa432, 2026-09-12). Nothing under
 * `acceptance/` followed, so every ask through the acceptance runtime was
 * refused — first 400 MALFORMED_REQUEST for the missing field, and behind it the
 * roster, because every double answered as `test-layer/model`.
 *
 * The fixtures ask on the FREE plan, and their two relays declare the free
 * roster's two models in roster order: the OpenAI relay first, the Anthropic
 * relay second. The ids are read from the roster itself, so a roster change
 * moves the fixtures with it instead of refusing them.
 */
export const ACCEPTANCE_PLAN_TIER = "free" as const;

function freeRosterMember(index: number): string {
  const model = PLAN_TIER_ROSTERS[ACCEPTANCE_PLAN_TIER][index];
  if (model === undefined) throw new Error(`TEST_FREE_ROSTER_MEMBER_MISSING:${String(index)}`);
  return model;
}

export const FREE_ROSTER_OPENAI_MODEL = freeRosterMember(0);
export const FREE_ROSTER_ANTHROPIC_MODEL = freeRosterMember(1);

/**
 * The model id a request asked for, which a double answers AS.
 *
 * The gateway refuses a reply naming a different model than the one it pinned
 * (PROVIDER_MODEL_IDENTITY_CHANGED), and the claim-time probe refuses one that
 * differs from the model admitted at ask time (CLAIM_MODEL_IDENTITY_CHANGED).
 * So a double's identity is whatever its relay DECLARES — chosen once, in the
 * fixture — and never a second literal that can drift from it. `null` when the
 * request names no model; the double then refuses the call by name.
 */
export function requestedModel(body: string): string | null {
  try {
    const model = (JSON.parse(body) as { readonly model?: unknown }).model;
    return typeof model === "string" && model.trim() !== "" ? model : null;
  } catch {
    return null;
  }
}
