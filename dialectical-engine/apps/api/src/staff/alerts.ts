import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, normalize } from 'node:path';
import { decrypt, encrypt, type AeadAad, type CryptoEnvelope, type ReadableUserDekStore } from '@debateai/crypto';
import type { StaffAlertClaim, StaffAlertFailureCode, StaffAlertIntent, StaffAlertKeyMappings, StaffAlertKeyMapping, StaffAlertPurpose, StaffAlertReadinessBinding, StaffAlertRepository, StaffEnrollmentIntent, StaffEnrollmentIntentBinding, StaffInvitationDeliveryIntent, StaffIndependentReadinessPublisher, StaffTargetInvitationChannels, StaffTargetInvitationChannelInput } from '@debateai/db';
export { PostgresStaffAlertRepository } from '@debateai/db';
export type StaffAlertCode = StaffAlertFailureCode | 'STAFF_ALERT_METADATA_INVALID' | 'STAFF_ALERT_KEY_UNAVAILABLE' | 'STAFF_ALERT_UNAVAILABLE' | 'STAFF_ALERT_LIMIT_INVALID' | 'STAFF_ALERT_DRAIN_IN_PROGRESS' | 'SEVERED';
export class StaffAlertError extends Error {
    constructor(readonly code: StaffAlertCode) { super(code); this.name = 'StaffAlertError'; }
}
/** Independent receiver DTO: no customer UUID, key reference, ciphertext, credential,
 * address or invitation bearer. References identify only staff/operation records. */
