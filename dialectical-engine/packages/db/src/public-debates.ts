import type { Pool, PoolClient } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";

/**
 * Public debates anyone can dig (migration 0137; plan 2026-10-31-r22-owner-changes decision 13), through 0137's definers only.
 * `PostgresPublicDebateRepository` runs on the API's own pool (debateai_billing_runtime); `PostgresPublicDebateRunnerRepository` on the runner's or
 * the scheduler's pool, and the API's for the public page's two reads (`readPageUpdates`, `isAuthorNameGone`: debateai_runtime, which the API's roles
 * inherit). Its other methods, which take no owner, need the cross-account marker (debateai_rls_all_accounts), which the runner, the scheduler and
 * the API's system pool outside a request hold and the API's request login does not since 0171 (the security review, F5).
 *
 * What the later lanes must respect:
 * - Public (13): a dig on a public debate, the root's owner's too, joins the publication with 0147's join
 *   (`PostgresPublicTreeRepository.join`, public-tree.ts), never 0134's join; 0137's first public join is retired (0171 takes its
 *   grant back). Its picks go through `recordPicks` (the pick set's position_ref stays null, the path is on the contribution); its
 *   rewrite goes through `identity.path_update` with kind PUBLIC_DIG, by 0147's public turn, never 0134's tables, so a refused one is
 *   no one's current text. Every contribution must end in `settleCheck` (UNAVAILABLE when the check could not run), or the path's
 *   later rewrites wait for ever.
 * - An ALLOWED contribution's public text is copied with `recordPageUpdate`, sealed under the PUBLICATION's key (the API's
 *   PublicationCipher, keyId `publication-snapshot:<ref>:v1`), so the page outlives the digger's run key. The page shows the first
 *   snapshot, then `readPageUpdates` in order; a newer update of a path replaces the older on the page.
 * - The names: `contributor` is read live from the account, null once it went: the page says "a contributor". Same for the first
 *   author: `isAuthorNameGone` says the snapshot's sealed pseudonym must not be shown.
 * - A Free ask that showed the notice calls `recordFreeNotice`; only those debates ever go public. The sweep lists them
 *   (`readFreeToPublish`), runs the check, then `prepareFreePublication`, makes the key, and `publishFree`; a refusal is
 *   `refuseFree` (private for good); an unavailable check records nothing and the sweep tries again.
 * - A report on a public debate: 0147's `identity.open_public_report` (public-tree.ts); each PUBLIC_REPORT charge names the root's run
 *   and its payer through `recordReportCharge` (the runner's: the cross-account marker's since 0171); the window readers count it through
 *   0149's read_public_report_spent_by_funding (0137's read_public_report_spent had no caller and is no role's since 0171).
 */
type Executor = Pick<Pool, "query"> | PoolClient;

export const READ_DATA_EXPORT_PUBLIC_DEBATES = "identity.read_data_export_public_debates(uuid,uuid)" as const;

export type PublicContributionOutcome = "ALLOWED" | "REFUSED" | "UNAVAILABLE";
export type PublicContributionRead = Readonly<{
  dig_run_id: string; publication_ref: string; root_run_id: string; parent_run_id: string; position_ref: string | null;
  contributed_at: string; outcome: PublicContributionOutcome | null; checked_at: string | null;
  /** The digger's pseudonym, read live; null once the name went ("a contributor"). */
  contributor: string | null;
  /** Decision 33, on the person's own read only: their dig was taken off the page after a review; or it was running when the debate was hidden, and stays their own. */
  removed_after_review?: boolean;
  kept_private_after_review?: boolean;
}>;
export type PublicDigPick = Readonly<{
  kind: string; suggestion_id: string | null; place: string; author: string; content: unknown; attestation: string;
}>;
export type PublicPageUpdateKind = "PATH" | "MAIN_ANSWER";
export type PublicPageUpdateRead = Readonly<{
  update_seq: number; update_id: string; kind: PublicPageUpdateKind; position_ref: string | null; recorded_at: string;
  contributed_at: string | null; contributor: string | null;
  /** Under the publication's key. */
  content: CryptoEnvelope;
}>;
export type FreeToPublish = Readonly<{ run_id: string; owner_ref: string; notice_at: string }>;

/** The API's pool (debateai_billing_runtime). */
export class PostgresPublicDebateRepository {
  constructor(private readonly pool: Executor) {}

  /** 0135's picks of a dig joined to the publication (0147's join), each sealed under the DIG's run key. */
  async recordPicks(ownerRef: string, runId: string, picks: readonly PublicDigPick[]): Promise<"RECORDED" | "ALREADY" | "NOT_A_DIG" | "NOT_OWNED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_A_DIG" | "NOT_OWNED" }>(
      "SELECT identity.record_public_dig_picks($1,$2,$3::jsonb) AS outcome", [ownerRef, runId, JSON.stringify(picks)])).rows[0]!.outcome;
  }

  /** The person's own contributions around a debate, refused ones too: they stay private to the person. */
  async readOwn(ownerRef: string, runId: string): Promise<readonly PublicContributionRead[]> {
    return (await this.pool.query<{ own: PublicContributionRead[] }>(
      "SELECT identity.read_own_public_contributions($1,$2) AS own", [ownerRef, runId])).rows[0]!.own;
  }

  /** The ask showed the Free notice: this debate, and only such a debate, goes public when finished. */
  async recordFreeNotice(ownerRef: string, runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_OWNED" }>(
      "SELECT identity.record_free_public_ask($1,$2) AS outcome", [ownerRef, runId])).rows[0]!.outcome;
  }
}

