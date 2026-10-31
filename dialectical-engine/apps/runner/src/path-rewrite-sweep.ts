import type { UnwrittenPathRewrite } from "@debateai/db";
import {
  pathRewriteIdOf, rewriteThePath, type PathRewriteDig, type PathRewriteRoles, type PathRewriteRunnerSettings,
  type PathRewriteStoredInput
} from "./path-rewrite.js";

/**
 * THE PATH REWRITE'S SWEEP (dig-model revision task W3-7). A dig's rewrite runs after its run settled, in the runner's
 * memory; a runner that stops mid-rewrite leaves the dig's turn without a row, and every later dig of that path waits on
 * it. Every few minutes, and once at boot, this sweep reads 0135's list (identity.read_unwritten_path_rewrites): the
 * settled digs whose rewrite has no row and that have not moved since the cut-off (no turn taken since their material was
 * stored, or a turn at the FRONT of its path's line since then). For each one this process is not already writing, it
 * runs the rewrite again from the store alone (path-rewrite.ts `rewriteThePath`): the same picks, the same parent text on
 * the same base, the same stored dig paths and work item, so the same prompts are sent and every call the stopped runner
 * already got answered is replayed from the record, free (`replayBookOf`); a call it never got answered is bought once.
 *
 * Reads that fail are tried again on a later pass; once a dig has waited past `giveUpMs`, its turn is ended FAILED (the
 * path keeps its text), so no path waits for ever on one dig whose material cannot be read. The members it may call are
 * the runner's configured ones (the story writer's boot resolver), never another run's; every call names the dig's own
 * run, so its money is the dig's (PATH_REWRITE, never walled). Never rejects; logs codes and ids only.
 */

export type PathRewriteSweepSettings = Readonly<{
  rewrite: PathRewriteRunnerSettings;
  /** 0135's list (PostgresDigPicksRunnerRepository.readUnwritten). */
  list: (before: Date, limit: number) => Promise<readonly UnwrittenPathRewrite[]>;
  /** The runner's configured members: the writer's and checker's refs, and the backups in the configured order. */
  roles: PathRewriteRoles;
  /** How long a dig must have stood still before the sweep takes it (default 20 minutes: longer than any rewrite runs). */
  staleMs?: number;
  /** How long a dig whose material cannot be read is tried again before its turn ends FAILED (default 6 hours). */
  giveUpMs?: number;
  /** At most this many digs per pass (default 20). */
  limit?: number;
  now?: () => Date;
}>;

export const PATH_REWRITE_SWEEP_DEFAULTS = Object.freeze({ staleMs: 20 * 60_000, giveUpMs: 6 * 60 * 60_000, limit: 20,
  everyMs: 5 * 60_000 });

const BARE_STEP = <T>(use: () => Promise<T>): Promise<T> => use();
const CODE = /^[0-9A-Z_]{1,64}$/u;
function codeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && CODE.test(code)) return code;
  return error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(error.name) ? error.name : "UNTYPED";
}

export type PathRewriteSweepPass = Readonly<{ listed: number; rewritten: number; skipped: number }>;

/** One pass. */
export async function sweepPathRewrites(settings: PathRewriteSweepSettings): Promise<PathRewriteSweepPass> {
  const rewrite = settings.rewrite;
  const log = (event: string, detail: Record<string, unknown>): void => {
    try { void Promise.resolve(rewrite.log?.(event, detail)).catch(() => undefined); } catch { /* a failing sink costs nothing */ }
  };
  const now = (settings.now ?? (() => new Date()))();
  const staleMs = settings.staleMs ?? PATH_REWRITE_SWEEP_DEFAULTS.staleMs;
  const giveUpMs = settings.giveUpMs ?? PATH_REWRITE_SWEEP_DEFAULTS.giveUpMs;
  let listed: readonly UnwrittenPathRewrite[];
  try {
    listed = await settings.list(new Date(now.getTime() - staleMs), settings.limit ?? PATH_REWRITE_SWEEP_DEFAULTS.limit);
  } catch (error) {
    log("PATH_REWRITE_SWEEP_UNREAD", { code: codeOf(error) });
    return Object.freeze({ listed: 0, rewritten: 0, skipped: 0 });
  }
  let rewritten = 0;
  let skipped = 0;
  for (const open of listed) {
    const release = rewrite.inFlight === undefined ? () => undefined : rewrite.inFlight.begin(open.runId);
    if (release === null) { skipped += 1; continue; }
    try {
      const givenUp = now.getTime() - Date.parse(open.since) >= giveUpMs;
      let dig: PathRewriteDig | null = null;
      let stored: PathRewriteStoredInput | null = null;
      let failureCode: string | null = null;
      try {
        dig = await rewrite.sources.digOf(open.runId);
        stored = rewrite.sources.storedInputOf === undefined ? null : await rewrite.sources.storedInputOf(open.runId);
        if (dig === null || stored === null) failureCode = "PATH_REWRITE_INPUT_UNREAD";
      } catch (error) {
        log("PATH_REWRITE_SWEEP_DIG_UNREAD", { runId: open.runId, code: codeOf(error), givenUp });
        if (!givenUp) { skipped += 1; continue; }
        failureCode = "PATH_REWRITE_INPUT_UNREAD";
      }
      if (failureCode !== null && !givenUp) { skipped += 1; continue; }
      log("PATH_REWRITE_SWEEP_RESUMED", { runId: open.runId, rewriteId: pathRewriteIdOf(open.runId), pathSeq: open.pathSeq,
        failureCode });
      await rewriteThePath(rewrite, Object.freeze({
        digRunId: open.runId, parentRunId: open.parentRunId, positionRef: open.positionRef,
        dig: failureCode === null ? dig : null, workItemId: stored?.workItemId ?? open.runId,
        digPaths: failureCode === null ? stored!.digPaths : null, roles: settings.roles, lease: BARE_STEP, failureCode
      }), log);
      rewritten += 1;
    } catch (error) {
      log("PATH_REWRITE_SWEEP_NOT_RECORDED", { runId: open.runId, code: codeOf(error) });
      skipped += 1;
    } finally {
      release();
    }
  }
  return Object.freeze({ listed: listed.length, rewritten, skipped });
}

/**
 * The sweep at boot and every `everyMs` (default 5 minutes), one pass at a time; none while `paused()` (a retiring
 * release claims nothing new). `stop()` ends the timer; a pass in flight finishes.
 */
export function startPathRewriteSweep(settings: PathRewriteSweepSettings & Readonly<{ everyMs?: number; paused?: () => boolean }>)
  : Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const pass = (): void => {
    if (busy || settings.paused?.() === true) return;
    busy = true;
    running = sweepPathRewrites(settings).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, settings.everyMs ?? PATH_REWRITE_SWEEP_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}