export type StaffIndependentAlertMetadata = Readonly<{
    schema: 'staff-security-metadata-v1';
    event: StaffAlertIntent['event'];
    operationId: string;
    actorStaffId: string | null;
    subjectStaffId: string | null;
    reason: Readonly<{
        code: 'TEAM_ONBOARDING' | 'GRANT_CHANGE' | 'OFFBOARDING' | 'SECURITY_RESPONSE' | 'KEY_MAINTENANCE' | 'BOOTSTRAP' | 'RECOVERY' | 'FUNDING_APPROVAL';
        ticketRef?: string;
    }>;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVENTS = new Set(['INVITE', 'ACCEPT', 'GRANT', 'DISABLE', 'BOOTSTRAP', 'RECOVER_OWNER', 'KEY_CHANGE', 'ALLOWANCE_CONFIGURED', 'ALLOWANCE_REVOKED']);
const REASONS = new Set(['TEAM_ONBOARDING', 'GRANT_CHANGE', 'OFFBOARDING', 'SECURITY_RESPONSE', 'KEY_MAINTENANCE', 'BOOTSTRAP', 'RECOVERY', 'FUNDING_APPROVAL']);
const EMAIL = /^[A-Za-z0-9_.+-]{1,64}@[A-Za-z0-9.-]{1,190}$/;
const sha = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { const o = object(value); return o !== null && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k)); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function reason(value: unknown): boolean { const o = object(value); return o !== null && (exact(o, ['code']) || exact(o, ['code', 'ticketRef'])) && typeof o.code === 'string' && REASONS.has(o.code) && (o.ticketRef === undefined || (typeof o.ticketRef === 'string' && /^[A-Za-z0-9_:/.-]{1,128}$/.test(o.ticketRef))); }
function metadata(value: unknown): value is StaffIndependentAlertMetadata { const o = object(value); return o !== null && exact(o, ['schema', 'event', 'operationId', 'actorStaffId', 'subjectStaffId', 'reason']) && o.schema === 'staff-security-metadata-v1' && typeof o.event === 'string' && EVENTS.has(o.event) && uuid(o.operationId) && (o.actorStaffId === null || uuid(o.actorStaffId)) && (o.subjectStaffId === null || uuid(o.subjectStaffId)) && reason(o.reason); }
/** Fixed field order is also the ACK hash contract for the exact submitted bytes. */
function independentMetadata(value: unknown): StaffIndependentAlertMetadata {
    if (!metadata(value))
        throw new StaffAlertError('PAYLOAD_INVALID');
    return Object.freeze({
        schema: 'staff-security-metadata-v1', event: value.event, operationId: value.operationId,
        actorStaffId: value.actorStaffId, subjectStaffId: value.subjectStaffId,
        reason: Object.freeze({ code: value.reason.code, ...(value.reason.ticketRef === undefined ? {} : { ticketRef: value.reason.ticketRef }) })
    });
}
function independentMetadataBytes(value: unknown): string {
    const bytes = JSON.stringify(independentMetadata(value));
    if (Buffer.byteLength(bytes) > 4096)
        throw new StaffAlertError('PAYLOAD_INVALID');
    return bytes;
}
function validEnvelope(value: unknown): value is CryptoEnvelope { const o = object(value); return o !== null && exact(o, ['v', 'keyId', 'nonce', 'ct', 'tag']) && o.v === 1 && typeof o.keyId === 'string' && o.keyId.length >= 1 && o.keyId.length <= 160 && typeof o.nonce === 'string' && /^[A-Za-z0-9+/]{16}$/.test(o.nonce) && typeof o.tag === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(o.tag) && typeof o.ct === 'string' && o.ct.length <= 8192 && /^[A-Za-z0-9+/]+={0,2}$/.test(o.ct); }
function aad(purpose: StaffAlertPurpose, operationId: string, keyRef: string): AeadAad { return ['staff', `alert_outbox.${purpose}`, operationId, 'run:none', keyRef, `${purpose === 'TARGET_INVITATION' ? 'staff-invitation' : 'staff-alert'}:${keyRef}:v1`, '1']; }
export type StaffMutationAlertMetadata = Readonly<{
    operationId: string;
    event: StaffAlertIntent['event'];
    keyUserId: string;
    actorStaffId: string | null;
    subjectStaffId: string | null;
    reason: Readonly<{
        code: string;
        ticketRef?: string;
    }>;
}>;
export interface StaffOperationReadiness {
    require(operationId: string): Promise<void>;
}
/** Inputs belong to resolved server commands, never the request body or recipient/key overrides. */
export class StaffAlertIntentProducer {
    constructor(private readonly dependencies: Readonly<{
        keys: Pick<ReadableUserDekStore, 'load'>;
        mappings: StaffAlertKeyMappings;
        readiness?: StaffOperationReadiness;
    }>) { }
    private async seal(userId: string, plain: unknown, binding: (mapping: StaffAlertKeyMapping) => AeadAad): Promise<CryptoEnvelope> {
        const mapping = await this.dependencies.mappings.resolveUser(userId);
        if (mapping === null || mapping.userId !== userId || !uuid(mapping.keyRef))
            throw new StaffAlertError('STAFF_ALERT_KEY_UNAVAILABLE');
        let key: Buffer | undefined;
        const bytes = Buffer.from(JSON.stringify(plain));
        try {
            if (bytes.length > 4096)
                throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
            key = await this.dependencies.keys.load(mapping.userId);
            return encrypt(key, bytes, binding(mapping));
        }
        catch (error) {
            if (error instanceof StaffAlertError)
                throw error;
            throw new StaffAlertError('STAFF_ALERT_KEY_UNAVAILABLE');
        }
        finally {
            key?.fill(0);
            bytes.fill(0);
        }
    }
    async mutation(input: StaffMutationAlertMetadata): Promise<StaffAlertIntent> {
        if (!exact(input, ['operationId', 'event', 'keyUserId', 'actorStaffId', 'subjectStaffId', 'reason']) || !uuid(input.keyUserId))
            throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
        const plain = { schema: 'staff-security-metadata-v1', event: input.event, operationId: input.operationId, actorStaffId: input.actorStaffId, subjectStaffId: input.subjectStaffId, reason: input.reason };
        if (!metadata(plain))
            throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
        if (input.event !== 'DISABLE') {
            if (!this.dependencies.readiness)
                throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
            await this.dependencies.readiness.require(input.operationId);
        }
        return Object.freeze({ schema: 'staff-alert-v1', event: input.event, operationId: input.operationId, envelope: await this.seal(input.keyUserId, plain, m => aad('INDEPENDENT_METADATA_ALERT', input.operationId, m.keyRef)) });
    }
    async invitation(input: Readonly<{
        operationId: string;
        targetUserId: string;
        invitationHandle: string;
    }>): Promise<StaffInvitationDeliveryIntent> {
        if (!exact(input, ['operationId', 'targetUserId', 'invitationHandle']) || !uuid(input.operationId) || !uuid(input.targetUserId) || typeof input.invitationHandle !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.invitationHandle))
            throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
        const plain = { schema: 'staff-target-invitation-v1', operationId: input.operationId, invitationHandle: input.invitationHandle };
        return Object.freeze({ schema: 'staff-invitation-delivery-v1', operationId: input.operationId, envelope: await this.seal(input.targetUserId, plain, m => aad('TARGET_INVITATION', input.operationId, m.keyRef)) });
    }
    /** Task7 receives hash + protected intent. No issuer response can expose the invitation bearer. */
    async newInvitation(input: Readonly<{
        operationId: string;
        targetUserId: string;
    }>): Promise<Readonly<{
        invitationTokenHash: string;
        deliveryIntent: StaffInvitationDeliveryIntent;
    }>> {
        if (!exact(input, ['operationId', 'targetUserId']))
            throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
        const bytes = randomBytes(32);
        try {
            const handle = bytes.toString('base64url');
            return Object.freeze({ invitationTokenHash: `sha256:${sha(handle)}`, deliveryIntent: await this.invitation({ ...input, invitationHandle: handle }) });
        }
        finally {
            bytes.fill(0);
        }
    }
    /** Exact committed Task3 factory: persisted operation, service factor, verified credential. */
    readonly enrollment = async (binding: StaffEnrollmentIntentBinding): Promise<StaffEnrollmentIntent> => {
        if (!exact(binding, ['userId', 'ordinarySessionId', 'operationId', 'factorId', 'credentialId']) || ![binding.userId, binding.ordinarySessionId, binding.operationId, binding.factorId].every(uuid) || typeof binding.credentialId !== 'string' || !/^[A-Za-z0-9_-]{1,1366}$/.test(binding.credentialId))
            throw new StaffAlertError('STAFF_ALERT_METADATA_INVALID');
        const alertIntent = await this.mutation({ operationId: binding.operationId, event: 'KEY_CHANGE', keyUserId: binding.userId, actorStaffId: null, subjectStaffId: null, reason: { code: 'KEY_MAINTENANCE' } });
        const deviceLabelEnvelope = await this.seal(binding.userId, { schema: 'staff-passkey-label-v1', factorId: binding.factorId, credentialId: binding.credentialId, label: 'Security key' }, m => ['staff', 'mfa_factor.device_label_ciphertext', binding.factorId, binding.operationId, m.keyRef, `passkey-label:${binding.factorId}:v1`, '1']);
        return Object.freeze({ operationId: binding.operationId, factorId: binding.factorId, deviceLabelEnvelope, alertIntent });
    };
}
export type RootStaffAlertConfig = Readonly<{
    schema: 'staff-independent-alert-config-v1';
    generation: string;
    executable: string;
    from: string;
    recipient: string;
    ackAdapterId: string;
}>;
export type StaffAlertAcknowledgementEvidence = StaffAlertReadinessBinding & Readonly<{
    rehearsalId: string;
    expiresAt: Date;
}>;
/** Root-configured evidence route, implemented/rehearsed independently before production activation. */
export interface StaffAlertAcknowledgementAdapter {
    evidence(config: RootStaffAlertConfig): Promise<StaffAlertAcknowledgementEvidence | null>;
    acknowledge(input: Readonly<{
        deliveryId: string;
        messageSha256: string;
    }>): Promise<'ACK' | null>;
}
export type StaffAlertFileStat = Readonly<{
    uid: number;
    mode: number;
    size: number;
    dev: number;
    ino: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
}>;
export interface StaffAlertConfigFiles {
    lstat(path: string): Promise<StaffAlertFileStat>;
    realpath(path: string): Promise<string>;
    open(path: string, flags: number): Promise<{
        stat(): Promise<StaffAlertFileStat>;
        readFile(): Promise<Buffer>;
        close(): Promise<void>;
    }>;
}
const productionFiles: StaffAlertConfigFiles = { lstat, realpath, open: async (path, flags) => {
        const file = await open(path, flags);
        return { stat: () => file.stat(), close: () => file.close(), readFile: async () => {
                // Read at most one byte beyond the bound, even if root changes the file
                // between fstat and read. A configuration file is never an unbounded read.
                const buffer = Buffer.alloc(4097);
                const result = await file.read(buffer, 0, buffer.length, 0);
                return buffer.subarray(0, result.bytesRead);
            } };
    } };
