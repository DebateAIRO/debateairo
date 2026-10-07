import { createHash } from 'node:crypto';
export function socialHash(purpose: 'state' | 'flow-cookie' | 'browser' | 'nonce' | 'signup' | 'enrollment' | 'step-up' | 'step-up-passkey' | 'passkey-challenge', value: string): string { return 'sha256:' + createHash('sha256').update('debateai:social:' + purpose + ':v1\0').update(value).digest('hex'); }
export function socialBrowserHash(cookie: string | null | undefined): string | undefined { return typeof cookie === 'string' && /^[A-Za-z0-9_-]{43}$/.test(cookie) ? socialHash('browser', cookie) : undefined; }
