import { createHash } from "node:crypto";
import * as contract from "@debateai/contract";
import type { PublicDebate } from "@debateai/contract";
import type { CryptoEnvelope, PreparedPublicationCipher } from "@debateai/crypto";
import type { PostgresPublicFlagRepository, PublicFlagLimits, PublicFlagVerdict, PublicReviewPurgeDue } from "@debateai/db";
import { PublicReportCheckReplySchema, framedPublicReportCheck } from "@debateai/judgement";
import type { ActionBinding } from "@debateai/kernel";
import { parseCanonicalRegisterJson } from "@debateai/register";
import { isJudgeIdentifier, type PublicationJudgePort } from "./publication-check/check.js";
import { correctedPiece, textPiecesOf } from "./public-tree.js";

/**
 * THE REPORT BUTTON (plan 2026-10-31-r22-owner-changes decision 35; migration 0151). A signed-in person says what is wrong and where; an AI reads it beside the public text. The site pays, so the checks are bounded.
 * WHAT THE PERSON HEARS: one of three states, and refused things all read the same: `NOT_FOUND` for a check that did not agree, a guessed or private debate and a person over their limit alike.
 * THE LIMITS are the register's abuseLimits row (R22 decision 18), and nothing in the code stands in for it. The database enforces them from its rows, so a restart forgets nothing; since 0171 it reads the same row
 * itself, at the CURRENT release's own version, and counts against the lower of the two, so a request cannot loosen them.
 * THE VERDICT is the judge's, recorded only by the API's system login (0171 makes the settlement the cross-account marker's alone; main.ts, X38), so no request login can settle a report with a verdict of its own choosing or hide a debate. 0157's sweep of a report left CHECKING, which a request login may still run, records UNAVAILABLE alone, sends it to a person and hides nothing.
 * WHY A QUOTE: the judge must copy the words that break the rules. Words that are not on the page are a judge that obeyed the claim, and they hide nothing: a person reads it.
 */
/** The whole check, inside what the website's proxy waits. */
const PUBLIC_FLAG_DEADLINE_MS = 20_000;
/** How much of the page one check reads: it is the site's money. Longer pages are read from their start, and the person's own words point the way. */
const PUBLIC_FLAG_TEXT_CODE_POINTS = 60_000;

export type PublicFlagAnswer = contract.PublicFlagAnswer["state"];
export type PublicFlagPorts = Readonly<{
  /** The target read and the opening, on the request's own login, under the reporter's session, and 0157's keeping of the quote an automatic hide relied on. */
  repository: Pick<PostgresPublicFlagRepository, "readTarget" | "open"> & Partial<Pick<PostgresPublicFlagRepository, "recordQuote">>;
  /** The judge's verdict, on the API's system login: 0171 makes it the cross-account marker's alone (main.ts, X38). */
  settlement: Pick<PostgresPublicFlagRepository, "settle">;
  judge: () => PublicationJudgePort | null;
  /** Seals under the publication's key, public or hidden. */
  seal: (publicationRef: string, runId: string, value: unknown) => Promise<CryptoEnvelope>;
  readPublicDebate: (publicationRef: string) => Promise<PublicDebate | null>;
  limits: PublicFlagLimits;
  log?: (event: string, detail: Record<string, unknown>) => void;
}>;
const squeezed = (text: string): string => text.replace(/\s+/gu, " ").trim().toLowerCase();

