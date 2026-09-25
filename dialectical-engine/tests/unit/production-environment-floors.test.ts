import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadObservationAgentEnvironment } from "../../packages/register/src/runtime-environment.js";
import {
  parseApiEnvironment,
  parseKeyRotationEnvironment,
  parseLivenessEnvironment,
  parseMigrationEnvironment,
  parseReplaySelfTestEnvironment,
  parseRunnerEnvironment,
  parseSettlementEnvironment
} from "@debateai/register";
import { keyRotationEnvironmentCode } from "../../apps/runner/src/rotate-kek-cli.js";
import { assertProductionProviderTargets, parseProviderDiscoveryTargets } from "@debateai/providers";
import {
  validApiEnvironmentFixture,
  validRunnerEnvironmentFixture
} from "../support/apiEnvironmentFixture.js";

type Overrides = Readonly<Record<string, string | undefined>>;

const production = (overrides: Overrides = {}) =>
  parseApiEnvironment({ ...validApiEnvironmentFixture(), NODE_ENV: "production", ...overrides });
const productionRunner = (overrides: Overrides = {}) =>
  parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), NODE_ENV: "production", ...overrides });

const REMOTE_PLAIN = "postgresql://svc:pw@db.internal:5432/debateai";
const REMOTE_VERIFIED =
  "postgresql://svc:pw@db.internal:5432/debateai?sslmode=verify-full&sslrootcert=/etc/debateai/db-ca.pem";

