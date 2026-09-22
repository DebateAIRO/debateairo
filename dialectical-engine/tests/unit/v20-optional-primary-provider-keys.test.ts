import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseRunnerEnvironment } from "@debateai/register";
import { parseProviderDiscoveryTargets } from "@debateai/providers";
import { assertRunnerPrimaryProviderConfiguration } from "../../apps/runner/src/provider-topology.js";
import { validRunnerEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/**
 * V-20, ruled 2026-09-22. `VLLM_BASE_URL` / `VLLM_MODEL` / `VLLM_MAKER` describe
 * the PRIMARY provider despite their name, and the VPS has no vLLM. They become
 * optional; when they are absent `PROVIDER_DISCOVERY_TARGETS_JSON` is the single
 * source and the `RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` cross-check is
 * skipped. When they are present (development) the cross-check is unchanged.
 *
 * Found while verifying: `deploy/vps/env/runner.env.example` filled them with
 * `<unused-on-vps>`, which passes the shape check and then FAILS that cross-check
 * against the first provider target — the runner could not have started on the
 * VPS as the kit stood.
 */

const WITHOUT_VLLM = () => {
  const {
    VLLM_BASE_URL: _baseUrl,
    VLLM_MODEL: _model,
    VLLM_MAKER: _maker,
    ...rest
  } = validRunnerEnvironmentFixture();
  return rest;
};

const targets = (rows: readonly Readonly<Record<string, unknown>>[]) =>
  parseProviderDiscoveryTargets(
    JSON.stringify(rows),
    rows.map((row, index) => ({
      providerRef: String(row.provider_ref), maker: `maker-${index + 1}`
    }))
  );

const PRIMARY = targets([{
  provider_ref: "primary", base_url: "https://api.vendor.example/v1", model: "vendor-large"
}]);

describe("V-20 the three primary-provider keys are optional (task 10d)", () => {
  it("parses a runner environment that declares none of them", () => {
    const environment = parseRunnerEnvironment(WITHOUT_VLLM());
    expect(environment.VLLM_BASE_URL).toBeUndefined();
    expect(environment.VLLM_MODEL).toBeUndefined();
    expect(environment.VLLM_MAKER).toBeUndefined();
    expect(environment.PROVIDER_REF).toBe("fixture");
  });

  it("still parses a development environment that declares all three", () => {
    const environment = parseRunnerEnvironment(validRunnerEnvironmentFixture());
    expect(environment.VLLM_BASE_URL).toBe("http://127.0.0.1:8000");
    expect(environment.VLLM_MODEL).toBe("fixture");
    expect(environment.VLLM_MAKER).toBe("fixture");
  });

  it("refuses HALF a set, which is neither source of truth", () => {
    for (const key of ["VLLM_BASE_URL", "VLLM_MODEL", "VLLM_MAKER"]) {
      expect(() => parseRunnerEnvironment({
        ...WITHOUT_VLLM(),
        ...(key === "VLLM_BASE_URL" ? { VLLM_BASE_URL: "http://127.0.0.1:8000" } : { [key]: "x" })
      })).toThrowError(new TypeError("RUNNER_PRIMARY_PROVIDER_KEYS_INCOMPLETE"));
    }
    expect(() => parseRunnerEnvironment({
      ...WITHOUT_VLLM(), VLLM_AUTHORIZATION: "Bearer fixture"
    })).toThrowError(new TypeError("RUNNER_PRIMARY_PROVIDER_KEYS_INCOMPLETE"));
  });
});

describe("V-20 the cross-check runs only where a declared primary exists (task 10d)", () => {
  const primaryMember = Object.freeze({ providerRef: "primary", maker: "maker-1" });

  it("skips RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT when the three keys are absent", () => {
    expect(() => assertRunnerPrimaryProviderConfiguration({
      primary: primaryMember,
      firstTarget: PRIMARY[0],
      declared: { PROVIDER_REF: "primary" }
    })).not.toThrow();
  });

  it("still refuses a primary the runner did not declare, under its own name", () => {
    expect(() => assertRunnerPrimaryProviderConfiguration({
      primary: primaryMember,
      firstTarget: PRIMARY[0],
      declared: { PROVIDER_REF: "someone-else" }
    })).toThrowError(new TypeError("RUNNER_PRIMARY_PROVIDER_REF_DRIFT"));
  });

  it("leaves the development cross-check exactly as it was", () => {
    const declared = {
      PROVIDER_REF: "primary",
      VLLM_BASE_URL: "https://api.vendor.example/v1",
      VLLM_MODEL: "vendor-large",
      VLLM_MAKER: "maker-1"
    };
    expect(() => assertRunnerPrimaryProviderConfiguration({
      primary: primaryMember, firstTarget: PRIMARY[0], declared
    })).not.toThrow();
    // A trailing slash on the declared base URL is tolerated exactly as before.
    expect(() => assertRunnerPrimaryProviderConfiguration({
      primary: primaryMember,
      firstTarget: PRIMARY[0],
      declared: { ...declared, VLLM_BASE_URL: "https://api.vendor.example/v1/" }
    })).not.toThrow();
    for (const drift of [
      { VLLM_BASE_URL: "https://elsewhere.example/v1" },
      { VLLM_MODEL: "another-model" },
      { VLLM_MAKER: "another-maker" },
      { PROVIDER_REF: "someone-else" },
      { VLLM_AUTHORIZATION: "Bearer declared-but-not-configured" }
    ]) {
      expect(() => assertRunnerPrimaryProviderConfiguration({
        primary: primaryMember, firstTarget: PRIMARY[0], declared: { ...declared, ...drift }
      })).toThrowError(new TypeError("RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT"));
    }
  });

  it("refuses an empty provider set rather than passing a missing primary", () => {
    expect(() => assertRunnerPrimaryProviderConfiguration({
      primary: primaryMember,
      firstTarget: undefined,
      declared: {
        PROVIDER_REF: "primary",
        VLLM_BASE_URL: "https://api.vendor.example/v1",
        VLLM_MODEL: "vendor-large",
        VLLM_MAKER: "maker-1"
      }
    })).toThrowError(new TypeError("RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT"));
  });

  it("is the decision the runner's composition root takes", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("assertRunnerPrimaryProviderConfiguration(");
    expect(source).not.toContain("RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT");
  });
});

describe("V-20 the VPS kit can actually start the runner (task 10d)", () => {
  const read = async () => readFile(
    new URL("../../deploy/vps/env/runner.env.example", import.meta.url), "utf8"
  );

  it("declares no VLLM key and no unusable placeholder", async () => {
    const example = await read();
    for (const key of ["VLLM_BASE_URL", "VLLM_MODEL", "VLLM_MAKER", "VLLM_AUTHORIZATION"]) {
      expect(example).not.toContain(`${key}=`);
    }
    expect(example).not.toContain("<unused-on-vps>");
  });

  it("names the deployment mode, so the hosted runner refuses a relay target", async () => {
    expect(await read()).toContain("DEBATEAI_DEPLOYMENT_MODE=hosted");
  });

  it("keeps PROVIDER_DISCOVERY_TARGETS_JSON as the single source of the provider set", async () => {
    const example = await read();
    expect(example).toContain("PROVIDER_DISCOVERY_TARGETS_JSON=");
    expect(example).toContain("PROVIDER_REF=");
  });
});
