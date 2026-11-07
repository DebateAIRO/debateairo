import { PurposeLinesSchema, purposeLinesUnsaid, type PurposeLines } from "@debateai/contract";
import {
  PostgresTreeUpdateRepository, RUN_PURPOSE_LINES_CARRIER, decryptContentForRun, encryptAttestedContentForRun, withRunContentLease, type Pool
} from "@debateai/db";

/**
 * A DEBATE'S STEP-2 LINES (plan 2026-10-31-r22-owner-changes decisions 5 and 29: the clarifying answers, what matters, the angles), at the ask: sealed under the new run's key
 * (0138's identity.run_purpose_lines, bound to the run's id), written once. Every rewrite, answer update and report reads them. A dig has none
 * of its own: it reads its first debate's. The ask stands whatever becomes of them: a debate without its lines still runs, as an old debate.
 */

export interface PurposeLinesPort {
  record(ownerRef: string, runId: string, lines: PurposeLines): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_SEALED">;
}

export function postgresPurposeLines(pool: Pool): PurposeLinesPort {
  const store = new PostgresTreeUpdateRepository(pool);
  return Object.freeze({
    record: (ownerRef: string, runId: string, lines: PurposeLines) => withRunContentLease(pool, [runId], async () => {
      const sealed = await encryptAttestedContentForRun(pool, runId, RUN_PURPOSE_LINES_CARRIER, runId, lines);
      return sealed === null ? "NOT_SEALED" as const : store.recordPurposeLines(ownerRef, runId, sealed);
    })
  });
}

/** Decision 13: a debate's lines opened under its key, for what a Free debate publishes with its question; null when it has none or they cannot be read. */
export async function readPurposeLinesOf(pool: Pool, ownerRef: string, runId: string): Promise<PurposeLines | null> {
  try {
    const sealed = await new PostgresTreeUpdateRepository(pool).readPurposeLines(ownerRef, runId);
    if (sealed === null) return null;
    const opened = await withRunContentLease(pool, [runId], () => decryptContentForRun<unknown>(pool, runId, RUN_PURPOSE_LINES_CARRIER, runId, sealed, null));
    const parsed = PurposeLinesSchema.safeParse(opened);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stores the lines; a failure is logged by code and the ask goes on. Never rejects. */
export async function recordPurposeLinesAtAsk(input: Readonly<{ ownerRef: string; runId: string; lines: PurposeLines }>, port: PurposeLinesPort,
  log: (line: string) => void = (line) => console.error(line)): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_SEALED" | "FAILED"> {
  let outcome: Awaited<ReturnType<PurposeLinesPort["record"]>> | "FAILED";
  try {
    outcome = await port.record(input.ownerRef, input.runId, input.lines);
  } catch {
    outcome = "FAILED";
  }
  if (outcome !== "RECORDED" && outcome !== "ALREADY") log(JSON.stringify({ kind: "DEBATEAI_PURPOSE_LINES", code: `PURPOSE_LINES_${outcome}` }));
  return outcome;
}

/** The text the question check reads: the question, then each stored line it does not already say. The question alone when there are none. */
export function questionWithPurposeLines(questionLine: string, lines: PurposeLines | undefined): string {
  const added = purposeLinesUnsaid(questionLine, lines);
  return added.length === 0 ? questionLine : `${questionLine}\n\n${added.join("\n")}`;
}
