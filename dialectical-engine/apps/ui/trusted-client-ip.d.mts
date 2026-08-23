export const TRUSTED_CLIENT_IP_HEADER: "x-debateai-client-ip";
export function normalizeClientIp(value: unknown): string | null;
export function hardenIncomingProxyHeaders(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: unknown
): void;
