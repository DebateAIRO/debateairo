import type {
  Answer, SynthesisCheckCategory, SynthesisCheckOutcome, SynthesisVerdict
} from "@debateai/contract";
import { removesDebate } from "@debateai/contract";
import {
  CONTENT_JSON_SENTINEL, decryptContentForRun, encryptAttestedContentForRun,
  withRunContentLease, withWriteTransaction, type CryptoEnvelope, type Pool
} from "@debateai/db";
import { randomUUID } from "node:crypto";

const SYNTHESIS_CHECK_SEALED_BYTES = 1024;
const SYNTHESIS_CHECK_SEAL_MARGIN_MS = 2_000;
export type SynthesisAnswerAccessState = "SHOW" | "HELD" | "REMOVED";

type Payload = {
  verdict: SynthesisVerdict;
  categories: readonly SynthesisCheckCategory[];
  model_provider_ref: string | null;
  model_id: string | null;
  call_count: 0 | 1;
  pad: string;
};

type ClaimCandidate = {
  request_id: string;
  run_id: string;
  answer_id: string;
  answer_version: number;
  requested_at: Date;
};

function sealedPayload(
  outcome: SynthesisCheckOutcome, modelProviderRef: string | null,
  modelId: string | null, callCount: 0 | 1
): Payload {
  const base = {
    verdict: outcome.verdict, categories: outcome.categories,
    model_provider_ref: modelProviderRef, model_id: modelId, call_count: callCount, pad: ""
  };
  const padding = SYNTHESIS_CHECK_SEALED_BYTES - Buffer.byteLength(JSON.stringify(base));
  if (padding < 0) throw new RangeError("SYNTHESIS_CHECK_PAYLOAD_TOO_LARGE");
  const payload = { ...base, pad: " ".repeat(padding) };
  if (Buffer.byteLength(JSON.stringify(payload)) !== SYNTHESIS_CHECK_SEALED_BYTES) {
    throw new Error("SYNTHESIS_CHECK_PAYLOAD_LENGTH_MISMATCH");
  }
  return payload;
}

function erased(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /PRIVATE_CONTENT_ERASED|CONTENT_KEY_NOT_FOUND|CONTENT_KEY_DESTROYED/.test(error.message)
    || ("code" in error && error.code === "PRIVATE_CONTENT_ERASED");
}

export class SynthesisCheckRepository {
  constructor(private readonly pool: Pool) {}

  async insertRequest(input: { runId: string; answerId: string; answerVersion: number }): Promise<"INSERTED" | "ALREADY_PRESENT"> {
    const result = await this.pool.query(
      `INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version)
       VALUES (gen_random_uuid(),$1,$2,$3)
       ON CONFLICT (answer_id,answer_version) DO NOTHING RETURNING request_id`,
      [input.runId, input.answerId, input.answerVersion]
    );
    return result.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
  }

