import pg from 'pg';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
const closed = () => new Error('PRIVATE_STREAM_CLOSED');
type CancellationQueue = {
    active: number;
    waiting: Array<() => void>;
};
const cancellations = new WeakMap<Pool, CancellationQueue>();
async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(closed()), milliseconds);
            })
        ]);
    }
    finally {
        clearTimeout(timer);
    }
}
/** At most four authenticated cancellation connections per owned pool, with a bounded queue wait. */
async function cancellationSlot(pool: Pool): Promise<() => void> {
    let state = cancellations.get(pool);
    if (state === undefined) {
        state = { active: 0, waiting: [] };
        cancellations.set(pool, state);
    }
    if (state.active < 4)
        state.active++;
    else {
        let wake: () => void = () => { };
        let granted = false;
        const available = new Promise<void>(resolve => { wake = () => { granted = true; resolve(); }; state!.waiting.push(wake); });
        try {
            await bounded(available, 250);
        }
        catch (error) {
            const index = state.waiting.indexOf(wake);
            if (index !== -1)
                state.waiting.splice(index, 1);
            else if (granted) {
                const next = state.waiting.shift();
                if (next !== undefined)
                    next();
                else
                    state.active--;
            }
            throw error;
        }
    }
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        const next = state!.waiting.shift();
        if (next !== undefined)
            next();
        else
            state!.active--;
    };
}
function destroyCancellationSocket(client: pg.Client): void {
    // Disposing the native socket is not a plaintext protocol cancellation request.
    const owned = client as unknown as {
        connection?: {
            stream?: {
                destroy(): void;
            };
        };
    };
    owned.connection?.stream?.destroy();
}
/** Cancel only an internally acquired client's PID using its pool's authenticated TLS/socket profile.
 * The held backend has a local lock-wait deadline, and a statement deadline where existing guarded calls apply. */
export async function cancelAndDestroyPrivateClient(pool: Pool, client: PoolClient): Promise<void> {
    const pid = (client as unknown as {
        processID?: number;
    }).processID;
    let releaseSlot: (() => void) | undefined;
    let cancellation: pg.Client | undefined;
    let stopped = false;
    try {
        if (!Number.isInteger(pid) || Number(pid) <= 0)
            return;
        releaseSlot = await cancellationSlot(pool);
        cancellation = new pg.Client({
            ...pool.options, connectionTimeoutMillis: 500, statement_timeout: 700, query_timeout: 750
        });
        cancellation.on('error', () => { });
        const connection = cancellation;
        await bounded((async () => {
            await connection.connect();
            if (stopped)
                throw closed();
            await connection.query('SELECT pg_catalog.pg_cancel_backend($1)', [pid]);
        })(), 1000);
    }
    catch {
        // No connection parameters, SQL text, backend secret or driver error enters logs/DTOs.
    }
    finally {
        stopped = true;
        try {
            try {
                client.release(true);
            }
            finally {
                if (cancellation !== undefined) {
                    try {
                        await bounded(cancellation.end(), 100);
                    }
                    finally {
                        destroyCancellationSocket(cancellation);
                    }
                }
            }
        }
        finally {
            releaseSlot?.();
        }
    }
}
/** Refuse promptly on peer cancellation and close any resource produced after the refusal. */
export async function abortablePrivateWork<T>(operation: () => Promise<T>, signal?: AbortSignal, closeLate?: (value: T) => void): Promise<T> {
    if (signal === undefined)
        return operation();
    if (signal.aborted)
        throw closed();
    let aborted = false;
    let rejectAbort: (error: Error) => void = () => { };
    const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => { aborted = true; rejectAbort(closed()); };
    signal.addEventListener('abort', abort, { once: true });
    const work = Promise.resolve().then(() => {
        if (aborted)
            throw closed();
        return operation();
    }).then(value => {
        if (aborted) {
            closeLate?.(value);
            throw closed();
        }
        return value;
    });
    try {
        return await Promise.race([work, cancelled]);
    }
    finally {
        signal.removeEventListener('abort', abort);
    }
}
/** Each private stream query owns a connection and a local lock-wait fallback. */
export async function queryPrivateStream<T extends QueryResultRow>(pool: Pool, sql: string, values: readonly unknown[], signal?: AbortSignal): Promise<QueryResult<T>> {
    if (signal === undefined)
        return pool.query<T>(sql, [...values]);
    const client = await abortablePrivateWork(() => pool.connect(), signal, late => late.release(true));
    let released = false;
    let transaction = false;
    const abort = () => {
        if (!released) {
            released = true;
            void cancelAndDestroyPrivateClient(pool, client).catch(() => { });
        }
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted)
        abort();
    try {
        return await abortablePrivateWork(async () => {
            await client.query('BEGIN');
            transaction = true;
            await client.query("SET LOCAL lock_timeout='700ms'");
            const result = await client.query<T>(sql, [...values]);
            if (signal.aborted)
                throw closed();
            await client.query('COMMIT');
            transaction = false;
            return result;
        }, signal);
    }
    finally {
        signal.removeEventListener('abort', abort);
        if (!released) {
            released = true;
            if (transaction)
                await client.query('ROLLBACK').catch(() => { });
            client.release();
        }
    }
}
