import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_MODES,
  assertHostedCostEnvelopesSealed,
  parseApiEnvironment,
  parseRunnerEnvironment,
  readSealedCostEnvelopeStatus,
  resolveDeploymentMode
} from "../../packages/register/src/runtime-environment.js";
import {
  assertDeploymentProviderTargets,
  parseProviderDiscoveryTargets
} from "../../packages/providers/src/index.js";
import {
  validApiEnvironmentFixture,
  validRunnerEnvironmentFixture
} from "../support/apiEnvironmentFixture.js";

/**
 * V-9(c) / task 10a. The engine has TWO supported deployments and the choice is
 * made in configuration, never guessed from `NODE_ENV`:
 *
 * - HOSTED is the commercial website: paid vendor APIs over `https:` only. The
 *   loopback relay path that local mode is built on is refused, and a credential
 *   inline in `PROVIDER_DISCOVERY_TARGETS_JSON` is refused with it.
 * - LOCAL is anyone running this repository on their own computer, the owners
 *   before launch included: the command-line relays and loopback model servers,
 *   a SUPPORTED product path. Its behaviour is byte-for-byte what this codebase
 *   did before the mode existed, including L4-F7's cleartext-off-box refusal.
 */

const SECRET = "Bearer v9-fixture-token-never-printed";

const TARGET_KINDS = Object.freeze({
  "vendor-https": { base_url: "https://api.vendor.example/v1" },
  "vendor-https-inline-credential": {
    base_url: "https://api.vendor.example/v1",
    authorization_header: SECRET
  },
  "loopback-http-relay": { base_url: "http://127.0.0.1:8791/v1" },
  "loopback-https": { base_url: "https://127.0.0.1:8443/v1" },
  "offbox-http": { base_url: "http://gateway.internal/v1" }
} as const);

type TargetKind = keyof typeof TARGET_KINDS;

function targets(kind: TargetKind) {
  return parseProviderDiscoveryTargets(
    JSON.stringify([{ provider_ref: "provider-1", model: "model-1", ...TARGET_KINDS[kind] }]),
    [{ providerRef: "provider-1", maker: "maker-1" }]
  );
}

/** mode x target kind. `null` = admitted; a string = the refusal code expected. */
const TABLE = Object.freeze([
  {
    kind: "vendor-https",
    hosted: null,
    localProduction: null,
    localDevelopment: null
  },
  {
    kind: "vendor-https-inline-credential",
    hosted: "PROVIDER_INLINE_CREDENTIAL_REFUSED:provider-1",
    localProduction: null,
    localDevelopment: null
  },
  {
    kind: "loopback-http-relay",
    hosted: "PROVIDER_BASE_URL_TLS_REQUIRED:provider-1",
    localProduction: null,
    localDevelopment: null
  },
  {
    kind: "loopback-https",
    hosted: "PROVIDER_TARGET_LOOPBACK_REFUSED:provider-1",
    localProduction: null,
    localDevelopment: null
  },
  {
    kind: "offbox-http",
    hosted: "PROVIDER_BASE_URL_TLS_REQUIRED:provider-1",
    localProduction: "PROVIDER_BASE_URL_TLS_REQUIRED:provider-1",
    localDevelopment: null
  }
] as const satisfies readonly {
  kind: TargetKind;
  hosted: string | null;
  localProduction: string | null;
  localDevelopment: string | null;
}[]);

describe("V-9 the deployment mode is explicit (task 10a)", () => {
  it("names exactly the two supported deployments", () => {
    expect([...DEPLOYMENT_MODES]).toEqual(["hosted", "local"]);
  });

  it("refuses a production start-up that does not say which deployment it is", () => {
    for (const configured of [undefined, "", "   "]) {
      expect(() => resolveDeploymentMode(configured, "production"))
        .toThrowError(expect.objectContaining({ code: "DEPLOYMENT_MODE_UNRESOLVED" }));
    }
  });

  it("refuses an unknown mode in EVERY environment, rather than guessing", () => {
    for (const nodeEnv of ["production", "development", "test", undefined]) {
      for (const configured of ["HOSTED", "Local", "prod", "hosted ", " local", "vps"]) {
        expect(() => resolveDeploymentMode(configured, nodeEnv))
          .toThrowError(expect.objectContaining({ code: "DEPLOYMENT_MODE_INVALID" }));
      }
    }
  });

  it("keeps today's behaviour where the mode was never set outside production", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(resolveDeploymentMode(undefined, nodeEnv)).toBe("local");
    }
    expect(resolveDeploymentMode("hosted", "development")).toBe("hosted");
    expect(resolveDeploymentMode("local", "production")).toBe("local");
    expect(resolveDeploymentMode("hosted", "production")).toBe("hosted");
  });

  it("resolves the mode inside both strict loaders, so a root cannot skip it", () => {
    const runner = validRunnerEnvironmentFixture();
    const api = validApiEnvironmentFixture();
    expect(parseRunnerEnvironment({ ...runner, DEBATEAI_DEPLOYMENT_MODE: "hosted" }).DEPLOYMENT_MODE)
      .toBe("hosted");
    expect(parseApiEnvironment({ ...api, DEBATEAI_DEPLOYMENT_MODE: "hosted" }).DEPLOYMENT_MODE)
      .toBe("hosted");
    expect(() => parseRunnerEnvironment({
      ...runner, NODE_ENV: "production", DEBATEAI_DEPLOYMENT_MODE: undefined
    })).toThrowError(expect.objectContaining({ code: "DEPLOYMENT_MODE_UNRESOLVED" }));
    expect(() => parseApiEnvironment({
      ...api, NODE_ENV: "production", DEBATEAI_DEPLOYMENT_MODE: undefined
    })).toThrowError(expect.objectContaining({ code: "DEPLOYMENT_MODE_UNRESOLVED" }));
  });
});

