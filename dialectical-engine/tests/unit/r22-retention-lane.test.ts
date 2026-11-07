// R22 retention and reading lane (plan 2026-10-31 decisions 6, 7, 8, 10, 11, the cross-reply pack and F5). Everything is made up.
// Each case goes through the real gateway with scripted vendors, and looks at what the call records would keep.
import { describe, expect, it } from "vitest";
import { webExtractTextRef, webReplyTextIdOf, webReplyTextRef, type WebSealed } from "@debateai/db";
import { COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT, Judge, PANEL_SOURCES_PROMPT_CONTRACT, WEB_PAGE_NOTE_SENTENCE, WEB_PANEL_EXTRACT_SENTENCE,
  WEB_READ_ALL_INSTRUCTION, WEB_READ_ALL_V2_INSTRUCTION } from "@debateai/judgement";
import {
  ANTHROPIC_DOSSIER_FIRST_SYSTEM, anthropicMessagesRequestBody, assertFramedPrompt, buildFramedPrompt, packetWithPageTexts, packetWithPassageRefs,
  readPromptFrame, withStructureRepair, type PromptPacket, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { PATH_REWRITE_CHECKER_INSTRUCTION, PATH_REWRITE_CHECKER_V2_INSTRUCTION, PATH_REWRITE_WRITER_INSTRUCTION, PATH_REWRITE_WRITER_V2_INSTRUCTION } from "@debateai/story";
import { engineContractHash, ENGINE_SEALED_CONTRACT_IDS } from "../../apps/runner/src/engine-contracts.js";
import { closingRandomBytes } from "../../apps/runner/src/investigation-close.js";
import { holdRunPassages, passageRecordedPacket, passageRecordedRequest, passageRecordingGateway, releaseRunPassages } from "../../apps/runner/src/passage-record.js";
import { createReplayBook, recordedCalls, replayingGateway, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";
import { debateWebPacks, webPackOf, webPackShown, webSourcesText, type WebPack } from "../../apps/runner/src/web-packs.js";
import { reusedOfReadingContent, reusedReadingContent, type WebReusedPage } from "../../apps/runner/src/web-reuse.js";
import { readAllPages, type ReaderOneCall } from "../../apps/runner/src/web-reader-all.js";
import { runWebStep, webStepRowId, type WebStepPorts } from "../../apps/runner/src/web-step.js";
import { membersOf, memoryStore, openedValue, perplexity, recorded, stepInput, team, RUN_ID, CANARY } from "../support/web-step-world.js";

const PASSAGE = `The port's "pier report" said: rents rose \\ by a third in 2030,\nand queues doubled — a long passage nobody may keep on record for good.`;
const REF = webExtractTextRef("11111111-1111-4111-8111-111111111111");

const contract = { contractId: "test.contract.v1", instruction: "Read the material.", answerForm: "Return JSON." };

describe("a passage on record (decision 7, the recorded form)", () => {
  it("is named at every escape level, and the sent form gives back the packet byte for byte", () => {
    const material = [
      { name: "direct", content: PASSAGE },
      { name: "cited_extract", content: JSON.stringify({ id: "S1-1", quote: PASSAGE }) },
      { name: "sources", content: JSON.stringify([{ for: "own_position", extracts: [{ id: "S1-1", quote: PASSAGE }] }]) },
      { name: "nested", content: JSON.stringify({ digest: JSON.stringify({ extract: { quote: PASSAGE } }) }) }
    ];
    const packet = buildFramedPrompt({ contract, material }).packet;
    const texts = new Map([[REF, PASSAGE]]);
    const recordedForm = packetWithPassageRefs(packet, texts);
    expect(JSON.stringify(recordedForm)).not.toContain("pier report");
    expect(JSON.stringify(recordedForm)).not.toContain("rents rose");
    expect(recordedForm.messages[1]!.content.split(REF)).toHaveLength(5);
    expect(packetWithPageTexts(recordedForm, texts)).toEqual(packet);
    assertFramedPrompt(recordedForm);
  });

  it("every prompt of a run holding passages records the name; a run holding none keeps the very same request", () => {
    const runId = "22222222-2222-4222-8222-222222222222";
    const packet = buildFramedPrompt({ contract, material: [{ name: "cited_extract", content: JSON.stringify({ quote: PASSAGE }) }] }).packet;
    const request = { runId, packet, buildRepairPacket: () => packet } as unknown as ProviderCallRequest;
    expect(passageRecordedRequest(request)).toBe(request);
    holdRunPassages(runId, new Map([[REF, PASSAGE]]));
    try {
      const seen = passageRecordedRequest(request);
      expect(JSON.stringify(seen.packet)).not.toContain("rents rose");
      expect(JSON.stringify(seen.buildRepairPacket!({ rawText: "x", parseStatus: "PARSE_FAILED", parseError: "E" }))).not.toContain("rents rose");
      expect(JSON.stringify(seen.vendorPacketOf!(seen.packet))).toBeDefined();
    } finally {
      releaseRunPassages(runId);
    }
    expect(passageRecordedRequest(request)).toBe(request);
  });

  it("a resumed copy replays: new fence, same recorded fingerprint", async () => {
    const runId = "33333333-3333-4333-8333-333333333334";
    holdRunPassages(runId, new Map([[REF, PASSAGE]]));
    try {
      const build = () => buildFramedPrompt({ contract, material: [{ name: "cited_extract", content: JSON.stringify({ quote: PASSAGE }) }] }).packet;
      const [first, second] = [build(), build()];
      expect(first.messages[1]!.content).not.toBe(second.messages[1]!.content);
      const fingerprint = (packet: PromptPacket) => canonicalPromptFingerprint(passageRecordedPacket(runId, packet).messages);
      expect(fingerprint(first)).toBe(fingerprint(second));
      const attempt: RecordedAttempt = { callSiteKey: "JUDGE:x", actorRef: "ref", outcome: "OK", ledgerEntryRef: "l", rawArtifactRef: "a", thinkingLevel: null,
        promptFingerprint: fingerprint(first),
        artifact: { rawText: JSON.stringify({ id: "x", model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), provider: "openai-compatible-http", modelId: "m", maker: "M", modelVersion: null, thinkingTokens: null, attempt: 1 } };
      const book = createReplayBook({ calls: recordedCalls([attempt]), earlierNodes: [] });
      let bought = 0;
      const gateway = replayingGateway(book, { call: async () => { bought += 1; throw new Error("BOUGHT"); } });
      const answer = await gateway.call({ runId, callSiteKey: "JUDGE:x", providerRef: "ref", packet: second } as unknown as ProviderCallRequest);
      expect(bought).toBe(0);
      expect(answer.rawArtifactRef).toBe("a");
    } finally {
      releaseRunPassages(runId);
    }
  });
});

describe("a reader's call (decision 7, the saved reply), killed and claimed again", () => {
  function retained(store: ReturnType<typeof memoryStore>) {
    const replies = new Map<string, string>();
    const quotes = new Map<string, string>();
    const open = (sealed: WebSealed) => openedValue(sealed);
    return { replies, quotes, prepare: async (): Promise<WebStepPorts> => ({ ...(await store.prepare()),
      retention: {
        recordReplyText: async (_run: string, artifactId: string, sealed: WebSealed) => { replies.set(artifactId, open(sealed) as string); return "RECORDED" as const; },
        recordShownQuote: async (_run: string, extractId: string, sealed: WebSealed) => { quotes.set(extractId, (open(sealed) as { quote: string }).quote); return "RECORDED" as const; }
      } }) };
  }

  it("no call record keeps a reply or a passage, the shown quote is written with each extract, and a second copy replays byte for byte", async () => {
    const store = memoryStore();
    const kept = retained(store);
    const first = team();
    const firstSearch = perplexity();
    await runWebStep(stepInput({ members: membersOf(first.all), search: firstSearch.port, prepare: kept.prepare }));

    const readerArtifacts = first.all.flatMap((vendor) => vendor.artifacts).filter((artifact) => webReplyTextIdOf(artifact.rawText) !== null);
    expect(readerArtifacts.length).toBeGreaterThan(2);
    for (const artifact of readerArtifacts) {
      expect(artifact.rawText).toBe(webReplyTextRef(artifact.artifactId));
      expect(artifact.parseError ?? null).toBeNull();
      expect(kept.replies.get(artifact.artifactId)).toContain("\"id\"");
    }
    expect([...kept.replies.values()].some((reply) => reply.includes("extracts"))).toBe(true);
    // The world's vendors copy each page's opening sentence as an extract: it may stand in no call record, prompt or reply.
    const everyRecord = JSON.stringify(first.all.flatMap((vendor) => [...vendor.prompts.map((prompt) => prompt.promptText), ...vendor.artifacts.map((artifact) => artifact.rawText)]));
    expect(everyRecord).not.toContain(CANARY);
    for (const extract of store.extracts.values()) {
      const quote = (openedValue(extract.quote as WebSealed) as { quote: string }).quote;
      expect(everyRecord.includes(JSON.stringify(quote).slice(1, -1))).toBe(false);
      expect([...kept.quotes.values()].some((shown) => shown.replace(/…$/u, "").length <= 120 && quote.replace(/\s+/gu, " ").startsWith(shown.replace(/…$/u, "")))).toBe(true);
    }
    expect(kept.quotes.size).toBe(store.extracts.size);

    // The kill: a fresh copy over the record alone, each named reply swapped back from its store, as readReplayBook does.
    const attempts = recorded(first.all).map((attempt) => { const raw = attempt.artifact?.rawText ?? null; const id = raw === null ? null : webReplyTextIdOf(raw);
      return id === null ? attempt : { ...attempt, artifact: { ...attempt.artifact!, rawText: kept.replies.get(id)! } }; });
    const book = createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [] });
    const again = team();
    const againSearch = perplexity();
    const asked: ProviderCallRequest[] = [];
    const replayed = (gateway: ProviderGateway): ProviderGateway => { const inner = replayingGateway(book, gateway);
      return { call: async (request): Promise<ProviderCallResult> => { asked.push(request); return inner.call(request); } }; };
    const result = await runWebStep(stepInput({ members: membersOf(again.all, replayed), search: againSearch.port, prepare: kept.prepare }));
    expect(result.paths.every((path) => path.status === "SEARCHED")).toBe(true);
    expect(again.all.flatMap((vendor) => vendor.bodies)).toHaveLength(0);
    expect(againSearch.queries).toHaveLength(0);
    const fingerprints = (requests: readonly ProviderCallRequest[]) => requests.map((request) => `${request.providerRef}|${request.callSiteKey}|${canonicalPromptFingerprint(request.packet.messages)}`).sort();
    expect(fingerprints(asked)).toEqual(fingerprints(first.all.flatMap((vendor) => vendor.requests)));
  });

  it("a name with no stored reply reads as no reply: the call is made again, never replayed empty", () => {
    const attempt: RecordedAttempt = { callSiteKey: "WEB:read1:0:0", actorRef: "ref", outcome: "OK", ledgerEntryRef: "l", rawArtifactRef: "a", thinkingLevel: null,
      promptFingerprint: "f", artifact: null };
    const book = createReplayBook({ calls: recordedCalls([attempt]), earlierNodes: [] });
    expect(book.take({ callSiteKey: "WEB:read1:0:0", providerRef: "ref", fingerprint: "f" })).toBeNull();
  });
});

describe("the structure repair of a reader's reply", () => {
  it("names the broken reply in its record, sends it to the vendor, and hands the seam on", async () => {
    const artifact = "44444444-4444-4444-8444-444444444444";
    const seen: ProviderCallRequest[] = [];
    const { ProviderStructureUnrepairedError } = await import("@debateai/providers");
    const broken = `pages: [{"page_id":"p1", "extracts":["${"secret passage ".repeat(4)}"]`;
    const inner: ProviderGateway = { call: async () => { throw new ProviderStructureUnrepairedError({ rawText: broken, parseStatus: "PARSE_FAILED", parseError: "E", failureClass: "STRUCTURE" }, 1,
      artifact, "ledger-1", { provider: "anthropic-messages-http", model: "m", maker: "M", modelVersion: "m", thinkingLevel: "low", reasoningTokens: null } as never, false); } };
    const route: ProviderGateway = { call: async (request) => { seen.push(request); return { content: "{}", rawArtifactRef: "r", ledgerEntryRef: "l" } as unknown as ProviderCallResult; } };
    const gateway = withStructureRepair(inner, { providerRef: "fixer", gateway: route, bound: { tokenCeiling: 100, deadlineMs: 100 } } as never);
    const packet = buildFramedPrompt({ contract, material: [{ name: "pages", content: "[]" }] }).packet;
    await gateway.call({ runId: "r", subjectItemId: "s", callSiteKey: "WEB:read1:0:0", role: "JUDGE", lane: "served", bound: { maxAttempts: 2, tokenCeiling: 100, deadlineMs: 100 },
      contractHash: "h", providerRef: "p", packet, classifyContent: () => ({ parseStatus: "PARSED", parseError: null }),
      replyRecord: { store: async () => "x", refOf: webReplyTextRef } } as ProviderCallRequest).catch(() => undefined);
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(seen[0]!.packet)).not.toContain("secret passage");
    expect(JSON.stringify(seen[0]!.packet)).toContain(webReplyTextRef(artifact));
    expect(JSON.stringify(await seen[0]!.vendorPacketOf!(seen[0]!.packet))).toContain("secret passage");
    expect(seen[0]!.replyRecord).toBeDefined();
  });

  it("an answer turn may be a whole reply's name only", () => {
    const packet = buildFramedPrompt({ contract, material: [{ name: "x", content: "y" }] }).packet;
    const ref = webReplyTextRef("44444444-4444-4444-8444-444444444444");
    const withTurn = { messages: [...packet.messages, { role: "assistant" as const, content: ref }, { role: "user" as const, content: "z" }] };
    const sent = packetWithPageTexts(withTurn, new Map([[ref, "the reply"]]));
    expect(sent.messages[2]!.content).toBe("the reply");
    const inside = { messages: [...packet.messages, { role: "assistant" as const, content: `before ${ref}` }] };
    expect(() => packetWithPageTexts(inside, new Map([[ref, "the reply"]]))).toThrow();
  });
});

