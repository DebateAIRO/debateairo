import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  buildFramedPrompt,
  planPatchFollowUp,
  readRecordedProviderReply,
  rebuildRecordedCallContent,
  structureReplayReaders,
  type ContentClassification,
  type PromptContract,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  createReplayBook,
  recordedCalls,
  replayOf,
  replayingGateway,
  type RecordedAttempt
} from "../../apps/runner/src/run-replay.js";
import {
  BASE, KEYLESS, PANEL_KEY, PATCH_REPLY, WRAPPED_ECHO, classifyPanel, panelFramed, panelRequest
} from "../support/structure-salvage-shapes.js";

/**
 * RECLAIM RESUME (docs/superpowers/specs/2026-10-14-reclaim-resume-design.md): a copy that claims a run an earlier
 * copy argued part of replays every call that copy got answered — the same artifact and ledger entry, no vendor
 * contact — instead of buying it again. These are the pure parts: reading a recorded reply as the gateway read it,
 * rebuilding the content the call handed back (a patch merged again), grouping recorded attempts into calls, and the
 * book's match (member, call site with node ids translated, and the prompt's fingerprint).
 */
const STOP = Object.freeze({ finishReason: "stop" });
const openAiReply = (content: string, finishReason = "stop"): string => JSON.stringify({
  id: "chatcmpl-1", model: "vendor/model-1",
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }]
});
/** Verdict yes/no and value_laden boolean, with zod-shaped issues naming the failing members. */
const classify = (content: string): ContentClassification => {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { parseStatus: "PARSE_FAILED", parseError: "not JSON" };
  }
  const issues: { path: string[]; message: string }[] = [];
  if (value.verdict !== "yes" && value.verdict !== "no") issues.push({ path: ["verdict"], message: "Invalid enum value" });
  if (typeof value.value_laden !== "boolean") issues.push({ path: ["value_laden"], message: "Expected boolean" });
  return issues.length === 0 ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) };
};

describe("a recorded reply is read back as the gateway read it", () => {
  it("an OpenAI-shaped body gives its message content and finish reason", () => {
    expect(readRecordedProviderReply(openAiReply('{"verdict":"yes"}'), "openai-compatible-http"))
      .toEqual({ content: '{"verdict":"yes"}', reply: { finishReason: "stop" } });
  });

  it("an Anthropic body is normalised first", () => {
    const raw = JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: '{"verdict":' }, { type: "text", text: '"no"}' }],
      stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }
    });
    expect(readRecordedProviderReply(raw, ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND).content).toBe('{"verdict":"no"}');
  });

  it("a body that is not a vendor reply has no content", () => {
    expect(readRecordedProviderReply("<html>bad gateway</html>", "openai-compatible-http").content).toBeNull();
    expect(readRecordedProviderReply(JSON.stringify({ id: "x" }), "openai-compatible-http").content).toBeNull();
  });
});

