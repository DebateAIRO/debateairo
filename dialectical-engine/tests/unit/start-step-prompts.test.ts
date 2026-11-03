// tests/unit/start-step-prompts.test.ts
// V4 start step, Task 22 (spec 2026-11-03 §2, §4): the pre-Start step's five drafted contracts and their reply readers in packages/map.
// The drafts await the owners' wording; what code fixes is pinned here: the seal order, the forms' rules, the material, the reader sentence's
// place, and the readers' salvage (what is dropped and what is kept). Data is made up.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { READER_SENTENCE_WRITING, START_STEP_LIMITS, lockedReplyLanguageExpectation, questionLanguageFromRun, replyLanguageExpectation } from "@debateai/kernel";
import {
  MAP_STEPS, START_INTERNAL_FIELD_NAMES, START_STEP_CONTRACT_NAMES, START_STEP_DRAFT_CONTRACTS, START_WORD_TARGETS, mapContractNameOf,
  mapEngineContractNameOf, startCombineReplySchema, startFitReplySchema, startListSpec, startMergeLateSpec, startMergeSpec, type MapAngle,
  type StartSpecContext
} from "@debateai/map";
import type { StartListViewpoint, StartMenu } from "@debateai/contract";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";

const Q_EN = "Should Harbour Town build a second ferry pier before next summer?";
const Q_RO = "Ar trebui orașul Harbour să construiască un al doilea debarcader înainte de vara viitoare?";
const RO = questionLanguageFromRun("ro", "Romanian")!;
const CTX_EN: StartSpecContext = { questionLine: Q_EN, languageName: "English", languageTag: "und", replyLanguage: replyLanguageExpectation(Q_EN), readingLevel: null };
const CTX_RO_LOCKED: StartSpecContext = { questionLine: Q_RO, languageName: "Romanian", languageTag: "ro",
  replyLanguage: lockedReplyLanguageExpectation(RO, Q_RO), readingLevel: "plain" };
const G1: MapAngle = { angleId: "g1", kind: "OPPOSITE_CASE", label: "The case against", focus: "Why a second pier could be a mistake." };
const G2: MapAngle = { angleId: "g2", kind: "PRACTICAL", label: "What it takes", focus: "What building and running it would need." };
const entry = (angle: string, title: string, at = 0) => ({ angle_id: angle, title, question: `Would ${title.toLowerCase()} change the answer, case ${at}?`,
  why: `It decides whether the pier is worth it, case ${at}.` });
const reply = (value: unknown): string => JSON.stringify(value);
const SEVEN_WITH_BAD = reply({ paths: [entry("g1", "Whole-system costs"), entry("g9", "An angle nobody gave"),
  ...[0, 1, 2, 3, 4].map((at) => entry("g2", `Path ${at}`, at))] });
const viewpoint = (id: string, title: string): StartListViewpoint => ({ viewpoint_id: id, title, question: `Does ${title.toLowerCase()} matter here?`,
  why: `${title} could change the answer.`, angle_id: "g1" });
const SIX: readonly StartListViewpoint[] = ["Queues", "Winter", "Costs", "Crews", "Dredging", "Tourists"].map((title, at) => viewpoint(`pt1${at + 1}`, title));
const FIVE_GROUP_REPLY = reply({ repeats: [], paths: [{ ids: ["pt11", "pt12", "pt13", "pt14", "pt15"], title: "The pier's whole cost",
  question: "What would the pier cost to build and run each year?" }], cards: [], suggestions: [] });
const issuesOf = (classification: Readonly<{ parseStatus: string; parseError?: string | null }>): string =>
  classification.parseStatus === "PARSED" ? "" : classification.parseError ?? classification.parseStatus;
const SRC = join(process.cwd(), "packages/map/src");

