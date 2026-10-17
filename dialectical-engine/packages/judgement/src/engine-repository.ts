/**
 * ENGINE VERDICT STORAGE (engine redesign R2, spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.2b,
 * §4.9; INTERFACE §8.5, §8.7, §9.7; migration 0121): one row per investigated "cannot assess" point
 * (ledger.point_investigation) and one per seated comparing judge (ledger.verdict_vote). Append-only.
 *
 * Plain words: the investigator's missing piece, what it found and its reason, and a judge's reasons, are debate text:
 * sealed per row on an encrypted run (carriers ledger.point_investigation and ledger.verdict_vote, attested to the
 * row's point or seat) and kept in the clear on a legacy run, as the map's and the story's repositories do. Every other
 * column is a code, an id, a count or a flag; a record that breaks a rule is refused typed before anything is sealed
 * (ruling T7-PRIV), and a refusal names a field, never a value, so no AI-written text reaches an error message.
 *
 * A row is written once: a second write of the same point or seat (a retry, or a later copy that took the run over
 * after a crash, migration 0119) answers ALREADY_PRESENT and changes nothing. An investigation on a node a later copy
 * set aside ('stale') is not read back. A vote keeps the root its letter named when it was first written; the letter
 * is fixed per debate, so readers use the letter. An erased run answers RUN_ERASED and reads as empty.
 */
