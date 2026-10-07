import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { z } from 'zod';
import { verifyOidcIdentity, socialEmail, socialName, type SocialIdentityAssertion } from './oidc.js';
export type SocialProvider = 'google' | 'apple' | 'facebook' | 'x';
export interface SocialProviderConfiguration {
    readonly provider: SocialProvider;
    readonly clientId: string;
    readonly appScope: string;
    readonly callback: string;
    readonly configuration: string;
}
const schema = z.array(z.object({ provider: z.enum(['google', 'apple', 'facebook', 'x']), clientId: z.string().min(1).max(256).regex(/^[A-Za-z0-9._-]+$/), appScope: z.string().min(1).max(256).regex(/^[A-Za-z0-9._-]+$/), access: z.literal('existing-approved') }).strict()).max(4);
export function socialConfigurations(value: string | undefined, origin: string): readonly SocialProviderConfiguration[] {
    if (value === undefined)
        return [];
    const base = new URL(origin);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
        throw new Error('SOCIAL_CONFIGURATION_INVALID');
    try {
        const inputs = schema.parse(JSON.parse(value));
        if (new Set(inputs.map(x => x.provider)).size !== inputs.length)
            throw new Error();
        return inputs.map(input => { const callback = base.origin + `/v1/auth/social/${input.provider}/callback`; return Object.freeze({ provider: input.provider, clientId: input.clientId, appScope: input.appScope, callback, configuration: 'sha256:' + createHash('sha256').update(JSON.stringify([input.provider, input.clientId, input.appScope, callback])).digest('hex') }); });
    }
    catch {
        throw new Error('SOCIAL_CONFIGURATION_INVALID');
    }
}
export interface SocialTransport {
    operation(input: Readonly<Record<string, string>>): Promise<unknown>;
}
export class UnixSocialTransport implements SocialTransport {
    constructor(private readonly socketPath: string) { if (!/^\/run\/debateai-social\/[A-Za-z0-9_-]+\.sock$/.test(socketPath))
        throw new TypeError('SOCIAL_SOCKET_PATH_INVALID'); }
    async operation(input: Readonly<Record<string, string>>): Promise<unknown> {
        const body = JSON.stringify(input);
        if (Buffer.byteLength(body) > 8192)
            throw new Error('SOCIAL_TRANSPORT_UNAVAILABLE');
        return new Promise((resolve, reject) => {
            let done = false;
            const finish = (bad: boolean, result?: unknown) => { if (done)
                return; done = true; clearTimeout(deadline); bad ? reject(new Error('SOCIAL_TRANSPORT_UNAVAILABLE')) : resolve(result); };
            const req = request({ socketPath: this.socketPath, path: '/social', method: 'POST', agent: false, maxHeaderSize: 4096, headers: { 'content-type': 'application/json', accept: 'application/json' } }, response => {
                if (response.statusCode !== 200) {
                    response.destroy();
                    finish(true);
                    return;
                }
                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) {
                    response.destroy();
                    req.destroy();
                    finish(true);
                }
                else
                    chunks.push(chunk); });
                response.on('error', () => finish(true));
                response.on('aborted', () => finish(true));
                response.on('end', () => { try {
                    finish(false, JSON.parse(Buffer.concat(chunks).toString('utf8')));
                }
                catch {
                    finish(true);
                } });
            });
            const deadline = setTimeout(() => { req.destroy(); finish(true); }, 5000);
            req.on('error', () => finish(true));
            req.end(body);
        });
    }
}
function object(x: unknown): Record<string, unknown> { if (!x || typeof x !== 'object' || Array.isArray(x))
    throw new Error('SOCIAL_PROOF_INVALID'); return x as Record<string, unknown>; }
