export const NONCE_REQUEST_HEADER: "x-nonce";
export const FALLBACK_CONTENT_SECURITY_POLICY: string;
export const API_CONTENT_SECURITY_POLICY: string;
export function buildContentSecurityPolicy(scriptSources: string): string;
export function createNonce(): string;
export function nonceContentSecurityPolicy(nonce: string, development: boolean): string;
