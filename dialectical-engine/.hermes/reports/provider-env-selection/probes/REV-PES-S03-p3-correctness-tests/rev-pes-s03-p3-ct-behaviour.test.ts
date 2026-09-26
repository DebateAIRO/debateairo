// REV-PES-S03-p3-correctness-tests — behavioural probe of README §11's price claims (R3.1, R3.2, R3.3 PRICE rows)
// against the SHIPPED parser and hosted rules. Written against 9f29022f3. Copied into <lane>/tests/unit/ for one run,
// then deleted (never committed). Imports are lane-relative, so it runs from any lane that holds this slice.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertDeploymentProviderTargets, assertPricedProviderTargets, parseProviderDiscoveryTargets
} from "../../packages/providers/src/index.js";

const configured = [{ providerRef: "vendor:acme", maker: "acme" }];
const boot = (json: string) => {
  const targets = parseProviderDiscoveryTargets(json, configured);
  assertDeploymentProviderTargets(targets, { mode: "hosted", nodeEnv: "production" });
  assertPricedProviderTargets(targets, "hosted");
  return targets;
};
const code = (fn: () => unknown) => { try { fn(); return "BOOTS"; } catch (e) { return String((e as Error).message); } };
const acme = (extra: Record<string, unknown>) => JSON.stringify([{
  provider_ref: "vendor:acme", base_url: "https://api.acme.example/v1", model: "acme-large",
  authorization_file: "/etc/debateai/runner/providers/acme.header", ...extra
}]);

describe("REV p3 ct — §11's price claims, run through the shipped code", () => {
  it("R3.2: both env forms pasted from §11 pass the hosted boot checks", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const forms = [...readme.matchAll(/`(\[?\{"provider_ref":"vendor:acme"[^`]*\}\]?)`/gu)].map((m) => m[1]!);
    console.log("FORMS", forms.length, forms.map((f) => f.includes("/api/") ? "api" : "runner"));
    expect(forms).toHaveLength(2);
    for (const form of forms) expect(code(() => boot(`[${form}]`)), form).toBe("BOOTS");
  });
  it("R3.1 member table + R3.3 PRICE rows: boundary values", () => {
    const table: Record<string, unknown> = {
      "1/1": { input_price_micros_per_million: 1, output_price_micros_per_million: 1 },
      "MAX_SAFE": { input_price_micros_per_million: Number.MAX_SAFE_INTEGER, output_price_micros_per_million: 1 },
      "MAX_SAFE+1 (2^53)": { input_price_micros_per_million: 2 ** 53, output_price_micros_per_million: 1 },
      "0/0": { input_price_micros_per_million: 0, output_price_micros_per_million: 0 },
      "0/5": { input_price_micros_per_million: 0, output_price_micros_per_million: 5 },
      "-1": { input_price_micros_per_million: -1, output_price_micros_per_million: 5 },
      "1.5": { input_price_micros_per_million: 1.5, output_price_micros_per_million: 5 },
      "string": { input_price_micros_per_million: "3000000", output_price_micros_per_million: 5 },
      "input only": { input_price_micros_per_million: 5 },
      "none": {}
    };
    const out = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, code(() => boot(acme(v as Record<string, unknown>)))]));
    console.log("OUTCOMES", JSON.stringify(out, null, 1));
    expect(out["1/1"]).toBe("BOOTS");
    expect(out["MAX_SAFE"]).toBe("BOOTS");
    expect(out["MAX_SAFE+1 (2^53)"]).toBe("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID");
    expect(out["0/0"]).toBe("PROVIDER_TARGET_PRICE_ZERO:vendor:acme");
    expect(out["input only"]).toBe("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID");
    expect(out["none"]).toBe("PROVIDER_TARGET_PRICE_REQUIRED:vendor:acme");
  });
});
