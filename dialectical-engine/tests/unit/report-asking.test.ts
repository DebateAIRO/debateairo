// tests/unit/report-asking.test.ts
// R22 decision 26: the report on big debates. The writer reads every path down to three levels with every point, and a list of deeper
// paths with only their line and outcome. It may ask once, for up to 10 of them by name, from the cache; everyone after it reads the
// material it ended with. Made-up debates and scripted vendors only: what these prove about the cache is the bytes we send; whether
// Anthropic really reads them back is seen only in a real call's usage.
import { describe, expect, it } from "vitest";
import { ANTHROPIC_DOSSIER_FIRST_SYSTEM, OpenAICompatibleProviderGateway, anthropicMessagesRequestBody, previewThinkingStepOf, type ProviderCallRequest } from "@debateai/providers";
import {
  REPORT_ASK_MAX_PATHS, REPORT_REPLY_ISSUES, answerUpdateCallSiteKey, answerUpdateCallSiteRole, classifyReportWriterContent, investigationReportCallSiteKey,
  investigationReportCallSiteRole, reportAskSalvaged, writeOverallAnswer, type StoryRoleMaker
} from "@debateai/story";
import { createReplayBook, replayingGateway, recordedCalls, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  closeInvestigation, closingRandomBytes, fittedReportContent, type InvestigationReportContent
} from "../../apps/runner/src/investigation-close.js";
import {
  buildInvestigationDossier, dossierFieldsOf, investigationReportAnswerLength, investigationReportGuard, type Dossier, type DossierDig
} from "../../apps/runner/src/investigation-dossier.js";
import {
  PATH_YES, ROOT, closingOf, contractOf, fieldsOf, fittingStory, investigationInput, memoryReports, readyDig, settingsOver, team
} from "../support/investigation-close-world.js";

const pointOf = (id: string, text: string) => Object.freeze({ id, text, onId: null, side: "for" as const, trust: null, disputed: false });
const idOf = (level: number, at = 0, tail = "000000000000") => `${String(level).padStart(8, "0")}-${String(at).padStart(4, "0")}-4000-8000-${tail}`;
const pathOf = (level: number, at = 0) => `ffffffff-${String(level).padStart(4, "0")}-4000-8000-${String(at).padStart(12, "0")}`;

/** A chain of digs, level 1 to `levels`, each with its one path and its points; the deep ones hold `deepPoints` points. */
function chain(levels: number, over: (level: number) => Partial<DossierDig> = () => ({})): readonly DossierDig[] {
  return Array.from({ length: levels }, (_, at) => {
    const level = at + 1;
    const ref = pathOf(level);
    const points = [pointOf(idOf(level, 0, "00000000000a"), `Point at level ${String(level)}: winter boats leave half empty.`)];
    return readyDig({ runId: idOf(level), parentRunId: level === 1 ? ROOT : idOf(level - 1), positionRef: level === 1 ? PATH_YES : pathOf(level - 1), level,
      finishedAt: `2026-10-31T${String(level).padStart(2, "0")}:00:00.000Z`,
      picks: [{ text: `Pick at level ${String(level)}`, by: "AI_SUGGESTION" }],
      rewrite: { ...readyDig().rewrite!, rewriteId: idOf(level).replace(/^./u, "9"), recordedAt: `2026-10-31T${String(level).padStart(2, "0")}:05:00.000Z`, view: null,
        whatChanged: [`What level ${String(level)} changed.`], digPaths: [{ positionRef: ref, line: `Line at level ${String(level)}.`, fate: "HELD_UP" }] },
      ownMaterial: { answer: [], paths: [{ positionRef: ref, statement: `Line at level ${String(level)}.`, points, extracts: [] }],
        sources: [{ pointId: points[0]!.id, site: "port.example.org", link: "https://port.example.org/counts", title: null, quote: `Quote at level ${String(level)}.`, line: `Note at level ${String(level)}.` }] },
      ...over(level) });
  });
}
const deepDebate = (levels = 6, over?: (level: number) => Partial<DossierDig>) => investigationInput({ digs: chain(levels, over) });
const built = (input = deepDebate()): Dossier => {
  const dossier = buildInvestigationDossier(input);
  if (dossier.kind !== "BUILT") throw new Error("the dossier did not fit");
  return dossier;
};
const field = (dossier: Dossier, name: string): unknown => JSON.parse(dossierFieldsOf(dossier).find((entry) => entry.name === name)!.content);
const deepNames = (dossier: Dossier) => (field(dossier, "deeper_paths") as Array<{ ref: string }>).map((entry) => entry.ref);
const ask = (names: readonly string[]) => JSON.stringify({ ask_for: names });
const ANSWER = JSON.stringify({ segments: [{ text: "Build the pier for rush hour; expect it half empty in winter.", rests_on: ["A1"] }] });

