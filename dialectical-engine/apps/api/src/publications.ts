import { randomUUID } from "node:crypto";
import {
  PublicDebateSchema,
  type Answer,
  type PublicDebate
} from "@debateai/contract";
import {
  hashVerificationToken,
  PublicationCipher
} from "@debateai/crypto";
import {
  PostgresPublicationRepository,
  type AuthSourceContext
} from "@debateai/db";
import type { AuthenticatedSession } from "./sessions.js";

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
    private readonly cleanupRepository: PostgresPublicationRepository = repository
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
      grantTokenHash: hashVerificationToken(input.grantToken)
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
    const grantTokenHash = hashVerificationToken(input.grantToken);
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
        as_of: input.answer.as_of
      }
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
    const grantTokenHash = hashVerificationToken(input.grantToken);
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
      verdict: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
      confidence_band: string | null;
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
        verdict: debate.answer.verdict,
        confidence_band: debate.answer.confidence_band
      }));
    }
    return Object.freeze({ items: Object.freeze(items), total: page.total });
  }
}
