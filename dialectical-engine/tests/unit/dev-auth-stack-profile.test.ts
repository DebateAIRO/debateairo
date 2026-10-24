import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  RLS_DEVELOPMENT_AUTH_STACK_PROFILE,
  SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE,
  loadDevelopmentAuthStackProfile
} from "../../apps/runner/src/dev-auth-stack-profile.js";

function ports(profile: typeof DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE): readonly number[] {
  return [
    profile.publicPort,
    profile.uiPort,
    profile.apiPort,
    ...profile.providerPorts,
    profile.supportModelPort,
    ...profile.billingFakePorts,
    profile.postgresPort,
    profile.hatchetGrpcPort,
    profile.hatchetApiPort
  ];
}

describe("development auth stack profiles", () => {
  it("keeps the absent and explicit default selectors on the existing topology", () => {
    for (const source of [{}, { DEBATEAI_DEV_AUTH_STACK_PROFILE: "default" }]) {
      expect(loadDevelopmentAuthStackProfile(source)).toBe(
        DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
      );
    }
    expect(DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE).toEqual({
      name: "default",
      publicOrigin: "https://localhost:3000",
      publicPort: 3000,
      uiPort: 3001,
      apiPort: 8790,
      providerPorts: [8791, 8795, 8792, 8796, 8793, 8797, 8798],
      supportModelPort: 8794,
      billingFakePorts: [8799, 8800, 8801],
      postgresPort: 55432,
      hatchetGrpcPort: 7077,
      hatchetApiPort: 8888,
      composeProjectName: "debateai-v3"
    });
  });

  it("selects the exact isolated support preview topology", () => {
    expect(loadDevelopmentAuthStackProfile({
      DEBATEAI_DEV_AUTH_STACK_PROFILE: "support-preview"
    })).toBe(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE);
    expect(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE).toEqual({
      name: "support-preview",
      publicOrigin: "https://localhost:3100",
      publicPort: 3100,
      uiPort: 3101,
      apiPort: 8890,
      providerPorts: [8891, 8895, 8892, 8896, 8893, 8897, 8898],
      supportModelPort: 8894,
      billingFakePorts: [8899, 8900, 8901],
      postgresPort: 55433,
      hatchetGrpcPort: 7177,
      hatchetApiPort: 8988,
      composeProjectName: "debateai-v3-support-preview"
    });
    expect(new Set(ports(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE)).size)
      .toBe(17);
    expect(ports(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE)
      .some((port) => ports(DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE).includes(port)))
      .toBe(false);
  });

  // Row-level security S01 (PLAN S2.9, DECISIONS D43): V's TEST stack, on its own compose project and volume, on ports
  // outside every other profile's.
  it("S2.9-a DEBATEAI_DEV_AUTH_STACK_PROFILE=rls returns the D43 values EXACT", () => {
    expect(loadDevelopmentAuthStackProfile({
      DEBATEAI_DEV_AUTH_STACK_PROFILE: "rls"
    })).toBe(RLS_DEVELOPMENT_AUTH_STACK_PROFILE);
    expect(RLS_DEVELOPMENT_AUTH_STACK_PROFILE).toEqual({
      name: "rls",
      publicOrigin: "https://localhost:5200",
      publicPort: 5200,
      uiPort: 5201,
      apiPort: 11790,
      providerPorts: [11791, 11795, 11792, 11796, 11793, 11797, 11798],
      supportModelPort: 11794,
      billingFakePorts: [11799, 11800, 11801],
      postgresPort: 56532,
      hatchetGrpcPort: 7677,
      hatchetApiPort: 11888,
      composeProjectName: "debateai-v3-rls"
    });
    expect(new Set(ports(RLS_DEVELOPMENT_AUTH_STACK_PROFILE)).size).toBe(17);
    for (const other of [DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE, SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE]) {
      expect(ports(RLS_DEVELOPMENT_AUTH_STACK_PROFILE).some((port) => ports(other).includes(port)), other.name)
        .toBe(false);
    }
    for (const value of ["RLS", "rls ", "row-level-security"]) {
      expect(() => loadDevelopmentAuthStackProfile({ DEBATEAI_DEV_AUTH_STACK_PROFILE: value }), value)
        .toThrow("DEV_AUTH_STACK_PROFILE_INVALID");
    }
  });

  it("rejects every unreviewed selector", () => {
    for (const value of ["preview", "support_preview", "SUPPORT-PREVIEW", "", "3100"]) {
      expect(() => loadDevelopmentAuthStackProfile({
        DEBATEAI_DEV_AUTH_STACK_PROFILE: value
      })).toThrow("DEV_AUTH_STACK_PROFILE_INVALID");
    }
  });
});
