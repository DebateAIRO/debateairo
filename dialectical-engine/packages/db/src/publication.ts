import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  appendAuditEvent,
  type AuditContextHasher,
  type CryptoEnvelope
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

const PUBLICATION_TRANSITION_SIGNATURE =
  "core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,bytea,bytea,uuid,bytea,uuid,jsonb)";
const STEP_UP_ROTATION_SIGNATURE =
  "identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz)";

type PublicationDatabaseRoleWitness = Readonly<{
  sessionPrincipal: string;
  principal: string;
  sessionPrincipalIsSuperuser: boolean;
  principalIsSuperuser: boolean;
  canTransition: boolean;
  canRotateAfterStepUp: boolean;
  isAuthorizationMember: boolean;
  canSelectGrant: boolean;
  canInsertGrant: boolean;
  canUpdateGrant: boolean;
  canDeleteGrant: boolean;
}>;

async function readPublicationDatabaseRoleWitness(pool: Pool): Promise<PublicationDatabaseRoleWitness> {
  const result = await pool.query<{
    session_principal: string;
    principal: string;
    session_principal_is_superuser: boolean;
    principal_is_superuser: boolean;
    can_transition: boolean;
    can_rotate_after_step_up: boolean;
    is_authorization_member: boolean;
    can_select_grant: boolean;
    can_insert_grant: boolean;
    can_update_grant: boolean;
    can_delete_grant: boolean;
  }>(`
    SELECT session_user AS session_principal,
      current_user AS principal,
      COALESCE((
        SELECT role.rolsuper FROM pg_catalog.pg_roles AS role
        WHERE role.rolname=session_user
      ),true) AS session_principal_is_superuser,
      COALESCE((
        SELECT role.rolsuper FROM pg_catalog.pg_roles AS role
        WHERE role.rolname=current_user
      ),true) AS principal_is_superuser,
      has_function_privilege(current_user,$1,'EXECUTE') AS can_transition,
      has_function_privilege(current_user,$2,'EXECUTE') AS can_rotate_after_step_up,
      pg_has_role(current_user,'debateai_authorization_runtime','MEMBER')
        AS is_authorization_member,
      has_table_privilege(current_user,'identity.step_up_grant','SELECT') AS can_select_grant,
      has_table_privilege(current_user,'identity.step_up_grant','INSERT') AS can_insert_grant,
      has_table_privilege(current_user,'identity.step_up_grant','UPDATE') AS can_update_grant,
      has_table_privilege(current_user,'identity.step_up_grant','DELETE') AS can_delete_grant
  `, [PUBLICATION_TRANSITION_SIGNATURE, STEP_UP_ROTATION_SIGNATURE]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("PUBLICATION_DATABASE_ROLE_ATTESTATION_FAILED");
  return Object.freeze({
    sessionPrincipal: row.session_principal,
    principal: row.principal,
    sessionPrincipalIsSuperuser: row.session_principal_is_superuser,
    principalIsSuperuser: row.principal_is_superuser,
    canTransition: row.can_transition,
    canRotateAfterStepUp: row.can_rotate_after_step_up,
    isAuthorizationMember: row.is_authorization_member,
    canSelectGrant: row.can_select_grant,
    canInsertGrant: row.can_insert_grant,
    canUpdateGrant: row.can_update_grant,
    canDeleteGrant: row.can_delete_grant
  });
}

export async function assertPublicationDatabaseRoleSeparation(
  publicationPool: Pool,
  authorizationPool: Pool
): Promise<void> {
  // This is a startup capability attestation, not a URL-string comparison.
  // It therefore also rejects aliases, equivalent connection strings, a
  // superuser, or any dual-role login before the API begins serving traffic.
  const [publication, authorization] = await Promise.all([
    readPublicationDatabaseRoleWitness(publicationPool),
    readPublicationDatabaseRoleWitness(authorizationPool)
  ]);
  const publicationCanTouchGrant = publication.canSelectGrant
    || publication.canInsertGrant
    || publication.canUpdateGrant
    || publication.canDeleteGrant;
  const authorizationCanTouchGrant = authorization.canSelectGrant
    || authorization.canInsertGrant
    || authorization.canUpdateGrant
    || authorization.canDeleteGrant;
  if (publication.sessionPrincipal !== publication.principal
    || authorization.sessionPrincipal !== authorization.principal
    || publication.sessionPrincipalIsSuperuser
    || publication.principalIsSuperuser
    || authorization.sessionPrincipalIsSuperuser
    || authorization.principalIsSuperuser
    || publication.principal === authorization.principal
    || !publication.canTransition
    || publication.canRotateAfterStepUp
    || publication.isAuthorizationMember
    || publicationCanTouchGrant
    || !authorization.canRotateAfterStepUp
    || !authorization.isAuthorizationMember
    || authorizationCanTouchGrant) {
    throw new TypeError("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
  }
}

type PreparedAuditContext = Readonly<{
  ipArgon2id: string;
  userAgentArgon2id: string;
  requestId: string;
}>;

export type PublicationTransitionInput = Readonly<{
  runId: string;
  userId: string;
  ownerRef: string;
  sessionId: string;
  grantTokenHash: string;
  occurredAt: Date;
  source: AuthSourceContext;
}>;

export type PublicationPreflightDenialInput = Readonly<{
  userId: string;
  sessionId: string;
  occurredAt: Date;
  requestId: string | undefined;
}>;

export type PublishTransitionInput = PublicationTransitionInput & Readonly<{
  publicationRef: string;
  expectedPseudonym: string;
  contentCiphertext: CryptoEnvelope;
}>;

export type PublicSnapshotRecord = Readonly<{
  publicationRef: string;
  runId: string;
  contentCiphertext: CryptoEnvelope;
  createdAt: Date;
}>;

type PublicationAction = "PUBLISH" | "UNPUBLISH";

function normalized(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text === "" ? "unknown" : text).slice(0, maximumLength);
}

function assertOpaqueAuditToken(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4");
  }
}

