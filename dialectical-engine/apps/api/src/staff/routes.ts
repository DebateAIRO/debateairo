import { parseCanonicalRegisterJson } from '@debateai/register';
import type { InternalAllowanceCommandState } from '@debateai/db';
import type { StaffInternalFundingApplication } from './internal-allowances.js';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import type { z } from 'zod';
import * as contract from '@debateai/contract';
import type { ActionBinding, Reason, SecurityReceipt, StaffCapability } from '@debateai/kernel';
import type { AuthSourceContext, StaffManagementRepository } from '@debateai/db';
import type { AuthenticatedSession, SessionApplication } from '../sessions.js';
import { exactStaffCookie, exactStaffCsrfPair, staffCookies, staffTokenHash, STAFF_COOKIE_NAME, STAFF_CSRF_COOKIE_NAME, STAFF_CSRF_HEADER, type StaffAccessApplication, type StaffAuthentication } from './access.js';
import { StaffAlertError, type StaffAlertIntentProducer, type StaffTargetInvitationTransport } from './alerts.js';
import type { StaffWebAuthnService } from './webauthn.js';
export const staffAuthorizationPolicyInventory = Object.freeze([
    { route: 'GET /v1/admin/enrollment', auth: 'user', resource: 'staff-self', action: 'enrollment' },
    { route: 'POST /v1/admin/prerequisites/step-up', auth: 'user', resource: 'staff-self', action: 'prerequisite' },
    { route: 'POST /v1/admin/webauthn/registration/options', auth: 'user', resource: 'staff-self', action: 'registration-options' },
    { route: 'POST /v1/admin/webauthn/registration/verify', auth: 'user', resource: 'staff-self', action: 'registration-verify' },
    { route: 'POST /v1/admin/webauthn/elevation/options', auth: 'user', resource: 'staff-self', action: 'elevation-options' },
    { route: 'POST /v1/admin/webauthn/elevation/verify', auth: 'user', resource: 'staff-self', action: 'elevation-verify' },
    { route: 'POST /v1/admin/webauthn/action/options', auth: 'staff', resource: 'staff-self', action: 'action-options' },
    { route: 'POST /v1/admin/webauthn/action/verify', auth: 'staff', resource: 'staff-self', action: 'action-verify' },
    { route: 'GET /v1/admin/team', auth: 'staff', staffCapability: 'TEAM_READ', resource: 'staff-team', action: 'list' },
    { route: 'POST /v1/admin/team/invitations', auth: 'staff', staffCapability: 'TEAM_INVITE', resource: 'staff-team', action: 'invite' },
    { route: 'POST /v1/admin/team/invitations/accept/options', auth: 'user', resource: 'staff-invitation', action: 'accept-options' },
    { route: 'POST /v1/admin/team/invitations/accept/verify', auth: 'user', resource: 'staff-invitation', action: 'accept-verify' },
    { route: 'POST /v1/admin/team/invitations/accept', auth: 'user', resource: 'staff-invitation', action: 'accept' },
    { route: 'POST /v1/admin/owner-possession/options', auth: 'user', resource: 'owner-possession', action: 'options' },
    { route: 'POST /v1/admin/owner-possession/verify', auth: 'user', resource: 'owner-possession', action: 'verify' },
    { route: 'PATCH /v1/admin/team/{staffId}/grants', auth: 'staff', staffCapability: 'TEAM_GRANT', resource: 'staff-team', action: 'grant' },
    // The strict mode selects TEAM_DISABLE or EMERGENCY_DISABLE inside the handler.
    { route: 'POST /v1/admin/team/{staffId}/disable', auth: 'staff', resource: 'staff-team', action: 'disable' },
    { route: 'GET /v1/admin/audit', auth: 'staff', staffCapability: 'AUDIT_READ', resource: 'staff-audit', action: 'list' },
    { route: 'POST /v1/admin/internal-allowances', auth: 'staff', staffCapability: 'ALLOWANCE_WRITE', resource: 'staff-self', action: 'allowance-configure' },
    { route: 'DELETE /v1/admin/internal-allowances/{grantId}', auth: 'staff', staffCapability: 'ALLOWANCE_WRITE', resource: 'staff-self', action: 'allowance-revoke' }
] as const);
/** Explicit v2 composition only. No ready flags, command prepare/commit, or private content readers. */
export interface StaffHttpApplication {
    access: StaffAccessApplication;
    sessions: SessionApplication;
    repository: StaffManagementRepository;
    webauthn: Pick<StaffWebAuthnService, 'beginRegistration' | 'finishRegistration' | 'beginElevation' | 'finishElevation' | 'beginAction' | 'finishAction' | 'beginInvitationAcceptance' | 'finishInvitationAcceptance' | 'beginOwnerPossession' | 'finishOwnerPossession'>;
    intents: Pick<StaffAlertIntentProducer, 'mutation' | 'newInvitation' | 'enrollment'>;
    targetInvitationTransport?: StaffTargetInvitationTransport;
    funding?: StaffInternalFundingApplication;
    /** Early lock check before any key ceremony (not the authority: the alert producer and the DB guard
     * still check every mutation). Production passes the runtime's readiness; absent, only those run. */
    readiness?: Readonly<{ readIndependentAlertReadiness(): Promise<'READY' | 'UNAVAILABLE'> }>;
}
export interface StaffRouteTransport {
    sourceFor(request: FastifyRequest): AuthSourceContext;
    refreshedCookies(input: Readonly<{
        sessionToken: string;
        csrfToken: string | null;
    }>): readonly string[];
}
type RoutePolicy = (route: string) => Pick<RouteOptions, 'config'>;
class StaffHttpRefusal extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
}
function refuse(): never { throw new StaffHttpRefusal(403, 'STAFF_REQUEST_REFUSED'); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new StaffHttpRefusal(422, 'STAFF_INPUT_INVALID');
    return result.data;
}
function project<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
    return result.data;
}
const ordinary = (base: AuthenticatedSession) => ({ userId: base.userId, ordinarySessionId: base.session.session_id });
const reason = (wire: z.infer<typeof contract.ReasonSchema>): Reason => ({ code: wire.code, ...(wire.ticket_ref === undefined ? {} : { ticketRef: wire.ticket_ref }) });
const receipt = (value: SecurityReceipt) => ({ operation_id: value.operationId, outcome: value.outcome, recorded_at: value.recordedAt.toISOString() });
/** Fixed field order + sorted sets make the proof independent of browser object/key ordering. */
export function canonicalStaffActionBinding(intent: contract.StaffActionIntent, auth: StaffAuthentication): ActionBinding {
    if (intent.action === 'CREDENTIAL_REGISTER') {
        const body = { action: intent.action, target_id: auth.context.userId, expected_revision: auth.context.grantRevision, operation_id: intent.operation_id };
        return { action: intent.action, targetId: auth.context.userId, expectedRevision: auth.context.grantRevision,
            operationId: intent.operation_id, bodySha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
    }
    const targetId = intent.action === 'TEAM_INVITE' ? intent.target_user_id : intent.target_staff_id;
    const body = { action: intent.action, target_id: targetId,
        ...('capabilities' in intent ? { capabilities: [...intent.capabilities].sort() } : { mode: intent.mode }),
        expected_revision: intent.expected_revision, operation_id: intent.operation_id,
        reason: { code: intent.reason.code, ...(intent.reason.ticket_ref === undefined ? {} : { ticket_ref: intent.reason.ticket_ref }) } };
    return { action: intent.action, targetId, expectedRevision: intent.expected_revision, operationId: intent.operation_id,
        bodySha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}
/** The browser supplies only self business intent; state is produced by the guarded SQL reader. */
export function canonicalInternalAllowanceActionBinding(input: contract.InternalAllowanceIntent, state: InternalAllowanceCommandState): ActionBinding {
    const intent = parse(contract.FundedStaffActionIntentSchema, input);
    if (intent.action !== 'ALLOWANCE_CONFIGURE' && intent.action !== 'ALLOWANCE_REVOKE') refuse();
    const targetId = intent.action === 'ALLOWANCE_CONFIGURE' ? state.ownerRef : intent.grant_id;
    const body = {
        action: intent.action, target_id: targetId,
        ...(intent.action === 'ALLOWANCE_CONFIGURE' ? {
            amount_micros: intent.amount_micros, day_micros: intent.day_micros, week_micros: intent.week_micros,
            starts_at: new Date(intent.starts_at).toISOString(), expires_at: new Date(intent.expires_at).toISOString(),
            funding_approval_ref: intent.funding_approval_ref
        } : { owner_ref: state.ownerRef }),
        expected_revision: state.expectedRevision, policy_register_version: state.policyRegisterVersion,
        operation_id: intent.operation_id,
        reason: { code: intent.reason.code, ...(intent.reason.ticket_ref === undefined ? {} : { ticket_ref: intent.reason.ticket_ref }) }
    };
    return { action: intent.action, targetId, expectedRevision: state.expectedRevision, operationId: intent.operation_id,
        bodySha256: createHash('sha256').update(parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)))).digest('hex') };
}
function capability(intent: contract.FundedStaffActionIntent): StaffCapability | null {
    if (intent.action === 'ALLOWANCE_CONFIGURE' || intent.action === 'ALLOWANCE_REVOKE') return 'ALLOWANCE_WRITE';
    return intent.action === 'CREDENTIAL_REGISTER' ? null : intent.action;
}
export function registerStaffRoutes(api: FastifyInstance, application: StaffHttpApplication | undefined, routePolicy: RoutePolicy, transport: StaffRouteTransport): void {
    async function current(base: AuthenticatedSession): Promise<void> {
        if (application?.sessions.assertCurrent === undefined)
            throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        await application.sessions.assertCurrent(base);
    }
    const auth = (request: FastifyRequest): StaffAuthentication => request.staffAuthentication ?? refuse();
    /** Team tools locked: refuse before a challenge is issued or a ceremony finished. DISABLE/OFFBOARD never call this. */
    async function requireUnlocked(): Promise<void> {
        if (application!.readiness !== undefined && await application!.readiness.readIndependentAlertReadiness() !== 'READY')
            throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
    }
    async function actionAuthority(request: FastifyRequest, intent: contract.FundedStaffActionIntent): Promise<Readonly<{
        authentication: StaffAuthentication;
        binding: ActionBinding;
        allowanceState?: InternalAllowanceCommandState;
    }>> {
        const authentication = auth(request), required = capability(intent);
        // Containment (TEAM_DISABLE = OFFBOARD, EMERGENCY_DISABLE = COMPROMISE) stays available while locked.
        if (intent.action !== 'TEAM_DISABLE' && intent.action !== 'EMERGENCY_DISABLE')
            await requireUnlocked();
        let binding: ActionBinding;
        let allowanceState: InternalAllowanceCommandState | undefined;
        if (intent.action === 'ALLOWANCE_CONFIGURE' || intent.action === 'ALLOWANCE_REVOKE') {
            if (application!.funding === undefined) throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
            await application!.funding.requireReady();
            allowanceState = await application!.funding.allowances.readSelfCommand(authentication.context,
                authentication.baseSession.tokenHash, intent.action === 'ALLOWANCE_REVOKE' ? intent.grant_id : null);
            if (authentication.context.designation !== 'OWNER' || allowanceState.ownerRef !== authentication.baseSession.ownerRef) refuse();
            binding = canonicalInternalAllowanceActionBinding(intent, allowanceState);
        } else binding = canonicalStaffActionBinding(intent, authentication);
        await application!.access.assertCurrent(authentication);
        if (required !== null)
            await application!.access.requireCapability(authentication, required, binding);
        return { authentication, binding, ...(allowanceState === undefined ? {} : { allowanceState }) };
    }
    async function scopedInvitation(request: FastifyRequest, handle: string) {
        const context = await application!.access.readInvitationContext(request.authenticatedSession!, handle);
        return context ?? refuse();
    }
    function route(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>): void {
        api.route({ method, url: path, ...routePolicy(`${method} ${path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}')}`), bodyLimit: 32768,
            handler: async (request, reply) => {
                try {
                    if (application === undefined)
                        throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
                    // No bearer in a URL, no search or implicit parameterized self lookup.
                    if (method !== 'GET' || path === '/v1/admin/enrollment')
                        parse(contract.StaffElevationOptionsRequestSchema, request.query);
                    await current(request.authenticatedSession!);
                    const result = await handler(request, reply);
                    await current(request.authenticatedSession!);
                    return result;
                }
                catch (error) {
                    if (error instanceof StaffHttpRefusal)
                        return reply.code(error.status).send({ error: error.code });
                    // Team tools are locked: no fresh independent alert readiness for this action (no destination exposed).
                    if (error instanceof StaffAlertError && error.code === 'STAFF_ALERT_UNAVAILABLE')
                        return reply.code(503).send({ error: 'STAFF_ALERT_UNAVAILABLE' });
                    if (error instanceof StaffAlertError || error instanceof Error && error.message === 'STAFF_UNAVAILABLE') {
                        return reply.code(503).send({ error: 'STAFF_UNAVAILABLE' });
                    }
                    return reply.code(403).send({ error: 'STAFF_REQUEST_REFUSED' });
                }
            } });
    }
    route('GET', '/v1/admin/enrollment', async (request) => {
        const base = request.authenticatedSession!, value = await application!.repository.readEnrollment({ ...ordinary(base), ordinaryTokenHash: base.tokenHash });
        if (value === null || value.user_id !== base.userId)
            refuse();
        return application!.funding === undefined ? project(contract.StaffEnrollmentResponseSchema, value)
          : project(contract.FundedStaffEnrollmentResponseSchema, {...value,funding_policy_version:1});
    });
    route('POST', '/v1/admin/prerequisites/step-up', async (request, reply) => {
        const input = parse(contract.StaffPrerequisiteStepUpRequestSchema, request.body);
        if (application!.sessions.stepUpStaffPrerequisite === undefined)
            throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        const controller = new AbortController();
        const abort = () => controller.abort();
        const closed = () => { if (!reply.raw.writableEnded) abort(); };
        request.raw.once('aborted', abort); reply.raw.once('close', closed);
        if (request.raw.aborted || reply.raw.destroyed) abort();
        let result: Awaited<ReturnType<NonNullable<SessionApplication['stepUpStaffPrerequisite']>>>;
        try {
          result = await application!.sessions.stepUpStaffPrerequisite({ session: request.authenticatedSession!, password: input.password, code: input.totp_code,
              ...(input.purpose === 'KEY_PREREGISTRATION' ? { purpose: input.purpose }
                  : { purpose: input.purpose, commandId: input.command_id, commandNonce: input.command_nonce }) }, transport.sourceFor(request), controller.signal);
          if (controller.signal.aborted) throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        } finally { request.raw.removeListener('aborted', abort); reply.raw.removeListener('close', closed); }
        const base = await application!.sessions.authenticate(result.sessionToken, transport.sourceFor(request));
        if (base === null || base.userId !== request.authenticatedSession!.userId || base.session.session_id !== request.authenticatedSession!.session.session_id)
            refuse();
        request.authenticatedSession = base;
        request.cookieRefresh = { sessionToken: result.sessionToken, csrfToken: result.csrfToken };
        reply.header('set-cookie', transport.refreshedCookies(request.cookieRefresh));
        return project(contract.StaffPrerequisiteResponseSchema, { prerequisite_handle: result.prerequisiteHandle, expires_at: result.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/webauthn/registration/options', async (request) => {
        const input = parse(contract.StaffRegistrationOptionsRequestSchema, request.body), base = request.authenticatedSession!;
        await requireUnlocked();
        if ('prerequisite_handle' in input)
            return project(contract.StaffRegistrationOptionsResponseSchema, await application!.webauthn.beginRegistration(ordinary(base), { kind: 'PREREQUISITE', prerequisiteHandle: input.prerequisite_handle, operationId: randomUUID() }));
        const rawCookie = request.headers.cookie, staffToken = exactStaffCookie(rawCookie, STAFF_COOKIE_NAME);
        const csrf = exactStaffCsrfPair(request.headers[STAFF_CSRF_HEADER], exactStaffCookie(rawCookie, STAFF_CSRF_COOKIE_NAME));
        if (staffToken === null || csrf === null)
            refuse();
        const authentication = await application!.access.authenticate(base, staffToken);
        if (authentication === null || !await application!.access.verifyCsrf(authentication, csrf))
            refuse();
        request.staffAuthentication = authentication;
        const binding = canonicalStaffActionBinding({ action: 'CREDENTIAL_REGISTER', operation_id: input.operation_id }, authentication);
        if (await application!.access.readActionProof(authentication, input.proof_handle, binding) === null)
            refuse();
        return project(contract.StaffRegistrationOptionsResponseSchema, await application!.webauthn.beginRegistration(ordinary(base), { kind: 'STAFF_PROOF', context: authentication.context, proofHandle: input.proof_handle, binding, operationId: binding.operationId }));
    });
    route('POST', '/v1/admin/webauthn/registration/verify', async (request) => {
        const input = parse(contract.StaffRegistrationVerifyRequestSchema, request.body);
        await requireUnlocked();
        const result = await application!.webauthn.finishRegistration(ordinary(request.authenticatedSession!), input, application!.intents.enrollment);
        return project(contract.StaffRegistrationResponseSchema, { receipt: receipt(result.receipt), credentialId: result.credentialId });
    });
    route('POST', '/v1/admin/webauthn/elevation/options', async (request) => {
        parse(contract.StaffElevationOptionsRequestSchema, request.body);
        return project(contract.StaffAuthenticationOptionsResponseSchema, await application!.webauthn.beginElevation(ordinary(request.authenticatedSession!)));
    });
    route('POST', '/v1/admin/webauthn/elevation/verify', async (request, reply) => {
        const input = parse(contract.StaffAuthenticationVerifyRequestSchema, request.body);
        const result = await application!.webauthn.finishElevation(ordinary(request.authenticatedSession!), input);
        const authentication = await application!.access.authenticate(request.authenticatedSession!, result.staffToken);
        if (authentication === null || authentication.context.staffId !== result.staffId)
            refuse();
        request.staffAuthentication = authentication;
        reply.header('set-cookie', [...transport.refreshedCookies(request.cookieRefresh!), ...staffCookies(result)]);
        return project(application!.funding === undefined ? contract.StaffElevationResponseSchema : contract.FundedStaffElevationResponseSchema, { staff_id: result.staffId, capabilities: [...result.capabilities], grant_revision: result.grantRevision, expires_at: result.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/webauthn/action/options', async (request) => {
        const { intent } = parse(application!.funding === undefined ? contract.StaffActionOptionsRequestSchema : contract.FundedStaffActionOptionsRequestSchema, request.body), { authentication, binding } = await actionAuthority(request, intent);
        return project(contract.StaffAuthenticationOptionsResponseSchema, await application!.webauthn.beginAction(authentication.context, binding));
    });
    route('POST', '/v1/admin/webauthn/action/verify', async (request) => {
        const input = parse(application!.funding === undefined ? contract.StaffActionVerifyRequestSchema : contract.FundedStaffActionVerifyRequestSchema, request.body), { authentication, binding } = await actionAuthority(request, input.intent);
        const result = await application!.webauthn.finishAction(authentication.context, binding, { challenge_handle: input.challenge_handle, credential: input.credential });
        return project(contract.StaffActionProofResponseSchema, { proof_handle: result.proofHandle, expires_at: result.proof.expiresAt.toISOString() });
    });
    route('GET', '/v1/admin/team', async (request) => {
        const query = parse(contract.StaffTeamQuerySchema, request.query), authentication = auth(request);
        await application!.access.requireCapability(authentication, 'TEAM_READ');
        return project(application!.funding === undefined ? contract.StaffTeamPageSchema : contract.FundedStaffTeamPageSchema, await application!.repository.readTeamPage({ context: authentication.context, ordinaryTokenHash: authentication.baseSession.tokenHash, limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) }));
    });
    route('GET', '/v1/admin/audit', async (request) => {
        const query = parse(contract.StaffAuditQuerySchema, request.query), authentication = auth(request);
        await application!.access.requireCapability(authentication, 'AUDIT_READ');
        return project(contract.StaffAuditPageSchema, await application!.repository.readAuditPage({ context: authentication.context, ordinaryTokenHash: authentication.baseSession.tokenHash, limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) }));
    });
    route('POST', '/v1/admin/team/invitations', async (request) => {
        const input = parse(contract.StaffInviteRequestSchema, request.body);
        const intent: contract.StaffActionIntent = { action: 'TEAM_INVITE', target_user_id: input.target_user_id, capabilities: input.capabilities,
            expected_revision: input.expected_revision, operation_id: input.operation_id, reason: input.reason };
        const { authentication, binding } = await actionAuthority(request, intent);
        const proof = await application!.access.readActionProof(authentication, input.proof_handle, binding);
        if (proof === null)
            refuse();
        if (application!.targetInvitationTransport === undefined)
            throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        const alertIntent = await application!.intents.mutation({ event: 'INVITE', operationId: binding.operationId, keyUserId: input.target_user_id,
            actorStaffId: authentication.context.staffId, subjectStaffId: null, reason: reason(input.reason) });
        const delivery = await application!.intents.newInvitation({ operationId: binding.operationId, targetUserId: input.target_user_id });
        await application!.access.requireCapability(authentication, 'TEAM_INVITE', binding);
        const result = await application!.repository.invite({ actor: authentication.context, proof, operationId: binding.operationId, reason: reason(input.reason), alertIntent,
            targetUserId: input.target_user_id, capabilities: [...input.capabilities].sort(), ...delivery });
        const issued = await application!.repository.readIssuedInvitation({ context: authentication.context, ordinaryTokenHash: authentication.baseSession.tokenHash, operationId: binding.operationId });
        if (issued === null)
            refuse();
        return project(contract.StaffInviteResponseSchema, { receipt: receipt(result), invitation_id: issued.invitationId, expires_at: issued.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/team/invitations/accept/options', async (request) => {
        const input = parse(contract.StaffInvitationOptionsRequestSchema, request.body), context = await scopedInvitation(request, input.invitation_handle);
        await requireUnlocked();
        const options = await application!.webauthn.beginInvitationAcceptance(context, { invitationHandle: input.invitation_handle });
        return project(contract.StaffInvitationOptionsResponseSchema, { ...options, invitation_revision: context.invitationRevision });
    });
    route('POST', '/v1/admin/team/invitations/accept/verify', async (request) => {
        const input = parse(contract.StaffInvitationVerifyRequestSchema, request.body), context = await scopedInvitation(request, input.invitation_handle);
        await requireUnlocked();
        const result = await application!.webauthn.finishInvitationAcceptance(context, { invitationHandle: input.invitation_handle }, { challenge_handle: input.challenge_handle, credential: input.credential });
        return project(contract.StaffActionProofResponseSchema, { proof_handle: result.proofHandle, expires_at: result.proof.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/team/invitations/accept', async (request) => {
        const input = parse(contract.StaffInvitationAcceptRequestSchema, request.body), context = await scopedInvitation(request, input.invitation_handle);
        await requireUnlocked();
        if (context.invitationRevision !== input.expected_revision)
            refuse();
        const proof = await application!.repository.readInvitationProof({ context, ordinaryTokenHash: request.authenticatedSession!.tokenHash, proofHandleHash: staffTokenHash(input.proof_handle)! });
        if (proof === null)
            refuse();
        const purpose: Reason = { code: 'TEAM_ONBOARDING' };
        const alertIntent = await application!.intents.mutation({ event: 'ACCEPT', operationId: input.operation_id, keyUserId: context.targetUserId,
            actorStaffId: context.issuerStaffId, subjectStaffId: null, reason: purpose });
        return project(contract.SecurityReceiptSchema, receipt(await application!.repository.accept({ context, proof, operationId: input.operation_id, reason: purpose, alertIntent })));
    });
    route('POST', '/v1/admin/owner-possession/options', async (request) => {
        const input = parse(contract.OwnerPossessionOptionsRequestSchema, request.body);
        const context = await application!.access.readOwnerPossessionContext(request.authenticatedSession!, input.command_id, input.command_nonce, input.credential_id, input.prerequisite_handle);
        if (context === null)
            refuse();
        return project(contract.StaffAuthenticationOptionsResponseSchema, await application!.webauthn.beginOwnerPossession(context, { credentialId: input.credential_id, commandNonce: input.command_nonce, prerequisiteHandle: input.prerequisite_handle }));
    });
    route('POST', '/v1/admin/owner-possession/verify', async (request) => {
        const input = parse(contract.OwnerPossessionVerifyRequestSchema, request.body);
        const result = await application!.webauthn.finishOwnerPossession(ordinary(request.authenticatedSession!), input);
        return project(contract.OwnerPossessionResponseSchema, { receipt_id: result.receiptId, expires_at: result.expiresAt.toISOString() });
    });
    async function mutate(request: FastifyRequest, kind: 'GRANT' | 'DISABLE') {
        const { staffId } = parse(contract.StaffTargetParamsSchema, request.params);
        const input = kind === 'GRANT' ? parse(contract.StaffGrantRequestSchema, request.body) : parse(contract.StaffDisableRequestSchema, request.body);
        const intent: contract.StaffActionIntent = 'capabilities' in input
            ? { action: 'TEAM_GRANT', target_staff_id: staffId, capabilities: input.capabilities, expected_revision: input.expected_revision, operation_id: input.operation_id, reason: input.reason }
            : input.mode === 'OFFBOARD'
                ? { action: 'TEAM_DISABLE', target_staff_id: staffId, mode: input.mode, expected_revision: input.expected_revision, operation_id: input.operation_id, reason: input.reason }
                : { action: 'EMERGENCY_DISABLE', target_staff_id: staffId, mode: input.mode, expected_revision: input.expected_revision, operation_id: input.operation_id, reason: input.reason };
        const { authentication, binding } = await actionAuthority(request, intent), required = capability(intent) as 'TEAM_GRANT' | 'TEAM_DISABLE' | 'EMERGENCY_DISABLE';
        const proof = await application!.access.readActionProof(authentication, input.proof_handle, binding);
        if (proof === null)
            refuse();
        const keyUserId = await application!.repository.readMutationTarget({ context: authentication.context, ordinaryTokenHash: authentication.baseSession.tokenHash, targetStaffId: staffId, capability: required });
        if (keyUserId === null)
            refuse();
        const alertIntent = await application!.intents.mutation({ event: kind, operationId: binding.operationId, keyUserId,
            actorStaffId: authentication.context.staffId, subjectStaffId: staffId, reason: reason(input.reason) });
        await application!.access.requireCapability(authentication, required, binding);
        const common = { actor: authentication.context, proof, operationId: binding.operationId, reason: reason(input.reason), alertIntent, targetStaffId: staffId };
        const result = 'capabilities' in input ? await application!.repository.grant({ ...common, capabilities: [...input.capabilities].sort() })
            : await application!.repository.disable({ ...common, mode: input.mode });
        return project(contract.SecurityReceiptSchema, receipt(result));
    }
    route('PATCH', '/v1/admin/team/:staffId/grants', request => mutate(request, 'GRANT'));
    route('POST', '/v1/admin/team/:staffId/disable', request => mutate(request, 'DISABLE'));
    async function mutateAllowance(request: FastifyRequest, action: 'ALLOWANCE_CONFIGURE' | 'ALLOWANCE_REVOKE') {
        if (application!.funding === undefined) throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        const configure = action === 'ALLOWANCE_CONFIGURE' ? parse(contract.InternalAllowanceConfigureRequestSchema, request.body) : null;
        const revoke = action === 'ALLOWANCE_REVOKE' ? parse(contract.InternalAllowanceRevokeRequestSchema, request.body) : null;
        const intent: contract.InternalAllowanceIntent = configure !== null
            ? { action: 'ALLOWANCE_CONFIGURE', amount_micros: configure.amount_micros, day_micros: configure.day_micros,
                week_micros: configure.week_micros, starts_at: configure.starts_at, expires_at: configure.expires_at,
                funding_approval_ref: configure.funding_approval_ref, operation_id: configure.operation_id, reason: configure.reason }
            : { action: 'ALLOWANCE_REVOKE', grant_id: parse(contract.InternalAllowanceTargetParamsSchema, request.params).grantId,
                operation_id: revoke!.operation_id, reason: revoke!.reason };
        const { authentication, binding, allowanceState } = await actionAuthority(request, intent);
        if (allowanceState === undefined) refuse();
        const proof = await application!.access.readActionProof(authentication, (configure ?? revoke)!.proof_handle, binding);
        if (proof === null) refuse();
        const purpose = reason(intent.reason);
        const alertIntent = await application!.intents.mutation({ event: action === 'ALLOWANCE_CONFIGURE' ? 'ALLOWANCE_CONFIGURED' : 'ALLOWANCE_REVOKED',
            operationId: binding.operationId, keyUserId: authentication.context.userId, actorStaffId: authentication.context.staffId,
            subjectStaffId: authentication.context.staffId, reason: purpose });
        await application!.access.requireCapability(authentication, 'ALLOWANCE_WRITE', binding);
        const common = { ...allowanceState, actor: authentication.context, proof, operationId: binding.operationId, reason: purpose, alertIntent };
        const result = intent.action === 'ALLOWANCE_CONFIGURE'
            ? await application!.funding.allowances.configure({ ...common, amountMicros: intent.amount_micros, dayMicros: intent.day_micros,
                weekMicros: intent.week_micros, startsAt: new Date(intent.starts_at), expiresAt: new Date(intent.expires_at), fundingApprovalRef: intent.funding_approval_ref })
            : await application!.funding.allowances.revoke({ ...common, grantId: intent.grant_id });
        return project(contract.SecurityReceiptSchema, receipt(result));
    }
    route('POST', '/v1/admin/internal-allowances', request => mutateAllowance(request, 'ALLOWANCE_CONFIGURE'));
    route('DELETE', '/v1/admin/internal-allowances/:grantId', request => mutateAllowance(request, 'ALLOWANCE_REVOKE'));

}
