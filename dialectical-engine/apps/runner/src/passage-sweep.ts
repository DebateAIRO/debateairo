// apps/runner/src/passage-sweep.ts
/**
 * THE PASSAGE SWEEP (plan 2026-10-31 decision 7; migration 0139). Whole page texts and passages go when nothing runs on the
 * debate, or after the report is written. "Other pages" stay until 30 days after the investigation's last activity, so "Add
 * to researched" works, and then 0133's sweep takes them. Links, the 120-character quotes and the notes stay.
 *
 * - STILL_RUNNING is normal: `wipe` itself decides, under the run's lock, so a debate that starts running again is safe.
 * - QUOTES_MISSING: a runner stopped between an extract and its shown quote. The quote is written from the stored extract,
 *   then the wipe is asked again: no debate holds on to its passages because of a crash.
 * Never rejects; logs codes and ids only.
 */
import { cutQuoteAtWordEdge } from "@debateai/contract";
import {
  PostgresInvestigationRunnerRepository, PostgresPassageRetentionRepository, PostgresWebEvidenceRepository, WEB_EVIDENCE_CARRIERS,
  WEB_SHOWN_QUOTE_CARRIER, decryptLeasedContentForRun, encryptAttestedLeasedContentForRun, prepareLeasedContentEncryptionForRun,
  type PassageWipeReason, type PassageWipeResult, type Pool
} from "@debateai/db";

export const PASSAGE_SWEEP_DEFAULTS = Object.freeze({ everyMs: 5 * 60_000, debates: 100, otherPages: 500 });

type Log = (event: string, detail: Readonly<Record<string, unknown>>) => void;
const defaultLog: Log = (event, detail) => { console.warn(JSON.stringify({ kind: "DEBATEAI_PASSAGE_SWEEP", event, ...detail })); };
const codeOf = (error: unknown): string => {
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code) ? code : "UNTYPED";
};

/** The shown quotes a stopped runner left unwritten, from the extracts still stored. Returns how many it wrote. */
export async function backfillShownQuotes(pool: Pool, runId: string): Promise<number> {
  const evidence = await new PostgresWebEvidenceRepository(pool).read(runId);
  if (evidence === null || evidence.extracts.length === 0) return 0;
  const retention = new PostgresPassageRetentionRepository(pool);
  const shown = new Set(((await retention.readShownQuotes(runId)) ?? []).map((quote) => quote.extract_id));
  const missing = evidence.extracts.filter((extract) => !shown.has(extract.extract_id));
  if (missing.length === 0) return 0;
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  let written = 0;
  try {
    for (const extract of missing) {
      const opened = decryptLeasedContentForRun<unknown>(leased, WEB_EVIDENCE_CARRIERS.extract, extract.extract_id, extract.content, null);
      const quote = typeof opened === "object" && opened !== null ? (opened as { readonly quote?: unknown }).quote : null;
      if (typeof quote !== "string") continue;
      const sealed = encryptAttestedLeasedContentForRun(leased, WEB_SHOWN_QUOTE_CARRIER, extract.extract_id, { quote: cutQuoteAtWordEdge(quote) });
      if (sealed !== null && await retention.recordShownQuote(runId, extract.extract_id, sealed) === "RECORDED") written += 1;
    }
    await leased.assertLive();
  } finally {
    await leased.close();
  }
  return written;
}

/** One debate's wipe, with the quotes a stopped runner left unwritten written first. Never rejects: null when it failed. */
export async function wipeDebatePassages(pool: Pool, runId: string, reason: PassageWipeReason, log: Log = defaultLog): Promise<PassageWipeResult | null> {
  const retention = new PostgresPassageRetentionRepository(pool);
  try {
    let result = await retention.wipe(runId, reason);
    if (result.outcome === "QUOTES_MISSING") {
      log("PASSAGE_QUOTES_BACKFILLED", { runId, written: await backfillShownQuotes(pool, runId) });
      result = await retention.wipe(runId, reason);
    }
    if (result.outcome !== "STILL_RUNNING") log("PASSAGE_WIPE", { runId, reason, ...result });
    return result;
  } catch (error) {
    log("PASSAGE_WIPE_FAILED", { runId, code: codeOf(error) });
    return null;
  }
}

/** After a report is written: every debate of its investigation that nothing runs on (a running dig is swept when it settles). */
export async function wipeInvestigationPassages(pool: Pool, rootRunId: string, log: Log = defaultLog): Promise<void> {
  try {
    const investigation = await new PostgresInvestigationRunnerRepository(pool).ofRun(rootRunId);
    const members = investigation?.members.map((member) => member.run_id) ?? [rootRunId];
    for (const runId of members) await wipeDebatePassages(pool, runId, "REPORT_WRITTEN", log);
  } catch (error) {
    log("PASSAGE_WIPE_FAILED", { runId: rootRunId, code: codeOf(error) });
  }
}

/** One pass: the debates holding passages that nothing runs on, then the other pages idle past their 30 days. */
export async function sweepPassages(pool: Pool, log: Log = defaultLog,
  limits: Readonly<{ debates: number; otherPages: number }> = PASSAGE_SWEEP_DEFAULTS): Promise<Readonly<{ debates: number; otherPages: number }>> {
  let debates = 0;
  let otherPages = 0;
  try {
    const holding = await new PostgresPassageRetentionRepository(pool).readHolding(limits.debates);
    for (const runId of holding) {
      const result = await wipeDebatePassages(pool, runId, "NOTHING_RUNS", log);
      if (result?.outcome === "WIPED") debates += 1;
    }
  } catch (error) {
    log("PASSAGE_SWEEP_UNREAD", { code: codeOf(error) });
  }
  try {
    otherPages = await new PostgresInvestigationRunnerRepository(pool).wipeInactivePageText(limits.otherPages);
  } catch (error) {
    log("PASSAGE_OTHER_PAGES_FAILED", { code: codeOf(error) });
  }
  return Object.freeze({ debates, otherPages });
}

/** The sweep at boot and every `everyMs` (default 5 minutes), one pass at a time; none while `paused()`. */
export function startPassageSweep(pool: Pool, options: Readonly<{ everyMs?: number; paused?: () => boolean; log?: Log }> = {})
  : Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const pass = (): void => {
    if (busy || options.paused?.() === true) return;
    busy = true;
    running = sweepPassages(pool, options.log).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, options.everyMs ?? PASSAGE_SWEEP_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}
