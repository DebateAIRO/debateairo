/**
 * Preview practice, mode "debate": the story in the report under the engine row (spec
 * docs/superpowers/specs/2026-10-15-engine-redesign-design.md §7.2 items 7, 8, 11, §14; plan INTERFACE §15.4, R1d rows).
 *
 * Plain words: after the debate, before the throwaway database goes, the practice reads what the story did:
 *  - the engine the run was admitted with (its own receipt: 1 today, 2 with the engine row);
 *  - one row per story round: the storyteller's model, whether the checker found the draft misleading (a real problem:
 *    it starts round 2) or had only wording notes (served without a reservation, no second round), and whether the
 *    round revised its own draft (its request carried the earlier draft as the model's own turn);
 *  - one row per backup storyteller (engine 2: the first storyteller could not write round 1 at all): the first
 *    storyteller's model, the signal, the backup's model and the story's outcome;
 *  - the stored stories by outcome (READY, READY_WITH_RESERVATION, FAILED), summed over runs by the owners.
 * Counts and codes only: never a reply's text, never the checker's objection.
 */
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { decryptContentForRun, readCallPrompt } from "@debateai/db";
import { PREVIEW_PROVIDER_REF_MODELS, decodeModelJson, structureRepairOriginalKey, type PromptPacket } from "@debateai/providers";
import { engineOfRun } from "@debateai/register";
import type { StoryBackupRecord, StoryBackupSignal } from "@debateai/story";
import { practiceIsRevisionPrompt, replyContentOf } from "./practice-lanes.js";

export type PracticeStoryRoundOutcome = "SATISFIED" | "WORDING_NOTE_ONLY" | "MISLEADING" | "NOT_SATISFIED" | "NO_DRAFT" | "NO_VERDICT";
export type PracticeStoryRoundRow = Readonly<{
  model: string; round: number; misleading: boolean | null; wordingNoteOnly: boolean; revisedOwnDraft: boolean;
  outcome: PracticeStoryRoundOutcome;
}>;
export type PracticeStoryBackupRow = Readonly<{ firstModel: string; signal: StoryBackupSignal; backupModel: string | null; outcome: string }>;
export type PracticeStoryReadyRate = Readonly<{ ready: number; readyWithReservation: number; failed: number }>;
export type PracticeStoryEngineBlock = Readonly<{
  engine: 1 | 2;
  storyRounds: readonly PracticeStoryRoundRow[];
  storyBackups: readonly PracticeStoryBackupRow[];
  storyReadyRate: PracticeStoryReadyRate;
}>;
/** The checker's accepted verdict as the report reads it; `misleading` null: a v3 checker (it has no such member). */
export type PracticeCheckerVerdict = Readonly<{ satisfied: boolean; misleading: boolean | null }>;
/** What one round did, read from the ledger (pure input of `practiceStoryRoundRows`). */
export type PracticeStoryRoundFacts = Readonly<{
  round: number; model: string; drafted: boolean; revisedOwnDraft: boolean; verdict: PracticeCheckerVerdict | null;
}>;
/** One story ledger row as the round grouping reads it, in ledger order (pure input of `practiceStoryRoundFactsOf`). */
export type PracticeStoryLedgerRow = Readonly<{
  callSiteKey: string; model: string;
  /** The try's reply was accepted (OK, PARSED, with an artifact). */
  accepted: boolean;
  /** A storyteller try's sent request revised its own draft; null: no recorded prompt, or not read (not the round's first sent try). */
  revisionPrompt: boolean | null;
  /** An accepted checker reply's verdict; null otherwise. */
  verdict: PracticeCheckerVerdict | null;
}>;

const STORY_ROUND_SITE = /^STORY:(STORYTELLER|CHECKER):([1-9][0-9]*)$/u;

function modelOfRef(providerRef: string): string {
  return PREVIEW_PROVIDER_REF_MODELS[providerRef] ?? `unreviewed:${providerRef}`;
}

/**
 * The story's rounds from its ledger rows (pre-flight PF-D8.2). A reply Haiku's structure repair rescued stands under
 * `REPAIR:STRUCTURE:<key>` while the round's own try stays FAILED (LG-A contract deviation 7;
 * packages/ledger/src/index.ts structureRepairAnsweredSql): it is read as that round's draft or verdict. The round's model
 * and whether it revised its own draft come only from the round's plain-key rows; a repair row alone builds no round.
 * Every other key is ignored.
 */
