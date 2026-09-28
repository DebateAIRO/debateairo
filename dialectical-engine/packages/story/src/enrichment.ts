import {
  decryptLeasedContentForRun,
  prepareLeasedContentEncryptionForRun,
  type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import type { StoryNodeEnrichment } from "./material.js";

/**
 * THE STORY'S DATABASE MATERIAL (spec §3.1 step 2). The runner holds the claims
 * and the numbers in memory. What only the database holds is read here, inside
 * the run's content lease. `prepareLeasedContentEncryptionForRun` BORROWS the
 * lease the runner's hook already holds (and refuses to widen its run scope),
 * or takes one when this is called on its own, and loads the run's key ONCE for
 * every decrypt below:
 *
 *  - the judge's best case and strongest objection, from the judge's OWN raw
 *    artifact (`ledger.raw_artifact`, carrier `{ rawText }`). Parsed LENIENTLY:
 *    raw JSON, one code fence, or the outermost braces. A judgement that does
 *    not parse gives nulls for that node, never a throw.
 *  - the cross-maker review's outcome and its reasons (`ledger.node_review`,
 *    carrier `{ reasons }`).
 *  - the recorded panel dispersion (`ledger.reduced_judgement`).
 *
 * Every query is scoped to THIS run, so an artifact id from another run reads
 * as nothing. The result has one entry per requested node, in input order.
 * When no requested id is readable at all, the answer comes back before any
 * lease or query.
 */

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REVIEW_OUTCOMES: ReadonlySet<string> = new Set(["agree", "dispute", "cannot-assess"]);
const CODE_FENCE = "```";

function emptyEnrichment(): StoryNodeEnrichment {
  return Object.freeze({
    judgeBestCase: null,
    judgeObjection: null,
    reviewOutcome: null,
    reviewReasons: Object.freeze([]),
    dispersion: null
  });
}

/** The body of one fenced block (any info string), or null when the text is not one. */
function unfenced(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODE_FENCE) || !trimmed.endsWith(CODE_FENCE) || trimmed.length < 2 * CODE_FENCE.length) {
    return null;
  }
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline < 0) return null;
  return trimmed.slice(firstNewline + 1, trimmed.length - CODE_FENCE.length).trim();
}

function lenientJudgeObject(rawText: string): Readonly<Record<string, unknown>> | null {
  const candidates = [rawText.trim()];
  const fenced = unfenced(rawText);
  if (fenced !== null) candidates.push(fenced);
  const open = rawText.indexOf("{");
  const close = rawText.lastIndexOf("}");
  if (open >= 0 && close > open) candidates.push(rawText.slice(open, close + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Readonly<Record<string, unknown>>;
      }
    } catch {
      // Lenient on purpose: try the next reading, and in the end read nothing.
    }
  }
  return null;
}

function summaryOf(judge: Readonly<Record<string, unknown>> | null, member: "steelman" | "critic"): string | null {
  const block = judge?.[member];
  if (block === null || typeof block !== "object" || Array.isArray(block)) return null;
  const summary = (block as Readonly<Record<string, unknown>>).summary;
  return typeof summary === "string" && summary.trim() !== "" ? summary.trim() : null;
}

type JudgeText = { readonly bestCase: string | null; readonly objection: string | null };
type NodeReview = { readonly outcome: StoryNodeEnrichment["reviewOutcome"]; readonly reasons: readonly string[] };

/**
 * A UUID's letter case carries no meaning, and Postgres returns `uuid::text` in
 * lower case, so every lookup goes through this. The returned map still keys
 * each entry by the caller's own id.
 */
function idKey(id: string): string {
  return id.toLowerCase();
}

