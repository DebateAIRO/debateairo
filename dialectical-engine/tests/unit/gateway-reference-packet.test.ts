// tests/unit/gateway-reference-packet.test.ts
// W3-0 (Perplexity plan 2026-10-30; the owner's privacy rows): a call carries the RECORDED form of its prompt (each web
// page named by its reference) and a function that makes the SENT form (the page texts in). The call record keeps only
// the recorded form, on every attempt kind; the vendor gets the texts; the guards measure the sent form; the sent form
// is never held in an error. Made-up pages, a scripted vendor, never a real call.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { webPageTextRef } from "@debateai/db";
import { classifyStructuredArtifact } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway, PROVIDER_CONTEXT_WINDOW_EXCEEDED, PROVIDER_PAGE_TEXT_UNPLACED, PROVIDER_SENT_FORM_INVALID,
  PROVIDER_SENT_INPUT_OVER_LIMIT, ProviderCallFailedError, ProviderStructureUnrepairedError, buildFramedPrompt, buildFramedRepairPrompt, estimateWindowTokens,
  packetWithPageTexts, readPromptFrame, schemaFailureLocator, withStructureRepair,
  type CallPromptRecordInput, type OpenAICompatibleGatewayOptions, type PromptPacket, type ProviderCallRequest,
  type ProviderLedgerInput, type RawArtifactInput
} from "@debateai/providers";

const MODEL = "fixture/model";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
/** The sentence only the page holds: it must reach the vendor and never the record. */
const CANARY = "The heron counted forty-one river stones before the lantern fair.";
const PAGES = [
  { pageId: "aaaaaaaa-1111-4111-8111-000000000001",
    text: `${CANARY} The pier "opened" in May.\nA second line, with a \\ backslash and a tab\there. ${"The queue ran long. ".repeat(40)}` },
  { pageId: "aaaaaaaa-1111-4111-8111-000000000002", text: "Ferries ran at dawn; the timetable says “seven”." }
] as const;
const REFS = PAGES.map((page, index) => webPageTextRef(page.pageId, Buffer.alloc(32, index + 1)));
const TEXTS: ReadonlyMap<string, string> = new Map(REFS.map((ref, index) => [ref, PAGES[index]!.text]));
const CONTRACT = Object.freeze({ contractId: "test.web-reference.v1", instruction: "Read the pages and answer the question.",
  answerForm: "Return only JSON {\"answer\": string, \"score\": number}." });
const material = (texts: readonly string[]) => [
  { name: "question", content: "Is the second pier worth it?" },
  { name: "pages", content: JSON.stringify(texts.map((text, index) => ({ page_id: `p${String(index + 1)}`, text }))) }
];
const FRAMED = buildFramedPrompt({ contract: CONTRACT, material: material(REFS) });

const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
const GOOD = "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}";
const BROKEN = "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}";

