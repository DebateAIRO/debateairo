import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, normalize } from 'node:path';
export class OwnerRecoveryError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = 'OwnerRecoveryError';
    }
}
export const ownerDigest = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
export type OwnerFileStat = Readonly<{
    uid: number;
    mode: number;
    size: number;
    dev: number;
    ino: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
}>;
export interface OwnerFileHandle {
    readonly fd: number;
    stat(): Promise<OwnerFileStat>;
    read(buffer: Buffer, offset: number, length: number, position: number): Promise<{
        bytesRead: number;
    }>;
    writeFile(bytes: Buffer): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
}
export interface OwnerRecoveryFiles {
    lstat(path: string): Promise<OwnerFileStat>;
    realpath(path: string): Promise<string>;
    open(path: string, flags: number, mode?: number): Promise<OwnerFileHandle>;
    rename(from: string, to: string): Promise<void>;
    unlink(path: string): Promise<void>;
}
const productionFiles: OwnerRecoveryFiles = {
    lstat, 
    realpath, 
    open: async (path, flags, mode) => open(path, flags, mode), 
    rename, 
    unlink
};
const missing = (error: unknown) => error !== null 
    && typeof error === 'object' 
    && 'code' in error 
    && error.code === 'ENOENT';
const identity = (a: OwnerFileStat, b: OwnerFileStat) => a.dev === b.dev 
    && a.ino === b.ino;
