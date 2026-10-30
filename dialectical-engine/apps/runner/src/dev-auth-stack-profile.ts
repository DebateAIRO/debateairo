export type DevelopmentAuthStackProfileName = "default" | "support-preview" | "rls";

export type DevelopmentAuthStackProfile = Readonly<{
  name: DevelopmentAuthStackProfileName;
  publicOrigin: string;
  publicPort: number;
  uiPort: number;
  apiPort: number;
  providerPorts: readonly [number, number, number, number, number, number, number];
  supportModelPort: number;
  /**
   * Paid plans (P6b): fake NETOPIA, Quaderno and SmartBill, started only with DEBATEAI_BILLING_FAKES=1.
   * Paid plans S1a: moved past the scorecard's two new relay slots (agy and pi-glm, the last two
   * `providerPorts`), which had taken the first two of these ports on their own branch.
   */
  billingFakePorts: readonly [number, number, number];
  postgresPort: number;
  hatchetGrpcPort: number;
  hatchetApiPort: number;
  composeProjectName: string;
}>;

export const DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE: DevelopmentAuthStackProfile = Object.freeze({
  name: "default",
  publicOrigin: "https://localhost:3000",
  publicPort: 3000,
  uiPort: 3001,
  apiPort: 8790,
  providerPorts: Object.freeze([8791, 8795, 8792, 8796, 8793, 8797, 8798] as const),
  supportModelPort: 8794,
  billingFakePorts: Object.freeze([8799, 8800, 8801] as const),
  postgresPort: 55432,
  hatchetGrpcPort: 7077,
  hatchetApiPort: 8888,
  composeProjectName: "debateai-v3"
});

export const SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE: DevelopmentAuthStackProfile =
  Object.freeze({
    name: "support-preview",
    publicOrigin: "https://localhost:3100",
    publicPort: 3100,
    uiPort: 3101,
    apiPort: 8890,
    providerPorts: Object.freeze([8891, 8895, 8892, 8896, 8893, 8897, 8898] as const),
    supportModelPort: 8894,
    billingFakePorts: Object.freeze([8899, 8900, 8901] as const),
    postgresPort: 55433,
    hatchetGrpcPort: 7177,
    hatchetApiPort: 8988,
    composeProjectName: "debateai-v3-support-preview"
  });

/**
 * Row-level security S01 (DECISIONS D43): V's TEST stack, selected by DEBATEAI_DEV_AUTH_STACK_PROFILE=rls. Its own
 * compose project (and so its own Postgres volume) and every port outside the two profiles above and the listener
 * baseline measured at intake, so V's default stack is never started, migrated or stopped by it.
 */
export const RLS_DEVELOPMENT_AUTH_STACK_PROFILE: DevelopmentAuthStackProfile = Object.freeze({
  name: "rls",
  publicOrigin: "https://localhost:5200",
  publicPort: 5200,
  uiPort: 5201,
  apiPort: 11790,
  providerPorts: Object.freeze([11791, 11795, 11792, 11796, 11793, 11797, 11798] as const),
  supportModelPort: 11794,
  billingFakePorts: Object.freeze([11799, 11800, 11801] as const),
  postgresPort: 56532,
  hatchetGrpcPort: 7677,
  hatchetApiPort: 11888,
  composeProjectName: "debateai-v3-rls"
});

export function loadDevelopmentAuthStackProfile(
  source: Readonly<Record<string, string | undefined>>
): DevelopmentAuthStackProfile {
  const value = source.DEBATEAI_DEV_AUTH_STACK_PROFILE;
  if (value === undefined || value === "default") {
    return DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
  }
  if (value === "support-preview") return SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE;
  if (value === "rls") return RLS_DEVELOPMENT_AUTH_STACK_PROFILE;
  throw new TypeError("DEV_AUTH_STACK_PROFILE_INVALID");
}