export type ProtectedStaffAlertConfiguration = Readonly<{
    config: RootStaffAlertConfig;
    binding: StaffAlertReadinessBinding;
    evidence: StaffAlertAcknowledgementEvidence;
    acknowledgement: StaffAlertAcknowledgementAdapter;
}>;
export class RootStaffAlertConfiguration {
    private readonly files: StaffAlertConfigFiles;
    constructor(private readonly input: Readonly<{
        path: string;
        acknowledgements: ReadonlyMap<string, StaffAlertAcknowledgementAdapter>;
        files?: StaffAlertConfigFiles;
        timeoutMs?: number;
    }>) { this.files = input.files ?? productionFiles; if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 5000))
        throw new StaffAlertError('TIMEOUT'); }
    private async custody(path: string): Promise<StaffAlertFileStat> {
        if (!isAbsolute(path) || normalize(path) !== path)
            throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
        let parent = dirname(path);
        for (;;) {
            const stat = await this.files.lstat(parent);
            if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || await this.files.realpath(parent) !== parent)
                throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
            const next = dirname(parent);
            if (next === parent)
                break;
            parent = next;
        }
        const stat = await this.files.lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || await this.files.realpath(path) !== path)
            throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
        return stat;
    }
    async read(): Promise<ProtectedStaffAlertConfiguration | null> { return this.bounded(this.readProtected()); }
    /** Startup custody only: root-owned file and executable, exact schema and an installed ACK route.
     * A fresh ACK proof is NOT required here; every staff action still requires one through read(). */
    async verifyCustody(): Promise<boolean> { return await this.bounded(this.readCustodied()) !== null; }
    private async bounded<T>(work: Promise<T | null>): Promise<T | null> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([work, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), this.input.timeoutMs ?? 5000); })]);
        }
        finally {
            clearTimeout(timer);
        }
    }
    private async readCustodied(): Promise<Readonly<{ config: RootStaffAlertConfig; hash: string; acknowledgement: StaffAlertAcknowledgementAdapter }> | null> {
        let file: Awaited<ReturnType<StaffAlertConfigFiles['open']>> | undefined;
        try {
            const before = await this.custody(this.input.path);
            if (before.size < 2 || before.size > 4096)
                return null;
            file = await this.files.open(this.input.path, constants.O_RDONLY | constants.O_NOFOLLOW);
            const stat = await file.stat();
            if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > 4096)
                return null;
            const body = await file.readFile();
            if (body.length > 4096)
                return null;
            const value: unknown = JSON.parse(body.toString());
            if (!exact(value, ['schema', 'generation', 'executable', 'from', 'recipient', 'ackAdapterId']) || value.schema !== 'staff-independent-alert-config-v1' || !uuid(value.generation) || typeof value.executable !== 'string' || typeof value.from !== 'string' || !EMAIL.test(value.from) || typeof value.recipient !== 'string' || !EMAIL.test(value.recipient) || typeof value.ackAdapterId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.ackAdapterId))
                return null;
            const config = value as RootStaffAlertConfig;
            const executable = await this.custody(config.executable);
            if ((executable.mode & 0o111) === 0)
                return null;
            const acknowledgement = this.input.acknowledgements.get(config.ackAdapterId);
            if (!acknowledgement)
                return null;
            return { config, hash: sha(body), acknowledgement };
        }
        catch {
            return null;
        }
        finally {
            await file?.close().catch(() => undefined);
        }
    }
    private async readProtected(): Promise<ProtectedStaffAlertConfiguration | null> {
        try {
            const custodied = await this.readCustodied();
            if (custodied === null)
                return null;
            const { config, hash, acknowledgement } = custodied;
            const evidence = await acknowledgement.evidence(config);
            const now = Date.now();
            if (!evidence || evidence.configSha256 !== hash || evidence.generation !== config.generation || !uuid(evidence.rehearsalId) || !(evidence.expiresAt instanceof Date) || evidence.expiresAt.getTime() <= now || evidence.expiresAt.getTime() > now + 300000)
                return null;
            return Object.freeze({ config: Object.freeze({ ...config }), binding: Object.freeze({ configSha256: hash, generation: config.generation }), evidence, acknowledgement });
        }
        catch {
            return null;
        }
    }
    async readIndependentAlertReadiness(): Promise<'READY' | 'UNAVAILABLE'> { return await this.read() === null ? 'UNAVAILABLE' : 'READY'; }
}
/** Task6 root/JIT producer: publication can come only from current protected bytes and ACK evidence. */
export async function publishStaffIndependentAlertReadiness(configuration: RootStaffAlertConfiguration, publisher: StaffIndependentReadinessPublisher): Promise<void> {
    const trusted = await configuration.read();
    if (trusted === null)
        throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
    if (!await publisher.publish({ ...trusted.binding, ackAdapterId: trusted.config.ackAdapterId, rehearsalId: trusted.evidence.rehearsalId, evidenceExpiresAt: trusted.evidence.expiresAt }))
        throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE');
}
/** File + ACK evidence AND a matching unexpired independent publication are both required. */
export class StaffIndependentAlertReadiness implements StaffOperationReadiness {
    constructor(private readonly configuration: RootStaffAlertConfiguration, private readonly repository: Pick<StaffAlertRepository, 'readIndependentAlertReadiness' | 'authorizeOperation'>) { }
    async readIndependentAlertReadiness(): Promise<'READY' | 'UNAVAILABLE'> { try {
        const protectedConfig = await this.configuration.read();
        return protectedConfig === null ? 'UNAVAILABLE' : await this.repository.readIndependentAlertReadiness(protectedConfig.binding);
    }
    catch {
        return 'UNAVAILABLE';
    } }
    async require(operationId: string): Promise<void> { try {
        const protectedConfig = await this.configuration.read();
        if (protectedConfig !== null && await this.repository.authorizeOperation(operationId, protectedConfig.binding))
            return;
    }
    catch { } throw new StaffAlertError('STAFF_ALERT_UNAVAILABLE'); }
}
export interface StaffAlertTransport {
    send(eventId: string, message: StaffIndependentAlertMetadata, signal?: AbortSignal): Promise<'ACK'>;
}
/** Sender addresses/executable belong only to the protected root configuration. */
export class BoundedStaffSendmailSubmission {
    private readonly timeoutMs: number;
    constructor(private readonly input: Readonly<{
        executable: string;
        from: string;
        recipient: string;
        timeoutMs?: number;
    }>) {
        if (!isAbsolute(input.executable) || normalize(input.executable) !== input.executable || !EMAIL.test(input.from) || !EMAIL.test(input.recipient) || Object.keys(input).some(k => !['executable', 'from', 'recipient', 'timeoutMs'].includes(k)))
            throw new StaffAlertError('DESTINATION_REJECTED');
        this.timeoutMs = input.timeoutMs ?? 5000;
        if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 5000)
            throw new StaffAlertError('TIMEOUT');
    }
    async submit(deliveryId: string, message: StaffIndependentAlertMetadata, signal?: AbortSignal): Promise<'SUBMITTED'> {
        if (signal?.aborted)
            throw new StaffAlertError('TIMEOUT');
        const identity = deliveryId.split(':');
        if (identity.length !== 2 || !uuid(identity[0]) || identity[1] !== 'INDEPENDENT_METADATA_ALERT')
            throw new StaffAlertError('PAYLOAD_INVALID');
        const metadataBytes = independentMetadataBytes(message);
        const body = `From: ${this.input.from}\r\nTo: ${this.input.recipient}\r\nSubject: Staff security event\r\nX-Staff-Delivery-Id: ${deliveryId}\r\nContent-Type: application/json\r\n\r\n{"deliveryId":${JSON.stringify(deliveryId)},"metadata":${metadataBytes}}\r\n`;
        if (Buffer.byteLength(body) > 16384)
            throw new StaffAlertError('PAYLOAD_INVALID');
        return new Promise((resolve, reject) => {
            // No shell, ambient/provider/mail environment, output collection or address in argv.
            const child = spawn(this.input.executable, ['-t', '-i'], { shell: false, stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
            let timedOut = false;
            const abort = () => { timedOut = true; child.kill('SIGKILL'); };
            const timer = setTimeout(abort, this.timeoutMs);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted)
                abort();
            const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
            child.stdin.on('error', () => { });
            child.once('error', () => { cleanup(); reject(new StaffAlertError('TRANSPORT_UNAVAILABLE')); });
            child.once('close', code => { cleanup(); if (timedOut)
                reject(new StaffAlertError('TIMEOUT'));
            else if (code !== 0)
                reject(new StaffAlertError('TRANSPORT_UNAVAILABLE'));
            else
                resolve('SUBMITTED'); });
            child.stdin.end(body);
        });
    }
}
export class AcknowledgedStaffAlertTransport implements StaffAlertTransport {
    constructor(private readonly submission: BoundedStaffSendmailSubmission, private readonly acknowledgement: StaffAlertAcknowledgementAdapter) { }
    async send(deliveryId: string, message: StaffIndependentAlertMetadata, signal?: AbortSignal): Promise<'ACK'> { const safe = independentMetadata(message), metadataBytes = independentMetadataBytes(safe); await this.submission.submit(deliveryId, safe, signal); if (signal?.aborted)
        throw new StaffAlertError('TIMEOUT'); const ack = await this.acknowledgement.acknowledge({ deliveryId, messageSha256: sha(metadataBytes) }); if (signal?.aborted)
        throw new StaffAlertError('TIMEOUT'); if (ack !== 'ACK')
        throw new StaffAlertError('ACK_UNAVAILABLE'); return 'ACK'; }
}
/** Root configuration is revalidated on each independent delivery, not copied from caller JSON. */
export class RootConfiguredStaffAlertTransport implements StaffAlertTransport {
    constructor(private readonly configuration: RootStaffAlertConfiguration) { }
    async send(deliveryId: string, message: StaffIndependentAlertMetadata, signal?: AbortSignal): Promise<'ACK'> { if (signal?.aborted)
        throw new StaffAlertError('TIMEOUT'); const trusted = await this.configuration.read(); if (signal?.aborted)
        throw new StaffAlertError('TIMEOUT'); if (trusted === null)
        throw new StaffAlertError('TRANSPORT_UNAVAILABLE'); return new AcknowledgedStaffAlertTransport(new BoundedStaffSendmailSubmission({ executable: trusted.config.executable, from: trusted.config.from, recipient: trusted.config.recipient }), trusted.acknowledgement).send(deliveryId, message, signal); }
}
export type StaffTargetInvitationMessage = Readonly<{
    targetUserId: string;
    operationId: string;
    invitationHandle: string;
}>;
/** Task7 adapter resolves ONLY this verified existing account's channel. No uploaded recipient. */
export interface StaffTargetInvitationTransport {
    send(deliveryId: string, message: StaffTargetInvitationMessage, signal?: AbortSignal, claim?: StaffTargetInvitationChannelInput): Promise<'ACK'>;
}
/** Only an explicitly installed acknowledged delivery adapter receives the verified address. */
export interface StaffInvitationChannelDelivery {
    send(mail: Readonly<{
        deliveryId: string;
        recipient: string;
        invitationUrl: string;
    }>, signal?: AbortSignal): Promise<'ACK'>;
}
export class VerifiedStaffTargetInvitationTransport implements StaffTargetInvitationTransport {
    private readonly publicOrigin: string;
    constructor(private readonly dependencies: Readonly<{
        publicAppUrl: string;
        channels: StaffTargetInvitationChannels;
        keys: Pick<ReadableUserDekStore, 'load'>;
        delivery: StaffInvitationChannelDelivery;
    }>) {
        const url = new URL(dependencies.publicAppUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
            throw new StaffAlertError('DESTINATION_REJECTED');
        this.publicOrigin = url.origin;
    }
    async send(deliveryId: string, message: StaffTargetInvitationMessage, signal?: AbortSignal, claim?: StaffTargetInvitationChannelInput): Promise<'ACK'> {
        const active = () => { if (signal?.aborted)
            throw new StaffAlertError('TIMEOUT'); };
        active();
        if (!exact(message, ['targetUserId', 'operationId', 'invitationHandle']) || !uuid(message.targetUserId) || !uuid(message.operationId)
            || !/^[A-Za-z0-9_-]{43}$/.test(message.invitationHandle) || !claim
            || !exact(claim, ['outboxId', 'claimToken', 'eventId', 'operationId', 'targetUserId'])
            || !Object.values(claim).every(uuid) || claim.targetUserId !== message.targetUserId || claim.operationId !== message.operationId
            || deliveryId !== `${claim.eventId}:TARGET_INVITATION`)
            throw new StaffAlertError('DESTINATION_REJECTED');
        const channel = await this.dependencies.channels.readTargetInvitationChannel(claim);
        active();
        if (channel === null || !uuid(channel.channelId))
            throw new StaffAlertError('DESTINATION_REJECTED');
        let key: Buffer | undefined, plain: Buffer | undefined;
        try {
            key = await this.dependencies.keys.load(message.targetUserId);
            active();
            try {
                plain = decrypt(key, channel.addressCiphertext, ['identity', 'user.email_ciphertext', message.targetUserId, 'run:none', message.targetUserId, `user-dek:${message.targetUserId}`, '1']);
            }
            catch {
                throw new StaffAlertError('PAYLOAD_INVALID');
            }
            if (plain.length > 254)
                throw new StaffAlertError('DESTINATION_REJECTED');
            const recipient = plain.toString('utf8');
            if (!EMAIL.test(recipient))
                throw new StaffAlertError('DESTINATION_REJECTED');
            const current = await this.dependencies.channels.readTargetInvitationChannel(claim);
            active();
            if (current === null || current.channelId !== channel.channelId
                || JSON.stringify(current.addressCiphertext) !== JSON.stringify(channel.addressCiphertext))
                throw new StaffAlertError('DESTINATION_REJECTED');
            const invitation = new URL('/admin/invitation', this.publicOrigin);
            invitation.hash = message.invitationHandle;
            active();
            const result = await this.dependencies.delivery.send({ deliveryId, recipient, invitationUrl: invitation.href }, signal);
            active();
            if (result !== 'ACK')
                throw new StaffAlertError('ACK_UNAVAILABLE');
            return 'ACK';
        }
        finally {
            key?.fill(0);
            plain?.fill(0);
        }
    }
}
function failure(error: unknown): StaffAlertFailureCode {
    return error instanceof StaffAlertError && ['TIMEOUT', 'DESTINATION_REJECTED', 'ACK_UNAVAILABLE', 'PAYLOAD_INVALID', 'KEY_UNAVAILABLE'].includes(error.code)
        ? error.code as StaffAlertFailureCode : 'TRANSPORT_UNAVAILABLE';
}
export class StaffAlertDispatcher {
    private draining = false;
    private stopped = false;
    /** True while queued alerts wait for fresh readiness; the waiting line is logged once per lock. */
    private waiting = false;
    private readonly activeDeliveries = new Set<AbortController>();
    stop(): void { this.stopped = true; for (const controller of this.activeDeliveries) controller.abort(); }
    constructor(private readonly dependencies: Readonly<{
        repository: StaffAlertRepository;
        keys: Pick<ReadableUserDekStore, 'load'>;
        independentTransport: StaffAlertTransport;
        targetInvitationTransport?: StaffTargetInvitationTransport;
        readiness: () => Promise<'READY' | 'UNAVAILABLE'>;
        log?: (code: StaffAlertFailureCode | 'SEVERED') => void;
        /** One secret-free JSON line when queued alerts start waiting for readiness. */
        logEvent?: (line: string) => void;
        timeoutMs?: number;
    }>) {
        if (dependencies.timeoutMs !== undefined && (!Number.isInteger(dependencies.timeoutMs) || dependencies.timeoutMs < 1 || dependencies.timeoutMs > 5000))
            throw new StaffAlertError('TIMEOUT');
    }
    private async bounded(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
        if (this.stopped) throw new StaffAlertError('TIMEOUT');
        const controller = new AbortController();
        this.activeDeliveries.add(controller);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let rejectAbort: (error: StaffAlertError) => void = () => {};
        const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
        const abort = () => rejectAbort(new StaffAlertError('TIMEOUT'));
        controller.signal.addEventListener('abort', abort, {once:true});
        try {
            await Promise.race([
                aborted,
                Promise.resolve().then(() => action(controller.signal)),
                new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new StaffAlertError('TIMEOUT')); }, this.dependencies.timeoutMs ?? 5000); })
            ]);
        }
        finally {
            clearTimeout(timer);
            this.activeDeliveries.delete(controller);
            controller.signal.removeEventListener('abort', abort);
            controller.abort();
        }
    }
    /** Pre-claim gate. claim_alert_delivery spends one of a row's three attempts on every claim, so
     * while readiness is stale (or unreadable) nothing is claimed: queued alerts, DISABLE included,
     * keep their attempts and go out on the first drain after the operator unlocks. */
    private async readyToClaim(): Promise<boolean> {
        let ready = false;
        try {
            await this.bounded(async () => { ready = await this.dependencies.readiness() === 'READY'; });
        }
        catch {
            ready = false;
        }
        if (ready) {
            this.waiting = false;
            return true;
        }
        if (!this.stopped && !this.waiting) {
            this.waiting = true;
            this.dependencies.logEvent?.(JSON.stringify({ event: 'api.staff.alerts_waiting', reason: 'READINESS_STALE' }));
        }
        return false;
    }
    private async deliver(claim: StaffAlertClaim, signal: AbortSignal): Promise<void> {
        let key: Buffer | undefined;
        let plaintext: Buffer | undefined;
        const active = () => { if (signal.aborted)
            throw new StaffAlertError('TIMEOUT'); };
        try {
            active();
            if (!uuid(claim.outboxId) || !uuid(claim.eventId) || !uuid(claim.operationId) || !uuid(claim.keyRef) || !uuid(claim.claimToken) || !EVENTS.has(claim.event) || !['INDEPENDENT_METADATA_ALERT', 'TARGET_INVITATION'].includes(claim.purpose) || !validEnvelope(claim.envelope))
                throw new StaffAlertError('PAYLOAD_INVALID');
            const resolved = await this.dependencies.repository.resolveClaim(claim);
            active();
            if (resolved.state === 'SEVERED')
                throw new StaffAlertError('SEVERED');
            if (resolved.state !== 'CURRENT')
                throw new StaffAlertError('TRANSPORT_UNAVAILABLE');
            const mapping = resolved.mapping;
            if (mapping.keyRef !== claim.keyRef || !uuid(mapping.userId))
                throw new StaffAlertError('PAYLOAD_INVALID');
            try {
                key = await this.dependencies.keys.load(mapping.userId);
            }
            catch {
                throw new StaffAlertError('KEY_UNAVAILABLE');
            }
            active();
            try {
                plaintext = decrypt(key, claim.envelope, aad(claim.purpose, claim.operationId, claim.keyRef));
            }
            catch {
                throw new StaffAlertError('PAYLOAD_INVALID');
            }
            if (plaintext.length > 4096)
                throw new StaffAlertError('PAYLOAD_INVALID');
            let value: unknown;
            try {
                value = JSON.parse(plaintext.toString());
            }
            catch {
                throw new StaffAlertError('PAYLOAD_INVALID');
            }
            const deliveryId = `${claim.eventId}:${claim.purpose}`;
            if (claim.purpose === 'INDEPENDENT_METADATA_ALERT') {
                if (!metadata(value) || value.event !== claim.event || value.operationId !== claim.operationId)
                    throw new StaffAlertError('PAYLOAD_INVALID');
                const safe = independentMetadata(value);
                if (await this.dependencies.readiness() !== 'READY')
                    throw new StaffAlertError('TRANSPORT_UNAVAILABLE');
                active();
                // Revalidate the persisted claim/key mapping immediately at admission. A
                // resumed timed-out readiness/key lookup cannot start a later delivery.
                const admitted = await this.dependencies.repository.resolveClaim(claim);
                active();
                if (admitted.state === 'SEVERED')
                    throw new StaffAlertError('SEVERED');
                if (admitted.state !== 'CURRENT' || admitted.mapping.userId !== mapping.userId || admitted.mapping.keyRef !== mapping.keyRef)
                    throw new StaffAlertError('TRANSPORT_UNAVAILABLE');
                if (await this.dependencies.independentTransport.send(deliveryId, safe, signal) !== 'ACK')
                    throw new StaffAlertError('ACK_UNAVAILABLE');
            }
            else {
                if (!exact(value, ['schema', 'operationId', 'invitationHandle']) || value.schema !== 'staff-target-invitation-v1' || value.operationId !== claim.operationId || typeof value.invitationHandle !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.invitationHandle))
                    throw new StaffAlertError('PAYLOAD_INVALID');
                const targetTransport = this.dependencies.targetInvitationTransport;
                if (!targetTransport)
                    throw new StaffAlertError('TRANSPORT_UNAVAILABLE');
                const admitted = await this.dependencies.repository.resolveClaim(claim);
                active();
                if (admitted.state === 'SEVERED')
                    throw new StaffAlertError('SEVERED');
                if (admitted.state !== 'CURRENT' || admitted.mapping.userId !== mapping.userId || admitted.mapping.keyRef !== mapping.keyRef)
                    throw new StaffAlertError('TRANSPORT_UNAVAILABLE');
                if (await targetTransport.send(deliveryId, { targetUserId: mapping.userId, operationId: claim.operationId, invitationHandle: value.invitationHandle }, signal, { outboxId: claim.outboxId, claimToken: claim.claimToken, eventId: claim.eventId, operationId: claim.operationId, targetUserId: mapping.userId }) !== 'ACK')
                    throw new StaffAlertError('ACK_UNAVAILABLE');
            }
            active();
        }
        finally {
            key?.fill(0);
            plaintext?.fill(0);
        }
    }
    async drain({ limit }: Readonly<{
        limit: number;
    }>): Promise<Readonly<{
        acked: number;
        pending: number;
    }>> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new StaffAlertError('STAFF_ALERT_LIMIT_INVALID');
        if (this.draining)
            throw new StaffAlertError('STAFF_ALERT_DRAIN_IN_PROGRESS');
        this.draining = true;
        let acked = 0;
        try {
            // Claim just in time; a batch of 100 five-second sends must not carry a
            // single already-expired lease by the time its last event is admitted.
            for (let count = 0; count < limit && !this.stopped; count++) {
                // Checked before EVERY claim: a lapse after one claim costs that row one attempt
                // (settled FAILED below; the SQL has no uncounted release) and stops the batch here.
                if (!await this.readyToClaim() || this.stopped)
                    break;
                const claims = await this.dependencies.repository.claim(1);
                const claim = claims[0];
                if (!claim || this.stopped)
                    break;
                try {
                    await this.bounded(signal => this.deliver(claim, signal));
                }
                catch (error) {
                    const severed = error instanceof StaffAlertError && error.code === 'SEVERED';
                    const code = severed ? 'SEVERED' : failure(error);
                    this.dependencies.log?.(code);
                    await this.dependencies.repository.settle(claim, severed ? 'SEVERED' : 'FAILED', code);
                    continue;
                }
                // A receipt failure after ACK leaves a pending lease. It is never caught
                // as transport failure; expiry records ACK_UNCERTAIN and may redeliver the
                // same stable event+purpose identity (cross-resource exactly-once is absent).
                if (await this.dependencies.repository.settle(claim, 'DELIVERED', null))
                    acked++;
            }
            const status = await this.dependencies.repository.status();
            return Object.freeze({ acked, pending: status.pending });
        }
        finally {
            this.draining = false;
        }
    }
}
