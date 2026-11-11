import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository, PostgresPublicDebateRunnerRepository, PostgresTreeUpdateRunnerRepository, encryptAttestedContentForRun,
  withRunContentLease, type Pool
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway, TokenCounter } from "@debateai/providers";
import { postgresPathSuggestionsStore, refreshPathSuggestionsOnPool, writeOwnPathSuggestionsOnPool } from "./dig-suggestions-step.js";
import { firstDebateSuggestionFacts } from "./investigation-digest.js";
import { advanceAfterStory, advanceTree, type TreeSweepSettings, type TreeUpdateSettings } from "./path-climb.js";
import { postgresTreeUpdatePorts, readRecentTreeDigs } from "./path-climb-sources.js";
import { createPathRewriteInFlight, owedDigSuggestions, type PathRewriteRunnerSettings } from "./path-rewrite.js";
import { publicDigOnSettle, type PublicTreeRunnerSettings } from "./public-contribution.js";
import { postgresPathRewriteSources } from "./path-rewrite-sources.js";
import type { PathRewriteSweepSettings } from "./path-rewrite-sweep.js";
import { readReplayBook } from "./run-replay.js";

/**
 * THE PATH REWRITE, COMPOSED (dig-model revision task W3-7): the one function apps/runner/src/main.ts and the preview
 * practice (tools/preview-practice/practice-runner-composition.ts) both call, so the two hand the runner the same rewrite
 * (tests/unit/preview-practice-wiring-drift.test.ts). On the runner's own pool:
 *  - the sources in PostgreSQL (path-rewrite-sources.ts), the turns of 0134, each rewrite's text sealed under the DIG's
 *    run key (carrier identity.path_rewrite, the rewrite id its key), the dig's recorded calls as its replay book;
 *  - the writer is Claude Haiku 5.5 and the checker GLM (owner Q-D10), each the configured target of that model; the
 *    run's own claim-eligible members serve after settle (the snapshot's resolver), the configured ones in the sweep;
 *  - the money: every call names the dig's run on the story lane at a PATH_REWRITE: site, so the target gateways charge
 *    it on the never-walled PATH_REWRITE seam (`buildPathRewriteCostEnvelopeSeam`, W3-2's `pathRewriteSeam`);
 *  - the sweep's list (0135) and the shared in-flight set, so the sweep never runs a second copy beside a live rewrite;
 *  - R22 decisions 2 and 3 (0138): each dig's turn held to its path's whole line, and once its row is stored the climb and the main
 *    answer (path-climb.ts), with the configured members, on the same in-flight set, with their own sweep; V4 start step, Task 55e: and
 *    once a dig under the main question of a path debate has its story, that main-answer update (`afterStory`), on the same set and sweep.
 * Absent (undefined) when the configured targets hold no Haiku or no GLM: every settled run then writes its story as
 * before, rather than every dig ending FAILED for want of its two roles.
 */
export const PATH_REWRITE_WRITER_MODEL = "claude-haiku-5-5" as const;
export const PATH_REWRITE_CHECKER_MODEL = "zai-org/GLM-5.3-Flash" as const;

export type PathRewriteComposed = Readonly<{ settings: PathRewriteRunnerSettings; sweep: PathRewriteSweepSettings; treeSweep: TreeSweepSettings; publicTree: PublicTreeRunnerSettings }>;

