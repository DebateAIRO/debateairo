import { describe, expect, it } from "vitest";

/**
 * F-DEV-REGISTER-ROLE-REF-OVERRIDE.
 *
 * PROPERTY. The rejection for a role-ref override that names no configured
 * provider carries the CONSTANT `DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED`
 * as its whole message; the override VALUE — an environment string the operator
 * supplied, unbounded by construction — appears nowhere in the thrown error,
 * and the only thing the error says about it is WHICH role was overridden, as a
 * member of a frozen two-member vocabulary of this module.
 *
 * Why a namespace import. The bounded channel is a NEW export. With named
 * imports a missing export fails the module's link step and every row in this
 * file reports the same load error, so the RED capture names the module rather
 * than the property. Through the namespace the leak rows fail on their own
 * assertions and the channel row fails on its own missing member.
 */
import * as devRegister from "../../apps/runner/src/dev-deployment-register.js";

/**
 * A shape-legal synthetic: the throw is reached exactly when the override is
 * non-empty after trimming AND names no configured provider. Both halves are
 * asserted below before any leak assertion, so a row can never pass because the
 * synthetic quietly stopped reaching the throw (TOOLING-TRAPS, lane/diag-tail).
 * The token is the corpus's own invented secret (tests/unit/dev-auth-stack.test.ts:182),
 * never a credential value.
 */
const SYNTHETIC_OVERRIDE =
  "development:unconfigured-DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";

const PANEL = Object.freeze({
  configuredProviders: Object.freeze([
    Object.freeze({
      providerRef: "development:alpha",
      adapterKind: "openai-compatible-http",
      maker: "maker:alpha"
    }),
    Object.freeze({
      providerRef: "development:beta",
      adapterKind: "openai-compatible-http",
      maker: "maker:beta"
    })
  ]),
  requiredDistinctMakers: 2,
  healthyProviderRefs: Object.freeze(["development:alpha", "development:beta"]),
  targets: Object.freeze([]),
  targetsJson: "[]"
}) as unknown as Parameters<typeof devRegister.resolveDevelopmentSynthesisRoleRefs>[0];

function rejectionFor(source: Readonly<Record<string, string | undefined>>): unknown {
  try {
    devRegister.resolveDevelopmentSynthesisRoleRefs(PANEL, source);
  } catch (error) {
    return error;
  }
  throw new Error("expected resolveDevelopmentSynthesisRoleRefs to reject");
}

describe("F-DEV-REGISTER-ROLE-REF-OVERRIDE · the DEV_ code is a constant", () => {
  it("reaches the throw with the synthetic override (precondition, not an assertion about the fix)", () => {
    const configured = PANEL.configuredProviders.map((provider) => provider.providerRef);
    expect(configured).not.toContain(SYNTHETIC_OVERRIDE);
    expect(SYNTHETIC_OVERRIDE.trim()).not.toBe("");
    expect(rejectionFor({ DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: SYNTHETIC_OVERRIDE }))
      .toBeInstanceOf(TypeError);
  });

  it("never puts the synthesizer override value in the thrown message", () => {
    const error = rejectionFor({ DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: SYNTHETIC_OVERRIDE }) as TypeError;
    expect(error.message).toBe("DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED");
    expect(error.message).not.toContain(SYNTHETIC_OVERRIDE);
    expect(error.message).not.toContain("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER");
    expect(String(error)).not.toContain("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER");
  });

  it("never puts the evaluator override value in the thrown message", () => {
    const error = rejectionFor({ DEBATEAI_DEV_EVALUATOR_ROLE_REF: SYNTHETIC_OVERRIDE }) as TypeError;
    expect(error.message).toBe("DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED");
    expect(error.message).not.toContain(SYNTHETIC_OVERRIDE);
    expect(String(error)).not.toContain("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER");
  });

  it("reports WHICH role was overridden through a bounded two-member channel", () => {
    expect(devRegister.DEVELOPMENT_SYNTHESIS_ROLE_NAMES)
      .toEqual(["synthesizer", "evaluator"]);
    expect(Object.isFrozen(devRegister.DEVELOPMENT_SYNTHESIS_ROLE_NAMES)).toBe(true);
    expect(devRegister.developmentSynthesisRoleRefUnconfiguredRole(
      rejectionFor({ DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: SYNTHETIC_OVERRIDE })
    )).toBe("synthesizer");
    expect(devRegister.developmentSynthesisRoleRefUnconfiguredRole(
      rejectionFor({ DEBATEAI_DEV_EVALUATOR_ROLE_REF: SYNTHETIC_OVERRIDE })
    )).toBe("evaluator");
  });

  it("reads nothing off an error that is not this rejection", () => {
    expect(devRegister.developmentSynthesisRoleRefUnconfiguredRole(
      new TypeError("DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED")
    )).toBeNull();
    expect(devRegister.developmentSynthesisRoleRefUnconfiguredRole(
      new TypeError("DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED", {
        cause: SYNTHETIC_OVERRIDE
      })
    )).toBeNull();
    expect(devRegister.developmentSynthesisRoleRefUnconfiguredRole(SYNTHETIC_OVERRIDE)).toBeNull();
  });

  it("still falls back, and still accepts a configured override (control)", () => {
    expect(devRegister.resolveDevelopmentSynthesisRoleRefs(PANEL, {})).toEqual({
      synthesizerRoleRef: "development:alpha",
      evaluatorRoleRef: "development:beta"
    });
    expect(devRegister.resolveDevelopmentSynthesisRoleRefs(PANEL, {
      DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: "   ",
      DEBATEAI_DEV_EVALUATOR_ROLE_REF: undefined
    })).toEqual({
      synthesizerRoleRef: "development:alpha",
      evaluatorRoleRef: "development:beta"
    });
    expect(devRegister.resolveDevelopmentSynthesisRoleRefs(PANEL, {
      DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: "development:beta",
      DEBATEAI_DEV_EVALUATOR_ROLE_REF: "development:beta"
    })).toEqual({
      synthesizerRoleRef: "development:beta",
      evaluatorRoleRef: "development:beta"
    });
  });
});
