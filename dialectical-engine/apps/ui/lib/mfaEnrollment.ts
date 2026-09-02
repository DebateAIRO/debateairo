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

const TOKEN_FRAGMENT_PREFIX = "token=";

/** The `&`-separated pieces of a fragment; an empty fragment has none. */
function fragmentPieces(hash: string): string[] {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  return body === "" ? [] : body.split("&");
}

function navigationPath(url: URL, pieces: readonly string[]): string {
  return `${url.pathname}${url.search}${pieces.length === 0 ? "" : `#${pieces.join("&")}`}`;
}

/**
 * Takes the mailed bearer out of browser-visible navigation state before the
 * first network await, then proves email possession through the same-origin
 * verification route. The returned value lives only in the current component
 * state; this helper never writes browser storage or a cookie.
 *
 * The mail carries the bearer in the URL fragment (`#token=…`), which the
 * browser never sends to a server, proxy or access log (L3-F8); this helper
 * runs only after hydration, so SSR never sees it either. The retired query
 * form (`?token=…`) is still read for one release: it is first rewritten to the
 * fragment form so the query form leaves navigation state, then consumed
 * exactly like a fragment bearer.
 */
export async function consumeMailedEnrollmentTokenFromUrl(
  location: EnrollmentLocation,
  history: EnrollmentHistory,
  verify: (token: string) => Promise<void> = verifyMfaEmail
): Promise<string | null> {
  const url = new URL(location.href);
  let pieces = fragmentPieces(url.hash);
  const legacyToken = url.searchParams.get("token");
  if (legacyToken !== null) {
    url.searchParams.delete("token");
    pieces = [...pieces, `${TOKEN_FRAGMENT_PREFIX}${legacyToken}`];
    history.replaceState(history.state, "", navigationPath(url, pieces));
  }
  const index = pieces.findIndex((piece) => piece.startsWith(TOKEN_FRAGMENT_PREFIX));
  if (index === -1) return null;
  const token = pieces[index]!.slice(TOKEN_FRAGMENT_PREFIX.length);
  history.replaceState(history.state, "", navigationPath(url, pieces.filter((_, at) => at !== index)));
  await verify(token);
  return token;
}

export async function beginMfaEnrollment(enrollmentToken: string): Promise<Readonly<{
  secret: string;
  otpauthUri: string;
}>> {
  const payload = await postMfa("/v1/auth/mfa/totp/begin", {
    enrollment_token: enrollmentToken
  }) as Record<string, unknown>;
  if (payload.status !== "verification_required" || typeof payload.secret !== "string"
    || !/^[A-Z2-7]{32}$/.test(payload.secret) || typeof payload.otpauthUri !== "string"
    || !payload.otpauthUri.startsWith("otpauth://totp/")) {
    throw new MfaEnrollmentHttpError("MFA_RESPONSE_INVALID", 502);
  }
  return Object.freeze({ secret: payload.secret, otpauthUri: payload.otpauthUri });
}

export async function verifyMfaTotp(enrollmentToken: string, code: string): Promise<void> {
  const payload = await postMfa("/v1/auth/mfa/totp/verify", {
    enrollment_token: enrollmentToken,
    code
  }) as Record<string, unknown>;
  if (payload.status !== "recovery_codes_required") {
    throw new MfaEnrollmentHttpError("MFA_RESPONSE_INVALID", 502);
  }
}

export async function createMfaRecoveryCodes(enrollmentToken: string): Promise<readonly string[]> {
  const payload = await postMfa("/v1/auth/mfa/recovery-codes/generate", {
    enrollment_token: enrollmentToken
  }) as Record<string, unknown>;
  if (payload.status !== "confirmation_required" || !Array.isArray(payload.recoveryCodes)
    || payload.recoveryCodes.length !== 10
    || payload.recoveryCodes.some((code) => typeof code !== "string")) {
    throw new MfaEnrollmentHttpError("MFA_RESPONSE_INVALID", 502);
  }
  return Object.freeze([...payload.recoveryCodes] as string[]);
}

export async function confirmMfaRecoveryCode(
  enrollmentToken: string,
  recoveryCode: string
): Promise<void> {
  const payload = await postMfa("/v1/auth/mfa/recovery-codes/confirm", {
    enrollment_token: enrollmentToken,
    recovery_code: recoveryCode
  }) as Record<string, unknown>;
  if (payload.status !== "active") throw new MfaEnrollmentHttpError("MFA_RESPONSE_INVALID", 502);
}