describe("the five drafted contracts", () => {
  it("are named and ordered for the seal, and none is sealed or read as a map contract yet", () => {
    expect(START_STEP_CONTRACT_NAMES.map((name) => START_STEP_DRAFT_CONTRACTS[name].contractId))
      .toEqual(["start.list.v1", "start.merge.v1", "start.merge-late.v1", "start.combine.v1", "start.fit.v1"]);
    const sealed = engineSealedContracts().map((contract) => contract.contractId);
    for (const name of START_STEP_CONTRACT_NAMES) {
      const id = START_STEP_DRAFT_CONTRACTS[name].contractId;
      expect(sealed, id).not.toContain(id);
      expect(mapContractNameOf(id), id).toBeNull();
      expect(mapEngineContractNameOf(id), id).toBeNull();
    }
    expect(Object.isFrozen(START_STEP_DRAFT_CONTRACTS)).toBe(true);
    expect(START_WORD_TARGETS).toEqual({ title: 6, question: 20, why: 15, cardSentence: 30, reason: 15 });
  });

  it("each awaits the owners' wording; no instruction names a field, no form shows an id a model could copy, every form starts strict", () => {
    expect(readFileSync(join(SRC, "start-prompts.ts"), "utf8").split("// OWNER WORDING — approve before switch-on").length - 1).toBe(5);
    for (const name of START_STEP_CONTRACT_NAMES) {
      const contract = START_STEP_DRAFT_CONTRACTS[name];
      expect(contract.instruction, name).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
      expect(contract.answerForm, name).not.toMatch(/\b(pt[1-9][1-6]|kp\d{2}|cd[1-3]|sg[1-9]|g[1-7]|b[1-8])\b/u);
      expect(contract.answerForm.startsWith("Return only one JSON object with exactly this schema and no additional keys:"), name).toBe(true);
      expect(contract.instruction, name).not.toContain(READER_SENTENCE_WRITING);
      expect(contract.instruction, name).not.toContain("Write for the reader");
    }
    expect(START_STEP_DRAFT_CONTRACTS.list.answerForm).toContain("paths has 3 to 6 entries.");
    expect(START_STEP_DRAFT_CONTRACTS.merge.answerForm).toContain("cards has 0 to 3 entries; suggestions has 0 to 9 entries.");
    expect(START_STEP_DRAFT_CONTRACTS.mergeLate.answerForm).toContain("fits has at most one entry per path.");
    expect(START_STEP_DRAFT_CONTRACTS.combine.answerForm).toContain(`<about ${String(START_WORD_TARGETS.title)} words>`);
  });

  it("no file of the map package takes a value from the contract", () => {
    for (const file of readdirSync(SRC).filter((name) => name.endsWith(".ts"))) {
      expect(readFileSync(join(SRC, file), "utf8"), file).not.toMatch(/^import (?!type )[^;]*from "@debateai\/contract"/mu);
    }
  });

  it("the internal words are the forms' field names and the material's, lower case, once each, sorted", () => {
    for (const name of ["question_line", "angle_id", "paths_so_far", "path_ref", "new_suggestions", "same_as", "fits_path", "as_question",
      "main_question", "own_view", "question_language"]) expect(START_INTERNAL_FIELD_NAMES, name).toContain(name);
    expect([...START_INTERNAL_FIELD_NAMES]).toEqual([...new Set(START_INTERNAL_FIELD_NAMES.map((name) => name.toLowerCase()))].sort());
  });

  it("the start steps follow the debate map's own steps", () => {
    expect([...MAP_STEPS].slice(-4)).toEqual(["START_LIST", "START_MERGE", "START_COMBINE", "START_FIT"]);
    expect(MAP_STEPS.indexOf("CHECK")).toBe(6);
  });
});

