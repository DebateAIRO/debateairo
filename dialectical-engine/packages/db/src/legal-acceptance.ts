import type { Pool, PoolClient } from "pg";

/**
 * Paid plans L3a (spec 2026-09-29 §2.3.2) — the acceptance record, legal.acceptance (0080).
 *
 * Append-only and keyed by owner_ref with no foreign key: it outlives the account. The evidence
 * ({ip, user_agent}) arrives ALREADY sealed under the records key; this package never holds that
 * key. `acceptanceId` is chosen by the caller because the evidence's AAD binds it (rowId).
 */
export type AcceptanceKind = "TERMS" | "PRIVACY_SHOWN" | "RENEWAL_TERMS" | "IMMEDIATE_START" | "ADULT";
export type AcceptanceSurface = "SIGN_UP" | "CHECKOUT" | "REACCEPT" | "UPGRADE" | "CARD_CHANGE";

export type AcceptanceInput = Readonly<{
  acceptanceId: string;
  ownerRef: string;
  kind: AcceptanceKind;
  documentVersion: string;
  documentSha256: string;
  locale: string;
  surface: AcceptanceSurface;
  acceptedAt: Date;
  evidenceCiphertext: Buffer;
  keyId: string;
}>;

/** A sign-up row before the account (and so its owner_ref) exists: 0080's consent wrapper fills it in. */
export type SignUpAcceptanceRow = Readonly<{
  acceptanceId: string;
  kind: "ADULT" | "TERMS" | "PRIVACY_SHOWN";
  documentVersion: string;
  documentSha256: string;
  locale: string;
  evidenceCiphertext: Buffer;
  keyId: string;
}>;

export class AcceptanceRepository {
  constructor(private readonly pool: Pool) {}

  /** Inside the caller's transaction (checkout writes these beside its own rows). */
  async record(client: PoolClient, rows: ReadonlyArray<AcceptanceInput>): Promise<void> {
    for (const row of rows) {
      await client.query(`
        INSERT INTO legal.acceptance(
          acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,
          accepted_at,evidence_ciphertext,key_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        row.acceptanceId, row.ownerRef, row.kind, row.documentVersion, row.documentSha256,
        row.locale, row.surface, row.acceptedAt, row.evidenceCiphertext, row.keyId
      ]);
    }
  }

  /** Its own transaction: every row lands, or none does. */
  async recordAll(rows: ReadonlyArray<AcceptanceInput>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.record(client, rows);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * The newest acceptance of `kind` for this owner — its version, its document hash and its locale
   * together, all from ONE row, so a caller can name exactly the document that was accepted (P17's M1
   * attaches that Terms text; L4 reads only the version). Null when the owner holds no such row.
   */
  async latest(ownerRef: string, kind: AcceptanceKind): Promise<{
    documentVersion: string; documentSha256: string; locale: string; acceptedAt: Date;
  } | null> {
    const result = await this.pool.query<{
      document_version: string; document_sha256: string; locale: string; accepted_at: Date;
    }>(`
      SELECT document_version,document_sha256,locale,accepted_at FROM legal.acceptance
      WHERE owner_ref=$1 AND kind=$2
      ORDER BY accepted_at DESC, recorded_at DESC
      LIMIT 1
    `, [ownerRef, kind]);
    const row = result.rows[0];
    return row === undefined ? null : {
      documentVersion: row.document_version,
      documentSha256: row.document_sha256,
      locale: row.locale,
      acceptedAt: row.accepted_at
    };
  }
}
