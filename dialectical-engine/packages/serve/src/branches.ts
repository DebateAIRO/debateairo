import type { Pool } from "pg";
import {
  ANSWER_BRANCH_LIMITS, RUN_PATH_LIMITS, mainAnswerTrustWordOf, startMoreOf, type AnswerBranch, type AnswerBranches, type BranchState,
  type PathGapRound, type PathId, type PathOutcome, type RunPathFinding, type RunPathPointState, type RunPathProgress
} from "@debateai/contract";
import {
  PostgresPathProgressRepository, PostgresPathResultsRepository, PostgresStartPathsStore, decryptLeasedContentForRun,
  prepareLeasedContentEncryptionForRun, withRunContentLease, type CryptoEnvelope, type PathProgressRead, type PathProgressStore,
  type PathResultsStore, type PathRootInForce, type StartPathsStore, type StoredStartPathSet
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { isShapeReceiptV2 } from "@debateai/register";

/**
 * V4 start step, Task 57 (spec 2026-11-03 §2 items 7 and 8, §4.3; items journey-f1, wait-d1, wait-f16): the paths of a path debate as
 * the answer and the run read serve them (`Answer.branches`, Task 16), and each path's progress while it runs (`path_progress`, Task 57a).
 * Both are built by pure functions from what the debate stored: the chosen paths (0157), each path's root, answer so far and the gap round
 * (0158), and each path's step and point marks (0159). Only the run read's phase tells them apart: while the debate runs a path without an
 * answer so far is still being looked into, so each path fills in the moment its own outcome is stored, while the others keep working.
 * On a path debate the path id is the position everywhere, so its web paths are named by path id.
 */

/** RUN: the run read while the debate runs; ANSWER: the served answer, once every path is done. */
export type BranchPhase = "RUN" | "ANSWER";
export type BranchReadPorts = Pick<StartPathsStore, "readStartPaths" | "readStartPathIds">
  & Pick<PathResultsStore, "readPathRoots" | "readPathOutcomes" | "readPathGapRound">;

/** A path's state: its outcome's, and without one: still being looked into while the debate runs, else argued with a root, failed without. */
export function branchStateOf(outcome: PathOutcome | null, rootNodeId: string | null, phase: BranchPhase): BranchState {
  if (outcome !== null) return outcome.state === "FAILED" ? "FAILED" : "ARGUED";
  if (phase === "RUN") return "LOOKING";
  return rootNodeId === null ? "FAILED" : "ARGUED";
}

/**
 * The paths of a path debate, in the person's order: each with its state, root and answer so far; "+ N more", the menu's paths none of
 * whose viewpoints was chosen (none without a menu); "also raised", the gap round's first 40 points no path took; the main trust word
 * from the paths' words.
 */
export function answerBranchesOf(input: Readonly<{ set: StoredStartPathSet; roots: readonly Pick<PathRootInForce, "pathId" | "rootNodeId">[];
  outcomes: ReadonlyMap<string, PathOutcome>; gap: PathGapRound | null; phase: BranchPhase }>): AnswerBranches {
  const rootOf = new Map(input.roots.map((root) => [root.pathId as string, root.rootNodeId] as const));
  const paths = input.set.paths.map((path): AnswerBranch => {
    const outcome = input.outcomes.get(path.pathId) ?? null;
    const rootNodeId = rootOf.get(path.pathId) ?? null;
    return {
      path_id: path.pathId,
      order: path.pathNo,
      title: path.title,
      question: path.question,
      author: path.author,
      viewpoints: path.viewpoints.map((viewpoint) => ({ title: viewpoint.title, question: viewpoint.question, own: viewpoint.own })),
      state: branchStateOf(outcome, rootNodeId, input.phase),
      root_node_id: rootNodeId,
      outcome
    };
  });
  const chosen = new Set(input.set.paths.flatMap((path) => path.viewpoints.flatMap((viewpoint) => viewpoint.viewpointId ?? [])));
  const more = input.set.menu === null ? [] : startMoreOf(input.set.menu.menu, chosen)
    .map((item) => ({ more_id: item.more_id, title: item.title, question: item.question, is_new: item.is_new }));
  const alsoRaised = (input.gap?.points ?? []).filter((point) => point.path_id === null).map((point) => point.text)
    .slice(0, ANSWER_BRANCH_LIMITS.alsoRaisedMax);
  return {
    source: input.set.source,
    width: input.set.width,
    paths,
    more,
    also_raised: alsoRaised,
    main_trust: mainAnswerTrustWordOf(paths.map((path) => path.outcome?.trust ?? null)),
    carry_on_to_report: input.set.carryOnToReport
  };
}

/**
 * A debate's paths, or null when it keeps none (an R22 debate, or a path debate whose paths are not named yet). The ids are read first,
 * codes only, so a debate without paths has none of its content opened. A root a reclaim set aside is not named: the answer never points
 * at a node it does not serve.
 */
export async function readAnswerBranches(ports: BranchReadPorts, runId: string, phase: BranchPhase): Promise<AnswerBranches | null> {
  if (await ports.readStartPathIds(runId) === null) return null;
  const set = await ports.readStartPaths(runId);
  if (set === null) return null;
  const roots = (await ports.readPathRoots(runId)).filter((root) => !root.stale);
  const outcomes = await ports.readPathOutcomes(runId);
  const gap = await ports.readPathGapRound(runId);
  return answerBranchesOf({ set, roots, outcomes, gap: gap?.round ?? null, phase });
}

/** A path debate's web paths are stored and served by path id: the path id is the position everywhere (`webPathsAtRoots`). */
export function webPathRootsOfBranches(pathIds: readonly string[]): ReadonlyMap<string, string> {
  return new Map(pathIds.map((pathId) => [pathId, pathId] as const));
}

/** The branch reads on the runtime's pool: 0157's and 0158's stores. */
export function postgresBranchReadPorts(pool: Pool): BranchReadPorts {
  const paths = new PostgresStartPathsStore(pool);
  const results = new PostgresPathResultsRepository(pool);
  return Object.freeze({
    readStartPathIds: (runId: string) => paths.readStartPathIds(runId),
    readStartPaths: (runId: string) => paths.readStartPaths(runId),
    readPathRoots: (runId: string) => results.readPathRoots(runId),
    readPathOutcomes: (runId: string) => results.readPathOutcomes(runId),
    readPathGapRound: (runId: string) => results.readPathGapRound(runId)
  });
}

/* ----------------------------------------------------------------- each path's progress (wait-d1, journey-f1, wait-f16) */

export type PathProgressReadPorts = Pick<StartPathsStore, "readStartPathIds"> & Pick<PathResultsStore, "readPathOutcomes">
  & Pick<PathProgressStore, "readPathProgress">
  & Readonly<{ isPathRun(runId: string): Promise<boolean>; nodeClaimsOf(runId: string, nodeIds: readonly string[]): Promise<ReadonlyMap<string, string>> }>;

/** A path's dot: checked once its point has a CHECKED mark, being checked with a CHECKING mark, else put forward. */
function dotOf(marks: PathProgressRead["marks"], nodeId: string): RunPathPointState {
  if (marks.some((mark) => mark.nodeId === nodeId && mark.mark === "CHECKED")) return "CHECKED";
  if (marks.some((mark) => mark.nodeId === nodeId && mark.mark === "CHECKING")) return "BEING_CHECKED";
  return "PUT_FORWARD";
}

/** The marks that make a path's findings: what was found, while the path's outcome is stored and did not fail. */
function foundMarksOf(marks: PathProgressRead["marks"], outcome: PathOutcome | undefined): PathProgressRead["marks"] {
  return outcome === undefined || outcome.state === "FAILED" ? [] : marks.filter((mark) => mark.mark === "FOUND" && mark.trust !== null);
}

/**
 * Each path's progress, one entry per path id in order. A path whose outcome is stored shows no step and no dots but its findings: the
 * points found, in the order they were found, each in its own words (only the points in `claims`) and with its trust word, the first 40
 * (a failed path: none). A path still at work shows its newest step (none before its first) and its first 6 points put forward, in that
 * order, each checked, being checked or put forward; it shows nothing found. Nothing unchecked is ever readable.
 */
export function runPathProgressOf(input: Readonly<{ pathIds: readonly PathId[]; outcomes: ReadonlyMap<string, PathOutcome>; read: PathProgressRead;
  claims: ReadonlyMap<string, string> }>): readonly RunPathProgress[] {
  return Object.freeze(input.pathIds.map((pathId): RunPathProgress => {
    const marks = input.read.marks.filter((mark) => mark.pathId === pathId);
    const outcome = input.outcomes.get(pathId);
    if (outcome !== undefined) {
      const findings = foundMarksOf(marks, outcome).flatMap((mark): RunPathFinding[] => {
        const text = input.claims.get(mark.nodeId);
        return text === undefined || mark.trust === null ? [] : [{ node_ref: mark.nodeId, text, trust: mark.trust }];
      });
      return { path_id: pathId, step: null, points: [], findings: findings.slice(0, RUN_PATH_LIMITS.findingsMax) };
    }
    const points = marks.filter((mark) => mark.mark === "PUT_FORWARD").slice(0, RUN_PATH_LIMITS.pointsShownMax)
      .map((mark) => dotOf(marks, mark.nodeId));
    return { path_id: pathId, step: input.read.steps.get(pathId) ?? null, points, findings: [] };
  }));
}

/**
 * A debate's path progress, or null for an R22 debate (nothing else is read). A path debate whose paths are not named yet ("Just answer
 * it", or a list that could not be made, until the runner names them) has none to show: []. Else the ids, the outcomes and the marks, and
 * then the words of the points found on the paths that show findings, and no other content.
 */
export async function readRunPathProgress(ports: PathProgressReadPorts, runId: string): Promise<readonly RunPathProgress[] | null> {
  if (!await ports.isPathRun(runId)) return null;
  const pathIds = await ports.readStartPathIds(runId);
  if (pathIds === null) return Object.freeze([]);
  const outcomes = await ports.readPathOutcomes(runId);
  const read = await ports.readPathProgress(runId);
  const found = [...new Set(pathIds.flatMap((pathId) =>
    foundMarksOf(read.marks.filter((mark) => mark.pathId === pathId), outcomes.get(pathId)).map((mark) => mark.nodeId)))];
  const claims = found.length === 0 ? new Map<string, string>() : await ports.nodeClaimsOf(runId, found);
  return runPathProgressOf({ pathIds, outcomes, read, claims });
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The progress reads on the runtime's pool: 0157's ids, 0158's outcomes and 0159's marks. A path debate is one whose receipt is shape v2.
 * The points' words are opened in the run's content lease under its key, as the served answer opens its nodes; a node a reclaim set
 * aside is not the answer's and is not opened, and a debate erased meanwhile opens nothing.
 */
export function postgresPathProgressReadPorts(pool: Pool): PathProgressReadPorts {
  const paths = new PostgresStartPathsStore(pool);
  const results = new PostgresPathResultsRepository(pool);
  const progress = new PostgresPathProgressRepository(pool);
  return Object.freeze({
    isPathRun: async (runId: string) => {
      const basis = (await pool.query<{ envelope_basis: unknown }>("SELECT envelope_basis FROM core.run WHERE run_id = $1", [runId])).rows[0]?.envelope_basis;
      return isObject(basis) && isShapeReceiptV2(basis);
    },
    readStartPathIds: (runId: string) => paths.readStartPathIds(runId),
    readPathOutcomes: (runId: string) => results.readPathOutcomes(runId),
    readPathProgress: (runId: string) => progress.readPathProgress(runId),
    nodeClaimsOf: async (runId: string, nodeIds: readonly string[]): Promise<ReadonlyMap<string, string>> => {
      if (nodeIds.length === 0) return new Map();
      try {
        return await withRunContentLease(pool, [runId], async () => {
          const rows = (await pool.query<{ node_id: string; claim_text: string; content_ciphertext: CryptoEnvelope | null }>(
            `SELECT node_id::text AS node_id, claim_text, content_ciphertext FROM core.node
              WHERE run_id = $1 AND node_id = ANY($2::uuid[]) AND generation_status <> 'stale'`, [runId, [...nodeIds]])).rows;
          const cipher = await prepareLeasedContentEncryptionForRun(pool, runId);
          try {
            const claims = new Map<string, string>();
            for (const row of rows) {
              const opened = decryptLeasedContentForRun<unknown>(cipher, "core.node", row.node_id, row.content_ciphertext, { claimText: row.claim_text });
              if (isObject(opened) && typeof opened.claimText === "string" && opened.claimText !== "") claims.set(row.node_id, opened.claimText);
            }
            await cipher.assertLive();
            return claims;
          } finally {
            await cipher.close();
          }
        });
      } catch (error) {
        if (error instanceof TypedDomainError && error.code === "PRIVATE_CONTENT_ERASED") return new Map();
        throw error;
      }
    }
  });
}
