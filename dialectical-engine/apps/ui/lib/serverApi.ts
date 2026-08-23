import { ContractHttpError, createContractClient, type Answer, type ContractClient, type RunProjection } from "@debateai/contract";
import type { DebateDetail, DebateSummary } from "./types.js";
import { debateDetailFromAnswer, debateSummariesFromIndex } from "./v3/adapter.js";

/**
 * UI-01 (DR-145): V2's SSR data access, swapped onto V3's typed contract
 * client. The upstream base is server-only (DIALECTICAL_API_BASE — ACC-01
 * rev-3 pattern) and required loudly: no silent default upstream. Every read
 * is asker-scoped by the opaque server session the pages read from the HttpOnly cookie
 * (S05); with no token the pages render their own pending/auth states and
 * never fetch.
 */

export const USER_TOKEN_COOKIE = "__Host-debateai-session";

export function createServerContractClient(
  fetchImplementation: typeof fetch = fetch,
  sessionCookie?: string,
  userAgent?: string
): ContractClient {
  const baseUrl = process.env.DIALECTICAL_API_BASE?.trim();
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("DIALECTICAL_API_BASE_REQUIRED");
  }
  return createContractClient(baseUrl, fetchImplementation, {
    mode: "cookie",
    ...(sessionCookie === undefined ? {} : {
      cookieHeader: `${USER_TOKEN_COOKIE}=${sessionCookie}`
    }),
    ...(userAgent === undefined ? {} : { userAgent })
  });
}

/**
 * The home page's declared page size. This is a UI request parameter (how
 * many index rows one screen asks for), not a served data value; the page
 * renders "shown of total" honestly so truncation is never silent.
 */
export const HOME_PAGE_SIZE = 50;

export type DebateListPage = {
  summaries: DebateSummary[];
  shown: number;
  total: number;
};

export async function listDebatesPageServer(
  token: string,
  client?: ContractClient,
  userAgent?: string
): Promise<DebateListPage> {
  const index = await (client ?? createServerContractClient(fetch, token, userAgent))
    .readAnswerIndex("cookie-session", HOME_PAGE_SIZE, 0);
  return {
    summaries: debateSummariesFromIndex(index),
    shown: index.items.length,
    total: index.total
  };
}

export type GetDebateServerResult =
  | { ok: true; debate: DebateDetail; answer: Answer }
  | { ok: false; kind: "loading"; run: RunProjection }
  | { ok: false; kind: "failed"; run: RunProjection; reason: string }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "pending"; message: string; status?: number };

/**
 * SSR read of a debate by answer id or run ref. An absent served answer is
 * resolved against the typed, asker-owned run projection: live runs load,
 * failed runs fail loudly, and only an absent run becomes an honest 404.
 * Transport failures remain retryable pending states.
 */
export async function getDebateServer(
  id: string,
  token: string,
  client?: ContractClient,
  userAgent?: string
): Promise<GetDebateServerResult> {
  const resolvedClient = client ?? createServerContractClient(fetch, token, userAgent);
  let answer: Answer;
  try {
    try {
      answer = await resolvedClient.readAnswer(id, "cookie-session");
    } catch (failure) {
      if (!(failure instanceof ContractHttpError) || failure.code !== "NOT_FOUND") throw failure;
      answer = await resolvedClient.readRunAnswer(id, "cookie-session");
    }
  } catch (failure) {
    if (!(failure instanceof ContractHttpError) || failure.code !== "NOT_FOUND") {
      if (failure instanceof ContractHttpError) {
        return { ok: false, kind: "pending", message: failure.code, status: failure.status };
      }
      return { ok: false, kind: "pending", message: failure instanceof Error ? failure.message : "Unable to load debate" };
    }
    try {
      const run = await resolvedClient.readRun(id, "cookie-session");
      if (run.state === "FAILED") {
        return { ok: false, kind: "failed", run, reason: run.terminal_reason! };
      }
      return { ok: false, kind: "loading", run };
    } catch (runFailure) {
      if (runFailure instanceof ContractHttpError && runFailure.code === "NOT_FOUND") {
        return { ok: false, kind: "not_found" };
      }
      if (runFailure instanceof ContractHttpError) {
        return { ok: false, kind: "pending", message: runFailure.code, status: runFailure.status };
      }
      return { ok: false, kind: "pending", message: runFailure instanceof Error ? runFailure.message : "Unable to load run" };
    }
  }
  return { ok: true, debate: debateDetailFromAnswer(answer), answer };
}
