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

/**
 * Takes the mailed bearer out of browser-visible navigation state before the
 * first network await, then proves email possession through the same-origin
 * verification route. The returned value lives only in the current component
 * state; this helper never writes browser storage or a cookie.
 */
export async function consumeMailedEnrollmentTokenFromUrl(
  location: EnrollmentLocation,
  history: EnrollmentHistory,
  verify: (token: string) => Promise<void> = verifyMfaEmail
): Promise<string | null> {
  const url = new URL(location.href);
  const token = url.searchParams.get("token");
  if (token === null) return null;
  url.searchParams.delete("token");
  const query = url.searchParams.toString();
  history.replaceState(
    history.state,
    "",
    `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`
  );
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