/** Reads the page and asks. Whatever goes wrong is UNAVAILABLE: no automatic hide, and a person reads the report. */
async function judged(input: Readonly<{ where: string; claim: string; debate: PublicDebate | null }>, judge: PublicationJudgePort | null) {
  const none = { verdict: "UNAVAILABLE" as PublicFlagVerdict, reason: null as "CONTENT" | "PERSONAL" | null, providerRef: null as string | null, modelId: null as string | null, inputTokens: null as number | null, outputTokens: null as number | null, costUsd: null as number | null,
    quote: null as string | null };
  if (judge === null || input.debate === null || !isJudgeIdentifier(judge.providerRef) || !isJudgeIdentifier(judge.modelId)) return none;
  const named = { ...none, providerRef: judge.providerRef, modelId: judge.modelId };
  const all = textPiecesOf(input.debate).map((piece) => piece.text).filter((text) => text.trim() !== "");
  const publicText: string[] = [];
  let room = PUBLIC_FLAG_TEXT_CODE_POINTS;
  for (const text of all) {
    const size = [...text].length;
    if (size > room) break;
    publicText.push(text);
    room -= size;
  }
  try {
    const framed = framedPublicReportCheck({ question: input.debate.question, publicText, where: input.where, claim: input.claim });
    const answer = await judge.complete({ packet: framed.packet, signal: AbortSignal.timeout(PUBLIC_FLAG_DEADLINE_MS) });
    const metered = { ...named, inputTokens: answer.usage?.input_tokens ?? null, outputTokens: answer.usage?.output_tokens ?? null, costUsd: answer.usage?.cost_usd ?? null };
    const reply = PublicReportCheckReplySchema.parse(JSON.parse(answer.text) as unknown);
    if (reply.verdict === "AGREE" && !squeezed(publicText.join(" ")).includes(squeezed(reply.quote!))) return { ...metered, verdict: "UNSURE" as PublicFlagVerdict, reason: null };
    return { ...metered, verdict: reply.verdict as PublicFlagVerdict, reason: reply.reason, quote: reply.verdict === "AGREE" ? reply.quote ?? null : null };
  } catch {
    return named;
  }
}

/** One press, signed in. Never tells which refusal it was. Throws only when the database itself is down: the person may press again. */
export async function pressPublicFlag(input: Readonly<{ ownerRef: string; publicationRef: string; flagId: string; where: string; claim: string }>, ports: PublicFlagPorts): Promise<PublicFlagAnswer> {
  const runId = await ports.repository.readTarget(input.publicationRef);
  if (runId === null) return "NOT_FOUND";
  const content = await ports.seal(input.publicationRef, runId, { where: input.where, claim: input.claim });
  const opened = await ports.repository.open({ ownerRef: input.ownerRef, publicationRef: input.publicationRef, flagId: input.flagId, content, limits: ports.limits });
  if (opened === "LIMITED" || opened === "NOT_PUBLIC") return "NOT_FOUND";
  if (opened === "QUEUE") return "WITH_A_PERSON";
  const debate = await ports.readPublicDebate(input.publicationRef).catch(() => null);
  const { quote, ...result } = await judged({ where: input.where, claim: input.claim, debate }, ports.judge());
  const settled = await ports.settlement.settle({ flagId: input.flagId, ...result });
  // 0157: the statement of the automatic hide shows its owner the words the check relied on, sealed as the report's were. The hide has happened; nothing here can undo or delay its answer.
  if (settled === "HIDDEN" && quote !== null && ports.repository.recordQuote !== undefined) {
    try { await ports.repository.recordQuote(input.flagId, await ports.seal(input.publicationRef, runId, { quote })); } catch { try { ports.log?.("PUBLIC_FLAG_QUOTE_NOT_KEPT", { flagId: input.flagId }); } catch { /* As below. */ } }
  }
  try { ports.log?.("PUBLIC_FLAG_CHECKED", { flagId: input.flagId, verdict: result.verdict, settled }); } catch { /* A failing log sink costs nothing. */ }
  return settled === "HIDDEN" ? "HIDDEN" : settled === "NOT_FOUND" ? "NOT_FOUND" : "WITH_A_PERSON";
}

/* ----------------------------------------------------------------- the queue, for the two accounts */