type Reply = string | { content: string; finish?: string } | { status: number };
function harness(replies: Reply[], extra: Partial<OpenAICompatibleGatewayOptions> = {}) {
  const bodies: string[] = [];
  const prompts: CallPromptRecordInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const artifacts: RawArtifactInput[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      const next = replies.shift() ?? { status: 599 };
      if (typeof next === "object" && "status" in next) return new Response("upstream down", { status: next.status });
      const { content, finish } = typeof next === "string" ? { content: next, finish: "stop" } : { finish: "stop", ...next };
      return new Response(JSON.stringify({ id: `call-${String(bodies.length)}`, model: MODEL,
        choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${String(ledger.length)}`; },
    persistCallPrompt: async (prompt) => { prompts.push(prompt); },
    assertNoOpenWriteTransaction: () => undefined,
    ...extra
  });
  /** Everything the call record of this gateway holds: prompts, ledger rows, artifacts. */
  const record = (): string => JSON.stringify({ prompts, ledger, artifacts });
  const sent = (): PromptPacket["messages"][] => bodies.map((body) => (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages);
  return { gateway, bodies, prompts, ledger, artifacts, record, sent };
}

/** The sent-form maker the tests hand the gateway, counting the packets it was asked for. */
function vendor(texts: ReadonlyMap<string, string> = TEXTS) {
  const asked: PromptPacket[] = [];
  const vendorPacketOf = (recorded: PromptPacket): PromptPacket => { asked.push(recorded); return packetWithPageTexts(recorded, texts); };
  return { vendorPacketOf, asked };
}

function request(extra: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return { runId: RUN_ID, subjectItemId: "node:web", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 5_000 }, contractHash: "contract:web", providerRef: "provider:web",
    packet: FRAMED.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(FRAMED, schemaFailureLocator(rejected)),
    ...extra };
}

const thrown = (run: () => unknown): unknown => { try { run(); } catch (error) { return error; } return null; };

/** The record holds every page by its reference and no page text; every body sent holds the texts. */
function expectRecordedRefsSentTexts(run: ReturnType<typeof harness>, posts: number): void {
  expect(run.bodies).toHaveLength(posts);
  expect(run.prompts).toHaveLength(posts);
  expect(run.record()).not.toContain(CANARY);
  expect(run.record()).not.toContain("heron");
  for (const prompt of run.prompts) for (const ref of REFS) expect(prompt.promptText).toContain(ref);
  for (const body of run.bodies) {
    expect(body).toContain(CANARY);
    for (const ref of REFS) expect(body).not.toContain(ref);
  }
}

describe("W3-0 packetWithPageTexts: the sent form", () => {
  it("is the frame built over the texts, byte for byte, when the frame was built over the references", () => {
    const same = (size: number) => Buffer.alloc(size, 7);
    const overRefs = buildFramedPrompt({ contract: CONTRACT, material: material(REFS), randomBytes: same });
    const overTexts = buildFramedPrompt({ contract: CONTRACT, material: material(PAGES.map((page) => page.text)), randomBytes: same });
    expect(packetWithPageTexts(overRefs.packet, TEXTS)).toEqual(overTexts.packet);
    // The door reads the texts back exactly.
    const pages = JSON.parse(readPromptFrame(packetWithPageTexts(overRefs.packet, TEXTS)).fields[1]!.content) as { text: string }[];
    expect(pages.map((page) => page.text)).toEqual(PAGES.map((page) => page.text));
  });

  it("fills a reference at any escape level, and returns a packet holding none as it is", () => {
    const nested = buildFramedPrompt({ contract: CONTRACT, material: [{ name: "pages", content: JSON.stringify({ inner: JSON.stringify([REFS[0]]) }) }] });
    const filled = packetWithPageTexts(nested.packet, TEXTS);
    const pages = readPromptFrame(filled).fields[0]!.content;
    expect(JSON.parse((JSON.parse(pages) as { inner: string }).inner)).toEqual([PAGES[0].text]);
    const plain = buildFramedPrompt({ contract: CONTRACT, material: [{ name: "question", content: "No pages here." }] }).packet;
    expect(packetWithPageTexts(plain, TEXTS)).toBe(plain);
  });

  it("refuses a reference outside a material block or not standing as a whole text", () => {
    const loose = buildFramedPrompt({ contract: CONTRACT, material: [{ name: "pages", content: `see ${REFS[0]!} here` }] }).packet;
    expect(thrown(() => packetWithPageTexts(loose, TEXTS))).toMatchObject({ code: PROVIDER_PAGE_TEXT_UNPLACED });
    const inAnswer = { messages: [...FRAMED.packet.messages, { role: "assistant" as const, content: JSON.stringify(REFS[0]) }] };
    expect(thrown(() => packetWithPageTexts(inAnswer, TEXTS))).toMatchObject({ code: PROVIDER_PAGE_TEXT_UNPLACED });
    expect(() => packetWithPageTexts(FRAMED.packet, new Map([["bad\"ref", "x"]]))).toThrowError(new TypeError("PROVIDER_PAGE_TEXT_REF_INVALID"));
  });
});

describe("W3-0 the gateway records the reference form and sends the texts, on every attempt kind", () => {
  it("the original attempt: the prompt record is the packet as given; the body has the texts", async () => {
    const run = harness([GOOD]);
    const sentForm = vendor();
    const result = await run.gateway.call(request({ vendorPacketOf: sentForm.vendorPacketOf }));
    expect(result.content).toBe(GOOD);
    expectRecordedRefsSentTexts(run, 1);
    expect(run.prompts[0]!.promptText).toBe(JSON.stringify(FRAMED.packet.messages));
    expect(run.sent()[0]).toEqual(packetWithPageTexts(FRAMED.packet, TEXTS).messages);
    // Made once, for the one attempt, from the recorded packet.
    expect(sentForm.asked).toEqual([FRAMED.packet]);
  });

  it("the patch follow-up: both attempts recorded by reference, both sent with the texts", async () => {
    const run = harness(["{\"answer\": \"It is so\"}", "{\"score\": 0.4}"]);
    const sentForm = vendor();
    const result = await run.gateway.call(request({ vendorPacketOf: sentForm.vendorPacketOf }));
    expect(result.repairForm).toBe("PATCH");
    expectRecordedRefsSentTexts(run, 2);
    expect(run.artifacts.map((artifact) => artifact.replyForm)).toEqual(["ORIGINAL", "PATCH"]);
  });

  it("the full re-ask: recorded by reference, sent with the texts", async () => {
    const run = harness([BROKEN, GOOD]);
    const result = await run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf }));
    expect(result.repairForm).toBe("FULL");
    expectRecordedRefsSentTexts(run, 2);
  });

  it("the length retry: recorded by reference, sent with the texts", async () => {
    const run = harness([{ content: "{\"answer\": \"It is", finish: "length" }, GOOD]);
    await run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf }));
    expectRecordedRefsSentTexts(run, 2);
    expect(run.artifacts.map((artifact) => artifact.replyForm)).toEqual(["ORIGINAL", "LENGTH_RETRY"]);
  });

  it("the structure repair: the repair call's record holds no page text, nor does the original's", async () => {
    const original = harness([BROKEN]);
    const repair = harness([GOOD]);
    const route = { providerRef: "provider:repair", gateway: repair.gateway, bound: { tokenCeiling: 512, deadlineMs: 5_000 } };
    const result = await withStructureRepair(original.gateway, route).call(request({ vendorPacketOf: vendor().vendorPacketOf }));
    expect(result.repairForm).toBe("STRUCTURE");
    expectRecordedRefsSentTexts(original, 1);
    expect(repair.bodies).toHaveLength(1);
    expect(repair.record()).not.toContain(CANARY);
    expect(repair.bodies[0]).not.toContain(CANARY);
  });

  it("the structure repair's follow-up to the original AI (B): recorded by reference, sent with the texts", async () => {
    const original = harness([BROKEN, GOOD]);
    const routed = request({ vendorPacketOf: vendor().vendorPacketOf, structureRepairRouted: true });
    const unrepaired = await original.gateway.call(routed).catch((caught: unknown) => caught);
    expect(unrepaired).toBeInstanceOf(ProviderStructureUnrepairedError);
    const first = unrepaired as ProviderStructureUnrepairedError;
    const result = await original.gateway.call({ ...routed, structureFollowUp: { form: "FULL", first: {
      rejected: first.rejected, rawArtifactRef: first.lastRawArtifactRef, ledgerEntryRef: first.lastLedgerEntryRef,
      materialMarked: first.materialMarked } } });
    expect(result).toMatchObject({ content: GOOD, repairForm: "FULL" });
    expectRecordedRefsSentTexts(original, 2);
    expect(JSON.stringify(first)).not.toContain(CANARY);
  });

  it("without vendorPacketOf the recorded packet is what is sent, as before", async () => {
    const run = harness([GOOD]);
    await run.gateway.call(request());
    expect(run.sent()[0]).toEqual(FRAMED.packet.messages);
    expect(run.prompts[0]!.promptText).toBe(JSON.stringify(run.sent()[0]));
  });
});

describe("W3-0 the guards measure the SENT form", () => {
  const recordedBytes = Buffer.byteLength(JSON.stringify(FRAMED.packet.messages), "utf8");
  const sentBytes = Buffer.byteLength(JSON.stringify(packetWithPageTexts(FRAMED.packet, TEXTS).messages), "utf8");
  const recordedTokens = estimateWindowTokens(FRAMED.packet.messages);
  const sentTokens = estimateWindowTokens(packetWithPageTexts(FRAMED.packet, TEXTS).messages);

  it("the measures differ: the texts are longer than their references", () => {
    expect(sentBytes).toBeGreaterThan(recordedBytes);
    expect(sentTokens).toBeGreaterThan(recordedTokens);
  });

  it("the request byte cap", async () => {
    const run = harness([GOOD]);
    // The recorded body would fit; the sent body does not.
    const cap = recordedBytes + 200;
    expect(sentBytes + 200).toBeGreaterThan(cap);
    const error = await run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, packetByteCap: cap, bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 } }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderCallFailedError);
    expect(run.bodies).toHaveLength(0);
    expect(run.record()).not.toContain(CANARY);
    expect(JSON.stringify(error) + String((error as Error).message) + String((error as Error).stack)).not.toContain(CANARY);
  });

  it("the declared window", async () => {
    const run = harness([GOOD], { contextWindowTokens: recordedTokens + 64 + 1 });
    expect(sentTokens + 64).toBeGreaterThan(recordedTokens + 64 + 1);
    await expect(run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 } })))
      .rejects.toMatchObject({ code: PROVIDER_CONTEXT_WINDOW_EXCEEDED });
    expect(run.bodies).toHaveLength(0);
  });

  it("the call's input line (Haiku's 100K): refused before anything is sent or recorded", async () => {
    const run = harness([GOOD]);
    const line = recordedTokens + 1;
    expect(sentTokens).toBeGreaterThanOrEqual(line);
    await expect(run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, sentInputTokensBelow: line })))
      .rejects.toMatchObject({ code: PROVIDER_SENT_INPUT_OVER_LIMIT });
    expect({ bodies: run.bodies, prompts: run.prompts, ledger: run.ledger }).toEqual({ bodies: [], prompts: [], ledger: [] });
    // Under the line the same call goes out.
    const under = harness([GOOD]);
    await under.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, sentInputTokensBelow: sentTokens + 1 }));
    expect(under.bodies).toHaveLength(1);
  });

  it("the money projection is the sent body's bytes", async () => {
    const run = harness([GOOD]);
    const projected: number[] = [];
    await run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, costEnvelope: {
      assertCallAllowed: (projection) => { projected.push(projection.requestBytes); },
      recordCall: () => undefined, assertUsageReported: () => undefined } }));
    expect(projected).toEqual([Buffer.byteLength(run.bodies[0]!, "utf8")]);
    expect(projected[0]!).toBeGreaterThan(recordedBytes);
  });
});

describe("W3-0 the sent form is checked, and never held", () => {
  it("a transport failure's error and rows hold no page text", async () => {
    const run = harness([{ status: 502 }, { status: 502 }]);
    const error = await run.gateway.call(request({ vendorPacketOf: vendor().vendorPacketOf, bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 } }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderCallFailedError);
    expect(run.bodies.every((body) => body.includes(CANARY))).toBe(true);
    expect(run.record()).not.toContain(CANARY);
    const cause = (error as { cause?: unknown }).cause;
    expect(`${JSON.stringify(error)} ${String((error as Error).stack)} ${String(cause)} ${JSON.stringify(cause ?? null)}`).not.toContain(CANARY);
  });

  it("a sent form that changes anything but material is refused before anything is sent", async () => {
    const run = harness([GOOD]);
    const changed = (recorded: PromptPacket): PromptPacket => ({ messages: recorded.messages.map((message, index) =>
      index === 0 ? { role: message.role, content: `${message.content} ` } : message) });
    await expect(run.gateway.call(request({ vendorPacketOf: changed }))).rejects.toMatchObject({ code: PROVIDER_SENT_FORM_INVALID });
    const fewer = (recorded: PromptPacket): PromptPacket => ({ messages: recorded.messages.slice(0, 1) });
    await expect(run.gateway.call(request({ vendorPacketOf: fewer }))).rejects.toMatchObject({ code: PROVIDER_SENT_FORM_INVALID });
    expect({ bodies: run.bodies, prompts: run.prompts, ledger: run.ledger }).toEqual({ bodies: [], prompts: [], ledger: [] });
  });

  it("a page text that would forge the fence is refused by the door, before anything is sent", async () => {
    const run = harness([GOOD]);
    const fence = readPromptFrame(FRAMED.packet).fence;
    const forged = new Map([[REFS[0]!, `${CANARY} ${fence}`], [REFS[1]!, "x"]]);
    await expect(run.gateway.call(request({ vendorPacketOf: vendor(forged).vendorPacketOf })))
      .rejects.toMatchObject({ code: "PROMPT_FRAME_FENCE_FORGED" });
    expect(run.bodies).toHaveLength(0);
  });

  it("a sent-form maker that refuses (a wiped page) refuses the call cleanly: nothing sent, nothing recorded", async () => {
    const run = harness([GOOD]);
    const wiped = new TypedDomainError("WEB_PAGE_TEXT_WIPED", "gone");
    await expect(run.gateway.call(request({ vendorPacketOf: async () => { throw wiped; } }))).rejects.toBe(wiped);
    expect({ bodies: run.bodies, prompts: run.prompts, ledger: run.ledger }).toEqual({ bodies: [], prompts: [], ledger: [] });
  });

  it("refuses a malformed vendorPacketOf or input line before anything is sent", async () => {
    const run = harness([GOOD]);
    await expect(run.gateway.call(request({ vendorPacketOf: "no" as never }))).rejects.toThrowError(TypeError);
    await expect(run.gateway.call(request({ sentInputTokensBelow: 0 }))).rejects.toThrowError(TypeError);
    expect(run.bodies).toHaveLength(0);
  });
});