import { z } from "zod";
import {
  CONTENT_JSON_SENTINEL,
  decryptLeasedContentForRun,
  encryptAttestedLeasedContentForRun,
  prepareLeasedContentEncryptionForRun,
  withRunContentLease,
  type AttestedContentEnvelope,
  type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import {
  ENGINE_ANSWER_LETTERS,
  ENGINE_QUESTION_KINDS,
  TypedDomainError,
  type EngineAnswerLetter,
  type EngineQuestionKind
} from "@debateai/kernel";

/** INTERFACE §8.5: the result recorded for every qualifying point (0121's point_investigation_result_closed). */
export const POINT_INVESTIGATION_RESULTS = Object.freeze(["HOLDS", "FAILS", "DEAD_END", "INVESTIGATION_UNAVAILABLE",
  "INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"] as const);
export type PointInvestigationResult = typeof POINT_INVESTIGATION_RESULTS[number];
/** INTERFACE §8.3: what the investigator's supplied piece rests on (0121's point_investigation_basis_closed). */
export const POINT_INVESTIGATION_BASES = Object.freeze(["established", "assumption", "none"] as const);
export type PointInvestigationBasis = typeof POINT_INVESTIGATION_BASES[number];
/** INTERFACE §9.4 rule 1: why a recorded vote was not counted (0121's verdict_vote_not_counted_reason_closed). */
export const VERDICT_VOTE_NOT_COUNTED_REASONS = Object.freeze(["OWN_MAKER", "JUDGE_FAILED"] as const);
export type VerdictVoteNotCountedReason = typeof VERDICT_VOTE_NOT_COUNTED_REASONS[number];

export type EngineRecordOutcome = "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";
/** The AI that made the call, as codes: its maker, its provider reference and its model id. */
export type EngineCallIdentity = Readonly<{ maker: string; providerRef: string; modelId: string }>;

export type PointInvestigationRecord = Readonly<{
  runId: string;
  nodeId: string;
  /** Place in the fixed order (INTERFACE §8.4), 1-based; capped points continue the count. */
  investigationOrder: number;
  result: PointInvestigationResult;
  /** Present exactly for HOLDS, FAILS and DEAD_END. */
  basis: PointInvestigationBasis | null;
  /**
   * Null exactly for INVESTIGATION_SKIPPED and INVESTIGATION_CAPPED. INVESTIGATION_UNAVAILABLE always names the
   * investigator planned for the point, also after a money stop when no call was made (plan deviation 20).
   */
  investigator: EngineCallIdentity | null;
  rawArtifactRef: string | null;
  /** "Standings moved" (INTERFACE §8.6), a record only; only beside an outcome. */
  standings: Readonly<{ leaderWithoutRootNodeId: string; leaderWithRootNodeId: string; moved: boolean }> | null;
  /**
   * The AI's words; present exactly for HOLDS, FAILS and DEAD_END; `found` is blank (`found.trim() === ""`, A13's
   * reader's own rule) exactly when the basis is "none". Stored as given; A13's reader already hands it back trimmed.
   */
  content: Readonly<{ missing: string; found: string; reason: string }> | null;
}>;
export type StoredPointInvestigation = PointInvestigationRecord & Readonly<{ recordedAt: string }>;

export type VerdictVoteChoice = Readonly<{
  letter: EngineAnswerLetter;
  /** The root the letter names (letters are fixed per debate: A = the first answer argued). */
  rootNodeId: string;
  conditional: boolean;
  questionKind: EngineQuestionKind;
  sameAs: readonly (readonly EngineAnswerLetter[])[];
  reasons: string;
}>;
export type VerdictVoteRecord = Readonly<{
  runId: string;
  judgeSeat: number;
  judge: EngineCallIdentity;
  rawArtifactRef: string | null;
  /** Null = the judge failed after repairs; then not counted, for JUDGE_FAILED. */
  choice: VerdictVoteChoice | null;
  counted: boolean;
  notCountedReason: VerdictVoteNotCountedReason | null;
}>;
export type StoredVerdictVote = VerdictVoteRecord & Readonly<{ recordedAt: string }>;

/** 0121's numeric bounds, held here too so a breach is refused typed (and value-free) before any seal. */
const RECORD_LIMITS = Object.freeze({
  orderMin: 1,
  smallintMax: 32767,
  seatMin: 1,
  seatMax: 5,
  groupsMax: Math.floor(ENGINE_ANSWER_LETTERS.length / 2),
  groupMin: 2,
  groupMax: ENGINE_ANSWER_LETTERS.length
});
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** 0069's core.jsonb_is_code_token: one token of 1..256 characters from a closed set (no whitespace). */
const CODE_TOKEN = /^[[\]A-Za-z0-9_.:@/+>=#-]{1,256}$/u;
const RESULTS: ReadonlySet<string> = new Set<string>(POINT_INVESTIGATION_RESULTS);
const OUTCOMES: ReadonlySet<string> = new Set<PointInvestigationResult>(["HOLDS", "FAILS", "DEAD_END"]);
/**
 * The two results that name no investigator (0121's point_investigation_investigator_whole). Not "never called":
 * an UNAVAILABLE row after a money stop made no call either, yet names its planned investigator (plan deviation 20).
 */
const NO_INVESTIGATOR: ReadonlySet<string> = new Set<PointInvestigationResult>(["INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"]);
const BASES: ReadonlySet<string> = new Set<string>(POINT_INVESTIGATION_BASES);
const NOT_COUNTED: ReadonlySet<string> = new Set<string>(VERDICT_VOTE_NOT_COUNTED_REASONS);
const LETTERS: ReadonlySet<string> = new Set<string>(ENGINE_ANSWER_LETTERS);
const KINDS: ReadonlySet<string> = new Set<string>(ENGINE_QUESTION_KINDS);
const SENTINEL = JSON.stringify(CONTENT_JSON_SENTINEL);

const investigationContent = z.union([
  z.object({ missing: z.string(), found: z.string(), reason: z.string() }).strict(),
  z.object({}).strict()
]);
const voteContent = z.union([z.object({ reasons: z.string() }).strict(), z.object({}).strict()]);
const sameAsColumn = z.array(z.array(z.enum(ENGINE_ANSWER_LETTERS)));

const recordInvalid = (field: string): TypedDomainError => new TypedDomainError("ENGINE_RECORD_INVALID", `ENGINE_RECORD_INVALID: ${field}`);
const rowInvalid = (detail: string): TypedDomainError => new TypedDomainError("ENGINE_ROW_INVALID", `ENGINE_ROW_INVALID: ${detail}`);

function identityBreach(identity: EngineCallIdentity): string | null {
  if (!CODE_TOKEN.test(identity.maker)) return "maker";
  if (!CODE_TOKEN.test(identity.providerRef)) return "providerRef";
  if (!CODE_TOKEN.test(identity.modelId)) return "modelId";
  return null;
}

/** The first field of an investigation record that breaks 0121's rules, or null. */
function pointInvestigationBreach(input: PointInvestigationRecord): string | null {
  if (!UUID_TEXT.test(input.runId)) return "runId";
  if (!UUID_TEXT.test(input.nodeId)) return "nodeId";
  if (!Number.isSafeInteger(input.investigationOrder) || input.investigationOrder < RECORD_LIMITS.orderMin
    || input.investigationOrder > RECORD_LIMITS.smallintMax) return "investigationOrder";
  if (!RESULTS.has(input.result)) return "result";
  const outcome = OUTCOMES.has(input.result);
  if (outcome !== (input.basis !== null) || (input.basis !== null && !BASES.has(input.basis))) return "basis";
  if (outcome !== (input.content !== null)) return "content";
  // pre-flight PF-R2a6.1: `found` is blank by A13's reader's rule (trim), so a whitespace-only reply with basis "none"
  // is never refused here after the reader accepted it (A14 writes with no catch: a refusal would fail the debate).
  if (input.content !== null && (input.content.missing.trim() === "" || input.content.reason.trim() === ""
    || (input.content.found.trim() === "") !== (input.basis === "none"))) return "content";
  // pre-flight PF-R2a8.1: UNAVAILABLE (a money stop too) names its planned investigator; only SKIPPED / CAPPED name none.
  if (NO_INVESTIGATOR.has(input.result) !== (input.investigator === null)) return "investigator";
  if (input.investigator !== null) {
    const breach = identityBreach(input.investigator);
    if (breach !== null) return `investigator.${breach}`;
  }
  if (input.rawArtifactRef !== null && !UUID_TEXT.test(input.rawArtifactRef)) return "rawArtifactRef";
  if (outcome && input.rawArtifactRef === null) return "rawArtifactRef";
  if (input.standings !== null) {
    if (!outcome) return "standings";
    if (!UUID_TEXT.test(input.standings.leaderWithoutRootNodeId)) return "standings.leaderWithoutRootNodeId";
    if (!UUID_TEXT.test(input.standings.leaderWithRootNodeId)) return "standings.leaderWithRootNodeId";
    const differ = input.standings.leaderWithoutRootNodeId.toLowerCase() !== input.standings.leaderWithRootNodeId.toLowerCase();
    if (input.standings.moved !== differ) return "standings.moved";
  }
  return null;
}

/** The first field of a vote record that breaks 0121's rules, or null. */
function verdictVoteBreach(input: VerdictVoteRecord): string | null {
  if (!UUID_TEXT.test(input.runId)) return "runId";
  if (!Number.isSafeInteger(input.judgeSeat) || input.judgeSeat < RECORD_LIMITS.seatMin || input.judgeSeat > RECORD_LIMITS.seatMax) return "judgeSeat";
  const identity = identityBreach(input.judge);
  if (identity !== null) return `judge.${identity}`;
  if (input.rawArtifactRef !== null && !UUID_TEXT.test(input.rawArtifactRef)) return "rawArtifactRef";
  if (input.notCountedReason !== null && !NOT_COUNTED.has(input.notCountedReason)) return "notCountedReason";
  if (input.counted !== (input.notCountedReason === null)) return "counted";
  const choice = input.choice;
  if ((choice === null) !== (input.notCountedReason === "JUDGE_FAILED")) return "choice";
  if (choice === null) return null;
  if (!LETTERS.has(choice.letter)) return "choice.letter";
  if (!UUID_TEXT.test(choice.rootNodeId)) return "choice.rootNodeId";
  if (typeof choice.conditional !== "boolean") return "choice.conditional";
  if (!KINDS.has(choice.questionKind)) return "choice.questionKind";
  if (choice.sameAs.length > RECORD_LIMITS.groupsMax) return "choice.sameAs";
  // Task A9's review: 0121's verdict_vote_same_as_codes CHECK admits a letter repeated inside one group and a letter in
  // two groups, so each letter is named at most once across all groups here; the later group is the one refused. The
  // record carries no answer count, so letters past the debate's answers are bounded only by A to H (the CHECK's own).
  const grouped = new Set<string>();
  for (const [index, group] of choice.sameAs.entries()) {
    if (group.length < RECORD_LIMITS.groupMin || group.length > RECORD_LIMITS.groupMax
      || group.some((letter) => !LETTERS.has(letter))) return `choice.sameAs[${String(index)}]`;
    for (const letter of group) {
      if (grouped.has(letter)) return `choice.sameAs[${String(index)}]`;
      grouped.add(letter);
    }
  }
  if (choice.reasons.trim() === "") return "choice.reasons";
  if (input.rawArtifactRef === null) return "rawArtifactRef";
  return null;
}

// Names of their own (pre-flight PF-R2a6.7): the orphan audit keys declarations by bare function name, and
// packages/map/src/repository.ts already declares `pgError` / `isPrivateContentErased` (packages/story exports the latter).
function engineErrorRow(error: unknown): { code: unknown; message: unknown } | null {
  return typeof error === "object" && error !== null ? error as { code: unknown; message: unknown } : null;
}

function isEngineContentErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  const row = engineErrorRow(error);
  return row !== null && row.code === "55000" && row.message === "PRIVATE_CONTENT_ERASED";
}

/**
 * RUN_ERASED for 0040's barrier (or the lease's own check), and for 0121's attestation guard's missing secret ONLY when
 * the run is an encrypted run whose private content is no longer live (the map repository's rule): on a live run a
 * missing secret is a defect and stays loud.
 */
async function erasedRun(pool: Pool, error: unknown, runId: string): Promise<boolean> {
  if (isEngineContentErased(error)) return true;
  const row = engineErrorRow(error);
  if (row === null || row.code !== "55000" || row.message !== "CONTENT_ATTESTATION_SECRET_UNRESOLVED") return false;
  const confirmed = await pool.query<{ erased: boolean }>(
    `SELECT COALESCE(run.content_encryption_version = 1 AND NOT core.run_private_content_is_live(run.run_id), false) AS erased
       FROM core.run AS run WHERE run.run_id = $1`, [runId]);
  return confirmed.rows[0]?.erased === true;
}

/** `read` under the run's content lease; an erased run reads as `absent`. */
async function leasedRead<T>(pool: Pool, runId: string, absent: T, read: () => Promise<T>): Promise<T> {
  try {
    return await withRunContentLease(pool, [runId], read);
  } catch (error) {
    if (isEngineContentErased(error)) return absent;
    throw error;
  }
}

type EngineCarrier = "ledger.point_investigation" | "ledger.verdict_vote";

/** One row's seal, inside the run's content lease (the caller holds it); null on a legacy run. */
async function sealRow(pool: Pool, runId: string, carrier: EngineCarrier, primaryKey: string, value: unknown): Promise<AttestedContentEnvelope | null> {
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    const sealed = encryptAttestedLeasedContentForRun(leased, carrier, primaryKey, value);
    await leased.assertLive();
    return sealed;
  } finally {
    await leased.close();
  }
}

