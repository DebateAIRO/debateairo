import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";

/**
 * Security audit run 3, NV-47: on the 13 always-check sites (en and ro among them) every signed-in ask is a paid fast
 * language check, a site cost outside any person's allowance. Each owner's paid checks are counted by the
 * `languageChecks` admission scope, asked by the decider right before each check. No sealed row carries
 * `language_checks`; the parser applies its default, so every version gets the bound. Owner-keyed and fail-closed
 * (never evicting: eviction would reset a heavy owner's count, which is the bound itself).
 * "red:" fails on the source before NV-47; "guard:" passes before and after.
 */
const DEFAULT_LANGUAGE_CHECKS = { key: "owner", limit: 120, windowMs: 86_400_000, capacity: 196_608 };
const DAY_MS = 24 * 60 * 60_000;
const T0 = new Date("2026-10-28T00:00:00.000Z");

function refusalCode(value: unknown): unknown {
  try {
    admissionPolicyFromValue(value, "nv47");
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return "NOT_REFUSED";
}

function withLanguageChecks(languageChecks: unknown) {
  return { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, language_checks: languageChecks };
}

function countOf(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

/** The trimmed lines of the call that opens at `opener`, up to its balanced closing parenthesis. A missing opener fails. */
function balancedCallLines(source: string, opener: string): string[] {
  const open = source.indexOf(opener);
  expect(open, opener).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = source.indexOf("(", open); index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1).split("\n").map((line) => line.trim());
  }
  throw new Error(`unbalanced call: ${opener}`);
}

