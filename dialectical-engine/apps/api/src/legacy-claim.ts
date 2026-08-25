import type { PostgresLegacyRunClaimRepository } from "@debateai/db";
import type { AuthenticatedSession } from "./sessions.js";
import type { AuthSourceContext } from "@debateai/db";

export interface LegacyRunClaimApplication {
  claim(input: Readonly<{
    authenticated: AuthenticatedSession;
    legacyToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{
    status:"CLAIMED"|"NO_MATCH"|"SESSION_INVALID";
    claimedCount:number;
  }>>;
}

export class PostgresLegacyRunClaimApplication implements LegacyRunClaimApplication {
  constructor(private readonly repository: PostgresLegacyRunClaimRepository) {}

  claim(input: Readonly<{
    authenticated: AuthenticatedSession;
    legacyToken: string;
    source: AuthSourceContext;
  }>) {
    return this.repository.claim({
      userId:input.authenticated.userId,
      ownerRef:input.authenticated.ownerRef,
      sessionId:input.authenticated.session.session_id,
      sessionTokenHash:input.authenticated.tokenHash,
      legacyToken:input.legacyToken,
      source:input.source
    });
  }
}
