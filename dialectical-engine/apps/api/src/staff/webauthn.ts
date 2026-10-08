import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { StaffRegistrationVerifyRequestSchema, StaffAuthenticationVerifyRequestSchema, OwnerPossessionVerifyRequestSchema } from '@debateai/contract';
import type { StaffRegistrationOptionsResponseSchema, StaffAuthenticationOptionsResponseSchema } from '@debateai/contract';
import type { z } from 'zod';
import type { ActionBinding, StaffContext, StaffProof, InvitationContext, InvitationProof, OwnerPossessionContext } from '@debateai/kernel';
import type { StaffWebAuthnRepository, StaffOrdinarySession, StaffEnrollmentIntentFactory, StaffCeremonyRead, StaffCeremonyScope, StaffCeremonyContext, StaffCeremonyPurpose, StaffCeremonyChallenge } from '@debateai/db';
import { decodeBase64url, encodeBase64url, invalid } from './webauthn-codec.js';
import { verifyRegistration, verifyAssertion } from './webauthn-verifier.js';
type CreationOptions = z.infer<typeof StaffRegistrationOptionsResponseSchema>;
type RequestOptions = z.infer<typeof StaffAuthenticationOptionsResponseSchema>;
export type StaffRegistrationAuthority = Readonly<{
    kind: 'PREREQUISITE';
    prerequisiteHandle: string;
    operationId: string;
}> | Readonly<{
    kind: 'STAFF_PROOF';
    context: StaffContext;
    proofHandle: string;
    binding: ActionBinding;
    operationId: string;
}>;
export type OwnerPossessionSelection = Readonly<{
    credentialId: string;
    commandNonce: string;
    prerequisiteHandle: string;
}>;
const digest = (value: Uint8Array | string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
function wrapperBound(value: unknown): void { try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32768)
        invalid();
}
catch {
    return invalid();
} }
const token = () => encodeBase64url(randomBytes(32));
const handle = (value: string) => { if (decodeBase64url(value, 32).byteLength !== 32)
    invalid(); return digest(value); };
/** Unmounted trusted API boundary. Ordinary identities/contexts come from authenticated server code.
 * Raw elevation secrets return only to the future trusted cookie transport (Task4).
 * SQL owns clocks/current authority; native verifier owns all signature acceptance. */
