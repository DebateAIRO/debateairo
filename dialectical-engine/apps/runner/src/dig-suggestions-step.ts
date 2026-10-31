// apps/runner/src/dig-suggestions-step.ts
import { createHash } from "node:crypto";
import { DIG_LEVEL_MAX, WEB_CONTRACT_LIMITS, type DigSuggestion } from "@debateai/contract";
import { PostgresInvestigationRunnerRepository, PostgresDigPicksRunnerRepository, type Pool } from "@debateai/db";
import {
  WEB_SUGGEST_DIG_PROMPT_CONTRACT, classifyStructuredArtifact, parseStructuredArtifact, webSuggestDigMaterialFields,
  webSuggestDigReplySchema
} from "@debateai/judgement";
import { TypedDomainError, withQuestionLanguageField, type QuestionLanguage } from "@debateai/kernel";
import {
  buildFramedPrompt, buildFramedRepairPrompt, rememberingAcceptedReply, schemaFailureLocator, type ContentClassification, type ModelReplyFacts,
  type ProviderCallRequest, type ProviderCallResult, type RejectedProviderContent
} from "@debateai/providers";
import { PATH_REWRITE_POLICY } from "@debateai/register";
import { pathRewriteSuggestCallSiteKey, type StoryRoleMaker } from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { readAlreadyInvestigated } from "./investigation-digest.js";
import type { PathRewriteDigPath, PathRewriteQuestion } from "./path-rewrite-material.js";

/**
 * THE SUGGESTIONS ON A DIG'S OWN PATHS (plan 2026-10-30 task W4-3; owner Q7, 31 Oct: "only new POV or deeper insights that
 * could change the dig path should be included as options to dig into").
 *
 * Plain words: once a dig's rewrite is written, one small call per path of the dig (Haiku, the rewrite's writer, all at once)
 * offers up to 3 follow-up questions the person may choose to dig into, told what the whole debate already investigated. It
 * may offer none. They are sealed with the rewrite (`PathRewriteContent.dig_suggestions`, under the dig's key), so no new
 * table, a rewrite run again replays them free, and erasing the dig erases them.
 * - None on Free (owner F14: no AI call on Free; Free gets only the kinds code finds, packages/serve dig-suggestions.ts).
 * - None at level 10 (DIG_LEVEL_MAX): those paths cannot be dug.
 * - Money: every call is the dig's, `PATH_REWRITE:SUGGEST:<path>` on the story lane, charged on the same never-walled seam as
 *   its rewrite (`pathRewriteSeam`): a dig that started always gets them.
 * - A call that fails leaves that path without suggestions (the person may still add their own view); nothing stops the rewrite.
 * - Slips: code's salvage first (a suggestion resting on a point this path does not have is dropped, the rest kept), then the
 *   gateway's smallest follow-up, then none. Never a backup: this is a small extra, and its absence is harmless.
 */

export type DigPathSuggestions = Readonly<{ position_ref: string; suggestions: readonly DigSuggestion[] }>;

/** One dig's suggestions to write, handed by the rewrite (path-rewrite.ts). */
export type DigSuggestionsJob = Readonly<{
  digRunId: string;
  workItemId: string;
  level: number;
  free: boolean;
  question: PathRewriteQuestion;
  digPaths: readonly PathRewriteDigPath[];
  /** What the rewrite says the dig changed, sentence by sentence. */
  whatChanged: readonly string[];
  writer: StoryRoleMaker;
  send: (maker: StoryRoleMaker, request: ProviderCallRequest) => Promise<ProviderCallResult>;
  log: (event: string, detail: Record<string, unknown>) => void;
}>;

/** A suggestion's id: worked out by code from the dig, its path and its place, so a replay names it the same way. */
export function digSuggestionIdOf(digRunId: string, positionRef: string, at: number): string {
  return `s-${createHash("sha256").update(["debateai.dig-suggestion.v1", digRunId.toLowerCase(), positionRef, String(at)].join("\0"), "utf8").digest("hex").slice(0, 32)}`;
}

const SUGGESTION_MAX = WEB_CONTRACT_LIMITS.suggestionTextMaxChars;
/** What the person reads and may pick: the question, then why it could change the path, cut at the contract's length. */
const suggestionText = (question: string, why: string): string => {
  const both = `${question.trim()} ${why.trim()}`;
  return both.length <= SUGGESTION_MAX ? both : question.trim().slice(0, SUGGESTION_MAX);
};

type PathInput = Readonly<{
  fields: ReturnType<typeof webSuggestDigMaterialFields>;
  refs: ReadonlySet<string>;
}>;

