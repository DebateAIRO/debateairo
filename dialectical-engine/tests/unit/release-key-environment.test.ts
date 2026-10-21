import { describe, expect, it } from "vitest";
import {
  API_ENVIRONMENT_KEYS,
  RUNNER_ENVIRONMENT_KEYS,
  assertReleaseKeyForRegister,
  checkedReleaseKey,
  parseApiEnvironment,
  parseRunnerEnvironment
} from "../../packages/register/src/runtime-environment.js";
import {
  validApiEnvironmentFixture,
  validRunnerEnvironmentFixture
} from "../support/apiEnvironmentFixture.js";

/**
 * Side-by-side uploads spec 2026-10-21 §1 (INTERFACE "RELEASE_KEY"): the API and the runner each boot with the key of
 * the release they are, `r<REGISTER_VERSION>-<first 12 hex of the source revision>`. Absent refuses
 * RELEASE_KEY_REQUIRED, malformed (or `legacy`, or a development key on the hosted site) RELEASE_KEY_INVALID, and a
 * number that is not this process's REGISTER_VERSION RELEASE_KEY_REGISTER_MISMATCH. One check, shared by both shapes.
 */
// The code part is built apart from the key name, so no line pairs a *_KEY name with a literal (gitleaks).
const CODE = "0123456789ab";
const DEVELOPMENT = "000000000000";

/** The `code` of what `fn` throws; undefined when it returns. */
function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
}

describe("RELEASE_KEY in the API and runner environments (side-by-side §1)", () => {
  it("the runner refuses an absent or empty key as RELEASE_KEY_REQUIRED", () => {
    const { RELEASE_KEY: _dropped, ...withoutKey } = validRunnerEnvironmentFixture();
    expect(codeOf(() => parseRunnerEnvironment(withoutKey))).toBe("RELEASE_KEY_REQUIRED");
    expect(codeOf(() => parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), RELEASE_KEY: "" })))
      .toBe("RELEASE_KEY_REQUIRED");
  });

  it("the runner refuses an upper-case key and legacy as RELEASE_KEY_INVALID", () => {
    expect(codeOf(() => parseRunnerEnvironment({
      ...validRunnerEnvironmentFixture(), RELEASE_KEY: `r1-${CODE.toUpperCase()}`
    }))).toBe("RELEASE_KEY_INVALID");
    expect(codeOf(() => parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), RELEASE_KEY: "legacy" })))
      .toBe("RELEASE_KEY_INVALID");
  });

  it("the runner refuses a key whose number is not its REGISTER_VERSION", () => {
    expect(codeOf(() => parseRunnerEnvironment({
      ...validRunnerEnvironmentFixture(), REGISTER_VERSION: "1", RELEASE_KEY: `r2-${CODE}`
    }))).toBe("RELEASE_KEY_REGISTER_MISMATCH");
  });

  it("a development key is refused on the hosted site and accepted locally", () => {
    expect(codeOf(() => parseRunnerEnvironment({
      ...validRunnerEnvironmentFixture(), DEBATEAI_DEPLOYMENT_MODE: "hosted", RELEASE_KEY: `r1-${DEVELOPMENT}`
    }))).toBe("RELEASE_KEY_INVALID");
    const local = parseRunnerEnvironment({
      ...validRunnerEnvironmentFixture(), DEBATEAI_DEPLOYMENT_MODE: "local", RELEASE_KEY: `r1-${DEVELOPMENT}`
    });
    expect(local.RELEASE_KEY).toBe(`r1-${DEVELOPMENT}`);
  });

  it("the plain runner fixture parses with its key", () => {
    expect(parseRunnerEnvironment(validRunnerEnvironmentFixture()).RELEASE_KEY).toBe(`r1-${CODE}`);
  });

  it("the API applies the same check", () => {
    const { RELEASE_KEY: _dropped, ...withoutKey } = validApiEnvironmentFixture();
    expect(codeOf(() => parseApiEnvironment(withoutKey))).toBe("RELEASE_KEY_REQUIRED");
    expect(codeOf(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), RELEASE_KEY: `r2-${CODE}` })))
      .toBe("RELEASE_KEY_REGISTER_MISMATCH");
    expect(parseApiEnvironment(validApiEnvironmentFixture()).RELEASE_KEY).toBe(`r1-${CODE}`);
  });

  it("both shapes list RELEASE_KEY as required", () => {
    expect(RUNNER_ENVIRONMENT_KEYS.required).toContain("RELEASE_KEY");
    expect(API_ENVIRONMENT_KEYS.required).toContain("RELEASE_KEY");
  });

  it("the shared check: parse, then the hosted development rule, then the version (plan C reuses it)", () => {
    expect(assertReleaseKeyForRegister(`r17-${CODE}`, 17, "hosted")).toBe(`r17-${CODE}`);
    expect(assertReleaseKeyForRegister(`r17-${DEVELOPMENT}`, 17, "local")).toBe(`r17-${DEVELOPMENT}`);
    expect(codeOf(() => assertReleaseKeyForRegister(`r17-${CODE}`, 18, "local"))).toBe("RELEASE_KEY_REGISTER_MISMATCH");
    expect(codeOf(() => assertReleaseKeyForRegister(`r17-${DEVELOPMENT}`, 18, "hosted"))).toBe("RELEASE_KEY_INVALID");
    expect(codeOf(() => assertReleaseKeyForRegister("legacy", 17, "local"))).toBe("RELEASE_KEY_INVALID");
    expect(codeOf(() => checkedReleaseKey(undefined, 17, "local"))).toBe("RELEASE_KEY_REQUIRED");
    expect(codeOf(() => checkedReleaseKey("", 17, "local"))).toBe("RELEASE_KEY_REQUIRED");
    expect(checkedReleaseKey(`r17-${CODE}`, 17, "hosted")).toBe(`r17-${CODE}`);
  });
});
