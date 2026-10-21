import type { IncomingMessage, ServerResponse } from "node:http";

/** INTERFACE "RELEASE_KEY": /^r[1-9][0-9]*-[0-9a-f]{12}$/ (agrees with the kernel's parseReleaseKey). */
export const RELEASE_KEY_PATTERN: RegExp;
/** Inside NEXT_DIST_DIR || ".next": {"releaseCode":"<12 lowercase hex>"}. */
export const BUILD_STAMP_FILE: "debateai-release-code.json";
/** The key, or null only under --dev without one; throws RELEASE_KEY_REQUIRED / RELEASE_KEY_INVALID. */
export function parseWebsiteReleaseKey(raw: string | undefined, options: Readonly<{ development: boolean }>): string | null;
/** RELEASE_KEY's code → DEBATEAI_SOURCE_REVISION[0..12] → gitHead[0..12] → "000000000000" (not production); throws RELEASE_CODE_UNRESOLVED / RELEASE_KEY_INVALID. A function gitHead is called only when neither variable is set. */
export function resolveBuildReleaseCode(
  env: Readonly<Record<string, string | undefined>>,
  gitHead: string | null | (() => string | null),
  options?: Readonly<{ production?: boolean }>
): string;
/** The checkout's HEAD revision, or null. */
export function readGitHead(cwd: string): string | null;
/** Throws RELEASE_KEY_BUILD_MISMATCH unless the build in distDir is stamped with the key's code part. */
export function assertBuildMatchesRelease(distDir: string, releaseKey: string): void;
/** Outside --dev, one content-free warning line when DIALECTICAL_API_BASE is missing or not an http(s) URL; returns whether it warned. */
export function noteUnusableApiBase(
  apiBase: string | undefined,
  options: Readonly<{ development: boolean; warn?: (line: string) => void }>
): boolean;
/** The website's key on its own answers; null on a proxied /api answer (it carries its API's own) and under --dev without a key. */
export function releaseHeaderFor(releaseKey: string | null, url: string | undefined): string | null;
/** GET /readyz ahead of Next; returns whether it handled the request. */
export function createReadinessResponder(options: Readonly<{
  apiBase: string | undefined;
  releaseKey: string | null;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
  draining: () => boolean;
}>): (req: Pick<IncomingMessage, "method" | "url">, res: Pick<ServerResponse, "statusCode" | "setHeader" | "end">) => boolean;
/** SIGTERM → onDrain(); server.close(); closeIdleConnections(); exit 0 when closed or at the deadline (closeAllConnections first). */
export function installGracefulClose(options: Readonly<{
  server: Readonly<{
    close(callback: () => void): unknown;
    closeIdleConnections(): void;
    closeAllConnections(): void;
  }>;
  process: Readonly<{ on(event: "SIGTERM", listener: () => void): unknown; exit(code: number): unknown }>;
  deadlineMs?: number;
  onDrain?: () => void;
}>): void;
