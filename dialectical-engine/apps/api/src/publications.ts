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
  preflightGrant(input: Readonly<{
    runId: string;
    authenticated: AuthenticatedSession;
    grantToken: string;
    action: "PUBLISH" | "UNPUBLISH";
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
    private readonly clock: () => Date = () => new Date()
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
    })) return null;
    const pseudonym = await this.repository.readAuthorPseudonym(
      input.runId,
      input.authenticated.userId,
      input.authenticated.ownerRef
    );
    if (pseudonym === null) return null;
    const publicationRef = randomUUID();
    const occurredAt = this.clock();
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
    const prepared = await this.cipher.create(publicationRef, input.runId);
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
        await this.cipher.destroy(publicationRef);
        return null;
      }
      return Object.freeze({ state: "PUBLISHED" as const, public_ref: publicationRef });
    } catch (error) {
      prepared.close();
      // After COMMIT has been attempted, retaining an orphan key is safer than
      // destroying a key that may already protect a committed public record.
      if (!transitionAttempted) await this.cipher.destroy(publicationRef);
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
    })) return null;
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
    const pending = await this.repository.listPendingKeyCleanup(limit);
    let completed = 0;
    for (const publicationRef of pending) {
      await this.cipher.destroy(publicationRef);
      if (await this.repository.completeKeyCleanup(publicationRef, this.clock())) completed += 1;
    }
    return completed;
  }

  async readPublicDebate(publicationRef: string): Promise<PublicDebate | null> {
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
