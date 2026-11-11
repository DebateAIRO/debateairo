// tests/unit/web-page-text-gateway.test.ts
// W3-0 (Perplexity plan 2026-10-30; the owner's privacy rows): reader 1 through the real gateway records its prompts by
// page reference only, on every call (its batches and its follow-up), while the vendor reads the texts; the keyed digest
// is an HMAC under the run's secret; a resumed run replays from the reference form and, for a call it must send again,
// rebuilds the sent form from the store; a wiped page refuses the call cleanly. Made-up pages, a scripted vendor.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { webPageTextRef, type CryptoEnvelope } from "@debateai/db";
import {
  OpenAICompatibleProviderGateway, packetWithPageTexts, readPromptFrame,
  type CallPromptRecordInput, type PromptPacket, type ProviderCallRequest, type ProviderLedgerInput, type RawArtifactInput
} from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { readAllPages, type ReaderOneCallRequest, type ReaderOnePage } from "../../apps/runner/src/web-reader-all.js";
import {
  WEB_PAGE_TEXT_CHANGED, WebPageTextWipedError, runWebPageTextDigest, storedWebPageTextsSentForm, webPageTextDigest,
  webPageTextRefsIn, type WebPageTextStore
} from "../../apps/runner/src/web-page-text-gateway.js";
import { createReplayBook, recordedCalls, replayingGateway, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";

const MODEL = "anthropic/haiku-fixture";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const SECRET = Buffer.alloc(32, 9);
/** The run content lease's secret, as it hands it out: a fresh copy each time (the copies are counted and checked). */
const handedOut: Buffer[] = [];
const LEASE = Object.freeze({ databaseAttestationSecret: () => { const copy = Buffer.from(SECRET); handedOut.push(copy); return copy; } });

const CANARY = "The heron counted forty-one river stones before the lantern fair.";
/** A made-up page: its opening sentence (the one the scripted reader copies), then a line only it has, then the canary. */
function page(n: number): ReaderOnePage {
  const pageId = `bbbbbbbb-2222-4222-8222-${String(n).padStart(12, "0")}`;
  const text = `Page ${String(n)} counts ${String(n)} thousand ferry riders. It says "rush hours" run long.\n${CANARY} Line ${String(n)}.`;
  return Object.freeze({ pageId, title: `Ferry note ${String(n)}`, site: `site${String(n)}.example`, date: null, text,
    textDigest: runWebPageTextDigest(LEASE, pageId, text) });
}
const PAGES = [page(1), page(2), page(3)];
const opening = (text: string): string => text.slice(0, text.indexOf(".") + 1);

/** The pages a sent body carries (reader 1's `pages` field). */
function sentPages(body: string): Array<{ page_id: string; text: string }> {
  const messages = (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages;
  const field = readPromptFrame({ messages }).fields.find((entry) => entry.name === "pages")!;
  return JSON.parse(field.content) as Array<{ page_id: string; text: string }>;
}

/** The real gateway with a scripted vendor that reads the pages it was SENT (it leaves out `skip` on its first call). */
function haiku(skip: readonly string[] = []) {
  const bodies: string[] = [];
  const prompts: CallPromptRecordInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const artifacts: RawArtifactInput[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "Anthropic",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      const shown = sentPages(String(init?.body)).filter((entry) => bodies.length > 1 || !skip.includes(entry.page_id));
      const content = JSON.stringify({ pages: shown.map((entry) => ({
        page_id: entry.page_id, grade: 2, adds: "It counts riders.", extracts: [opening(entry.text)] })) });
      return new Response(JSON.stringify({ id: `call-${String(bodies.length)}`, model: MODEL,
        choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    persistCallPrompt: async (prompt) => { prompts.push(prompt); },
    assertNoOpenWriteTransaction: () => undefined
  });
  const record = (): string => JSON.stringify({ prompts, ledger, artifacts });
  return { gateway, bodies, prompts, ledger, artifacts, record };
}

/** Reader 1's call port over a gateway, as W3-1 wires it: record `packet`, send through `vendorPacketOf`, under 100K. */
function port(gateway: { call: (request: ProviderCallRequest) => Promise<{ content: string; maker: string; rawArtifactRef: string }> },
  options: Readonly<{ vendorPacketOf?: ProviderCallRequest["vendorPacketOf"]; seen?: ReaderOneCallRequest[] }> = {}) {
  return async (request: ReaderOneCallRequest) => {
    options.seen?.push(request);
    const result = await gateway.call({ runId: RUN_ID, subjectItemId: "path:0", callSiteKey: request.callSiteKey, role: "JUDGE",
      lane: "served", bound: { maxAttempts: 2, tokenCeiling: 4_096, deadlineMs: 60_000 }, contractHash: request.contractId,
      providerRef: "preview:haiku", packet: request.packet, vendorPacketOf: options.vendorPacketOf ?? request.vendorPacketOf,
      sentInputTokensBelow: 100_000, classifyContent: request.classifyContent });
    return { kind: "ANSWERED" as const, content: result.content, maker: result.maker, rawArtifactRef: result.rawArtifactRef };
  };
}
const readPath = (call: ReturnType<typeof port>) => readAllPages({ answerIndex: 0, question: "Should Harbour Town build a second pier?",
  answer: "Yes: it would cut the queues.", siteLanguage: "English", topCount: 3, pages: PAGES, call });

/** The store (0132's read, `PostgresWebEvidenceRepository.readPageTexts`): the texts sealed by page id; `wiped` are gone. */
function store(wiped: readonly string[] = [], changed: readonly string[] = []) {
  const reads: string[][] = [];
  const sealed = (text: string): CryptoEnvelope => ({ sealedFixture: Buffer.from(text, "utf8").toString("base64") }) as unknown as CryptoEnvelope;
  const port: WebPageTextStore = { readPageTexts: async (runId, pageIds) => {
    expect(runId).toBe(RUN_ID);
    reads.push([...pageIds]);
    return PAGES.filter((entry) => pageIds.includes(entry.pageId) && !wiped.includes(entry.pageId)).map((entry) => ({
      pageId: entry.pageId, textDigest: entry.textDigest,
      envelope: sealed(changed.includes(entry.pageId) ? `${entry.text} (edited)` : entry.text) }));
  } };
  const openText = (_pageId: string, envelope: CryptoEnvelope): string =>
    Buffer.from((envelope as unknown as { sealedFixture: string }).sealedFixture, "base64").toString("utf8");
  return { port, reads, sentForm: storedWebPageTextsSentForm({ runId: RUN_ID, store: port, openText, lease: LEASE }) };
}

/** A run's recorded attempts, as run-replay.ts reads them back (ledger order, each prompt's fingerprint, each reply). */
function recorded(run: ReturnType<typeof haiku>): RecordedAttempt[] {
  return run.ledger.map((entry) => {
    const prompt = run.prompts.find((candidate) => candidate.attemptId === entry.attemptId) ?? null;
    const artifact = run.artifacts.find((candidate) => candidate.artifactId === entry.rawArtifactRef) ?? null;
    return { callSiteKey: entry.callSiteKey, actorRef: entry.actorRef, outcome: entry.outcome, ledgerEntryRef: entry.attemptId,
      rawArtifactRef: entry.rawArtifactRef, thinkingLevel: entry.thinkingLevel ?? null,
      promptFingerprint: prompt === null ? null : canonicalPromptFingerprint(prompt.messages),
      artifact: artifact === null ? null : { rawText: artifact.rawText, provider: artifact.provider, modelId: artifact.model,
        maker: artifact.maker, modelVersion: artifact.modelVersion, thinkingTokens: artifact.thinkingTokens ?? null,
        attempt: (artifact.metadata as { attempt?: number }).attempt ?? null } };
  });
}

describe("W3-0 the keyed digest of a page's text", () => {
  it("is an HMAC under the run's secret, never a plain hash, and the secret's copy is wiped", () => {
    const text = PAGES[0]!.text;
    const digest = webPageTextDigest(SECRET, PAGES[0]!.pageId, text);
    expect(digest).toHaveLength(32);
    expect(digest.equals(createHash("sha256").update(text, "utf8").digest())).toBe(false);
    expect(digest.equals(webPageTextDigest(Buffer.alloc(32, 8), PAGES[0]!.pageId, text))).toBe(false);
    expect(digest.equals(webPageTextDigest(SECRET, PAGES[1]!.pageId, text))).toBe(false);
    handedOut.length = 0;
    expect(runWebPageTextDigest(LEASE, PAGES[0]!.pageId, text).equals(digest)).toBe(true);
    expect(handedOut).toHaveLength(1);
    expect(handedOut[0]!.equals(Buffer.alloc(32))).toBe(true);
    expect(() => webPageTextDigest(Buffer.alloc(16), "p", "t")).toThrowError(new TypeError("WEB_PAGE_TEXT_DIGEST_KEY_INVALID"));
  });
});

describe("W3-0 reader 1 through the gateway", () => {
  it("records every call by page reference (its batch and its follow-up); the vendor reads the texts", async () => {
    const run = haiku(["p2"]);
    const result = await readPath(port(run.gateway));
    // The follow-up carried only the page left out.
    expect(run.bodies.map((body) => sentPages(body).map((entry) => entry.page_id))).toEqual([["p1", "p2", "p3"], ["p2"]]);
    // The vendor read the texts: each extract it copied from the body sent is found word for word on the stored page.
    expect(result.pages.map((entry) => entry.outcome === "READ" ? entry.extracts.length : 0)).toEqual([1, 1, 1]);
    for (const body of run.bodies) expect(body).toContain(CANARY);
    expect(run.prompts).toHaveLength(2);
    expect(run.record()).not.toContain(CANARY);
    expect(run.record()).not.toContain("rush hours");
    for (const entry of PAGES) expect(run.prompts[0]!.promptText).toContain(webPageTextRef(entry.pageId, entry.textDigest));
  });

  it("reader 1's own sent form is the one the store rebuilds, byte for byte", async () => {
    const seen: ReaderOneCallRequest[] = [];
    await readPath(port(haiku().gateway, { seen }));
    const from = store();
    expect(webPageTextRefsIn(seen[0]!.packet).map((found) => found.pageId)).toEqual(PAGES.map((entry) => entry.pageId));
    expect(await from.sentForm(seen[0]!.packet)).toEqual(seen[0]!.vendorPacketOf(seen[0]!.packet));
    expect(from.reads).toEqual([PAGES.map((entry) => entry.pageId)]);
    const texts = new Map(PAGES.map((entry) => [webPageTextRef(entry.pageId, entry.textDigest), entry.text]));
    expect(packetWithPageTexts(seen[0]!.packet, texts)).toEqual(seen[0]!.vendorPacketOf(seen[0]!.packet));
  });
});

describe("W3-0 after a restart", () => {
  it("a recorded call is replayed from its reference form: no vendor, no store read, the same reading", async () => {
    const first = haiku();
    const before = await readPath(port(first.gateway));
    const book = createReplayBook({ calls: recordedCalls(recorded(first)), earlierNodes: [] });
    const again = haiku();
    const from = store();
    const after = await readPath(port(replayingGateway(book, again.gateway), { vendorPacketOf: from.sentForm }));
    expect(again.bodies).toHaveLength(0);
    expect(from.reads).toHaveLength(0);
    expect(after.pages).toEqual(before.pages);
  });

  it("a call made again rebuilds its sent form from the store; its record still holds no page text", async () => {
    const again = haiku();
    const from = store();
    const result = await readPath(port(replayingGateway(createReplayBook({ calls: [], earlierNodes: [] }), again.gateway),
      { vendorPacketOf: from.sentForm }));
    expect(from.reads).toEqual([PAGES.map((entry) => entry.pageId)]);
    expect(again.bodies).toHaveLength(1);
    expect(again.bodies[0]).toContain(CANARY);
    expect(again.record()).not.toContain(CANARY);
    expect(result.pages.every((entry) => entry.outcome === "READ")).toBe(true);
  });

  it("a page whose text was wiped refuses the call cleanly, naming the page: nothing sent, nothing recorded", async () => {
    const seen: ReaderOneCallRequest[] = [];
    await readPath(port(haiku().gateway, { seen }));
    const again = haiku();
    const from = store([PAGES[1]!.pageId]);
    const error = await port(again.gateway, { vendorPacketOf: from.sentForm })(seen[0]!).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WebPageTextWipedError);
    expect((error as WebPageTextWipedError).pageIds).toEqual([PAGES[1]!.pageId]);
    expect(String((error as Error).message)).not.toContain(CANARY);
    expect({ bodies: again.bodies, prompts: again.prompts, ledger: again.ledger }).toEqual({ bodies: [], prompts: [], ledger: [] });
  });

  it("a stored text that no longer matches its reference refuses the call", async () => {
    const seen: ReaderOneCallRequest[] = [];
    await readPath(port(haiku().gateway, { seen }));
    const again = haiku();
    await expect(port(again.gateway, { vendorPacketOf: store([], [PAGES[2]!.pageId]).sentForm })(seen[0]!))
      .rejects.toMatchObject({ code: WEB_PAGE_TEXT_CHANGED });
    expect(again.bodies).toHaveLength(0);
  });
});