  async claimNextRequests(limit: number, deadlineMs: number): Promise<{
    attemptId: string; requestId: string; runId: string; answerId: string;
    answerVersion: number; startedAt: Date;
  }[]> {
    if (!Number.isInteger(limit) || limit < 1) return [];
    return withWriteTransaction(this.pool, async (client) => {
      const claims: {
        attemptId: string; requestId: string; runId: string; answerId: string;
        answerVersion: number; startedAt: Date;
      }[] = [];
      let cursor: { requestedAt: Date; requestId: string } | null = null;
      while (claims.length < limit) {
        const candidates: { rows: ClaimCandidate[] } = await client.query<ClaimCandidate>(
          `SELECT request.request_id,request.run_id,request.answer_id,
                  request.answer_version,request.requested_at
           FROM serve.synthesis_check_request AS request
           WHERE request.requested_at > clock_timestamp() - make_interval(secs => $1::double precision / 1000.0)
             AND ($2::timestamptz IS NULL OR
                  (request.requested_at,request.request_id) > ($2::timestamptz,$3::uuid))
             AND NOT EXISTS (SELECT 1 FROM serve.synthesis_check_attempt AS attempt
                             WHERE attempt.request_id=request.request_id)
             AND EXISTS (SELECT 1 FROM core.work_item AS work
                         WHERE work.run_id=request.run_id AND work.state='DONE'
                           AND work.settled_artifact_ref=request.answer_id)
           ORDER BY request.requested_at,request.request_id LIMIT 100`,
          [deadlineMs, cursor?.requestedAt ?? null, cursor?.requestId ?? null]
        );
        if (candidates.rows.length === 0) break;
        for (const candidate of candidates.rows) {
          cursor = { requestedAt: candidate.requested_at, requestId: candidate.request_id };
          const lock = await client.query<{ acquired: boolean }>(
            `SELECT pg_try_advisory_xact_lock(hashtextextended(
               'synthesis-check-request:' || $1::text,0)) AS acquired`, [candidate.request_id]
          );
          if (!lock.rows[0]?.acquired) continue;
          const holdLock = await client.query<{ acquired: boolean }>(
            `SELECT pg_try_advisory_xact_lock(hashtextextended('synthesis-check-hold:' || $1::text,0)) AS acquired`,
            [candidate.run_id]
          );
          if (!holdLock.rows[0]?.acquired) continue;
          const fresh = async (): Promise<boolean> => {
            const result = await client.query<{ fresh: boolean }>(
              `SELECT clock_timestamp() < requested_at
                 + make_interval(secs => $2::double precision / 1000.0) AS fresh
               FROM serve.synthesis_check_request WHERE request_id=$1`,
              [candidate.request_id, deadlineMs]
            );
            return result.rows[0]?.fresh === true;
          };
          if (!await fresh()) continue;
          await client.query("SAVEPOINT synthesis_claim_candidate");
          const inserted = await client.query<{
            attempt_id: string; request_id: string; run_id: string; answer_id: string;
            answer_version: number; started_at: Date;
          }>(
            `INSERT INTO serve.synthesis_check_attempt(
               attempt_id,run_id,answer_id,answer_version,origin,request_id
             ) VALUES (gen_random_uuid(),$1,$2,$3,'SETTLEMENT',$4)
             ON CONFLICT (request_id) DO NOTHING
             RETURNING attempt_id,request_id,run_id,answer_id,answer_version,started_at`,
            [candidate.run_id, candidate.answer_id, candidate.answer_version, candidate.request_id]
          );
          if (!await fresh()) {
            await client.query("ROLLBACK TO SAVEPOINT synthesis_claim_candidate");
            await client.query("RELEASE SAVEPOINT synthesis_claim_candidate");
            continue;
          }
          await client.query("RELEASE SAVEPOINT synthesis_claim_candidate");
          const row = inserted.rows[0];
          if (row !== undefined) claims.push({
            attemptId: row.attempt_id, requestId: row.request_id, runId: row.run_id,
            answerId: row.answer_id, answerVersion: row.answer_version, startedAt: row.started_at
          });
          if (claims.length >= limit) break;
        }
        if (candidates.rows.length < 100) break;
      }
      return claims;
    });
  }