/** Haiku asks on its first report call, then answers; GLM is satisfied. */
const asking = (names: readonly string[]) => team({ haiku: (packet) => {
  if (contractOf(packet).startsWith("report.story")) return fittingStory(packet);
  return fieldsOf(packet).has("asked_paths") ? ANSWER : ask(names);
} });
const writerCalls = (vendors: ReturnType<typeof team>) => vendors.haiku.requests.filter((request) => contractOf(request.packet).startsWith("report.answer"));

describe("R22 decision 26: what the writer reads", () => {
  it("holds levels 1 to 3 whole, every point on them; deeper digs only as lines with a name, an outcome and where they hang", () => {
    const dossier = built();
    const cards = field(dossier, "follow_ups") as Array<{ level: number; ref: string; rewrite: { dig_paths: Array<{ points: Array<{ text: string }> }> } }>;
    expect(cards.map((card) => card.level)).toEqual([1, 2, 3]);
    for (const card of cards) expect(card.rewrite.dig_paths[0]!.points[0]!.text).toContain(`level ${String(card.level)}`);
    expect(field(dossier, "deeper_paths")).toEqual([
      { ref: "G4.D1", under: "G3.D1", level: 4, line: "Line at level 4.", fate: "HELD_UP" },
      { ref: "G5.D1", under: "G4.D1", level: 5, line: "Line at level 5.", fate: "HELD_UP" },
      { ref: "G6.D1", under: "G5.D1", level: 6, line: "Line at level 6.", fate: "HELD_UP" }
    ]);
    const shared = JSON.stringify(dossierFieldsOf(dossier));
    expect(shared).not.toContain("Point at level 4");
    expect(shared).not.toContain("Quote at level 4");
    expect(dossier.ladderStep).toBe(1);
    expect(dossier.leftOut).toBe(0);
    expect(dossierFieldsOf(dossier).map((entry) => entry.name)).not.toContain("left_out");
    expect(dossier.material.deeper?.names).toEqual(new Set(["G4.D1", "G5.D1", "G6.D1"]));
    // The story may name only the debates in follow_ups.
    expect(dossier.material.index.cardRefs).toEqual(["G1", "G2", "G3"]);
    expect(dossier.material.index.refs.has("G5.D1")).toBe(true);
  });

  it("the person's own view stays in the material from every level, beside its verdict", () => {
    const dossier = built(deepDebate(5, (level) => level === 5 ? { picks: [{ text: "My own worry.", by: "PERSON_OWN_VIEW" }] } : {}));
    expect(field(dossier, "views")).toEqual([{ card: "G5", words: ["My own worry."], marked: "PERSON" }]);
    expect(dossier.material.index.refs.has("G5")).toBe(true);
  });

  it("nothing below level 3: no list, nothing to ask from", () => {
    const dossier = built(deepDebate(3));
    expect(dossierFieldsOf(dossier).map((entry) => entry.name)).not.toContain("deeper_paths");
    expect(dossier.material.deeper).toBeUndefined();
  });

  it("the answer's length grows with the paths in the material, about 300 words to at most 600", () => {
    expect(investigationReportAnswerLength(2)).toBe("about 300 words");
    expect(investigationReportAnswerLength(8)).toBe("about 300 words");
    expect(investigationReportAnswerLength(9)).toBe("about 350 words");
    expect(investigationReportAnswerLength(24)).toBe("about 400 words");
    expect(investigationReportAnswerLength(49)).toBe("about 600 words");
    expect(investigationReportAnswerLength(5000)).toBe("about 600 words");
    // Two first paths and six digs' one path each.
    const length = built().material.answerWriter.find((entry) => entry.name === "answer_length")!.content;
    expect(length).toBe("about 300 words");
    const big = built(investigationInput({ digs: Array.from({ length: 60 }, (_, at) => readyDig({ runId: idOf(1, at), finishedAt: "2026-10-31T10:00:00.000Z",
      rewrite: { ...readyDig().rewrite!, rewriteId: idOf(1, at).replace(/^./u, "9"), digPaths: [{ positionRef: pathOf(1, at), line: `L${String(at)}`, fate: "HELD_UP" }] } })) }));
    expect(big.material.answerWriter.find((entry) => entry.name === "answer_length")!.content).toBe("about 600 words");
  });
});

