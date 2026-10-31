import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import { decryptLeasedContentForRun, encryptAttestedContentForRun, prepareLeasedContentEncryptionForRun, withRunContentLease } from "./index.js";

/**
 * A dig's picks and its path rewrite's material (migration 0135; dig-model revision task W3-7), through 0135's definers
 * only. `PostgresDigPicksRepository` runs on the API's own pool (debateai_billing_runtime): the asks route writes a dig's
 * picks at start, each pick's text sealed under the DIG's run key here before the call. `PostgresDigPicksRunnerRepository`
 * runs on the runner's pool (debateai_runtime): the path rewrite reads the picks back (the runner's `digOf`), stores the
 * dig's own paths before it takes its turn, and the sweep lists the settled digs whose rewrite has no row.
 *
 * Carriers (packages/crypto CONTENT_CARRIERS), each checked by 0132's content trigger: `identity.dig_pick` bound to the
 * pick's number ("1", "2", …), `identity.path_rewrite_input` bound to the dig's run id. A run without content encryption
 * keeps no picks: the writer answers NOT_SEALED and calls nothing (0132's check would refuse the row).
 */
type Executor = Pick<Pool, "query">;

export const DIG_PICK_CARRIER = "identity.dig_pick" as const;
export const PATH_REWRITE_INPUT_CARRIER = "identity.path_rewrite_input" as const;
/** 0135 §6: the erasure role's deletion of one debate's picks and its rewrite's material. */
export const FORGET_ERASED_DEBATE_DIG_PICKS = "identity.forget_erased_debate_dig_picks(uuid)" as const;
export const READ_DATA_EXPORT_DIG_PICKS = "identity.read_data_export_dig_picks(uuid,uuid)" as const;

export type DigPickKind = "CONTRADICTING" | "UNDOCUMENTED" | "NEEDS_MORE_WEB" | "HELPS_MAIN_QUESTION" | "OWN_VIEW";
/** The contract's DIG_PICK_AUTHORS: who wrote a pick's text. */
export type DigPickAuthor = "AI_SUGGESTION" | "PERSON_EDITED" | "PERSON_OWN_VIEW";
export type DigPickInput = Readonly<{ kind: DigPickKind; suggestionId: string | null; place: string; author: DigPickAuthor; text: string }>;
export type DigPicksWriteOutcome = "RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_A_DIG" | "NOT_SEALED";
export type DigPickRead = Readonly<{ pickNo: number; kind: DigPickKind; suggestionId: string | null; place: string; author: DigPickAuthor;
  text: string }>;
export type DigPicksRead = Readonly<{
  runId: string; parentRunId: string;
  /** The path of the parent's map the picks are on; null: they hang under the main question (no rewrite). */
  positionRef: string | null;
  picks: readonly DigPickRead[];
  /** The rewrite's material once the runner stored it: the work item its calls name and the dig's own paths, opened. */
  input: Readonly<{ workItemId: string; value: unknown }> | null;
}>;
export type UnwrittenPathRewrite = Readonly<{
  runId: string; parentRunId: string; positionRef: string;
  /** Its turn's place in the path's line; null: it took none yet. */
  pathSeq: number | null;
  /** When it last moved: its material stored (no turn), or its turn reached the front. */
  since: string;
}>;

/** The API's writer (debateai_billing_runtime). */
export class PostgresDigPicksRepository {
  constructor(private readonly pool: Pool) {}

  /** The dig's set and every pick, at once, each text sealed under the dig's run key; NOT_SEALED: content encryption is off. */
  async record(input: Readonly<{ ownerRef: string; runId: string; parentRunId: string; positionRef: string | null;
    picks: readonly DigPickInput[] }>): Promise<DigPicksWriteOutcome> {
    return withRunContentLease(this.pool, [input.runId], async () => {
      const sealed: unknown[] = [];
      for (const [at, pick] of input.picks.entries()) {
        const content = await encryptAttestedContentForRun(this.pool, input.runId, DIG_PICK_CARRIER, String(at + 1), { text: pick.text });
        if (content === null) return "NOT_SEALED" as const;
        sealed.push({ kind: pick.kind, suggestion_id: pick.suggestionId, place: pick.place, author: pick.author,
          content: content.envelope, attestation: content.attestation.toString("hex") });
      }
      return (await this.pool.query<{ outcome: Exclude<DigPicksWriteOutcome, "NOT_SEALED"> }>(
        "SELECT identity.record_dig_picks($1,$2,$3,$4,$5::jsonb) AS outcome",
        [input.ownerRef, input.runId, input.parentRunId, input.positionRef, JSON.stringify(sealed)])).rows[0]!.outcome;
    });
  }
}

