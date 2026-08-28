import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  MAX_OWNER_PRIVATE_HISTORY_SCAN,
  allocateSequence,
  decryptContentForRun,
  decryptLeasedContentForRun,
  encryptAttestedLeasedContentForRun,
  normalizeRunOwnership,
  prepareLeasedContentEncryptionForRun,
  prepareLeasedContentEncryptionForRuns,
  type CryptoEnvelope,
  type LeasedPreparedRunContentCipher,
  withRunContentLease,
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

function nonContentMatchFields(fields: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(fields.map((field) =>
    field.startsWith("binding:") ? "binding" : field
  ))]);
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
    agreedFields: tier === "TERM_OVERLAP"
      ? Object.freeze(["termOverlap"])
      : nonContentMatchFields(agreed),
    disagreedFields: nonContentMatchFields(disagreed),
    notComparedFields: nonContentMatchFields(notCompared)
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
  question_key_id: string; run_id: string; canonical_question_text: string;
  question_blind_index: Buffer | null; content_ciphertext: CryptoEnvelope | null;
  caller_scope: string; asker_scope: string;
  settlement_act: string | null; question_type: string | null; declared_field: string | null;
  normalized_binding: Record<string, string | null>; frozen_terms: string[]; frozen_query_set_hash: string | null;
  as_of: Date; policy_version: string; key_version: number; at_seq: string;
};

type MemoryCandidateRef = {
  readonly question_key_id: string;
  readonly run_id: string;
  readonly at_seq: string;
};

type MemoryCandidateSelection = {
  readonly priorRunId: string;
  readonly answerId: string;
  readonly atSeq: string;
  readonly priorAsOf: Date;
  readonly priorPolicyVersion: number;
  readonly priorKeyVersion: number;
  readonly match: MemoryMatchFact;
};

const MEMORY_MATCH_RANK: Readonly<Record<MemoryMatchTier, number>> = Object.freeze({
  EXACT_QUESTION: 1,
  SAME_BINDING: 2,
  PARTIAL_BINDING: 3,
  TERM_OVERLAP: 4
});

function prefersCandidate(
  candidate: MemoryCandidateSelection,
  selected: MemoryCandidateSelection | undefined
): boolean {
  if (selected === undefined) return true;
  const candidateRank = MEMORY_MATCH_RANK[candidate.match.tier];
  const selectedRank = MEMORY_MATCH_RANK[selected.match.tier];
  if (candidateRank !== selectedRank) return candidateRank < selectedRank;
  return BigInt(candidate.atSeq) > BigInt(selected.atSeq);
}

