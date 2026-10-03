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
    { route: 'GET /v1/admin/audit', auth: 'staff', staffCapability: 'AUDIT_READ', resource: 'staff-audit', action: 'list' }
] as const);
/** Explicit v2 composition only. No ready flags, command prepare/commit, or private content readers. */
export interface StaffHttpApplication {
    access: StaffAccessApplication;
    sessions: SessionApplication;
    repository: StaffManagementRepository;
    webauthn: Pick<StaffWebAuthnService, 'beginRegistration' | 'finishRegistration' | 'beginElevation' | 'finishElevation' | 'beginAction' | 'finishAction' | 'beginInvitationAcceptance' | 'finishInvitationAcceptance' | 'beginOwnerPossession' | 'finishOwnerPossession'>;
    intents: Pick<StaffAlertIntentProducer, 'mutation' | 'newInvitation' | 'enrollment'>;
    targetInvitationTransport?: StaffTargetInvitationTransport;
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
function capability(intent: contract.StaffActionIntent): Exclude<StaffCapability, 'ALLOWANCE_WRITE'> | null {
    return intent.action === 'CREDENTIAL_REGISTER' ? null : intent.action;
}
export function registerStaffRoutes(api: FastifyInstance, application: StaffHttpApplication | undefined, routePolicy: RoutePolicy, transport: StaffRouteTransport): void {
    async function current(base: AuthenticatedSession): Promise<void> {
        if (application?.sessions.assertCurrent === undefined)
            throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        await application.sessions.assertCurrent(base);
    }
    const auth = (request: FastifyRequest): StaffAuthentication => request.staffAuthentication ?? refuse();
    async function actionAuthority(request: FastifyRequest, intent: contract.StaffActionIntent): Promise<Readonly<{
        authentication: StaffAuthentication;
        binding: ActionBinding;
    }>> {
        const authentication = auth(request), binding = canonicalStaffActionBinding(intent, authentication), required = capability(intent);
        await application!.access.assertCurrent(authentication);
        if (required !== null)
            await application!.access.requireCapability(authentication, required, binding);
        return { authentication, binding };
    }
    async function scopedInvitation(request: FastifyRequest, handle: string) {
        const context = await application!.access.readInvitationContext(request.authenticatedSession!, handle);
        return context ?? refuse();
    }
    function route(method: 'GET' | 'POST' | 'PATCH', path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>): void {
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
        return project(contract.StaffEnrollmentResponseSchema, value);
    });
    route('POST', '/v1/admin/prerequisites/step-up', async (request, reply) => {
        const input = parse(contract.StaffPrerequisiteStepUpRequestSchema, request.body);
        if (application!.sessions.stepUpStaffPrerequisite === undefined)
            throw new StaffHttpRefusal(503, 'STAFF_UNAVAILABLE');
        const result = await application!.sessions.stepUpStaffPrerequisite({ session: request.authenticatedSession!, password: input.password, code: input.totp_code,
            ...(input.purpose === 'KEY_PREREGISTRATION' ? { purpose: input.purpose }
                : { purpose: input.purpose, commandId: input.command_id, commandNonce: input.command_nonce }) }, transport.sourceFor(request));
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
        return project(contract.StaffElevationResponseSchema, { staff_id: result.staffId, capabilities: [...result.capabilities], grant_revision: result.grantRevision, expires_at: result.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/webauthn/action/options', async (request) => {
        const { intent } = parse(contract.StaffActionOptionsRequestSchema, request.body), { authentication, binding } = await actionAuthority(request, intent);
        return project(contract.StaffAuthenticationOptionsResponseSchema, await application!.webauthn.beginAction(authentication.context, binding));
    });
    route('POST', '/v1/admin/webauthn/action/verify', async (request) => {
        const input = parse(contract.StaffActionVerifyRequestSchema, request.body), { authentication, binding } = await actionAuthority(request, input.intent);
        const result = await application!.webauthn.finishAction(authentication.context, binding, { challenge_handle: input.challenge_handle, credential: input.credential });
        return project(contract.StaffActionProofResponseSchema, { proof_handle: result.proofHandle, expires_at: result.proof.expiresAt.toISOString() });
    });
    route('GET', '/v1/admin/team', async (request) => {
        const query = parse(contract.StaffTeamQuerySchema, request.query), authentication = auth(request);
        await application!.access.requireCapability(authentication, 'TEAM_READ');
        return project(contract.StaffTeamPageSchema, await application!.repository.readTeamPage({ context: authentication.context, ordinaryTokenHash: authentication.baseSession.tokenHash, limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) }));
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
        const options = await application!.webauthn.beginInvitationAcceptance(context, { invitationHandle: input.invitation_handle });
        return project(contract.StaffInvitationOptionsResponseSchema, { ...options, invitation_revision: context.invitationRevision });
    });
    route('POST', '/v1/admin/team/invitations/accept/verify', async (request) => {
        const input = parse(contract.StaffInvitationVerifyRequestSchema, request.body), context = await scopedInvitation(request, input.invitation_handle);
        const result = await application!.webauthn.finishInvitationAcceptance(context, { invitationHandle: input.invitation_handle }, { challenge_handle: input.challenge_handle, credential: input.credential });
        return project(contract.StaffActionProofResponseSchema, { proof_handle: result.proofHandle, expires_at: result.proof.expiresAt.toISOString() });
    });
    route('POST', '/v1/admin/team/invitations/accept', async (request) => {
        const input = parse(contract.StaffInvitationAcceptRequestSchema, request.body), context = await scopedInvitation(request, input.invitation_handle);
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
}
