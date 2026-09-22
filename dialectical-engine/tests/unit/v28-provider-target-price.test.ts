import { describe, expect, it } from "vitest";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  parseProviderDiscoveryTargets,
  providerTargetPrice
} from "@debateai/providers";

/**
 * V-28 — EACH PROVIDER TARGET CARRIES ITS PRICE.
 *
 * The ruling's words: "the gateway sums vendor-reported usage x the price
 * configured with each vendor target". So the price is configuration, beside the
 * base URL and the model, in the same declaration an operator edits when they
 * add a vendor — not a table in code that has to be kept in step with the target
 * list by hand.
 *
 * Integers, in USD micro-units per MILLION tokens, which is the unit every
 * vendor publishes its price in. A float here would put a float in the money
 * path, and there is exactly one rule about that.
 */
const CONFIGURED = Object.freeze([
  { providerRef: "provider-1", maker: "maker-1" }
]);

function targetsJson(extra: Readonly<Record<string, unknown>> = {}) {
  return JSON.stringify([{
    provider_ref: "provider-1",
    base_url: "https://api.vendor.example/v1",
    model: "vendor/model",
    authorization_file: "/etc/debateai/keys/vendor-1",
    ...extra
  }]);
}

describe("V-28 a provider target declares its price", () => {
  it("parses an integer price for each priced side", () => {
    const [target] = parseProviderDiscoveryTargets(targetsJson({
      input_price_micros_per_million: 3_000_000,
      output_price_micros_per_million: 15_000_000
    }), CONFIGURED);

    expect(providerTargetPrice(target!)).toEqual({
      inputMicrosPerMillionTokens: 3_000_000,
      outputMicrosPerMillionTokens: 15_000_000
    });
  });

  it("reports NO price for a target that declares none", () => {
    const [target] = parseProviderDiscoveryTargets(targetsJson(), CONFIGURED);
    expect(providerTargetPrice(target!)).toBeNull();
  });

  it("refuses a float, a negative or a non-numeric price", () => {
    for (const broken of [
      { input_price_micros_per_million: 1.5, output_price_micros_per_million: 1 },
      { input_price_micros_per_million: -1, output_price_micros_per_million: 1 },
      { input_price_micros_per_million: "3000000", output_price_micros_per_million: 1 }
    ]) {
      expect(() => parseProviderDiscoveryTargets(targetsJson(broken), CONFIGURED))
        .toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"));
    }
  });

  it("refuses HALF a price — both sides are priced, so one alone cannot bill a call", () => {
    expect(() => parseProviderDiscoveryTargets(
      targetsJson({ input_price_micros_per_million: 3_000_000 }), CONFIGURED
    )).toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"));
  });
});

/**
 * The price rule is its OWN assertion and not part of the URL-and-credential one
 * (`assertHostedProviderTargets`). The support chat's model target goes through
 * that one too (V-30), but keeps its own spend accounting on `support.message`,
 * which task 12 owns — so a price declared on it would be read by nothing, and a
 * requirement nobody consumes is configuration theatre. The rule lives with the
 * control that consumes it, and both shipped roots call it on the DEBATE targets.
 */
describe("V-28 hosted refuses a DEBATE target whose spend cannot be bounded", () => {
  it("refuses a hosted target that declares no price", () => {
    const targets = parseProviderDiscoveryTargets(targetsJson(), CONFIGURED);
    expect(() => assertPricedProviderTargets(targets, "hosted"))
      .toThrowError(new TypeError("PROVIDER_TARGET_PRICE_REQUIRED:provider-1"));
  });

  it("admits a hosted target that declares one", () => {
    const targets = parseProviderDiscoveryTargets(targetsJson({
      input_price_micros_per_million: 3_000_000,
      output_price_micros_per_million: 15_000_000
    }), CONFIGURED);
    expect(() => assertPricedProviderTargets(targets, "hosted")).not.toThrow();
    expect(() => assertDeploymentProviderTargets(targets, {
      mode: "hosted", nodeEnv: "production"
    })).not.toThrow();
  });

  it("LEAVES LOCAL MODE ALONE — a relay or a local model server costs no money", () => {
    const targets = parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: "provider-1",
      base_url: "http://127.0.0.1:8000/v1",
      model: "local/model"
    }]), CONFIGURED);
    expect(() => assertPricedProviderTargets(targets, "local")).not.toThrow();
    expect(() => assertDeploymentProviderTargets(targets, {
      mode: "local", nodeEnv: "production"
    })).not.toThrow();
  });

  it("leaves the URL-and-credential rule alone, so the support target is unaffected", () => {
    // A priceless https: target with a credential FILE still passes the shared
    // mode decision — which is what `parseSupportModelTargetJson` calls.
    const targets = parseProviderDiscoveryTargets(targetsJson(), CONFIGURED);
    expect(() => assertDeploymentProviderTargets(targets, {
      mode: "hosted", nodeEnv: "production"
    })).not.toThrow();
  });
});
