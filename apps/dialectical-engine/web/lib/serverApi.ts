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
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listDebatesServer(): Promise<DebateSummary[]> {
  const payload = await serverFetch<{ items: DebateSummary[] }>("/api/debates");
  return payload.items;
}

export async function getDebateServer(id: string): Promise<DebateDetail> {
  return serverFetch<DebateDetail>(`/api/debates/${id}`);
}
