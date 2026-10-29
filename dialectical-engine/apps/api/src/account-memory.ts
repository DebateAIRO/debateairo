import type {
  AccountReadingLevel,
  DigLinkRecordRequest,
  DigLinks,
  LastVisit,
  VisitItems
} from "@debateai/contract";

/**
 * V4 account memory (owner rulings N7 and N11, 2026-10-29; migration 0130): the reading level, the last visit of each
 * debate and each dig's link, kept in the person's account instead of the browser. This module is the port the routes
 * use and its one PostgreSQL adapter, over 0130's functions on the API's runtime pool (EXECUTE for
 * debateai_billing_runtime only). Ownership is decided in the database: every function checks that each run it touches
 * is the caller's (0130's identity.page_memory_run_owned) and answers "not owned" otherwise, which the routes turn into
 * the closed 404 every run-owner route answers. Nothing here stores or returns question or answer text.
 */

export type DigLinkOutcome = "RECORDED" | "NOT_OWNED" | "CONFLICT";

export interface AccountMemoryStore {
  /** The account's level, or null before the person first chooses one. */
  readReadingLevel(ownerRef: string): Promise<AccountReadingLevel | null>;
  saveReadingLevel(ownerRef: string, level: AccountReadingLevel): Promise<AccountReadingLevel>;
  /** null: the debate is not this account's. */
  readLastVisit(ownerRef: string, runId: string): Promise<LastVisit | null>;
  /** The time the snapshot was saved, or null when the debate is not this account's. */
  recordLastVisit(ownerRef: string, runId: string, items: VisitItems): Promise<Date | null>;
  /** null: the debate is not this account's. */
  readDigLinks(ownerRef: string, runId: string): Promise<DigLinks | null>;
  recordDigLink(ownerRef: string, parentRunId: string, link: DigLinkRecordRequest): Promise<DigLinkOutcome>;
}

/** 0130 refused what it was asked to store (SQLSTATE 22023): the route answers 400 MALFORMED_REQUEST. */
export class AccountMemoryInputError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AccountMemoryInputError";
  }
}

/** One query on the API's runtime pool; main.ts passes `pool.query`. */
export type AccountMemoryQuery = (
  text: string,
  values: unknown[]
) => Promise<Readonly<{ rows: readonly Readonly<Record<string, unknown>>[] }>>;

const READ_LEVEL_SQL = "SELECT identity.read_page_reading_level($1) AS reading_level";
const SAVE_LEVEL_SQL = "SELECT identity.save_page_reading_level($1,$2) AS reading_level";
const READ_VISIT_SQL = "SELECT owned, seen_at, items FROM identity.read_debate_last_visit($1,$2)";
const RECORD_VISIT_SQL = "SELECT identity.record_debate_last_visit($1,$2,$3::jsonb) AS seen_at";
const READ_DIGS_SQL = "SELECT identity.read_dig_links($1,$2) AS links";
const RECORD_DIG_SQL = "SELECT identity.record_dig_link($1,$2,$3,$4::text[],$5) AS outcome";

const OUTCOMES: ReadonlySet<string> = new Set<DigLinkOutcome>(["RECORDED", "NOT_OWNED", "CONFLICT"]);

/** A timestamp from the driver (Date) or from jsonb (an ISO string with an offset), as the contract's UTC ISO string. */
function isoOf(value: unknown): string {
  const at = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (at === null || Number.isNaN(at.getTime())) throw new TypeError("ACCOUNT_MEMORY_ROW_INVALID");
  return at.toISOString();
}

type RawLink = Readonly<{ parent_run_id?: unknown; child_run_id?: unknown; places?: unknown; mode?: unknown; created_at?: unknown }>;
function linkOf(raw: RawLink): DigLinks["children"][number] {
  return {
    parent_run_id: String(raw.parent_run_id),
    child_run_id: String(raw.child_run_id),
    places: Array.isArray(raw.places) ? raw.places.map(String) : [],
    mode: raw.mode === "thorough" ? "thorough" : "quick",
    created_at: isoOf(raw.created_at)
  };
}

/** 22023 is 0130's own refusal of a value (it validates before any read); everything else is the caller's to see. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const record = error as Readonly<{ code?: unknown; message?: unknown }> | null;
    if (record !== null && typeof record === "object" && record.code === "22023") {
      throw new AccountMemoryInputError(typeof record.message === "string" ? record.message : "ACCOUNT_MEMORY_INPUT_INVALID");
    }
    throw error;
  }
}

export function accountMemoryStoreFrom(query: AccountMemoryQuery): AccountMemoryStore {
  return Object.freeze({
    readReadingLevel: async (ownerRef: string) => {
      const value = (await query(READ_LEVEL_SQL, [ownerRef])).rows[0]?.reading_level;
      return value === "plain" || value === "background" || value === "expert" ? value : null;
    },
    saveReadingLevel: async (ownerRef: string, level: AccountReadingLevel) => refusing(async () => {
      const value = (await query(SAVE_LEVEL_SQL, [ownerRef, level])).rows[0]?.reading_level;
      if (value !== level) throw new TypeError("ACCOUNT_MEMORY_ROW_INVALID");
      return level;
    }),
    readLastVisit: async (ownerRef: string, runId: string) => {
      const row = (await query(READ_VISIT_SQL, [ownerRef, runId])).rows[0];
      if (row?.owned !== true) return null;
      if (row.seen_at === null || row.seen_at === undefined) return { seen_at: null, items: null };
      return { seen_at: isoOf(row.seen_at), items: row.items as VisitItems };
    },
    recordLastVisit: async (ownerRef: string, runId: string, items: VisitItems) => refusing(async () => {
      const value = (await query(RECORD_VISIT_SQL, [ownerRef, runId, JSON.stringify(items)])).rows[0]?.seen_at;
      return value === null || value === undefined ? null : new Date(isoOf(value));
    }),
    readDigLinks: async (ownerRef: string, runId: string) => {
      const links = (await query(READ_DIGS_SQL, [ownerRef, runId])).rows[0]?.links as
        Readonly<{ parent?: RawLink | null; children?: readonly RawLink[] }> | null | undefined;
      if (links === null || links === undefined) return null;
      return {
        parent: links.parent === null || links.parent === undefined ? null : linkOf(links.parent),
        children: (links.children ?? []).map(linkOf)
      };
    },
    recordDigLink: async (ownerRef: string, parentRunId: string, link: DigLinkRecordRequest) => refusing(async () => {
      const outcome = (await query(RECORD_DIG_SQL, [ownerRef, parentRunId, link.child_run_id, [...link.places], link.mode])).rows[0]?.outcome;
      if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) throw new TypeError("ACCOUNT_MEMORY_ROW_INVALID");
      return outcome as DigLinkOutcome;
    })
  });
}