describe("the material and the reader", () => {
  it("a list call is told its question and angles, then the reader only with a level, then the question's language last", () => {
    expect(startListSpec(CTX_RO_LOCKED, [G1], 3).material.map((field) => field.name)).toEqual(["question_line", "angles", "reader", "question_language"]);
    expect(startListSpec({ ...CTX_RO_LOCKED, readingLevel: null }, [G1], 3).material.map((field) => field.name))
      .toEqual(["question_line", "angles", "question_language"]);
    expect(JSON.parse(startListSpec(CTX_EN, [G1, G2], 1).material.find((field) => field.name === "angles")!.content))
      .toEqual([{ angle_id: "g1", label: G1.label, focus: G1.focus }, { angle_id: "g2", label: G2.label, focus: G2.focus }]);
    expect(startListSpec(CTX_EN, [G1], 1).material.map((field) => field.name)).toEqual(["question_line", "angles"]);
  });

  it("the merges are told what the asker said and the suggestions, never who wrote which", () => {
    const merge = startMergeSpec(CTX_RO_LOCKED, { said: ["Mostly for the summer queues."], viewpoints: SIX });
    expect(merge.material.map((field) => field.name)).toEqual(["question_line", "said", "suggestions", "reader", "question_language"]);
    expect(JSON.parse(merge.material.find((field) => field.name === "suggestions")!.content)[0]).toEqual({ id: "pt11", title: "Queues",
      question: "Does queues matter here?", why: "Queues could change the answer." });
    const late = startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews")] });
    expect(late.material.map((field) => field.name)).toEqual(["question_line", "said", "paths_so_far", "listed", "new_suggestions"]);
    expect(JSON.parse(late.material.find((field) => field.name === "paths_so_far")!.content)).toEqual([
      { path_ref: "kp00", title: "Queues", question: "Does queues matter here?" }, { path_ref: "kp01", title: "Winter", question: "Does winter matter here?" }]);
  });

  it("with a level the reader sentence closes the instruction, before the language line; without one there is none", () => {
    for (const spec of [startListSpec(CTX_RO_LOCKED, [G1], 1), startMergeSpec(CTX_RO_LOCKED, { said: [], viewpoints: SIX }),
      startMergeLateSpec(CTX_RO_LOCKED, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews")] })]) {
      const instruction = spec.contract.instruction;
      const at = instruction.indexOf(`\n\n${READER_SENTENCE_WRITING}\n\n`);
      expect(at, spec.contract.contractId).toBeGreaterThan(0);
      expect(instruction.slice(0, at), spec.contract.contractId).toBe(START_STEP_DRAFT_CONTRACTS[
        spec.contract.contractId === "start.list.v1" ? "list" : spec.contract.contractId === "start.merge.v1" ? "merge" : "mergeLate"].instruction);
    }
    for (const spec of [startListSpec(CTX_EN, [G1], 1), startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }),
      startMergeLateSpec({ ...CTX_RO_LOCKED, readingLevel: null }, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews")] })]) {
      expect(spec.contract.instruction, spec.contract.contractId).not.toContain(READER_SENTENCE_WRITING);
      expect(spec.material.map((field) => field.name), spec.contract.contractId).not.toContain("reader");
    }
    expect(() => startListSpec(CTX_EN, [], 1)).toThrow();
    expect(() => startListSpec(CTX_EN, [G1], 10)).toThrow();
  });
});

describe("a list writer's reply", () => {
  it("keeps the good paths, drops one from an angle it was not given, and keeps at most six", () => {
    expect(startListSpec(CTX_EN, [G1, G2], 1).read(SEVEN_WITH_BAD).paths.map((path) => path.title))
      .toEqual(["Whole-system costs", "Path 0", "Path 1", "Path 2", "Path 3", "Path 4"]);
    const eight = reply({ paths: [0, 1, 2, 3, 4, 5, 6, 7].map((at) => entry(at % 2 === 0 ? "g1" : "g2", `Path ${at}`, at)) });
    expect(startListSpec(CTX_EN, [G1, G2], 1).read(eight).paths.map((path) => path.title)).toEqual(["Path 0", "Path 1", "Path 2", "Path 3", "Path 4", "Path 5"]);
  });

  it("drops a text over its limit, one that names an engine field or an item id, a copied placeholder and a repeated title", () => {
    const read = startListSpec(CTX_EN, [G1, G2], 1).read(reply({ paths: [
      entry("g1", "x".repeat(START_STEP_LIMITS.titleMaxChars + 1)),
      { ...entry("g1", "Costs"), question: "What does the question_line really ask about costs?" },
      { ...entry("g1", "Crews"), why: "It repeats what pt12 already said." },
      entry("g2", "<about 6 words>"),
      entry("g2", "Winter traffic"), entry("g2", "winter traffic"), entry("g1", "The town's budget")
    ] }));
    expect(read.paths.map((path) => [path.angle_id, path.title])).toEqual([["g2", "Winter traffic"], ["g1", "The town's budget"]]);
  });

  it("refuses a reply with nothing left, and one written in another language", () => {
    const spec = startListSpec(CTX_EN, [G1], 1);
    expect(issuesOf(spec.classify(reply({ paths: [entry("g7", "Nobody's angle")] })))).toContain("START_LIST_EMPTY");
    expect(issuesOf(spec.classify(reply({ paths: [] })))).toContain("START_LIST_EMPTY");
    const english = startListSpec(CTX_RO_LOCKED, [G1], 1).classify(reply({ paths: [0, 1, 2].map((at) => ({ angle_id: "g1",
      title: `The real yearly cost of running the second pier ${at}`,
      question: "Would the yearly cost of staff, repairs and dredging be paid back by the extra summer fares the second pier brings in?",
      why: "If the running costs are larger than the extra fares, the town pays for the pier every single year." })) }));
    expect(issuesOf(english)).toContain("MAP_WRONG_LANGUAGE");
  });
});

const PRIOR: StartMenu = {
  menu_id: "A".repeat(22), revision: 1, language: { code: "en", name: "English" }, angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: [{ ...viewpoint("pt11", "Queues"), repeat_ids: [] }, { ...viewpoint("pt12", "Winter"), repeat_ids: [] }], repeats: [],
  paths: [{ path_ref: "kp00", title: "Queues", question: "Does queues matter here?", viewpoint_ids: ["pt11"], put_together: false, is_new: false },
    { path_ref: "kp01", title: "Winter", question: "Does winter matter here?", viewpoint_ids: ["pt12"], put_together: false, is_new: false }],
  cards: [], suggestions: []
};

describe("the merge's reply", () => {
  it("a group of five keeps four, and the fifth becomes a path of its own", () => {
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(FIVE_GROUP_REPLY);
    expect(merged.paths.map((path) => path.ids)).toEqual([["pt11", "pt12", "pt13", "pt14"], ["pt15"]]);
    expect(merged.paths[0]).toMatchObject({ title: "The pier's whole cost" });
    expect(merged.paths[1]).toEqual({ ids: ["pt15"], title: null, question: null });
    expect(merged.repeats).toEqual([]);
    expect(merged.suggestions).toEqual([]);
  });

  it("follows repeat chains, and drops self-repeats, cycles, unknown or second-used ids", () => {
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(reply({
      repeats: [{ id: "pt12", same_as: "pt13" }, { id: "pt13", same_as: "pt14" }, { id: "pt11", same_as: "pt11" }, { id: "pt15", same_as: "pt16" },
        { id: "pt16", same_as: "pt15" }, { id: "pt12", same_as: "pt11" }, { id: "pt99", same_as: "pt11" }, { id: "pt11", same_as: "pt98" }],
      paths: [{ ids: ["pt11", "pt99"], title: null, question: null }, { ids: ["pt14", "pt12", "pt11"], title: "Costs and queues",
        question: "Do the costs and the queues point the same way?" }, { ids: ["pt15", "pt16"], title: null, question: null }],
      cards: [], suggestions: [] }));
    expect(merged.repeats).toEqual([{ id: "pt12", same_as: "pt14" }, { id: "pt13", same_as: "pt14" }]);
    // pt11 is used once (its second use dropped), pt12 is a repeat so it leaves the path, pt99 is unknown.
    expect(merged.paths.map((path) => path.ids)).toEqual([["pt11"], ["pt14"], ["pt15", "pt16"]]);
  });

  it("a group's words that break a rule are left out (the first viewpoint's words stand); cards and suggestions follow their paths", () => {
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(reply({ repeats: [],
      paths: [{ ids: ["pt11", "pt12"], title: "<about 6 words>", question: "Do queues and winter go together?" }, { ids: ["pt99"], title: null, question: null },
        { ids: ["pt13", "pt14"], title: "Costs and crews", question: "Do the costs and crews decide it together?" }, { ids: ["pt15"], title: null, question: null }],
      cards: [{ kind: "EITHER_OR", sentence: "Either the pier serves summer crowds or the whole year.", title: "Summer or all year",
        question: "Is the pier for summer only?", fits_path: 2, as_question: null },
      { kind: "OTHER_READING", sentence: "The question may be about the town's money, not the ferries.", title: "The town's money",
        question: "Can the town afford it?", fits_path: 3, as_question: "Can Harbour Town afford a second pier?" },
      { kind: "NOT_A_KIND", sentence: "A card of no kind.", title: "No kind", question: "Which kind?", fits_path: null, as_question: null }],
      suggestions: [{ kind: "COMBINE", paths: [1, 3], reason: "Both are about the summer." }, { kind: "COMBINE", paths: [1, 2], reason: "The second is gone." },
        { kind: "FITS", path: 4, into: 3 }, { kind: "FITS", path: 3, into: 3 }] }));
    expect(merged.paths).toEqual([{ ids: ["pt11", "pt12"], title: null, question: null },
      { ids: ["pt13", "pt14"], title: "Costs and crews", question: "Do the costs and crews decide it together?" }, { ids: ["pt15"], title: null, question: null }]);
    // Path 2 of the reply was dropped: the card on it loses its path; path 3 of the reply is path 2 now.
    expect(merged.cards.map((card) => [card.kind, card.fits_path])).toEqual([["EITHER_OR", null], ["OTHER_READING", 2]]);
    expect(merged.suggestions).toEqual([{ kind: "COMBINE", paths: [1, 2], reason: "Both are about the summer." }, { kind: "FITS", path: 3, into: 2 }]);
  });

  it("refuses a reply with no path left", () => {
    expect(issuesOf(startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).classify(reply({ repeats: [], paths: [{ ids: ["pt99"], title: null, question: null }],
      cards: [], suggestions: [] })))).toContain("START_MERGE_EMPTY");
  });
});

describe("the late merge's reply", () => {
  it("places only the new suggestions, may mark one a repeat of a listed one, and fits a new path into a listed one once", () => {
    const late = startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews"), viewpoint("pt22", "Night sailings"),
      viewpoint("pt23", "More queues")] }).read(reply({
      repeats: [{ id: "pt23", same_as: "pt11" }],
      paths: [{ ids: ["pt21", "pt11"], title: null, question: null }, { ids: ["pt22"], title: null, question: null }],
      fits: [{ path: 1, into: "kp00" }, { path: 1, into: "kp01" }, { path: 2, into: "kp77" }] }));
    expect(late.repeats).toEqual([{ id: "pt23", same_as: "pt11" }]);
    expect(late.paths.map((path) => path.ids)).toEqual([["pt21"], ["pt22"]]);
    expect(late.fits).toEqual([{ path: 1, into: "kp00" }]);
  });
});

