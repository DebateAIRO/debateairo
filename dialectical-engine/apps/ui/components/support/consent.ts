/**
 * DL3-F6. Own-context consent is a server-recorded fact, so the control that
 * shows it has to read it from the server.
 *
 * The toggle used to be a local `useState(false)`. The compact widget unmounts
 * when it closes, so the next time it opened — or after any reload — the box
 * showed OFF while the API still held consent for the session, and "my debates'
 * status" kept flowing to the model behind an unticked box. The user could only
 * revoke by ticking and then unticking. A privacy control that misreports the
 * privacy state is worse than no control.
 *
 * The API states the fact on every session record it serves
 * (`consent_own_context_at`, `apps/api/src/support/index.ts` publicSession) and
 * returns the updated record from the consent route, so both the session start
 * and every change carry it. Absence of the field is UNKNOWN, not "off": this
 * parser returns null rather than inventing a negative.
 */

export type SupportConsentRecord = Readonly<{ consentOwnContextAt: string | null }>;

export function supportConsentRecordFrom(body: unknown): SupportConsentRecord | null {
  if (body === null || typeof body !== "object") return null;
  const session = (body as Readonly<Record<string, unknown>>).session;
  if (session === null || typeof session !== "object") return null;
  const at = (session as Readonly<Record<string, unknown>>).consent_own_context_at;
  if (at === null) return Object.freeze({ consentOwnContextAt: null });
  return typeof at === "string" ? Object.freeze({ consentOwnContextAt: at }) : null;
}

/** Consent is given exactly when the server recorded a time for it. */
export function supportConsentGiven(consentedAt: string | null | undefined): boolean {
  return typeof consentedAt === "string" && consentedAt.length > 0;
}