export class StaffWebAuthnService {
    private readonly origin: string;
    private readonly rpId: string;
    constructor(private readonly repository: StaffWebAuthnRepository, config: Readonly<{
        publicAppUrl: string;
    }>) {
        let url: URL;
        try {
            url = new URL(config.publicAppUrl);
        }
        catch {
            invalid();
        }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
            invalid();
        this.origin = url.origin;
        this.rpId = url.hostname;
    }
    private async begin(base: StaffOrdinarySession, purpose: StaffCeremonyPurpose, context: StaffCeremonyContext | null, binding: ActionBinding | null, scope: StaffCeremonyScope, operationId: string | null = null): Promise<CreationOptions | RequestOptions> {
        const challenge = token(), challengeHandle = token(), userHandle = purpose === 'REGISTRATION' ? randomBytes(32) : null;
        const persisted = await this.repository.beginWebAuthn({ ...base, purpose, challengeHash: digest(challenge), handleHash: handle(challengeHandle), rpId: this.rpId, origin: this.origin, userHandleHash: userHandle === null ? null : digest(userHandle), operationId, context, binding, scope });
        const credentials = persisted.credentials.map(c => ({ ...c, transports: [...c.transports] }));
        if (userHandle !== null)
            return { challenge_handle: challengeHandle, options: { challenge, rp: { id: this.rpId, name: 'DebateAI staff' }, user: { id: encodeBase64url(userHandle), name: 'Staff hardware key', displayName: 'Staff hardware key' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 300000, attestation: 'none', authenticatorSelection: { userVerification: 'required', authenticatorAttachment: 'cross-platform' }, excludeCredentials: credentials } };
        return { challenge_handle: challengeHandle, options: { challenge, rpId: this.rpId, timeout: 300000, userVerification: 'required', allowCredentials: credentials } };
    }
    beginRegistration(base: StaffOrdinarySession, authority: StaffRegistrationAuthority): Promise<CreationOptions> {
        const scope: StaffCeremonyScope = authority.kind === 'PREREQUISITE' ? { kind: 'PREREQUISITE', prerequisiteHandleHash: handle(authority.prerequisiteHandle) } : { kind: 'STAFF_PROOF', proofHandleHash: handle(authority.proofHandle) };
        return this.begin(base, 'REGISTRATION', authority.kind === 'STAFF_PROOF' ? authority.context : null, authority.kind === 'STAFF_PROOF' ? authority.binding : null, scope, authority.operationId) as Promise<CreationOptions>;
    }
    private async read(base: StaffOrdinarySession, purpose: StaffCeremonyPurpose, response: unknown, context: StaffCeremonyContext | null, binding: ActionBinding | null, scope: StaffCeremonyScope | null): Promise<StaffCeremonyChallenge> {
        wrapperBound(response);
        if (response === null || typeof response !== 'object' || !('challenge_handle' in response) || typeof response.challenge_handle !== 'string')
            invalid();
        const challenge = await this.repository.readWebAuthnChallenge({ ...base, purpose, handleHash: handle(response.challenge_handle), context, binding, scope });
        if (challenge === null || challenge.origin !== this.origin || challenge.rpId !== this.rpId)
            invalid();
        return challenge;
    }
    async finishRegistration(base: StaffOrdinarySession, response: unknown, intentFactory: StaffEnrollmentIntentFactory): Promise<Awaited<ReturnType<StaffWebAuthnRepository['completeWebAuthnRegistration']>>> {
        const challenge = await this.read(base, 'REGISTRATION', response, null, null, null);
        let verified: ReturnType<typeof verifyRegistration>;
        let transports: NonNullable<z.infer<typeof StaffRegistrationVerifyRequestSchema>['credential']['response']['transports']>;
        try {
            const parsed = StaffRegistrationVerifyRequestSchema.safeParse(response);
            if (!parsed.success)
                invalid();
            verified = verifyRegistration(parsed.data.credential, challenge);
            transports = parsed.data.credential.response.transports ?? [];
        }
        catch {
            await this.repository.failWebAuthn({ ...base, challengeId: challenge.challengeId });
            return invalid();
        }
        if (challenge.operationId === null || typeof intentFactory !== 'function')
            invalid();
        const factorId = randomUUID(), intent = await intentFactory({ ...base, operationId: challenge.operationId, factorId, credentialId: verified.credentialId });
        if (intent.operationId !== challenge.operationId || intent.factorId !== factorId)
            invalid();
        return this.repository.completeWebAuthnRegistration({ ...base, ...intent, challengeId: challenge.challengeId, credentialId: verified.credentialId, publicKey: verified.publicKey, newCounter: verified.counter, transports });
    }
    beginElevation(base: StaffOrdinarySession): Promise<RequestOptions> { return this.begin(base, 'ELEVATION', null, null, {}) as Promise<RequestOptions>; }
    private async assertion(base: StaffOrdinarySession, purpose: Exclude<StaffCeremonyPurpose, 'REGISTRATION'>, response: unknown, context: StaffCeremonyContext | null, binding: ActionBinding | null, scope: StaffCeremonyScope): Promise<Readonly<{
        challenge: StaffCeremonyChallenge;
        credentialId: string;
        counter: number;
    }>> {
        const challenge = await this.read(base, purpose, response, context, binding, scope);
        try {
            const parsed = StaffAuthenticationVerifyRequestSchema.safeParse(response);
            if (!parsed.success)
                invalid();
            if (!challenge.allowedCredentialIds.includes(parsed.data.credential.id))
                invalid();
            const stored = await this.repository.readWebAuthnCredential({ ...base, challengeId: challenge.challengeId, credentialId: parsed.data.credential.id });
            if (stored === null)
                invalid();
            const verified = verifyAssertion(parsed.data.credential, stored, challenge);
            return { ...verified, challenge };
        }
        catch {
            await this.repository.failWebAuthn({ ...base, challengeId: challenge.challengeId });
            return invalid();
        }
    }
    async finishElevation(base: StaffOrdinarySession, response: unknown): Promise<Readonly<{
        staffToken: string;
        staffCsrfToken: string;
        expiresAt: Date;
        staffId: string;
        capabilities: StaffContext['capabilities'];
        grantRevision: number;
    }>> {
        const verified = await this.assertion(base, 'ELEVATION', response, null, null, {}), staffToken = token(), staffCsrfToken = token();
        const result = await this.repository.completeWebAuthnAssertion({ ...base, challengeId: verified.challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId: this.rpId, origin: this.origin, purpose: 'ELEVATION', context: null, binding: null, scope: {}, tokenHash: digest(staffToken), csrfHash: digest(staffCsrfToken) });
        if (!('context' in result) || !('designation' in result.context))
            invalid();
        return Object.freeze({ staffToken, staffCsrfToken, expiresAt: result.expiresAt, staffId: result.context.staffId, capabilities: result.context.capabilities, grantRevision: result.context.grantRevision });
    }
    beginAction(context: StaffContext, binding: ActionBinding): Promise<RequestOptions> { return this.begin(context, 'ACTION', context, binding, {}) as Promise<RequestOptions>; }
    async finishAction(context: StaffContext, binding: ActionBinding, response: unknown): Promise<Readonly<{
        proof: StaffProof;
        proofHandle: string;
    }>> {
        const verified = await this.assertion(context, 'ACTION', response, context, binding, {}), proofHandle = token();
        const proof = await this.repository.completeWebAuthnAssertion({ ...context, challengeId: verified.challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId: this.rpId, origin: this.origin, purpose: 'ACTION', context, binding, scope: {}, tokenHash: digest(proofHandle), csrfHash: null });
        if (!('proofId' in proof) || 'purpose' in proof)
            invalid();
        return { proof, proofHandle };
    }
    beginInvitationAcceptance(context: InvitationContext, input: Readonly<{
        invitationHandle: string;
    }>): Promise<RequestOptions> { return this.begin({ userId: context.targetUserId, ordinarySessionId: context.ordinarySessionId }, 'INVITATION_ACCEPT', context, null, { invitationTokenHash: handle(input.invitationHandle) }) as Promise<RequestOptions>; }
    async finishInvitationAcceptance(context: InvitationContext, input: Readonly<{
        invitationHandle: string;
    }>, response: unknown): Promise<Readonly<{
        proof: InvitationProof;
        proofHandle: string;
    }>> {
        const base = { userId: context.targetUserId, ordinarySessionId: context.ordinarySessionId }, scope = { invitationTokenHash: handle(input.invitationHandle) }, verified = await this.assertion(base, 'INVITATION_ACCEPT', response, context, null, scope), proofHandle = token();
        const proof = await this.repository.completeWebAuthnAssertion({ ...base, challengeId: verified.challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId: this.rpId, origin: this.origin, purpose: 'INVITATION_ACCEPT', context, binding: null, scope, tokenHash: digest(proofHandle), csrfHash: null });
        if (!('purpose' in proof) || proof.purpose !== 'INVITATION_ACCEPT')
            invalid();
        return { proof, proofHandle };
    }
    private ownerScope(context: OwnerPossessionContext, input: OwnerPossessionSelection): StaffCeremonyScope { const nonceHash = handle(input.commandNonce); if (nonceHash !== context.command.nonceSha256 || !context.command.credentialIds.includes(input.credentialId))
        invalid(); return { commandId: context.command.commandId, nonceHash, credentialId: input.credentialId, prerequisiteHandleHash: handle(input.prerequisiteHandle) }; }
    beginOwnerPossession(context: OwnerPossessionContext, input: OwnerPossessionSelection): Promise<RequestOptions> { return this.begin({ userId: context.command.targetUserId, ordinarySessionId: context.ordinarySessionId }, 'OWNER_POSSESSION', context, null, this.ownerScope(context, input)) as Promise<RequestOptions>; }
    async finishOwnerPossession(base: StaffOrdinarySession, response: unknown): Promise<Readonly<{
        receiptId: string;
        expiresAt: Date;
    }>> {
        // Verify DTO intentionally has no prerequisite handle. SQL rederives it from the
        // owned challenge and checks the explicit command/nonce/selected credential.
        wrapperBound(response);
        const parsed = OwnerPossessionVerifyRequestSchema.safeParse(response);
        if (!parsed.success)
            invalid();
        const input = parsed.data;
        const scope = { commandId: input.command_id, nonceHash: handle(input.command_nonce), credentialId: input.credential_id };
        const verified = await this.assertion(base, 'OWNER_POSSESSION', { challenge_handle: input.challenge_handle, credential: input.credential }, null, null, scope);
        if (verified.credentialId !== input.credential_id)
            invalid();
        const result = await this.repository.completeWebAuthnAssertion({ ...base, challengeId: verified.challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId: this.rpId, origin: this.origin, purpose: 'OWNER_POSSESSION', context: null, binding: null, scope: verified.challenge.scope, tokenHash: null, csrfHash: null });
        if (!('receiptId' in result))
            invalid();
        return result;
    }
}