describe("V-9 mode x provider target (task 10a)", () => {
  for (const row of TABLE) {
    it(`${row.kind}: hosted ${row.hosted ?? "admits"}`, () => {
      const assertion = () => assertDeploymentProviderTargets(targets(row.kind), {
        mode: "hosted", nodeEnv: "production"
      });
      if (row.hosted === null) expect(assertion).not.toThrow();
      else expect(assertion).toThrowError(new TypeError(row.hosted));
    });

    it(`${row.kind}: local/production ${row.localProduction ?? "admits"}`, () => {
      const assertion = () => assertDeploymentProviderTargets(targets(row.kind), {
        mode: "local", nodeEnv: "production"
      });
      if (row.localProduction === null) expect(assertion).not.toThrow();
      else expect(assertion).toThrowError(new TypeError(row.localProduction));
    });

    it(`${row.kind}: local/development ${row.localDevelopment ?? "admits"}`, () => {
      for (const nodeEnv of ["development", "test", undefined]) {
        const assertion = () => assertDeploymentProviderTargets(targets(row.kind), {
          mode: "local", nodeEnv
        });
        if (row.localDevelopment === null) expect(assertion).not.toThrow();
        else expect(assertion).toThrowError(new TypeError(row.localDevelopment));
      }
    });
  }

  it("names the provider in a refusal and never the credential", () => {
    const caught = (() => {
      try {
        assertDeploymentProviderTargets(targets("vendor-https-inline-credential"), {
          mode: "hosted", nodeEnv: "production"
        });
        return null;
      } catch (error) {
        return error as Error;
      }
    })();
    expect(caught).toBeInstanceOf(TypeError);
    expect(caught?.message).toContain("provider-1");
    expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {}))).not.toContain(SECRET);
    expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {})))
      .not.toContain("v9-fixture-token-never-printed");
  });

  it("refuses the whole set on the FIRST offending member, so one bad row stops the boot", () => {
    const mixed = parseProviderDiscoveryTargets(JSON.stringify([
      { provider_ref: "provider-1", model: "model-1", base_url: "https://a.vendor.example/v1" },
      { provider_ref: "provider-2", model: "model-2", base_url: "http://127.0.0.1:8791/v1" }
    ]), [
      { providerRef: "provider-1", maker: "maker-1" },
      { providerRef: "provider-2", maker: "maker-2" }
    ]);
    expect(() => assertDeploymentProviderTargets(mixed, { mode: "hosted", nodeEnv: "production" }))
      .toThrowError(new TypeError("PROVIDER_BASE_URL_TLS_REQUIRED:provider-2"));
    expect(() => assertDeploymentProviderTargets(mixed, { mode: "local", nodeEnv: "production" }))
      .not.toThrow();
  });
});

describe("V-28 seam: hosted refuses until the cost envelopes are sealed (task 11)", () => {
  it("reports the envelopes as not sealed until task 11 publishes them", () => {
    expect(readSealedCostEnvelopeStatus()).toBe("NOT_SEALED");
  });

  it("refuses a hosted start-up while the seam says NOT_SEALED", () => {
    expect(() => assertHostedCostEnvelopesSealed("hosted"))
      .toThrowError(expect.objectContaining({ code: "COST_ENVELOPES_NOT_SEALED" }));
  });

  it("leaves local mode alone — envelopes are a hosted-spend control", () => {
    expect(() => assertHostedCostEnvelopesSealed("local")).not.toThrow();
  });

  it("admits hosted the moment the seam reports SEALED", () => {
    expect(() => assertHostedCostEnvelopesSealed("hosted", () => "SEALED")).not.toThrow();
  });
});

describe("V-9 both shipped roots take the mode decision (task 10a)", () => {
  it("runs the mode-aware target assertion in the API and the runner", async () => {
    for (const path of ["../../apps/api/src/main.ts", "../../apps/runner/src/main.ts"]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("assertDeploymentProviderTargets(");
      expect(source).toContain("environment.DEPLOYMENT_MODE");
    }
  });

  it("asks the runner for sealed cost envelopes before it claims any work", async () => {
    const source = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(source).toContain("assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE)");
  });
});
