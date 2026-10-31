import { StoryFateSchema, type StoryFate } from "@debateai/contract";
import {
  MAIN_ANSWER_UPDATE_CARRIER, PATH_REWRITE_CARRIER, PATH_UPDATE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository,
  PostgresTreeUpdateRunnerRepository, RunRepository, decryptContentForRun, encryptAttestedContentForRun,
  withRunContentLease, type CryptoEnvelope, type PathLineEntry, type Pool, type WebSealed
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { postgresInvestigationCloseSources } from "./investigation-close-sources.js";
import type { MainAnswerContent, TreeUpdatePorts } from "./path-climb.js";
import { postgresPathRewriteSources, storedDigPathsOf } from "./path-rewrite-sources.js";
import { readReplayBook } from "./run-replay.js";

/**
 * THE TREE'S SOURCES IN POSTGRESQL (plan 2026-10-31-r22-owner-changes decisions 2, 3, 5), on the runner's pool: 0138's turns, line and main
 * answer through their definers, each sealed value opened under its own run's key. Reads are deterministic for the same stored rows, so a
 * level or an answer run again sends the same prompts.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The text a rewrite or a climb's row sealed. */
export function storedPathTextOf(value: unknown): Readonly<{ line: string; summary: string; fate: StoryFate }> | null {
  if (!isRecord(value) || !isRecord(value.text)) return null;
  const fate = StoryFateSchema.safeParse(value.text.fate);
  return typeof value.text.line === "string" && typeof value.text.summary === "string" && fate.success
    ? Object.freeze({ line: value.text.line, summary: value.text.summary, fate: fate.data }) : null;
}

/** The newest finished, visible entry of a path: its current text, if any turn wrote one. */
export function newestEntryOf(entries: readonly PathLineEntry[], positionRef: string): PathLineEntry | null {
  return entries.filter((entry) => entry.position_ref === positionRef && (entry.state === "READY" || entry.state === "READY_WITH_RESERVATION")
    && !entry.held && !entry.hidden && entry.entry_id !== null).at(-1) ?? null;
}

const seal = (pool: Pool, runId: string, carrier: typeof PATH_UPDATE_CARRIER | typeof MAIN_ANSWER_UPDATE_CARRIER, id: string, content: unknown, failure: string): Promise<WebSealed> =>
  withRunContentLease(pool, [runId], async () => {
    const sealed = await encryptAttestedContentForRun(pool, runId, carrier, id, content);
    if (sealed === null) throw new TypedDomainError(failure, "Kept only under its run's key");
    return sealed;
  });

/** Each dig whose rewrite or climb called an AI between the two times (the sweep's list). */
export async function readRecentTreeDigs(pool: Pool, since: Date, before: Date, limit: number): Promise<readonly string[]> {
  const rows = (await pool.query<{ run_id: string }>(
    `SELECT entry.run_id::text AS run_id FROM ledger.ledger_entry AS entry
      WHERE entry.action_kind = 'MODEL_CALL' AND entry.finished_at >= $1
        AND (entry.call_site_key LIKE 'PATH\\_REWRITE:%' OR entry.call_site_key LIKE 'PATH\\_CLIMB:%' OR entry.call_site_key LIKE 'ANSWER\\_UPDATE:%')
      GROUP BY entry.run_id
     HAVING max(entry.finished_at) < $2
      ORDER BY max(entry.finished_at), entry.run_id
      LIMIT $3`, [since, before, limit])).rows;
  return Object.freeze(rows.map((row) => row.run_id));
}

export function postgresTreeUpdatePorts(pool: Pool): TreeUpdatePorts {
  const tree = new PostgresTreeUpdateRunnerRepository(pool);
  const digModel = new PostgresDigModelRunnerRepository(pool);
  const picks = new PostgresDigPicksRunnerRepository(pool);
  const runs = new RunRepository(pool);
  const sources = postgresPathRewriteSources(pool);
  const closing = postgresInvestigationCloseSources(pool);
  return Object.freeze({
    tree,
    digOf: sources.digOf,
    parentPathOf: sources.parentPathOf,
    ownRewriteOf: async (digRunId: string) => {
      const entry = (await digModel.readPathRewrites(digRunId))?.own ?? null;
      if (entry === null) return null;
      if ((entry.state !== "READY" && entry.state !== "READY_WITH_RESERVATION") || entry.rewrite_id === null) return Object.freeze({ entry, text: null });
      const opened = await withRunContentLease(pool, [digRunId], () => decryptContentForRun<unknown>(pool, digRunId, PATH_REWRITE_CARRIER,
        entry.rewrite_id!, (entry.content ?? null) as CryptoEnvelope | null, null));
      return Object.freeze({ entry, text: storedPathTextOf(opened) });
    },
    childOf: async (runId: string) => {
      const kept = await picks.read(runId);
      if (kept === null || kept.input === null || kept.input === undefined) return null;
      const line = (await tree.readLine(runId)) ?? [];
      const digPaths = [];
      for (const path of storedDigPathsOf(kept.input.value)) {
        // Each of the debate's paths as it stands now: the one that just changed, and any an earlier dig changed.
        const newest = newestEntryOf(line, path.positionRef);
        const current = await sources.parentPathOf({ parentRunId: runId, positionRef: path.positionRef,
          baseRewriteId: newest?.source === "PATH_REWRITE" ? newest.entry_id : null, baseUpdateId: newest?.source === "PATH_UPDATE" ? newest.entry_id : null });
        digPaths.push(Object.freeze({ ...path, statement: current.summary === null ? current.line : `${current.line} ${current.summary}` }));
      }
      return Object.freeze({ picks: Object.freeze(kept.picks.map((pick) => Object.freeze({ text: pick.text, by: pick.author }))), digPaths: Object.freeze(digPaths) });
    },
    sealUpdate: (digRunId: string, updateId: string, content: unknown) =>
      seal(pool, digRunId, PATH_UPDATE_CARRIER, updateId, content, "PATH_CLIMB_ENCRYPTION_REQUIRED"),
    sealMainAnswer: (rootRunId: string, updateId: string, content: MainAnswerContent) =>
      seal(pool, rootRunId, MAIN_ANSWER_UPDATE_CARRIER, updateId, content, "MAIN_ANSWER_ENCRYPTION_REQUIRED"),
    openMainAnswer: async (rootRunId, row) => {
      const opened = await withRunContentLease(pool, [rootRunId], () => decryptContentForRun<unknown>(pool, rootRunId, MAIN_ANSWER_UPDATE_CARRIER,
        row.update_id, row.content, null));
      return isRecord(opened) && Array.isArray(opened.segments) && opened.segments.every((segment) => typeof segment === "string")
        ? opened.segments as readonly string[] : null;
    },
    answerInputOf: closing.investigationInputOf,
    payerOf: async (digRunId: string) => {
      const asker = (await runs.readStoredAsk(digRunId))?.askerId;
      return asker?.startsWith("owner:") === true ? asker.slice("owner:".length) : null;
    },
    answerSpentMicros: async (digRunId: string) => Number((await pool.query<{ spent: string | null }>(
      `SELECT COALESCE(sum(charge_micros), 0)::text AS spent FROM ledger.model_spend WHERE run_id = $1 AND spend_source = 'ANSWER_UPDATE'`,
      [digRunId])).rows[0]?.spent ?? 0),
    replayBookOf: (runId: string, subjectItemId: string) => readReplayBook(pool, runId, subjectItemId)
  });
}
