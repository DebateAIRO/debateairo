import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTENT_CIPHERTEXT_SENTINEL, PostgresInvestigationRepository, PostgresPassageRetentionRepository, PostgresWebEvidenceRepository, WEB_EVIDENCE_CARRIERS, WEB_REPLY_TEXT_CARRIER,
  WEB_SHOWN_QUOTE_CARRIER, decryptContentForRun, decryptLeasedContentForRun, encryptAttestedLeasedContentForRun, prepareLeasedContentEncryptionForRun,
  webExtractTextRef, webReplyTextRef, withRunContentLease, type WebSealed
} from "@debateai/db";
import { addressKey } from "../../packages/evidence/src/host-filter.js";
import { buildFramedPrompt, type ContentClassification, type PromptContract, type ProviderCallRequest, type ProviderReplyRecord } from "@debateai/providers";
import { createPostgresProviderGateway } from "../../apps/runner/src/index.js";
import { holdRunPassages, releaseRunPassages } from "../../apps/runner/src/passage-record.js";
import { sweepPassages, wipeDebatePassages, wipeInvestigationPassages } from "../../apps/runner/src/passage-sweep.js";
import { digPathsForStore, postgresPathRewriteSources, storedDigPathsOf } from "../../apps/runner/src/path-rewrite-sources.js";
import { readReplayBook, replayingGateway } from "../../apps/runner/src/run-replay.js";
import { postgresWebReuseSource, reusedReadingContent } from "../../apps/runner/src/web-reuse.js";
import { webStepRowId } from "../../apps/runner/src/web-step.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

/**
 * R22 decisions 6 and 7 on real PostgreSQL, with the real cipher and the real recording gateway: a reader's reply and a prompt's
 * passage stay out of the call records; a run killed and claimed again replays byte for byte while it runs; once nothing runs,
 * the sweep takes the passages and the quote and note stay; a later read gets only those. Everything is made up.
 */
let fixture: ContentRunFixture;
const db = () => fixture.database.pool;
beforeAll(async () => { fixture = await startContentRunFixture("r22-retention"); }, 180_000);
afterAll(async () => { await fixture?.stop(); });

const PASSAGE = "The harbour report found that queues doubled in the two years after the bridge opened, and that rents along the quay rose by a third, which nobody had forecast when the pier was planned.";
const CONTRACT: PromptContract = Object.freeze({ contractId: "test.retention.v1", instruction: "Read the material.", answerForm: 'Return only one JSON object {"verdict": "yes" | "no"}.' });
const ANSWER = JSON.stringify({ verdict: "yes", copied: PASSAGE });
const classify = (content: string): ContentClassification => (JSON.parse(content) as { verdict?: unknown }).verdict === "yes"
  ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "SCHEMA_FAILED", parseError: PASSAGE };
const vendorReply = (content: string) => new Response(JSON.stringify({ id: "chat-1", model: "vendor/model-1",
  usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] }),
{ status: 200, headers: { "content-type": "application/json" } });
const WORK = "work-item:retention";
const request = (runId: string, extra: Partial<ProviderCallRequest>, material = [{ name: "question_line", content: "Should the pier stay?" }]): ProviderCallRequest => ({
  runId, subjectItemId: WORK, callSiteKey: "JUDGE:seat:main", role: "JUDGE", lane: "served", bound: { maxAttempts: 2, tokenCeiling: 400, deadlineMs: 5_000 },
  contractHash: "contract:retention", providerRef: "vendor:ref", packet: buildFramedPrompt({ contract: CONTRACT, material }).packet, classifyContent: classify, ...extra });
function gatewayCounting(answer = ANSWER) {
  const sent: string[] = [];
  return { sent, gateway: createPostgresProviderGateway(db(), { endpoint: "http://127.0.0.1:9/v1", model: "vendor/model-1", maker: "vendor",
    fetchImplementation: async (_url: unknown, init?: RequestInit) => { sent.push(String(init?.body)); return vendorReply(answer); } }) };
}
const retention = () => new PostgresPassageRetentionRepository(db());
async function sealIn<T>(runId: string, use: (seal: (carrier: string, key: string, value: unknown) => WebSealed) => Promise<T>): Promise<T> {
  return withRunContentLease(db(), [runId], async () => {
    const leased = await prepareLeasedContentEncryptionForRun(db(), runId);
    try { return await use((carrier, key, value) => encryptAttestedLeasedContentForRun(leased, carrier as never, key, value)!); } finally { await leased.close(); }
  });
}
function replyRecordFor(runId: string): ProviderReplyRecord {
  return { refOf: webReplyTextRef, store: async (artifactId, rawText) => {
    await sealIn(runId, async (seal) => retention().recordReplyText(runId, artifactId, seal(WEB_REPLY_TEXT_CARRIER, artifactId, rawText)));
    return webReplyTextRef(artifactId);
  } };
}
const recordedText = async (runId: string, artifact: string): Promise<{ rawText: string; parseErrorDetail: string | null }> => {
  const row = (await db().query<{ content_ciphertext: never }>("SELECT content_ciphertext FROM ledger.raw_artifact WHERE raw_artifact_id=$1", [artifact])).rows[0]!;
  return withRunContentLease(db(), [runId], () => decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(db(), runId, "ledger.raw_artifact", artifact, row.content_ciphertext, null as never));
};
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await db().connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}