  async startPublishAttempt(input: { runId: string; answerId: string; answerVersion: number }): Promise<{
    attemptId: string; startedAt: Date;
  }> {
    return withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('synthesis-check-hold:' || $1::text,0))`,
        [input.runId]
      );
      const result = await client.query<{ attempt_id: string; started_at: Date }>(
        `INSERT INTO serve.synthesis_check_attempt(
           attempt_id,run_id,answer_id,answer_version,origin
         ) VALUES (gen_random_uuid(),$1,$2,$3,'PUBLISH') RETURNING attempt_id,started_at`,
        [input.runId, input.answerId, input.answerVersion]
      );
      return { attemptId: result.rows[0]!.attempt_id, startedAt: result.rows[0]!.started_at };
    });
  }

  async readInFlightAttempts(input: { answerId: string; maxVersion: number; deadlineMs: number }): Promise<{
    attemptId: string; answerVersion: number; startedAt: Date;
  }[]> {
    const result = await this.pool.query<{ attempt_id: string; answer_version: number; started_at: Date }>(
      `SELECT attempt.attempt_id,attempt.answer_version,attempt.started_at
       FROM serve.synthesis_check_attempt AS attempt
       WHERE attempt.answer_id=$1 AND attempt.answer_version<=$2
         AND attempt.started_at > clock_timestamp() - make_interval(secs => $3::double precision / 1000.0)
         AND NOT EXISTS (SELECT 1 FROM serve.synthesis_check_result AS result
                         WHERE result.attempt_id=attempt.attempt_id)
         AND NOT EXISTS (SELECT 1 FROM serve.synthesis_check_inheritance AS inheritance
                         WHERE inheritance.attempt_id=attempt.attempt_id)
       ORDER BY attempt.started_at DESC`, [input.answerId, input.maxVersion, input.deadlineMs]
    );
    return result.rows.map((row) => ({
      attemptId: row.attempt_id, answerVersion: row.answer_version, startedAt: row.started_at
    }));
  }

  async insertResult(input: {
    attemptId: string; runId: string; answerId: string; answerVersion: number;
    synthesisOriginVersion: number; outcome: SynthesisCheckOutcome;
    modelProviderRef: string | null; modelId: string | null; policyVersion: string;
    callCount: 0 | 1; deadlineMs: number;
  }): Promise<"INSERTED" | "ALREADY_FINAL" | "RUN_ERASED" | "LATE"> {
    try {
      return await withRunContentLease(this.pool, [input.runId], async () => {
        const deadline = await this.pool.query<{ late: boolean }>(
          `SELECT clock_timestamp() >= attempt.started_at
             + make_interval(secs => $2::double precision / 1000.0) AS late
           FROM serve.synthesis_check_attempt AS attempt WHERE attempt.attempt_id=$1`,
          [input.attemptId, input.deadlineMs]
        );
        if (deadline.rows.length !== 1) throw new Error("SYNTHESIS_CHECK_ATTEMPT_MISSING");
        const late = deadline.rows[0]!.late && input.outcome.verdict !== "UNAVAILABLE";
        const outcome: SynthesisCheckOutcome = late
          ? { verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" }
          : input.outcome;
        const resultId = randomUUID();
        const payload = sealedPayload(outcome, input.modelProviderRef, input.modelId, input.callCount);
        const sealed = await encryptAttestedContentForRun(
          this.pool, input.runId, "serve.synthesis_check_result", resultId, payload
        );
        const stored = await this.pool.query<{ inserted: boolean }>(
          `SELECT serve.store_synthesis_check_result(
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13
           ) AS inserted`,
          [resultId, input.attemptId, input.runId, input.answerId, input.answerVersion,
            input.synthesisOriginVersion, outcome.verdict !== "UNAVAILABLE",
            outcome.verdict === "UNAVAILABLE" ? outcome.failureCode : null,
            input.policyVersion, JSON.stringify(sealed === null ? payload : CONTENT_JSON_SENTINEL),
            sealed === null ? null : JSON.stringify(sealed.envelope), sealed?.attestation ?? null,
            removesDebate(outcome)]
        );
        const inserted = stored.rows[0]?.inserted === true;
        return inserted ? late ? "LATE" : "INSERTED" : "ALREADY_FINAL";
      });
    } catch (error) {
      if (erased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async insertInheritance(input: {
    attemptId: string; runId: string; answerId: string; answerVersion: number;
    inheritedResultId: string;
  }): Promise<"INSERTED"> {
    await this.pool.query(
      `SELECT serve.record_synthesis_check_inheritance($1,$2,$3,$4,$5)`,
      [input.attemptId, input.runId, input.answerId, input.answerVersion, input.inheritedResultId]
    );
    return "INSERTED";
  }

  async readFinalResultId(input: { answerId: string; synthesisOriginVersion: number }): Promise<string | null> {
    const result = await this.pool.query<{ result_id: string }>(
      `SELECT result_id FROM serve.synthesis_check_result
       WHERE answer_id=$1 AND synthesis_origin_version=$2 AND final LIMIT 1`,
      [input.answerId, input.synthesisOriginVersion]
    );
    return result.rows[0]?.result_id ?? null;
  }

  async readRecords(input: { runId: string; answerId: string; maxVersion: number }): Promise<SynthesisCheckRecord[]> {
    return withRunContentLease(this.pool, [input.runId], async () => {
      const result = await this.pool.query<{
        result_id: string; attempt_id: string; run_id: string; answer_id: string;
        answer_version: number; synthesis_origin_version: number; final: boolean;
        failure_code: SynthesisCheckOutcome extends { failureCode: infer F } ? F : string | null;
        policy_version: string; checked_at: Date; content: Payload;
        content_ciphertext: CryptoEnvelope | null;
      }>(
        `SELECT result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,
                final,failure_code,policy_version,checked_at,content,content_ciphertext
         FROM serve.synthesis_check_result
         WHERE run_id=$1 AND answer_id=$2 AND answer_version<=$3
         ORDER BY checked_at DESC,result_id DESC`,
        [input.runId, input.answerId, input.maxVersion]
      );
      return Promise.all(result.rows.map(async (row): Promise<SynthesisCheckRecord> => {
        const payload = await decryptContentForRun<Payload>(
          this.pool, input.runId, "serve.synthesis_check_result", row.result_id,
          row.content_ciphertext, row.content
        );
        const outcome = (row.final
          ? { verdict: payload.verdict, categories: payload.categories }
          : { verdict: "UNAVAILABLE", categories: [], failureCode: row.failure_code }) as SynthesisCheckOutcome;
        return {
          resultId: row.result_id, attemptId: row.attempt_id, runId: row.run_id,
          answerId: row.answer_id, answerVersion: row.answer_version,
          synthesisOriginVersion: row.synthesis_origin_version, final: row.final,
          outcome, modelProviderRef: payload.model_provider_ref, modelId: payload.model_id,
          policyVersion: row.policy_version, callCount: payload.call_count, checkedAt: row.checked_at
        };
      }));
    });
  }

  async readAnswerAccess(input: {
    runId: string; answerId?: string; answerVersion?: number; deadlineMs: number;
  }): Promise<SynthesisAnswerAccessState> {
    return withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('synthesis-check-hold:' || $1::text,0))`,
        [input.runId]
      );
      const result = await client.query<{ state: SynthesisAnswerAccessState }>(
      `WITH target AS (
         SELECT COALESCE($2::uuid,(
           SELECT work.settled_artifact_ref FROM core.work_item AS work
           WHERE work.run_id=$1 AND work.state='DONE' AND work.settled_artifact_ref IS NOT NULL
           ORDER BY work.created_at_seq DESC LIMIT 1
         )) AS answer_id
       ), version AS (
         SELECT target.answer_id,COALESCE($3::integer,(
           SELECT max(request.answer_version) FROM serve.synthesis_check_request AS request
           WHERE request.answer_id=target.answer_id
         )) AS answer_version FROM target
       )
       SELECT CASE
         WHEN serve.run_removed_by_synthesis_check($1) THEN 'REMOVED'
         WHEN EXISTS (
           SELECT 1 FROM serve.synthesis_check_request AS request,version
           WHERE request.answer_id=version.answer_id AND request.answer_version=version.answer_version
             AND NOT EXISTS (SELECT 1 FROM serve.synthesis_check_result AS check_result
                             WHERE check_result.answer_id=request.answer_id
                               AND check_result.answer_version=request.answer_version)
             AND NOT EXISTS (SELECT 1 FROM serve.synthesis_check_inheritance AS inheritance
                             WHERE inheritance.answer_id=request.answer_id
                               AND inheritance.answer_version=request.answer_version)
             AND (
               clock_timestamp() < request.requested_at + make_interval(secs => $4::double precision / 1000.0)
               OR EXISTS (
                 SELECT 1 FROM serve.synthesis_check_attempt AS attempt
                 WHERE attempt.answer_id=request.answer_id AND attempt.answer_version=request.answer_version
                   AND attempt.started_at < request.requested_at + make_interval(secs => $4::double precision / 1000.0)
                   AND clock_timestamp() < attempt.started_at
                     + make_interval(secs => ($4::double precision + $5::double precision) / 1000.0)
               )
             )
         ) THEN 'HELD' ELSE 'SHOW' END AS state`,
      [input.runId, input.answerId ?? null, input.answerVersion ?? null, input.deadlineMs,
        SYNTHESIS_CHECK_SEAL_MARGIN_MS]
    );
      return result.rows[0]!.state;
    });
  }

  async runRemovedByCheck(runId: string): Promise<boolean> {
    const result = await this.pool.query<{ removed: boolean }>(
      `SELECT serve.run_removed_by_synthesis_check($1) AS removed`, [runId]
    );
    return result.rows[0]!.removed;
  }

  async takeRemovalNotice(ownerRef: string): Promise<boolean> {
    const result = await this.pool.query<{ notice: boolean }>(
      `SELECT serve.take_synthesis_check_removal_notice($1) AS notice`, [ownerRef]
    );
    return result.rows[0]!.notice;
  }

  async removalNoticeExists(ownerRef: string): Promise<boolean> {
    const result = await this.pool.query<{ notice: boolean }>(
      `SELECT serve.synthesis_check_removal_notice_exists($1) AS notice`, [ownerRef]
    );
    return result.rows[0]!.notice;
  }

  async purgeExpiredRemovalNotices(): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      `SELECT serve.purge_expired_synthesis_check_removal_notices() AS count`
    );
    return result.rows[0]!.count;
  }

  async ownerRefOfRun(runId: string): Promise<string | null> {
    const result = await this.pool.query<{ owner_ref: string }>(
      `SELECT owner_ref FROM core.run_ownership_event WHERE run_id=$1
       ORDER BY at_seq DESC LIMIT 1`, [runId]
    );
    return result.rows[0]?.owner_ref ?? null;
  }
}

