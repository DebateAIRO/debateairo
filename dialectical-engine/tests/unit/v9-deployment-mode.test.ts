import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_MODES,
  assertHostedCostEnvelopesSealed,
  parseApiEnvironment,
  parseRunnerEnvironment,
  resolveDeploymentMode
} from "../../packages/register/src/runtime-environment.js";
import {
  assertDeploymentProviderTargets,
  isRefusedHostedProviderHost,
  parseProviderDiscoveryTargets,
  thisMachineAddressKeys
} from "../../packages/providers/src/index.js";
import {
  validApiEnvironmentFixture,
  validRunnerEnvironmentFixture
} from "../support/apiEnvironmentFixture.js";

import { rm } from "node:fs/promises";
import { afterEach, vi } from "vitest";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "../../apps/runner/src/dev-api-environment.js";
import {
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChild,
  type DevelopmentRunnerProcessOperations
} from "../../apps/runner/src/dev-runner-process.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  createDevApiEnvironmentAssemblyFixture,
  assembleDevApiEnvironmentFixture
} from "../support/devApiEnvironmentAssembly.js";

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
  // C-I3 (final review, area C): the PRIVATE networks. No paid vendor's public
  // API can be at one of these, and the hosted operator's own VPS interface,
  // its Docker bridge and its cloud metadata service all are — so a relay one
  // hop away on the private side passed the hosted check that exists to refuse
  // exactly that. RFC 1918, RFC 6598 (CGNAT) and RFC 4193 (ULA).
  "private-10-https": { base_url: "https://10.0.0.2:8443/v1" },
  "private-10-top-https": { base_url: "https://10.255.255.254/v1" },
  "private-172-16-https": { base_url: "https://172.16.0.1/v1" },
  "private-172-31-https": { base_url: "https://172.31.255.254/v1" },
  "private-192-168-https": { base_url: "https://192.168.1.10/v1" },
  "cgnat-https": { base_url: "https://100.64.0.1/v1" },
  "cgnat-top-https": { base_url: "https://100.127.255.254/v1" },
  "ula-fc-https": { base_url: "https://[fc00::1]/v1" },
  "ula-fd-https": { base_url: "https://[fd00::1]/v1" },
  "ula-top-https": { base_url: "https://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/v1" },
  "ipv4-mapped-private-10-https": { base_url: "https://[::ffff:10.0.0.2]/v1" },
  "ipv4-mapped-private-192-168-https": { base_url: "https://[::ffff:192.168.1.10]/v1" },
  "ipv4-mapped-cgnat-https": { base_url: "https://[::ffff:100.64.0.1]/v1" },
  // Controls just OUTSIDE each new range, which must stay admitted.
  "vendor-below-private-10-https": { base_url: "https://9.255.255.254/v1" },
  "vendor-above-private-10-https": { base_url: "https://11.0.0.1/v1" },
  "vendor-below-private-172-https": { base_url: "https://172.15.255.254/v1" },
  "vendor-above-private-172-https": { base_url: "https://172.32.0.1/v1" },
  "vendor-below-private-192-168-https": { base_url: "https://192.167.255.254/v1" },
  "vendor-above-private-192-168-https": { base_url: "https://192.169.0.1/v1" },
  "vendor-below-cgnat-https": { base_url: "https://100.63.255.254/v1" },
  "vendor-above-cgnat-https": { base_url: "https://100.128.0.1/v1" },
  "vendor-below-ula-https": { base_url: "https://[fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/v1" },
  "vendor-mapped-public-https": { base_url: "https://[::ffff:9.9.9.9]/v1" },
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
    "ipv4-mapped-this-network-https",
    "private-10-https",
    "private-10-top-https",
    "private-172-16-https",
    "private-172-31-https",
    "private-192-168-https",
    "cgnat-https",
    "cgnat-top-https",
    "ula-fc-https",
    "ula-fd-https",
    "ula-top-https",
    "ipv4-mapped-private-10-https",
    "ipv4-mapped-private-192-168-https",
    "ipv4-mapped-cgnat-https"
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
    "vendor-ip6-name-suffix-https",
    "vendor-below-private-10-https",
    "vendor-above-private-10-https",
    "vendor-below-private-172-https",
    "vendor-above-private-172-https",
    "vendor-below-private-192-168-https",
    "vendor-above-private-192-168-https",
    "vendor-below-cgnat-https",
    "vendor-above-cgnat-https",
    "vendor-below-ula-https",
    "vendor-mapped-public-https"
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
   * C-I3 — THE HOST'S OWN ADDRESSES, READ ONCE AT START-UP.
   *
   * The private ranges above cover the address a relay on the private side of
   * the VPS would use. They do NOT cover the case the hosted deployment
   * actually has: a VPS answers on a PUBLIC address of its own, and
   * `https://<that address>/v1` is the same machine by any reading. No DNS is
   * involved — the addresses come from `os.networkInterfaces()`, once, at
   * module load, and the comparison is on the parsed literal exactly as every
   * other clause here.
   */
  it("refuses every literal address this host holds", () => {
    const addresses = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .map((entry) => entry.address);
    // Loopback alone is enough for the assertion below to be honest, but a
    // host with no interface at all would make it vacuous.
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      const bare = address.split("%")[0]!;
      const host = bare.includes(":") ? `[${bare}]` : bare;
      const target = parseProviderDiscoveryTargets(
        JSON.stringify([{ provider_ref: "provider-1", model: "model-1", base_url: `https://${host}/v1` }]),
        [{ providerRef: "provider-1", maker: "maker-1" }]
      );
      expect(() => assertDeploymentProviderTargets(target, { mode: "hosted", nodeEnv: "production" }), host)
        .toThrowError(new TypeError("PROVIDER_TARGET_LOOPBACK_REFUSED:provider-1"));
    }
  });

  /**
   * ...and the decision is taken against THAT SET, not against a list of ranges
   * that happens to contain it. 203.0.113.0/24 is TEST-NET-3 (RFC 5737): it is
   * routable-looking, is in no private range, and is on no interface of this
   * host — so it is admitted, and refused only when the set holds it.
   */
  it("decides the own-address class on the read-once set, in every spelling", () => {
    expect(isRefusedHostedProviderHost("203.0.113.9")).toBe(false);
    const held = thisMachineAddressKeys(["203.0.113.9", "2001:db8::5%en0"]);
    expect(isRefusedHostedProviderHost("203.0.113.9", held)).toBe(true);
    // The same interface address written as an IPv4-mapped IPv6 literal, in
    // both the dotted-quad spelling and the one Node normalises it to.
    expect(isRefusedHostedProviderHost("[::ffff:203.0.113.9]", held)).toBe(true);
    expect(isRefusedHostedProviderHost(new URL("https://[::ffff:203.0.113.9]/v1").hostname, held))
      .toBe(true);
    // A scoped IPv6 interface address: the zone names the interface, not the
    // address, so the target's unscoped spelling must still match.
    expect(isRefusedHostedProviderHost("[2001:db8::5]", held)).toBe(true);
    expect(isRefusedHostedProviderHost("[2001:DB8:0:0:0:0:0:5]", held)).toBe(true);
    // A neighbour of a held address is not the host.
    expect(isRefusedHostedProviderHost("203.0.113.10", held)).toBe(false);
    expect(isRefusedHostedProviderHost("[2001:db8::6]", held)).toBe(false);
    // A NAME is never resolved (README §11 says so, and the code comment does).
    expect(isRefusedHostedProviderHost("api.vendor.example", held)).toBe(false);
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

describe("S02 — the development stack names its deployment mode", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("declares DEBATEAI_DEPLOYMENT_MODE=local in the API environment the development stack assembles", async () => {
    const fixture = await createDevApiEnvironmentAssemblyFixture();
    roots.push(fixture.repositoryRoot);
    vi.stubEnv("DEBATEAI_DEV_CUSTODY_ROOT", fixture.custodyRoot);
    expect(DEVELOPMENT_API_ENVIRONMENT_KEYS).toContain("DEBATEAI_DEPLOYMENT_MODE");
    await assembleDevApiEnvironmentFixture(fixture.repositoryRoot);
    const rows = (await readFile(fixture.outputFilePath, "utf8")).trimEnd().split("\n")
      .filter((row) => row.startsWith("DEBATEAI_DEPLOYMENT_MODE="));
    expect(rows).toEqual(["DEBATEAI_DEPLOYMENT_MODE=local"]);
  });

  it("declares DEBATEAI_DEPLOYMENT_MODE=local in the runner environment the development stack composes", async () => {
    const captured: Readonly<Record<string, string>>[] = [];
    let resolveExit!: (value: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>) => void;
    const exited: DevelopmentRunnerChild["exited"] = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const child: DevelopmentRunnerChild = {
      ready: Promise.resolve({
        kind: "DEBATEAI_RUNNER_READY",
        worker: "debateai-dev-runner",
        registerVersion: "424242"
      }),
      exited,
      async terminate() {
        resolveExit({ code: 0, signal: null });
      }
    };
    const operations: DevelopmentRunnerProcessOperations = {
      async loadApiEnvironment() {
        return Object.freeze({
          PROVIDER_DISCOVERY_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson,
          REGISTER_VERSION: "424242",
          REGISTER_DEPLOYMENT_RECEIPT_SHA256: "a".repeat(64),
          REGISTER_DEPLOYMENT_RECEIPT_FILE: "/workspace/.local/dev-auth/deployment-register-receipt.v1.json",
          KEK_PATH: "/private/dev/kek.bin",
          DATABASE_URL: "postgresql://runtime:opaque@127.0.0.1:55432/debateai",
          CONTENT_ENCRYPTION_ENABLED: "true",
          USER_DEK_STORE_PATH: "/private/dev/user-deks",
          HATCHET_CLIENT_TOKEN: "opaque-token",
          HATCHET_HOST_PORT: "127.0.0.1:7077",
          HATCHET_API_URL: "http://127.0.0.1:8888",
          HATCHET_TENANT_ID: "00000000-0000-4000-8000-000000000001",
          HATCHET_WORKFLOW_NAME: "debateai-dev",
          HATCHET_TLS_STRATEGY: "none"
        });
      },
      startRunner(values) {
        captured.push(values);
        return child;
      }
    };
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace",
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations
    });
    try {
      expect(captured).toHaveLength(1);
      expect(captured[0]!.DEBATEAI_DEPLOYMENT_MODE).toBe("local");
    } finally {
      await runner.stop();
    }
  });
});