describe("later steps read AI text only (decision 6)", () => {
  const page: WebReusedPage = { sourceRunId: RUN_ID, sourcePageId: "p", text: null, grade: 2, line: "A line.", note: "It is a report. It found rents rose. It leaves out buses.",
    lineLanguage: "en", readerOneMaker: "anthropic", topReadings: [], extracts: [{ quote: "short shown words", foundBy: [1] }] };
  it("what a dig carries from an older debate is the note and the short quote, read back the same", () => {
    const content = reusedReadingContent(page);
    expect(content).toMatchObject({ line: "A line.", note: page.note });
    expect(reusedOfReadingContent(content, 2, "anthropic", "text")).toMatchObject({ note: page.note, extracts: page.extracts });
  });
});

describe("the page note (decision 8)", () => {
  it("is the owner's sentence, in a new sealed version; every other word of reader 1's instruction stays", () => {
    expect(WEB_PAGE_NOTE_SENTENCE).toBe("For each page, write up to three sentences in your own words: what it is, what it found, and what it leaves out.");
    expect(WEB_READ_ALL_V2_INSTRUCTION.replace(`${WEB_PAGE_NOTE_SENTENCE} `, "")).toBe(WEB_READ_ALL_INSTRUCTION);
    expect(ENGINE_SEALED_CONTRACT_IDS).toContain("web.read-all.v1");
    expect(ENGINE_SEALED_CONTRACT_IDS).toContain("web.read-all.v2");
  });

  it("reader 1 keeps it; a reply without one still counts as read; a pack carries it to every later AI", async () => {
    const text = "A page about the pier.";
    const call: ReaderOneCall = async (request) => ({ kind: "ANSWERED", maker: "anthropic", rawArtifactRef: "a",
      content: JSON.stringify({ pages: [{ page_id: "p1", grade: 2, adds: "One line.", note: "  It is a report.\nIt found queues.  ", extracts: [] }, { page_id: "p2", grade: 1, adds: "Other.", extracts: [] }] }) , ...(request ? {} : {}) });
    const read = await readAllPages({ answerIndex: 0, question: "Q?", answer: "A.", siteLanguage: "English", topCount: 3, call,
      pages: ["p1", "p2"].map((pageId) => ({ pageId: `${pageId}-store`, title: "T", site: "s.example", date: null, text, textDigest: Buffer.alloc(32, 1) })) });
    expect(read.pages.map((entry) => entry.outcome === "READ" ? entry.note : "NOT")).toEqual(["It is a report. It found queues.", null]);
    const pack = webPackOf({ path_ref: "a1", pages: [{ page_id: "p", rank: 1, title: "T", site: "s", date: null, read_depth: "whole", note: "The note." }],
      extracts: [{ label: "S1-1", page_id: "p", quote: "Q." }] })!;
    expect(webPackShown(pack).pages[0]).toMatchObject({ note: "The note." });
    expect(debateWebPacks([pack])!.citedExtract("S1-1")).toMatchObject({ note: "The note." });
  });
});