export class PostgresPublicationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  private async prepareAuditContext(source: AuthSourceContext): Promise<PreparedAuditContext> {
    // External memory-hard reductions complete before pool.connect(), BEGIN,
    // the run lock, or the audit advisory lock.
    const [ipArgon2id, userAgentArgon2id] = await Promise.all([
      this.auditContext.hashSourceIp(normalized(source?.ip, 64)),
      this.auditContext.hashUserAgent(normalized(source?.userAgent, 256))
    ]);
    return Object.freeze({
      ipArgon2id,
      userAgentArgon2id,
      requestId: normalized(source?.requestId, 128)
    });
  }

  async preflightGrant(
    input: Pick<PublicationTransitionInput,
      "runId" | "userId" | "sessionId" | "grantTokenHash">,
    action: PublicationAction
  ): Promise<boolean> {
    const result = await this.pool.query<{ live: boolean }>(
      "SELECT identity.publication_grant_is_live($1,$2,$3,$4,$5) AS live",
      [input.grantTokenHash, input.sessionId, input.userId, action, input.runId]
    );
    return result.rows[0]?.live === true;
  }

  async auditAuthenticatedPreflightDenial(
    input: PublicationPreflightDenialInput
  ): Promise<boolean> {
    const auditId = randomUUID();
    const sourceContext = Object.freeze({
      requestId: normalized(input.requestId, 128),
      sourceCorrelation: "OMITTED_FOR_PREFLIGHT_DENIAL"
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seed = await this.pool.query<{
        audit_token: string;
        this_hash: Buffer | null;
      }>(`
        SELECT identity_user.audit_token,head.this_hash
        FROM identity."user" AS identity_user
        JOIN identity.session AS session
          ON session.session_id=$2 AND session.user_id=identity_user.user_id
            AND session.revoked_at IS NULL
            AND session.idle_expires_at>clock_timestamp()
            AND session.absolute_expires_at>clock_timestamp()
        LEFT JOIN LATERAL (
          SELECT parent.this_hash
          FROM identity.audit_event AS parent
          LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
          WHERE child.audit_id IS NULL
          ORDER BY parent.occurred_at DESC,parent.audit_id DESC
          LIMIT 1
        ) AS head ON true
        WHERE identity_user.user_id=$1 AND identity_user.state='active'
      `, [input.userId, input.sessionId]);
      const actorToken = seed.rows[0]?.audit_token;
      if (actorToken === undefined) return false;
      assertOpaqueAuditToken(actorToken);
      const denied = appendAuditEvent(
        seed.rows[0]?.this_hash?.toString("hex") ?? null,
        Object.freeze({
          auditId,
          actorCiphertext: null,
          actorKeyRef: actorToken,
          eventType: "debate.publication.preflight_denied",
          targetType: "debate.publication_attempt",
          targetId: auditId,
          occurredAt: input.occurredAt,
          sourceContext,
          decision: "DENY",
          success: false,
          justification: "PUBLICATION_GRANT_PREFLIGHT_DENIED"
        })
      );
      try {
        const result = await this.pool.query<{ appended: boolean }>(`
          SELECT identity.audit_publication_preflight_denial(
            $1,$2,$3,$4,$5,$6,$7,$8
          ) AS appended
        `, [
          auditId,
          input.userId,
          input.sessionId,
          input.occurredAt,
          denied.prevHash === null ? null : Buffer.from(denied.prevHash, "hex"),
          Buffer.from(denied.thisHash, "hex"),
          actorToken,
          sourceContext.requestId
        ]);
        return result.rows[0]?.appended === true;
      } catch (error) {
        if ((error as { code?: string }).code !== "40001" || attempt === 2) throw error;
      }
    }
    return false;
  }

  private async transition(
    prepared: PreparedAuditContext,
    input: Readonly<{
      runId: string;
      userId: string;
      ownerRef: string;
      sessionId: string;
      grantTokenHash: string;
      action: PublicationAction;
      publicationRef: string | null;
      expectedPseudonym: string | null;
      contentCiphertext: CryptoEnvelope | null;
      occurredAt: Date;
    }>
  ): Promise<string | null> {
    const eventId = randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seed = await this.pool.query<{
        audit_token: string;
        this_hash: Buffer | null;
      }>(`
        SELECT identity_user.audit_token,head.this_hash
        FROM identity."user" AS identity_user
        LEFT JOIN LATERAL (
          SELECT parent.this_hash
          FROM identity.audit_event AS parent
          LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
          WHERE child.audit_id IS NULL
          ORDER BY parent.occurred_at DESC,parent.audit_id DESC
          LIMIT 1
        ) AS head ON true
        WHERE identity_user.user_id=$1 AND identity_user.owner_ref=$2
          AND identity_user.state='active'
      `, [input.userId, input.ownerRef]);
      const actorToken = seed.rows[0]?.audit_token;
      if (actorToken === undefined) return null;
      assertOpaqueAuditToken(actorToken);
      const sourceContext = Object.freeze({
        ipArgon2id: prepared.ipArgon2id,
        userAgentArgon2id: prepared.userAgentArgon2id,
        requestId: prepared.requestId
      });
      const chained = appendAuditEvent(
        seed.rows[0]?.this_hash?.toString("hex") ?? null,
        Object.freeze({
          auditId: randomUUID(),
          actorCiphertext: null,
          actorKeyRef: actorToken,
          eventType: input.action === "PUBLISH"
            ? "debate.publication.published" : "debate.publication.unpublished",
          targetType: "core.run_visibility_event",
          targetId: eventId,
          occurredAt: input.occurredAt,
          sourceContext,
          decision: "ALLOW",
          success: true,
          justification: null
        })
      );
      const deniedAuditId = randomUUID();
      const denied = appendAuditEvent(
        seed.rows[0]?.this_hash?.toString("hex") ?? null,
        Object.freeze({
          auditId: deniedAuditId,
          actorCiphertext: null,
          actorKeyRef: actorToken,
          eventType: "debate.publication.denied",
          targetType: "debate.publication_attempt",
          targetId: deniedAuditId,
          occurredAt: input.occurredAt,
          sourceContext,
          decision: "DENY",
          success: false,
          justification: "PUBLICATION_TRANSITION_DENIED"
        })
      );
      try {
        const result = await this.pool.query<{ publication_ref: string | null }>(`
          SELECT core.transition_run_publication(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18::jsonb
          ) AS publication_ref
        `, [
          eventId,
          input.runId,
          input.userId,
          input.ownerRef,
          input.sessionId,
          input.grantTokenHash,
          input.action,
          input.publicationRef,
          input.expectedPseudonym,
          input.contentCiphertext === null ? null : JSON.stringify(input.contentCiphertext),
          input.occurredAt,
          chained.auditId,
          chained.prevHash === null ? null : Buffer.from(chained.prevHash, "hex"),
          Buffer.from(chained.thisHash, "hex"),
          denied.auditId,
          Buffer.from(denied.thisHash, "hex"),
          actorToken,
          JSON.stringify(sourceContext)
        ]);
        return result.rows[0]?.publication_ref ?? null;
      } catch (error) {
        if ((error as { code?: string }).code !== "40001" || attempt === 2) throw error;
      }
    }
    return null;
  }

  async readAuthorPseudonym(runId: string, userId: string, ownerRef: string): Promise<string | null> {
    const result = await this.pool.query<{ pseudonym: string }>(`
      SELECT identity_user.pseudonym
      FROM identity."user" AS identity_user
      WHERE identity_user.user_id=$2
        AND identity_user.owner_ref=$3
        AND identity_user.state='active'
        AND core.run_is_owned_by($1,$3,NULL)
    `, [runId, userId, ownerRef]);
    return result.rows[0]?.pseudonym ?? null;
  }

  async readOwnedVisibility(
    runId: string,
    userId: string,
    ownerRef: string
  ): Promise<Readonly<{
    state: "PRIVATE" | "PUBLISHED";
    publicRef: string | null;
  }> | null> {
    const result = await this.pool.query<{
      state: "PRIVATE" | "PUBLISHED";
      publication_ref: string | null;
    }>(`
      SELECT COALESCE(latest.state,'PRIVATE') AS state,
        CASE WHEN latest.state='PUBLISHED' THEN latest.publication_ref ELSE NULL END AS publication_ref
      FROM core.run AS run
      JOIN identity."user" AS identity_user
        ON identity_user.user_id=$2 AND identity_user.owner_ref=$3
          AND identity_user.state='active'
      LEFT JOIN LATERAL (
        SELECT event.state,event.publication_ref
        FROM core.run_visibility_event AS event
        WHERE event.run_id=run.run_id
        ORDER BY event.at_seq DESC LIMIT 1
      ) AS latest ON true
      WHERE run.run_id=$1 AND core.run_is_owned_by(run.run_id,$3,NULL)
    `, [runId, userId, ownerRef]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      state: row.state,
      publicRef: row.publication_ref
    });
  }

  async publish(input: PublishTransitionInput): Promise<boolean> {
    if (!await this.preflightGrant(input, "PUBLISH")) return false;
    const preparedAudit = await this.prepareAuditContext(input.source);
    return await this.transition(preparedAudit, {
      ...input,
      action: "PUBLISH",
      publicationRef: input.publicationRef,
      expectedPseudonym: input.expectedPseudonym,
      contentCiphertext: input.contentCiphertext
    }) === input.publicationRef;
  }

  async unpublish(input: PublicationTransitionInput): Promise<string | null> {
    if (!await this.preflightGrant(input, "UNPUBLISH")) return null;
    const preparedAudit = await this.prepareAuditContext(input.source);
    return this.transition(preparedAudit, {
      ...input,
      action: "UNPUBLISH",
      publicationRef: null,
      expectedPseudonym: null,
      contentCiphertext: null
    });
  }

  async listPendingKeyCleanup(limit = 100): Promise<readonly string[]> {
    const result = await this.pool.query<{ publication_ref: string }>(
      "SELECT publication_ref FROM serve.pending_publication_key_cleanup($1)",
      [limit]
    );
    return Object.freeze(result.rows.map((row) => row.publication_ref));
  }

  async completeKeyCleanup(publicationRef: string, completedAt: Date): Promise<boolean> {
    const result = await this.pool.query<{ completed: boolean }>(
      "SELECT serve.complete_publication_key_cleanup($1,$2) AS completed",
      [publicationRef, completedAt]
    );
    return result.rows[0]?.completed === true;
  }

  async readPublic(publicationRef: string): Promise<PublicSnapshotRecord | null> {
    const result = await this.pool.query<{
      publication_ref: string;
      run_id: string;
      content_ciphertext: CryptoEnvelope;
      created_at: Date;
    }>(`
      SELECT snapshot.publication_ref,snapshot.run_id,
        snapshot.content_ciphertext,snapshot.created_at
      FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=$1
        AND core.run_is_published(snapshot.run_id,snapshot.publication_ref)
    `, [publicationRef]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      publicationRef: row.publication_ref,
      runId: row.run_id,
      contentCiphertext: row.content_ciphertext,
      createdAt: row.created_at
    });
  }

  async revalidatePublic(runId: string, publicationRef: string): Promise<boolean> {
    const result = await this.pool.query<{ published: boolean }>(`
      SELECT core.run_is_published($1,$2) AS published
    `, [runId, publicationRef]);
    return result.rows[0]?.published === true;
  }

  async listPublicRefs(limit: number, offset: number): Promise<Readonly<{
    refs: readonly string[];
    total: number;
  }>> {
    const result = await this.pool.query<{ publication_ref: string | null; total: string }>(`
      WITH latest AS (
        SELECT DISTINCT ON (event.run_id)
          event.run_id,event.publication_ref,event.state,event.at_seq
        FROM core.run_visibility_event AS event
        ORDER BY event.run_id,event.at_seq DESC
      ), published AS (
        SELECT publication_ref,at_seq FROM latest WHERE state='PUBLISHED'
      ), page AS (
        SELECT publication_ref,at_seq FROM published
        ORDER BY at_seq DESC,publication_ref
        LIMIT $1 OFFSET $2
      )
      SELECT page.publication_ref,(SELECT count(*) FROM published)::text AS total
      FROM (SELECT 1) AS one
      LEFT JOIN page ON true
      ORDER BY page.at_seq DESC NULLS LAST,page.publication_ref
    `, [limit, offset]);
    return Object.freeze({
      refs: Object.freeze(result.rows.flatMap((row) => row.publication_ref === null
        ? [] : [row.publication_ref])),
      total: Number(result.rows[0]?.total ?? 0)
    });
  }
}