describe("a reader's reply", () => {
  it("is on record by name only; killed and claimed again it replays with no vendor call; after the deletion the call is made again", async () => {
    const runId = await fixture.createEncryptedRun("Should the pier stay?");
    const first = gatewayCounting();
    const answered = await withRunContentLease(db(), [runId], () => first.gateway.call(request(runId, { replyRecord: replyRecordFor(runId) })));
    expect(first.sent).toHaveLength(1);
    expect(answered.content).toContain("harbour report");
    const recorded = await recordedText(runId, answered.rawArtifactRef);
    expect(recorded).toEqual({ rawText: webReplyTextRef(answered.rawArtifactRef), parseErrorDetail: null });

    // The kill: a new copy with a new frame and a fresh book.
    const book = await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, WORK));
    expect(book.pending).toBe(1);
    const second = gatewayCounting("{}");
    const replayed = await replayingGateway(book, second.gateway).call(request(runId, { replyRecord: replyRecordFor(runId) }));
    expect(second.sent).toHaveLength(0);
    expect(replayed.content).toBe(answered.content);
    expect(replayed.rawArtifactRef).toBe(answered.rawArtifactRef);

    // The saved reply gone: a name with no text is no reply.
    await seeded([["DELETE FROM identity.web_reply_text WHERE run_id=$1", [runId]]]);
    const after = await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, WORK));
    const third = gatewayCounting();
    await withRunContentLease(db(), [runId], () => replayingGateway(after, third.gateway).call(request(runId, { replyRecord: replyRecordFor(runId) })));
    expect(third.sent).toHaveLength(1);
  });

  it("a refused reply's parse error detail, which can quote it, is not kept", async () => {
    const runId = await fixture.createEncryptedRun("Should the pier stay?");
    const refused = gatewayCounting(JSON.stringify({ verdict: "no", copied: PASSAGE }));
    const seen: string[] = [];
    const record: ProviderReplyRecord = { ...replyRecordFor(runId), store: async (id, text) => { seen.push(id); return replyRecordFor(runId).store(id, text); } };
    await withRunContentLease(db(), [runId], () => refused.gateway.call(request(runId, { replyRecord: record }))).catch(() => undefined);
    expect(seen.length).toBeGreaterThan(0);
    for (const id of seen) expect(JSON.stringify(await recordedText(runId, id))).not.toContain("harbour report");
  });
});

describe("a prompt carrying a passage", () => {
  it("records its name, sends the text, and a copy with a new fence still replays", async () => {
    const runId = await fixture.createEncryptedRun("Should the pier stay?");
    const ref = webExtractTextRef(webStepRowId(runId, "extract", "S1-1"));
    holdRunPassages(runId, new Map([[ref, PASSAGE]]));
    try {
      const material = [{ name: "cited_extract", content: JSON.stringify({ id: "S1-1", quote: PASSAGE }) }];
      const first = gatewayCounting(JSON.stringify({ verdict: "yes" }));
      const answered = await withRunContentLease(db(), [runId], () => first.gateway.call(request(runId, {}, material)));
      expect(first.sent[0]).toContain("harbour report");
      const row = (await db().query<{ attempt_id: string; content_ciphertext: never }>(
        `SELECT prompt.attempt_id, prompt.content_ciphertext FROM ledger.call_prompt AS prompt WHERE prompt.run_id=$1`, [runId])).rows[0]!;
      const prompt = await withRunContentLease(db(), [runId], () => decryptContentForRun<{ promptText: string }>(db(), runId, "ledger.call_prompt", row.attempt_id, row.content_ciphertext, null as never));
      expect(prompt.promptText).toContain(ref);
      expect(prompt.promptText).not.toContain("harbour report");

      const book = await withRunContentLease(db(), [runId], () => readReplayBook(db(), runId, WORK));
      const second = gatewayCounting("{}");
      const replayed = await replayingGateway(book, second.gateway).call(request(runId, {}, material));
      expect(second.sent).toHaveLength(0);
      expect(replayed.rawArtifactRef).toBe(answered.rawArtifactRef);
    } finally {
      releaseRunPassages(runId);
    }
  });
});

