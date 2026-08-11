import { ContractHttpError, createContractClient, type Answer, type ContractClient } from "@debateai/contract";
import type { DebateDetail, DebateSummary } from "./types.js";
import { debateDetailFromAnswer, debateSummariesFromIndex } from "./v3/adapter.js";

/**
 * UI-01 (DR-145): V2's SSR data access, swapped onto V3's typed contract
 * client. The upstream base is server-only (DIALECTICAL_API_BASE — ACC-01
 * rev-3 pattern) and required loudly: no silent default upstream. Every read
 * is asker-scoped by the dev token the pages read from the identity cookie
 * (S05); with no token the pages render their own pending/auth states and
 * never fetch.
 */

export const USER_TOKEN_COOKIE = "debateai:user-dev-token";

export function createServerContractClient(fetchImplementation: typeof fetch = fetch): ContractClient {
  const baseUrl = process.env.DIALECTICAL_API_BASE?.trim();
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("DIALECTICAL_API_BASE_REQUIRED");
  }
  return createContractClient(baseUrl, fetchImplementation);
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
  client: ContractClient = createServerContractClient()
): Promise<DebateListPage> {
  const index = await client.readAnswerIndex(token, HOME_PAGE_SIZE, 0);
  return {
    summaries: debateSummariesFromIndex(index),
    shown: index.items.length,
    total: index.total
  };
}

export type GetDebateServerResult =
  | { ok: true; debate: DebateDetail; answer: Answer }
  | { ok: false; kind: "pending"; message: string; status?: number };

/**
 * SSR read of a debate by answer id or run ref. EVERY failure is classified
 * "pending" — never a fatal dead-end at SSR time — because in V3 a 404 is
 * genuinely ambiguous between "run still open, nothing served yet" and "not
 * visible to this asker"; the client's event stream resolves the difference
 * (a stream that also 404s surfaces the terminal NOT_FOUND loudly).
 */
export async function getDebateServer(
  id: string,
  token: string,
  client: ContractClient = createServerContractClient()
): Promise<GetDebateServerResult> {
  let answer: Answer;
  try {
    try {
      answer = await client.readAnswer(id, token);
    } catch (failure) {
      if (!(failure instanceof ContractHttpError) || failure.code !== "NOT_FOUND") throw failure;
      answer = await client.readRunAnswer(id, token);
    }
  } catch (failure) {
    if (failure instanceof ContractHttpError) {
      return { ok: false, kind: "pending", message: failure.code, status: failure.status };
    }
    return { ok: false, kind: "pending", message: failure instanceof Error ? failure.message : "Unable to load debate" };
  }
  return { ok: true, debate: debateDetailFromAnswer(answer), answer };
}