/** One insert of a sealed or clear row; ON CONFLICT keeps the first row. */
async function insertOnce(pool: Pool, runId: string, carrier: EngineCarrier, primaryKey: string, value: unknown,
  insert: (content: string, envelope: string | null, attestation: Buffer | null) => Promise<{ rowCount: number | null }>): Promise<EngineRecordOutcome> {
  try {
    return await withRunContentLease(pool, [runId], async () => {
      const sealed = await sealRow(pool, runId, carrier, primaryKey, value);
      const inserted = await insert(sealed === null ? JSON.stringify(value) : SENTINEL,
        sealed === null ? null : JSON.stringify(sealed.envelope), sealed === null ? null : Buffer.from(sealed.attestation));
      return inserted.rowCount === 1 ? "INSERTED" as const : "ALREADY_PRESENT" as const;
    });
  } catch (error) {
    if (await erasedRun(pool, error, runId)) return "RUN_ERASED";
    throw error;
  }
}

type InvestigationRow = Readonly<{ node_id: string; investigation_order: number; result: string; basis: string | null;
  maker: string | null; provider_ref: string | null; model_id: string | null; raw_artifact_ref: string | null;
  leader_without_root_node_id: string | null; leader_with_root_node_id: string | null; standings_moved: boolean | null;
  content: unknown; content_ciphertext: CryptoEnvelope | null; recorded_at: Date }>;