describe("the content a recorded call handed back", () => {
  const reply = (content: string | null, finishReason: string | null = "stop") => ({ content, reply: { finishReason } });
  const whole = '{"verdict":"yes","value_laden":false}';

  it("a call without a classifier hands back its reply as it is", () => {
    expect(rebuildRecordedCallContent({ accepted: reply("anything"), answered: null })).toBe("anything");
  });

  it("an accepted whole answer is the content, and the classifier last read it", () => {
    const seen: string[] = [];
    const content = rebuildRecordedCallContent({
      accepted: reply(whole), answered: null, classifyContent: (text) => { seen.push(text); return classify(text); }
    });
    expect(content).toBe(whole);
    expect(seen.at(-1)).toBe(whole);
  });

  it("a patch is merged into the reply it repaired, as the gateway merged it", () => {
    const first = '{"verdict":"maybe","value_laden":false}';
    const seen: string[] = [];
    const content = rebuildRecordedCallContent({
      accepted: reply('{"verdict":"no"}'), answered: reply(first),
      classifyContent: (text) => { seen.push(text); return classify(text); }
    });
    expect(content).toBe('{"verdict":"no","value_laden":false}');
    expect(seen.at(-1)).toBe(content);
  });

  it("a full re-ask's whole answer is the content even when the reply before it could have been patched", () => {
    const first = '{"verdict":"maybe","value_laden":false}';
    expect(rebuildRecordedCallContent({ accepted: reply(whole), answered: reply(first), classifyContent: classify })).toBe(whole);
  });

  // Task 6 review Minor 3: as the gateway reads it live, a class that cannot be read is no class: never STRUCTURE, so the
  // first reply gets today's patch rebuild and B's plan is never asked.
  it("a class read that throws is not STRUCTURE: today's patch is merged, as the gateway merged it", () => {
    const first = '{"verdict":"maybe","value_laden":false}';
    const unreadClass = (text: string): ContentClassification => {
      const classified = classify(text);
      if (classified.parseStatus === "PARSED") return classified;
      return Object.defineProperty({ ...classified }, "failureClass", { enumerable: true, get: () => { throw new Error("class unread"); } });
    };
    expect(rebuildRecordedCallContent({ accepted: reply('{"verdict":"no"}'), answered: reply(first), classifyContent: unreadClass,
      structureFollowUpPlan: () => { throw new Error("B's plan is never asked for a reply of no class"); } }))
      .toBe('{"verdict":"no","value_laden":false}');
  });

  it("nothing is rebuilt from a reply the step would refuse, from a cut-off first reply, or from no content", () => {
    expect(rebuildRecordedCallContent({ accepted: reply('{"verdict":"maybe"}'), answered: null, classifyContent: classify })).toBeNull();
    expect(rebuildRecordedCallContent({
      accepted: reply('{"verdict":"no"}'), answered: reply('{"verdict":"maybe","value_laden":false}', "length"), classifyContent: classify
    })).toBeNull();
    expect(rebuildRecordedCallContent({ accepted: reply(null), answered: null, classifyContent: classify })).toBeNull();
  });
});

/** A recorded reply; `attempt` is its place in its gateway call (`raw_artifact.metadata_json.attempt`). */
const artifact = (content: string, attempt = 1) => Object.freeze({
  rawText: openAiReply(content), provider: "openai-compatible-http", modelId: "vendor/model-1", maker: "vendor",
  modelVersion: "vendor/model-1", thinkingTokens: null, attempt
});
let sequence = 0;
const attempt = (input: Partial<RecordedAttempt> & Pick<RecordedAttempt, "callSiteKey" | "outcome" | "promptFingerprint">): RecordedAttempt => {
  sequence += 1;
  return Object.freeze({
    actorRef: "preview:vendor", ledgerEntryRef: `entry-${String(sequence)}`, rawArtifactRef: `artifact-${String(sequence)}`,
    thinkingLevel: null, artifact: null, ...input
  });
};