/** Synthetic tests may inject an owned filesystem view. The production view always validates UID0. */
export class OwnerRecoveryCustody {
    constructor(private readonly files: OwnerRecoveryFiles = productionFiles) {
    }
    path(path: string): void {
        if (!isAbsolute(path) 
            || normalize(path) !== path 
            || path.includes('\0'))
            throw new OwnerRecoveryError('OWNER_PRIVATE_PATH_INVALID');
    }
    async parents(path: string): Promise<void> {
        this.path(path);
        let parent = dirname(path);
        for (;;) {
            const stat = await this.files.lstat(parent);
            if (!stat.isDirectory() 
                || stat.isSymbolicLink() 
                || stat.uid !== 0 
                || (stat.mode & 0o022) !== 0 
                || await this.files.realpath(parent) !== parent)
                throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
            const next = dirname(parent);
            if (next === parent)
                break;
            parent = next;
        }
    }
    private async checked(path: string, privateMode: boolean): Promise<OwnerFileStat> {
        await this.parents(path);
        const stat = await this.files.lstat(path);
        if (!stat.isFile() 
            || stat.isSymbolicLink() 
            || stat.uid !== 0 
            || (privateMode ? (stat.mode & 0o777) !== 0o600 : (stat.mode & 0o022) !== 0) 
            || await this.files.realpath(path) !== path)
            throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
        return stat;
    }
    async exists(path: string): Promise<boolean> {
        try {
            await this.checked(path, true);
            return true;
        }
        catch (error) {
            if (missing(error))
                return false;
            throw error;
        }
    }
    async read(path: string, bound = 8192, privateMode = true): Promise<Buffer> {
        const before = await this.checked(path, privateMode);
        if (before.size > bound)
            throw new OwnerRecoveryError('OWNER_PRIVATE_FILE_INVALID');
        const file = await this.files.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const stat = await file.stat();
            if (!stat.isFile() 
                || stat.uid !== 0 
                || !identity(before, stat) 
                || (privateMode ? (stat.mode & 0o777) !== 0o600 : (stat.mode & 0o022) !== 0) 
                || stat.size > bound)
                throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
            const bytes = Buffer.alloc(bound + 1), result = await file.read(bytes, 0, bytes.length, 0);
            if (result.bytesRead > bound)
                throw new OwnerRecoveryError('OWNER_PRIVATE_FILE_INVALID');
            return bytes.subarray(0, result.bytesRead);
        }
        finally {
            await file.close();
        }
    }
    async syncDirectory(path: string): Promise<void> {
        await this.parents(path);
        const parent = dirname(path), before = await this.files.lstat(parent), file = await this.files.open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try {
            const stat = await file.stat();
            if (!stat.isDirectory() 
                || stat.uid !== 0 
                || (stat.mode & 0o022) !== 0 
                || !identity(before, stat))
                throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
            await file.sync();
        }
        finally {
            await file.close();
        }
    }
    async syncFile(path: string): Promise<void> {
        const before = await this.checked(path, true), file = await this.files.open(path, constants.O_RDWR | constants.O_NOFOLLOW);
        try {
            const stat = await file.stat();
            if (!identity(before, stat) 
                || stat.uid !== 0 
                || (stat.mode & 0o777) !== 0o600)
                throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
            await file.sync();
        }
        finally {
            await file.close();
        }
        await this.syncDirectory(path);
    }
    async writeExclusive(path: string, bytes: Buffer): Promise<void> {
        await this.parents(path);
        if (bytes.length > 8192)
            throw new OwnerRecoveryError('OWNER_PRIVATE_FILE_INVALID');
        let file: OwnerFileHandle;
        try {
            file = await this.files.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        }
        catch {
            throw new OwnerRecoveryError('OWNER_PRIVATE_OUTPUT_REFUSED');
        }
        try {
            const stat = await file.stat();
            if (!stat.isFile() 
                || stat.uid !== 0 
                || (stat.mode & 0o777) !== 0o600)
                throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
            await file.writeFile(bytes);
            await file.sync();
        }
        finally {
            await file.close();
        }
        await this.syncDirectory(path);
    }
    async publish(from: string, to: string, sha256: string): Promise<void> {
        await this.parents(from);
        await this.parents(to);
        if (dirname(from) !== dirname(to))
            throw new OwnerRecoveryError('OWNER_PRIVATE_PATH_INVALID');
        if (!await this.exists(from)) {
            const bytes = await this.read(to);
            try {
                if (ownerDigest(bytes) !== sha256)
                    throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
                await this.syncDirectory(to);
                return;
            }
            finally {
                bytes.fill(0);
            }
        }
        const bytes = await this.read(from);
        try {
            if (ownerDigest(bytes) !== sha256)
                throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
        }
        finally {
            bytes.fill(0);
        }
        if (await this.exists(to))
            await this.checked(to, true);
        await this.files.rename(from, to);
        await this.syncDirectory(to);
        const published = await this.read(to);
        try {
            if (ownerDigest(published) !== sha256)
                throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
        }
        finally {
            published.fill(0);
        }
    }
    async remove(path: string): Promise<void> {
        if (!await this.exists(path))
            return;
        await this.files.unlink(path);
        await this.syncDirectory(path);
    }
    async openLock(path: string): Promise<OwnerFileHandle> {
        await this.parents(path);
        let file: OwnerFileHandle | undefined;
        try {
            file = await this.files.open(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
            await file.sync();
            await this.syncDirectory(path);
        }
        catch (error) {
            if (error !== null 
                && typeof error === 'object' 
                && 'code' in error 
                && error.code === 'EEXIST') {
                const before = await this.checked(path, true);
                file = await this.files.open(path, constants.O_RDWR | constants.O_NOFOLLOW);
                if (!identity(before, await file.stat())) {
                    await file.close();
                    throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
                }
            }
            else {
                await file?.close();
                throw error;
            }
        }
        if (file === undefined)
            throw new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE');
        const stat = await file.stat();
        if (!stat.isFile() 
            || stat.uid !== 0 
            || (stat.mode & 0o777) !== 0o600) {
            await file.close();
            throw new OwnerRecoveryError('OWNER_ROOT_CUSTODY_REQUIRED');
        }
        return file;
    }
    async executable(path: string): Promise<void> {
        const stat = await this.checked(path, false);
        if ((stat.mode & 0o111) === 0)
            throw new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE');
    }
}
export interface OwnerRecoveryLock {
    withLock<T>(path: string, action: () => Promise<T>): Promise<T>;
}
const LOCK_HELPER_SHA256 = 'd78963fd5cf73f328b5810b40f843bb1f85f0737c92463504af46360b79e420b';
/** flock belongs to the shared open-file description retained by Node. Never unlink the lock inode. */
export class PosixOwnerRecoveryLock implements OwnerRecoveryLock {
    constructor(private readonly custody: OwnerRecoveryCustody, private readonly input: Readonly<{
        pythonPath: string;
        helperPath: string;
    }>) {
    }
    async withLock<T>(path: string, action: () => Promise<T>): Promise<T> {
        await this.custody.executable(this.input.pythonPath);
        const code = await this.custody.read(this.input.helperPath, 2048, false);
        try {
            if (ownerDigest(code) !== LOCK_HELPER_SHA256)
                throw new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE');
            const file = await this.custody.openLock(path);
            try {
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(this.input.pythonPath, ['-I', '-c', code.toString(), '3'], {
                        shell: false, 
                        stdio: ['ignore', 'ignore', 'ignore', file.fd], 
                        env: {
                            PATH: '/usr/bin:/bin'
                        }
                    });
                    let timeout = false;
                    const timer = setTimeout(() => {
                        timeout = true;
                        child.kill('SIGKILL');
                    }, 2500);
                    child.once('error', () => {
                        clearTimeout(timer);
                        reject(new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE'));
                    });
                    child.once('close', status => {
                        clearTimeout(timer);
                        if (timeout)
                            reject(new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE'));
                        else if (status === 73)
                            reject(new OwnerRecoveryError('OWNER_RECOVERY_LOCK_BUSY'));
                        else if (status !== 0)
                            reject(new OwnerRecoveryError('OWNER_LOCK_ADAPTER_UNAVAILABLE'));
                        else
                            resolve();
                    });
                });
                return await action();
            }
            finally {
                await file.close();
            }
        }
        finally {
            code.fill(0);
        }
    }
}
export async function ownerPrivateDescriptor(fd: number, bound: number): Promise<Buffer> {
    if (!Number.isInteger(fd) 
        || fd < 0 
        || fd === 1 
        || fd === 2)
        throw new OwnerRecoveryError('OWNER_PRIVATE_DESCRIPTOR_REQUIRED');
    const file = await open(`/dev/fd/${fd}`, constants.O_RDONLY);
    try {
        const stat = await file.stat();
        if (stat.isFile() 
            && (stat.uid !== 0 
            || (stat.mode & 0o777) !== 0o600) 
            || !stat.isFile() 
            && !stat.isFIFO() 
            && !stat.isSocket())
            throw new OwnerRecoveryError('OWNER_PRIVATE_DESCRIPTOR_REQUIRED');
        const buffer = Buffer.alloc(bound + 1);
        let used = 0;
        while (used < buffer.length) {
            const result = await file.read(buffer, used, buffer.length - used, null);
            if (result.bytesRead === 0)
                break;
            used += result.bytesRead;
        }
        if (used > bound)
            throw new OwnerRecoveryError('OWNER_PRIVATE_INPUT_INVALID');
        return buffer.subarray(0, used);
    }
    finally {
        await file.close();
    }
}
export function ownerExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
    return value !== null 
        && typeof value === 'object' 
        && !Array.isArray(value) 
        && Object.keys(value).length === keys.length 
        && keys.every(k => Object.hasOwn(value, k));
}
export const ownerUuid = (value: unknown): value is string => typeof value === 'string' 
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function ownerJson(bytes: Buffer): unknown {
    try {
        return JSON.parse(bytes.toString());
    }
    catch {
        throw new OwnerRecoveryError('OWNER_PRIVATE_FILE_INVALID');
    }
}
