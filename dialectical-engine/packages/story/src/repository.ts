import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MakerLineageSchema,
  StoryBodySchema,
  StoryOutcomeSchema,
  StoryVerdictBasisSchema,
  type MakerLineage,
  type StoryBody,
  type StoryVerdictBasis
} from "@debateai/contract";
import {
  CONTENT_JSON_SENTINEL,
  decryptContentForRun,
  encryptAttestedContentForRun,
  normalizeRunOwnership,
  withRunContentLease,
  type CryptoEnvelope,
  type Pool,
  type RunOwnershipAccess
} from "@debateai/db";
import { TypedDomainError, exhaustive } from "@debateai/kernel";

/**
 * THE STORY ROW (migration 0074, spec §7). Insert-once per answer version, and
 * a content carrier. The story JSON, the reservation, the verdict basis and the
 * point numbers are sealed together for an encrypted run and stored as plaintext for a legacy
 * one, exactly as `serve.answer`'s answer form is. The readable columns hold
 * only codes, ids, the owner's pack label and fingerprint, and model lineage.
 */
export interface StoryRecordInput {
  readonly runId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly outcome: "READY" | "READY_WITH_RESERVATION" | "FAILED";
  readonly failureCode: string | null;
  readonly shapeId: string | null;
  readonly packVersion: string | null;
  readonly packFingerprint: string | null;
  readonly storytellerLineage: MakerLineage | null;
  readonly checkerLineage: MakerLineage | null;
  readonly rounds: number;
  readonly artifactRefs: readonly string[];
  readonly body: StoryBody | null;
  readonly reservation: string | null;
  readonly verdictBasis: StoryVerdictBasis | null;
  /**
   * node id -> `Pn`: the story's canonical point numbers (the short refs the
   * storyteller and the checker wrote in). Null when no material was built.
   */
  readonly pointNumbers: Readonly<Record<string, string>> | null;
}

export interface StoredStory extends StoryRecordInput {
  readonly storyId: string;
  readonly createdAt: Date;
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** `serve.answer.answer_version` is a PostgreSQL `integer`: anything above cannot name a version. */
const PG_INTEGER_MAX = 2_147_483_647;

const StoredStoryContentSchema = z.object({
  body: StoryBodySchema.nullable(),
  reservation: z.string().nullable(),
  verdictBasis: StoryVerdictBasisSchema.nullable(),
  pointNumbers: z.record(z.string().min(1), z.string().regex(/^P[1-9][0-9]*$/u)).nullable()
}).strict();

type StoredStoryContent = z.infer<typeof StoredStoryContentSchema>;

interface StoryRow {
  readonly story_id: string;
  readonly run_id: string;
  readonly answer_id: string;
  readonly answer_version: number;
  readonly outcome: string;
  readonly failure_code: string | null;
  readonly shape_id: string | null;
  readonly pack_version: string | null;
  readonly pack_fingerprint: string | null;
  readonly storyteller_lineage: unknown;
  readonly checker_lineage: unknown;
  readonly rounds: number;
  readonly artifact_refs: unknown;
  readonly content: unknown;
  readonly content_ciphertext: CryptoEnvelope | null;
  readonly created_at: Date;
}

/** Erasure is benign for the story: the run's content is gone, so there is nothing to tell. */
export function isPrivateContentErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  return typeof error === "object" && error !== null
    && (error as { readonly code?: unknown }).code === "55000"
    && (error as { readonly message?: unknown }).message === "PRIVATE_CONTENT_ERASED";
}

function storyRowInvalid(detail: string): TypedDomainError {
  return new TypedDomainError("STORY_ROW_INVALID", `The stored story does not match its declared shape: ${detail}`);
}

/**
 * THE OUTCOME INVARIANTS (controller ruling, 2026-09-26): what each outcome
 * carries. READY: a body and no reservation. READY_WITH_RESERVATION: a body and
 * a non-empty reservation. FAILED: no body, no reservation, and a failure code.
 * Only FAILED carries a failure code. The body and reservation are sealed, so
 * the table's CHECK cannot see them: the repository holds this rule on the way
 * in and on the way out. Returns the broken rule, or null. An outcome outside
 * the closed vocabulary is itself the broken rule ("outcome"); the switch then
 * runs over the narrowed member and ends in `exhaustive`, so a fourth outcome
 * added to the contract fails to compile here instead of passing unchecked.
 */