export type PublicFlagIntent = Extract<contract.StaffActionIntent, { action: "PUBLIC_REPORT_DISMISS" }>;
export const isPublicFlagIntent = (intent: { action: string }): intent is PublicFlagIntent => intent.action === "PUBLIC_REPORT_DISMISS";
export function canonicalPublicFlagBinding(intent: PublicFlagIntent): ActionBinding {
  // 0157 (D4): the outcome is in the body, as staff.public_flag_close checks it.
  const body = { action: intent.action, target_id: intent.flag_id, outcome: intent.outcome, expected_revision: 0, operation_id: intent.operation_id };
  return { action: intent.action, targetId: intent.flag_id, expectedRevision: 0, operationId: intent.operation_id, bodySha256: createHash("sha256").update(parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)))).digest("hex") };
}
export type PublicFlagStaffService = Readonly<{ repository: PostgresPublicFlagRepository; withKey: <T>(publicationRef: string, runId: string, use: (cipher: PreparedPublicationCipher) => T) => Promise<T> }>;
const iso = (at: string | null): string | null => at === null ? null : new Date(at).toISOString();
/** Opens each report's words under its debate's key. A report whose words went (six months) says so with nulls. */
export async function publicFlagQueueOf(service: PublicFlagStaffService, rows: Awaited<ReturnType<PostgresPublicFlagRepository["readQueue"]>>): Promise<contract.PublicFlagQueue> {
  const reports = [];
  for (const row of rows) {
    let words: { where: unknown; claim: unknown } | null = null;
    if (row.content !== null) {
      const content = row.content;
      words = await service.withKey(row.publication_ref, row.run_id, (cipher) => cipher.decrypt(content) as { where: unknown; claim: unknown }).catch(() => null);
    }
    reports.push({ flag_id: row.flag_id, publication_ref: row.publication_ref, reporter: row.reporter, state: row.state, verdict: row.verdict, reason: row.reason, created_at: iso(row.created_at)!, judged_at: iso(row.judged_at), dismissed_at: iso(row.dismissed_at),
      where: typeof words?.where === "string" ? words.where : null, claim: typeof words?.claim === "string" ? words.claim : null, debate_hidden: row.debate_hidden, outcome: row.outcome ?? null });
  }
  return contract.PublicFlagQueueSchema.parse({ reports });
}

/* ----------------------------------------------------------------- decision 36's sweep */

export const PUBLIC_REVIEW_PURGE_EVERY_MS = 60 * 60_000;
/** One pass. A piece that cannot be read is left for the next pass and logged by id; a page never loses corrected text for it: the overlay still stands. */
export async function sweepPublicReviewPurge(deps: Readonly<{ repository: Pick<PostgresPublicFlagRepository, "readPurgeDue" | "purge" | "deleteWordsDue">;
  withKey: <T>(publicationRef: string, runId: string, use: (cipher: PreparedPublicationCipher) => T) => Promise<T>; log?: (event: string, detail: Record<string, unknown>) => void }>): Promise<Readonly<{ purged: number; words: number }>> {
  let purged = 0;
  const words = await deps.repository.deleteWordsDue();
  for (const due of await deps.repository.readPurgeDue(50)) {
    try {
      const work = await deps.withKey(due.publication_ref, due.run_id, (cipher) => purgedPieceOf(due, cipher));
      if (await deps.repository.purge({ publicationRef: due.publication_ref, pieceKind: due.piece_kind, pieceId: due.piece_id, mode: due.mode, upToRevision: due.up_to_revision, content: work.content, originalSha256: work.digest }) === "PURGED") purged += 1;
    } catch (error) {
      deps.log?.("PUBLIC_REVIEW_NOT_PURGED", { pieceId: due.piece_id, code: error instanceof Error ? error.name : "UNTYPED" });
    }
  }
  return Object.freeze({ purged, words });
}
/** What the row holds from now on, and the digest of what it held. The digest proves which text went, and no one can read the text from it. */
function purgedPieceOf(due: PublicReviewPurgeDue, cipher: PreparedPublicationCipher): Readonly<{ content: CryptoEnvelope; digest: string }> {
  const opened: unknown = cipher.decrypt(due.content);
  const digest = createHash("sha256").update(JSON.stringify(opened)).digest("hex");
  if (due.mode === "EMPTIED") return Object.freeze({ content: cipher.encrypt({ emptied_after_review: true }), digest });
  const baked = correctedPiece(opened, due.corrections.map((correction) => {
    const text = cipher.decrypt(correction.content) as { text?: unknown };
    if (typeof text.text !== "string") throw new Error("PUBLIC_REVIEW_CORRECTION_UNREAD");
    return { pointer: correction.pointer, text: text.text };
  }));
  return Object.freeze({ content: cipher.encrypt(baked), digest });
}