describe("recorded attempts grouped into answered calls", () => {
  it("each answer ends a call at its site and member; attempts after a site's last answer are not a call", () => {
    const calls = recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "FAILED", promptFingerprint: "a" }),
      attempt({ callSiteKey: "JUDGE:root:secondary", outcome: "OK", promptFingerprint: "b" }),
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "a2" }),
      attempt({ callSiteKey: "JUDGE", outcome: "TIMED_OUT", promptFingerprint: "c" })
    ]);
    expect(calls.map((call) => [call.callSiteKey, call.attempts.map((entry) => entry.promptFingerprint)]))
      .toEqual([["JUDGE:root:secondary", ["b"]], ["JUDGE", ["a", "a2"]]]);
  });

  it("a call answers a request for its original packet only; a repaired answer names the last reply to that packet", () => {
    // One gateway call: the original refused, the patch lost in transport (no reply), the patch answered.
    const [call] = recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "FAILED", promptFingerprint: "orig", artifact: artifact("{}", 1) }),
      attempt({ callSiteKey: "JUDGE", outcome: "TIMED_OUT", promptFingerprint: "patch" }),
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "patch", artifact: artifact("{}", 3) })
    ]);
    const replay = replayOf(call!, "orig");
    expect(replay?.answered?.promptFingerprint).toBe("orig");
    expect(replay?.repairAttempts).toBe(2);
    expect(replayOf(call!, "patch")).toBeNull();
    expect(replayOf(call!, "another prompt")).toBeNull();
  });

  it("an earlier gateway call at the site that failed in full and asked something else is never the answered call", () => {
    // Prompt A failed in full (a call of its own); later prompt B was answered at its first attempt.
    const [call] = recordedCalls([
      attempt({ callSiteKey: "JUDGE:defender:root0:r1:p0", outcome: "FAILED", promptFingerprint: "A", artifact: artifact("{}", 1) }),
      attempt({ callSiteKey: "JUDGE:defender:root0:r1:p0", outcome: "FAILED", promptFingerprint: "A", artifact: artifact("{}", 2) }),
      attempt({ callSiteKey: "JUDGE:defender:root0:r1:p0", outcome: "OK", promptFingerprint: "B", artifact: artifact("{}", 1) })
    ]);
    expect(replayOf(call!, "A")).toBeNull();
    expect(replayOf(call!, "B")).toMatchObject({ answered: null, repairAttempts: 0 });
  });

  it("a length retry re-sends the original packet: the answer is its own, nothing repaired", () => {
    const [call] = recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "FAILED", promptFingerprint: "orig", artifact: artifact("{}", 1) }),
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "orig", artifact: artifact("{}", 2) })
    ]);
    expect(replayOf(call!, "orig")).toMatchObject({ answered: null, repairAttempts: 0 });
  });

  it("a reply whose place in its call was not recorded is never replayed", () => {
    const [call] = recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "orig", artifact: { ...artifact("{}"), attempt: null } })
    ]);
    expect(replayOf(call!, "orig")).toBeNull();
  });
});