describe("production configuration floors (R2)", () => {
  describe("remote database URLs need verified TLS with a pinned CA (L5-F3)", () => {
    it("accepts loopback and unix-socket database hosts without TLS", () => {
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@127.0.0.1:5432/debateai?sslmode=disable" })).not.toThrow();
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@localhost:5432/debateai" })).not.toThrow();
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@[::1]:5432/debateai" })).not.toThrow();
      expect(() => production({ DATABASE_URL: "postgresql:///debateai?host=/run/postgresql" })).not.toThrow();
    });

    it("accepts a remote database URL with sslmode=verify-full and a pinned root certificate", () => {
      expect(() => production({ DATABASE_URL: REMOTE_VERIFIED })).not.toThrow();
    });

    it("refuses a remote database URL without sslmode=verify-full", () => {
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@db.internal:5432/debateai?sslmode=require" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
      expect(() => production({ ERASURE_DATABASE_URL: "postgresql://erasure:pw@10.0.0.5:5432/debateai" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:ERASURE_DATABASE_URL");
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@db.internal:5432/debateai?sslmode=no-verify" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@db.internal:5432/debateai?sslmode=verify-ca&sslrootcert=/etc/debateai/db-ca.pem" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
      expect(() => production({ DATABASE_URL: "postgresql:///debateai?host=db.internal" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
    });

    it("refuses verify-full without a pinned root certificate, libpq-compat mode, and ssl=0", () => {
      expect(() => production({ DATABASE_URL: "postgresql://api:pw@db.internal:5432/debateai?sslmode=verify-full" }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
      expect(() => production({ DATABASE_URL: `${REMOTE_VERIFIED}&uselibpqcompat=true` }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
      expect(() => production({ DATABASE_URL: `${REMOTE_VERIFIED}&ssl=0` }))
        .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
    });

    it("names the offending key for every API database URL", () => {
      for (const key of [
        "AUTHORIZATION_DATABASE_URL",
        "CONTENT_PROVISION_DATABASE_URL",
        "PUBLICATION_CLEANUP_DATABASE_URL",
        "EVALUATOR_DEV_MENU_DATABASE_URL"
      ]) {
        expect(() => production({ [key]: `postgresql://${key.toLowerCase()}:pw@10.0.0.5:5432/debateai` }))
          .toThrow(`DATABASE_URL_TLS_REQUIRED:${key}`);
      }
    });

    it("floors every other database-URL loader, including the superuser migration URL", () => {
      const loaders = [
        ["MIGRATION_DATABASE_URL", parseMigrationEnvironment],
        ["REPLAY_SELF_TEST_DATABASE_URL", parseReplaySelfTestEnvironment],
        ["LIVENESS_DATABASE_URL", parseLivenessEnvironment],
        ["SETTLEMENT_DATABASE_URL", parseSettlementEnvironment]
      ] as const;
      for (const [key, parse] of loaders) {
        expect(() => parse({ [key]: REMOTE_PLAIN, NODE_ENV: "production" }))
          .toThrow(`DATABASE_URL_TLS_REQUIRED:${key}`);
        expect(() => parse({ [key]: `${REMOTE_VERIFIED}&uselibpqcompat=true`, NODE_ENV: "production" }))
          .toThrow(`DATABASE_URL_TLS_REQUIRED:${key}`);
        expect(() => parse({ [key]: REMOTE_VERIFIED, NODE_ENV: "production" })).not.toThrow();
        expect(() => parse({ [key]: "postgresql://svc:pw@127.0.0.1:5432/debateai", NODE_ENV: "production" })).not.toThrow();
        expect(() => parse({ [key]: REMOTE_PLAIN, NODE_ENV: "development" })).not.toThrow();
        expect(() => parse({ [key]: REMOTE_PLAIN })).not.toThrow();
      }
    });
  });

  it("requires content encryption in production (L5-F5)", () => {
    expect(() => production({ CONTENT_ENCRYPTION_ENABLED: "false" }))
      .toThrow("CONTENT_ENCRYPTION_REQUIRED_IN_PRODUCTION");
    expect(() => production({ CONTENT_ENCRYPTION_ENABLED: undefined }))
      .toThrow("CONTENT_ENCRYPTION_REQUIRED_IN_PRODUCTION");
    expect(() => production({ CONTENT_ENCRYPTION_ENABLED: "true" })).not.toThrow();
  });

  it("refuses HATCHET_TLS_STRATEGY=none against a non-loopback Hatchet (L4-F5)", () => {
    expect(() => production({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "hatchet.internal:7077" }))
      .toThrow("HATCHET_TLS_REQUIRED");
    expect(() => production({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "10.0.0.7:7077" }))
      .toThrow("HATCHET_TLS_REQUIRED");
    for (const hostPort of ["127.0.0.1:7077", "[::1]:7077", "localhost:7077"]) {
      expect(() => production({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: hostPort })).not.toThrow();
    }
    expect(() => production({ HATCHET_TLS_STRATEGY: "tls", HATCHET_HOST_PORT: "hatchet.internal:7077" })).not.toThrow();
  });

  it("refuses a public API bind (the edge proxy is the only public listener)", () => {
    expect(() => production({ API_HOST: "0.0.0.0" })).toThrow("API_HOST_MUST_BE_LOOPBACK");
    expect(() => production({ API_HOST: "::" })).toThrow("API_HOST_MUST_BE_LOOPBACK");
    expect(() => production({ API_HOST: "10.0.0.5" })).toThrow("API_HOST_MUST_BE_LOOPBACK");
    for (const host of ["127.0.0.1", "::1", "localhost"]) {
      expect(() => production({ API_HOST: host })).not.toThrow();
    }
  });

  it("applies the database, encryption and Hatchet floors to the runner loader (L4-F5, L5-F5)", () => {
    expect(() => productionRunner()).not.toThrow();
    expect(() => productionRunner({ DATABASE_URL: "postgresql://runner:pw@db.internal:5432/debateai?sslmode=require" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
    expect(() => productionRunner({ DATABASE_URL: REMOTE_VERIFIED })).not.toThrow();
    expect(() => productionRunner({ CONTENT_ENCRYPTION_ENABLED: "false" }))
      .toThrow("CONTENT_ENCRYPTION_REQUIRED_IN_PRODUCTION");
    expect(() => productionRunner({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "hatchet.internal:7077" }))
      .toThrow("HATCHET_TLS_REQUIRED");
    expect(() => productionRunner({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "127.0.0.1:7077" })).not.toThrow();
  });

  it("applies none of this outside production", () => {
    const insecure = {
      API_HOST: "0.0.0.0",
      CONTENT_ENCRYPTION_ENABLED: "false",
      HATCHET_TLS_STRATEGY: "none",
      HATCHET_HOST_PORT: "hatchet.internal:7077",
      DATABASE_URL: REMOTE_PLAIN
    };
    for (const NODE_ENV of ["development", "test", undefined]) {
      expect(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), ...insecure, NODE_ENV })).not.toThrow();
      expect(() => parseRunnerEnvironment({
        ...validRunnerEnvironmentFixture(), ...insecure, API_HOST: undefined, NODE_ENV
      })).not.toThrow();
    }
  });

  it("refuses with typed TypeErrors whose message is the code", () => {
    expect(() => production({ API_HOST: "0.0.0.0" })).toThrowError(TypeError);
    expect(() => production({ API_HOST: "0.0.0.0" })).toThrowError(/^API_HOST_MUST_BE_LOOPBACK$/u);
    expect(() => production({ DATABASE_URL: REMOTE_PLAIN }))
      .toThrowError(/^DATABASE_URL_TLS_REQUIRED:DATABASE_URL$/u);
  });

  it("wires every process.env loader through its source-injecting twin", async () => {
    const source = await readFile(
      new URL("../../packages/register/src/runtime-environment.ts", import.meta.url),
      "utf8"
    );
    for (const name of ["Migration", "ReplaySelfTest", "Liveness", "Settlement", "Runner"]) {
      expect(source).toContain(
        `export function load${name}Environment() {\n  return parse${name}Environment(process.env);\n}`
      );
    }
    expect(source).toContain("validateApiEnvironment(parseEnvironment(apiEnvironmentShape))");
    expect(source).toContain("validateApiEnvironment(parseEnvironmentSource(apiEnvironmentShape, source))");
    expect(source).toContain("assertProductionFloors(environment)");
  });
});

const configuredProviders = (size: number) => Array.from({ length: size }, (_, index) => Object.freeze({
  providerRef: `provider-${index + 1}`,
  maker: `maker-${index + 1}`
}));

const providerTargets = (baseUrls: readonly string[]) => parseProviderDiscoveryTargets(
  JSON.stringify(baseUrls.map((base_url, index) => ({
    provider_ref: `provider-${index + 1}`,
    base_url,
    model: `model-${index + 1}`,
    ...(index === 0 ? { authorization_header: "Bearer fixture-secret" } : {})
  }))),
  configuredProviders(baseUrls.length)
);

describe("production provider targets refuse cleartext off-box (L4-F7)", () => {
  it("accepts loopback http targets and any https target in production", () => {
    expect(() => assertProductionProviderTargets(providerTargets([
      "http://127.0.0.1:8791/v1", "http://[::1]:8791/v1", "http://localhost:8791/v1", "https://gateway.internal/v1"
    ]), "production")).not.toThrow();
  });

  it("refuses a non-loopback http target and names the provider", () => {
    expect(() => assertProductionProviderTargets(
      providerTargets(["http://127.0.0.1:8791/v1", "http://gateway.internal/v1"]),
      "production"
    )).toThrow("PROVIDER_BASE_URL_TLS_REQUIRED:provider-2");
    expect(() => assertProductionProviderTargets(providerTargets(["http://10.0.0.9:8000/v1"]), "production"))
      .toThrowError(/^PROVIDER_BASE_URL_TLS_REQUIRED:provider-1$/u);
    expect(() => assertProductionProviderTargets(providerTargets(["http://10.0.0.9:8000/v1"]), "production"))
      .toThrowError(TypeError);
  });

  it("applies nothing outside production", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(() => assertProductionProviderTargets(providerTargets(["http://gateway.internal/v1"]), nodeEnv))
        .not.toThrow();
    }
  });

  /**
   * V-9(c) / task 10a: the roots now take ONE mode-aware decision, and its local
   * arm is this rule, unchanged. The pin follows the call rather than the name,
   * so "both roots floor their targets in production" stays enforced while the
   * hosted arm (`assertHostedProviderTargets`) adds its own stricter refusals.
   */
  it("is applied where both process roots parse their targets, through the mode", async () => {
    for (const path of ["../../apps/api/src/main.ts", "../../apps/runner/src/main.ts"]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("assertDeploymentProviderTargets(");
      expect(source).toContain("environment.NODE_ENV");
      expect(source).toContain("environment.DEPLOYMENT_MODE");
    }
    const dispatcher = await readFile(
      new URL("../../packages/providers/src/index.ts", import.meta.url), "utf8"
    );
    expect(dispatcher).toContain("assertProductionProviderTargets(targets, deployment.nodeEnv)");
  });
});

// DEV-SYNC 2026-09-18: the observation agent's loader landed on dev after C1 and read
// its database URL past the floor. The rule is C1's — EVERY loader floors every
// `*_DATABASE_URL` in production — and the agent's monitoring login is no exception.
describe("production floors reach the observation agent's loader (C1, L5-F3)", () => {
  const REMOTE_PLAIN = "postgresql://observation:secret@db.internal:5432/debateai";
  const REMOTE_VERIFIED = `${REMOTE_PLAIN}?sslmode=verify-full&sslrootcert=/etc/debateai/postgres-tls/ca.crt`;
  const LOOPBACK = "postgresql://observation:secret@127.0.0.1:5432/debateai";

  function stubAgentEnvironment(databaseUrl: string, nodeEnvironment: string | undefined): void {
    vi.stubEnv("OBSERVATION_DATABASE_URL", databaseUrl);
    vi.stubEnv("OBSERVATION_STATE_DIR", "/var/lib/debateai/observation");
    vi.stubEnv("OBSERVATION_TARGETS_PATH", "/etc/debateai/observation-targets.json");
    vi.stubEnv("NODE_ENV", nodeEnvironment);
  }

  afterEach(() => vi.unstubAllEnvs());

  it("refuses a remote observation database without verified TLS in production", () => {
    stubAgentEnvironment(REMOTE_PLAIN, "production");
    expect(() => loadObservationAgentEnvironment())
      .toThrow("DATABASE_URL_TLS_REQUIRED:OBSERVATION_DATABASE_URL");
  });

  it("accepts verified-TLS and loopback targets in production, and returns only the agent's own keys", () => {
    stubAgentEnvironment(REMOTE_VERIFIED, "production");
    expect(loadObservationAgentEnvironment()).toEqual({
      OBSERVATION_DATABASE_URL: REMOTE_VERIFIED,
      OBSERVATION_STATE_DIR: "/var/lib/debateai/observation",
      OBSERVATION_TARGETS_PATH: "/etc/debateai/observation-targets.json"
    });
    stubAgentEnvironment(LOOPBACK, "production");
    expect(loadObservationAgentEnvironment().OBSERVATION_DATABASE_URL).toBe(LOOPBACK);
  });

  it("applies nothing outside production", () => {
    for (const nodeEnvironment of ["development", "test", undefined]) {
      stubAgentEnvironment(REMOTE_PLAIN, nodeEnvironment);
      expect(loadObservationAgentEnvironment().OBSERVATION_DATABASE_URL, String(nodeEnvironment)).toBe(REMOTE_PLAIN);
    }
  });
});

/**
 * FIX WAVE C-I7 (final review C). The key-rotation loader carried no `NODE_ENV`
 * and applied no floors, so `SUPPORT_DATABASE_URL` was the one `*_DATABASE_URL`
 * in the tree that was never floored — and the rotation is precisely the
 * command that WRITES two support key columns. Run on the production host
 * against an off-box support database with no `sslmode=verify-full`, the whole
 * re-wrap travelled in cleartext where every other loader refuses.
 */
describe("production floors reach the key-rotation loader (C-I7)", () => {
  const ROTATION = Object.freeze({
    KEK_PATH: "/run/secrets/kek",
    USER_DEK_STORE_PATH: "/run/secrets/user-deks",
    SUPPORT_KEK_PATH: "/run/secrets/support-kek"
  });

  it("refuses a remote support database without verified TLS in production", () => {
    expect(() => parseKeyRotationEnvironment({
      ...ROTATION, SUPPORT_DATABASE_URL: REMOTE_PLAIN, NODE_ENV: "production"
    })).toThrow("DATABASE_URL_TLS_REQUIRED:SUPPORT_DATABASE_URL");
  });

  it("accepts a verified-TLS or unix-socket support database in production", () => {
    expect(parseKeyRotationEnvironment({
      ...ROTATION, SUPPORT_DATABASE_URL: REMOTE_VERIFIED, NODE_ENV: "production"
    }).SUPPORT_DATABASE_URL).toBe(REMOTE_VERIFIED);
    const socket = "postgresql://debateai_prod_api_support:pw@localhost/debateai?host=/var/run/postgresql";
    expect(parseKeyRotationEnvironment({
      ...ROTATION, SUPPORT_DATABASE_URL: socket, NODE_ENV: "production"
    }).SUPPORT_DATABASE_URL).toBe(socket);
  });

  it("applies nothing outside production, and NODE_ENV stays optional", () => {
    for (const nodeEnvironment of ["development", "test", undefined]) {
      expect(parseKeyRotationEnvironment({
        ...ROTATION, SUPPORT_DATABASE_URL: REMOTE_PLAIN, NODE_ENV: nodeEnvironment
      }).SUPPORT_DATABASE_URL, String(nodeEnvironment)).toBe(REMOTE_PLAIN);
    }
  });

  /**
   * M5: a refusal from this loader must still NAME the variable when it reaches
   * the operator, or the one line the command prints says nothing actionable.
   */
  it("names the variable in the line the rotation command prints", () => {
    const refusal = (() => {
      try {
        parseKeyRotationEnvironment({
          ...ROTATION, SUPPORT_DATABASE_URL: REMOTE_PLAIN, NODE_ENV: "production"
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(keyRotationEnvironmentCode(refusal))
      .toBe("DATABASE_URL_TLS_REQUIRED:SUPPORT_DATABASE_URL");
  });
});
