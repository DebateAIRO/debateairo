// Reclaim resume (docs/superpowers/specs/2026-10-14-reclaim-resume-design.md): a copy of a debate that claims a work
// item an earlier copy of the run had already argued part of runs the debate from the start, and every call the
// earlier copy got answered is REPLAYED from the record — the same raw artifact and ledger entry, no vendor contact, no
// new ledger row, no money — instead of being bought a second time. Owner ruling 2026-10-14 (the true resume).
import {
  PostgresPassageRetentionRepository,
  WEB_REPLY_TEXT_CARRIER,
  decryptLeasedContentForRun,
  prepareLeasedContentEncryptionForRun,
  webReplyTextIdOf,
  type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import {
  readRecordedProviderReply,
  rebuildRecordedCallContent,
  structureReplayReaders,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway,
  type ProviderWireKind
} from "@debateai/providers";
import { TypedDomainError } from "@debateai/kernel";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { passageRecordedPacket } from "./passage-record.js";

/** One recorded reply: the vendor's own bytes (`raw_artifact.raw_text`) and who gave it. */
export interface RecordedArtifact {
  readonly rawText: string;
  readonly provider: string;
  readonly modelId: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly thinkingTokens: number | null;
  /** The attempt's place in its gateway call (`raw_artifact.metadata_json.attempt`: 1 starts a call); null if unread. */
  readonly attempt: number | null;
}

/** One recorded attempt of a model call: its ledger row, its prompt's fingerprint and its reply, in ledger order. */
export interface RecordedAttempt {
  readonly callSiteKey: string;
  readonly actorRef: string;
  readonly outcome: string;
  readonly ledgerEntryRef: string;
  readonly rawArtifactRef: string | null;
  readonly thinkingLevel: string | null;
  /**
   * The sealed contracts' hash the attempt was asked under (`ledger_entry.contract_hash`): the hand-over rule's proof that
   * it was asked under another release's wording. Absent: never answers a request whose words differ.
   */
  readonly contractHash?: string;
  /** The scorecard's canonical fingerprint of the attempt's prompt (`ledger.call_prompt`); null when none was kept. */
  readonly promptFingerprint: string | null;
  readonly artifact: RecordedArtifact | null;
}

/**
 * A recorded call that was ANSWERED: the attempts at one site and member, in ledger order, since the previous answer
 * there, the last one OK. Its first attempts may belong to earlier gateway calls at the site that failed in full; the
 * answered call is the last `accepted.artifact.attempt` of them (every attempt of a call has its ledger row, in order).
 */
export interface RecordedCall {
  readonly callSiteKey: string;
  readonly actorRef: string;
  readonly attempts: readonly RecordedAttempt[];
}

/** What a replay hands back: the OK attempt, the reply it repaired (if any) and the repairs sent before it. */
export interface Replay {
  readonly accepted: RecordedAttempt & { readonly rawArtifactRef: string; readonly artifact: RecordedArtifact };
  readonly answered: RecordedAttempt | null;
  readonly repairAttempts: number;
}

/** Groups a run's recorded attempts (ledger order) into its answered calls; attempts after a site's last answer are dropped. */
export function recordedCalls(attempts: readonly RecordedAttempt[]): readonly RecordedCall[] {
  const open = new Map<string, RecordedAttempt[]>();
  const calls: RecordedCall[] = [];
  for (const attempt of attempts) {
    const site = JSON.stringify([attempt.callSiteKey, attempt.actorRef]);
    const segment = [...(open.get(site) ?? []), attempt];
    if (attempt.outcome !== "OK") {
      open.set(site, segment);
      continue;
    }
    open.delete(site);
    calls.push(Object.freeze({ callSiteKey: attempt.callSiteKey, actorRef: attempt.actorRef, attempts: Object.freeze(segment) }));
  }
  return Object.freeze(calls);
}

/**
 * How a recorded call answers a request whose prompt has `fingerprint`, or null when it does not. The answered gateway
 * call is the last `n` attempts (n: the OK attempt's place in its call), and the request must be that call's ORIGINAL
 * packet — its first attempt's prompt (a repair packet carries the rejected reply, so no fresh request matches one;
 * an earlier, failed call at the site may have asked something else). `answered` is the call's last reply to its
 * original packet when the OK attempt answered a repair; the repairs counted are those after the original packet was
 * last sent. A reply whose place in its call was not recorded is never replayed.
 *
 * A REFUSED row (the preview's provably unbilled refusal) holds no place: its one resend is sent at the same place in the
 * call, so the call's attempts are counted, and its start found, without it (final review Minor 1: a follow-up B resent
 * after an unbilled refusal is replayed, not bought again). A call with no REFUSED row is read exactly as before.
 * The skip assumes the preview policy's whole-call resend; a call whose in-gateway loop goes on to attempt+1 after a
 * REFUSED attempt (story calls) is not replayed (not reachable today: story calls run after the replay book closes).
 */
export function replayOf(call: RecordedCall, fingerprint: string): Replay | null {
  const acceptedIndex = call.attempts.length - 1;
  const accepted = call.attempts[acceptedIndex];
  if (accepted === undefined || accepted.outcome !== "OK" || accepted.rawArtifactRef === null || accepted.artifact === null) return null;
  const place = accepted.artifact.attempt;
  const placed = call.attempts.flatMap((attempt, index) => attempt.outcome === "REFUSED" ? [] : [index]);
  if (place === null || !Number.isSafeInteger(place) || place < 1 || place > placed.length) return null;
  const start = placed[placed.length - place]!;
  if (call.attempts[start]!.promptFingerprint !== fingerprint) return null;
  const lastOriginal = call.attempts.findLastIndex((attempt, index) => index >= start && attempt.outcome !== "REFUSED"
    && attempt.promptFingerprint === fingerprint);
  const answered = lastOriginal === acceptedIndex ? null
    : call.attempts.slice(start, acceptedIndex).findLast((attempt) => attempt.outcome !== "REFUSED"
      && attempt.promptFingerprint === fingerprint && attempt.artifact !== null) ?? null;
  return Object.freeze({
    accepted: accepted as Replay["accepted"],
    answered,
    repairAttempts: call.attempts.slice(lastOriginal + 1).filter((attempt) => attempt.outcome !== "REFUSED").length
  });
}

/**
 * THE HAND-OVER RULE (plan 2026-10-31 decision 12; owner Q6: "keep whatever the AI 'found' until that point"). A debate
 * paused at the month wall can continue in a newer release, whose sealed wording may differ. Its copy walks the debate
 * from the start as any reclaim does, and each recorded answer falls in one of three cases:
 *  - THE SAME BYTES: replayed, as always.
 *  - OTHER BYTES UNDER ANOTHER CONTRACT HASH (the record's `contract_hash` is not the request's, so a release moved the
 *    wording): the answer STANDS as recorded, never asked or paid again. The rest of the debate runs under the new wording.
 *  - OTHER BYTES UNDER THE SAME HASH: not an answer to this question; the call is made, as always. So a debate that never
 *    crossed an upload behaves byte for byte as before.
 * WHICH STEPS MAY MIX: finished steps and later steps may stand under different wording. One STEP never does. A step is the
 * AIs asked the same thing and then weighed together: a panel grading one point, the opening positions, readers 2 and 3 of
 * one path. `openStep` names its members before they are asked. Unless every member has an answer under the older wording
 * and none has one under this wording, none of its older answers stands: where the words really changed, the whole step is
 * asked again under the new ones. Where they did not, the same bytes replay and nothing is bought. A call that opens no step
 * is a step of its own: its one recorded answer is the whole of it.
 */
export type ReplayStepMember = Readonly<{ callSiteKey: string; providerRef: string }>;

/** What a recorded answer is to this request; `stood` when it answers another release's wording. */
export type TakenReplay = Replay & Readonly<{ stood: boolean; step: string | null }>;

export interface ReplayBook {
  /** The recorded calls not replayed yet. */
  readonly pending: number;
  /** How many answers stood under another release's wording (a count for the run's one journal line). */
  readonly stood: number;
  /** The step named by `members` is about to be asked under `contractHash` (see THE HAND-OVER RULE). */
  openStep(members: readonly ReplayStepMember[], contractHash: string): void;
  /**
   * A stood answer that this release cannot read (`gateway`): the step's older answers no longer stand. True when no other
   * member of the step had stood yet, so the step can still be asked again whole; false when asking again would mix it.
   */
  refuseStanding(callSiteKey: string): boolean;
  /** How many nodes earlier copies of the run saved (set aside at claim). */
  readonly earlierNodes: number;
  /**
   * This copy saved `nodeId` from the author reply `provenanceRef`: the earliest copy's node with the same reply is the
   * same node (`siteNodeId`).
   */
  adopt(nodeId: string, provenanceRef: string): void;
  /**
   * The node id a call site names for `nodeId` (`JUDGE:review:<node>`): the EARLIEST copy's id for a node an earlier
   * copy saved from the same reply, so the review site is the same site on every copy — the same key in the ledger,
   * the same reviewer rotation (`seatRotationOffset`), the same recorded answer; `nodeId` itself otherwise (a first
   * claim, a new node).
   */
  siteNodeId(nodeId: string): string;
  /** The recorded answer to this request, consumed, or null. `contractHash`: what the request is asked under. */
  take(request: Readonly<{ callSiteKey: string; providerRef: string; fingerprint: string; contractHash?: string }>): TakenReplay | null;
  /**
   * R22 (owner ruling 2026-10-30, "Yes, use the spare debater"): the routes whose recorded answer at a site `matches`
   * accepts is still to be replayed, in record order, each once. The runner reads it for a position an earlier copy
   * handed to a spare debater, so the copy hands it over again before any call (`shapeSpareThatAnswered`).
   */
  answeredBy(matches: (callSiteKey: string) => boolean): readonly string[];
  /** Nothing is replayed any more and the recorded content is dropped (the run's content lease is over). */
  close(): void;
}

/** A site's place on a member's site: the site itself, or the site with a seat or a route after it. */
const onSite = (callSiteKey: string, member: string): boolean => callSiteKey === member || callSiteKey.startsWith(`${member}:`);

/** The fingerprint of the packet a recorded call first sent: what `replayOf` needs to read that call as it was answered. */
function originalFingerprintOf(call: RecordedCall): string | null {
  const accepted = call.attempts[call.attempts.length - 1];
  const place = accepted?.artifact?.attempt;
  if (place === null || place === undefined) return null;
  const placed = call.attempts.filter((attempt) => attempt.outcome !== "REFUSED");
  return placed[placed.length - place]?.promptFingerprint ?? null;
}

export const EMPTY_REPLAY_BOOK: ReplayBook = createReplayBook({ calls: [], earlierNodes: [] });

/** A book over the recorded calls; each is replayed at most once, the earliest match first. */
export function createReplayBook(input: Readonly<{
  calls: readonly RecordedCall[];
  /** Every node earlier copies saved, in save order. */
  earlierNodes: readonly Readonly<{ nodeId: string; provenanceRef: string | null }>[];
}>): ReplayBook {
  const pending = [...input.calls];
  const earliestByReply = new Map<string, string>();
  for (const node of input.earlierNodes) {
    if (node.provenanceRef === null) continue;
    const reply = node.provenanceRef.toLowerCase();
    if (!earliestByReply.has(reply)) earliestByReply.set(reply, node.nodeId.toLowerCase());
  }
  const earlierNodes = input.earlierNodes.length;
  const siteNode = new Map<string, string>();
  const barred: string[] = [];
  /** Each opened step's member sites, and which of them have stood. */
  const steps: Array<Readonly<{ sites: readonly string[]; stood: Set<string> }>> = [];
  let stood = 0;
  const hashOf = (call: RecordedCall): string | undefined => call.attempts[call.attempts.length - 1]?.contractHash;
  const stepOf = (callSiteKey: string) => steps.find((step) => step.sites.some((site) => onSite(callSiteKey, site)));
  return {
    get pending() { return pending.length; },
    get stood() { return stood; },
    earlierNodes,
    openStep(members, contractHash) {
      if (pending.length === 0) return;
      const sites = members.map((member) => member.callSiteKey);
      steps.push(Object.freeze({ sites: Object.freeze(sites), stood: new Set<string>() }));
      const recorded = (member: ReplayStepMember): readonly RecordedCall[] => pending.filter((call) =>
        call.actorRef === member.providerRef && onSite(call.callSiteKey, member.callSiteKey));
      const atSite = pending.filter((call) => sites.some((site) => onSite(call.callSiteKey, site)));
      const whole = members.every((member) => recorded(member).some((call) => hashOf(call) !== contractHash));
      if (!whole || atSite.some((call) => hashOf(call) === contractHash)) barred.push(...sites);
    },
    refuseStanding(callSiteKey) {
      const step = stepOf(callSiteKey);
      barred.push(...(step?.sites ?? [callSiteKey]));
      // This answer was counted when it was taken, and it did not stand after all.
      stood -= 1;
      step?.stood.delete(callSiteKey);
      return step === undefined || step.stood.size === 0;
    },
    adopt(nodeId, provenanceRef) {
      const earliest = earliestByReply.get(provenanceRef.toLowerCase());
      if (earliest !== undefined) siteNode.set(nodeId.toLowerCase(), earliest);
    },
    siteNodeId(nodeId) {
      return siteNode.get(nodeId.toLowerCase()) ?? nodeId;
    },
    take(request) {
      for (const [index, call] of pending.entries()) {
        if (call.actorRef !== request.providerRef || call.callSiteKey !== request.callSiteKey) continue;
        const replay = replayOf(call, request.fingerprint);
        if (replay === null) continue;
        pending.splice(index, 1);
        return Object.freeze({ ...replay, stood: false, step: null });
      }
      // No answer to these bytes. The newest answer here under another release's wording stands, unless its step cannot.
      if (request.contractHash === undefined || barred.some((site) => onSite(request.callSiteKey, site))) return null;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const call = pending[index]!;
        if (call.actorRef !== request.providerRef || call.callSiteKey !== request.callSiteKey) continue;
        const hash = hashOf(call);
        if (hash === undefined || hash === request.contractHash) continue;
        const original = originalFingerprintOf(call);
        const replay = original === null ? null : replayOf(call, original);
        if (replay === null) continue;
        pending.splice(index, 1);
        stood += 1;
        stepOf(request.callSiteKey)?.stood.add(request.callSiteKey);
        return Object.freeze({ ...replay, stood: true, step: request.callSiteKey });
      }
      return null;
    },
    answeredBy(matches) {
      return Object.freeze([...new Set(pending.filter((call) => matches(call.callSiteKey)).map((call) => call.actorRef))]);
    },
    close() {
      pending.splice(0, pending.length);
      earliestByReply.clear();
    }
  };
}

