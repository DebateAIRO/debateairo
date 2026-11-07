import type { CryptoEnvelope } from "@debateai/crypto";
import type { AccountMemoryQuery } from "../account-memory.js";

/**
 * Saved questions (V4 start step, plan 2026-11-03 Task 39d; saved-questions spec 2026-11-04 §3.1, §3.14; migration 0162): the questions a
 * person has not started yet, kept in their account, at most 20 (owner answer S3 A). This module is the port the API's service uses and
 * its one PostgreSQL adapter, over 0162's five functions on the API's runtime pool (EXECUTE for debateai_billing_runtime only), beside
 * 0131's page settings. It deals in envelopes only: each part is sealed under the question's own key (owner answer S4 A) before it gets
 * here, and opened after it leaves; the account always comes from the sign-in. No words, no key and no key file pass through it.
 */

export type SavedQuestionRow = Readonly<{
  id: string;
  revision: number;
  title: CryptoEnvelope;
  /** null in list(): the list never carries the whole step 2. */
  content: CryptoEnvelope | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SavedQuestionWrite =
  | Readonly<{ outcome: "CREATED"; revision: 1 }>
  | Readonly<{ outcome: "FULL" }>
  | Readonly<{ outcome: "SAVED"; revision: number }>
  | Readonly<{ outcome: "GONE" }>
  | Readonly<{ outcome: "REVISION"; revision: number }>;

/** 0162 refused the account (22023 SAVED_QUESTION_ACCOUNT_INVALID): no active account with that owner_ref, a closing's included. */
export class SavedQuestionAccountInvalidError extends Error {
  constructor() {
    super("SAVED_QUESTION_ACCOUNT_INVALID");
    this.name = "SavedQuestionAccountInvalidError";
  }
}

export interface SavedQuestionStore {
  /** CREATED (revision 1), or FULL when the account already keeps 20 and nothing was written. */
  create(ownerRef: string, id: string, title: CryptoEnvelope, content: CryptoEnvelope): Promise<SavedQuestionWrite>;
  /** SAVED with the next revision, GONE (no such row of this account), or REVISION with the current one (another window saved first). */
  save(ownerRef: string, id: string, revision: number, title: CryptoEnvelope, content: CryptoEnvelope): Promise<SavedQuestionWrite>;
  /** The newest first, at most `limit` (1..20), without content. */
  list(ownerRef: string, limit: number): Promise<readonly SavedQuestionRow[]>;
  /** null for a missing row and for another account's row alike. */
  read(ownerRef: string, id: string): Promise<SavedQuestionRow | null>;
  remove(ownerRef: string, id: string): Promise<"DELETED" | "GONE">;
}

const CREATE_SQL = "SELECT identity.create_saved_question($1,$2,$3::jsonb,$4::jsonb) AS answer";
const SAVE_SQL = "SELECT identity.save_saved_question($1,$2,$3,$4::jsonb,$5::jsonb) AS answer";
const LIST_SQL = "SELECT identity.read_saved_questions($1,$2) AS answer";
const READ_SQL = "SELECT identity.read_saved_question($1,$2) AS answer";
const DELETE_SQL = "SELECT identity.delete_saved_question($1,$2) AS answer";

const invalid = (): never => { throw new TypeError("SAVED_QUESTION_ROW_INVALID"); };

type Raw = Readonly<Record<string, unknown>>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

/** The stored envelope, exactly its five members (0162's CHECKs hold the same shape). */
function envelopeOf(value: unknown): CryptoEnvelope {
  if (!isObject(value) || Object.keys(value).length !== 5 || value.v !== 1 || typeof value.keyId !== "string"
    || typeof value.nonce !== "string" || typeof value.ct !== "string" || typeof value.tag !== "string") return invalid();
  return Object.freeze({ v: 1, keyId: value.keyId, nonce: value.nonce, ct: value.ct, tag: value.tag });
}

/** A timestamp from jsonb (an ISO string with an offset). */
function dateOf(value: unknown): Date {
  const at = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null;
  return at === null || Number.isNaN(at.getTime()) ? invalid() : at;
}

const revisionOf = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : invalid();

function rowOf(value: unknown, withContent: boolean): SavedQuestionRow {
  if (!isObject(value) || typeof value.saved_question_id !== "string") return invalid();
  return Object.freeze({
    id: value.saved_question_id,
    revision: revisionOf(value.revision),
    title: envelopeOf(value.title_ciphertext),
    content: withContent ? envelopeOf(value.content_ciphertext) : null,
    createdAt: dateOf(value.created_at),
    updatedAt: dateOf(value.updated_at)
  });
}

function writeOf(value: unknown): SavedQuestionWrite {
  if (!isObject(value)) return invalid();
  const outcome = value.outcome;
  if (outcome === "CREATED") return value.revision === 1 ? Object.freeze({ outcome: "CREATED", revision: 1 }) : invalid();
  if (outcome === "FULL" || outcome === "GONE") return Object.freeze({ outcome });
  if (outcome === "SAVED" || outcome === "REVISION") return Object.freeze({ outcome, revision: revisionOf(value.revision) });
  return invalid();
}

/** 22023 SAVED_QUESTION_ACCOUNT_INVALID is the account's refusal; every other error is the caller's to see as it came. */
async function accountChecked<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const record = error as Readonly<{ code?: unknown; message?: unknown }> | null;
    if (record !== null && typeof record === "object" && record.code === "22023" && record.message === "SAVED_QUESTION_ACCOUNT_INVALID") {
      throw new SavedQuestionAccountInvalidError();
    }
    throw error;
  }
}

/** The adapter over 0162's five API functions; it calls nothing else of the database. */
export function savedQuestionStoreFrom(query: AccountMemoryQuery): SavedQuestionStore {
  const answer = async (text: string, values: unknown[]): Promise<unknown> => (await query(text, values)).rows[0]?.answer;
  return Object.freeze({
    create: async (ownerRef: string, id: string, title: CryptoEnvelope, content: CryptoEnvelope) => accountChecked(async () =>
      writeOf(await answer(CREATE_SQL, [ownerRef, id, JSON.stringify(title), JSON.stringify(content)]))),
    save: async (ownerRef: string, id: string, revision: number, title: CryptoEnvelope, content: CryptoEnvelope) => accountChecked(async () =>
      writeOf(await answer(SAVE_SQL, [ownerRef, id, revision, JSON.stringify(title), JSON.stringify(content)]))),
    list: async (ownerRef: string, limit: number) => {
      const rows = await answer(LIST_SQL, [ownerRef, limit]);
      return Array.isArray(rows) ? Object.freeze(rows.map((row) => rowOf(row, false))) : invalid();
    },
    read: async (ownerRef: string, id: string) => {
      const row = await answer(READ_SQL, [ownerRef, id]);
      return row === null || row === undefined ? null : rowOf(row, true);
    },
    remove: async (ownerRef: string, id: string) => {
      const outcome = await answer(DELETE_SQL, [ownerRef, id]);
      return outcome === "DELETED" || outcome === "GONE" ? outcome : invalid();
    }
  });
}
