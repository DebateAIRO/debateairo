// tests/unit/start-step-combine.test.ts
// V4 start step, Task 25 (spec 2026-11-03 §2, §6 items 3 and 4): the combined question, which never restates the main question (code checks
// it: the known fault), and the fit of the person's own point of view inside one of their chosen paths. A scripted gateway reads each
// reply TEXT through the call's own spec and re-asks once after a refusal, as the real gateway does. Data is made up.
import { describe, expect, it } from "vitest";
import { READER_SENTENCE_WRITING, lockedReplyLanguageExpectation, questionLanguageFromRun, replyLanguageExpectation } from "@debateai/kernel";
import {
  START_CALL_SITES, START_COMBINE_OVERLAP, mapCombineStart, mapFitOwnPath, startCombineSpec, startFitSpec, startRestatesMainQuestion,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapSeat, type MapSpecContext, type StartSpecContext
} from "@debateai/map";

const MAIN = "Should Romania build new nuclear plants?";
const HAIKU: MapSeat = { aiRef: "haiku", maker: "Anthropic" };
const STOP = { finishReason: "stop" };
const EN = questionLanguageFromRun("en", "English")!;
const CTX: StartSpecContext = { questionLine: MAIN, languageName: "English", languageTag: "en", replyLanguage: lockedReplyLanguageExpectation(EN, MAIN),
  readingLevel: "plain" };
const MEMBERS = [{ title: "Fuel imports", question: "Where would the reactor fuel come from, and could supply be cut?" },
  { title: null, question: "Could the plants make it easier to build weapons?" }];
const OWN = "I worry most about who pays when a build runs late.";
const PATHS = [{ key: "k1", title: "Whole-system costs", question: "What would the plants cost once storage and grid work are counted?" },
  { key: "k2", title: "Building on time", question: "How often do new plants run late, and who pays for it?" }];

type Issue = Readonly<{ code: string; path: readonly (string | number)[] }>;
/** Reads each try's text through the call's own spec; after a refusal it re-asks once with the next text (the gateway's one repair). */
function gateway(tries: readonly string[]) {
  const requests: MapCallRequest<unknown>[] = [];
  const repairs: Issue[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      requests.push(request as MapCallRequest<unknown>);
      for (const [at, text] of tries.slice(0, 2).entries()) {
        const read = request.spec.classify(text, STOP);
        if (read.parseStatus === "PARSED") return { kind: "OK", value: request.spec.read(text, STOP) };
        if (at === 0 && tries.length > 1) {
          repairs.push(...(JSON.parse(read.parseError ?? "[]") as { message: string; path: (string | number)[] }[])
            .map((issue) => ({ code: issue.message, path: issue.path })));
        }
      }
      return { kind: "FAILED", code: "TEST_REFUSED" };
    }
  };
  return { caller, requests, repairs };
}
const combined = (title: string, question: string): string => JSON.stringify({ title, question });
const COMBINE_RUN = { mainQuestion: MAIN, languageName: "English", languageTag: "en", readingLevel: "plain" as const, members: MEMBERS, seat: HAIKU };
const FIT_RUN = { questionLine: MAIN, languageName: "English", languageTag: "en", ownText: OWN, paths: PATHS, seat: HAIKU };

describe("restating the main question", () => {
  it("counts the main question's distinct words of three letters or more; 60% of them again is a restatement", () => {
    expect(START_COMBINE_OVERLAP).toEqual({ share: 0.6, minWordChars: 3, minWords: 3 });
    expect(startRestatesMainQuestion("Should Romania build nuclear plants at all?", MAIN, "en")).toBe(true);
    expect(startRestatesMainQuestion("SHOULD ROMANIA BUILD ANY NEW PLANTS?", MAIN, "en")).toBe(true);
    // Four of its six words is two thirds; three is half.
    expect(startRestatesMainQuestion("Could Romania build new nuclear power?", MAIN, "en")).toBe(true);
    expect(startRestatesMainQuestion("Is Romania able to build nuclear power safely?", MAIN, "en")).toBe(false);
    expect(startRestatesMainQuestion("Would new plants in Romania pay for themselves?", MAIN, "en")).toBe(false);
    expect(startRestatesMainQuestion("Do fuel imports and weapons spread make it unsafe?", MAIN, "en")).toBe(false);
    expect(startRestatesMainQuestion("Ar trebui România să construiască centrale nucleare noi?", "Ar trebui România să construiască noi centrale nucleare?", "ro"))
      .toBe(true);
  });

  it("a main question of fewer than three such words is never restated", () => {
    expect(startRestatesMainQuestion("Go on?", "Go on?", "en")).toBe(false);
    expect(startRestatesMainQuestion("Why now, and why me?", "Why now?", "en")).toBe(false);
  });
});