describe("the deletion and what later steps read", () => {
  /** One debate with one page, its reading (note included), one top pick, one extract, one pack, and a point citing the extract. */
  async function debate(state: "CLAIMED" | "DONE"): Promise<Readonly<{ runId: string; pointId: string }>> {
    const runId = await fixture.createEncryptedRun("Should the pier stay?");
    const store = new PostgresWebEvidenceRepository(db());
    const [searchId, pageId, readingId, extractId, packId] = ["search", "page", "reading", "extract", "pack"].map((kind) => webStepRowId(runId, kind, kind === "extract" ? "S1-1" : "x")) as [string, string, string, string, string];
    await sealIn(runId, async (seal) => {
      await store.recordSearch({ runId, searchId, pathRef: "a1", side: "for", languageKind: "english", language: "en", country: null, lookBack: "3y", outcome: "FOUND", chargeMicros: 0, resultCount: 1,
        words: seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "pier" }) });
      const text = `Some opening. ${PASSAGE} Some closing.`;
      await store.recordPage({ runId, pageId, searchId, rank: 1, readDepth: "whole", about: seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: "https://s.example/a", site: "s.example", title: "A", date: null }),
        text: { chars: text.length, digest: Buffer.alloc(32, 9), sealed: seal(WEB_EVIDENCE_CARRIERS.pageText, pageId, text) } });
      await store.recordReading({ runId, readingId, pageId, reader: 1, maker: "anthropic", outcome: "READ", grade: 3,
        line: seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { line: "One line.", language: "en", note: "It is a report. It found queues doubled. It leaves out buses." }) });
      await store.recordExtract({ runId, extractId, pageId, label: "S1-1", foundBy: [1], quote: seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: PASSAGE }) });
      await store.recordPicks(runId, "a1", [pageId]);
      await store.recordPack({ runId, packId, pathRef: "a1", extractLabels: ["S1-1"], pack: seal(WEB_EVIDENCE_CARRIERS.pack, packId, { path_ref: "a1", pages: [], extracts: [] }) });
    });
    const pointId = randomUUID();
    await seeded([[`INSERT INTO core.node(node_id,run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,materialized_path,generation_status,path_status,
        exploration_decision,provenance_ref,way_of_knowing,locator,value_laden,position_label,is_folder,created_at_seq,relevant_as_of,content_ciphertext,content_attestation)
        VALUES($1,$2,$3,'unknown',NULL,NULL,0,0,'0','complete','active','continue',$4,'LOOKED_UP','S1-1',false,NULL,false,ledger.allocate_sequence(),clock_timestamp(),'{}'::jsonb,'\\x00')`,
      [pointId, runId, CONTENT_CIPHERTEXT_SENTINEL, randomUUID()]],
      [`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
        VALUES ($1,'fixture','[]'::jsonb,$2,$3,$4,$5,NULL,ledger.allocate_sequence())`, [runId, `fixture:${randomUUID()}`, state, state === "CLAIMED" ? "runner" : null, state === "CLAIMED" ? new Date(Date.now() + 600_000) : null]]]);
    return { runId, pointId };
  }
  const shownOf = async (runId: string): Promise<readonly string[]> => {
    const quotes = (await retention().readShownQuotes(runId)) ?? [];
    return withRunContentLease(db(), [runId], async () => {
      const leased = await prepareLeasedContentEncryptionForRun(db(), runId);
      try { return quotes.map((quote) => (decryptLeasedContentForRun<{ quote: string }>(leased, WEB_SHOWN_QUOTE_CARRIER, quote.extract_id, quote.content, null as never)).quote); }
      finally { await leased.close(); }
    });
  };

  it("nothing goes while the debate runs; a crash's missing quote is written, then the passages go; quote, note and link stay", async () => {
    const running = await debate("CLAIMED");
    expect((await wipeDebatePassages(db(), running.runId, "NOTHING_RUNS"))?.outcome).toBe("STILL_RUNNING");
    expect((await new PostgresWebEvidenceRepository(db()).read(running.runId))!.extracts).toHaveLength(1);

    const settled = await debate("DONE");
    // This debate was stopped before its shown quote was written.
    expect(await shownOf(settled.runId)).toEqual([]);
    await sweepPassages(db());
    const after = (await new PostgresWebEvidenceRepository(db()).read(settled.runId))!;
    expect(after.extracts).toHaveLength(0);
    expect(after.packs).toHaveLength(0);
    expect(after.pages.map((page) => page.text_state)).toEqual(["WIPED"]);
    const quotes = await shownOf(settled.runId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]!.length).toBeLessThanOrEqual(120);
    expect(PASSAGE.startsWith(quotes[0]!.replace(/…$/u, ""))).toBe(true);
    expect(after.readings).toHaveLength(1);
  });

  it("a rewrite right after the dig reads the passage; an older debate's rewrite, and any read after the wipe, read the short quote and the note", async () => {
    const { runId, pointId } = await debate("DONE");
    const sources = postgresPathRewriteSources(db());
    await withRunContentLease(db(), [runId], async () => {
      await sealIn(runId, async (seal) => {
        const extractId = webStepRowId(runId, "extract", "S1-1");
        await retention().recordShownQuote(runId, extractId, seal(WEB_SHOWN_QUOTE_CARRIER, extractId, { quote: "The harbour report found…" }));
      });
      const before = (await sources.digExtractsOf!(runId, [pointId])).get(pointId)!;
      expect(before[0]!.quote).toBe(PASSAGE);
      expect(before[0]!.note).toBe("It is a report. It found queues doubled. It leaves out buses.");
      await wipeDebatePassages(db(), runId, "NOTHING_RUNS");
      const afterWipe = (await sources.digExtractsOf!(runId, [pointId])).get(pointId)!;
      expect(afterWipe[0]!.quote).toBe("The harbour report found…");
      expect(afterWipe[0]!.note).toBe("It is a report. It found queues doubled. It leaves out buses.");
    });
  });

  it("a dig that finds a page the investigation read carries the note and the short quote, before and after the wipe: never the passage", async () => {
    const { runId } = await debate("DONE");
    const extractId = webStepRowId(runId, "extract", "S1-1");
    await sealIn(runId, async (seal) => retention().recordShownQuote(runId, extractId, seal(WEB_SHOWN_QUOTE_CARRIER, extractId, { quote: "The harbour report found\u2026" })));
    const dig = await fixture.createEncryptedRun("Should the pier stay? A dig.");
    const investigations = new PostgresInvestigationRepository(db());
    await seeded([[`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
      VALUES ($1,'fixture','[]'::jsonb,$2,'CLAIMED','runner',$3,NULL,ledger.allocate_sequence())`, [dig, `fixture:${randomUUID()}`, new Date(Date.now() + 600_000)]]]);
    expect(await investigations.join({ ownerRef: fixture.ownerRef, parentRunId: runId, childRunId: dig, places: [], mode: "quick" })).toMatchObject({ outcome: "JOINED" });
    const source = postgresWebReuseSource(db(), dig);
    const found = async () => withRunContentLease(db(), [runId], () => source.find([addressKey("https://s.example/a")!]));
    const before = [...(await found()).values()][0]!;
    expect(before.note).toBe("It is a report. It found queues doubled. It leaves out buses.");
    expect(before.extracts.map((extract) => extract.quote)).toEqual(["The harbour report found"]);
    expect(JSON.stringify(reusedReadingContent(before))).not.toContain("queues doubled in the two years");
    // The report's hook: the settled debate's texts go, the running dig holds on to its own.
    await wipeInvestigationPassages(db(), runId);
    const after = [...(await found()).values()][0]!;
    expect(after.text).toBeNull();
    expect(after.extracts.map((extract) => extract.quote)).toEqual(["The harbour report found"]);
  });

  it("what 0135's row keeps of a dig's paths holds no quote", () => {
    const stored = digPathsForStore([{ positionRef: "p", statement: "S.", points: [{ id: "n1", text: "T.", onId: null, side: null, trust: null, disputed: false }],
      extracts: [{ pointId: "n1", label: "S1-1", site: "s", title: null, quote: PASSAGE }] }]);
    expect(JSON.stringify(stored)).not.toContain("harbour report");
    const read = storedDigPathsOf(JSON.parse(JSON.stringify(stored)), new Map([["n1", [{ pointId: "n1", label: "S1-1", site: "s", title: null, quote: "Short." }]]]));
    expect(read[0]!.extracts.map((extract) => extract.quote)).toEqual(["Short."]);
  });
});