describe("the replay book and the replaying gateway", () => {
  const CONTRACT: PromptContract = Object.freeze({
    contractId: "test.reclaim.v1",
    instruction: "Judge the statement on its merits.",
    answerForm: 'Return only one JSON object {"verdict": "yes" | "no", "value_laden": boolean}.'
  });
  // Every call frames its packet afresh (its own fence and canary), as a later copy's call does.
  const packetOf = (text: string) => buildFramedPrompt({ contract: CONTRACT, material: [{ name: "question_line", content: text }] }).packet;
  const request = (callSiteKey: string, text: string, providerRef = "preview:vendor"): ProviderCallRequest => ({
    runId: "00000000-0000-4000-8000-000000000001", subjectItemId: "item", callSiteKey, role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, deadlineMs: 1000, tokenCeiling: 100 }, contractHash: "contract", providerRef,
    packet: packetOf(text), classifyContent: classify
  });
  const fp = (text: string): string => canonicalPromptFingerprint(packetOf(text).messages);
  const vendor = () => {
    const sent: string[] = [];
    const inner: ProviderGateway = {
      call: async (call: ProviderCallRequest): Promise<ProviderCallResult> => {
        sent.push(call.callSiteKey);
        return { rawArtifactRef: "fresh", ledgerEntryRef: "fresh", content: '{"verdict":"no","value_laden":true}',
          provider: "openai-compatible-http", model: "vendor/model-1", maker: "vendor", modelVersion: "vendor/model-1" };
      }
    };
    return { sent, inner };
  };
  const answer = '{"verdict":"yes","value_laden":false}';

  it("a recorded answer is handed back once, with its own artifact and ledger entry, and the vendor is not asked", async () => {
    const recorded = attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("question"), artifact: artifact(answer) });
    const book = createReplayBook({ calls: recordedCalls([recorded]), earlierNodes: [] });
    const { sent, inner } = vendor();
    const gateway = replayingGateway(book, inner);
    const replayed = await gateway.call(request("JUDGE", "question"));
    expect(replayed).toMatchObject({ rawArtifactRef: recorded.rawArtifactRef, ledgerEntryRef: recorded.ledgerEntryRef, content: answer,
      maker: "vendor", model: "vendor/model-1", repairAttempts: 0 });
    expect(sent).toEqual([]);
    expect(book.pending).toBe(0);
    await gateway.call(request("JUDGE", "question"));
    expect(sent).toEqual(["JUDGE"]);
  });

  it("another member, another site or another prompt goes to the vendor", async () => {
    const book = createReplayBook({ calls: recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("question"), artifact: artifact(answer) })
    ]), earlierNodes: [] });
    const { sent, inner } = vendor();
    const gateway = replayingGateway(book, inner);
    await gateway.call(request("JUDGE", "question", "preview:other"));
    await gateway.call(request("JUDGE:root:secondary", "question"));
    await gateway.call(request("JUDGE", "a different question"));
    expect(sent).toEqual(["JUDGE", "JUDGE:root:secondary", "JUDGE"]);
    expect(book.pending).toBe(1);
  });

  it("a recorded answer the step would refuse is asked again", async () => {
    const book = createReplayBook({ calls: recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("question"), artifact: artifact('{"verdict":"maybe"}') })
    ]), earlierNodes: [] });
    const { sent, inner } = vendor();
    expect((await replayingGateway(book, inner).call(request("JUDGE", "question"))).rawArtifactRef).toBe("fresh");
    expect(sent).toEqual(["JUDGE"]);
  });

  it("a node saved from the reply an earlier copy's node had keeps the EARLIEST copy's review site; any other node keeps its own", async () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "33333333-3333-4333-8333-333333333333";
    const now = "22222222-2222-4222-8222-222222222222";
    const book = createReplayBook({
      calls: recordedCalls([attempt({ callSiteKey: `JUDGE:review:${first}:seat:main`, outcome: "OK",
        promptFingerprint: fp("review"), artifact: artifact(answer) })]),
      // Two earlier copies saved the node (the second replayed the first's reply), in save order.
      earlierNodes: [{ nodeId: first, provenanceRef: "author-reply" }, { nodeId: second, provenanceRef: "AUTHOR-REPLY" }]
    });
    expect(book.siteNodeId(now)).toBe(now);
    book.adopt(now, "author-reply");
    expect(book.siteNodeId(now)).toBe(first);
    expect(book.siteNodeId("44444444-4444-4444-8444-444444444444")).toBe("44444444-4444-4444-8444-444444444444");
    const { sent, inner } = vendor();
    expect((await replayingGateway(book, inner).call(request(`JUDGE:review:${book.siteNodeId(now)}:seat:main`, "review"))).content).toBe(answer);
    expect(sent).toEqual([]);
  });

  it("the keep-alive is asked before an answer is replayed: a copy that lost the run replays nothing", async () => {
    const book = createReplayBook({ calls: recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("question"), artifact: artifact(answer) })
    ]), earlierNodes: [] });
    const { sent, inner } = vendor();
    const lost = Object.assign(new Error("RUNNER_CLAIM_LOST"), { code: "RUNNER_CLAIM_LOST" });
    await expect(replayingGateway(book, inner, () => { throw lost; }).call(request("JUDGE", "question")))
      .rejects.toMatchObject({ code: "RUNNER_CLAIM_LOST" });
    expect(sent).toEqual([]);
    expect(book.pending).toBe(1);
  });

  it("a closed book replays nothing", async () => {
    const book = createReplayBook({ calls: recordedCalls([
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("question"), artifact: artifact(answer) })
    ]), earlierNodes: [] });
    book.close();
    const { sent, inner } = vendor();
    await replayingGateway(book, inner).call(request("JUDGE", "question"));
    expect(sent).toEqual(["JUDGE"]);
  });
});