/**
 * A member's gateway that answers a call the book holds from the record, and sends every other call on to `inner`
 * unchanged. The content is rebuilt as the gateway decided it (`rebuildRecordedCallContent`); a recorded call whose
 * content cannot be rebuilt is made again. Nothing is reserved, spent, counted or written for a replayed call; the
 * debate's keep-alive is asked first (`mayCall`), as before a real call, so a copy that lost the run replays nothing.
 *
 * Refused-repair salvage (2026-10-16): with `structureReplay` (the runner sets it only on a run whose structure-repair
 * route is wired), the step's structure readers (`structureReplayReaders`) are handed to the rebuild too, so a call the
 * first copy's gateway rescued in code (A1) or answered with its follow-up (B) is replayed, not bought again. Without it
 * (hosted, local: no route) the rebuild is today's.
 */
/** A stood answer could not be read and the step's other members already stood: asking it again would mix the step. */
export const RUN_HANDOVER_IMPOSSIBLE = "RUN_HANDOVER_IMPOSSIBLE" as const;

export function replayingGateway(
  book: ReplayBook,
  inner: ProviderGateway,
  /** Asked before an answer is replayed: a copy that must make no further call (its claim lost, its time up) stops. */
  mayCall: () => void = () => undefined,
  /** The run's structure-repair route is wired: replay A1-rescued and B-answered calls too. */
  structureReplay = false
): ProviderGateway {
  return Object.freeze({
    call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
      if (book.pending === 0) return inner.call(request);
      mayCall();
      const replay = book.take({
        callSiteKey: request.callSiteKey,
        providerRef: request.providerRef,
        // R22: the record holds a passage by its name, so the request is compared in that form.
        fingerprint: canonicalPromptFingerprint(passageRecordedPacket(request.runId, request.packet).messages),
        contractHash: request.contractHash
      });
      if (replay === null) return inner.call(request);
      const { accepted, answered, repairAttempts } = replay;
      const content = rebuildRecordedCallContent({
        accepted: readRecordedProviderReply(accepted.artifact.rawText, accepted.artifact.provider),
        answered: answered?.artifact == null ? null : readRecordedProviderReply(answered.artifact.rawText, answered.artifact.provider),
        ...(request.classifyContent === undefined ? {} : { classifyContent: request.classifyContent }),
        ...(structureReplay ? structureReplayReaders(request) ?? {} : {})
      });
      if (content === null) {
        if (replay.stood && !book.refuseStanding(request.callSiteKey)) {
          throw new TypedDomainError(RUN_HANDOVER_IMPOSSIBLE, "A recorded answer cannot be read and its step has answers standing");
        }
        return inner.call(request);
      }
      return Object.freeze({
        rawArtifactRef: accepted.rawArtifactRef,
        ledgerEntryRef: accepted.ledgerEntryRef,
        content,
        provider: accepted.artifact.provider as ProviderWireKind,
        model: accepted.artifact.modelId,
        maker: accepted.artifact.maker,
        modelVersion: accepted.artifact.modelVersion ?? accepted.artifact.modelId,
        ...(accepted.thinkingLevel === null ? {} : { thinkingLevel: accepted.thinkingLevel }),
        reasoningTokens: accepted.artifact.thinkingTokens,
        repairAttempts
      });
    }
  });
}

