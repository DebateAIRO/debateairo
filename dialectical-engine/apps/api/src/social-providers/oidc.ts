import { createPublicKey, verify } from 'node:crypto';
import { normalizeEmailForBlindIndex } from '@debateai/crypto';
export interface OidcExpectation {
    readonly provider: 'google' | 'apple';
    readonly clientId: string;
    readonly nonce: string;
    readonly now: Date;
}
export interface SocialIdentityAssertion {
    readonly provider: 'google' | 'apple' | 'facebook' | 'x';
    readonly issuer: string;
    readonly subject: string;
    readonly email: string | null;
    readonly name: string | null;
    readonly emailTrust: 'google-authoritative' | 'apple-verified' | 'local';
}
const invalid = (): never => { throw new Error('SOCIAL_PROOF_INVALID'); };
function object(value: unknown): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid(); return value as Record<string, unknown>; }
function segment(value: string | undefined): Record<string, unknown> {
    if (value === undefined || !/^[A-Za-z0-9_-]+$/.test(value))
        return invalid();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value)
        return invalid();
    return object(JSON.parse(bytes.toString('utf8')));
}
export function socialEmail(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return null;
    try {
        return normalizeEmailForBlindIndex(value);
    }
    catch {
        return null;
    }
}
export function socialName(value: unknown): string | null { return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null; }
/** Fixed local RS256 verification. JWT header URLs never become network destinations. */
export function verifyOidcIdentity(token: string, keys: unknown, expected: OidcExpectation): SocialIdentityAssertion {
    try {
        if (typeof token !== 'string' || token.length > 16384)
            return invalid();
        const parts = token.split('.');
        if (parts.length !== 3)
            return invalid();
        const header = segment(parts[0]), claims = segment(parts[1]);
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length < 1 || header.kid.length > 128
            || header.jku !== undefined || header.x5u !== undefined || header.jwk !== undefined || header.crit !== undefined || header.b64 !== undefined)
            return invalid();
        const list = object(keys).keys;
        if (!Array.isArray(list) || list.length < 1 || list.length > 16 || Buffer.byteLength(JSON.stringify(keys)) > 65536)
            return invalid();
        const matches = list.map(object).filter(k => k.kid === header.kid);
        if (matches.length !== 1)
            return invalid();
        const candidate = matches[0]!;
        if (candidate.kty !== 'RSA' || (candidate.use !== undefined && candidate.use !== 'sig') || (candidate.alg !== undefined && candidate.alg !== 'RS256')
            || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(k => candidate[k] !== undefined)
            || (candidate.key_ops !== undefined && (!Array.isArray(candidate.key_ops) || !candidate.key_ops.includes('verify')))
            || typeof candidate.n !== 'string' || candidate.n.length > 1400 || typeof candidate.e !== 'string' || !/^[A-Za-z0-9_-]{1,12}$/.test(candidate.e))
            return invalid();
        const publicKey = createPublicKey({ key: candidate as JsonWebKey, format: 'jwk' });
        const bits = publicKey.asymmetricKeyDetails?.modulusLength;
        const signature = parts[2]!;
        if (bits === undefined || bits < 2048 || bits > 8192 || !/^[A-Za-z0-9_-]+$/.test(signature)
            || Buffer.from(signature, 'base64url').toString('base64url') !== signature
            || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), publicKey, Buffer.from(signature, 'base64url')))
            return invalid();
        const issuer = expected.provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com';
        const now = expected.now.getTime() / 1000;
        if ((claims.iss !== issuer && !(expected.provider === 'google' && claims.iss === 'accounts.google.com'))
            || claims.aud !== expected.clientId || (claims.azp !== undefined && claims.azp !== expected.clientId)
            || claims.nonce !== expected.nonce || typeof expected.nonce !== 'string' || expected.nonce.length < 1
            || typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)
            || typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 || claims.iat < 1
            || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp <= claims.iat
            || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)))
            return invalid();
        const email = socialEmail(claims.email);
        const authoritativeGoogle = expected.provider === 'google' && email !== null && claims.email_verified === true
            && (email.endsWith('@gmail.com') || (typeof claims.hd === 'string' && /^[a-zA-Z0-9.-]{1,253}$/.test(claims.hd)));
        const verifiedApple = expected.provider === 'apple' && email !== null && (claims.email_verified === true || claims.email_verified === 'true');
        return Object.freeze({ provider: expected.provider, issuer, subject: claims.sub, email, name: socialName(claims.name), emailTrust: authoritativeGoogle ? 'google-authoritative' : verifiedApple ? 'apple-verified' : 'local' });
    }
    catch {
        return invalid();
    }
}