export function practiceStoryRoundFactsOf(rows: readonly PracticeStoryLedgerRow[]): readonly PracticeStoryRoundFacts[] {
  const tellers = new Map<number, { model: string; drafted: boolean; revisedOwnDraft: boolean | null }>();
  const checkers = new Map<number, PracticeCheckerVerdict | null>();
  for (const row of rows) {
    const original = structureRepairOriginalKey(row.callSiteKey);
    const repair = original !== row.callSiteKey;
    const site = STORY_ROUND_SITE.exec(original);
    if (site === null) continue;
    const round = Number(site[2]);
    if (site[1] === "STORYTELLER") {
      const known = tellers.get(round);
      if (known === undefined && repair) continue;
      const teller = known ?? { model: row.model, drafted: false, revisedOwnDraft: null };
      tellers.set(round, teller);
      if (!repair && teller.revisedOwnDraft === null && row.revisionPrompt !== null) teller.revisedOwnDraft = row.revisionPrompt;
      if (row.accepted) teller.drafted = true;
      continue;
    }
    if (!checkers.has(round)) {
      if (repair) continue;
      checkers.set(round, null);
    }
    if (row.accepted && row.verdict !== null) checkers.set(round, row.verdict);
  }
  const rounds = [...new Set([...tellers.keys(), ...checkers.keys()])];
  return Object.freeze(rounds.map((round) => Object.freeze({
    round, model: tellers.get(round)?.model ?? "none", drafted: tellers.get(round)?.drafted ?? false,
    revisedOwnDraft: tellers.get(round)?.revisedOwnDraft ?? false, verdict: checkers.get(round) ?? null
  })));
}

/** An accepted checker reply's `satisfied` and `misleading`; null when it has no boolean `satisfied`. */
export function practiceCheckerVerdictOf(content: string): PracticeCheckerVerdict | null {
  const decoded = decodeModelJson(content);
  if (!decoded.ok || typeof decoded.value !== "object" || decoded.value === null || Array.isArray(decoded.value)) return null;
  const value = decoded.value as Record<string, unknown>;
  if (typeof value.satisfied !== "boolean") return null;
  return Object.freeze({ satisfied: value.satisfied, misleading: typeof value.misleading === "boolean" ? value.misleading : null });
}

/** One row per round, in round order. A round without an accepted draft is NO_DRAFT; one without a verdict NO_VERDICT. */
export function practiceStoryRoundRows(facts: readonly PracticeStoryRoundFacts[]): readonly PracticeStoryRoundRow[] {
  return Object.freeze([...facts].sort((left, right) => left.round - right.round).map((fact) => {
    const verdict = fact.drafted ? fact.verdict : null;
    const outcome: PracticeStoryRoundOutcome = !fact.drafted ? "NO_DRAFT" : verdict === null ? "NO_VERDICT"
      : verdict.satisfied ? "SATISFIED" : verdict.misleading === true ? "MISLEADING"
        : verdict.misleading === false ? "WORDING_NOTE_ONLY" : "NOT_SATISFIED";
    return Object.freeze({
      model: fact.model, round: fact.round, misleading: verdict === null ? null : verdict.misleading,
      wordingNoteOnly: outcome === "WORDING_NOTE_ONLY", revisedOwnDraft: fact.revisedOwnDraft, outcome
    });
  }));
}

/** The stored story's backup record as one row (none without one); the first storyteller's ref read as its model. */
export function practiceStoryBackupRows(input: Readonly<{ backup: StoryBackupRecord | null; backupModel: string | null; outcome: string | null }>):
  readonly PracticeStoryBackupRow[] {
  if (input.backup === null) return Object.freeze([]);
  return Object.freeze([Object.freeze({ firstModel: modelOfRef(input.backup.firstModel), signal: input.backup.signal,
    backupModel: input.backupModel, outcome: input.outcome ?? "MISSING" })]);
}

/** The stored stories by outcome. */
export function practiceStoryReadyRate(outcomes: readonly string[]): PracticeStoryReadyRate {
  return Object.freeze({
    ready: outcomes.filter((outcome) => outcome === "READY").length,
    readyWithReservation: outcomes.filter((outcome) => outcome === "READY_WITH_RESERVATION").length,
    failed: outcomes.filter((outcome) => outcome === "FAILED").length
  });
}

/** report.md lines: the engine, then counts and codes only. */
export function practiceStoryEngineLines(block: PracticeStoryEngineBlock): readonly string[] {
  const yes = (value: boolean): string => (value ? "yes" : "no");
  const lines = [block.engine === 2 ? "Engine: 2 (the engine row; the story is told with story v4)." : "Engine: 1 (today's engine; story v3).", ""];
  if (block.storyRounds.length > 0) {
    lines.push("Story rounds (codes only; a wording note is served without a reservation and starts no second round):", "",
      "| model | round | outcome | misleading | wording note only | revised its own draft |", "|---|---|---|---|---|---|");
    for (const row of block.storyRounds) {
      lines.push(`| ${row.model} | ${String(row.round)} | ${row.outcome} | ${row.misleading === null ? "-" : yes(row.misleading)} | `
        + `${yes(row.wordingNoteOnly)} | ${yes(row.revisedOwnDraft)} |`);
    }
    lines.push("");
  }
  if (block.storyBackups.length > 0) {
    lines.push("Story backups (the first storyteller could not write round 1; a storyteller of another maker told the story):", "");
    for (const row of block.storyBackups) lines.push(`- ${row.firstModel} (${row.signal}) -> ${row.backupModel ?? "unknown"}: ${row.outcome}`);
    lines.push("");
  }
  const rate = block.storyReadyRate;
  lines.push(`Story outcomes: READY ${String(rate.ready)}, READY_WITH_RESERVATION ${String(rate.readyWithReservation)}, `
    + `FAILED ${String(rate.failed)}.`, "");
  return Object.freeze(lines);
}