type PicksRow = Readonly<{
  run_id: string; parent_run_id: string; position_ref: string | null; pick_count: number; recorded_at: string;
  picks: readonly Readonly<{ pick_no: number; kind: DigPickKind; suggestion_id: string | null; place: string; author: DigPickAuthor;
    content: CryptoEnvelope }>[];
  input: Readonly<{ work_item_id: string; recorded_at: string; content: CryptoEnvelope }> | null;
}>;

/** The runner's side (debateai_runtime). */
export class PostgresDigPicksRunnerRepository {
  constructor(private readonly pool: Pool, private readonly executor: Executor = pool) {}

  /** A run's picks and its rewrite's material, opened under its key; null when it keeps none or is not live. */
  async read(runId: string): Promise<DigPicksRead | null> {
    const row = (await this.executor.query<{ picks: PicksRow | null }>("SELECT identity.read_dig_picks_of_run($1) AS picks", [runId]))
      .rows[0]?.picks ?? null;
    if (row === null) return null;
    if (row.picks.length !== row.pick_count) throw new TypeError("DIG_PICKS_INCOMPLETE");
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const picks = row.picks.map((pick) => {
        const opened = decryptLeasedContentForRun<unknown>(leased, DIG_PICK_CARRIER, String(pick.pick_no), pick.content, null);
        const text = typeof opened === "object" && opened !== null ? (opened as { readonly text?: unknown }).text : undefined;
        if (typeof text !== "string" || text.trim() === "") throw new TypeError("DIG_PICK_CONTENT_INVALID");
        return Object.freeze({ pickNo: pick.pick_no, kind: pick.kind, suggestionId: pick.suggestion_id, place: pick.place,
          author: pick.author, text });
      });
      const input = row.input === null ? null : Object.freeze({ workItemId: row.input.work_item_id,
        value: decryptLeasedContentForRun<unknown>(leased, PATH_REWRITE_INPUT_CARRIER, row.run_id.toLowerCase(), row.input.content, null) });
      await leased.assertLive();
      return Object.freeze({ runId: row.run_id, parentRunId: row.parent_run_id, positionRef: row.position_ref,
        picks: Object.freeze(picks), input });
    } finally {
      await leased.close();
    }
  }

  /** The dig's own paths, for its rewrite, set once before the rewrite takes its turn. */
  async recordInput(runId: string, workItemId: string, value: unknown): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_PATH" | "NOT_SEALED"> {
    return withRunContentLease(this.pool, [runId], async () => {
      // 0132's check binds the envelope to run_id::text, which Postgres renders lower-case.
      const content = await encryptAttestedContentForRun(this.pool, runId, PATH_REWRITE_INPUT_CARRIER, runId.toLowerCase(), value);
      if (content === null) return "NOT_SEALED" as const;
      return (await this.executor.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_PATH" }>(
        "SELECT identity.record_path_rewrite_input($1,$2,$3::jsonb,$4) AS outcome",
        [runId, workItemId, JSON.stringify(content.envelope), content.attestation])).rows[0]!.outcome;
    });
  }

  /** The sweep's list: settled digs whose rewrite has no row and has not moved since `before`, oldest first. */
  async readUnwritten(before: Date, limit: number): Promise<readonly UnwrittenPathRewrite[]> {
    const rows = (await this.executor.query<{ open: Array<{ run_id: string; parent_run_id: string; position_ref: string;
      path_seq: number | null; since: string }> }>("SELECT identity.read_unwritten_path_rewrites($1,$2) AS open", [before, limit]))
      .rows[0]!.open;
    return Object.freeze(rows.map((row) => Object.freeze({ runId: row.run_id, parentRunId: row.parent_run_id,
      positionRef: row.position_ref, pathSeq: row.path_seq, since: row.since })));
  }
}