describe("R22 decision 26: the one ask", () => {
  it("the writer asks by name, gets those paths in full (AI text only), and everyone after it reads what it ended with", async () => {
    const store = memoryReports();
    const vendors = asking(["G5.D1"]);
    expect(await closeInvestigation(settingsOver({ store, vendors, dossier: deepDebate() }), closingOf())).toBe("RECORDED");
    const calls = writerCalls(vendors);
    expect(calls.map((request) => request.callSiteKey)).toEqual(["INVESTIGATION_REPORT:ANSWER:1", "INVESTIGATION_REPORT:ANSWER_ASKED:1"]);
    expect(contractOf(calls[0]!.packet)).toBe("report.answer.v3");
    expect(fieldsOf(calls[0]!.packet).has("asked_paths")).toBe(false);
    const asked = JSON.parse(fieldsOf(calls[1]!.packet).get("asked_paths")!) as Array<Record<string, unknown>>;
    expect(asked).toEqual([{ ref: "G5.D1", line: "Line at level 5.", fate: "HELD_UP", what_changed: ["What level 5 changed."],
      points: [expect.objectContaining({ text: "Point at level 5: winter boats leave half empty.", on: "G5.D1", side: "for" })],
      sources: [expect.objectContaining({ site: "port.example.org", quote: "Quote at level 5.", line: "Note at level 5." })] }]);
    // Everyone after the writer reads it.
    for (const request of [vendors.glm.requests[0]!, vendors.glm.requests[1]!, vendors.haiku.requests.at(-1)!]) {
      expect(fieldsOf(request.packet).get("asked_paths")).toBe(fieldsOf(calls[1]!.packet).get("asked_paths"));
    }
    expect(contractOf(vendors.glm.requests[0]!.packet)).toBe("report.answer-check.v3");
    expect(store.records[0]!.artifactRefs).toContain("artifact-claude-haiku-5-5-1");
    expect(store.records[0]!.answerRounds).toBe(1);
  });

  it("from the cache: on the Anthropic wire every call of the closing opens with the same marked bytes; the asked depth comes after the mark", async () => {
    const vendors = asking(["G5.D1", "G6.D1"]);
    await closeInvestigation(settingsOver({ store: memoryReports(), vendors, dossier: deepDebate() }), closingOf());
    const wire = (request: ProviderCallRequest) => JSON.parse(anthropicMessagesRequestBody({ model: "claude-haiku-5-5", maxTokens: 100, thinkingLevel: "low",
      messages: request.packet.messages, sharedFirstFieldCount: request.sharedFirstFieldCount! })) as
      { system: string; messages: Array<{ content: Array<{ text: string; cache_control?: unknown }> }> };
    const calls = vendors.haiku.requests.map(wire);
    expect(calls.length).toBe(3);
    const marked = calls[0]!.messages[0]!.content[0]!;
    expect(marked.cache_control).toEqual({ type: "ephemeral" });
    for (const call of calls) {
      expect(call.system).toBe(ANTHROPIC_DOSSIER_FIRST_SYSTEM);
      expect(call.messages[0]!.content[0]).toEqual(marked);
    }
    expect(marked.text).not.toContain("Point at level 5");
    expect(calls[1]!.messages[0]!.content[2]!.text).toContain("Point at level 5");
  });

  it("a replay after a crash sends the same bytes and pays nothing twice", async () => {
    const input = deepDebate();
    const dossier = built(input);
    const first = await runAnswer(dossier, Buffer.alloc(32, 1), ["G5.D1"]);
    expect(first.requests.map((request) => request.callSiteKey)).toEqual(["ANSWER_UPDATE:ANSWER:1", "ANSWER_UPDATE:ANSWER_ASKED:1", "ANSWER_UPDATE:ANSWER_CHECK:1"]);
    // The second copy has another closing's random source, and the record: not one vendor call is made.
    const attempts: RecordedAttempt[] = first.requests.map((request, at) => ({ callSiteKey: request.callSiteKey, actorRef: request.providerRef, outcome: "OK",
      ledgerEntryRef: `ledger-${String(at)}`, rawArtifactRef: `artifact-${String(at)}`, thinkingLevel: null,
      promptFingerprint: canonicalPromptFingerprint(request.packet.messages),
      artifact: { rawText: JSON.stringify({ id: "x", model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        choices: [{ message: { content: first.replies[at]! }, finish_reason: "stop" }] }), provider: "openai-compatible-http", modelId: "m", maker: "x", modelVersion: "1", thinkingTokens: null, attempt: 1 } }));
    const book = createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [] });
    const again = await runAnswer(built(input), Buffer.alloc(32, 2), ["G5.D1"], book);
    expect(again.requests).toEqual([]);
    expect(again.written.outcome.outcome).toBe("READY");
    expect(book.pending).toBe(0);
  });

  it("automatic answer updates ask the same way, on their own sites", async () => {
    const { requests, written } = await runAnswer(built(), Buffer.alloc(32, 1), ["G6.D1"]);
    expect(requests[1]!.callSiteKey).toBe("ANSWER_UPDATE:ANSWER_ASKED:1");
    expect(answerUpdateCallSiteRole("ANSWER_UPDATE:ANSWER_ASKED:1")).toBe("SYNTHESIZER");
    expect(answerUpdateCallSiteKey("ANSWER_ASKED", 1)).toBe("ANSWER_UPDATE:ANSWER_ASKED:1");
    expect(investigationReportCallSiteKey("ANSWER_ASKED", 3)).toBe("INVESTIGATION_REPORT:ANSWER_ASKED:3");
    expect(investigationReportCallSiteRole("INVESTIGATION_REPORT:ANSWER_ASKED:3")).toBe("SYNTHESIZER");
    expect(previewThinkingStepOf({ callSiteKey: "INVESTIGATION_REPORT:ANSWER_ASKED:1", lane: "story" })).toBe("answer_writer");
    expect(previewThinkingStepOf({ callSiteKey: "ANSWER_UPDATE:ANSWER_ASKED:1", lane: "story" })).toBe("answer_writer");
    expect(fieldsOf(requests[2]!.packet).has("asked_paths")).toBe(true);
    expect(written.material.deeper).toBeUndefined();
  });

  it("a deeper path holding nothing new: its line alone, one call beyond the ask, nothing more", async () => {
    const input = deepDebate(6, (level) => level === 5 ? { ownMaterial: null,
      rewrite: { ...readyDig().rewrite!, rewriteId: idOf(5).replace(/^./u, "9"), view: null, whatChanged: [], digPaths: [{ positionRef: pathOf(5), line: "Line at level 5.", fate: "HELD_UP" }] } } : {});
    const vendors = asking(["G5.D1"]);
    await closeInvestigation(settingsOver({ store: memoryReports(), vendors, dossier: input }), closingOf());
    const calls = writerCalls(vendors);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(fieldsOf(calls[1]!.packet).get("asked_paths")!)).toEqual([{ ref: "G5.D1", line: "Line at level 5.", fate: "HELD_UP" }]);
    expect(vendors.glm.requests).toHaveLength(2);
  });

  it("the whole ask stays under the guard, however much the asked paths hold: they keep fewer points, and say so", async () => {
    const heavy = Array.from({ length: 80 }, (_, at) => pointOf(`aaaaaaaa-${String(at).padStart(4, "0")}-4000-8000-000000000000`, `${"long ".repeat(400)}${String(at)}`));
    const input = deepDebate(5, (level) => level === 5 ? { ownMaterial: { answer: [], sources: [], paths: [{ positionRef: pathOf(5), statement: "Line at level 5.", points: heavy, extracts: [] }] } } : {});
    const dossier = built(input);
    const material = await dossier.material.deeper!.askFor(["G5.D1"]);
    const asked = JSON.parse(material.answerWriter.find((entry) => entry.name === "asked_paths")!.content) as Array<{ points: unknown[]; points_left_out?: number }>;
    expect(asked[0]!.points.length).toBeLessThan(heavy.length);
    expect(asked[0]!.points_left_out).toBe(heavy.length - asked[0]!.points.length);
  });
});

