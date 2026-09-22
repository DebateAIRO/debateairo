import type { ProviderDiscoveryTarget, ProviderGateway } from "@debateai/providers";

export type RunnerProviderMember = Readonly<{
  provider: ProviderGateway;
  providerRef: string;
  maker: string;
}>;

export function createRunnerProviderTopology(
  targets: readonly ProviderDiscoveryTarget[],
  createGateway: (target: ProviderDiscoveryTarget) => ProviderGateway
): Readonly<{
  primary: RunnerProviderMember;
  critique: RunnerProviderMember | undefined;
  additionalMakers: readonly RunnerProviderMember[];
}> {
  const members = targets.map((target) => Object.freeze({
    provider: createGateway(target),
    providerRef: target.providerRef,
    maker: target.maker
  }));
  const primary = members[0];
  if (primary === undefined) throw new TypeError("RUNNER_PROVIDER_SET_EMPTY");
  return Object.freeze({
    primary,
    critique: members[1],
    additionalMakers: Object.freeze(members.slice(2))
  });
}

/**
 * V-20, ruled 2026-09-22 — the runner's primary-provider agreement, lifted out of
 * the composition root so it is a decision with tests rather than an `if` nobody
 * can run.
 *
 * `VLLM_BASE_URL` / `VLLM_MODEL` / `VLLM_MAKER` describe the PRIMARY provider
 * despite their name, and they are optional now:
 *
 * - DECLARED (development): the full cross-check, byte-for-byte what the root
 *   did before, refusing with `RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT`.
 * - ABSENT (a hosted deployment, and any host with no self-hosted inference
 *   server): `PROVIDER_DISCOVERY_TARGETS_JSON` is the single source and that
 *   cross-check is skipped, exactly as V-20 rules.
 *
 * `PROVIDER_REF` is NOT one of the three and stays required by the shape, so the
 * "the primary I was told to be is the primary I discovered" guard survives in
 * both arms. When the three are absent it refuses under its own name,
 * `RUNNER_PRIMARY_PROVIDER_REF_DRIFT`, so the ruled cross-check really is the
 * thing that was skipped.
 */
export function assertRunnerPrimaryProviderConfiguration(input: Readonly<{
  primary: Readonly<{ providerRef: string; maker: string }>;
  firstTarget: ProviderDiscoveryTarget | undefined;
  declared: Readonly<{
    PROVIDER_REF: string;
    VLLM_BASE_URL?: string | undefined;
    VLLM_MODEL?: string | undefined;
    VLLM_MAKER?: string | undefined;
    VLLM_AUTHORIZATION?: string | undefined;
  }>;
}>): void {
  const { declared, firstTarget, primary } = input;
  if (declared.VLLM_BASE_URL !== undefined
    && declared.VLLM_MODEL !== undefined
    && declared.VLLM_MAKER !== undefined) {
    if (primary.providerRef !== declared.PROVIDER_REF
      || primary.maker !== declared.VLLM_MAKER
      || firstTarget?.baseUrl !== declared.VLLM_BASE_URL.replace(/\/$/u, "")
      || firstTarget?.model !== declared.VLLM_MODEL
      || firstTarget?.authorizationHeader !== declared.VLLM_AUTHORIZATION) {
      throw new TypeError("RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT");
    }
    return;
  }
  if (primary.providerRef !== declared.PROVIDER_REF) {
    throw new TypeError("RUNNER_PRIMARY_PROVIDER_REF_DRIFT");
  }
}