describe("structure salvage on replay", () => {
  const PANEL_FP = canonicalPromptFingerprint(panelFramed.packet.messages);
  /** The panel request as the runner makes it (member "preview:vendor", the file's actor). */
  const panelCall = (): ProviderCallRequest => panelRequest({ runId: "00000000-0000-4000-8000-000000000001", subjectItemId: "item",
    callSiteKey: PANEL_KEY, role: "JUDGE", lane: "served", bound: { maxAttempts: 3, deadlineMs: 1000, tokenCeiling: 100 },
    contractHash: "contract", providerRef: "preview:vendor", packet: panelFramed.packet });
  const okAttempt = (key: string, content: string, place: number, fingerprint = PANEL_FP) =>
    attempt({ callSiteKey: key, outcome: "OK", promptFingerprint: fingerprint, artifact: artifact(content, place) });
  const failedAttempt = (key: string, content: string, place: number, fingerprint = PANEL_FP) =>
    attempt({ callSiteKey: key, outcome: "FAILED", promptFingerprint: fingerprint, artifact: artifact(content, place) });
  const bookOf = (attempts: readonly RecordedAttempt[]) => createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [] });
  const recorded = (content: string) => readRecordedProviderReply(openAiReply(content), "openai-compatible-http");
  const noPost = (): ProviderGateway & { sent: number } => {
    const gateway = { sent: 0, call: async (): Promise<ProviderCallResult> => { gateway.sent += 1; throw new Error("no POST on a replay"); } };
    return gateway;
  };

  it("replays an A1-rescued call from its OK row without a POST", async () => {
    // One recorded OK attempt at PANEL_KEY whose raw content is KEYLESS (Task 2's shape), attempt 1.
    const inner = noPost();
    const result = await replayingGateway(bookOf([okAttempt(PANEL_KEY, KEYLESS, 1)]), inner, () => undefined, true).call(panelCall());
    expect(result.content).toBe(JSON.stringify(BASE)); // the bytes the first copy's gateway accepted
    expect(inner.sent).toBe(0);
    // A run with no route (structureReplay false, the default): today's rebuild, the call is bought again.
    const hosted = noPost();
    await expect(replayingGateway(bookOf([okAttempt(PANEL_KEY, KEYLESS, 1)]), hosted).call(panelCall())).rejects.toThrow("no POST on a replay");
    expect(hosted.sent).toBe(1);
  });

  it("replays a B-answered call from the first reply and the follow-up", async () => {
    // The shape this test needs (pre-flight PF-S2): today's patch plan for the first reply is NOT null (it names
    // evidence.quality and fallacy), but merging B's reply into it is refused (the echo stays), so today's rebuild is null.
    const first = classifyPanel(WRAPPED_ECHO, STOP);
    expect(first.parseStatus).toBe("SCHEMA_FAILED");
    expect(planPatchFollowUp({ content: WRAPPED_ECHO, reply: STOP, parseStatus: first.parseStatus,
      parseError: (first as { parseError: string }).parseError })).not.toBeNull();
    expect(rebuildRecordedCallContent({ accepted: recorded(PATCH_REPLY), answered: recorded(WRAPPED_ECHO), classifyContent: classifyPanel }))
      .toBeNull();
    // FAILED attempt 1 with WRAPPED_ECHO at the request's own fingerprint, then B's OK attempt 2 at the patch packet's
    // (a different fingerprint: else `answered` is null and `repairAttempts` 0).
    const inner = noPost();
    const result = await replayingGateway(bookOf([failedAttempt(PANEL_KEY, WRAPPED_ECHO, 1), okAttempt(PANEL_KEY, PATCH_REPLY, 2, "patch")]),
      inner, () => undefined, true).call(panelCall());
    expect(result.content).toBe(JSON.stringify(BASE)); // merged into A's base, as the live B was: the echo A dropped stays dropped
    expect(result.repairAttempts).toBe(1);
    expect(inner.sent).toBe(0);
  });

  // Final review Minor 1: the preview's one unbilled resend of B is sent at the same place in its call (attempt 2), so its
  // REFUSED row holds no place: the call's start is found without it, and the call is replayed from the recorded rows.
  it("replays a B resent after an unbilled refusal from the first reply and the resent follow-up, with no POST", async () => {
    const refused = attempt({ callSiteKey: PANEL_KEY, outcome: "REFUSED", promptFingerprint: "patch", rawArtifactRef: null });
    const rows = [failedAttempt(PANEL_KEY, WRAPPED_ECHO, 1), refused, okAttempt(PANEL_KEY, PATCH_REPLY, 2, "patch")];
    const replay = replayOf(recordedCalls(rows)[0]!, PANEL_FP);
    expect(replay).toMatchObject({ accepted: rows[2], answered: rows[0], repairAttempts: 1 });
    // The same rows without the REFUSED one replay exactly as today.
    expect(replayOf(recordedCalls([rows[0]!, rows[2]!])[0]!, PANEL_FP)).toEqual(replay);
    const inner = noPost();
    const result = await replayingGateway(bookOf(rows), inner, () => undefined, true).call(panelCall());
    expect(result.content).toBe(JSON.stringify(BASE)); // the bytes the first copy's gateway accepted
    expect(result).toMatchObject({ rawArtifactRef: rows[2]!.rawArtifactRef, ledgerEntryRef: rows[2]!.ledgerEntryRef, repairAttempts: 1 });
    expect(inner.sent).toBe(0);
  });

  // Task 6 review Minor 4: what the readers must NOT rebuild.
  it("a STRUCTURE-class record whose follow-up does not merge is not rebuilt", () => {
    const readers = structureReplayReaders(panelCall())!;
    // B's reply rewrites a member A kept (`steelman.fidelity` was never asked): the merge is refused, and the reply alone
    // is no answer, so the call is made again.
    const rewritten = "{\"evidence.quality\": 0.5, \"steelman.fidelity\": 0.1}";
    expect(rebuildRecordedCallContent({ accepted: recorded(rewritten), answered: recorded(WRAPPED_ECHO), classifyContent: classifyPanel,
      ...readers })).toBeNull();
    // The control: B's own follow-up merges.
    expect(rebuildRecordedCallContent({ accepted: recorded(PATCH_REPLY), answered: recorded(WRAPPED_ECHO), classifyContent: classifyPanel,
      ...readers })).toBe(JSON.stringify(BASE));
  });

  it("an OK reply A1 refuses on a step that keeps every text is not rebuilt", () => {
    // The keyless sentence A1 drops on a judge step is kept on the answer writer's (owner answer 3): no rescue to replay.
    const writer = structureReplayReaders({ ...panelCall(), callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" })!;
    expect(rebuildRecordedCallContent({ accepted: recorded(KEYLESS), answered: null, classifyContent: classifyPanel, ...writer })).toBeNull();
    const judge = structureReplayReaders(panelCall())!;
    expect(rebuildRecordedCallContent({ accepted: recorded(KEYLESS), answered: null, classifyContent: classifyPanel, ...judge }))
      .toBe(JSON.stringify(BASE));
  });

  it("the readers: null for a request that is not routable; without them today's rebuild stands, with them A's", () => {
    const { classifyContent: _none, ...unchecked } = panelCall();
    expect(structureReplayReaders(unchecked)).toBeNull();
    const readers = structureReplayReaders(panelCall())!;
    expect(rebuildRecordedCallContent({ accepted: recorded(KEYLESS), answered: null, classifyContent: classifyPanel })).toBeNull();
    expect(rebuildRecordedCallContent({ accepted: recorded(KEYLESS), answered: null, classifyContent: classifyPanel, ...readers }))
      .toBe(JSON.stringify(BASE));
  });
});
