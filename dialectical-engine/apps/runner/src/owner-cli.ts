import { pathToFileURL } from 'node:url';
import { createPool, PostgresOwnerCommandRepository, PostgresStaffIndependentReadinessPublisher } from '@debateai/db';
import type { ReadableUserDekStore } from '@debateai/crypto';
import { RootStaffAlertConfiguration, type StaffAlertAcknowledgementAdapter } from '../../api/src/staff/alerts.js';
import { bootstrapOwner, prepareOwnerCommand, recoverOwner, validateOwnerCommandInput, type OwnerCommitSelection, type OwnerPrivatePaths } from './owner-command.js';
import { createOwnerRecoveryMaterial, parseOwnerRecoveryBundle } from './owner-recovery-material.js';
import { OwnerRecoveryCustody, OwnerRecoveryError, PosixOwnerRecoveryLock, ownerDigest, ownerExact, ownerJson, ownerPrivateDescriptor } from './owner-recovery-custody.js';
import { acceptsProductionDatabaseUrlQuery } from './production-database-url.js';
export type OwnerOperatorAdapters = Readonly<{
    paths: OwnerPrivatePaths;
    alertConfigPath: string;
    acknowledgements: ReadonlyMap<string, StaffAlertAcknowledgementAdapter>;
    keys: Pick<ReadableUserDekStore, 'load'>;
    pythonPath: string;
    lockHelperPath: string;
}>;
/** Root-owned reviewed module supplies external key/ACK adapters; CLI owns custody and JIT pool. */
export async function runOwnerCli(purpose: 'BOOTSTRAP' | 'RECOVER_OWNER', args: readonly string[], environment: NodeJS.ProcessEnv): Promise<void> {
    if (args.some(x => /^(--proof|--secret|--password|--database-url|--nonce)(=|$)/.test(x)) 
        || Object.entries(environment).some(([k, v]) => v !== undefined 
        && ((/^(OWNER_|STAFF_RECOVERY_)/.test(k) 
        && /(PROOF|SECRET|PASSWORD|NONCE|MATERIAL|URL|CONNECTION)/.test(k)) 
        || /^(postgres|postgresql):\/\//i.test(v))))
        throw new OwnerRecoveryError('OWNER_SECRET_INPUT_REFUSED');
    const permitted = new Set(['--phase', '--input-file', '--operator-module', '--operator-sha256', '--proof-fd', '--jit-fd']);
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i], value = args[i + 1];
        if (flag === undefined 
            || value === undefined 
            || !permitted.has(flag) 
            || options.has(flag))
            throw new OwnerRecoveryError('OWNER_OPERATOR_INPUTS_REQUIRED');
        options.set(flag, value);
    }
    const phase = options.get('--phase'), modulePath = options.get('--operator-module'), moduleHash = options.get('--operator-sha256'), inputPath = options.get('--input-file'), jitFd = Number(options.get('--jit-fd')), proofFd = Number(options.get('--proof-fd'));
    if (!['material', 'prepare', 'commit'].includes(phase ?? '') 
        || !modulePath 
        || !moduleHash 
        || !/^[0-9a-f]{64}$/.test(moduleHash) 
        || !inputPath 
        || !Number.isInteger(jitFd) 
        || jitFd < 3 
        || (phase !== 'material' 
        && (!options.has('--proof-fd') 
        || !Number.isInteger(proofFd) 
        || proofFd === jitFd 
        || proofFd === 1 
        || proofFd === 2 
        || proofFd < 0)))
        throw new OwnerRecoveryError('OWNER_OPERATOR_INPUTS_REQUIRED');
    const custody = new OwnerRecoveryCustody(), moduleBytes = await custody.read(modulePath, 32768, false);
    try {
        if (ownerDigest(moduleBytes) !== moduleHash)
            throw new OwnerRecoveryError('OWNER_OPERATOR_ADAPTERS_INVALID');
    }
    finally {
        moduleBytes.fill(0);
    }
    const loaded: unknown = await import(pathToFileURL(modulePath).href);
    if (loaded === null 
        || typeof loaded !== 'object' 
        || !('createOwnerOperatorAdapters' in loaded) 
        || typeof loaded.createOwnerOperatorAdapters !== 'function')
        throw new OwnerRecoveryError('OWNER_OPERATOR_ADAPTERS_INVALID');
    const adapters: unknown = await loaded.createOwnerOperatorAdapters();
    if (!ownerExact(adapters, ['paths', 'alertConfigPath', 'acknowledgements', 'keys', 'pythonPath', 'lockHelperPath']) 
        || !ownerExact(adapters.paths, ['materialFile', 'verifierFile', 'nonceFile', 'journalFile', 'nextMaterialFile', 'nextVerifierFile', 'lockFile']) 
        || !Object.values(adapters.paths).every(x => typeof x === 'string') 
        || typeof adapters.alertConfigPath !== 'string' 
        || !(adapters.acknowledgements instanceof Map) 
        || adapters.keys === null 
        || typeof adapters.keys !== 'object' 
        || !('load' in adapters.keys) 
        || typeof adapters.keys.load !== 'function' 
        || typeof adapters.pythonPath !== 'string' 
        || typeof adapters.lockHelperPath !== 'string')
        throw new OwnerRecoveryError('OWNER_OPERATOR_ADAPTERS_INVALID');
    const operator = adapters as OwnerOperatorAdapters, lock = new PosixOwnerRecoveryLock(custody, {
        pythonPath: operator.pythonPath, 
        helperPath: operator.lockHelperPath
    });
    const credentialBytes = await ownerPrivateDescriptor(jitFd, 8192);
    let databaseUrl: string;
    try {
        const credentials = ownerJson(credentialBytes);
        if (!ownerExact(credentials, ['databaseUrl']) 
            || typeof credentials.databaseUrl !== 'string')
            throw new OwnerRecoveryError('OWNER_JIT_CREDENTIAL_INVALID');
        const parsed = new URL(credentials.databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(parsed.protocol) 
            || decodeURIComponent(parsed.username) !== 'debateai_prod_staff_recovery' 
            || parsed.password.length === 0 
            || !acceptsProductionDatabaseUrlQuery(parsed))
            throw new OwnerRecoveryError('OWNER_JIT_CREDENTIAL_INVALID');
        databaseUrl = credentials.databaseUrl;
    }
    finally {
        credentialBytes.fill(0);
    }
    const pool = createPool(databaseUrl), repository = new PostgresOwnerCommandRepository(pool), publisher = new PostgresStaffIndependentReadinessPublisher(pool);
    let proof: Buffer | undefined;
    try {
        const bytes = await custody.read(inputPath);
        let input: unknown;
        try {
            input = ownerJson(bytes);
        }
        finally {
            bytes.fill(0);
        }
        if (phase === 'material') {
            if (!ownerExact(input, []))
                throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
            const material = await createOwnerRecoveryMaterial({
                ...operator.paths, 
                custody, 
                lock
            });
            const bytes = await custody.read(operator.paths.materialFile);
            try {
                const bundle = parseOwnerRecoveryBundle(ownerJson(bytes));
                const receipt = await repository.install({
                    generation: bundle.generation, 
                    verifier: material.verifier, 
                    operationId: material.receiptId
                });
                process.stdout.write(JSON.stringify(receipt) + '\n');
            }
            finally {
                bytes.fill(0);
            }
            return;
        }
        proof = await ownerPrivateDescriptor(proofFd, 32);
        if (proof.length !== 32)
            throw new OwnerRecoveryError('OWNER_RECOVERY_PROOF_INVALID');
        const privateInput = {
            repository, 
            publisher, 
            custody, 
            lock, 
            paths: operator.paths, 
            proof, 
            configuration: new RootStaffAlertConfiguration({
                path: operator.alertConfigPath, 
                acknowledgements: operator.acknowledgements
            }), 
            keys: operator.keys
        };
        if (phase === 'prepare') {
            validateOwnerCommandInput(input);
            if (input.purpose !== purpose)
                throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
            const handle = await prepareOwnerCommand(input, privateInput);
            process.stdout.write(JSON.stringify(handle) + '\n');
        }
        else {
            const receipt = await (purpose === 'BOOTSTRAP' ? bootstrapOwner : recoverOwner)(input as OwnerCommitSelection, privateInput);
            process.stdout.write(JSON.stringify(receipt) + '\n');
        }
    }
    finally {
        proof?.fill(0);
        await pool.end();
    }
}
export async function ownerCliMain(purpose: 'BOOTSTRAP' | 'RECOVER_OWNER'): Promise<void> {
    try {
        await runOwnerCli(purpose, process.argv.slice(2), process.env);
    }
    catch (error) {
        process.stderr.write((error instanceof OwnerRecoveryError ? error.code : 'OWNER_COMMAND_REFUSED') + '\n');
        process.exitCode = 1;
    }
}
