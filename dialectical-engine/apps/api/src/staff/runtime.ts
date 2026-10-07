import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize } from 'node:path';
import type { ReadableUserDekStore } from '@debateai/crypto';
import { PostgresInternalAllowanceRepository, PostgresStaffAlertRepository, PostgresStaffRepository, type Pool } from '@debateai/db';
import type { StaffAccessEnvironment } from '@debateai/kernel';
import { readStaffAccessPolicy, type BillingPlans } from '@debateai/register';
import { StaffInternalFundingReadiness } from './internal-allowances.js';
import { RootStaffAlertConfiguration, RootConfiguredStaffAlertTransport, StaffAlertDispatcher, StaffAlertIntentProducer, StaffIndependentAlertReadiness, VerifiedStaffTargetInvitationTransport, type StaffAlertAcknowledgementAdapter, type StaffAlertConfigFiles, type StaffAlertFileStat, type StaffInvitationChannelDelivery } from './alerts.js';
export type StaffAlertOperatorAdapters = Readonly<{
    schema: 'staff-alert-operator-v1';
    acknowledgements: ReadonlyMap<string, StaffAlertAcknowledgementAdapter>;
    invitationDelivery: StaffInvitationChannelDelivery;
    dispatch: Readonly<{
        batchSize: number;
        intervalMs: number;
    }>;
    close?(): Promise<void>;
}>;
const unavailable = () => new Error('STAFF_ACTIVATION_UNAVAILABLE');
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const files: StaffAlertConfigFiles = { lstat, realpath, open: async (path, flags) => {
        const fd = await open(path, flags);
        return { stat: () => fd.stat(), close: () => fd.close(), readFile: async () => { const bytes = Buffer.alloc(65537), r = await fd.read(bytes, 0, bytes.length, 0); return bytes.subarray(0, r.bytesRead); } };
    } };
async function bounded<T>(work: Promise<T>, milliseconds = 5000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(unavailable()), milliseconds); })]);
    }
    finally {
        clearTimeout(timer);
    }
}
function adapters(value: unknown): StaffAlertOperatorAdapters {
    const keys = value !== null && typeof value === 'object' && Object.hasOwn(value, 'close') ? ['schema', 'acknowledgements', 'invitationDelivery', 'dispatch', 'close'] : ['schema', 'acknowledgements', 'invitationDelivery', 'dispatch'];
    if (!exact(value, keys) || value.schema !== 'staff-alert-operator-v1' || !(value.acknowledgements instanceof Map) || value.acknowledgements.size < 1 || value.acknowledgements.size > 16
        || !exact(value.dispatch, ['batchSize', 'intervalMs']) || !Number.isInteger(value.dispatch.batchSize) || Number(value.dispatch.batchSize) < 1 || Number(value.dispatch.batchSize) > 100
        || !Number.isInteger(value.dispatch.intervalMs) || Number(value.dispatch.intervalMs) < 100 || Number(value.dispatch.intervalMs) > 60000
        || value.invitationDelivery === null || typeof value.invitationDelivery !== 'object' || typeof (value.invitationDelivery as StaffInvitationChannelDelivery).send !== 'function'
        || ('close' in value && typeof value.close !== 'function'))
        throw unavailable();
    for (const [id, ack] of value.acknowledgements)
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || ack === null || typeof ack !== 'object' || typeof ack.evidence !== 'function' || typeof ack.acknowledge !== 'function')
            throw unavailable();
    return Object.freeze({ schema: 'staff-alert-operator-v1', acknowledgements: new Map(value.acknowledgements), invitationDelivery: value.invitationDelivery as StaffInvitationChannelDelivery, dispatch: Object.freeze({ batchSize: Number(value.dispatch.batchSize), intervalMs: Number(value.dispatch.intervalMs) }), ...('close' in value ? { close: value.close as () => Promise<void> } : {}) });
}
/** The reviewed bytes execute as trusted deployment code. Absolute transitive imports are separately vetted.
 * Loading uses a data URL so a pathname replacement cannot change the already-hashed entry bytes. */
