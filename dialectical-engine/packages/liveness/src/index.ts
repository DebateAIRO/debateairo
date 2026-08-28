import type { Pool } from "pg";
import {
  MAX_OWNER_PRIVATE_HISTORY_SCAN,
  allocateSequence,
  decryptContentForRun,
  normalizeRunOwnership,
  withRunContentLease,
  withWriteTransaction,
  type CryptoEnvelope,
  type RunOwnershipInput
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

export type ProjectedStalenessState = "FRESH" | "UNDER_REVIEW" | "STALE" | "ARCHIVED_REVIVED";
export type StoredStalenessState = ProjectedStalenessState | "ARCHIVED";

export interface LivenessPolicyReceipt {
  readonly rowKey: "livenessPolicy";
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly questionClass: string;
  readonly reviewAfterMs: number;
  readonly retireAfterMs: number;
}

export interface StalenessProjection {
  readonly state: ProjectedStalenessState;
  readonly badge: "STALE" | "UNDER-REVIEW" | null;
  readonly relevantAsOf: string;
  readonly basis: "SNAPSHOT" | "FIRED_TRIGGER" | "TTL_EXPIRED" | "RECORDED_STATE";
}

export function foldStaleness(input: {
  readonly relevantAsOf: Date;
  readonly now: Date;
  readonly reviewDueAt: Date | null;
  readonly triggerEvents: readonly {
    readonly triggerKey: string;
    readonly state: "WATCHING" | "FIRED" | "RESOLVED";
    readonly atSequence: number;
  }[];
  readonly stateEvents: readonly {
    readonly state: StoredStalenessState;
    readonly atSequence: number;
  }[];
}): StalenessProjection {
  if (!Number.isFinite(input.relevantAsOf.getTime()) || !Number.isFinite(input.now.getTime())) {
    throw new TypedDomainError("LIVENESS_TIME_INVALID", "Staleness projection requires valid instants");
  }
  const latestByTrigger = new Map<string, (typeof input.triggerEvents)[number]>();
  for (const event of [...input.triggerEvents].sort((a, b) => a.atSequence - b.atSequence)) {
    latestByTrigger.set(event.triggerKey, event);
  }
  const fired = [...latestByTrigger.values()].some((event) => event.state === "FIRED");
  const latestState = [...input.stateEvents].sort((a, b) => b.atSequence - a.atSequence)[0];
  if (latestState?.state === "ARCHIVED_REVIVED") {
    return { state: "ARCHIVED_REVIVED", badge: "UNDER-REVIEW", relevantAsOf: input.relevantAsOf.toISOString(), basis: "RECORDED_STATE" };
  }
  if (latestState?.state === "STALE") {
    return { state: "STALE", badge: "STALE", relevantAsOf: input.relevantAsOf.toISOString(), basis: "RECORDED_STATE" };
  }
  if (fired) {
    return { state: "STALE", badge: "STALE", relevantAsOf: input.relevantAsOf.toISOString(), basis: "FIRED_TRIGGER" };
  }
  if (latestState?.state === "UNDER_REVIEW" || latestState?.state === "ARCHIVED") {
    return { state: "UNDER_REVIEW", badge: "UNDER-REVIEW", relevantAsOf: input.relevantAsOf.toISOString(), basis: "RECORDED_STATE" };
  }
  if (input.reviewDueAt !== null && input.now.getTime() >= input.reviewDueAt.getTime()) {
    return { state: "UNDER_REVIEW", badge: "UNDER-REVIEW", relevantAsOf: input.relevantAsOf.toISOString(), basis: "TTL_EXPIRED" };
  }
  return { state: "FRESH", badge: null, relevantAsOf: input.relevantAsOf.toISOString(), basis: "SNAPSHOT" };
}

export interface AffectedReassessmentPlan {
  readonly affectedNodeIds: readonly string[];
  readonly rejudgeNodeIds: readonly string[];
}

export function planAffectedReassessment(
  changedNodeId: string,
  nodes: readonly { readonly nodeId: string; readonly parentNodeId: string | null }[]
): AffectedReassessmentPlan {
  const parentByNode = new Map(nodes.map((node) => [node.nodeId, node.parentNodeId]));
  if (!parentByNode.has(changedNodeId)) throw new TypedDomainError("LIVENESS_NODE_NOT_FOUND", changedNodeId);
  const affected: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = changedNodeId;
  while (cursor !== null) {
    if (seen.has(cursor)) throw new TypedDomainError("LIVENESS_PARENT_CYCLE", cursor);
    seen.add(cursor);
    affected.push(cursor);
    cursor = parentByNode.get(cursor) ?? null;
  }
  return Object.freeze({ affectedNodeIds: Object.freeze(affected), rejudgeNodeIds: Object.freeze([...affected]) });
}

export async function propagateAffectedNodes(
  plan: AffectedReassessmentPlan,
  dependencies: {
    readonly recordedArrowOrder: readonly string[];
    readonly recomputeArithmetic: (nodeIds: readonly string[], recordedArrowOrder: readonly string[]) => Promise<void>;
    readonly rejudgeNode: (nodeId: string) => Promise<void>;
  }
): Promise<void> {
  await dependencies.recomputeArithmetic(plan.affectedNodeIds, dependencies.recordedArrowOrder);
  for (const nodeId of plan.rejudgeNodeIds) await dependencies.rejudgeNode(nodeId);
}

export function decideRetirement(input: {
  readonly now: Date;
  readonly lastQueriedAt: Date;
  readonly policy: LivenessPolicyReceipt;
  readonly hasOpenRevisionTrigger: boolean;
  readonly underExplored: boolean;
}): { readonly kind: "ARCHIVE" } | { readonly kind: "KEEP"; readonly reason: "OPEN_REVISION_TRIGGER" | "RECENT_QUERY" } {
  if (!Number.isFinite(input.policy.retireAfterMs) || input.policy.retireAfterMs <= 0) {
    throw new TypedDomainError("LIVENESS_THRESHOLD_INVALID", "Retirement window must be register-supplied and positive");
  }
  if (input.hasOpenRevisionTrigger) return { kind: "KEEP", reason: "OPEN_REVISION_TRIGGER" };
  if (input.now.getTime() - input.lastQueriedAt.getTime() < input.policy.retireAfterMs) {
    return { kind: "KEEP", reason: "RECENT_QUERY" };
  }
  // UNDER-EXPLORED is intentionally not consulted: isolation is never a retirement cause.
  return { kind: "ARCHIVE" };
}

export class LivenessRepository {
  constructor(private readonly pool: Pool) {}

  async recordQuery(questionLine: string, ownership: RunOwnershipInput, queriedAt = new Date()): Promise<number> {
    if (questionLine.trim() === "") throw new TypedDomainError("LIVENESS_QUERY_INVALID", "Question and owner are required");
    const access = normalizeRunOwnership(ownership);
    const normalizedQuestion = questionLine.normalize("NFKC").trim()
      .replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    const candidates = await this.pool.query<{
      run_id: string;
      question_line: string;
      content_ciphertext: CryptoEnvelope | null;
      created_at_seq: string;
    }>(`
      SELECT run_id,question_line,content_ciphertext,created_at_seq
      FROM core.run AS run
      WHERE core.run_is_owned_by(run.run_id,$1,$2)
        AND core.run_private_content_is_live(run.run_id)
      ORDER BY run.created_at_seq,run.run_id
      LIMIT $3
    `, [access.ownerRef, access.legacyAskerId,MAX_OWNER_PRIVATE_HISTORY_SCAN+1]);
    if (candidates.rows.length > MAX_OWNER_PRIVATE_HISTORY_SCAN) {
      throw new TypedDomainError(
        "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
        "Private history exceeds the bounded comparison window"
      );
    }
    if (candidates.rows.length === 0) return 0;
    return withRunContentLease(
      this.pool,
      candidates.rows.map((candidate) => candidate.run_id),
      async () => {
    const matchedRunIds: string[] = [];
    for (const candidate of candidates.rows) {
      if (candidate.content_ciphertext === null) {
        const normalizedCandidate = candidate.question_line.normalize("NFKC").trim()
          .replace(/\s+/g, " ").toLocaleLowerCase("en-US");
        if (normalizedCandidate === normalizedQuestion) matchedRunIds.push(candidate.run_id);
        continue;
      }
      // v1 shared and v2 per-run locators are deliberately never compared.
      // Active owner lookup is an owner-scoped decrypt/normalize scan outside
      // DB locks, so destroying one run key kills that run's guess oracle.
      const content = await decryptContentForRun<Readonly<{ questionLine: string }>>(
        this.pool,
        candidate.run_id,
        "core.run",
        candidate.run_id,
        candidate.content_ciphertext,
        Object.freeze({ questionLine: "" })
      );
      const normalizedCandidate = content.questionLine.normalize("NFKC").trim()
        .replace(/\s+/g, " ").toLocaleLowerCase("en-US");
      if (normalizedCandidate === normalizedQuestion) matchedRunIds.push(candidate.run_id);
    }
    return withWriteTransaction(this.pool, async (client) => {
      const runIds = [...matchedRunIds].sort();
      const locked = runIds.length === 0
        ? { rows: [] as { run_id: string }[] }
        : await client.query<{ run_id: string }>(
          `SELECT run_id FROM core.run
           WHERE run_id=ANY($1::uuid[]) ORDER BY run_id FOR UPDATE`,
          [runIds]
        );
      const lockedRunIds = new Set(locked.rows.map((row) => row.run_id));
      let recorded = 0;
      for (const runId of matchedRunIds) {
        if (!lockedRunIds.has(runId)) continue;
        // Claims take the same run locks. Acquire the complete sorted set
        // before the first allocator write, then re-read each owner in a later
        // statement to close both the claim race and multi-run deadlock cycle.
        const owned = await client.query<{ owned: boolean }>(
          `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
          [runId, access.ownerRef, access.legacyAskerId]
        );
        if (owned.rows[0]?.owned !== true) continue;
        const erasureGate = await client.query<{ live: boolean }>(
          `SELECT CASE WHEN content_encryption_version=1
             THEN core.run_private_content_is_live(run_id) ELSE true END AS live
           FROM core.run WHERE run_id=$1`,
          [runId]
        );
        if (erasureGate.rows[0]?.live !== true) {
          throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
        }
        await client.query(
          `INSERT INTO core.question_liveness_event (run_id, kind, occurred_at, at_seq)
           VALUES ($1,'QUERY',$2,$3)`,
          [runId, queriedAt, await allocateSequence(client)]
        );
        const archived = await client.query<{ subject_kind: "ANSWER" | "NODE"; subject_ref: string }>(
          `SELECT DISTINCT ON (subject_kind, subject_ref) subject_kind, subject_ref
           FROM core.staleness_state WHERE run_id=$1
           ORDER BY subject_kind, subject_ref, at_seq DESC`,
          [runId]
        );
        let revived = false;
        for (const subject of archived.rows.filter((candidate) => candidate.subject_kind && candidate.subject_ref)) {
          const latest = await client.query<{ state: StoredStalenessState }>(
            `SELECT state FROM core.staleness_state WHERE run_id=$1 AND subject_kind=$2 AND subject_ref=$3 ORDER BY at_seq DESC LIMIT 1`,
            [runId, subject.subject_kind, subject.subject_ref]
          );
          if (latest.rows[0]?.state !== "ARCHIVED") continue;
          await client.query(
            `INSERT INTO core.staleness_state (run_id, subject_kind, subject_ref, state, reason, at_seq)
             VALUES ($1,$2,$3,'ARCHIVED_REVIVED','NEXT_QUERY',$4)`,
            [runId, subject.subject_kind, subject.subject_ref, await allocateSequence(client)]
          );
          revived = true;
        }
        if (revived) await client.query(
          `INSERT INTO core.question_liveness_event (run_id, kind, occurred_at, at_seq)
           VALUES ($1,'REVIVED',$2,$3)`,
          [runId, queriedAt, await allocateSequence(client)]
        );
        recorded += 1;
      }
      return recorded;
    });
      }
    );
  }

  async recordTriggerFired(input: {
    readonly runId: string;
    readonly triggerKey: string;
    readonly triggerKind: "WATCHED_CONDITION" | "PROVIDER_MODEL_VERSION" | "CONTRADICTS_PRIOR";
    readonly affectedSubjects: readonly { readonly kind: "ANSWER" | "NODE"; readonly ref: string }[];
    readonly reason: string;
  }): Promise<void> {
    if (input.affectedSubjects.length === 0) throw new TypedDomainError("LIVENESS_AFFECTED_EMPTY", input.triggerKey);
    await withWriteTransaction(this.pool, async (client) => {
      const first = input.affectedSubjects[0]!;
      await client.query(
        `INSERT INTO core.revision_trigger
           (run_id, trigger_key, trigger_kind, subject_kind, subject_ref, state, reason, at_seq)
         VALUES ($1,$2,$3,$4,$5,'FIRED',$6,$7)`,
        [input.runId, input.triggerKey, input.triggerKind, first.kind, first.ref, input.reason, await allocateSequence(client)]
      );
      for (const subject of input.affectedSubjects) await client.query(
        `INSERT INTO core.staleness_state (run_id, subject_kind, subject_ref, state, reason, at_seq)
         VALUES ($1,$2,$3,'STALE',$4,$5)`,
        [input.runId, subject.kind, subject.ref, input.triggerKey, await allocateSequence(client)]
      );
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,'honesty.staleness_trigger_fired',$3::jsonb)`,
        [input.runId, await allocateSequence(client), JSON.stringify({
          trigger_key: input.triggerKey,
          affected_subjects: input.affectedSubjects
        })]
      );
    });
  }

  async watchRevisionTrigger(input: {
    readonly runId: string;
    readonly triggerKey: string;
    readonly triggerKind: "WATCHED_CONDITION" | "PROVIDER_MODEL_VERSION" | "CONTRADICTS_PRIOR";
    readonly subjectKind: "ANSWER" | "NODE";
    readonly subjectRef: string;
    readonly reason: string;
  }): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO core.revision_trigger
           (run_id, trigger_key, trigger_kind, subject_kind, subject_ref, state, reason, at_seq)
         VALUES ($1,$2,$3,$4,$5,'WATCHING',$6,$7)`,
        [input.runId, input.triggerKey, input.triggerKind, input.subjectKind, input.subjectRef, input.reason, await allocateSequence(client)]
      );
    });
  }

  async resolveRevisionTrigger(runId: string, triggerKey: string, reason: string): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      const latest = await client.query<{
        trigger_kind: "WATCHED_CONDITION" | "PROVIDER_MODEL_VERSION" | "CONTRADICTS_PRIOR";
        subject_kind: "ANSWER" | "NODE";
        subject_ref: string;
      }>(
        `SELECT trigger_kind, subject_kind, subject_ref FROM core.revision_trigger
         WHERE run_id=$1 AND trigger_key=$2 ORDER BY at_seq DESC LIMIT 1`,
        [runId, triggerKey]
      );
      const trigger = latest.rows[0];
      if (trigger === undefined) throw new TypedDomainError("REVISION_TRIGGER_NOT_FOUND", triggerKey);
      await client.query(
        `INSERT INTO core.revision_trigger
           (run_id, trigger_key, trigger_kind, subject_kind, subject_ref, state, reason, at_seq)
         VALUES ($1,$2,$3,$4,$5,'RESOLVED',$6,$7)`,
        [runId, triggerKey, trigger.trigger_kind, trigger.subject_kind, trigger.subject_ref, reason, await allocateSequence(client)]
      );
    });
  }

  async readSubjectStaleness(input: {
    readonly runId: string;
    readonly subjectKind: "ANSWER" | "NODE";
    readonly subjectRef: string;
    readonly relevantAsOf: Date;
    readonly now?: Date;
  }): Promise<StalenessProjection> {
    const [triggers, states, clock] = await Promise.all([
      this.pool.query<{ trigger_key: string; state: "WATCHING" | "FIRED" | "RESOLVED"; at_seq: string }>(
        `SELECT trigger_key, state, at_seq FROM core.revision_trigger
         WHERE run_id=$1 AND subject_kind=$2 AND subject_ref=$3 ORDER BY at_seq`,
        [input.runId, input.subjectKind, input.subjectRef]
      ),
      this.pool.query<{ state: StoredStalenessState; at_seq: string }>(
        `SELECT state, at_seq FROM core.staleness_state
         WHERE run_id=$1 AND subject_kind=$2 AND subject_ref=$3 ORDER BY at_seq`,
        [input.runId, input.subjectKind, input.subjectRef]
      ),
      this.pool.query<{ due_at: Date }>(
        `SELECT due_at FROM core.review_clock
         WHERE run_id=$1 AND subject_kind=$2 AND subject_ref=$3 ORDER BY at_seq DESC LIMIT 1`,
        [input.runId, input.subjectKind, input.subjectRef]
      )
    ]);
    return foldStaleness({
      relevantAsOf: input.relevantAsOf,
      now: input.now ?? new Date(),
      reviewDueAt: clock.rows[0]?.due_at ?? null,
      triggerEvents: triggers.rows.map((event) => ({ triggerKey: event.trigger_key, state: event.state, atSequence: Number(event.at_seq) })),
      stateEvents: states.rows.map((event) => ({ state: event.state, atSequence: Number(event.at_seq) }))
    });
  }

  async ensureReviewClocks(policy: LivenessPolicyReceipt): Promise<number> {
    return withWriteTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        `WITH subjects AS (
           SELECT node.run_id, 'NODE'::text AS subject_kind, node.node_id::text AS subject_ref, node.relevant_as_of
           FROM core.node AS node
           JOIN core.run AS owner ON owner.run_id=node.run_id
           WHERE owner.register_version=$4
           UNION ALL
           SELECT answer.run_id, 'ANSWER'::text, answer.answer_id::text, answer.relevant_as_of
           FROM serve.answer AS answer
           JOIN core.run AS owner ON owner.run_id=answer.run_id
           WHERE owner.register_version=$4
         )
         INSERT INTO core.review_clock (
           run_id, subject_kind, subject_ref, question_class, due_at,
           register_row_key, register_version, register_source_ref, at_seq
         )
         SELECT subject.run_id, subject.subject_kind, subject.subject_ref, $1,
                subject.relevant_as_of + ($2::bigint * interval '1 millisecond'),
                $3, $4, $5, ledger.allocate_sequence()
         FROM subjects AS subject
         WHERE NOT EXISTS (
           SELECT 1 FROM core.review_clock AS clock
           WHERE clock.run_id=subject.run_id AND clock.subject_kind=subject.subject_kind
             AND clock.subject_ref=subject.subject_ref AND clock.register_version=$4
         )`,
        [policy.questionClass, policy.reviewAfterMs, policy.rowKey, policy.registerVersion, policy.sourceRef]
      );
      return inserted.rowCount ?? 0;
    });
  }

  async detectProviderModelVersionTriggers(): Promise<number> {
    const transitions = await this.pool.query<{
      run_id: string;
      provider_ref: string;
      previous_version: string;
      model_version: string;
    }>(
      `WITH ordered AS (
         SELECT run_id, provider_ref, model_version, at_seq,
                lag(model_version) OVER (PARTITION BY run_id, provider_ref ORDER BY at_seq) AS previous_version
         FROM ledger.raw_artifact
         WHERE run_id IS NOT NULL AND model_version IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM ledger.ledger_entry AS evaluator_entry
             WHERE evaluator_entry.raw_artifact_ref=raw_artifact_id
               AND evaluator.ledger_entry_is_authenticated_scope(
                 evaluator_entry.ledger_entry_id
               )
           )
       )
       SELECT transition.run_id, transition.provider_ref, transition.previous_version, transition.model_version
       FROM ordered AS transition
       WHERE transition.previous_version IS NOT NULL
         AND transition.previous_version <> transition.model_version
         AND NOT EXISTS (
           SELECT 1 FROM core.revision_trigger AS trigger
           WHERE trigger.run_id=transition.run_id
             AND trigger.trigger_key=('provider-model-version:' || transition.provider_ref || ':' || transition.model_version)
         )
       ORDER BY transition.at_seq`
    );
    for (const transition of transitions.rows) {
      const subjects = await this.pool.query<{ kind: "ANSWER" | "NODE"; ref: string }>(
        `SELECT 'ANSWER'::text AS kind, answer_id::text AS ref FROM serve.answer WHERE run_id=$1
         UNION ALL SELECT 'NODE'::text, node_id::text FROM core.node WHERE run_id=$1`,
        [transition.run_id]
      );
      if (subjects.rows.length === 0) continue;
      await this.recordTriggerFired({
        runId: transition.run_id,
        triggerKey: `provider-model-version:${transition.provider_ref}:${transition.model_version}`,
        triggerKind: "PROVIDER_MODEL_VERSION",
        affectedSubjects: subjects.rows,
        reason: `RECORDED_MODEL_VERSION_CHANGED:${transition.previous_version}->${transition.model_version}`
      });
    }
    return transitions.rows.length;
  }

  async sweep(now: Date, policy: LivenessPolicyReceipt): Promise<readonly string[]> {
    await this.detectProviderModelVersionTriggers();
    await this.ensureReviewClocks(policy);
    const runs = await this.pool.query<{
      run_id: string;
      as_of: Date;
      has_open_trigger: boolean;
      latest_liveness_kind: string | null;
    }>(
      `SELECT run.run_id, max(query.occurred_at) AS as_of,
              EXISTS (
                SELECT 1 FROM (
                  SELECT DISTINCT ON (trigger_key) trigger_key, state
                  FROM core.revision_trigger WHERE run_id=run.run_id ORDER BY trigger_key, at_seq DESC
                ) latest WHERE latest.state = 'FIRED'
              ) AS has_open_trigger,
              (SELECT kind FROM core.question_liveness_event
               WHERE run_id=run.run_id ORDER BY at_seq DESC LIMIT 1) AS latest_liveness_kind
       FROM core.run AS run
       LEFT JOIN core.question_liveness_event AS query ON query.run_id=run.run_id AND query.kind='QUERY'
       WHERE run.register_version=$1
       GROUP BY run.run_id
       HAVING max(query.occurred_at) IS NOT NULL
       ORDER BY run.created_at_seq`,
      [policy.registerVersion]
    );
    const archived: string[] = [];
    for (const run of runs.rows) {
      if (run.latest_liveness_kind === "ARCHIVED") continue;
      if (decideRetirement({ now, lastQueriedAt: run.as_of, policy, hasOpenRevisionTrigger: run.has_open_trigger, underExplored: false }).kind !== "ARCHIVE") continue;
      await withWriteTransaction(this.pool, async (client) => {
        const subjects = await client.query<{ subject_kind: "ANSWER" | "NODE"; subject_ref: string }>(
          `SELECT 'ANSWER'::text AS subject_kind, answer_id::text AS subject_ref FROM serve.answer WHERE run_id=$1
           UNION ALL SELECT 'NODE'::text, node_id::text FROM core.node WHERE run_id=$1`,
          [run.run_id]
        );
        for (const subject of subjects.rows) await client.query(
          `INSERT INTO core.staleness_state (run_id, subject_kind, subject_ref, state, reason, at_seq)
           VALUES ($1,$2,$3,'ARCHIVED','COMPOSITE_RETIREMENT',$4)`,
          [run.run_id, subject.subject_kind, subject.subject_ref, await allocateSequence(client)]
        );
        await client.query(
          `INSERT INTO core.question_liveness_event (run_id, kind, occurred_at, at_seq)
           VALUES ($1,'ARCHIVED',$2,$3)`,
          [run.run_id, now, await allocateSequence(client)]
        );
      });
      archived.push(run.run_id);
    }
    return Object.freeze(archived);
  }
}