export interface SynthesisCheckRecord {
  readonly resultId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly synthesisOriginVersion: number;
  readonly final: boolean;
  readonly outcome: SynthesisCheckOutcome;
  readonly modelProviderRef: string | null;
  readonly modelId: string | null;
  readonly policyVersion: string;
  readonly callCount: 0 | 1;
  readonly checkedAt: Date;
}

export type VerdictOfRecord = {
  readonly verdict: SynthesisVerdict;
  readonly categories: readonly SynthesisCheckCategory[];
  readonly checkedAt: Date;
  readonly answerVersion: number;
  readonly synthesisOriginVersion: number;
} | null;

export function synthesisTextOf(answer: Pick<Answer, "serve_state" | "composed_text">): string | null {
  if (answer.serve_state === "COMPONENTS_ONLY") return null;
  return answer.composed_text.map((segment) => segment.text).join("\n\n").trim() || null;
}

/**
 * The synthesis text of each version of one answer, oldest first, for the end check's reads. An answer's first version
 * is the register version its debate ran on (ServeRepository.persist stamps `factBundleVersion`), not 1, and each later
 * version is the one before it plus one. So the read starts at `top` and walks down until a version does not exist.
 * Null when `top` itself does not read: the answer is unreadable.
 */
export async function readSynthesisTexts(
  top: number,
  read: (version: number) => Promise<Pick<Answer, "serve_state" | "composed_text"> | null>
): Promise<Map<number, string | null> | null> {
  const newestFirst: [number, string | null][] = [];
  for (let version = top; version >= 1; version--) {
    const answer = await read(version);
    if (answer === null) {
      if (version === top) return null;
      break;
    }
    newestFirst.push([version, synthesisTextOf(answer)]);
  }
  return new Map(newestFirst.reverse());
}

export function originVersionOf(texts: ReadonlyMap<number, string | null>, version: number): number {
  if (!texts.has(version)) return version;
  const text = texts.get(version);
  return [...texts]
    .filter(([candidateVersion, candidateText]) => candidateVersion <= version && candidateText === text)
    .reduce((earliest, [candidateVersion]) => Math.min(earliest, candidateVersion), version);
}

export function verdictOfRecord(
  records: readonly SynthesisCheckRecord[],
  sameSynthesis: (origin: number) => boolean
): VerdictOfRecord {
  const matching = records.filter((record) => sameSynthesis(record.synthesisOriginVersion));
  const selected = matching.find((record) => record.final)
    ?? matching.filter((record) => record.outcome.verdict === "UNAVAILABLE")
      .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
  if (selected === undefined) return null;
  return {
    verdict: selected.outcome.verdict,
    categories: selected.outcome.categories,
    checkedAt: selected.checkedAt,
    answerVersion: selected.answerVersion,
    synthesisOriginVersion: selected.synthesisOriginVersion
  };
}