export async function loadStaffAlertOperator(input: Readonly<{
    path: string;
    sha256: string;
    files?: StaffAlertConfigFiles;
}>): Promise<StaffAlertOperatorAdapters> {
    const io = input.files ?? files;
    if (!isAbsolute(input.path) || normalize(input.path) !== input.path || !/^[0-9a-f]{64}$/.test(input.sha256))
        throw unavailable();
    const protectedStat = (stat: StaffAlertFileStat, directory: boolean) => stat.uid === 0 && !stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()) && (stat.mode & 0o022) === 0;
    let parent = dirname(input.path);
    for (;;) {
        if (!protectedStat(await io.lstat(parent), true) || await io.realpath(parent) !== parent)
            throw unavailable();
        const next = dirname(parent);
        if (next === parent)
            break;
        parent = next;
    }
    const before = await io.lstat(input.path);
    if (!protectedStat(before, false) || before.size < 1 || before.size > 65536 || await io.realpath(input.path) !== input.path)
        throw unavailable();
    const fd = await io.open(input.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer | undefined;
    try {
        const opened = await fd.stat();
        if (!protectedStat(opened, false) || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
            throw unavailable();
        bytes = await fd.readFile();
        const after = await fd.stat();
        if (!protectedStat(after, false) || bytes.length !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || createHash('sha256').update(bytes).digest('hex') !== input.sha256)
            throw unavailable();
        const module: unknown = await bounded(import('data:text/javascript;base64,' + bytes.toString('base64')));
        if (!exact(module, ['createStaffAlertOperatorAdapters']) || typeof module.createStaffAlertOperatorAdapters !== 'function')
            throw unavailable();
        let timedOut = false;
        const factory = module.createStaffAlertOperatorAdapters as () => Promise<unknown>;
        const produced = Promise.resolve().then(() => factory()).then(value => {
            const valid = adapters(value);
            if (timedOut) {
                void bounded(Promise.resolve(valid.close?.())).catch(() => { });
                throw unavailable();
            }
            return valid;
        });
        try {
            return await bounded(produced);
        }
        catch (error) {
            timedOut = true;
            throw error;
        }
    }
    finally {
        bytes?.fill(0);
        await fd.close();
    }
}
/** Startup-only activation. The web runtime consumes fresh independent publication; it cannot publish it. */
export async function createStaffRuntime(input: Readonly<{
    environment: Extract<StaffAccessEnvironment, {
        policyVersion: 2;
    }>;
    registerVersion: number;
    publicAppUrl: string;
    pool: Pool;
    keys: ReadableUserDekStore;
    operatorFiles?: StaffAlertConfigFiles;
    configurationFiles?: StaffAlertConfigFiles;
    log?: (code: string) => void;
    deploymentMode?: "hosted" | "local";
    billingPlans?: BillingPlans | null;
    providerTargets?: readonly ProviderDiscoveryTarget[];
}>) {
    const operator = await loadStaffAlertOperator({ path: input.environment.operatorModulePath, sha256: input.environment.operatorModuleSha256, ...(input.operatorFiles ? { files: input.operatorFiles } : {}) });
    try {
        await readStaffAccessPolicy(input.pool, input.registerVersion, input.environment.internalAllowancePolicy === undefined ? undefined : 1);
        const allowances = new PostgresInternalAllowanceRepository(input.pool, { registerVersion: input.registerVersion });
        const selectedFunding = await allowances.readPolicy();
        if ((input.environment.internalAllowancePolicy === undefined) !== (selectedFunding === null)) throw unavailable();
        const repository = new PostgresStaffAlertRepository(input.pool), staffRepository = new PostgresStaffRepository(input.pool);
        const configuration = new RootStaffAlertConfiguration({ path: input.environment.independentAlertConfigPath, acknowledgements: operator.acknowledgements, ...(input.configurationFiles ? { files: input.configurationFiles } : {}) });
        const readiness = new StaffIndependentAlertReadiness(configuration, repository);
        const funding = input.environment.internalAllowancePolicy === undefined ? undefined : new StaffInternalFundingReadiness(allowances, {
            expectedPolicy: input.environment.internalAllowancePolicy, deploymentMode: input.deploymentMode ?? 'local', billingPlans: input.billingPlans ?? null,
            providerTargets: input.providerTargets ?? [], independentReadiness: readiness
        });
        if (funding !== undefined) await funding.requireReady();
        const installation = await staffRepository.readOwnerRecoveryInstallation();
        if (installation === null || installation.outcome !== 'COMPLETED' || await readiness.readIndependentAlertReadiness() !== 'READY')
            throw unavailable();
        const targetInvitationTransport = new VerifiedStaffTargetInvitationTransport({ publicAppUrl: input.publicAppUrl, channels: staffRepository, keys: input.keys, delivery: operator.invitationDelivery });
        const dispatcher = new StaffAlertDispatcher({ repository, keys: input.keys, independentTransport: new RootConfiguredStaffAlertTransport(configuration), targetInvitationTransport, readiness: () => readiness.readIndependentAlertReadiness(), ...(input.log ? { log: input.log } : {}) });
        let timer: ReturnType<typeof setInterval> | undefined, running: Promise<unknown> | undefined, closed = false;
        const trigger = () => {
            if (closed || running !== undefined)
                return;
            running = dispatcher.drain({ limit: operator.dispatch.batchSize }).catch(() => { input.log?.('TRANSPORT_UNAVAILABLE'); }).finally(() => { running = undefined; });
        };
        return Object.freeze({ readiness, funding, targetInvitationTransport, intents: new StaffAlertIntentProducer({ keys: input.keys, mappings: repository, readiness }),
            start() {
                if (closed)
                    throw unavailable();
                if (timer !== undefined)
                    return;
                timer = setInterval(trigger, operator.dispatch.intervalMs);
                timer.unref();
                trigger();
            },
            async close() {
                if (closed)
                    return;
                closed = true;
                clearInterval(timer);
                dispatcher.stop();
                try {
                    if (running !== undefined)
                        await bounded(running);
                }
                finally {
                    await bounded(Promise.resolve(operator.close?.()));
                }
            }
        });
    }
    catch (error) {
        await bounded(Promise.resolve(operator.close?.())).catch(() => { });
        throw error;
    }
}
