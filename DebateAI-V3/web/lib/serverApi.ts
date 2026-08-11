import { createContractClient, type ContractClient } from "@debateai/contract";

export const USER_TOKEN_COOKIE = "debateai:user-dev-token";

export function createServerContractClient(fetchImplementation: typeof fetch = fetch): ContractClient {
  const baseUrl = process.env.DIALECTICAL_API_BASE || "http://127.0.0.1:8000";
  return createContractClient(baseUrl, fetchImplementation);
}
