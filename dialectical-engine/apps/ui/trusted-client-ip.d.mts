export const TRUSTED_CLIENT_IP_HEADER: "x-debateai-client-ip";
export const EDGE_SECRET_HEADER: "x-debateai-edge-secret";
export function normalizeClientIp(value: unknown): string | null;
/** Exact IP literals from DIALECTICAL_UI_TRUSTED_PROXIES; throws DIALECTICAL_UI_TRUSTED_PROXIES_INVALID. */
export function parseTrustedProxies(text: string | undefined): readonly string[];
/** Base64url text of the DIALECTICAL_UI_EDGE_SECRET_PATH file, or null when unset; throws DIALECTICAL_UI_EDGE_SECRET_INVALID. */
export function readEdgeSecret(path: string | undefined): string | null;
/** NV-03: the UI-to-API proof's request header, and the API's /readyz verdict header. */
export const UI_API_PROOF_HEADER: "x-debateai-ui-proof";
export const UI_API_PROOF_VERDICT_HEADER: "x-debateai-ui-proof-verdict";
/** Base64url text of the DIALECTICAL_UI_API_PROOF_PATH file, or null when unset; throws DIALECTICAL_UI_API_PROOF_INVALID. */
export function readUiApiProof(path: string | undefined): string | null;
/** Throws DIALECTICAL_UI_API_PROOF_REQUIRED (a trusted proxy outside --dev, no proof) or DIALECTICAL_UI_API_PROOF_REUSES_EDGE_SECRET. */
export function assertUiApiProofPolicy(options: Readonly<{
  development: boolean;
  trustedProxies: readonly string[];
  edgeSecret: string | null;
  uiApiProof: string | null;
}>): void;
/** Installs the boot-checked proof (or null) process-wide; throws DIALECTICAL_UI_API_PROOF_INVALID. */
export function installUiApiProof(value: string | null): void;
/** The installed proof, or null (one not_installed line behind server.mjs when none was ever installed). */
export function installedUiApiProof(): string | null;
export function hardenIncomingProxyHeaders(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: unknown,
  trustedProxies?: readonly string[],
  edgeSecret?: string | null
): void;