/**
 * The book for one claimed work item, read inside the run's content lease (prompts and replies are debate content):
 * every model call the run's earlier copies recorded for it, and every node they saved. Empty on a first claim.
 */
export async function readReplayBook(pool: Pool, runId: string, workItemId: string): Promise<ReplayBook> {
  const nodes = await pool.query<{ node_id: string; provenance_ref: string | null }>(
    `SELECT node_id::text, provenance_ref::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]);
  const rows = await pool.query<{
    call_site_key: string; actor_ref: string; outcome: string; ledger_entry_id: string; raw_artifact_ref: string | null;
    thinking_level: string | null; attempt_id: string | null; contract_hash: string;
    prompt_fingerprint: string | null; prompt_text: string | null; prompt_ciphertext: CryptoEnvelope | null;
    raw_text: string | null; artifact_ciphertext: CryptoEnvelope | null; provider: string | null; model_id: string | null;
    maker: string | null; model_version: string | null; thinking_tokens: number | null; reply_attempt: string | null;
  }>(
    `SELECT entry.call_site_key, entry.actor_ref, entry.outcome, entry.ledger_entry_id::text,
            entry.raw_artifact_ref::text, entry.thinking_level, entry.attempt_id::text, entry.contract_hash,
            prompt.prompt_fingerprint, prompt.prompt_text, prompt.content_ciphertext AS prompt_ciphertext,
            artifact.raw_text, artifact.content_ciphertext AS artifact_ciphertext, artifact.provider, artifact.model_id,
            artifact.maker, artifact.model_version, artifact.thinking_tokens,
            artifact.metadata_json->>'attempt' AS reply_attempt
       FROM ledger.ledger_entry AS entry
       LEFT JOIN ledger.call_prompt AS prompt ON prompt.attempt_id = entry.attempt_id AND prompt.run_id = entry.run_id
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref AND artifact.run_id = entry.run_id
      WHERE entry.run_id=$1 AND entry.subject_item_id=$2 AND entry.action_kind='MODEL_CALL'
      ORDER BY entry.sequence`, [runId, workItemId]);
  if (rows.rows.length === 0 && nodes.rows.length === 0) return EMPTY_REPLAY_BOOK;
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    // R22 (0139): a reader's reply is recorded by name; its bytes come back from their own store while the debate runs. A name
    // with no stored text reads as no reply: the call cannot be replayed, the path an unreadable reply already takes.
    const opened = rows.rows.map((row) => row.raw_artifact_ref === null || row.provider === null ? null
      : decryptLeasedContentForRun<Readonly<{ rawText?: unknown }>>(
        leased, "ledger.raw_artifact", row.raw_artifact_ref, row.artifact_ciphertext, { rawText: row.raw_text }));
    const named = [...new Set(opened.flatMap((reply) => { const id = typeof reply?.rawText === "string" ? webReplyTextIdOf(reply.rawText) : null;
      return id === null ? [] : [id]; }))];
    const storedReplies = new Map<string, string>();
    if (named.length > 0) {
      for (const stored of (await new PostgresPassageRetentionRepository(pool).readReplyTexts(runId, named)) ?? []) {
        const text = decryptLeasedContentForRun<unknown>(leased, WEB_REPLY_TEXT_CARRIER, stored.artifact_id, stored.content, null);
        if (typeof text === "string") storedReplies.set(stored.artifact_id, text);
      }
    }
    const replyOf = (reply: Readonly<{ rawText?: unknown }> | null): string | null => {
      if (typeof reply?.rawText !== "string") return null;
      const id = webReplyTextIdOf(reply.rawText);
      return id === null ? reply.rawText : storedReplies.get(id) ?? null;
    };
    const attempts = rows.rows.map((row, index): RecordedAttempt => {
      const prompt = row.attempt_id === null || (row.prompt_text === null && row.prompt_ciphertext === null) ? null
        : decryptLeasedContentForRun<Readonly<{ promptFingerprint?: unknown }>>(
          leased, "ledger.call_prompt", row.attempt_id, row.prompt_ciphertext, { promptFingerprint: row.prompt_fingerprint });
      const replyText = replyOf(opened[index] ?? null);
      return Object.freeze({
        callSiteKey: row.call_site_key,
        actorRef: row.actor_ref,
        outcome: row.outcome,
        ledgerEntryRef: row.ledger_entry_id,
        rawArtifactRef: row.raw_artifact_ref,
        thinkingLevel: row.thinking_level,
        contractHash: row.contract_hash,
        promptFingerprint: typeof prompt?.promptFingerprint === "string" ? prompt.promptFingerprint : null,
        artifact: replyText === null ? null : Object.freeze({
          rawText: replyText, provider: row.provider!, modelId: row.model_id!, maker: row.maker!,
          modelVersion: row.model_version, thinkingTokens: row.thinking_tokens,
          attempt: row.reply_attempt === null || !/^[0-9]{1,3}$/u.test(row.reply_attempt) ? null : Number(row.reply_attempt)
        })
      });
    });
    await leased.assertLive();
    return createReplayBook({
      calls: recordedCalls(attempts),
      earlierNodes: nodes.rows.map((row) => Object.freeze({ nodeId: row.node_id, provenanceRef: row.provenance_ref }))
    });
  } finally {
    await leased.close();
  }
}
