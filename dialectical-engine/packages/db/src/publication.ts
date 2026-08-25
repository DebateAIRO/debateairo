import type { Pool } from "pg";
import {
  type AuditContextHasher,
  type CryptoEnvelope
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";
import { withPublicationContentLease } from "./publication-lease.js";

const PUBLICATION_TRANSITION_SIGNATURE =
  "core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,uuid,uuid)";
const STEP_UP_ROTATION_SIGNATURE =
  "identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)";

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

export async function assertPublicationCleanupDatabaseRole(pool: Pool): Promise<void> {
  const result = await pool.query<{
    session_principal: string;
    principal: string;
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    cleanup_member: boolean;
    runtime_member: boolean;
    authorization_member: boolean;
    claim_cleanup: boolean;
    complete_cleanup: boolean;
    claim_provision: boolean;
    complete_provision: boolean;
    can_transition: boolean;
    cleanup_table_dml: boolean;
  }>(`
    SELECT session_user AS session_principal,current_user AS principal,
      role.rolsuper,role.rolcreaterole,role.rolcreatedb,role.rolreplication,
      role.rolbypassrls,
      pg_has_role(current_user,'debateai_publication_cleanup','USAGE') AS cleanup_member,
      pg_has_role(current_user,'debateai_runtime','MEMBER') AS runtime_member,
      pg_has_role(current_user,'debateai_authorization_runtime','MEMBER') AS authorization_member,
      has_function_privilege(current_user,
        'serve.claim_publication_key_cleanup(integer)','EXECUTE') AS claim_cleanup,
      has_function_privilege(current_user,
        'serve.complete_publication_key_cleanup(uuid,uuid,text)','EXECUTE') AS complete_cleanup,
      has_function_privilege(current_user,
        'serve.claim_publication_key_provision_cleanup(integer)','EXECUTE') AS claim_provision,
      has_function_privilege(current_user,
        'serve.complete_publication_key_provision_cleanup(uuid,uuid)','EXECUTE') AS complete_provision,
      COALESCE((
        SELECT has_function_privilege(current_user,procedure.oid,'EXECUTE')
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='core' AND procedure.proname='transition_run_publication'
          AND pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
            'uuid, uuid, uuid, uuid, uuid, text, text, uuid, text, jsonb, timestamp with time zone, uuid, uuid, uuid'
      ),false) AS can_transition,
      has_table_privilege(current_user,'serve.publication_key_cleanup_intent','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        AS cleanup_table_dml
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user
  `);
  const row = result.rows[0];
  if (row === undefined
    || row.session_principal !== row.principal
    || row.rolsuper || row.rolcreaterole || row.rolcreatedb
    || row.rolreplication || row.rolbypassrls
    || !row.cleanup_member || row.runtime_member || row.authorization_member
    || !row.claim_cleanup || !row.complete_cleanup
    || !row.claim_provision || !row.complete_provision
    || row.can_transition || row.cleanup_table_dml) {
    throw new TypeError("PUBLICATION_CLEANUP_DATABASE_ROLE_INVALID");
  }
}

type PreparedAuditContext = Readonly<{
  schema: "s10-publication-event-v2";
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

export type PublicationKeyProvisionCleanup = Readonly<{
  publicationRef: string;
  runId: string;
  userId: string;
  ownerRef: string;
  claimToken: string;
}>;

export type PublicationKeyCleanupClaim = Readonly<{
  publicationRef: string;
  claimToken: string;
}>;

type PublicationAction = "PUBLISH" | "UNPUBLISH";

type PublicationEventRefs = Readonly<{
  reservationId: string;
  visibilityEventId: string | null;
  visibilityActorRef: string | null;
  auditId: string;
  auditActorRef: string;
  auditTargetRef: string;
  deniedAuditId: string | null;
  deniedAuditActorRef: string | null;
  deniedAuditTargetRef: string | null;
}>;

export class PostgresPublicationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  withContentLease<T>(publicationRef: string,use: () => Promise<T>): Promise<T> {
    return withPublicationContentLease(this.pool,[publicationRef],async () => use());
  }

  private async prepareAuditContext(source: AuthSourceContext): Promise<PreparedAuditContext> {
    // Network/request correlation belongs only to the mutable attribution
    // binding. Immutable publication audit is deliberately event-local so a
    // public snapshot cannot expand into the actor's other audit history.
    void source;
    void this.auditContext;
    return Object.freeze({ schema: "s10-publication-event-v2" as const });
  }

  private async reserveEventRefs(input: Readonly<{
    userId: string;
    sessionId: string;
    runId: string | null;
    action: PublicationAction | "PREFLIGHT_DENIAL";
    grantTokenHash: string | null;
  }>): Promise<PublicationEventRefs | null> {
    const result = await this.pool.query<{
      reservation_id: string;
      visibility_event_id: string | null;
      visibility_actor_ref: string | null;
      audit_id: string;
      audit_actor_ref: string;
      audit_target_ref: string;
      denied_audit_id: string | null;
      denied_audit_actor_ref: string | null;
      denied_audit_target_ref: string | null;
    }>(`
      SELECT * FROM identity.reserve_publication_event_refs($1,$2,$3,$4,$5)
    `, [input.userId, input.sessionId, input.runId, input.action, input.grantTokenHash]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      reservationId: row.reservation_id,
      visibilityEventId: row.visibility_event_id,
      visibilityActorRef: row.visibility_actor_ref,
      auditId: row.audit_id,
      auditActorRef: row.audit_actor_ref,
      auditTargetRef: row.audit_target_ref,
      deniedAuditId: row.denied_audit_id,
      deniedAuditActorRef: row.denied_audit_actor_ref,
      deniedAuditTargetRef: row.denied_audit_target_ref
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

  async prepareKeyProvision(input: Readonly<{
    publicationRef: string;
    runId: string;
    userId: string;
    ownerRef: string;
    sessionId: string;
    grantTokenHash: string;
  }>): Promise<boolean> {
    const result = await this.pool.query<{ prepared: boolean }>(`
      SELECT serve.prepare_publication_key_provision($1,$2,$3,$4,$5,$6) AS prepared
    `, [
      input.publicationRef,input.runId,input.userId,input.ownerRef,
      input.sessionId,input.grantTokenHash
    ]);
    return result.rows[0]?.prepared === true;
  }

  async abandonKeyProvision(publicationRef: string,userId: string): Promise<boolean> {
    const result = await this.pool.query<{ abandoned: boolean }>(`
      SELECT serve.abandon_publication_key_provision($1,$2) AS abandoned
    `, [publicationRef,userId]);
    return result.rows[0]?.abandoned === true;
  }

  async claimKeyProvisionCleanup(limit = 100): Promise<readonly PublicationKeyProvisionCleanup[]> {
    const result = await this.pool.query<{
      publication_ref: string;
      run_id: string;
      user_id: string;
      owner_ref: string;
      claim_token: string;
    }>("SELECT * FROM serve.claim_publication_key_provision_cleanup($1)", [limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      publicationRef: row.publication_ref,
      runId: row.run_id,
      userId: row.user_id,
      ownerRef: row.owner_ref,
      claimToken: row.claim_token
    })));
  }

  async completeKeyProvisionCleanup(
    publicationRef: string,claimToken: string
  ): Promise<boolean> {
    const result = await this.pool.query<{ completed: boolean }>(`
      SELECT serve.complete_publication_key_provision_cleanup($1,$2) AS completed
    `, [publicationRef,claimToken]);
    return result.rows[0]?.completed === true;
  }

  async auditAuthenticatedPreflightDenial(
    input: PublicationPreflightDenialInput
  ): Promise<boolean> {
    const refs = await this.reserveEventRefs({
      userId: input.userId,
      sessionId: input.sessionId,
      runId: null,
      action: "PREFLIGHT_DENIAL",
      grantTokenHash: null
    });
    if (refs === null) return false;
    void input.requestId;
    const result = await this.pool.query<{ appended: boolean }>(`
      SELECT identity.audit_publication_preflight_denial($1,$2,$3,$4,$5) AS appended
    `, [refs.auditId,input.userId,input.sessionId,input.occurredAt,refs.reservationId]);
    return result.rows[0]?.appended === true;
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
    void prepared;
    const refs = await this.reserveEventRefs({
      userId: input.userId,
      sessionId: input.sessionId,
      runId: input.runId,
      action: input.action,
      grantTokenHash: input.grantTokenHash
    });
    if (refs === null || refs.visibilityEventId === null || refs.visibilityActorRef === null
      || refs.deniedAuditId === null || refs.deniedAuditActorRef === null
      || refs.deniedAuditTargetRef === null) return null;
    const result = await this.pool.query<{ publication_ref: string | null }>(`
      SELECT core.transition_run_publication(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14
      ) AS publication_ref
    `, [
      refs.visibilityEventId,input.runId,input.userId,input.ownerRef,input.sessionId,
      input.grantTokenHash,input.action,input.publicationRef,input.expectedPseudonym,
      input.contentCiphertext === null ? null : JSON.stringify(input.contentCiphertext),
      input.occurredAt,refs.auditId,refs.deniedAuditId,refs.reservationId
    ]);
    return result.rows[0]?.publication_ref ?? null;
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

  async claimKeyCleanup(limit = 100): Promise<readonly PublicationKeyCleanupClaim[]> {
    const result = await this.pool.query<{
      publication_ref: string;
      claim_token: string;
    }>("SELECT * FROM serve.claim_publication_key_cleanup($1)", [limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      publicationRef: row.publication_ref,
      claimToken: row.claim_token
    })));
  }

  async completeKeyCleanup(
    publicationRef: string,
    claimToken: string,
    destroyResult: "DESTROYED" | "ALREADY_ABSENT"
  ): Promise<boolean> {
    const result = await this.pool.query<{ completed: boolean }>(
      "SELECT serve.complete_publication_key_cleanup($1,$2,$3) AS completed",
      [publicationRef, claimToken, destroyResult]
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
