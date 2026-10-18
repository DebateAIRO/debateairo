// tests/unit/practice-map-wording.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, replyLanguageExpectation } from "@debateai/kernel";
import {
  MAP_ENGINE_CONTRACT_NAMES, MAP_ENGINE_INSTRUCTIONS, mapChooseSpec, mapEngineContractNameOf, mapEnginePromptContracts, mapListSpec,
  mapSnowballSpec, type MapCallOutcome, type MapCallRequest, type MapCaller, type MapEngineContractName, type MapSpecContext
} from "@debateai/map";
import {
  MAP_WORDING_N_ID_SUFFIX, MAP_WORDING_N_INSTRUCTIONS, practiceWordingMapExtras, practiceWordingNCaller, practiceWordingRows, practiceWordingTotals
} from "../../tools/preview-practice/practice-map-wording.js";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import type { OpeningsArmLine } from "../../tools/preview-practice/practice-openings-log.js";
import { PracticeRefusal } from "../../tools/preview-practice/practice-settings.js";

/** Spec §5.6 "Wording N": the clauses wording N adds, word for word (lists; choose). */
const LIST_CLAUSE = "; but it may not say only that it depends or that the question is still open, and it never just restates the answer "
  + "as a taste, such as choosing A if you prefer A.";
const CHOOSE_CLAUSE = "; but it may not say only that it depends, that it is undetermined or that the question is still open, and it never "
  + "just restates the answer as a taste, such as choosing A if you prefer A.";
const WRITING: readonly MapEngineContractName[] = ["listAngle", "listOpen", "listSnowball", "choose"];
const TAIL = " The language and length sentences the spec appends.";
const SEAT = Object.freeze({ aiRef: "preview:a", maker: "maker-a" });
const ENGINE_CTX: MapSpecContext = { questionLine: "Should a city make its buses free?", languageName: "English", languageTag: "en",
  replyLanguage: replyLanguageExpectation("Should a city make its buses free?"),
  length: { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }, engine: true };

const requestOf = (name: MapEngineContractName): MapCallRequest<unknown> => ({ step: "LIST", callSiteKey: `MAP:${name}`, seat: SEAT, order: 0,
  shown: "BLIND", spec: { contract: { ...mapEnginePromptContracts()[name], instruction: `${MAP_ENGINE_INSTRUCTIONS[name]}${TAIL}` }, engine: true } }) as unknown as MapCallRequest<unknown>;
function spyCaller(): Readonly<{ caller: MapCaller; seen: MapCallRequest<unknown>[] }> {
  const seen: MapCallRequest<unknown>[] = [];
  return { seen, caller: { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
    seen.push(request as MapCallRequest<unknown>); return { kind: "FAILED", code: "TEST" }; } } };
}

