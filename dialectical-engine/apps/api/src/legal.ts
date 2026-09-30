import { randomUUID } from "node:crypto";
import { sealRecord } from "@debateai/crypto";
import type { AcceptanceInput, AcceptanceKind, AcceptanceRepository, SignUpAcceptanceRow } from "@debateai/db";
import {
  currentDocument,
  documentVersionAtLeast,
  isCurrentDocument,
  reacceptanceFloor,
  type LegalDocumentPair
} from "@debateai/legal-manifest";
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
 * header limit would otherwise raise 0080's CHECK (octet_length <= 4096) as a 500.
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

export type ReacceptableKind = "TERMS" | "PRIVACY";
export type LegalStatusDocument = Readonly<{ kind: ReacceptableKind; version: string; sha256: string }>;

export interface LegalAcceptanceApplication {
  /** The documents this person must accept again, in the locale they read in (English if absent). */
  status(ownerRef: string, locale: string): Promise<ReadonlyArray<LegalStatusDocument>>;
  /**
   * The billing routes' gate (LEGAL_REACCEPTANCE_REQUIRED). An account with no record of a document
   * owes it in hosted mode, whatever the floor, and in local mode only when the manifest's floor is
   * set; an account with a record owes it once that record is below the floor.
   */
  requiresReacceptance(ownerRef: string): Promise<boolean>;
  accept(input: Readonly<{
    ownerRef: string;
    locale: string;
    documents: ReadonlyArray<LegalStatusDocument>;
    source: Readonly<{ ip: string; userAgent: string }>;
  }>): Promise<"ACCEPTED" | "STALE">;
}

const REACCEPTABLE: readonly ReacceptableKind[] = Object.freeze(["TERMS", "PRIVACY"]);
const RECORD_KIND: Readonly<Record<ReacceptableKind, AcceptanceKind>> = Object.freeze({
  TERMS: "TERMS", PRIVACY: "PRIVACY_SHOWN"
});

export class RepositoryLegalAcceptanceApplication implements LegalAcceptanceApplication {
  private readonly clock: () => Date;
  private readonly floorOf: (kind: ReacceptableKind) => string | null;

  constructor(private readonly options: Readonly<{
    acceptances: Pick<AcceptanceRepository, "latest" | "recordAll">;
    recordsKey: Buffer;
    /**
     * true in hosted mode: an account with no record owes the document whatever the floor; false in
     * local mode, where only a floor makes a document owed (spec §2.2 rule 1, §2.3.2). Required, so
     * no composition can fall into either rule by omission.
     */
    owedWithoutRecord: boolean;
    clock?: () => Date;
    /** The manifest's floor unless a test supplies one. */
    floorOf?: (kind: ReacceptableKind) => string | null;
  }>) {
    this.clock = options.clock ?? (() => new Date());
    this.floorOf = options.floorOf ?? reacceptanceFloor;
  }

  /**
   * The documents owed. A record below the floor is owed. No record at all is owed in hosted mode
   * whatever the floor (the Terms and the Privacy Policy say a record exists; accounts created before
   * L3b hold none), and in local mode only when the manifest's floor is set — so with null floors a
   * local account sees no screen and accept() writes nothing for it. status(), requiresReacceptance()
   * and accept() all go through here, so the three agree in each mode.
   */
  private async below(ownerRef: string): Promise<ReadonlyArray<ReacceptableKind>> {
    const due: ReacceptableKind[] = [];
    for (const kind of REACCEPTABLE) {
      const latest = await this.options.acceptances.latest(ownerRef, RECORD_KIND[kind]);
      if (latest === null) {
        if (this.options.owedWithoutRecord || this.floorOf(kind) !== null) due.push(kind);
        continue;
      }
      const floor = this.floorOf(kind);
      if (floor !== null && !documentVersionAtLeast(latest.documentVersion, floor)) due.push(kind);
    }
    return due;
  }

  async status(ownerRef: string, locale: string): Promise<ReadonlyArray<LegalStatusDocument>> {
    return Object.freeze((await this.below(ownerRef)).flatMap((kind) => {
      const current = currentDocument(kind, locale) ?? currentDocument(kind, "en");
      return current === null ? [] : [Object.freeze({ kind, ...current })];
    }));
  }

  async requiresReacceptance(ownerRef: string): Promise<boolean> {
    return (await this.below(ownerRef)).length > 0;
  }

  /**
   * Every posted pair is checked FIRST, so one stale pair refuses the whole request. Then only the
   * documents still owed are recorded: legal.acceptance is append-only for the life of the account,
   * so a call when nothing is owed answers "ACCEPTED" and writes nothing (the route stays 204 and
   * idempotent, and a signed-in account cannot grow the table by posting the current pairs again).
   */
  async accept(input: Parameters<LegalAcceptanceApplication["accept"]>[0]): Promise<"ACCEPTED" | "STALE"> {
    const acceptedAt = this.clock();
    const resolvedDocuments: Array<Readonly<{ kind: ReacceptableKind; resolved: ResolvedDocument }>> = [];
    for (const document of input.documents) {
      const resolved = resolveDocument(document.kind, input.locale, document);
      if (resolved === null) return "STALE";
      resolvedDocuments.push(Object.freeze({ kind: document.kind, resolved }));
    }
    const due = new Set(await this.below(input.ownerRef));
    const rows: AcceptanceInput[] = resolvedDocuments.filter(({ kind }) => due.has(kind)).map(({ kind, resolved }) => {
      const acceptanceId = randomUUID();
      return Object.freeze({
        acceptanceId,
        ownerRef: input.ownerRef,
        kind: RECORD_KIND[kind],
        documentVersion: resolved.version,
        documentSha256: resolved.sha256,
        locale: resolved.locale,
        surface: "REACCEPT" as const,
        acceptedAt,
        ...sealAcceptanceEvidence(this.options.recordsKey, acceptanceId, input.source)
      });
    });
    if (rows.length === 0) return "ACCEPTED";
    await this.options.acceptances.recordAll(rows);
    return "ACCEPTED";
  }
}
