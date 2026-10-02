import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  THINKING_LEVEL_TOKEN,
  THINKING_PARAMETERS,
  parseProviderDiscoveryTargets,
  providerTargetGatewayControls
} from "@debateai/providers";

// Model scorecard §2.2 / §2.10 (rulings R7, R9): a target declares HOW it
// carries a thinking level, WHICH levels it can set, and its context window.
// Both-or-neither for the thinking pair, exactly as the price.

const CONFIGURED = [{ providerRef: "development:pi-cli", maker: "Z.AI" }];
const BASE_ROW = Object.freeze({
  provider_ref: "development:pi-cli",
  base_url: "http://127.0.0.1:8797/v1",
  model: "glm-5.3-flash",
  authorization_header: "Bearer relay-fixture-0123456789"
});
const parse = (extra: Readonly<Record<string, unknown>>) =>
  parseProviderDiscoveryTargets(JSON.stringify([{ ...BASE_ROW, ...extra }]), CONFIGURED);

describe("model scorecard — a provider target declares its thinking levels and its window", () => {
  it("reads a target that declares neither exactly as before, with no gateway controls", () => {
    const [target] = parse({});
    expect(target).toEqual({
      providerRef: "development:pi-cli",
      maker: "Z.AI",
      baseUrl: "http://127.0.0.1:8797/v1",
      model: "glm-5.3-flash",
      authorizationHeader: "Bearer relay-fixture-0123456789"
    });
    expect(providerTargetGatewayControls(target!)).toEqual({});
  });

  it("reads a thinking declaration and a window, and hands both to the gateway", () => {
    const [target] = parse({
      thinking_parameter: "x_thinking_level",
      thinking_levels: ["off", "low", "high"],
      context_window_tokens: 1_000_000
    });
    expect(target).toMatchObject({
      thinkingParameter: "x_thinking_level",
      thinkingLevels: ["off", "low", "high"],
      contextWindowTokens: 1_000_000
    });
    expect(providerTargetGatewayControls(target!)).toEqual({
      thinking: { parameter: "x_thinking_level", levels: ["off", "low", "high"] },
      contextWindowTokens: 1_000_000
    });
  });

  it("knows exactly two wire spellings and admits one lower-case token per level", () => {
    expect(THINKING_PARAMETERS).toEqual(["reasoning_effort", "x_thinking_level"]);
    for (const level of ["low", "xhigh", "none", "minimal", "max", "off"]) {
      expect(THINKING_LEVEL_TOKEN.test(level), level).toBe(true);
    }
    for (const level of ["", "High", "--effort", "low medium", "DEFAULT_ONLY", "a".repeat(33)]) {
      expect(THINKING_LEVEL_TOKEN.test(level), level).toBe(false);
    }
  });

  it.each([
    ["the parameter alone", { thinking_parameter: "reasoning_effort" }],
    ["the levels alone", { thinking_levels: ["low"] }],
    ["an unknown wire member", { thinking_parameter: "effort", thinking_levels: ["low"] }],
    ["no levels", { thinking_parameter: "reasoning_effort", thinking_levels: [] }],
    ["a duplicated level", { thinking_parameter: "reasoning_effort", thinking_levels: ["low", "low"] }],
    ["a flag-shaped level", { thinking_parameter: "x_thinking_level", thinking_levels: ["--dangerously-skip-permissions"] }],
    ["a level that is not a string", { thinking_parameter: "reasoning_effort", thinking_levels: [1] }],
    ["seventeen levels", {
      thinking_parameter: "reasoning_effort",
      thinking_levels: Array.from({ length: 17 }, (_, index) => `l${index}`)
    }]
  ])("refuses %s as PROVIDER_DISCOVERY_TARGET_THINKING_INVALID", (_name, extra) => {
    expect(() => parse(extra)).toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID"));
  });

  it.each([0, -1, 1.5, "16000", 2 ** 31, null])(
    "refuses a context window of %s as PROVIDER_DISCOVERY_TARGET_CONTEXT_WINDOW_INVALID",
    (value) => {
      expect(() => parse({ context_window_tokens: value }))
        .toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_CONTEXT_WINDOW_INVALID"));
    }
  );

  it("the runner's composition root hands every target's controls to its gateway", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const factory = main.slice(
      main.indexOf("return createPostgresProviderGateway(pool, {"),
      main.indexOf("const runRepository = new RunRepository(pool);")
    );
    expect(factory).toContain("...providerTargetGatewayControls(target),");
  });
});

/*
 * Final review m6 (an A7a carry that was never done): the operator kit's §11 is where a hosted
 * operator adds a vendor, so it names the three new target members and the two refusals the
 * parser can now raise for them, in plain words. The codes are read from the parser itself.
 */
describe("final review m6 · deploy/vps/README.md §11 documents the thinking and window members", () => {
  it("names thinking_parameter, thinking_levels and context_window_tokens, and the two refusals the parser raises", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"), readme.indexOf("## 12. "));
    expect(section.length).toBeGreaterThan(0);
    for (const member of ["`thinking_parameter`", "`thinking_levels`", "`context_window_tokens`"]) {
      expect(section, member).toContain(`| ${member} |`);
    }
    for (const parameter of THINKING_PARAMETERS) expect(section, parameter).toContain(`\`${parameter}\``);
    const refusals = [
      (() => { try { parse({ thinking_parameter: "reasoning_effort" }); } catch (error) { return (error as Error).message; } return null; })(),
      (() => { try { parse({ context_window_tokens: 0 }); } catch (error) { return (error as Error).message; } return null; })()
    ];
    expect(refusals).toEqual(["PROVIDER_DISCOVERY_TARGET_THINKING_INVALID", "PROVIDER_DISCOVERY_TARGET_CONTEXT_WINDOW_INVALID"]);
    for (const code of refusals) expect(section, String(code)).toContain(`| \`${String(code)}\` |`);
  });
});
