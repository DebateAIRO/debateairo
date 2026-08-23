import type { Pool, PoolClient } from "pg";
import {
  allocateSequence,
  normalizeRunOwnership,
  withWriteTransaction,
  type RunOwnershipInput
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

export const MEMORY_MATCH_TIERS = ["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"] as const;
export type MemoryMatchTier = typeof MEMORY_MATCH_TIERS[number];
export const MEMORY_LINK_RELATIONS = ["REPEATS", "REFINES", "CONTRADICTS_PRIOR", "RELATED_ONLY"] as const;
export type MemoryLinkRelation = typeof MEMORY_LINK_RELATIONS[number];

export interface MemoryQuestionKey {
  readonly runId: string;
  readonly canonicalQuestionText: string;
  readonly callerScope: string;
  readonly askerScope: string;
  readonly settlementAct: string | null;
  readonly questionType: string | null;
  readonly declaredField: string | null;
  readonly normalizedBinding: Readonly<Record<string, string | null>>;
  readonly frozenTerms: readonly string[];
  readonly frozenQuerySetHash: string | null;
  readonly asOf: string;
  readonly policyVersion: number;
  readonly keyVersion: number;
}

export interface MemoryMatchFact {
  readonly sourceRunId: string;
  readonly priorRunId: string;
  readonly tier: MemoryMatchTier;
  readonly relation: MemoryLinkRelation;
  readonly autoLink: boolean;
  readonly agreedFields: readonly string[];
  readonly disagreedFields: readonly string[];
  readonly notComparedFields: readonly string[];
  readonly sharedTermCount: number;
}

function nonBlank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function compareField(
  name: string,
  current: string | null | undefined,
  prior: string | null | undefined,
  agreed: string[],
  disagreed: string[],
  notCompared: string[]
): void {
  if (!nonBlank(current) || !nonBlank(prior)) {
    notCompared.push(name);
  } else if (current === prior) agreed.push(name);
  else disagreed.push(name);
}

export function canonicalizeQuestionText(value: string): string {
  const canonical = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  if (canonical === "") throw new TypedDomainError("MEMORY_QUESTION_EMPTY", "Canonical question text must be nonblank");
  return canonical;
}

export function matchQuestionKeys(current: MemoryQuestionKey, prior: MemoryQuestionKey): MemoryMatchFact | null {
  if (current.runId === prior.runId || current.askerScope !== prior.askerScope) return null;
  const agreed: string[] = [];
  const disagreed: string[] = [];
  const notCompared: string[] = [];
  compareField("settlementAct", current.settlementAct, prior.settlementAct, agreed, disagreed, notCompared);
  compareField("questionType", current.questionType, prior.questionType, agreed, disagreed, notCompared);
  compareField("declaredField", current.declaredField, prior.declaredField, agreed, disagreed, notCompared);
  const bindingKeys = [...new Set([
    ...Object.keys(current.normalizedBinding), ...Object.keys(prior.normalizedBinding)
  ])].sort();
  for (const name of bindingKeys) {
    compareField(`binding:${name}`, current.normalizedBinding[name], prior.normalizedBinding[name], agreed, disagreed, notCompared);
  }
  const sharedTerms = [...new Set(current.frozenTerms.filter((term) => prior.frozenTerms.includes(term)))].sort();
  const exact = current.canonicalQuestionText === prior.canonicalQuestionText && current.callerScope === prior.callerScope;
  const requiredSame = ["settlementAct", "questionType", "declaredField"];
  const sameTop = requiredSame.every((name) => agreed.includes(name));
  const bindingComparable = bindingKeys.length > 0 && bindingKeys.every((name) => agreed.includes(`binding:${name}`));
  const tier: MemoryMatchTier | null = exact ? "EXACT_QUESTION"
    : sameTop && bindingComparable && disagreed.length === 0 ? "SAME_BINDING"
      : agreed.length > 0 && (disagreed.length > 0
        || current.canonicalQuestionText !== prior.canonicalQuestionText
        || current.callerScope !== prior.callerScope) ? "PARTIAL_BINDING"
        : sharedTerms.length > 0 ? "TERM_OVERLAP" : null;
  if (tier === null) return null;
  if (!exact && current.canonicalQuestionText !== prior.canonicalQuestionText) disagreed.unshift("canonicalQuestionText");
  if (!exact && current.callerScope !== prior.callerScope) disagreed.push("callerScope");
  const autoLink = tier === "EXACT_QUESTION" || tier === "SAME_BINDING";
  return Object.freeze({
    sourceRunId: current.runId,
    priorRunId: prior.runId,
    tier,
    relation: autoLink ? "REPEATS" : "RELATED_ONLY",
    autoLink,
    agreedFields: Object.freeze(tier === "TERM_OVERLAP" ? sharedTerms.map((term) => `term:${term}`) : agreed),
    disagreedFields: Object.freeze(disagreed),
    notComparedFields: Object.freeze(notCompared),
    sharedTermCount: sharedTerms.length
  });
}

export interface PinnedMemoryPull {
  readonly artifactId: string;
  readonly version: number;
  readonly contentHash: string;
  readonly asOf: string;
  readonly stalenessStateAtPull: string;
  readonly askerScope: string;
  readonly registerRowKey: string;
  readonly registerVersion: number;
  readonly registerSourceRef: string;
}

export interface MemoryPullPolicy {
  readonly bound: number;
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
}

export function validatePinnedPulls(
  pulls: readonly PinnedMemoryPull[],
  policy: MemoryPullPolicy
): readonly PinnedMemoryPull[] {
  if (!Number.isInteger(policy.bound) || policy.bound < 0 || !Number.isInteger(policy.registerVersion) || policy.registerVersion < 1
    || !nonBlank(policy.rowKey) || !nonBlank(policy.sourceRef)) {
    throw new TypedDomainError("MEMORY_PULL_POLICY_INVALID", "A versioned, provenance-bearing nonnegative pull cap is required");
  }
  if (pulls.length > policy.bound) throw new TypedDomainError("MEMORY_PULL_CAP_EXCEEDED", "Pinned pulls exceed the supplied cap");
  for (const pull of pulls) {
    if (!nonBlank(pull.artifactId) || !Number.isInteger(pull.version) || pull.version < 1
      || !/^[a-f0-9]{64}$/i.test(pull.contentHash) || !Number.isFinite(Date.parse(pull.asOf))
      || !nonBlank(pull.stalenessStateAtPull) || !nonBlank(pull.askerScope)
      || pull.registerRowKey !== policy.rowKey || pull.registerVersion !== policy.registerVersion
      || pull.registerSourceRef !== policy.sourceRef) {
      throw new TypedDomainError("MEMORY_PULL_UNPINNED", "MEMORY_PULL_UNPINNED: every memory pull must carry the complete artifact and register pin");
    }
  }
  return Object.freeze(pulls.map((pull) => Object.freeze({ ...pull })));
}

export function classifyPulledArtifact(kind: "PRIOR_VERDICT" | "RESOLVER_OUTCOME" | "HARVESTED_SOURCE"): "DISCLOSURE_ONLY" | "EVIDENCE" {
  return kind === "PRIOR_VERDICT" ? "DISCLOSURE_ONLY" : "EVIDENCE";
}

export interface MemoryDisclosure {
  readonly matched: boolean;
  readonly memory_link_id: string | null;
  readonly tier: MemoryMatchTier | null;
  readonly relation: MemoryLinkRelation | null;
  readonly decided_by: string | null;
  readonly prior: {
    readonly run_id: string;
    readonly answer_id: string;
    readonly answer_version: number;
    readonly question_line: string;
    readonly answered_at: string;
    readonly verdict: string | null;
    readonly confidence_band: string | null;
    readonly staleness_state: string;
  } | null;
  readonly agreed_fields: readonly string[];
  readonly disagreed_fields: readonly string[];
  readonly not_compared_fields: readonly string[];
  readonly pulls: readonly PinnedMemoryPull[];
  readonly candidates_not_linked: readonly { readonly prior_run_id: string; readonly tier: MemoryMatchTier }[];
  readonly unlink: { readonly available: boolean; readonly memory_link_id: string | null };
}

export function buildMemoryDisclosure(input: {
  readonly match: MemoryMatchFact | null;
  readonly memoryLinkId?: string;
  readonly decidedBy?: string;
  readonly prior: {
    readonly runId: string; readonly answerId: string; readonly answerVersion: number;
    readonly questionLine: string; readonly answeredAt: string; readonly verdict: string | null;
    readonly confidenceBand: string | null; readonly stalenessState: string;
  } | null;
  readonly pulls: readonly PinnedMemoryPull[];
  readonly candidates: readonly { readonly priorRunId: string; readonly tier: MemoryMatchTier }[];
}): MemoryDisclosure {
  const matched = input.match?.autoLink === true;
  return Object.freeze({
    matched,
    memory_link_id: matched ? input.memoryLinkId ?? null : null,
    tier: input.match?.tier ?? null,
    relation: input.match?.relation ?? null,
    decided_by: matched ? input.decidedBy ?? "MACHINE_DATABASE_PREDICATE" : null,
    prior: input.prior !== null ? Object.freeze({
      run_id: input.prior.runId,
      answer_id: input.prior.answerId,
      answer_version: input.prior.answerVersion,
      question_line: input.prior.questionLine,
      answered_at: input.prior.answeredAt,
      verdict: input.prior.verdict,
      confidence_band: input.prior.confidenceBand,
      staleness_state: input.prior.stalenessState
    }) : null,
    agreed_fields: Object.freeze([...(input.match?.agreedFields ?? [])]),
    disagreed_fields: Object.freeze([...(input.match?.disagreedFields ?? [])]),
    not_compared_fields: Object.freeze([...(input.match?.notComparedFields ?? [])]),
    pulls: Object.freeze(input.pulls.map((pull) => Object.freeze({ ...pull }))),
    candidates_not_linked: Object.freeze(input.candidates.map((candidate) => Object.freeze({
      prior_run_id: candidate.priorRunId, tier: candidate.tier
    }))),
    unlink: Object.freeze({ available: matched, memory_link_id: matched ? input.memoryLinkId ?? null : null })
  });
}

export function renderMemorySentence(disclosure: MemoryDisclosure | null): string | null {
  if (disclosure === null) return null;
  if (!disclosure.matched && disclosure.candidates_not_linked.length > 0) {
    const candidate = disclosure.candidates_not_linked[0]!;
    return `Memory candidate ${candidate.prior_run_id} was found but not linked; tier ${candidate.tier}.`;
  }
  if (disclosure.prior === null || disclosure.tier === null) return null;
  const differences = disclosure.tier === "EXACT_QUESTION"
    ? "no declared differences"
    : disclosure.disagreed_fields.length > 0
      ? `differences: ${disclosure.disagreed_fields.join(", ")}`
      : (() => { throw new TypedDomainError("MEMORY_DIFFERENCE_REQUIRED", "A non-exact memory sentence must carry its difference"); })();
  const opening = disclosure.matched ? "Builds on prior answer" : "Candidate found but not linked to prior answer";
  return `${opening} ${disclosure.prior.answer_id}; tier ${disclosure.tier}; ${differences}; staleness ${disclosure.prior.staleness_state}.`;
}

export function validateMemorySentence(
  disclosure: MemoryDisclosure | null,
  sentence: string | null
): string | null {
  const expected = disclosure === null ? null : renderMemorySentence(disclosure);
  if (disclosure === null && sentence !== null) {
    throw new TypedDomainError("MEMORY_MATCH_FACT_REQUIRED", "MEMORY_MATCH_FACT_REQUIRED: no memory sentence may be served without a typed match or candidate fact");
  }
  if (sentence !== expected) {
    throw new TypedDomainError(
      "MEMORY_DISCLOSURE_GATE_FAILED",
      "MEMORY_DISCLOSURE_GATE_FAILED: the served memory sentence must preserve the typed tier, declared differences, and pull-time staleness exactly"
    );
  }
  return expected;
}

export function attachMemoryDisclosure<T extends object>(answer: T, disclosure: MemoryDisclosure | null): T | (T & { readonly memory_disclosure: MemoryDisclosure; readonly memory_sentence: string | null }) {
  if (disclosure === null || (!disclosure.matched && disclosure.candidates_not_linked.length === 0)) return answer;
  return Object.freeze({ ...answer, memory_disclosure: disclosure, memory_sentence: renderMemorySentence(disclosure) });
}

type QuestionKeyRow = {
  run_id: string; canonical_question_text: string; caller_scope: string; asker_scope: string;
  settlement_act: string | null; question_type: string | null; declared_field: string | null;
  normalized_binding: Record<string, string | null>; frozen_terms: string[]; frozen_query_set_hash: string | null;
  as_of: Date; policy_version: string; key_version: number;
};

function fromRow(row: QuestionKeyRow): MemoryQuestionKey {
  return Object.freeze({
    runId: row.run_id, canonicalQuestionText: row.canonical_question_text, callerScope: row.caller_scope,
    askerScope: row.asker_scope, settlementAct: row.settlement_act, questionType: row.question_type,
    declaredField: row.declared_field, normalizedBinding: Object.freeze({ ...row.normalized_binding }),
    frozenTerms: Object.freeze([...row.frozen_terms]), frozenQuerySetHash: row.frozen_query_set_hash,
    asOf: row.as_of.toISOString(), policyVersion: Number(row.policy_version), keyVersion: row.key_version
  });
}

export class MemoryRepository {
  constructor(private readonly pool: Pool) {}

  async recordQuestionAndMatch(input: {
    readonly key: MemoryQuestionKey;
    readonly decidedBy: string;
    readonly confirmedAliases?: readonly { readonly surface: string; readonly canonical: string; readonly confirmedBy: string }[];
    readonly pullPolicy?: MemoryPullPolicy;
    readonly ownership: RunOwnershipInput;
  }): Promise<MemoryDisclosure | null> {
    if (input.key.canonicalQuestionText !== canonicalizeQuestionText(input.key.canonicalQuestionText)) {
      throw new TypedDomainError("MEMORY_QUESTION_NOT_CANONICAL", "Question keys must arrive canonicalized");
    }
    const access = normalizeRunOwnership(input.ownership);
    const askerScope = access.ownerRef === null
      ? access.legacyAskerId!
      : `owner:${access.ownerRef}`;
    if (input.key.askerScope !== askerScope) {
      throw new TypedDomainError(
        "MEMORY_ASKER_SCOPE_MISMATCH",
        "The immutable memory scope must be derived from the authenticated run owner"
      );
    }
    await withWriteTransaction(this.pool, async (client) => {
      const candidates = await client.query<QuestionKeyRow & {
        answer_id: string;
        db_match_tier: MemoryMatchTier;
        effective_asker_scope: string;
        current_effective_asker_scope: string;
      }>(
        `WITH current AS (
           SELECT $1::uuid AS run_id, $2::text AS canonical_question_text,
             $3::text AS caller_scope, $4::text AS asker_scope,
             $5::text AS settlement_act, $6::text AS question_type,
             $7::text AS declared_field, $8::jsonb AS normalized_binding,
             $9::jsonb AS frozen_terms
         )
         SELECT key.*, outcome.answer_id, matched.match_tier AS db_match_tier,
           CASE WHEN key_owner.owner_ref IS NULL THEN key.asker_scope
                ELSE 'owner:' || key_owner.owner_ref::text END AS effective_asker_scope,
           current.asker_scope AS current_effective_asker_scope
         FROM current
         JOIN memory.question_key AS key ON key.run_id<>current.run_id
         LEFT JOIN LATERAL (
           SELECT event.owner_ref FROM core.run_ownership_event AS event
           WHERE event.run_id=key.run_id ORDER BY event.at_seq DESC LIMIT 1
         ) AS key_owner ON true
         JOIN scorecard.answer_outcome AS outcome ON outcome.run_id=key.run_id AND outcome.accepted
         CROSS JOIN LATERAL (
           SELECT CASE
             WHEN current.canonical_question_text=key.canonical_question_text
              AND current.caller_scope=key.caller_scope THEN 'EXACT_QUESTION'
             WHEN current.settlement_act IS NOT NULL AND current.settlement_act=key.settlement_act
              AND current.question_type IS NOT NULL AND current.question_type=key.question_type
              AND current.declared_field IS NOT NULL AND current.declared_field=key.declared_field
              AND current.normalized_binding<>'{}'::jsonb
              AND current.normalized_binding=key.normalized_binding
              AND NOT EXISTS (
                SELECT 1 FROM jsonb_each(current.normalized_binding) AS binding WHERE binding.value='null'::jsonb
              ) THEN 'SAME_BINDING'
             WHEN (current.settlement_act IS NOT NULL AND current.settlement_act=key.settlement_act)
               OR (current.question_type IS NOT NULL AND current.question_type=key.question_type)
               OR (current.declared_field IS NOT NULL AND current.declared_field=key.declared_field)
               OR EXISTS (
                 SELECT 1
                 FROM jsonb_each(current.normalized_binding) AS current_binding
                 JOIN jsonb_each(key.normalized_binding) AS prior_binding USING (key)
                 WHERE current_binding.value<>'null'::jsonb
                   AND prior_binding.value<>'null'::jsonb
                   AND current_binding.value=prior_binding.value
               ) THEN 'PARTIAL_BINDING'
             WHEN EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(current.frozen_terms) AS current_term(value)
               JOIN jsonb_array_elements_text(key.frozen_terms) AS prior_term(value) USING (value)
             ) THEN 'TERM_OVERLAP'
             ELSE NULL
           END AS match_tier
         ) AS matched
         WHERE matched.match_tier IS NOT NULL
           AND (
             (key_owner.owner_ref IS NOT NULL
               AND current.asker_scope='owner:' || key_owner.owner_ref::text)
             OR (key_owner.owner_ref IS NULL AND current.asker_scope=key.asker_scope)
           )
           AND EXISTS (SELECT 1 FROM core.run_progress_event WHERE run_id=key.run_id AND kind='TERMINAL')
         ORDER BY CASE matched.match_tier
           WHEN 'EXACT_QUESTION' THEN 1 WHEN 'SAME_BINDING' THEN 2
           WHEN 'PARTIAL_BINDING' THEN 3 WHEN 'TERM_OVERLAP' THEN 4 END,
           key.at_seq DESC
         LIMIT 1`,
        [input.key.runId, input.key.canonicalQuestionText, input.key.callerScope, askerScope,
          input.key.settlementAct, input.key.questionType, input.key.declaredField,
          JSON.stringify(input.key.normalizedBinding), JSON.stringify(input.key.frozenTerms)]
      );
      let candidate = candidates.rows[0];
      // Select without mutable writes, then lock every involved run in one
      // deterministic order before any global sequence allocation. This keeps
      // memory matching on the same run->identity->allocator order as claims
      // and prevents cross-run matching from forming a lock cycle.
      const runIds = candidate === undefined
        ? [input.key.runId]
        : [input.key.runId, candidate.run_id].sort();
      const locked = await client.query<{ run_id: string }>(
        `SELECT run_id FROM core.run WHERE run_id=ANY($1::uuid[]) ORDER BY run_id FOR UPDATE`,
        [runIds]
      );
      if (!locked.rows.some((row) => row.run_id === input.key.runId)) {
        throw new TypedDomainError("MEMORY_RUN_NOT_FOUND", "The memory question run does not exist");
      }
      const owned = await client.query<{ owned: boolean }>(
        `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
        [input.key.runId, access.ownerRef, access.legacyAskerId]
      );
      if (owned.rows[0]?.owned !== true) {
        throw new TypedDomainError("MEMORY_RUN_NOT_OWNED", "The run owner changed before memory persistence");
      }
      if (candidate !== undefined) {
        if (!locked.rows.some((row) => row.run_id === candidate!.run_id)) {
          candidate = undefined;
        } else {
          const stillOwned = await client.query<{ owned: boolean }>(
            `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
            [candidate.run_id, access.ownerRef, access.legacyAskerId]
          );
          if (stillOwned.rows[0]?.owned !== true) candidate = undefined;
        }
      }
      await client.query(
        `INSERT INTO memory.question_key (
           run_id, canonical_question_text, caller_scope, asker_scope, settlement_act,
           question_type, declared_field, normalized_binding, frozen_terms,
           frozen_query_set_hash, as_of, policy_version, key_version, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14)`,
        [input.key.runId, input.key.canonicalQuestionText, input.key.callerScope, askerScope,
          input.key.settlementAct, input.key.questionType, input.key.declaredField,
          JSON.stringify(input.key.normalizedBinding), JSON.stringify(input.key.frozenTerms),
          input.key.frozenQuerySetHash, new Date(input.key.asOf), input.key.policyVersion,
          input.key.keyVersion, await allocateSequence(client)]
      );
      const match = candidate === undefined ? null : matchQuestionKeys(
        Object.freeze({ ...input.key, askerScope: candidate.current_effective_asker_scope }),
        fromRow(Object.freeze({ ...candidate, asker_scope: candidate.effective_asker_scope }))
      );
      if (candidate !== undefined && match?.tier !== candidate.db_match_tier) {
        throw new TypedDomainError("MEMORY_MATCH_PREDICATE_DRIFT", "Database and domain match predicates disagree");
      }
      const selected = candidate === undefined || match === null ? undefined : { row: candidate, match };
      if (selected === undefined) return;
      if (!selected.match.autoLink) {
        await client.query(
          `INSERT INTO memory.candidate_record (
             source_run_id, prior_run_id, match_tier, agreement_pattern, reason, at_seq
           ) VALUES ($1,$2,$3,$4::jsonb,'BELOW_AUTOLINK_TIER',$5)`,
          [input.key.runId, selected.match.priorRunId, selected.match.tier, JSON.stringify(selected.match), await allocateSequence(client)]
        );
        return;
      }
      const aliasIds: string[] = [];
      for (const alias of input.confirmedAliases ?? []) {
        const inserted = await client.query<{ alias_row_id: string }>(
          `INSERT INTO memory.alias_row (
             surface, canonical, confirmed_by, confirmed_at, source_run_id, prior_run_id, key_version, at_seq
           ) VALUES ($1,$2,$3,clock_timestamp(),$4,$5,$6,$7) RETURNING alias_row_id`,
          [alias.surface, alias.canonical, alias.confirmedBy, input.key.runId, selected.match.priorRunId,
            input.key.keyVersion, await allocateSequence(client)]
        );
        aliasIds.push(inserted.rows[0]!.alias_row_id);
      }
      const link = await client.query<{ memory_link_id: string }>(
        `INSERT INTO memory.memory_link (
           source_run_id, prior_run_id, relation, match_tier, agreed_fields, disagreed_fields,
           not_compared_fields, decided_by, decided_at, source_as_of, prior_as_of,
           source_policy_version, prior_policy_version, source_key_version, prior_key_version,
           alias_row_ids, prior_answer_id, at_seq
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,clock_timestamp(),$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
         RETURNING memory_link_id`,
        [input.key.runId, selected.match.priorRunId, selected.match.relation, selected.match.tier,
          JSON.stringify(selected.match.agreedFields), JSON.stringify(selected.match.disagreedFields),
          JSON.stringify(selected.match.notComparedFields), input.decidedBy, new Date(input.key.asOf),
          new Date(selected.row.as_of), input.key.policyVersion, Number(selected.row.policy_version),
          input.key.keyVersion, selected.row.key_version, JSON.stringify(aliasIds), selected.row.answer_id,
          await allocateSequence(client)]
      );
      const memoryLinkId = link.rows[0]!.memory_link_id;
      await client.query(
        `INSERT INTO memory.memory_link_event (memory_link_id, state, actor_ref, reason, at_seq)
         VALUES ($1,'LINKED',$2,'AUTOLINK_DATABASE_PREDICATE',$3)`,
        [memoryLinkId, input.decidedBy, await allocateSequence(client)]
      );
      if (input.pullPolicy !== undefined && input.pullPolicy.bound > 0) {
        await this.#recordAnswerPull(client, memoryLinkId, askerScope, selected.row.answer_id, input.pullPolicy);
      }
    });
    return this.readDisclosure(input.key.runId);
  }

  async #recordAnswerPull(client: PoolClient, memoryLinkId: string, askerScope: string, answerId: string, policy: MemoryPullPolicy): Promise<void> {
    const snapshot = await client.query<{
      answer_id: string; answer_version: number; run_id: string; question_line: string; as_of: Date;
      verdict_state: string | null; confidence_band: string | null; content_hash: string; staleness_state: string | null;
    }>(
      `SELECT answer.answer_id, answer.answer_version, answer.run_id, run.question_line, run.as_of,
              answer.verdict_state, answer.confidence_band, bundle.content_hash,
              (SELECT state FROM core.staleness_state WHERE subject_kind='ANSWER'
               AND subject_ref=answer.answer_id::text ORDER BY at_seq DESC LIMIT 1) AS staleness_state
       FROM serve.answer AS answer JOIN core.run AS run USING (run_id)
       JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id=answer.fact_bundle_id
       WHERE answer.answer_id=$1`,
      [answerId]
    );
    const row = snapshot.rows[0];
    if (row === undefined) throw new TypedDomainError("MEMORY_PRIOR_ANSWER_MISSING", "The linked settled answer is unavailable");
    const pin: PinnedMemoryPull = {
      artifactId: row.answer_id, version: row.answer_version, contentHash: row.content_hash,
      asOf: row.as_of.toISOString(), stalenessStateAtPull: row.staleness_state ?? "FRESH",
      askerScope, registerRowKey: policy.rowKey, registerVersion: policy.registerVersion,
      registerSourceRef: policy.sourceRef
    };
    validatePinnedPulls([pin], policy);
    await client.query(
      `INSERT INTO memory.pull_record (
         memory_link_id, artifact_kind, artifact_id, artifact_version, content_hash,
         artifact_as_of, staleness_state_at_pull, asker_scope, payload_snapshot,
         register_row_key, register_version, register_source_ref, at_seq
       ) VALUES ($1,'PRIOR_ANSWER',$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
      [memoryLinkId, pin.artifactId, pin.version, pin.contentHash, new Date(pin.asOf), pin.stalenessStateAtPull,
        pin.askerScope, JSON.stringify({ runId: row.run_id, questionLine: row.question_line,
          verdict: row.verdict_state, verdictAdmissibility: classifyPulledArtifact("PRIOR_VERDICT"),
          confidenceBand: row.confidence_band }), pin.registerRowKey,
        pin.registerVersion, pin.registerSourceRef, await allocateSequence(client)]
    );
  }

  async readDisclosure(runId: string): Promise<MemoryDisclosure | null> {
    const candidates = await this.pool.query<{ prior_run_id: string; match_tier: MemoryMatchTier }>(
      `SELECT prior_run_id, match_tier FROM memory.candidate_record WHERE source_run_id=$1 ORDER BY at_seq`, [runId]
    );
    const link = await this.pool.query<{
      memory_link_id: string; source_run_id: string; prior_run_id: string; relation: MemoryLinkRelation; match_tier: MemoryMatchTier;
      agreed_fields: string[]; disagreed_fields: string[]; not_compared_fields: string[]; decided_by: string; prior_answer_id: string;
      state: "LINKED" | "UNLINKED";
    }>(
      `SELECT link.*, event.state FROM memory.memory_link AS link
       JOIN LATERAL (SELECT state FROM memory.memory_link_event WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1) AS event ON true
       WHERE link.source_run_id=$1 ORDER BY link.at_seq DESC LIMIT 1`, [runId]
    );
    const row = link.rows[0];
    if (row === undefined || row.state === "UNLINKED") {
      return candidates.rows.length === 0 ? null : buildMemoryDisclosure({
        match: null, prior: null, pulls: [], candidates: candidates.rows.map((candidate) => ({
          priorRunId: candidate.prior_run_id, tier: candidate.match_tier
        }))
      });
    }
    const pull = await this.pool.query<{
      artifact_id: string; artifact_version: number; content_hash: string; artifact_as_of: Date;
      staleness_state_at_pull: string; asker_scope: string; register_row_key: string;
      register_version: string; register_source_ref: string; payload_snapshot: {
        runId: string; questionLine: string; verdict: string | null; confidenceBand: string | null;
      };
    }>("SELECT * FROM memory.pull_record WHERE memory_link_id=$1 ORDER BY at_seq", [row.memory_link_id]);
    const pins = pull.rows.map((item): PinnedMemoryPull => ({
      artifactId: item.artifact_id, version: item.artifact_version, contentHash: item.content_hash,
      asOf: item.artifact_as_of.toISOString(), stalenessStateAtPull: item.staleness_state_at_pull,
      askerScope: item.asker_scope, registerRowKey: item.register_row_key,
      registerVersion: Number(item.register_version), registerSourceRef: item.register_source_ref
    }));
    const first = pull.rows[0];
    const match: MemoryMatchFact = Object.freeze({
      sourceRunId: row.source_run_id, priorRunId: row.prior_run_id, tier: row.match_tier,
      relation: row.relation, autoLink: true, agreedFields: row.agreed_fields,
      disagreedFields: row.disagreed_fields, notComparedFields: row.not_compared_fields, sharedTermCount: 0
    });
    return buildMemoryDisclosure({
      match, memoryLinkId: row.memory_link_id, decidedBy: row.decided_by,
      prior: first === undefined ? null : {
        runId: first.payload_snapshot.runId, answerId: first.artifact_id, answerVersion: first.artifact_version,
        questionLine: first.payload_snapshot.questionLine, answeredAt: first.artifact_as_of.toISOString(),
        verdict: first.payload_snapshot.verdict, confidenceBand: first.payload_snapshot.confidenceBand,
        stalenessState: first.staleness_state_at_pull
      },
      pulls: pins,
      candidates: candidates.rows.map((candidate) => ({ priorRunId: candidate.prior_run_id, tier: candidate.match_tier }))
    });
  }

  async unlinkForAnswer(answerId: string, ownership: RunOwnershipInput, actorRef: string): Promise<{ readonly memoryLinkId: string } | null> {
    const access = normalizeRunOwnership(ownership);
    return withWriteTransaction(this.pool, async (client) => {
      const located = await client.query<{ run_id: string }>(
        `SELECT run_id FROM serve.answer WHERE answer_id=$1
         ORDER BY answer_version DESC LIMIT 1`, [answerId]
      );
      const runId = located.rows[0]?.run_id;
      if (runId === undefined) return null;
      const lockedRun = await client.query<{ run_id: string }>(
        `SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE`, [runId]
      );
      if (lockedRun.rows[0] === undefined) return null;
      const owned = await client.query<{ owned: boolean }>(
        `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
        [runId, access.ownerRef, access.legacyAskerId]
      );
      if (owned.rows[0]?.owned !== true) return null;
      const link = await client.query<{ memory_link_id: string }>(
        `SELECT link.memory_link_id
         FROM memory.memory_link AS link
         WHERE link.source_run_id=$1
         ORDER BY link.at_seq DESC LIMIT 1
         FOR UPDATE`,
        [runId]
      );
      const row = link.rows[0];
      if (row === undefined) return null;
      // Re-read latest state after taking the link lock; a concurrent unlink
      // cannot leave this decision based on a stale LATERAL snapshot.
      const state = await client.query<{ state: string }>(
        `SELECT state FROM memory.memory_link_event
         WHERE memory_link_id=$1 ORDER BY at_seq DESC LIMIT 1`,
        [row.memory_link_id]
      );
      if (state.rows[0]?.state !== "LINKED") return null;
      await client.query(
        `INSERT INTO memory.memory_link_event (memory_link_id, state, actor_ref, reason, at_seq)
         VALUES ($1,'UNLINKED',$2,'ASKER_UNLINK_CONTROL',$3)`,
        [row.memory_link_id, actorRef, await allocateSequence(client)]
      );
      return Object.freeze({ memoryLinkId: row.memory_link_id });
    });
  }

  async observeAnswerContradiction(answerId: string, actorRef: string): Promise<string | null> {
    const observation = await this.pool.query<{
      source_run_id: string; prior_run_id: string; memory_link_id: string; match_tier: MemoryMatchTier;
      agreed_fields: string[]; disagreed_fields: string[]; not_compared_fields: string[]; decided_by: string;
      source_as_of: Date; prior_as_of: Date; source_policy_version: string; prior_policy_version: string;
      source_key_version: number; prior_key_version: number; alias_row_ids: string[]; prior_answer_id: string;
      current_verdict: string | null; prior_verdict: string | null;
    }>(
      `SELECT link.*, answer.verdict_state AS current_verdict,
              pull.payload_snapshot->>'verdict' AS prior_verdict
       FROM serve.answer AS answer
       JOIN memory.memory_link AS link ON link.source_run_id=answer.run_id
       JOIN LATERAL (SELECT state FROM memory.memory_link_event WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1) AS event ON true
       JOIN memory.pull_record AS pull ON pull.memory_link_id=link.memory_link_id AND pull.artifact_kind='PRIOR_ANSWER'
       WHERE answer.answer_id=$1 AND event.state='LINKED'
       ORDER BY link.at_seq DESC, pull.at_seq LIMIT 1`,
      [answerId]
    );
    const row = observation.rows[0];
    if (row === undefined || row.current_verdict === null || row.prior_verdict === null || row.current_verdict === row.prior_verdict) return null;
    return withWriteTransaction(this.pool, async (client) => {
      const linkSequence = await allocateSequence(client);
      const inserted = await client.query<{ memory_link_id: string }>(
        `INSERT INTO memory.memory_link (
           source_run_id, prior_run_id, relation, match_tier, agreed_fields, disagreed_fields,
           not_compared_fields, decided_by, decided_at, source_as_of, prior_as_of,
           source_policy_version, prior_policy_version, source_key_version, prior_key_version,
           alias_row_ids, prior_answer_id, at_seq
         ) VALUES ($1,$2,'CONTRADICTS_PRIOR',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,clock_timestamp(),$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
         RETURNING memory_link_id`,
        [row.source_run_id, row.prior_run_id, row.match_tier, JSON.stringify(row.agreed_fields),
          JSON.stringify(row.disagreed_fields), JSON.stringify(row.not_compared_fields), actorRef,
          row.source_as_of, row.prior_as_of, row.source_policy_version, row.prior_policy_version,
          row.source_key_version, row.prior_key_version, JSON.stringify(row.alias_row_ids),
          row.prior_answer_id, linkSequence]
      );
      const memoryLinkId = inserted.rows[0]!.memory_link_id;
      const priorPulls = await client.query<{
        artifact_kind: string; artifact_id: string; artifact_version: number; content_hash: string;
        artifact_as_of: Date; staleness_state_at_pull: string; asker_scope: string;
        payload_snapshot: Readonly<Record<string, unknown>>; register_row_key: string;
        register_version: string; register_source_ref: string;
      }>("SELECT * FROM memory.pull_record WHERE memory_link_id=$1 ORDER BY at_seq", [row.memory_link_id]);
      for (const pull of priorPulls.rows) {
        await client.query(
          `INSERT INTO memory.pull_record (
             memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,
             artifact_as_of,staleness_state_at_pull,asker_scope,payload_snapshot,
             register_row_key,register_version,register_source_ref,at_seq
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
          [memoryLinkId, pull.artifact_kind, pull.artifact_id, pull.artifact_version, pull.content_hash,
            pull.artifact_as_of, pull.staleness_state_at_pull, pull.asker_scope,
            JSON.stringify(pull.payload_snapshot), pull.register_row_key, pull.register_version,
            pull.register_source_ref, await allocateSequence(client)]
        );
      }
      await client.query(
        `INSERT INTO memory.memory_link_event (memory_link_id,state,actor_ref,reason,at_seq)
         VALUES ($1,'UNLINKED',$2,'RELATION_SUPERSEDED_BY_CONTRADICTION',$3)`,
        [row.memory_link_id, actorRef, await allocateSequence(client)]
      );
      await client.query(
        `INSERT INTO memory.memory_link_event (memory_link_id,state,actor_ref,reason,at_seq)
         VALUES ($1,'LINKED',$2,'CURRENT_VERDICT_CONTRADICTS_PRIOR',$3)`,
        [memoryLinkId, actorRef, await allocateSequence(client)]
      );
      await client.query(
        `INSERT INTO core.revision_trigger (
           run_id, trigger_key, trigger_kind, subject_kind, subject_ref, state, reason, at_seq
         ) VALUES ($1,$2,'CONTRADICTS_PRIOR','ANSWER',$3,'FIRED','LATER_RUN_CONTRADICTS_PRIOR',$4)`,
        [row.prior_run_id, `memory-contradiction:${memoryLinkId}`, row.prior_answer_id, await allocateSequence(client)]
      );
      return memoryLinkId;
    });
  }
}
