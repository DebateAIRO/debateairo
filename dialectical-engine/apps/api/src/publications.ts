import { randomUUID } from "node:crypto";
import {
  AnswerFloorSchema,
  PublicDebateSchema,
  PublicStoryShortSchema,
  StoryLanguageTagSchema,
  type Answer,
  type AnswerFloor,
  type Edge,
  type MakerLineage,
  type Node,
  type PublicDebate,
  type PublicMakerLineage,
  type PublicNode,
  type PublicStoryShort
} from "@debateai/contract";
import {
  hashToken,
  PublicationCipher
} from "@debateai/crypto";
import {
  PostgresPublicationRepository,
  type AuthSourceContext
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { AuthenticatedSession } from "./sessions.js";
type LabeledNumber = Node["base_score"];
function redactLabeledNumber(
  n: LabeledNumber,
  opts: Readonly<{ redactSource: boolean }>
): LabeledNumber {
  return {
    value: n.value,
    kind: n.kind,
    source: opts.redactSource ? "REDACTED_OWNER_ONLY" : n.source,
    producer: n.producer,
    provenance_ref: "REDACTED_OWNER_ONLY",
    replay_handle: "REDACTED_OWNER_ONLY"
  };
}

function redactLineageForPublic(lineage: MakerLineage): PublicMakerLineage {
  return { maker: lineage.maker, model_id: lineage.model_id };
}

function redactNodeForPublic(node: Node): PublicNode {
  return {
    node_id: node.node_id,
    claim: node.claim,
    way_of_knowing: node.way_of_knowing,
    base_score: redactLabeledNumber(node.base_score, { redactSource: true }),
    final_strength: node.final_strength === null
      ? null
      : redactLabeledNumber(node.final_strength, { redactSource: true }),
    provenance_ref: "REDACTED_OWNER_ONLY",
    maker_lineage: node.maker_lineage === null ? null : redactLineageForPublic(node.maker_lineage),
    review: node.review === null
      ? null
      : {
          outcome: node.review.outcome,
          reasons: node.review.reasons,
          provenance_ref: "REDACTED_OWNER_ONLY",
          reviewer_lineage: redactLineageForPublic(node.review.reviewer_lineage)
        },
    locator: node.locator,
    stranger_restatement: { check_status: node.stranger_restatement.check_status },
    defeater_refs: node.defeater_refs,
    defeater_exhaustion_marked: node.defeater_exhaustion_marked,
    disagreement: null,
    condition_marks: node.condition_marks,
    abstention: node.abstention === null ? null
      : {
          kind: node.abstention.kind,
          question_class: node.abstention.question_class,
          risk_tier: node.abstention.risk_tier,
          price: node.abstention.price,
          register_row_key: node.abstention.register_row_key,
          register_version: node.abstention.register_version,
          register_source_ref: node.abstention.register_source_ref,
          unlock_condition: node.abstention.unlock_condition,
          ledger_unknown_ref: "REDACTED_OWNER_ONLY"
        },
    staleness_state: node.staleness_state,
    relevant_as_of: node.relevant_as_of
  };
}

function redactEdgeForPublic(edge: Edge): Edge {
  return {
    edge_id: edge.edge_id,
    from_node_ref: edge.from_node_ref,
    target_kind: edge.target_kind,
    target_ref: edge.target_ref,
    relation: edge.relation,
    strength: edge.strength.status !== "PRESENT"
      ? edge.strength
      : {
          status: "PRESENT",
          number: redactLabeledNumber(edge.strength.number, { redactSource: false })
        },
    provenance_ref: "REDACTED_OWNER_ONLY",
    placeholder: edge.placeholder
  };
}

/**
 * Verdict story (spec 2026-09-26 §10): where publish reads the short story of
 * the answer being published. Owner-scoped; null when there is no READY or
 * READY_WITH_RESERVATION story for that exact answer version.
 */
export interface PublicationStoryReader {
  readStoryShort(input: Readonly<{
    answerId: string;
    answerVersion: number;
    ownerRef: string;
  }>): Promise<PublicStoryShort | null>;
}

const NO_PUBLICATION_STORIES: PublicationStoryReader = Object.freeze({
  readStoryShort: async () => null
});

/** A diagnostic the log may carry: an identifier-shaped code or class name, never free text. */
const STORY_READ_DIAGNOSTIC_SHAPE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

/**
 * What a failed publish-time story read logs: the error's typed code, or its
 * class name, and never its message, which may carry a query, an id or story
 * text. Anything that is not identifier-shaped logs as UNEXPECTED_ERROR.
 */
function storyReadDiagnostic(error: unknown): string {
  const candidate = error instanceof TypedDomainError
    ? error.code
    : error instanceof Error ? error.name : null;
  return candidate !== null && STORY_READ_DIAGNOSTIC_SHAPE.test(candidate) ? candidate : "UNEXPECTED_ERROR";
}

/** The API's operational log line (one JSON object), as the story route writes it. */
function logStoryNotPublished(requestId: string, diagnostic: string): void {
  console.error(JSON.stringify(Object.freeze({
    event: "api.publication.story_not_published",
    requestId,
    diagnostic
  })));
}

/**
 * A story that cannot be read never blocks publishing: the snapshot keeps
 * today's summary. A reader that throws, or answers with anything the public
 * schema refuses, publishes no story rather than failing the snapshot's parse,
 * and the log records only a bounded diagnostic.
 */
async function readPublishableStory(
  stories: PublicationStoryReader,
  input: Readonly<{ answer: Answer; authenticated: AuthenticatedSession; source: AuthSourceContext }>
): Promise<PublicStoryShort | null> {
  let story: PublicStoryShort | null;
  try {
    story = await stories.readStoryShort({
      answerId: input.answer.answer_id,
      answerVersion: input.answer.answer_version,
      ownerRef: input.authenticated.ownerRef
    });
  } catch (error) {
    logStoryNotPublished(input.source.requestId, storyReadDiagnostic(error));
    return null;
  }
  if (story === null) return null;
  const parsed = PublicStoryShortSchema.safeParse(story);
  if (parsed.success) return parsed.data;
  logStoryNotPublished(input.source.requestId, "STORY_PUBLIC_SHORT_REFUSED");
  return null;
}

/**
 * The question's language tag for the snapshot (spec 2026-09-26 §14.3), copied
 * from the run so the public page can show the short story's fixed text in it.
 * Like the story, it never blocks publishing: a failed read, or a stored tag the
 * snapshot schema refuses, publishes no language, and the log records only a
 * bounded diagnostic.
 */
async function readPublishableLanguage(
  repository: PostgresPublicationRepository,
  input: Readonly<{ runId: string; authenticated: AuthenticatedSession; source: AuthSourceContext }>
): Promise<string | null> {
  let tag: string | null;
  try {
    tag = await repository.readArgumentLanguageTag(input.runId, input.authenticated.userId, input.authenticated.ownerRef);
  } catch (error) {
    logLanguageNotPublished(input.source.requestId, storyReadDiagnostic(error));
    return null;
  }
  if (tag === null) return null;
  const parsed = StoryLanguageTagSchema.safeParse(tag);
  if (parsed.success) return parsed.data;
  logLanguageNotPublished(input.source.requestId, "LANGUAGE_TAG_REFUSED");
  return null;
}

function logLanguageNotPublished(requestId: string, diagnostic: string): void {
  console.error(JSON.stringify(Object.freeze({
    event: "api.publication.language_not_published",
    requestId,
    diagnostic
  })));
}

/**
 * Engine money rule, Task M5 (spec 2026-09-26 §14.4.4): the FLOOR of a
 * components-only answer — its label and its leading position — copied from
 * the owner's disclosure record, so the public page can say "Our best answer"
 * with the position's own statement, and whether that label's basis was thin
 * (M5 review, I2). Never its cause. A served answer carries its own label and
 * is never read. Like the story and the language, it never blocks publishing:
 * a failed read, a floor the snapshot schema refuses, or a leading position
 * that is not among the published nodes publishes no floor, and the log
 * records only a bounded diagnostic.
 */
async function readPublishableFloor(
  repository: PostgresPublicationRepository,
  input: Readonly<{ runId: string; answer: Answer; authenticated: AuthenticatedSession; source: AuthSourceContext }>
): Promise<AnswerFloor | null> {
  if (input.answer.terminal !== "COMPONENTS_ONLY") return null;
  let floor: Readonly<{ verdictState: string; leadingNodeId: string; basisIncomplete: boolean | null }> | null;
  try {
    floor = await repository.readAnswerFloor({
      runId: input.runId,
      answerId: input.answer.answer_id,
      userId: input.authenticated.userId,
      ownerRef: input.authenticated.ownerRef
    });
  } catch (error) {
    logFloorNotPublished(input.source.requestId, storyReadDiagnostic(error));
    return null;
  }
  if (floor === null) return null;
  // A floor whose label receipt is missing has no known basis (`null`): the
  // schema refuses it, so no floor goes out without its thin-basis flag.
  const parsed = AnswerFloorSchema.safeParse({
    verdict_state: floor.verdictState, leading_node_id: floor.leadingNodeId, basis_incomplete: floor.basisIncomplete
  });
  if (!parsed.success) {
    logFloorNotPublished(input.source.requestId, "FLOOR_REFUSED");
    return null;
  }
  if (!input.answer.nodes.some((node) => node.node_id === parsed.data.leading_node_id)) {
    logFloorNotPublished(input.source.requestId, "FLOOR_NODE_NOT_PUBLISHED");
    return null;
  }
  return parsed.data;
}

function logFloorNotPublished(requestId: string, diagnostic: string): void {
  console.error(JSON.stringify(Object.freeze({
    event: "api.publication.floor_not_published",
    requestId,
    diagnostic
  })));
}

export interface PublicationApplication {
  reconcileKeyCleanup(limit?: number): Promise<number>;
  reconcileKeyProvisionCleanup(limit?: number): Promise<number>;
  preflightGrant(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
    grantToken: string;
    action: "PUBLISH" | "UNPUBLISH";
  }>): Promise<boolean>;
  auditPreflightDenial(input: Readonly<{
    authenticated: AuthenticatedSession;
    requestId: string | undefined;
  }>): Promise<boolean>;
  readOwnedVisibility(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
  }>): Promise<Readonly<{
    state: "PRIVATE" | "PUBLISHED";
    public_ref: string | null;
  }> | null>;
  publish(input: Readonly<{
    runId: string;
    answer: Answer;
    authenticated: AuthenticatedSession;
    grantToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{ state: "PUBLISHED"; public_ref: string }> | null>;
  unpublish(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
    grantToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{ state: "PRIVATE"; public_ref: null }> | null>;
  readPublicDebate(publicationRef: string): Promise<PublicDebate | null>;
  list(limit: number, offset: number): Promise<Readonly<{
    items: readonly Readonly<{
      public_ref: string;
      author_pseudonym: string;
      question: string;
      published_at: string;
      models?: readonly string[];
      verdict: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
      confidence_band: string | null;
    }>[];
    total: number;
  }>>;
}

export class PostgresPublicationApplication implements PublicationApplication {
  constructor(
    private readonly repository: PostgresPublicationRepository,
    private readonly cipher: PublicationCipher,
    private readonly clock: () => Date = () => new Date(),
    private readonly cleanupRepository: PostgresPublicationRepository = repository,
    private readonly stories: PublicationStoryReader = NO_PUBLICATION_STORIES
  ) {}

  async preflightGrant(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
    grantToken: string;
    action: "PUBLISH" | "UNPUBLISH";
  }>): Promise<boolean> {
    return this.repository.preflightGrant({
      runId: input.runId,
      userId: input.authenticated.userId,
      sessionId: input.authenticated.session.session_id,
      grantTokenHash: hashToken("step-up-grant", input.grantToken)
    }, input.action);
  }

  async auditPreflightDenial(input: Readonly<{
    authenticated: AuthenticatedSession;
    requestId: string | undefined;
  }>): Promise<boolean> {
    return this.repository.auditAuthenticatedPreflightDenial({
      userId: input.authenticated.userId,
      sessionId: input.authenticated.session.session_id,
      occurredAt: this.clock(),
      requestId: input.requestId
    });
  }

  async readOwnedVisibility(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
  }>): Promise<Readonly<{
    state: "PRIVATE" | "PUBLISHED";
    public_ref: string | null;
  }> | null> {
    const visibility = await this.repository.readOwnedVisibility(
      input.runId,
      input.authenticated.userId,
      input.authenticated.ownerRef
    );
    return visibility === null ? null : Object.freeze({
      state: visibility.state,
      public_ref: visibility.publicRef
    });
  }

  async publish(input: Readonly<{
    runId: string;
    answer: Answer;
    authenticated: AuthenticatedSession;
    grantToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{ state: "PUBLISHED"; public_ref: string }> | null> {
    if (input.answer.run_ref !== input.runId || input.answer.terminal === "BLOCKED") return null;
    const grantTokenHash = hashToken("step-up-grant", input.grantToken);
    if (!await this.preflightGrant({
      runId: input.runId,
      authenticated: input.authenticated,
      grantToken: input.grantToken,
      action: "PUBLISH"
    })) {
      await this.auditPreflightDenial({
        authenticated: input.authenticated,
        requestId: input.source.requestId
      });
      return null;
    }
    const pseudonym = await this.repository.readAuthorPseudonym(
      input.runId,
      input.authenticated.userId,
      input.authenticated.ownerRef
    );
    if (pseudonym === null) return null;
    const storyShort = await readPublishableStory(this.stories, input);
    const language = await readPublishableLanguage(this.repository, input);
    const floor = await readPublishableFloor(this.repository, input);
    const publicationRef = randomUUID();
    const occurredAt = this.clock();
    if (!await this.repository.prepareKeyProvision({
      publicationRef,
      runId: input.runId,
      userId: input.authenticated.userId,
      ownerRef: input.authenticated.ownerRef,
      sessionId: input.authenticated.session.session_id,
      grantTokenHash
    })) return null;
    const publicDebate = PublicDebateSchema.parse({
      public_ref: publicationRef,
      author_pseudonym: pseudonym,
      question: input.answer.question_line,
      published_at: occurredAt.toISOString(),
      answer: {
        terminal: input.answer.terminal,
        verdict: input.answer.verdict_state,
        verdict_available: input.answer.verdict_state !== null,
        confidence_band: input.answer.confidence_band,
        summary_segments: input.answer.composed_text.map((segment) => ({ text: segment.text })),
        badges: input.answer.badges,
        residual_objections: input.answer.residual_objections,
        reversal_point: input.answer.reversal_point,
        as_of: input.answer.as_of,
        nodes: input.answer.nodes.map(redactNodeForPublic),
        edges: input.answer.edges.map(redactEdgeForPublic),
        tree_included: true
      },
      ...(storyShort === null ? {} : { story_short: storyShort }),
      ...(language === null ? {} : { language }),
      ...(floor === null ? {} : { floor })
    });
    let prepared: Awaited<ReturnType<PublicationCipher["create"]>>;
    try {
      prepared = await this.cipher.create(publicationRef, input.runId);
    } catch (error) {
      await this.repository.abandonKeyProvision(
        publicationRef,input.authenticated.userId
      ).catch(() => false);
      throw error;
    }
    let transitionAttempted = false;
    try {
      const contentCiphertext = prepared.encrypt(publicDebate);
      prepared.close();
      transitionAttempted = true;
      const published = await this.repository.publish({
        runId: input.runId,
        userId: input.authenticated.userId,
        ownerRef: input.authenticated.ownerRef,
        sessionId: input.authenticated.session.session_id,
        grantTokenHash,
        occurredAt,
        source: input.source,
        publicationRef,
        expectedPseudonym: pseudonym,
        contentCiphertext
      });
      if (!published) {
        await this.repository.abandonKeyProvision(
          publicationRef,input.authenticated.userId
        );
        await this.reconcileKeyProvisionCleanup();
        return null;
      }
      return Object.freeze({ state: "PUBLISHED" as const, public_ref: publicationRef });
    } catch (error) {
      prepared.close();
      // Resolve an ambiguous COMMIT from fresh DB state. A committed snapshot
      // consumes the intent and keeps its corpus key; otherwise the durable
      // intent is expired and the claimed reconciler performs deletion.
      if (!transitionAttempted
        || await this.repository.readPublic(publicationRef).catch(() => null) === null) {
        await this.repository.abandonKeyProvision(
          publicationRef,input.authenticated.userId
        ).catch(() => false);
        await this.reconcileKeyProvisionCleanup().catch(() => 0);
      }
      throw error;
    }
  }

  async unpublish(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
    grantToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{ state: "PRIVATE"; public_ref: null }> | null> {
    const grantTokenHash = hashToken("step-up-grant", input.grantToken);
    if (!await this.preflightGrant({
      runId: input.runId,
      authenticated: input.authenticated,
      grantToken: input.grantToken,
      action: "UNPUBLISH"
    })) {
      await this.auditPreflightDenial({
        authenticated: input.authenticated,
        requestId: input.source.requestId
      });
      return null;
    }
    // Retry durable cleanup from a prior committed PRIVATE transition before
    // handling the next request. Key I/O runs outside every DB transaction.
    await this.reconcileKeyCleanup();
    const publicationRef = await this.repository.unpublish({
      runId: input.runId,
      userId: input.authenticated.userId,
      ownerRef: input.authenticated.ownerRef,
      sessionId: input.authenticated.session.session_id,
      grantTokenHash,
      occurredAt: this.clock(),
      source: input.source
    });
    if (publicationRef === null) return null;
    await this.reconcileKeyCleanup();
    return Object.freeze({ state: "PRIVATE" as const, public_ref: null });
  }

  async reconcileKeyCleanup(limit = 100): Promise<number> {
    const claimed = await this.cleanupRepository.claimKeyCleanup(limit);
    let completed = 0;
    for (const claim of claimed) {
      try {
        await this.cleanupRepository.withContentLease(claim.publicationRef,async () => {
          const destroyResult = await this.cipher.destroy(claim.publicationRef);
          // The DB cleanup receipt is written only after an independent store
          // readback observes the entire publication directory absent. Any
          // unlink/fsync/lstat ambiguity remains pending without starving the
          // later refs in this deterministic batch.
          if (await this.cipher.exists(claim.publicationRef)) return;
          if (await this.cleanupRepository.completeKeyCleanup(
            claim.publicationRef,claim.claimToken,destroyResult
          )) completed += 1;
        });
      } catch {
        continue;
      }
    }
    return completed;
  }

  async reconcileKeyProvisionCleanup(limit = 100): Promise<number> {
    const claimed = await this.cleanupRepository.claimKeyProvisionCleanup(limit);
    let completed = 0;
    let failed = false;
    for (const intent of claimed) {
      try {
        await this.cleanupRepository.withContentLease(intent.publicationRef,async () => {
          await this.cipher.destroy(intent.publicationRef);
          if (await this.cipher.exists(intent.publicationRef)) return;
          if (await this.cleanupRepository.completeKeyProvisionCleanup(
            intent.publicationRef,intent.claimToken
          )) completed += 1;
        });
      } catch {
        failed = true;
        continue;
      }
    }
    if (failed) throw new TypeError("PUBLICATION_KEY_PROVISION_CLEANUP_PENDING");
    return completed;
  }

  async readPublicDebate(publicationRef: string): Promise<PublicDebate | null> {
    return this.repository.withContentLease(publicationRef,async () => {
      const snapshot = await this.repository.readPublic(publicationRef);
      if (snapshot === null) return null;
      let prepared: Awaited<ReturnType<PublicationCipher["open"]>> | undefined;
      try {
        // Visibility is authorized before external key resolution/decryption.
        prepared = await this.cipher.open(publicationRef, snapshot.runId);
        const publicDebate = PublicDebateSchema.parse(
          prepared.decrypt(snapshot.contentCiphertext)
        );
        prepared.close();
        prepared = undefined;
        // A concurrent unpublish can commit while decryption runs. Latest-wins
        // visibility is revalidated before any plaintext leaves the service.
        if (publicDebate.public_ref !== snapshot.publicationRef
          || publicDebate.published_at !== snapshot.createdAt.toISOString()) return null;
        return await this.repository.revalidatePublic(snapshot.runId, publicationRef)
          ? publicDebate : null;
      } catch {
        return null;
      } finally {
        prepared?.close();
      }
    });
  }

  async list(limit: number, offset: number): Promise<Readonly<{
    items: readonly Readonly<{
      public_ref: string;
      author_pseudonym: string;
      question: string;
      published_at: string;
      models?: readonly string[];
      verdict: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
      confidence_band: string | null;
      floor_verdict?: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
    }>[];
    total: number;
  }>> {
    const page = await this.repository.listPublicRefs(limit, offset);
    const items = [];
    for (const publicationRef of page.refs) {
      const debate = await this.readPublicDebate(publicationRef);
      if (debate === null) continue;
      items.push(Object.freeze({
        public_ref: debate.public_ref,
        author_pseudonym: debate.author_pseudonym,
        question: debate.question,
        published_at: debate.published_at,
        models: Object.freeze([...new Set((debate.answer.nodes ?? []).flatMap((node) =>
          node.maker_lineage === null ? [] : [node.maker_lineage.model_id]
        ))]),
        verdict: debate.answer.verdict,
        confidence_band: debate.answer.confidence_band,
        // Task M6: the floor's label only (spec §14.4.4), for the library row.
        ...(debate.floor === undefined ? {} : { floor_verdict: debate.floor.verdict_state })
      }));
    }
    return Object.freeze({ items: Object.freeze(items), total: page.total });
  }
}
