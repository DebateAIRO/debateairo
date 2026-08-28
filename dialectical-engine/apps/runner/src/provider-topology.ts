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
