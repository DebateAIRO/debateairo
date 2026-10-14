import { z } from "zod";
import {
  CONTENT_JSON_SENTINEL,
  decryptLeasedContentForRun,
  encryptAttestedLeasedContentForRun,
  prepareLeasedContentEncryptionForRun,
  withRunContentLease,
  withWriteTransaction,
  type AttestedContentEnvelope,
  type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import { TypedDomainError, exhaustive } from "@debateai/kernel";
import { mapAlsoRaisedOf } from "./items.js";
import {
  MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS, MAP_MARKS, type MapAngleKind, type MapItem, type MapItemOrigin, type MapMark,
  type MapResult
} from "./types.js";

/**
 * Debate shape (spec §3.4): the map's storage. Items, the run's choice and the roots that argued each answer, in the
 * three append-only tables of migration 0117. Debate text is sealed per row (carriers core.map_item / core.map_choice)
 * on an encrypted run and kept in the clear on a legacy run, exactly as the story's repository does.
 *
 * Every readable column holds a code (ruling T7-PRIV): the repository refuses, typed and before anything is sealed or
 * stored, any id that is not code-minted. Its refusals name a field and a position only, never a value: no AI-written
 * id, claim or reason reaches an error message.
 */
export type MapChoiceAnswerRecord = Readonly<{ answerId: string; statement: string; rootIndex: number;
  rootNodeId: string | null; maker: string | null; filled: boolean }>;
export type MapAlsoRaisedRecord = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;
export type MapChoiceRecord = Readonly<{ opening: "MAP" | "TODAYS_OPENING"; answers: readonly MapChoiceAnswerRecord[];
  alsoRaised: readonly MapAlsoRaisedRecord[]; marks: readonly MapMark[] }>;
/**
 * REPOINTED (writeMapPosition only, migration 0119): the answer's position already named a root that a copy which took
 * the run over has set aside ('stale'), and now names the given root. A caller treats it as INSERTED.
 */
export type MapWriteOutcome = "INSERTED" | "ALREADY_PRESENT" | "REPOINTED" | "RUN_ERASED";

const SENTINEL = JSON.stringify(CONTENT_JSON_SENTINEL);

/**
 * Each position's root IN FORCE (migration 0119): the last re-point's root (the move no later move of the answer starts
 * from), else the position's own; its maker likewise; and whether that root has been set aside ('stale'). Ids and codes
 * only. `$1` is the run; a caller may append `AND position.answer_id = $2`.
 */
const ROOT_IN_FORCE_SQL = `SELECT position.answer_id, COALESCE(moved.root_node_id, position.root_node_id)::text AS root_node_id,
         COALESCE(moved.maker, position.maker) AS maker, node.generation_status = 'stale' AS stale
    FROM core.map_position AS position
    LEFT JOIN core.map_position_repoint AS moved
      ON moved.run_id = position.run_id AND moved.answer_id = position.answer_id
     AND NOT EXISTS (SELECT 1 FROM core.map_position_repoint AS later
                      WHERE later.run_id = moved.run_id AND later.answer_id = moved.answer_id
                        AND later.from_root_node_id = moved.root_node_id)
    JOIN core.node AS node ON node.run_id = position.run_id AND node.node_id = COALESCE(moved.root_node_id, position.root_node_id)
   WHERE position.run_id = $1`;

// 0117's code shapes, held here too so a breach is refused typed (and value-free) before any seal.
const ITEM_ID = /^[a-z]{2}[0-9]{2,4}$/u;
const ANGLE_ID = /^g[1-7]$/u;
const ANSWER_ID = /^a[1-4]$/u;
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** 0069's core.jsonb_is_code_token: one token of 1..256 characters from a closed set (no whitespace). */
const CODE_TOKEN = /^[[\]A-Za-z0-9_.:@/+>=#-]{1,256}$/u;
/** 0117's closed sets (map_item_origin_closed, _kind_closed, _leans_closed, _angle_kind_closed). */
const ORIGINS: ReadonlySet<string> = new Set<MapItemOrigin>(["BLIND", "SHOWN", "GAP"]);
const KINDS: ReadonlySet<string> = new Set<MapItem["kind"]>(["POINT", "ANSWER"]);
const LEANS: ReadonlySet<string> = new Set<string>(MAP_LEANS);
const ANGLE_KINDS: ReadonlySet<string> = new Set<MapAngleKind>([...MAP_FIXED_ANGLE_KINDS, "SPECIFIC", "GENERAL"]);
/** map_item.list_index is a PostgreSQL integer. */
const PG_INTEGER_MAX = 2_147_483_647;

const itemContent = z.union([z.object({ claim: z.string(), why: z.string() }).strict(), z.object({ answer: z.string() }).strict()]);
/** The run's map without its items (they are rows of core.map_item) and without its call records (they are ledger rows). */
const choiceContent = z.object({
  answers: z.array(z.object({ answerId: z.string(), statement: z.string(), rootIndex: z.number().int().min(0), filled: z.boolean() }).strict()),
  alsoRaised: z.array(z.object({ keyPointId: z.string(), claim: z.string(), makers: z.array(z.string()) }).strict()),
  result: z.unknown()
}).strict();
type ChoiceContent = z.infer<typeof choiceContent>;

type ItemRow = Readonly<{ item_id: string; ai_ref: string; maker: string; origin: MapItemOrigin; angle_id: string | null;
  angle_kind: MapItem["angleKind"]; kind: "POINT" | "ANSWER"; leans: string | null; list_index: number; content: unknown;
  content_ciphertext: CryptoEnvelope | null }>;

function pgError(error: unknown): { code: unknown; message: unknown } | null {
  return typeof error === "object" && error !== null ? error as { code: unknown; message: unknown } : null;
}

/** Erasure is benign for the map: the run's content is gone, so there is nothing to store or show. */
function isPrivateContentErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  const row = pgError(error);
  return row !== null && row.code === "55000" && row.message === "PRIVATE_CONTENT_ERASED";
}

/** 0117's attestation guard fires before 0040's barrier: on a run erased as 0040 erases, it answers this first. */
function isAttestationSecretUnresolved(error: unknown): boolean {
  const row = pgError(error);
  return row !== null && row.code === "55000" && row.message === "CONTENT_ATTESTATION_SECRET_UNRESOLVED";
}

const recordInvalid = (field: string): TypedDomainError => new TypedDomainError("MAP_RECORD_INVALID", `MAP_RECORD_INVALID: ${field}`);
const rowInvalid = (detail: string): TypedDomainError => new TypedDomainError("MAP_ROW_INVALID", `MAP_ROW_INVALID: ${detail}`);

function stepOf(origin: MapItemOrigin): "LIST" | "SNOWBALL" | "GAP" {
  switch (origin) {
    case "BLIND":
      return "LIST";
    case "SHOWN":
      return "SNOWBALL";
    case "GAP":
      return "GAP";
    default:
      return exhaustive(origin);
  }
}

/** The first readable field of the map that is not code-shaped, as `field` or `items[i].field`; null when all are. */
function mapRecordBreach(result: MapResult, answerCount: number): string | null {
  if (!Number.isSafeInteger(answerCount) || answerCount < 0 || answerCount > MAP_LIMITS.chooseAnswersMax) return "answerCount";
  for (const [index, item] of result.items.entries()) {
    if (!ITEM_ID.test(item.itemId)) return `items[${String(index)}].itemId`;
    if (!CODE_TOKEN.test(item.seat.aiRef)) return `items[${String(index)}].seat.aiRef`;
    if (!CODE_TOKEN.test(item.seat.maker)) return `items[${String(index)}].seat.maker`;
    if (!ORIGINS.has(item.origin)) return `items[${String(index)}].origin`;
    if (!KINDS.has(item.kind)) return `items[${String(index)}].kind`;
    if (item.kind === "POINT" && !LEANS.has(item.leans)) return `items[${String(index)}].leans`;
    if (item.angleId !== null && !ANGLE_ID.test(item.angleId)) return `items[${String(index)}].angleId`;
    if (item.angleKind !== null && !ANGLE_KINDS.has(item.angleKind)) return `items[${String(index)}].angleKind`;
    if (!Number.isSafeInteger(item.listIndex) || item.listIndex < 0 || item.listIndex > PG_INTEGER_MAX) {
      return `items[${String(index)}].listIndex`;
    }
  }
  if (new Set(result.items.map((item) => item.itemId)).size !== result.items.length) return "items.itemId";
  for (const [index, answer] of (result.choice?.answers ?? []).entries()) {
    if (!ANSWER_ID.test(answer.answerId)) return `choice.answers[${String(index)}].answerId`;
  }
  return null;
}

export class MapChoiceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * The map's items and its choice, once per run (a re-run of the same run finds them: ALREADY_PRESENT). Pre-flight
   * PF-B28a: every seal is made first (one prepared run cipher, inside the run's content lease), then ONE write
   * transaction inserts the choice FIRST and then the items, so a crash leaves neither, and a second writer of the same
   * run (a re-claim) finds the choice and writes no item: the stored items always belong to the stored choice.
   */
  async writeMapRun(input: Readonly<{ runId: string; result: MapResult; answerCount: number }>): Promise<MapWriteOutcome> {
    const { runId, result } = input;
    const breach = mapRecordBreach(result, input.answerCount);
    if (breach !== null) throw recordInvalid(breach);
    const answers = (result.choice?.answers ?? []).slice(0, input.answerCount)
      .map((answer, rootIndex) => Object.freeze({ answerId: answer.answerId, statement: answer.statement, rootIndex, filled: answer.filled }));
    // Ruling W-CUT and review m-4: the chosen answers past answerCount (never argued) and the points only they took are
    // also raised, not debated; one shared rule (mapAlsoRaisedOf) builds the list for the page and the story alike.
    const alsoRaised = mapAlsoRaisedOf({ choice: result.choice, keyPoints: result.keyPoints, mergedAnswers: result.mergedAnswers,
      arguedAnswers: input.answerCount })
      .map((entry) => Object.freeze({ keyPointId: entry.keyPointId, claim: entry.claim, makers: [...entry.makers] }));
    const { items: _items, calls: _calls, ...rest } = result;
    const content: ChoiceContent = choiceContent.parse({ answers, alsoRaised, result: rest });
    const opening = result.kind === "MAP" ? "MAP" : "TODAYS_OPENING";
    const marks = result.marks.map((record) => record.mark);
    const items = [...result.items].sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map((item) => ({ item, value: item.kind === "POINT" ? { claim: item.claim, why: item.whyItMatters } : { answer: item.answer } }));
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const present = await this.pool.query(`SELECT 1 FROM core.map_choice WHERE run_id = $1`, [runId]);
        if (present.rowCount === 1) return "ALREADY_PRESENT" as const;
        // Every seal before the transaction opens: nothing is sealed while a write transaction is open.
        const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
        let sealedChoice: AttestedContentEnvelope | null;
        let sealedItems: (AttestedContentEnvelope | null)[];
        try {
          sealedItems = items.map(({ item, value }) => encryptAttestedLeasedContentForRun(leased, "core.map_item", item.itemId, value));
          sealedChoice = encryptAttestedLeasedContentForRun(leased, "core.map_choice", runId, content);
          await leased.assertLive();
        } finally {
          await leased.close();
        }
        return await withWriteTransaction(this.pool, async (client) => {
          const inserted = await client.query(
            `INSERT INTO core.map_choice (run_id, opening, marks, content, content_ciphertext, content_attestation)
             VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) ON CONFLICT (run_id) DO NOTHING`,
            [runId, opening, JSON.stringify(marks), sealedChoice === null ? JSON.stringify(content) : SENTINEL,
              sealedChoice === null ? null : JSON.stringify(sealedChoice.envelope), sealedChoice?.attestation ?? null]
          );
          // Another writer's choice committed first: its items are already there, so this one writes none.
          if (inserted.rowCount !== 1) return "ALREADY_PRESENT" as const;
          for (const [index, { item, value }] of items.entries()) {
            const sealed = sealedItems[index] ?? null;
            // No ON CONFLICT: this transaction owns the run's choice row, so a duplicate item would be a real defect.
            await client.query(
              `INSERT INTO core.map_item (run_id, item_id, step, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, position,
                 content, content_ciphertext, content_attestation)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)`,
              [runId, item.itemId, stepOf(item.origin), item.seat.aiRef, item.seat.maker,
                item.origin, item.angleId, item.angleKind, item.kind, item.kind === "POINT" ? item.leans : null, item.listIndex,
                // The item's number in its id, which mapAssignItemIds derives from plan order.
                Number(item.itemId.slice(2)),
                sealed === null ? JSON.stringify(value) : SENTINEL, sealed === null ? null : JSON.stringify(sealed.envelope), sealed?.attestation ?? null]
            );
          }
          return "INSERTED" as const;
        });
      });
    } catch (error) {
      if (await this.#erased(error, runId)) return "RUN_ERASED";
      throw error;
    }
  }

  /**
   * Which root argued a chosen answer, once that root is saved (ids and codes only: not a content carrier). A re-claimed
   * run finds the first pass's row (ALREADY_PRESENT). When that row's root in force has been set aside (reclaim resume,
   * migration 0119: the copy that took the run over marked the dead copy's nodes 'stale' and saved its own), the
   * answer's root moves to the given one: one append-only row of core.map_position_repoint (0119's trigger checks that
   * the move starts from the root in force, which is stale, and ends on a live node of the run) — REPOINTED. The
   * position's root_index stays the first pass's. An erased run answers RUN_ERASED (0040's barrier on either table).
   */
  async writeMapPosition(input: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string; maker: string }>): Promise<MapWriteOutcome> {
    if (!ANSWER_ID.test(input.answerId)) throw recordInvalid("answerId");
    if (!Number.isSafeInteger(input.rootIndex) || input.rootIndex < 0) throw recordInvalid("rootIndex");
    if (!UUID_TEXT.test(input.rootNodeId)) throw recordInvalid("rootNodeId");
    if (!CODE_TOKEN.test(input.maker)) throw recordInvalid("maker");
    try {
      const inserted = await this.pool.query(
        `INSERT INTO core.map_position (run_id, answer_id, root_index, root_node_id, maker) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (run_id, answer_id) DO NOTHING`,
        [input.runId, input.answerId, input.rootIndex, input.rootNodeId, input.maker]
      );
      if (inserted.rowCount === 1) return "INSERTED";
      const inForce = (await this.pool.query<{ root_node_id: string; stale: boolean }>(
        `${ROOT_IN_FORCE_SQL} AND position.answer_id = $2`, [input.runId, input.answerId])).rows[0];
      if (inForce === undefined || !inForce.stale || inForce.root_node_id.toLowerCase() === input.rootNodeId.toLowerCase()) {
        return "ALREADY_PRESENT";
      }
      await this.pool.query(
        `INSERT INTO core.map_position_repoint (run_id, answer_id, from_root_node_id, root_node_id, maker) VALUES ($1,$2,$3,$4,$5)`,
        [input.runId, input.answerId, inForce.root_node_id, input.rootNodeId, input.maker]
      );
      return "REPOINTED";
    } catch (error) {
      if (await this.#erased(error, input.runId)) return "RUN_ERASED";
      throw error;
    }
  }

  /**
   * Debate shape P2c, ruling C-MAPREAD: the opening the run's map choice recorded, or null when the run has none. One
   * primary-key lookup of a code column (ids and codes only: not a content carrier), so no content lease and no
   * decryption: the debate page asks on every load, and most debates have no map. An erased run keeps its row, so this
   * may say MAP for it; `readMapChoiceForRun` then reads it as absent.
   */
  async readMapOpeningForRun(runId: string): Promise<"MAP" | "TODAYS_OPENING" | null> {
    const row = (await this.pool.query<{ opening: string }>(`SELECT opening FROM core.map_choice WHERE run_id = $1`, [runId])).rows[0];
    if (row === undefined) return null;
    if (row.opening !== "MAP" && row.opening !== "TODAYS_OPENING") throw rowInvalid("core.map_choice opening");
    return row.opening;
  }

  async readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null> {
    const read = await this.#leasedRead(runId, null, () => this.#readChoiceLeased(runId));
    if (read === null) return null;
    const positions = await this.pool.query<{ answer_id: string; root_node_id: string; maker: string }>(ROOT_IN_FORCE_SQL, [runId]);
    const byAnswer = new Map(positions.rows.map((row) => [row.answer_id, row] as const));
    return Object.freeze({
      opening: read.opening,
      marks: Object.freeze(read.marks),
      answers: Object.freeze(read.content.answers.map((answer) => Object.freeze({ ...answer,
        rootNodeId: byAnswer.get(answer.answerId)?.root_node_id ?? null, maker: byAnswer.get(answer.answerId)?.maker ?? null }))),
      alsoRaised: Object.freeze(read.content.alsoRaised.map((entry) => Object.freeze({ ...entry, makers: Object.freeze([...entry.makers]) })))
    });
  }

  /** The run's items, ordered by item id; an erased run (or one with no map) has none. */
  readMapItemsForRun(runId: string): Promise<readonly MapItem[]> {
    return this.#leasedRead(runId, Object.freeze([]), () => this.#readItemsLeased(runId));
  }

  /**
   * The whole map, as the orchestrator returned it (minus its call records): a re-claimed run reuses it, calling nothing.
   * The choice and the items are read under ONE content lease: both or neither (null), never a choice without its items.
   */
  readMapResultForRun(runId: string): Promise<MapResult | null> {
    return this.#leasedRead(runId, null, async () => {
      const read = await this.#readChoiceLeased(runId);
      if (read === null) return null;
      const items = await this.#readItemsLeased(runId);
      return Object.freeze({ ...(read.content.result as Omit<MapResult, "items" | "calls">), items, calls: Object.freeze([]) }) as MapResult;
    });
  }

  /** `read` under the run's content lease; an erased run reads as `absent`. */
  async #leasedRead<T>(runId: string, absent: T, read: () => Promise<T>): Promise<T> {
    try {
      return await withRunContentLease(this.pool, [runId], read);
    } catch (error) {
      if (isPrivateContentErased(error)) return absent;
      throw error;
    }
  }

  /** Inside the run's content lease (the caller holds it). */
  async #readItemsLeased(runId: string): Promise<readonly MapItem[]> {
    const rows = await this.pool.query<ItemRow>(
      `SELECT item_id, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, content, content_ciphertext
         FROM core.map_item WHERE run_id = $1 ORDER BY item_id`, [runId]);
    if (rows.rows.length === 0) return Object.freeze([]);
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const items = rows.rows.map((row) => itemOf(row,
        itemContent.safeParse(decryptLeasedContentForRun<unknown>(leased, "core.map_item", row.item_id, row.content_ciphertext, row.content))));
      await leased.assertLive();
      return Object.freeze(items);
    } finally {
      await leased.close();
    }
  }

  /** Inside the run's content lease (the caller holds it). */
  async #readChoiceLeased(runId: string): Promise<{ opening: "MAP" | "TODAYS_OPENING"; marks: MapMark[]; content: ChoiceContent } | null> {
    const row = (await this.pool.query<{ opening: "MAP" | "TODAYS_OPENING"; marks: unknown; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
      `SELECT opening, marks, content, content_ciphertext FROM core.map_choice WHERE run_id = $1`, [runId])).rows[0];
    if (row === undefined) return null;
    const marks = z.array(z.enum(MAP_MARKS)).safeParse(row.marks);
    if (!marks.success) throw rowInvalid("core.map_choice marks");
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const content = choiceContent.safeParse(
        decryptLeasedContentForRun<unknown>(leased, "core.map_choice", runId, row.content_ciphertext, row.content));
      if (!content.success) throw rowInvalid("core.map_choice content");
      await leased.assertLive();
      return { opening: row.opening, marks: marks.data, content: content.data };
    } finally {
      await leased.close();
    }
  }

  /**
   * RUN_ERASED for 0040's barrier (or the lease's own check), and for 0117's attestation guard's missing secret ONLY
   * when the run is an ENCRYPTED run (content_encryption_version = 1) whose private content is no longer live: a legacy
   * run is never classed as erased here, and on a live run a missing secret is a defect, and stays loud.
   */
  async #erased(error: unknown, runId: string): Promise<boolean> {
    if (isPrivateContentErased(error)) return true;
    if (!isAttestationSecretUnresolved(error)) return false;
    const confirmed = await this.pool.query<{ erased: boolean }>(
      `SELECT COALESCE(run.content_encryption_version = 1 AND NOT core.run_private_content_is_live(run.run_id), false) AS erased
         FROM core.run AS run WHERE run.run_id = $1`, [runId]);
    return confirmed.rows[0]?.erased === true;
  }
}

