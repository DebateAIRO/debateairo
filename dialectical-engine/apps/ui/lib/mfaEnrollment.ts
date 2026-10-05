import { API_BASE, createSameOriginFetch } from "./api.js";

export class MfaEnrollmentHttpError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "MfaEnrollmentHttpError";
  }
}

async function postMfa(
  path: string,
  body: Readonly<Record<string, string>>,
  fetchImplementation: typeof fetch = fetch,
  apiBase: string = API_BASE
): Promise<unknown> {
  const sameOriginFetch = apiBase === API_BASE && fetchImplementation === fetch
    ? createSameOriginFetch(API_BASE)
    : createSameOriginFetch(apiBase, fetchImplementation);
  const response = await sameOriginFetch(new URL(path, "http://contract.invalid").toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new MfaEnrollmentHttpError(
      typeof payload.error === "string" ? payload.error : "MFA_REQUEST_FAILED",
      response.status
    );
  }
  return payload;
}

export async function verifyMfaEmail(
  token: string,
  fetchImplementation: typeof fetch = fetch,
  apiBase: string = API_BASE
): Promise<void> {
  const payload = await postMfa(
    "/v1/auth/verify-email",
    { token },
    fetchImplementation,
    apiBase
  ) as Record<string, unknown>;
  if (payload.status !== "mfa_required") {
    throw new MfaEnrollmentHttpError("MFA_RESPONSE_INVALID", 502);
  }
}

type EnrollmentLocation = Readonly<{ href: string }>;
type EnrollmentHistory = Readonly<{
  state: unknown;
  replaceState(state: unknown, unused: string, url?: string | URL | null): void;
}>;

/** Scrub all token parameters before requests; ambiguity and malformed bearers have no authority. */
export function takeFragmentToken(location: EnrollmentLocation, history: EnrollmentHistory, acceptLegacyQuery = false): string | null {
  const url = new URL(location.href);
  const queryTokens: string[] = [];
  for (const [key,value] of url.searchParams) if (/^token(?:%|$)/i.test(key)) queryTokens.push(key.toLowerCase()==="token"?value:"");
  for (const key of [...url.searchParams.keys()]) if (/^token(?:%|$)/i.test(key)) url.searchParams.delete(key);
  const fragmentTokens: string[] = [], keep: string[] = [];
  for (const piece of url.hash.slice(1).split("&").filter(Boolean)) {
    let key: string;
    try { key = decodeURIComponent(piece.split("=",1)[0]!).toLowerCase(); } catch { key = piece.split("=",1)[0]!.toLowerCase(); }
    if (key === "token" || /^token(?:%|$)/i.test(key)) {
      try { fragmentTokens.push(key==="token"&&piece.includes("=")?decodeURIComponent(piece.slice(piece.indexOf("=")+1)):""); } catch { fragmentTokens.push(""); }
    } else keep.push(piece);
  }
  const tokens = [...queryTokens,...fragmentTokens];
  if (tokens.length) history.replaceState(history.state,"",`${url.pathname}${url.search}${keep.length ? `#${keep.join("&")}` : ""}`);
  if (tokens.length !== 1 || (!acceptLegacyQuery && queryTokens.length) || !/^[A-Za-z0-9_-]{43}$/.test(tokens[0]!)) return null;
  return tokens[0]!;
}
export async function consumeMailedEnrollmentTokenFromUrl(location: EnrollmentLocation, history: EnrollmentHistory, verify: (token:string)=>Promise<void> = verifyMfaEmail): Promise<string|null> {
  const token = takeFragmentToken(location,history,true);
  if (!token) return null;
  await verify(token);
  return token;
}
