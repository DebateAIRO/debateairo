// tests/integration/security-review-hardening-database.test.ts
// Migration 0171 (the security review of 3 Nov 2026) on real PostgreSQL, through the dev logins the product runs on (and, for the Report button's
// settlement, the provider probe's writer and the API's discovery, the billing functions keyed by a run or an owner and an account's own flows, the
// production logins of P3-01 too): what each fix closes, and
// that the legitimate path beside it still works. One describe per fix, named by its letter as the migration names it. Data is made up.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import {
  askClarifyChargeWriterPresent, askClarifyReservationPresent, CostEnvelopeGuard, languageCheckSpendWriterPresent, PostgresModelSpendStore,
  questionCheckSpendWriterPresent, recordAskClarifyCharge, recordLanguageCheckSpend, recordQuestionCheckSpend, reserveAskClarifyCharge
} from "@debateai/budget";
import {
  BillingJobQueries, BillingRepository, createPool, crossAccount, crossAccountPool, EntitlementRepository, migrate, PostgresDigModelRepository,
  PostgresInternalAllowanceRepository, PostgresConsumerAuthRepository, PostgresConsumerRecoveryRepository, PostgresDataExportRepository, PostgresEmailChangeRepository,
  PostgresInvestigationRepository, PostgresPassageRetentionRepository, PostgresPublicationRepository, PostgresPublicDebateRepository,
  PostgresPublicFlagRepository, PostgresPublicReviewRepository, PostgresStaffAlertRepository, ProviderProbeRepository, RunRepository, RunWaitRepository,
  type Pool
} from "@debateai/db";
import { onOwnConnections } from "../../packages/db/src/account-context.js";
import { createEmailBlindIndex, decodeBase32, generateVerificationToken, hashToken, totpCodeAtStep, type AuditContextHasher } from "@debateai/crypto";
import { currentDocument } from "@debateai/legal-manifest";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, loadBootstrapRegister, parseRegisterVersionText, persistBootstrapRegister,
  registerVersionToSafeLegacyNumber
} from "@debateai/register";
import { PublicationReviewRepository, reviewStateOf, SynthesisCheckRepository } from "@debateai/serve";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { BillingErasureHook, erasurePendingOf } from "../../apps/api/src/billing/erasure-hook.js";
import { buildApi, type ApiOptions } from "../../apps/api/src/index.js";
import { createProviderDiscoveryResolver, parseProviderDiscoveryTargets, type ProviderDiscoveryProbeStore } from "../../apps/api/src/provider-discovery.js";
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { recordingAudit, seedNetopiaSubscription } from "../support/billingSubscriptionFixtures.js";
import { internalFundingFixture, plentyOfTeamRoom } from "../support/internalFundingFixture.js";
import { publishReplacementRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import {
  httpIdentityFor, inAccountRequest, provisionRlsLogins, seedLiveSession, seedSessionAccount, type ApiTestPools, type RlsLogins, type RlsTestAccount
} from "../support/rls-logins.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { openRlsAccountServices, rlsWaitForTotpStepAfter } from "../../tools/rls/test-accounts.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
/** The API's request login (api-runtime: debateai_billing_runtime, no cross-account marker). */
let apiRequest: Pool;
/** The API's system login (api-system: debateai_billing_runtime and the cross-account marker), the pool the staff routes and sweeps run on. */
let apiSystem: Pool;
/** The runner's login (debateai_runtime and the cross-account marker): the passage sweep's. */
let runner: Pool;
/** The erasure worker's login (debateai_erasure_runtime): the forget definers'. */
let erasure: Pool;
let sequence = 9_900_000;
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const ATTESTATION = Buffer.alloc(32, 7);

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(work: () => Promise<unknown>): Promise<SqlError> {
  try { await work(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const hash = (value: string): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;

type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `review-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A debate of `owner`'s, as a run row and its ownership event. */
async function run(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  await seeded([[`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]]]);
  return runId;
}
const pubEnvelope = (ref: string) => ({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
/** The debate made public under a new link, as the transition does: its snapshot and its PUBLISHED event. */
async function publish(runId: string): Promise<string> {
  const ref = randomUUID();
  await seeded([
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
      [ref, runId, JSON.stringify(pubEnvelope(ref))]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}
/** The debate made private again under that link, as the transition's unpublish writes it. */
async function unpublish(runId: string, ref: string): Promise<void> {
  await seeded([[`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
}

/**
 * The definers the two merges of feat/2026-10-28-v4-initial (both 2026-11-09) brought that either request login may EXECUTE and that none of the census's four lists truly
 * holds: seventeen of the first merge (0156's, 0157's and 0170's) and forty-three of the second (0158's to 0169's). Each asks nothing of the connection, so each reason says
 * plainly what a request login can do with it. This step does not harden them: they are open, for a step of their own, and 0171's header says so. The first merge's other six
 * and the second's other three (0159's and 0160's writers of a sealed row, whose attestation no request login can make) are in the four lists, each because its body belongs
 * there. The grants of debateai_billing_runtime reach api-runtime alone (measured on P3-01's memberships: api-authorization holds debateai_authorization_runtime and through it
 * debateai_runtime), so 0161's report count, 0162's five, 0165's read and re-open and 0167's press are api-runtime's alone; every other one here is either request login's.
 */
const ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED: Readonly<Record<string, string>> = {
  "identity.claim_moderation_notices(integer)":
    "0156's claim (this release no longer calls it), no owner and no connection asked: claims up to 100 of any accounts' pending notices at a time and hands back each claim token",
  "identity.read_moderation_notice(uuid,uuid)":
    "0156's read under a claim, whose token the claim above hands any request login: a notice's user id, kind, time, language and the account's address, sealed",
  "identity.complete_moderation_notice(uuid,uuid,text)":
    "0156's settlement under that token: marks a notice delivered unsent, or dropped, so its person is never told their content left the page",
  "identity.claim_moderation_statements(integer)":
    "0157's claim, no owner and no connection asked: claims up to 100 of any accounts' pending statements of reasons at a time and hands back each claim token",
  "identity.read_moderation_statement(uuid,uuid)":
    "0157's read under a claim, whose token the claim above hands any request login: a statement's user id, publication, ground, time, language and the sealed address",
  "identity.complete_moderation_statement(uuid,uuid,text)":
    "0157's settlement under that token: marks a statement of reasons delivered unsent, or dropped, so its person is never sent it",
  "identity.claim_public_flag_mail(integer)":
    "0157's claim, no owner and no connection asked: claims up to 100 of any reporters' pending answer mails at a time and hands back each claim token",
  "identity.read_public_flag_mail(uuid,uuid)":
    "0157's read under a claim, whose token the claim above hands any request login: a report's user id, publication, kind, time, language and the reporter's sealed address",
  "identity.complete_public_flag_mail(uuid,uuid,text)":
    "0157's settlement under that token: marks a reporter's answer delivered unsent, or dropped, so the person who reported is never told the outcome",
  "identity.read_own_moderation_statements(uuid)":
    "0157's reader takes the owner it is handed and asks nothing: for any owner ref, that person's statements, their kinds, run ids, publications and grounds, and the sealed facts and quote",
  "identity.read_own_contribution_review(uuid,uuid)":
    "0157's reader takes the owner it is handed and asks nothing: for any owner ref and run id, which of that person's public contributions are off for review or kept private",
  "identity.record_public_flag_quote(uuid,jsonb)":
    "0157's keeper of an automatic hide's quote, asks nothing: given a flag id that hid its debate, writes the first sealed quote, an envelope of its own making, where the owner's statement reads it",
  "identity.settle_stuck_public_flags()":
    "0157's sweep, asks nothing: moves any report left CHECKING for five minutes to a person with the verdict UNAVAILABLE; it names no verdict of its own and hides nothing",
  "identity.delete_moderation_words_due()":
    "0157's retention sweep, asks nothing: runs the twelve-month erasure of typed facts and quotes early; it can only take what is already due",
  "identity.reserve_outbound_mail(text,integer)":
    "0170's count takes a ceiling from its caller: any number of calls fill the day's count, so the mail gate refuses every later account mail until the next UTC day",
  "identity.claim_outbound_mail_alert(text,date)":
    "0170's one-a-day alert, asks nothing: takes today's or yesterday's alert of a kind, so the API's own alert to the team is never sent",
  "identity.outbound_mail_recipient_suppressed(bytea)":
    "0170's question whether a 32-byte digest is suppressed: one bit, for digests keyed by the API's key, of a list that is empty until the bounce feed exists",
  // The second merge: what 0158 to 0169 brought.
  "core.claim_carry_on_due(integer)":
    "0159's claim, no owner and no connection asked: marks up to 50 debates' carry-on BEGUN and hands back each one's owner ref, user id and identity session id, so the API's own claim finds them gone",
  "core.continue_failed_run(uuid,uuid,text,bigint)":
    "0165's and 0168's re-open takes the owner it is handed: re-opens any named owner's failed debate, so the runner resumes it and buys what never ran on that person's quota",
  "core.read_carry_on_begun(integer)":
    "0159's list, asks nothing: up to 50 begun carry-ons of any accounts, each with its owner ref, user id and identity session id",
  "core.read_carry_on_mark(uuid)":
    "0161's one word of any run id: whether its carry-on is due, begun or done, or none",
  "core.read_path_gap_round(uuid)":
    "0160's reader of any run id whose content is live: a path debate's gap round count and its sealed text",
  "core.read_path_outcomes(uuid)":
    "0160's reader of any run id whose content is live: each path's state and its sealed answer",
  "core.read_path_progress(uuid)":
    "0161's reader of any run id whose content is live: each path's steps, the marks on its points, their trust words and times",
  "core.read_path_roots(uuid)":
    "0160's reader of any run id whose content is live: each path's root node, its maker and whether it is stale",
  "core.read_run_continue(uuid,uuid)":
    "0165's and 0168's read takes the owner it is handed: for any owner ref and run id, the debate's work state, its stop reason, whether it is paused, set aside or settled, and how often it was continued",
  "core.read_start_path_ids(uuid)":
    "0159's ids of any run id: which paths b1 to b8 the debate chose",
  "core.read_start_paths(uuid)":
    "0159's reader of any run id whose owner is here: the chosen paths' authors, counts, the carry-on box and times, with their sealed titles and questions",
  "core.record_carry_on_done(uuid)":
    "0159's mark, asks nothing: ends any begun carry-on, so that debate's remaining digs and its report are not made",
  "core.record_carry_on_due(uuid)":
    "0159's mark, asks nothing: marks any debate whose person ticked the box due before its story is ready, so its carry-on begins early",
  "core.record_path_point_mark(uuid,text,uuid,text,text)":
    "0161's writer, asks nothing: for any run id, path and point of that run, writes a progress mark and a trust word the page shows, the first of each kind standing",
  "core.record_path_step(uuid,text,text)":
    "0161's writer, asks nothing: for any run id and one of its paths, writes a step the waiting page shows, the first of each standing",
  "core.record_work_item_retry(uuid,uuid,timestamp with time zone)":
    "0165's writer, asks nothing: for any CLAIMED work item named with its run, sets the time its one automatic retry waits for",
  "core.write_path_root(uuid,text,integer,uuid,text)":
    "0160's writer, asks nothing: for any run whose content is live, writes a path's root or, when its root is stale, moves it to another node",
  "identity.count_public_reports(uuid,uuid)":
    "0161's count takes the owner it is handed: two numbers for any publication, its reports and how many that owner wrote",
  "identity.create_saved_question(uuid,uuid,jsonb,jsonb)":
    "0162's writer takes the owner it is handed: fills any active account's twenty saved questions with envelopes of its own making",
  "identity.delete_saved_question(uuid,uuid)":
    "0162's writer takes the owner it is handed: deletes any named person's saved question by its id",
  "identity.link_pre_start_try(uuid,text,uuid)":
    "0165's writer takes the owner it is handed and needs that person's 64-hex try reference and a run of theirs: gives the try's calls to that run, so that run's failure gives their charge back",
  "identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid)":
    "0167's report press takes the owner it is handed (0147's press beside it, which 0171 made ask the connection, is the one the API no longer calls): opens a report on any public debate in any owner's name, the writer its calls are charged to",
  "identity.read_main_answer_times(uuid)":
    "0166's reader of any run id: each main-answer version's id, time and the run that triggered it",
  "identity.read_pre_start_spent(uuid,timestamp with time zone,timestamp with time zone)":
    "0158's reader takes the owner it is handed: any person's total of calls before Start in any window, whose answer caps that person's quota",
  "identity.read_run_quota_used(uuid,uuid)":
    "0165's question takes the owner it is handed: SOME or NONE, whether that person's debate has been charged anything",
  "identity.read_saved_question(uuid,uuid)":
    "0162's reader takes the owner it is handed: any named person's saved question, its sealed title and text, by its id",
  "identity.read_saved_questions(uuid,integer)":
    "0162's reader takes the owner it is handed: any named person's list of saved questions, their ids, revisions, sealed titles and times",
  "identity.record_investigation_report_version_with_settings(uuid,integer,uuid,text,text,text,uuid,timestamp with time zone,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0136's report writer, which 0171 moved to the marker: on any closing waiting for its report, writes it FAILED, so the real report is never recorded (a READY row needs an attestation only the run's key can make)",
  "identity.record_main_answer_update_with_settings(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0138's main-answer writer, which 0171 moved to the marker: appends a FAILED main-answer row to any live debate, naming any trigger and any payer, and a trigger already recorded writes no real one after (a READY row needs an attestation)",
  "identity.record_path_rewrite_in_line_with_settings(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0138's in-line rewrite writer, which 0171 moved to the marker: writes a dig's turn FAILED at the line's front, so the real rewrite is never recorded (a READY row needs an attestation)",
  "identity.record_path_rewrite_with_settings(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0134's rewrite writer, which 0171 moved to the marker: writes any dig's open turn FAILED, so the real rewrite is never recorded and the path's later digs go on without it (a READY row needs an attestation)",
  "identity.record_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0138's climb writer, which 0171 moved to the marker: writes a climb's open turn FAILED by its update id, so the real climb is never recorded (a READY row needs an attestation)",
  "identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)":
    "0158's charge takes the owner it is handed, as the clarify charge did before 0171 took it to the marker: writes any size on the site's day of today or the day either side, and any person's quota, so a request login can fill the day and stop every paid call",
  "identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text)":
    "0165's charge calls 0158's and asks nothing: the same write on the site's day and any person's quota, with a try reference of its own making",
  "identity.record_public_answer_update_with_settings(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0147's public main-answer writer, which 0171 moved to the marker: appends a FAILED version to any allowed dig's public debate, and a trigger already recorded writes no real one after (a READY row needs an attestation)",
  "identity.record_public_check_passed_with_settings(uuid,uuid,bigint)":
    "0169's twin, word for word, of 0147's record of a public dig's passed check, which 0171 moved to the marker: marks any public dig's check as passed under any check id",
  "identity.record_public_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0147's public climb writer, which 0171 moved to the marker: writes a public dig's open climb FAILED, so the real climb is never recorded (a READY row needs an attestation)",
  "identity.record_public_report_with_settings(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0147's public report writer, which 0171 moved to the marker: closes any public report still being written FAILED, so its report never comes (a READY row needs an attestation)",
  "identity.record_web_reading_with_settings(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea,bigint)":
    "0169's twin, word for word, of 0132's reading writer, which 0171 moved to the marker: for a page of any live run, writes a FAILED reading under any reader and maker, which takes that reader's place on the page (a READ row needs an attestation)",
  "identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb)":
    "0162's writer takes the owner it is handed: overwrites any named person's saved question, by its id and revision, with an envelope of its own making",
  "ledger.call_waived_attempts(uuid)":
    "0165's reader takes the owner it is handed: the attempt ids of that person's calls already waived",
  "ledger.record_call_waiver(uuid,uuid[])":
    "0165's writer, asks nothing: for any run and attempts it charged, takes those calls out of its owner's day, week and month, the site paying",
  "ledger.spend_waived_until(uuid)":
    "0168's bound of any run id: -infinity, infinity or a time, whether that debate's spend is set aside and until when"
};
/** The ones in the identity schema that take an owner and that the billing role may call. The owner-keyed census below names them, so a new one that asks nothing still fails. */
const ARRIVED_OWNER_TAKING = [
  "identity.count_public_reports(uuid,uuid)", "identity.create_saved_question(uuid,uuid,jsonb,jsonb)", "identity.delete_saved_question(uuid,uuid)",
  "identity.link_pre_start_try(uuid,text,uuid)", "identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid)",
  "identity.read_own_contribution_review(uuid,uuid)", "identity.read_own_moderation_statements(uuid)",
  "identity.read_pre_start_spent(uuid,timestamp with time zone,timestamp with time zone)", "identity.read_run_quota_used(uuid,uuid)", "identity.read_saved_question(uuid,uuid)",
  "identity.read_saved_questions(uuid,integer)", "identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)",
  "identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text)", "identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb)"
] as const;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  apiRequest = createPool(logins.url("DATABASE_URL"));
  apiSystem = createPool(logins.url("API_SYSTEM_DATABASE_URL"));
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  erasure = createPool(logins.url("ERASURE_DATABASE_URL"));
}, 600_000);

afterAll(async () => {
  await Promise.all([apiRequest?.end(), apiSystem?.end(), runner?.end(), erasure?.end()]);
  await logins?.end();
  await database?.stop();
});

describe("F3: the legacy public join is no one's to call", () => {
  const JOIN = "SELECT * FROM identity.join_public_investigation($1,$2,$3,$4::text[],$5,$6)";

  it("the API's own logins are refused it, no role but its owner holds it, and the repository no longer offers it", async () => {
    const [ana, dan] = [await account(), await account()];
    const root = await run(ana);
    const dig = await run(dan);
    await publish(root);
    const values = [dan.ownerRef, root, dig, ["pos-1"], "quick", "pos-1"];
    for (const pool of [apiRequest, apiSystem]) expect((await sqlError(() => pool.query(JOIN, values))).code).toBe("42501");
    const grantees = (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
      WHERE p.oid='identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)'::regprocedure AND a.grantee<>p.proowner`)).rows;
    expect(grantees).toEqual([]);
    // Nothing was written: no investigation, no member, no contribution.
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_contribution WHERE dig_run_id=$1", [dig])).rows[0]!.n)).toBe(0);
    expect(Object.getOwnPropertyNames(PostgresPublicDebateRepository.prototype)).not.toContain("join");
  });
});

describe("F4a: an append-only row goes only inside its definer's own scope, never by a setting a session can change", () => {
  /** One guarded row: the scope its guard asks for (and so the old setting debateai.<scope>_forget), its table, the column holding its debate, the guard's refusal. */
  type Guarded = Readonly<{ scope: string; table: string; key: string; message: string }>;
  const SCOPES = ["web_evidence", "investigation", "dig_model", "dig_picks", "public_debate", "tree_updates", "passage_retention", "path_suggestions", "public_tree"] as const;
  const HELPERS = ["identity.open_forget_scope(text)", "identity.close_forget_scope(text)", "identity.forget_scope_open(text)"] as const;
  /** What each forget definer takes, by the scope it opens. */
  const FORGET = [
    ["identity.forget_erased_debate_investigation", "investigation"], ["identity.forget_erased_debate_web_evidence", "web_evidence"],
    ["identity.forget_erased_debate_dig_model", "dig_model"], ["identity.forget_erased_debate_dig_picks", "dig_picks"],
    ["identity.forget_erased_debate_public", "public_debate"], ["identity.forget_erased_debate_tree_updates", "tree_updates"],
    ["identity.forget_erased_debate_passages", "passage_retention"], ["identity.forget_erased_debate_path_suggestions", "path_suggestions"],
    ["identity.forget_erased_debate_public_tree", "public_tree"]
  ] as const;

  /**
   * One row under each of the ten guards, every one of them `runId`'s and standing on its own: the member's investigation and the report's closing are
   * there too, so neither goes as a cascade would; the owner is a live account, so none goes as an erased account's would.
   */
  async function guardedRows(owner: Account, runId: string, parentRunId: string, publicationRef: string): Promise<readonly Guarded[]> {
    const investigationId = randomUUID();
    const envelope = JSON.stringify(ENVELOPE);
    await seeded([
      [`INSERT INTO identity.web_search (search_id,run_id,owner_ref,path_ref,side,language_kind,language,look_back,outcome,charge_micros,result_count,content_ciphertext)
        VALUES ($1,$2,$3,'pos-1','for','english','en','none','EMPTY',0,0,$4::jsonb)`, [randomUUID(), runId, owner.ownerRef, envelope]],
      ["INSERT INTO identity.investigation (investigation_id,owner_ref,root_run_id,state) VALUES ($1,$2,$3,'open')", [investigationId, owner.ownerRef, runId]],
      ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref) VALUES ($1,$2,$3)", [runId, investigationId, owner.ownerRef]],
      ["INSERT INTO identity.investigation_closing (investigation_id,report_version,owner_ref) VALUES ($1,1,$2)", [investigationId, owner.ownerRef]],
      [`INSERT INTO identity.investigation_report (investigation_id,report_version,report_id,owner_ref,root_run_id,outcome,failure_code,dossier_fingerprint,
          ladder_step,left_out,answer_rounds,story_rounds,artifact_refs,spent_micros)
        VALUES ($1,1,$2,$3,$4,'FAILED','FIXTURE_FAILED',$5,1,0,0,0,'[]'::jsonb,0)`, [investigationId, randomUUID(), owner.ownerRef, runId, "0".repeat(64)]],
      ["INSERT INTO identity.web_plan_path (run_id,owner_ref,path_ref,status,searches_to_send) VALUES ($1,$2,'pos-1','PLANNED',0)", [runId, owner.ownerRef]],
      ["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,pick_count) VALUES ($1,$2,$3,0)", [runId, owner.ownerRef, parentRunId]],
      ["INSERT INTO identity.public_contribution (dig_run_id,owner_ref,publication_ref,root_run_id,parent_run_id) VALUES ($1,$2,$3,$4,$4)",
        [runId, owner.ownerRef, publicationRef, parentRunId]],
      ["INSERT INTO identity.run_purpose_lines (run_id,owner_ref,content_ciphertext,content_attestation) VALUES ($1,$2,$3::jsonb,$4)", [runId, owner.ownerRef, envelope, ATTESTATION]],
      ["INSERT INTO identity.web_passage_wipe (run_id,wipe_no,owner_ref,wipe_reason,page_texts,extracts,packs,replies) VALUES ($1,1,$2,'NOTHING_RUNS',0,0,0,0)", [runId, owner.ownerRef]],
      [`INSERT INTO identity.path_suggestions (set_id,run_id,debate_run_id,position_ref,owner_ref,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,'pos-1',$4,$5::jsonb,$6)`, [randomUUID(), runId, parentRunId, owner.ownerRef, envelope, ATTESTATION]],
      ["INSERT INTO identity.public_climb_done (dig_run_id,owner_ref) VALUES ($1,$2)", [runId, owner.ownerRef]]]);
    return [
      { scope: "web_evidence", table: "identity.web_search", key: "run_id", message: "WEB_EVIDENCE_APPEND_ONLY" },
      { scope: "investigation", table: "identity.investigation_member", key: "run_id", message: "INVESTIGATION_APPEND_ONLY" },
      { scope: "investigation", table: "identity.investigation_report", key: "root_run_id", message: "INVESTIGATION_REPORT_APPEND_ONLY" },
      { scope: "dig_model", table: "identity.web_plan_path", key: "run_id", message: "DIG_MODEL_APPEND_ONLY" },
      { scope: "dig_picks", table: "identity.dig_pick_set", key: "run_id", message: "DIG_PICKS_APPEND_ONLY" },
      { scope: "public_debate", table: "identity.public_contribution", key: "dig_run_id", message: "PUBLIC_DEBATE_APPEND_ONLY" },
      { scope: "tree_updates", table: "identity.run_purpose_lines", key: "run_id", message: "TREE_UPDATE_APPEND_ONLY" },
      { scope: "passage_retention", table: "identity.web_passage_wipe", key: "run_id", message: "PASSAGE_RETENTION_APPEND_ONLY" },
      { scope: "path_suggestions", table: "identity.path_suggestions", key: "run_id", message: "PATH_SUGGESTIONS_APPEND_ONLY" },
      { scope: "public_tree", table: "identity.public_climb_done", key: "dig_run_id", message: "PUBLIC_TREE_APPEND_ONLY" }
    ];
  }
  /** A live debate and its parent, both `owner`'s, the parent public, with one row under each guard. */
  async function liveRows(owner: Account): Promise<Readonly<{ runId: string; parentRunId: string; publicationRef: string; rows: readonly Guarded[] }>> {
    const parentRunId = await run(owner);
    const publicationRef = await publish(parentRunId);
    const runId = await run(owner);
    return { runId, parentRunId, publicationRef, rows: await guardedRows(owner, runId, parentRunId, publicationRef) };
  }
  const remaining = async (row: Guarded, runId: string): Promise<number> =>
    Number((await database.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${row.table} WHERE ${row.key}=$1`, [runId])).rows[0]!.n);
  /** Work on one superuser connection inside a transaction that is always rolled back. */
  async function rolledBack<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.pool.connect();
    try { await client.query("BEGIN"); return await work(client); } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
  }
  /** One statement inside its own savepoint, so a refusal leaves the transaction usable: how many rows it touched, or what refused it. */
  async function attempt(client: PoolClient, sql: string, values: readonly unknown[]): Promise<Readonly<{ rows?: number; code?: string; message?: string }>> {
    await client.query("SAVEPOINT attempt");
    try {
      const result = await client.query(sql, [...values]);
      await client.query("RELEASE SAVEPOINT attempt");
      return { rows: result.rowCount ?? 0 };
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT attempt");
      const { code, message } = error as SqlError;
      return { ...(code === undefined ? {} : { code }), ...(message === undefined ? {} : { message }) };
    }
  }
  const deleteOf = (row: Guarded): string => `DELETE FROM ${row.table} WHERE ${row.key}=$1`;
  const refusal = (row: Guarded) => ({ code: "55000", message: row.message });
  async function tombstone(runId: string): Promise<void> {
    await seeded([["INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES ($1,clock_timestamp(),1,0)", [runId]]]);
  }

  it("the old settings open nothing: each of the ten guards refuses with the setting on, even as the tables' owner, and admits its own scope opened in the transaction", async () => {
    const { runId, rows } = await liveRows(await account());
    expect(new Set(rows.map(({ scope }) => scope))).toEqual(new Set(SCOPES));
    for (const row of rows) {
      await rolledBack(async (client) => {
        expect(await attempt(client, deleteOf(row), [runId]), row.table).toEqual(refusal(row));
        // The setting every guard trusted until 0171, set for this transaction alone as any session may: the guard no longer reads it.
        await client.query(`SET LOCAL debateai.${row.scope}_forget = 'on'`);
        expect(await attempt(client, deleteOf(row), [runId]), `${row.table} with debateai.${row.scope}_forget on`).toEqual(refusal(row));
        // Another guard's scope opens nothing here.
        await client.query("SELECT identity.open_forget_scope($1)", [row.scope === "public_tree" ? "web_evidence" : "public_tree"]);
        expect(await attempt(client, deleteOf(row), [runId]), `${row.table} under another scope`).toEqual(refusal(row));
        // Its own scope, which only a definer owned with the tables can open, does.
        await client.query("SELECT identity.open_forget_scope($1)", [row.scope]);
        expect(await attempt(client, deleteOf(row), [runId]), `${row.table} in scope ${row.scope}`).toEqual({ rows: 1 });
      });
      expect(await remaining(row, runId), row.table).toBe(1);
    }
  });

  it("a scope is its transaction's alone: closed it admits nothing, it never reaches the next transaction, and a savepoint rolled back takes it", async () => {
    const owner = await account();
    const { runId, rows } = await liveRows(owner);
    const row = rows.find(({ scope }) => scope === "public_tree")!;
    await rolledBack(async (client) => {
      await client.query("SELECT identity.open_forget_scope('public_tree')");
      expect((await client.query<{ open: boolean }>("SELECT identity.forget_scope_open('public_tree') AS open")).rows[0]!.open).toBe(true);
      await client.query("SELECT identity.close_forget_scope('public_tree')");
      expect((await client.query<{ open: boolean }>("SELECT identity.forget_scope_open('public_tree') AS open")).rows[0]!.open).toBe(false);
      expect(await attempt(client, deleteOf(row), [runId])).toEqual(refusal(row));
    });
    await rolledBack(async (client) => {
      // Opened inside a savepoint, it is the whole transaction's (the key is the top-level transaction's id) once the savepoint is released.
      await client.query("SAVEPOINT inner_work");
      await client.query("SELECT identity.open_forget_scope('public_tree')");
      await client.query("RELEASE SAVEPOINT inner_work");
      expect(await attempt(client, deleteOf(row), [runId])).toEqual({ rows: 1 });
    });
    await rolledBack(async (client) => {
      await client.query("SAVEPOINT inner_work");
      await client.query("SELECT identity.open_forget_scope('public_tree')");
      await client.query("ROLLBACK TO SAVEPOINT inner_work");
      expect(await attempt(client, deleteOf(row), [runId])).toEqual(refusal(row));
    });
    // A scope left open by a committed transaction is no later transaction's.
    const left = await database.pool.connect();
    try {
      await left.query("BEGIN");
      await left.query("SELECT identity.open_forget_scope('public_tree')");
      await left.query("COMMIT");
    } finally { left.release(); }
    await rolledBack(async (client) => {
      expect(await attempt(client, deleteOf(row), [runId])).toEqual(refusal(row));
    });
    expect(await remaining(row, runId)).toBe(1);
    // Nine scopes and no other: the table refuses a name no guard asks for.
    expect((await sqlError(() => database.pool.query("SELECT identity.open_forget_scope('everything')"))).code).toBe("23514");
  });

  it("no runtime role may open, close or ask about a scope, nor reach its table; every login is refused the helpers", async () => {
    const roles = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker", "debateai_rls_all_accounts"];
    const reach = (await database.pool.query<{ role: string; target: string }>(`
      SELECT r.rolname AS role, target FROM pg_roles AS r CROSS JOIN unnest($1::text[]) AS target
      WHERE r.rolname = ANY($2::text[]) AND has_function_privilege(r.oid, target::regprocedure, 'EXECUTE')
      UNION ALL
      SELECT r.rolname, 'identity.private_forget_scope:' || privilege FROM pg_roles AS r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS privilege
      WHERE r.rolname = ANY($2::text[]) AND has_table_privilege(r.oid, 'identity.private_forget_scope', privilege)`, [[...HELPERS], roles])).rows;
    expect(reach).toEqual([]);
    for (const pool of [apiRequest, apiSystem, runner, erasure]) {
      expect((await sqlError(() => pool.query("SELECT identity.open_forget_scope('public_tree')"))).code).toBe("42501");
      expect((await sqlError(() => pool.query("SELECT identity.forget_scope_open('public_tree')"))).code).toBe("42501");
      expect((await sqlError(() => pool.query("SELECT count(*) FROM identity.private_forget_scope"))).code).toBe("42501");
    }
  });

  it("account erasure's forget definers still take every guarded row of an erased debate, each closing its scope behind it", async () => {
    const owner = await account();
    const erased = await liveRows(owner);
    const live = await liveRows(owner);
    await tombstone(erased.runId);
    // Each definer, called as the erasure transaction calls it: what it took is gone, and its scope is closed again before it returns.
    for (const [forget, scope] of FORGET) {
      await rolledBack(async (client) => {
        await client.query(`SELECT ${forget}($1)`, [erased.runId]);
        for (const row of erased.rows.filter((candidate) => candidate.scope === scope)) {
          expect((await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${row.table} WHERE ${row.key}=$1`, [erased.runId])).rows[0]!.n, `${forget}: ${row.table}`).toBe(0);
        }
        expect((await client.query<{ open: boolean }>("SELECT identity.forget_scope_open($1) AS open", [scope])).rows[0]!.open, forget).toBe(false);
        for (const row of live.rows.filter((candidate) => candidate.scope === scope)) expect(await attempt(client, deleteOf(row), [live.runId]), `${forget} then ${row.table}`).toEqual(refusal(row));
      });
    }
    // The erasure worker's own login, in the finalize order (packages/db/src/erasure-page-memory.ts), in one transaction.
    const client = await erasure.connect();
    try {
      await client.query("BEGIN");
      for (const [forget] of FORGET) await client.query(`SELECT ${forget}($1)`, [erased.runId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    for (const row of erased.rows) expect(await remaining(row, erased.runId), row.table).toBe(0);
    for (const row of live.rows) expect(await remaining(row, live.runId), row.table).toBe(1);
  });

  it("an erased account's rows still go with it: the cascade passes every guard", async () => {
    const owner = await account();
    const { runId, rows } = await liveRows(owner);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [owner.userId]);
    // The contribution keeps its row with no name (owner_ref ON DELETE SET NULL); every other row went.
    for (const row of rows) expect(await remaining(row, runId), row.table).toBe(row.table === "identity.public_contribution" ? 1 : 0);
    expect((await database.pool.query<{ owner_ref: string | null }>("SELECT owner_ref FROM identity.public_contribution WHERE dig_run_id=$1", [runId])).rows).toEqual([{ owner_ref: null }]);
  });

  it("the runner's passage wipe still deletes its four kinds of rows, and closes both scopes it opened", async () => {
    const owner = await account();
    const live = await liveRows(owner);
    const runId = await run(owner);
    const [search, page, extract] = [randomUUID(), randomUUID(), randomUUID()];
    const envelope = JSON.stringify(ENVELOPE);
    await seeded([
      [`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,created_at_seq) VALUES ($1,'fixture','[]'::jsonb,$2,'DONE',$3)`, [runId, `fixture:${randomUUID()}`, ++sequence]],
      [`INSERT INTO identity.web_search (search_id,run_id,owner_ref,path_ref,side,language_kind,language,look_back,outcome,charge_micros,result_count,content_ciphertext)
        VALUES ($1,$2,$3,'pos-1','for','english','en','none','FOUND',1,1,$4::jsonb)`, [search, runId, owner.ownerRef, envelope]],
      [`INSERT INTO identity.web_page (page_id,run_id,owner_ref,search_id,rank,read_depth,text_kept,text_chars,text_digest,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,1,'whole',true,10,$5,$6::jsonb,$7)`, [page, runId, owner.ownerRef, search, Buffer.alloc(32, 3), envelope, ATTESTATION]],
      ["INSERT INTO identity.web_page_text (page_id,run_id,owner_ref,content_ciphertext,content_attestation) VALUES ($1,$2,$3,$4::jsonb,$5)", [page, runId, owner.ownerRef, envelope, ATTESTATION]],
      ["INSERT INTO identity.web_pick (run_id,owner_ref,path_ref,rank,page_id) VALUES ($1,$2,'pos-1',1,$3)", [runId, owner.ownerRef, page]],
      [`INSERT INTO identity.web_extract (extract_id,run_id,owner_ref,page_id,path_ref,label,found_by,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,'pos-1','S1-1','{1}',$5::jsonb,$6)`, [extract, runId, owner.ownerRef, page, envelope, ATTESTATION]],
      [`INSERT INTO identity.web_shown_quote (extract_id,run_id,owner_ref,page_id,path_ref,label,found_by,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,'pos-1','S1-1','{1}',$5::jsonb,$6)`, [extract, runId, owner.ownerRef, page, envelope, ATTESTATION]],
      [`INSERT INTO identity.web_pack (pack_id,run_id,owner_ref,path_ref,extract_labels,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,'pos-1','{S1-1}',$4::jsonb,$5)`, [randomUUID(), runId, owner.ownerRef, envelope, ATTESTATION]],
      ["INSERT INTO identity.web_reply_text (artifact_id,run_id,owner_ref,content_ciphertext,content_attestation) VALUES ($1,$2,$3,$4::jsonb,$5)", [randomUUID(), runId, owner.ownerRef, envelope, ATTESTATION]]]);
    await rolledBack(async (client) => {
      expect((await client.query<{ outcome: string }>("SELECT outcome FROM identity.wipe_debate_passages($1,'NOTHING_RUNS')", [runId])).rows[0]!.outcome).toBe("WIPED");
      for (const scope of ["web_evidence", "passage_retention"]) {
        expect((await client.query<{ open: boolean }>("SELECT identity.forget_scope_open($1) AS open", [scope])).rows[0]!.open, scope).toBe(false);
        for (const row of live.rows.filter((candidate) => candidate.scope === scope)) expect(await attempt(client, deleteOf(row), [live.runId]), row.table).toEqual(refusal(row));
      }
    });
    expect(await new PostgresPassageRetentionRepository(runner).wipe(runId, "NOTHING_RUNS")).toEqual({ outcome: "WIPED", pageTexts: 1, extracts: 1, packs: 1, replies: 1 });
    const count = async (table: string): Promise<number> => Number((await database.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE run_id=$1`, [runId])).rows[0]!.n);
    expect([await count("identity.web_extract"), await count("identity.web_pack"), await count("identity.web_reply_text"), await count("identity.web_page_text")]).toEqual([0, 0, 0, 0]);
    // The quote, the page and the search stay.
    expect([await count("identity.web_shown_quote"), await count("identity.web_page"), await count("identity.web_search")]).toEqual([1, 1, 1]);
    for (const row of live.rows) expect(await remaining(row, live.runId), row.table).toBe(1);
  });

  it("the API's review purge still takes the page copies sealed before its due event, and closes its scope", async () => {
    const owner = await account();
    const live = await liveRows(owner);
    const root = await run(owner);
    const ref = await publish(root);
    const dig = await run(owner);
    await seeded([
      [`INSERT INTO identity.public_review_event (publication_ref,revision,action,actor_staff_id,operation_id,request_sha256,recorded_at)
        VALUES ($1,1,'HIDE',$2,$3,$4,now() - interval '7 months')`, [ref, randomUUID(), randomUUID(), "0".repeat(64)]],
      [`INSERT INTO identity.public_material (material_id,run_id,owner_ref,publication_ref,kind,recorded_at,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,'DIG',now() - interval '8 months',$5::jsonb,$6)`, [randomUUID(), dig, owner.ownerRef, ref, JSON.stringify(ENVELOPE), ATTESTATION]]]);
    const material = async (): Promise<number> => Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_material WHERE publication_ref=$1", [ref])).rows[0]!.n);
    const purge = { publicationRef: ref, pieceKind: "SNAPSHOT", pieceId: ref, mode: "BAKED", upToRevision: 1, content: pubEnvelope(ref), originalSha256: "a".repeat(64) };
    await rolledBack(async (client) => {
      expect((await client.query<{ value: string }>("SELECT identity.public_review_purge($1::uuid,$2,$3::uuid,$4,$5,$6::jsonb,$7) AS value",
        [ref, purge.pieceKind, ref, purge.mode, purge.upToRevision, JSON.stringify(purge.content), purge.originalSha256])).rows[0]!.value).toBe("PURGED");
      expect((await client.query<{ open: boolean }>("SELECT identity.forget_scope_open('public_tree') AS open")).rows[0]!.open).toBe(false);
      const row = live.rows.find(({ scope }) => scope === "public_tree")!;
      expect(await attempt(client, deleteOf(row), [live.runId])).toEqual(refusal(row));
    });
    expect(await material()).toBe(1);
    expect(await new PostgresPublicFlagRepository(apiSystem).purge(purge as never)).toBe("PURGED");
    expect(await material()).toBe(0);
    for (const row of live.rows) expect(await remaining(row, live.runId), row.table).toBe(1);
  });
});

describe("F4b: a reviewer opens only a debate that is still public under that link, or held", () => {
  type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;
  let reviewer: Actor;
  const reads = async (ref: string): Promise<number> =>
    Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_review_read WHERE publication_ref=$1", [ref])).rows[0]!.n);
  const read = (ref: string) => new PostgresPublicReviewRepository(apiSystem).read(reviewer.context as never, hash(reviewer.sessionId), ref);
  /** 0150's hold, as its log writes it: a HIDE event. It writes no visibility event. */
  async function hold(ref: string): Promise<void> {
    await seeded([[`INSERT INTO identity.public_review_event (publication_ref,revision,action,actor_staff_id,operation_id,request_sha256)
      VALUES ($1,1,'HIDE',$2,$3,$4)`, [ref, reviewer.staffId, randomUUID(), "0".repeat(64)]]]);
  }

  beforeAll(async () => {
    // One of 0142's two accounts: a staff member with a live elevated session, holding the team's one limit.
    const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
    const q = database.pool;
    await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
    await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
      VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
    await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
    await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash(`csrf${sessionId}`)]);
    await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]]);
    await q.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash(`staff-csrf${privilegeId}`)]);
    const context = (await apiSystem.query<{ context: Record<string, unknown> }>("SELECT staff.read_context($1,$2,$3) AS context", [userId, sessionId, hash(privilegeId)])).rows[0]!.context;
    await q.query("INSERT INTO staff.team_limit_holder(staff_id,granted_by_staff_id,granted_operation_id) VALUES($1,$1,$2)", [staffId, randomUUID()]);
    reviewer = { userId, sessionId, staffId, privilegeId, context };
  }, 120_000);

  it("a published debate reads, and the read is logged", async () => {
    const root = await run(await account());
    const ref = await publish(root);
    const material = await read(ref);
    expect(material?.snapshot.run_id).toBe(root);
    expect(material?.hidden).toBe(false);
    expect(await reads(ref)).toBe(1);
  });

  it("a debate made private again reads nothing, as a link that never was, and no read is logged", async () => {
    const root = await run(await account());
    const ref = await publish(root);
    await unpublish(root, ref);
    expect(await read(ref)).toBeNull();
    expect(await reads(ref)).toBe(0);
  });

  it("a debate published again: its old link reads nothing and logs nothing, its new link reads", async () => {
    const root = await run(await account());
    const old = await publish(root);
    await unpublish(root, old);
    const current = await publish(root);
    expect(await read(old)).toBeNull();
    expect(await reads(old)).toBe(0);
    expect((await read(current))?.snapshot.run_id).toBe(root);
    expect(await reads(current)).toBe(1);
  });

  it("a held debate still reads: the hold writes no visibility event; held and then made private, it reads nothing", async () => {
    const root = await run(await account());
    const ref = await publish(root);
    await hold(ref);
    const held = await read(ref);
    expect(held?.hidden).toBe(true);
    expect(await reads(ref)).toBe(1);
    await unpublish(root, ref);
    expect(await read(ref)).toBeNull();
    expect(await reads(ref)).toBe(1);
  });

  it("a link with no snapshot reads nothing, as before", async () => {
    expect(await read(randomUUID())).toBeNull();
  });
});

describe("F5: a request-facing function believes only the owner the database sees for the connection", () => {
  /** 0040's evaluator call check, the one moved function whose grant to the evaluator worker (no marker, no session) stays beside the marker's. */
  const EVALUATOR_CALL_CHECK = "evaluator.provider_call_request_is_authorized(uuid,text,text,text)";
  /**
   * Staff's notice and alert loops: the claim, the completion and the recipient of 0128's threat report alerts, 0142's team limit notices, 0146's
   * allowance notices, 0150's public review notices and 0151's flag notices, and 0128's erasure of the reports due; and 0088's staff alert outbox,
   * which the staff runtime's dispatcher drains from its own timer (its claim, key mapping, settlement and status, and 0090's invitee channel, which
   * needs the claim's token). They name no run, owner or flag, so the census below cannot see them; the API calls them only from its gated timers,
   * outside any request, so on its system login. 0112's release of a claim stays debateai_runtime's (0112's verifier requires it): see below.
   */
  const STAFF_LOOPS = [
    "staff.threat_report_recipient_user(uuid)", "staff.erase_due_threat_reports()", "staff.claim_threat_report_alerts(integer)",
    "staff.complete_threat_report_alert(uuid,uuid,boolean)", "staff.claim_team_limit_notices(integer)", "staff.complete_team_limit_notice(uuid,uuid,boolean)",
    "staff.team_limit_notice_user(uuid,uuid)", "staff.claim_allowance_notices(integer)", "staff.complete_allowance_notice(uuid,uuid,boolean)",
    "staff.allowance_notice_user(uuid,uuid)", "staff.claim_public_review_notices(integer)", "staff.complete_public_review_notice(uuid,uuid,boolean)",
    "staff.public_review_notice_user(uuid,uuid)", "staff.claim_public_flag_notices(integer)", "staff.complete_public_flag_notice(uuid,uuid,boolean)",
    "staff.public_flag_notice_user(uuid,uuid)",
    "staff.claim_alert_delivery(integer)", "staff.read_alert_key_mapping(uuid,uuid)", "staff.settle_alert_delivery(uuid,uuid,text,text)",
    "staff.read_alert_delivery_status()", "staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)"
  ] as const;
  /**
   * 0100's consumer security notice loop (a person's own takeover warnings: a method changed, codes regenerated, a recovery proved or completed, a
   * recovery code used): its claim, read, acknowledgement and failure, which only the API's erasure reconciler calls, from its gated timer, on the
   * authorization pool's system login. They were debateai_authorization_runtime's, so the authorization request login could claim any person's notice
   * and acknowledge it unsent.
   */
  const CONSUMER_LOOP = [
    "identity.claim_consumer_security_notices(integer)", "identity.read_consumer_security_notice(uuid,uuid)", "identity.ack_consumer_security_notice(uuid,uuid)",
    "identity.fail_consumer_security_notice(uuid,uuid,text)"
  ] as const;
  /**
   * The retention purges of rows already due, which the API runs only from its gated timers: 0046's sign-in risk signals, 0126's synthesis check removal
   * notices and 0080's legal acceptance records (0094 made the last the API billing role's alone; 0130's verifier names no function of legal's).
   */
  const PURGES = [
    "identity.purge_expired_authentication_risk_signals(integer)", "serve.purge_expired_synthesis_check_removal_notices()",
    "legal.purge_expired_acceptance(timestamp with time zone)"
  ] as const;
  /**
   * The staff ceremonies and changes the API calls only through its staff repository, which main.ts builds on its system login (the cross-account site
   * X14): 0085's grant, acceptance and capability check, 0086's owned key ceremony and the staff key reader, and 0088's mapping of a user to the audit
   * token an alert is sealed for, which a staff change's alert intent asks inside the staff member's request, through the same site since 0171. Each
   * takes ids, a staff context or a ceremony handle, and none asks the session.
   */
  const STAFF_REQUESTS = [
    'staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb)', "staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb)", "staff.authorize_action(jsonb,text)",
    "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)", "staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb)",
    "staff.fail_owned_webauthn(uuid,uuid,uuid)", "staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)",
    "staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)",
    "identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)", "staff.read_alert_user_mapping(uuid)"
  ] as const;
  /** 0118's, 0128's and 0144's writers of a paid call that names no debate, the marker's since 0171 (see the site's day, below). */
  const DAY_WRITERS = ["ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)",
    "ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)",
    "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)"] as const;
  /**
   * 0048's writer of a provider's probe, whose latest row the API's ask-time discovery trusts: the marker's since 0171. The API records each probe
   * its discovery makes inside the asking request on its system login (X37), and the runner its claim-time probes on its own login.
   */
  const PROBE_WRITER = "core.record_provider_probe(uuid,text,text,text,text,text,timestamp with time zone)";
  /** The functions only the runner or the API's sweeps call: the marker's alone now, which the API's request login does not hold. */
  const MOVED = [
    "identity.read_web_page_texts(uuid,uuid[])", "identity.read_free_debates_to_publish(integer)", "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)",
    "identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)", "identity.read_web_reply_texts(uuid,uuid[])",
    "identity.read_public_material(uuid)", "identity.read_public_dig_input(uuid)", "identity.read_public_answer_updates(uuid)", "identity.read_public_reports_unwritten(integer)",
    "identity.read_public_checks_passed(integer)", "identity.read_public_page_owed(integer)", "identity.read_public_reports_owed(integer)", "identity.read_free_debate_owner(uuid)",
    "identity.delete_public_flag_words_due()", "identity.read_public_review_purge_due(integer)", "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)",
    // The sweeps' listers, settlements, wipes and page writers: no owner, any account's rows.
    "identity.settle_web_researched(uuid,uuid,text)", "identity.read_unwritten_path_rewrites(timestamptz,integer)", "identity.read_unreported_closings(integer)",
    "identity.settle_public_contribution(uuid,text,uuid)", "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)",
    "core.prepare_free_publication(uuid,uuid)", "core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)", "identity.refuse_free_publication(uuid)",
    "identity.read_debates_holding_passages(integer)", "identity.wipe_debate_passages(uuid,text)", "identity.wipe_inactive_web_page_text_of_idle_debates(integer)",
    "identity.read_unsettled_web_researched(integer)", "identity.read_public_digs_unsettled(timestamptz,integer)", "identity.read_public_climbs_owed(integer)",
    "identity.mark_public_climb_done(uuid)", "identity.record_public_check_passed(uuid,uuid)", "identity.record_public_page_skip(uuid,uuid,text,text)",
    "identity.record_public_debate_report(uuid,integer,uuid,jsonb)", "identity.mark_dig_tree_settled(uuid)",
    // The runner's own steps of one debate, keyed by its run, turn or report alone: its web evidence, rewrites, turns, pause, report and public dig
    // writers, and the readers only the runner or the API's system pool outside a request call (the page sweep, the room's count, the estimate's X21).
    "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)",
    "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)",
    "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)", "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)",
    "identity.record_web_picks(uuid,text,uuid[])", "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)", "identity.read_dig_level_of_run(uuid)",
    "identity.take_path_rewrite_turn(uuid,uuid,text)", "identity.read_path_rewrite_turn(uuid)",
    "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)", "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)",
    "identity.read_run_pause_of_run(uuid)", "identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)", "identity.read_investigation_waiting_of_run(uuid)",
    "identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
    "identity.read_closing_since_of_root(uuid)", "identity.read_public_contribution_of_run(uuid)", "identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
    "identity.read_path_update_turn(uuid)", "identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.read_path_climb_next(uuid)", "identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)", "identity.record_web_reply_text(uuid,uuid,jsonb,bytea)",
    "identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)", "identity.run_work_is_parked(uuid,text,timestamptz)",
    "identity.record_public_dig_input(uuid,text,jsonb,bytea)", "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
    "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)", "identity.read_public_climb_next(uuid)",
    "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
    "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
    "identity.read_public_report_charged_until(uuid)", "identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)",
    "identity.dig_is_settled(uuid)",
    // The engine's older steps of one debate only the runner or the API's system login calls: 0120's recorded facts (the runner's terminal
    // activation), 0040's evaluator call check (the runner's provider gateway; the evaluator worker keeps its own grant) and 0126's inheritance writer
    // (the API's check worker, from its gated timer).
    "core.read_terminal_recorded_facts(uuid)", EVALUATOR_CALL_CHECK, "serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)",
    // Staff's notice and alert loops of 0088 to 0151, which the API drains only from its gated timers, outside any request: each claim, completion and
    // recipient, the outbox's key mapping, settlement and status, and the threat reports' erasure of what is due.
    ...STAFF_LOOPS,
    // The consumer security notice loop (from the authorization runtime) and the retention purges of what is due.
    ...CONSUMER_LOOP, ...PURGES,
    // 0151's flag settlement, which the API's press calls after the judge on its system login alone (X38): it believed the verdict it was handed.
    "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)",
    // Staff's ceremonies and changes, on the API's staff repository's site (X14).
    ...STAFF_REQUESTS,
    // The three writers of the site's day that name no debate, which the API calls inside the paying request on its system login (X30 to X32).
    ...DAY_WRITERS,
    // 0048's writer of a provider's probe, which the API's discovery calls inside the asking request on its system login (X37).
    PROBE_WRITER
  ] as const;
  /** The functions nothing calls any more: no role's. */
  const REVOKED = [
    "identity.join_investigation(uuid,uuid,uuid,text[],text)", "identity.close_investigation(uuid,uuid)", "identity.read_investigation(uuid,uuid)",
    "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)", "identity.read_reserve(uuid)", "identity.wipe_inactive_web_page_text(integer)",
    "identity.read_investigation_dig_levels(uuid,uuid)", "identity.read_path_rewrites(uuid,uuid)", "identity.read_paused_runs(uuid)",
    "identity.read_public_report_spent(uuid,timestamptz,timestamptz)", "identity.read_path_line(uuid,uuid)", "identity.read_main_answer_updates(uuid,uuid)",
    "identity.close_public_investigation(uuid,uuid)", "identity.reopen_public_investigation(uuid,integer)", "identity.record_investigation_report(uuid,integer,uuid)",
    // 0128's threat report keepers, which name any account and alert staff.
    "staff.keep_threat_report(text,uuid)", "staff.keep_threat_report_with_email(text,uuid,text)",
    // 0046's reader of a recovery's risk signals, 0140's team spend sum (staff's month reader asks it as its owner), and 0085's first staff ceremonies,
    // which 0086's owned ceremony replaced (0094's owned assertion completes the proof and the possession receipt as their owner).
    "identity.read_authentication_risk_signals_for_recovery(uuid)", "staff.read_team_internal_spent(timestamp with time zone,timestamp with time zone)",
    "staff.begin_invitation_challenge(uuid,uuid,text,text,text)", "staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text)",
    "staff.begin_registration_challenge(uuid,uuid,text,text)", "staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text)",
    "staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text)"
  ] as const;
  const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
  let pools: ApiTestPools;
  let ana: RlsTestAccount;
  let ben: RlsTestAccount;
  const login = (key: Parameters<RlsLogins["url"]>[0]): string => decodeURIComponent(new URL(logins!.url(key)).username);
  const refusal = async (work: () => Promise<unknown>): Promise<SqlError> => {
    const { code, message } = await sqlError(work);
    return { code, message };
  };
  const saveLevel = (pool: Pool, owner: string, level: string) =>
    pool.query<{ level: string }>("SELECT identity.save_page_reading_level($1,$2) AS level", [owner, level]).then((result) => result.rows[0]!.level);
  const readLevel = (pool: Pool, owner: string) =>
    pool.query<{ level: string | null }>("SELECT identity.read_page_reading_level($1) AS level", [owner]).then((result) => result.rows[0]!.level);
  const visitOwned = (pool: Pool, owner: string, runId: string) =>
    pool.query<{ owned: boolean }>("SELECT owned FROM identity.read_debate_last_visit($1,$2)", [owner, runId]).then((result) => result.rows[0]!.owned);
  const pause = (pool: Pool, owner: string, runId: string) => pool.query("SELECT identity.read_run_pause($1,$2) AS pause", [owner, runId]);
  const clarifyCharge = (pool: Pool, owner: string, chargeId: string = randomUUID()) => pool.query<{ outcome: string }>(
    "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,'ask-clarify:anthropic:claude-haiku-5-5',(clock_timestamp() AT TIME ZONE 'UTC')::date,3,10,2) AS outcome",
    [chargeId, owner]).then((result) => result.rows[0]!.outcome);
  /** 0171's reservation of a clarify call's charge for the person, which the API makes before each paid call, on the request's connection. */
  const reserve = (pool: Pool, owner: string, chargeId: string = randomUUID()) => pool.query<{ outcome: string }>(
    "SELECT identity.reserve_ask_clarify_charge($1,$2) AS outcome", [chargeId, owner]).then((result) => result.rows[0]!.outcome);
  /** The writer's refusal to every login that holds no marker. */
  const NOT_THE_WRITERS = { code: "42501", message: "permission denied for function record_ask_clarify_charge" };
  /** What a charge left: the site's ledger row (the call was paid), and the owner its person's row names, if any. */
  const chargeLeft = async (chargeId: string) => ({
    ledger: (await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [chargeId])).rowCount,
    person: (await database.pool.query<{ owner_ref: string }>("SELECT owner_ref FROM identity.ask_clarify_charge WHERE charge_id=$1", [chargeId])).rows[0]?.owner_ref ?? null
  });

  beforeAll(async () => {
    pools = logins!.apiPools();
    ana = await seedSessionAccount(database.pool, "f5-ana");
    ben = await seedSessionAccount(database.pool, "f5-ben");
    await database.pool.query("INSERT INTO identity.page_reading_level (owner_ref,reading_level,updated_at) VALUES ($1,'expert',now())", [ben.ownerRef]);
  }, 120_000);

  it("an API request is held to its session's own account: another's owner is refused or answered as not its own, its own is served", async () => {
    await inAccountRequest(ana.token, async () => {
      // A writer refuses before it does anything; the clarify charge's reservation, which names the person before a paid call, too. The charge
      // writer itself is no request's (the site's day, below).
      expect(await refusal(() => saveLevel(pools.runtime, ben.ownerRef, "plain"))).toEqual(MISMATCH);
      expect(await refusal(() => pause(pools.runtime, ben.ownerRef, ben.runId))).toEqual(MISMATCH);
      expect(await refusal(() => reserve(pools.runtime, ben.ownerRef))).toEqual(MISMATCH);
      expect(await refusal(() => clarifyCharge(pools.runtime, ben.ownerRef))).toEqual(NOT_THE_WRITERS);
      // A plain reader answers as for nothing stored, and 0131's ownership rule as for another's debate.
      expect(await readLevel(pools.runtime, ben.ownerRef)).toBeNull();
      expect(await visitOwned(pools.runtime, ben.ownerRef, ben.runId)).toBe(false);
      // The account's own.
      expect(await saveLevel(pools.runtime, ana.ownerRef, "plain")).toBe("plain");
      expect(await readLevel(pools.runtime, ana.ownerRef)).toBe("plain");
      expect(await visitOwned(pools.runtime, ana.ownerRef, ana.runId)).toBe(true);
      expect((await pause(pools.runtime, ana.ownerRef, ana.runId)).rowCount).toBe(1);
      expect(await reserve(pools.runtime, ana.ownerRef)).toBe("RESERVED");
      expect(await refusal(() => clarifyCharge(pools.runtime, ana.ownerRef))).toEqual(NOT_THE_WRITERS);
    });
    expect(await readLevel(database.pool, ben.ownerRef)).toBe("expert");
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ben.ownerRef])).rows[0]!.n)).toBe(0);
  });

  it("an API login with no session, an anonymous request, or a credential that is no live session names no account at all", async () => {
    const apiRequestLogin = login("DATABASE_URL");
    expect((await database.pool.query<{ marker: boolean }>("SELECT pg_has_role($1,'debateai_rls_all_accounts','MEMBER') AS marker", [apiRequestLogin])).rows[0]!.marker).toBe(false);
    // The clarify charge's reservation is refused too, so the API makes no paid call for them, however long ago the session ended: a token stolen
    // and then signed out names its account for nothing. The charge writer is no request login's at all (the site's day, below).
    const cases: ReadonlyArray<readonly [string, <T>(work: () => Promise<T>) => Promise<T>, Pool]> = [
      ["no session (a pool with no system target sends none)", (work) => work(), apiRequest],
      ["an anonymous request", (work) => inAccountRequest(null, work), pools.runtime],
      ["a made-up token", (work) => inAccountRequest(randomBytes(32).toString("base64url"), work), pools.runtime],
      ["ana's revoked session", (work) => inAccountRequest(ana.revokedToken, work), pools.runtime],
      ["ana's expired session", (work) => inAccountRequest(ana.expiredToken, work), pools.runtime]
    ];
    for (const [label, within, pool] of cases) {
      await within(async () => {
        expect(await refusal(() => saveLevel(pool, ana.ownerRef, "background")), label).toEqual(MISMATCH);
        expect(await refusal(() => reserve(pool, ana.ownerRef)), label).toEqual(MISMATCH);
        expect(await refusal(() => clarifyCharge(pool, ana.ownerRef)), label).toEqual(NOT_THE_WRITERS);
        expect(await readLevel(pool, ana.ownerRef), label).toBeNull();
        expect(await visitOwned(pool, ana.ownerRef, ana.runId), label).toBe(false);
      });
    }
  });

  it("the system logins, which hold the cross-account marker, still serve any account with no session; one that presents a session is held to it", async () => {
    for (const key of ["API_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL"] as const) {
      expect((await database.pool.query<{ marker: boolean }>("SELECT pg_has_role($1,'debateai_rls_all_accounts','MEMBER') AS marker", [login(key)])).rows[0]!.marker, key).toBe(true);
    }
    // The API's sweeps (the system pool, outside any request).
    expect(await visitOwned(apiSystem, ana.ownerRef, ana.runId)).toBe(true);
    expect(await visitOwned(apiSystem, ben.ownerRef, ben.runId)).toBe(true);
    expect(await readLevel(apiSystem, ben.ownerRef)).toBe("expert");
    expect((await pause(apiSystem, ben.ownerRef, ben.runId)).rowCount).toBe(1);
    expect((await apiSystem.query("SELECT identity.read_run_purpose_lines($1,$2) AS lines", [ben.ownerRef, ben.runId])).rowCount).toBe(1);
    // The runner: the readers and writers moved to the marker serve it.
    expect((await runner.query("SELECT identity.read_web_page_texts($1,'{}'::uuid[]) AS texts", [ana.runId])).rowCount).toBe(0);
    expect(Array.isArray((await runner.query<{ waiting: unknown }>("SELECT identity.read_public_reports_unwritten(1) AS waiting")).rows[0]!.waiting)).toBe(true);
    expect((await runner.query("SELECT identity.read_public_answer_updates($1) AS updates", [ana.runId])).rowCount).toBe(1);
    expect(Array.isArray((await apiSystem.query<{ waiting: unknown }>("SELECT identity.read_free_debates_to_publish(1) AS waiting")).rows[0]!.waiting)).toBe(true);
    // The session a connection presents is the account it names, whatever its login.
    const client = await apiSystem.connect();
    try {
      await client.query("SELECT set_config('debateai.session_credential',$1,false)", [ana.token]);
      expect(await refusal(() => client.query("SELECT identity.save_page_reading_level($1,'plain')", [ben.ownerRef]))).toEqual(MISMATCH);
      expect((await client.query<{ owned: boolean }>("SELECT owned FROM identity.read_debate_last_visit($1,$2)", [ben.ownerRef, ben.runId])).rows[0]!.owned).toBe(false);
      expect((await client.query<{ owned: boolean }>("SELECT owned FROM identity.read_debate_last_visit($1,$2)", [ana.ownerRef, ana.runId])).rows[0]!.owned).toBe(true);
      await client.query("SELECT set_config('debateai.session_credential','',false)");
    } finally { client.release(); }
  });

  it("a clarify call already paid always counts in the site's day and in a person's quota: its person's row names the account it was reserved for while the session was live, or with no reservation the owner it is handed", async () => {
    // 0144's design, kept: the ledger row first, whatever becomes of the person; 0171 names the person by the reservation, and makes the writer the
    // system login's alone, which the API reaches through its site (X32) after the call it reserved inside the request. Its own account, so its
    // session can end here.
    const cy = await seedSessionAccount(database.pool, "f5-clarify");
    const [signedOut, rotated, other, unreserved, system, presented] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const site = crossAccountPool(pools.runtime, "X32");
    // The API reserves each paid call for its person before it is sent, on the request's own login, while the request's session is live.
    for (const chargeId of [signedOut, rotated, other]) expect(await inAccountRequest(cy.token, () => reserve(pools.runtime, cy.ownerRef, chargeId))).toBe("RESERVED");
    // A step-up in another tab while the AI answers replaces the session's token in place (0115's rotation): the request still presents the old one,
    // and the record after the call, on the system login, names cy.
    await database.pool.query(`UPDATE identity.session SET token_hash=$1,csrf_token_hash=$2,last_mfa_at=now(),last_seen_at=now() WHERE session_id=$3`,
      [hashToken("session", generateVerificationToken()), hashToken("csrf", generateVerificationToken()), cy.sessionId]);
    expect(await inAccountRequest(cy.token, () => clarifyCharge(site, cy.ownerRef, rotated))).toBe("RECORDED");
    // ... and that old token, which names no live session now, reserves nothing, so the API makes no call for it.
    expect(await refusal(() => inAccountRequest(cy.token, () => reserve(pools.runtime, cy.ownerRef, unreserved)))).toEqual(MISMATCH);
    // A sign-out while the AI answers: the reserved call is still cy's.
    await database.pool.query("UPDATE identity.session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [cy.userId]);
    expect(await inAccountRequest(cy.token, () => clarifyCharge(site, cy.ownerRef, signedOut))).toBe("RECORDED");
    // A reservation names one owner: a charge recorded for another leaves it where it was. The system login presents no session, so with no
    // reservation of its own the writer names the owner the API hands it, as a login holding the marker always could.
    expect(await clarifyCharge(apiSystem, ben.ownerRef, other)).toBe("RECORDED");
    expect(await clarifyCharge(apiSystem, ben.ownerRef, system)).toBe("RECORDED");
    // A login holding the marker that presents another account's session (which the API's system login never does): the writer asks nothing of the
    // connection, so it names the owner it is handed there too. Before, it named no one (UNOWNED), and the paid call was left out of cy's quota.
    const client = await apiSystem.connect();
    try {
      await client.query("SELECT set_config('debateai.session_credential',$1,false)", [ana.token]);
      expect((await client.query<{ outcome: string }>("SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,'ask-clarify:anthropic:claude-haiku-5-5',"
        + "(clock_timestamp() AT TIME ZONE 'UTC')::date,3,10,2) AS outcome", [presented, cy.ownerRef])).rows[0]!.outcome).toBe("RECORDED");
      await client.query("SELECT set_config('debateai.session_credential','',false)");
    } finally { client.release(); }
    expect(await Promise.all([signedOut, rotated, other, system, presented, unreserved].map(chargeLeft))).toEqual([
      { ledger: 1, person: cy.ownerRef }, { ledger: 1, person: cy.ownerRef }, { ledger: 1, person: ben.ownerRef }, { ledger: 1, person: ben.ownerRef },
      { ledger: 1, person: cy.ownerRef }, { ledger: 0, person: null }]);
    // Each reserved charge took its reservation; the one charged to another's owner left it.
    expect((await database.pool.query<{ charge_id: string }>("SELECT charge_id FROM identity.ask_clarify_reservation WHERE owner_ref=$1", [cy.ownerRef])).rows)
      .toEqual([{ charge_id: other }]);
    // The system login reserves for any owner; the reservations are no runtime role's or login's to read or write.
    expect(await reserve(apiSystem, ben.ownerRef)).toBe("RESERVED");
    const ROLES = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker"];
    const runtimeLogins = (["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "API_SYSTEM_DATABASE_URL", "API_AUTHORIZATION_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL",
      "LIVENESS_DATABASE_URL"] as const).map(login);
    const otherLogins = (["ERASURE_DATABASE_URL", "REPLAY_SELF_TEST_DATABASE_URL", "DATA_EXPORT_DATABASE_URL"] as const).map(login);
    const roles = [...ROLES, ...runtimeLogins, ...otherLogins];
    const reaching = async (privilege: string) => (await database.pool.query<{ role: string }>(`SELECT role FROM unnest($1::text[]) AS role
      WHERE ${privilege} ORDER BY 1`, [roles])).rows.map(({ role }) => role);
    expect(await reaching("has_table_privilege(role,'identity.ask_clarify_reservation','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')")).toEqual([]);
    // The reservation is debateai_runtime's and every role and login that inherits it (the billing and authorization runtimes, and so the API's request,
    // authorization and system logins, the runner and the liveness login), each held to request_owner_matches; never the erasure, replay or export
    // worker's.
    expect(await reaching("has_function_privilege(role,'identity.reserve_ask_clarify_charge(uuid,uuid)','EXECUTE')"))
      .toEqual(["debateai_authorization_runtime", "debateai_billing_runtime", "debateai_runtime", ...runtimeLogins].sort());
    // The authorization login reserves for its session's own account and is refused another's, as the request login is.
    expect(await inAccountRequest(ana.token, () => reserve(pools.authorization, ana.ownerRef))).toBe("RESERVED");
    expect(await refusal(() => inAccountRequest(ana.token, () => reserve(pools.authorization, ben.ownerRef)))).toEqual(MISMATCH);
    // The API's sweep of the reservations no charge took is the marker's alone: no role a request holds, no request login, and every marker login.
    const SWEEP = "identity.delete_ask_clarify_reservations_due(integer)";
    expect((await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner`,
      [SWEEP])).rows.map(({ grantee }) => grantee)).toEqual(["debateai_rls_all_accounts"]);
    expect(await reaching(`has_function_privilege(role,'${SWEEP}','EXECUTE')`)).toEqual((["API_SYSTEM_DATABASE_URL", "API_AUTHORIZATION_SYSTEM_DATABASE_URL",
      "RUNNER_DATABASE_URL", "LIVENESS_DATABASE_URL"] as const).map(login).sort());
    expect(await refusal(() => inAccountRequest(ana.token, () => pools.runtime.query(`SELECT identity.delete_ask_clarify_reservations_due(1)`))))
      .toEqual({ code: "42501", message: "permission denied for function delete_ask_clarify_reservations_due" });
    expect((await apiSystem.query<{ gone: number }>("SELECT identity.delete_ask_clarify_reservations_due(1) AS gone")).rows[0]!.gone).toBeGreaterThanOrEqual(0);
  });

  it("what only the workers call is the marker's alone, and what nothing calls is no role's: the API's request login is refused both", async () => {
    const roles = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker",
      login("DATABASE_URL"), login("AUTHORIZATION_DATABASE_URL")];
    const reach = async (signatures: readonly string[], who: readonly string[]) => (await database.pool.query<{ role: string; signature: string }>(`
      SELECT role, signature FROM unnest($1::text[]) AS role CROSS JOIN unnest($2::text[]) AS signature
      WHERE has_function_privilege(role, signature::regprocedure, 'EXECUTE') ORDER BY 1, 2`, [who, signatures])).rows;
    const grantees = async (signature: string) => (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [signature]))
      .rows.map(({ grantee }) => grantee);
    expect(await reach([...MOVED, ...REVOKED], roles)).toEqual([]);
    for (const signature of MOVED) {
      expect(await grantees(signature), signature).toEqual(signature === EVALUATOR_CALL_CHECK ? ["debateai_evaluator_worker", "debateai_rls_all_accounts"] : ["debateai_rls_all_accounts"]);
    }
    for (const signature of REVOKED) expect(await grantees(signature), signature).toEqual([]);
    // The system logins reach every moved function through the marker, and no revoked one.
    const system = [login("API_SYSTEM_DATABASE_URL"), login("RUNNER_DATABASE_URL"), login("LIVENESS_DATABASE_URL")];
    expect((await reach(MOVED, system)).length).toBe(MOVED.length * system.length);
    expect(await reach(REVOKED, system)).toEqual([]);
    // The runner's own steps run on its login, and the three the API calls outside a request (the page sweep's climb read, the room's count of open
    // work, the estimate's X21 read of settled digs) on its system login, both with no session.
    expect((await runner.query<{ level: number }>("SELECT identity.read_dig_level_of_run($1) AS level", [ben.runId])).rows[0]!.level).toBe(0);
    expect((await runner.query("SELECT identity.read_run_pause_of_run($1) AS pause", [ben.runId])).rowCount).toBe(1);
    expect((await runner.query("SELECT identity.read_path_climb_next($1) AS next", [ben.runId])).rowCount).toBe(1);
    expect((await apiSystem.query("SELECT identity.read_public_climb_next($1) AS next", [ben.runId])).rowCount).toBe(1);
    expect((await apiSystem.query("SELECT identity.run_work_is_parked($1,'READY',NULL) AS parked", [ben.runId])).rowCount).toBe(1);
    expect((await apiSystem.query("SELECT identity.dig_is_settled($1) AS settled", [ben.runId])).rowCount).toBe(1);
    // The engine's older ones: the runner reads a debate's recorded facts and asks the evaluator's call check, and the API's check worker's login
    // reaches the inheritance writer (refused only for an attempt that is not stored).
    expect((await runner.query("SELECT * FROM core.read_terminal_recorded_facts($1)", [ben.runId])).rowCount).toBe(1);
    expect((await runner.query<{ authorized: boolean }>("SELECT evaluator.provider_call_request_is_authorized($1,'evaluator.tag-question.v1',$2,'provider:evaluator-vllm') AS authorized",
      [ben.runId, `evaluator:tag-attempt:${randomUUID()}`])).rows[0]!.authorized).toBe(false);
    expect(await refusal(() => apiSystem.query("SELECT serve.record_synthesis_check_inheritance($1,$2,$3,1,$4)", [randomUUID(), ben.runId, randomUUID(), randomUUID()])))
      .toEqual({ code: "23503", message: "SYNTHESIS_CHECK_ATTEMPT_MISMATCH" });
    for (const [sql, values] of [
      ["SELECT identity.read_web_page_texts($1,'{}'::uuid[])", [ana.runId]], ["SELECT identity.read_free_debates_to_publish(1)", []],
      ["SELECT identity.read_public_reports_unwritten(1)", []], ["SELECT identity.delete_public_flag_words_due()", []],
      ["SELECT identity.read_paused_runs($1)", [ana.ownerRef]], ["SELECT identity.read_reserve($1)", [ana.ownerRef]],
      ["SELECT identity.read_public_digs_unsettled(now(),500)", []], ["SELECT identity.settle_public_contribution($1,'ALLOWED',NULL)", [ana.runId]],
      ["SELECT * FROM core.prepare_free_publication($1,$2)", [ana.runId, randomUUID()]], ["SELECT identity.refuse_free_publication($1)", [ana.runId]],
      ["SELECT * FROM identity.wipe_debate_passages($1,'NOTHING_RUNS')", [ana.runId]], ["SELECT identity.read_unreported_closings(1)", []],
      // The runner's own steps, even on the session's own debate: a request login writes no web evidence, turn, pause or report and reads none.
      ["SELECT identity.record_run_pause($1,'MONTH_WALL',now(),1,1,1)", [ana.runId]],
      ["SELECT * FROM identity.take_path_rewrite_turn($1,$2,'pos-1')", [ana.runId, ben.runId]],
      ["SELECT identity.record_public_report($1,'FAILED',NULL,'FIXTURE',NULL,1::smallint,1,1::smallint,1::smallint,NULL,NULL,'[]'::jsonb,0,NULL,NULL)", [randomUUID()]],
      ["SELECT identity.record_web_picks($1,'path-1','{}'::uuid[])", [ana.runId]], ["SELECT identity.dig_is_settled($1)", [ana.runId]],
      ["SELECT identity.read_public_climb_next($1)", [ana.runId]], ["SELECT identity.read_run_pause_of_run($1)", [ana.runId]],
      ["SELECT identity.run_work_is_parked($1,'READY',NULL)", [ana.runId]], ["SELECT identity.read_closing_since_of_root($1)", [ana.runId]],
      ["SELECT identity.record_investigation_report($1,1,$2)", [randomUUID(), randomUUID()]],
      // Nor the engine's older steps: a debate's recorded facts, the evaluator's call check and the check's inheritance writer, its own debate's included.
      ["SELECT * FROM core.read_terminal_recorded_facts($1)", [ana.runId]],
      ["SELECT evaluator.provider_call_request_is_authorized($1,'evaluator.tag-question.v1',$2,'provider:evaluator-vllm')", [ana.runId, `evaluator:tag-attempt:${randomUUID()}`]],
      ["SELECT serve.record_synthesis_check_inheritance($1,$2,$3,1,$4)", [randomUUID(), ana.runId, randomUUID(), randomUUID()]],
      // No request files a threat report naming an account, its own or another's.
      ["SELECT staff.keep_threat_report('A made-up question', $1)", [ana.userId]],
      ["SELECT staff.keep_threat_report_with_email('A made-up question', $1, 'ana@example.test')", [ana.userId]],
      // No request settles a flag, its own reporter's included: the judge's verdict is the API's system login's to record (X38).
      ["SELECT identity.settle_public_flag($1,'AGREE','PERSONAL','p','m',0,0,0)", [randomUUID()]],
      // Nor records a provider's probe, at any date: the discovery records its own on its system login (X37).
      ["SELECT core.record_provider_probe($1,'provider:review','maker:review','HEALTHY','model:review',NULL,'9999-01-01T00:00:00Z')", [randomUUID()]]
    ] as const) {
      const failure = await refusal(() => inAccountRequest(ana.token, () => pools.runtime.query(sql, [...values])));
      expect(failure.code, sql).toBe("42501");
      expect(failure.message, sql).toMatch(/^permission denied for function /u);
    }
  });

  it("staff's notice and alert loops are the API's timers' alone: a request login, with a session or none, is refused each; the system login drains them", async () => {
    // Before 0171 a request login with no session could claim every pending staff alert and notice and complete it as delivered, so none was sent.
    const claims = ["staff.claim_threat_report_alerts(1)", "staff.claim_team_limit_notices(1)", "staff.claim_allowance_notices(1)",
      "staff.claim_public_review_notices(1)", "staff.claim_public_flag_notices(1)"] as const;
    const others = [
      ["SELECT staff.complete_threat_report_alert($1,$2,true)", [randomUUID(), randomUUID()]], ["SELECT staff.threat_report_recipient_user($1)", [randomUUID()]],
      ["SELECT staff.erase_due_threat_reports()", []], ["SELECT staff.complete_team_limit_notice($1,$2,true)", [randomUUID(), randomUUID()]],
      ["SELECT staff.allowance_notice_user($1,$2)", [randomUUID(), randomUUID()]], ["SELECT staff.complete_public_review_notice($1,$2,true)", [randomUUID(), randomUUID()]],
      ["SELECT staff.complete_public_flag_notice($1,$2,true)", [randomUUID(), randomUUID()]], ["SELECT staff.public_flag_notice_user($1,$2)", [randomUUID(), randomUUID()]],
      // 0088's outbox: before 0171 a request login could claim every pending independent alert (with its key user's audit token), settle it
      // DELIVERED on a forged receipt, map its key and read the queue; and 0090's channel reader handed out the invitee's sealed address.
      ["SELECT staff.claim_alert_delivery(1)", []], ["SELECT staff.read_alert_key_mapping($1,$2)", [randomUUID(), randomUUID()]],
      ["SELECT staff.settle_alert_delivery($1,$2,'DELIVERED',NULL)", [randomUUID(), randomUUID()]], ["SELECT staff.read_alert_delivery_status()", []],
      ["SELECT staff.read_target_invitation_channel($1,$2,$3,$4,$5)", [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]]
    ] as const;
    for (const [sql, values] of [...claims.map((call) => [`SELECT * FROM ${call}`, []] as const), ...others]) {
      for (const [label, work] of [
        ["no session", () => apiRequest.query(sql, [...values])],
        ["ana's own request", () => inAccountRequest(ana.token, () => pools.runtime.query(sql, [...values]))],
        ["ana's own request on the authorization login", () => inAccountRequest(ana.token, () => pools.authorization.query(sql, [...values]))]
      ] as const) {
        const failure = await refusal(work);
        expect(failure.code, `${label}: ${sql}`).toBe("42501");
        expect(failure.message, `${label}: ${sql}`).toMatch(/^permission denied for function /u);
      }
    }
    // The API's system login, as its timers run them: each answers, in a transaction rolled back so no pending notice is spent here.
    const client = await apiSystem.connect();
    try {
      await client.query("BEGIN");
      for (const call of claims) expect(Array.isArray((await client.query(`SELECT * FROM ${call}`)).rows), call).toBe(true);
      for (const [sql, values] of others) expect((await client.query(sql, [...values])).rowCount, sql).toBe(1);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("0112's release of a staff alert claim stays the runtime's, as 0112's verifier requires, and gives back only a live claim, which only the marker's claim hands out", async () => {
    const SIGNATURE = "staff.release_alert_delivery(uuid,uuid)";
    expect((await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner`,
      [SIGNATURE])).rows.map(({ grantee }) => grantee)).toEqual(["debateai_runtime"]);
    expect((await database.pool.query<{ body: string }>("SELECT pg_get_functiondef($1::regprocedure) AS body", [SIGNATURE])).rows[0]!.body)
      .toContain("s.claim_token IS DISTINCT FROM p_claim");
    // A request login may call it, and a claim it made up gives back nothing.
    for (const [label, work] of [
      ["no session", () => apiRequest.query<{ released: boolean }>("SELECT staff.release_alert_delivery($1,$2) AS released", [randomUUID(), randomUUID()])],
      ["ana's own request", () => inAccountRequest(ana.token, () => pools.runtime.query<{ released: boolean }>("SELECT staff.release_alert_delivery($1,$2) AS released",
        [randomUUID(), randomUUID()]))]
    ] as const) expect((await work()).rows[0]!.released, label).toBe(false);
  });

  it("the consumer security notice loop is the authorization reconciler's timer's alone: the authorization request login, with a session or none, is refused each; its system login claims, reads and acknowledges", async () => {
    // Before 0171 the authorization request login with no session could claim any person's pending takeover warning and acknowledge it unsent.
    const cy = await seedSessionAccount(database.pool, "f5-consumer-notice");
    await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
      VALUES ($1,'email',$2::jsonb,'verified',now(),now())`, [cy.userId, JSON.stringify(ENVELOPE)]);
    // As a sign-in flow queues it (consumer-security-database.test.ts): in the flow's transaction, with its mail language set.
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SELECT set_config('debateai.mail_locale', 'en', true)");
      await seed.query("SELECT identity.enqueue_consumer_security_notice_internal($1,'METHOD_CHANGED')", [cy.userId]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
    const bareAuthorization = createPool(logins!.url("AUTHORIZATION_DATABASE_URL"), { max: 1 });
    const authorizationSystem = createPool(logins!.url("API_AUTHORIZATION_SYSTEM_DATABASE_URL"), { max: 1 });
    try {
      const calls = [
        ["SELECT * FROM identity.claim_consumer_security_notices(100)", []], ["SELECT identity.read_consumer_security_notice($1,$2)", [randomUUID(), randomUUID()]],
        ["SELECT identity.ack_consumer_security_notice($1,$2)", [randomUUID(), randomUUID()]],
        ["SELECT identity.fail_consumer_security_notice($1,$2,'MAIL_TRANSPORT_FAILED')", [randomUUID(), randomUUID()]]
      ] as const;
      for (const [sql, values] of calls) {
        for (const [label, work] of [
          ["the authorization login, no session", () => bareAuthorization.query(sql, [...values])],
          ["cy's own request on the authorization login", () => inAccountRequest(cy.token, () => pools.authorization.query(sql, [...values]))],
          ["cy's own request on the request login", () => inAccountRequest(cy.token, () => pools.runtime.query(sql, [...values]))]
        ] as const) {
          const failure = await refusal(work);
          expect(failure.code, `${label}: ${sql}`).toBe("42501");
          expect(failure.message, `${label}: ${sql}`).toMatch(/^permission denied for function /u);
        }
      }
      // The authorization pool's system login, as the reconciler runs outside any request: it claims cy's notice, reads it and acknowledges it, rolled
      // back so the notice stays queued.
      const client = await authorizationSystem.connect();
      try {
        await client.query("BEGIN");
        const claim = (await client.query<{ notice_id: string; user_id: string; claim_token: string }>("SELECT * FROM identity.claim_consumer_security_notices(100)"))
          .rows.find((row) => row.user_id === cy.userId);
        expect(claim).toBeDefined();
        expect((await client.query<{ value: { userId: string; eventKind: string } | null }>("SELECT identity.read_consumer_security_notice($1,$2) AS value",
          [claim!.notice_id, claim!.claim_token])).rows[0]!.value).toMatchObject({ userId: cy.userId, eventKind: "METHOD_CHANGED" });
        expect((await client.query<{ value: boolean }>("SELECT identity.ack_consumer_security_notice($1,$2) AS value", [claim!.notice_id, claim!.claim_token]))
          .rows[0]!.value).toBe(true);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
      expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.consumer_security_notice WHERE user_id=$1", [cy.userId])).rows[0]!.n)).toBe(1);
    } finally { await Promise.all([bareAuthorization.end(), authorizationSystem.end()]); }
  });

  it("the retention purges of what is due are the API's timers' alone: a request login is refused each; the system login runs them", async () => {
    const purges = ["SELECT identity.purge_expired_authentication_risk_signals(1) AS purged", "SELECT serve.purge_expired_synthesis_check_removal_notices() AS purged",
      "SELECT legal.purge_expired_acceptance(clock_timestamp()) AS purged"] as const;
    for (const sql of purges) {
      for (const [label, work] of [
        ["no session", () => apiRequest.query(sql)],
        ["ana's own request", () => inAccountRequest(ana.token, () => pools.runtime.query(sql))],
        ["ana's own request on the authorization login", () => inAccountRequest(ana.token, () => pools.authorization.query(sql))]
      ] as const) {
        const failure = await refusal(work);
        expect(failure.code, `${label}: ${sql}`).toBe("42501");
        expect(failure.message, `${label}: ${sql}`).toMatch(/^permission denied for (?:function|schema) /u);
      }
    }
    const client = await apiSystem.connect();
    try {
      await client.query("BEGIN");
      for (const sql of purges) expect(Number((await client.query<{ purged: number | string }>(sql)).rows[0]!.purged), sql).toBeGreaterThanOrEqual(0);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("0085's hold question is no longer the request login's: the API's runtime and billing roles are refused it, the authorization login still asks it of its own session's account", async () => {
    // Before 0171 the API's request login could ask, of any user id, whether the account is held or gone.
    const sql = "SELECT identity.read_account_security_hold($1) AS held";
    for (const [label, work] of [
      ["no session", () => apiRequest.query(sql, [ben.userId])],
      ["ana's own request, of ben", () => inAccountRequest(ana.token, () => pools.runtime.query(sql, [ben.userId]))],
      ["ana's own request, of her own", () => inAccountRequest(ana.token, () => pools.runtime.query(sql, [ana.userId]))]
    ] as const) {
      expect(await refusal(work), label).toEqual({ code: "42501", message: "permission denied for function read_account_security_hold" });
    }
    // The sign-in step-up's read, as sessions.ts makes it on the authorization pool: the user row its login reads, and that row's hold.
    expect((await inAccountRequest(ana.token, () => pools.authorization.query<{ held: boolean }>(sql, [ana.userId]))).rows[0]!.held).toBe(false);
    for (const role of ["debateai_runtime", "debateai_billing_runtime"]) {
      expect((await database.pool.query<{ allowed: boolean }>("SELECT has_function_privilege($1,'identity.read_account_security_hold(uuid)','EXECUTE') AS allowed",
        [role])).rows[0]!.allowed, role).toBe(false);
    }
  });

  it("on the production logins (P3-01's memberships): a staff request's ceremonies, changes and alert key mapping are its system login's (X14); the request logins are refused each", async () => {
    // Before 0171 the API's request login could start any person's key ceremony, read any active account's audit token and ask any staff context's
    // capability, with a session or none.
    const production = await logins!.production();
    const opened: Pool[] = [];
    const routed = (id: "api-runtime" | "api-authorization", system: "api-system" | "api-authorization-system"): Pool => {
      const target = createPool(production.url(system), { max: 2 });
      const pool = createPool(production.url(id), { max: 2, crossAccount: target });
      opened.push(pool, target);
      return pool;
    };
    try {
      const request = routed("api-runtime", "api-system");
      const authorization = routed("api-authorization", "api-authorization-system");
      const context = { staffId: randomUUID(), userId: ana.userId, ordinarySessionId: randomUUID(), privilegeSessionId: randomUUID() };
      const calls = [
        ['SELECT staff."grant"($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)', [context, randomUUID(), {}, ben.userId, ["TEAM_READ"], randomUUID(), {}, {}]],
        ["SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [randomUUID(), ben.userId, randomUUID(), randomUUID(), {}, {}]],
        ["SELECT staff.authorize_action($1::jsonb,'TEAM_READ')", [context]],
        ["SELECT staff.begin_owned_webauthn($1,$2,'ELEVATION',$3,$3,'localhost','http://localhost',NULL,NULL,NULL,NULL,'{}'::jsonb)", [ben.userId, randomUUID(), hash("x")]],
        ["SELECT staff.read_owned_webauthn_challenge($1,$2,'ELEVATION',$3,NULL,NULL,NULL)", [ben.userId, randomUUID(), hash("x")]],
        ["SELECT staff.fail_owned_webauthn($1,$2,$3)", [ben.userId, randomUUID(), randomUUID()]],
        ["SELECT staff.complete_owned_webauthn_registration($1,$2,$3,$4,$5,'k','p',1,'{}'::jsonb,'{}'::text[],'{}'::jsonb)",
          [ben.userId, randomUUID(), randomUUID(), randomUUID(), randomUUID()]],
        ["SELECT staff.complete_owned_webauthn_assertion($1,$2,$3,'k',1,'localhost','http://localhost',NULL,NULL,NULL,NULL,NULL,NULL)", [ben.userId, randomUUID(), randomUUID()]],
        ["SELECT identity.staff_read_owned_webauthn_key($1,$2,$3,'k')", [ben.userId, randomUUID(), randomUUID()]],
        ["SELECT staff.read_alert_user_mapping($1)", [ben.userId]]
      ] as const;
      for (const [sql, values] of calls) {
        const name = /SELECT (?:staff|identity)\.("?)([a-z_]+)\1\(/u.exec(sql)![2]!;
        for (const [label, pool] of [["the request login", request], ["the authorization login", authorization]] as const) {
          expect(await refusal(() => inAccountRequest(ana.token, () => pool.query(sql, [...values]))), `${label}: ${name}`)
            .toEqual({ code: "42501", message: `permission denied for function ${name}` });
        }
      }
      // A staff change's alert intent, as createStaffRuntime wires it from main.ts: its key mapping on the request pool's X14 site, inside the request.
      const mappings = new PostgresStaffAlertRepository(crossAccountPool(request, "X14"));
      const auditToken = (await database.pool.query<{ audit_token: string }>('SELECT audit_token FROM identity."user" WHERE user_id=$1', [ben.userId])).rows[0]!.audit_token;
      expect(await inAccountRequest(ana.token, () => mappings.resolveUser(ben.userId))).toEqual({ userId: ben.userId, keyRef: auditToken });
      // And the staff repository's capability check on the same site: a context that is no live staff session's is refused, not an error.
      expect((await inAccountRequest(ana.token, () => crossAccountPool(request, "X14").query<{ allowed: boolean }>(
        "SELECT staff.authorize_action($1::jsonb,'TEAM_READ') AS allowed", [context]))).rows[0]!.allowed).toBe(false);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("every identity definer the API's billing role may call with an owner asks the session's owner, the person's spend totals included", async () => {
    const unchecked = (await database.pool.query<{ signature: string }>(`
      SELECT p.oid::regprocedure::text AS signature FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'identity' AND p.prosecdef AND p.proargnames && ARRAY['p_owner_ref','p_owner']::text[]
        AND has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
        AND p.prosrc !~ 'identity\\.(request_owner_matches|page_memory_run_owned)\\(' ORDER BY 1`)).rows.map(({ signature }) => signature);
    // Only the ones the two merges brought (0157's two and 0158's to 0167's twelve), which neither merge hardened and the census's fifth list names; any other that takes an owner and asks nothing fails.
    expect(unchecked).toEqual([...ARRIVED_OWNER_TAKING].sort());
    for (const signature of ARRIVED_OWNER_TAKING) expect(Object.keys(ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED), signature).toContain(signature);
    // And the ones that ask: at least the eighteen of 0131's rule still live and the fourteen others.
    const checked = (await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'identity' AND p.prosecdef AND has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
        AND p.prosrc ~ 'identity\\.(request_owner_matches|page_memory_run_owned)\\('`)).rows[0]!.n;
    expect(checked).toBeGreaterThanOrEqual(27);
  });
});

describe("F5: the site's day of spend is the system's to write: the writers of a paid call with no debate, the day's tables and the sequence counter", () => {
  /** 0118's, 0128's and 0144's writers of a paid call that names no debate, each called with an id, a day, an amount and (the clarify charge) an owner. */
  const WRITERS = [
    { signature: "ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)", name: "record_language_check_spend",
      call: (pool: Pool, id: string, day: string, micros: number, _owner: string) => pool.query(
        "SELECT ledger.record_language_check_spend($1,'language-check:anthropic:claude-haiku-5-5',$2::date,$3,1,1)", [id, day, micros]) },
    { signature: "ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)", name: "record_question_check_spend",
      call: (pool: Pool, id: string, day: string, micros: number, _owner: string) => pool.query(
        "SELECT ledger.record_question_check_spend($1,'question-check:anthropic:claude-haiku-5-5',$2::date,$3,1,1)", [id, day, micros]) },
    { signature: "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)", name: "record_ask_clarify_charge",
      call: (pool: Pool, id: string, day: string, micros: number, owner: string) => pool.query(
        "SELECT identity.record_ask_clarify_charge($1,$4,NULL,NULL,'ask-clarify:anthropic:claude-haiku-5-5',$2::date,$3,1,1)", [id, day, micros, owner]) }
  ] as const;
  /** The day's three tables, each with an INSERT of a size that would fill any day, on a debate of the connection's own where it takes one. */
  const TABLE_WRITES = [
    { table: "model_spend", sql: `INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES (gen_random_uuid(),'RUN',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date + 1,$2,1,1)`, own: true },
    { table: "model_spend_hold", sql: "INSERT INTO ledger.model_spend_hold (hold_id,run_id,held_micros,opened_at) VALUES (gen_random_uuid(),$1,$2,clock_timestamp())",
      own: true },
    // Never expiring, for today: row security never reached the reservations.
    { table: "model_spend_reservation", sql: `INSERT INTO ledger.model_spend_reservation (reservation_id,reserved_on,reserved_micros,opened_at,expires_at)
      VALUES (gen_random_uuid(),(clock_timestamp() AT TIME ZONE 'UTC')::date,$1,clock_timestamp(),'9999-12-31')`, own: false }
  ] as const;
  /** Enough to fill any day the site could set, and still a whole number JavaScript holds exactly. */
  const WHOLE_DAY = 4_000_000_000_000_000;
  const CLASS = { compositionBudgetTier: "low", makerCount: 2, depth: 1 } as const;
  const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:security-review-0171-day");
  let pools: ApiTestPools;
  let ana: RlsTestAccount;
  let ben: RlsTestAccount;
  let cy: RlsTestAccount;
  const utcDay = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const login = (key: Parameters<RlsLogins["url"]>[0]): string => decodeURIComponent(new URL(logins!.url(key)).username);
  const refusal = async (work: () => Promise<unknown>): Promise<SqlError> => {
    const { code, message } = await sqlError(work);
    return { code, message };
  };
  const grantees = async (signature: string) => (await database.pool.query<{ grantee: string }>(`SELECT DISTINCT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
    FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
    WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner AND a.privilege_type='EXECUTE' ORDER BY 1`, [signature])).rows.map(({ grantee }) => grantee);
  const dayTotal = async (day: string) => (await database.pool.query<{ total: string }>(
    "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE charged_on=$1::date", [day])).rows[0]!.total;
  const ledgerRows = async (id: string) => Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM ledger.model_spend WHERE spend_id=$1", [id])).rows[0]!.n);
  /** Every request login, as the API's requests reach the database: with no session, anonymous, with the session's own, and the authorization login's. */
  const requests = (): ReadonlyArray<readonly [string, <T>(work: () => Promise<T>) => Promise<T>, Pool]> => [
    ["no session (a pool with no system target sends none)", (work) => work(), apiRequest],
    ["an anonymous request", (work) => inAccountRequest(null, work), pools.runtime],
    ["ana's own request", (work) => inAccountRequest(ana.token, work), pools.runtime],
    ["ana's own request on the authorization login", (work) => inAccountRequest(ana.token, work), pools.authorization]
  ];
  const holdOf = async (runId: string) => (await database.pool.query<{ held: string }>("SELECT held_micros::text AS held FROM ledger.model_spend_hold WHERE run_id=$1",
    [runId])).rows.map(({ held }) => Number(held));
  const scopeOf = async (runId: string) => (await database.pool.query<{ kind: string }>("SELECT funding_kind AS kind FROM billing.run_charge_scope WHERE run_id=$1",
    [runId])).rows.map(({ kind }) => kind);
  const jobsOf = async (runId: string) => (await database.pool.query<{ state: string }>("SELECT state FROM core.work_item WHERE run_id=$1", [runId]))
    .rows.map(({ state }) => state);

  beforeAll(async () => {
    pools = logins!.apiPools();
    ana = await seedSessionAccount(database.pool, "f5-day-ana");
    ben = await seedSessionAccount(database.pool, "f5-day-ben");
    cy = await seedSessionAccount(database.pool, "f5-day-cy");
    await plentyOfTeamRoom(database.pool);
  }, 120_000);

  it("0118's, 0128's and 0144's writers are the marker's alone: every request login is refused each, at any amount, and the day is as it was; the system logins write", async () => {
    // Before 0171 one call on the API's request login, with no session, filled tomorrow: every paid call on the site stopped until it ended.
    const tomorrow = utcDay(1);
    const before = await dayTotal(tomorrow);
    for (const [label, within, pool] of requests()) {
      for (const writer of WRITERS) {
        expect(await refusal(() => within(() => writer.call(pool, randomUUID(), tomorrow, WHOLE_DAY, ana.ownerRef))), `${label}: ${writer.name}`)
          .toEqual({ code: "42501", message: `permission denied for function ${writer.name}` });
      }
    }
    expect(await dayTotal(tomorrow)).toBe(before);
    for (const writer of WRITERS) expect(await grantees(writer.signature), writer.signature).toEqual(["debateai_rls_all_accounts"]);
    // The API's system login, which its sites X30 to X32 reach inside the paying request, and the runner, at each call's own charge.
    for (const pool of [apiSystem, runner]) {
      for (const writer of WRITERS) {
        const id = randomUUID();
        await writer.call(pool, id, utcDay(0), 1, ana.ownerRef);
        expect(await ledgerRows(id), writer.name).toBe(1);
      }
    }
  });

  it("the day's tables are no request login's to write: a charge, a hold or a reservation of any size is refused; the marker's logins write them, and a request still reads its own", async () => {
    const reservationsBefore = (await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM ledger.model_spend_reservation")).rows[0]!.n;
    for (const [label, within, pool] of requests()) {
      for (const { table, sql, own } of TABLE_WRITES) {
        expect(await refusal(() => within(() => pool.query(sql, own ? [ana.runId, WHOLE_DAY] : [WHOLE_DAY]))), `${label}: ${table}`)
          .toEqual({ code: "42501", message: `permission denied for table ${table}` });
      }
    }
    expect((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM ledger.model_spend_reservation")).rows[0]!.n).toBe(reservationsBefore);
    expect(await holdOf(ana.runId)).toEqual([]);
    const roles = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", login("DATABASE_URL"), login("AUTHORIZATION_DATABASE_URL")];
    const system = (["API_SYSTEM_DATABASE_URL", "API_AUTHORIZATION_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL", "LIVENESS_DATABASE_URL"] as const).map(login);
    const reach = async (who: readonly string[], privilege: string) => (await database.pool.query<{ role: string; relation: string }>(`
      SELECT role, relation FROM unnest($1::text[]) AS role CROSS JOIN unnest($2::text[]) AS relation WHERE has_table_privilege(role, relation, $3) ORDER BY 1, 2`,
      [who, TABLE_WRITES.map(({ table }) => `ledger.${table}`), privilege])).rows.length;
    expect(await reach(roles, "INSERT")).toBe(0);
    expect(await reach(system, "INSERT")).toBe(system.length * TABLE_WRITES.length);
    expect(await reach(roles, "SELECT")).toBe(roles.length * TABLE_WRITES.length);
    // The marker's logins write each, here at a made-up past day or a debate with no job, so no day of this file counts them.
    const quiet = await run(ana);
    await apiSystem.query(`INSERT INTO ledger.model_spend_reservation (reservation_id,reserved_on,reserved_micros,opened_at,expires_at)
      VALUES (gen_random_uuid(),'2001-02-03',1,clock_timestamp(),clock_timestamp()+interval '1 minute')`);
    await apiSystem.query("INSERT INTO ledger.model_spend_hold (hold_id,run_id,held_micros,opened_at) VALUES (gen_random_uuid(),$1,1,clock_timestamp())", [quiet]);
    await runner.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES (gen_random_uuid(),'RUN',$1,'fake-provider','2001-02-03',1,1,1)`, [quiet]);
    await seeded([[`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES (gen_random_uuid(),'RUN',$1,'fake-provider','2001-02-03',1,1,1)`, [ben.runId]]]);
    expect(await holdOf(quiet)).toEqual([1]);
    // A request reads its own debates' rows as before, and another account's not at all.
    const charged = "SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id = ANY($1::uuid[])";
    expect((await inAccountRequest(ana.token, () => pools.runtime.query<{ n: number }>(charged, [[quiet, ben.runId]]))).rows[0]!.n).toBe(1);
    expect((await inAccountRequest(ben.token, () => pools.runtime.query<{ n: number }>(charged, [[quiet, ben.runId]]))).rows[0]!.n).toBe(1);
    expect((await apiSystem.query<{ n: number }>(charged, [[quiet, ben.runId]])).rows[0]!.n).toBe(2);
  });

  it("the sequence counter is written only through its allocator: no request login sets or locks the row, and every login that may draw still draws, in order", async () => {
    // Before 0171 the API's request login could set the counter back, and every event the site appended next collided with one already written.
    for (const [label, within, pool] of requests()) {
      for (const sql of ["UPDATE ledger.sequence_allocator SET next_sequence = 1 WHERE singleton", "SELECT next_sequence FROM ledger.sequence_allocator FOR UPDATE"]) {
        expect(await refusal(() => within(() => pool.query(sql))), `${label}: ${sql}`).toEqual({ code: "42501", message: "permission denied for table sequence_allocator" });
      }
    }
    const settlement = logins!.loginPool("SETTLEMENT_DATABASE_URL", 1);
    const liveness = logins!.loginPool("LIVENESS_DATABASE_URL", 1);
    const drawing: ReadonlyArray<readonly [string, <T>(work: () => Promise<T>) => Promise<T>, Pool]> = [...requests(),
      ["the API's system login", (work) => work(), apiSystem], ["the runner", (work) => work(), runner], ["the settlement watcher", (work) => work(), settlement],
      ["the scheduler's liveness login", (work) => work(), liveness]];
    const drawn: number[] = [];
    for (const [label, within, pool] of drawing) {
      drawn.push(Number((await within(() => pool.query<{ at: string }>("SELECT ledger.allocate_sequence() AS at"))).rows[0]!.at));
      expect(drawn.at(-1), label).toBeGreaterThan(drawn.at(-2) ?? 0);
    }
    const shape = (await database.pool.query<{ definer: boolean; owned: boolean; config: string[] }>(`SELECT p.prosecdef AS definer, p.proowner = c.relowner AS owned,
      p.proconfig AS config FROM pg_proc AS p, pg_class AS c WHERE p.oid = 'ledger.allocate_sequence()'::regprocedure AND c.oid = 'ledger.sequence_allocator'::regclass`)).rows[0];
    expect(shape).toEqual({ definer: true, owned: true, config: ["search_path=pg_catalog, pg_temp"] });
    expect(await grantees("ledger.allocate_sequence()")).toEqual(["debateai_evaluator_api", "debateai_evaluator_worker", "debateai_runtime", "debateai_settlement_watch"]);
  });

  it("the work queue's UPDATE, granted on the same line of 0000, reaches only the connection's own debates", async () => {
    const job = async (runId: string) => (await database.pool.query<{ id: string }>(`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,created_at_seq)
      VALUES ($1,'Q1','[]'::jsonb,$2,'DONE',ledger.allocate_sequence()) RETURNING work_item_id AS id`, [runId, `S00:${runId}:${randomUUID()}`])).rows[0]!.id;
    const jobs = [await job(ana.runId), await job(ben.runId)];
    const touch = "UPDATE core.work_item SET node_set = node_set WHERE work_item_id = ANY($1::uuid[])";
    expect((await inAccountRequest(ana.token, () => pools.runtime.query(touch, [jobs]))).rowCount).toBe(1);
    expect((await inAccountRequest(null, () => pools.runtime.query(touch, [jobs]))).rowCount).toBe(0);
    expect((await apiRequest.query(touch, [jobs])).rowCount).toBe(0);
    expect((await apiSystem.query(touch, [jobs])).rowCount).toBe(2);
  });

  it("a person's spend totals (0144's clarify charges, 0149's public reports), counts that cap, refuse another account's connection, or none, and never answer it 0; the person's own and the system logins read them", async () => {
    // Before 0171 any request login read any person's totals in any window, and so the times and sizes of their calls; and a total read as 0 to a
    // connection that is not the person's would let every cap it feeds (the room, Continue, the clarify pool, the usage page, the withdrawal) admit more.
    await seeded([
      ["INSERT INTO identity.ask_clarify_charge (charge_id,owner_ref,funding_kind,charge_micros,recorded_at) VALUES ($1,$2,'SUBSCRIPTION',4242,clock_timestamp())",
        [randomUUID(), cy.ownerRef]],
      ["INSERT INTO identity.public_report_charge (spend_id,owner_ref,investigation_id,report_version,charge_micros,recorded_at) VALUES ($1,$2,$3,1,4343,clock_timestamp())",
        [randomUUID(), cy.ownerRef, randomUUID()]]]);
    const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
    const clarify = (pool: Pool) => pool.query<{ total: string }>(
      "SELECT identity.read_ask_clarify_spent($1, clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour')::text AS total", [cy.ownerRef])
      .then((result) => result.rows[0]!.total);
    const report = (pool: Pool, funded: boolean) => pool.query<{ total: string }>(
      "SELECT identity.read_public_report_spent_by_funding($1, clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', $2)::text AS total",
      [cy.ownerRef, funded]).then((result) => result.rows[0]!.total);
    const totals = async (pool: Pool) => ({ clarify: await clarify(pool), report: await report(pool, false), funded: await report(pool, true) });
    // Each refuses as its first statement, a team's report total (funded) as a person's own: an error, never a total.
    for (const [label, within, pool] of requests()) {
      expect(await refusal(() => within(() => clarify(pool))), label).toEqual(MISMATCH);
      expect(await refusal(() => within(() => report(pool, false))), label).toEqual(MISMATCH);
      expect(await refusal(() => within(() => report(pool, true))), label).toEqual(MISMATCH);
    }
    const own = { clarify: "4242", report: "4343", funded: "0" };
    expect(await inAccountRequest(cy.token, () => totals(pools.runtime))).toEqual(own);
    expect(await totals(apiSystem)).toEqual(own);
    expect(await totals(runner)).toEqual(own);
  });

  it("on the production logins (P3-01's memberships): a person's spend totals refuse another account's request and either request login with no session, and the spend reader every person-window cap reads counts them in the person's own request and on the system logins", async () => {
    const production = await logins!.production();
    const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
    const opened: Pool[] = [];
    const login = (id: "api-runtime" | "api-authorization" | "api-system" | "runner-runtime", target?: Pool): Pool => {
      const pool = createPool(production.url(id), { max: 2, ...(target === undefined ? {} : { crossAccount: target }) });
      opened.push(pool);
      return pool;
    };
    try {
      const system = login("api-system");
      const request = login("api-runtime", login("api-system"));
      const [runtime, authorization, runnerLogin] = [login("api-runtime"), login("api-authorization"), login("runner-runtime")];
      const dee = await seedSessionAccount(database.pool, "f5-day-dee");
      await seeded([
        ["INSERT INTO identity.ask_clarify_charge (charge_id,owner_ref,funding_kind,charge_micros,recorded_at) VALUES ($1,$2,'SUBSCRIPTION',4242,clock_timestamp())",
          [randomUUID(), dee.ownerRef]],
        ["INSERT INTO identity.public_report_charge (spend_id,owner_ref,investigation_id,report_version,charge_micros,recorded_at) VALUES ($1,$2,$3,1,4343,clock_timestamp())",
          [randomUUID(), dee.ownerRef, randomUUID()]]]);
      const from = new Date(Date.now() - 3_600_000), to = new Date(Date.now() + 3_600_000);
      const one = (pool: Pool, sql: string, values: readonly unknown[]) => pool.query<{ total: string }>(sql, [...values]).then((result) => result.rows[0]!.total);
      const read = async (pool: Pool) => [
        await one(pool, "SELECT identity.read_ask_clarify_spent($1,$2,$3)::text AS total", [dee.ownerRef, from, to]),
        await one(pool, "SELECT identity.read_public_report_spent_by_funding($1,$2,$3,false)::text AS total", [dee.ownerRef, from, to]),
        await one(pool, "SELECT identity.read_public_report_spent_by_funding($1,$2,$3,true)::text AS total", [dee.ownerRef, from, to])];
      // The person's own request, the API's system login (the waker, the withdrawal command) and the runner's (its wall) read the totals.
      for (const [label, by] of [["dee's own session", () => inAccountRequest(dee.token, () => read(request))], ["the system login with no session", () => read(system)],
        ["the runner's login with no session", () => read(runnerLogin)]] as const) expect(await by(), label).toEqual(["4242", "4343", "0"]);
      // Another account's session, an anonymous request and either request login on a connection of its own with no session: refused.
      for (const [label, by] of [["ana's session", () => inAccountRequest(ana.token, () => read(request))],
        ["an anonymous request", () => inAccountRequest(null, () => read(request))], ["api-runtime with no session", () => read(runtime)],
        ["api-authorization with no session", () => read(authorization)]] as const) expect(await refusal(by), label).toEqual(MISMATCH);
      // The spend reader the room, Continue, the clarify pool, the coarse fit, the usage page and the withdrawal read (packages/budget's
      // PostgresModelSpendStore, as main.ts builds it on the request pool): both charges count in the person's own request and on the system
      // login, and another's request is refused, never answered 0.
      const store = (pool: Pool) => new PostgresModelSpendStore(pool);
      expect(await inAccountRequest(dee.token, () => store(request).readOwnerSpentMicros(dee.ownerRef, from, to))).toBe(8585);
      expect(await inAccountRequest(dee.token, () => store(request).readOwnerSpentInRangesMicros(dee.ownerRef, [{ from, to }]))).toEqual([8585]);
      expect(await store(system).readOwnerSpentMicros(dee.ownerRef, from, to)).toBe(8585);
      expect(await store(runnerLogin).readOwnerSpentMicros(dee.ownerRef, from, to)).toBe(8585);
      expect(await refusal(() => inAccountRequest(ana.token, () => store(request).readOwnerSpentMicros(dee.ownerRef, from, to)))).toEqual(MISMATCH);
      expect(await refusal(() => inAccountRequest(ana.token, () => store(request).readOwnerSpentInRangesMicros(dee.ownerRef, [{ from, to }])))).toEqual(MISMATCH);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("on the production logins (P3-01's memberships): the API's sites write the day inside a request, the request login is refused; a funded and an unfunded ask start with their holds, a waiting ask starts, the daily guard admits, and the room counts every account's holds", async () => {
    const production = await logins!.production();
    const target = createPool(production.url("api-system"), { max: 3 });
    const request = createPool(production.url("api-runtime"), { max: 3, crossAccount: target });
    const decision = createPool(production.url("api-system"), { max: 3 });
    const fixture = internalFundingFixture(database.pool, apiSystem);
    const started: string[] = [];
    try {
      // The boot probes, as main.ts makes them: each writer on its site's login, the reservation on the request login's own.
      expect(await languageCheckSpendWriterPresent(crossAccountPool(request, "X30"))).toBe(true);
      expect(await questionCheckSpendWriterPresent(crossAccountPool(request, "X31"))).toBe(true);
      expect(await askClarifyChargeWriterPresent(crossAccountPool(request, "X32"))).toBe(true);
      expect(await onOwnConnections(() => askClarifyReservationPresent(request))).toBe(true);
      expect(await onOwnConnections(() => languageCheckSpendWriterPresent(request))).toBe(false);
      expect(await onOwnConnections(() => askClarifyChargeWriterPresent(request))).toBe(false);
      // Each paid call's record, inside the paying request, through its site; the same record on the request login itself is refused.
      const entry = (providerRef: string) => ({ spendId: randomUUID(), providerRef, chargedOn: utcDay(0), chargeMicros: 1, inputTokens: 1, outputTokens: 1 });
      const synthesis = (spendId: string) => ({ spendId, spendSource: "SYNTHESIS_CHECK" as const, runId: ben.runId, providerRef: "synthesis-check:anthropic:claude-haiku-5-5",
        chargedOn: utcDay(0), chargeMicros: 1, inputTokens: 1, outputTokens: 1 });
      const denied = (name: string) => ({ code: "42501", message: `permission denied for ${name}` });
      const [language, question, clarify] = [entry("language-check:anthropic:claude-haiku-5-5"), entry("question-check:anthropic:claude-haiku-5-5"),
        { ...entry("ask-clarify:anthropic:claude-haiku-5-5"), ownerRef: ben.ownerRef, grant: null }];
      const synthesisId = randomUUID();
      await inAccountRequest(ben.token, async () => {
        await recordLanguageCheckSpend(crossAccountPool(request, "X30"), language);
        await recordQuestionCheckSpend(crossAccountPool(request, "X31"), question);
        await reserveAskClarifyCharge(request, clarify);
        await recordAskClarifyCharge(crossAccountPool(request, "X32"), clarify);
        await new PostgresModelSpendStore(crossAccountPool(request, "X33")).recordSpend(synthesis(synthesisId));
        expect(await refusal(() => recordLanguageCheckSpend(request, entry("language-check:anthropic:claude-haiku-5-5")))).toEqual(denied("function record_language_check_spend"));
        expect(await refusal(() => recordQuestionCheckSpend(request, entry("question-check:anthropic:claude-haiku-5-5")))).toEqual(denied("function record_question_check_spend"));
        expect(await refusal(() => recordAskClarifyCharge(request, { ...clarify, spendId: randomUUID() }))).toEqual(denied("function record_ask_clarify_charge"));
        expect(await refusal(() => new PostgresModelSpendStore(request).recordSpend(synthesis(randomUUID())))).toEqual(denied("table model_spend"));
      });
      // Read back after the request: the superuser's pool is refused inside one.
      for (const id of [language.spendId, question.spendId, clarify.spendId, synthesisId]) expect(await ledgerRows(id)).toBe(1);
      expect((await database.pool.query<{ owner_ref: string }>("SELECT owner_ref FROM identity.ask_clarify_charge WHERE charge_id=$1", [clarify.spendId])).rows)
        .toEqual([{ owner_ref: ben.ownerRef }]);
      // The room as main.ts builds it: its decisions on the API's system login (roomDecisionPool), its reads on the request pool.
      const source = new FundingAwarePersonAllowanceSource({ allowances: new PostgresInternalAllowanceRepository(request), entitlements: new EntitlementRepository(request),
        plans, closeBasisPoints: 9500 });
      const room = (dailyCeilingMicros: number) => new AskRoom({ lockPool: decision, spend: new PostgresModelSpendStore(request), line: new RunWaitRepository(request),
        estimator: { estimateMicros: async () => 1000 }, personAllowance: source, entitlements: new EntitlementRepository(request), funding: source, billingPlans: plans,
        dailyCeilingMicros, closeBasisPoints: 9500, waitingLinePerPerson: 1 } as never);
      const work = new WorkItemRepository(request);
      const ask = (r: AskRoom, ownerRef: string, runId: string, planTier: "free" | "premium") =>
        r.decide({ access: { ownerRef, legacyAskerId: null }, settingsClass: { ...CLASS, planTier } }, async ({ admission, estimateMicros, now, tx }) => {
          if (admission.kind === "WAIT") { await r.enterWait(tx, runId, now); return "WAIT"; }
          // B6b's order: the hold and the charge scope, then the first job on the same transaction, last.
          await r.openStart(tx, { runId, access: { ownerRef, legacyAskerId: null }, heldMicros: estimateMicros, now });
          await work.enqueueOn(tx, { runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
          return "START";
        });
      // A funded member's ask, in the member's own request: the hold, the grant's scope and the first job, together.
      const funded = await fixture.fundedActor();
      await fixture.configure(funded, fixture.configureCommand(funded));
      const fundedToken = await seedLiveSession(database.pool, funded.userId);
      const fundedRun = await fixture.run(funded.ownerRef);
      expect(await inAccountRequest(fundedToken, () => ask(room(1_000_000_000_000), funded.ownerRef, fundedRun, "premium"))).toBe("START");
      started.push(fundedRun);
      expect([await holdOf(fundedRun), await scopeOf(fundedRun), await jobsOf(fundedRun)]).toEqual([[1000], ["INTERNAL"], ["READY"]]);
      // An unfunded person's ask, on the free plan.
      const unfundedRun = await fixture.run(ben.ownerRef, "free");
      expect(await inAccountRequest(ben.token, () => ask(room(1_000_000_000_000), ben.ownerRef, unfundedRun, "free"))).toBe("START");
      started.push(unfundedRun);
      expect([await holdOf(unfundedRun), await scopeOf(unfundedRun), await jobsOf(unfundedRun)]).toEqual([[1000], ["SUBSCRIPTION"], ["READY"]]);
      // A full day: the ask waits in line, and the waker starts it later, outside any request, with its hold.
      await seeded([[`INSERT INTO ledger.model_spend (spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES (gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)`, []]]);
      const waitingRun = await fixture.run(cy.ownerRef, "free");
      expect(await inAccountRequest(cy.token, () => ask(room(1), cy.ownerRef, waitingRun, "free"))).toBe("WAIT");
      const waiting = await new RunWaitRepository(request).readWaiting(waitingRun);
      expect(waiting).not.toBeNull();
      expect((await room(1_000_000_000_000).startWaiting(waiting!, (tx, runId) => work.enqueueOn(tx, { runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] }))).kind)
        .toBe("STARTED");
      started.push(waitingRun);
      expect([await holdOf(waitingRun), await jobsOf(waitingRun)]).toEqual([[1000], ["READY"]]);
      // The room's count of the holds on the site's day, inside one account's request, is every account's (X23), as the superuser counts it.
      const today = utcDay(0);
      const site = await new PostgresModelSpendStore(database.pool).readSiteCountedHoldsMicros(today);
      expect(site).toBeGreaterThanOrEqual(3000);
      expect(await inAccountRequest(ben.token, () => new PostgresModelSpendStore(request).readSiteCountedHoldsMicros(today))).toBe(site);
      // A hosted site without the room: the daily guard reserves the day's room for a new debate inside the request (its X23 frame), here on a past day.
      const guard = new CostEnvelopeGuard({ store: new PostgresModelSpendStore(request), policy: { perRunCeilingMicros: 1000, dailyCeilingMicros: 1_000_000 },
        clock: () => new Date("2002-03-04T09:00:00.000Z") });
      await inAccountRequest(ben.token, () => guard.assertDailyEnvelopeAdmitsNewRun());
      expect((await database.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM ledger.model_spend_reservation WHERE reserved_on='2002-03-04'")).rows[0]!.n).toBe(1);
    } finally {
      // No job of these debates is left for another case's count of the site's holds.
      if (started.length > 0) await seeded([["UPDATE core.work_item SET state='DONE' WHERE run_id = ANY($1::uuid[])", [started]]]);
      for (const pool of [request, target, decision]) await pool.end().catch(() => undefined);
    }
  }, 300_000);

  it("on the production logins (P3-01's memberships): a clarify call no reservation took names the owner it is handed on every login that may record it, whatever session that login presents, and counts in that person's windows; the request logins may not record one at all", async () => {
    const production = await logins!.production();
    const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
    const opened: Pool[] = [];
    const login = (id: "api-runtime" | "api-authorization" | "api-system" | "api-authorization-system", target?: Pool): Pool => {
      const pool = createPool(production.url(id), { max: 2, ...(target === undefined ? {} : { crossAccount: target }) });
      opened.push(pool);
      return pool;
    };
    try {
      const system = login("api-system");
      // The marker's login built as a T1 pool, so that inside a request its own connections present that request's session: no product pool of a
      // marker login does, and this is the only way the writer meets a session at all.
      const presenting = login("api-system", login("api-system"));
      const request = login("api-runtime", login("api-system"));
      const authorization = login("api-authorization", login("api-authorization-system"));
      const [runtime, authorizationAlone] = [login("api-runtime"), login("api-authorization")];
      const dee = await seedSessionAccount(database.pool, "f5-day-unreserved");
      const charge = (pool: Pool, chargeId: string, micros: number) => pool.query<{ outcome: string }>(
        "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,'ask-clarify:anthropic:claude-haiku-5-5',(clock_timestamp() AT TIME ZONE 'UTC')::date,$3,10,2) AS outcome",
        [chargeId, dee.ownerRef, micros]).then((result) => result.rows[0]!.outcome);
      const left = async (chargeId: string) => ({ ledger: await ledgerRows(chargeId), person: (await database.pool.query<{ owner_ref: string }>(
        "SELECT owner_ref FROM identity.ask_clarify_charge WHERE charge_id=$1", [chargeId])).rows[0]?.owner_ref ?? null });
      const [ownSession, othersSession, noSession] = [randomUUID(), randomUUID(), randomUUID()];
      // The marker presenting dee's own session, presenting ana's, and with no session at all: with no reservation, each names dee, the owner it is
      // handed. Before, the one presenting ana's session named no one (UNOWNED) and wrote the site's row alone.
      expect(await inAccountRequest(dee.token, () => charge(presenting, ownSession, 5))).toBe("RECORDED");
      expect(await inAccountRequest(ana.token, () => charge(presenting, othersSession, 7))).toBe("RECORDED");
      expect(await charge(system, noSession, 11)).toBe("RECORDED");
      // That connection does present ana's session: it may not reserve a call for dee, as the API's request login may not.
      expect(await refusal(() => inAccountRequest(ana.token, () => reserveAskClarifyCharge(presenting, { spendId: randomUUID(), ownerRef: dee.ownerRef }))))
        .toEqual(MISMATCH);
      // The request logins, with no session and in dee's own request: refused before anything is written, the site's row included.
      const refused: string[] = [];
      for (const [label, by] of [
        ["api-runtime with no session", (id: string) => charge(runtime, id, 13)],
        ["api-runtime in dee's request", (id: string) => inAccountRequest(dee.token, () => charge(request, id, 13))],
        ["api-authorization with no session", (id: string) => charge(authorizationAlone, id, 13)],
        ["api-authorization in dee's request", (id: string) => inAccountRequest(dee.token, () => charge(authorization, id, 13))]
      ] as const) {
        const chargeId = randomUUID();
        refused.push(chargeId);
        expect(await refusal(() => by(chargeId)), label).toEqual({ code: "42501", message: "permission denied for function record_ask_clarify_charge" });
      }
      expect(await Promise.all([ownSession, othersSession, noSession, ...refused].map(left))).toEqual([
        { ledger: 1, person: dee.ownerRef }, { ledger: 1, person: dee.ownerRef }, { ledger: 1, person: dee.ownerRef },
        ...refused.map(() => ({ ledger: 0, person: null }))]);
      // The X32 flow as main.ts wires it: reserved in dee's request on the request login, recorded through the site after the call.
      const reserved = { spendId: randomUUID(), providerRef: "ask-clarify:anthropic:claude-haiku-5-5", chargedOn: utcDay(0), chargeMicros: 17, inputTokens: 1,
        outputTokens: 1, ownerRef: dee.ownerRef, grant: null };
      await inAccountRequest(dee.token, async () => {
        await reserveAskClarifyCharge(request, reserved);
        await recordAskClarifyCharge(crossAccountPool(request, "X32"), reserved);
      });
      expect(await left(reserved.spendId)).toEqual({ ledger: 1, person: dee.ownerRef });
      // Every call recorded counts in dee's windows: her clarify total in her own request, and the spend reader every person-window cap reads.
      const from = new Date(Date.now() - 3_600_000), to = new Date(Date.now() + 3_600_000);
      expect(await inAccountRequest(dee.token, () => request.query<{ total: string }>("SELECT identity.read_ask_clarify_spent($1,$2,$3)::text AS total",
        [dee.ownerRef, from, to]).then((result) => result.rows[0]!.total))).toBe("40");
      expect(await inAccountRequest(dee.token, () => new PostgresModelSpendStore(request).readOwnerSpentMicros(dee.ownerRef, from, to))).toBe(40);
      expect(await new PostgresModelSpendStore(system).readOwnerSpentMicros(dee.ownerRef, from, to)).toBe(40);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("no definer a request login may call writes the site's day but 0107's settlement of a funded debate's admitted call, which asks the run's owner, and 0158's charge of a call before Start, named open in the census's fifth list", async () => {
    const writers = (await database.pool.query<{ signature: string }>(`SELECT p.oid::regprocedure::text AS signature FROM pg_proc AS p
      WHERE p.prosecdef AND p.prosrc ~ 'INSERT INTO ledger\\.model_spend(_hold|_reservation)?\\M'
        AND (has_function_privilege($1, p.oid, 'EXECUTE') OR has_function_privilege($2, p.oid, 'EXECUTE')) ORDER BY 1`,
    [login("DATABASE_URL"), login("AUTHORIZATION_DATABASE_URL")])).rows.map(({ signature }) => signature);
    // 0158's writer arrived with the second merge of the V4 line and is open (0165's try charge calls it, so it holds no INSERT of its own); any other writer fails.
    expect(writers).toEqual(["billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)",
      "identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)"]);
    for (const signature of writers.slice(1)) expect(Object.keys(ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED), signature).toContain(signature);
  });
});

describe("F5: the billing functions keyed by a run or an owner ask the connection in their bodies, and 0130's verifier holds", () => {
  /**
   * The billing functions a request login may call that take a run or an owner: 0140's admission of a funded debate's call and 0107's settlement of
   * it, 0092's pin of a debate to a grant, 0123's run state and person's grant and 0092's grant of a run, and 0089's list of the owners billing stops
   * for. Their grants, owners, definer flags and settings are as 0130's verifier pins them; only their bodies ask now. Left alone, as refusals (0171's
   * header): 0089's and 0091's erasure and age questions and 0092's funding basis, which answer every connection alike. A funded person here is a team
   * member the fixture's Owner configured a grant for, through staff's own guarded function, as the product does.
   */
  const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
  const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:security-review-0171-billing");
  let pools: ApiTestPools;
  let fixture: ReturnType<typeof internalFundingFixture>;
  let ana: Awaited<ReturnType<ReturnType<typeof internalFundingFixture>["fundedActor"]>>;
  let anaToken: string;
  let anaRun: string;
  let grant: NonNullable<Awaited<ReturnType<PostgresInternalAllowanceRepository["current"]>>>;
  let ben: RlsTestAccount;
  let eve: RlsTestAccount;
  let fay: RlsTestAccount;
  const refusal = async (work: () => Promise<unknown>): Promise<SqlError> => {
    const { code, message } = await sqlError(work);
    return { code, message };
  };
  const reserve = (pool: Pool, call: string, runId: string) => pool.query<{ admitted: boolean }>(
    "SELECT billing.reserve_internal_provider_call($1,$2,10,'RUN','BODY') AS admitted", [call, runId]).then((result) => result.rows[0]!.admitted);
  const settle = (pool: Pool, call: string, runId: string, chargeMicros: number) => pool.query(
    "SELECT billing.settle_internal_provider_call($1,$2,'RUN','BODY','fake-provider',$3,1,1,NULL)", [call, runId, chargeMicros]);
  /** The room's pin of a debate to a grant (EntitlementRepository.recordRunChargeScope's call), naming `owner`'s grant. */
  const pin = (pool: Pool, runId: string, owner: string) => pool.query("SELECT billing.record_internal_charge_scope($1,$2,$3,$4,clock_timestamp())",
    [runId, owner, grant.grantId, grant.grantEventId]);
  const ledgerOf = async (call: string) => (await database.pool.query<{ charge: string }>("SELECT charge_micros AS charge FROM ledger.model_spend WHERE spend_id=$1",
    [call])).rows.map(({ charge }) => Number(charge));
  const admitted = async (call: string) => Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM billing.internal_provider_admission WHERE call_id=$1",
    [call])).rows[0]!.n);
  const scopeOf = async (runId: string) => (await database.pool.query<{ grant_id: string }>("SELECT internal_grant_id AS grant_id FROM billing.run_charge_scope WHERE run_id=$1",
    [runId])).rows[0]?.grant_id ?? null;
  /** What the four funding readers hand back for `runId` and `owner` on `pool`. */
  const funding = async (pool: Pool, runId: string, owner: string) => {
    const one = async (sql: string, value: string) => (await pool.query<{ value: unknown }>(sql, [value])).rows[0]!.value;
    const grantOf = (value: unknown): unknown => (value === null ? null : (value as { grantId: unknown }).grantId);
    return {
      basis: await one("SELECT billing.read_run_funding_basis($1) AS value", runId),
      state: await one("SELECT billing.read_internal_run_state($1) AS value", runId),
      allowance: grantOf(await one("SELECT billing.read_internal_allowance($1,clock_timestamp()) AS value", owner)),
      forRun: grantOf(await one("SELECT billing.read_internal_allowance_for_run($1,clock_timestamp()) AS value", runId))
    };
  };
  const basis = () => ({ kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId });
  /** What another account's connection, or none, reads: the debate's funding basis, a refusal, as it is; the grant and the run's state as for nothing stored. */
  const nothing = () => ({ basis: basis(), state: "UNAVAILABLE", allowance: null, forRun: null });
  const served = () => ({ basis: basis(), state: "ACTIVE", allowance: grant.grantId, forRun: grant.grantId });
  const erasureOf = async (pool: Pool, owner: string) => (await pool.query<{ pending: boolean; committed: boolean; frozen: boolean }>(
    "SELECT billing.owner_erasure_pending($1) AS pending, billing.owner_erasure_committed($1) AS committed, billing.owner_age_frozen($1) AS frozen",
    [owner])).rows[0]!;
  const listed = async (pool: Pool) => (await pool.query<{ owner_ref: string }>("SELECT owner_ref::text AS owner_ref FROM billing.pending_erasure_owner_refs(NULL,1000)"))
    .rows.map(({ owner_ref }) => owner_ref);
  const none = { pending: false, committed: false, frozen: false };
  /** Eve's erasure is scheduled and her closure written; fay's account is age-frozen: what every connection reads of each. */
  const eveErasure = { pending: true, committed: true, frozen: false };
  const fayErasure = { pending: true, committed: false, frozen: true };
  /** The room's funding source, over a pool, as main.ts builds it on the API's request pool. */
  const fundingSource = (pool: Pool) => new FundingAwarePersonAllowanceSource({ allowances: new PostgresInternalAllowanceRepository(pool),
    entitlements: new EntitlementRepository(pool), plans, closeBasisPoints: 9500 });
  /** A connection that is not ana's: another account's live session, an anonymous request, and the request login with no session at all. */
  const strangers = (): ReadonlyArray<readonly [string, <T>(work: () => Promise<T>) => Promise<T>, Pool]> => [
    ["ben's session", (work) => inAccountRequest(ben.token, work), pools.runtime],
    ["an anonymous request", (work) => inAccountRequest(null, work), pools.runtime],
    ["no session (a pool with no system target sends none)", (work) => work(), apiRequest]
  ];

  beforeAll(async () => {
    pools = logins!.apiPools();
    fixture = internalFundingFixture(database.pool, apiSystem);
    ana = await fixture.fundedActor();
    await fixture.configure(ana, fixture.configureCommand(ana));
    grant = (await new PostgresInternalAllowanceRepository(database.pool).current(ana.ownerRef, new Date()))!;
    anaToken = await seedLiveSession(database.pool, ana.userId);
    anaRun = await fixture.run(ana.ownerRef);
    // The room pins a funded debate to its grant on its decision pool, the API's system login (main.ts's roomDecisionPool).
    const tx = await pools.roomDecision.connect();
    try {
      await new EntitlementRepository(pools.roomDecision).recordRunChargeScope(tx, { runId: anaRun, ownerRef: ana.ownerRef,
        basis: { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId }, admittedAt: new Date() });
    } finally { tx.release(); }
    ben = await seedSessionAccount(database.pool, "f5-billing-ben");
    // Eve's erasure is scheduled and her closure written; fay's account is age-frozen. Both still hold a plan, so the billing sweep lists them.
    eve = await seedSessionAccount(database.pool, "f5-billing-eve");
    fay = await seedSessionAccount(database.pool, "f5-billing-fay");
    const plan = (owner: string): readonly [string, readonly unknown[]] => [`INSERT INTO billing.subscription_event (event_id,subscription_id,owner_ref,kind,at,plan_id,period_anchor_at)
      VALUES ($1,$2,$3,'ACTIVATED',now(),'PLUS',now())`, [randomUUID(), randomUUID(), owner]];
    await seeded([
      ["INSERT INTO identity.account_erasure_request (user_id,requested_at,execute_at) VALUES ($1,clock_timestamp(),clock_timestamp()+interval '30 days')", [eve.userId]],
      ["INSERT INTO legal.account_closure (owner_ref,closed_at) VALUES ($1,clock_timestamp())", [eve.ownerRef]],
      [`UPDATE identity."user" SET state='age_frozen' WHERE user_id=$1`, [fay.userId]],
      plan(eve.ownerRef), plan(fay.ownerRef)]);
  }, 300_000);

  it("another account's session, or none, can neither admit nor settle a call on a debate's grant, nor pin a debate to another's grant; the runner can", async () => {
    // The runner admits a call of ana's funded debate on its own login (the marker, no session), as its provider gateway does.
    const call = randomUUID();
    expect(await reserve(runner, call, anaRun)).toBe(true);
    for (const [label, within, pool] of strangers()) {
      const own = randomUUID();
      await within(async () => {
        // A settlement of the call at any amount, a call of its own on her grant, and its own debate pinned to her grant: each refused before anything.
        expect(await refusal(() => settle(pool, call, anaRun, 9_007_199_254_740_991)), label).toEqual(MISMATCH);
        expect(await refusal(() => reserve(pool, own, anaRun)), label).toEqual(MISMATCH);
        expect(await refusal(() => pin(pool, ben.runId, ana.ownerRef)), label).toEqual(MISMATCH);
      });
      // Read back after the request: the superuser's pool is refused inside one.
      expect(await admitted(own), label).toBe(0);
    }
    expect(await ledgerOf(call)).toEqual([]);
    expect(await scopeOf(ben.runId)).toBeNull();
    // The runner settles the call it admitted, at the provider's charge.
    await settle(runner, call, anaRun, 7);
    expect(await ledgerOf(call)).toEqual([7]);
  });

  it("the owner's own connection passes the run's question; a pin is the system login's alone, as the room makes it, never a request's, its owner's included", async () => {
    // No product code admits or settles in a request (only the runner does), but the rule is the debate's owner's: her own request may.
    const call = randomUUID();
    await inAccountRequest(anaToken, async () => {
      expect(await reserve(pools.runtime, call, anaRun)).toBe(true);
      await settle(pools.runtime, call, anaRun, 5);
    });
    expect(await ledgerOf(call)).toEqual([5]);
    // The room pins on its decision pool, the API's system login; her own request may not pin her own debate.
    const second = await fixture.run(ana.ownerRef);
    expect(await refusal(() => inAccountRequest(anaToken, () => pin(pools.runtime, second, ana.ownerRef)))).toEqual(MISMATCH);
    expect(await scopeOf(second)).toBeNull();
    await pin(pools.roomDecision, second, ana.ownerRef);
    expect(await scopeOf(second)).toBe(grant.grantId);
  });

  it("a person's grant and a run's state answer as for nothing stored to another account's connection, or none, and a debate's funding basis, a refusal, answers every connection alike; the owner and the system logins read them all", async () => {
    for (const [label, within, pool] of strangers()) {
      expect(await within(() => funding(pool, anaRun, ana.ownerRef)), label).toEqual(nothing());
      // The basis it reads names the debate's grant, so the runner's funding admission asks for that grant, and refuses it here (the grant's
      // reader answers nothing): a stranger's admission is refused, never let through as a legacy debate's, which has no basis.
      await expect(within(() => fundingSource(pool).assertProviderFundingAdmission(anaRun, new Date())), label)
        .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    }
    expect(await inAccountRequest(anaToken, () => funding(pools.runtime, anaRun, ana.ownerRef))).toEqual(served());
    // The runner's funding admission and the room's waker read with no session, on logins that hold the marker.
    expect(await funding(runner, anaRun, ana.ownerRef)).toEqual(served());
    expect(await funding(apiSystem, anaRun, ana.ownerRef)).toEqual(served());
    // In the owner's request, the room's funding source reads her debate's windows on the request's own connection, and admits it.
    await inAccountRequest(anaToken, async () => {
      const source = fundingSource(pools.runtime);
      const windows = await source.read(ana.ownerRef, new Date(), { runId: anaRun });
      expect(windows.map(({ scope, funding: basis }) => [scope, basis])).toEqual(["PERSON_DAY", "PERSON_WEEK", "PERSON_GRANT"]
        .map((scope) => [scope, { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId }]));
      await source.assertProviderFundingAdmission(anaRun, new Date());
    });
    // The site line reads every waiting debate's run state on the system login (its X22 frame), whoever's request it is in.
    expect(await inAccountRequest(ben.token, () => crossAccount("X22", () => pools.runtime.query<{ value: string }>(
      "SELECT billing.read_internal_run_state($1) AS value", [anaRun]).then((result) => result.rows[0]!.value)))).toBe("ACTIVE");
  });

  it("whether an owner's erasure is pending or committed, or its account age-frozen, a refusal, answers every connection alike, and the list of those billing stops for holds only the connection's own", async () => {
    // True refuses (a quote, a checkout, a card change, every renewal and retry) or ends the plan, so no connection reads it false: another
    // account's session, an anonymous request and the request login with no session read eve's and fay's as they are, and so does the system login.
    for (const [label, within, pool] of strangers()) {
      await within(async () => {
        expect(await erasureOf(pool, eve.ownerRef), label).toEqual(eveErasure);
        expect(await erasureOf(pool, fay.ownerRef), label).toEqual(fayErasure);
        expect(await listed(pool), label).toEqual([]);
      });
    }
    expect([await erasureOf(apiSystem, eve.ownerRef), await erasureOf(apiSystem, fay.ownerRef)]).toEqual([eveErasure, fayErasure]);
    // Each owner's own request answers its own and the other's alike, and lists itself alone.
    await inAccountRequest(eve.token, async () => {
      expect(await erasureOf(pools.runtime, eve.ownerRef)).toEqual(eveErasure);
      expect(await erasureOf(pools.runtime, fay.ownerRef)).toEqual(fayErasure);
      expect(await listed(pools.runtime)).toEqual([eve.ownerRef]);
    });
    await inAccountRequest(fay.token, async () => {
      expect(await erasureOf(pools.runtime, fay.ownerRef)).toEqual(fayErasure);
      expect(await listed(pools.runtime)).toEqual([fay.ownerRef]);
    });
    // The billing routes and sweeps ask through their site (X11), the API's system login, even inside another's request.
    await inAccountRequest(ben.token, async () => {
      const billing = new BillingRepository(crossAccountPool(pools.runtime, "X11"));
      expect(await billing.ownerErasurePending(eve.ownerRef)).toBe(true);
      expect(await billing.ownerErasureCommitted(eve.ownerRef)).toBe(true);
      expect(await billing.ownerAgeFrozen(fay.ownerRef)).toBe(true);
      expect(await billing.pendingErasureOwnerRefs(null, 1000)).toEqual(expect.arrayContaining([eve.ownerRef, fay.ownerRef]));
    });
  });

  it("on the production logins (P3-01's memberships): the owner's request reads its funding, another's reads nothing and writes nothing; the runner admits and settles; the system login pins and answers the sweeps", async () => {
    const production = await logins!.production();
    const target = createPool(production.url("api-system"), { max: 2 });
    const request = createPool(production.url("api-runtime"), { max: 2, crossAccount: target });
    const productionRunner = createPool(production.url("runner-runtime"), { max: 2 });
    try {
      await inAccountRequest(anaToken, async () => {
        expect(await funding(request, anaRun, ana.ownerRef)).toEqual(served());
        expect((await fundingSource(request).read(ana.ownerRef, new Date(), { runId: anaRun })).map(({ scope }) => scope))
          .toEqual(["PERSON_DAY", "PERSON_WEEK", "PERSON_GRANT"]);
      });
      const call = randomUUID();
      expect(await reserve(productionRunner, call, anaRun)).toBe(true);
      await inAccountRequest(ben.token, async () => {
        expect(await funding(request, anaRun, ana.ownerRef)).toEqual(nothing());
        expect(await erasureOf(request, eve.ownerRef)).toEqual(eveErasure);
        expect(await listed(request)).toEqual([]);
        expect(await refusal(() => settle(request, call, anaRun, 9_007_199_254_740_991))).toEqual(MISMATCH);
        expect(await refusal(() => reserve(request, randomUUID(), anaRun))).toEqual(MISMATCH);
        expect(await refusal(() => pin(request, ben.runId, ana.ownerRef))).toEqual(MISMATCH);
        // The billing sweeps' site (X11) and the site line's frame (X22) are the system login's inside a request too.
        expect(await erasureOf(crossAccountPool(request, "X11"), eve.ownerRef)).toEqual({ pending: true, committed: true, frozen: false });
        expect(await listed(crossAccountPool(request, "X11"))).toEqual(expect.arrayContaining([eve.ownerRef, fay.ownerRef]));
        expect(await crossAccount("X22", () => request.query<{ value: string }>("SELECT billing.read_internal_run_state($1) AS value", [anaRun])
          .then((result) => result.rows[0]!.value))).toBe("ACTIVE");
      });
      await settle(productionRunner, call, anaRun, 3);
      expect(await ledgerOf(call)).toEqual([3]);
      expect(await scopeOf(ben.runId)).toBeNull();
      // The room's pin, on the API's system login.
      const third = await fixture.run(ana.ownerRef);
      await pin(target, third, ana.ownerRef);
      expect(await scopeOf(third)).toBe(grant.grantId);
    } finally { for (const pool of [request, target, productionRunner]) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("on the production logins (P3-01's memberships): an erased or age-frozen owner, and a funded debate's basis, read as they are to the owner's session, another's, the request login with no session and the system login; the renewal guard, card custody's question and the erasure stop and sweep, wired on billing's site (X11), refuse and end the plan", async () => {
    const production = await logins!.production();
    const target = createPool(production.url("api-system"), { max: 3 });
    const request = createPool(production.url("api-runtime"), { max: 2, crossAccount: target });
    const bare = createPool(production.url("api-runtime"), { max: 2 });
    const productionRunner = createPool(production.url("runner-runtime"), { max: 2 });
    try {
      // gil's account is age-frozen and hal's erasure committed (its closure written); each still holds a paid plan, as a NETOPIA checkout leaves it.
      const gil = await seedSessionAccount(database.pool, "f5-billing-gil"), hal = await seedSessionAccount(database.pool, "f5-billing-hal");
      const plans = new Map<string, string>();
      for (const owner of [gil, hal]) {
        plans.set(owner.ownerRef, (await seedNetopiaSubscription(database.pool, { ownerRef: owner.ownerRef, planId: "PLUS",
          activatedAt: new Date(Date.now() - 3 * 86_400_000), taxCountry: "RO" })).subscriptionId);
      }
      await seeded([[`UPDATE identity."user" SET state='age_frozen' WHERE user_id=$1`, [gil.userId]],
        ["INSERT INTO legal.account_closure (owner_ref,closed_at) VALUES ($1,clock_timestamp())", [hal.ownerRef]]]);
      const gilErasure = { pending: true, committed: false, frozen: true }, halErasure = { pending: true, committed: true, frozen: false };
      const readBy: ReadonlyArray<readonly [string, <T>(read: (pool: Pool) => Promise<T>) => Promise<T>]> = [
        ["gil's own session", (read) => inAccountRequest(gil.token, () => read(request))],
        ["hal's own session", (read) => inAccountRequest(hal.token, () => read(request))],
        ["ben's session", (read) => inAccountRequest(ben.token, () => read(request))],
        ["api-runtime with no session", (read) => read(bare)],
        ["the system login with no session", (read) => read(target)]
      ];
      for (const [label, by] of readBy) {
        expect(await by((pool) => erasureOf(pool, gil.ownerRef)), label).toEqual(gilErasure);
        expect(await by((pool) => erasureOf(pool, hal.ownerRef)), label).toEqual(halErasure);
        expect(await by((pool) => pool.query<{ value: unknown }>("SELECT billing.read_run_funding_basis($1) AS value", [anaRun]).then((result) => result.rows[0]!.value)), label)
          .toEqual(basis());
      }
      // The runner's funding admission of ana's funded debate, on its own login, still admits it; another's request is refused it.
      await fundingSource(productionRunner).assertProviderFundingAdmission(anaRun, new Date());
      await expect(inAccountRequest(ben.token, () => fundingSource(request).assertProviderFundingAdmission(anaRun, new Date())))
        .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
      // Billing's routes and sweeps, wired as main.ts wires them (BillingRepository on crossAccountPool(pool, "X11")), inside another account's request.
      const audit = recordingAudit();
      await inAccountRequest(ben.token, async () => {
        const site = crossAccountPool(request, "X11");
        const billing = new BillingRepository(site);
        // P11a's renewal guard (every rebill, resubmission and dunning retry asks it) and card custody's question (ERASURE revokes the saved cards).
        expect(await erasurePendingOf(billing)(gil.ownerRef)).toBe(true);
        expect(await erasurePendingOf(billing)(hal.ownerRef)).toBe(true);
        expect(await billing.ownerErasureCommitted(hal.ownerRef)).toBe(true);
        const hook = new BillingErasureHook({ billing, jobs: new BillingJobQueries(site), entitlements: new EntitlementRepository(site), audit, clock: () => new Date() });
        // The stop, each owner the erasure sweep pages through goes through it: both plans end (ERASURE_STOPPED and FREE), the frozen one
        // marked so, and a second stop finds nothing left.
        expect(await hook.stop(gil.ownerRef)).toBe("STOPPED");
        expect(await hook.stop(hal.ownerRef)).toBe("STOPPED");
        expect(await hook.stop(gil.ownerRef)).toBe("NOTHING");
      });
      const stopped = async (owner: RlsTestAccount) => (await new BillingRepository(database.pool).subscriptionEvents(plans.get(owner.ownerRef)!))
        .filter(({ kind }) => kind === "ERASURE_STOPPED").map(({ data }) => data);
      expect(await stopped(gil)).toEqual([{ stopped_for: "AGE_FROZEN" }]);
      expect(await stopped(hal)).toEqual([{}]);
      for (const owner of [gil, hal]) {
        expect((await new EntitlementRepository(database.pool).current(owner.ownerRef, new Date()))?.planId, owner.ownerRef).toBe("FREE");
      }
      expect(audit.events.map(({ event }) => event).sort()).toEqual(["billing.age_frozen.stopped", "billing.erasure.stopped"]);
    } finally { for (const pool of [request, target, bare, productionRunner]) await pool.end().catch(() => undefined); }
  }, 300_000);

  /**
   * 0093's two totals of a grant are left alone (0171's header): a request must name a member's owner, grant and configured event to read one. The
   * funding basis, a refusal also left alone, hands any connection a funded debate's grant and configured event by its run id (a published debate's
   * run id can be read), so only the member's owner ref stands between a request and the member's totals. No definer either request login may
   * call hands back an owner ref for the ids a request can read (a published debate's run id and link, the grant and event its basis names, and the
   * connection's own owner ref, each in every argument that can hold it), and no row of any relation either request login may read holds one. The
   * exception, since 0159, is its claim of a carry-on due and its list of those begun, in the census's fifth list: each takes only a limit and hands
   * any request login the owner ref of any account with a carry-on due or begun, so those members' totals are open until the step that hardens them.
   * The sweep sees that as soon as such a carry-on exists, so it runs once with none and once with one of each.
   */
  it("on the production logins (P3-01's memberships): a funded debate's basis hands any request its grant and configured event by run id, so only the member's owner ref, which no relation holds for a request and no definer hands one but 0159's two carry-on definers (for an account with a carry-on due or begun, whose totals are open), stands between it and the member's grant totals", async () => {
    const production = await logins!.production();
    const opened: Pool[] = [];
    const open = (id: Parameters<typeof production.url>[0], target?: Pool): Pool => {
      const pool = createPool(production.url(id), target === undefined ? { max: 2 } : { max: 2, crossAccount: target });
      opened.push(pool);
      return pool;
    };
    const names = [production.url("api-runtime"), production.url("api-authorization")].map((url) => decodeURIComponent(new URL(url).username));
    const as = <T>(token: string | null, work: () => Promise<T>): Promise<T> => (token === null ? work() : inAccountRequest(token, work));
    const carriedOn: string[] = [];
    try {
      // A published debate of ana's, pinned to her grant as the room pins it, with a call the runner admitted and settled on it.
      const published = await fixture.run(ana.ownerRef);
      await pin(pools.roomDecision, published, ana.ownerRef);
      const link = await publish(published);
      const productionRunner = open("runner-runtime");
      const call = randomUUID();
      expect(await reserve(productionRunner, call, published)).toBe(true);
      await settle(productionRunner, call, published, 11);
      const totals = async (pool: Pool, owner: string) => (await pool.query<{ spent: string; committed: string }>(`SELECT
          billing.read_internal_grant_spent($1,$2,$3,'-infinity','infinity',true)::text AS spent, billing.read_internal_grant_commitments($1,$2,$3,NULL)::text AS committed`,
        [owner, grant.grantId, grant.grantEventId])).rows[0]!;
      const hers = await totals(database.pool, ana.ownerRef);
      expect(Number(hers.spent)).toBeGreaterThanOrEqual(11);
      // The connections that are not ana's: ben's session on either request login (each pool built as main.ts builds it), and either with no session.
      const strangers: ReadonlyArray<readonly [string, Pool, string | null, string]> = [
        ["ben's session on api-runtime", open("api-runtime", open("api-system")), ben.token, names[0]!],
        ["ben's session on api-authorization", open("api-authorization", open("api-authorization-system")), ben.token, names[1]!],
        ["api-runtime with no session", open("api-runtime"), null, names[0]!],
        ["api-authorization with no session", open("api-authorization"), null, names[1]!]
      ];
      for (const [label, pool, token] of strangers) {
        await as(token, async () => {
          // The basis names the grant and its configured event, as it does to every connection.
          expect((await pool.query<{ value: unknown }>("SELECT billing.read_run_funding_basis($1) AS value", [published])).rows[0]!.value, label).toEqual(basis());
          // With them, her totals need her owner ref alone (still open, as 0171's header says): any other owner reads nothing.
          expect(await totals(pool, ana.ownerRef), label).toEqual(hers);
          expect(await totals(pool, ben.ownerRef), label).toEqual({ spent: "0", committed: "0" });
          expect(await totals(pool, randomUUID()), label).toEqual({ spent: "0", committed: "0" });
        });
      }
      // Every definer either request login may call, as the census below counts them.
      const definers = (await database.pool.query<{ oid: string; signature: string }>(`
        SELECT p.oid::text AS oid, p.oid::regprocedure::text AS signature
        FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND (has_function_privilege($1, p.oid, 'EXECUTE') OR has_function_privilege($2, p.oid, 'EXECUTE')) ORDER BY 1`, names)).rows;
      expect(definers.map(({ signature }) => signature)).toEqual(expect.arrayContaining(["billing.read_run_funding_basis(uuid)",
        "billing.read_internal_allowance_for_run(uuid,timestamp with time zone)", "billing.read_internal_grant_spent(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)"]));
      /**
       * The definers whose answer on `pool` names ana's owner ref, each called on the connection itself, once an audit attempt is begun (as the API
       * begins one for each audited call), with each id a request can read in every argument that can hold one, and in all of them at once, the other
       * id arguments given `own` or a fresh id and every other argument a plain value of its type. The calls run in one block whose handler takes each
       * refusal, so none reaches the server's log, in a transaction rolled back at the end, so nothing any call writes stays.
       */
      const sweep = (pool: Pool, token: string | null, own: string): Promise<string[]> => as(token, async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL statement_timeout = '240s'");
          // The connection presents the session it was handed, or none.
          expect((await client.query<{ owner: string | null }>("SELECT rls.context_owner_ref()::text AS owner")).rows[0]!.owner).toBe(token === null ? null : own);
          await client.query(`SELECT set_config('review.sweep_functions', $1, true), set_config('review.sweep_known', $2, true),
              set_config('review.sweep_own', $3, true), set_config('review.sweep_needle', $4, true)`,
          [definers.map(({ oid }) => oid).join(","), [published, link, grant.grantId, grant.grantEventId, own].join(","), own, ana.ownerRef.toLowerCase()]);
          await client.query(`DO $sweep$
            DECLARE
              v_holding constant text[] := ARRAY['uuid','text','uuid[]','text[]'];
              v_known constant text[] := pg_catalog.string_to_array(pg_catalog.current_setting('review.sweep_known'), ',');
              v_own constant text := pg_catalog.current_setting('review.sweep_own');
              v_needle constant text := pg_catalog.current_setting('review.sweep_needle');
              v_leaks text[] := '{}';
              v_fn record; v_value text; v_at integer; v_index integer; v_type text; v_pick text; v_ids integer; v_args text[]; v_sql text; v_answer text;
            BEGIN
              BEGIN PERFORM identity.begin_runtime_audit_attempt(); EXCEPTION WHEN OTHERS THEN NULL; END;
              FOR v_fn IN SELECT p.oid::regprocedure::text AS signature, pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(p.proname) AS call,
                  ARRAY(SELECT a.type::regtype::text FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(type, at) ORDER BY a.at) AS types, p.proretset AS retset
                FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
                WHERE p.oid = ANY (pg_catalog.string_to_array(pg_catalog.current_setting('review.sweep_functions'), ',')::oid[]) ORDER BY 1 LOOP
                v_ids := (SELECT count(*) FROM pg_catalog.unnest(v_fn.types) AS type WHERE type = ANY (v_holding));
                FOREACH v_value IN ARRAY CASE WHEN v_ids = 0 THEN v_known[1:1] ELSE v_known END LOOP
                  FOR v_at IN -1 .. COALESCE(pg_catalog.array_length(v_fn.types, 1), 0) - 1 LOOP
                    CONTINUE WHEN v_at >= 0 AND NOT (v_fn.types[v_at + 1] = ANY (v_holding));
                    CONTINUE WHEN v_at < 0 AND v_ids = 1;
                    v_args := '{}';
                    FOR v_index IN 1 .. COALESCE(pg_catalog.array_length(v_fn.types, 1), 0) LOOP
                      v_type := v_fn.types[v_index];
                      v_pick := CASE WHEN NOT (v_type = ANY (v_holding)) THEN NULL WHEN v_at < 0 OR v_index = v_at + 1 THEN v_value
                        WHEN v_type LIKE 'uuid%' THEN v_own ELSE pg_catalog.gen_random_uuid()::text END;
                      v_args := v_args || CASE WHEN v_pick IS NULL THEN CASE v_type WHEN 'timestamp with time zone' THEN 'pg_catalog.clock_timestamp()'
                          WHEN 'integer' THEN '10' WHEN 'bigint' THEN '10' WHEN 'smallint' THEN '10::smallint' WHEN 'boolean' THEN 'true'
                          WHEN 'jsonb' THEN '''{}''::jsonb' WHEN 'numeric' THEN '1' WHEN 'bytea' THEN 'pg_catalog.decode(''00'', ''hex'')'
                          WHEN 'date' THEN 'CURRENT_DATE' ELSE pg_catalog.format('NULL::%s', v_type) END
                        WHEN v_type LIKE '%[]' THEN pg_catalog.format('ARRAY[%L]::%s', v_pick, v_type) ELSE pg_catalog.format('%L::%s', v_pick, v_type) END;
                    END LOOP;
                    v_sql := CASE WHEN v_fn.retset
                      THEN pg_catalog.format('SELECT COALESCE(pg_catalog.json_agg(answer)::text, '''') FROM %s(%s) AS answer', v_fn.call, pg_catalog.array_to_string(v_args, ','))
                      ELSE pg_catalog.format('SELECT %s(%s)::text', v_fn.call, pg_catalog.array_to_string(v_args, ',')) END;
                    BEGIN
                      EXECUTE v_sql INTO v_answer;
                      IF pg_catalog.strpos(pg_catalog.lower(COALESCE(v_answer, '')), v_needle) > 0 AND NOT (v_fn.signature = ANY (v_leaks)) THEN
                        v_leaks := v_leaks || v_fn.signature;
                      END IF;
                    EXCEPTION WHEN OTHERS THEN NULL;
                    END;
                  END LOOP;
                END LOOP;
              END LOOP;
              PERFORM pg_catalog.set_config('review.sweep_leaks', pg_catalog.array_to_string(v_leaks, ';'), true);
            END
          $sweep$`);
          const leaks = (await client.query<{ leaks: string }>("SELECT current_setting('review.sweep_leaks') AS leaks")).rows[0]!.leaks;
          return leaks === "" ? [] : leaks.split(";").sort();
        } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
      });
      for (const [label, pool, token] of strangers) expect(await sweep(pool, token, ben.ownerRef), label).toEqual([]);
      // The sweep sees an owner ref where one is handed back: the system login, which holds the marker, reads her grant by the debate's run id.
      expect(await sweep(open("api-system"), null, ben.ownerRef)).toContain("billing.read_internal_allowance_for_run(uuid,timestamp with time zone)");
      // Since 0159 two definers do hand one over, for an account with a carry-on due or begun: the fixture has none, so one of each is seeded on her debates,
      // past the sealed set's trigger, each with the binding Start writes. The sweep rolls back, so its claim takes nothing, and the rows go again at the end.
      const due = await fixture.run(ana.ownerRef);
      carriedOn.push(published, due);
      await seeded(carriedOn.flatMap((runId) => [
        ["INSERT INTO core.start_path_set (run_id,source,width,path_count,chosen_by,carry_on_to_report,content_ciphertext,content_attestation) VALUES ($1,'MENU',1,1,'PERSON',true,'{}'::jsonb,$2)", [runId, ATTESTATION]],
        ["INSERT INTO identity.run_execution_binding (execution_ref,user_id,identity_session_id,run_id,created_at) VALUES ($1,$2,$3,$4,clock_timestamp())", [randomUUID(), ana.userId, randomUUID(), runId]],
        ["INSERT INTO core.carry_on_mark (run_id,mark) VALUES ($1,'DUE')", [runId]]] as const));
      await seeded([["INSERT INTO core.carry_on_mark (run_id,mark) VALUES ($1,'BEGUN')", [published]]]);
      for (const [label, pool, token] of strangers) {
        expect(await sweep(pool, token, ben.ownerRef), label).toEqual(["core.claim_carry_on_due(integer)", "core.read_carry_on_begun(integer)"]);
        // And that owner ref is all the totals needed: the begun list names her, and with it this connection reads what she spent.
        await as(token, async () => {
          const begun = (await pool.query<{ value: ReadonlyArray<{ run_id: string; owner_ref: string }> }>("SELECT core.read_carry_on_begun(50) AS value")).rows[0]!.value;
          expect(begun.map(({ run_id: runId, owner_ref: owner }) => [runId, owner]), label).toEqual([[published, ana.ownerRef]]);
          expect(await totals(pool, begun[0]!.owner_ref), label).toEqual(hers);
        });
      }
      // And no row of a relation either request login may read, through the columns it may read, holds her owner ref: 0130's row rule keeps every
      // row that names an owner (her debates' ownership events and charge scopes among them) to the connection's own.
      const relations = (await database.pool.query<{ relation: string; columns: string[] }>(`
        SELECT c.oid::regclass::text AS relation, array_agg(DISTINCT quote_ident(a.attname)) AS columns
        FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND (has_column_privilege($1, c.oid, a.attnum, 'SELECT') OR has_column_privilege($2, c.oid, a.attnum, 'SELECT'))
        GROUP BY 1 ORDER BY 1`, names)).rows;
      expect(relations.map(({ relation }) => relation)).toEqual(expect.arrayContaining(["core.run_ownership_event", "billing.run_charge_scope"]));
      /** The relations whose rows, read on `pool` through the columns `name` may read, hold ana's owner ref. */
      const holding = async (pool: Pool, token: string | null, name: string): Promise<string[]> => {
        // The columns `name` may read come first, outside the request: the superuser's pool is refused inside one.
        const readableOf = new Map<string, string[]>();
        for (const { relation, columns } of relations) {
          readableOf.set(relation, (await database.pool.query<{ column: string }>(`SELECT quote_ident(a.attname) AS column FROM pg_attribute AS a
            WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND has_column_privilege($2, a.attrelid, a.attnum, 'SELECT')`,
          [relation, name])).rows.map(({ column }) => column).filter((column) => columns.includes(column)));
        }
        return as(token, async () => {
        const found: string[] = [];
        for (const { relation } of relations) {
          const readable = readableOf.get(relation)!;
          if (readable.length === 0) continue;
          const rows = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${relation} AS t
            WHERE concat_ws(' ', ${readable.map((column) => `t.${column}::text`).join(",")}) ILIKE $1`, [`%${ana.ownerRef}%`]);
          if (rows.rows[0]!.n !== "0") found.push(relation);
        }
        return found;
        });
      };
      for (const [label, pool, token, name] of strangers) expect(await holding(pool, token, name), label).toEqual([]);
      // The scan sees an owner ref where a row holds one: the system login reads every account's ownership events and charge scopes.
      expect(await holding(open("api-system"), null, names[0]!)).toEqual(expect.arrayContaining(["core.run_ownership_event", "billing.run_charge_scope"]));
    } finally {
      if (carriedOn.length > 0) {
        await seeded(["core.carry_on_mark", "core.start_path_set", "identity.run_execution_binding"].map((table) => [`DELETE FROM ${table} WHERE run_id = ANY($1::uuid[])`, [carriedOn]] as const));
      }
      for (const pool of opened) await pool.end().catch(() => undefined);
    }
  }, 300_000);

  it("0130's effective-capability verifier, which pins every billing function's grants, owner, definer flag and settings, still passes on the patched database", async () => {
    await database.pool.query(readFileSync(new URL("../../migrations/lineage/verify-effective-capabilities-130.sql", import.meta.url), "utf8"));
    // And each of the seven asks in its body: the run's or the owner's question, or (the pin) the marker's; the four refusals left alone ask nothing.
    const bodies = (await database.pool.query<{ signature: string; source: string }>(`SELECT p.oid::regprocedure::text AS signature, p.prosrc AS source
      FROM pg_proc AS p WHERE p.pronamespace = 'billing'::regnamespace AND p.proname = ANY($1::text[]) AND has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
      ORDER BY 1`, [["reserve_internal_provider_call", "settle_internal_provider_call", "record_internal_charge_scope", "read_run_funding_basis", "read_internal_run_state",
      "read_internal_allowance", "read_internal_allowance_for_run", "owner_erasure_pending", "owner_erasure_committed", "owner_age_frozen", "pending_erasure_owner_refs"]])).rows;
    expect(bodies.map(({ signature }) => signature)).toHaveLength(11);
    const refusals = ["billing.owner_age_frozen(uuid)", "billing.owner_erasure_committed(uuid)", "billing.owner_erasure_pending(uuid)", "billing.read_run_funding_basis(uuid)"];
    expect(bodies.map(({ signature }) => signature)).toEqual(expect.arrayContaining(refusals));
    for (const { signature, source } of bodies) {
      if (refusals.includes(signature)) expect(source, signature).not.toMatch(/identity\.request_owner_matches\(|debateai_rls_all_accounts/u);
      else expect(source, signature).toMatch(signature.startsWith("billing.record_internal_charge_scope(")
        ? /pg_catalog\.pg_has_role\(session_user, 'debateai_rls_all_accounts', 'MEMBER'\)/u : /identity\.request_owner_matches\(/u);
    }
  });
});

describe("F5: a debate's own readers, its public copies, its flags and the owner-taking functions older than 0131 ask the connection too", () => {
  /** The run-keyed readers the API's answer read calls on its request login, each with the run argument it reads. */
  const RUN_READERS = ["read_web_evidence", "read_investigation_of_run", "read_path_rewrites_of_run", "read_web_plan", "read_dig_picks_of_run",
    "read_investigation_reports_of_run", "read_path_line_of_run", "read_main_answer_updates_of_run", "read_run_purpose_lines_of_run",
    "read_web_shown_quotes", "read_path_suggestions_of_run"] as const;
  /**
   * The census (D3 stage 6): EVERY SECURITY DEFINER function either request login (the production shapes api-runtime and
   * api-authorization, measured below) may EXECUTE, each in exactly one of five named lists, so a new, a removed or a newly
   * reachable definer fails. ASKS asks what the database sees for this connection (0171's identity.request_owner_matches or
   * 0131's page_memory_run_owned, 0130's rls context, a staff privilege token through staff.require_http_authority, the
   * login's cross-account marker, or 0040's lock of a request's own runs, which asks 0171's question of the owner it is handed:
   * 0155's two owner writes have no other ownership gate, and their legacy branch, like the lock's, names no owner). GATED is gated by a secret, a token, a proof or its own transaction it is handed, never by
   * the connection. PUBLIC hands back only public or site-wide state, no account's private content. LEFT_ALONE maps each one
   * left alone on purpose to its reason, the set the 0171 header names by its classes (what it leaves alone by name, the sign-in
   * flows' prunes of dead rows, the audit attempt and the refusal audits, the pending-account creators, the phone question, the
   * threat reports' hold and 0152's record of the site; 0048's probe writer moved to the marker and left the census), so a new
   * one needs a reason of its own. staff.authorize_action is not a connection check (it consumes a WebAuthn action proof), so a
   * function gated only by it is GATED, not ASKS (D4b). The fifth list, ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED (above the first
   * describe), names what the two merges of feat/2026-10-28-v4-initial brought and none of these four truly holds, sixty in all (seventeen
   * of 0156, 0157 and 0170, forty-three of 0158 to 0169), with what a request login can do with each: open, not hardened here. It asks
   * nothing of the connection, and one that starts to must move to ASKS. Ten of them are 0169's twins of writers this step moved to the
   * marker: the marker keeps the older writer, and a request login can still reach the same write through its twin (each reason says so).
   */
  const ASKS = /identity\.(?:request_owner_matches|page_memory_run_owned)\(|rls\.(?:context_owner_ref|context_user_id|session_credential_hash)\(|staff\.require_http_authority\(|pg_catalog\.pg_has_role\(session_user, 'debateai_rls_all_accounts', 'MEMBER'\)|core\.lock_owned_live_runs\(/u;
  const ASKS_CONNECTION = [
    "billing.pending_erasure_owner_refs(uuid,integer)", "billing.read_internal_allowance(uuid,timestamp with time zone)",
    "billing.read_internal_allowance_for_run(uuid,timestamp with time zone)", "billing.read_internal_run_state(uuid)",
    "billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamp with time zone)",
    "billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)",
    "billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)", "core.list_unstarted_readmissions(uuid)",
    "core.lock_owned_live_runs(uuid[],uuid,text)", "core.record_owned_investigation_request(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,bytea)",
    "identity.close_investigation_keeping_texts(uuid,uuid)",
    "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamp with time zone,jsonb)",
    "identity.continue_paused_run_in_release(uuid,uuid,text,bigint)", "identity.join_investigation_nested(uuid,uuid,uuid,text[],text)",
    "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.open_investigation(uuid,uuid)",
    "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)", "identity.open_public_report(uuid,uuid,uuid,boolean)",
    "identity.read_age_check_outcome(uuid)", "identity.read_ask_clarify_spent(uuid,timestamp with time zone,timestamp with time zone)",
    "identity.read_data_export_status(uuid)", "identity.read_debate_last_visit(uuid,uuid)", "identity.read_dig_level(uuid,uuid)",
    "identity.read_dig_links(uuid,uuid)", "identity.read_dig_picks_of_run(uuid)", "identity.read_email_settings(uuid,uuid)",
    "identity.read_investigation_of_run(uuid)", "identity.read_investigation_reports(uuid,uuid)", "identity.read_investigation_reports_of_run(uuid)",
    "identity.read_main_answer_updates_of_run(uuid)", "identity.read_own_public_contributions(uuid,uuid)", "identity.read_page_reading_level(uuid)",
    "identity.read_path_line_of_run(uuid)", "identity.read_path_rewrites_of_run(uuid)", "identity.read_path_suggestions_of_run(uuid)",
    "identity.read_public_path_line(uuid)", "identity.read_public_report_spent_by_funding(uuid,timestamp with time zone,timestamp with time zone,boolean)",
    "identity.read_run_is_dig(uuid,uuid)", "identity.read_run_pause(uuid,uuid)", "identity.read_run_purpose_lines(uuid,uuid)",
    "identity.read_run_purpose_lines_of_run(uuid)", "identity.read_sensitive_data_consent(uuid)", "identity.read_web_evidence(uuid)",
    "identity.read_web_plan(uuid)", "identity.read_web_shown_quotes(uuid)", "identity.record_data_export_download(uuid,uuid,jsonb)",
    "identity.record_debate_last_visit(uuid,uuid,jsonb)", "identity.record_dig_link(uuid,uuid,uuid,text[],text)",
    "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)", "identity.record_free_public_ask(uuid,uuid)",
    "identity.record_public_dig_picks(uuid,uuid,jsonb)", "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)",
    "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)", "identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamp with time zone)",
    "identity.record_web_researched(uuid,uuid,uuid)", "identity.reopen_investigation(uuid,uuid)",
    "identity.resend_email_change_with_audit(uuid,uuid,text,timestamp with time zone,bigint,jsonb)", "identity.reserve_ask_clarify_charge(uuid,uuid)",
    "identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)", "identity.resume_paused_run(uuid,uuid)",
    "identity.revoke_all_sessions_with_audit(uuid,uuid,timestamp with time zone,jsonb)",
    "identity.revoke_session_with_audit(uuid,uuid,timestamp with time zone,jsonb)", "identity.save_page_reading_level(uuid,text)",
    "identity.touch_investigation(uuid,uuid)", "memory.unlink_owned_memory_link(uuid,uuid,text,text)", "rls.context_owner_ref()", "rls.context_user_id()", "rls.owns_execution_ref(text)", "rls.owns_run(uuid)",
    "serve.abandon_publication_key_provision(uuid,uuid)", "serve.publication_review_approved(uuid,uuid,integer)",
    "serve.read_publication_review_state(uuid,uuid,uuid)",
    "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)",
    "serve.synthesis_check_removal_notice_exists(uuid)", "serve.take_synthesis_check_removal_notice(uuid)",
    "staff.count_unread_threat_reports(jsonb,text)", "staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea)",
    "staff.decide_threat_report(jsonb,text,uuid,text,jsonb)", "staff.list_publication_reviews(jsonb,text,integer)",
    "staff.list_threat_reports(jsonb,text)", "staff.open_publication_review(jsonb,text,uuid,text)", "staff.peek_threat_report_account(jsonb,text,uuid)",
    "staff.read_audit_page(jsonb,text,integer,timestamp with time zone,uuid)", "staff.read_issued_invitation(jsonb,text,uuid)",
    "staff.read_member_allowance_command(jsonb,text,uuid,uuid)", "staff.read_member_allowance_page(jsonb,text)",
    "staff.read_mutation_target(jsonb,text,uuid,text)", "staff.read_public_flag_queue(jsonb,text)", "staff.read_public_flag_queue_answered(jsonb,text)",
    "staff.read_public_review(jsonb,text,uuid)",
    "staff.read_public_review_command(jsonb,text,uuid)", "staff.read_public_review_list(jsonb,text)", "staff.read_self_allowance_command(jsonb,text,uuid)",
    "staff.read_team_limit_command(jsonb,text)", "staff.read_team_limit_page(jsonb,text)",
    "staff.read_team_page(jsonb,text,integer,timestamp with time zone,uuid)", "staff.read_threat_report(jsonb,text,uuid)",
    "staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea)",
  ] as const;
  const GATED = [
    "billing.consume_withdrawal_grant(uuid,uuid,uuid,text)", "core.claim_legacy_runs(uuid,uuid,uuid,text,text,jsonb)",
    "core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamp with time zone,uuid,uuid,uuid)",
    "identity.assert_session_current(uuid,uuid,text)", "identity.audit_publication_preflight_denial(uuid,uuid,uuid,timestamp with time zone,uuid)",
    "identity.authenticate_account_erasure_status_session(text,text,timestamp with time zone)",
    "identity.authenticate_session_t9(text,text,timestamp with time zone,timestamp with time zone)",
    "identity.begin_consumer_passkey_enrollment(jsonb,jsonb,jsonb)", "identity.begin_consumer_passkey_login(jsonb)",
    "identity.begin_consumer_security_step_up(jsonb)", "identity.begin_recovery_enrollment(jsonb,jsonb)",
    "identity.begin_secure_totp_enrollment(jsonb,jsonb)", "identity.begin_social_flow(jsonb)", "identity.begin_social_step_up_passkey(jsonb)",
    "identity.begin_totp_enrollment_with_audit(text,uuid,jsonb,timestamp with time zone,jsonb)",
    "identity.cancel_email_change_by_token_with_audit(text,jsonb)", "identity.cancel_own_email_change_with_audit(uuid,uuid,jsonb)",
    "identity.claim_social_flow(jsonb)", "identity.complete_consumer_passkey_enrollment(jsonb,jsonb,jsonb)",
    "identity.complete_consumer_security_step_up(jsonb,jsonb)", "identity.complete_onboarding_evidence(jsonb,jsonb,jsonb,jsonb)",
    "identity.complete_recovery_enrollment(jsonb,jsonb,jsonb)",
    "identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)",
    "identity.complete_secure_totp_enrollment(jsonb,jsonb,jsonb)", "identity.complete_social_login(jsonb,jsonb)",
    "identity.complete_social_step_up(jsonb,jsonb)",
    "identity.complete_totp_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,bigint,uuid,text,text,jsonb,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)",
    "identity.confirm_email_change_with_audit(text,jsonb)", "identity.confirm_recovery_email_with_audit(text,jsonb)",
    "identity.confirm_totp_enrollment_with_audit(text,uuid,bigint,timestamp with time zone,jsonb)",
    "identity.consume_verification_with_audit(text,timestamp with time zone,jsonb)",
    "identity.create_login_challenge_with_audit(uuid,uuid,text,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,jsonb)",
    // The social sign-up's account: only for a LOGIN flow its proof, browser and binding hashes name, live and not consumed.
    "identity.create_social_account(jsonb,jsonb)",
    "identity.finish_social_callback(jsonb,jsonb)", "identity.mfa_recovery_pending_cancel(jsonb,jsonb)", "identity.mfa_recovery_pending_read(jsonb)",
    "identity.open_data_export_link(uuid,text)", "identity.prepare_account_recovery_start(bytea)",
    "identity.prepare_authentication_risk_signal_for_recovery(uuid)", "identity.prepare_authentication_risk_signal_for_session(text,text)",
    "identity.prepare_consumer_passkey_enrollment(jsonb,jsonb)", "identity.prepare_recovery_enrollment(text)",
    "identity.prepare_secure_totp_enrollment(jsonb)",
    "identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamp with time zone,bigint,bigint,integer,text,jsonb)",
    "identity.publication_grant_is_live(text,uuid,uuid,text,uuid)", "identity.read_consumer_auth_methods(jsonb)",
    "identity.read_consumer_passkey_challenge(text,text,text)", "identity.read_consumer_security_password_state(jsonb)",
    "identity.read_consumer_security_step_up(jsonb)", "identity.read_onboarding_requirements(jsonb,jsonb)",
    "identity.read_phone_profile_with_audit(uuid,uuid,text,jsonb)", "identity.read_recovery_email(uuid,uuid,text)",
    "identity.read_recovery_enrollment(jsonb)", "identity.read_secure_login_challenge(text)", "identity.read_secure_login_identity(bytea)",
    "identity.read_secure_totp_enrollment(jsonb)", "identity.read_social_links(jsonb)", "identity.read_social_login_status(jsonb)",
    "identity.read_social_signup(jsonb)", "identity.read_social_step_up(jsonb)",
    "identity.record_authentication_risk_signal_for_recovery(uuid,text,jsonb)",
    "identity.record_authentication_risk_signal_for_session(text,text,text,jsonb)", "identity.record_mfa_failure_with_audit(text,text,jsonb)",
    // The three sign-up writers: only for an account the transaction they run in created (0171's xmin rule).
    "identity.record_registration_age_check(uuid,smallint,text,text,timestamp with time zone)",
    "identity.record_registration_region(uuid,text,text)", "identity.record_signup_italy_approval(uuid,jsonb)",
    "identity.record_social_registration_region(uuid,text,text,text,text)",
    "identity.record_verification_delivery_with_audit(uuid,text,timestamp with time zone,boolean,text,jsonb)",
    "identity.regenerate_consumer_recovery_codes(jsonb,jsonb)", "identity.remove_consumer_auth_method(jsonb,jsonb)",
    "identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb)", "identity.request_data_export(uuid,uuid,text,uuid,text,jsonb)",
    "identity.request_email_change_with_audit(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamp with time zone,jsonb)",
    "identity.request_recovery_email_with_audit(uuid,uuid,text,text,uuid,bytea,jsonb,text,timestamp with time zone,jsonb)",
    "identity.resolve_verification_rate_limit_identity(text)", "identity.rotate_consumer_totp_step_up(jsonb,jsonb)",
    "identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone,jsonb)",
    "identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)", "identity.start_consumer_recovery(bytea,text,jsonb)",
    "identity.store_recovery_codes_with_audit(text,uuid,jsonb,timestamp with time zone,jsonb)", "identity.unlink_social_identity(jsonb,jsonb)",
    // 0159's and 0160's writers of a sealed row: each row's own trigger refuses it without an attestation, an HMAC under the run's own secret, which no request login can read.
    "core.record_path_gap_round(uuid,integer,jsonb,bytea)", "core.record_path_outcome(uuid,text,text,jsonb,bytea)", "core.record_start_paths(uuid,jsonb,jsonb)",
    "identity.use_phone_profile_with_audit(uuid,uuid,text,text,text,jsonb,jsonb)", "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
    "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)", "staff.authorize_alert_operation(uuid,text,uuid)",
    "staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)", "staff.disable(jsonb,uuid,jsonb,uuid,text,uuid,jsonb,jsonb)",
    "staff.grant_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)", "staff.invite(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,text,jsonb,jsonb)",
    "staff.public_flag_close(jsonb,uuid,jsonb,uuid,text,uuid,jsonb)", "staff.public_flag_dismiss(jsonb,uuid,jsonb,uuid,uuid,jsonb)",
    // 0174: 0150's door without a ground is no longer the runtime's; only 0172's door with the law is.
    "staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text)",
    "staff.read_action_proof(jsonb,text,text,jsonb)", "staff.read_authentication(uuid,uuid,text,text)", "staff.read_context(uuid,uuid,text)",
    "staff.read_current_context(jsonb,text)", "staff.read_enrollment(uuid,uuid,text)", "staff.read_invitation_context(uuid,uuid,text)",
    "staff.read_invitation_proof(jsonb,text,text)", "staff.read_owner_possession_context(uuid,uuid,uuid,text,text,text)",
    "staff.record_team_practice(jsonb,uuid,jsonb,jsonb,jsonb)", "staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)",
    "staff.revoke_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)", "staff.set_team_limit(jsonb,uuid,jsonb,jsonb,jsonb)",
    "staff.step_up_prerequisite(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text)",
  ] as const;
  const PUBLIC = [
    "core.latest_provider_probes(text[])", "core.read_current_release()", "core.read_release_state(text)", "core.resolve_run_ref(uuid)",
    "core.run_is_published(uuid,uuid)", "identity.outbound_mail_today()", "identity.public_author_name_gone(uuid)", "identity.public_review_held(uuid)",
    "identity.read_public_debate_reports(uuid)", "identity.read_public_debate_updates(uuid)", "identity.read_public_dig_parent(uuid,uuid)",
    "identity.read_public_flag_target(uuid)", "identity.read_public_review_overlay(uuid)", "identity.read_public_tree_of_run(uuid)",
    "identity.run_release_now(uuid)", "identity.run_settings_version_now(uuid)", "register.read_active_settings_version()",
    "register.read_passed_settings_versions(text)", "register.read_support_configuration_status()", "register.settings_version_passed(text,bigint)",
    "staff.read_independent_alert_readiness(text,uuid)", "staff.read_internal_funding_policy()", "staff.read_internal_funding_policy_at(bigint)",
    "staff.read_owner_recovery_installation()", "staff.read_team_room(bigint)",
  ] as const;
  // The reasons several of them share.
  const PURGE = "billing's own purge of rows already due: it clamps the clock it is handed to now, and 0130's verifier pins its grants";
  const REFUSAL_EVENT = "0040's refusal event: one DENY event, never a success, per audit attempt its own transaction began; changes nothing of an account";
  const CREATOR = "a new pending account under the id it is handed; nothing for a taken address, which it knows by the blind index only the API's key makes";
  const ERASING = "a refusal (true refuses a payment, stops each renewal and retry, ends the plan): an owner question would read a mismatch as not";
  const GRANT_TOTALS = "which 0140's admission and staff's allowance page read for other members as their owner; 0130's verifier pins its grants; "
    + "it needs the member's owner ref, which no relation shows a request and only 0159's two carry-on definers of the fifth list hand one, for an account "
    + "with a carry-on due or begun, so those members' totals are open (the funding basis names the grant and its event to any)";
  const LEFT_ALONE: Readonly<Record<string, string>> = {
    "billing.owner_age_frozen(uuid)": `0089's question whether an owner's account is age-frozen, ${ERASING} frozen; one boolean of an owner ref`,
    "billing.owner_erasure_committed(uuid)": `0091's question whether an owner's erasure committed, ${ERASING} erased; one boolean of an owner ref`,
    "billing.owner_erasure_pending(uuid)": `0089's question whether an owner's erasure is pending, ${ERASING} erasing; one boolean of an owner ref`,
    "billing.purge_expired_records(timestamp with time zone)": PURGE,
    "billing.purge_revoked_card_tokens(timestamp with time zone)": PURGE,
    "billing.purge_short_lived(timestamp with time zone)": PURGE,
    "billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)":
      `0093's totals of a grant, ${GRANT_TOTALS}`,
    "billing.read_internal_grant_spent(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)":
      `0093's spend of a grant, ${GRANT_TOTALS}`,
    "billing.read_run_funding_basis(uuid)":
      "0092's funding basis of a debate, a refusal: an owner question would read a mismatch as no basis, which the runner's admission admits; ids alone",
    "core.run_private_content_is_live(uuid)":
      "0040's one boolean of a run id, which the public report, the copy's trigger, the erasure barriers and run_waiting_v ask of other accounts' debates",
    "evaluator.ledger_entry_is_authenticated_scope(uuid)": "0040's one boolean of a ledger row, which the evaluator worker's ledger trigger asks with no marker and no session",
    "identity.audit_country_gate_refused(jsonb,text)": "0080's aggregate refusal event: it names no account, one DENY event per audit attempt its own transaction began",
    "identity.audit_login_failed(uuid,jsonb,text)": REFUSAL_EVENT,
    "identity.audit_rate_limit_refused(jsonb,text)": "0042's aggregate refusal event: it names no account, one DENY event per audit attempt its own transaction began",
    "identity.audit_registration_duplicate_postwork(uuid,jsonb)": REFUSAL_EVENT,
    "identity.audit_registration_failed(uuid,jsonb)": REFUSAL_EVENT,
    "identity.audit_session_step_up_denied(uuid,jsonb,text)": REFUSAL_EVENT,
    "identity.audit_verification_record_failed(uuid,jsonb)": REFUSAL_EVENT,
    "identity.begin_runtime_audit_attempt()": "0040's audit attempt of the transaction itself: one row keyed by its own backend and transaction id",
    "identity.create_pending_account_reserved_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb,text,text,timestamp with time zone)": CREATOR,
    "identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb,text,text,timestamp with time zone,smallint,text,text,jsonb)": CREATOR,
    "identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone,jsonb,smallint,text,text,jsonb)": CREATOR,
    "identity.expired_totp_addition_candidates(integer)": "0099's list of at most five accounts whose TOTP addition is dead, for the sign-in flow's prune: user ids alone",
    "identity.has_phone_profile(uuid)": "0097's one bit of an owner ref, whether its active account has a phone on file; no product code asks it now",
    "identity.prune_consumer_passkey_challenges(integer)": "0098's prune of dead rows only: the passkey challenges consumed or expired",
    "identity.prune_consumer_security_challenges(integer)": "0100's prune of dead rows only: the security challenges consumed or expired",
    "identity.prune_social_flows()": "0101's prune of dead rows only: the social flows consumed or expired",
    "identity.prune_totp_addition(uuid)": "0099's prune of one account's TOTP addition only when it is dead (expired or consumed), the sign-in flow's own",
    "identity.read_account_security_hold(uuid)": "0085's one bit of any user id, which the sign-in step-up asks on the authorization login; named open in the 0171 header",
    "identity.record_public_check_usage(text,uuid,timestamp with time zone,integer,integer,integer,numeric)":
      "0152's measure of what a public check used: ids and numbers, append-only, which nothing reads to gate or count anything",
    "ledger.allocate_sequence()": "0000's allocator, a definer since 0171: it hands out the next position and sets nothing back",
    "serve.run_removed_by_synthesis_check(uuid)":
      "0126's question whether the check removed a debate, a refusal: an owner question would read a mismatch as not removed; one boolean of a run id",
    "staff.hold_threat_report_email(uuid,text)": "0128's hold of an erasing account's address on its threat reports, gated by the id of a prepared, uncommitted erasure",
    "staff.release_alert_delivery(uuid,uuid)": "0112's verifier pins it, and it gives back only a live claim, whose token only the marker's claim hands out"
  };
  /**
   * The write-loops the API drains only from its gated timers, whose arguments name only a limit, a claim, a notice or the
   * like, so the main census above tells them apart from the owner-keyed writers only by what they ask: the three billing
   * purges (they clamp the clock they are handed to now), the per-transaction audit attempt, the three challenge prunes (dead
   * rows only), 0000's sequence allocator (a definer since 0171) and 0112's release of a staff claim (it gives back only a
   * live claim). Each is in LEFT_ALONE above; this list fails on a new such loop that asks nothing of the connection.
   * ARRIVED_LOOP_WRITERS are the six such loops the merges of feat/2026-10-28-v4-initial brought, named apart: each is in the fifth list, open, not left alone on purpose.
   */
  const LOOP_WRITERS = [
    "billing.purge_expired_records(timestamp with time zone)", "billing.purge_revoked_card_tokens(timestamp with time zone)",
    "billing.purge_short_lived(timestamp with time zone)", "identity.begin_runtime_audit_attempt()",
    "identity.prune_consumer_passkey_challenges(integer)", "identity.prune_consumer_security_challenges(integer)",
    "identity.prune_social_flows()", "ledger.allocate_sequence()", "staff.release_alert_delivery(uuid,uuid)"
  ] as const;
  const ARRIVED_LOOP_WRITERS = [
    "identity.claim_moderation_notices(integer)", "identity.claim_moderation_statements(integer)", "identity.claim_public_flag_mail(integer)",
    "identity.complete_moderation_notice(uuid,uuid,text)", "identity.delete_moderation_words_due()", "core.claim_carry_on_due(integer)"
  ] as const;
  /**
   * The relations either request login may INSERT, UPDATE or DELETE whose row security is off: each append-only (its mutation
   * and truncate guards refuse an UPDATE or a DELETE), content-free, and keyed by nothing an account owns, or the one-row
   * global sequence counter. A definer-only census cannot see a direct right, so this list names them, counting a table-level
   * or column-level INSERT, UPDATE or DELETE on a table, a view (it writes as its owner, past its base table's row security), a
   * materialized view or a foreign table, and USAGE or UPDATE on a sequence (nextval, setval); a new one fails.
   */
  const WRITABLE_RLS_OFF = [
    // Append-only, content-free facts: the owner-run tool's order ids, the model-identity facts, the publication-check record.
    "billing.tool_order", "scorecard.model_identity", "serve.publication_check_record",
    // The one-row global sequence counter: its PRIMARY KEY and CHECK(singleton) admit no second row, so an INSERT always
    // conflicts, and 0171 took UPDATE back (section 4), so it is written only through its definer, ledger.allocate_sequence().
    // The merges of feat/2026-10-28-v4-initial brought no such relation: the tables of 0156, 0157, 0158 to 0169 (all sixteen) and 0170 are each no request login's to read or write.
    "ledger.sequence_allocator"
  ] as const;
  const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
  let pools: ApiTestPools;
  let liveness: Pool;
  let ana: RlsTestAccount;
  let ben: RlsTestAccount;
  const login = (key: Parameters<RlsLogins["url"]>[0]): string => decodeURIComponent(new URL(logins!.url(key)).username);
  const refusal = async (work: () => Promise<unknown>): Promise<SqlError> => {
    const { code, message } = await sqlError(work);
    return { code, message };
  };
  const readerOf = (pool: Pool, reader: (typeof RUN_READERS)[number], runId: string) =>
    pool.query<{ value: unknown }>(`SELECT identity.${reader}($1) AS value`, [runId]).then((result) => result.rows[0]!.value);
  /** What each of the eleven hands back for `runId` on `pool`: null for each that answers as for nothing stored. */
  const readAll = async (pool: Pool, runId: string): Promise<Record<string, unknown>> =>
    Object.fromEntries(await Promise.all(RUN_READERS.map(async (reader) => [reader, await readerOf(pool, reader, runId)] as const)));
  const nothing = Object.fromEntries(RUN_READERS.map((reader) => [reader, null]));
  /** One row of each kind the readers that answer only for something stored need: a pick set, a place in an investigation, purpose lines, suggestions. */
  async function stored(owner: RlsTestAccount): Promise<string> {
    const investigationId = randomUUID();
    const envelope = JSON.stringify(ENVELOPE);
    await seeded([
      [`INSERT INTO identity.web_search (search_id,run_id,owner_ref,path_ref,side,language_kind,language,look_back,outcome,charge_micros,result_count,content_ciphertext)
        VALUES ($1,$2,$3,'pos-1','for','english','en','none','EMPTY',0,0,$4::jsonb)`, [randomUUID(), owner.runId, owner.ownerRef, envelope]],
      ["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,pick_count) VALUES ($1,$2,$3,0)", [owner.runId, owner.ownerRef, randomUUID()]],
      ["INSERT INTO identity.investigation (investigation_id,owner_ref,root_run_id,state) VALUES ($1,$2,$3,'open')", [investigationId, owner.ownerRef, owner.runId]],
      ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref) VALUES ($1,$2,$3)", [owner.runId, investigationId, owner.ownerRef]],
      ["INSERT INTO identity.run_purpose_lines (run_id,owner_ref,content_ciphertext,content_attestation) VALUES ($1,$2,$3::jsonb,$4)",
        [owner.runId, owner.ownerRef, envelope, ATTESTATION]],
      [`INSERT INTO identity.path_suggestions (set_id,run_id,debate_run_id,position_ref,owner_ref,content_ciphertext,content_attestation)
        VALUES ($1,$2,$2,'pos-1',$3,$4::jsonb,$5)`, [randomUUID(), owner.runId, owner.ownerRef, envelope, ATTESTATION]]]);
    return investigationId;
  }
  /** What the readers hand back for a run with the rows above: every one of them something. */
  const served = (owner: RlsTestAccount, investigationId: string) => expect.objectContaining({
    read_web_evidence: expect.objectContaining({ searches: [expect.objectContaining({ path_ref: "pos-1" })] }),
    read_investigation_of_run: expect.objectContaining({ investigation_id: investigationId }),
    read_path_rewrites_of_run: { paths: [], own: null },
    read_web_plan: [],
    read_dig_picks_of_run: expect.objectContaining({ run_id: owner.runId, pick_count: 0 }),
    read_investigation_reports_of_run: expect.objectContaining({ investigation_id: investigationId, root_run_id: owner.runId }),
    read_path_line_of_run: [],
    read_main_answer_updates_of_run: [],
    read_run_purpose_lines_of_run: ENVELOPE,
    read_web_shown_quotes: [],
    read_path_suggestions_of_run: [expect.objectContaining({ run_id: owner.runId, position_ref: "pos-1" })]
  });

  beforeAll(async () => {
    pools = logins!.apiPools();
    liveness = createPool(logins!.url("LIVENESS_DATABASE_URL"));
    ana = await seedSessionAccount(database.pool, "f5-run-ana");
    ben = await seedSessionAccount(database.pool, "f5-run-ben");
  }, 120_000);
  afterAll(async () => { await liveness?.end(); });

  it("a debate's own readers serve the account's own debate in its request and answer as for nothing stored for another's, or with no session", async () => {
    const [anaInvestigation, benInvestigation] = [await stored(ana), await stored(ben)];
    for (const pool of [pools.runtime, pools.authorization]) {
      expect(await inAccountRequest(ana.token, () => readAll(pool, ana.runId))).toEqual(served(ana, anaInvestigation));
      expect(await inAccountRequest(ana.token, () => readAll(pool, ben.runId))).toEqual(nothing);
      expect(await inAccountRequest(ben.token, () => readAll(pool, ana.runId))).toEqual(nothing);
    }
    // No session (a pool with no system target sends none), an anonymous request, a revoked token: nothing of anyone's.
    expect(await readAll(apiRequest, ana.runId)).toEqual(nothing);
    expect(await inAccountRequest(null, () => readAll(pools.runtime, ana.runId))).toEqual(nothing);
    expect(await inAccountRequest(ana.revokedToken, () => readAll(pools.runtime, ana.runId))).toEqual(nothing);
    // The system logins, which hold the marker (the API's sweeps, the runner, the scheduler's liveness), read any account's with no session.
    for (const pool of [apiSystem, runner, liveness]) {
      expect(await readAll(pool, ana.runId)).toEqual(served(ana, anaInvestigation));
      expect(await readAll(pool, ben.runId)).toEqual(served(ben, benInvestigation));
    }
    // A debate erased is nothing for anyone, the marker's logins included, as before.
    const erased = await run(ben);
    expect(await readerOf(apiSystem, "read_web_evidence", erased)).not.toBeNull();
    await database.pool.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [erased]);
    expect(await readAll(apiSystem, erased)).toEqual(nothing);
  });

  it("a public copy goes only under the connection's own dig, by the dig's own id, or for an open report its owner opened; a marker login passes the owner half", async () => {
    const root = await run(ben);
    const publicationRef = await publish(root);
    const dig = await run(ana);
    const [openReport, closedReport, otherMaterial] = [randomUUID(), randomUUID(), randomUUID()];
    // Each id below already holds a copy, so a call the rule admits answers ALREADY and writes nothing, and a refused one never reaches the lookup.
    const material = (id: string, runId: string, kind: string) => [`INSERT INTO identity.public_material (material_id,run_id,owner_ref,publication_ref,kind,content_ciphertext,content_attestation)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [id, runId, kind === "DIG" ? ana.ownerRef : ben.ownerRef, publicationRef, kind, JSON.stringify(ENVELOPE), ATTESTATION]] as const;
    await seeded([material(dig, dig, "DIG"), material(openReport, root, "REPORT"), material(closedReport, root, "REPORT"),
      ["INSERT INTO identity.public_report (report_id,publication_ref,report_version,writer_ref,carrier_run_id,free) VALUES ($1,$2,1,$3,$4,false)",
        [openReport, publicationRef, ana.ownerRef, root]],
      [`INSERT INTO identity.public_report (report_id,publication_ref,report_version,writer_ref,carrier_run_id,free,outcome,failure_code,recorded_at)
        VALUES ($1,$2,2,$3,$4,false,'FAILED','FIXTURE_FAILED',now())`,
        [closedReport, publicationRef, ana.ownerRef, root]]]);
    const record = (pool: Pool, id: string, runId: string, kind: string, publication: string = publicationRef) => pool.query<{ outcome: string }>(
      "SELECT identity.record_public_material($1,$2,$3,$4,$5::jsonb,$6) AS outcome", [id, runId, publication, kind, JSON.stringify(ENVELOPE), ATTESTATION])
      .then((result) => result.rows[0]!.outcome);
    // The dig's own copy, by its own run's id, in its owner's request; never another's dig, nor an id that is not the dig's.
    expect(await inAccountRequest(ana.token, () => record(pools.runtime, dig, dig, "DIG"))).toBe("ALREADY");
    expect(await refusal(() => inAccountRequest(ben.token, () => record(pools.runtime, dig, dig, "DIG")))).toEqual(MISMATCH);
    expect(await refusal(() => inAccountRequest(ana.token, () => record(pools.runtime, otherMaterial, dig, "DIG")))).toEqual(MISMATCH);
    // A report's copy, under its carrier (ben's root), for the report ana opened and that is still open; never ben's, a written one, another page's.
    expect(await inAccountRequest(ana.token, () => record(pools.runtime, openReport, root, "REPORT"))).toBe("ALREADY");
    expect(await refusal(() => inAccountRequest(ben.token, () => record(pools.runtime, openReport, root, "REPORT")))).toEqual(MISMATCH);
    expect(await refusal(() => inAccountRequest(ana.token, () => record(pools.runtime, closedReport, root, "REPORT")))).toEqual(MISMATCH);
    expect(await refusal(() => inAccountRequest(ana.token, () => record(pools.runtime, openReport, dig, "REPORT")))).toEqual(MISMATCH);
    expect(await refusal(() => inAccountRequest(ana.token, () => record(pools.runtime, openReport, root, "REPORT", randomUUID())))).toEqual(MISMATCH);
    // No session: neither.
    expect(await refusal(() => record(apiRequest, dig, dig, "DIG"))).toEqual(MISMATCH);
    expect(await refusal(() => record(apiRequest, openReport, root, "REPORT"))).toEqual(MISMATCH);
    // The API's system login names any owner, the shape still holds.
    expect(await record(apiSystem, dig, dig, "DIG")).toBe("ALREADY");
    expect(await record(apiSystem, openReport, root, "REPORT")).toBe("ALREADY");
    expect(await refusal(() => record(apiSystem, otherMaterial, dig, "DIG"))).toEqual(MISMATCH);
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_material WHERE material_id=$1", [otherMaterial])).rows[0]!.n)).toBe(0);
  });

  it("a flag's settlement is the system login's alone, after the judge: no request login settles one, with its own session, another's or none; the system login records, closes and hides, and hides nothing staff dismissed", async () => {
    const pages = [await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben))];
    const flags = pages.map(() => randomUUID());
    await seeded(pages.map((publicationRef, at) => ["INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext) VALUES ($1,$2,$3,'CHECKING',$4::jsonb)",
      [flags[at], publicationRef, ana.ownerRef, JSON.stringify(pubEnvelope(publicationRef))]] as const));
    const settle = (pool: Pool, flagId: string, verdict: string) => pool.query<{ state: string }>(
      "SELECT identity.settle_public_flag($1::uuid,$2,'PERSONAL','judge-provider','judge-model',11,7,0.25) AS state", [flagId, verdict]).then((result) => result.rows[0]!.state);
    const hidden = async (publicationRef: string) => Number((await database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM identity.public_review_event WHERE publication_ref=$1 AND action='HIDE'", [publicationRef])).rows[0]!.n);
    const flagRow = async (flagId: string) => (await database.pool.query(`SELECT state,verdict,judge_model_id,input_tokens,output_tokens,cost_usd::text AS cost,
      reporter_ref,judged_at IS NOT NULL AS judged FROM identity.public_flag WHERE flag_id=$1`, [flagId])).rows[0] as Record<string, unknown>;
    // Before 0171 the reporter's own request settled its own flag AGREE and hid ben's debate: the database believed the verdict it was handed. No
    // request login may call the settlement now, with its own session, another's or none, on either of the API's request logins.
    const DENIED = { code: "42501", message: "permission denied for function settle_public_flag" };
    for (const [label, work] of [
      ["ana's own request, AGREE", () => inAccountRequest(ana.token, () => settle(pools.runtime, flags[0]!, "AGREE"))],
      ["ana's own request, NOT_FOUND", () => inAccountRequest(ana.token, () => settle(pools.runtime, flags[0]!, "NOT_FOUND"))],
      ["ana's own request on the authorization login", () => inAccountRequest(ana.token, () => settle(pools.authorization, flags[0]!, "AGREE"))],
      ["ben's request", () => inAccountRequest(ben.token, () => settle(pools.runtime, flags[0]!, "AGREE"))],
      ["no session", () => settle(apiRequest, flags[0]!, "AGREE")]
    ] as const) expect(await refusal(work), label).toEqual(DENIED);
    expect(await flagRow(flags[0]!)).toMatchObject({ state: "CHECKING", verdict: null, judge_model_id: null, judged: false });
    expect(await hidden(pages[0]!)).toBe(0);
    // The press's own way: inside the reporter's request, after the judge, on the request pool's system target (main.ts, X38), which is the API's
    // system login and presents no session. It records the judge's call, hides on AGREE, and names the reporter the opening named.
    const settled = await inAccountRequest(ana.token, async () => {
      const system = crossAccountPool(pools.runtime, "X38");
      expect((await system.query<{ who: string }>("SELECT current_user AS who")).rows[0]!.who).toBe(login("API_SYSTEM_DATABASE_URL"));
      return new PostgresPublicFlagRepository(system).settle({ flagId: flags[0]!, verdict: "AGREE", reason: "PERSONAL", providerRef: "judge-provider",
        modelId: "judge-model", inputTokens: 11, outputTokens: 7, costUsd: 0.25 });
    });
    expect(settled).toBe("HIDDEN");
    expect(await flagRow(flags[0]!)).toEqual({ state: "HIDDEN", verdict: "AGREE", judge_model_id: "judge-model", input_tokens: 11, output_tokens: 7, cost: "0.25",
      reporter_ref: ana.ownerRef, judged: true });
    expect(await hidden(pages[0]!)).toBe(1);
    // The system login closes a NOT_FOUND and sends anything else to a person, as before.
    expect(await settle(apiSystem, flags[1]!, "NOT_FOUND")).toBe("NOT_FOUND");
    expect(await settle(apiSystem, flags[2]!, "UNSURE")).toBe("QUEUED");
    for (const at of [1, 2]) expect(await hidden(pages[at]!)).toBe(0);
    // A report staff dismissed while the judge ran: its verdict is recorded and it goes to a person, and the judge's AGREE hides nothing.
    await seeded([["UPDATE identity.public_flag SET dismissed_at=now(), dismissed_by=$2 WHERE flag_id=$1", [flags[3], randomUUID()]]]);
    expect(await settle(apiSystem, flags[3]!, "AGREE")).toBe("QUEUED");
    expect(await flagRow(flags[3]!)).toMatchObject({ state: "QUEUED", verdict: "AGREE", judge_model_id: "judge-model", judged: true });
    expect(await hidden(pages[3]!)).toBe(0);
  });

  it("on the production logins (P3-01's memberships): a request login with its own session is refused the settlement, and the Report button's route, wired as main.ts wires it, hides on a judged AGREE and goes to a person otherwise", async () => {
    const production = await logins!.production();
    const opened: Pool[] = [];
    /** A T1 production login as main.ts builds its pool: its own connections inside a request, its system twin outside one and for a site. */
    const routed = (id: "api-runtime" | "api-authorization", system: "api-system" | "api-authorization-system"): Pool => {
      const target = createPool(production.url(system), { max: 2 });
      const pool = createPool(production.url(id), { max: 2, crossAccount: target });
      opened.push(pool, target);
      return pool;
    };
    const eve = await seedSessionAccount(database.pool, "f5-flag-press");
    const pages = [await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben))];
    try {
      const request = routed("api-runtime", "api-system");
      const authorization = routed("api-authorization", "api-authorization-system");
      const flagId = randomUUID();
      await seeded([["INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext) VALUES ($1,$2,$3,'CHECKING',$4::jsonb)",
        [flagId, pages[2], eve.ownerRef, JSON.stringify(pubEnvelope(pages[2]!))]]]);
      for (const pool of [request, authorization]) {
        expect(await refusal(() => inAccountRequest(eve.token, () => pool.query("SELECT identity.settle_public_flag($1::uuid,'AGREE','PERSONAL','p','m',0,0,0)", [flagId]))))
          .toEqual({ code: "42501", message: "permission denied for function settle_public_flag" });
      }
      // The route, as main.ts composes the press: the target read, the opening and the judge on the request pool, the settlement on its X38 site.
      const QUOTE = "names a private person's home address";
      const replies: string[] = [];
      const judge = { providerRef: "judge-provider", modelId: "judge-model", complete: async () => ({ text: replies.shift()!, usage: { input_tokens: 11, output_tokens: 7, cost_usd: 0.25 } }) };
      const identity = httpIdentityFor(eve);
      const http = buildApi({
        application: { withContentLease: <T>(_id: string, use: () => Promise<T>) => use() } as unknown as ApiOptions["application"],
        sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
        publicFlags: {
          // Made up, as the register's development row: no release is CURRENT here, so the opening counts against these.
          limits: { personHour: 11, debateDay: 22, siteDay: 99 },
          repository: new PostgresPublicFlagRepository(request), settlement: new PostgresPublicFlagRepository(crossAccountPool(request, "X38")),
          judge: () => judge as never, seal: async (publicationRef: string) => pubEnvelope(publicationRef) as never,
          readPublicDebate: async () => ({ question: "Fixture question", answer: `The first path ${QUOTE}.` }) as never
        }
      });
      try {
        const press = async (publicationRef: string) => (await http.inject({ method: "POST", url: `/v1/public/debates/${publicationRef}/flag`, headers: testSessionHeaders(identity, true),
          payload: { where: "The first path", claim: "It names a private person's home.", good_faith: true } })).json() as { state: string };
        const flagOf = async (publicationRef: string) => (await database.pool.query("SELECT state,verdict,reporter_ref FROM identity.public_flag WHERE publication_ref=$1",
          [publicationRef])).rows;
        replies.push(JSON.stringify({ verdict: "AGREE", reason: "PERSONAL", quote: QUOTE }));
        expect(await press(pages[0]!)).toEqual({ state: "HIDDEN" });
        expect(await flagOf(pages[0]!)).toEqual([{ state: "HIDDEN", verdict: "AGREE", reporter_ref: eve.ownerRef }]);
        // 0157: the press keeps the quote the hide relied on, on the request login under the reporter's own session, once the system login has settled it.
        expect((await database.pool.query<{ key_id: string }>(`SELECT quote.quote_ciphertext->>'keyId' AS key_id FROM identity.public_flag_quote AS quote
          JOIN identity.public_flag AS flag USING (flag_id) WHERE flag.publication_ref=$1`, [pages[0]])).rows).toEqual([{ key_id: `publication-snapshot:${pages[0]}:v1` }]);
        expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_review_event WHERE publication_ref=$1 AND action='HIDE'",
          [pages[0]])).rows[0]!.n)).toBe(1);
        replies.push(JSON.stringify({ verdict: "UNSURE", reason: null, quote: null }));
        expect(await press(pages[1]!)).toEqual({ state: "WITH_A_PERSON" });
        expect(await flagOf(pages[1]!)).toEqual([{ state: "QUEUED", verdict: "UNSURE", reporter_ref: eve.ownerRef }]);
        expect(replies).toEqual([]);
      } finally { await http.close(); }
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("on the production logins (P3-01's memberships): beside the settlement's move, 0157's close never hides, its sweep of a report left CHECKING sends it to a person with no verdict of its own, and a quote is kept only for a report that hid", async () => {
    const production = await logins!.production();
    const request = createPool(production.url("api-runtime"), { max: 2 });
    const authorization = createPool(production.url("api-authorization"), { max: 2 });
    const system = createPool(production.url("api-system"), { max: 2 });
    const eve = await seedSessionAccount(database.pool, "f5-flag-close");
    const [stale, closed, closedStale, fresh] = [await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben))];
    const [staleFlag, closedFlag, closedStaleFlag, freshFlag] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const stuck = "clock_timestamp() - interval '6 minutes'";
    await seeded([
      [`INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext,created_at) VALUES ($1,$2,$3,'CHECKING',$4::jsonb,${stuck})`,
        [staleFlag, stale, eve.ownerRef, JSON.stringify(pubEnvelope(stale))]],
      ["INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext) VALUES ($1,$2,$3,'CHECKING',$4::jsonb)",
        [closedFlag, closed, eve.ownerRef, JSON.stringify(pubEnvelope(closed))]],
      [`INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext,created_at) VALUES ($1,$2,$3,'CHECKING',$4::jsonb,${stuck})`,
        [closedStaleFlag, closedStale, eve.ownerRef, JSON.stringify(pubEnvelope(closedStale))]],
      ["INSERT INTO identity.public_flag (flag_id,publication_ref,reporter_ref,state,content_ciphertext) VALUES ($1,$2,$3,'CHECKING',$4::jsonb)",
        [freshFlag, fresh, eve.ownerRef, JSON.stringify(pubEnvelope(fresh))]]]);
    const hides = async (publicationRef: string) => Number((await database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM identity.public_review_event WHERE publication_ref=$1 AND action='HIDE'", [publicationRef])).rows[0]!.n);
    const flag = async (flagId: string) => (await database.pool.query<{ state: string; verdict: string | null; dismissed: boolean }>(
      "SELECT state,verdict,dismissed_at IS NOT NULL AS dismissed FROM identity.public_flag WHERE flag_id=$1", [flagId])).rows[0]!;
    const close = (flagId: string) => database.pool.query("SELECT identity.public_flag_close($1,'NO_BREACH',$2,$3,$4)", [flagId, randomUUID(), randomUUID(), "a".repeat(64)]);
    const settle = (pool: Pool, flagId: string, verdict: string) => pool.query<{ state: string }>(
      "SELECT identity.settle_public_flag($1::uuid,$2,'PERSONAL','judge-provider','judge-model',11,7,0.25) AS state", [flagId, verdict]).then((result) => result.rows[0]!.state);
    try {
      // 0157's close of a report still CHECKING is 0151's dismissal with what the person found, so the judge's AGREE arriving after it, on the system login, hides nothing.
      await close(closedFlag);
      expect(await settle(system, closedFlag, "AGREE")).toBe("QUEUED");
      expect(await flag(closedFlag)).toEqual({ state: "QUEUED", verdict: "AGREE", dismissed: true });
      expect(await hides(closed)).toBe(0);
      // No request login may name a verdict: the settlement is the marker's alone, the 0157 sweep beside it notwithstanding.
      for (const pool of [request, authorization]) {
        expect(await refusal(() => settle(pool, freshFlag, "AGREE"))).toEqual({ code: "42501", message: "permission denied for function settle_public_flag" });
      }
      // The sweep, as the fifth list says, on a request login with no session: a report CHECKING for five minutes goes to a person as UNAVAILABLE, a closed one
      // among them, and neither hides. A fresh one is left to its judge.
      await close(closedStaleFlag);
      expect((await request.query<{ settled: number }>("SELECT identity.settle_stuck_public_flags() AS settled")).rows[0]!.settled).toBeGreaterThanOrEqual(2);
      expect(await flag(staleFlag)).toEqual({ state: "QUEUED", verdict: "UNAVAILABLE", dismissed: false });
      expect(await flag(closedStaleFlag)).toEqual({ state: "QUEUED", verdict: "UNAVAILABLE", dismissed: true });
      expect(await flag(freshFlag)).toEqual({ state: "CHECKING", verdict: null, dismissed: false });
      for (const page of [stale, closedStale, fresh]) expect(await hides(page)).toBe(0);
      // A quote is kept only for a report that hid its debate: none of these did.
      const quote = (flagId: string, publicationRef: string) => request.query<{ kept: boolean }>("SELECT identity.record_public_flag_quote($1::uuid,$2::jsonb) AS kept",
        [flagId, JSON.stringify(pubEnvelope(publicationRef))]).then((result) => result.rows[0]!.kept);
      expect(await quote(staleFlag, stale)).toBe(false);
      expect(await quote(closedFlag, closed)).toBe(false);
    } finally { await Promise.all([request.end(), authorization.end(), system.end()]); }
  }, 300_000);

  it("a flag's limits are the site's own sealed row: a request's own numbers only tighten them; with no release named, its own; a CURRENT release with no valid row refuses", async () => {
    // Fresh accounts: ana's flags above already count in her hour.
    const [dan, eve] = [await seedSessionAccount(database.pool, "f5-flag-dan"), await seedSessionAccount(database.pool, "f5-flag-eve")];
    const pages = [await publish(await run(ben)), await publish(await run(ben)), await publish(await run(ben))];
    const open = (who: RlsTestAccount, publicationRef: string, limits: readonly [number, number, number] = [1000, 1000, 1000]) => inAccountRequest(who.token,
      () => pools.runtime.query<{ answer: string }>("SELECT identity.open_public_flag($1,$2,$3,$4::jsonb,$5,$6,$7) AS answer",
        [who.ownerRef, publicationRef, randomUUID(), JSON.stringify(pubEnvelope(publicationRef)), ...limits]).then((result) => result.rows[0]!.answer));
    const siteLimits = async () => (await database.pool.query<{ limits: unknown }>("SELECT identity.public_flag_site_limits() AS limits")).rows[0]!.limits;
    const flagsOn = async (publicationRef: string) => Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.public_flag WHERE publication_ref=$1",
      [publicationRef])).rows[0]!.n);
    /** A release the database names CURRENT until `work` ends, whose key's number is `version`; then RETIRED, so the next case starts with none. */
    const current = async <T>(version: number, work: () => Promise<T>): Promise<T> => {
      const key = `r${String(version)}-0123456789ab`;
      await database.pool.query("INSERT INTO core.release_event (release_key,kind,take_traffic_from,recorded_by) VALUES ($1,'CURRENT',clock_timestamp(),'root:fixture')", [key]);
      try { return await work(); } finally {
        await database.pool.query("INSERT INTO core.release_event (release_key,kind,recorded_by) VALUES ($1,'RETIRED','root:fixture')", [key]);
      }
    };
    /** A register version sealed as the register's own publication seals one: the bootstrap's rows, with this abuseLimits row; its number. */
    const sealed = async (value: Record<string, unknown>): Promise<number> => {
      await persistBootstrapRegister(database.pool, await loadBootstrapRegister());
      const receipt = await publishReplacementRegisterFixture(database.pool, parseRegisterVersionText("1"),
        [registerFixtureRow("abuseLimits", value, "fixture: made up")], "security-review-0171:flag-limits");
      return registerVersionToSafeLegacyNumber(receipt.registerVersion);
    };
    const ROW = { kind: "ABUSE_LIMITS", clarify_per_hour: 11, clarify_per_day: 22, flag_per_person_hour: 2, flag_per_debate_day: 1, flag_per_site_day: 99,
      cancel_links_per_day: 11, mail_domain_checks_per_minute: 110 };
    // No role a request holds, and no system login, may call the reader itself: only the opening asks it, as its owner.
    expect((await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
      WHERE p.oid='identity.public_flag_site_limits()'::regprocedure AND a.grantee<>p.proowner`)).rows).toEqual([]);
    expect((await refusal(() => inAccountRequest(dan.token, () => pools.runtime.query("SELECT identity.public_flag_site_limits()")))).code).toBe("42501");
    expect((await refusal(() => apiSystem.query("SELECT identity.public_flag_site_limits()"))).code).toBe("42501");
    // A fresh database names no release: no site row stands, and the opening counts against the numbers it is handed, as before.
    expect(await siteLimits()).toBeNull();
    // Made up, as the register's development row, but two reports an hour a person and one check a day a debate.
    await current(await sealed(ROW), async () => {
      expect(await siteLimits()).toEqual({ person_hour: 2, debate_day: 1, site_day: 99 });
      // The request hands numbers far above the site's; the site's own stand: one check a day on a debate, two reports an hour a person.
      expect(await open(dan, pages[0]!)).toBe("CHECK");
      expect(await open(eve, pages[0]!)).toBe("QUEUE");
      expect(await open(dan, pages[1]!)).toBe("CHECK");
      expect(await open(dan, pages[2]!)).toBe("LIMITED");
      expect(await flagsOn(pages[2]!)).toBe(0);
      // A request's own lower number still holds: it may tighten the site's, never loosen them.
      expect(await open(eve, pages[1]!, [1, 1000, 1000])).toBe("LIMITED");
    });
    // A CURRENT release whose version holds no abuseLimits row (a key whose number no version has), or one whose flag members are not whole numbers
    // from 1 to the schema's bound, refuses every opening, as an API whose own version holds none refuses to start: nothing is written.
    for (const version of [9_900_102, await sealed({ ...ROW, flag_per_site_day: "99" })]) {
      await current(version, async () => {
        expect(await refusal(() => open(eve, pages[2]!)), String(version)).toEqual({ code: "55000", message: "PUBLIC_FLAG_LIMITS_UNRESOLVED" });
        expect(await refusal(() => siteLimits()), String(version)).toEqual({ code: "55000", message: "PUBLIC_FLAG_LIMITS_UNRESOLVED" });
      });
    }
    expect(await flagsOn(pages[2]!)).toBe(0);
    // No release CURRENT again: the numbers the request hands, so dan's third report of the hour opens.
    expect(await siteLimits()).toBeNull();
    expect(await open(dan, pages[2]!)).toBe("CHECK");
  });

  it("a public debate's path line hands a request only its own runs' rows: none with no session or another's, the digger its own refused row; the runner reads it whole", async () => {
    // Ben's published debate, with his own private dig's rewrite turn on its path and ana's public dig on the same path, which the check refused.
    const root = await run(ben);
    const publicationRef = await publish(root);
    const [benDig, anaDig, updateId] = [await run(ben), await run(ana), randomUUID()];
    await seeded([
      ["INSERT INTO identity.path_rewrite_turn (run_id,owner_ref,parent_run_id,position_ref,path_seq) VALUES ($1,$2,$3,'pos-1',1)", [benDig, ben.ownerRef, root]],
      [`INSERT INTO identity.public_contribution (dig_run_id,owner_ref,publication_ref,root_run_id,parent_run_id,position_ref,outcome,checked_at)
        VALUES ($1,$2,$3,$4,$4,'pos-1','REFUSED',now())`, [anaDig, ana.ownerRef, publicationRef, root]],
      [`INSERT INTO identity.path_update_turn (update_id,run_id,owner_ref,parent_run_id,position_ref,kind,climb_step,cause_kind,cause_id)
        VALUES ($1,$2,$3,$4,'pos-1','PUBLIC_DIG',0,'DIG_SETTLED',NULL)`, [updateId, anaDig, ana.ownerRef, root]]]);
    const line = (pool: Pool, runId: string = root) => pool.query<{ line: Array<{ run_id: string; source: string; hidden: boolean }> | null }>(
      "SELECT identity.read_public_path_line($1) AS line", [runId]).then((result) => result.rows[0]!.line);
    const runsOf = (entries: Array<{ run_id: string }> | null) => entries === null ? null : entries.map((entry) => entry.run_id).sort();
    // The runner and the API's system login, which hold the marker: every row, private ones too, as the runner's prompts need them.
    for (const pool of [runner, apiSystem]) expect(runsOf(await line(pool)), "marker").toEqual([benDig, anaDig].sort());
    // A request login with no session, or an anonymous request: no row of anyone's.
    expect(await line(apiRequest)).toEqual([]);
    expect(await inAccountRequest(null, () => line(pools.runtime))).toEqual([]);
    // Each account's own request: only its own runs' rows. The digger keeps its own refused row (hidden from others, not from it); the author keeps
    // its private dig's turn; neither sees the other's.
    expect(await inAccountRequest(ana.token, () => line(pools.runtime))).toEqual([expect.objectContaining({ run_id: anaDig, source: "PATH_UPDATE", hidden: true })]);
    expect(await inAccountRequest(ben.token, () => line(pools.runtime))).toEqual([expect.objectContaining({ run_id: benDig, source: "PATH_REWRITE" })]);
    // A debate that is not public answers nothing for anyone, as before.
    const unpublished = await run(ben);
    expect(await line(runner, unpublished)).toBeNull();
    expect(await inAccountRequest(ben.token, () => line(pools.runtime, unpublished))).toBeNull();
  });

  it("the owner-taking functions older than 0131 the API's requests call ask too: the removal notice, the review state, the lock of one's own runs", async () => {
    await database.pool.query("INSERT INTO serve.synthesis_check_removal_notice (owner_ref) VALUES ($1),($2)", [ana.ownerRef, ben.ownerRef]);
    const notice = (pool: Pool, owner: string, take = false) => pool.query<{ value: boolean }>(
      `SELECT serve.${take ? "take_synthesis_check_removal_notice" : "synthesis_check_removal_notice_exists"}($1) AS value`, [owner]).then((result) => result.rows[0]!.value);
    // Another's notice is no one's to see or take but its owner's; no session sees none.
    expect(await inAccountRequest(ana.token, () => notice(pools.runtime, ben.ownerRef))).toBe(false);
    expect(await inAccountRequest(ana.token, () => notice(pools.runtime, ben.ownerRef, true))).toBe(false);
    expect(await notice(apiRequest, ana.ownerRef)).toBe(false);
    expect(await notice(apiSystem, ben.ownerRef)).toBe(true);
    expect(await inAccountRequest(ana.token, () => notice(pools.runtime, ana.ownerRef))).toBe(true);
    expect(await inAccountRequest(ana.token, () => notice(pools.runtime, ana.ownerRef, true))).toBe(true);
    expect(await inAccountRequest(ana.token, () => notice(pools.runtime, ana.ownerRef))).toBe(false);
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM serve.synthesis_check_removal_notice WHERE owner_ref=$1", [ben.ownerRef])).rows[0]!.n)).toBe(1);

    // The review state of a debate the owner asked staff to review: its owner's request reads it, and the system login; another's, an anonymous
    // request or none is refused, never answered nothing (its rows are refusals: an open ask, an approval or two asks leave the owner no ask).
    const asked = await run(ana);
    const answerId = randomUUID();
    await seeded([["INSERT INTO serve.publication_review_request (review_ref,run_id,answer_id,synthesis_origin_version,ask_ordinal) VALUES ($1,$2,$3,1,1)",
      [randomUUID(), asked, answerId]]]);
    const review = (pool: Pool, owner: string) => pool.query("SELECT * FROM serve.read_publication_review_state($1,$2,$3)", [owner, asked, answerId])
      .then((result) => result.rowCount);
    expect(await inAccountRequest(ana.token, () => review(pools.runtime, ana.ownerRef))).toBe(1);
    expect(await inAccountRequest(ben.token, () => refusal(() => review(pools.runtime, ana.ownerRef)))).toEqual({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await inAccountRequest(null, () => refusal(() => review(pools.runtime, ana.ownerRef)))).toEqual({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await refusal(() => review(apiRequest, ana.ownerRef))).toEqual({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await review(apiSystem, ana.ownerRef)).toBe(1);
    // Its own owner asking of a debate that is not theirs reads nothing, as before: no rows is true there.
    expect(await inAccountRequest(ben.token, () => review(pools.runtime, ben.ownerRef))).toBe(0);

    // 0040's lock of a request's own live runs: an owner's runs for that owner's connection alone; a legacy asker's, by its asker id, as before.
    const legacy = randomUUID();
    await seeded([[`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
       depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low','{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture',
       '{}'::jsonb,$4)`, [legacy, `asker:legacy-${legacy}`, randomUUID(), ++sequence]]]);
    const lock = (pool: Pool, runId: string, owner: string | null, asker: string | null = null) => pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.lock_owned_live_runs($1::uuid[],$2::uuid,$3::text)", [[runId], owner, asker]).then((result) => result.rows.map((row) => row.run_id));
    expect(await inAccountRequest(ana.token, () => lock(pools.runtime, ana.runId, ana.ownerRef))).toEqual([ana.runId]);
    expect(await inAccountRequest(ana.token, () => lock(pools.runtime, ben.runId, ben.ownerRef))).toEqual([]);
    expect(await lock(apiRequest, ana.runId, ana.ownerRef)).toEqual([]);
    expect(await lock(apiSystem, ben.runId, ben.ownerRef)).toEqual([ben.runId]);
    expect(await inAccountRequest(ana.token, () => lock(pools.runtime, legacy, null, `asker:legacy-${legacy}`))).toEqual([legacy]);
    expect(await lock(apiRequest, legacy, null, `asker:legacy-${legacy}`)).toEqual([legacy]);
  });

  it("the engine's older run-keyed questions the API's requests call ask of the run's latest owner: a debate's unstarted re-admissions, its approval, and the check result's writer; whether the check removed it, a refusal, answers every connection alike", async () => {
    // An owner's debate with what each question finds: a copy that re-admits it and never started (no edge, no work item), a removal the check
    // stored, a staff approval of its first version, and an attempt of its check.
    const old = await run(ana);
    const copy = await run(ana);
    const answerId = randomUUID(), reviewRef = randomUUID(), attemptId = randomUUID();
    await seeded([
      ["INSERT INTO identity.run_execution_binding (execution_ref,user_id,identity_session_id,run_id,created_at,readmitted_from_run_id) VALUES ($1,$2,$3,$4,now(),$5)",
        [randomUUID(), ana.userId, ana.sessionId, copy, old]],
      ["INSERT INTO serve.synthesis_check_removal_request (request_id,result_id,run_id) VALUES ($1,$2,$3)", [randomUUID(), randomUUID(), old]],
      ["INSERT INTO serve.publication_review_request (review_ref,run_id,answer_id,synthesis_origin_version,ask_ordinal) VALUES ($1,$2,$3,1,1)", [reviewRef, old, answerId]],
      ["INSERT INTO serve.publication_review_decision (review_ref,run_id,outcome,reviewer_staff_id,content) VALUES ($1,$2,'APPROVE',$3,'{}'::jsonb)", [reviewRef, old, randomUUID()]],
      ["INSERT INTO serve.synthesis_check_attempt (attempt_id,run_id,answer_id,answer_version,origin) VALUES ($1,$2,$3,1,'PUBLISH')", [attemptId, old, answerId]]]);
    const listed = (pool: Pool, runId: string = old) => pool.query<{ run_id: string }>(
      "SELECT listed.run_id::text AS run_id FROM core.list_unstarted_readmissions($1::uuid) AS listed(run_id)", [runId]).then((result) => result.rows.map((row) => row.run_id));
    const removed = (pool: Pool, runId: string = old) => pool.query<{ value: boolean }>("SELECT serve.run_removed_by_synthesis_check($1) AS value", [runId])
      .then((result) => result.rows[0]!.value);
    const approved = (pool: Pool) => pool.query<{ value: boolean }>("SELECT serve.publication_review_approved($1,$2,1) AS value", [old, answerId])
      .then((result) => result.rows[0]!.value);
    // A failed, not final, result with no removal: past the attempt match, its answer's trigger refuses it, as no answer of that version is stored.
    const store = (pool: Pool) => refusal(() => pool.query(
      "SELECT serve.store_synthesis_check_result($1,$2,$3,$4,1,1,false,'UNEXPECTED','synthesis.content-check.v1@0123456789abcdef','{}'::jsonb,NULL,NULL,false)",
      [randomUUID(), attemptId, old, answerId]));
    const asked = (pool: Pool) => Promise.all([listed(pool), removed(pool), approved(pool), store(pool)]);
    const PAST_THE_MATCH = { code: "23503", message: "SYNTHESIS_CHECK_RUN_MISMATCH" };
    const NOT_ITS_OWN = { code: "23503", message: "SYNTHESIS_CHECK_ATTEMPT_MISMATCH" };
    // The owner's own request, on either request login, finds each; the system login finds each for any account, with no session.
    const found = [[copy], true, true, PAST_THE_MATCH];
    expect(await inAccountRequest(ana.token, () => asked(pools.runtime))).toEqual(found);
    expect(await inAccountRequest(ana.token, () => Promise.all([removed(pools.authorization), approved(pools.authorization), store(pools.authorization)])))
      .toEqual([true, true, PAST_THE_MATCH]);
    expect(await asked(apiSystem)).toEqual(found);
    // Another account's request, one with no session, an anonymous request or a revoked token: nothing listed, not approved, and the writer refuses
    // as for no attempt stored, before anything is written. Whether the check removed the debate is a refusal (each caller hides or refuses what it
    // answers true for), so it asks no owner and answers removed to every connection (0171 leaves it alone).
    const nothingFound = [[], true, false, NOT_ITS_OWN];
    expect(await inAccountRequest(ben.token, () => asked(pools.runtime))).toEqual(nothingFound);
    expect(await asked(apiRequest)).toEqual(nothingFound);
    expect(await inAccountRequest(null, () => asked(pools.runtime))).toEqual(nothingFound);
    expect(await inAccountRequest(ana.revokedToken, () => asked(pools.runtime))).toEqual(nothingFound);
    expect((await database.pool.query("SELECT 1 FROM serve.synthesis_check_result WHERE attempt_id=$1", [attemptId])).rowCount).toBe(0);
    // 0123's legacy asker's branch names no owner and is as it was: a legacy debate's unstarted copy is listed for any connection.
    const legacy = randomUUID(), legacyCopy = randomUUID(), asker = `asker:legacy-${randomUUID()}`, session = randomUUID();
    const legacyRun = (runId: string, releaseKey: string) => [`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
       depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,release_key)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low','{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture',
       '{}'::jsonb,$4,$5)`, [runId, asker, session, ++sequence, releaseKey]] as const;
    await seeded([legacyRun(legacy, "legacy"), legacyRun(legacyCopy, "r2-0123456789ab")]);
    expect(await listed(apiRequest, legacy)).toEqual([legacyCopy]);
    expect(await inAccountRequest(ben.token, () => listed(pools.runtime, legacy))).toEqual([legacyCopy]);
    // A legacy debate the check removed names no owner either, and reads as removed to every connection, its asker's included.
    await seeded([["INSERT INTO serve.synthesis_check_removal_request (request_id,result_id,run_id) VALUES ($1,$2,$3)", [randomUUID(), randomUUID(), legacy]]]);
    expect([await removed(apiRequest, legacy), await inAccountRequest(null, () => removed(pools.runtime, legacy)),
      await inAccountRequest(ana.token, () => removed(pools.runtime, legacy)), await removed(apiSystem, legacy)]).toEqual([true, true, true, true]);
    // Left alone on purpose (0171's header): whether a run's content is live still answers for another account's debate.
    expect((await inAccountRequest(ben.token, () => pools.runtime.query<{ live: boolean }>("SELECT core.run_private_content_is_live($1) AS live", [old]))).rows[0]!.live)
      .toBe(true);
  });

  it("on the production logins (P3-01's memberships): a debate's review state reads to its owner's session and the system login, and refuses another account's session and either request login with no session, so the owner's open ask never reads as may ask to them", async () => {
    const production = await logins!.production();
    const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
    const opened: Pool[] = [];
    const login = (id: "api-runtime" | "api-authorization" | "api-system", target?: Pool): Pool => {
      const pool = createPool(production.url(id), { max: 2, ...(target === undefined ? {} : { crossAccount: target }) });
      opened.push(pool);
      return pool;
    };
    try {
      const system = login("api-system");
      const request = login("api-runtime", login("api-system"));
      const [runtime, authorization] = [login("api-runtime"), login("api-authorization")];
      // Ana's flagged debate, with her first ask still open: she may not ask again until staff decide.
      const asked = await run(ana), answerId = randomUUID();
      await seeded([["INSERT INTO serve.publication_review_request (review_ref,run_id,answer_id,synthesis_origin_version,ask_ordinal) VALUES ($1,$2,$3,1,1)",
        [randomUUID(), asked, answerId]]]);
      const rows = (pool: Pool) => pool.query("SELECT * FROM serve.read_publication_review_state($1,$2,$3)", [ana.ownerRef, asked, answerId]).then((result) => result.rowCount);
      expect(await inAccountRequest(ana.token, () => rows(request))).toBe(1);
      expect(await rows(system)).toBe(1);
      for (const [label, by] of [["ben's session", () => inAccountRequest(ben.token, () => rows(request))],
        ["an anonymous request", () => inAccountRequest(null, () => rows(request))], ["api-runtime with no session", () => rows(runtime)],
        ["api-authorization with no session", () => rows(authorization)]] as const) expect(await refusal(by), label).toEqual(MISMATCH);
      // The repository the review state's route, the answer index and the export read through: the open ask in her own request (UNDER_REVIEW, no
      // ask left), and on the system login, where the export reads it; another's request is refused, never answered NONE with an ask open to it.
      const states = (pool: Pool) => new PublicationReviewRepository(pool).readStates({ ownerRef: ana.ownerRef, runId: asked, answerId });
      expect(reviewStateOf(await inAccountRequest(ana.token, () => states(request)), 1)).toMatchObject({ state: "UNDER_REVIEW", asksUsed: 1, mayAsk: false });
      expect(reviewStateOf(await states(system), 1)).toMatchObject({ state: "UNDER_REVIEW", asksUsed: 1, mayAsk: false });
      expect(await refusal(() => inAccountRequest(ben.token, () => states(request)))).toEqual(MISMATCH);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("on the production logins (P3-01's memberships): a debate the check removed reads as removed to its owner's session, another account's, either request login with no session and the system login, and its answer's access reads REMOVED", async () => {
    const production = await logins!.production();
    const opened: Pool[] = [];
    const login = (id: "api-runtime" | "api-authorization" | "api-system", target?: Pool): Pool => {
      const pool = createPool(production.url(id), { max: 2, ...(target === undefined ? {} : { crossAccount: target }) });
      opened.push(pool);
      return pool;
    };
    try {
      // main.ts's request pool (its own connections inside a request, its system twin outside one), each request login on a connection of its own
      // with no session presented, and the system login the staff review (X28), the export and the worker read on.
      const system = login("api-system");
      const request = login("api-runtime", login("api-system"));
      const [runtime, authorization] = [login("api-runtime"), login("api-authorization")];
      // An owner's debate and a legacy one (no ownership event), each with the removal the check stored.
      const owned = await run(ana), legacy = randomUUID();
      await seeded([[`INSERT INTO core.run
        (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
         depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq)
        VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low','{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture',
         '{}'::jsonb,$4)`, [legacy, `asker:legacy-${legacy}`, randomUUID(), ++sequence]],
        ...[owned, legacy].map((runId) => ["INSERT INTO serve.synthesis_check_removal_request (request_id,result_id,run_id) VALUES ($1,$2,$3)",
          [randomUUID(), randomUUID(), runId]] as const)]);
      const removed = (pool: Pool) => Promise.all([owned, legacy].map((runId) => pool.query<{ value: boolean }>(
        "SELECT serve.run_removed_by_synthesis_check($1) AS value", [runId]).then((result) => result.rows[0]!.value)));
      const readers: ReadonlyArray<readonly [string, () => Promise<boolean[]>]> = [
        ["the owner's own session", () => inAccountRequest(ana.token, () => removed(request))],
        ["another account's session", () => inAccountRequest(ben.token, () => removed(request))],
        ["an anonymous request", () => inAccountRequest(null, () => removed(request))],
        ["api-runtime with no session", () => removed(runtime)],
        ["api-authorization with no session", () => removed(authorization)],
        ["the system login with no session", () => removed(system)]
      ];
      for (const [label, read] of readers) expect(await read(), label).toEqual([true, true]);
      // The answer page's and the index's access state (packages/serve's readAnswerAccess): REMOVED, never SHOW or HELD, whoever's request reads it.
      const access = (pool: Pool) => new SynthesisCheckRepository(pool).readAnswerAccess({ runId: owned, deadlineMs: 1_000 });
      expect(await inAccountRequest(ana.token, () => access(request))).toBe("REMOVED");
      expect(await inAccountRequest(ben.token, () => access(request))).toBe("REMOVED");
      expect(await access(system)).toBe("REMOVED");
      expect(await inAccountRequest(ana.token, () => new SynthesisCheckRepository(request).runRemovedByCheck(owned))).toBe(true);
      expect(await new SynthesisCheckRepository(runtime).runRemovedByCheck(legacy)).toBe(true);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("the census sees every definer either request login may EXECUTE: each asks the connection, is gated by a secret it is handed, is a public or site reader, is left alone on purpose, or came with the V4 merge and is named as not reviewed", async () => {
    const production = await logins!.production();
    const names = [production.url("api-runtime"), production.url("api-authorization")].map((url) => decodeURIComponent(new URL(url).username));
    const rows = (await database.pool.query<{ signature: string; source: string }>(`
      SELECT p.oid::regprocedure::text AS signature, p.prosrc AS source
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND (has_function_privilege($1, p.oid, 'EXECUTE') OR has_function_privilege($2, p.oid, 'EXECUTE')) ORDER BY 1`,
    names)).rows;
    // The five lists partition every reachable definer, each in exactly one, so a new, a removed or a newly reachable one fails.
    const named = [...ASKS_CONNECTION, ...GATED, ...PUBLIC, ...Object.keys(LEFT_ALONE), ...Object.keys(ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED)];
    expect(new Set(named).size, "a signature is in two lists").toBe(named.length);
    expect(rows.map((row) => row.signature)).toEqual([...named].sort());
    // Each list is what it says: the asking ones ask the connection, and none of the other four does.
    const source = new Map(rows.map((row) => [row.signature, row.source] as const));
    for (const signature of ASKS_CONNECTION) expect(ASKS.test(source.get(signature)!), signature).toBe(true);
    for (const signature of [...GATED, ...PUBLIC, ...Object.keys(LEFT_ALONE), ...Object.keys(ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED)]) expect(ASKS.test(source.get(signature)!), signature).toBe(false);
    // And each one left alone, or not yet reviewed, says why.
    for (const [signature, reason] of Object.entries({ ...LEFT_ALONE, ...ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED })) expect(reason.trim().length, signature).toBeGreaterThan(20);
    // Two that are no request login's at all now: 0151's flag settlement (the press settles on its system login, X38) and
    // 0128's threat report keepers (they name an account, and nothing calls them).
    expect(rows.map((row) => row.signature)).not.toContain("identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)");
    expect(rows.map((row) => row.signature).filter((signature) => signature.startsWith("staff.keep_threat_report"))).toEqual([]);
    // The web evidence's reader keeps its liveness question for the export worker's login alone, which no request login holds.
    for (const name of names) {
      expect((await database.pool.query<{ member: boolean }>("SELECT pg_has_role($1, 'debateai_data_export_worker', 'MEMBER') AS member", [name])).rows[0]!.member, name).toBe(false);
    }
  }, 300_000);

  /**
   * 0048's writer of a provider's probe. The API's ask-time discovery takes a provider's latest row (0040's latest_provider_probes, by probed_at) and
   * probes only a provider whose latest row is stale, so before 0171 a request login with no session could keep a provider on the panel unprobed with a
   * HEALTHY row dated now, one freshness window per row, or make every ask probe it again with a row dated later, until that date. The writer is the
   * marker's alone now: the API records the probes its discovery makes through its site X37, the system login, and the runner on its own login.
   */
  it("on the production logins (P3-01's memberships): 0048's writer of a provider's probe is the marker's alone; either request login is refused it, with a session or none, at any date, and the system logins and the runner record", async () => {
    const production = await logins!.production();
    const opened: Pool[] = [];
    const open = (id: Parameters<typeof production.url>[0], target?: Pool): Pool => {
      const pool = createPool(production.url(id), target === undefined ? { max: 2 } : { max: 2, crossAccount: target });
      opened.push(pool);
      return pool;
    };
    const eve = await seedSessionAccount(database.pool, "f5-probe-writer");
    const providerRef = `provider:review-${randomUUID()}`;
    const record = (pool: Pool, probedAt: string) =>
      pool.query("SELECT core.record_provider_probe($1,$2,'maker:review','HEALTHY','model:review',NULL,$3)", [randomUUID(), providerRef, probedAt]);
    const DENIED = { code: "42501", message: "permission denied for function record_provider_probe" };
    try {
      for (const [id, system] of [["api-runtime", "api-system"], ["api-authorization", "api-authorization-system"]] as const) {
        // As main.ts builds the request pool (its own login inside a request, its system twin outside one), and the bare login with no session.
        const request = open(id, open(system));
        const bare = open(id);
        // A forged HEALTHY row dated now, which would spare the next ask its probe, and one dated far ahead, which would outrank every probe after it.
        for (const probedAt of [new Date().toISOString(), "9999-01-01T00:00:00Z"]) {
          expect(await refusal(() => inAccountRequest(eve.token, () => record(request, probedAt))), `${id} with a session, ${probedAt}`).toEqual(DENIED);
          expect(await refusal(() => inAccountRequest(null, () => record(request, probedAt))), `${id} anonymous, ${probedAt}`).toEqual(DENIED);
          expect(await refusal(() => record(bare, probedAt)), `${id} with no session, ${probedAt}`).toEqual(DENIED);
        }
      }
      // The logins that hold the marker record, with no session: the API's two system logins and the runner's.
      for (const id of ["api-system", "api-authorization-system", "runner-runtime"] as const) await record(open(id), new Date().toISOString());
      expect((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM core.provider_probe WHERE provider_ref=$1", [providerRef])).rows[0]!.n).toBe("3");
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("on the production logins (P3-01's memberships): the API's ask-time discovery, wired as main.ts wires it, records each probe on its system login (X37) and reads the latest on the request login, in a signed-in request and an anonymous one", async () => {
    const production = await logins!.production();
    const target = createPool(production.url("api-system"), { max: 2 });
    const request = createPool(production.url("api-runtime"), { max: 2, crossAccount: target });
    const eve = await seedSessionAccount(database.pool, "f5-probe-discovery");
    try {
      // One provider of the site's, under a ref no other test writes; its vendor answers every probe HEALTHY, and each call is counted.
      const providerRef = `provider:review-${randomUUID()}`, maker = "maker:review", model = "model:review";
      const configuredProviders = [{ providerRef, maker }];
      let calls = 0;
      const fetchImplementation = (async () => {
        calls += 1;
        return new Response(JSON.stringify({ id: `probe-${calls}`, model, choices: [{ message: { role: "assistant", content: "OK" } }] }),
          { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
      // The request pool's own login writes no probe, the person's own session included: the writer is the marker's.
      expect(await refusal(() => inAccountRequest(eve.token, () => new ProviderProbeRepository(request).record({ probeEvidenceRef: randomUUID(), providerRef, maker,
        state: "HEALTHY", modelId: model, failureCode: null, probedAt: new Date() })))).toEqual({ code: "42501", message: "permission denied for function record_provider_probe" });
      expect(calls).toBe(0);
      // The discovery as main.ts builds it: its probes read on the request pool and recorded on that pool's system target, the site X37.
      const probeReader = new ProviderProbeRepository(request);
      const probeRecorder = new ProviderProbeRepository(crossAccountPool(request, "X37"));
      const probes: ProviderDiscoveryProbeStore = Object.freeze({
        readLatest: (providerRefs) => probeReader.readLatest(providerRefs),
        record: (observation) => probeRecorder.record(observation)
      });
      const resolve = createProviderDiscoveryResolver({
        configuredProviders, probes, probeFreshnessMs: 600_000, probeTimeoutMs: 1_000, fetchImplementation,
        targets: parseProviderDiscoveryTargets(JSON.stringify([{ provider_ref: providerRef, base_url: "http://127.0.0.1:9/v1", model }]), configuredProviders)
      });
      const rows = async () => (await database.pool.query<{ probe_id: string; state: string }>(
        "SELECT probe_id, state FROM core.provider_probe WHERE provider_ref=$1 ORDER BY probed_at", [providerRef])).rows;
      // A signed-in ask: the provider has no row, so it is probed once and its row recorded, and the panel names that row.
      const first = await inAccountRequest(eve.token, resolve);
      expect(calls).toBe(1);
      expect(await rows()).toEqual([{ probe_id: first[0]!.probe_evidence_ref, state: "HEALTHY" }]);
      // An anonymous ask within the freshness window reads that row on the request login and probes nothing; the signed-in request reads it too.
      expect((await inAccountRequest(null, resolve)).map((member) => member.probe_evidence_ref)).toEqual([first[0]!.probe_evidence_ref]);
      expect(calls).toBe(1);
      expect((await inAccountRequest(eve.token, () => probes.readLatest([providerRef]))).map((probe) => probe.probeEvidenceRef))
        .toEqual([first[0]!.probe_evidence_ref]);
      expect(await rows()).toHaveLength(1);
    } finally { await request.end(); await target.end(); }
  }, 300_000);

  it("the write-loops the API drains from its gated timers, which the census tells apart only by what they ask, are these alone and ask nothing of the connection", async () => {
    const production = await logins!.production();
    const names = [production.url("api-runtime"), production.url("api-authorization")].map((url) => decodeURIComponent(new URL(url).username));
    const loops = (await database.pool.query<{ signature: string }>(`
      SELECT p.oid::regprocedure::text AS signature
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND (has_function_privilege($1, p.oid, 'EXECUTE') OR has_function_privilege($2, p.oid, 'EXECUTE'))
        AND coalesce((SELECT bool_and(argument = ANY (ARRAY['integer','bigint','uuid','text','boolean','timestamp with time zone']))
          FROM unnest(coalesce(p.proargtypes::regtype[], '{}'::regtype[])::text[]) AS argument), true)
        AND coalesce((SELECT bool_and(part = ANY (ARRAY['p','limit','capacity','claim','notice','alert','outbox','lease','id','outcome','failure','code','delivered','now','after']))
          FROM unnest(p.proargnames[1:p.pronargs]) AS name, unnest(string_to_array(name, '_')) AS part), true)
        AND (p.prosrc ~ 'INSERT INTO' OR p.prosrc ~ 'DELETE FROM' OR p.prosrc ~ 'UPDATE .* SET')
        AND p.prosrc NOT LIKE '%pg_has_role(session_user, ''debateai_rls_all_accounts''%' ORDER BY 1`,
    names)).rows.map((row) => row.signature);
    expect(loops).toEqual([...LOOP_WRITERS, ...ARRIVED_LOOP_WRITERS].sort());
    for (const signature of LOOP_WRITERS) expect(Object.keys(LEFT_ALONE), signature).toContain(signature);
    for (const signature of ARRIVED_LOOP_WRITERS) expect(Object.keys(ARRIVED_WITH_THE_V4_MERGE_NOT_REVIEWED), signature).toContain(signature);
  }, 300_000);

  it("the relations either request login may INSERT, UPDATE or DELETE whose row security is off are these alone, each append-only or the one-row counter", async () => {
    const production = await logins!.production();
    const names = [production.url("api-runtime"), production.url("api-authorization")].map((url) => decodeURIComponent(new URL(url).username));
    const writableOn = async (client: Pool | PoolClient): Promise<string[]> => (await client.query<{ relation: string }>(`
      SELECT c.oid::regclass::text AS relation
      FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace CROSS JOIN unnest($1::name[]) AS login
      WHERE c.relkind IN ('r','p','v','m','f','S') AND NOT c.relrowsecurity AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(login, c.oid, 'USAGE,UPDATE')
          ELSE has_table_privilege(login, c.oid, 'INSERT,UPDATE,DELETE') OR has_any_column_privilege(login, c.oid, 'INSERT,UPDATE') END
      GROUP BY 1 ORDER BY 1`,
    [names])).rows.map((row) => row.relation);
    expect(await writableOn(database.pool)).toEqual([...WRITABLE_RLS_OFF].sort());
    // The census sees every way such a right reaches a request login, each proved here on a probe its transaction rolls back: a column-level
    // UPDATE (has_table_privilege reports none), INSERT on a view (it writes as its owner, past the base table's row security) and a sequence's
    // UPDATE (setval).
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA census_probe");
      await client.query("CREATE TABLE census_probe.column_grant (id integer PRIMARY KEY, note text)");
      await client.query("GRANT UPDATE (note) ON census_probe.column_grant TO debateai_runtime");
      await client.query("CREATE VIEW census_probe.writable_view AS SELECT 1 AS one");
      await client.query("GRANT INSERT ON census_probe.writable_view TO debateai_runtime");
      await client.query("CREATE SEQUENCE census_probe.counter");
      await client.query("GRANT UPDATE ON SEQUENCE census_probe.counter TO debateai_runtime");
      await client.query("GRANT USAGE ON SCHEMA census_probe TO debateai_runtime");
      expect(await writableOn(client))
        .toEqual([...WRITABLE_RLS_OFF, "census_probe.column_grant", "census_probe.counter", "census_probe.writable_view"].sort());
    } finally { await client.query("ROLLBACK"); client.release(); }
  }, 300_000);
});

describe("F5: an account's own functions keyed by a user id ask the connection, the sign-up writers write only in the sign-up's transaction, a delivery names its mail's token, and the sign-in secrets are the system login's", () => {
  /** The source context an audited call carries, as the repositories hash it (made up). */
  const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
  /** The sign-in and recovery functions the API calls only through its repositories' X36 site now, each with the request role it was taken from. */
  const SIGN_IN = [
    ["identity.read_consumer_passkey_credential(text,text,text)", "debateai_authorization_runtime"],
    ["identity.complete_consumer_passkey_login(jsonb,jsonb)", "debateai_authorization_runtime"],
    ["identity.read_consumer_recovery_proof(text,integer)", "debateai_authorization_runtime"],
    ["identity.prove_consumer_recovery(jsonb,jsonb)", "debateai_authorization_runtime"],
    ["identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamp with time zone,jsonb)", "debateai_runtime"]
  ] as const;
  const DELIVERY = "identity.record_verification_delivery_with_audit(uuid,text,timestamp with time zone,boolean,text,jsonb)";
  const OLD_DELIVERY = "identity.record_verification_delivery_with_audit(uuid,timestamp with time zone,boolean,text,jsonb)";
  let pools: ApiTestPools;
  let ana: RlsTestAccount;
  let ben: RlsTestAccount;
  const login = (key: Parameters<RlsLogins["url"]>[0]): string => decodeURIComponent(new URL(logins!.url(key)).username);
  const refusal = async (work: () => Promise<unknown>): Promise<SqlError> => {
    const { code, message } = await sqlError(work);
    return { code, message };
  };
  /** One audited call as the repositories make it: its own transaction, the audit attempt begun first. */
  async function audited<T>(pool: Pool, sql: string, values: readonly unknown[]): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const value = (await client.query<{ value: T }>(sql, [...values])).rows[0]?.value as T;
      await client.query("COMMIT");
      return value;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  /** What the account's readers hand back on `pool`: its age check, its consent, its email settings (rows), its export's status. */
  const readsOf = async (pool: Pool, account: RlsTestAccount) => ({
    age: (await pool.query("SELECT identity.read_age_check_outcome($1) AS value", [account.userId])).rows[0]!.value,
    consent: (await pool.query("SELECT identity.read_sensitive_data_consent($1) AS value", [account.userId])).rows[0]!.value,
    settings: (await pool.query("SELECT count(*)::int AS value FROM identity.read_email_settings($1,$2)", [account.userId, account.sessionId])).rows[0]!.value,
    export: (await pool.query("SELECT status AS value FROM identity.read_data_export_status($1)", [account.userId])).rows[0]!.value
  });
  const own = { age: "passed", consent: true, settings: 1, export: "SENT" };
  const nothing = { age: "required", consent: false, settings: 0, export: "NONE" };
  /** An email change waiting for its confirmation; the hash its confirmation link carries. */
  async function emailChange(account: RlsTestAccount): Promise<void> {
    await database.pool.query(`INSERT INTO identity.email_change_request(email_change_id,user_id,new_email_blind_index,new_email_ciphertext,
        confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`,
    [randomUUID(), account.userId, createHash("sha256").update(randomUUID()).digest(), JSON.stringify(ENVELOPE), hash(randomUUID()), hash(randomUUID())]);
  }
  /** A data export sent and not yet expired; its id. */
  async function sentExport(account: RlsTestAccount): Promise<string> {
    const exportId = randomUUID();
    await database.pool.query(`WITH t AS (SELECT clock_timestamp() AS at) INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,
        link_token_hash,archive_sha256,archive_bytes,sent_at,expires_at)
      SELECT $1,$2,$3,'en','SENT',t.at-interval '2 hours',$4,$5,100,t.at-interval '1 hour',t.at+interval '23 hours' FROM t`,
    [exportId, account.userId, account.sessionId, hash(randomUUID()), "a".repeat(64)]);
    return exportId;
  }
  /** A publication's key provision the account prepared and has not finished; its link. */
  async function provision(account: RlsTestAccount): Promise<string> {
    const ref = randomUUID();
    await database.pool.query(`INSERT INTO serve.publication_key_provision_intent(publication_ref,run_id,user_id,owner_ref,session_id,
        grant_token_hash,requested_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp()+interval '1 hour')`,
    [ref, account.runId, account.userId, account.ownerRef, account.sessionId, hash(randomUUID())]);
    return ref;
  }
  /** Every write the account's own functions make, as the superuser reads them. */
  const writesOf = async (account: RlsTestAccount, ref: string, exportId: string) => (await database.pool.query(`SELECT
      (SELECT count(*)::int FROM identity.session WHERE user_id=$1 AND revoked_at IS NOT NULL) AS revoked,
      (SELECT count(*)::int FROM identity.age_check WHERE user_id=$1) AS age,
      (SELECT count(*)::int FROM identity.sensitive_data_consent WHERE user_id=$1) AS consent,
      (SELECT count(*)::int FROM identity.email_change_request WHERE user_id=$1 AND last_sent_at > clock_timestamp() - interval '1 minute') AS resent,
      (SELECT count(*)::int FROM serve.publication_key_provision_intent WHERE publication_ref=$2 AND expires_at <= clock_timestamp()) AS abandoned,
      (SELECT count(*)::int FROM identity.publication_event_binding WHERE user_id=$1) AS reserved,
      (SELECT count(*)::int FROM identity.audit_event WHERE event_type='identity.data_export.downloaded' AND target_id=$3) AS downloaded`,
  [account.userId, ref, exportId])).rows[0]!;

  beforeAll(async () => {
    pools = logins!.apiPools();
    ana = await seedSessionAccount(database.pool, "f5-account-ana");
    ben = await seedSessionAccount(database.pool, "f5-account-ben");
    for (const account of [ana, ben]) {
      await database.pool.query(`INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at)
        VALUES($1,'passed',18,'RO','2026-08-21-v1','existing_account',now())`, [account.userId]);
      await database.pool.query("INSERT INTO identity.sensitive_data_consent(user_id,notice_version,locale,consented_at) VALUES($1,'v1','en',now())", [account.userId]);
      await sentExport(account);
    }
  }, 120_000);

  it("an account's readers serve its own request, and answer as for nothing stored to another account's session, a dead one or none; the system login reads any", async () => {
    // Before 0171 the authorization login, with any session or none, read any account's age check, consent, export state and email addresses.
    expect(await inAccountRequest(ana.token, () => readsOf(pools.authorization, ana))).toEqual(own);
    expect(await inAccountRequest(ben.token, () => readsOf(pools.authorization, ben))).toEqual(own);
    for (const token of [ben.token, ana.revokedToken, ana.expiredToken, null]) {
      expect(await inAccountRequest(token, () => readsOf(pools.authorization, ana)), String(token)).toEqual(nothing);
    }
    // The system login, which holds the marker (the API's sweeps and its sign-in steps outside a request), reads any account's with no session.
    for (const account of [ana, ben]) expect(await readsOf(pools.authorizationSystem, account)).toEqual(own);
  });

  it("an account's writers act only in its own request: another account's session, or none, revokes, confirms, consents, resends, reserves, abandons and downloads nothing", async () => {
    // Before 0171 any request on the authorization or runtime login, with a session or none, did each of these to any account it named.
    const victim = await seedSessionAccount(database.pool, "f5-account-victim");
    const second = await seedLiveSession(database.pool, victim.userId);
    const secondId = (await database.pool.query<{ session_id: string }>("SELECT session_id FROM identity.session WHERE token_hash=$1", [hashToken("session", second)])).rows[0]!.session_id;
    await emailChange(victim);
    const exportId = await sentExport(victim);
    const ref = await provision(victim);
    const before = await writesOf(victim, ref, exportId);
    const calls = (account: RlsTestAccount) => ({
      revoke: () => audited(pools.authorization, "SELECT identity.revoke_session_with_audit($1,$2,clock_timestamp(),$3::jsonb) AS value", [account.userId, secondId, SOURCE]),
      age: () => audited(pools.authorization, `SELECT identity.confirm_account_age_with_audit($1,$2,true,18::smallint,'RO','2026-08-21-v1',clock_timestamp(),$3::jsonb) AS value`,
        [account.userId, account.sessionId, SOURCE]),
      consent: () => pools.authorization.query("SELECT identity.record_sensitive_data_consent($1,$2,'v1','en',clock_timestamp()) AS value", [account.userId, account.sessionId])
        .then((result) => result.rows[0]!.value),
      resend: () => audited(pools.authorization, `SELECT result_status AS value FROM identity.resend_email_change_with_audit($1,$2,$3,clock_timestamp()+interval '1 hour',1000,$4::jsonb)`,
        [account.userId, account.sessionId, hash(randomUUID()), SOURCE]),
      reserve: () => pools.runtime.query("SELECT count(*)::int AS value FROM identity.reserve_publication_event_refs($1,$2,NULL,'PREFLIGHT_DENIAL',NULL)", [account.userId, account.sessionId])
        .then((result) => result.rows[0]!.value),
      abandon: () => pools.runtime.query("SELECT serve.abandon_publication_key_provision($1,$2) AS value", [ref, account.userId]).then((result) => result.rows[0]!.value),
      download: () => refusal(() => audited(pools.authorization, "SELECT identity.record_data_export_download($1,$2,$3::jsonb) AS value", [exportId, account.userId, SOURCE])),
      revokeAll: () => audited(pools.authorization, "SELECT identity.revoke_all_sessions_with_audit($1,$2,clock_timestamp(),$3::jsonb) AS value", [account.userId, account.sessionId, SOURCE])
    });
    const refused = { revoke: false, age: "SESSION_NOT_FOUND", consent: "SESSION_NOT_FOUND", resend: "NONE", reserve: 0, abandon: false,
      download: { code: "P0001", message: "DATA_EXPORT_LINK_INVALID" }, revokeAll: 0 };
    for (const token of [ben.token, victim.revokedToken, null]) {
      const answered: Record<string, unknown> = {};
      for (const [name, call] of Object.entries(calls(victim))) answered[name] = await inAccountRequest(token, call);
      expect(answered, String(token)).toEqual(refused);
    }
    // Nothing of the victim's changed: no session revoked, no age check or consent recorded, no resend, no intent expired, no event reserved, no
    // download audited.
    expect(await writesOf(victim, ref, exportId)).toEqual(before);
    // The victim's own request does each.
    const done: Record<string, unknown> = {};
    for (const [name, call] of Object.entries(calls(victim))) done[name] = await inAccountRequest(victim.token, call);
    expect(done).toEqual({ revoke: true, age: "passed", consent: "given", resend: "RESENT", reserve: 1, abandon: true,
      download: { code: undefined, message: undefined }, revokeAll: 2 });
    // Its second session, then the rest (the live one and the expired one, still unrevoked); one event's refs, one download.
    expect(await writesOf(victim, ref, exportId)).toEqual({ revoked: before.revoked + 3, age: 1, consent: 1, resent: 1, abandoned: 1, reserved: 1, downloaded: 1 });
  });

  it("the sign-up writers write only for an account their own transaction created: one made earlier is refused on every login, a session's own included", async () => {
    // Before 0171 the API's request login wrote a passed age check and a region, and an Italy approval after any account's terms, for any account
    // still pending.
    const pending = await account();
    await database.pool.query(`UPDATE identity."user" SET state='pending_verification' WHERE user_id=$1`, [pending.userId]);
    const age = (pool: Pool) => refusal(() => pool.query("SELECT identity.record_registration_age_check($1,18::smallint,'RO','2026-08-21-v1',now())", [pending.userId]));
    const region = (pool: Pool) => refusal(() => pool.query("SELECT identity.record_registration_region($1,'RO',NULL)", [pending.userId]));
    const italy = (pool: Pool) => refusal(() => pool.query("SELECT identity.record_signup_italy_approval($1,$2::jsonb)", [pending.userId, JSON.stringify({ acceptance_id: randomUUID() })]));
    for (const token of [null, ana.token]) {
      expect(await inAccountRequest(token, () => age(pools.runtime))).toEqual({ code: "22023", message: "AGE_CHECK_ACCOUNT_INVALID" });
      expect(await inAccountRequest(token, () => age(pools.authorization))).toEqual({ code: "22023", message: "AGE_CHECK_ACCOUNT_INVALID" });
      expect(await inAccountRequest(token, () => region(pools.runtime))).toEqual({ code: "22023", message: "REGION_ACCOUNT_INVALID" });
      expect(await inAccountRequest(token, () => italy(pools.runtime))).toEqual({ code: "22023", message: "ITALY_APPROVAL_ACCOUNT_INVALID" });
    }
    expect(await age(apiSystem)).toEqual({ code: "22023", message: "AGE_CHECK_ACCOUNT_INVALID" });
    expect(await region(apiSystem)).toEqual({ code: "22023", message: "REGION_ACCOUNT_INVALID" });
    expect(await italy(apiSystem)).toEqual({ code: "22023", message: "ITALY_APPROVAL_ACCOUNT_INVALID" });
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.age_check WHERE user_id=$1", [pending.userId])).rows[0]!.n).toBe(0);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.registration_region WHERE user_id=$1", [pending.userId])).rows[0]!.n).toBe(0);
    // In the transaction that creates the account, as the API's sign-up writes each, the writers write; a savepoint inside it changes nothing.
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      const userId = randomUUID();
      await client.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
        VALUES ($1,$2,'{}','{}','fixture-password',$3,'pending_verification',now())`, [userId, createHash("sha256").update(userId).digest(), `review-${userId}`]);
      await client.query("SET LOCAL ROLE debateai_billing_runtime");
      await client.query("SAVEPOINT region");
      await client.query("SELECT identity.record_registration_age_check($1,18::smallint,'RO','2026-08-21-v1',now())", [userId]);
      await client.query("SELECT identity.record_registration_region($1,'RO',NULL)", [userId]);
      await client.query("RELEASE SAVEPOINT region");
      await client.query("RESET ROLE");
      expect((await client.query<{ n: number }>("SELECT count(*)::int AS n FROM identity.age_check WHERE user_id=$1 AND context='registration'", [userId]))
        .rows[0]!.n).toBe(1);
      await client.query("SET LOCAL ROLE debateai_billing_runtime");
      expect((await client.query("SELECT identity.record_signup_italy_approval($1,$2::jsonb)", [userId, "{}"]).catch((error: SqlError) => error)) as SqlError)
        .toMatchObject({ code: "22023", message: "ITALY_APPROVAL_TERMS_MISSING" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("a verification mail's delivery is recorded only for the token that mail carried; 0085's record of any account's is no role's", async () => {
    // Before 0171 the API's request login, with no session, marked any account's address delivered or failed and audited it under that account.
    const delivered = async (userId: string) => (await database.pool.query<{ status: string | null; error: string | null }>(
      "SELECT delivery_status AS status, delivery_error AS error FROM identity.channel_binding WHERE user_id=$1 AND channel_type='email'", [userId])).rows[0];
    const pending = async (): Promise<{ userId: string; tokenHash: string }> => {
      const { userId } = await account();
      const tokenHash = hashToken("verification", generateVerificationToken());
      const channel = (await database.pool.query<{ channel_binding_id: string }>(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,
          verification_token_hash,verification_expires_at,delivery_status) VALUES($1,'email',$2::jsonb,'pending_verification',$3,now()+interval '1 day','pending') RETURNING channel_binding_id`,
      [userId, JSON.stringify(ENVELOPE), tokenHash])).rows[0]!.channel_binding_id;
      await database.pool.query(`UPDATE identity."user" SET state='pending_verification' WHERE user_id=$1`, [userId]);
      await database.pool.query(`INSERT INTO identity.verification_token_credential(token_hash,channel_binding_id,issued_at,expires_at)
        VALUES($1,$2,now(),now()+interval '1 day')`, [tokenHash, channel]);
      return { userId, tokenHash };
    };
    const [mine, theirs] = [await pending(), await pending()];
    const record = (pool: Pool, userId: string, tokenHash: string, success: boolean) => audited<boolean>(pool,
      "SELECT identity.record_verification_delivery_with_audit($1,$2,clock_timestamp(),$3,$4,$5::jsonb) AS value",
      [userId, tokenHash, success, success ? null : "MAIL_DELIVERY_FAILED", SOURCE]);
    // A sign-up's own request, no session yet: its own mail's token records; another account's token, or one made up, records nothing anywhere.
    expect(await inAccountRequest(null, () => record(pools.runtime, theirs.userId, mine.tokenHash, false))).toBe(false);
    expect(await inAccountRequest(null, () => record(pools.runtime, theirs.userId, hashToken("verification", generateVerificationToken()), false))).toBe(false);
    expect(await delivered(theirs.userId)).toEqual({ status: "pending", error: null });
    expect(await inAccountRequest(null, () => record(pools.runtime, mine.userId, mine.tokenHash, true))).toBe(true);
    expect(await delivered(mine.userId)).toEqual({ status: "sent", error: null });
    // A token already used to verify still names its own mail (a late delivery callback after the person clicked).
    await database.pool.query("UPDATE identity.verification_token_credential SET consumed_at=now() WHERE token_hash=$1", [theirs.tokenHash]);
    expect(await record(apiSystem, theirs.userId, theirs.tokenHash, false)).toBe(true);
    expect(await delivered(theirs.userId)).toEqual({ status: "failed", error: "MAIL_DELIVERY_FAILED" });
    // 0085's own, which named no token, is no request login's and no system login's: the function stays, its owner's alone.
    for (const pool of [pools.runtime, pools.authorization, apiSystem, runner]) {
      expect(await refusal(() => audited(pool, "SELECT identity.record_verification_delivery_with_audit($1,clock_timestamp(),true,NULL,$2::jsonb) AS value", [mine.userId, SOURCE])))
        .toEqual({ code: "42501", message: "permission denied for function record_verification_delivery_with_audit" });
    }
    const grants = (signature: string) => database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [signature]).then((result) => result.rows.map((row) => row.grantee));
    expect(await grants(OLD_DELIVERY)).toEqual([]);
    expect(await grants(DELIVERY)).toEqual(["debateai_runtime"]);
  });

  it("the sign-in and recovery secrets are the system login's: no request login reads a stored passkey or recovery proof, completes a passkey sign-in, proves a recovery or uses a code; the system logins may", async () => {
    // Before 0171 the authorization request login, with no session, read any passkey's stored credential and any recovery's proof once it had begun
    // a challenge or recovery with a token of its own, and completed a sign-in or a recovery on the API's word, which no secret the database holds gates.
    const calls = [
      ["SELECT identity.read_consumer_passkey_credential($1,$2,$3)", [hash("handle"), "credential", hash("binding")], pools.authorization],
      ["SELECT identity.complete_consumer_passkey_login($1::jsonb,$2::jsonb)", [{}, SOURCE], pools.authorization],
      ["SELECT identity.read_consumer_recovery_proof($1,1)", [hash("recovery")], pools.authorization],
      ["SELECT identity.prove_consumer_recovery($1::jsonb,$2::jsonb)", [{}, SOURCE], pools.authorization],
      ["SELECT identity.consume_recovery_code_with_audit($1,$2,NULL,clock_timestamp(),$3::jsonb)", [ana.userId, randomUUID(), SOURCE], pools.runtime]
    ] as const;
    for (const [sql, values, pool] of calls) {
      const name = /SELECT identity\.([a-z_]+)\(/u.exec(sql)![1]!;
      for (const token of [ana.token, null]) {
        expect(await inAccountRequest(token, () => refusal(() => pool.query(sql, [...values]))), `${name} ${String(token)}`)
          .toEqual({ code: "42501", message: `permission denied for function ${name}` });
      }
    }
    // Each is the marker's now, and no request role's: the API's two system logins hold it, the request logins hold neither.
    for (const [signature, role] of SIGN_IN) {
      const holds = await database.pool.query<{ request: boolean; authorization: boolean; system: boolean; authorization_system: boolean; role: boolean }>(`SELECT
          has_function_privilege($2,$1,'EXECUTE') AS request, has_function_privilege($3,$1,'EXECUTE') AS authorization,
          has_function_privilege($4,$1,'EXECUTE') AS system, has_function_privilege($5,$1,'EXECUTE') AS authorization_system,
          has_function_privilege($6,$1,'EXECUTE') AS role`,
      [signature, login("DATABASE_URL"), login("AUTHORIZATION_DATABASE_URL"), login("API_SYSTEM_DATABASE_URL"), login("API_AUTHORIZATION_SYSTEM_DATABASE_URL"), role]);
      expect(holds.rows[0], signature).toEqual({ request: false, authorization: false, system: true, authorization_system: true, role: false });
    }
    // The repositories reach them on their X36 site from inside a request: a recovery's proof and a passkey's credential nobody stored read as none.
    const audit = { hashSourceIp: async () => "ab".repeat(32), hashUserAgent: async () => "cd".repeat(32) } as unknown as AuditContextHasher;
    expect(await inAccountRequest(null, () => new PostgresConsumerRecoveryRepository(pools.authorization, audit).readProof(hash("recovery"), 1))).toBeNull();
    expect(await inAccountRequest(null, () => new PostgresConsumerAuthRepository(pools.authorization, audit).readCredential(hash("handle"), "credential", hash("binding")))).toBeNull();
  });

  it("on the production logins (P3-01's memberships), wired as main.ts wires them: a person signs up, verifies, enrols, consents, confirms their age, signs in with a recovery code, lists and revokes sessions, resends an email change, reads and downloads an export, and audits a publication preflight; another's session gets nothing", async () => {
    const production = await logins!.production();
    const system = createPool(production.url("api-system"), { max: 4 });
    const authorizationSystem = createPool(production.url("api-authorization-system"), { max: 4 });
    const runtime = createPool(production.url("api-runtime"), { max: 4, crossAccount: system });
    const authorization = createPool(production.url("api-authorization"), { max: 4, crossAccount: authorizationSystem });
    const custody = await mkdtemp(join(tmpdir(), "security-review-0171-custody-"));
    await chmod(custody, 0o700);
    for (const directory of ["secrets", "user-deks"]) await mkdir(join(custody, directory), { mode: 0o700 });
    const blindIndexKey = randomBytes(32);
    for (const [file, key] of [["kek.bin", randomBytes(32)], ["blind-index-key.bin", blindIndexKey], ["audit-source-ip-salt.bin", randomBytes(32)],
      ["records-key.bin", randomBytes(32)]] as const) await writeFile(join(custody, "secrets", file), key, { mode: 0o600 });
    const bootstrap = await loadBootstrapRegister();
    await persistBootstrapRegister(database.pool, bootstrap);
    const services = await openRlsAccountServices({ runtime, authorization }, { custodyRoot: custody, registerVersion: bootstrap.registerVersion });
    const source = { ip: "127.0.0.1", userAgent: "security-review-0171", requestId: "security-review-0171" };
    const audit = { hashSourceIp: async () => "ab".repeat(32), hashUserAgent: async () => "cd".repeat(32) } as unknown as AuditContextHasher;
    try {
      // Sign-up by email, in an anonymous request: the account, its region (in the sign-up's own transaction) and its first mail, recorded by its token.
      const email = `f5-production-${randomBytes(6).toString("hex")}@example.test`;
      const password = randomBytes(24).toString("base64url");
      const terms = currentDocument("TERMS", "en"), privacy = currentDocument("PRIVACY", "en");
      await inAccountRequest(null, () => services.registration.register({ email, password, recoveryEmail: null, phone: null, adultAffirmed: true },
        { ...source, countryCode: "RO", region: { country: "RO", usState: null }, legal: { locale: "en", terms: terms!, privacy: privacy! } }));
      await inAccountRequest(null, () => services.registration.drainMailDispatches());
      const userId = (await database.pool.query<{ user_id: string }>(`SELECT account.user_id FROM identity."user" AS account
        JOIN identity.registration_region AS region ON region.user_id=account.user_id AND region.country_code='RO' WHERE account.email_blind_index=$1`,
      [createEmailBlindIndex(blindIndexKey, email)])).rows[0]!.user_id;
      const channel = async () => (await database.pool.query<{ status: string }>(
        "SELECT delivery_status AS status FROM identity.channel_binding WHERE user_id=$1 AND channel_type='email'", [userId])).rows[0]!.status;
      expect(await channel()).toBe("sent");
      // The verification resend, once the cooldown has passed: a new token, its own mail, its own delivery.
      await database.pool.query(`UPDATE identity.verification_delivery_reservation SET reserved_at=reserved_at-interval '1 day'
        WHERE channel_binding_id=(SELECT channel_binding_id FROM identity.channel_binding WHERE user_id=$1 AND channel_type='email')`, [userId]);
      await database.pool.query(`UPDATE identity.channel_binding SET verification_last_sent_at=verification_last_sent_at-interval '1 day' WHERE user_id=$1`, [userId]);
      await inAccountRequest(null, () => services.registration.resendVerification({ email }, source));
      await inAccountRequest(null, () => services.registration.drainMailDispatches());
      const tokens = services.mail.messages.filter((mail) => mail.recipient === email).map((mail) => mail.token);
      expect(tokens).toHaveLength(2);
      expect(await channel()).toBe("sent");
      // Verification and the authenticator, still before any session.
      const token = tokens.at(-1)!;
      await inAccountRequest(null, () => services.registration.verifyEmail({ token }, source));
      const begun = await inAccountRequest(null, () => services.mfa.beginTotp({ enrollmentToken: token }, source));
      const secret = decodeBase32(begun.secret);
      const step = Math.floor(Date.now() / (services.totpPeriodSeconds * 1_000));
      const enrolled = await inAccountRequest(null, () => services.mfa.verifyTotp({ enrollmentToken: token, code: totpCodeAtStep(secret, step) }, source));
      if (!("sessionToken" in enrolled)) throw new TypeError("ENROLMENT_INCOMPLETE");
      let sessionToken = enrolled.sessionToken;
      const session = async () => (await inAccountRequest(sessionToken, () => services.sessions.authenticate(sessionToken, source)))!;
      // The consent and the age check, in the person's own request; another's session reads neither as given.
      await inAccountRequest(sessionToken, async () => {
        const mine = await session();
        expect(await services.sessions.readSensitiveDataConsent(mine)).toBe("required");
        expect(await services.sessions.recordSensitiveDataConsent(mine, { noticeVersion: "v1", locale: "en" })).toBe("given");
        expect(await services.sessions.readSensitiveDataConsent(mine)).toBe("given");
        expect(await services.sessions.confirmAccountAge(mine, { passed: true, minAgeApplied: 18, countryCode: "RO", ruleVersion: "2026-08-21-v1" }, source)).toBe("passed");
        expect(await services.sessions.readAgeConfirmation(mine)).toBe("confirmed");
      });
      const mine = await session();
      await inAccountRequest(ben.token, async () => {
        expect(await services.sessions.readSensitiveDataConsent(mine)).toBe("required");
        expect(await services.sessions.readAgeConfirmation(mine)).toBe("required");
        expect(await services.sessions.confirmAccountAge(mine, { passed: false, minAgeApplied: 18, countryCode: "RO", ruleVersion: "2026-08-21-v1" }, source)).toBe("SESSION_NOT_FOUND");
      });
      // Recovery codes: a step-up with the password and the next code, then the codes; the step-up rotates the session.
      const next = await rlsWaitForTotpStepAfter(step, services.totpPeriodSeconds);
      const codes = await inAccountRequest(sessionToken, async () => {
        const stepped = await services.sessions.stepUp({ session: await session(), password, code: totpCodeAtStep(secret, next),
          authorization: { action: "REGENERATE_RECOVERY_CODES" } }, source);
        sessionToken = stepped.sessionToken;
        return (await services.security.regenerateRecoveryCodes({ step_up_grant: stepped.grantToken }, await session(), source)).codes;
      });
      // Sign-out, then sign-in by password with a recovery code for the second factor, twice: two live sessions.
      await inAccountRequest(sessionToken, async () => expect(await services.sessions.logout(await session(), source)).toBe(true));
      const signIn = async (code: string): Promise<string> => inAccountRequest(null, async () => {
        const started = await services.sessions.beginLogin({ email, password }, source);
        return (await services.sessions.completeLogin({ challengeToken: started.challengeToken, code }, source)).sessionToken;
      });
      const first = await signIn(codes[0]!);
      sessionToken = await signIn(codes[1]!);
      const firstSession = (await inAccountRequest(first, () => services.sessions.authenticate(first, source)))!;
      // Another account's session revokes none of them; the person's own lists both and revokes the first, then all.
      expect(await inAccountRequest(ben.token, () => services.sessions.revokeSession(firstSession, firstSession.session.session_id, source))).toBe(false);
      expect(await inAccountRequest(ben.token, () => services.sessions.revokeAllSessions(firstSession, source))).toBe(0);
      await inAccountRequest(sessionToken, async () => {
        const current = await session();
        expect((await services.sessions.listSessions(current)).map((summary) => summary.session_id))
          .toEqual(expect.arrayContaining([current.session.session_id, firstSession.session.session_id]));
        expect(await services.sessions.revokeSession(current, firstSession.session.session_id, source)).toBe(true);
      });
      // The email change's settings and resend, the export's status and download, and a publication preflight's audit, through the API's repositories.
      const account = { userId, sessionId: (await session()).session.session_id } as RlsTestAccount;
      await emailChange(account);
      const exportId = await sentExport(account);
      const changes = new PostgresEmailChangeRepository(authorization, audit);
      const exports = new PostgresDataExportRepository(authorization, system, audit);
      const publications = new PostgresPublicationRepository(runtime, audit);
      const resend = () => changes.resend({ userId, sessionId: account.sessionId, confirmTokenHash: hash(randomUUID()), expiresAt: new Date(Date.now() + 3_600_000),
        cooldownMs: 1_000, source });
      const preflight = () => publications.auditAuthenticatedPreflightDenial({ userId, sessionId: account.sessionId, occurredAt: new Date(), requestId: undefined });
      await inAccountRequest(ben.token, async () => {
        expect(await changes.readSettings({ userId, sessionId: account.sessionId })).toBeNull();
        expect((await resend()).status).toBe("NONE");
        expect(await exports.status(userId)).toEqual({ status: "NONE" });
        await expect(exports.recordDownload(exportId, userId, source)).rejects.toThrow("DATA_EXPORT_LINK_INVALID");
        expect(await preflight()).toBe(false);
      });
      await inAccountRequest(sessionToken, async () => {
        expect(await changes.readSettings({ userId, sessionId: account.sessionId })).not.toBeNull();
        expect((await resend()).status).toBe("RESENT");
        expect((await exports.status(userId)).status).toBe("SENT");
        await exports.recordDownload(exportId, userId, source);
        expect(await preflight()).toBe(true);
        expect(await services.sessions.revokeAllSessions(await session(), source)).toBeGreaterThan(0);
      });
      expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL", [userId])).rows[0]!.n).toBe(0);
      // The sign-in and recovery secrets on the production request logins: refused on their own connections, reached through the X36 site.
      expect(await inAccountRequest(null, () => refusal(() => authorization.query("SELECT identity.read_consumer_recovery_proof($1,1)", [hash("recovery")]))))
        .toEqual({ code: "42501", message: "permission denied for function read_consumer_recovery_proof" });
      expect(await inAccountRequest(null, () => new PostgresConsumerRecoveryRepository(authorization, audit).readProof(hash("recovery"), 1))).toBeNull();
      expect(await inAccountRequest(null, () => new PostgresConsumerAuthRepository(authorization, audit).readCredential(hash("handle"), "credential", hash("binding")))).toBeNull();
    } finally {
      await services.close();
      await Promise.all([runtime.end(), authorization.end(), system.end(), authorizationSystem.end()]);
      await rm(custody, { recursive: true, force: true });
    }
  }, 300_000);
});

describe("F2: no dig is published, by the owner's decision", () => {
  let pools: ApiTestPools;
  let ana: RlsTestAccount;
  let ben: RlsTestAccount;
  const asks = (pool: Pool, owner: string, runId: string) =>
    pool.query<{ dig: boolean | null }>("SELECT identity.read_run_is_dig($1,$2) AS dig", [owner, runId]).then((result) => result.rows[0]!.dig);
  /** A debate of `owner`'s dug from `parent` by one record alone, the way each kind of dig leaves it. */
  async function dugBy(owner: Account, parent: string, record: "row" | "picks" | "contribution" | "member" | "link" | "binding" | "pick-paths"): Promise<string> {
    const dig = await run(owner);
    if (record === "row") {
      await seeded([["INSERT INTO identity.dig_run (run_id,owner_ref) VALUES ($1,$2)", [dig, owner.ownerRef]]]);
    } else if (record === "picks") {
      await seeded([["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,pick_count) VALUES ($1,$2,$3,0)", [dig, owner.ownerRef, parent]]]);
    } else if (record === "contribution") {
      const publicationRef = await publish(parent);
      await seeded([["INSERT INTO identity.public_contribution (dig_run_id,owner_ref,publication_ref,root_run_id,parent_run_id) VALUES ($1,$2,$3,$4,$4)",
        [dig, owner.ownerRef, publicationRef, parent]]]);
    } else if (record === "member") {
      const investigationId = randomUUID();
      await seeded([
        ["INSERT INTO identity.investigation (investigation_id,owner_ref,root_run_id,state) VALUES ($1,$2,$3,'open')", [investigationId, owner.ownerRef, parent]],
        ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref) VALUES ($1,$2,$3)", [parent, investigationId, owner.ownerRef]],
        ["INSERT INTO identity.investigation_member (run_id,investigation_id,owner_ref,parent_run_id,mode) VALUES ($1,$2,$3,$4,'quick')", [dig, investigationId, owner.ownerRef, parent]]]);
    } else if (record === "binding") {
      await seeded([["INSERT INTO identity.run_execution_binding (execution_ref,user_id,identity_session_id,run_id,created_at,carry_on_parent_run_id,carry_on_path_id) VALUES ($1,$2,$3,$4,clock_timestamp(),$5,'b1')",
        [randomUUID(), owner.userId, randomUUID(), dig, parent]]]);
    } else if (record === "pick-paths") {
      await seeded([["INSERT INTO core.start_path_set (run_id,source,width,path_count,chosen_by,carry_on_to_report,content_ciphertext,content_attestation) VALUES ($1,'DIG_PICKS',1,1,'PERSON',false,'{}'::jsonb,$2)", [dig, ATTESTATION]]]);
    } else {
      await seeded([["INSERT INTO identity.dig_link (child_run_id,owner_ref,parent_run_id,places,mode) VALUES ($1,$2,$3,'{}','quick')", [dig, owner.ownerRef, parent]]]);
    }
    return dig;
  }

  beforeAll(async () => {
    pools = logins!.apiPools();
    ana = await seedSessionAccount(database.pool, "f2-ana");
    ben = await seedSessionAccount(database.pool, "f2-ben");
  }, 120_000);

  it("any one of a dig's records makes it a dig, its own row or the six others, its parent, an investigation's root and a debate with an ordinary binding and menu paths are none, and a connection that is not the owner's reads every debate as a dig", async () => {
    const records = ["row", "picks", "contribution", "member", "link", "binding", "pick-paths"] as const;
    const parents = await Promise.all(records.map(() => run(ana)));
    const digs = await Promise.all(records.map((record, index) => dugBy(ana, parents[index]!, record)));
    const bens = await dugBy(ben, await run(ben), "picks");
    // Neither of the two later records by another name: every debate's own binding names no parent, and paths chosen from a menu make no dig.
    const ordinary = await run(ana);
    await seeded([["INSERT INTO identity.run_execution_binding (execution_ref,user_id,identity_session_id,run_id,created_at) VALUES ($1,$2,$3,$4,clock_timestamp())", [randomUUID(), ana.userId, randomUUID(), ordinary]],
      ["INSERT INTO core.start_path_set (run_id,source,width,path_count,chosen_by,carry_on_to_report,content_ciphertext,content_attestation) VALUES ($1,'MENU',1,1,'PERSON',false,'{}'::jsonb,$2)", [ordinary, ATTESTATION]]]);
    await inAccountRequest(ana.token, async () => {
      expect(await asks(pools.runtime, ana.ownerRef, ordinary)).toBe(false);
      for (const [index, dig] of digs.entries()) expect(await asks(pools.runtime, ana.ownerRef, dig), records[index]).toBe(true);
      // The parent of each, the investigation's root (a member with no parent) among them, and a debate dug from nothing.
      for (const parent of parents) expect(await asks(pools.runtime, ana.ownerRef, parent), parent).toBe(false);
      expect(await asks(pools.runtime, ana.ownerRef, ana.runId)).toBe(false);
      // Another account's debate asked of its own owner by this request: a dig, whatever it is, since the connection is not that owner's (the
      // answer is the same constant for every debate, so it tells nothing); asked as the asker's own, it is not hers (0131's rule): null.
      expect(await asks(pools.runtime, ben.ownerRef, bens)).toBe(true);
      expect(await asks(pools.runtime, ben.ownerRef, ben.runId)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, bens)).toBeNull();
    });
    // The API's request login with no session names no account (F5's rule): every debate reads as a dig, the owner's plain one too.
    expect(await asks(apiRequest, ana.ownerRef, digs[0]!)).toBe(true);
    expect(await asks(apiRequest, ana.ownerRef, ana.runId)).toBe(true);
    // The system logins' sweeps may ask of any owner.
    expect(await asks(apiSystem, ben.ownerRef, bens)).toBe(true);
  });

  it("on the production logins (P3-01's memberships): a dig reads as a dig to its owner's session, another account's, the request login with no session and the system login, and the owner's plain debate reads as none to her own session and the system login only", async () => {
    const production = await logins!.production();
    const audit = { hashSourceIp: async () => "ab".repeat(32), hashUserAgent: async () => "cd".repeat(32) } as unknown as AuditContextHasher;
    const opened: Pool[] = [];
    const login = (id: "api-runtime" | "api-system", target?: Pool): Pool => {
      const pool = createPool(production.url(id), { max: 2, ...(target === undefined ? {} : { crossAccount: target }) });
      opened.push(pool);
      return pool;
    };
    try {
      // main.ts's request pool (its own connections inside a request, its system twin outside one), the request login on a connection of its own
      // with no session presented, and the system login, which holds the marker.
      const system = login("api-system");
      const request = login("api-runtime", login("api-system"));
      const runtime = login("api-runtime");
      const plain = await run(ana);
      const dig = await dugBy(ana, plain, "row");
      // The two records the helper reads that older steps own, each alone: a carry-on dig's binding (0163) and a page dig's start paths from its picks (0159). Its owner
      // reads them as a definer, with no grant made and neither table's row security forced on it; the owner's name is the migrator's here as in P3-01.
      const carried = await dugBy(ana, await run(ana), "binding");
      const picked = await dugBy(ana, await run(ana), "pick-paths");
      expect((await database.pool.query<{ reads: boolean; forced: boolean }>(`SELECT has_table_privilege(p.proowner, c.oid, 'SELECT') AS reads, c.relforcerowsecurity AS forced
        FROM pg_proc AS p CROSS JOIN pg_class AS c WHERE p.oid = 'identity.run_is_dig(uuid)'::regprocedure
          AND c.oid IN ('identity.run_execution_binding'::regclass, 'core.start_path_set'::regclass)`)).rows).toEqual([{ reads: true, forced: false }, { reads: true, forced: false }]);
      const answers = (pool: Pool) => Promise.all([dig, carried, picked, plain].map((runId) => asks(pool, ana.ownerRef, runId)));
      expect(await inAccountRequest(ana.token, () => answers(request)), "the owner's own session").toEqual([true, true, true, false]);
      expect(await answers(system), "the system login").toEqual([true, true, true, false]);
      for (const [label, by] of [["another account's session", () => inAccountRequest(ben.token, () => answers(request))],
        ["an anonymous request", () => inAccountRequest(null, () => answers(request))],
        ["api-runtime with no session", () => answers(runtime)]] as const) expect(await by(), label).toEqual([true, true, true, true]);
      // The API's repository, as the publish route, the review ask and the staged publication ask it (isDig, === true), and the visibility read's
      // flag: the owner's own session and the system login read the dig as one and the plain debate as none; the owner's own plain debate is
      // never refused as a dig in her own request.
      const repository = (pool: Pool) => new PostgresPublicationRepository(pool, audit);
      const digOf = (pool: Pool) => Promise.all([dig, carried, picked, plain].map((runId) => repository(pool).readRunIsDig(runId, ana.userId, ana.ownerRef)));
      const flagOf = (pool: Pool) => Promise.all([dig, carried, picked, plain].map(async (runId) => (await repository(pool).readOwnedVisibility(runId, ana.userId, ana.ownerRef))?.dig));
      expect(await inAccountRequest(ana.token, () => digOf(request))).toEqual([true, true, true, false]);
      expect(await inAccountRequest(ana.token, () => flagOf(request))).toEqual([true, true, true, false]);
      expect(await digOf(system)).toEqual([true, true, true, false]);
      expect(await flagOf(system)).toEqual([true, true, true, false]);
    } finally { for (const pool of opened) await pool.end().catch(() => undefined); }
  }, 300_000);

  it("the helper is no role's; the owner's question is the API's billing role's alone; the request login may not call the helper", async () => {
    const grantees = async (signature: string) => (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [signature]))
      .rows.map(({ grantee }) => grantee);
    expect(await grantees("identity.run_is_dig(uuid)")).toEqual([]);
    expect(await grantees("identity.read_run_is_dig(uuid,uuid)")).toEqual(["debateai_billing_runtime"]);
    for (const pool of [apiRequest, apiSystem, runner, erasure]) {
      expect((await sqlError(() => pool.query("SELECT identity.run_is_dig($1)", [ana.runId]))).code).toBe("42501");
    }
  });

  /**
   * 0165's and 0168's Continue (POST /v1/runs/{id}/continue, on the API's request login) re-opens the SAME work item of the SAME run: a dig that failed goes on being that dig, and
   * no new run is made to mark. Its dig row stays the one its creation wrote; the writer marks a re-admission's new run (run-supersession.test.ts).
   */
  it("on the production logins (P3-01's memberships): a dig the API's Continue re-opens after it failed makes no new run, and it stays a dig to its owner's own request", async () => {
    const production = await logins!.production();
    const target = createPool(production.url("api-system"), { max: 2 });
    const request = createPool(production.url("api-runtime"), { max: 2, crossAccount: target });
    try {
      const dig = await dugBy(ana, await run(ana), "row");
      await seeded([[`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq)
        VALUES ($1,'Q1','[]'::jsonb,$2,'FAILED','RUNNER_EXECUTION_FAILED:FIXTURE',$3)`, [dig, `fixture:${randomUUID()}`, ++sequence]]]);
      const runsOf = async (): Promise<number> => Number((await database.pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM core.run_ownership_event WHERE owner_ref=$1", [ana.ownerRef])).rows[0]!.n);
      const before = await runsOf();
      expect(await inAccountRequest(ana.token, () => new PostgresDigModelRepository(request).continueFailedRun(ana.ownerRef, dig, null, null))).toBe("RECORDED");
      expect(await runsOf()).toBe(before);
      expect(await inAccountRequest(ana.token, () => asks(request, ana.ownerRef, dig))).toBe(true);
      expect((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.dig_run WHERE run_id=$1", [dig])).rows[0]!.n).toBe("1");
    } finally { await request.end(); await target.end(); }
  }, 300_000);

  it("a dig's own row stays out of a person's data export, as the owner decided: no export reader reads it, the export worker's role may not, and the export's own code does not name it", async () => {
    const readers = (await database.pool.query<{ name: string; reads: boolean }>(`SELECT p.proname AS name, bool_or(p.prosrc ~ 'identity\\.dig_run\\y') AS reads
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'identity' AND p.proname LIKE 'read_data_export%' GROUP BY 1 ORDER BY 1`)).rows;
    expect(readers.map(({ name }) => name)).toEqual(expect.arrayContaining(["read_data_export_dig_model", "read_data_export_pre_start", "read_data_export_saved_questions"]));
    expect(readers.filter(({ reads }) => reads)).toEqual([]);
    expect((await database.pool.query<{ reads: boolean }>("SELECT has_table_privilege('debateai_data_export_worker','identity.dig_run','SELECT') AS reads")).rows[0]!.reads).toBe(false);
    for (const path of ["packages/db/src/data-export.ts", "apps/api/src/data-export/snapshot.ts", "apps/api/src/data-export/readme.ts"]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/\bdig_run\b/u);
    }
  });

  /** `runs`, each finished (its one work item DONE) and waiting for its Free publication, as the asks route's notice leaves it. */
  async function waitingFree(...runs: readonly string[]): Promise<void> {
    for (const runId of runs) {
      await seeded([
        [`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
          VALUES ($1,'fixture','[]'::jsonb,$2,'DONE',NULL,NULL,NULL,$3)`, [runId, `fixture:${randomUUID()}`, ++sequence]],
        ["INSERT INTO identity.free_public_ask (run_id,owner_ref) VALUES ($1,$2)", [runId, ana.ownerRef]]]);
    }
  }
  const freeWaiting = async (): Promise<readonly string[]> =>
    (await apiSystem.query<{ waiting: Array<{ run_id: string }> }>("SELECT identity.read_free_debates_to_publish(100) AS waiting")).rows[0]!.waiting.map((row) => row.run_id);
  const published = async (runId: string): Promise<Readonly<{ intents: number; snapshots: number; events: number }>> => ({
    intents: Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM serve.publication_key_provision_intent WHERE run_id=$1", [runId])).rows[0]!.n),
    snapshots: Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM serve.publication_snapshot WHERE run_id=$1", [runId])).rows[0]!.n),
    events: Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM core.run_visibility_event WHERE run_id=$1", [runId])).rows[0]!.n)
  });
  /** `newRunId` re-admits `oldRunId`, as the ask waker's re-admission records it (the edge alone; its guard's line checks are the waker's). */
  async function readmitted(oldRunId: string, newRunId: string): Promise<void> {
    await seeded([["INSERT INTO core.run_supersession (old_run_id,new_run_id,reason) VALUES ($1,$2,'READMITTED')", [oldRunId, newRunId]]]);
  }

  it("the Free debates' sweep never picks a dig, and still picks the debate it was dug from", async () => {
    const parent = await run(ana);
    const dig = await dugBy(ana, parent, "link");
    const carried = await dugBy(ana, parent, "binding");
    await waitingFree(parent, dig, carried);
    const waiting = await freeWaiting();
    expect(waiting).toContain(parent);
    expect(waiting).not.toContain(dig);
    expect(waiting).not.toContain(carried);
  });

  it("the Free path's own claim refuses a dig: prepared or published straight by a login that may call them, it writes no intent, snapshot or event", async () => {
    const parent = await run(ana);
    const dig = await dugBy(ana, parent, "picks");
    await waitingFree(parent, dig);
    const prepare = (runId: string, ref: string) =>
      apiSystem.query<{ outcome: string; grant_token_hash: string | null }>("SELECT outcome,grant_token_hash FROM core.prepare_free_publication($1,$2)", [runId, ref])
        .then((result) => result.rows[0]!);
    const publishFree = (runId: string, ref: string, hash: string) =>
      apiSystem.query<{ outcome: string }>("SELECT core.publish_free_debate($1,$2,$3,$4::jsonb,now()) AS outcome", [runId, ref, hash, JSON.stringify(pubEnvelope(ref))])
        .then((result) => result.rows[0]!.outcome);
    const digRef = randomUUID();
    expect(await prepare(dig, digRef)).toEqual({ outcome: "NOT_WAITING", grant_token_hash: null });
    expect(await publishFree(dig, digRef, hash("free-public:made-up"))).toBe("NOT_WAITING");
    expect(await published(dig)).toEqual({ intents: 0, snapshots: 0, events: 0 });
    // The debate it was dug from is no dig: it is prepared as before (its intent then simply expires here).
    expect(await prepare(parent, randomUUID())).toMatchObject({ outcome: "PREPARED", grant_token_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) });
  });

  it("a dig re-admitted as a new run is still a dig: the question follows the re-admission back, and the Free sweep and the API both see it", async () => {
    const parent = await run(ana);
    const dig = await dugBy(ana, parent, "link");
    const again = await run(ana);
    const twice = await run(ana);
    await readmitted(dig, again);
    await readmitted(again, twice);
    // A debate that is no dig stays none however often it is re-admitted.
    const plain = await run(ana);
    const plainAgain = await run(ana);
    await readmitted(plain, plainAgain);
    await inAccountRequest(ana.token, async () => {
      expect(await asks(pools.runtime, ana.ownerRef, again)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, twice)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, plainAgain)).toBe(false);
      expect(await asks(pools.runtime, ana.ownerRef, parent)).toBe(false);
    });
    await waitingFree(twice, plainAgain);
    const waiting = await freeWaiting();
    expect(waiting).not.toContain(twice);
    expect(waiting).toContain(plainAgain);
  });

  // A dig's own row (identity.dig_run), which the statement that creates the dig's run writes (0123's writer, patched by 0171), before anything else
  // is written for it: it names the dig's run alone and asks nothing of the parent, so it is there whatever the join answers and whatever becomes of
  // the parent, and no session ending after the creation can part the two.
  const digRows = async (runId: string): Promise<number> =>
    Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.dig_run WHERE run_id=$1", [runId])).rows[0]!.n);
  const isDig = async (runId: string): Promise<boolean> =>
    (await database.pool.query<{ dig: boolean }>("SELECT identity.run_is_dig($1) AS dig", [runId])).rows[0]!.dig;
  /** `runId` deleted as a debate's deletion finishes it: its erasure tombstone, then every per-debate forget, in one transaction on the erasure worker's login. */
  async function deleted(runId: string): Promise<void> {
    await seeded([["INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES ($1,clock_timestamp(),1,0)", [runId]]]);
    const client = await erasure.connect();
    try {
      await client.query("BEGIN");
      for (const forget of ["page_memory", "investigation", "web_evidence", "dig_model", "dig_picks", "public", "tree_updates", "passages", "path_suggestions", "public_tree"]) {
        await client.query(`SELECT identity.forget_erased_debate_${forget}($1)`, [runId]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  describe("a dig created through the run repository, as the API creates every owner's run", () => {
    let cipherPool: Pool;
    let owner: StoryEncryptedOwner;
    /** The API's run repository: the content on a pool with the cipher, the run's key provision and its creation on the content-provision login. */
    const created = (questionLine: string, dig: boolean): Promise<string> => new RunRepository(cipherPool, pools.contentProvision).startRun({
      questionLine, askContract: { audience: "f2-dig-row" }, principal: { kind: "server", userId: owner.userId, ownerRef: owner.ownerRef },
      sessionId: owner.sessionId, callerScope: "ASKER", asOf: new Date("2026-11-04T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
      tierSource: "ASKER", tierProvenanceRef: "f2:dig-row", compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1, envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "f2:dig-row", batteryRows: [],
      ...(dig ? { digRun: true as const } : {})
    });

    beforeAll(async () => {
      cipherPool = createPool(database.connectionString);
      owner = await provisionStoryEncryptedOwner(cipherPool);
    }, 120_000);
    afterAll(async () => {
      await cipherPool?.end();
      if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
    });

    it("is a dig from the statement that creates it, and stays one after its owner's session ends and after its parent is deleted, with no request", async () => {
      const parent = await created("Should the harbour open at night?", false);
      const dig = await created("Should the harbour open at night? Dig: the noise for the houses nearby.", true);
      // One row, the dig's own, with its owner, written in the run's own transaction; none for the debate dug from nothing.
      expect((await database.pool.query<{ owner_ref: string; same: boolean }>(`SELECT mark.owner_ref, mark.xmin::text = run.xmin::text AS same
        FROM identity.dig_run AS mark JOIN core.run AS run USING (run_id) WHERE mark.run_id=$1`, [dig])).rows).toEqual([{ owner_ref: owner.ownerRef, same: true }]);
      expect(await digRows(parent)).toBe(0);
      // The join's link, as a join that took writes it.
      await seeded([["INSERT INTO identity.dig_link (child_run_id,owner_ref,parent_run_id,places,mode) VALUES ($1,$2,$3,'{}','quick')", [dig, owner.ownerRef, parent]]]);
      // The person signs out: nothing about the dig moves, and no request is needed to know it.
      await database.pool.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1", [owner.sessionId]);
      try {
        expect([await isDig(dig), await isDig(parent)]).toEqual([true, false]);
        expect((await apiSystem.query<{ dig: boolean | null }>("SELECT identity.read_run_is_dig($1,$2) AS dig", [owner.ownerRef, dig])).rows[0]!.dig).toBe(true);
        // The parent deleted: its link goes (0131), the dig's own row stays, and the dig is still a dig.
        await deleted(parent);
        expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.dig_link WHERE child_run_id=$1", [dig])).rows[0]!.n)).toBe(0);
        expect([await digRows(dig), await isDig(dig)]).toEqual([1, true]);
      } finally {
        await database.pool.query("UPDATE identity.session SET revoked_at=NULL WHERE session_id=$1", [owner.sessionId]);
      }
    });

    it("the dig's own deletion takes its row; its account's erasure takes them all", async () => {
      const dig = await created("Should the ferry run on Sundays? Dig: the cost of the crew.", true);
      const sibling = await created("Should the ferry run on Sundays? Dig: who would ride it.", true);
      await deleted(dig);
      expect([await digRows(dig), await digRows(sibling)]).toEqual([0, 1]);
      expect(await isDig(dig)).toBe(false);
      // The forget, asked again, finds nothing to take.
      expect((await erasure.query<{ n: number }>("SELECT identity.forget_erased_debate_page_memory($1) AS n", [dig])).rows[0]!.n).toBe(0);
      const gone = await account();
      const theirs = await run(gone);
      await seeded([["INSERT INTO identity.dig_run (run_id,owner_ref) VALUES ($1,$2)", [theirs, gone.ownerRef]]]);
      await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [gone.userId]);
      expect(await digRows(theirs)).toBe(0);
    });
  });

  it("no role reaches a dig's row, and no role may write one: only the run's creation, the question and the forget reach it", async () => {
    const roles = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker",
      "debateai_content_provision"];
    expect((await database.pool.query<{ role: string }>(`SELECT role FROM unnest($1::text[]) AS role
      WHERE has_table_privilege(role,'identity.dig_run','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`, [roles])).rows).toEqual([]);
    for (const pool of [apiRequest, apiSystem, runner, erasure, pools.contentProvision]) {
      expect((await sqlError(() => pool.query("SELECT count(*) FROM identity.dig_run"))).code).toBe("42501");
      expect((await sqlError(() => pool.query("INSERT INTO identity.dig_run (run_id,owner_ref) VALUES ($1,$2)", [randomUUID(), ana.ownerRef]))).code).toBe("42501");
    }
    // The asks route's old writer is gone: no function writes a dig's row but the run's creation and the forget that takes it.
    expect((await database.pool.query("SELECT 1 FROM pg_proc WHERE proname='record_dig_run'")).rowCount).toBe(0);
    expect((await database.pool.query<{ fn: string }>(`SELECT p.oid::regprocedure::text AS fn FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosrc ~ 'identity\\.dig_run\\M' ORDER BY 1`)).rows.map(({ fn }) => fn))
      .toEqual(["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)", "identity.forget_erased_debate_page_memory(uuid)", "identity.run_is_dig(uuid)"]);
  });

  it("a dig's own row alone makes it a dig, and keeps it one when its parent is deleted and when it is re-admitted; the Free sweep leaves it out", async () => {
    const parent = await run(ana);
    // A dig whose join took: its row, then the link the join wrote, and no picks (the picks writer had not run).
    const alone = await dugBy(ana, parent, "row");
    const joined = await dugBy(ana, parent, "row");
    // Before this step a dig whose join did not take had at most the link the page's own call wrote, and no row (the step's backfill marks those
    // that were there as it applies: tests/integration/migration-per-step.test.ts).
    const linkOnly = await run(ana);
    await seeded([joined, linkOnly].map((dig) => ["INSERT INTO identity.dig_link (child_run_id,owner_ref,parent_run_id,places,mode) VALUES ($1,$2,$3,'{}','quick')",
      [dig, ana.ownerRef, parent]] as const));
    await inAccountRequest(ana.token, async () => {
      for (const dig of [alone, joined, linkOnly]) expect(await asks(pools.runtime, ana.ownerRef, dig), dig).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, parent)).toBe(false);
    });
    await deleted(parent);
    // The parent's deletion took its links (0131) and left the digs' own rows: a dig with its row stays a dig; one with the link alone does not.
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.dig_link WHERE parent_run_id=$1", [parent])).rows[0]!.n)).toBe(0);
    expect([await digRows(alone), await digRows(joined)]).toEqual([1, 1]);
    const again = await run(ana);
    await readmitted(alone, again);
    await inAccountRequest(ana.token, async () => {
      expect(await asks(pools.runtime, ana.ownerRef, alone)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, joined)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, again)).toBe(true);
      expect(await asks(pools.runtime, ana.ownerRef, linkOnly)).toBe(false);
    });
    await waitingFree(alone, joined, again);
    const waiting = await freeWaiting();
    for (const dig of [alone, joined, again]) expect(waiting, dig).not.toContain(dig);
  });

  it("a dig whose parent is deleted before its join: the join and a link both answer NOT_OWNED, its own row is there all the same, and the Free path refuses it", async () => {
    const parent = await run(ana);
    // Created with its row, as every dig's run is now; its parent is deleted before the route's join.
    const dig = await dugBy(ana, parent, "row");
    await deleted(parent);
    await inAccountRequest(ana.token, async () => {
      // What the join (0134) and the page's own link call (0131) ask: both runs the owner's, and the parent is gone.
      expect((await new PostgresInvestigationRepository(pools.runtime).join({ ownerRef: ana.ownerRef, parentRunId: parent, childRunId: dig, places: [], mode: "quick" })).outcome)
        .toBe("NOT_OWNED");
      expect((await pools.runtime.query<{ outcome: string }>("SELECT identity.record_dig_link($1,$2,$3,'{}'::text[],'quick') AS outcome", [ana.ownerRef, parent, dig])).rows[0]!.outcome)
        .toBe("NOT_OWNED");
      expect(await asks(pools.runtime, ana.ownerRef, dig)).toBe(true);
    });
    await waitingFree(dig);
    expect(await freeWaiting()).not.toContain(dig);
    expect((await apiSystem.query<{ outcome: string }>("SELECT outcome FROM core.prepare_free_publication($1,$2)", [dig, randomUUID()])).rows[0]!.outcome).toBe("NOT_WAITING");
  });

  it("a dig's Free notice is no one's: the owner's own request is answered NOT_OWNED and nothing waits; a debate dug from nothing is recorded", async () => {
    const parent = await run(ana);
    const dig = await dugBy(ana, parent, "row");
    const notice = (runId: string) => pools.runtime.query<{ outcome: string }>("SELECT identity.record_free_public_ask($1,$2) AS outcome", [ana.ownerRef, runId])
      .then((result) => result.rows[0]!.outcome);
    await inAccountRequest(ana.token, async () => {
      expect(await notice(dig)).toBe("NOT_OWNED");
      expect(await notice(parent)).toBe("RECORDED");
    });
    const waiting = async (runId: string): Promise<number> =>
      Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.free_public_ask WHERE run_id=$1", [runId])).rows[0]!.n);
    expect([await waiting(dig), await waiting(parent)]).toEqual([0, 1]);
  });
});