export function socialAuthorizationUrl(config: SocialProviderConfiguration, state: string, nonce: string, verifier: string): string {
    if (![state, nonce, verifier].every(x => /^[A-Za-z0-9_-]{43}$/.test(x)))
        throw new Error('SOCIAL_PROOF_INVALID');
    const url = new URL(config.provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : config.provider === 'apple' ? 'https://appleid.apple.com/auth/authorize' : config.provider === 'x' ? 'https://x.com/i/oauth2/authorize' : 'https://www.facebook.com/v26.0/dialog/oauth');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', state, scope: config.provider === 'google' ? 'openid email profile' : config.provider === 'apple' ? 'name email' : config.provider === 'x' ? 'tweet.read users.read users.email' : 'public_profile,email' }).toString();
    if (config.provider === 'google' || config.provider === 'apple')
        url.searchParams.set('nonce', nonce);
    if (config.provider === 'apple')
        url.searchParams.set('response_mode', 'form_post');
    if (config.provider === 'google' || config.provider === 'x') {
        url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
        url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
}
export class SocialProviders {
    private readonly cache = new Map<string, {
        keys: unknown;
        expires: number;
        refreshed: number;
    }>();
    private readonly lastRefreshAttempt = new Map<string, number>();
    private readonly refreshing = new Map<string, Promise<unknown>>();
    constructor(private readonly configurations: readonly SocialProviderConfiguration[], private readonly transport?: SocialTransport, private readonly clock = () => new Date()) { }
    async available(): Promise<readonly SocialProviderConfiguration[]> {
        if (!this.transport || this.configurations.length === 0)
            return [];
        try {
            const capabilities = z.object({ providers: z.array(z.object({ provider: z.enum(['google', 'apple', 'facebook', 'x']), clientId: z.string().max(256), appScope: z.string().max(256), callback: z.string().max(2048) }).strict()).max(4) }).strict().parse(await this.transport.operation({ operation: 'capabilities' }));
            return this.configurations.filter(c => c.provider !== 'facebook' && capabilities.providers.some(p => p.provider === c.provider && p.clientId === c.clientId && p.appScope === c.appScope && p.callback === c.callback));
        }
        catch {
            return [];
        }
    }
    private async keys(provider: 'google' | 'apple', kid: string): Promise<unknown> {
        const now = this.clock().getTime(), cached = this.cache.get(provider);
        if (cached && cached.expires > now && (object(cached.keys).keys as Record<string, unknown>[]).some(k => k.kid === kid))
            return cached.keys;
        const pending = this.refreshing.get(provider);
        if (pending)
            return pending;
        const last = this.lastRefreshAttempt.get(provider);
        if (last !== undefined && now - last < 30000)
            throw new Error('SOCIAL_PROOF_INVALID');
        this.lastRefreshAttempt.set(provider, now);
        const promise = (async () => {
            const keys = await this.transport!.operation({ operation: provider + '.keys' });
            const members = object(keys).keys;
            if (!Array.isArray(members) || members.length < 1 || members.length > 16 || !members.every(k => typeof object(k).kid === 'string') || JSON.stringify(keys).length > 65536)
                throw new Error('SOCIAL_PROOF_INVALID');
            this.cache.set(provider, { keys, refreshed: now, expires: now + 300000 });
            return keys;
        })();
        this.refreshing.set(provider, promise);
        try {
            return await promise;
        }
        finally {
            this.refreshing.delete(provider);
        }
    }
    async verify(config: SocialProviderConfiguration, code: string, nonce: string, verifier: string): Promise<SocialIdentityAssertion> {
        const input = { operation: config.provider + '.exchange', code, ...(config.provider === 'google' || config.provider === 'x' ? { verifier } : {}) };
        const result = object(await this.transport!.operation(input));
        if (config.provider === 'google' || config.provider === 'apple') {
            if (typeof result.id_token !== 'string' || result.id_token.length > 16384)
                throw new Error('SOCIAL_PROOF_INVALID');
            let kid: unknown;
            try {
                kid = object(JSON.parse(Buffer.from(result.id_token.split('.')[0] ?? '', 'base64url').toString('utf8'))).kid;
            }
            catch {
                throw new Error('SOCIAL_PROOF_INVALID');
            }
            if (typeof kid !== 'string' || kid.length > 128)
                throw new Error('SOCIAL_PROOF_INVALID');
            return verifyOidcIdentity(result.id_token, await this.keys(config.provider, kid), { provider: config.provider, clientId: config.clientId, nonce, now: this.clock() });
        }
        const user = config.provider === 'x' ? object(object(result.user).data) : object(result.user);
        if (typeof user.id !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(user.id))
            throw new Error('SOCIAL_PROOF_INVALID');
        if (config.provider === 'facebook') {
            const debug = object(result.debug), now = this.clock().getTime() / 1000;
            if (debug.app_id !== config.clientId || debug.user_id !== user.id || debug.is_valid !== true || typeof debug.expires_at !== 'number' || debug.expires_at <= now || typeof debug.data_access_expires_at !== 'number' || debug.data_access_expires_at <= now || !Array.isArray(debug.scopes) || !['public_profile', 'email'].every(s => (debug.scopes as unknown[]).includes(s)))
                throw new Error('SOCIAL_PROOF_INVALID');
        }
        else if (result.token_type !== 'bearer' || typeof result.scope !== 'string' || !['tweet.read', 'users.read', 'users.email'].every(s => (result.scope as string).split(' ').includes(s)))
            throw new Error('SOCIAL_PROOF_INVALID');
        return Object.freeze({ provider: config.provider, issuer: config.provider === 'facebook' ? 'https://www.facebook.com' : 'https://x.com', subject: user.id, email: socialEmail(config.provider === 'x' ? user.confirmed_email : user.email), name: socialName(user.name), emailTrust: 'local' });
    }
}
