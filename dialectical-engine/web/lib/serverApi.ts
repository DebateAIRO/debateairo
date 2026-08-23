import { createContractClient, type ContractClient } from "@debateai/contract";

export const USER_TOKEN_COOKIE = "__Host-debateai-session";

export function createServerContractClient(
  fetchImplementation: typeof fetch = fetch,
  sessionCookie?: string
): ContractClient {
  const baseUrl = process.env.DIALECTICAL_API_BASE || "http://127.0.0.1:8000";
  return createContractClient(baseUrl, fetchImplementation, {
    mode: "cookie",
    ...(sessionCookie === undefined ? {} : { cookieHeader: `${USER_TOKEN_COOKIE}=${sessionCookie}` })
  });
}
