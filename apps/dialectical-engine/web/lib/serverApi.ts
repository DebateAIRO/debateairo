import type { DebateDetail, DebateSummary } from "./types";

const DEFAULT_SERVER_FETCH_TIMEOUT_MS = 5_000;

function serverApiBase(): string {
  return process.env.DIALECTICAL_COORDINATOR_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
}

function serverFetchTimeoutMs(): number {
  const raw = process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_SERVER_FETCH_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SERVER_FETCH_TIMEOUT_MS;
}

/**
 * A definitive non-2xx HTTP response from the coordinator. Carries the status
 * code so callers can distinguish a definitive 404 (not found) from other
 * outcomes that are safer to treat as transient.
 */
class CoordinatorHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CoordinatorHttpError";
    this.status = status;
  }
}

async function serverFetch<T>(path: string): Promise<T> {
  const timeoutMs = serverFetchTimeoutMs();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Coordinator request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  let response: Response;
  try {
    response = await Promise.race([
      fetch(`${serverApiBase()}${path}`, { cache: "no-store", signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new CoordinatorHttpError(response.status, detail || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listDebatesServer(): Promise<DebateSummary[]> {
  const payload = await serverFetch<{ items: DebateSummary[] }>("/api/debates");
  return payload.items;
}

/**
 * Classification of a coordinator SSR fetch outcome.
 *
 * - "pending" marks a TRANSIENT failure (request timeout, the coordinator being
 *   unreachable/slow/starting, or a non-404 HTTP hiccup). The correct UX is a
 *   loading state that lets client-side polling/stream retry -- NEVER a fatal
 *   dead-end. A genuinely broken backend still surfaces later via the client
 *   refresh path, which sets a real error.
 * - "not_found" marks the one definitive terminal outcome we key off at SSR
 *   time: the debate does not exist (HTTP 404).
 */
export type CoordinatorFetchErrorKind = "pending" | "not_found";

export type GetDebateServerResult =
  | { ok: true; debate: DebateDetail }
  | { ok: false; kind: CoordinatorFetchErrorKind; message: string; status?: number };

/**
 * Classify a thrown coordinator fetch error into a transient (pending) vs
 * definitive (not_found) outcome. Only a 404 is treated as definitive; every
 * other failure (timeout, network error, 5xx, unexpected) is transient so the
 * SSR seam never produces a fatal dead-end on its own.
 */
export function classifyCoordinatorFetchError(
  exc: unknown
): { kind: CoordinatorFetchErrorKind; message: string; status?: number } {
  if (exc instanceof CoordinatorHttpError) {
    if (exc.status === 404) {
      return { kind: "not_found", message: exc.message || "Debate not found", status: 404 };
    }
    return { kind: "pending", message: exc.message, status: exc.status };
  }
  const message = exc instanceof Error ? exc.message : "Unable to load debate";
  return { kind: "pending", message };
}

/**
 * Fetch a debate for SSR, returning a discriminated result instead of throwing.
 * page.tsx routes a transient "pending" outcome to a loading state (client
 * polling/stream retries) and only a definitive "not_found" to a terminal error.
 */
export async function getDebateServer(id: string): Promise<GetDebateServerResult> {
  try {
    const debate = await serverFetch<DebateDetail>(`/api/debates/${id}`);
    return { ok: true, debate };
  } catch (exc) {
    return { ok: false, ...classifyCoordinatorFetchError(exc) };
  }
}