export async function readStoryEnrichment(
  pool: Pool,
  input: {
    readonly runId: string;
    readonly nodes: readonly { readonly nodeId: string; readonly judgeArtifactRef: string | null }[];
  }
): Promise<ReadonlyMap<string, StoryNodeEnrichment>> {
  const result = new Map<string, StoryNodeEnrichment>();
  for (const node of input.nodes) result.set(node.nodeId, emptyEnrichment());
  const nodeIds = [...new Set(input.nodes.map((node) => node.nodeId).filter((id) => UUID_TEXT.test(id)).map(idKey))];
  const artifactIds = [...new Set(input.nodes.flatMap((node) =>
    node.judgeArtifactRef !== null && UUID_TEXT.test(node.judgeArtifactRef) ? [idKey(node.judgeArtifactRef)] : []
  ))];
  if (nodeIds.length === 0 && artifactIds.length === 0) return result;

  const judgeTexts = new Map<string, JudgeText>();
  const reviews = new Map<string, NodeReview>();
  const dispersions = new Map<string, number>();
  const leased = await prepareLeasedContentEncryptionForRun(pool, input.runId);
  try {
    if (artifactIds.length > 0) {
      const artifacts = await pool.query<{
        raw_artifact_id: string;
        raw_text: string;
        content_ciphertext: CryptoEnvelope | null;
      }>(
        `SELECT artifact.raw_artifact_id::text AS raw_artifact_id, artifact.raw_text, artifact.content_ciphertext
         FROM ledger.raw_artifact AS artifact
         WHERE artifact.run_id = $1 AND artifact.raw_artifact_id = ANY($2::uuid[])`,
        [input.runId, artifactIds]
      );
      for (const row of artifacts.rows) {
        const content = decryptLeasedContentForRun<{ readonly rawText?: unknown }>(
          leased, "ledger.raw_artifact", row.raw_artifact_id, row.content_ciphertext,
          { rawText: row.raw_text }
        );
        const judge = typeof content.rawText === "string" ? lenientJudgeObject(content.rawText) : null;
        judgeTexts.set(row.raw_artifact_id, {
          bestCase: summaryOf(judge, "steelman"),
          objection: summaryOf(judge, "critic")
        });
      }
    }

    if (nodeIds.length > 0) {
      const reviewRows = await pool.query<{
        node_id: string;
        node_review_id: string;
        outcome: string;
        reasons: unknown;
        content_ciphertext: CryptoEnvelope | null;
      }>(
        `SELECT DISTINCT ON (review.node_id)
                review.node_id::text AS node_id, review.node_review_id::text AS node_review_id,
                review.outcome, review.reasons, review.content_ciphertext
         FROM ledger.node_review AS review
         WHERE review.run_id = $1 AND review.node_id = ANY($2::uuid[])
         ORDER BY review.node_id, review.at_seq DESC`,
        [input.runId, nodeIds]
      );
      for (const row of reviewRows.rows) {
        const content = decryptLeasedContentForRun<{ readonly reasons?: unknown }>(
          leased, "ledger.node_review", row.node_review_id, row.content_ciphertext,
          { reasons: row.reasons }
        );
        const reasons = Array.isArray(content.reasons)
          ? content.reasons.filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "")
          : [];
        reviews.set(row.node_id, {
          outcome: REVIEW_OUTCOMES.has(row.outcome) ? row.outcome as StoryNodeEnrichment["reviewOutcome"] : null,
          reasons: Object.freeze([...reasons])
        });
      }
      const judgementRows = await pool.query<{ node_id: string; dispersion: number | null }>(
        `SELECT DISTINCT ON (judgement.node_id) judgement.node_id::text AS node_id, judgement.dispersion
         FROM ledger.reduced_judgement AS judgement
         WHERE judgement.run_id = $1 AND judgement.node_id = ANY($2::uuid[])
         ORDER BY judgement.node_id, judgement.at_seq DESC`,
        [input.runId, nodeIds]
      );
      for (const row of judgementRows.rows) {
        const value = row.dispersion === null ? null : Number(row.dispersion);
        if (value !== null && Number.isFinite(value)) dispersions.set(row.node_id, value);
      }
    }
    // Nothing decrypted leaves unless the run's content is still live.
    await leased.assertLive();
  } finally {
    await leased.close();
  }

  for (const node of input.nodes) {
    const judge = node.judgeArtifactRef === null ? undefined : judgeTexts.get(idKey(node.judgeArtifactRef));
    const reviewed = reviews.get(idKey(node.nodeId));
    result.set(node.nodeId, Object.freeze({
      judgeBestCase: judge?.bestCase ?? null,
      judgeObjection: judge?.objection ?? null,
      reviewOutcome: reviewed?.outcome ?? null,
      reviewReasons: reviewed?.reasons ?? Object.freeze([]),
      dispersion: dispersions.get(idKey(node.nodeId)) ?? null
    }));
  }
  return result;
}