describe("wording N, practice only (spec §5.6, D5; Ruling PF-R3-2.3)", () => {
  it("each wording-N text is the shipped text with only the named failing forms added; the shipped texts name none", () => {
    expect(Object.keys(MAP_WORDING_N_INSTRUCTIONS).sort()).toEqual([...WRITING].sort());
    for (const name of WRITING) {
      const n = MAP_WORDING_N_INSTRUCTIONS[name]!;
      expect(n.replace(name === "choose" ? CHOOSE_CLAUSE : LIST_CLAUSE, "."), name).toBe(MAP_ENGINE_INSTRUCTIONS[name]);
      expect(n).toContain("A if you prefer A");
      expect(MAP_ENGINE_INSTRUCTIONS[name].toLowerCase()).not.toContain("it depends");
    }
  });

  it("the wrapper swaps only the four writing instructions, keeps every sentence after them, and suffixes the id; the rest pass through", async () => {
    const { caller, seen } = spyCaller();
    const wrapped = practiceWordingNCaller(caller);
    const requests = MAP_ENGINE_CONTRACT_NAMES.map(requestOf);
    for (const request of requests) await wrapped.call(request);
    MAP_ENGINE_CONTRACT_NAMES.forEach((name, index) => {
      const sent = seen[index]!;
      if (WRITING.includes(name)) {
        expect(sent.spec.contract.contractId).toBe(`${mapEnginePromptContracts()[name].contractId}${MAP_WORDING_N_ID_SUFFIX}`);
        expect(sent.spec.contract.instruction).toBe(`${MAP_WORDING_N_INSTRUCTIONS[name]!}${TAIL}`);
        expect(sent.spec.contract.answerForm).toBe(mapEnginePromptContracts()[name].answerForm);
      } else {
        // Angles, merge, gap and the answer check (its check form included) go out byte for byte: one check for both arms.
        expect(sent).toBe(requests[index]);
        expect(sent.spec.contract.contractId).toBe(mapEnginePromptContracts()[name].contractId);
      }
    });
    // The real engine-2 specs of all four writing steps (the angle list and the choose are the ones C2N sends; fix round 1,
    // review Minor 7): each instruction starts with the shipped text and a space, and the wrapper keeps the rest.
    const angle = Object.freeze({ angleId: "g1", kind: "SPECIFIC" as const, label: "Cost", focus: "What it costs a rider." });
    const reals = [mapListSpec(ENGINE_CTX, angle), mapListSpec(ENGINE_CTX, null), mapSnowballSpec(ENGINE_CTX, []),
      mapChooseSpec(ENGINE_CTX, [], [], { engine: { framingChallenges: [] } })];
    expect(reals.map((real) => mapEngineContractNameOf(real.contract.contractId))).toEqual(["listAngle", "listOpen", "listSnowball", "choose"]);
    for (const real of reals) {
      const name = mapEngineContractNameOf(real.contract.contractId)!;
      expect(real.contract.instruction.startsWith(`${MAP_ENGINE_INSTRUCTIONS[name]} `), name).toBe(true);
      await wrapped.call({ step: "LIST", callSiteKey: "MAP:list:0", seat: SEAT, order: 0, shown: "BLIND", spec: real } as MapCallRequest<unknown>);
      expect(seen.at(-1)!.spec.contract.instruction, name)
        .toBe(`${MAP_WORDING_N_INSTRUCTIONS[name]!}${real.contract.instruction.slice(MAP_ENGINE_INSTRUCTIONS[name].length)}`);
      expect(seen.at(-1)!.spec.contract.contractId, name).toBe(`${real.contract.contractId}${MAP_WORDING_N_ID_SUFFIX}`);
    }
    // A base that no longer starts with the shipped text is refused (a practice refusal: the openings run ends the arm on it).
    const moved = requestOf("choose");
    const drifted = { ...moved, spec: { ...moved.spec, contract: { ...moved.spec.contract, instruction: `Changed. ${moved.spec.contract.instruction}` } } };
    expect(() => wrapped.call(drifted)).toThrow(PracticeRefusal);
    expect(() => wrapped.call(drifted)).toThrow(/^PRACTICE_WORDING_N_BASE_CHANGED/u);
  });

  it("is never sealed and never shipped; engine 1's arms get no engine and no length", () => {
    expect(engineSealedContracts().some((contract) => contract.contractId.endsWith(MAP_WORDING_N_ID_SUFFIX))).toBe(false);
    expect(mapEngineContractNameOf(`map.choose.v2${MAP_WORDING_N_ID_SUFFIX}`)).toBeNull();
    const manifest = readFileSync(new URL("../support/shipped-corpus.manifest.txt", import.meta.url), "utf8");
    expect(manifest.split("\n").some((line) => line.startsWith("tools/"))).toBe(false);
    for (const arm of ["T", "A", "B", "C"] as const) expect(practiceWordingMapExtras(arm)).toEqual({});
    for (const arm of ["C2", "C2N"] as const) {
      const extras = practiceWordingMapExtras(arm);
      expect(extras.length?.targets).toEqual(LENGTH_GUIDANCE_START.map);
      expect(extras.engine?.answerCheckCandidates).toBeGreaterThan(0);
    }
  });

  it("the report: per arm and question, the debated answers and the codes; per arm, D1's counts by test", () => {
    const line = (arm: "C2" | "C2N", codes: Record<string, string>, premiseExempt: readonly string[], seats = 5): OpeningsArmLine => ({
      arm, questionId: "en-nuclear", seats, startedAt: "2026-10-23T00:00:00.000Z", finishedAt: "2026-10-23T00:01:00.000Z", outcome: "MAP", positions: 0,
      marks: [], notes: [],
      map: { choice: { answers: [{ answerId: "a1", statement: "Yes.", assumptions: ["A fact."] }, { answerId: "a2", statement: "No.", assumptions: [] }] },
        // A whole MapAnswerCheckResult (Task 1's members, premiseExempt included; FINAL Ruling D4(b) encoding).
        answerCheck: { checker: null, outcomes: codes, reasons: {}, candidates: [], replacements: [], premiseExempt } } as unknown as OpeningsArmLine["map"] });
    // Fix round 2 (N2): a refused arm keeps its row (no answers, its refusal's code), so it never drops out of the table.
    const refused: OpeningsArmLine = { ...line("C2N", {}, [], 4), questionId: "ro-euro", outcome: "UNAVAILABLE", map: null,
      notes: [{ note: "PRACTICE_REFUSED", step: "MAP", detail: "PRACTICE_WORDING_N_BASE_CHANGED" }] };
    const rows = practiceWordingRows([line("C2", { a1: "PASSED", a2: "NO_COST" }, ["a1"]), line("C2N", { a1: "PASSED", a2: "PASSED" }, [], 4),
      { ...line("C2", {}, []), arm: "C" }, refused]);
    expect(rows.map((row) => [row.arm, row.questionId, row.answers])).toEqual([["C2", "en-nuclear", ["Yes.", "No."]], ["C2N", "en-nuclear", ["Yes.", "No."]],
      ["C2N", "ro-euro", []]]);
    // Fix round 1 (review Minor 6): each row carries its arm's seat count, so a seat that went busy during C2 shows.
    expect(rows.map((row) => row.seats)).toEqual([5, 4, 4]);
    expect(rows.map((row) => row.refused)).toEqual([null, null, "PRACTICE_WORDING_N_BASE_CHANGED"]);
    expect([rows[2]!.codes, rows[2]!.answerCheck]).toEqual([null, null]);
    expect(rows[0]!.answerCheck).toMatchObject({ rejected: 1, noCost: 1, premiseExempt: 1, assumptionsPerAnswer: [1, 0] });
    expect(practiceWordingTotals(rows)).toEqual([
      { arm: "C2", questions: 1, refused: 0, seats: [5], checked: 2, rejected: 1, notAnAnswer: 0, addedFact: 0, noCost: 1, premiseExempt: 1, assumptions: [1, 0] },
      { arm: "C2N", questions: 1, refused: 1, seats: [4, 4], checked: 2, rejected: 0, notAnAnswer: 0, addedFact: 0, noCost: 0, premiseExempt: 0, assumptions: [1, 0] }]);
    // An arm refused on every question still has its totals row.
    expect(practiceWordingTotals([rows[2]!])).toEqual([
      { arm: "C2N", questions: 0, refused: 1, seats: [4], checked: 0, rejected: 0, notAnAnswer: 0, addedFact: 0, noCost: 0, premiseExempt: 0, assumptions: [] }]);
  });
});
