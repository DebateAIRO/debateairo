import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";

export const RETIRED_DEV_HEADER = ["x", "user", "dev", "token"].join("-");
export const TEST_APP_ORIGIN = "https://app.debateai.test";

function tokenFor(label: string): string {
  return createHash("sha256").update(`test-http-session:${label}`, "utf8").digest("base64url");
}

function tokenHash(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

export interface TestHttpIdentity {
  readonly rawSessionToken: string;
  readonly rawCsrfToken: string;
  readonly authenticated: AuthenticatedSession;
}

export function testHttpIdentity(label: string): TestHttpIdentity {
  const rawSessionToken = tokenFor(`${label}:session`);
  const rawCsrfToken = tokenFor(`${label}:csrf`);
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  return Object.freeze({
    rawSessionToken,
    rawCsrfToken,
    authenticated: Object.freeze({
      session: Object.freeze({
        asker_id: `owner:${ownerRef}`,
        session_id: sessionId,
        caller_scope: "ASKER" as const,
        ownership_provenance: "server_session" as const,
        provisional_identity_model: false as const
      }),
      userId,
      ownerRef,
      tokenHash: tokenHash(rawSessionToken),
      csrfTokenHash: tokenHash(rawCsrfToken),
      authKind: "cookie" as const
    })
  });
}

export function testSessionApplication(
  identities: readonly TestHttpIdentity[]
): SessionApplication {
  const application:SessionApplication={
    authenticate: async (presented) => identities.find(
      (identity) => identity.rawSessionToken === presented
    )?.authenticated ?? null,
    verifyCsrf: (authenticated, supplied) => identities.some(
      (identity) => identity.authenticated === authenticated && identity.rawCsrfToken === supplied
    ),
    beginLogin: async () => ({ status: "mfa_required" as const, challengeToken: tokenFor("challenge") }),
    completeLogin: async () => {
      const identity = identities[0];
      if (identity === undefined) throw new Error("TEST_SESSION_IDENTITY_REQUIRED");
      return {
        status: "authenticated" as const,
        sessionToken: identity.rawSessionToken,
        csrfToken: identity.rawCsrfToken,
        session: identity.authenticated.session
      };
    },
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => identities.length,
    stepUp: async () => {
      const identity = identities[0];
      if (identity === undefined) throw new Error("TEST_SESSION_IDENTITY_REQUIRED");
      return { sessionToken: identity.rawSessionToken, csrfToken: identity.rawCsrfToken };
    }
  };
  return Object.freeze(application);
}

export function testSessionHeaders(
  identity: TestHttpIdentity,
  mutating = false,
  origin = TEST_APP_ORIGIN
): Readonly<Record<string, string>> {
  return Object.freeze({
    cookie: `__Host-debateai-session=${identity.rawSessionToken}; __Host-debateai-csrf=${identity.rawCsrfToken}`,
    "user-agent": `test-http-session/${identity.authenticated.session.session_id}`,
    ...(mutating ? { origin, "x-csrf-token": identity.rawCsrfToken } : {})
  });
}
