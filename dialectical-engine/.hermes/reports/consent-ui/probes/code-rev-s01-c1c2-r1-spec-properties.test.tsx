// @vitest-environment jsdom
// REVIEWER PROBE — CODE-REV-S01-C1C2, round 1.
// Built from SPEC S01-R01/R03/R04/R28 only; NOT derived from the author's test.
// TO RUN: copy to <lane>/tests/render/zz-rev-probe.test.tsx (vitest.config's
// `include` is tests/**, so a probe outside tests/ yields "No test files found"),
// then `pnpm exec vitest run tests/render/zz-rev-probe.test.tsx`, then delete it.
//
// MEASURED AT 87b50e1e:  Tests 3 failed | 4 passed (7)
//   P1 FAILS  - a 6-member stored record is returned as a valid decision
//   P2 FAILS  - decidedAt "yesterday" / "" / "1788723500905" / "2026-13-45T99:99:99Z" accepted
//   P3 PASSES - the ruled case (essential:false) is correctly rejected
//   P4 FAILS  - decisionFor("save-choices") with toggles omitted returns a silent denial
//   P5/P6/P7 PASS
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSENT_KEY, COOKIE_CATEGORIES, decisionFor, readConsent, writeConsent
} from "../../apps/ui/lib/consent.js";

const FIVE = ["analytics", "decidedAt", "essential", "quality", "v"];
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("REV probes — R01 'exactly these five members and no others'", () => {
  it("P1: a SIXTH member in a stored record", () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      v: 1, essential: true, quality: true, analytics: false,
      decidedAt: "2026-01-01T00:00:00.000Z", rogue: "injected"
    }));
    const got = readConsent();
    console.log("P1 readConsent() ->", JSON.stringify(got));
    expect(got === null || Object.keys(got).sort().join() === FIVE.join(),
      "a 6-member record is either no decision, or is projected to the five").toBe(true);
  });

  it("P2: decidedAt present as a string but NOT an ISO-8601 UTC instant", () => {
    for (const stamp of ["yesterday", "", "1788723500905", "2026-13-45T99:99:99Z"]) {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        v: 1, essential: true, quality: true, analytics: false, decidedAt: stamp
      }));
      const got = readConsent();
      console.log(`P2 decidedAt=${JSON.stringify(stamp)} -> ${JSON.stringify(got)}`);
      expect(got, `decidedAt ${JSON.stringify(stamp)} is not the ISO-8601 UTC string R01 declares`).toBeNull();
    }
  });

  it("P3 (control): the ruled case — all five members but essential:false", () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      v: 1, essential: false, quality: true, analytics: false, decidedAt: "2026-01-01T00:00:00.000Z"
    }));
    expect(readConsent(), "ORCHESTRATOR RULING: contradicts R01's declared type -> no decision").toBeNull();
  });

  it("P4: `Save choices` invoked with no toggles silently writes false/false", () => {
    const d = decisionFor("save-choices");
    console.log("P4 decisionFor('save-choices') with no toggles ->", JSON.stringify(d));
    expect({ q: d.quality, a: d.analytics },
      "an omitted toggles argument must not silently produce a denial").not.toEqual({ q: false, a: false });
  });

  it("P5: round-trip of every R04 row keeps exactly five members", () => {
    for (const c of ["accept-all", "essential-only"] as const) {
      writeConsent(decisionFor(c));
      expect(Object.keys(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).sort()).toEqual(FIVE);
    }
    writeConsent(decisionFor("save-choices", { quality: true, analytics: false }));
    expect(Object.keys(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).sort()).toEqual(FIVE);
  });

  it("P6: the twelve strings deep-equal the DESIGN, decoded (not the author's fixture)", () => {
    const design = readFileSync(
      "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/design-data.js", "utf8");
    const body = design.replace(/^NOT FOUND:.*$/gm, "").replace(/^\/\/.*$/gm, "");
    const cats = new Function("dark", body + "\n; return cookieCats;")(false);
    expect(COOKIE_CATEGORIES.map((c) => [c.name, c.tag, c.description, c.detail]))
      .toEqual(cats.map((c: any) => [c.name, c.tag, c.desc, c.detail]));
  });

  it("P7: locked/defaultOn match mkCat's own (on, locked) arguments", () => {
    expect(COOKIE_CATEGORIES.map((c) => [c.locked, c.defaultOn]))
      .toEqual([[true, true], [false, true], [false, false]]);
  });
});
