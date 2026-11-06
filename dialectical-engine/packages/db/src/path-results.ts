import type { Pool } from "pg";
import type { PathGapRound, PathId, PathOutcome } from "@debateai/contract";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import { decryptLeasedContentForRun, encryptAttestedContentForRun, prepareLeasedContentEncryptionForRun, withRunContentLease } from "./index.js";

/**
 * A path debate's results per path (migration 0159; V4 start step, spec 2026-11-03 §2.7, §4.3), through 0159's six definers only, on the
 * runner's pool (debateai_runtime): which root argued each chosen path (ids and codes only), each path's answer so far and the debate's gap
 * round, the last two sealed under the debate's own run key inside withRunContentLease and opened through prepareLeasedContentEncryptionForRun.
 *
 * Carriers (packages/crypto CONTENT_CARRIERS), each checked by 0159's attestation guard: `core.path_outcome` bound to the path id ("b1", …),
 * `core.path_gap_round` bound to the run id. A run without content encryption keeps no sealed row: the writers refuse with
 * PATH_RESULTS_NOT_SEALED and call nothing. An erased debate answers RUN_ERASED to every write and reads as nothing. What it reads is not
 * parsed here: callers parse it against the contract.
 */
export const PATH_RESULT_CARRIERS = Object.freeze({ outcome: "core.path_outcome", gapRound: "core.path_gap_round" } as const);

export type PathResultWrite = "INSERTED" | "ALREADY_PRESENT" | "REPOINTED" | "RUN_ERASED";
export type PathRootInForce = Readonly<{ pathId: PathId; rootIndex: number; rootNodeId: string; maker: string; stale: boolean }>;