type VoteRow = Readonly<{ judge_seat: number; maker: string; provider_ref: string; model_id: string; raw_artifact_ref: string | null;
  chosen_letter: string | null; chosen_root_node_id: string | null; conditional: boolean | null; counted: boolean;
  not_counted_reason: string | null; question_kind: string | null; same_as: unknown; content: unknown;
  content_ciphertext: CryptoEnvelope | null; recorded_at: Date }>;

export class PointInvestigationRepository {
  constructor(private readonly pool: Pool) {}

  /** One qualifying point's investigation, once (INTERFACE §8.5, §8.7). */
  async recordPointInvestigation(input: PointInvestigationRecord): Promise<EngineRecordOutcome> {
    const breach = pointInvestigationBreach(input);
    if (breach !== null) throw recordInvalid(breach);
    const runId = input.runId.toLowerCase();
    const nodeId = input.nodeId.toLowerCase();
    const value = input.content === null ? {} : { missing: input.content.missing, found: input.content.found, reason: input.content.reason };
    return insertOnce(this.pool, runId, "ledger.point_investigation", nodeId, value, (content, envelope, attestation) => this.pool.query(
      `INSERT INTO ledger.point_investigation (run_id, node_id, investigation_order, result, basis, maker, provider_ref, model_id,
         raw_artifact_ref, leader_without_root_node_id, leader_with_root_node_id, standings_moved, content, content_ciphertext, content_attestation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)
       ON CONFLICT (run_id, node_id) DO NOTHING`,
      [runId, nodeId, input.investigationOrder, input.result, input.basis, input.investigator?.maker ?? null,
        input.investigator?.providerRef ?? null, input.investigator?.modelId ?? null, input.rawArtifactRef?.toLowerCase() ?? null,
        input.standings?.leaderWithoutRootNodeId.toLowerCase() ?? null, input.standings?.leaderWithRootNodeId.toLowerCase() ?? null,
        input.standings?.moved ?? null, content, envelope, attestation]));
  }

