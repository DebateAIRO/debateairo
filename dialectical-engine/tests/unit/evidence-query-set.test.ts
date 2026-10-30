import { describe, expect, it } from "vitest";
import {
  freezeWebQuerySet,
  localSearchTarget,
  type PlannedWebPath,
  type PlannedWebSearch,
  type WebPlanContext
} from "../../packages/evidence/src/index.js";

// W1-2 (plan 2026-10-30) with the owner's Q10 answer (30 Oct): per path 2 English searches (for, against); when the
// planner decides local information helps, 2 more in the local language and country (for, against), so 4 in all. The
// country comes from the question's place when it names one, else from the question's language. Every search must
// come from the question (a path on the map) and each set needs its search against. Zero searches is a valid plan.

const english = (forText: string, againstText: string): PlannedWebSearch[] => [
  { scope: "ENGLISH", polarity: "SUPPORTING", text: forText },
  { scope: "ENGLISH", polarity: "DISCONFIRMING", text: againstText }
];
const local = (forText: string, againstText: string): PlannedWebSearch[] => [
  { scope: "LOCAL", polarity: "SUPPORTING", text: forText },
  { scope: "LOCAL", polarity: "DISCONFIRMING", text: againstText }
];
const webPath = (pathId: string, searches: PlannedWebSearch[], localHelps = false): PlannedWebPath => ({
  pathId, web: true, reason: "the answer turns on published pay figures", pace: "FAST", localHelps, searches
});
const noWebPath = (pathId: string): PlannedWebPath => ({
  pathId, web: false, reason: "the answer turns on the person's own values", pace: null, localHelps: false, searches: []
});
const context = (over: Partial<WebPlanContext> = {}): WebPlanContext => ({
  pathIds: ["P1", "P2"], asOf: new Date("2026-10-30T12:00:00Z"), questionLanguage: "ro", placeCountry: null, ...over
});

