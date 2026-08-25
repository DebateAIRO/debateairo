import { createContractClient, type ContractClient } from "@debateai/contract";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";
export const COOKIE_SESSION_MARKER = "cookie-session";

function normalizeSameOriginApiPath(apiBase: string): string {
  const normalized = apiBase.trim().replace(/\/+$/, "");
  if (normalized.length === 0 || normalized.includes("\\")
    || !normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  if (normalized.includes("?") || normalized.includes("#") || normalized.split("/").some((segment) => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return true; }
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  })) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  let resolved:URL;
  try {
    resolved=new URL(`${normalized}/origin-probe`,"http://sentinel.invalid");
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  if (resolved.origin!=="http://sentinel.invalid"
    || resolved.pathname!==`${normalized}/origin-probe`) {
    throw new Error("NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH");
  }
  return normalized;
}

export function createSameOriginFetch(
  apiBase:string,
  fetchImplementation:typeof fetch=fetch
):typeof fetch {
  const sameOriginApiPath=normalizeSameOriginApiPath(apiBase);
  return ((input,init)=>{
    if (input instanceof Request) {
      return Promise.reject(new Error(
        "PROXY_FETCH_REQUEST_INPUT_UNSUPPORTED: pass a URL plus init so method, headers, and body forward faithfully"
      ));
    }
    const contractUrl=new URL(String(input));
    return fetchImplementation(
      `${sameOriginApiPath}${contractUrl.pathname}${contractUrl.search}`,init
    );
  }) as typeof fetch;
}

export function createBrowserContractClient(
  fetchImplementation: typeof fetch = fetch,
  apiBase: string = API_BASE
): ContractClient {
  const contractOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return createContractClient(
    contractOrigin,createSameOriginFetch(apiBase,fetchImplementation),{ mode:"cookie" }
  );
}

export const contractClient: ContractClient = createBrowserContractClient();