describe("the combine's and the fit's replies (their specs come with the combine step)", () => {
  it("are strict objects", () => {
    expect(startCombineReplySchema.safeParse({ title: "Summer and winter", question: "Does the pier pay for itself across the year?" }).success).toBe(true);
    expect(startCombineReplySchema.safeParse({ title: "x".repeat(START_STEP_LIMITS.pathTitleMaxChars + 1), question: "Q?" }).success).toBe(false);
    expect(startCombineReplySchema.safeParse({ title: "T", question: "Q?", extra: 1 }).success).toBe(false);
    expect(startFitReplySchema.safeParse({ fits: null }).success).toBe(true);
    expect(startFitReplySchema.safeParse({ fits: "p2" }).success).toBe(true);
    expect(startFitReplySchema.safeParse({}).success).toBe(false);
  });
});

describe("review fixes: every rule holds whatever the reply's slips", () => {
  const parsedError = (classification: Readonly<{ parseStatus: string; parseError?: string | null }>): Array<{ path: unknown[]; message: string }> =>
    classification.parseStatus === "PARSED" ? [] : JSON.parse(classification.parseError ?? "[]") as Array<{ path: unknown[]; message: string }>;

  it("a reply the structure fixer repairs is cleaned by the same rules", () => {
    const list = startListSpec(CTX_EN, [G1, G2], 1).read(reply({ notes: "Some thoughts.", paths: [entry("g9", "An angle nobody gave"), entry("g1", "Whole-system costs")] }));
    expect(list.paths.map((path) => path.title)).toEqual(["Whole-system costs"]);
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(reply({
      repeats: [{ id: "pt11", same_as: "pt11" }], paths: [{ ids: ["pt11", "pt99"], title: null, question: null }, { ids: ["pt12"], title: null, question: null }],
      cards: [{ kind: "EITHER_OR", sentence: "Either summer or the whole year.", title: "Summer or all year", question: "Is it for summer only?", fits_path: 9,
        as_question: null, confidence: 0.9 }], suggestions: [{ kind: "COMBINE", paths: [2, 2], reason: "The same path twice." }] }));
    expect(merged.repeats).toEqual([]);
    expect(merged.paths.map((path) => path.ids)).toEqual([["pt11"], ["pt12"]]);
    expect(merged.cards.map((card) => card.fits_path)).toEqual([null]);
    expect(merged.suggestions).toEqual([]);
  });

  it("each part's language is judged on its own texts, at its own place", () => {
    const romanianPaths = [{ ids: ["pt11", "pt12"], title: "Cozile și iarna", question: "Se schimbă cozile de la debarcader iarna, când vin mai puțini turiști?" }];
    const englishCard = { kind: "OTHER_READING", sentence: "The question may really be about whether the town can afford to keep two piers running every winter.",
      title: "What the town can afford", question: "Can the town really afford to run two piers through every quiet winter?", fits_path: null,
      as_question: "Can Harbour Town afford to run a second ferry pier all year round?" };
    const issues = parsedError(startMergeSpec(CTX_RO_LOCKED, { said: [], viewpoints: SIX }).classify(reply({ repeats: [], paths: romanianPaths,
      cards: [englishCard], suggestions: [] })));
    expect(issues).toEqual([{ code: "custom", path: ["cards"], message: "MAP_WRONG_LANGUAGE" }]);
    const late = parsedError(startMergeLateSpec(CTX_RO_LOCKED, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews"), viewpoint("pt22", "Night")] })
      .classify(reply({ repeats: [], paths: [{ ids: ["pt21", "pt22"], title: "The crews who sail at night",
        question: "Would the ferry crews have to work far longer night shifts to keep a second pier running all summer?" }], fits: [] })));
    expect(late.map((one) => one.message)).toEqual(["MAP_WRONG_LANGUAGE"]);
  });

  it("a late merge takes several late lists at once, up to the menu's whole size", () => {
    const late = [21, 22, 23, 24, 25, 26, 31, 32, 33].map((no) => viewpoint(`pt${String(no)}`, `Late idea ${String(no)}`));
    const read = startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: late }).read(reply({ repeats: [],
      paths: late.map((one) => ({ ids: [one.viewpoint_id], title: null, question: null })), fits: [] }));
    expect(read.paths).toHaveLength(9);
    expect(() => startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: [] })).toThrow();
    const tooMany = Array.from({ length: START_STEP_LIMITS.viewpointsMax - 1 }, (_, at) => viewpoint(`pt${String(Math.floor(at / 6) + 1)}${String((at % 6) + 1)}`, `Idea ${String(at)}`));
    expect(() => startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: tooMany })).toThrow();
  });

  it("a late repeat of a listed repeat is a repeat of the viewpoint shown for it", () => {
    const prior: StartMenu = { ...PRIOR, viewpoints: [{ ...viewpoint("pt11", "Queues"), repeat_ids: ["pt13"] }, { ...viewpoint("pt12", "Winter"), repeat_ids: [] }],
      repeats: [viewpoint("pt13", "Waiting lines")] };
    const read = startMergeLateSpec(CTX_EN, { said: [], prior, viewpoints: [viewpoint("pt31", "Long waits"), viewpoint("pt32", "Night sailings")] })
      .read(reply({ repeats: [{ id: "pt31", same_as: "pt13" }], paths: [{ ids: ["pt32"], title: null, question: null }], fits: [] }));
    expect(read.repeats).toEqual([{ id: "pt31", same_as: "pt11" }]);
  });

  it("a late merge that only repeats is kept; one that places nothing is refused", () => {
    const spec = startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "More queues")] });
    expect(spec.read(reply({ repeats: [{ id: "pt21", same_as: "pt11" }], paths: [], fits: [] }))).toEqual({ repeats: [{ id: "pt21", same_as: "pt11" }], paths: [], fits: [] });
    expect(issuesOf(spec.classify(reply({ repeats: [], paths: [{ ids: ["pt99"], title: null, question: null }], fits: [] })))).toContain("START_MERGE_EMPTY");
  });

  it("a merge keeps three cards and nine suggestions at most, and drops a card or suggestion whose words break a rule", () => {
    const groups = SIX.map((one) => ({ ids: [one.viewpoint_id], title: null, question: null }));
    const card = (at: number, extra: Record<string, unknown> = {}) => ({ kind: "CHOICE_NOT_WEIGHED", sentence: `A choice the town may not have weighed, number ${String(at)}.`,
      title: `Choice ${String(at)}`, question: `Would choice ${String(at)} change the answer?`, fits_path: null, as_question: null, ...extra });
    const pairs: Array<[number, number]> = [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 3], [2, 4], [2, 5], [2, 6], [3, 4]];
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(reply({ repeats: [], paths: groups,
      cards: [card(1, { sentence: "It names the fits_path of the card." }), card(2, { as_question: "<the main question asked this way>" }), card(3), card(4), card(5)],
      suggestions: [{ kind: "COMBINE", paths: [5, 6], reason: "x".repeat(START_STEP_LIMITS.suggestionReasonMaxChars + 1) },
        ...pairs.map(([a, b]) => ({ kind: "COMBINE", paths: [a, b], reason: `Paths ${String(a)} and ${String(b)} ask the same.` }))] }));
    expect(merged.cards.map((one) => [one.title, one.as_question])).toEqual([["Choice 2", null], ["Choice 3", null], ["Choice 4", null]]);
    expect(merged.suggestions).toHaveLength(START_STEP_LIMITS.suggestionsMax);
    expect(merged.suggestions[0]).toMatchObject({ paths: [1, 2] });
  });

  it("the same suggestion twice, or a fit both ways, is kept once", () => {
    const merged = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX }).read(reply({ repeats: [],
      paths: SIX.slice(0, 3).map((one) => ({ ids: [one.viewpoint_id], title: null, question: null })), cards: [],
      suggestions: [{ kind: "COMBINE", paths: [1, 2], reason: "Both ask about money." }, { kind: "COMBINE", paths: [2, 1], reason: "Both again." },
        { kind: "FITS", path: 3, into: 1 }, { kind: "FITS", path: 3, into: 1 }, { kind: "FITS", path: 1, into: 3 }] }));
    expect(merged.suggestions).toEqual([{ kind: "COMBINE", paths: [1, 2], reason: "Both ask about money." }, { kind: "FITS", path: 3, into: 1 }]);
  });

  it("a path written with no id is left out wherever it stands", () => {
    const spec = startMergeSpec(CTX_EN, { said: [], viewpoints: SIX });
    expect(spec.read(reply({ repeats: [], paths: [{ ids: ["pt11"], title: null, question: null }, { ids: [], title: null, question: null }], cards: [], suggestions: [] }))
      .paths.map((path) => path.ids)).toEqual([["pt11"]]);
  });

  it("text a person reads never names the step's own ids: an angle, a menu path, a card, a suggestion or a chosen path", () => {
    const list = startListSpec(CTX_EN, [G1, G2], 1).read(reply({ paths: [entry("g1", "Costs seen from g2"), { ...entry("g1", "Winter"), why: "As kp03 says." },
      entry("g2", "The town's budget")] }));
    expect(list.paths.map((path) => path.title)).toEqual(["The town's budget"]);
    const late = startMergeLateSpec(CTX_EN, { said: [], prior: PRIOR, viewpoints: [viewpoint("pt21", "Ferry crews"), viewpoint("pt22", "Night")] })
      .read(reply({ repeats: [], paths: [{ ids: ["pt21", "pt22"], title: "Like kp00, but at night", question: "Would night crews change it?" }], fits: [] }));
    expect(late.paths).toEqual([{ ids: ["pt21", "pt22"], title: null, question: null }]);
  });
});