describe("R22 decision 26: a slip in the ask (salvage in code, the smallest follow-up, a full re-ask)", () => {
  const dossier = built(deepDebate(20));
  const names = dossier.material.deeper!.names;
  const index = dossier.material.index;
  const statusOf = (content: string, askable: ReadonlySet<string> | null) => classifyReportWriterContent(content, index, askable);

  it("more than 10 names: code keeps the first 10, and asks nothing more", async () => {
    const all = deepNames(dossier);
    expect(all.length).toBeGreaterThan(REPORT_ASK_MAX_PATHS);
    expect(statusOf(ask(all), names).parseStatus).toBe("PARSED");
    expect(reportAskSalvaged(all, names)).toEqual(all.slice(0, 10));
    const { requests } = await runAnswer(dossier, Buffer.alloc(32, 1), all);
    expect(requests.filter((request) => /:ANSWER(_ASKED)?:/u.test(request.callSiteKey)).length).toBe(2);
    expect(JSON.parse(fieldsOf(requests[1]!.packet).get("asked_paths")!)).toHaveLength(10);
  });

  it("a name not on the list is dropped by code when another stands; none standing is refused, for the gateway's follow-up", () => {
    const [good] = deepNames(dossier);
    expect(reportAskSalvaged(["G999.D1", good!, good!, "A1"], names)).toEqual([good]);
    expect(statusOf(ask(["G999.D1", good!]), names).parseStatus).toBe("PARSED");
    const refused = statusOf(ask(["G999.D1"]), names);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain(REPORT_REPLY_ISSUES.askNames);
    expect(refused.parseError).toContain("ask_for");
    expect(statusOf(ask([]), names).parseStatus).toBe("SCHEMA_FAILED");
  });

  it("a second ask, and an ask on a revision, are refused; an answer beside an ask is the answer", async () => {
    const [good] = deepNames(dossier);
    const refused = statusOf(ask([good!]), null);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain(REPORT_REPLY_ISSUES.askAgain);
    const both = JSON.stringify({ ...JSON.parse(ANSWER) as object, ask_for: [good] });
    expect(statusOf(both, null).parseStatus).toBe("PARSED");
    // A reply with both is read as the answer: no second call.
    const direct = await runAnswer(dossier, Buffer.alloc(32, 1), null, undefined, both);
    expect(direct.requests.map((request) => request.callSiteKey)).toEqual(["ANSWER_UPDATE:ANSWER:1", "ANSWER_UPDATE:ANSWER_CHECK:1"]);
  });

  it("the writer's asked call that asks again fails that write rather than asking twice", async () => {
    const [good] = deepNames(dossier);
    const { requests, written } = await runAnswer(dossier, Buffer.alloc(32, 1), [good!], undefined, ask([good!]));
    expect(requests.filter((request) => request.callSiteKey === "ANSWER_UPDATE:ANSWER:1")).toHaveLength(1);
    expect(requests.filter((request) => request.callSiteKey === "ANSWER_UPDATE:ANSWER_ASKED:1")).toHaveLength(1);
    expect(written.outcome.outcome).toBe("FAILED");
  });

  it("through the real gateway: a name not on the list gets the smallest follow-up, then the full re-ask, and the writer goes on", async () => {
    const [good] = deepNames(dossier);
    const bodies: string[] = [];
    const replies = [ask(["G999.D1"]), ask(["G888.D1"]), ask([good!]), ANSWER];
    const provider = new OpenAICompatibleProviderGateway({ endpoint: "http://fixture/v1", model: "fixture/model", maker: "fixture",
      fetchImplementation: async (_url, init) => {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ id: `c${String(bodies.length)}`, model: "fixture/model", choices: [{ message: { content: replies.shift() ?? ANSWER }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      },
      sleepImplementation: async () => undefined, persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async () => "ledger", assertNoOpenWriteTransaction: () => undefined });
    const checker = { call: async () => ({ rawArtifactRef: "c", ledgerEntryRef: "l", content: JSON.stringify({ satisfied: true, problem: null, part: null }), provider: "openai-compatible-http" as const, model: "m", maker: "x", modelVersion: "1" }) };
    const written = await writeOverallAnswer({ runId: null as never, subjectItemId: "s", contractHash: "h", maxRounds: 2, later: false,
      writer: { provider, providerRef: "ref-haiku" }, checker: { provider: checker, providerRef: "ref-glm" }, backupCandidates: [], material: dossier.material,
      send: (author, request) => author.provider.call(request), guard: investigationReportGuard, randomBytes: closingRandomBytes(Buffer.alloc(32, 1)), log: () => undefined });
    expect(written.outcome.outcome).toBe("READY");
    // The ask, its follow-up (the writer's own reply handed back, naming the code), the full re-ask, then the asked write.
    expect(bodies).toHaveLength(4);
    expect(bodies[1]).toContain("G999.D1");
    expect(bodies[1]).toContain(REPORT_REPLY_ISSUES.askNames);
    expect(bodies[2]).not.toContain("G888.D1");
    expect(bodies[3]).toContain("asked_paths");
  });

  it("a debate with no list refuses any ask", () => {
    const small = built(deepDebate(2));
    expect(classifyReportWriterContent(ask(["G1.D1"]), small.material.index, small.material.deeper?.names ?? null).parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("R22 decision 27: a version's content stays under the store's line", () => {
  const manyPaths = (count: number) => Array.from({ length: count }, (_, at) => ({ line: `Path ${String(at)}`, summary: null, fate: "HELD_UP" as const, level: at % 5,
    points: [{ text: "p".repeat(3000), trust: "SURE" as const, side: "for" as const, sources: [] }],
    dig: { picks: ["what"], own_words: [], view: null, changed: ["c".repeat(500)] } }));
  const content = (count: number): InvestigationReportContent => ({ v: 1, answer: { segments: ["A."] }, story: null, sources: [], paths: manyPaths(count), shortened: false });

  it("leaves a content that fits as it is", () => {
    const small = content(5);
    expect(fittedReportContent(small)).toBe(small);
  });

  it("over the line, the deepest level's points go first, every path's line stays, and the version says it was shortened", () => {
    const fitted = fittedReportContent(content(300));
    expect(Buffer.byteLength(JSON.stringify(fitted), "utf8")).toBeLessThanOrEqual(700 * 1024);
    expect(fitted.shortened).toBe(true);
    expect(fitted.paths).toHaveLength(300);
    expect(fitted.paths.filter((path) => path.level === 4).every((path) => path.points === undefined)).toBe(true);
    expect(fitted.paths.filter((path) => path.level === 0).every((path) => path.points !== undefined)).toBe(true);
  });

  it("even a tree of whole lines beyond the line is cut, never refused by the store", () => {
    const huge = fittedReportContent(content(1600), 50 * 1024);
    expect(Buffer.byteLength(JSON.stringify(huge), "utf8")).toBeLessThanOrEqual(50 * 1024);
  });
});

/** The overall answer alone, scripted: asks for `names`, then answers (or `then`). */
async function runAnswer(dossier: Dossier, seed: Buffer, names: readonly string[] | null, book?: ReturnType<typeof createReplayBook>, then?: string) {
  const requests: ProviderCallRequest[] = [];
  const replies: string[] = [];
  const reply = (request: ProviderCallRequest): string => {
    if (contractOf(request.packet).startsWith("report.answer-check")) return JSON.stringify({ satisfied: true, problem: null, part: null });
    if (fieldsOf(request.packet).has("asked_paths")) return then ?? ANSWER;
    return names === null ? then ?? ANSWER : ask(names);
  };
  const inner = { call: async (request: ProviderCallRequest) => {
    requests.push(request);
    const content = reply(request);
    replies.push(content);
    return { rawArtifactRef: `artifact-${String(requests.length)}`, ledgerEntryRef: "ledger", content, provider: "openai-compatible-http" as const, model: "m", maker: "x", modelVersion: "1" };
  } };
  const provider = book === undefined ? inner : replayingGateway(book, inner);
  const maker = (providerRef: string): StoryRoleMaker => ({ provider, providerRef });
  const written = await writeOverallAnswer({
    runId: ROOT, subjectItemId: "s", contractHash: "h", maxRounds: 2, later: false, callSiteOf: answerUpdateCallSiteKey,
    writer: maker("ref-haiku"), checker: maker("ref-glm"), backupCandidates: [], material: dossier.material,
    send: (author, request) => author.provider.call(request), guard: investigationReportGuard, randomBytes: closingRandomBytes(seed), log: () => undefined
  });
  return { requests, replies, written };
}
