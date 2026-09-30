import { randomUUID } from "node:crypto";
import { sealRecord } from "@debateai/crypto";
import type { SignUpAcceptanceRow } from "@debateai/db";
import { isCurrentDocument, type LegalDocumentPair } from "@debateai/legal-manifest";
import type { RegisterLegalDocuments } from "@debateai/contract";

/**
 * Paid plans L3b/L4 (spec 2026-09-29 §2.3.2) — the API side of the acceptance record.
 *
 * A pair is accepted only when it is the manifest's CURRENT pair for the locale the person read, or
 * for English: the UI falls back to the English document when a locale chunk cannot load
 * (apps/ui/components/consent/useLegalDocument.ts), and the record then says "en", which is what
 * was on the screen. (This English fallback is wider than the spec's "the manifest's current pair
 * for that locale"; it is listed for the owner under the fragment's open questions.) Anything else
 * is stale: the UI reloads the page, which carries the current documents, and asks again.
 */
export type ResolvedDocument = LegalDocumentPair & Readonly<{ locale: string }>;
export type SignUpDocuments = Readonly<{ terms: ResolvedDocument; privacy: ResolvedDocument }>;

const FALLBACK_LOCALE = "en";
const EVIDENCE_TABLE = "legal.acceptance";
const EVIDENCE_COLUMN = "evidence_ciphertext";
/** The bounds registration.ts:530-539 (`sourceContext`) puts on the same two values before they reach the audit. */
const EVIDENCE_IP_CHARACTERS = 64;
const EVIDENCE_USER_AGENT_CHARACTERS = 256;

export function resolveDocument(
  kind: "TERMS" | "PRIVACY",
  locale: string,
  pair: LegalDocumentPair
): ResolvedDocument | null {
  if (isCurrentDocument(kind, locale, pair)) return Object.freeze({ ...pair, locale });
  if (isCurrentDocument(kind, FALLBACK_LOCALE, pair)) return Object.freeze({ ...pair, locale: FALLBACK_LOCALE });
  return null;
}

export function resolveSignUpDocuments(raw: RegisterLegalDocuments | undefined): SignUpDocuments | null {
  if (raw === undefined) return null;
  const terms = resolveDocument("TERMS", raw.locale, raw.terms);
  const privacy = resolveDocument("PRIVACY", raw.locale, raw.privacy);
  return terms === null || privacy === null ? null : Object.freeze({ terms, privacy });
}

/**
 * {ip, user_agent} at that moment, sealed under the records key and bound to its own row. The ONE
 * sealer, so the ONE place the values are bounded: every caller (sign-up, re-acceptance, P8c's
 * checkout, P15's erasure rows) passes the raw request source, and a user agent near Node's 16 KiB
 * header limit would otherwise raise 0079's CHECK (octet_length <= 4096) as a 500.
 */
export function sealAcceptanceEvidence(
  recordsKey: Buffer,
  acceptanceId: string,
  source: Readonly<{ ip: string; userAgent: string }>
): Readonly<{ evidenceCiphertext: Buffer; keyId: string }> {
  const userAgent = source.userAgent.trim();
  const evidence = {
    ip: source.ip.slice(0, EVIDENCE_IP_CHARACTERS),
    user_agent: (userAgent === "" ? "unknown" : userAgent).slice(0, EVIDENCE_USER_AGENT_CHARACTERS)
  };
  const sealed = sealRecord(recordsKey, {
    table: EVIDENCE_TABLE, column: EVIDENCE_COLUMN, rowId: acceptanceId
  }, Buffer.from(JSON.stringify(evidence), "utf8"));
  return Object.freeze({ evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId });
}

/**
 * The three sign-up rows. ADULT records the adult affirmation under the Terms that state the age
 * rule, so it carries the Terms pair.
 */
export function signUpAcceptanceRows(input: Readonly<{
  recordsKey: Buffer;
  documents: SignUpDocuments;
  source: Readonly<{ ip: string; userAgent: string }>;
}>): ReadonlyArray<SignUpAcceptanceRow> {
  const row = (kind: SignUpAcceptanceRow["kind"], document: ResolvedDocument): SignUpAcceptanceRow => {
    const acceptanceId = randomUUID();
    return Object.freeze({
      acceptanceId,
      kind,
      documentVersion: document.version,
      documentSha256: document.sha256,
      locale: document.locale,
      ...sealAcceptanceEvidence(input.recordsKey, acceptanceId, input.source)
    });
  };
  return Object.freeze([
    row("ADULT", input.documents.terms),
    row("TERMS", input.documents.terms),
    row("PRIVACY_SHOWN", input.documents.privacy)
  ]);
}
