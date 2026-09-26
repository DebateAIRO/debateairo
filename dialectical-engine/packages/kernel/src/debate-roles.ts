/**
 * Model-scorecard design (docs/superpowers/specs/2026-09-26-model-scorecard-and-picker-design.md):
 * the shared vocabulary. The kernel is the one minting home for a value vocabulary several
 * packages share (ADR-0024 §Decision 3): the scorecard package, the contract, the providers'
 * call records, the runner's seats and migration 0072's CHECK all import these.
 *
 * The seven DEBATE jobs are named DEBATE_ROLES, not MODEL_ROLES: @debateai/providers already
 * exports MODEL_ROLES, the six gateway roles on ProviderCallRequest.role — a different list,
 * which stays as it is.
 */
export const DEBATE_ROLES = [
  "POSITION",
  "SUPPORT_ATTACK",
  "CROSS_EXCHANGE",
  "JUDGE",
  "REVIEWER",
  "ANSWER_WRITER",
  "ANSWER_CHECKER"
] as const;
export type DebateRole = typeof DEBATE_ROLES[number];

export function isDebateRole(value: unknown): value is DebateRole {
  return typeof value === "string" && (DEBATE_ROLES as readonly string[]).includes(value);
}

/**
 * Owner ruling R7: a target that cannot set a thinking level declares none, and a candidate on
 * it carries this level — "the vendor's default", never a guessed level name.
 */
export const THINKING_LEVEL_DEFAULT_ONLY = "DEFAULT_ONLY" as const;

/**
 * Owner ruling R2: the asker's model strength. Its own axis — not the expansion bound, not the
 * composition budget tier, not the risk tier. Ordered cheapest first, so one step down is one
 * index lower.
 */
export const MODEL_STRENGTHS = ["ECONOMY", "BALANCED", "BEST"] as const;
export type ModelStrength = typeof MODEL_STRENGTHS[number];

/** Task P4's seat-aware keys end in this suffix; the role never depends on it. */
const SEAT_SUFFIX = /:seat:(?:main|runnerUp)$/u;

/**
 * The role of a LEGACY call, read from its call_site_key (rows written before migration 0072
 * gave the role its own column). The key builders live in apps/runner/src/index.ts and
 * packages/serve/src/synthesis.ts; tests/unit/debate-roles.test.ts lists every shape they
 * build. Anything else — the STOPPING row, lifecycle values, the dormant evaluator lane — is
 * not a debate call and reads as null. PANEL is tested first: a panel key embeds its author's key.
 */
export function debateRoleFromCallSiteKey(key: string): DebateRole | null {
  const base = key.replace(SEAT_SUFFIX, "");
  if (base.startsWith("PANEL:")) return "JUDGE";
  if (base === "JUDGE" || base.startsWith("JUDGE:root:")) return "POSITION";
  if (base.startsWith("JUDGE:defender:") || base.startsWith("JUDGE:critic:")) return "SUPPORT_ATTACK";
  if (base.startsWith("JUDGE:cross-root:")) return "CROSS_EXCHANGE";
  if (base.startsWith("JUDGE:review:")) return "REVIEWER";
  if (base.startsWith("COMPOSER:SYNTHESIZER:")) return "ANSWER_WRITER";
  if (base.startsWith("POST_COMPOSE_R9:EVALUATOR:")) return "ANSWER_CHECKER";
  return null;
}