describe("NV-47 languageChecks admission scope", () => {
  // red: the scope does not exist before NV-47. The capacity pin is review round 1's B2 decision (8,192 x 24).
  it("the sealed row and the deployment row both resolve to the parser's default", () => {
    for (const row of [ADMISSION_POLICY_REGISTER_ROW, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW]) {
      const policy = admissionPolicyFromValue(row.value, row.sourceRef);
      expect(policy.languageChecks).toEqual(DEFAULT_LANGUAGE_CHECKS);
      expect(Object.isFrozen(policy.languageChecks)).toBe(true);
    }
  });

  // red: a version may seal its own value, and the parser honours it.
  it("a version that carries language_checks gets exactly that value", () => {
    const policy = admissionPolicyFromValue(
      withLanguageChecks({ key: "owner", limit: 5, window_ms: 60_000, capacity: 16 }), "nv47"
    );
    expect(policy.languageChecks).toEqual({ key: "owner", limit: 5, windowMs: 60_000, capacity: 16 });
  });

  // guard: the strict schema already refuses every one of these before NV-47 (it refuses the member itself).
  it("a source key, a zero limit, a window past 24 h and an unknown inner member are refused", () => {
    const valid = { key: "owner", limit: 5, window_ms: 60_000, capacity: 16 };
    for (const languageChecks of [
      { ...valid, key: "source" },
      { ...valid, limit: 0 },
      { ...valid, window_ms: 86_400_001 },
      { ...valid, burst: 2 }
    ]) {
      expect(refusalCode(withLanguageChecks(languageChecks)), JSON.stringify(languageChecks))
        .toBe("ADMISSION_POLICY_INVALID");
    }
  });

  // guard: the sealed constants are not edited; the default lives in the parser.
  it("no sealed row carries a language_checks member", () => {
    expect("language_checks" in ADMISSION_POLICY_REGISTER_ROW.value).toBe(false);
    expect("language_checks" in ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value).toBe(false);
  });

  // red: always configured, the 121st check of one owner in the window is refused LIMIT, and the window ends.
  it("the default limiter admits 120 checks per owner per fixed 24 h window, and the next window admits again", () => {
    const sealed = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    const limiter = new AdmissionLimiter(sealed);
    expect(limiter.configured("languageChecks")).toBe(true);
    for (let check = 1; check <= 120; check += 1) {
      expect(limiter.decide("languageChecks", "owner:heavy", T0), String(check)).toEqual({ allowed: true });
    }
    expect(limiter.decide("languageChecks", "owner:heavy", T0)).toEqual({
      allowed: false, reason: "LIMIT", retryAfterMs: DAY_MS, windowMs: DAY_MS
    });
    // Another owner keeps a count of its own.
    expect(limiter.decide("languageChecks", "owner:other", T0)).toEqual({ allowed: true });
    // Still refused just before the window ends; admitted again once it has.
    expect(limiter.decide("languageChecks", "owner:heavy", new Date(T0.getTime() + DAY_MS - 1)))
      .toMatchObject({ allowed: false, reason: "LIMIT", retryAfterMs: 1 });
    expect(limiter.decide("languageChecks", "owner:heavy", new Date(T0.getTime() + DAY_MS))).toEqual({ allowed: true });
  });

  // red: a full table refuses a new owner with CAPACITY instead of evicting a counted one (fail-closed).
  it("a full table refuses a new owner with CAPACITY, and keeps the counted owners", () => {
    const limiter = new AdmissionLimiter(admissionPolicyFromValue(
      withLanguageChecks({ key: "owner", limit: 2, window_ms: DAY_MS, capacity: 2 }), "nv47"
    ));
    expect(limiter.decide("languageChecks", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("languageChecks", "owner:b", T0)).toEqual({ allowed: true });
    expect(limiter.decide("languageChecks", "owner:c", T0)).toEqual({
      allowed: false, reason: "CAPACITY", retryAfterMs: DAY_MS, windowMs: DAY_MS
    });
    expect(limiter.size("languageChecks")).toBe(2);
    expect(limiter.decide("languageChecks", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("languageChecks", "owner:a", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
  });

  // red: main.ts builds ONE limiter for the routes and the owner budget, and hands the site's route both new members.
  it("apps/api/src/main.ts: one limiter, shared by buildApi and the question-language owner budget", async () => {
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(countOf(main, "new AdmissionLimiter(")).toBe(1);
    expect(countOf(main, "const admissionLimiter = new AdmissionLimiter(admissionPolicy);")).toBe(1);
    expect(main.indexOf("const admissionLimiter = new AdmissionLimiter(admissionPolicy);"))
      .toBeGreaterThan(main.indexOf('boot.run("admission-policy", () => readAdmissionPolicy(pool, environment.REGISTER_VERSION))'));
    expect(countOf(main, "admission: admissionLimiter,")).toBe(1);
    expect(main.indexOf("admission: admissionLimiter,")).toBeGreaterThan(main.indexOf("const api = buildApi({"));
    expect(countOf(main, "admission: new AdmissionLimiter(")).toBe(0);
    const siteRoute = balancedCallLines(main, "questionLanguageSiteRoute({");
    expect(siteRoute).toContain('ownerBudget: (ownerScope) => admissionLimiter.decide("languageChecks", ownerScope, new Date()),');
    expect(siteRoute).toContain("siteHeldMicros: (day) => new PostgresModelSpendStore(pool).readSiteCountedHoldsMicros(day),");
  });

  // red: check-version never sends, so its owner budget refuses.
  it("apps/api/src/settings-check.ts: check-version's route carries a budget that refuses and no holds", async () => {
    const check = await readFile(new URL("../../apps/api/src/settings-check.ts", import.meta.url), "utf8");
    const siteRoute = balancedCallLines(check, "questionLanguageSiteRoute({");
    expect(siteRoute).toContain('ownerBudget: () => ({ allowed: false, reason: "LIMIT" }),');
    expect(siteRoute).toContain("siteHeldMicros: async () => 0,");
  });

  // red: the practice's lock mapping is the decider's, arm for arm.
  it("tools/preview-practice/practice-language.ts mirrors the decider's owner-budget skip suffix", async () => {
    const practice = await readFile(new URL("../../tools/preview-practice/practice-language.ts", import.meta.url), "utf8");
    expect(practice).toContain('fast.reason === "SKIPPED_OWNER_BUDGET" ? "FAST_CHECK_SKIPPED_OWNER_BUDGET"');
    const decider = await readFile(new URL("../../apps/api/src/question-language/decider.ts", import.meta.url), "utf8");
    expect(decider).toContain('fast.reason === "SKIPPED_OWNER_BUDGET" ? "FAST_CHECK_SKIPPED_OWNER_BUDGET"');
  });
});
