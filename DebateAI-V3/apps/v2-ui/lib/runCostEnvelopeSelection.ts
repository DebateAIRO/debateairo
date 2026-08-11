import type { RunCostEnvelopeMember } from "./v3/adapter.js";

export type RunCostEnvelopeRiskTier = RunCostEnvelopeMember["riskTier"];

const RISK_TIER_ORDER: readonly RunCostEnvelopeRiskTier[] = ["casual", "standard", "high-stakes"];

/** Pure mirror of the engine's deployment-floor escalation rule. */
export function effectiveRunCostEnvelopeRiskTier(
  askerRiskTier: RunCostEnvelopeRiskTier,
  deploymentFloorRiskTier: RunCostEnvelopeRiskTier | null
): RunCostEnvelopeRiskTier {
  if (deploymentFloorRiskTier === null) return askerRiskTier;
  return RISK_TIER_ORDER.indexOf(deploymentFloorRiskTier) > RISK_TIER_ORDER.indexOf(askerRiskTier)
    ? deploymentFloorRiskTier
    : askerRiskTier;
}

/** Members the engine can resolve after applying the deployment risk floor. */
export function selectRunCostEnvelopeMembers(
  members: readonly RunCostEnvelopeMember[],
  askerRiskTier: string,
  deploymentFloorRiskTier: RunCostEnvelopeRiskTier | null
): readonly RunCostEnvelopeMember[] {
  if (!RISK_TIER_ORDER.includes(askerRiskTier as RunCostEnvelopeRiskTier)) return [];
  const effectiveRiskTier = effectiveRunCostEnvelopeRiskTier(
    askerRiskTier as RunCostEnvelopeRiskTier,
    deploymentFloorRiskTier
  );
  return members.filter((member) => member.riskTier === effectiveRiskTier);
}

/** The one ruled member selected by the form's depth control. */
export function selectRunCostEnvelopeMember(
  members: readonly RunCostEnvelopeMember[],
  depth: number | null
): RunCostEnvelopeMember | null {
  return members.find((member) => member.depth === depth) ?? null;
}