export interface PathResultsStore {
  writePathRoot(input: Readonly<{ runId: string; pathId: PathId; rootIndex: number; rootNodeId: string; maker: string }>): Promise<PathResultWrite>;
  /** In force, by root_index. */
  readPathRoots(runId: string): Promise<readonly PathRootInForce[]>;
  recordPathOutcome(input: Readonly<{ runId: string; pathId: PathId; outcome: PathOutcome }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED">;
  readPathOutcomes(runId: string): Promise<ReadonlyMap<PathId, PathOutcome>>;
  recordPathGapRound(input: Readonly<{ runId: string; roundCount: number; round: PathGapRound }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED">;
  readPathGapRound(runId: string): Promise<Readonly<{ roundCount: number; round: PathGapRound }> | null>;
}

type RootRow = Readonly<{ path_id: PathId; root_index: number; root_node_id: string; maker: string; stale: boolean }>;
type OutcomeRow = Readonly<{ path_id: PathId; state: PathOutcome["state"]; content: CryptoEnvelope }>;
type GapRoundRow = Readonly<{ round_count: number; content: CryptoEnvelope }>;

const notSealed = (): TypedDomainError =>
  new TypedDomainError("PATH_RESULTS_NOT_SEALED", "A debate without content encryption keeps no path outcome or gap round");

/** The lease's and the definers' word for a debate whose private content is gone (0040). */
function isErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  return typeof error === "object" && error !== null
    && (error as { readonly code?: unknown }).code === "55000"
    && (error as { readonly message?: unknown }).message === "PRIVATE_CONTENT_ERASED";
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export class PostgresPathResultsRepository implements PathResultsStore {
  constructor(private readonly pool: Pool) {}

  /** An erasure that commits between the writer's liveness check and its insert is refused by 0040's barrier: RUN_ERASED too. */
  async writePathRoot(input: Readonly<{ runId: string; pathId: PathId; rootIndex: number; rootNodeId: string; maker: string }>): Promise<PathResultWrite> {
    try {
      return (await this.pool.query<{ outcome: PathResultWrite }>("SELECT core.write_path_root($1,$2,$3,$4,$5) AS outcome",
        [input.runId, input.pathId, input.rootIndex, input.rootNodeId, input.maker])).rows[0]!.outcome;
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async readPathRoots(runId: string): Promise<readonly PathRootInForce[]> {
    const rows = (await this.pool.query<{ roots: RootRow[] | null }>("SELECT core.read_path_roots($1) AS roots", [runId])).rows[0]?.roots ?? null;
    if (rows === null) return Object.freeze([]);
    return Object.freeze(rows.map((row) => Object.freeze({ pathId: row.path_id, rootIndex: row.root_index, rootNodeId: row.root_node_id,
      maker: row.maker, stale: row.stale })));
  }

  async recordPathOutcome(input: Readonly<{ runId: string; pathId: PathId; outcome: PathOutcome }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    return this.#sealed(input.runId, PATH_RESULT_CARRIERS.outcome, input.pathId, input.outcome, (content, attestation) =>
      this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "RUN_ERASED" }>("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
        [input.runId, input.pathId, input.outcome.state, JSON.stringify(content), attestation]));
  }

  /** Every path's answer so far, opened under the debate's key; empty when it keeps none or is erased. */
  async readPathOutcomes(runId: string): Promise<ReadonlyMap<PathId, PathOutcome>> {
    const rows = (await this.pool.query<{ outcomes: OutcomeRow[] | null }>("SELECT core.read_path_outcomes($1) AS outcomes", [runId]))
      .rows[0]?.outcomes ?? null;
    if (rows === null || rows.length === 0) return new Map();
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const outcomes = new Map<PathId, PathOutcome>();
      for (const row of rows) {
        const opened = decryptLeasedContentForRun<unknown>(leased, PATH_RESULT_CARRIERS.outcome, row.path_id, row.content, null);
        if (!isObject(opened) || opened.state !== row.state) throw new TypeError("PATH_OUTCOME_CONTENT_INVALID");
        outcomes.set(row.path_id, opened as PathOutcome);
      }
      await leased.assertLive();
      return outcomes;
    } finally {
      await leased.close();
    }
  }

  async recordPathGapRound(input: Readonly<{ runId: string; roundCount: number; round: PathGapRound }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    // 0159's guard binds the envelope to run_id::text, which Postgres renders lower-case.
    return this.#sealed(input.runId, PATH_RESULT_CARRIERS.gapRound, input.runId.toLowerCase(), input.round, (content, attestation) =>
      this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "RUN_ERASED" }>("SELECT core.record_path_gap_round($1,$2,$3::jsonb,$4) AS outcome",
        [input.runId, input.roundCount, JSON.stringify(content), attestation]));
  }

  async readPathGapRound(runId: string): Promise<Readonly<{ roundCount: number; round: PathGapRound }> | null> {
    const row = (await this.pool.query<{ gap: GapRoundRow | null }>("SELECT core.read_path_gap_round($1) AS gap", [runId])).rows[0]?.gap ?? null;
    if (row === null) return null;
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const opened = decryptLeasedContentForRun<unknown>(leased, PATH_RESULT_CARRIERS.gapRound, runId.toLowerCase(), row.content, null);
      if (!isObject(opened) || !Array.isArray(opened.points)) throw new TypeError("PATH_GAP_ROUND_CONTENT_INVALID");
      await leased.assertLive();
      return Object.freeze({ roundCount: row.round_count, round: opened as PathGapRound });
    } finally {
      await leased.close();
    }
  }

  /** Seals `value` under the debate's key for (carrier, primary key) and hands it to the definer; RUN_ERASED when the debate is gone. */
  async #sealed(runId: string, carrier: typeof PATH_RESULT_CARRIERS[keyof typeof PATH_RESULT_CARRIERS], primaryKey: string, value: unknown,
    write: (content: CryptoEnvelope, attestation: Buffer) => Promise<{ rows: Array<{ outcome: "RECORDED" | "ALREADY" | "RUN_ERASED" }> }>
  ): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const sealed = await encryptAttestedContentForRun(this.pool, runId, carrier, primaryKey, value);
        if (sealed === null) throw notSealed();
        return (await write(sealed.envelope, sealed.attestation)).rows[0]!.outcome;
      });
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }
}