describe("the frozen web query set", () => {
  it("freezes 2 English searches for a path without local help", () => {
    const frozen = freezeWebQuerySet([
      webPath("P1", english("nurse net salary Germany 2026", "nurse pay Germany below cost of living")),
      noWebPath("P2")
    ], context());

    expect(frozen.searches.map((s) => [s.searchId, s.scope, s.polarity, s.language, s.country, s.status, s.text, s.afterDate])).toEqual([
      ["P1:ENGLISH:SUPPORTING", "ENGLISH", "SUPPORTING", "en", null, "SEND", "nurse net salary Germany", "2025-10-30"],
      ["P1:ENGLISH:DISCONFIRMING", "ENGLISH", "DISCONFIRMING", "en", null, "SEND", "nurse pay Germany below cost of living", "2025-10-30"]
    ]);
    expect(frozen.searches[0]!.removed).toEqual(["DATE"]);
    expect(frozen.paths).toEqual([
      { pathId: "P1", web: true, reason: "the answer turns on published pay figures", pace: "FAST", localHelps: false, localTarget: null },
      { pathId: "P2", web: false, reason: "the answer turns on the person's own values", pace: null, localHelps: false, localTarget: null }
    ]);
    expect(frozen.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(frozen.searches)).toBe(true);
    expect(Object.isFrozen(frozen.searches[0])).toBe(true);
  });

  it("freezes 4 searches when local help is planned: local for and against in the local language and country", () => {
    const frozen = freezeWebQuerySet([
      webPath("P1", [...english("nurse salary Romania", "nurse shortage Romania low pay"),
        ...local("salariu asistentă medicală România", "asistente pleacă din România salarii mici")], true),
      noWebPath("P2")
    ], context());

    expect(frozen.searches.map((s) => [s.searchId, s.language, s.country, s.status])).toEqual([
      ["P1:ENGLISH:SUPPORTING", "en", null, "SEND"],
      ["P1:ENGLISH:DISCONFIRMING", "en", null, "SEND"],
      ["P1:LOCAL:SUPPORTING", "ro", "RO", "SEND"],
      ["P1:LOCAL:DISCONFIRMING", "ro", "RO", "SEND"]
    ]);
    expect(frozen.paths[0]!.localTarget).toEqual({ language: "ro", country: "RO", countryFrom: "LANGUAGE" });
  });

  it("is valid with no searches at all (the planner may plan none)", () => {
    const frozen = freezeWebQuerySet([noWebPath("P1"), noWebPath("P2")], context());
    expect(frozen.searches).toEqual([]);
    expect(frozen.paths.map((p) => p.web)).toEqual([false, false]);
    expect(frozen.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic: the same plan always freezes to the same hash", () => {
    const plan = [webPath("P1", english("rent prices Cluj", "rent prices Cluj falling")), noWebPath("P2")];
    expect(freezeWebQuerySet(plan, context()).contentHash).toBe(freezeWebQuerySet(plan, context()).contentHash);
    expect(freezeWebQuerySet(plan, context()).contentHash)
      .not.toBe(freezeWebQuerySet([webPath("P1", english("rent prices Cluj", "rent prices Cluj rising")), noWebPath("P2")], context()).contentHash);
  });
});

describe("refusals", () => {
  it("refuses a search for a path that is not on the map (OFF_PLAN)", () => {
    expect(() => freezeWebQuerySet([webPath("P9", english("a b c", "d e f")), noWebPath("P1"), noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "OFF_PLAN_QUERY_REFUSED" }));
  });

  it.each([
    ["two English searches for", [{ scope: "ENGLISH", polarity: "SUPPORTING", text: "a b c" }, { scope: "ENGLISH", polarity: "SUPPORTING", text: "d e f" }], false],
    ["an English search for only", [{ scope: "ENGLISH", polarity: "SUPPORTING", text: "a b c" }], false],
    ["a local search for only", [...english("a b c", "d e f"), { scope: "LOCAL", polarity: "SUPPORTING", text: "g h i" }], true],
    ["for and against that are the same words once cleaned", english("nurse pay Germany 2026", "nurse pay Germany"), false]
  ] as const)("refuses %s (OPPOSITION_QUERY_REQUIRED)", (_name, searches, localHelps) => {
    expect(() => freezeWebQuerySet([webPath("P1", [...searches], localHelps), noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "OPPOSITION_QUERY_REQUIRED" }));
  });

  it("refuses a set with the search against but not the search for", () => {
    expect(() => freezeWebQuerySet([webPath("P1", [{ scope: "ENGLISH", polarity: "DISCONFIRMING", text: "a b c" }]), noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "SUPPORTING_QUERY_REQUIRED" }));
  });

  it.each([
    ["three English searches", webPath("P1", [...english("a b c", "d e f"), { scope: "ENGLISH", polarity: "SUPPORTING", text: "g h i" }])],
    ["local searches the planner did not ask for", webPath("P1", [...english("a b c", "d e f"), ...local("g h i", "j k l")], false)],
    ["local help asked for with no local searches", webPath("P1", english("a b c", "d e f"), true)],
    ["searches on a path that needs no web", { ...noWebPath("P1"), searches: english("a b c", "d e f") }],
    ["local help on a path that needs no web", { ...noWebPath("P1"), localHelps: true }]
  ] as const)("refuses %s", (_name, path) => {
    expect(() => freezeWebQuerySet([path, noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "WEB_PLAN_SEARCH_COUNT_INVALID" }));
  });

  it("refuses a plan that leaves out a path, repeats one, gives no reason or no pace", () => {
    expect(() => freezeWebQuerySet([noWebPath("P1")], context())).toThrowError(expect.objectContaining({ code: "WEB_PLAN_PATH_MISSING" }));
    expect(() => freezeWebQuerySet([noWebPath("P1"), noWebPath("P1"), noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "WEB_PLAN_PATH_REPEATED" }));
    expect(() => freezeWebQuerySet([{ ...noWebPath("P1"), reason: "  " }, noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "WEB_PLAN_REASON_REQUIRED" }));
    expect(() => freezeWebQuerySet([{ ...webPath("P1", english("a b c", "d e f")), pace: null }, noWebPath("P2")], context()))
      .toThrowError(expect.objectContaining({ code: "WEB_PACE_INVALID" }));
  });

  it("refuses a place country that is not a country code", () => {
    expect(() => freezeWebQuerySet([noWebPath("P1"), noWebPath("P2")], context({ placeCountry: "Romania" })))
      .toThrowError(expect.objectContaining({ code: "WEB_PLACE_COUNTRY_INVALID" }));
    expect(() => freezeWebQuerySet([noWebPath("P1"), noWebPath("P2")], context({ placeCountry: "EU" })))
      .toThrowError(expect.objectContaining({ code: "WEB_PLACE_COUNTRY_INVALID" }));
  });
});

describe("a search that must not leave holds its pair back", () => {
  it("holds a search with personal data, keeps no copy of its words, and holds its partner so the pair stays balanced", () => {
    const frozen = freezeWebQuerySet([
      webPath("P1", [...english("nurse salary Germany", "nurse pay Germany too low"),
        ...local("salariu asistentă scrieți la ion@example.ro", "asistente salarii mici")], true),
      noWebPath("P2")
    ], context());
    const byId = Object.fromEntries(frozen.searches.map((s) => [s.searchId, s]));
    expect(byId["P1:ENGLISH:SUPPORTING"]!.status).toBe("SEND");
    expect(byId["P1:ENGLISH:DISCONFIRMING"]!.status).toBe("SEND");
    expect(byId["P1:LOCAL:SUPPORTING"]).toMatchObject({ status: "HELD", heldBecause: ["PERSONAL_DATA"], personalData: ["EMAIL"], text: null });
    expect(byId["P1:LOCAL:DISCONFIRMING"]).toMatchObject({ status: "HELD", heldBecause: ["PAIR_PARTNER_HELD"], text: "asistente salarii mici" });
    expect(JSON.stringify(frozen)).not.toContain("ion@example.ro");
  });

  it("holds the design's first-person example", () => {
    const frozen = freezeWebQuerySet([webPath("P1", english("I'm a nurse from Cluj", "nurse pay Cluj")), noWebPath("P2")], context());
    expect(frozen.searches.map((s) => [s.status, s.heldBecause, s.text])).toEqual([
      ["HELD", ["FIRST_PERSON"], null],
      ["HELD", ["PAIR_PARTNER_HELD"], "nurse pay Cluj"]
    ]);
    expect(JSON.stringify(frozen)).not.toContain("I'm a nurse");
  });

  it("holds the local pair when no local language and country can be worked out, and keeps the English pair", () => {
    const frozen = freezeWebQuerySet([
      webPath("P1", [...english("a b c", "d e f"), ...local("g h i", "j k l")], true), noWebPath("P2")
    ], context({ questionLanguage: "en" }));
    expect(frozen.searches.map((s) => [s.searchId, s.status, s.heldBecause])).toEqual([
      ["P1:ENGLISH:SUPPORTING", "SEND", []],
      ["P1:ENGLISH:DISCONFIRMING", "SEND", []],
      ["P1:LOCAL:SUPPORTING", "HELD", ["NO_LOCAL_TARGET"]],
      ["P1:LOCAL:DISCONFIRMING", "HELD", ["NO_LOCAL_TARGET"]]
    ]);
    expect(frozen.paths[0]!.localTarget).toBeNull();
  });
});

describe("the local language and country", () => {
  it.each([
    ["a Romanian question with no place", "ro", null, { language: "ro", country: "RO", countryFrom: "LANGUAGE" }],
    ["a German question with no place", "de", null, { language: "de", country: "DE", countryFrom: "LANGUAGE" }],
    ["a Serbian question in Latin letters", "sr-Latn", null, null],
    ["an English question naming Romania", "en", "RO", { language: "ro", country: "RO", countryFrom: "PLACE" }],
    ["a Romanian question naming Germany", "ro", "DE", { language: "de", country: "DE", countryFrom: "PLACE" }],
    ["an English question naming the United States", "en", "US", { language: "en", country: "US", countryFrom: "PLACE" }],
    ["a Romanian question naming a country of several languages", "ro", "CH", { language: "ro", country: "CH", countryFrom: "PLACE" }],
    ["an English question with no place", "en", null, null],
    ["a Spanish question with no place (several home countries)", "es", null, null],
    ["a Portuguese question with no place (several home countries)", "pt", null, null]
  ] as const)("%s", (_name, questionLanguage, placeCountry, expected) => {
    expect(localSearchTarget({ questionLanguage, placeCountry })).toEqual(expected);
  });
});