describe("the combine", () => {
  it("its material: the main question, the points, the reader only with a level, the question's language last", () => {
    expect(startCombineSpec(CTX, MEMBERS).material.map((field) => field.name)).toEqual(["main_question", "points", "reader", "question_language"]);
    expect(startCombineSpec({ ...CTX, readingLevel: null }, MEMBERS).material.map((field) => field.name))
      .toEqual(["main_question", "points", "question_language"]);
    expect(startCombineSpec(CTX, MEMBERS).material[1]!.content).toBe(JSON.stringify(MEMBERS.map((member) => ({ title: member.title, question: member.question }))));
    expect(startCombineSpec(CTX, MEMBERS).contract.instruction).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n`);
    expect(startCombineSpec({ ...CTX, readingLevel: null }, MEMBERS).contract.instruction).not.toContain(READER_SENTENCE_WRITING);
    expect(startCombineSpec(CTX, MEMBERS).contract.contractId).toBe("start.combine.v1");
  });

  it("asks Haiku once and gives its title and question", async () => {
    const script = gateway([combined("Fuel and weapons", "Do fuel imports and weapons spread make it unsafe?")]);
    expect(await mapCombineStart({ ...COMBINE_RUN, caller: script.caller }))
      .toEqual({ title: "Fuel and weapons", question: "Do fuel imports and weapons spread make it unsafe?" });
    expect(script.requests.map((request) => [request.callSiteKey, request.step, request.seat.aiRef])).toEqual([["START:combine", "START_COMBINE", "haiku"]]);
  });

  it("keeps the sentences that do not restate the main question", async () => {
    const script = gateway([combined("Fuel and weapons", `${MAIN} Do fuel imports and weapons spread make it unsafe?`)]);
    expect(await mapCombineStart({ ...COMBINE_RUN, caller: script.caller }))
      .toEqual({ title: "Fuel and weapons", question: "Do fuel imports and weapons spread make it unsafe?" });
    expect(script.repairs).toEqual([]);
  });

  it("refuses a restatement for the gateway's one repair; still restating, there is none", async () => {
    const script = gateway([combined("Nuclear plants", MAIN), combined("Nuclear plants", "Should Romania build nuclear plants at all?")]);
    expect(await mapCombineStart({ ...COMBINE_RUN, caller: script.caller })).toBeNull();
    expect(script.repairs).toEqual([{ code: "START_COMBINE_RESTATES_MAIN_QUESTION", path: ["question"] }]);
    expect(script.requests[0]!.spec.material.map((field) => field.name)).toEqual(["main_question", "points", "reader", "question_language"]);
  });

  it("the repaired reply is taken when it no longer restates", async () => {
    const script = gateway([combined("Nuclear plants", MAIN), combined("Fuel and weapons", "Do fuel imports and weapons spread make it unsafe?")]);
    expect(await mapCombineStart({ ...COMBINE_RUN, caller: script.caller }))
      .toEqual({ title: "Fuel and weapons", question: "Do fuel imports and weapons spread make it unsafe?" });
  });

  it("an over-long title or question is cut at a word edge", async () => {
    const long = `${"Fuel supply and weapons risk ".repeat(6)}together`;
    const script = gateway([combined(long, "Do fuel imports and weapons spread make it unsafe?")]);
    const done = await mapCombineStart({ ...COMBINE_RUN, caller: script.caller });
    expect(long.length).toBeGreaterThan(120);
    // The title's limit is 120: four times the 29-character phrase, then the word that ends at 120.
    expect(done!.title).toBe(`${"Fuel supply and weapons risk ".repeat(4)}Fuel`);
  });

  it("no seat asks nothing and gives nothing", async () => {
    const script = gateway([combined("Fuel and weapons", "Do fuel imports and weapons spread make it unsafe?")]);
    expect(await mapCombineStart({ ...COMBINE_RUN, seat: null, caller: script.caller })).toBeNull();
    expect(script.requests).toEqual([]);
  });
});

describe("the fit of the person's own point of view", () => {
  const FIT_CTX: MapSpecContext = { questionLine: MAIN, languageName: "English", languageTag: "en", replyLanguage: replyLanguageExpectation(MAIN) };

  it("its material, in a fixed order, with no reader field and no reader sentence", () => {
    const spec = startFitSpec(FIT_CTX, { ownText: OWN, paths: PATHS });
    expect(spec.material.map((field) => field.name)).toEqual(["question_line", "own_view", "paths", "question_language"]);
    expect(spec.material[2]!.content).toBe(JSON.stringify(PATHS));
    expect(spec.contract.instruction).not.toContain(READER_SENTENCE_WRITING);
    expect(spec.contract.contractId).toBe("start.fit.v1");
  });

  it("gives the key of the path it fits, or none", async () => {
    const fits = gateway([JSON.stringify({ fits: "k2" })]);
    expect(await mapFitOwnPath({ ...FIT_RUN, caller: fits.caller })).toEqual({ fitsKey: "k2" });
    expect(fits.requests.map((request) => [request.callSiteKey, request.step])).toEqual([[START_CALL_SITES.fit, "START_FIT"]]);
    expect(await mapFitOwnPath({ ...FIT_RUN, caller: gateway([JSON.stringify({ fits: null })]).caller })).toEqual({ fitsKey: null });
  });

  it("a key it was not given is refused, and then there is no answer", async () => {
    const script = gateway([JSON.stringify({ fits: "k9" }), JSON.stringify({ fits: "k7" })]);
    expect(await mapFitOwnPath({ ...FIT_RUN, caller: script.caller })).toBeNull();
    expect(script.repairs).toEqual([{ code: "START_FIT_UNKNOWN_KEY", path: ["fits"] }]);
  });

  it("no seat asks nothing and gives nothing", async () => {
    const script = gateway([JSON.stringify({ fits: "k1" })]);
    expect(await mapFitOwnPath({ ...FIT_RUN, seat: null, caller: script.caller })).toBeNull();
    expect(script.requests).toEqual([]);
  });
});