  /** The run's investigations in their fixed order; rows on set-aside ('stale') nodes are skipped; an erased run has none. */
  readPointInvestigationsForRun(runId: string): Promise<readonly StoredPointInvestigation[]> {
    const run = runId.toLowerCase();
    return leasedRead(this.pool, run, Object.freeze([]), async () => {
      const rows = (await this.pool.query<InvestigationRow>(
        `SELECT investigation.node_id::text AS node_id, investigation.investigation_order, investigation.result, investigation.basis,
                investigation.maker, investigation.provider_ref, investigation.model_id,
                investigation.raw_artifact_ref::text AS raw_artifact_ref,
                investigation.leader_without_root_node_id::text AS leader_without_root_node_id,
                investigation.leader_with_root_node_id::text AS leader_with_root_node_id,
                investigation.standings_moved, investigation.content, investigation.content_ciphertext, investigation.recorded_at
           FROM ledger.point_investigation AS investigation
           JOIN core.node AS node ON node.run_id = investigation.run_id AND node.node_id = investigation.node_id
          WHERE investigation.run_id = $1 AND node.generation_status IS DISTINCT FROM 'stale'
          ORDER BY investigation.investigation_order, investigation.node_id`, [run])).rows;
      if (rows.length === 0) return Object.freeze([]);
      const leased = await prepareLeasedContentEncryptionForRun(this.pool, run);
      try {
        const read = rows.map((row) => investigationOf(run, row,
          decryptLeasedContentForRun<unknown>(leased, "ledger.point_investigation", row.node_id, row.content_ciphertext, row.content)));
        await leased.assertLive();
        return Object.freeze(read);
      } finally {
        await leased.close();
      }
    });
  }