/**
 * Debate mode: read before the throwaway database goes. `story` is the stored story the practice already read
 * (StoryRepository.readForAnswer, which decrypts its sealed content, the backup record included); null without one.
 * The backup's model is the first storyteller call whose ref is not the first storyteller's (its rounds come after the
 * first loop's: STORY:STORYTELLER:3 with two rounds); a `REPAIR:STRUCTURE:` row (Haiku's) is never read as the backup.
 * The rows Haiku's structure repair answered (`REPAIR:STRUCTURE:STORY:<role>:<n>`) are read with their round
 * (pre-flight PF-D8.2).
 */
export async function collectPracticeStoryEngine(pool: Pool, runId: string,
  story: Readonly<{ outcome: string; backup?: StoryBackupRecord }> | null): Promise<PracticeStoryEngineBlock> {
  const run = (await pool.query<{ envelope_basis: unknown }>("SELECT envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  if (run === undefined) throw new TypeError("PRACTICE_STORY_ENGINE_RUN_ABSENT");
  const engine = engineOfRun(parseCostEnvelopeBasis(run.envelope_basis)).engine;
  const entries = (await pool.query<{ call_site_key: string; actor_ref: string; outcome: string; attempt_id: string | null;
    raw_artifact_ref: string | null; parse_status: string | null; raw_text: string | null; content_ciphertext: unknown }>(
    `SELECT e.call_site_key, e.actor_ref, e.outcome, e.attempt_id::text AS attempt_id, e.raw_artifact_ref::text AS raw_artifact_ref,
            a.parse_status, a.raw_text, a.content_ciphertext
       FROM ledger.ledger_entry e LEFT JOIN ledger.raw_artifact a ON a.raw_artifact_id = e.raw_artifact_ref
      WHERE e.run_id=$1 AND e.action_kind='MODEL_CALL'
        AND (e.call_site_key LIKE 'STORY:%' OR e.call_site_key LIKE 'REPAIR:STRUCTURE:STORY:%')
      ORDER BY e.sequence`, [runId])).rows;
  const ledgerRows: PracticeStoryLedgerRow[] = [];
  const promptRead = new Set<number>();
  for (const entry of entries) {
    const original = structureRepairOriginalKey(entry.call_site_key);
    const repair = original !== entry.call_site_key;
    const site = STORY_ROUND_SITE.exec(original);
    if (site === null) continue;
    const round = Number(site[2]);
    const accepted = entry.outcome === "OK" && entry.parse_status === "PARSED" && entry.raw_artifact_ref !== null;
    let revisionPrompt: boolean | null = null;
    // The round's first SENT plain-key try (a try refused before it was sent has no recorded prompt) says what the round asked.
    if (site[1] === "STORYTELLER" && !repair && !promptRead.has(round) && entry.attempt_id !== null) {
      const prompt = await readCallPrompt(pool, entry.attempt_id);
      if (prompt !== null) {
        promptRead.add(round);
        const messages = JSON.parse(prompt.promptText) as unknown;
        revisionPrompt = Array.isArray(messages) && practiceIsRevisionPrompt(messages as PromptPacket["messages"]);
      }
    }
    let verdict: PracticeCheckerVerdict | null = null;
    if (site[1] === "CHECKER" && accepted) {
      const stored = await decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(pool, runId, "ledger.raw_artifact",
        entry.raw_artifact_ref!, (entry.content_ciphertext ?? null) as never, { rawText: entry.raw_text ?? "", parseErrorDetail: null });
      verdict = practiceCheckerVerdictOf(replyContentOf(stored.rawText));
    }
    ledgerRows.push(Object.freeze({ callSiteKey: entry.call_site_key, model: modelOfRef(entry.actor_ref), accepted, revisionPrompt, verdict }));
  }
  const storyRounds = practiceStoryRoundRows(practiceStoryRoundFactsOf(ledgerRows));
  const backup = story?.backup ?? null;
  const backupRef = backup === null ? undefined
    : entries.find((entry) => entry.call_site_key.startsWith("STORY:STORYTELLER:") && entry.actor_ref !== backup.firstModel)?.actor_ref;
  const outcomes = (await pool.query<{ outcome: string }>("SELECT outcome FROM serve.answer_story WHERE run_id=$1", [runId])).rows
    .map((row) => row.outcome);
  return Object.freeze({
    engine, storyRounds,
    storyBackups: practiceStoryBackupRows({ backup, backupModel: backupRef === undefined ? null : modelOfRef(backupRef), outcome: story?.outcome ?? null }),
    storyReadyRate: practiceStoryReadyRate(outcomes)
  });
}
