export const TRUSTED_CLIENT_IP_HEADER: "x-debateai-client-ip";
export const EDGE_SECRET_HEADER: "x-debateai-edge-secret";
export function normalizeClientIp(value: unknown): string | null;
/** Exact IP literals from DIALECTICAL_UI_TRUSTED_PROXIES; throws DIALECTICAL_UI_TRUSTED_PROXIES_INVALID. */
export function parseTrustedProxies(text: string | undefined): readonly string[];
/** Base64url text of the DIALECTICAL_UI_EDGE_SECRET_PATH file, or null when unset; throws DIALECTICAL_UI_EDGE_SECRET_INVALID. */
export function readEdgeSecret(path: string | undefined): string | null;
export function hardenIncomingProxyHeaders(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: unknown,
  trustedProxies?: readonly string[],
  edgeSecret?: string | null
): void;
