// Reclaim resume (docs/superpowers/specs/2026-10-14-reclaim-resume-design.md): a copy of a debate that claims a work
// item an earlier copy of the run had already argued part of runs the debate from the start, and every call the
// earlier copy got answered is REPLAYED from the record — the same raw artifact and ledger entry, no vendor contact, no
// new ledger row, no money — instead of being bought a second time. Owner ruling 2026-10-14 (the true resume).
import {
  decryptLeasedContentForRun,
  prepareLeasedContentEncryptionForRun,
  type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import {
  readRecordedProviderReply,
  rebuildRecordedCallContent,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway,
  type ProviderWireKind
} from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";

/** One recorded reply: the vendor's own bytes (`raw_artifact.raw_text`) and who gave it. */
export interface RecordedArtifact {
  readonly rawText: string;
  readonly provider: string;
  readonly modelId: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly thinkingTokens: number | null;
}

/** One recorded attempt of a model call: its ledger row, its prompt's fingerprint and its reply, in ledger order. */
export interface RecordedAttempt {
  readonly callSiteKey: string;
  readonly actorRef: string;
  readonly outcome: string;
  readonly ledgerEntryRef: string;
  readonly rawArtifactRef: string | null;
  readonly thinkingLevel: string | null;
  /** The scorecard's canonical fingerprint of the attempt's prompt (`ledger.call_prompt`); null when none was kept. */
  readonly promptFingerprint: string | null;
  readonly artifact: RecordedArtifact | null;
}

/**
 * A recorded call that was ANSWERED: the attempts at one site and member, in ledger order, since the previous answer
 * there, the last one OK. Its first attempts may belong to an earlier gateway call at the site that failed in full.
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
 * How a recorded call answers a request whose prompt has `fingerprint`, or null when it does not: the request must be
 * one of the call's original packets (every gateway call starts with its original packet; a repair packet carries the
 * rejected reply, so no fresh request can match one). The repairs counted are those after that packet was last sent.
 */
export function replayOf(call: RecordedCall, fingerprint: string): Replay | null {
  const acceptedIndex = call.attempts.length - 1;
  const accepted = call.attempts[acceptedIndex];
  if (accepted === undefined || accepted.outcome !== "OK" || accepted.rawArtifactRef === null || accepted.artifact === null) return null;
  const lastOriginal = call.attempts.findLastIndex((attempt) => attempt.promptFingerprint === fingerprint);
  if (lastOriginal < 0) return null;
  const before = call.attempts[acceptedIndex - 1];
  return Object.freeze({
    accepted: accepted as Replay["accepted"],
    answered: lastOriginal === acceptedIndex || before === undefined || before.promptFingerprint !== fingerprint ? null : before,
    repairAttempts: acceptedIndex - lastOriginal
  });
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

export interface ReplayBook {
  /** The recorded calls not replayed yet. */
  readonly pending: number;
  /** How many nodes earlier copies of the run saved (set aside at claim). */
  readonly earlierNodes: number;
  /**
   * This copy saved `nodeId` from the author reply `provenanceRef`: an earlier copy's node with the same reply is the
   * same node, so a recorded call site naming it (`JUDGE:review:<node>`) names this copy's node from now on.
   */
  adopt(nodeId: string, provenanceRef: string): void;
  /** The recorded answer to this request, consumed, or null. */
  take(request: Readonly<{ callSiteKey: string; providerRef: string; fingerprint: string }>): Replay | null;
  /** Nothing is replayed any more (the run's content lease is over). */
  close(): void;
}

export const EMPTY_REPLAY_BOOK: ReplayBook = createReplayBook({ calls: [], earlierNodes: [] });

/** A book over the recorded calls; each is replayed at most once, the earliest match first. */
export function createReplayBook(input: Readonly<{
  calls: readonly RecordedCall[];
  earlierNodes: readonly Readonly<{ nodeId: string; provenanceRef: string | null }>[];
}>): ReplayBook {
  const pending = [...input.calls];
  const sameNode = new Map<string, string>();
  const translated = (key: string): string => key.replace(UUID, (id) => sameNode.get(id.toLowerCase()) ?? id);
  return {
    get pending() { return pending.length; },
    earlierNodes: input.earlierNodes.length,
    adopt(nodeId, provenanceRef) {
      for (const node of input.earlierNodes) {
        if (node.provenanceRef !== null && node.provenanceRef.toLowerCase() === provenanceRef.toLowerCase()) {
          sameNode.set(node.nodeId.toLowerCase(), nodeId);
        }
      }
    },
    take(request) {
      for (const [index, call] of pending.entries()) {
        if (call.actorRef !== request.providerRef || translated(call.callSiteKey) !== request.callSiteKey) continue;
        const replay = replayOf(call, request.fingerprint);
        if (replay === null) continue;
        pending.splice(index, 1);
        return replay;
      }
      return null;
    },
    close() {
      pending.splice(0, pending.length);
    }
  };
}

/**
 * A member's gateway that answers a call the book holds from the record, and sends every other call on to `inner`
 * unchanged. The content is rebuilt as the gateway decided it (`rebuildRecordedCallContent`); a recorded call whose
 * content cannot be rebuilt is made again. Nothing is reserved, spent, counted or written for a replayed call.
 */
export function replayingGateway(book: ReplayBook, inner: ProviderGateway): ProviderGateway {
  return Object.freeze({
    call: async (request: ProviderCallRequest): Promise<ProviderCallResult> => {
      if (book.pending === 0) return inner.call(request);
      const replay = book.take({
        callSiteKey: request.callSiteKey,
        providerRef: request.providerRef,
        fingerprint: canonicalPromptFingerprint(request.packet.messages)
      });
      if (replay === null) return inner.call(request);
      const { accepted, answered, repairAttempts } = replay;
      const content = rebuildRecordedCallContent({
        accepted: readRecordedProviderReply(accepted.artifact.rawText, accepted.artifact.provider),
        answered: answered?.artifact == null ? null : readRecordedProviderReply(answered.artifact.rawText, answered.artifact.provider),
        ...(request.classifyContent === undefined ? {} : { classifyContent: request.classifyContent })
      });
      if (content === null) return inner.call(request);
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
    thinking_level: string | null; attempt_id: string | null;
    prompt_fingerprint: string | null; prompt_text: string | null; prompt_ciphertext: CryptoEnvelope | null;
    raw_text: string | null; artifact_ciphertext: CryptoEnvelope | null; provider: string | null; model_id: string | null;
    maker: string | null; model_version: string | null; thinking_tokens: number | null;
  }>(
    `SELECT entry.call_site_key, entry.actor_ref, entry.outcome, entry.ledger_entry_id::text,
            entry.raw_artifact_ref::text, entry.thinking_level, entry.attempt_id::text,
            prompt.prompt_fingerprint, prompt.prompt_text, prompt.content_ciphertext AS prompt_ciphertext,
            artifact.raw_text, artifact.content_ciphertext AS artifact_ciphertext, artifact.provider, artifact.model_id,
            artifact.maker, artifact.model_version, artifact.thinking_tokens
       FROM ledger.ledger_entry AS entry
       LEFT JOIN ledger.call_prompt AS prompt ON prompt.attempt_id = entry.attempt_id AND prompt.run_id = entry.run_id
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref AND artifact.run_id = entry.run_id
      WHERE entry.run_id=$1 AND entry.subject_item_id=$2 AND entry.action_kind='MODEL_CALL'
      ORDER BY entry.sequence`, [runId, workItemId]);
  if (rows.rows.length === 0 && nodes.rows.length === 0) return EMPTY_REPLAY_BOOK;
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    const attempts = rows.rows.map((row): RecordedAttempt => {
      const prompt = row.attempt_id === null || (row.prompt_text === null && row.prompt_ciphertext === null) ? null
        : decryptLeasedContentForRun<Readonly<{ promptFingerprint?: unknown }>>(
          leased, "ledger.call_prompt", row.attempt_id, row.prompt_ciphertext, { promptFingerprint: row.prompt_fingerprint });
      const reply = row.raw_artifact_ref === null || row.provider === null ? null
        : decryptLeasedContentForRun<Readonly<{ rawText?: unknown }>>(
          leased, "ledger.raw_artifact", row.raw_artifact_ref, row.artifact_ciphertext, { rawText: row.raw_text });
      return Object.freeze({
        callSiteKey: row.call_site_key,
        actorRef: row.actor_ref,
        outcome: row.outcome,
        ledgerEntryRef: row.ledger_entry_id,
        rawArtifactRef: row.raw_artifact_ref,
        thinkingLevel: row.thinking_level,
        promptFingerprint: typeof prompt?.promptFingerprint === "string" ? prompt.promptFingerprint : null,
        artifact: reply === null || typeof reply.rawText !== "string" ? null : Object.freeze({
          rawText: reply.rawText, provider: row.provider!, modelId: row.model_id!, maker: row.maker!,
          modelVersion: row.model_version, thinkingTokens: row.thinking_tokens
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