/** One path's material: its points named by code (f1… for, a1… against), the same bytes every time. */
function materialOf(job: DigSuggestionsJob, path: PathRewriteDigPath, alreadyInvestigated: string): PathInput {
  const named = (side: "for" | "against", letter: string) => path.points.filter((point) => (point.side ?? "for") === side)
    .map((point, at) => Object.freeze({ ref: `${letter}${String(at + 1)}`, text: point.text, disputed: point.disputed }));
  const forPoints = named("for", "f");
  const againstPoints = named("against", "a");
  const all = [...forPoints, ...againstPoints];
  return Object.freeze({
    refs: new Set(all.map((point) => point.ref)),
    fields: webSuggestDigMaterialFields({ planFree: job.free, question: job.question.line, answer: path.statement,
      forPoints: forPoints.map(({ ref, text }) => ({ ref, text })), againstPoints: againstPoints.map(({ ref, text }) => ({ ref, text })),
      disputedRefs: all.filter((point) => point.disputed).map((point) => point.ref), whatChanged: job.whatChanged, alreadyInvestigated })
  });
}

/** One path's call. Never rejects: a failure is a path with no suggestions and one code line. */
async function suggestOnPath(job: DigSuggestionsJob, path: PathRewriteDigPath, at: number, alreadyInvestigated: string,
  contractHash: string): Promise<DigPathSuggestions | null> {
  try {
    // A path with no point has nothing a suggestion could start from.
    if (path.points.length === 0) return null;
    const { fields, refs } = materialOf(job, path, alreadyInvestigated);
    const language: QuestionLanguage | null = job.question.language;
    const framed = buildFramedPrompt({ contract: WEB_SUGGEST_DIG_PROMPT_CONTRACT, material: withQuestionLanguageField(fields, language) });
    const classify = (content: string, reply: ModelReplyFacts | undefined): ContentClassification =>
      classifyStructuredArtifact(content, webSuggestDigReplySchema, reply);
    const reading = rememberingAcceptedReply(classify);
    const bound = PATH_REWRITE_POLICY.writerBound;
    const result = await job.send(job.writer, Object.freeze({
      runId: job.digRunId, subjectItemId: job.workItemId, callSiteKey: pathRewriteSuggestCallSiteKey(at + 1), role: "SYNTHESIZER" as const,
      lane: "story" as const, preferredResponseFormat: "json_object" as const,
      bound: { maxAttempts: bound.maxAttempts, tokenCeiling: bound.tokenCeiling, deadlineMs: bound.deadlineMs },
      contractHash, providerRef: job.writer.providerRef, packet: framed.packet, classifyContent: reading.classifyContent,
      buildRepairPacket: (rejected: RejectedProviderContent) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
    }));
    const parsed = parseStructuredArtifact(result.content, webSuggestDigReplySchema, reading.acceptedAs(result.content).reply);
    if (parsed.kind !== "PARSED") return null;
    const kept = parsed.value.suggestions.filter((entry) => entry.rests_on.every((ref) => refs.has(ref)));
    const place = `path:${path.positionRef}`;
    return Object.freeze({ position_ref: path.positionRef, suggestions: Object.freeze(kept.map((entry, order): DigSuggestion => ({
      suggestion_id: digSuggestionIdOf(job.digRunId, path.positionRef, order + 1),
      kind: "HELPS_MAIN_QUESTION" as const,
      side: entry.side === "for" ? "FOR" as const : "AGAINST" as const,
      text: suggestionText(entry.question, entry.why),
      places: [place]
    }))) });
  } catch (error) {
    job.log("DIG_SUGGESTION_CALL_FAILED", { runId: job.digRunId, path: at + 1,
      code: error instanceof TypedDomainError ? error.code : "UNTYPED" });
    return null;
  }
}

/** The dig's suggestions, every path at once. None on Free and at level 10: no call, nothing read. Never rejects. */
export async function writeDigSuggestions(job: DigSuggestionsJob, alreadyInvestigated: () => Promise<string>,
  contractHash: string = engineContractHash()): Promise<readonly DigPathSuggestions[]> {
  if (job.free || job.level >= DIG_LEVEL_MAX || job.digPaths.length === 0) return [];
  let known: string;
  try {
    known = await alreadyInvestigated();
  } catch (error) {
    job.log("DIG_SUGGESTIONS_UNREAD", { runId: job.digRunId, code: error instanceof TypedDomainError ? error.code : "UNTYPED" });
    return [];
  }
  const paths = job.digPaths.slice(0, WEB_CONTRACT_LIMITS.pathsMax);
  const done = await Promise.all(paths.map((path, at) => suggestOnPath(job, path, at, known, contractHash)));
  return Object.freeze(done.filter((entry): entry is DigPathSuggestions => entry !== null && entry.suggestions.length > 0));
}

/**
 * On the runner's pool: the digest is cut at what the dig stored for its rewrite (0135's set-once input), else at its joining,
 * so a rewrite run again reads the same digest and its calls replay.
 */
export function writeDigSuggestionsOnPool(pool: Pool): (job: DigSuggestionsJob) => Promise<readonly DigPathSuggestions[]> {
  return (job) => writeDigSuggestions(job, async () => {
    const stored = (await new PostgresDigPicksRunnerRepository(pool).read(job.digRunId))?.input?.recordedAt ?? null;
    const joined = stored !== null ? null : (await new PostgresInvestigationRunnerRepository(pool).ofRun(job.digRunId))?.members
      .find((member) => member.run_id.toLowerCase() === job.digRunId.toLowerCase())?.joined_at ?? null;
    return readAlreadyInvestigated(pool, job.digRunId, stored ?? joined);
  });
}
