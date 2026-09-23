export type DevelopmentAuthStackProfileName = "default" | "support-preview";

export type DevelopmentAuthStackProfile = Readonly<{
  name: DevelopmentAuthStackProfileName;
  publicOrigin: string;
  publicPort: number;
  uiPort: number;
  apiPort: number;
  providerPorts: readonly [number, number, number, number, number];
  supportModelPort: number;
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
  providerPorts: Object.freeze([8791, 8795, 8792, 8796, 8793] as const),
  supportModelPort: 8794,
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
    providerPorts: Object.freeze([8891, 8895, 8892, 8896, 8893] as const),
    supportModelPort: 8894,
    postgresPort: 55433,
    hatchetGrpcPort: 7177,
    hatchetApiPort: 8988,
    composeProjectName: "debateai-v3-support-preview"
  });

export function loadDevelopmentAuthStackProfile(
  source: Readonly<Record<string, string | undefined>>
): DevelopmentAuthStackProfile {
  const value = source.DEBATEAI_DEV_AUTH_STACK_PROFILE;
  if (value === undefined || value === "default") {
    return DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
  }
  if (value === "support-preview") return SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE;
  throw new TypeError("DEV_AUTH_STACK_PROFILE_INVALID");
}