function outcomeViolation(
  outcome: string,
  failureCode: string | null,
  body: StoryBody | null,
  reservation: string | null
): string | null {
  const known = StoryOutcomeSchema.safeParse(outcome);
  if (!known.success) return "outcome";
  const member = known.data;
  switch (member) {
    case "READY":
      if (body === null) return "READY needs a body";
      if (reservation !== null) return "READY carries no reservation";
      break;
    case "READY_WITH_RESERVATION":
      if (body === null) return "READY_WITH_RESERVATION needs a body";
      if (reservation === null || reservation.trim() === "") {
        return "READY_WITH_RESERVATION needs a non-empty reservation";
      }
      break;
    case "FAILED":
      if (body !== null) return "FAILED carries no body";
      if (reservation !== null) return "FAILED carries no reservation";
      return failureCode === null ? "FAILED needs a failure code" : null;
    default:
      return exhaustive(member);
  }
  return failureCode === null ? null : `${outcome} carries no failure code`;
}

function lineageOf(value: unknown, column: string): MakerLineage | null {
  if (value === null) return null;
  const parsed = MakerLineageSchema.safeParse(value);
  if (!parsed.success) throw storyRowInvalid(column);
  return parsed.data;
}

export class StoryRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Seal and store ONE story. It must run inside the run's content lease (the
   * runner's hook does); it also takes the lease itself, borrowed when one is
   * already held, so the seal and the INSERT can never straddle an erasure.
   */
  async insert(record: StoryRecordInput): Promise<"INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED"> {
    const storyId = randomUUID();
    // The row is insert-once and the read parses it with this same schema, so a
    // record it refuses is refused HERE, typed, before anything is sealed or stored.
    const parsed = StoredStoryContentSchema.safeParse({
      body: record.body,
      reservation: record.reservation,
      verdictBasis: record.verdictBasis,
      pointNumbers: record.pointNumbers
    });
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "content")))];
      throw new TypedDomainError(
        "STORY_RECORD_INVALID",
        `The story record does not match its declared shape: ${fields.sort().join(", ")}`
      );
    }
    const content: StoredStoryContent = parsed.data;
    const violation = outcomeViolation(record.outcome, record.failureCode, content.body, content.reservation);
    if (violation !== null) {
      throw new TypedDomainError(
        "STORY_RECORD_INVALID",
        `The story record breaks its outcome's invariants: ${violation}`
      );
    }
    try {
      return await withRunContentLease(this.pool, [record.runId], async () => {
        const sealed = await encryptAttestedContentForRun(
          this.pool, record.runId, "serve.answer_story", storyId, content
        );
        const inserted = await this.pool.query<{ story_id: string }>(
          `INSERT INTO serve.answer_story (
             story_id, run_id, answer_id, answer_version, outcome, failure_code, shape_id,
             pack_version, pack_fingerprint, storyteller_lineage, checker_lineage, rounds,
             artifact_refs, content, content_ciphertext, content_attestation
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16
           )
           ON CONFLICT (answer_id, answer_version) DO NOTHING
           RETURNING story_id::text AS story_id`,
          [
            storyId, record.runId, record.answerId, record.answerVersion, record.outcome,
            record.failureCode, record.shapeId, record.packVersion, record.packFingerprint,
            record.storytellerLineage === null ? null : JSON.stringify(record.storytellerLineage),
            record.checkerLineage === null ? null : JSON.stringify(record.checkerLineage),
            record.rounds, JSON.stringify(record.artifactRefs),
            JSON.stringify(sealed === null ? content : CONTENT_JSON_SENTINEL),
            sealed === null ? null : JSON.stringify(sealed.envelope),
            sealed?.attestation ?? null
          ]
        );
        return inserted.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
      });
    } catch (error) {
      if (isPrivateContentErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  /**
   * The story of one answer, for its owner only. `answerVersion: null` means
   * the answer's LATEST version (not the latest story), so a superseded answer
   * whose new version has no story yet reads as "no story". "Not yours" and
   * "malformed" are both `null`: the route answers one closed 404 for both.
   */
  async readForAnswer(input: {
    readonly answerId: string;
    readonly answerVersion: number | null;
    readonly ownership: { readonly ownerRef?: string; readonly legacyAskerId?: string };
  }): Promise<StoredStory | null> {
    if (!UUID_TEXT.test(input.answerId)) return null;
    if (input.answerVersion !== null && (
      !Number.isInteger(input.answerVersion) || input.answerVersion < 1 || input.answerVersion > PG_INTEGER_MAX
    )) {
      return null;
    }
    let access: RunOwnershipAccess;
    try {
      access = normalizeRunOwnership({
        ownerRef: input.ownership.ownerRef ?? null,
        legacyAskerId: input.ownership.legacyAskerId ?? null
      });
    } catch {
      return null;
    }
    const result = await this.pool.query<StoryRow>(
      `WITH target AS (
         SELECT answer.answer_id, answer.answer_version, answer.run_id
         FROM serve.answer AS answer
         WHERE answer.answer_id = $1
           AND ($2::integer IS NULL OR answer.answer_version = $2::integer)
         ORDER BY answer.answer_version DESC
         LIMIT 1
       )
       SELECT story.story_id::text AS story_id, story.run_id::text AS run_id,
              story.answer_id::text AS answer_id, story.answer_version, story.outcome,
              story.failure_code, story.shape_id, story.pack_version, story.pack_fingerprint,
              story.storyteller_lineage, story.checker_lineage, story.rounds, story.artifact_refs,
              story.content, story.content_ciphertext, story.created_at
       FROM target
       JOIN serve.answer_story AS story
         ON story.answer_id = target.answer_id AND story.answer_version = target.answer_version
       WHERE core.run_is_owned_by(target.run_id, $3, $4)`,
      [input.answerId, input.answerVersion, access.ownerRef, access.legacyAskerId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    try {
      return await withRunContentLease(this.pool, [row.run_id], async () => {
        const decrypted = await decryptContentForRun<unknown>(
          this.pool, row.run_id, "serve.answer_story", row.story_id, row.content_ciphertext, row.content
        );
        const content = StoredStoryContentSchema.safeParse(decrypted);
        if (!content.success) throw storyRowInvalid("content");
        const outcome = StoryOutcomeSchema.safeParse(row.outcome);
        if (!outcome.success) throw storyRowInvalid("outcome");
        const violation = outcomeViolation(
          outcome.data, row.failure_code, content.data.body, content.data.reservation
        );
        if (violation !== null) throw storyRowInvalid(violation);
        const artifactRefs = z.array(z.string()).safeParse(row.artifact_refs);
        if (!artifactRefs.success) throw storyRowInvalid("artifact_refs");
        const stored: StoredStory = {
          storyId: row.story_id,
          runId: row.run_id,
          answerId: row.answer_id,
          answerVersion: row.answer_version,
          outcome: outcome.data,
          failureCode: row.failure_code,
          shapeId: row.shape_id,
          packVersion: row.pack_version,
          packFingerprint: row.pack_fingerprint,
          storytellerLineage: lineageOf(row.storyteller_lineage, "storyteller_lineage"),
          checkerLineage: lineageOf(row.checker_lineage, "checker_lineage"),
          rounds: row.rounds,
          artifactRefs: Object.freeze([...artifactRefs.data]),
          body: content.data.body,
          reservation: content.data.reservation,
          verdictBasis: content.data.verdictBasis,
          pointNumbers: content.data.pointNumbers === null ? null : Object.freeze({ ...content.data.pointNumbers }),
          createdAt: row.created_at
        };
        return Object.freeze(stored);
      });
    } catch (error) {
      if (isPrivateContentErased(error)) return null;
      throw error;
    }
  }
}
