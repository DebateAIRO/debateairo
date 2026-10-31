import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository, encryptAttestedContentForRun,
  withRunContentLease, type Pool
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway } from "@debateai/providers";
import { createPathRewriteInFlight, type PathRewriteRunnerSettings } from "./path-rewrite.js";
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
 *  - the sweep's list (0135) and the shared in-flight set, so the sweep never runs a second copy beside a live rewrite.
 * Absent (undefined) when the configured targets hold no Haiku or no GLM: every settled run then writes its story as
 * before, rather than every dig ending FAILED for want of its two roles.
 */
export const PATH_REWRITE_WRITER_MODEL = "claude-haiku-5-5" as const;
export const PATH_REWRITE_CHECKER_MODEL = "zai-org/GLM-5.3-Flash" as const;

export type PathRewriteComposed = Readonly<{ settings: PathRewriteRunnerSettings; sweep: PathRewriteSweepSettings }>;

export function composePathRewrite(input: Readonly<{
  pool: Pool;
  /** The configured targets (their refs and models). */
  targets: readonly Readonly<{ providerRef: string; model: string }>[];
  /** The configured members in their order (the story writer's boot resolver's): the sweep's writer, checker and backups. */
  members: readonly Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>[];
  log: (event: string, detail: Record<string, unknown>) => void;
}>): PathRewriteComposed | undefined {
  const writerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_WRITER_MODEL)?.providerRef;
  const checkerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_CHECKER_MODEL)?.providerRef;
  if (writerRoleRef === undefined || checkerRoleRef === undefined) return undefined;
  const pool = input.pool;
  const settings: PathRewriteRunnerSettings = Object.freeze({
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
    inFlight: createPathRewriteInFlight()
  });
  const members = Object.freeze([...input.members]);
  const picks = new PostgresDigPicksRunnerRepository(pool);
  return Object.freeze({
    settings,
    sweep: Object.freeze({
      rewrite: settings,
      list: (before: Date, limit: number) => picks.readUnwritten(before, limit),
      roles: Object.freeze({
        resolveProvider: (roleRef: string) => {
          const member = members.find((candidate) => candidate.providerRef === roleRef);
          return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
        },
        backupCandidates: members,
        backupMakers: Object.freeze(members.map((member) => Object.freeze({ providerRef: member.providerRef, maker: member.maker })))
      })
    })
  });
}
