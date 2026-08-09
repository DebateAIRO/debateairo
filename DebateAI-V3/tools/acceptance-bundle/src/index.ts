import { loadBootstrapRegister } from "@debateai/register";

export async function buildAcceptanceBundle(input: {
  readonly architecture: unknown;
  readonly sourceRules: unknown;
  readonly orphans: unknown;
}): Promise<Readonly<Record<string, unknown>>> {
  const bootstrap = await loadBootstrapRegister();
  return Object.freeze({
    bootstrap,
    architecture: input.architecture,
    sourceRules: input.sourceRules,
    orphans: input.orphans,
    aggregateQualityScore: null,
    aggregateQualityScoreReason: "Forbidden by charter A1.3 / DR-039"
  });
}