function ownershipFromMemoryScope(askerScope: string): ReturnType<typeof normalizeRunOwnership> {
  if (askerScope.startsWith("owner:")) {
    return normalizeRunOwnership({ ownerRef: askerScope.slice("owner:".length), legacyAskerId: null });
  }
  return normalizeRunOwnership(askerScope);
}

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

  async withDisclosureContentLease<T>(
    sourceRunIds: readonly string[],
    use: () => Promise<T>
  ): Promise<T> {
    const sources = [...new Set(sourceRunIds)].sort();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const discovered = [...new Set((await Promise.all(
        sources.map((runId) => this.leaseRunIdsForDisclosure(runId))
      )).flat())].sort();
      try {
        return await withRunContentLease(this.pool,discovered,async () => {
          const revalidated = [...new Set((await Promise.all(
            sources.map((runId) => this.leaseRunIdsForDisclosure(runId))
          )).flat())].sort();
          if (revalidated.length !== discovered.length
            || revalidated.some((runId,index) => runId !== discovered[index])) {
            throw new TypedDomainError(
              "CONTENT_LEASE_SCOPE_CHANGED",
              "The private-content relation changed while its lease was acquired"
            );
          }
          return use();
        });
      } catch (error) {
        if (!(error instanceof TypedDomainError)
          || error.code !== "CONTENT_LEASE_SCOPE_CHANGED"
          || attempt === 2) throw error;
      }
    }
    throw new TypedDomainError(
      "CONTENT_LEASE_SCOPE_CHANGED",
      "The private-content relation did not stabilize"
    );
  }

  async leaseRunIdsForDisclosure(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ prior_run_id: string | null }>(
      `SELECT link.prior_run_id
       FROM memory.memory_link AS link
       JOIN LATERAL (
         SELECT state FROM memory.memory_link_event
         WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1
       ) AS event ON true
       WHERE link.source_run_id=$1 AND event.state='LINKED'
       ORDER BY link.at_seq DESC LIMIT 1`,
      [runId]
    );
    return Object.freeze([...new Set([
      runId,
      ...(result.rows[0]?.prior_run_id === null || result.rows[0]?.prior_run_id === undefined
        ? [] : [result.rows[0].prior_run_id])
    ])].sort());
  }

  async leaseRunIdsForAnswerContradiction(answerId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ source_run_id: string; prior_run_id: string }>(
      `SELECT link.source_run_id,link.prior_run_id
       FROM serve.answer AS answer
       JOIN memory.memory_link AS link ON link.source_run_id=answer.run_id
       JOIN LATERAL (
         SELECT state FROM memory.memory_link_event
         WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1
       ) AS event ON true
       WHERE answer.answer_id=$1 AND event.state='LINKED'
       ORDER BY link.at_seq DESC LIMIT 1`,
      [answerId]
    );
    const row = result.rows[0];
    return Object.freeze(row === undefined ? [] : [...new Set([
      row.source_run_id,row.prior_run_id
    ])].sort());
  }

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
    const currentKey = Object.freeze({ ...input.key, askerScope });
    let selected: MemoryCandidateSelection | undefined;
    const candidateRefs = await this.#ownerScopedCandidateRefs(input.key.runId, access);
    for (const candidateRef of candidateRefs) {
      const evaluated = await this.#evaluateCandidate(currentKey, access, askerScope, candidateRef);
      if (evaluated !== null && prefersCandidate(evaluated, selected)) selected = evaluated;
    }

    const questionKeyId = randomUUID();
    const leasedByRun = await prepareLeasedContentEncryptionForRuns(
      this.pool,
      selected === undefined ? [input.key.runId] : [input.key.runId,selected.priorRunId]
    );
    const sourceLease = leasedByRun.get(input.key.runId)!;
    const sourcePrepared = sourceLease.prepared;
    const selectedLease = selected === undefined
      ? undefined
      : leasedByRun.get(selected.priorRunId);
    try {
      const questionContent = encryptAttestedLeasedContentForRun(
        sourceLease, "memory.question_key", questionKeyId,
        {
          canonicalQuestionText: input.key.canonicalQuestionText,
          normalizedBinding: input.key.normalizedBinding,
          frozenTerms: input.key.frozenTerms
        }
      );
      const storedQuestion = questionContent === null
        ? input.key.canonicalQuestionText
        : CONTENT_CIPHERTEXT_SENTINEL;
      const storedBinding = questionContent === null ? input.key.normalizedBinding : {};
      const storedTerms = questionContent === null ? input.key.frozenTerms : [];

      await withWriteTransaction(this.pool, async (client) => {
      // Candidate evaluation deliberately released its short lock and zeroed
      // its key. Lock the source and chosen prior in stable order, then
      // revalidate both before any immutable write or final pull decryption.
      const runIds = selected === undefined
        ? [input.key.runId]
        : [input.key.runId, selected.priorRunId].sort();
      const locked = await client.query<{ run_id: string }>(
        `SELECT run_id FROM core.lock_owned_live_runs($1::uuid[],$2::uuid,$3::text)`,
        [runIds, access.ownerRef, access.legacyAskerId]
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
      const sourceErasureGate = await client.query<{ live: boolean }>(
        `SELECT CASE WHEN content_encryption_version=1
           THEN core.run_private_content_is_live(run_id) ELSE true END AS live
         FROM core.run WHERE run_id=$1`,
        [input.key.runId]
      );
      if (sourceErasureGate.rows[0]?.live !== true) {
        throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
      }
      if (selected !== undefined) {
        if (!locked.rows.some((row) => row.run_id === selected!.priorRunId)) {
          selected = undefined;
        } else {
          const stillOwned = await client.query<{ owned: boolean }>(
            `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
            [selected.priorRunId, access.ownerRef, access.legacyAskerId]
          );
          if (stillOwned.rows[0]?.owned !== true) selected = undefined;
          if (selected !== undefined) {
            const selectedErasureGate = await client.query<{ live: boolean }>(
              `SELECT CASE WHEN content_encryption_version=1
                 THEN core.run_private_content_is_live(run_id) ELSE true END AS live
               FROM core.run WHERE run_id=$1`,
              [selected.priorRunId]
            );
            if (selectedErasureGate.rows[0]?.live !== true) selected = undefined;
          }
        }
      }
      await client.query(
        `INSERT INTO memory.question_key (
           question_key_id,run_id,canonical_question_text,caller_scope,asker_scope,settlement_act,
           question_type, declared_field, normalized_binding, frozen_terms,
           frozen_query_set_hash,frozen_query_set_hash_version,
           as_of,policy_version,key_version,at_seq,
           question_blind_index_version,question_blind_index,content_ciphertext,content_attestation
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)`,
        [questionKeyId, input.key.runId, storedQuestion, input.key.callerScope, askerScope,
          input.key.settlementAct, input.key.questionType, input.key.declaredField,
          JSON.stringify(storedBinding), JSON.stringify(storedTerms),
          questionContent === null ? input.key.frozenQuerySetHash : null,
          questionContent === null ? 1 : 2,
          new Date(input.key.asOf), input.key.policyVersion,
          input.key.keyVersion, await allocateSequence(client), questionContent === null ? 1 : 2,
          null,
          questionContent === null ? null : JSON.stringify(questionContent.envelope),
          questionContent?.attestation ?? null]
      );
      if (selected === undefined) return;
      if (!selected.match.autoLink) {
        await client.query(
          `INSERT INTO memory.candidate_record (
           source_run_id, prior_run_id, match_tier, agreement_pattern, reason, at_seq
           ) VALUES ($1,$2,$3,$4::jsonb,'BELOW_AUTOLINK_TIER',$5)`,
          [input.key.runId, selected.priorRunId, selected.match.tier, JSON.stringify(selected.match), await allocateSequence(client)]
        );
        return;
      }
      const aliasIds: string[] = [];
      for (const alias of input.confirmedAliases ?? []) {
        const inserted = await client.query<{ alias_row_id: string }>(
          `INSERT INTO memory.alias_row (
           surface, canonical, confirmed_by, confirmed_at, source_run_id, prior_run_id, key_version, at_seq
           ) VALUES ($1,$2,$3,clock_timestamp(),$4,$5,$6,$7) RETURNING alias_row_id`,
          [alias.surface, alias.canonical, alias.confirmedBy, input.key.runId, selected.priorRunId,
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
        [input.key.runId, selected.priorRunId, selected.match.relation, selected.match.tier,
          JSON.stringify(selected.match.agreedFields), JSON.stringify(selected.match.disagreedFields),
          JSON.stringify(selected.match.notComparedFields), input.decidedBy, new Date(input.key.asOf),
          selected.priorAsOf, input.key.policyVersion, selected.priorPolicyVersion,
          input.key.keyVersion, selected.priorKeyVersion, JSON.stringify(aliasIds), selected.answerId,
          await allocateSequence(client)]
      );
      const memoryLinkId = link.rows[0]!.memory_link_id;
      await client.query(
        `INSERT INTO memory.memory_link_event (memory_link_id, state, actor_ref, reason, at_seq)
         VALUES ($1,'LINKED',$2,'AUTOLINK_DATABASE_PREDICATE',$3)`,
        [memoryLinkId, input.decidedBy, await allocateSequence(client)]
      );
      if (input.pullPolicy !== undefined && input.pullPolicy.bound > 0) {
        await this.#recordAnswerPull(
          client, sourceLease, selectedLease, input.key.runId, memoryLinkId,
          askerScope, selected.answerId, input.pullPolicy
        );
      }
      });
      await sourceLease.assertLive();
    } finally {
      await sourceLease.close();
    }
    return this.readDisclosure(input.key.runId);
  }

  async #ownerScopedCandidateRefs(
    sourceRunId: string,
    access: ReturnType<typeof normalizeRunOwnership>
  ): Promise<readonly MemoryCandidateRef[]> {
    const candidates = await this.pool.query<MemoryCandidateRef>(
      `SELECT key.question_key_id, key.run_id, key.at_seq
       FROM memory.question_key AS key
       JOIN core.run AS key_run ON key_run.run_id=key.run_id
       LEFT JOIN LATERAL (
         SELECT event.owner_ref FROM core.run_ownership_event AS event
         WHERE event.run_id=key.run_id ORDER BY event.at_seq DESC LIMIT 1
       ) AS key_owner ON true
       WHERE key.run_id<>$1
         AND (
           ($2::uuid IS NOT NULL AND key_owner.owner_ref=$2::uuid)
           OR ($2::uuid IS NULL AND key_owner.owner_ref IS NULL AND key.asker_scope=$3::text)
         )
         AND EXISTS (
           SELECT 1 FROM scorecard.answer_outcome AS outcome
           WHERE outcome.run_id=key.run_id AND outcome.accepted
         )
         AND EXISTS (
           SELECT 1 FROM core.run_progress_event AS progress
           WHERE progress.run_id=key.run_id AND progress.kind='TERMINAL'
         )
         AND (
           key_run.content_encryption_version IS DISTINCT FROM 1
           OR core.run_private_content_is_live(key.run_id)
         )
       ORDER BY key.at_seq DESC,key.question_key_id
       LIMIT $4`,
      [sourceRunId, access.ownerRef, access.legacyAskerId,MAX_OWNER_PRIVATE_HISTORY_SCAN+1]
    );
    if (candidates.rows.length > MAX_OWNER_PRIVATE_HISTORY_SCAN) {
      throw new TypedDomainError(
        "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
        "Private history exceeds the bounded comparison window"
      );
    }
    return candidates.rows;
  }

  async #evaluateCandidate(
    current: MemoryQuestionKey,
    access: ReturnType<typeof normalizeRunOwnership>,
    askerScope: string,
    reference: MemoryCandidateRef
  ): Promise<MemoryCandidateSelection | null> {
    const leasedContent = await prepareLeasedContentEncryptionForRun(this.pool, reference.run_id);
    const prepared = leasedContent.prepared;
    try {
      const selection = await withWriteTransaction(this.pool, async (client) => {
        const locked = await client.query<{ run_id: string }>(
          `SELECT run_id
           FROM core.lock_owned_live_runs(ARRAY[$1]::uuid[],$2::uuid,$3::text)`,
          [reference.run_id, access.ownerRef, access.legacyAskerId]
        );
        if (locked.rows[0] === undefined) return null;
        const owned = await client.query<{ owned: boolean }>(
          `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
          [reference.run_id, access.ownerRef, access.legacyAskerId]
        );
        if (owned.rows[0]?.owned !== true) return null;
        const erasureGate = await client.query<{ live: boolean }>(
          `SELECT CASE WHEN content_encryption_version=1
             THEN core.run_private_content_is_live(run_id) ELSE true END AS live
           FROM core.run WHERE run_id=$1`,
          [reference.run_id]
        );
        if (erasureGate.rows[0]?.live !== true) return null;
        const candidateRows = await client.query<QuestionKeyRow & { answer_id: string }>(
          `SELECT key.*, outcome.answer_id
           FROM memory.question_key AS key
           JOIN LATERAL (
             SELECT candidate.answer_id
             FROM scorecard.answer_outcome AS candidate
             WHERE candidate.run_id=key.run_id AND candidate.accepted
             ORDER BY candidate.at_seq DESC LIMIT 1
           ) AS outcome ON true
           WHERE key.question_key_id=$1 AND key.run_id=$2
             AND EXISTS (
               SELECT 1 FROM core.run_progress_event AS progress
               WHERE progress.run_id=key.run_id AND progress.kind='TERMINAL'
             )`,
          [reference.question_key_id, reference.run_id]
        );
        const candidate = candidateRows.rows[0];
        if (candidate === undefined) return null;
        const content = decryptLeasedContentForRun<{
          canonicalQuestionText: string;
          normalizedBinding?: Readonly<Record<string, string | null>>;
          frozenTerms?: readonly string[];
        }>(
          leasedContent, "memory.question_key", reference.question_key_id,
          candidate.content_ciphertext,
          {
            canonicalQuestionText: candidate.canonical_question_text,
            normalizedBinding: candidate.normalized_binding,
            frozenTerms: candidate.frozen_terms
          }
        );
        const prior = fromRow(Object.freeze({
          ...candidate,
          asker_scope: askerScope,
          canonical_question_text: content.canonicalQuestionText,
          normalized_binding: { ...(content.normalizedBinding ?? candidate.normalized_binding) },
          frozen_terms: [...(content.frozenTerms ?? candidate.frozen_terms)]
        }));
        const match = matchQuestionKeys(current, prior);
        if (match === null) return null;
        return Object.freeze({
          priorRunId: candidate.run_id,
          answerId: candidate.answer_id,
          atSeq: candidate.at_seq,
          priorAsOf: candidate.as_of,
          priorPolicyVersion: Number(candidate.policy_version),
          priorKeyVersion: candidate.key_version,
          match
        });
      });
      await leasedContent.assertLive();
      return selection;
    } finally {
      await leasedContent.close();
    }
  }

  async #recordAnswerPull(
    client: PoolClient,
    sourceLease: LeasedPreparedRunContentCipher,
    selectedLease: LeasedPreparedRunContentCipher | undefined,
    sourceRunId: string,
    memoryLinkId: string,
    askerScope: string,
    answerId: string,
    policy: MemoryPullPolicy
  ): Promise<void> {
    const sourcePrepared = sourceLease.prepared;
    const snapshot = await client.query<{
      answer_id: string; answer_version: number; run_id: string; question_line: string; as_of: Date;
      run_content_ciphertext: CryptoEnvelope | null;
      verdict_state: string | null; confidence_band: string | null; content_hash: string; staleness_state: string | null;
    }>(
      `SELECT answer.answer_id, answer.answer_version, answer.run_id, run.question_line,
              run.content_ciphertext AS run_content_ciphertext, run.as_of,
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
    if (selectedLease === undefined) {
      throw new TypedDomainError("MEMORY_PRIOR_ANSWER_MISSING", "The linked settled answer is unavailable");
    }
    const runContent = decryptLeasedContentForRun<{ questionLine: string }>(
      selectedLease, "core.run", row.run_id, row.run_content_ciphertext,
      { questionLine: row.question_line }
    );
    const pullRecordId = randomUUID();
    const pin: PinnedMemoryPull = {
      artifactId: row.answer_id, version: row.answer_version, contentHash: row.content_hash,
      asOf: row.as_of.toISOString(), stalenessStateAtPull: row.staleness_state ?? "FRESH",
      askerScope, registerRowKey: policy.rowKey, registerVersion: policy.registerVersion,
      registerSourceRef: policy.sourceRef
    };
    validatePinnedPulls([pin], policy);
    const payloadSnapshot = {
      runId: row.run_id,
      questionLine: runContent.questionLine,
      verdict: row.verdict_state,
      verdictAdmissibility: classifyPulledArtifact("PRIOR_VERDICT"),
      confidenceBand: row.confidence_band
    };
    const content = encryptAttestedLeasedContentForRun(
      sourceLease, "memory.pull_record", pullRecordId,
      { payloadSnapshot }
    );
    await client.query(
      `INSERT INTO memory.pull_record (
         pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,
         content_hash_version,
         artifact_as_of, staleness_state_at_pull, asker_scope, payload_snapshot,
         register_row_key,register_version,register_source_ref,at_seq,content_ciphertext,content_attestation
       ) VALUES ($1,$2,'PRIOR_ANSWER',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15::jsonb,$16)`,
      [pullRecordId, memoryLinkId, pin.artifactId, pin.version,
        content === null ? pin.contentHash : null,content === null ? 1 : 2,
        new Date(pin.asOf), pin.stalenessStateAtPull, pin.askerScope,
        JSON.stringify(content === null ? payloadSnapshot : { ciphertext: true, v: 1 }),
        pin.registerRowKey, pin.registerVersion, pin.registerSourceRef,
        await allocateSequence(client),
        content === null ? null : JSON.stringify(content.envelope),content?.attestation ?? null]
    );
  }

  async readDisclosure(runId: string): Promise<MemoryDisclosure | null> {
    return this.withDisclosureContentLease([runId],async () =>
      this.#readDisclosureUnderLease(runId));
  }

  async #readDisclosureUnderLease(runId: string): Promise<MemoryDisclosure | null> {
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
    return withRunContentLease(this.pool, [row.source_run_id, row.prior_run_id], async () => {
    const currentScope = await this.leaseRunIdsForDisclosure(runId);
    if (!currentScope.every((candidate) =>
      candidate === row.source_run_id || candidate === row.prior_run_id)) {
      throw new TypedDomainError(
        "CONTENT_LEASE_SCOPE_CHANGED",
        "The private-content relation changed while its lease was acquired"
      );
    }
    const pull = await this.pool.query<{
      pull_record_id: string;
      artifact_id: string; artifact_version: number; content_hash: string; artifact_as_of: Date;
      staleness_state_at_pull: string; asker_scope: string; register_row_key: string;
      register_version: string; register_source_ref: string; payload_snapshot: {
        runId: string; questionLine: string; verdict: string | null; confidenceBand: string | null;
      };
      content_ciphertext: CryptoEnvelope | null;
    }>("SELECT * FROM memory.pull_record WHERE memory_link_id=$1 ORDER BY at_seq", [row.memory_link_id]);
    const decryptedPulls = await Promise.all(pull.rows.map(async (item) => {
      const content = await decryptContentForRun<{ payloadSnapshot: typeof item.payload_snapshot }>(
        this.pool, row.source_run_id, "memory.pull_record", item.pull_record_id,
        item.content_ciphertext, { payloadSnapshot: item.payload_snapshot }
      );
      return { ...item, payload_snapshot: content.payloadSnapshot };
    }));
    const pins = decryptedPulls.map((item): PinnedMemoryPull => ({
      artifactId: item.artifact_id, version: item.artifact_version, contentHash: item.content_hash,
      asOf: item.artifact_as_of.toISOString(), stalenessStateAtPull: item.staleness_state_at_pull,
      askerScope: item.asker_scope, registerRowKey: item.register_row_key,
      registerVersion: Number(item.register_version), registerSourceRef: item.register_source_ref
    }));
    const first = decryptedPulls[0];
    const match: MemoryMatchFact = Object.freeze({
      sourceRunId: row.source_run_id, priorRunId: row.prior_run_id, tier: row.match_tier,
      relation: row.relation, autoLink: true, agreedFields: row.agreed_fields,
      disagreedFields: row.disagreed_fields, notComparedFields: row.not_compared_fields
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
        `SELECT run_id
         FROM core.lock_owned_live_runs(ARRAY[$1]::uuid[],$2::uuid,$3::text)`,
        [runId, access.ownerRef, access.legacyAskerId]
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
    const located = await this.pool.query<{
      source_run_id: string;
      prior_run_id: string;
      memory_link_id: string;
      pull_record_id: string;
      asker_scope: string;
    }>(
      `SELECT link.source_run_id, link.prior_run_id, link.memory_link_id,
              pull.pull_record_id, pull.asker_scope
       FROM serve.answer AS answer
       JOIN memory.memory_link AS link ON link.source_run_id=answer.run_id
       JOIN LATERAL (SELECT state FROM memory.memory_link_event WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1) AS event ON true
       JOIN memory.pull_record AS pull ON pull.memory_link_id=link.memory_link_id AND pull.artifact_kind='PRIOR_ANSWER'
       WHERE answer.answer_id=$1 AND event.state='LINKED'
       ORDER BY link.at_seq DESC, pull.at_seq LIMIT 1`,
      [answerId]
    );
    const reference = located.rows[0];
    if (reference === undefined) return null;
    const access = ownershipFromMemoryScope(reference.asker_scope);
    const leasedByRun = await prepareLeasedContentEncryptionForRuns(
      this.pool,[reference.source_run_id,reference.prior_run_id]
    );
    const sourceLease = leasedByRun.get(reference.source_run_id)!;
    const sourcePrepared = sourceLease.prepared;
    try {
      const result = await withWriteTransaction(this.pool, async (client) => {
      const runIds = [reference.source_run_id, reference.prior_run_id].sort();
      const locked = await client.query<{ run_id: string }>(
        `SELECT run_id FROM core.lock_owned_live_runs($1::uuid[],$2::uuid,$3::text)`,
        [runIds, access.ownerRef, access.legacyAskerId]
      );
      if (locked.rows.length !== runIds.length) return null;
      for (const runId of runIds) {
        const owned = await client.query<{ owned: boolean }>(
          `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
          [runId, access.ownerRef, access.legacyAskerId]
        );
        if (owned.rows[0]?.owned !== true) return null;
        const erasureGate = await client.query<{ live: boolean }>(
          `SELECT CASE WHEN content_encryption_version=1
             THEN core.run_private_content_is_live(run_id) ELSE true END AS live
           FROM core.run WHERE run_id=$1`,
          [runId]
        );
        if (erasureGate.rows[0]?.live !== true) return null;
      }
      const observation = await client.query<{
        source_run_id: string; prior_run_id: string; memory_link_id: string; match_tier: MemoryMatchTier;
        agreed_fields: string[]; disagreed_fields: string[]; not_compared_fields: string[]; decided_by: string;
        source_as_of: Date; prior_as_of: Date; source_policy_version: string; prior_policy_version: string;
        source_key_version: number; prior_key_version: number; alias_row_ids: string[]; prior_answer_id: string;
        current_verdict: string | null; pull_record_id: string;
        payload_snapshot: Readonly<Record<string, unknown>>;
        pull_content_ciphertext: CryptoEnvelope | null;
      }>(
        `SELECT link.*, answer.verdict_state AS current_verdict,
                pull.pull_record_id, pull.payload_snapshot,
                pull.content_ciphertext AS pull_content_ciphertext
         FROM serve.answer AS answer
         JOIN memory.memory_link AS link ON link.source_run_id=answer.run_id
         JOIN LATERAL (
           SELECT state FROM memory.memory_link_event
           WHERE memory_link_id=link.memory_link_id ORDER BY at_seq DESC LIMIT 1
         ) AS event ON true
         JOIN memory.pull_record AS pull
           ON pull.memory_link_id=link.memory_link_id AND pull.artifact_kind='PRIOR_ANSWER'
         WHERE answer.answer_id=$1 AND link.memory_link_id=$2
           AND pull.pull_record_id=$3 AND event.state='LINKED'`,
        [answerId, reference.memory_link_id, reference.pull_record_id]
      );
      const row = observation.rows[0];
      if (row === undefined || row.current_verdict === null) return null;
      const observedPull = decryptLeasedContentForRun<{
        payloadSnapshot: Readonly<Record<string, unknown>>;
      }>(
        sourceLease, "memory.pull_record", row.pull_record_id,
        row.pull_content_ciphertext, { payloadSnapshot: row.payload_snapshot }
      );
      const priorVerdict = typeof observedPull.payloadSnapshot.verdict === "string"
        ? observedPull.payloadSnapshot.verdict
        : null;
      if (priorVerdict === null || row.current_verdict === priorVerdict) return null;
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
        pull_record_id: string;
        artifact_kind: string; artifact_id: string; artifact_version: number; content_hash: string;
        artifact_as_of: Date; staleness_state_at_pull: string; asker_scope: string;
        payload_snapshot: Readonly<Record<string, unknown>>; register_row_key: string;
        register_version: string; register_source_ref: string;
        content_ciphertext: CryptoEnvelope | null;
      }>("SELECT * FROM memory.pull_record WHERE memory_link_id=$1 ORDER BY at_seq", [row.memory_link_id]);
      for (const pull of priorPulls.rows) {
        const oldContent = decryptLeasedContentForRun<{
          payloadSnapshot: Readonly<Record<string, unknown>>;
        }>(
          sourceLease, "memory.pull_record", pull.pull_record_id,
          pull.content_ciphertext, { payloadSnapshot: pull.payload_snapshot }
        );
        const pullRecordId = randomUUID();
        const content = encryptAttestedLeasedContentForRun(
          sourceLease, "memory.pull_record", pullRecordId, oldContent
        );
        await client.query(
          `INSERT INTO memory.pull_record (
             pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,
             content_hash_version,
             artifact_as_of,staleness_state_at_pull,asker_scope,payload_snapshot,
             register_row_key,register_version,register_source_ref,at_seq,content_ciphertext,content_attestation
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16::jsonb,$17)`,
          [pullRecordId, memoryLinkId, pull.artifact_kind, pull.artifact_id, pull.artifact_version,
            content === null ? pull.content_hash : null,content === null ? 1 : 2,
            pull.artifact_as_of, pull.staleness_state_at_pull, pull.asker_scope,
            JSON.stringify(content === null ? oldContent.payloadSnapshot : { ciphertext: true, v: 1 }),
            pull.register_row_key, pull.register_version, pull.register_source_ref,
            await allocateSequence(client),
            content === null ? null : JSON.stringify(content.envelope),content?.attestation ?? null]
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
      await sourceLease.assertLive();
      return result;
    } finally {
      await sourceLease.close();
    }
  }
}
