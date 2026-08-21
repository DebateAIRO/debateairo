import { createContractClient, type ContractClient } from "@debateai/contract";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

function normalizeSameOriginApiPath(apiBase: string): string {
  const normalized = apiBase.trim().replace(/\/+$/, "");
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  return normalized;
}

export function createBrowserContractClient(
  fetchImplementation: typeof fetch = fetch,
  apiBase: string = API_BASE
): ContractClient {
  const sameOriginApiPath = normalizeSameOriginApiPath(apiBase);
  const contractOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const proxyFetch: typeof fetch = (input, init) => {
    const contractUrl = input instanceof Request ? new URL(input.url) : new URL(String(input));
    return fetchImplementation(`${sameOriginApiPath}${contractUrl.pathname}${contractUrl.search}`, init);
  };
  return createContractClient(contractOrigin, proxyFetch);
}

export const contractClient: ContractClient = createBrowserContractClient();

const TOKEN_KEY = "debateai:user-dev-token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