describe("the graders (decision 10)", () => {
  it("the panel's variant carries the owner's line and the cited passage; without a citation, the old call to the byte", async () => {
    expect(WEB_PANEL_EXTRACT_SENTENCE).toBe("Each point that names a source shows the passage it cites; judge the point by what that passage actually says.");
    expect(PANEL_SOURCES_PROMPT_CONTRACT.contractId).toBe("judge.panel.length.sources.v1");
    expect(PANEL_SOURCES_PROMPT_CONTRACT.instruction).toContain(WEB_PANEL_EXTRACT_SENTENCE);
    expect(ENGINE_SEALED_CONTRACT_IDS).toContain("judge.panel.length.sources.v1");
    const sent: PromptPacket[] = [];
    const judge = new Judge({ call: async (request) => { sent.push(request.packet); throw new Error("STOP"); } });
    const base = { runId: "r", subjectItemId: "s", callSiteKey: "PANEL:x", questionLine: "Q?", argumentLanguageName: "English", statement: "A point.",
      authorMaker: "M", providerRef: "p", contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 10, deadlineMs: 10 },
      length: { words: 50, languageCode: "en", charactersPerWord: 6 } } as never as Parameters<Judge["assess"]>[0];
    await judge.assess({ ...base, citedExtract: JSON.stringify({ id: "S1-1", quote: "The cited words." }) }).catch(() => undefined);
    await judge.assess(base).catch(() => undefined);
    const [cited, plain] = sent.map((packet) => readPromptFrame(packet));
    expect(cited!.contractId).toBe("judge.panel.length.sources.v1");
    expect(cited!.fields.map((field) => field.name)).toEqual(["question_line", "statement", "cited_extract", "length"]);
    expect(plain!.contractId).toBe("judge.panel.length.v1");
    expect(plain!.fields.map((field) => field.name)).toEqual(["question_line", "statement", "length"]);
    expect(COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT.contractId).toBe("verdict.judge.sources.v1");
  });
});