/**
 * The runner's or the scheduler's pool. `readPageUpdates` and `isAuthorNameGone` are debateai_runtime's (the public page reads them on the API's
 * request pool); the rest, `readContribution` included, need the cross-account marker (debateai_rls_all_accounts), which the runner, the scheduler
 * and the API's system pool outside a request hold and the API's request login does not (0171).
 */
export class PostgresPublicDebateRunnerRepository {
  constructor(private readonly pool: Executor) {}

  /** A dig's contribution; null when the dig is not on a public tree (the runner's fork). */
  async readContribution(runId: string): Promise<PublicContributionRead | null> {
    return (await this.pool.query<{ contribution: PublicContributionRead | null }>(
      "SELECT identity.read_public_contribution_of_run($1) AS contribution", [runId])).rows[0]?.contribution ?? null;
  }

  /** The AI check's outcome, set once. */
  async settleCheck(runId: string, outcome: PublicContributionOutcome, checkRef: string | null): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>(
      "SELECT identity.settle_public_contribution($1,$2,$3) AS outcome", [runId, outcome, checkRef])).rows[0]!.outcome;
  }

  async recordPageUpdate(input: Readonly<{ updateId: string; publicationRef: string; kind: PublicPageUpdateKind; positionRef: string | null;
    digRunId: string; content: CryptoEnvelope }>): Promise<Readonly<{ outcome: "RECORDED" | "ALREADY" | "NOT_PUBLIC" | "NOT_ALLOWED"; updateSeq: number | null }>> {
    const row = (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_PUBLIC" | "NOT_ALLOWED"; update_seq: number | null }>(
      "SELECT outcome,update_seq FROM identity.record_public_debate_update($1,$2,$3,$4,$5,$6::jsonb)",
      [input.updateId, input.publicationRef, input.kind, input.positionRef, input.digRunId, JSON.stringify(input.content)])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, updateSeq: row.update_seq });
  }

  /** The public page's updates, oldest first, while it is public. */
  async readPageUpdates(publicationRef: string): Promise<readonly PublicPageUpdateRead[]> {
    return (await this.pool.query<{ updates: PublicPageUpdateRead[] }>(
      "SELECT identity.read_public_debate_updates($1) AS updates", [publicationRef])).rows[0]!.updates;
  }

  async isAuthorNameGone(publicationRef: string): Promise<boolean> {
    return (await this.pool.query<{ gone: boolean }>("SELECT identity.public_author_name_gone($1) AS gone", [publicationRef])).rows[0]!.gone;
  }

  /** The Free debates that finished and wait for their check. */
  async readFreeToPublish(limit = 20): Promise<readonly FreeToPublish[]> {
    return (await this.pool.query<{ waiting: FreeToPublish[] }>("SELECT identity.read_free_debates_to_publish($1) AS waiting", [limit])).rows[0]!.waiting;
  }

  /** Reserves the reference and the key's intent. Make the key only on PREPARED; `publishFree` repeats the token. */
  async prepareFreePublication(runId: string, publicationRef: string): Promise<Readonly<{
    outcome: "PREPARED" | "NOT_WAITING" | "ALREADY_PUBLIC" | "NO_SESSION" | "COLLISION"; grantTokenHash: string | null }>> {
    const row = (await this.pool.query<{ outcome: "PREPARED" | "NOT_WAITING" | "ALREADY_PUBLIC" | "NO_SESSION" | "COLLISION"; grant_token_hash: string | null }>(
      "SELECT outcome,grant_token_hash FROM core.prepare_free_publication($1,$2)", [runId, publicationRef])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, grantTokenHash: row.grant_token_hash });
  }

  async publishFree(input: Readonly<{ runId: string; publicationRef: string; grantTokenHash: string; content: CryptoEnvelope; presentedAt: Date }>):
    Promise<"PUBLISHED" | "NOT_WAITING" | "NO_INTENT"> {
    return (await this.pool.query<{ outcome: "PUBLISHED" | "NOT_WAITING" | "NO_INTENT" }>(
      "SELECT core.publish_free_debate($1,$2,$3,$4::jsonb,$5) AS outcome",
      [input.runId, input.publicationRef, input.grantTokenHash, JSON.stringify(input.content), input.presentedAt])).rows[0]!.outcome;
  }

  async refuseFree(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>(
      "SELECT identity.refuse_free_publication($1) AS outcome", [runId])).rows[0]!.outcome;
  }

  async recordReportCharge(input: Readonly<{ spendId: string; ownerRef: string; investigationId: string; reportVersion: number; chargeMicros: number }>):
    Promise<"RECORDED" | "ALREADY"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" }>(
      "SELECT identity.record_public_report_charge($1,$2,$3,$4,$5) AS outcome",
      [input.spendId, input.ownerRef, input.investigationId, input.reportVersion, input.chargeMicros])).rows[0]!.outcome;
  }
}