  /**
   * Codes only (R2a final wave, Ruling W4): each investigation's node and result, from plain columns, with the same
   * stale join and order as `readPointInvestigationsForRun`. No lease and no decryption: the review catch-up reads the
   * statuses alone and never the AI's words.
   */
  async readPointInvestigationResultsForRun(runId: string): Promise<readonly Readonly<{ nodeId: string; result: PointInvestigationResult }>[]> {
    const rows = (await this.pool.query<{ node_id: string; result: string }>(
      `SELECT investigation.node_id::text AS node_id, investigation.result
         FROM ledger.point_investigation AS investigation
         JOIN core.node AS node ON node.run_id = investigation.run_id AND node.node_id = investigation.node_id
        WHERE investigation.run_id = $1 AND node.generation_status IS DISTINCT FROM 'stale'
        ORDER BY investigation.investigation_order, investigation.node_id`, [runId.toLowerCase()])).rows;
    return Object.freeze(rows.map((row) => {
      if (!RESULTS.has(row.result)) throw rowInvalid("ledger.point_investigation result");
      return Object.freeze({ nodeId: row.node_id, result: row.result as PointInvestigationResult });
    }));
  }
}

export class VerdictVoteRepository {
  constructor(private readonly pool: Pool) {}

  /** One seated judge's vote, once (INTERFACE §9.7). */
  async recordVerdictVote(input: VerdictVoteRecord): Promise<EngineRecordOutcome> {
    const breach = verdictVoteBreach(input);
    if (breach !== null) throw recordInvalid(breach);
    const runId = input.runId.toLowerCase();
    const choice = input.choice;
    const value = choice === null ? {} : { reasons: choice.reasons };
    return insertOnce(this.pool, runId, "ledger.verdict_vote", String(input.judgeSeat), value, (content, envelope, attestation) => this.pool.query(
      `INSERT INTO ledger.verdict_vote (run_id, judge_seat, maker, provider_ref, model_id, raw_artifact_ref, chosen_letter,
         chosen_root_node_id, conditional, counted, not_counted_reason, question_kind, same_as, content, content_ciphertext, content_attestation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16)
       ON CONFLICT (run_id, judge_seat) DO NOTHING`,
      [runId, input.judgeSeat, input.judge.maker, input.judge.providerRef, input.judge.modelId, input.rawArtifactRef?.toLowerCase() ?? null,
        choice?.letter ?? null, choice?.rootNodeId.toLowerCase() ?? null, choice?.conditional ?? null, input.counted,
        input.notCountedReason, choice?.questionKind ?? null, JSON.stringify(choice?.sameAs ?? []), content, envelope, attestation]));
  }

