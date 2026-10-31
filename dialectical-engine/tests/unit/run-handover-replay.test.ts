// Plan 2026-10-31 decision 12: THE HAND-OVER RULE of apps/runner/src/run-replay.ts, the pure part. A debate that crossed an upload
// keeps what it found: a recorded answer stands when a release moved the wording, one step never mixes two wordings, and a run that
// never crossed an upload behaves as before. The whole debate on real PostgreSQL: tests/integration/run-handover-debate.test.ts.
import { describe, expect, it } from "vitest";
import type { ContentClassification, ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import { TypedDomainError } from "@debateai/kernel";
import {
  RUN_HANDOVER_IMPOSSIBLE, createReplayBook, recordedCalls, replayingGateway, type RecordedAttempt, type ReplayBook
} from "../../apps/runner/src/run-replay.js";

const OLD = "contract:old-release";
const NEW = "contract:new-release";
const reply = (content: string): string => JSON.stringify({ id: "chatcmpl-1", model: "vendor/model-1",
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
const answered = (callSiteKey: string, actorRef: string, promptFingerprint: string, contractHash: string, id: string): RecordedAttempt => Object.freeze({
  callSiteKey, actorRef, outcome: "OK", ledgerEntryRef: `ledger-${id}`, rawArtifactRef: `artifact-${id}`, thinkingLevel: null, contractHash, promptFingerprint,
  artifact: Object.freeze({ rawText: reply(`{"answer":"${id}"}`), provider: "openai-chat", modelId: "vendor/model-1", maker: "vendor",
    modelVersion: null, thinkingTokens: null, attempt: 1 }) });
const book = (...attempts: readonly RecordedAttempt[]): ReplayBook => createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [] });
const ask = (target: ReplayBook, callSiteKey: string, providerRef: string, fingerprint: string, contractHash = NEW) =>
  target.take({ callSiteKey, providerRef, fingerprint, contractHash });

describe("the record under a hand-over", () => {
  it("the same bytes replay whatever the hash, and do not count as standing", () => {
    const record = book(answered("JUDGE", "a", "words-1", OLD, "1"));
    const taken = ask(record, "JUDGE", "a", "words-1");
    expect(taken?.accepted.ledgerEntryRef).toBe("ledger-1");
    expect(taken?.stood).toBe(false);
    expect(record.stood).toBe(0);
  });

  it("other bytes under another contract hash: the answer stands, once; nothing is asked again", () => {
    const record = book(answered("JUDGE", "a", "old-words", OLD, "1"));
    const taken = ask(record, "JUDGE", "a", "new-words");
    expect(taken?.accepted.ledgerEntryRef).toBe("ledger-1");
    expect(taken?.stood).toBe(true);
    expect(record.stood).toBe(1);
    expect(record.pending).toBe(0);
    expect(ask(record, "JUDGE", "a", "new-words")).toBeNull();
  });

  it("other bytes under the SAME hash never stand: a debate that crossed no upload behaves as before", () => {
    const record = book(answered("JUDGE", "a", "old-inputs", NEW, "1"));
    expect(ask(record, "JUDGE", "a", "new-inputs")).toBeNull();
    expect(record.pending).toBe(1);
  });

  it("a record with no hash, a request with no hash, another member or another site never stand", () => {
    const noHash = answered("JUDGE", "a", "old-words", OLD, "1");
    const { contractHash: _dropped, ...withoutHash } = noHash;
    expect(ask(book(withoutHash as RecordedAttempt), "JUDGE", "a", "new-words")).toBeNull();
    expect(book(noHash).take({ callSiteKey: "JUDGE", providerRef: "a", fingerprint: "new-words" })).toBeNull();
    expect(ask(book(noHash), "JUDGE", "b", "new-words")).toBeNull();
    expect(ask(book(noHash), "JUDGE:other", "a", "new-words")).toBeNull();
  });
});

describe("one step never mixes two wordings", () => {
  const SITE_A = "PANEL:JUDGE:review:n1:a";
  const SITE_B = "PANEL:JUDGE:review:n1:b";
  const members = [{ callSiteKey: SITE_A, providerRef: "a" }, { callSiteKey: SITE_B, providerRef: "b" }];

  it("a finished step stands whole", () => {
    const record = book(answered(SITE_A, "a", "old-a", OLD, "a"), answered(SITE_B, "b", "old-b", OLD, "b"));
    record.openStep(members, NEW);
    expect(ask(record, SITE_A, "a", "new-a")?.stood).toBe(true);
    expect(ask(record, SITE_B, "b", "new-b")?.stood).toBe(true);
  });

  it("a half-done step under changed words: its answered member does not stand, so all are asked under the new words", () => {
    const record = book(answered(SITE_A, "a", "old-a", OLD, "a"));
    record.openStep(members, NEW);
    expect(ask(record, SITE_A, "a", "new-a")).toBeNull();
    expect(ask(record, SITE_B, "b", "new-b")).toBeNull();
    expect(record.stood).toBe(0);
  });

  it("a half-done step under the SAME words: the answered member replays free, the other is asked; the same words, so no mix", () => {
    const record = book(answered(SITE_A, "a", "same-a", OLD, "a"));
    record.openStep(members, NEW);
    const taken = ask(record, SITE_A, "a", "same-a");
    expect(taken?.accepted.ledgerEntryRef).toBe("ledger-a");
    expect(taken?.stood).toBe(false);
    expect(ask(record, SITE_B, "b", "same-b")).toBeNull();
  });

  it("a step begun under the new words stays there after a kill: its older answer never stands beside a newer one", () => {
    const record = book(answered(SITE_A, "a", "old-a", OLD, "a-old"), answered(SITE_B, "b", "old-b", OLD, "b-old"),
      answered(SITE_A, "a", "new-a", NEW, "a-new"));
    record.openStep(members, NEW);
    expect(ask(record, SITE_A, "a", "new-a")?.accepted.ledgerEntryRef).toBe("ledger-a-new");
    expect(ask(record, SITE_B, "b", "new-b")).toBeNull();
    expect(record.stood).toBe(0);
  });

  it("across two uploads the newest older answer stands", () => {
    const record = book(answered("JUDGE", "a", "first-words", "contract:first", "first"), answered("JUDGE", "a", "second-words", "contract:second", "second"));
    expect(ask(record, "JUDGE", "a", "third-words", "contract:third")?.accepted.ledgerEntryRef).toBe("ledger-second");
  });

  it("the empty book's shared object keeps nothing an opened step wrote", () => {
    const empty = book();
    empty.openStep(members, NEW);
    expect(empty.pending).toBe(0);
  });
});

describe("the gateway", () => {
  const request = (callSiteKey: string, providerRef: string, marker: string, classifyContent?: (content: string) => ContentClassification): ProviderCallRequest => ({
    runId: "00000000-0000-4000-8000-000000000001", subjectItemId: "item", callSiteKey, role: "JUDGE", lane: "served",
    bound: { maxAttempts: 2, tokenCeiling: 400, deadlineMs: 5_000 }, contractHash: NEW, providerRef,
    packet: { messages: [{ role: "system", content: marker }] } as ProviderCallRequest["packet"],
    ...(classifyContent === undefined ? {} : { classifyContent })
  } as ProviderCallRequest);
  const counting = () => {
    const sent: string[] = [];
    const gateway: ProviderGateway = { call: async (asked) => { sent.push(asked.callSiteKey); throw new TypedDomainError("SENT", "sent"); } };
    return { sent, gateway };
  };
  const SITE_A = "PANEL:n:a";
  const SITE_B = "PANEL:n:b";
  const refusing = (): ContentClassification => ({ parseStatus: "SCHEMA_FAILED", parseError: "the new form" });

  it("a stood answer comes back from the record and nothing is sent", async () => {
    const vendors = counting();
    const result = await replayingGateway(book(answered("JUDGE", "a", "old", OLD, "1")), vendors.gateway).call(request("JUDGE", "a", "new"));
    expect(result.ledgerEntryRef).toBe("ledger-1");
    expect(vendors.sent).toEqual([]);
  });

  it("the first answer of a step the new release cannot read bars the step: every member is asked, none mixed", async () => {
    const record = book(answered(SITE_A, "a", "old-a", OLD, "a"), answered(SITE_B, "b", "old-b", OLD, "b"));
    record.openStep([{ callSiteKey: SITE_A, providerRef: "a" }, { callSiteKey: SITE_B, providerRef: "b" }], NEW);
    const vendors = counting();
    const gateway = replayingGateway(record, vendors.gateway);
    await expect(gateway.call(request(SITE_A, "a", "new-a", refusing))).rejects.toMatchObject({ code: "SENT" });
    await expect(gateway.call(request(SITE_B, "b", "new-b"))).rejects.toMatchObject({ code: "SENT" });
    expect(vendors.sent).toEqual([SITE_A, SITE_B]);
    expect(record.stood).toBe(0);
  });

  it("an unreadable answer after another member stood: nothing is sent, the copy ends RUN_HANDOVER_IMPOSSIBLE", async () => {
    const record = book(answered(SITE_A, "a", "old-a", OLD, "a"), answered(SITE_B, "b", "old-b", OLD, "b"));
    record.openStep([{ callSiteKey: SITE_A, providerRef: "a" }, { callSiteKey: SITE_B, providerRef: "b" }], NEW);
    const vendors = counting();
    const gateway = replayingGateway(record, vendors.gateway);
    await expect(gateway.call(request(SITE_A, "a", "new-a"))).resolves.toMatchObject({ ledgerEntryRef: "ledger-a" });
    await expect(gateway.call(request(SITE_B, "b", "new-b", refusing))).rejects.toMatchObject({ code: RUN_HANDOVER_IMPOSSIBLE });
    expect(vendors.sent).toEqual([]);
  });
});
