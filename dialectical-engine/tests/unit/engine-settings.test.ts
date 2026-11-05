import { describe, expect, it } from "vitest";
import {
  ENGINE_ONE, engineOfRun, engineReceipt, engineReceiptSchema, engineSettingsOf, engineSettingsOfReceipt,
  engineVersionPolicyStartValues, investigationSitesOf, parseEngineVersionPolicy, pathRunInvestigations, withPathDebateInvestigations,
  type EngineSettings
} from "@debateai/register";

const START = engineVersionPolicyStartValues();
const SETTINGS = engineSettingsOf(START, { makers: 4, mapOpening: true });
const refusedAs = (code: string) => expect.objectContaining({ code });
/** A plain, writable copy of SETTINGS with one change: a malformed input the receipt must refuse. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function settingsWith(mutate: (value: any) => void): EngineSettings {
  const value = JSON.parse(JSON.stringify(SETTINGS));
  mutate(value);
  return value as EngineSettings;
}

describe("engine settings: the row's values plus this debate's sites (INTERFACE §3.1)", () => {
  it("copies the row's values, adds the sites, and drops the row's kind, version and switch", () => {
    expect(Object.keys(SETTINGS)).toEqual(["engine", "scoring", "links", "investigate", "judges", "label", "answerCheck", "sites"]);
    expect(SETTINGS.engine).toBe(2);
    expect(SETTINGS.scoring).toEqual(START.scoring);
    expect(SETTINGS.links).toEqual(START.links);
    expect(SETTINGS.investigate).toEqual(START.investigate);
    expect(SETTINGS.judges).toEqual(START.judges);
    expect(SETTINGS.label).toEqual(START.label);
    expect(SETTINGS.answerCheck).toEqual(START.answerCheck);
    expect(SETTINGS.sites).toEqual({ comparingJudges: 3, investigations: 2, answerCheck: 1 });
    for (const dropped of ["kind", "version", "enabled"]) expect(Object.hasOwn(SETTINGS, dropped)).toBe(false);
    for (const frozen of [SETTINGS, SETTINGS.sites, SETTINGS.scoring.terms, SETTINGS.scoring.terms[0], SETTINGS.label]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
  });

  it.each([[1, 1], [2, 2], [3, 3], [7, 3]])("%i makers seat %i comparing judges (the judges are capped by the makers)", (makers, judges) => {
    expect(engineSettingsOf(START, { makers, mapOpening: false }).sites.comparingJudges).toBe(judges);
  });

  it("counts the answer check only when the map opens the debate, and the investigations at the row's cap", () => {
    expect(engineSettingsOf(START, { makers: 3, mapOpening: false }).sites).toEqual({ comparingJudges: 3, investigations: 2, answerCheck: 0 });
    expect(engineSettingsOf(START, { makers: 3, mapOpening: true }).sites.answerCheck).toBe(1);
  });

  it("refuses a maker count that is not a whole number of at least one", () => {
    for (const makers of [0, -1, 1.5, Number.NaN]) {
      expect(() => engineSettingsOf(START, { makers, mapOpening: true }), String(makers))
        .toThrowError(refusedAs("STRUCTURAL_CEILING_ENGINE_INVALID"));
    }
  });
});

describe("the receipt member engine (INTERFACE §3.1)", () => {
  it("is snake_case in a fixed order, parses with its own strict schema, and reads back to the same settings", () => {
    const receipt = engineReceipt(SETTINGS, 3);
    expect(Object.keys(receipt)).toEqual(["version", "engine", "scoring", "links", "investigate", "judges", "label",
      "answer_check", "sites"]);
    expect(Object.keys(receipt.scoring)).toEqual(["terms", "clarity_decay_per_ambiguity", "fatal_cap", "fidelity_floor",
      "combine", "disputed_weight"]);
    expect(receipt.scoring.fatal_cap).toEqual({ min_flag_severity: 0.5, to: 0.3 });
    expect(receipt.scoring.fidelity_floor).toEqual({ below: 0.5, to: 0.5 });
    expect(receipt.links).toEqual({ cannot_assess_weight: 0.66, own_reply_counts_as_support: false, rival_replies: "EQUAL" });
    expect(receipt.investigate).toEqual({ max_per_debate: 2 });
    expect(receipt.judges).toEqual({ count: 3, maker_rule: "PREFER_NON_ARGUING_ELSE_IGNORE_OWN" });
    expect(receipt.label).toEqual({ clear_agreeing: 3, close_call_agreeing: 2 });
    expect(receipt.answer_check).toEqual({ candidates: 3 });
    // (3 comparing judges + 2 investigations + 1 answer check) x 3 attempts per site.
    expect(receipt.sites).toEqual({ comparing_judges: 3, investigations: 2, answer_check: 1, added_model_attempts: 18 });
    expect(engineReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(engineSettingsOfReceipt(receipt)).toEqual(SETTINGS);
    expect(Object.isFrozen(receipt.sites)).toBe(true);
    expect(Object.isFrozen(engineSettingsOfReceipt(receipt).scoring.terms)).toBe(true);
  });

  it("prices the added calls per site at the attempts it is given", () => {
    const oneMaker = engineSettingsOf(START, { makers: 1, mapOpening: false });
    expect(engineReceipt(oneMaker, 6).sites).toEqual({ comparing_judges: 1, investigations: 2, answer_check: 0, added_model_attempts: 18 });
    expect(engineSettingsOfReceipt(engineReceipt(oneMaker, 6))).toEqual(oneMaker);
  });

  it.each([
    ["comparing judges above the row's judges", (v: any) => { v.sites.comparingJudges = 4; }],
    ["no comparing judge", (v: any) => { v.sites.comparingJudges = 0; }],
    ["investigations that are not the row's cap", (v: any) => { v.sites.investigations = 1; }],
    ["an answer check of 2", (v: any) => { v.sites.answerCheck = 2; }],
    ["weights that do not sum to one", (v: any) => { v.scoring.terms[0].coefficient = 0.5; }],
    ["a measure twice and one missing", (v: any) => { v.scoring.terms[6].metric = "clarity"; }],
    ["engine 1", (v: any) => { v.engine = 1; }],
    ["a close call above a clear answer", (v: any) => { v.label.closeCallAgreeing = 4; }]
  ])("refuses to mint a member with %s", (_name, mutate) => {
    expect(() => engineReceipt(settingsWith(mutate), 3)).toThrowError(refusedAs("STRUCTURAL_CEILING_ENGINE_INVALID"));
  });

  it("refuses a per-site allowance that is not a whole number of at least one", () => {
    for (const attempts of [0, 2.5, Number.NaN]) {
      expect(() => engineReceipt(SETTINGS, attempts), String(attempts)).toThrowError(refusedAs("STRUCTURAL_CEILING_ENGINE_INVALID"));
    }
  });

  it("the schema is strict at every level", () => {
    const receipt = JSON.parse(JSON.stringify(engineReceipt(SETTINGS, 3)));
    const withExtra = (at: (value: any) => any) => {
      const copy = JSON.parse(JSON.stringify(receipt));
      at(copy).extra = 1;
      return copy;
    };
    // The control: the same copy without the extra member parses.
    expect(engineReceiptSchema.safeParse(JSON.parse(JSON.stringify(receipt))).success).toBe(true);
    // Task 2 review 1 (final wave B1): also scoring.fidelity_floor, investigate, judges and label.
    for (const bad of [withExtra((v) => v), withExtra((v) => v.scoring), withExtra((v) => v.scoring.terms[0]),
      withExtra((v) => v.scoring.fatal_cap), withExtra((v) => v.scoring.fidelity_floor), withExtra((v) => v.links),
      withExtra((v) => v.investigate), withExtra((v) => v.judges), withExtra((v) => v.label), withExtra((v) => v.sites),
      withExtra((v) => v.answer_check)]) {
      expect(engineReceiptSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("engineOfRun: the one reader (INTERFACE §3.3)", () => {
  it("reads engine 1 from a basis without the member, and the settings from one with it", () => {
    expect(engineOfRun({})).toBe(ENGINE_ONE);
    expect(ENGINE_ONE).toEqual({ engine: 1 });
    expect(Object.isFrozen(ENGINE_ONE)).toBe(true);
    expect(engineOfRun({ engine: SETTINGS })).toBe(SETTINGS);
  });
});

describe("the row's accepted boundaries mint a receipt (carried from Task 1's review)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it.each<[string, (v: any) => void]>([
    ["no investigation", (v) => { v.investigate.maxPerDebate = 0; }],
    ["five investigations", (v) => { v.investigate.maxPerDebate = 5; }],
    ["no reserve answer", (v) => { v.answerCheck.candidates = 0; }],
    ["four reserve answers", (v) => { v.answerCheck.candidates = 4; }],
    ["one comparing judge (the label set to fit)", (v) => { v.judges.count = 1; v.label = { clearAgreeing: 1, closeCallAgreeing: 1 }; }],
    ["five comparing judges", (v) => { v.judges.count = 5; }]
  ])("accepts %s and mints a member that reads back", (_name, mutate) => {
    const value = JSON.parse(JSON.stringify(START));
    mutate(value);
    const policy = parseEngineVersionPolicy(value);
    expect(policy).toEqual(value);
    const settings = engineSettingsOf(policy, { makers: 5, mapOpening: true });
    expect(engineSettingsOfReceipt(engineReceipt(settings, 1))).toEqual(settings);
  });
});

describe("Task 54e (the owner's answer of 5 Nov, \"One per path\"): a paid path debate's investigations, one per path at least", () => {
  it("pathRunInvestigations: max(cap, paths); a cap of 0 (no investigation) stays 0", () => {
    expect([[2, 1], [2, 2], [2, 3], [2, 7], [5, 3], [0, 3], [0, 0], [2, 0]].map(([cap, paths]) => pathRunInvestigations(cap!, paths!)))
      .toEqual([2, 2, 3, 7, 5, 0, 0, 2]);
    for (const [cap, paths] of [[-1, 3], [2, -1], [1.5, 3], [2, 2.5], [Number.NaN, 3]] as const) {
      expect(() => pathRunInvestigations(cap, paths), `${String(cap)}/${String(paths)}`).toThrowError(TypeError);
    }
  });

  it("investigationSitesOf: the row's cap on every debate but a paid path debate's", () => {
    expect(investigationSitesOf(2, null)).toBe(2);
    expect(investigationSitesOf(2, { plan: "free", paths: 3 })).toBe(2);
    expect(investigationSitesOf(2, { plan: "plus", paths: 3 })).toBe(3);
    expect(investigationSitesOf(2, { plan: "plus", paths: 1 })).toBe(2);
    expect(investigationSitesOf(2, { plan: "max", paths: 7 })).toBe(7);
    expect(investigationSitesOf(0, { plan: "pro", paths: 5 })).toBe(0);
  });

  it("withPathDebateInvestigations: the investigation sites raised, nothing else; the very settings when nothing changes", () => {
    const plus3 = withPathDebateInvestigations(SETTINGS, { plan: "plus", paths: 3 });
    expect(plus3.sites).toEqual({ comparingJudges: 3, investigations: 3, answerCheck: 1 });
    expect({ ...plus3, sites: SETTINGS.sites }).toEqual(SETTINGS);
    expect(plus3.investigate).toEqual({ maxPerDebate: 2 });
    for (const frozen of [plus3, plus3.sites]) expect(Object.isFrozen(frozen)).toBe(true);
    expect(withPathDebateInvestigations(SETTINGS, null)).toBe(SETTINGS);
    expect(withPathDebateInvestigations(SETTINGS, { plan: "free", paths: 3 })).toBe(SETTINGS);
    expect(withPathDebateInvestigations(SETTINGS, { plan: "plus", paths: 2 })).toBe(SETTINGS);
  });

  it("the receipt member carries them and reads back: added calls per site, up to one per stored path (8)", () => {
    const seven = withPathDebateInvestigations(SETTINGS, { plan: "max", paths: 7 });
    const receipt = engineReceipt(seven, 3);
    // (3 comparing judges + 7 investigations + 1 answer check) x 3 attempts per site.
    expect(receipt.sites).toEqual({ comparing_judges: 3, investigations: 7, answer_check: 1, added_model_attempts: 33 });
    expect(receipt.investigate).toEqual({ max_per_debate: 2 });
    expect(engineReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(engineSettingsOfReceipt(receipt)).toEqual(seven);
    expect(engineReceipt(withPathDebateInvestigations(SETTINGS, { plan: "max", paths: 8 }), 1).sites.investigations).toBe(8);
  });

  it("refuses investigation sites below the cap, above one per stored path, or any above a cap of 0", () => {
    const raised = (sites: number, cap = 2) => {
      const value = JSON.parse(JSON.stringify(engineReceipt(SETTINGS, 1)));
      value.investigate.max_per_debate = cap;
      value.sites.investigations = sites;
      value.sites.added_model_attempts = value.sites.comparing_judges + sites + value.sites.answer_check;
      return engineReceiptSchema.safeParse(value).success;
    };
    expect([raised(2), raised(3), raised(8), raised(0, 0)]).toEqual([true, true, true, true]);
    expect([raised(1), raised(9), raised(1, 0)]).toEqual([false, false, false]);
  });
});
