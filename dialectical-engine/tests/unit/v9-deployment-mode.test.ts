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
  "offbox-http": { base_url: "http://gateway.internal/v1" },
  // Review finding 1. `LOOPBACK_HOSTS` was written as a PERMIT-list of four exact
  // spellings for L4-F7; read as a hosted DENY-list it admitted every alias below.
  // `https:` is no backstop here: the kit installs a private CA
  // (`NODE_EXTRA_CA_CERTS`) and already runs internal TLS on loopback
  // (`HATCHET_API_URL=https://127.0.0.1:8888`), so a TLS relay on an alias passes.
  // The decision is taken on the PARSED address, not on the spelling.
  "loopback-alias-https": { base_url: "https://127.0.0.2:8443/v1" },
  "loopback-range-end-https": { base_url: "https://127.255.255.254/v1" },
  "loopback-shorthand-https": { base_url: "https://127.1/v1" },
  "loopback-decimal-https": { base_url: "https://2130706433/v1" },
  "localhost-uppercase-https": { base_url: "https://LOCALHOST/v1" },
  "localhost-trailing-dot-https": { base_url: "https://localhost./v1" },
  "localhost-subdomain-https": { base_url: "https://relay.localhost/v1" },
  "localhost-subdomain-dot-https": { base_url: "https://RELAY.LocalHost./v1" },
  "ipv4-mapped-loopback-https": { base_url: "https://[::ffff:127.0.0.1]/v1" },
  "ipv4-mapped-loopback-alias-https": { base_url: "https://[::ffff:127.0.0.2]/v1" },
  "ipv6-loopback-expanded-https": { base_url: "https://[0:0:0:0:0:0:0:1]/v1" },
  "unspecified-ipv4-https": { base_url: "https://0.0.0.0/v1" },
  "unspecified-ipv6-https": { base_url: "https://[::]/v1" },
  // Re-review finding 2: the rest of "this machine" as a host actually spells it.
  // The three names are default `/etc/hosts` aliases on a Debian/Ubuntu host —
  // the kit's own platform — and the two ranges are addresses a relay can be
  // bound to on the web server itself.
  "localhost-localdomain-https": { base_url: "https://localhost.localdomain/v1" },
  "localhost-localdomain-dot-https": { base_url: "https://LOCALHOST.LOCALDOMAIN./v1" },
  "ip6-localhost-name-https": { base_url: "https://ip6-localhost/v1" },
  "ip6-loopback-name-https": { base_url: "https://ip6-loopback/v1" },
  "this-network-https": { base_url: "https://0.0.0.1/v1" },
  "this-network-high-https": { base_url: "https://0.1.2.3/v1" },
  "link-local-ipv4-https": { base_url: "https://169.254.169.254/v1" },
  "link-local-ipv4-low-https": { base_url: "https://169.254.0.1/v1" },
  "link-local-ipv6-https": { base_url: "https://[fe80::1]/v1" },
  "link-local-ipv6-top-https": { base_url: "https://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/v1" },
  "ipv4-mapped-link-local-https": { base_url: "https://[::ffff:169.254.1.1]/v1" },
  "ipv4-mapped-this-network-https": { base_url: "https://[::ffff:0.0.0.1]/v1" },
  // Controls just OUTSIDE each new range, which must stay admitted.
  "vendor-below-link-local-https": { base_url: "https://169.253.0.1/v1" },
  "vendor-public-resolver-https": { base_url: "https://1.0.0.1/v1" },
  "vendor-below-fe80-https": { base_url: "https://[fe00::1]/v1" },
  "vendor-above-fe80-https": { base_url: "https://[fec0::1]/v1" },
  "vendor-localdomain-suffix-https": { base_url: "https://localhost.localdomain.example/v1" },
  "vendor-ip6-name-suffix-https": { base_url: "https://ip6-localhost.example/v1" },
  // NEGATIVE controls: real vendor hostnames that merely LOOK loopback-ish. A
  // deny-list that refused these would be an outage, not a protection.
  "vendor-loopback-lookalike-https": { base_url: "https://127.0.0.1.vendor.example/v1" },
  "vendor-notlocalhost-https": { base_url: "https://notlocalhost.example/v1" },
  "vendor-localhost-suffix-https": { base_url: "https://mylocalhost.example/v1" }
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
  },
  // Every spelling of "this machine" is refused in hosted mode. All of them are
  // `https:`, so L4-F7 — which only ever constrained `http:` — admits them in
  // local mode exactly as it did before: the local PERMIT-list is deliberately
  // NOT widened, because widening a permit-list relaxes a floor.
  ...([
    "loopback-alias-https",
    "loopback-range-end-https",
    "loopback-shorthand-https",
    "loopback-decimal-https",
    "localhost-uppercase-https",
    "localhost-trailing-dot-https",
    "localhost-subdomain-https",
    "localhost-subdomain-dot-https",
    "ipv4-mapped-loopback-https",
    "ipv4-mapped-loopback-alias-https",
    "ipv6-loopback-expanded-https",
    "unspecified-ipv4-https",
    "unspecified-ipv6-https",
    "localhost-localdomain-https",
    "localhost-localdomain-dot-https",
    "ip6-localhost-name-https",
    "ip6-loopback-name-https",
    "this-network-https",
    "this-network-high-https",
    "link-local-ipv4-https",
    "link-local-ipv4-low-https",
    "link-local-ipv6-https",
    "link-local-ipv6-top-https",
    "ipv4-mapped-link-local-https",
    "ipv4-mapped-this-network-https"
  ] as const).map((kind) => ({
    kind,
    hosted: "PROVIDER_TARGET_LOOPBACK_REFUSED:provider-1",
    localProduction: null,
    localDevelopment: null
  })),
  ...([
    "vendor-loopback-lookalike-https",
    "vendor-notlocalhost-https",
    "vendor-localhost-suffix-https",
    "vendor-below-link-local-https",
    "vendor-public-resolver-https",
    "vendor-below-fe80-https",
    "vendor-above-fe80-https",
    "vendor-localdomain-suffix-https",
    "vendor-ip6-name-suffix-https"
  ] as const).map((kind) => ({
    kind, hosted: null, localProduction: null, localDevelopment: null
  }))
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

  /**
   * Review finding 1, the other half: the L4-F7 permit-list is a PERMIT-list, so
   * widening it would ADMIT more cleartext targets in a local production
   * deployment. The two predicates therefore differ on purpose, and each is the
   * stricter reading of its own polarity. This case pins that they differ.
   */
  it("does not widen the local-mode cleartext permit-list", () => {
    for (const host of ["127.0.0.2:8791", "[::ffff:127.0.0.1]:8791", "0.0.0.0:8791", "relay.localhost:8791"]) {
      const target = parseProviderDiscoveryTargets(
        JSON.stringify([{ provider_ref: "provider-1", model: "model-1", base_url: `http://${host}/v1` }]),
        [{ providerRef: "provider-1", maker: "maker-1" }]
      );
      expect(() => assertDeploymentProviderTargets(target, { mode: "local", nodeEnv: "production" }))
        .toThrowError(new TypeError("PROVIDER_BASE_URL_TLS_REQUIRED:provider-1"));
    }
    // ...while the four spellings L4-F7 always permitted stay permitted.
    for (const host of ["127.0.0.1:8791", "[::1]:8791", "localhost:8791"]) {
      const target = parseProviderDiscoveryTargets(
        JSON.stringify([{ provider_ref: "provider-1", model: "model-1", base_url: `http://${host}/v1` }]),
        [{ providerRef: "provider-1", maker: "maker-1" }]
      );
      expect(() => assertDeploymentProviderTargets(target, { mode: "local", nodeEnv: "production" }))
        .not.toThrow();
    }
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

/**
 * TASK 11 FILLED THE SEAM (V-28). The two cases that pinned its placeholder —
 * "reports NOT_SEALED until task 11 publishes them" and "refuses a hosted
 * start-up while the seam says NOT_SEALED with no argument" — described a state
 * that no longer exists and were deleted rather than relaxed: the rows are
 * published, so the seam reports SEALED.
 *
 * What SURVIVES here is the part that is task 10's and must not move: local mode
 * is untouched, and a hosted boot refuses whenever the seam does not say SEALED.
 * The envelopes' own behaviour is pinned in `v28-cost-envelope.test.ts`.
 */
describe("V-28 seam: hosted refuses unless the cost envelopes are sealed (task 11)", () => {
  it("reports the envelopes as sealed now that task 11 published the rows", () => {
    expect(readSealedCostEnvelopeStatus()).toBe("SEALED");
  });

  it("refuses a hosted start-up whenever the seam does not say SEALED", () => {
    expect(() => assertHostedCostEnvelopesSealed("hosted", () => "NOT_SEALED"))
      .toThrowError(expect.objectContaining({ code: "COST_ENVELOPES_NOT_SEALED" }));
  });

  it("leaves local mode alone — envelopes are a hosted-spend control", () => {
    expect(() => assertHostedCostEnvelopesSealed("local", () => "NOT_SEALED")).not.toThrow();
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

  it("asks BOTH roots for sealed cost envelopes before either spends anything", async () => {
    // The runner calls the vendor; the API's ask-time health probe is itself a
    // model call. A hosted deployment that could spend from either side while
    // the envelopes are unsealed would only be half a control.
    for (const path of ["../../apps/api/src/main.ts", "../../apps/runner/src/main.ts"]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE)");
    }
  });
});