describe("the rewrite's instructions v2 (decision 11)", () => {
  it("take out \"search words\", every other word stays", () => {
    expect(PATH_REWRITE_WRITER_V2_INSTRUCTION).not.toContain("search words");
    expect(PATH_REWRITE_CHECKER_V2_INSTRUCTION).not.toContain("search words");
    expect(PATH_REWRITE_WRITER_V2_INSTRUCTION).toContain("their own view or their own wording.");
    expect(PATH_REWRITE_CHECKER_V2_INSTRUCTION).toContain("if the person's own view or wording are in the dig");
    expect(PATH_REWRITE_WRITER_INSTRUCTION.replace("their own view, their own wording, or their own search words.", "their own view or their own wording.")).toBe(PATH_REWRITE_WRITER_V2_INSTRUCTION);
    expect(PATH_REWRITE_CHECKER_INSTRUCTION.replace("if the person's own view, wording or search words are in the dig", "if the person's own view or wording are in the dig")).toBe(PATH_REWRITE_CHECKER_V2_INSTRUCTION);
  });
});

describe("the cross-reply's pack", () => {
  const pack: WebPack = { pathRef: "a1", pages: [{ pageId: "p", rank: 1, title: null, site: "s", date: null, readDepth: "whole" }], extracts: [{ label: "S1-1", pageId: "p", quote: "Q." }] };
  it("is shown once when both paths read the same pack; two packs stay two", () => {
    // A dig's map paths read one pick's pack, kept under the pick's own ref.
    const reads = [{ keptUnder: "dig-pick-1", chosen: "The chosen path." }];
    const shared = debateWebPacks([{ ...pack, pathRef: "dig-pick-1" }], [{ pathRef: "a1", reads }, { pathRef: "a2", reads }])!;
    const once = JSON.parse(webSourcesText(shared, [{ pathRef: "a1", for: "own_position" }, { pathRef: "a2", for: "other_makers_position" }])!) as Array<{ for: string }>;
    expect(once.map((entry) => entry.for)).toEqual(["own_position, other_makers_position"]);
    const two = debateWebPacks([pack, { ...pack, pathRef: "a2", extracts: [{ label: "S2-1", pageId: "p", quote: "R." }] }])!;
    const twice = JSON.parse(webSourcesText(two, [{ pathRef: "a1", for: "own_position" }, { pathRef: "a2", for: "other_makers_position" }])!) as Array<{ for: string }>;
    expect(twice.map((entry) => entry.for)).toEqual(["own_position", "other_makers_position"]);
  });
});