export function composePathRewrite(input: Readonly<{
  pool: Pool;
  /** The configured targets (their refs and models). */
  targets: readonly Readonly<{ providerRef: string; model: string }>[];
  /** The configured members in their order (the story writer's boot resolver's): the sweep's writer, checker and backups. */
  members: readonly Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>[];
  /** Decision 28: Anthropic's free token count (main.ts). */
  tokenCount?: TokenCounter;
  /**
   * V4 start step, Task 57p (0169; the owner's answer of 8 Nov, "On each piece's record"): the runner's run → version map's reader
   * (main.ts `pieceSettingsVersionOf`); the rewrite, the tree's levels and main-answer versions and a public dig's passed check each note the version of the run its calls were charged to. Absent: none (NULL).
   */
  settingsVersionOf?: (runId: string) => number | undefined;
  log: (event: string, detail: Record<string, unknown>) => void;
}>): PathRewriteComposed | undefined {
  const writerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_WRITER_MODEL)?.providerRef;
  const checkerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_CHECKER_MODEL)?.providerRef;
  if (writerRoleRef === undefined || checkerRoleRef === undefined) return undefined;
  const pool = input.pool;
  const members = Object.freeze([...input.members]);
  const roles = Object.freeze({
    resolveProvider: (roleRef: string) => {
      const member = members.find((candidate) => candidate.providerRef === roleRef);
      return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
    },
    backupCandidates: members,
    backupMakers: Object.freeze(members.map((member) => Object.freeze({ providerRef: member.providerRef, maker: member.maker })))
  });
  const inFlight = createPathRewriteInFlight();
  const refreshSuggestions = refreshPathSuggestionsOnPool(pool);
  const suggestionStore = postgresPathSuggestionsStore(pool);
  const tokenCount = input.tokenCount === undefined ? {} : { tokenCount: input.tokenCount };
  // Task 57p: one reader of the run → version map for the rewrite, the tree and the public tree alike.
  const versionOf = input.settingsVersionOf === undefined ? {} : { settingsVersionOf: input.settingsVersionOf };
  const tree: TreeUpdateSettings = Object.freeze({ ports: postgresTreeUpdatePorts(pool), roles, writerRoleRef, checkerRoleRef, inFlight, log: input.log, ...tokenCount, ...versionOf,
    // Owner Q-D8: a level a climb really changed gets its suggestions worked out again, each level its own set and call site.
    afterLevel: async (level, written) => {
      if (written === null) return;
      await refreshSuggestions(Object.freeze({ digRunId: level.digRunId, workItemId: written.workItemId, free: written.free, question: written.question,
        debateRunId: level.parentRunId, positionRef: level.positionRef, line: written.line, points: written.points, whatChanged: written.whatChanged,
        step: written.step, writer: written.writer, send: written.send, log: written.log }));
    } });
  // Decision 13: a dig on a public debate is a contribution, on its own pipeline (public-contribution.ts), read only from the public copy.
  const publicTree: PublicTreeRunnerSettings = Object.freeze({ pool, roles, writerRoleRef, checkerRoleRef, inFlight, log: input.log, ...tokenCount, ...versionOf });
  const settings: PathRewriteRunnerSettings = Object.freeze({
    ...tokenCount,
    ...versionOf,
    publicDig: publicDigOnSettle(publicTree, () => settings),
    isPublicDig: async (runId: string) => (await new PostgresPublicDebateRunnerRepository(pool).readContribution(runId)) !== null,
    sources: postgresPathRewriteSources(pool),
    turns: new PostgresDigModelRunnerRepository(pool),
    seal: (digRunId: string, rewriteId: string, content: unknown) => withRunContentLease(pool, [digRunId], async () => {
      const sealed = await encryptAttestedContentForRun(pool, digRunId, PATH_REWRITE_CARRIER, rewriteId, content);
      if (sealed === null) throw new TypedDomainError("PATH_REWRITE_ENCRYPTION_REQUIRED", "A rewrite is kept only under its dig's run key");
      return sealed;
    }),
    writerRoleRef,
    checkerRoleRef,
    replayBookOf: (runId: string, workItemId: string) => readReplayBook(pool, runId, workItemId),
    log: input.log,
    inFlight,
    // W4-3: the AI's suggestions on the dig's own paths, told what the whole debate already investigated. B3: asked once the row is
    // stored, beside the climb, each set kept in 0141's store.
    suggest: writeOwnPathSuggestionsOnPool(pool),
    // Owner Q-D8, and a first debate's own (0141).
    refreshSuggestions,
    firstDebateSuggestions: Object.freeze({ store: suggestionStore, read: firstDebateSuggestionFacts(pool) }),
    line: new PostgresTreeUpdateRunnerRepository(pool),
    afterStored: (digRunId, lease, alongside) => advanceTree(tree, digRunId, lease, alongside),
    // V4 start step, Task 55e: a dig under the main question of a path debate updates the main answer once its story is written.
    afterStory: (runId, lease) => advanceAfterStory(tree, runId, lease)
  });
  const picks = new PostgresDigPicksRunnerRepository(pool);
  return Object.freeze({
    settings,
    publicTree,
    sweep: Object.freeze({
      rewrite: settings,
      list: (before: Date, limit: number) => picks.readUnwritten(before, limit),
      roles
    }),
    // B3: beside each climb it walks, the dig's own suggestions a stopped runner left unwritten.
    treeSweep: Object.freeze({ tree, list: (since: Date, before: Date, limit: number) => readRecentTreeDigs(pool, since, before, limit),
      owed: (digRunId: string) => owedDigSuggestions(settings, roles, suggestionStore, digRunId) })
  });
}