  /** The run's votes by seat; an erased run has none. */
  readVerdictVotesForRun(runId: string): Promise<readonly StoredVerdictVote[]> {
    const run = runId.toLowerCase();
    return leasedRead(this.pool, run, Object.freeze([]), async () => {
      const rows = (await this.pool.query<VoteRow>(
        `SELECT judge_seat, maker, provider_ref, model_id, raw_artifact_ref::text AS raw_artifact_ref, chosen_letter,
                chosen_root_node_id::text AS chosen_root_node_id, conditional, counted, not_counted_reason, question_kind,
                same_as, content, content_ciphertext, recorded_at
           FROM ledger.verdict_vote WHERE run_id = $1 ORDER BY judge_seat`, [run])).rows;
      if (rows.length === 0) return Object.freeze([]);
      const leased = await prepareLeasedContentEncryptionForRun(this.pool, run);
      try {
        const read = rows.map((row) => voteOf(run, row,
          decryptLeasedContentForRun<unknown>(leased, "ledger.verdict_vote", String(row.judge_seat), row.content_ciphertext, row.content)));
        await leased.assertLive();
        return Object.freeze(read);
      } finally {
        await leased.close();
      }
    });
  }
}

function investigationOf(runId: string, row: InvestigationRow, decrypted: unknown): StoredPointInvestigation {
  const content = investigationContent.safeParse(decrypted);
  if (!content.success) throw rowInvalid("ledger.point_investigation content");
  const words = "missing" in content.data ? content.data : null;
  const record: PointInvestigationRecord = Object.freeze({
    runId,
    nodeId: row.node_id,
    investigationOrder: row.investigation_order,
    result: row.result as PointInvestigationResult,
    basis: row.basis as PointInvestigationBasis | null,
    investigator: row.maker === null || row.provider_ref === null || row.model_id === null ? null
      : Object.freeze({ maker: row.maker, providerRef: row.provider_ref, modelId: row.model_id }),
    rawArtifactRef: row.raw_artifact_ref,
    standings: row.leader_without_root_node_id === null || row.leader_with_root_node_id === null || row.standings_moved === null ? null
      : Object.freeze({ leaderWithoutRootNodeId: row.leader_without_root_node_id, leaderWithRootNodeId: row.leader_with_root_node_id,
        moved: row.standings_moved }),
    content: words === null ? null : Object.freeze({ missing: words.missing, found: words.found, reason: words.reason })
  });
  const breach = pointInvestigationBreach(record);
  if (breach !== null) throw rowInvalid(`ledger.point_investigation ${breach}`);
  return Object.freeze({ ...record, recordedAt: row.recorded_at.toISOString() });
}

function voteOf(runId: string, row: VoteRow, decrypted: unknown): StoredVerdictVote {
  const content = voteContent.safeParse(decrypted);
  const sameAs = sameAsColumn.safeParse(row.same_as);
  if (!content.success || !sameAs.success) throw rowInvalid(`ledger.verdict_vote seat ${String(row.judge_seat)}`);
  const reasons = "reasons" in content.data ? content.data.reasons : null;
  const answered = row.chosen_letter !== null && row.chosen_root_node_id !== null && row.conditional !== null
    && row.question_kind !== null && reasons !== null;
  const record: VerdictVoteRecord = Object.freeze({
    runId,
    judgeSeat: row.judge_seat,
    judge: Object.freeze({ maker: row.maker, providerRef: row.provider_ref, modelId: row.model_id }),
    rawArtifactRef: row.raw_artifact_ref,
    choice: !answered ? null : Object.freeze({
      letter: row.chosen_letter as EngineAnswerLetter,
      rootNodeId: row.chosen_root_node_id as string,
      conditional: row.conditional as boolean,
      questionKind: row.question_kind as EngineQuestionKind,
      sameAs: Object.freeze(sameAs.data.map((group) => Object.freeze([...group]))),
      reasons: reasons as string
    }),
    counted: row.counted,
    notCountedReason: row.not_counted_reason as VerdictVoteNotCountedReason | null
  });
  const breach = verdictVoteBreach(record);
  if (breach !== null) throw rowInvalid(`ledger.verdict_vote seat ${String(row.judge_seat)} ${breach}`);
  return Object.freeze({ ...record, recordedAt: row.recorded_at.toISOString() });
}