const LEAN = z.enum(MAP_LEANS);

function itemOf(row: ItemRow, parsed: ReturnType<typeof itemContent.safeParse>): MapItem {
  if (!parsed.success) throw rowInvalid(`core.map_item ${row.item_id}`);
  const value = parsed.data;
  const base = { itemId: row.item_id, seat: Object.freeze({ aiRef: row.ai_ref, maker: row.maker }), origin: row.origin,
    angleId: row.angle_id, angleKind: row.angle_kind, listIndex: row.list_index };
  if (row.kind === "POINT" && "claim" in value) {
    const leans = LEAN.safeParse(row.leans);
    if (!leans.success) throw rowInvalid(`core.map_item ${row.item_id}`);
    return Object.freeze({ ...base, kind: "POINT" as const, claim: value.claim, whyItMatters: value.why, leans: leans.data });
  }
  if (row.kind === "ANSWER" && "answer" in value) {
    return Object.freeze({ ...base, kind: "ANSWER" as const, answer: value.answer });
  }
  throw rowInvalid(`core.map_item ${row.item_id}`);
}

export function readMapChoiceForRun(pool: Pool, runId: string): Promise<MapChoiceRecord | null> {
  return new MapChoiceRepository(pool).readMapChoiceForRun(runId);
}
export function readMapItemsForRun(pool: Pool, runId: string): Promise<readonly MapItem[]> {
  return new MapChoiceRepository(pool).readMapItemsForRun(runId);
}