describe("F5: the dossier first", () => {
  const dossier = [{ name: "main_question", content: "Q?" }, { name: "paths", content: JSON.stringify(["a long dossier"]) }];
  const body = (contractId: string, tail: string, seed: Buffer, shared = 2) => JSON.parse(anthropicMessagesRequestBody({ model: "claude-haiku-5-5", maxTokens: 100, thinkingLevel: "low",
    messages: buildFramedPrompt({ contract: { contractId, instruction: `Instruction of ${contractId}.`, answerForm: "Return JSON." },
      material: [...dossier, { name: tail, content: tail }], randomBytes: closingRandomBytes(seed) }).packet.messages, sharedFirstFieldCount: shared })) as
      { system: string; messages: Array<{ content: Array<{ text: string; cache_control?: object }> }> };

  it("two steps of one closing start with the same bytes through the marked dossier, their own instruction after it", () => {
    const seed = Buffer.alloc(32, 5);
    const [answer, story] = [body("report.answer.v1", "answer_length", seed), body("report.story.v1", "answer", seed)];
    expect(answer.system).toBe(ANTHROPIC_DOSSIER_FIRST_SYSTEM);
    expect(story.system).toBe(ANTHROPIC_DOSSIER_FIRST_SYSTEM);
    const [one, two] = [answer.messages[0]!.content, story.messages[0]!.content];
    expect(one[0]).toEqual(two[0]);
    expect(one[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(one[1]!.cache_control).toBeUndefined();
    expect(one[1]!.text).toContain("Instruction of report.answer.v1.");
    expect(two[1]!.text).toContain("Instruction of report.story.v1.");
    expect(one[0]!.text).not.toContain("Instruction of");
    expect(one[2]!.text).toContain("answer_length");
    expect(one.length).toBeLessThanOrEqual(4);
  });

  it("two closings never share a cache entry: the marked block holds each closing's own fence", () => {
    const [mine, theirs] = [body("report.answer.v1", "answer_length", Buffer.alloc(32, 5)), body("report.answer.v1", "answer_length", Buffer.alloc(32, 6))];
    expect(mine.messages[0]!.content[0]!.text).not.toBe(theirs.messages[0]!.content[0]!.text);
  });

  it("a packet with nothing to split goes in today's form", () => {
    const today = body("report.answer.v1", "answer_length", Buffer.alloc(32, 5), 3);
    expect(today.system).not.toBe(ANTHROPIC_DOSSIER_FIRST_SYSTEM);
  });

  it("the seal moved with the appended versions", () => {
    expect(engineContractHash()).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("F5: the one fence is never a reason to fail", () => {
  it("material holding the closing's fence refuses that fence, so the fallback in the report's request has something to catch", () => {
    const seed = Buffer.alloc(32, 7);
    const random = closingRandomBytes(seed);
    const fence = buildFramedPrompt({ contract, material: [{ name: "x", content: "y" }], randomBytes: random }).fence;
    expect(() => buildFramedPrompt({ contract, material: [{ name: "x", content: `repeats ${fence}` }], randomBytes: random }))
      .toThrow(expect.objectContaining({ code: "PROMPT_FENCE_UNAVAILABLE" }));
    expect(buildFramedPrompt({ contract, material: [{ name: "x", content: `repeats ${fence}` }] }).fence).not.toBe(fence);
  });
});
